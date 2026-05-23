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
    .replace(/\s+/g, " ")
    .trim();

  const pareceDinheiro =
    /\bdinheiro\b/i.test(t) ||
    /\bgrana\b/i.test(t) ||
    /\bcash\b/i.test(t) ||
    /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?\b/.test(t) ||
    /\b\d+(?:[.,]\d+)?\s*(?:k|kk|m|mi|mil|milhao|milhoes)?\b/i.test(t);

  if (pareceDinheiro) return "Dinheiro";

  if (t.includes("staff")) return "VIP Staff";
  if (t.includes("rolepass")) return "Pass";
  if (t.includes("pass")) return "Pass";
  if (t.includes("ouro")) return "VIP Ouro";
  if (t.includes("vipevento") || t.includes("vip evento")) return "VIP Evento";
  if (t.includes("lancamento") || t.includes("lançamento")) return "VIP Lancamento";

  return "Dinheiro";
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
  const t = limparTextoOCR(texto);

  const matches = [...t.matchAll(/R\$\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:,[0-9]{2})?)/gi)];

  if (!matches.length) return null;

  const valores = matches
    .map((m) => {
      const raw = m[1].replace(/\s/g, ".");
      const numero = Number(raw.replace(/\./g, "").replace(",", "."));
      return {
        raw: `R$ ${raw}`,
        numero: Number.isFinite(numero) ? numero : 0,
      };
    })
    .filter((v) => v.numero > 0)
    .sort((a, b) => b.numero - a.numero);

  return valores[0] || null;
}

function parseHorarioOCR(texto) {
  const t = limparTextoOCR(texto);

  const padroesPrioritarios = [
    /Agora\s+mesmo\s*[•·\-\–\—:\s]*([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Agora\s+mesmo[\s\S]{0,40}?([0-2]?\d)\s*([0-5]\d)\b/i,

    /\b[0-3]?\d\s*[\/.\-]\s*[01]?\d\s*[\/.\-]\s*(?:20)?\d{2}\s+([0-2]?\d)\s*:\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?\b/i,
    /\b[0-3]?\d\s*[\/.\-]\s*[01]?\d\s*[\/.\-]\s*(?:20)?\d{2}\s+([0-2]?\d)\s*([0-5]\d)\b/i,

    /Transfer[eê]ncia\s+para[\s\S]{0,220}?([0-2]?\d)\s*:\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Transfer[eê]ncia[\s\S]{0,260}?([0-2]?\d)\s*:\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,

    /R\$\s*[0-9.\s]+[\s\S]{0,80}?([0-2]?\d)\s*:\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,

    /Pronto[\s\S]{0,320}?([0-2]?\d)\s*[hH:]\s*([0-5]\d)(?:\s*:\s*([0-5]\d))?/i,
    /Pronto[\s\S]{0,320}?([0-2]?\d)\s*([0-5]\d)\b/i,

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

  const mPara = t.match(/\bpara\s+(.+?)(?:\n|Agora\s+mesmo|R\$|$)/i);
  if (mPara?.[1]) {
    const nome = limparNomeRecebedorOCR(mPara[1]);
    if (nome) return nome;
  }

  const mTransferencia = t.match(/Transfer[eê]ncia\s+de\s+(.+?)(?:\n|R\$|$)/i);
  if (mTransferencia?.[1]) {
    const nome = limparNomeRecebedorOCR(mTransferencia[1]);
    if (nome) return nome;
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

async function reconhecerTextoPagamentoReforcado(worker, buffer) {
  const leituraNormal = await worker.recognize(buffer);
  const textoNormal = limparTextoOCR(leituraNormal?.data?.text || "");

  await worker.setParameters({
    tessedit_char_whitelist: "0123456789/:.-hH ",
    preserve_interword_spaces: "1",
  });

  const leituraDataHora = await worker.recognize(buffer);
  const textoDataHora = limparTextoOCR(leituraDataHora?.data?.text || "");

  await worker.setParameters({
    tessedit_char_whitelist: "",
    preserve_interword_spaces: "1",
  });

  return limparTextoOCR(
    [
      textoNormal,
      "",
      "=== OCR_DATA_HORA_REFORCADO ===",
      textoDataHora,
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
const bufferOCR = await prepararImagemParaOCR(bufferOriginal);

worker = await createWorker("por");

await worker.setParameters({
  preserve_interword_spaces: "1",
});

const texto = await reconhecerTextoPagamentoReforcado(worker, bufferOCR);

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

  if (msg) {
    await msg.edit({
      embeds: [embed],
      components: [criarRowDashboardPagamento()],
    }).catch(() => {});
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
      .setCustomId("filtro_solicitados")
      .setLabel("📌 Solicitados")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("filtro_naoclicados")
      .setLabel("🕗 Não clicados")
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
  const desc = embedLike?.description || embedLike?.data?.description || "";
  const match = String(desc).match(/Tipo Identificado:\s*`([^`]+)`/i);

  if (match?.[1]) {
    return normalizarTipoPremiacao(match[1]);
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

// =============================
// Mover registros pelo filtro
// =============================
async function moverRegistrosPorFiltro(client, canal, filtro) {
  const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!mensagens) return { movidos: 0 };

  const lista = [...mensagens.values()]
    .filter((m) => m.author?.id === client.user.id)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => {
      const t = m.embeds?.[0]?.title || "";
      return t.includes("Registro de Pagamento de Evento – SANTACREATORS");
    });

  let movidos = 0;

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

  return { movidos };
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

// Inicializa o Dashboard recalculando pelos registros existentes
await reconstruirStatsPorEmbeds(client, 100).catch(() => {});
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
      // ✅ FILTROS
      if (id.startsWith("filtro_")) {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar esse filtro.",
            ephemeral: true,
          }).catch(() => {});
          return true;
        }

        const qual = id.split("_")[1]; // solicitados | naoclicados
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.followUp({ content: "❌ Não achei o canal.", ephemeral: true }).catch(() => {});
          return true;
        }

        const { movidos } = await moverRegistrosPorFiltro(client, canal, qual);

        // repostar menu e limpar duplicados
        await canal.send({ embeds: [criarEmbedMenu()], components: [criarRowMenu()] }).catch(() => {});
        await limparBotoesAntigos(client, canal).catch(() => {});

        logPagamento(client, interaction, "🔎 Filtro aplicado", `Filtro: **${qual}**\nRegistros movidos: **${movidos}**`)
          .catch(() => {});

        await interaction.followUp({
          content: `✅ Filtro aplicado: **${qual}**\n📦 Registros movidos: **${movidos}**`,
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
        const eventoNome = eventoNomeRaw || PADRAO_INDEFINIDO;
        
        // Se não houver data após o |, a função normalizarDataEvento colocará a data de hoje
        const eventoData = normalizarDataEvento(eventoDataRaw);

        const { nome: ganhadorNomeRaw, id: ganhadorId } = parseNomeIdFlex(interaction.fields.getTextInputValue("ganhador"));

const premiacao = interaction.fields.getTextInputValue("premiacao").trim();

await interaction.deferReply({ ephemeral: true }).catch(() => {});

const agoraFallback = getAgoraSPParts();

const analiseComprovante = await analisarComprovantePagamento(premiacao).catch((err) => ({
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
}));

const ganhadorNome = corrigirNomeGanhadorPorOCR(ganhadorNomeRaw, analiseComprovante.nomeRecebedor);

const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
        if (!canal || !canal.isTextBased()) {
          await interaction.editReply({ content: "❌ Não achei o canal de pagamento." }).catch(() => {});
          return true;
        }

        const registrador = interaction.user;
        const registradorAvatar = registrador.displayAvatarURL({ dynamic: true });
        
        const tipoInput = interaction.fields.getTextInputValue("tipoPremiacao");
const categoriaVip = normalizarTipoPremiacao(tipoInput);

const ocultarFinanceiro = esconderCamposFinanceiros(categoriaVip, analiseComprovante);

const camposRegistro = [
  { name: "🏷️ Evento", value: `${eventoNome || PADRAO_INDEFINIDO}`, inline: true },
  { name: "📅 Data do Evento", value: `${eventoData || PADRAO_INDEFINIDO}`, inline: true },
  { name: "🔗 Premiação / Link", value: `${premiacao || PADRAO_INDEFINIDO}`, inline: false },
  { name: "👤 Ganhador", value: `${ganhadorNome} | ${ganhadorId}`, inline: true },
];

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

        await mensagem.edit({ components: [criarRowStatus(mensagem.id)] }).catch(() => {});

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
  dashEmit("pagamento:criado", {
    __at: Date.now(),
    by: interaction.user.id,
    canal: CANAL_PAGAMENTO,
  });
} catch {}

        logPagamento(
  client,
  interaction,
  "📩 Novo pagamento registrado",
  [
    `**Evento:** \`${eventoNome || PADRAO_INDEFINIDO}\``,
    `**Data do Evento:** \`${eventoData || PADRAO_INDEFINIDO}\``,
    `**Ganhador:** \`${ganhadorNome} | ${ganhadorId}\``,
    `**Premiação:** Link`,
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
  
  // Se aprovado/reprovado/solicitado, atualiza estatísticas e dashboard
if (["pago", "reprovado", "solicitado"].includes(action)) {
    const stats = loadStats();
const creatorId = getCriadorIdFromEmbed(embedOriginal);
const tipoRaw = embedOriginal.data.description?.match(/Tipo Identificado:\s*`(.+?)`/)?.[1] || "Outros";

const valorIdentificadoRaw = getFieldValue(embedOriginal, "💰 Valor Identificado");
const valorIdentificado = parseValorOCR(valorIdentificadoRaw)?.numero || 0;

const catKey = normalizarTipoPremiacao(tipoRaw);

if (action === "pago") {
  stats.totalApproved = Number(stats.totalApproved || 0) + 1;
  stats.totalAmountPaid = Number(stats.totalAmountPaid || 0) + valorIdentificado;

  stats.approvers[interaction.user.id] = (stats.approvers[interaction.user.id] || 0) + 1;

  stats.categoriesApproved[catKey] = (stats.categoriesApproved[catKey] || 0) + 1;
  stats.amountsByCategory[catKey] = Number(stats.amountsByCategory[catKey] || 0) + valorIdentificado;

  if (creatorId) {
    stats.amountsByCreator[creatorId] = Number(stats.amountsByCreator[creatorId] || 0) + valorIdentificado;
  }

  stats.amountsByApprover[interaction.user.id] = Number(stats.amountsByApprover[interaction.user.id] || 0) + valorIdentificado;
}

if (action === "reprovado") {
  stats.totalRejected = Number(stats.totalRejected || 0) + 1;

  stats.rejecters[interaction.user.id] = (stats.rejecters[interaction.user.id] || 0) + 1;
  stats.categoriesRejected[catKey] = (stats.categoriesRejected[catKey] || 0) + 1;
}

if (action === "solicitado") {
  stats.totalRequested = Number(stats.totalRequested || 0) + 1;

  stats.requesters[interaction.user.id] = (stats.requesters[interaction.user.id] || 0) + 1;
  stats.categoriesRequested[catKey] = (stats.categoriesRequested[catKey] || 0) + 1;
}

saveStats(stats);
await updateDashboard(client).catch(() => {});
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
    dashEmit(map[action] || "pagamento:status", {
      __at: Date.now(),
      by: interaction.user.id,
      action,
      canal: CANAL_PAGAMENTO,
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
