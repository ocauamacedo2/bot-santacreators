// ./application/events/pagamentosocial.js
import fs from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

// ============================================================================
// PAGAMENTOS SOCIAL MÍDIAS (SEM LISTENERS AQUI)
// - Exporta: pagamentoSocialOnReady(client) e handlePagamentoSocial(interaction, client)
// ============================================================================
// =============================
// ✅ CONFIG (OBRIGATÓRIO)
// =============================
// Canal do Dashboard (Gráficos)
const CANAL_DASHBOARD_PAGAMENTO = "1505716526534103110";

// Arquivos de persistência
const STATS_FILE = path.join(process.cwd(), "data", "pagamentos_social_stats.json");
const DASH_STATE_FILE = path.join(process.cwd(), "data", "pagamentos_social_dash_state.json");
const DASH_MARKER = "SC_PAGAMENTO_DASH::V1";
// Canal onde fica o menu + onde os registros são postados
const CANAL_PAGAMENTO = "1387922662134775818";

// Canal onde o sistema vipEvento.js posta os registros de VIP por evento
const CANAL_VIP_EVENTO = "1414718336826081330";

// Cidades / CDDs usadas para filtro dos pagamentos
const CIDADES_PAGAMENTO = {
  nobre: {
    label: "Nobre",
    roleId: "1379021805544804382",
    emoji: "🏙️",
  },
  santa: {
    label: "Santa",
    roleId: "1379021888709464168",
    emoji: "🌸",
  },
  grande: {
    label: "Grande",
    roleId: "1418691103397253322",
    emoji: "🌆",
  },
  maresia: {
    label: "Maresia",
    roleId: "1379021994678288465",
    emoji: "🌊",
  },
};

// Canal de logs (auditoria) do sistema de pagamentos
// ⚠️ Troca aqui pelo teu canal de logs real, se for outro.
const CANAL_LOG_PAGAMENTO = "1486084352403312843";

// Textos padrão (se teu arquivo já tem em outro lugar, pode remover daqui)
// Mantive pra evitar ReferenceError se não existir no teu arquivo.
const PADRAO_INDEFINIDO = "Não informado";

// Regex separadores de Nome/ID (se teu arquivo já tem, pode remover daqui)
// Mantive pra evitar ReferenceError se não existir no teu arquivo.
const SEP_REGEX = /[|\/\\]/g;

// ===== PERMISSÕES =====
// Quem pode USAR o sistema (abrir form, filtrar, etc.)
const ALLOWED_IDS = [
  "1262262852949905408", // OWNER (id)
  "660311795327828008",  // você (id)
  "1387253972661964840", // Equipe Social Mídias (role)
  "1388976094920704141", // Social Medias (role)
  "1352408327983861844", // Resp Creator (role)
  "1262262852949905409", // Resp Influ (role)
  "1352407252216184833", // Resp Líder (role)
  "1388976314253312100", // COORD+ (role)
  "1282119104576098314", // Mkt Creators (role)
];
// 🔥 Chefões: podem aprovar ATÉ o próprio
const SELF_APPROVE_USER_IDS = [
  "660311795327828008",  // você
  "1262262852949905408", // owner
];

const SELF_APPROVE_ROLE_IDS = [
  "1352408327983861844", // resp creators
  "1262262852949905409", // resp influ
  "1352407252216184833", // resp líder
];

// ✅ Quem pode aprovar/recusar (mas NÃO o próprio, a menos que seja chefão acima)
const APPROVER_ROLE_IDS = [
  "1388976314253312100", // coord
  "1282119104576098314", // mkt ticket
];

// =============================
// Helpers de permissão
// =============================
function _hasAnyRole(interaction, roleIds) {
  const member = interaction.member;
  return (member?.roles?.cache?.some((r) => roleIds.includes(r.id))) ?? false;
}

function temPermissaoPagamento(interaction) {
  const hasRole = _hasAnyRole(interaction, ALLOWED_IDS);
  const hasUser = ALLOWED_IDS.includes(interaction.user.id);
  return hasRole || hasUser;
}

// ✅ Chefão = pode até aprovar o próprio
function podeAprovarProprio(interaction) {
  const hasUser = SELF_APPROVE_USER_IDS.includes(interaction.user.id);
  const hasRole = _hasAnyRole(interaction, SELF_APPROVE_ROLE_IDS);
  return hasUser || hasRole;
}

// ✅ Aprovação = Coord/Mkt ou Chefão
function temPermissaoAprovacao(interaction) {
  if (podeAprovarProprio(interaction)) return true;
  return _hasAnyRole(interaction, APPROVER_ROLE_IDS);
}


function isUnknownInteraction(err) {
  return err?.code === 10062 || err?.code === 40060;
}

// =============================
// ✅ DEDUPE / DEBUG (anti duplicação)
// - trava o mesmo interaction.id por alguns segundos
// - resolve handler rodando 2x por roteador/listeners duplicados
// =============================
const DEDUPE_TTL_MS = 8000; // 8s (pode subir p/ 15000 se quiser)

function _getDedupeStore(client) {
  if (!client.__SC_PAGAMENTO_SOCIAL_DEDUPE__) {
    client.__SC_PAGAMENTO_SOCIAL_DEDUPE__ = new Map(); // key -> ts
  }
  return client.__SC_PAGAMENTO_SOCIAL_DEDUPE__;
}

function _cleanupDedupe(store) {
  const now = Date.now();
  for (const [k, ts] of store.entries()) {
    if (now - ts > DEDUPE_TTL_MS) store.delete(k);
  }
}

function makeDedupeKey(interaction) {
  // interaction.id já é único por evento do Discord
  // inclui tipo só pra ficar mais claro em debug
  const t =
    interaction.isButton?.() ? "BTN" :
    interaction.isModalSubmit?.() ? "MODAL" :
    "OTHER";
  return `${t}:${interaction.id}`;
}

async function blockIfDuplicate(client, interaction, debugLabel = "PagamentoSocial") {
  const store = _getDedupeStore(client);
  _cleanupDedupe(store);

  const key = makeDedupeKey(interaction);
  if (store.has(key)) {
    // ✅ DUPLICADO BLOQUEADO (debug leve)
    try {
      console.warn(`[${debugLabel}] DUPLICADO BLOQUEADO:`, {
        key,
        user: interaction.user?.id,
        customId: interaction.customId,
        at: new Date().toISOString(),
      });
    } catch {}

    // Se der, avisa no log (sem quebrar nada)
    try {
      await logPagamento(
        client,
        interaction,
        "🛡️ Dedupe: duplicado bloqueado",
        [
          `Chave: \`${key}\``,
          `CustomId: \`${interaction.customId || "—"}\``,
          `Usuário: <@${interaction.user?.id || "—"}>`,
        ].join("\n")
      );
    } catch {}

    // IMPORTANTe: retorna true => "isso era nosso" e impede o roteador de cair em outros handlers
    // mas não responde o usuário (pra não gerar spam)
    return true;
  }

  store.set(key, Date.now());
  return false;
}



// =============================
// Helpers de parse
// =============================
function parseNomeIdFlex(texto) {
  const t = String(texto || "").trim();
  if (!t) return { nome: PADRAO_INDEFINIDO, id: PADRAO_INDEFINIDO, hasId: false };

  const parts = t
    .split(SEP_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { nome: parts[0], id: PADRAO_INDEFINIDO, hasId: false };
  }

  const id = parts.pop();
  const nome = parts.join(" | ") || PADRAO_INDEFINIDO;
  return { nome, id, hasId: true };
}

function normalizarTipoPremiacao(texto) {
  const original = String(texto || "").trim();

  const t = original
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s$.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const pareceDinheiro =
    /\bdinheiro\b/i.test(t) ||
    /\bgrana\b/i.test(t) ||
    /\bcash\b/i.test(t) ||
    /\bvalor\b/i.test(t) ||
    /\br\$\b/i.test(t) ||
    /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?\b/.test(t) ||
    /\b\d+(?:[.,]\d+)?\s*(?:k|kk|m|mi|mil|milhao|milhoes)?\b/i.test(t);

  // ✅ PRIORIDADE MÁXIMA: se escreveu rolepass/pass, nunca pode virar Dinheiro.
  if (t.includes("rolepass")) return "Pass";
  if (/\brole\s*pass\b/i.test(t)) return "Pass";
  if (/\bpass\b/i.test(t)) return "Pass";

  if (
    t.includes("platinum") ||
    t.includes("platinium") ||
    t.includes("platnum") ||
    t.includes("platinun") ||
    t.includes("platibnum") ||
    t.includes("platina") ||
    t.includes("platino") ||
    t.includes("platnao") ||
    t.includes("platnão")
  ) return "VIP Platinum";

  if (t.includes("black")) return "VIP Black";
  if (t.includes("bronze")) return "VIP Bronze";
  if (t.includes("prata")) return "VIP Prata";
  if (t.includes("ouro")) return "VIP Ouro";

  if (
    t.includes("staff") ||
    t.includes("gente boa") ||
    t.includes("genteboa") ||
    t.includes("vip gente")
  ) return "VIP Staff";

  if (t.includes("rolepass")) return "Pass";
  if (t.includes("pass")) return "Pass";

  if (
    t.includes("evento") ||
    t.includes("vipevento") ||
    t.includes("vip evento")
  ) return "VIP Evento";

  if (
    t.includes("lancamento") ||
    t.includes("lançamento") ||
    t.includes("lancamnto") ||
    t.includes("lançamento")
  ) return "VIP Lancamento";

  if (pareceDinheiro) return "Dinheiro";

  return "Dinheiro";
}

function formatarTipoPremiacaoBonito(tipo) {
  const normalizado = normalizarTipoPremiacao(tipo);

  if (normalizado === "Dinheiro") return "💵 Dinheiro";
  if (normalizado === "VIP Platinum") return "💎 VIP Platinum";
  if (normalizado === "VIP Ouro") return "🥇 VIP Ouro";
  if (normalizado === "VIP Prata") return "🥈 VIP Prata";
  if (normalizado === "VIP Bronze") return "🥉 VIP Bronze";
  if (normalizado === "VIP Black") return "🖤 VIP Black";
  if (normalizado === "VIP Lancamento") return "🚀 VIP Lançamento";
  if (normalizado === "VIP Staff") return "🛡️ VIP Staff / VIP Gente Boa";
  if (normalizado === "VIP Evento") return "🎉 VIP Evento";
  if (normalizado === "Pass") return "🎟️ Rolepass";

  return `🎁 ${normalizado}`;
}

function normalizarMapaCategorias(obj) {
  const novo = {};

  for (const [categoria, valor] of Object.entries(obj || {})) {
    const catKey = normalizarTipoPremiacao(categoria);
    novo[catKey] = Number(novo[catKey] || 0) + Number(valor || 0);
  }

  return novo;
}

// =============================
// OCR / LEITURA DE COMPROVANTE
// =============================
const OCR_TIMEOUT_MS = 25000;

function extrairPrimeiraUrlImagem(texto) {
  const t = String(texto || "").trim();

  const urls = t.match(/https?:\/\/[^\s<>()"'`]+/gi) || [];
  const url = urls.find((u) =>
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) ||
    /media\.discordapp\.net/i.test(u) ||
    /cdn\.discordapp\.com/i.test(u)
  );

  return url || null;
}

function limparTextoOCR(texto) {
  return String(texto || "")
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[º°]/g, "")
    .replace(/[·•]/g, " • ")
    .replace(/([0-2]?\d)\s*[nH]\s*([0-5]\d)/g, "$1h$2")
    .replace(/([0-2]?\d)\s+h\s+([0-5]\d)/gi, "$1h$2")
    .replace(/([0-2]?\d)\s*:\s*([0-5]\d)\s*:\s*([0-5]\d)/g, "$1:$2:$3")
    .replace(/([0-3]?\d)\s*[Il|]\s*([01]?\d)\s*[Il|]\s*((?:20)?\d{2})/g, "$1/$2/$3")
    .replace(/([0-3]?\d)\s*\/\s*([01]?\d)\s*\/\s*((?:20)?\d{2})/g, "$1/$2/$3")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getAgoraSPParts() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  return {
    data: `${get("day")}/${get("month")}/${get("year")}`,
    horario: `${get("hour")}:${get("minute")}`,
  };
}

function normalizarHorarioOCR(hora, minuto, segundo = null) {
  const h = Number(String(hora || "").replace(/\D/g, ""));
  const m = Number(String(minuto || "").replace(/\D/g, ""));
  const s = segundo === null || segundo === undefined
    ? null
    : Number(String(segundo || "").replace(/\D/g, ""));

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  if (s !== null && (!Number.isFinite(s) || s < 0 || s > 59)) return null;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizarDataOCR(dia, mes, ano) {
  const d = Number(String(dia || "").replace(/\D/g, ""));
  const mo = Number(String(mes || "").replace(/\D/g, ""));
  let y = String(ano || "").replace(/\D/g, "");

  if (y.length === 2) y = `20${y}`;

  const yy = Number(y);

  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(yy)) return null;
  if (d < 1 || d > 31) return null;
  if (mo < 1 || mo > 12) return null;
  if (yy < 2020 || yy > 2099) return null;

  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${yy}`;
}

function parseValorOCR(texto) {
  const t = limparTextoOCR(texto)
    .replace(/RS\s*/gi, "R$ ")
    .replace(/R5\s*/gi, "R$ ")
    .replace(/R\§\s*/gi, "R$ ")
    .replace(/R\$\s+/gi, "R$ ")
    .replace(/\bValor\b\s*[:\-]?\s*/gi, "Valor: ");

  const matches = [
    ...t.matchAll(/R\$\s*([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,12}(?:,[0-9]{2})?)/gi),
    ...t.matchAll(/\bValor\s*[:\-]?\s*([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,12}(?:,[0-9]{2})?)/gi),
    ...t.matchAll(/\bPronto[\s\S]{0,180}?([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,12}(?:,[0-9]{2})?)/gi),
    ...t.matchAll(/\bTransfer[eê]ncia[\s\S]{0,220}?([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,12}(?:,[0-9]{2})?)/gi),
    ...t.matchAll(/\b([0-9]{1,3}(?:[.\s][0-9]{3}){2,}(?:,[0-9]{2})?)\b/gi),
  ];

  if (!matches.length) return null;

  const valores = matches
    .map((m) => {
      const rawOriginal = String(m[1] || "").trim();

      const raw = rawOriginal
        .replace(/\s+/g, ".")
        .replace(/[^\d.,]/g, "");

      const numero = Number(raw.replace(/\./g, "").replace(",", "."));

      return {
        raw: `R$ ${raw}`,
        numero: Number.isFinite(numero) ? numero : 0,
      };
    })
    .filter((v) => v.numero >= 1000)
    .sort((a, b) => b.numero - a.numero);

  return valores[0] || null;
}

function parseHorarioOCR(texto) {
  const t = limparTextoOCR(texto)
    .replace(/([0-2]?\d)\s*[nH]\s*([0-5]\d)/g, "$1h$2")
    .replace(/([0-2]?\d)\s*h\s+([0-5]\d)/gi, "$1h$2")
    .replace(/([0-2]?\d)\s*;\s*([0-5]\d)/g, "$1:$2");

  const padroesPrioritarios = [
    /Agora\s+mesmo\s*[•·\-\–\—:\s]*([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Agora\s+mesmo[\s\S]{0,80}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)\b/i,
    /Agora\s+mesmo[\s\S]{0,80}?([0-2]?\d)\s*([0-5]\d)\b/i,

    /Pronto[\s\S]{0,380}?Agora\s+mesmo[\s\S]{0,120}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)/i,
    /Pronto[\s\S]{0,380}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Pronto[\s\S]{0,380}?([0-2]?\d)\s*([0-5]\d)\b/i,

    /\b[0-3]?\d\s*[\/.\-]\s*[01]?\d\s*[\/.\-]\s*(?:20)?\d{2}\s+([0-2]?\d)\s*:\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?\b/i,
    /\b[0-3]?\d\s*[\/.\-]\s*[01]?\d\s*[\/.\-]\s*(?:20)?\d{2}\s+([0-2]?\d)\s*([0-5]\d)\b/i,

    /Transfer[eê]ncia\s+para[\s\S]{0,260}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Transfer[eê]ncia[\s\S]{0,300}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,

    /R\$\s*[0-9.\s]+[\s\S]{0,120}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,

    /\bàs\s+([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?\b/i,
    /\bas\s+([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?\b/i,
  ];

  for (const regex of padroesPrioritarios) {
    const m = t.match(regex);
    const horario = m ? normalizarHorarioOCR(m[1], m[2], m[3]) : null;
    if (horario) return horario;
  }

  const horarios = [
    ...t.matchAll(/\b([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?\b/gi),
    ...t.matchAll(/\b([0-2]\d)([0-5]\d)\b/g),
  ]
    .map((m) => normalizarHorarioOCR(m[1], m[2], m[3]))
    .filter(Boolean);

  if (!horarios.length) return null;

  return horarios[horarios.length - 1];
}

function parseDataOCR(texto) {
  const t = limparTextoOCR(texto);

  const padroes = [
    // Modelo lista/extrato:
    // "17/05/2026 23:17:42"
    /Transfer[eê]ncia[\s\S]{0,260}?\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\s*[\/.\-]\s*(20\d{2})\s+[0-2]?\d\s*:\s*[0-5]\d(?::[0-5]\d)?\b/gi,

    /\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\s*[\/.\-]\s*(20\d{2})\s+[0-2]?\d\s*:\s*[0-5]\d(?::[0-5]\d)?\b/g,

    // Data comum completa:
    // "17/05/2026"
    /\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\s*[\/.\-]\s*(20\d{2})\b/g,

    // Data curta:
    // "17/05/26"
    /\b([0-3]?\d)\s*[\/.\-]\s*([01]?\d)\s*[\/.\-]\s*(\d{2})\b/g,

    // Data por extenso:
    // "17 de maio de 2026"
    /\b([0-3]?\d)\s+de\s+([a-zç]+)\s+de\s+(20\d{2})\b/gi,
  ];

  const meses = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    março: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };

  for (const regex of padroes) {
    const matches = [...t.matchAll(regex)];

    for (const m of matches) {
      if (Number.isNaN(Number(m[2]))) {
        const mesTexto = String(m[2] || "").toLowerCase();
        const mesNumero = meses[mesTexto];
        const data = mesNumero ? normalizarDataOCR(m[1], mesNumero, m[3]) : null;
        if (data) return data;
      }

      const data = normalizarDataOCR(m[1], m[2], m[3]);
      if (data) return data;
    }
  }

  return null;
}

function limparNomeRecebedorOCR(nome) {
  return String(nome || "")
    .replace(/[-–—]?\s*R\$\s*[0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?/gi, "")
    .replace(/\bAgora\s+mesmo\b/gi, "")
    .replace(/\b\d{1,2}[:h]\d{2}\b/gi, "")
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/gi, "")
    .replace(/[•·]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-–—|:]+$/g, "")
    .trim();
}

function parseNomeRecebedorOCR(texto) {
  const t = limparTextoOCR(texto);

  const padroes = [
    /\bpara\s+([^\n\r]+?)(?:\n|Agora\s+mesmo|R\$|Valor|$)/i,
    /R\$\s*[0-9.\s,]+[\s\S]{0,80}?\bpara\s+([^\n\r]+?)(?:\n|Agora\s+mesmo|$)/i,
    /Pronto[\s\S]{0,260}?\bpara\s+([^\n\r]+?)(?:\n|Agora\s+mesmo|$)/i,
    /Transfer[eê]ncia\s+para\s+([^\n\r]+?)(?:\n|Agora\s+mesmo|R\$|$)/i,
    /Transfer[eê]ncia\s+de\s+([^\n\r]+?)(?:\n|R\$|$)/i,
  ];

  for (const regex of padroes) {
    const m = t.match(regex);
    if (m?.[1]) {
      const nome = limparNomeRecebedorOCR(m[1])
        .replace(/\bAgora\s+mesmo[\s\S]*$/i, "")
        .replace(/\bR\$\s*[\d.,\s]+$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      if (nome && nome.length >= 2) return nome;
    }
  }

  return null;
}

function corrigirNomeGanhadorPorOCR(nomeFormulario, nomeOCR) {
  const form = String(nomeFormulario || "").trim();
  const ocr = String(nomeOCR || "").trim();

  if (!ocr) return form || PADRAO_INDEFINIDO;
  if (!form || form === PADRAO_INDEFINIDO) return ocr;

  const formNorm = form.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ocrNorm = ocr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (formNorm === ocrNorm) return form;

  return ocr;
}

async function fetchImagemBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SantaCreatorsBot/1.0",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`URL não é imagem: ${contentType || "sem content-type"}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function prepararImagemParaOCR(buffer) {
  try {
    const meta = await sharp(buffer).metadata();

    const largura = meta.width || 0;
    const altura = meta.height || 0;

    const fator =
      largura <= 600 || altura <= 120
        ? 5
        : 3;

    return await sharp(buffer)
      .resize({
        width: largura ? Math.max(largura * fator, 1800) : undefined,
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch (err) {
    console.warn("[PAGAMENTO OCR] Falha ao preparar imagem, usando original:", err?.message || err);
    return buffer;
  }
}

async function gerarVariacoesImagemParaOCR(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const largura = meta.width || 0;
    const altura = meta.height || 0;

    const variacoes = [];

    const base = await prepararImagemParaOCR(buffer);
    variacoes.push(base);

    const semBorda = await sharp(buffer)
      .trim({ threshold: 18 })
      .png()
      .toBuffer()
      .then((b) => prepararImagemParaOCR(b))
      .catch(() => null);

    if (semBorda) variacoes.push(semBorda);

    if (largura > 0 && altura > 0) {
      const top = Math.floor(altura * 0.18);
      const height = Math.floor(altura * 0.52);

      const blocoCentral = await sharp(buffer)
        .extract({
          left: Math.floor(largura * 0.03),
          top,
          width: Math.floor(largura * 0.94),
          height,
        })
        .resize({
          width: 2200,
          withoutEnlargement: false,
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer()
        .catch(() => null);

      if (blocoCentral) variacoes.push(blocoCentral);
    }

    if (largura > 0 && altura > 0) {
      const top = Math.floor(altura * 0.25);
      const height = Math.floor(altura * 0.30);

      const blocoValorNomeHora = await sharp(buffer)
        .extract({
          left: Math.floor(largura * 0.06),
          top,
          width: Math.floor(largura * 0.88),
          height,
        })
        .resize({
          width: 2400,
          withoutEnlargement: false,
        })
        .grayscale()
        .normalize()
        .linear(1.55, -24)
        .sharpen()
        .png()
        .toBuffer()
        .catch(() => null);

      if (blocoValorNomeHora) variacoes.push(blocoValorNomeHora);
    }

    const threshold = await sharp(buffer)
      .resize({
        width: largura ? Math.max(largura * 5, 2200) : undefined,
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .threshold(165)
      .sharpen()
      .png()
      .toBuffer()
      .catch(() => null);

    if (threshold) variacoes.push(threshold);

    return variacoes;
  } catch (err) {
    console.warn("[PAGAMENTO OCR] Falha ao gerar variações, usando preparação padrão:", err?.message || err);
    return [await prepararImagemParaOCR(buffer)];
  }
}

async function reconhecerTextoPagamentoReforcado(worker, buffer) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  const leituraNormal = await worker.recognize(buffer);
  const textoNormal = limparTextoOCR(leituraNormal?.data?.text || "");

  await worker.setParameters({
    tessedit_char_whitelist: "0123456789R$rS.,/:.-hH ",
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  const leituraValorHora = await worker.recognize(buffer);
  const textoValorHora = limparTextoOCR(leituraValorHora?.data?.text || "");

  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç0123456789 .,:/-",
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  const leituraNome = await worker.recognize(buffer);
  const textoNome = limparTextoOCR(leituraNome?.data?.text || "");

  await worker.setParameters({
    tessedit_char_whitelist: "",
    preserve_interword_spaces: "1",
  });

  return limparTextoOCR(
    [
      textoNormal,
      "",
      "=== OCR_VALOR_HORA_REFORCADO ===",
      textoValorHora,
      "",
      "=== OCR_NOME_REFORCADO ===",
      textoNome,
    ].join("\n")
  );
}

async function analisarComprovantePagamento(premiacao) {
  const url = extrairPrimeiraUrlImagem(premiacao);

const agoraSP = getAgoraSPParts();

const resultado = {
  ok: false,
  url,
  texto: "",
  valorRaw: null,
  valorNumero: 0,
  nomeRecebedor: null,
  horario: agoraSP.horario,
  data: agoraSP.data,
  horarioFonte: "registro",
  dataFonte: "registro",
  erro: null,
};

  if (!url) {
    resultado.erro = "Nenhuma URL de imagem encontrada.";
    return resultado;
  }

  let worker = null;

  try {
const bufferOriginal = await fetchImagemBuffer(url);
const buffersOCR = await gerarVariacoesImagemParaOCR(bufferOriginal);

worker = await createWorker("por");

await worker.setParameters({
  preserve_interword_spaces: "1",
});

const textosOCR = [];

for (const bufferOCR of buffersOCR) {
  const textoParcial = await reconhecerTextoPagamentoReforcado(worker, bufferOCR).catch(() => "");
  if (textoParcial) textosOCR.push(textoParcial);
}

const texto = limparTextoOCR(textosOCR.join("\n\n=== OCR_VARIACAO_IMAGEM ===\n\n"));

console.log("[PAGAMENTO OCR] Texto identificado:", texto);

const valor = parseValorOCR(texto);

const horarioOCR = parseHorarioOCR(texto);
const dataOCR = parseDataOCR(texto);

resultado.ok = true;
resultado.texto = texto;
resultado.valorRaw = valor?.raw || null;
resultado.valorNumero = valor?.numero || 0;
resultado.nomeRecebedor = parseNomeRecebedorOCR(texto);

if (horarioOCR) {
  resultado.horario = horarioOCR;
  resultado.horarioFonte = "print";
}

if (dataOCR) {
  resultado.data = dataOCR;
  resultado.dataFonte = "print";
}

    return resultado;
  } catch (err) {
    resultado.erro = err?.message || String(err);
    return resultado;
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

// =============================
// LÓGICA DE ESTATÍSTICAS
// =============================
function getMonthKey() {
  // Força o fuso horário de São Paulo para evitar virada de mês antecipada
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function makeEmptyStats(monthKey) {
  return {
    month: monthKey,

    totalCreated: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalRequested: 0,

    totalAmountPaid: 0,

    creators: {},

    approvers: {},
    rejecters: {},
    requesters: {},

    categories: {},
    categoriesApproved: {},
    categoriesRejected: {},
    categoriesRequested: {},

    amountsByCreator: {},
    amountsByApprover: {},
    amountsByCategory: {},

    cities: {},
    citiesApproved: {},
    citiesRejected: {},
    citiesRequested: {},
    categoriesApprovedByCity: {},
    amountsByCity: {},
  };
}

function hydrateStats(stats, monthKey) {
  const base = makeEmptyStats(monthKey);
  return {
    ...base,
    ...stats,

    totalCreated: Number(stats?.totalCreated || 0),
    totalApproved: Number(stats?.totalApproved || 0),
    totalRejected: Number(stats?.totalRejected || 0),
    totalRequested: Number(stats?.totalRequested || 0),

    totalAmountPaid: Number(stats?.totalAmountPaid || 0),

    creators: stats?.creators || {},

    approvers: stats?.approvers || {},
    rejecters: stats?.rejecters || {},
    requesters: stats?.requesters || {},

    categories: normalizarMapaCategorias(stats?.categories || {}),
categoriesApproved: normalizarMapaCategorias(stats?.categoriesApproved || {}),
categoriesRejected: normalizarMapaCategorias(stats?.categoriesRejected || {}),
categoriesRequested: normalizarMapaCategorias(stats?.categoriesRequested || {}),

amountsByCreator: stats?.amountsByCreator || {},
amountsByApprover: stats?.amountsByApprover || {},
amountsByCategory: normalizarMapaCategorias(stats?.amountsByCategory || {}),

cities: stats?.cities || {},
citiesApproved: stats?.citiesApproved || {},
citiesRejected: stats?.citiesRejected || {},
citiesRequested: stats?.citiesRequested || {},
categoriesApprovedByCity: stats?.categoriesApprovedByCity || {},
amountsByCity: stats?.amountsByCity || {},
  };
}

function loadStats() {
  const monthKey = getMonthKey();
  if (!fs.existsSync(STATS_FILE)) return makeEmptyStats(monthKey);
  
  try {
    const data = JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
    if (data.month !== monthKey) {
      return makeEmptyStats(monthKey);
    }
    return hydrateStats(data, monthKey);
  } catch {
    return makeEmptyStats(monthKey);
  }
}

function saveStats(stats) {
  if (!fs.existsSync(path.dirname(STATS_FILE))) fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function ordenarTop(obj, limit = 5) {
  return Object.entries(obj || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit);
}

function somarObj(obj) {
  return Object.values(obj || {}).reduce((acc, n) => acc + Number(n || 0), 0);
}

function formatarRankingUsuarios(obj, vazio = "_Nenhum dado ainda_") {
  const lista = ordenarTop(obj, 10);

  if (!lista.length) return vazio;

  return lista
    .map(([userId, count], index) => `**${index + 1}.** <@${userId}> — \`${count}\``)
    .join("\n");
}


function formatarCidadesProfissional(stats) {
  const linhas = [];

  for (const [cidadeKey, cidade] of Object.entries(CIDADES_PAGAMENTO)) {
    const categorias = stats.categoriesApprovedByCity?.[cidadeKey] || {};
    const valorPago = Number(stats.amountsByCity?.[cidadeKey] || 0);

    const temDados = Object.keys(categorias).length > 0 || valorPago > 0;

    if (!temDados) {
      linhas.push([
        `${cidade.emoji} **${cidade.label}**`,
        `> _Nenhum pagamento aprovado marcado ainda_`,
      ].join("\n"));
      continue;
    }

    const catsTexto = Object.entries(categorias)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([cat, qtd]) => `> 💠 **${cat}:** \`${qtd}\``)
      .join("\n");

    linhas.push([
      `${cidade.emoji} **${cidade.label}** — <@&${cidade.roleId}>`,
      catsTexto || "> _Sem categorias_",
      `> 💵 **Valor pago:** \`R$ ${valorPago.toLocaleString("pt-BR")}\``,
    ].join("\n"));
  }

  return linhas.join("\n\n");
}

function formatarCategoriasProfissional(stats) {
  const todas = new Set([
    ...Object.keys(stats.categories || {}),
    ...Object.keys(stats.categoriesApproved || {}),
    ...Object.keys(stats.categoriesRejected || {}),
    ...Object.keys(stats.categoriesRequested || {}),
  ]);

  if (!todas.size) return "_Nenhuma categoria registrada ainda_";

  return [...todas]
    .sort()
    .map((cat) => {
      const criados = Number(stats.categories?.[cat] || 0);
      const aprovados = Number(stats.categoriesApproved?.[cat] || 0);
      const reprovados = Number(stats.categoriesRejected?.[cat] || 0);
      const solicitados = Number(stats.categoriesRequested?.[cat] || 0);

      return [
        `💠 **${cat}**`,
        `> 🧾 Criados: \`${criados}\``,
        `> ✅ Aprovados: \`${aprovados}\``,
        `> ❌ Reprovados: \`${reprovados}\``,
        `> 📌 Solicitados: \`${solicitados}\``,
      ].join("\n");
    })
    .join("\n\n");
}

function esconderCamposFinanceiros(categoriaVip, analiseComprovante) {
  const cat = String(categoriaVip || "").toLowerCase();
  const ehVipOuPass = cat.includes("vip") || cat.includes("pass");

  return ehVipOuPass && !analiseComprovante?.valorRaw;
}

function criarRowDashboardPagamento() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pagamento_dash_atualizar")
      .setLabel("🔄 Atualizar Dashboard")
      .setStyle(ButtonStyle.Primary)
  );
}

async function encontrarDashboardPagamentoDoMes(channel, monthKey) {
  const mensagens = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!mensagens) return null;

  const dashboards = [...mensagens.values()]
    .filter((msg) => msg.author?.bot)
    .filter((msg) => msg.embeds?.length > 0)
    .filter((msg) => {
      const embed = msg.embeds[0];
      const titulo = embed?.title || "";
      const footer = embed?.footer?.text || "";

      return (
        titulo.includes("Dashboard Analítico — Social Mídias") &&
        footer.includes(DASH_MARKER) &&
        footer.includes(`Mês ${monthKey}`)
      );
    })
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  return dashboards[0] || null;
}

async function updateDashboard(client) {
  const stats = loadStats();
  const channel = await client.channels.fetch(CANAL_DASHBOARD_PAGAMENTO).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const topApprovers = ordenarTop(stats.approvers, 5);
  const topRejecters = ordenarTop(stats.rejecters, 5);
  const topCreators = ordenarTop(stats.creators, 5);

  const totalCriados = Number(stats.totalCreated || somarObj(stats.creators));
  const totalAprovados = Number(stats.totalApproved || 0);
  const totalReprovados = Number(stats.totalRejected || 0);
  const totalSolicitados = Number(stats.totalRequested || 0);

  const guild = channel.guild;

  async function nomeBonitoUsuario(userId) {
    const member = await guild.members.fetch(userId).catch(() => null);

    if (member?.displayName) {
      return member.displayName
        .replace(/[^\p{L}\p{N}\s|._-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 22);
    }

    return `ID ${String(userId).slice(-4)}`;
  }

  const topApproversLabels = await Promise.all(
    topApprovers.map(([userId]) => nomeBonitoUsuario(userId))
  );

  const chartConfig = {
    type: "horizontalBar",
    data: {
      labels: topApproversLabels,
      datasets: [
        {
          label: "Aprovações no mês",
          data: topApprovers.map(([, count]) => Number(count || 0)),
          backgroundColor: [
            "#ff3399",
            "#8e44ff",
            "#00d4ff",
            "#2ecc71",
            "#f1c40f",
          ],
          borderColor: "#ffffff",
          borderWidth: 2,
          borderRadius: 10,
          barThickness: 34,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      layout: {
        padding: {
          top: 28,
          right: 45,
          bottom: 24,
          left: 20,
        },
      },
      title: {
        display: true,
        text: "🏆 Top 5 Aprovadores do Mês",
        fontSize: 24,
        fontColor: "#ffffff",
        fontStyle: "bold",
        padding: 24,
      },
      legend: {
        display: false,
      },
      plugins: {
        datalabels: {
          anchor: "end",
          align: "right",
          color: "#ffffff",
          font: {
            size: 18,
            weight: "bold",
          },
          formatter: function(value) {
            return value + " aprovações";
          },
        },
      },
      scales: {
        xAxes: [
          {
            ticks: {
              beginAtZero: true,
              precision: 0,
              fontColor: "#dcdcdc",
              fontSize: 14,
            },
            gridLines: {
              color: "rgba(255,255,255,0.08)",
              zeroLineColor: "rgba(255,255,255,0.25)",
            },
          },
        ],
        yAxes: [
          {
            ticks: {
              fontColor: "#ffffff",
              fontSize: 16,
              fontStyle: "bold",
            },
            gridLines: {
              display: false,
            },
          },
        ],
      },
    },
  };

  const chartUrl = `https://quickchart.io/chart?width=1000&height=520&devicePixelRatio=2&backgroundColor=%23111118&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

  const taxaAprovacao = totalCriados > 0
    ? ((totalAprovados / totalCriados) * 100).toFixed(1)
    : "0.0";

  const taxaReprovacao = totalCriados > 0
    ? ((totalReprovados / totalCriados) * 100).toFixed(1)
    : "0.0";

  const embed = new EmbedBuilder()
    .setColor("#ff3399")
    .setTitle("📊 Dashboard Analítico — Social Mídias")
    .setDescription(
      [
        `Relatório mensal consolidado: **${stats.month}**`,
        "",
        "Painel oficial com registros criados, aprovações, reprovações, solicitações, categorias e responsáveis.",
      ].join("\n")
    )
    .addFields(
      {
        name: "📌 Visão Geral do Mês",
        value: [
          `🧾 **Registros criados:** \`${totalCriados}\``,
          `✅ **Aprovados:** \`${totalAprovados}\``,
          `❌ **Reprovados:** \`${totalReprovados}\``,
          `📌 **Solicitados:** \`${totalSolicitados}\``,
          `📈 **Taxa de aprovação:** \`${taxaAprovacao}%\``,
          `📉 **Taxa de reprovação:** \`${taxaReprovacao}%\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "💰 Financeiro",
        value: [
          `💵 **Valor pago no mês:** \`R$ ${Number(stats.totalAmountPaid || 0).toLocaleString("pt-BR")}\``,
          `🏆 **Maior aprovador:** ${topApprovers[0] ? `<@${topApprovers[0][0]}> — \`${topApprovers[0][1]}\`` : "—"}`,
          `📝 **Maior registrador:** ${topCreators[0] ? `<@${topCreators[0][0]}> — \`${topCreators[0][1]}\`` : "—"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "💎 Categorias / VIPs / Passes",
        value: formatarCategoriasProfissional(stats),
        inline: false,
      },
      {
        name: "🏙️ Pagamentos por Cidade / CDD",
        value: formatarCidadesProfissional(stats),
        inline: false,
      },
      {
        name: "🥇 Ranking de Aprovadores",
        value: formatarRankingUsuarios(stats.approvers),
        inline: false,
      },
      {
        name: "🚫 Ranking de Reprovações",
        value: formatarRankingUsuarios(stats.rejecters),
        inline: false,
      },
      {
        name: "📝 Ranking de Registros Criados",
        value: formatarRankingUsuarios(stats.creators),
        inline: false,
      }
    )
    .setImage(chartUrl)
    .setFooter({ text: `${DASH_MARKER} • Mês ${stats.month} • Atualizado automaticamente` })
    .setTimestamp();

  const state = readJSON(DASH_STATE_FILE, { messagesByMonth: {} });

  if (!state.messagesByMonth) {
    state.messagesByMonth = {};
  }

  let msg = null;
  const messageIdDoMes = state.messagesByMonth[stats.month];

  if (messageIdDoMes) {
    msg = await channel.messages.fetch(messageIdDoMes).catch(() => null);
  }

  if (!msg) {
    msg = await encontrarDashboardPagamentoDoMes(channel, stats.month).catch(() => null);
  }

  if (msg) {
    await msg.edit({
      embeds: [embed],
      components: [criarRowDashboardPagamento()],
    }).catch(() => {});

    state.messagesByMonth[stats.month] = msg.id;
    saveJSON_Dash(DASH_STATE_FILE, state);
  } else {
    const newMsg = await channel.send({
      embeds: [embed],
      components: [criarRowDashboardPagamento()],
    }).catch(() => null);

    if (newMsg) {
      state.messagesByMonth[stats.month] = newMsg.id;
      saveJSON_Dash(DASH_STATE_FILE, state);
    }
  }
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function saveJSON_Dash(file, data) {
  if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizarDataEvento(s) {
  const t = String(s || "").trim();
  if (!t || t === "undefined" || t === PADRAO_INDEFINIDO) {
    // Força o fuso horário de São Paulo para pegar o dia correto no Brasil
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    // Retorna a data de hoje formatada: DD/MM/YYYY
    return `${d}/${m}/${y}`;
  }
  return t;
}

function dataEventoParaTimestampSP(dataEvento, fallback = Date.now()) {
  const texto = String(dataEvento || "").trim();

  const match = texto.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (!match) return fallback;

  const dia = Number(match[1]);
  const mes = Number(match[2]);

  const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let ano = match[3] ? Number(match[3]) : agoraSP.getFullYear();

  if (ano < 100) ano = 2000 + ano;

  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) return fallback;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return fallback;

  return new Date(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T12:00:00-03:00`).getTime();
}

// =============================
// Helpers de UI
// =============================
function criarRowMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("abrirform")
      .setLabel("➕ Novo Pagamento")
      .setStyle(ButtonStyle.Primary),

   new ButtonBuilder()
  .setCustomId("pagamento_filtro_solicitados")
  .setLabel("📌 Solicitados")
  .setStyle(ButtonStyle.Secondary),

new ButtonBuilder()
  .setCustomId("pagamento_filtro_naoclicados")
  .setLabel("🕗 Não clicados")
  .setStyle(ButtonStyle.Secondary),

new ButtonBuilder()
  .setCustomId("pagamento_filtro_cidades")
  .setLabel("🏙️ Cidades")
  .setStyle(ButtonStyle.Secondary)
  );
}

function criarEmbedMenu() {
  const instrucoes = [
    "🩷 **Guia rápido — Como preencher (Formulário):**",
    "┃ 🏷️ **Evento | Data:** _Missão Rosa | 20/09_",
    "┃ 👤 **Ganhador (Nome** ou **Nome |/\\ ID/Texto):** _Virtude_ **ou** _Virtude | 12345_ **ou** _Virtude / 12345_ **ou** _Virtude \\ 12345_",
    "┃  **Tipo:** _Vip Staff, Rolepass, Vip Ouro, etc_",
    "┃ 🎁 **Premiação:** _Valor: 10kk | VIP: Sim/Não_",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#ff3399")
    .setTitle("💸 Registro de Pagamento de Evento")
    .setDescription(
      [
        "🎯 **Clique no botão abaixo para registrar um pagamento de evento.**",
        "",
        instrucoes,
        "",
        "🧾 **Apenas membros autorizados podem registrar.**",
      ].join("\n")
    )
    .setImage(
      "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66"
    )
    .setFooter({ text: "SantaCreators – Sistema Oficial de Registro" });
}

function criarRowStatus(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pago__${messageId}`)
      .setLabel("✅ PAGO")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`solicitado__${messageId}`)
      .setLabel("📌 JÁ FOI SOLICITADO")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`reprovado__${messageId}`)
      .setLabel("❌ REPROVADO")
      .setStyle(ButtonStyle.Danger)
  );
}

function criarRowCidadesPagamento(messageId) {
  return new ActionRowBuilder().addComponents(
    Object.entries(CIDADES_PAGAMENTO).map(([cidadeKey, cidade]) =>
      new ButtonBuilder()
        .setCustomId(`cidade_pagamento__${cidadeKey}__${messageId}`)
        .setLabel(cidade.label)
        .setEmoji(cidade.emoji)
        .setStyle(ButtonStyle.Secondary)
    )
  );
}

function removerRowsCidadePagamento(message) {
  return (message.components || [])
    .filter((row) => {
      return !row.components?.some((c) =>
        String(c.customId || "").startsWith("cidade_pagamento__")
      );
    })
    .map((row) => ActionRowBuilder.from(row));
}

// =============================
// Log visual completo
// =============================
async function logPagamento(client, interaction, titulo, descricao, linkMsg = null) {
  const canalLog = CANAL_LOG_PAGAMENTO ? await client.channels.fetch(CANAL_LOG_PAGAMENTO).catch(() => null) : null;
  if (!canalLog) return;

  const embed = new EmbedBuilder()
    .setColor("#ff3399")
    .setAuthor({
      name: `${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
    })
    .setTitle(titulo)
    .setDescription(`${descricao}\n\n👤 **Usuário:** <@${interaction.user.id}>`)
    .addFields(
      { name: "🆔 ID do Usuário", value: `\`${interaction.user.id}\``, inline: true },
      { name: "🕒 Horário", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
    )
    .setTimestamp();

  if (linkMsg) {
    embed.addFields({ name: "🔗 Link da Mensagem", value: `[Clique aqui](${linkMsg})` });
  }

  await canalLog.send({ embeds: [embed] }).catch(() => {});
}

// =============================

function buildLogContext({
  registroMsg = null,
  criadorId = null,
  actionById = null,
}) {
  const linhas = [];

  if (registroMsg) {
    linhas.push(`🔗 **Registro:** [Abrir mensagem](${registroMsg.url})`);
  }

  if (criadorId) {
    linhas.push(`📝 **Criado por:** <@${criadorId}>`);
  }

  if (actionById) {
    linhas.push(`🧑‍⚖️ **Ação feita por:** <@${actionById}>`);
  }

  linhas.push(`🕒 **Horário:** <t:${Math.floor(Date.now() / 1000)}:f>`);

  return linhas.join("\n");
}


// =============================
// Status update + auditoria (Status + Última decisão)
// =============================
function getFieldValue(embedLike, fieldName) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];
  const f = fields.find((x) => x.name === fieldName);
  return (f?.value || "").trim();
}

function getCriadorIdFromEmbed(embedLike) {
  // Preferência: campo fixo novo
  const v = getFieldValue(embedLike, "🆔 Criador do Registro");
  // v = "<@123> (`123`)" -> extrai ID
  const m = v.match(/`(\d{10,25})`/);
  if (m?.[1]) return m[1];

  // Fallback: tenta do campo antigo "📝 Registro"
  const r = getFieldValue(embedLike, "📝 Registro");
  const m2 = r.match(/<@(\d{10,25})>/);
  return m2?.[1] || null;
}

function getStatusValueFromEmbed(embed) {
  const status = getFieldValue(embed, "📌 Status");
  return status || "";
}

function getTipoPagamentoFromEmbed(embedLike) {
  const desc = String(embedLike?.description || embedLike?.data?.description || "");

  const match =
    desc.match(/Tipo Identificado:\*\*\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*([^\n]+)/i);

  if (match?.[1]) {
    return normalizarTipoPremiacao(
      String(match[1])
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .trim()
    );
  }

  return "Dinheiro";
}

function getAcaoFinalFromEmbed(embedLike) {
  const status = getStatusValueFromEmbed(embedLike);

  if (/✅\s*\*{0,2}PAGO\*{0,2}/i.test(status)) return "pago";
  if (/❌\s*\*{0,2}REPROVADO\*{0,2}/i.test(status)) return "reprovado";
  if (/JÁ FOI SOLICITADO|JA FOI SOLICITADO/i.test(status)) return "solicitado";

  return "aguardando";
}

function getUserIdFromUltimaDecisao(embedLike) {
  const decisao = getFieldValue(embedLike, "🧑‍⚖️ Última decisão");
  const match = decisao.match(/<@!?(\d{10,25})>/);
  return match?.[1] || null;
}

function getValorNumeroFromEmbed(embedLike) {
  const valorRaw = getFieldValue(embedLike, "💰 Valor Identificado");
  return parseValorOCR(valorRaw)?.numero || 0;
}

function getCidadeKeyFromEmbed(embedLike) {
  const cidadeRaw = getFieldValue(embedLike, "🏙️ Cidade / CDD");

  for (const [cidadeKey, cidade] of Object.entries(CIDADES_PAGAMENTO)) {
    if (cidadeRaw.includes(cidade.roleId)) return cidadeKey;
    if (cidadeRaw.toLowerCase().includes(cidade.label.toLowerCase())) return cidadeKey;
  }

  return null;
}

function atualizarCampoCidade(embedBuilder, cidadeKey, actionByUserId = null) {
  const cidade = CIDADES_PAGAMENTO[cidadeKey];
  if (!cidade) return embedBuilder;

  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

  const textoCidade = [
    `${cidade.emoji} **${cidade.label}**`,
    `<@&${cidade.roleId}>`,
    actionByUserId ? `Marcado por: <@${actionByUserId}>` : null,
    `🕒 <t:${Math.floor(Date.now() / 1000)}:f>`,
  ].filter(Boolean).join("\n");

  const novoField = {
    name: "🏙️ Cidade / CDD",
    value: textoCidade,
    inline: false,
  };

  const idx = fields.findIndex((f) => f.name === "🏙️ Cidade / CDD");

  if (idx >= 0) fields[idx] = novoField;
  else fields.splice(Math.max(fields.length - 2, 0), 0, novoField);

  embedBuilder.setFields(fields);
  return embedBuilder;
}

function mensagemEhDoMesAtualSP(msg) {
  const monthKey = getMonthKey();

  const dataSP = new Date(msg.createdTimestamp).toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
  });

  const d = new Date(dataSP);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return key === monthKey;
}

async function reconstruirStatsPorEmbeds(client, limiteBusca = 100) {
  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) return null;

  const monthKey = getMonthKey();
  const stats = makeEmptyStats(monthKey);

  const mensagens = await canal.messages.fetch({ limit: limiteBusca }).catch(() => null);
  if (!mensagens) return null;

  const registros = [...mensagens.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => mensagemEhDoMesAtualSP(m))
    .filter((m) => {
      const titulo = m.embeds?.[0]?.title || "";
      return titulo.includes("Registro de Pagamento de Evento – SANTACREATORS");
    });

  for (const msg of registros) {
    const embed = msg.embeds[0];

    const categoria = getTipoPagamentoFromEmbed(embed);
    const acao = getAcaoFinalFromEmbed(embed);
    const criadorId = getCriadorIdFromEmbed(embed);
    const decisorId = getUserIdFromUltimaDecisao(embed);
    const valor = getValorNumeroFromEmbed(embed);
    const cidadeKey = getCidadeKeyFromEmbed(embed);

    stats.totalCreated += 1;
    stats.categories[categoria] = Number(stats.categories[categoria] || 0) + 1;

    if (criadorId) {
      stats.creators[criadorId] = Number(stats.creators[criadorId] || 0) + 1;
    }

    if (acao === "pago") {
      stats.totalApproved += 1;
      stats.totalAmountPaid += valor;

      stats.categoriesApproved[categoria] = Number(stats.categoriesApproved[categoria] || 0) + 1;
      stats.amountsByCategory[categoria] = Number(stats.amountsByCategory[categoria] || 0) + valor;

      if (cidadeKey) {
        stats.citiesApproved[cidadeKey] = Number(stats.citiesApproved[cidadeKey] || 0) + 1;
        stats.amountsByCity[cidadeKey] = Number(stats.amountsByCity[cidadeKey] || 0) + valor;

        if (!stats.categoriesApprovedByCity[cidadeKey]) {
          stats.categoriesApprovedByCity[cidadeKey] = {};
        }

        stats.categoriesApprovedByCity[cidadeKey][categoria] =
          Number(stats.categoriesApprovedByCity[cidadeKey][categoria] || 0) + 1;
      }

      if (decisorId) {
        stats.approvers[decisorId] = Number(stats.approvers[decisorId] || 0) + 1;
        stats.amountsByApprover[decisorId] = Number(stats.amountsByApprover[decisorId] || 0) + valor;
      }

      if (criadorId) {
        stats.amountsByCreator[criadorId] = Number(stats.amountsByCreator[criadorId] || 0) + valor;
      }
    }

    if (acao === "reprovado") {
      stats.totalRejected += 1;
      stats.categoriesRejected[categoria] = Number(stats.categoriesRejected[categoria] || 0) + 1;

      if (decisorId) {
        stats.rejecters[decisorId] = Number(stats.rejecters[decisorId] || 0) + 1;
      }
    }

    if (acao === "solicitado") {
      stats.totalRequested += 1;
      stats.categoriesRequested[categoria] = Number(stats.categoriesRequested[categoria] || 0) + 1;

      if (decisorId) {
        stats.requesters[decisorId] = Number(stats.requesters[decisorId] || 0) + 1;
      }
    }
  }

  saveStats(stats);
  return stats;
}

function atualizarCampoStatus(embedBuilder, novoTexto, cor, actionByUserId = null, actionLabel = null) {
  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

  // 1) atualiza/injeta Status
  const idxStatus = fields.findIndex((f) => f.name === "📌 Status");
  const novoFieldStatus = { name: "📌 Status", value: novoTexto, inline: false };
  if (idxStatus >= 0) fields[idxStatus] = novoFieldStatus;
  else fields.push(novoFieldStatus);

  // 2) atualiza/injeta Última decisão (quem mexeu)
  if (actionByUserId) {
    const ts = Math.floor(Date.now() / 1000);
    const label = actionLabel || "Atualizado";
    const textoDecisao = `**${label} por:** <@${actionByUserId}>\n🕒 <t:${ts}:f>`;

    const idxDec = fields.findIndex((f) => f.name === "🧑‍⚖️ Última decisão");
    const novoFieldDec = { name: "🧑‍⚖️ Última decisão", value: textoDecisao, inline: false };
    if (idxDec >= 0) fields[idxDec] = novoFieldDec;
    else fields.push(novoFieldDec);
  }

  embedBuilder.setFields(fields);
  if (cor) embedBuilder.setColor(cor);
  return embedBuilder;
}


// =============================
// Mantém só 1 menu (card do botão) no canal
// =============================
async function limparBotoesAntigos(client, canal) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return null;

  const botoes = mensagens.filter((msg) => {
    const ehDoBot = msg.author?.id === client.user.id;
    const temEmbed = msg.embeds?.length === 1;
    const tituloOk = msg.embeds?.[0]?.title?.includes("Registro de Pagamento de Evento");
    const temComponentes = msg.components?.length > 0;

    const customIds = msg.components?.[0]?.components?.map((c) => c.customId) || [];
    const temAbrirForm = customIds.includes("abrirform");

    return ehDoBot && temEmbed && tituloOk && temComponentes && temAbrirForm;
  });

  const ordenadas = [...botoes.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  const paraDeletar = ordenadas.slice(1);

  for (const msg of paraDeletar) {
    await msg.delete().catch(() => {});
  }

  return ordenadas[0] || null;
}

async function adicionarBotoesCidadeNosRegistrosDoMes(client, canal) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { atualizados: 0, ignorados: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => {
      const t = m.embeds?.[0]?.title || "";
      return t.includes("Registro de Pagamento de Evento – SANTACREATORS");
    })
    .filter((m) => mensagemEhDoMesAtualSP(m));

  let atualizados = 0;
  let ignorados = 0;

  for (const msg of lista) {
    const embedRaw = msg.embeds?.[0];
    if (!embedRaw) continue;

    const cidadeJaDefinida = getCidadeKeyFromEmbed(embedRaw);

    const jaTemBotaoCidade = msg.components?.some((row) =>
      row.components?.some((c) => String(c.customId || "").startsWith("cidade_pagamento__"))
    );

    if (cidadeJaDefinida) {
      const componentsSemCidades = removerRowsCidadePagamento(msg);

      await msg.edit({
        embeds: [EmbedBuilder.from(embedRaw)],
        components: componentsSemCidades,
      }).catch(() => null);

      ignorados++;
      continue;
    }

    if (jaTemBotaoCidade) {
      ignorados++;
      continue;
    }
    const embedOriginal = EmbedBuilder.from(embedRaw);

    const statusValue = getStatusValueFromEmbed(embedOriginal);
    const ehPagoFinal = /✅\s*\*\*PAGO\*\*/i.test(statusValue);
    const ehReprovadoFinal = /❌\s*\*\*REPROVADO\*\*/i.test(statusValue);

    const components = [];

    if (ehPagoFinal || ehReprovadoFinal) {
      components.push(criarRowCidadesPagamento(msg.id));
    } else {
      components.push(criarRowStatus(msg.id));
      components.push(criarRowCidadesPagamento(msg.id));
    }

    await msg.edit({
      embeds: [embedOriginal],
      components,
    }).catch(() => null);

    atualizados++;
  }

  return { atualizados, ignorados };
}

function valorEhNaoIdentificado(valor) {
  return !valor || /Não identificado|Nao identificado|—/i.test(String(valor));
}

function getPremiacaoLinkFromEmbed(embedLike) {
  return getFieldValue(embedLike, "🔗 Premiação / Link") || null;
}

function extrairLinkMensagemDiscord(texto) {
  const match = String(texto || "").match(
    /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d{10,25})\/(\d{10,25})\/(\d{10,25})/i
  );

  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
    url: match[0],
  };
}

function getFieldValueStarts(embedLike, starts) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];
  const field = fields.find((f) => String(f.name || "").startsWith(starts));
  return String(field?.value || "").trim();
}

function limparValorEmbedVip(texto) {
  return String(texto || "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairInfoDoEmbedVipEvento(embedLike) {
  const desc = String(embedLike?.description || embedLike?.data?.description || "");

  const tipoMatch =
    desc.match(/Tipo Identificado:\*\*\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*`([^`]+)`/i) ||
    desc.match(/Tipo Identificado:\s*([^\n]+)/i);

  const eventoRaw = getFieldValueStarts(embedLike, "🏁 Nome do evento ganho");
  const dataRaw = getFieldValueStarts(embedLike, "📅 Dia do evento");
  const ganhadorRaw = getFieldValueStarts(embedLike, "🆔 ID do ganhador");
const nomeRaw = getFieldValueStarts(embedLike, "👤 Nome do ganhador");
const premiacaoRaw = getFieldValueStarts(embedLike, "🎁 Premiação");
const cidadeRaw = getFieldValueStarts(embedLike, "🌆 Cidade");
const orgRaw = getFieldValueStarts(embedLike, "🏢 Organização");

  const idMatch =
    ganhadorRaw.match(/<@!?(\d{1,25})>/) ||
    ganhadorRaw.match(/\(`?(\d{1,25})`?\)/) ||
    ganhadorRaw.match(/\b(\d{1,25})\b/);

  const tipoTexto = tipoMatch?.[1] || premiacaoRaw || "";

const nomeLimpo = limparValorEmbedVip(nomeRaw);
const orgLimpa = limparValorEmbedVip(orgRaw);

const nomeFinal =
  nomeLimpo &&
  !/^não identificado$/i.test(nomeLimpo)
    ? nomeLimpo
    : orgLimpa || PADRAO_INDEFINIDO;

return {
  evento: limparValorEmbedVip(eventoRaw),
  data: limparValorEmbedVip(dataRaw),
  ganhadorNome: nomeFinal,
  ganhadorId: idMatch?.[1] || "",
  tipo: normalizarTipoPremiacao(tipoTexto),
  premiacao: limparValorEmbedVip(premiacaoRaw),
  cidade: limparValorEmbedVip(cidadeRaw),
  organizacao: orgLimpa,
};
}

async function resolverVipEventoPorLink(client, texto) {
  const link = extrairLinkMensagemDiscord(texto);
  if (!link) return null;

  const canal = await client.channels.fetch(link.channelId).catch(() => null);
  if (!canal?.isTextBased()) {
    return {
      ok: false,
      erro: "Canal do link VIP não encontrado ou não é texto.",
      link,
    };
  }

  const msg = await canal.messages.fetch(link.messageId).catch(() => null);
  if (!msg?.embeds?.[0]) {
    return {
      ok: false,
      erro: "Mensagem VIP não encontrada ou sem embed.",
      link,
    };
  }

  const titulo = msg.embeds[0]?.title || "";
  if (!titulo.includes("Registro de VIP por Evento")) {
    return {
      ok: false,
      erro: "O link encontrado não parece ser de um registro VIP por evento.",
      link,
    };
  }

  return {
    ok: true,
    link,
    message: msg,
    info: extrairInfoDoEmbedVipEvento(msg.embeds[0]),
  };
}

function normalizarBuscaVip(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function textoCompletoEmbedVip(embedLike) {
  const fields = embedLike?.fields || embedLike?.data?.fields || [];

  return [
    embedLike?.title || embedLike?.data?.title || "",
    embedLike?.description || embedLike?.data?.description || "",
    ...fields.flatMap((f) => [f.name || "", f.value || ""]),
    embedLike?.footer?.text || embedLike?.data?.footer?.text || "",
  ].join("\n");
}

async function buscarVipEventoPorDados(client, dados = {}) {
  const canal = await client.channels.fetch(CANAL_VIP_EVENTO).catch(() => null);

  if (!canal?.isTextBased()) {
    return {
      ok: false,
      erro: `Canal VIP indisponível: ${CANAL_VIP_EVENTO}`,
    };
  }

  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);

  if (!mensagens) {
    return {
      ok: false,
      erro: "Não consegui buscar mensagens no canal VIP.",
    };
  }

  const alvoEvento = normalizarBuscaVip(dados.eventoNome);
  const alvoData = normalizarBuscaVip(dados.eventoData);
  const alvoId = normalizarBuscaVip(dados.ganhadorId);
  const alvoNome = normalizarBuscaVip(dados.ganhadorNome);

  const candidatos = [...mensagens.values()]
    .filter((msg) => msg.author?.bot)
    .filter((msg) => msg.embeds?.length > 0)
    .filter((msg) => {
      const titulo = msg.embeds?.[0]?.title || "";
      return titulo.includes("Registro de VIP por Evento");
    })
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  for (const msg of candidatos) {
    const embed = msg.embeds[0];
    const texto = normalizarBuscaVip(textoCompletoEmbedVip(embed));

const infoVip = extrairInfoDoEmbedVipEvento(embed);

const bateId = alvoId && texto.includes(alvoId);
const bateNome = alvoNome && texto.includes(alvoNome);
const bateEvento = alvoEvento && texto.includes(alvoEvento);
const bateData = alvoData && texto.includes(alvoData);

const eventoVipNorm = normalizarBuscaVip(infoVip.evento);
const dataVipNorm = normalizarBuscaVip(infoVip.data);

const mesmoEvento = alvoEvento && eventoVipNorm && eventoVipNorm.includes(alvoEvento);
const mesmaData = alvoData && dataVipNorm && dataVipNorm.includes(alvoData);

const vinculoSeguro = alvoId
  ? Boolean(bateId && (mesmoEvento || mesmaData || bateEvento || bateData))
  : Boolean((bateNome && mesmoEvento) || (mesmoEvento && mesmaData));

if (vinculoSeguro) {
  return {
    ok: true,
    link: {
      guildId: msg.guild?.id || null,
      channelId: msg.channel?.id || null,
      messageId: msg.id,
      url: msg.url,
    },
    message: msg,
    info: infoVip,
  };
}
  }

  return {
    ok: false,
    erro: "Nenhum registro VIP compatível encontrado.",
  };
}

async function resolverVipEventoProfissional(client, texto, dados = {}) {
  const porLink = await resolverVipEventoPorLink(client, texto).catch((err) => ({
    ok: false,
    erro: err?.message || String(err),
  }));

  if (porLink?.ok) return porLink;

  const porBusca = await buscarVipEventoPorDados(client, dados).catch((err) => ({
    ok: false,
    erro: err?.message || String(err),
  }));

  if (porBusca?.ok) return porBusca;

  return porLink || porBusca || null;
}

function extrairRegistranteVipEvento(embedLike) {
  const desc = String(embedLike?.description || embedLike?.data?.description || "");
  const match = desc.match(/Registrado por:\*\*\s*<@!?(\d{10,25})>/i);
  return match?.[1] || null;
}

function extrairIdGanhadorVipEvento(embedLike) {
  const raw = getFieldValueStarts(embedLike, "🆔 ID do ganhador");
  const mention = raw.match(/<@!?(\d{10,25})>/);
  if (mention?.[1]) return mention[1];

  const code = raw.match(/`(\d{1,25})`/);
  if (code?.[1]) return code[1];

  const plain = raw.match(/\b(\d{1,25})\b/);
  return plain?.[1] || null;
}

async function enviarDmPagamentoSocialVip(client, userId, content) {
  if (!userId) return false;

  try {
    const user = await client.users.fetch(userId);
    await user.send({ content });
    return true;
  } catch {
    return false;
  }
}

async function marcarVipEventoComoPagoPorPagamentoSocial(client, vipEventoResolvido, interaction, descricao = PADRAO_INDEFINIDO) {
  if (!vipEventoResolvido?.ok || !vipEventoResolvido?.message?.embeds?.[0]) {
    return {
      ok: false,
      motivo: "Nenhum registro VIP vinculado.",
    };
  }

  const msgVip = vipEventoResolvido.message;
  const embedVip = EmbedBuilder.from(msgVip.embeds[0]);
  const fields = Array.isArray(embedVip.data.fields) ? [...embedVip.data.fields] : [];

  const pagamentoIdx = fields.findIndex((f) => String(f.name || "").startsWith("💸 Pagamento"));
  const pagamentoAtual = pagamentoIdx >= 0 ? String(fields[pagamentoIdx]?.value || "—") : "—";

  if (pagamentoAtual && pagamentoAtual !== "—") {
    return {
      ok: true,
      jaEstavaPago: true,
      motivo: "O registro VIP já estava marcado como pago.",
      url: msgVip.url,
    };
  }

  const reprovadoIdx = fields.findIndex((f) => String(f.name || "").startsWith("⛔ Reprovação"));
  if (reprovadoIdx >= 0 && /REPROVADO/i.test(String(fields[reprovadoIdx]?.value || ""))) {
    return {
      ok: false,
      motivo: "O registro VIP vinculado está reprovado.",
      url: msgVip.url,
    };
  }

  const linha = [
    `• **PAGO** por <@${interaction.user.id}> via **Pagamento Social**`,
    `• Descrição: ${descricao}`,
    `• Origem: ${interaction.message?.url || "registro de pagamento social"}`,
  ].join("\n");

  if (pagamentoIdx >= 0) {
    fields[pagamentoIdx].value = linha.slice(0, 1024);
  } else {
    fields.push({
      name: "💸 Pagamento",
      value: linha.slice(0, 1024),
      inline: false,
    });
  }

  embedVip.setFields(fields);

  await msgVip.edit({
    embeds: [embedVip],
    components: [],
  }).catch(() => null);

  const registranteId = extrairRegistranteVipEvento(embedVip);
  const ganhadorId = extrairIdGanhadorVipEvento(embedVip);

  if (registranteId) {
    await enviarDmPagamentoSocialVip(
      client,
      registranteId,
      `💸 Sua premiação **foi paga**!\n\n• Registro VIP: ${msgVip.url}\n• Marcado por: <@${interaction.user.id}>\n• ID do beneficiado: ${ganhadorId ? `\`${ganhadorId}\`` : "—"}\n• Origem: Pagamento Social\n\nQualquer coisa, fale **no seu chat da empresa**!`
    );
  }

  return {
    ok: true,
    jaEstavaPago: false,
    motivo: "Registro VIP marcado como pago automaticamente.",
    url: msgVip.url,
    registranteId,
    ganhadorId,
  };
}

function nomeVipEstaVazioOuGenerico(nome, organizacao = "") {
  const normalizar = (valor) =>
    String(valor || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[`*_]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const n = normalizar(nome);
  const org = normalizar(organizacao);

  return (
    !n ||
    n === "nao identificado" ||
    n === "nao informado" ||
    n === "-" ||
    n === "—" ||
    (org && n === org)
  );
}

function validarMesmoEventoOuDataParaAtualizarVip(vipInfo = {}, dadosPagamento = {}) {
  const eventoVip = normalizarBuscaVip(vipInfo.evento);
  const dataVip = normalizarBuscaVip(vipInfo.data);

  const eventoPagamento = normalizarBuscaVip(dadosPagamento.eventoNome);
  const dataPagamento = normalizarBuscaVip(dadosPagamento.eventoData);

  const mesmoEvento = eventoVip && eventoPagamento && eventoVip.includes(eventoPagamento);
  const mesmaData = dataVip && dataPagamento && dataVip.includes(dataPagamento);

  return Boolean(mesmoEvento || mesmaData);
}

async function atualizarNomeGanhadorNoVipEvento(client, vipEventoResolvido, dadosPagamento = {}) {
  if (!vipEventoResolvido?.ok || !vipEventoResolvido?.message?.embeds?.[0]) {
    return {
      ok: false,
      alterou: false,
      motivo: "Nenhum Registro VIP vinculado encontrado.",
    };
  }

  const nomePagamento = String(dadosPagamento.ganhadorNome || "").trim();
  const idPagamento = String(dadosPagamento.ganhadorId || "").replace(/\D/g, "").trim();

  if (!nomePagamento || nomePagamento === PADRAO_INDEFINIDO) {
    return {
      ok: false,
      alterou: false,
      motivo: "Pagamento Social sem nome válido para atualizar no VIP.",
    };
  }

  const msgVip = vipEventoResolvido.message;
  const embedVip = EmbedBuilder.from(msgVip.embeds[0]);
  const infoVip = vipEventoResolvido.info || extrairInfoDoEmbedVipEvento(embedVip);

  const idVip = String(infoVip.ganhadorId || "").replace(/\D/g, "").trim();

  if (idPagamento && idVip && idPagamento !== idVip) {
    return {
      ok: false,
      alterou: false,
      motivo: `ID diferente entre Pagamento Social (${idPagamento}) e VIP (${idVip}).`,
      url: msgVip.url,
    };
  }

  if (!validarMesmoEventoOuDataParaAtualizarVip(infoVip, dadosPagamento)) {
    return {
      ok: false,
      alterou: false,
      motivo: "Não atualizei porque não bateu mesmo evento ou mesma data.",
      url: msgVip.url,
    };
  }

if (!nomeVipEstaVazioOuGenerico(infoVip.ganhadorNome, infoVip.organizacao)) {
  return {
    ok: true,
    alterou: false,
    motivo: "O Registro VIP já tinha nome identificado.",
    url: msgVip.url,
  };
}
  const fields = Array.isArray(embedVip.data.fields) ? [...embedVip.data.fields] : [];
  const nomeIdx = fields.findIndex((f) => String(f.name || "").startsWith("👤 Nome do ganhador"));

  if (nomeIdx >= 0) {
    fields[nomeIdx] = {
      ...fields[nomeIdx],
      value: `\`${nomePagamento}\``,
    };
  } else {
    fields.push({
      name: "👤 Nome do ganhador",
      value: `\`${nomePagamento}\``,
      inline: true,
    });
  }

  embedVip.setFields(fields);

  await msgVip.edit({
    embeds: [embedVip],
    components: msgVip.components,
  }).catch(() => null);

  return {
    ok: true,
    alterou: true,
    motivo: "Nome do ganhador atualizado no Registro VIP.",
    url: msgVip.url,
    nome: nomePagamento,
    id: idPagamento || idVip || null,
  };
}

async function atualizarTipoPremiacaoNoVipEvento(client, vipEventoResolvido, categoriaPagamentoSocial, dadosPagamento = {}) {
  if (!vipEventoResolvido?.ok || !vipEventoResolvido?.message?.embeds?.[0]) {
    return {
      ok: false,
      alterou: false,
      motivo: "Nenhum Registro VIP vinculado encontrado.",
    };
  }

  const tipoDigitadoPagamentoSocial = String(dadosPagamento.tipoDigitadoPagamentoSocial || "").trim();

  if (!tipoDigitadoPagamentoSocial) {
    return {
      ok: false,
      alterou: false,
      motivo: "Pagamento Social sem tipo digitado. Não vou usar o tipo antigo do VIP para corrigir.",
    };
  }

  const categoriaFinal = normalizarTipoPremiacao(tipoDigitadoPagamentoSocial);

  if (!categoriaFinal) {
    return {
      ok: false,
      alterou: false,
      motivo: "Categoria do Pagamento Social inválida.",
    };
  }

  const msgVip = vipEventoResolvido.message;
  const embedVip = EmbedBuilder.from(msgVip.embeds[0]);
  const infoVip = vipEventoResolvido.info || extrairInfoDoEmbedVipEvento(embedVip);

  const idPagamento = String(dadosPagamento.ganhadorId || "").replace(/\D/g, "").trim();
  const idVip = String(infoVip.ganhadorId || "").replace(/\D/g, "").trim();

  if (idPagamento && idVip && idPagamento !== idVip) {
    return {
      ok: false,
      alterou: false,
      motivo: `Não atualizei o tipo porque o ID do Pagamento Social (${idPagamento}) é diferente do ID do VIP (${idVip}).`,
      url: msgVip.url,
    };
  }

  if (!validarMesmoEventoOuDataParaAtualizarVip(infoVip, dadosPagamento)) {
    return {
      ok: false,
      alterou: false,
      motivo: "Não atualizei o tipo porque não bateu mesmo evento ou mesma data.",
      url: msgVip.url,
    };
  }

  const categoriaAtualVip = normalizarTipoPremiacao(`${infoVip.tipo || ""} ${infoVip.premiacao || ""}`);

  if (categoriaAtualVip === categoriaFinal) {
    return {
      ok: true,
      alterou: false,
      motivo: "O Registro VIP já estava com o mesmo tipo do Pagamento Social.",
      url: msgVip.url,
      tipo: categoriaFinal,
    };
  }

  const fields = Array.isArray(embedVip.data.fields) ? [...embedVip.data.fields] : [];
  const tipoBonito = formatarTipoPremiacaoBonito(categoriaFinal);
  const premiacaoIdx = fields.findIndex((f) => String(f.name || "").startsWith("🎁 Premiação"));

  if (premiacaoIdx >= 0) {
    const valorAtual = String(fields[premiacaoIdx]?.value || "—");

    const linhas = valorAtual
      .split("\n")
      .map((linha) => linha.trim())
      .filter(Boolean);

    const linhasSemTipoAntigo = linhas.filter((linha, index) => {
      if (index !== 0) return true;

      const linhaNorm = normalizarTipoPremiacao(linha);
      return linhaNorm !== categoriaAtualVip;
    });

    fields[premiacaoIdx] = {
      ...fields[premiacaoIdx],
      value: [
        tipoBonito,
        "",
        ...linhasSemTipoAntigo,
      ].join("\n").slice(0, 1024),
    };
  } else {
    fields.push({
      name: "🎁 Premiação",
      value: tipoBonito,
      inline: false,
    });
  }

  const descAtual = String(embedVip.data.description || "");
  const descNovo = descAtual.replace(
    /(\*\*Tipo Identificado:\*\*\s*`)[^`]+(`)/i,
    `$1${categoriaFinal}$2`
  );

  embedVip.setDescription(descNovo);
  embedVip.setFields(fields);

  await msgVip.edit({
    embeds: [embedVip],
    components: msgVip.components,
  });

  return {
    ok: true,
    alterou: true,
    motivo: `Tipo do Registro VIP corrigido pelo Pagamento Social: ${categoriaAtualVip} → ${categoriaFinal}.`,
    url: msgVip.url,
    tipo: categoriaFinal,
    tipoAnterior: categoriaAtualVip,
  };
}

function getDadosPagamentoParaBuscarVip(embedLike) {
  const ganhadorRaw = getFieldValue(embedLike, "👤 Ganhador");
  const ganhadorParts = String(ganhadorRaw || "").split("|").map((p) => p.trim());

  return {
    eventoNome: getFieldValue(embedLike, "🏷️ Evento"),
    eventoData: getFieldValue(embedLike, "📅 Data do Evento"),
    ganhadorNome: ganhadorParts[0] || "",
    ganhadorId: ganhadorParts[1] || "",
    premiacao: getFieldValue(embedLike, "🔗 Premiação / Link"),
  };
}

function setCampoPagamento(fields, name, value, inline = false) {
  const idx = fields.findIndex((f) => f.name === name);
  const novo = { name, value, inline };

  if (idx >= 0) fields[idx] = novo;
  else fields.push(novo);
}

function categoriaEhVipOuPass(categoria) {
  const t = String(categoria || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return t.includes("vip") || t.includes("pass");
}

function removerCamposFinanceirosSeVip(fields, categoria) {
  if (!categoriaEhVipOuPass(categoria)) return fields;

  return fields.filter((f) => {
    const nome = String(f.name || "");
    return (
      nome !== "💰 Valor Identificado" &&
      nome !== "🧾 Nome no Comprovante"
    );
  });
}

async function tentarCorrigirRegistroPorVipEvento(client, embedBuilder) {
  const dados = getDadosPagamentoParaBuscarVip(embedBuilder);

  const vipEventoResolvido = await resolverVipEventoProfissional(
    client,
    dados.premiacao,
    dados
  ).catch(() => null);

  if (!vipEventoResolvido?.ok) {
    return {
      alterou: false,
      motivo: vipEventoResolvido?.erro || "Nenhum VIP Evento encontrado.",
    };
  }

  const info = vipEventoResolvido.info || {};
  const categoriaVip = normalizarTipoPremiacao(`${info.tipo || ""} ${info.premiacao || ""}`);

  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

const atualizacaoNomeVip = await atualizarNomeGanhadorNoVipEvento(
  client,
  vipEventoResolvido,
  dados
).catch(() => null);

setCampoPagamento(
  fields,
  "📎 Registro VIP vinculado",
  [
    `🔗 ${vipEventoResolvido.link?.url || "—"}`,
    atualizacaoNomeVip?.alterou
      ? `✅ Nome enviado para o VIP: \`${dados.ganhadorNome || PADRAO_INDEFINIDO}\``
      : `👤 Nome no VIP: \`${info.ganhadorNome || PADRAO_INDEFINIDO}\``,
    `🆔 ID no VIP: \`${info.ganhadorId || PADRAO_INDEFINIDO}\``,
  ].join("\n"),
  false
);

embedBuilder.setFields(fields);

  return {
    alterou: true,
    motivo: "Link do Registro VIP identificado e anexado ao pagamento.",
    categoriaVip,
    link: vipEventoResolvido.link?.url || null,
    vipEventoResolvido,
  };
}

function atualizarCampoOCRPagamento(embedBuilder, analiseComprovante) {
  const categoriaAtual = getTipoPagamentoFromEmbed(embedBuilder);

  if (categoriaEhVipOuPass(categoriaAtual)) {
    const data = embedBuilder.data ?? {};
    const fields = Array.isArray(data.fields) ? [...data.fields] : [];
    embedBuilder.setFields(removerCamposFinanceirosSeVip(fields, categoriaAtual));
    return embedBuilder;
  }

  const data = embedBuilder.data ?? {};
  const fields = Array.isArray(data.fields) ? [...data.fields] : [];

  function setField(name, value, inline = true) {
    const idx = fields.findIndex((f) => f.name === name);
    const novo = { name, value, inline };

    if (idx >= 0) fields[idx] = novo;
    else fields.push(novo);
  }

  if (analiseComprovante?.valorRaw) {
    setField("💰 Valor Identificado", `\`${analiseComprovante.valorRaw}\``, true);
  }

  if (analiseComprovante?.nomeRecebedor) {
    setField("🧾 Nome no Comprovante", `\`${analiseComprovante.nomeRecebedor}\``, true);
  }

  if (analiseComprovante?.horario) {
    setField(
      "🕒 Horário",
      `\`${analiseComprovante.horario}\` (${analiseComprovante.horarioFonte === "print" ? "print" : "registro"})`,
      true
    );
  }

  if (analiseComprovante?.data) {
    setField(
      "📅 Data",
      `\`${analiseComprovante.data}\` (${analiseComprovante.dataFonte === "print" ? "print" : "registro"})`,
      true
    );
  }

  embedBuilder.setFields(fields);
  return embedBuilder;
}

async function tentarReprocessarOCRRegistro(embedBuilder) {
  const categoriaAtual = getTipoPagamentoFromEmbed(embedBuilder);

  if (categoriaEhVipOuPass(categoriaAtual)) {
    return {
      alterou: false,
      motivo: "Registro VIP/Pass não precisa de OCR financeiro.",
    };
  }

  const premiacao = getPremiacaoLinkFromEmbed(embedBuilder);
  if (!premiacao) {
    return {
      alterou: false,
      motivo: "Sem link de premiação no embed.",
    };
  }

  const valorAtual = getFieldValue(embedBuilder, "💰 Valor Identificado");
  const nomeAtual = getFieldValue(embedBuilder, "🧾 Nome no Comprovante");

  const precisaReler =
    valorEhNaoIdentificado(valorAtual) ||
    valorEhNaoIdentificado(nomeAtual);

  if (!precisaReler) {
    return {
      alterou: false,
      motivo: "Valor e nome já estavam identificados.",
    };
  }

  const analiseComprovante = await analisarComprovantePagamento(premiacao).catch(() => null);

  if (!analiseComprovante) {
    return {
      alterou: false,
      motivo: "Falha ao analisar comprovante novamente.",
    };
  }

  const achouAlgo =
    Boolean(analiseComprovante.valorRaw) ||
    Boolean(analiseComprovante.nomeRecebedor) ||
    analiseComprovante.horarioFonte === "print" ||
    analiseComprovante.dataFonte === "print";

  if (!achouAlgo) {
    return {
      alterou: false,
      motivo: "Releitura feita, mas nada novo foi identificado.",
    };
  }

  atualizarCampoOCRPagamento(embedBuilder, analiseComprovante);

  return {
    alterou: true,
    motivo: "Releitura OCR atualizada.",
  };
}

// =============================
// Mover registros pelo filtro
// =============================
async function moverRegistrosPorFiltro(client, canal, filtro) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { movidos: 0, relidos: 0, atualizadosOCR: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => mensagemEhDoMesAtualSP(m))
    .filter((m) => {
      const t = m.embeds?.[0]?.title || "";
      return t.includes("Registro de Pagamento de Evento – SANTACREATORS");
    });

let movidos = 0;
let relidos = 0;
let atualizadosOCR = 0;
let corrigidosVIP = 0;

  for (const msg of lista) {
    const embedRaw = msg.embeds?.[0];
    if (!embedRaw) continue;

    const embedOriginal = EmbedBuilder.from(embedRaw);
    const statusValue = getStatusValueFromEmbed(embedOriginal);

    const ehSolicitado = /JÁ FOI SOLICITADO/i.test(statusValue);
    const ehAguardando = /Aguardando confirmação/i.test(statusValue);

    const ehPagoFinal = /✅\s*\*\*PAGO\*\*/i.test(statusValue);
    const ehReprovadoFinal = /❌\s*\*\*REPROVADO\*\*/i.test(statusValue);

    const entra =
      (filtro === "solicitados" && ehSolicitado) ||
      (filtro === "naoclicados" && ehAguardando);

    if (!entra) continue;

 relidos++;

const resultadoVip = await tentarCorrigirRegistroPorVipEvento(client, embedOriginal).catch(() => ({
  alterou: false,
  motivo: "Erro interno na correção VIP.",
}));

if (resultadoVip?.alterou) {
  corrigidosVIP++;
}

if (filtro === "naoclicados" && !resultadoVip?.alterou) {
  const resultadoReleitura = await tentarReprocessarOCRRegistro(embedOriginal).catch(() => ({
    alterou: false,
    motivo: "Erro interno na releitura OCR.",
  }));

  if (resultadoReleitura?.alterou) {
    atualizadosOCR++;
  }
}

    const msgNova = await canal.send({ embeds: [embedOriginal] }).catch(() => null);
    if (!msgNova) continue;

    if (ehPagoFinal || ehReprovadoFinal) {
      await msgNova.edit({ components: [] }).catch(() => {});
    } else {
      await msgNova.edit({ components: [criarRowStatus(msgNova.id)] }).catch(() => {});
    }

    await msg.delete().catch(() => {});
    movidos++;
  }

return { movidos, relidos, atualizadosOCR, corrigidosVIP };
}

// ============================================================================
// ✅ EXPORT 1: CHAMA NO READY
// ============================================================================
export async function pagamentoSocialOnReady(client) {
  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) return;

  // se já existe, garante que só fica 1
  const existente = await limparBotoesAntigos(client, canal).catch(() => null);
  if (existente) return;

  // se não existe, cria
  await canal.send({
    embeds: [criarEmbedMenu()],
    components: [criarRowMenu()],
  }).catch(() => {});

// Inicializa o Dashboard
await updateDashboard(client).catch(() => {});
}

// ============================================================================
// ✅ EXPORT 2: HANDLER DO ROTEADOR CENTRAL
// - Retorna true se a interação era nossa
// ============================================================================
export async function handlePagamentoSocial(interaction, client) {
  try {


    // ✅ ANTI DUPLICAÇÃO (dedupe)
    // =========================
    const isDup = await blockIfDuplicate(client, interaction, "PagamentoSocial");
    if (isDup) return true;
    // =========================
    // BOTÕES
    // =========================
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "pagamento_dash_atualizar") {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

const statsRefeitos = await reconstruirStatsPorEmbeds(client, 100).catch(() => null);

  await updateDashboard(client).catch(() => {});

  await interaction.editReply({
    content: statsRefeitos
      ? "✅ Dashboard recalculado pelos registros do canal e atualizado com sucesso!"
      : "⚠️ Dashboard atualizado, mas não consegui recalcular pelos registros do canal.",
  }).catch(() => {});

  return true;
}
      // ✅ BOTÃO CIDADES: adiciona botões Nobre/Santa/Grande/Maresia nos registros do mês atual
      if (id === "pagamento_filtro_cidades") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar o filtro de cidades.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.editReply({ content: "❌ Não achei o canal de pagamentos." }).catch(() => {});
          return true;
        }

        const { atualizados, ignorados } = await adicionarBotoesCidadeNosRegistrosDoMes(client, canal);

        await canal.send({
          embeds: [criarEmbedMenu()],
          components: [criarRowMenu()],
        }).catch(() => {});

        await limparBotoesAntigos(client, canal).catch(() => {});

        await interaction.editReply({
          content: [
            "✅ Botões de cidade aplicados nos registros do mês atual.",
            `🏙️ Registros atualizados: **${atualizados}**`,
            `↩️ Já tinham botão de cidade: **${ignorados}**`,
          ].join("\n"),
        }).catch(() => {});

        return true;
      }

      // ✅ FILTROS
      if (id.startsWith("pagamento_filtro_")) {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse filtro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const qual = id.replace("pagamento_filtro_", ""); // solicitados | naoclicados
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.followUp({ content: "❌ Não achei o canal.", ephemeral: true }).catch(() => {});
          return true;
        }

       const { movidos, relidos, atualizadosOCR, corrigidosVIP } = await moverRegistrosPorFiltro(client, canal, qual);

// repostar menu e limpar duplicados
await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
await limparBotoesAntigos(client, canal).catch(() => {});

logPagamento(
  client,
  interaction,
  "🔎 Filtro aplicado",
  [
    `Filtro: **${qual}**`,
    `Registros movidos: **${movidos}**`,
`Registros analisados: **${relidos || 0}**`,
`Corrigidos pelo VIP Evento: **${corrigidosVIP || 0}**`,
qual === "naoclicados" ? `OCR atualizados: **${atualizadosOCR || 0}**` : null,
  ].filter(Boolean).join("\n")
).catch(() => {});

await interaction.followUp({
  content: [
    `✅ Filtro aplicado: **${qual}**`,
    `📦 Registros movidos: **${movidos}**`,
`🔎 Registros analisados: **${relidos || 0}**`,
`💎 Corrigidos pelo VIP Evento: **${corrigidosVIP || 0}**`,
qual === "naoclicados" ? `💰 Registros atualizados pelo OCR: **${atualizadosOCR || 0}**` : null,
  ].filter(Boolean).join("\n"),
  ephemeral: true,
}).catch(() => {});
return true;
      }

      // ✅ ABRIR FORM
      if (id === "abrirform") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar este formulário.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId("form_pagamento")
          .setTitle("Pagamento Evento");

        const campos = [
          { id: "eventoInfo",  label: "Evento | Data",               exemplo: "Ex: Missão Rosa | 20/09",          style: TextInputStyle.Short },
          { id: "ganhador",    label: "Ganhador (Nome | ID)", exemplo: "Ex: Virtude | 12345", style: TextInputStyle.Short },
          { id: "tipoPremiacao", label: "Tipo (Vip Staff, Ouro, Pass...)", exemplo: "Ex: Vip Staff, Rolepass, Vip Evento...", style: TextInputStyle.Short },
          { id: "premiacao",   label: "Link da Premiação / Comprovante",     exemplo: "Cole o link da imagem ou comprovante aqui",               style: TextInputStyle.Paragraph },
        ];

        campos.forEach((c) =>
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(c.id)
                .setLabel(c.label)
                .setPlaceholder(c.exemplo)
                .setStyle(c.style)
                .setRequired(true)
            )
          )
        );

        await interaction.showModal(modal).catch((err) => {
          if (isUnknownInteraction(err)) return;
          throw err;
        });

        logPagamento(client, interaction, "🟣 Formulário aberto", `**Usuário:** <@${interaction.user.id}> abriu o formulário de pagamento.`)
          .catch(() => {});
        return true;
      }

      // ✅ CIDADE DO REGISTRO
      if (id.startsWith("cidade_pagamento__")) {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para marcar cidade nesse registro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const [, cidadeKey, messageId] = id.split("__");
        const cidade = CIDADES_PAGAMENTO[cidadeKey];

        if (!cidade) {
          await interaction.editReply({ content: "❌ Cidade inválida." }).catch(() => {});
          return true;
        }

        const registroMsg = interaction.message;
        const embedRaw = registroMsg?.embeds?.[0];

        if (!embedRaw) {
          await interaction.editReply({ content: "❌ Não achei o embed desse registro." }).catch(() => {});
          return true;
        }

        const cidadeJaDefinida = getCidadeKeyFromEmbed(embedRaw);

        if (cidadeJaDefinida) {
          const componentsSemCidades = removerRowsCidadePagamento(registroMsg);

          await registroMsg.edit({
            embeds: [EmbedBuilder.from(embedRaw)],
            components: componentsSemCidades,
          }).catch(() => {});

          await interaction.editReply({
            content: "⚠️ Esse registro já tem uma cidade marcada. Os botões foram removidos.",
          }).catch(() => {});

          return true;
        }

const embedAtualizado = atualizarCampoCidade(
  EmbedBuilder.from(embedRaw),
  cidadeKey,
  interaction.user.id
);

await tentarCorrigirRegistroPorVipEvento(client, embedAtualizado).catch(() => null);

        const componentsSemCidades = (registroMsg.components || [])
          .filter((row) => {
            return !row.components?.some((c) =>
              String(c.customId || "").startsWith("cidade_pagamento__")
            );
          })
          .map((row) => ActionRowBuilder.from(row));

        await registroMsg.edit({
          embeds: [embedAtualizado],
          components: componentsSemCidades,
        }).catch(() => {});

        await reconstruirStatsPorEmbeds(client, 100).catch(() => null);
        await updateDashboard(client).catch(() => {});

        await interaction.editReply({
          content: `✅ Cidade marcada como **${cidade.label}** nesse registro.`,
        }).catch(() => {});

        return true;
      }

      // ✅ STATUS (abre modal)
// formato: pago__{messageId} / solicitado__{messageId} / reprovado__{messageId}
if (id.startsWith("pago__") || id.startsWith("solicitado__") || id.startsWith("reprovado__")) {
  // ✅ só aprovadores (coord/mkt) + chefões
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.reply({ content: "🚫 Você não tem permissão para aprovar/reprovar registros.", ephemeral: true }).catch(() => {});
    return true;
  }

  const [action, messageId] = id.split("__");

  // ✅ TRAVA: não pode aprovar o próprio (a menos que seja chefão)
  try {
    const embedClicado = interaction.message?.embeds?.[0];
    const criadorId = getCriadorIdFromEmbed(embedClicado);
    const ehProprio = criadorId && criadorId === interaction.user.id;

    if (ehProprio && !podeAprovarProprio(interaction)) {
      await interaction.reply({
        content: "🚫 Você não pode aprovar/reprovar **o seu próprio registro**.",
        ephemeral: true,
      }).catch(() => {});

      // loga tentativa
      logPagamento(
        client,
        interaction,
        "⛔ Bloqueado: auto-aprovação",
        `Usuário tentou **${action.toUpperCase()}** o próprio registro.\nCriador: <@${criadorId}>\nMensagem: \`${messageId}\``
      ).catch(() => {});
      return true;
    }
  } catch {}

  const tituloModal =
    action === "pago" ? "Descrição do Pagamento" :
    action === "solicitado" ? "Detalhes do Solicitado" :
    "Motivo da Reprovação";

  const modal = new ModalBuilder()
    .setCustomId(`${action}_desc_${messageId}`)
    .setTitle(tituloModal)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("descricao")
          .setLabel("Descreva o motivo")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal).catch((err) => {
    if (isUnknownInteraction(err)) return;
    throw err;
  });

  const tituloLog =
    action === "pago" ? "✅ Pagamento em avaliação" :
    action === "solicitado" ? "📌 Já foi solicitado" :
    "❌ Reprovado";

 logPagamento(
  client,
  interaction,
  tituloLog,
  [
    `Usuário clicou em **${action.toUpperCase()}**`,
    buildLogContext({
      registroMsg: interaction.message,
      actionById: interaction.user.id,
      criadorId: getCriadorIdFromEmbed(interaction.message?.embeds?.[0]),
    }),
  ].join("\n"),
  interaction.message?.url
).catch(() => {});

  return true;
}


      return false;
    }

    // =========================
    // MODAL SUBMIT
    // =========================
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // ✅ CRIAR REGISTRO
      if (id === "form_pagamento") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({ content: "🚫 Você não tem permissão.", ephemeral: true }).catch(() => {});
          return true;
        }


        // =========================
  // ✅ TRAVA EXTRA (anti registro duplicado por “double submit”)
  // - segura 1 registro por usuário a cada X segundos
  // =========================
  if (!client.__SC_PAGAMENTO_SOCIAL_USERLOCK__) {
    client.__SC_PAGAMENTO_SOCIAL_USERLOCK__ = new Map(); // userId -> ts
  }
  {
    const now = Date.now();
    const last = client.__SC_PAGAMENTO_SOCIAL_USERLOCK__.get(interaction.user.id) || 0;
    const WIN = 6000; // 6s
    if (now - last < WIN) {
      try {
        await logPagamento(
          client,
          interaction,
          "🛑 Registro bloqueado (janela curta)",
          `Mesmo usuário tentou registrar 2x em menos de ${WIN / 1000}s.`
        );
      } catch {}

      // se já respondeu/deferiu em outro fluxo, só sai quieto
      try {
        await interaction.reply({ content: "🛑 Calma aí — já peguei teu envio. (anti duplicação)", ephemeral: true });
      } catch {}
      return true;
    }
    client.__SC_PAGAMENTO_SOCIAL_USERLOCK__.set(interaction.user.id, now);
  }


const eventoInfo = interaction.fields.getTextInputValue("eventoInfo").trim();
const [eventoNomeRaw, eventoDataRaw] = eventoInfo.split("|").map(s => s.trim());
let eventoNome = eventoNomeRaw || PADRAO_INDEFINIDO;

// Se não houver data após o |, a função normalizarDataEvento colocará a data de hoje
let eventoData = normalizarDataEvento(eventoDataRaw);

const { nome: ganhadorNomeRaw, id: ganhadorIdRaw } = parseNomeIdFlex(interaction.fields.getTextInputValue("ganhador"));

let premiacao = interaction.fields.getTextInputValue("premiacao").trim();

await interaction.deferReply({ ephemeral: true }).catch(() => {});

const vipEventoResolvido = await resolverVipEventoProfissional(
  client,
  premiacao,
  {
    eventoNome,
    eventoData,
    ganhadorNome: ganhadorNomeRaw,
    ganhadorId: ganhadorIdRaw,
  }
).catch((err) => ({
  ok: false,
  erro: err?.message || String(err),
}));

// Mantém exatamente o que foi preenchido no formulário.
// Se achar o VIP Evento, o sistema só adiciona o link vinculado no embed.

const agoraFallback = getAgoraSPParts();

const deveUsarOCR = !vipEventoResolvido?.ok;

const analiseComprovante = deveUsarOCR
  ? await analisarComprovantePagamento(premiacao).catch((err) => ({
      ok: false,
      url: extrairPrimeiraUrlImagem(premiacao),
      texto: "",
      valorRaw: null,
      valorNumero: 0,
      nomeRecebedor: null,
      horario: agoraFallback.horario,
      data: agoraFallback.data,
      horarioFonte: "registro",
      dataFonte: "registro",
      erro: err?.message || String(err),
    }))
  : {
      ok: true,
      url: vipEventoResolvido.link?.url || null,
      texto: "Dados importados do registro VIP por evento.",
      valorRaw: null,
      valorNumero: 0,
      nomeRecebedor: null,
      horario: agoraFallback.horario,
      data: agoraFallback.data,
      horarioFonte: "registro",
      dataFonte: "registro",
      erro: null,
    };

const ganhadorNome = corrigirNomeGanhadorPorOCR(ganhadorNomeRaw, analiseComprovante.nomeRecebedor);

const ganhadorId = ganhadorIdRaw;

const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.editReply({ content: "❌ Não achei o canal de pagamento." }).catch(() => {});
          return true;
        }

        const registrador = interaction.user;
        const registradorAvatar = registrador.displayAvatarURL({ dynamic: true });
const tipoDigitadoPagamentoSocial = interaction.fields.getTextInputValue("tipoPremiacao")?.trim() || "";

const tipoInputFallbackVip = [
  vipEventoResolvido?.info?.tipo || "",
  vipEventoResolvido?.info?.premiacao || "",
].join(" ");

const categoriaVip = normalizarTipoPremiacao(
  tipoDigitadoPagamentoSocial || tipoInputFallbackVip
);
const ocultarFinanceiro = esconderCamposFinanceiros(categoriaVip, analiseComprovante);

const camposRegistro = [
  { name: "🏷️ Evento", value: `${eventoNome || PADRAO_INDEFINIDO}`, inline: true },
  { name: "📅 Data do Evento", value: `${eventoData || PADRAO_INDEFINIDO}`, inline: true },
  {
    name: "🔗 Premiação / Link",
    value: `${premiacao || PADRAO_INDEFINIDO}`,
    inline: false,
  },
  { name: "👤 Ganhador", value: `${ganhadorNome} | ${ganhadorId}`, inline: true },
];

if (vipEventoResolvido?.ok) {
camposRegistro.push({
  name: "📎 Registro VIP vinculado",
  value: [
    `🔗 ${vipEventoResolvido.link?.url || "—"}`,
    `✅ Vinculado pelo sistema com evento/data conferidos.`,
  ].join("\n"),
  inline: false,
});
}
if (vipEventoResolvido?.ok) {
  await atualizarNomeGanhadorNoVipEvento(client, vipEventoResolvido, {
    eventoNome,
    eventoData,
    ganhadorNome,
    ganhadorId,
    premiacao,
  }).catch(() => null);

await atualizarTipoPremiacaoNoVipEvento(client, vipEventoResolvido, categoriaVip, {
  eventoNome,
  eventoData,
  ganhadorNome,
  ganhadorId,
  premiacao,
  tipoDigitadoPagamentoSocial,
}).catch((err) => {
  console.warn("[PagamentoSocial] Falha ao corrigir tipo do VIP Evento:", err?.message || err);
});
}
if (!ocultarFinanceiro) {
  camposRegistro.push(
    { name: "💰 Valor Identificado", value: analiseComprovante.valorRaw ? `\`${analiseComprovante.valorRaw}\`` : "`Não identificado`", inline: true },
    { name: "🧾 Nome no Comprovante", value: analiseComprovante.nomeRecebedor ? `\`${analiseComprovante.nomeRecebedor}\`` : "`Não identificado`", inline: true }
  );
}

camposRegistro.push(
  { name: "🕒 Horário", value: analiseComprovante.horario ? `\`${analiseComprovante.horario}\` (${analiseComprovante.horarioFonte === "print" ? "print" : "registro"})` : "`Não identificado`", inline: true },
  { name: "📅 Data", value: analiseComprovante.data ? `\`${analiseComprovante.data}\` (${analiseComprovante.dataFonte === "print" ? "print" : "registro"})` : "`Não identificada`", inline: true },

  // ✅ FIXO PRA TRAVA / AUDITORIA
  { name: "🆔 Criador do Registro", value: `<@${registrador.id}> (\`${registrador.id}\`)`, inline: false },

  { name: "📝 Registro", value: `Feito por <@${registrador.id}>`, inline: false },
  { name: "🏙️ Cidade / CDD", value: "`Não definida`", inline: false },
  { name: "📌 Status", value: "`Aguardando confirmação...`", inline: false },

  // ✅ vai ser preenchido quando aprovar/reprovar/solicitar
  { name: "🧑‍⚖️ Última decisão", value: "`—`", inline: false }
);

const embed = new EmbedBuilder()
  .setColor("#ff3399")
  .setAuthor({ name: `${registrador.tag} • Registro criado`, iconURL: registradorAvatar })
  .setTitle("🎉 Registro de Pagamento de Evento – SANTACREATORS")
  .setDescription(
    "📌 Registro obrigatório de pagamentos de eventos e ações especiais.\n\n" +
    `**Tipo Identificado:** \`${categoriaVip}\``
  )
  .addFields(camposRegistro)
  .setThumbnail(registradorAvatar)
  .setImage(
    "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66"
  )
  .setFooter({ text: "SantaCreators – Sistema Oficial de Registro" })
  .setTimestamp();


        const mensagem = await canal.send({ embeds: [embed] }).catch(() => null);
        if (!mensagem) {
          await interaction.editReply({ content: "❌ Falhei ao enviar o registro no canal." }).catch(() => {});
          return true;
        }

        await mensagem.edit({
  components: [
    criarRowStatus(mensagem.id),
    criarRowCidadesPagamento(mensagem.id),
  ],
}).catch(() => {});

        // reposta o menu e limpa duplicados
        await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
        await limparBotoesAntigos(client, canal).catch(() => {});

        // ✅ Atualiza as estatísticas de QUEM CRIOU e dispara o Dashboard
const stats = loadStats();
const creatorId = interaction.user.id;

stats.totalCreated = Number(stats.totalCreated || 0) + 1;

stats.creators[creatorId] = (stats.creators[creatorId] || 0) + 1;
stats.categories[categoriaVip] = (stats.categories[categoriaVip] || 0) + 1;

saveStats(stats);
        
        // Força a atualização do gráfico no canal 1505716526534103110
        await updateDashboard(client).catch(() => {});

        await interaction.editReply({ content: "✅ Registro criado!" }).catch(() => {});

        try {
  const pagamentoAt = dataEventoParaTimestampSP(eventoData, mensagem.createdTimestamp || Date.now());

  dashEmit("pagamento:criado", {
    __at: pagamentoAt,
    source: "pagamento_social",
    by: interaction.user.id,
    canal: CANAL_PAGAMENTO,
    messageId: mensagem.id,
    dataEvento: eventoData,
    dedupeKey: `pagamento_social:criado:${mensagem.id}`,
  });
} catch {}

logPagamento(
  client,
  interaction,
  vipEventoResolvido?.ok
    ? "🔗 Novo pagamento registrado via VIP Evento"
    : "📩 Novo pagamento registrado",
  [
    `**Evento:** \`${eventoNome || PADRAO_INDEFINIDO}\``,
    `**Data do Evento:** \`${eventoData || PADRAO_INDEFINIDO}\``,
    `**Ganhador:** \`${ganhadorNome} | ${ganhadorId}\``,
    `**Tipo:** \`${categoriaVip}\``,
`**Origem:** ${vipEventoResolvido?.ok ? "VIP Evento detectado automaticamente" : "Formulário / OCR"}`,
vipEventoResolvido?.ok
  ? `**Registro VIP encontrado:** ${vipEventoResolvido.link?.url || "—"}`
  : `**Comprovante:** ${analiseComprovante?.url || "—"}`,
    ``,
    buildLogContext({
      registroMsg: mensagem,
      criadorId: registrador.id,
    }),
  ].join("\n"),
  mensagem.url
).catch(() => {});


        return true;
      }

      // ✅ STATUS UPDATE
if (id.startsWith("pago_desc_") || id.startsWith("solicitado_desc_") || id.startsWith("reprovado_desc_")) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  // ✅ só aprovadores (coord/mkt) + chefões
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.followUp({
      content: "🚫 Você não tem permissão para aprovar/reprovar registros.",
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  const parts = id.split("_desc_");
  const action = parts[0]; // pago | solicitado | reprovado
  const messageId = parts.slice(1).join("_desc_"); // segura caso tenha underscore

  const descricao = interaction.fields.getTextInputValue("descricao")?.trim() || PADRAO_INDEFINIDO;

  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) {
    await interaction.editReply({ content: "❌ Não achei o canal." }).catch(() => {});
    return true;
  }

  const msgOriginal = await canal.messages.fetch(messageId).catch(() => null);
  if (!msgOriginal?.embeds?.[0]) {
    await interaction.editReply({ content: "❌ Não achei o embed desse registro." }).catch(() => {});
    return true;
  }

  const embedOriginal = EmbedBuilder.from(msgOriginal.embeds[0]);

  // ✅ TRAVA: não pode aprovar o próprio (a menos que seja chefão)
  try {
    const criadorId = getCriadorIdFromEmbed(embedOriginal);
    const ehProprio = criadorId && criadorId === interaction.user.id;

    if (ehProprio && !podeAprovarProprio(interaction)) {
      await interaction.followUp({
        content: "🚫 Você não pode aprovar/reprovar **o seu próprio registro**.",
        ephemeral: true,
      }).catch(() => {});

      logPagamento(
        client,
        interaction,
        "⛔ Bloqueado: auto-aprovação (submit)",
        `Usuário tentou **${action.toUpperCase()}** o próprio registro.\nCriador: <@${criadorId}>\nMensagem: \`${messageId}\``
      ).catch(() => {});
      return true;
    }
  } catch {}

  const statusTexto =
    action === "pago"
      ? `✅ **PAGO**\n💬 ${descricao}`
      : action === "solicitado"
        ? `📌 **JÁ FOI SOLICITADO**\n💬 ${descricao}`
        : `❌ **REPROVADO**\n💬 ${descricao}`;

  const cor =
    action === "pago" ? "Green"
      : action === "solicitado" ? "#f1c40f"
        : "Red";

  const labelAuditoria =
    action === "pago" ? "PAGO"
      : action === "solicitado" ? "SOLICITADO"
        : "REPROVADO";

  // ✅ agora escreve também quem fez a ação no próprio registro
const embedAtualizado = atualizarCampoStatus(
  embedOriginal,
  statusTexto,
  cor,
  interaction.user.id,
  labelAuditoria
);

const resultadoVip = await tentarCorrigirRegistroPorVipEvento(client, embedAtualizado).catch(() => null);

if (action === "pago") {
  const dadosVip = getDadosPagamentoParaBuscarVip(embedAtualizado);

  const vipEventoResolvidoPagamento =
    resultadoVip?.vipEventoResolvido ||
    await resolverVipEventoProfissional(
      client,
      dadosVip.premiacao,
      dadosVip
    ).catch(() => null);

  const resultadoPagamentoVip = await marcarVipEventoComoPagoPorPagamentoSocial(
    client,
    vipEventoResolvidoPagamento,
    interaction,
    descricao
  ).catch((err) => ({
    ok: false,
    motivo: err?.message || String(err),
  }));

  if (resultadoPagamentoVip?.ok) {
    setCampoPagamento(
      Array.isArray(embedAtualizado.data.fields) ? embedAtualizado.data.fields : [],
      "💎 VIP Evento",
      [
        resultadoPagamentoVip.jaEstavaPago
          ? "✅ O Registro VIP vinculado já estava pago."
          : "✅ Registro VIP vinculado marcado como pago automaticamente.",
        `🔗 ${resultadoPagamentoVip.url || "—"}`,
      ].join("\n"),
      false
    );

    embedAtualizado.setFields(embedAtualizado.data.fields);
  } else {
    setCampoPagamento(
      Array.isArray(embedAtualizado.data.fields) ? embedAtualizado.data.fields : [],
      "💎 VIP Evento",
      [
        "⚠️ Não consegui marcar o Registro VIP vinculado automaticamente.",
        `Motivo: \`${resultadoPagamentoVip?.motivo || "Não informado"}\``,
      ].join("\n"),
      false
    );

    embedAtualizado.setFields(embedAtualizado.data.fields);
  }
}

const msgNova = await canal.send({ embeds: [embedAtualizado] }).catch(() => null);
  if (!msgNova) {
    await interaction.editReply({ content: "❌ Falhei ao enviar a atualização." }).catch(() => {});
    return true;
  }

  // Se solicitado, mantém botões (pra depois virar pago/reprovado). Se pago/reprovado, remove botões.
  if (action === "solicitado") {
    await msgNova.edit({ components: [criarRowStatus(msgNova.id)] }).catch(() => {});
  } else {
    await msgNova.edit({ components: [] }).catch(() => {});
  }

  // apaga o original (ou deixa como movido)
  try {
    await msgOriginal.delete();
  } catch {
    await msgOriginal.edit({
      content: "🧾 Registro movido/atualizado (mensagem antiga).",
      components: [],
    }).catch(() => {});
  }

  // Se aprovado/reprovado/solicitado, recalcula estatísticas apenas pelos registros do mês atual
  // depois que a mensagem nova já existe e a antiga saiu do canal.
  if (["pago", "reprovado", "solicitado"].includes(action)) {
    await reconstruirStatsPorEmbeds(client, 100).catch(() => null);
    await updateDashboard(client).catch(() => {});
  }

  // reposta menu e limpa duplicados
  await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
  await limparBotoesAntigos(client, canal).catch(() => {});

  await interaction.editReply({ content: "✅ Atualizado e jogado pro final do chat!" }).catch(() => {});

  // ✅ EMITE EVENTO PRO GERALDASH (aqui!)
try {
  const map = {
    pago: "pagamento:pago",
    solicitado: "pagamento:solicitado",
    reprovado: "pagamento:reprovado",
  };

  const dataEventoEmbed =
    getFieldValue(embedOriginal, "📅 Data do Evento") ||
    getFieldValue(embedOriginal, "Data do Evento") ||
    getFieldValue(embedOriginal, "📆 Data") ||
    "";

  const pagamentoAt = dataEventoParaTimestampSP(
    dataEventoEmbed,
    msgOriginal.createdTimestamp || Date.now()
  );

  dashEmit(map[action] || "pagamento:status", {
    __at: pagamentoAt,
    source: "pagamento_social",
    by: interaction.user.id,
    action,
    canal: CANAL_PAGAMENTO,
    oldMessageId: msgOriginal.id,
    newMessageId: msgNova.id,
    dataEvento: dataEventoEmbed,
    dedupeKey: `pagamento_social:${action}:${msgOriginal.id}`,
  });
} catch {}

  const tituloLog =
    action === "pago" ? "💰 Pagamento confirmado"
      : action === "solicitado" ? "📌 Marcado como solicitado"
        : "🚫 Pagamento reprovado";

  logPagamento(
  client,
  interaction,
  tituloLog,
  [
    `**Motivo:**`,
    `\`\`\`${descricao}\`\`\``,
    ``,
    buildLogContext({
      registroMsg: msgNova,
      criadorId: getCriadorIdFromEmbed(embedOriginal),
      actionById: interaction.user.id,
    }),
  ].join("\n"),
  msgNova.url
).catch(() => {});


  return true;
}


      return false;
    }

    return false;
  } catch (err) {
    if (isUnknownInteraction(err)) return true; // Ignora erros de interação já respondida/expirada
    console.warn("Erro no sistema de pagamentos:", err);
    return true;
  }
}
