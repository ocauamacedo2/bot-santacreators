// ./application/events/pagamentosocial.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
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

// Canal onde o bot do Quiz envia as solicitações automáticas.
const CANAL_PENDENCIAS_QUIZ_PAGAMENTO = "1518707314901651576";

// Senha compartilhada entre os dois bots.
const QUIZ_PAYMENT_BRIDGE_SECRET =
  String(process.env.SC_QUIZ_PAYMENT_BRIDGE_SECRET || "").trim();

// Persistência para impedir criação duplicada.
const QUIZ_PAYMENT_BRIDGE_STATE_FILE = path.join(
  process.cwd(),
  "data",
  "quiz_payment_bridge_state.json"
);

// Canal onde o sistema vipEvento.js posta os registros de VIP por evento
const CANAL_VIP_EVENTO = "1414718336826081330";
const PAGAMENTO_PRESERVAR_DADOS_ORIGINAIS_VIP = true;
const PAGAMENTO_VIP_EM_ANDAMENTO = new Set();

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
malta: {
  label: "Malta",
  roleId: "1379022050403815454",
  emoji: "🏝️",
},
};

const CIDADE_PAGAMENTO_POR_LINK_DISCORD = {
  "755203021490749530:1135417544862347357": "nobre",
  "690983940567334964:1135340708799193128": "santa",
  "788905600699858944:1399498294639595690": "grande",
  "798594785896038401:1135417626663854080": "maresia",
};

// Canal de logs (auditoria) do sistema de pagamentos
// ⚠️ Troca aqui pelo teu canal de logs real, se for outro.
const CANAL_LOG_PAGAMENTO = "1486084352403312843";
const CANAL_LOG_VARREDURA_PAGAMENTOS = "1523099386052214874";

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
// ✅ Mesma permissão de aprovação/reprovação do registroManager.js
const CARGOS_PODE_APROVAR = [
  "1262262852949905409", // resp influ
  "1435325004471336990", // tier 3
  "1508258904826445944", // tier 4
  "1388976314253312100", // coord creators
  "1352408327983861844", // resp creators
  "1352407252216184833", // resp lider
  "1262262852949905408", // owner
  "660311795327828008",  // você
];

// ✅ Mesma exceção de autoaprovação do registroManager.js
const SELF_APPROVE_ALLOWED = {
  userIds: new Set([
    "660311795327828008", // você (garantia)
  ]),
  roleIds: new Set([
    "1262262852949905409", // resp influ
    "1435325004471336990", // tier 3
    "1508258904826445944", // tier 4
    "1352408327983861844", // resp creators
    "1262262852949905408", // owner
  ]),
};

// ✅ Mesmo bypass total do registroManager.js
// Ignora hierarquia + bloqueio de decisão no próprio registro
const PAGAMENTO_GLOBAL_BYPASS = {
  userIds: new Set([
    "660311795327828008", // você
  ]),
  roleIds: new Set([
    "1352408327983861844", // resp creators
    "1262262852949905408", // owner
  ]),
};

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

function temPermissaoPagamentoMensagem(message) {
  const hasRole = message.member?.roles?.cache?.some((r) => ALLOWED_IDS.includes(r.id)) ?? false;
  const hasUser = ALLOWED_IDS.includes(message.author?.id);
  return hasRole || hasUser;
}

function temPermissaoAprovacao(interaction) {
  return _hasAnyRole(interaction, CARGOS_PODE_APROVAR) ||
    CARGOS_PODE_APROVAR.includes(interaction.user.id);
}

function podeAprovarProprio(interaction) {
  if (SELF_APPROVE_ALLOWED.userIds.has(String(interaction.user.id))) return true;

  for (const rid of SELF_APPROVE_ALLOWED.roleIds) {
    if (interaction.member?.roles?.cache?.has(rid)) return true;
  }

  return false;
}

function hasPagamentoGlobalBypass(member, userId) {
  try {
    if (PAGAMENTO_GLOBAL_BYPASS.userIds.has(String(userId))) return true;

    for (const rid of PAGAMENTO_GLOBAL_BYPASS.roleIds) {
      if (member?.roles?.cache?.has(rid)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

function cannotApprovePagamentoByHierarchy(approverMember, targetMember) {
  try {
    if (!approverMember || !targetMember) return false;

    const approverHighest = approverMember.roles.highest;
    if (!approverHighest) return false;

    for (const role of targetMember.roles.cache.values()) {
      if (role.position >= approverHighest.position) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function validarHierarquiaDecisaoPagamento(interaction, criadorId, action) {
  const ehDecisaoFinal = action === "pago" || action === "reprovado";
  if (!ehDecisaoFinal || !criadorId) return { ok: true };

  const bypass = hasPagamentoGlobalBypass(
    interaction.member,
    interaction.user.id
  );

  const ehProprio =
    String(criadorId) === String(interaction.user.id);

  const selfApproveAllowed =
    ehProprio &&
    podeAprovarProprio(interaction);

  if (!bypass && !selfApproveAllowed) {
    const criadorMember = await interaction.guild?.members
      ?.fetch(String(criadorId))
      .catch(() => null);

    if (criadorMember) {
      const bloqueadoPorHierarquia =
        cannotApprovePagamentoByHierarchy(
          interaction.member,
          criadorMember
        );

      if (bloqueadoPorHierarquia) {
        return {
          ok: false,
          motivo: "hierarquia",
          mensagem:
            "❌ Você não pode aprovar/reprovar este registro porque o criador possui **cargo igual ou superior** ao seu.",
        };
      }
    }
  }

  if (ehProprio && !bypass && !selfApproveAllowed) {
    return {
      ok: false,
      motivo: "proprio",
      mensagem:
        "❌ Você **não pode aprovar/reprovar** o seu próprio registro.",
    };
  }

  return { ok: true };
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
  t.includes("lancamento") ||
  t.includes("lançamento") ||
  t.includes("lancamnto") ||
  t.includes("lançamento")
) return "VIP Lancamento";

if (pareceDinheiro) return "Dinheiro";

if (
  t.includes("evento") ||
  t.includes("vipevento") ||
  t.includes("vip evento")
) return "VIP Evento";

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
    /\.(png|jpe?g|webp|gif)(\?|&|$)/i.test(u) ||
    /[?&]format=(png|jpe?g|webp|gif)/i.test(u) ||
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

  const PADRAO_NUMERO =
    String.raw`[0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]{1,2})?|[0-9]{4,15}(?:,[0-9]{1,2})?`;

  const candidatos = [];

  function normalizarCandidatoValor(rawOriginal) {
    let bruto = String(rawOriginal || "")
      .trim()
      .replace(/[Oo]/g, "0")
      .replace(/\s+/g, ".")
      .replace(/[^\d.,]/g, "")
      .replace(/\.{2,}/g, ".");

    bruto = bruto
      .replace(/^[.,]+/, "")
      .replace(/[.,]+$/, "");

    if (!bruto) return null;

    const temPonto = bruto.includes(".");
    const temVirgula = bruto.includes(",");

    let parteInteira = bruto;
    let parteDecimal = "";

    if (temPonto && temVirgula) {
      const ultimoPonto = bruto.lastIndexOf(".");
      const ultimaVirgula = bruto.lastIndexOf(",");

      if (ultimaVirgula > ultimoPonto) {
        parteInteira = bruto
          .slice(0, ultimaVirgula)
          .replace(/\./g, "")
          .replace(/,/g, "");

        parteDecimal = bruto
          .slice(ultimaVirgula + 1)
          .replace(/\D/g, "")
          .slice(0, 2);
      } else {
        parteInteira = bruto
          .slice(0, ultimoPonto)
          .replace(/[.,]/g, "");

        const possivelDecimal = bruto
          .slice(ultimoPonto + 1)
          .replace(/\D/g, "");

        if (possivelDecimal.length <= 2) {
          parteDecimal = possivelDecimal;
        } else {
          parteInteira = bruto.replace(/[.,]/g, "");
        }
      }
    } else if (temVirgula) {
      const partes = bruto.split(",");

      if (
        partes.length === 2 &&
        partes[1].length >= 1 &&
        partes[1].length <= 2
      ) {
        parteInteira = partes[0].replace(/\D/g, "");
        parteDecimal = partes[1].replace(/\D/g, "").slice(0, 2);
      } else {
        parteInteira = bruto.replace(/,/g, "").replace(/\D/g, "");
      }
    } else if (temPonto) {
      const grupos = bruto.split(".").filter(Boolean);
      const todosMilhares =
        grupos.length > 1 &&
        grupos.slice(1).every((grupo) => grupo.length === 3);

      if (todosMilhares) {
        parteInteira = grupos.join("");
      } else if (
        grupos.length === 2 &&
        grupos[1].length >= 1 &&
        grupos[1].length <= 2
      ) {
        parteInteira = grupos[0].replace(/\D/g, "");
        parteDecimal = grupos[1].replace(/\D/g, "").slice(0, 2);
      } else {
        parteInteira = grupos.join("");
      }
    } else {
      parteInteira = bruto.replace(/\D/g, "");
    }

    parteInteira = parteInteira.replace(/^0+(?=\d)/, "");

    if (!parteInteira) return null;
    if (parteInteira.length > 15) return null;

    const numeroTexto = parteDecimal
      ? `${parteInteira}.${parteDecimal}`
      : parteInteira;

    const numero = Number(numeroTexto);

    if (!Number.isFinite(numero)) return null;
    if (numero < 1000) return null;

    const inteiroFormatado = Math.trunc(numero).toLocaleString("pt-BR");

    const decimalFormatado =
      parteDecimal && Number(parteDecimal) > 0
        ? `,${parteDecimal.padEnd(2, "0")}`
        : "";

    return {
      chave: numero.toFixed(2),
      raw: `R$ ${inteiroFormatado}${decimalFormatado}`,
      numero,
      bruto,
    };
  }

  function adicionarCandidato(rawOriginal, pontos, origem, contexto = "") {
    const normalizado = normalizarCandidatoValor(rawOriginal);

    if (!normalizado) return;

    const contextoNormalizado = String(contexto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    let score = Number(pontos || 0);

    if (contextoNormalizado.includes("r$")) score += 45;
    if (contextoNormalizado.includes("valor")) score += 30;
    if (contextoNormalizado.includes("pronto")) score += 15;
    if (contextoNormalizado.includes("transferencia")) score += 15;
    if (contextoNormalizado.includes("para")) score += 8;

    if (
      /\b(?:agora|mesmo|enviamos|transferencia|comprovante|pagamento)\b/i.test(
        contextoNormalizado
      )
    ) {
      score += 8;
    }

    const quantidadeGruposMilhar =
      String(normalizado.bruto).match(/[.\s]\d{3}/g)?.length || 0;

    if (quantidadeGruposMilhar >= 1) score += 10;
    if (quantidadeGruposMilhar >= 2) score += 8;

    const digitosInteiros = String(Math.trunc(normalizado.numero)).length;

    if (digitosInteiros >= 5 && digitosInteiros <= 10) {
      score += 8;
    }

    if (digitosInteiros >= 12) {
      score -= 20;
    }

    candidatos.push({
      ...normalizado,
      score,
      origem,
      contexto: String(contexto || "").trim(),
    });
  }

  const linhas = t
    .split(/\n+/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  for (let indice = 0; indice < linhas.length; indice++) {
    const linhaAnterior = linhas[indice - 1] || "";
    const linhaAtual = linhas[indice] || "";
    const linhaSeguinte = linhas[indice + 1] || "";

    const blocoContexto = [
      linhaAnterior,
      linhaAtual,
      linhaSeguinte,
    ].join(" ");

    const padroesLinha = [
      {
        regex: new RegExp(
          String.raw`R\$\s*(${PADRAO_NUMERO})`,
          "gi"
        ),
        pontos: 120,
        origem: "r$",
      },
      {
        regex: new RegExp(
          String.raw`\bValor\s*[:\-]?\s*(${PADRAO_NUMERO})`,
          "gi"
        ),
        pontos: 105,
        origem: "valor",
      },
      {
        regex: new RegExp(
          String.raw`\b(?:enviamos|enviado|pagamento|transfer[eê]ncia)\b[\s\S]{0,100}?R?\$?\s*(${PADRAO_NUMERO})`,
          "gi"
        ),
        pontos: 80,
        origem: "contexto-pagamento",
      },
      {
        regex: new RegExp(
          String.raw`\b(${PADRAO_NUMERO})\b`,
          "gi"
        ),
        pontos: 20,
        origem: "numero-solto",
      },
    ];

    for (const padrao of padroesLinha) {
      for (const match of linhaAtual.matchAll(padrao.regex)) {
        adicionarCandidato(
          match[1],
          padrao.pontos,
          padrao.origem,
          blocoContexto
        );
      }
    }
  }

  const padroesBloco = [
    {
      regex: new RegExp(
        String.raw`\bPronto[\s\S]{0,220}?R?\$?\s*(${PADRAO_NUMERO})`,
        "gi"
      ),
      pontos: 80,
      origem: "bloco-pronto",
    },
    {
      regex: new RegExp(
        String.raw`\bTransfer[eê]ncia[\s\S]{0,260}?R?\$?\s*(${PADRAO_NUMERO})`,
        "gi"
      ),
      pontos: 75,
      origem: "bloco-transferencia",
    },
  ];

  for (const padrao of padroesBloco) {
    for (const match of t.matchAll(padrao.regex)) {
      const inicio = Math.max(0, Number(match.index || 0) - 80);
      const fim = Math.min(
        t.length,
        Number(match.index || 0) + String(match[0] || "").length + 80
      );

      adicionarCandidato(
        match[1],
        padrao.pontos,
        padrao.origem,
        t.slice(inicio, fim)
      );
    }
  }

  if (!candidatos.length) return null;

  const agrupados = new Map();

  for (const candidato of candidatos) {
    const atual = agrupados.get(candidato.chave) || {
      raw: candidato.raw,
      numero: candidato.numero,
      scoreTotal: 0,
      ocorrencias: 0,
      origensFortes: 0,
      melhorScoreIndividual: 0,
      exemplos: [],
    };

    atual.scoreTotal += candidato.score;
    atual.ocorrencias += 1;
    atual.melhorScoreIndividual = Math.max(
      atual.melhorScoreIndividual,
      candidato.score
    );

    if (
      candidato.origem === "r$" ||
      candidato.origem === "valor" ||
      candidato.origem === "contexto-pagamento"
    ) {
      atual.origensFortes += 1;
    }

    if (atual.exemplos.length < 3) {
      atual.exemplos.push({
        origem: candidato.origem,
        contexto: candidato.contexto,
      });
    }

    agrupados.set(candidato.chave, atual);
  }

  const valores = [...agrupados.values()]
    .map((item) => {
      const bonusRepeticao =
        Math.min(item.ocorrencias, 8) * 28;

      const bonusFontesFortes =
        Math.min(item.origensFortes, 5) * 22;

      const penalidadeIsoladoGigante =
        item.numero >= 1_000_000_000 &&
        item.ocorrencias === 1 &&
        item.origensFortes === 0
          ? 120
          : 0;

      const confianca =
        item.scoreTotal +
        bonusRepeticao +
        bonusFontesFortes +
        item.melhorScoreIndividual -
        penalidadeIsoladoGigante;

      return {
        ...item,
        confianca,
      };
    })
    .sort((a, b) => {
      if (b.confianca !== a.confianca) {
        return b.confianca - a.confianca;
      }

      if (b.ocorrencias !== a.ocorrencias) {
        return b.ocorrencias - a.ocorrencias;
      }

      if (b.origensFortes !== a.origensFortes) {
        return b.origensFortes - a.origensFortes;
      }

      return b.numero - a.numero;
    });

  const escolhido = valores[0];

  if (!escolhido) return null;

  console.log("[PAGAMENTO OCR] Valor escolhido por confiança:", {
    raw: escolhido.raw,
    numero: escolhido.numero,
    confianca: escolhido.confianca,
    ocorrencias: escolhido.ocorrencias,
    origensFortes: escolhido.origensFortes,
    candidatosEncontrados: valores.slice(0, 5).map((item) => ({
      raw: item.raw,
      numero: item.numero,
      confianca: item.confianca,
      ocorrencias: item.ocorrencias,
      origensFortes: item.origensFortes,
    })),
  });

  return {
    raw: escolhido.raw,
    numero: escolhido.numero,
  };
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
          width: 2600,
          withoutEnlargement: false,
        })
        .grayscale()
        .normalize()
        .linear(1.35, -10)
        .sharpen()
        .png()
        .toBuffer()
        .catch(() => null);

      if (blocoCentral) variacoes.push(blocoCentral);

      const blocoComprovantePicpay = await sharp(buffer)
        .extract({
          left: Math.floor(largura * 0.04),
          top: Math.floor(altura * 0.24),
          width: Math.floor(largura * 0.92),
          height: Math.floor(altura * 0.42),
        })
        .resize({
          width: 3000,
          withoutEnlargement: false,
        })
        .grayscale()
        .normalize()
        .linear(1.65, -32)
        .sharpen()
        .png()
        .toBuffer()
        .catch(() => null);

      if (blocoComprovantePicpay) variacoes.push(blocoComprovantePicpay);
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
  const date = new Date();
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const now = new Date(utc + (3600000 * -3));
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

const SOCIAL_DASH_LOCK_MAX_MS = 2 * 60 * 1000;
let SOCIAL_DASH_LOCK = false;
let SOCIAL_DASH_LOCK_TS = 0;

function resetSocialDashLockIfStuck(force = false) {
  if (!SOCIAL_DASH_LOCK) return false;

  const travado = Date.now() - Number(SOCIAL_DASH_LOCK_TS || 0) > SOCIAL_DASH_LOCK_MAX_MS;

  if (force || travado) {
    SOCIAL_DASH_LOCK = false;
    SOCIAL_DASH_LOCK_TS = 0;
    console.warn("[PAGAMENTO_SOCIAL_DASH] lock resetado", { force, travado });
    return true;
  }

  return false;
}

async function sincronizarDashboardSocial(client, motivo = "manual", options = {}) {
  const { forceUnlock = false, recreate = false } = options;

  resetSocialDashLockIfStuck(forceUnlock);

  if (SOCIAL_DASH_LOCK) {
    return {
      ok: false,
      locked: true,
      message: "Já existe uma atualização do Social Mídias rodando.",
    };
  }

  SOCIAL_DASH_LOCK = true;
  SOCIAL_DASH_LOCK_TS = Date.now();

  try {
    console.log("[PAGAMENTO_SOCIAL_DASH] inicio", { motivo, recreate });

    if (recreate) {
      saveJSON_Dash(DASH_STATE_FILE, { messagesByMonth: {} });
    }

    const stats = await reconstruirStatsPorEmbeds(client, 30000);

    if (!stats) {
      throw new Error("Não consegui reconstruir os dados pelos embeds do canal de pagamentos.");
    }

    console.log("[PAGAMENTO_SOCIAL_DASH] reconstruido", {
      totalCreated: stats?.totalCreated,
      totalApproved: stats?.totalApproved,
      totalRejected: stats?.totalRejected,
      totalRequested: stats?.totalRequested,
    });

    await updateDashboard(client, stats);

    console.log("[PAGAMENTO_SOCIAL_DASH] dashboard editado/enviado", { motivo });

    return {
      ok: true,
      stats,
      message: "Dashboard Social Mídias sincronizado com sucesso.",
    };
  } catch (err) {
    console.error("[PAGAMENTO_SOCIAL_DASH] erro", err);
    return {
      ok: false,
      error: err?.message || String(err),
      message: "Falha ao sincronizar Dashboard Social Mídias.",
    };
  } finally {
    SOCIAL_DASH_LOCK = false;
    SOCIAL_DASH_LOCK_TS = 0;
  }
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

async function updateDashboard(client, statsAtualizados = null) {
  const stats = statsAtualizados || loadStats();
  const channel = await client.channels.fetch(CANAL_DASHBOARD_PAGAMENTO).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.warn("[PAGAMENTO_SOCIAL_DASH] canal do dashboard não encontrado", {
      canal: CANAL_DASHBOARD_PAGAMENTO,
    });
    return;
  }

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
  const editado = await msg.edit({
    embeds: [embed],
    components: [criarRowDashboardPagamento()],
  }).catch(() => null);

  if (editado) {
    state.messagesByMonth[stats.month] = editado.id;
    saveJSON_Dash(DASH_STATE_FILE, state);
    return;
  }

  // ✅ Se o bot mudou e não consegue editar a mensagem antiga,
  // cria uma nova mensagem do dashboard com o bot atual.
  delete state.messagesByMonth[stats.month];
  saveJSON_Dash(DASH_STATE_FILE, state);
}

const newMsg = await channel.send({
  embeds: [embed],
  components: [criarRowDashboardPagamento()],
}).catch(() => null);

if (newMsg) {
  state.messagesByMonth[stats.month] = newMsg.id;
  saveJSON_Dash(DASH_STATE_FILE, state);
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

function getTextoCompletoRegistroPagamento(message) {
  const embed = message?.embeds?.[0];
  if (!embed) return String(message?.content || "");

  const data = embed.data || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];

  return [
    message?.content || "",
    data.title || "",
    data.description || "",
    data.footer?.text || "",
    ...fields.flatMap((field) => [field.name || "", field.value || ""]),
  ].join("\n");
}

function getCidadeKeyPorLinkDiscord(texto = "") {
  const links = [...String(texto || "").matchAll(/discord\.com\/channels\/(\d+)\/(\d+)(?:\/\d+)?/gi)];

  for (const match of links) {
    const guildId = match[1];
    const channelId = match[2];
    const cityKey = CIDADE_PAGAMENTO_POR_LINK_DISCORD[`${guildId}:${channelId}`];

    if (cityKey && CIDADES_PAGAMENTO[cityKey]) return cityKey;
  }

  return null;
}

function getCidadeKeyPorCamposSeguros(embedRaw) {
  const data = embedRaw?.data || embedRaw || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];

  const camposSeguros = fields.filter((field) => {
    const nome = String(field.name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    return (
      nome.includes("cidade") ||
      nome.includes("cdd") ||
      nome.includes("premiacao") ||
      nome.includes("premiação") ||
      nome.includes("link")
    );
  });

  const texto = camposSeguros.map((field) => String(field.value || "")).join("\n");

  for (const [cidadeKey, cidade] of Object.entries(CIDADES_PAGAMENTO)) {
    const normalizado = texto
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (texto.includes(cidade.roleId)) return cidadeKey;
    if (new RegExp(`\\b${cidadeKey}\\b`, "i").test(normalizado)) return cidadeKey;
    if (new RegExp(`\\b${cidade.label.toLowerCase()}\\b`, "i").test(normalizado)) return cidadeKey;
  }

  return null;
}

function detectarCidadeAutomaticaPagamento(message) {
  const embedRaw = message?.embeds?.[0];
  if (!embedRaw) return null;

  const cidadeJaDefinida = getCidadeKeyFromEmbed(embedRaw);
  if (cidadeJaDefinida) return null;

  const textoCompleto = getTextoCompletoRegistroPagamento(message);

  return (
    getCidadeKeyPorLinkDiscord(textoCompleto) ||
    getCidadeKeyPorCamposSeguros(embedRaw) ||
    null
  );
}

async function autoMarcarCidadePagamentoMensagem(client, message, motivo = "auto") {
  if (!message?.embeds?.[0]) return false;

  const cidadeKey = detectarCidadeAutomaticaPagamento(message);
  if (!cidadeKey) return false;

  const embedAtualizado = atualizarCampoCidade(
    EmbedBuilder.from(message.embeds[0]),
    cidadeKey,
    client.user.id
  );

  const componentsSemCidades = removerRowsCidadePagamento(message);

  await message.edit({
    embeds: [embedAtualizado],
    components: componentsSemCidades,
  }).catch(() => null);

  return true;
}

async function atualizarRegistroPagamentoAntigoNaMesmaMensagem(client, msg) {
  if (!msg?.embeds?.[0]) {
    return {
      alterou: false,
      cidade: false,
      ocr: false,
      motivo: "Sem embed.",
    };
  }

  const titulo = msg.embeds[0]?.title || "";
  if (!titulo.includes("Registro de Pagamento de Evento")) {
    return {
      alterou: false,
      cidade: false,
      ocr: false,
      motivo: "Não é registro de pagamento.",
    };
  }

  const embedBuilder = EmbedBuilder.from(msg.embeds[0]);

  let alterou = false;
  let cidadeAlterada = false;
  let ocrAlterado = false;

  const cidadeKey = detectarCidadeAutomaticaPagamento(msg);

  if (cidadeKey && CIDADES_PAGAMENTO[cidadeKey]) {
    atualizarCampoCidade(embedBuilder, cidadeKey, client.user.id);
    cidadeAlterada = true;
    alterou = true;
  }

  const resultadoOCR = await tentarReprocessarOCRRegistro(embedBuilder, msg).catch(() => ({
    alterou: false,
    motivo: "Erro interno na releitura OCR.",
  }));

  if (resultadoOCR?.alterou) {
    ocrAlterado = true;
    alterou = true;
  }

  if (!alterou) {
    return {
      alterou: false,
      cidade: false,
      ocr: false,
      motivo: "Nada para atualizar.",
    };
  }

  const cidadeFinal = getCidadeKeyFromEmbed(embedBuilder);

  const componentsAtualizados = cidadeFinal
    ? removerRowsCidadePagamento(msg)
    : [
        criarRowStatus(msg.id),
        criarRowCidadesPagamento(msg.id),
      ];

  await msg.edit({
    embeds: [embedBuilder],
    components: componentsAtualizados,
  }).catch(() => null);

  return {
    alterou: true,
    cidade: cidadeAlterada,
    ocr: ocrAlterado,
    motivo: "Mensagem antiga editada sem recriar.",
  };
}

async function varreduraPesadaPagamentosEditandoMesmoBotao(client, limiteBusca = 5000, callbacks = {}) {
  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) {
    return {
      lidos: 0,
      encontrados: 0,
      atualizados: 0,
      cidades: 0,
      ocr: 0,
      erros: 0,
      atual: "Canal não encontrado.",
    };
  }

  let lidos = 0;
  let encontrados = 0;
  let atualizados = 0;
  let cidades = 0;
  let ocr = 0;
  let erros = 0;
  let lastId = undefined;
  let ultimoUpdate = 0;
  let atual = "Iniciando leitura dos registros antigos...";

  const totalALer = Math.min(Number(limiteBusca || 5000), 50000);

  async function emitirProgresso(force = false) {
    const agora = Date.now();

    if (!force && agora - ultimoUpdate < 5000) return;
    ultimoUpdate = agora;

    if (typeof callbacks.onProgress === "function") {
      await callbacks.onProgress({
        lidos,
        encontrados,
        atualizados,
        cidades,
        ocr,
        erros,
        limite: totalALer,
        atual,
      }).catch(() => {});
    }
  }

  await emitirProgresso(true);

  while (lidos < totalALer) {
    const remaining = totalALer - lidos;
    const fetchLimit = Math.min(100, remaining);

    const batch = await canal.messages.fetch({
      limit: fetchLimit,
      before: lastId,
    }).catch(() => null);

    if (!batch || batch.size === 0) break;

    for (const msg of batch.values()) {
      lidos++;

      if (msg.author?.id !== client.user.id) continue;
      if (!msg.embeds?.[0]) continue;

      const titulo = msg.embeds[0]?.title || "";
      if (!titulo.includes("Registro de Pagamento de Evento")) continue;

      encontrados++;
      atual = `Analisando registro ${msg.id}`;

      await emitirProgresso(false);

      const resultado = await atualizarRegistroPagamentoAntigoNaMesmaMensagem(client, msg).catch((err) => {
        erros++;
        atual = `Erro no registro ${msg.id}: ${err?.message || err}`;
        return null;
      });

      if (!resultado?.alterou) continue;

      atualizados++;
      if (resultado.cidade) cidades++;
      if (resultado.ocr) ocr++;

      atual = `Editado registro ${msg.id}`;

      if (typeof callbacks.onEditLog === "function") {
        await callbacks.onEditLog({
          msg,
          resultado,
          lidos,
          encontrados,
          atualizados,
          cidades,
          ocr,
          erros,
          limite: totalALer,
        }).catch(() => {});
      }

      await emitirProgresso(true);
      await new Promise(resolve => setTimeout(resolve, 900));
    }

    lastId = batch.last()?.id;

    if (!lastId) break;
    if (batch.size < fetchLimit) break;
  }

  atual = "Varredura finalizada.";

  const final = {
    lidos,
    encontrados,
    atualizados,
    cidades,
    ocr,
    erros,
    limite: totalALer,
    atual,
  };

  if (typeof callbacks.onProgress === "function") {
    await callbacks.onProgress(final).catch(() => {});
  }

  return final;
}

async function iniciarVarreduraPesadaPagamentosSegundoPlano(client, avisoMsg, limiteBusca = 30000, origem = "manual", contexto = {}) {
  const canalLog = await client.channels.fetch(CANAL_LOG_VARREDURA_PAGAMENTOS).catch(() => null);

  if (client.__SC_PAGAMENTOS_VARREDURA_RODANDO__) {
    await avisoMsg.edit({
      content: "⚠️ Já existe uma varredura de pagamentos rodando agora. Aguarde finalizar antes de iniciar outra.",
    }).catch(() => {});
    return false;
  }

  client.__SC_PAGAMENTOS_VARREDURA_RODANDO__ = true;

  const iniciadoEm = Date.now();
  const solicitanteId = contexto?.userId || "desconhecido";
  const comandoTexto = contexto?.comando || origem;
  const canalOrigemId = contexto?.canalId || avisoMsg.channel?.id || "desconhecido";

  let painelLogMsg = null;

  const embedInicio = new EmbedBuilder()
    .setColor("#ff3399")
    .setTitle("🔎 Varredura pesada de pagamentos iniciada")
    .setDescription("O sistema começou a revisar registros antigos e editar os botões na própria mensagem.")
    .addFields(
      { name: "👤 Solicitante", value: solicitanteId !== "desconhecido" ? `<@${solicitanteId}>` : "`desconhecido`", inline: true },
      { name: "📌 Origem", value: `\`${origem}\``, inline: true },
      { name: "📦 Limite", value: `\`${limiteBusca}\``, inline: true },
      { name: "💬 Comando", value: `\`${comandoTexto}\``, inline: false },
      { name: "📍 Canal de origem", value: canalOrigemId !== "desconhecido" ? `<#${canalOrigemId}>` : "`desconhecido`", inline: true },
      { name: "🕒 Iniciado em", value: `<t:${Math.floor(iniciadoEm / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: "SantaCreators • Logs de Varredura de Pagamentos" })
    .setTimestamp();

  if (canalLog?.isTextBased()) {
    painelLogMsg = await canalLog.send({ embeds: [embedInicio] }).catch(() => null);
  }

  async function atualizarPainel(status = {}) {
    const percentual = status.limite
      ? Math.min(100, Math.floor((Number(status.lidos || 0) / Number(status.limite || 1)) * 100))
      : 0;

    const barraCheia = "█".repeat(Math.floor(percentual / 10));
    const barraVazia = "░".repeat(10 - Math.floor(percentual / 10));

    const textoPainel = [
      "🔎 **Varredura pesada de pagamentos em andamento.**",
      "",
      `📌 **Origem:** \`${origem}\``,
      `👤 **Solicitante:** ${solicitanteId !== "desconhecido" ? `<@${solicitanteId}>` : "`desconhecido`"}`,
      `📦 **Limite:** \`${status.limite || limiteBusca}\` registros`,
      "",
      `📊 **Progresso:** \`${barraCheia}${barraVazia}\` **${percentual}%**`,
      "",
      `📖 **Mensagens lidas:** \`${status.lidos || 0}\``,
      `🔘 **Registros encontrados:** \`${status.encontrados || 0}\``,
      `🛠️ **Registros editados:** \`${status.atualizados || 0}\``,
      `🏙️ **Cidades corrigidas:** \`${status.cidades || 0}\``,
      `🧾 **OCR atualizado:** \`${status.ocr || 0}\``,
      `⚠️ **Erros:** \`${status.erros || 0}\``,
      "",
      `📍 **Atual:** ${status.atual ? `\`${String(status.atual).slice(0, 140)}\`` : "`aguardando...`"}`,
      "",
      "⏳ Vou editar os registros antigos na própria mensagem, sem recriar botão.",
    ].join("\n");

    await avisoMsg.edit({ content: textoPainel }).catch(() => {});

    if (painelLogMsg) {
      const embedProgresso = EmbedBuilder.from(embedInicio)
        .setTitle("🔎 Varredura pesada de pagamentos — em andamento")
        .setFields(
          { name: "👤 Solicitante", value: solicitanteId !== "desconhecido" ? `<@${solicitanteId}>` : "`desconhecido`", inline: true },
          { name: "📌 Origem", value: `\`${origem}\``, inline: true },
          { name: "📦 Limite", value: `\`${status.limite || limiteBusca}\``, inline: true },
          { name: "📊 Progresso", value: `\`${barraCheia}${barraVazia}\` **${percentual}%**`, inline: false },
          { name: "📖 Lidos", value: `\`${status.lidos || 0}\``, inline: true },
          { name: "🔘 Encontrados", value: `\`${status.encontrados || 0}\``, inline: true },
          { name: "🛠️ Editados", value: `\`${status.atualizados || 0}\``, inline: true },
          { name: "🏙️ Cidades", value: `\`${status.cidades || 0}\``, inline: true },
          { name: "🧾 OCR", value: `\`${status.ocr || 0}\``, inline: true },
          { name: "⚠️ Erros", value: `\`${status.erros || 0}\``, inline: true },
          { name: "📍 Atual", value: `\`${String(status.atual || "aguardando...").slice(0, 900)}\``, inline: false },
          { name: "🕒 Iniciado em", value: `<t:${Math.floor(iniciadoEm / 1000)}:F>`, inline: true }
        )
        .setTimestamp();

      await painelLogMsg.edit({ embeds: [embedProgresso] }).catch(() => {});
    }
  }

  await atualizarPainel({
    lidos: 0,
    encontrados: 0,
    atualizados: 0,
    cidades: 0,
    ocr: 0,
    erros: 0,
    limite: limiteBusca,
    atual: "Preparando varredura...",
  });

  setTimeout(async () => {
    try {
      const res = await varreduraPesadaPagamentosEditandoMesmoBotao(client, limiteBusca, {
        onProgress: atualizarPainel,

        onEditLog: async ({ msg, resultado, lidos, encontrados, atualizados, cidades, ocr, erros, limite }) => {
          if (!canalLog?.isTextBased()) return;

          const embedEdit = new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("🛠️ Registro antigo editado")
            .setDescription("Um registro antigo foi atualizado na própria mensagem.")
            .addFields(
              { name: "🔗 Registro", value: msg.url || "`sem link`", inline: false },
              { name: "🆔 Message ID", value: `\`${msg.id}\``, inline: true },
              { name: "🏙️ Cidade corrigida", value: resultado?.cidade ? "`sim`" : "`não`", inline: true },
              { name: "🧾 OCR atualizado", value: resultado?.ocr ? "`sim`" : "`não`", inline: true },
              { name: "📊 Progresso", value: `Lidos: \`${lidos}\` • Encontrados: \`${encontrados}\` • Editados: \`${atualizados}\` / Limite: \`${limite}\``, inline: false },
              { name: "📌 Totais", value: `Cidades: \`${cidades}\` • OCR: \`${ocr}\` • Erros: \`${erros}\``, inline: false },
              { name: "🕒 Editado em", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: "SantaCreators • Log individual de edição" })
            .setTimestamp();

          await canalLog.send({ embeds: [embedEdit] }).catch(() => {});
        },
      });

      const finalContent = [
        "✅ **Varredura pesada de pagamentos finalizada.**",
        "",
        `📖 **Mensagens lidas:** \`${res.lidos || 0}\``,
        `🔘 **Registros encontrados:** \`${res.encontrados || 0}\``,
        `🛠️ **Registros editados:** \`${res.atualizados || 0}\``,
        `🏙️ **Cidades corrigidas:** \`${res.cidades || 0}\``,
        `🧾 **OCR atualizado:** \`${res.ocr || 0}\``,
        `⚠️ **Erros:** \`${res.erros || 0}\``,
        "",
        "🗑️ Esta mensagem será apagada automaticamente em **10 minutos**.",
      ].join("\n");

      await avisoMsg.edit({ content: finalContent }).catch(() => {});

      if (painelLogMsg) {
        const embedFinal = new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("✅ Varredura pesada de pagamentos finalizada")
          .setDescription("A revisão dos registros antigos terminou.")
          .addFields(
            { name: "👤 Solicitante", value: solicitanteId !== "desconhecido" ? `<@${solicitanteId}>` : "`desconhecido`", inline: true },
            { name: "📌 Origem", value: `\`${origem}\``, inline: true },
            { name: "💬 Comando", value: `\`${comandoTexto}\``, inline: false },
            { name: "📖 Mensagens lidas", value: `\`${res.lidos || 0}\``, inline: true },
            { name: "🔘 Registros encontrados", value: `\`${res.encontrados || 0}\``, inline: true },
            { name: "🛠️ Registros editados", value: `\`${res.atualizados || 0}\``, inline: true },
            { name: "🏙️ Cidades corrigidas", value: `\`${res.cidades || 0}\``, inline: true },
            { name: "🧾 OCR atualizado", value: `\`${res.ocr || 0}\``, inline: true },
            { name: "⚠️ Erros", value: `\`${res.erros || 0}\``, inline: true },
            { name: "🕒 Iniciado em", value: `<t:${Math.floor(iniciadoEm / 1000)}:F>`, inline: true },
            { name: "🏁 Finalizado em", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          )
          .setFooter({ text: "SantaCreators • Logs de Varredura de Pagamentos" })
          .setTimestamp();

        await painelLogMsg.edit({ embeds: [embedFinal] }).catch(() => {});
      }

      setTimeout(() => {
        avisoMsg.delete().catch(() => {});
      }, 10 * 60 * 1000);
    } catch (err) {
      console.error("[PAGAMENTO_SOCIAL] Erro na varredura pesada manual:", err);

      await avisoMsg.edit({
        content: "❌ A varredura pesada deu erro. Veja o console do bot.",
      }).catch(() => {});
    } finally {
      client.__SC_PAGAMENTOS_VARREDURA_RODANDO__ = false;
    }
  }, 1000);

  return true;
}

async function autoMarcarCidadesPendentesPagamento(client, limiteBusca = 500) {
  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) return 0;

  let totalEditados = 0;
  let mensagensTotal = [];
  let lastId = undefined;
  const totalALer = Math.min(Number(limiteBusca || 500), 1000);

  while (mensagensTotal.length < totalALer) {
    const remaining = totalALer - mensagensTotal.length;
    const fetchLimit = Math.min(100, remaining);
    const batch = await canal.messages.fetch({ limit: fetchLimit, before: lastId }).catch(() => null);

    if (!batch || batch.size === 0) break;

    mensagensTotal.push(...batch.values());
    lastId = batch.last()?.id;

    if (!lastId) break;
    if (batch.size < fetchLimit) break;
  }

  for (const msg of mensagensTotal) {
    if (msg.author?.id !== client.user.id) continue;
    if (!msg.embeds?.[0]) continue;

    const titulo = msg.embeds[0]?.title || "";
    if (!titulo.includes("Registro de Pagamento de Evento")) continue;

    const editou = await autoMarcarCidadePagamentoMensagem(client, msg, "auto:varredura").catch(() => false);
    if (editou) totalEditados++;
  }

  return totalEditados;
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
// ===================================================================
// PONTE AUTOMÁTICA — QUIZ → PAGAMENTOS
// ===================================================================

const QUIZ_CITY_PREFIXES = {
  NB: "nobre",
  NBR: "nobre",
  NOBRE: "nobre",

  ST: "santa",
  STA: "santa",
  SANTA: "santa",

  MRS: "maresia",
  MARESIA: "maresia",

  GRD: "grande",
  GRANDE: "grande",

  MLT: "malta",
  MALTA: "malta",
};

function loadQuizPaymentBridgeState() {
  try {
    if (!fs.existsSync(QUIZ_PAYMENT_BRIDGE_STATE_FILE)) {
      return {
        processedKeys: {},
      };
    }

    const raw = fs.readFileSync(QUIZ_PAYMENT_BRIDGE_STATE_FILE, "utf8");
    const json = JSON.parse(raw);

    return {
      processedKeys:
        json?.processedKeys && typeof json.processedKeys === "object"
          ? json.processedKeys
          : {},
    };
  } catch (error) {
    console.error(
      "[QUIZ_PAYMENT_BRIDGE] Erro ao carregar persistência:",
      error
    );

    return {
      processedKeys: {},
    };
  }
}

function saveQuizPaymentBridgeState(state) {
  try {
    fs.mkdirSync(path.dirname(QUIZ_PAYMENT_BRIDGE_STATE_FILE), {
      recursive: true,
    });

    const tempPath = `${QUIZ_PAYMENT_BRIDGE_STATE_FILE}.tmp`;

    fs.writeFileSync(
      tempPath,
      JSON.stringify(state, null, 2),
      "utf8"
    );

    fs.renameSync(tempPath, QUIZ_PAYMENT_BRIDGE_STATE_FILE);
  } catch (error) {
    console.error(
      "[QUIZ_PAYMENT_BRIDGE] Erro ao salvar persistência:",
      error
    );
  }
}

function normalizeQuizNicknamePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseQuizWinnerDisplayName(displayName) {
  const original = normalizeQuizNicknamePart(displayName);

  const parts = original
    .split("|")
    .map(normalizeQuizNicknamePart)
    .filter(Boolean);

  let gameId = null;
  let gameIdIndex = -1;

  for (let index = parts.length - 1; index >= 0; index--) {
    if (/^\d+$/.test(parts[index])) {
      gameId = parts[index];
      gameIdIndex = index;
      break;
    }
  }

  let cityKey = null;
  let cityPrefix = null;

  if (parts.length >= 2) {
    const firstPart = parts[0]
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (QUIZ_CITY_PREFIXES[firstPart]) {
      cityPrefix = firstPart;
      cityKey = QUIZ_CITY_PREFIXES[firstPart];
    }
  }

  let name = original;

  if (gameIdIndex >= 0) {
    if (gameIdIndex >= 1) {
      name = parts[gameIdIndex - 1];
    }
  } else if (cityPrefix && parts.length >= 2) {
    name = parts[1];
  } else if (parts.length === 2) {
    name = parts[0];
  } else if (parts.length >= 1) {
    name = parts[parts.length - 1];
  }

  return {
    original,
    parts,
    name: normalizeQuizNicknamePart(name) || PADRAO_INDEFINIDO,
    gameId,
    cityKey,
    cityPrefix,
  };
}

async function inferQuizWinnerCityByRoles(guild, discordUserId) {
  if (!guild || !discordUserId) {
    return {
      cityKey: null,
      matches: [],
    };
  }

  const member = await guild.members.fetch(discordUserId).catch(() => null);

  if (!member) {
    return {
      cityKey: null,
      matches: [],
    };
  }

  const matches = Object.entries(CIDADES_PAGAMENTO)
    .filter(([, city]) => {
      return city.roleId && member.roles.cache.has(city.roleId);
    })
    .map(([cityKey]) => cityKey);

  return {
    cityKey: matches.length === 1 ? matches[0] : null,
    matches,
  };
}

function extractQuizBridgePayload(message) {
  const content = String(message?.content || "");

  const match = content.match(
    /```SC_QUIZ_PAYMENT_BRIDGE_V1\s*([\s\S]*?)\s*([a-f0-9]{64})\s*```/i
  );

  if (!match) {
    return {
      ok: false,
      reason: "Mensagem não possui o marcador da ponte.",
    };
  }

  const payloadBase64 = String(match[1] || "").trim();
  const signatureReceived = String(match[2] || "").trim().toLowerCase();

  if (!payloadBase64 || !signatureReceived) {
    return {
      ok: false,
      reason: "Payload ou assinatura ausente.",
    };
  }

  let payloadText;

  try {
    payloadText = Buffer.from(payloadBase64, "base64").toString("utf8");
  } catch {
    return {
      ok: false,
      reason: "Payload Base64 inválido.",
    };
  }

  if (!QUIZ_PAYMENT_BRIDGE_SECRET) {
    return {
      ok: false,
      reason: "SC_QUIZ_PAYMENT_BRIDGE_SECRET não configurada.",
    };
  }

  const signatureExpected = crypto
    .createHmac("sha256", QUIZ_PAYMENT_BRIDGE_SECRET)
    .update(payloadText)
    .digest("hex");

  const expectedBuffer = Buffer.from(signatureExpected, "hex");
  const receivedBuffer = Buffer.from(signatureReceived, "hex");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return {
      ok: false,
      reason: "Assinatura inválida.",
    };
  }

  let payload;

  try {
    payload = JSON.parse(payloadText);
  } catch {
    return {
      ok: false,
      reason: "JSON da ponte inválido.",
    };
  }

  if (
    payload?.version !== 1 ||
    payload?.source !== "santa_creators_quiz"
  ) {
    return {
      ok: false,
      reason: "Origem da solicitação inválida.",
    };
  }

  return {
    ok: true,
    payload,
  };
}

function quizPaymentDedupeKey(payload, payment, paymentIndex) {
  return [
    payload.resetKey,
    payload.discordUserId,
    payload.position,
    paymentIndex,
    payment.tipo,
    payment.premiacao,
  ].join(":");
}

function quizCityLabel(cityKey) {
  return CIDADES_PAGAMENTO[cityKey]?.label || PADRAO_INDEFINIDO;
}

async function sendQuizPaymentPending(client, payload, parsedName, reason) {
  const channel = await client.channels
    .fetch(CANAL_PENDENCIAS_QUIZ_PAGAMENTO)
    .catch(() => null);

  if (!channel?.isTextBased()) return null;

  const cityFromName = parsedName.cityKey
    ? quizCityLabel(parsedName.cityKey)
    : "Não identificada";

  return channel.send({
    content: `<@${payload.discordUserId}>`,
    embeds: [
      new EmbedBuilder()
        .setColor("#f39c12")
        .setTitle("⚠️ Pagamento do Quiz aguardando informação")
        .setDescription(
          [
            `O pagamento de **${payload.positionLabel}** ainda não foi criado.`,
            "",
            `**Motivo:** ${reason}`,
            "",
            `👤 **Discord:** <@${payload.discordUserId}>`,
            `🏷️ **Apelido encontrado:** \`${payload.displayName}\``,
            `📝 **Nome interpretado:** \`${parsedName.name}\``,
            `🆔 **ID interpretado:** \`${parsedName.gameId || "Não encontrado"}\``,
            `🏙️ **Cidade interpretada:** \`${cityFromName}\``,
            `🎁 **Premiação:** \`${payload.rewardText}\``,
            "",
            "Ajuste o apelido da pessoa com o ID numérico e, se necessário, informe a cidade.",
            "",
            "Exemplos válidos:",
            "`Enrico | 1541`",
            "`NB | Enrico | 1541`",
            "`ST | Enrico | 1541`",
            "`MRS | Enrico | 1541`",
            "`GRD | Enrico | 1541`",
            "`MLT | Enrico | 1541`",
          ].join("\n")
        )
        .setFooter({
          text: `QUIZ_PAYMENT_PENDING:${payload.resetKey}:${payload.discordUserId}:${payload.position}`,
        })
        .setTimestamp(),
    ],
    allowedMentions: {
      users: [payload.discordUserId],
      parse: [],
    },
  });
}

async function createQuizAutomaticPaymentRecord(
  client,
  {
    payload,
    parsedName,
    cityKey,
    payment,
    paymentIndex,
    sourceMessage,
  }
) {
  const paymentChannel = await client.channels
    .fetch(CANAL_PAGAMENTO)
    .catch(() => null);

  if (!paymentChannel?.isTextBased()) {
    throw new Error("Canal oficial de pagamentos não encontrado.");
  }

  const category = normalizarTipoPremiacao(payment.tipo);
  const city = CIDADES_PAGAMENTO[cityKey];

  const winnerMention = `<@${payload.discordUserId}>`;
  const creatorMention = `<@${sourceMessage.author.id}>`;

  const embed = new EmbedBuilder()
    .setColor("#ff3399")
    .setTitle("💸 Registro de Pagamento de Evento")
    .setDescription(
      [
        "🤖 **Registro criado automaticamente pelo Ranking Semanal do Quiz.**",
        "",
        `🏆 **${payload.positionLabel}**`,
        `👤 **Ganhador:** ${winnerMention}`,
      ].join("\n")
    )
    .addFields(
      {
        name: "🏁 Evento",
        value: `\`${payload.eventName}\``,
        inline: true,
      },
      {
        name: "📅 Data do Evento",
        value: `\`${payload.eventDate}\``,
        inline: true,
      },
      {
        name: "🏆 Colocação",
        value: `\`${payload.positionLabel}\``,
        inline: true,
      },
      {
        name: "👤 Ganhador",
        value: `${winnerMention}\n\`${parsedName.name}\``,
        inline: true,
      },
      {
        name: "🆔 ID do Ganhador",
        value: `\`${parsedName.gameId}\``,
        inline: true,
      },
      {
        name: "🌆 Cidade",
        value: `${city?.emoji || "🏙️"} \`${city?.label || PADRAO_INDEFINIDO}\``,
        inline: true,
      },
      {
        name: "🎁 Tipo",
        value: `\`${category}\``,
        inline: true,
      },
      {
        name: "🔗 Premiação / Link",
        value: `\`${payment.premiacao}\`\nOrigem: ${sourceMessage.url}`,
        inline: false,
      },
      {
        name: "📌 Status",
        value: "🕗 **AGUARDANDO ANÁLISE**",
        inline: false,
      },
      {
        name: "🧾 Registrado por",
        value: `${creatorMention}\nSistema automático do Quiz`,
        inline: false,
      }
    )
    .setFooter({
      text: [
        "SC_PAGAMENTO_QUIZ",
        payload.resetKey,
        payload.discordUserId,
        payload.position,
        paymentIndex,
      ].join(":"),
    })
    .setTimestamp();

  const sent = await paymentChannel.send({
    content: winnerMention,
    embeds: [embed],
    allowedMentions: {
      users: [payload.discordUserId],
      parse: [],
    },
  });

  await sent.edit({
    components: [
      criarRowStatus(sent.id),
    ],
  });

  const stats = loadStats();

  stats.totalCreated = Number(stats.totalCreated || 0) + 1;
  stats.creators[sourceMessage.author.id] =
    Number(stats.creators[sourceMessage.author.id] || 0) + 1;
  stats.categories[category] =
    Number(stats.categories[category] || 0) + 1;

  saveStats(stats);

  try {
    const paymentAt = dataEventoParaTimestampSP(
      payload.eventDate,
      sent.createdTimestamp || Date.now()
    );

    dashEmit("pagamento:criado", {
      __at: paymentAt,
      source: "quiz_semanal_automatico",
      by: sourceMessage.author.id,
      canal: CANAL_PAGAMENTO,
      messageId: sent.id,
      dataEvento: payload.eventDate,
      creatorId: sourceMessage.author.id,
      userId: sourceMessage.author.id,
      dedupeKey: `pagamento_quiz:criado:${sent.id}`,
    });
  } catch {}

  updateDashboard(client).catch((error) => {
    console.error(
      "[QUIZ_PAYMENT_BRIDGE] Erro ao atualizar dashboard:",
      error
    );
  });

  await limparBotoesAntigos(client, paymentChannel).catch(() => {});

  return sent;
}

async function handleQuizPaymentBridgeMessage(message, client) {
  if (!message?.guild) return false;

  if (message.channelId !== CANAL_PENDENCIAS_QUIZ_PAGAMENTO) {
    return false;
  }

  // Esta ponte aceita somente mensagens enviadas por bots.
  if (!message.author?.bot) {
    return false;
  }

  const extracted = extractQuizBridgePayload(message);

  if (!extracted.ok) {
    return false;
  }

  const payload = extracted.payload;

  if (
    !payload.discordUserId ||
    !payload.displayName ||
    !Array.isArray(payload.payments)
  ) {
    console.error(
      "[QUIZ_PAYMENT_BRIDGE] Payload incompleto:",
      payload
    );
    return true;
  }

  const parsedName = parseQuizWinnerDisplayName(payload.displayName);

  const roleResult = await inferQuizWinnerCityByRoles(
    message.guild,
    payload.discordUserId
  );

  let cityKey = parsedName.cityKey;

  if (!cityKey && roleResult.matches.length === 1) {
    cityKey = roleResult.cityKey;
  }

  if (!parsedName.gameId) {
    await sendQuizPaymentPending(
      client,
      payload,
      parsedName,
      "O apelido não possui um ID numérico."
    );

    return true;
  }

  if (!cityKey) {
    const roleReason =
      roleResult.matches.length > 1
        ? "A pessoa possui cargos de mais de uma cidade."
        : "Não encontrei prefixo nem um único cargo de cidade.";

    await sendQuizPaymentPending(
      client,
      payload,
      parsedName,
      roleReason
    );

    return true;
  }

  const state = loadQuizPaymentBridgeState();

  for (
    let paymentIndex = 0;
    paymentIndex < payload.payments.length;
    paymentIndex++
  ) {
    const payment = payload.payments[paymentIndex];

    const dedupeKey = quizPaymentDedupeKey(
      payload,
      payment,
      paymentIndex
    );

    if (state.processedKeys[dedupeKey]) {
      continue;
    }

    const sent = await createQuizAutomaticPaymentRecord(
      client,
      {
        payload,
        parsedName,
        cityKey,
        payment,
        paymentIndex,
        sourceMessage: message,
      }
    );

    state.processedKeys[dedupeKey] = {
      createdAt: Date.now(),
      messageId: sent.id,
      channelId: sent.channelId,
      sourceMessageId: message.id,
    };

    saveQuizPaymentBridgeState(state);
  }

  await message.react("✅").catch(() => {});

  return true;
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

  // ✅ CORREÇÃO: Implementação de paginação real (Discord limita fetch em 100)
  let mensagensTotal = [];
  let lastId = undefined;
  const totalALer = Math.min(Number(limiteBusca || 30000), 50000);

  while (mensagensTotal.length < totalALer) {

    const remaining = totalALer - mensagensTotal.length;
    const fetchLimit = Math.min(100, remaining);
    const batch = await canal.messages.fetch({ limit: fetchLimit, before: lastId }).catch(() => null);
    
    if (!batch || batch.size === 0) break;
    
    mensagensTotal.push(...batch.values());
    lastId = batch.last()?.id;

    if (!lastId) break;
    if (batch.size < fetchLimit) break;
  }

  // Se mensagensTotal estiver vazio, retornamos stats vazios para o dashboard não quebrar
  if (mensagensTotal.length === 0) return stats;

  const registrosFiltrados = mensagensTotal
    .filter((m) => m.author?.bot)
    .filter((m) => m.embeds?.length > 0)
    .filter((m) => mensagemEhDoMesAtualSP(m))
    .filter((m) => {
      const titulo = m.embeds?.[0]?.title || "";
      return titulo.includes("Registro de Pagamento de Evento – SANTACREATORS");
    });

  for (const msg of registrosFiltrados) {
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

async function fetchMensagensRecentesCanal(canal, total = 500) {
  const todas = [];
  let before = null;

  while (todas.length < total) {
    const options = {
      limit: Math.min(100, total - todas.length),
    };

    if (before) options.before = before;

    const lote = await canal.messages.fetch(options).catch(() => null);
    if (!lote || lote.size === 0) break;

    const lista = [...lote.values()];
    todas.push(...lista);

    before = lista[lista.length - 1]?.id;
    if (!before) break;
  }

  return todas;
}

function calcularDiferencaMinutosVip(a, b) {
  const n1 = Number(a || 0);
  const n2 = Number(b || 0);

  if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 <= 0 || n2 <= 0) {
    return null;
  }

  return Math.abs(n1 - n2) / 60000;
}

async function buscarVipEventoPorDados(client, dados = {}) {
  const canal = await client.channels.fetch(CANAL_VIP_EVENTO).catch(() => null);

  if (!canal?.isTextBased()) {
    return {
      ok: false,
      erro: `Canal VIP indisponível: ${CANAL_VIP_EVENTO}`,
    };
  }

  const mensagens = await fetchMensagensRecentesCanal(canal, 800).catch(() => null);

  if (!mensagens || mensagens.length === 0) {
    return {
      ok: false,
      erro: "Não consegui buscar mensagens no canal VIP.",
    };
  }

  const alvoEvento = normalizarBuscaVip(dados.eventoNome);
  const alvoData = normalizarBuscaVip(dados.eventoData);
  const alvoId = String(dados.ganhadorId || "").replace(/\D/g, "").trim();
  const alvoNome = normalizarBuscaVip(dados.ganhadorNome);
  const alvoTipo = normalizarTipoPremiacao(`${dados.tipo || ""}\n${dados.premiacao || ""}`);
  const registroTimestamp = Number(dados.registroTimestamp || Date.now());

  const candidatos = mensagens
    .filter((msg) => msg.embeds?.length > 0)
    .filter((msg) => {
      const titulo = msg.embeds?.[0]?.title || "";
      const texto = textoCompletoEmbedVip(msg.embeds?.[0] || "");
      return titulo.includes("Registro de VIP por Evento") || texto.includes("Registro de VIP por Evento");
    })
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const encontrados = [];

  for (const msg of candidatos) {
    const embed = msg.embeds[0];
    const texto = normalizarBuscaVip(textoCompletoEmbedVip(embed));
    const infoVip = extrairInfoDoEmbedVipEvento(embed);

    const idVip = String(infoVip.ganhadorId || "").replace(/\D/g, "").trim();

    const bateId = Boolean(alvoId && idVip && alvoId === idVip);
    const bateNome = Boolean(alvoNome && texto.includes(alvoNome));

    const eventoVipNorm = normalizarBuscaVip(infoVip.evento);
    const dataVipNorm = normalizarBuscaVip(infoVip.data);

    const mesmoEvento = Boolean(
      alvoEvento &&
      eventoVipNorm &&
      (eventoVipNorm.includes(alvoEvento) || alvoEvento.includes(eventoVipNorm))
    );

    const mesmaData = Boolean(
      alvoData &&
      dataVipNorm &&
      (dataVipNorm.includes(alvoData) || alvoData.includes(dataVipNorm))
    );

    const tipoVip = normalizarTipoPremiacao(`${infoVip.tipo || ""}\n${infoVip.premiacao || ""}`);
    const mesmoTipo = Boolean(alvoTipo && tipoVip && alvoTipo === tipoVip);

    const diferencaMinutos = calcularDiferencaMinutosVip(registroTimestamp, msg.createdTimestamp);
    const horarioProximo = diferencaMinutos !== null && diferencaMinutos <= 180;

    let score = 0;

    if (bateId) score += 300;
    if (bateNome) score += 80;
    if (mesmaData) score += 90;
    if (mesmoEvento) score += 90;
    if (mesmoTipo) score += 40;
    if (horarioProximo) score += 120;

    if (diferencaMinutos !== null) {
      score += Math.max(0, 180 - Math.round(diferencaMinutos));
    }

    const vinculoSeguro = Boolean(
      (bateId && (mesmoEvento || mesmaData || horarioProximo)) ||
      (bateId && mesmoEvento && mesmaData) ||
      (bateNome && mesmoTipo && (mesmoEvento || mesmaData || horarioProximo)) ||
      (mesmoEvento && mesmaData && horarioProximo && (bateId || bateNome))
    );

    if (!vinculoSeguro) continue;

    encontrados.push({
      score,
      msg,
      infoVip,
      diferencaMinutos,
    });
  }

  encontrados.sort((a, b) => b.score - a.score || b.msg.createdTimestamp - a.msg.createdTimestamp);

  const melhor = encontrados[0];

  if (melhor) {
    return {
      ok: true,
      link: {
        guildId: melhor.msg.guild?.id || null,
        channelId: melhor.msg.channel?.id || null,
        messageId: melhor.msg.id,
        url: melhor.msg.url,
      },
      message: melhor.msg,
      info: melhor.infoVip,
      diferencaMinutos: melhor.diferencaMinutos,
    };
  }

  return {
    ok: false,
    erro: "Nenhum registro VIP compatível encontrado por ID/nome, evento/data ou horário próximo.",
  };
}

async function resolverVipEventoProfissional(client, texto, dados = {}) {
  const urls = [...new Set(
    String(texto || "").match(
      /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d{10,25}\/\d{10,25}\/\d{10,25}/gi
    ) || []
  )];

  if (urls.length !== 1) {
    return {
      ok: false,
      erro: "Informe um único link exato do Registro VIP. Não vinculo por ID, nome ou horário.",
    };
  }

  const link = extrairLinkMensagemDiscord(urls[0]);

  if (!link || link.channelId !== CANAL_VIP_EVENTO) {
    return {
      ok: false,
      erro: "O link não pertence ao canal de registros VIP.",
    };
  }

  const resultado = await resolverVipEventoPorLink(client, urls[0]).catch((erro) => ({
    ok: false,
    erro: erro?.message || String(erro),
  }));

  if (!resultado?.ok) return resultado;

  if (
    resultado.message?.author?.id !== client.user?.id ||
    resultado.message?.guildId !== link.guildId
  ) {
    return {
      ok: false,
      erro: "O registro não pertence a este bot ou servidor.",
    };
  }

  const info = resultado.info || {};

  const idPagamento = String(dados.ganhadorId || "").replace(/\D/g, "");
  const idVip = String(info.ganhadorId || "").replace(/\D/g, "");

  if (!idPagamento || !idVip || idPagamento !== idVip) {
    return {
      ok: false,
      erro: "O ID do beneficiado não corresponde ao Registro VIP.",
    };
  }

  for (const [recebido, registrado, nome] of [
    [dados.eventoNome, info.evento, "evento"],
    [dados.eventoData, info.data, "data"],
    [dados.cidade, info.cidade, "cidade"],
  ]) {
    if (
      recebido &&
      normalizarBuscaVip(recebido) !== normalizarBuscaVip(registrado)
    ) {
      return {
        ok: false,
        erro: "O campo " + nome + " diverge do Registro VIP. Confira o link.",
      };
    }
  }

  return {
    ...resultado,
    vinculoExplicito: true,
  };
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
  const id = vipEventoResolvido?.message?.id;

  if (
    !vipEventoResolvido?.ok ||
    !vipEventoResolvido.vinculoExplicito ||
    !id
  ) {
    return {
      ok: false,
      motivo: "Pagamento registrado; falta um vínculo VIP explícito e validado.",
    };
  }

  if (PAGAMENTO_VIP_EM_ANDAMENTO.has(id)) {
    return {
      ok: false,
      motivo: "Este Registro VIP já está sendo atualizado. Aguarde e confira o status.",
    };
  }

  PAGAMENTO_VIP_EM_ANDAMENTO.add(id);

  try {
    const atual = await vipEventoResolvido.message.channel.messages.fetch({
      message: id,
      force: true,
    });

    return await marcarVipEventoComoPagoPorPagamentoSocialInterno(
      client,
      {
        ...vipEventoResolvido,
        message: atual,
      },
      interaction,
      descricao
    );
  } catch (erro) {
    return {
      ok: false,
      motivo: erro?.message || String(erro),
    };
  } finally {
    PAGAMENTO_VIP_EM_ANDAMENTO.delete(id);
  }
}

async function marcarVipEventoComoPagoPorPagamentoSocialInterno(client, vipEventoResolvido, interaction, descricao = PADRAO_INDEFINIDO) {
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
  });

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
  if (PAGAMENTO_PRESERVAR_DADOS_ORIGINAIS_VIP) {
    return {
      ok: true,
      alterou: false,
      motivo: "Dados originais do VIP preservados. O pagamento tem classificação própria.",
    };
  }

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
  if (PAGAMENTO_PRESERVAR_DADOS_ORIGINAIS_VIP) {
    return {
      ok: true,
      alterou: false,
      motivo: "Dados originais do VIP preservados. O pagamento tem classificação própria.",
    };
  }

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

  const timestampEmbed =
    Date.parse(embedLike?.timestamp || embedLike?.data?.timestamp || "") ||
    Date.now();

return {
  eventoNome: getFieldValue(embedLike, "🏷️ Evento"),
  eventoData: getFieldValue(embedLike, "📅 Data do Evento"),
  ganhadorNome: ganhadorParts[0] || "",
  ganhadorId: ganhadorParts[1] || "",
  premiacao: getFieldValue(embedLike, "🔗 Premiação / Link"),
  tipo: getTipoPagamentoFromEmbed(embedLike) || "",
  cidade: CIDADES_PAGAMENTO[getCidadeKeyFromEmbed(embedLike)]?.label || "",
  registroTimestamp: timestampEmbed,
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

function getImagemPagamentoDoRegistro(message, embedBuilder) {
  const urls = [];

  const data = embedBuilder?.data || {};
  const embedOriginal = message?.embeds?.[0];

  if (data.image?.url) urls.push(data.image.url);
  if (data.thumbnail?.url) urls.push(data.thumbnail.url);

  if (embedOriginal?.image?.url) urls.push(embedOriginal.image.url);
  if (embedOriginal?.thumbnail?.url) urls.push(embedOriginal.thumbnail.url);

  for (const attachment of message?.attachments?.values?.() || []) {
    if (attachment?.url) urls.push(attachment.url);
    if (attachment?.proxyURL) urls.push(attachment.proxyURL);
  }

  const primeiraImagem = urls.find((url) =>
    /\.(png|jpe?g|webp|gif)(\?|&|$)/i.test(url) ||
    /[?&]format=(png|jpe?g|webp|gif)/i.test(url) ||
    /media\.discordapp\.net/i.test(url) ||
    /cdn\.discordapp\.com/i.test(url)
  );

  return primeiraImagem || null;
}

async function tentarReprocessarOCRRegistro(embedBuilder, message = null) {
  const categoriaAtual = getTipoPagamentoFromEmbed(embedBuilder);

  if (categoriaEhVipOuPass(categoriaAtual)) {
    return {
      alterou: false,
      motivo: "Registro VIP/Pass não precisa de OCR financeiro.",
    };
  }

  const premiacaoOriginal = getPremiacaoLinkFromEmbed(embedBuilder);
  const imagemRegistro = getImagemPagamentoDoRegistro(message, embedBuilder);
  const premiacao = [premiacaoOriginal, imagemRegistro].filter(Boolean).join("\n");

  if (!premiacao) {
    return {
      alterou: false,
      motivo: "Sem link de premiação/imagem no embed.",
    };
  }

  const valorAtual = getFieldValue(embedBuilder, "💰 Valor Identificado");
  const nomeAtual = getFieldValue(embedBuilder, "🧾 Nome no Comprovante");

  const temImagemRegistro = Boolean(imagemRegistro);

  const precisaReler =
    temImagemRegistro ||
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
// ============================================================================
// ✅ PROTEÇÃO DOS FILTROS / REMOÇÃO DE REGISTROS DUPLICADOS
// ============================================================================

const PAGAMENTO_FILTRO_LOCK_MAX_MS = 10 * 60 * 1000;

function getPagamentoFiltroLock(client) {
  if (!client.__SC_PAGAMENTO_FILTRO_LOCK__) {
    client.__SC_PAGAMENTO_FILTRO_LOCK__ = {
      ativo: false,
      iniciadoEm: 0,
      filtro: null,
      usuarioId: null,
    };
  }

  const lock = client.__SC_PAGAMENTO_FILTRO_LOCK__;

  const lockExpirado =
    lock.ativo &&
    Date.now() - Number(lock.iniciadoEm || 0) > PAGAMENTO_FILTRO_LOCK_MAX_MS;

  if (lockExpirado) {
    lock.ativo = false;
    lock.iniciadoEm = 0;
    lock.filtro = null;
    lock.usuarioId = null;
  }

  return lock;
}

function tentarIniciarPagamentoFiltro(client, filtro, usuarioId = null) {
  const lock = getPagamentoFiltroLock(client);

  if (lock.ativo) {
    return {
      ok: false,
      filtro: lock.filtro,
      usuarioId: lock.usuarioId,
      iniciadoEm: lock.iniciadoEm,
    };
  }

  lock.ativo = true;
  lock.iniciadoEm = Date.now();
  lock.filtro = String(filtro || "desconhecido");
  lock.usuarioId = usuarioId || null;

  return {
    ok: true,
    filtro: lock.filtro,
    usuarioId: lock.usuarioId,
    iniciadoEm: lock.iniciadoEm,
  };
}

function finalizarPagamentoFiltro(client) {
  const lock = getPagamentoFiltroLock(client);

  lock.ativo = false;
  lock.iniciadoEm = 0;
  lock.filtro = null;
  lock.usuarioId = null;
}

function normalizarTextoChaveDuplicado(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mensagemEhRegistroPagamento(message) {
  if (!message?.embeds?.[0]) return false;

  const titulo = String(message.embeds[0]?.title || "");

  return titulo.includes(
    "Registro de Pagamento de Evento – SANTACREATORS"
  );
}

function criarChaveRegistroPagamentoDuplicado(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  const data = embed.data || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];

  const camposNormalizados = fields.map((field) => {
    return {
      name: normalizarTextoChaveDuplicado(field?.name),
      value: normalizarTextoChaveDuplicado(field?.value),
      inline: Boolean(field?.inline),
    };
  });

  const chave = {
    title: normalizarTextoChaveDuplicado(data.title),
    description: normalizarTextoChaveDuplicado(data.description),
    fields: camposNormalizados,
    image: String(data.image?.url || "").trim(),
    thumbnail: String(data.thumbnail?.url || "").trim(),
    footer: normalizarTextoChaveDuplicado(data.footer?.text),
    timestamp: String(data.timestamp || "").trim(),
  };

  return JSON.stringify(chave);
}

async function buscarRegistrosPagamentoPaginados(
  client,
  canal,
  limiteBusca = 5000
) {
  const registros = [];

  let before = undefined;
  let lidos = 0;

  const limiteFinal = Math.min(
    Math.max(Number(limiteBusca || 5000), 100),
    50000
  );

  while (lidos < limiteFinal) {
    const quantidade = Math.min(100, limiteFinal - lidos);

    const lote = await canal.messages.fetch({
      limit: quantidade,
      before,
    }).catch(() => null);

    if (!lote || lote.size === 0) break;

    for (const message of lote.values()) {
      lidos++;

      if (message.author?.id !== client.user.id) continue;
      if (!mensagemEhRegistroPagamento(message)) continue;

      registros.push(message);
    }

    before = lote.last()?.id;

    if (!before) break;
    if (lote.size < quantidade) break;
  }

  return {
    registros,
    lidos,
  };
}

async function removerRegistrosPagamentoDuplicados(
  client,
  canal,
  limiteBusca = 5000
) {
  const resultadoBusca = await buscarRegistrosPagamentoPaginados(
    client,
    canal,
    limiteBusca
  );

  const registros = resultadoBusca.registros
    .slice()
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const chavesMantidas = new Map();

  let encontrados = 0;
  let removidos = 0;
  let falhas = 0;

  const detalhes = [];

  for (const message of registros) {
    const chave = criarChaveRegistroPagamentoDuplicado(message);

    if (!chave) continue;

    const mensagemMantida = chavesMantidas.get(chave);

    if (!mensagemMantida) {
      chavesMantidas.set(chave, message);
      continue;
    }

    encontrados++;

    const apagado = await message
      .delete()
      .then(() => true)
      .catch((err) => {
        console.warn(
          "[PAGAMENTO DUPLICADOS] Não foi possível apagar duplicado:",
          {
            duplicadoId: message.id,
            mantidoId: mensagemMantida.id,
            erro: err?.message || String(err),
          }
        );

        return false;
      });

    if (apagado) {
      removidos++;

      detalhes.push({
        removidoId: message.id,
        mantidoId: mensagemMantida.id,
      });
    } else {
      falhas++;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return {
    lidos: resultadoBusca.lidos,
    registros: registros.length,
    encontrados,
    removidos,
    falhas,
    detalhes,
  };
}

async function moverRegistrosPorFiltro(client, canal, filtro) {
  /*
   * Responsabilidade desta função:
   *
   * 1. Ler as mensagens recentes do canal;
   * 2. Identificar os registros solicitados ou não clicados;
   * 3. Reenviar os registros mantendo a ordem original;
   * 4. Preparar os botões com concorrência controlada;
   * 5. Apagar as mensagens antigas com concorrência controlada;
   * 6. Desfazer automaticamente qualquer cópia incompleta.
   *
   * Não executa:
   *
   * - OCR;
   * - Correção VIP;
   * - Reconstrução de estatísticas;
   * - Atualização de dashboard;
   * - Varredura pesada de mensagens;
   * - Limpeza pesada de duplicados.
   */

  const mensagens = await canal.messages
    .fetch({
      limit: 100,
      cache: false,
    })
    .catch((erro) => {
      console.error(
        "[PAGAMENTO FILTRO OTIMIZADO] Não foi possível carregar as mensagens:",
        erro
      );

      return null;
    });

  if (!mensagens) {
    return {
      movidos: 0,
      relidos: 0,
      falhasMovimento: 1,
      rollbacks: 0,
    };
  }

  /*
   * Filtra somente registros válidos.
   *
   * A ordenação da mensagem mais antiga para a mais nova
   * preserva a ordem correta no final do canal.
   */
  const lista = [...mensagens.values()]
    .filter((mensagem) => {
      if (mensagem.author?.id !== client.user?.id) {
        return false;
      }

      const embed = mensagem.embeds?.[0];

      if (!embed) {
        return false;
      }

      if (!mensagemEhDoMesAtualSP(mensagem)) {
        return false;
      }

      const titulo = String(embed.title || "");

      if (
        !titulo.includes(
          "Registro de Pagamento de Evento – SANTACREATORS"
        )
      ) {
        return false;
      }

      const status = getStatusValueFromEmbed(embed);

      if (filtro === "solicitados") {
        return /JÁ FOI SOLICITADO/i.test(status);
      }

      if (filtro === "naoclicados") {
        return /Aguardando confirmação/i.test(status);
      }

      return false;
    })
    .sort((mensagemA, mensagemB) => {
      return (
        Number(mensagemA.createdTimestamp || 0) -
        Number(mensagemB.createdTimestamp || 0)
      );
    });

  const relidos = lista.length;

  let movidos = 0;
  let falhasMovimento = 0;
  let rollbacks = 0;

  /*
   * Guarda as cópias criadas.
   *
   * Cada item terá:
   * - mensagem antiga;
   * - mensagem nova;
   * - embed novo.
   */
  const copiasCriadas = [];

  /*
   * ETAPA 1 — CRIAÇÃO DAS NOVAS MENSAGENS
   *
   * O envio continua sequencial para garantir que a ordem
   * dos registros seja preservada corretamente no canal.
   */
  for (const mensagemOriginal of lista) {
    const embedRaw = mensagemOriginal.embeds?.[0];

    if (!embedRaw) {
      falhasMovimento++;
      continue;
    }

    const embedNovo = EmbedBuilder.from(embedRaw);

    const mensagemNova = await canal
      .send({
        embeds: [embedNovo],
      })
      .catch((erro) => {
        console.error(
          "[PAGAMENTO FILTRO OTIMIZADO] Erro ao reenviar registro:",
          {
            filtro,
            mensagemOriginalId: mensagemOriginal.id,
            erro: erro?.message || String(erro),
          }
        );

        return null;
      });

    if (!mensagemNova) {
      falhasMovimento++;
      continue;
    }

    copiasCriadas.push({
      mensagemOriginal,
      mensagemNova,
      embedNovo,
    });
  }

  /*
   * Executa operações com limite de concorrência.
   *
   * O limite 3 permite processar três mensagens ao mesmo tempo,
   * sem disparar requisições demais para a API do Discord.
   */
  async function executarComConcorrencia(
    itens,
    limite,
    executar
  ) {
    if (!Array.isArray(itens) || itens.length === 0) {
      return [];
    }

    const resultados = new Array(itens.length);
    let proximoIndice = 0;

    const quantidadeWorkers = Math.min(
      Math.max(1, Number(limite || 1)),
      itens.length
    );

    async function worker() {
      while (true) {
        const indiceAtual = proximoIndice;
        proximoIndice++;

        if (indiceAtual >= itens.length) {
          return;
        }

        try {
          resultados[indiceAtual] = await executar(
            itens[indiceAtual],
            indiceAtual
          );
        } catch (erro) {
          resultados[indiceAtual] = {
            ok: false,
            rollback: false,
            erro,
          };
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length: quantidadeWorkers,
        },
        () => worker()
      )
    );

    return resultados;
  }

  /*
   * ETAPA 2 — ADIÇÃO DOS BOTÕES
   *
   * Até três mensagens novas são editadas simultaneamente.
   */
  const resultadosPreparacao =
    await executarComConcorrencia(
      copiasCriadas,
      3,
      async ({
        mensagemOriginal,
        mensagemNova,
        embedNovo,
      }) => {
        const mensagemNovaPreparada = await mensagemNova
          .edit({
            embeds: [embedNovo],
            components: [
              criarRowStatus(mensagemNova.id),
            ],
          })
          .then(() => true)
          .catch((erro) => {
            console.error(
              "[PAGAMENTO FILTRO OTIMIZADO] Erro ao adicionar os botões:",
              {
                filtro,
                mensagemOriginalId: mensagemOriginal.id,
                mensagemNovaId: mensagemNova.id,
                erro: erro?.message || String(erro),
              }
            );

            return false;
          });

        if (!mensagemNovaPreparada) {
          await mensagemNova.delete().catch(() => {});

          return {
            ok: false,
            rollback: true,
          };
        }

        return {
          ok: true,
          mensagemOriginal,
          mensagemNova,
        };
      }
    );

  /*
   * Mantém somente cópias que receberam os botões corretamente.
   */
  const copiasPreparadas = [];

  for (const resultado of resultadosPreparacao) {
    if (!resultado?.ok) {
      falhasMovimento++;

      if (resultado?.rollback) {
        rollbacks++;
      }

      continue;
    }

    copiasPreparadas.push({
      mensagemOriginal: resultado.mensagemOriginal,
      mensagemNova: resultado.mensagemNova,
    });
  }

  /*
   * ETAPA 3 — EXCLUSÃO DAS MENSAGENS ANTIGAS
   *
   * Até três mensagens antigas são apagadas simultaneamente.
   *
   * A mensagem nova já está pronta antes da exclusão.
   */
  const resultadosExclusao =
    await executarComConcorrencia(
      copiasPreparadas,
      3,
      async ({
        mensagemOriginal,
        mensagemNova,
      }) => {
        const mensagemOriginalApagada =
          await mensagemOriginal
            .delete()
            .then(() => true)
            .catch((erro) => {
              console.error(
                "[PAGAMENTO FILTRO OTIMIZADO] Não foi possível apagar o registro antigo:",
                {
                  filtro,
                  mensagemOriginalId: mensagemOriginal.id,
                  mensagemNovaId: mensagemNova.id,
                  erro: erro?.message || String(erro),
                }
              );

              return false;
            });

        if (!mensagemOriginalApagada) {
          /*
           * Se a mensagem antiga não puder ser apagada,
           * a cópia nova é removida para impedir duplicação.
           */
          await mensagemNova.delete().catch(() => {});

          return {
            ok: false,
            rollback: true,
          };
        }

        return {
          ok: true,
        };
      }
    );

  for (const resultado of resultadosExclusao) {
    if (resultado?.ok) {
      movidos++;
      continue;
    }

    falhasMovimento++;

    if (resultado?.rollback) {
      rollbacks++;
    }
  }

  return {
    movidos,
    relidos,
    falhasMovimento,
    rollbacks,
  };
}
// ============================================================================
// ✅ EXPORT 1: CHAMA NO READY
// ============================================================================
export async function pagamentoSocialOnReady(client) {
  if (!client.__SC_QUIZ_PAYMENT_BRIDGE_LISTENER__) {
    client.__SC_QUIZ_PAYMENT_BRIDGE_LISTENER__ = true;

    client.on("messageCreate", async (message) => {
      try {
        await handleQuizPaymentBridgeMessage(message, client);
      } catch (error) {
        console.error(
          "[QUIZ_PAYMENT_BRIDGE] Erro ao processar mensagem:",
          error
        );
      }
    });
  }

  const canal = await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);
  if (!canal || !canal.isTextBased()) return;

  // se já existe, garante que só fica 1
  const existente = await limparBotoesAntigos(client, canal).catch(() => null);

  // se não existe, cria
  if (!existente) {
    await canal.send({
      embeds: [criarEmbedMenu()],
      components: [criarRowMenu()],
    }).catch(() => {});
  }

await autoMarcarCidadesPendentesPagamento(client, 1000).catch(() => null);

  // ✅ SEMPRE recalcula e atualiza o dashboard ao ligar o bot.
  // Antes, se o menu já existisse, dava return e o gráfico ficava travado.
// ✅ SEMPRE recalcula e atualiza o dashboard ao ligar o bot.
// Antes, se o menu já existisse, dava return e o gráfico ficava travado.
// ✅ SEMPRE recalcula e atualiza o dashboard ao ligar o bot.
// ✅ recreate: true força criar uma mensagem nova quando trocou de bot.
await sincronizarDashboardSocial(client, "ready:recriar_por_troca_de_bot", {
  forceUnlock: true,
  recreate: true,
}).catch(() => null);

if (!client.__SC_SOCIAL_DASH_INTERVAL__) {
  client.__SC_SOCIAL_DASH_INTERVAL__ = setInterval(() => {
    sincronizarDashboardSocial(client, "auto:5min", {
      forceUnlock: false,
    }).catch((err) => {
      console.error("[PAGAMENTO_SOCIAL_DASH] erro no auto:5min", err);
    });
  }, 5 * 60 * 1000);

  console.log("[PAGAMENTO_SOCIAL_DASH] auto atualização ativada: 5 minutos");
}
}



// ============================================================================

export async function pagamentoSocialHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;

    const content = String(message.content || "").trim();
    if (!content.startsWith("!")) return false;

    const lowerContent = content.toLowerCase();

    if (lowerContent.startsWith("!atualizarpagamentos")) {
      if (!temPermissaoPagamentoMensagem(message)) {
        await message.reply("🚫 Você não tem permissão para usar esse comando.").catch(() => {});
        return true;
      }

      const args = content.split(/\s+/).filter(Boolean);
      const limiteArg = String(args[1] || "").toLowerCase();

      let limiteBusca = 30000;

      if (limiteArg === "tudo" || limiteArg === "todos") {
        limiteBusca = 50000;
      } else if (/^\d+$/.test(limiteArg)) {
        limiteBusca = Math.min(Math.max(Number(limiteArg), 100), 50000);
      }

            await message.delete().catch(() => {});

      const avisoMsg = await message.channel.send({
        content: "🔎 Preparando varredura pesada dos pagamentos antigos...",
      }).catch(() => null);

      if (avisoMsg) {
        await iniciarVarreduraPesadaPagamentosSegundoPlano(
          client,
          avisoMsg,
          limiteBusca,
          "comando_atualizarpagamentos",
          {
            userId: message.author.id,
            canalId: message.channel.id,
            comando: content,
          }
        );
      }

      return true;
    }

const cmd = content.slice(1).split(/\s+/)[0]?.toLowerCase();

const comandosSocial = [
  "socialrefresh",
  "criarsocial",
  "socialdash",
  "social",
  "dashsocial",
  "criardashsocial",
];

if (!comandosSocial.includes(cmd)) return false;
    const membro = message.member;
    const permitido =
      ALLOWED_IDS.includes(message.author.id) ||
      membro?.roles?.cache?.some((r) => ALLOWED_IDS.includes(r.id));

    if (!permitido) {
      await message.reply("🚫 Você não tem permissão para atualizar o Dashboard Social Mídias.").catch(() => {});
      return true;
    }

  const recriar = ["criarsocial", "criardashsocial"].includes(cmd);

    const aviso = await message.reply(
      recriar
        ? "🔄 Recriando o Dashboard Social Mídias do zero e sincronizando os dados..."
        : "🔄 Recalculando e atualizando o Dashboard Social Mídias..."
    ).catch(() => null);

    const result = await sincronizarDashboardSocial(client, `comando:${cmd}`, {
      forceUnlock: true,
      recreate: recriar,
    });

    if (!result.ok) {
      await (aviso || message).reply?.(
        `❌ Falhei ao atualizar o Dashboard Social Mídias.\nMotivo: \`${result.error || result.message || "erro desconhecido"}\``
      ).catch(() => {});
      return true;
    }

    const s = result.stats || loadStats();

    await (aviso || message).edit?.({
      content: [
        recriar
          ? "✅ Dashboard Social Mídias recriado e sincronizado."
          : "✅ Dashboard Social Mídias recalculado e atualizado.",
        "",
        `🧾 Criados: **${Number(s.totalCreated || 0)}**`,
        `✅ Aprovados: **${Number(s.totalApproved || 0)}**`,
        `❌ Reprovados: **${Number(s.totalRejected || 0)}**`,
        `📌 Solicitados: **${Number(s.totalRequested || 0)}**`,
      ].join("\n"),
    }).catch(async () => {
      await message.reply("✅ Dashboard Social Mídias atualizado.").catch(() => {});
    });

    return true;
  } catch (err) {
    console.error("[PAGAMENTO_SOCIAL_DASH] comando erro:", err);
    await message.reply(`❌ Erro no comando Social Mídias: \`${err?.message || String(err)}\``).catch(() => {});
    return true;
  }
}


// ============================================================================
// ✅ IDENTIFICADOR RÁPIDO DAS INTERAÇÕES DO PAGAMENTO SOCIAL
// - Evita executar este sistema em botões e modais de outros módulos.
// - Não responde, não faz fetch e não executa tarefas pesadas.
// ============================================================================
export function isPagamentoSocialInteraction(interaction) {
  if (!interaction) return false;

  if (!interaction.isButton?.() && !interaction.isModalSubmit?.()) {
    return false;
  }

  const id = String(interaction.customId || "");

  if (!id) return false;

  return (
    id === "abrirform" ||
    id === "form_pagamento" ||
    id === "pagamento_dash_atualizar" ||

    id.startsWith("pagamento_filtro_") ||
    id.startsWith("cidade_pagamento__") ||

    id.startsWith("pago__") ||
    id.startsWith("solicitado__") ||
    id.startsWith("reprovado__") ||

    id.startsWith("pago_desc_") ||
    id.startsWith("solicitado_desc_") ||
    id.startsWith("reprovado_desc_")
  );
}


// ✅ EXPORT 2: HANDLER DO ROTEADOR CENTRAL
// - Retorna true se a interação era nossa
// ============================================================================
export async function handlePagamentoSocial(interaction, client) {
  try {
    // ✅ SAÍDA IMEDIATA:
    // Não executa dedupe, logs, fetch ou qualquer outra tarefa
    // quando a interação pertence a outro sistema.
    if (!isPagamentoSocialInteraction(interaction)) {
      return false;
    }


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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const result = await sincronizarDashboardSocial(client, "botao:pagamento_dash_atualizar_recriar", {
    forceUnlock: true,
    recreate: true,
  });

  if (!result.ok) {
    await interaction.editReply({
      content: `❌ Não consegui atualizar o Dashboard Social Mídias.\nMotivo: \`${result.error || result.message || "lock ativo"}\``,
    }).catch(() => {});
    return true;
  }

  const s = result.stats || loadStats();

  await interaction.editReply({
    content: [
      "✅ Dashboard Social Mídias recalculado e atualizado!",
      "",
      `🧾 Criados: **${Number(s.totalCreated || 0)}**`,
      `✅ Aprovados: **${Number(s.totalApproved || 0)}**`,
      `❌ Reprovados: **${Number(s.totalRejected || 0)}**`,
      `📌 Solicitados: **${Number(s.totalRequested || 0)}**`,
    ].join("\n"),
  }).catch(() => {});

  return true;
}
// ✅ FILTROS
if (id.startsWith("pagamento_filtro_")) {
  if (!temPermissaoPagamento(interaction)) {
    await interaction.reply({
      content: "🚫 Você não tem permissão para usar esse filtro.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    return true;
  }

  const qual = id.replace("pagamento_filtro_", "");

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});

  const inicioLock = tentarIniciarPagamentoFiltro(
    client,
    qual,
    interaction.user.id
  );

  if (!inicioLock.ok) {
    await interaction.editReply({
      content: [
        "⚠️ Já existe uma organização de pagamentos em andamento.",
        `🔎 Filtro atual: **${inicioLock.filtro || "desconhecido"}**`,
        inicioLock.usuarioId
          ? `👤 Iniciado por: <@${inicioLock.usuarioId}>`
          : null,
        "Aguarde finalizar antes de apertar outro filtro.",
      ].filter(Boolean).join("\n"),
    }).catch(() => {});

    return true;
  }

  try {
    const canal =
      interaction.channel?.id === CANAL_PAGAMENTO
        ? interaction.channel
        : await client.channels
            .fetch(CANAL_PAGAMENTO)
            .catch(() => null);

    if (!canal || !canal.isTextBased()) {
      await interaction.editReply({
        content: "❌ Não achei o canal de pagamentos.",
      }).catch(() => {});

      return true;
    }

    /*
     * O filtro de cidades permanece separado porque sua função
     * é adicionar componentes aos registros.
     */
    if (qual === "cidades") {
      await interaction.editReply({
        content: "🏙️ Verificando os registros que ainda não possuem cidade...",
      }).catch(() => {});

      const {
        atualizados,
        ignorados,
      } = await adicionarBotoesCidadeNosRegistrosDoMes(
        client,
        canal
      );

      await interaction.editReply({
        content: [
          "✅ Botões de cidade verificados.",
          `🏙️ Registros atualizados: **${atualizados || 0}**`,
          `↩️ Já estavam corretos: **${ignorados || 0}**`,
        ].join("\n"),
      }).catch(() => {});

      /*
       * Mantém o menu organizado sem segurar a resposta.
       */
      void (async () => {
        try {
          await canal.send({
            embeds: [criarEmbedMenu()],
            components: [criarRowMenu()],
          }).catch(() => {});

          await limparBotoesAntigos(
            client,
            canal
          ).catch(() => {});
        } catch (erro) {
          console.error(
            "[PAGAMENTO FILTRO CIDADES] Erro na organização posterior:",
            erro
          );
        }
      })();

      return true;
    }

    if (
      qual !== "solicitados" &&
      qual !== "naoclicados"
    ) {
      await interaction.editReply({
        content: `❌ Filtro inválido: \`${qual}\`.`,
      }).catch(() => {});

      return true;
    }

    const nomeFiltro =
      qual === "solicitados"
        ? "Solicitados"
        : "Não clicados";

    await interaction.editReply({
      content: [
        `🔎 Organizando **${nomeFiltro}**...`,
        "📦 Lendo os registros e movendo os encontrados para o final.",
      ].join("\n"),
    }).catch(() => {});

    const resultadoFiltro =
      await moverRegistrosPorFiltro(
        client,
        canal,
        qual
      );

    const {
      movidos,
      relidos,
      falhasMovimento,
      rollbacks,
    } = resultadoFiltro;

    /*
     * A operação principal já terminou.
     * Responde imediatamente sem reconstruir dashboard,
     * executar OCR ou procurar duplicados em 5.000 mensagens.
     */
    await interaction.editReply({
      content: [
        `✅ **${nomeFiltro} organizados!**`,
        "",
        `🔎 Registros encontrados: **${relidos || 0}**`,
        `📦 Registros movidos: **${movidos || 0}**`,
        `⚠️ Falhas: **${falhasMovimento || 0}**`,
        `↩️ Cópias desfeitas por segurança: **${rollbacks || 0}**`,
        "",
        movidos > 0
          ? "Os registros foram colocados no final do canal mantendo a ordem."
          : "Nenhum registro correspondente foi encontrado nas últimas 100 mensagens.",
      ].join("\n"),
    }).catch(() => {});

    logPagamento(
      client,
      interaction,
      "⚡ Filtro rápido aplicado",
      [
        `Filtro: **${qual}**`,
        `Registros encontrados: **${relidos || 0}**`,
        `Registros movidos: **${movidos || 0}**`,
        `Falhas: **${falhasMovimento || 0}**`,
        `Rollbacks: **${rollbacks || 0}**`,
      ].join("\n")
    ).catch(() => {});

    /*
     * Organiza somente o menu depois da resposta.
     *
     * Não reconstrói estatísticas porque apenas mover mensagens
     * não altera pagamento, status, valor, cidade ou responsável.
     */
    void (async () => {
      try {
        await canal.send({
          embeds: [criarEmbedMenu()],
          components: [criarRowMenu()],
        }).catch(() => {});

        await limparBotoesAntigos(
          client,
          canal
        ).catch(() => {});
      } catch (erro) {
        console.error(
          "[PAGAMENTO FILTRO RÁPIDO] Erro ao organizar o menu:",
          erro
        );
      }
    })();

    return true;
  } catch (err) {
    console.error(
      "[PAGAMENTO FILTRO RÁPIDO] Erro durante execução:",
      err
    );

    await interaction.editReply({
      content: [
        "❌ O filtro encontrou um erro durante a execução.",
        "Nenhuma cópia será mantida quando a mensagem antiga não puder ser apagada.",
        "",
        `Motivo: \`${err?.message || String(err)}\``,
      ].join("\n"),
    }).catch(() => {});

    return true;
  } finally {
    finalizarPagamentoFiltro(client);
  }
}

      // ✅ ABRIR FORM
      if (id === "abrirform") {
        if (!temPermissaoPagamento(interaction)) {
          await interaction.reply({
            content: "🚫 Você não tem permissão para usar este formulário.",
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return true;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

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

        if (cidadeJaDefinida && cidadeJaDefinida !== cidadeKey) {
          const componentsSemCidades = removerRowsCidadePagamento(registroMsg);

          await registroMsg.edit({
            embeds: [EmbedBuilder.from(embedRaw)],
            components: componentsSemCidades,
          }).catch(() => {});

          await interaction.editReply({
            content: "⚠️ Esse registro já tinha outra cidade marcada. Os botões foram removidos para evitar conflito.",
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

// ✅ Confirma imediatamente após editar o registro.
await interaction.editReply({
  content: `✅ Cidade marcada como **${cidade.label}** nesse registro.`,
}).catch(() => {});

// ✅ Reconstrução e dashboard continuam normalmente,
// mas não seguram mais a resposta do botão.
void (async () => {
  try {
    await reconstruirStatsPorEmbeds(client, 100).catch(() => null);
    await updateDashboard(client).catch(() => {});
  } catch (error) {
    console.error(
      "[PagamentoSocial] Erro ao atualizar estatísticas após marcar cidade:",
      error
    );
  }
})();

return true;
      }

      // ✅ STATUS (abre modal)
// formato: pago__{messageId} / solicitado__{messageId} / reprovado__{messageId}
if (id.startsWith("pago__") || id.startsWith("solicitado__") || id.startsWith("reprovado__")) {
  // ✅ Mesma lista de aprovadores do registroManager.js
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.reply({
      content: "🚫 Você não tem permissão para aprovar/reprovar registros.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    return true;
  }

  const [action, messageId] = id.split("__");

  // ✅ Mesma trava de hierarquia do Registro Manager aplicada às decisões finais
  // PAGO e REPROVADO respeitam hierarquia + autoaprovação + bypass.
  const embedClicado = interaction.message?.embeds?.[0];
  const criadorId = getCriadorIdFromEmbed(embedClicado);

  const validacaoHierarquia =
    await validarHierarquiaDecisaoPagamento(
      interaction,
      criadorId,
      action
    );

  if (!validacaoHierarquia.ok) {
    await interaction.reply({
      content: validacaoHierarquia.mensagem,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    logPagamento(
      client,
      interaction,
      validacaoHierarquia.motivo === "hierarquia"
        ? "⛔ Bloqueado: hierarquia de aprovação"
        : "⛔ Bloqueado: auto-aprovação",
      [
        `Usuário tentou **${action.toUpperCase()}** um registro bloqueado pela regra de permissão.`,
        `Criador: ${criadorId ? `<@${criadorId}>` : "Não identificado"}`,
        `Mensagem: \`${messageId}\``,
      ].join("\n")
    ).catch(() => {});

    return true;
  }

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
          await interaction.reply({ content: "🚫 Você não tem permissão.", flags: MessageFlags.Ephemeral }).catch(() => {});
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
        await interaction.reply({ content: "🛑 Calma aí — já peguei teu envio. (anti duplicação)", flags: MessageFlags.Ephemeral });
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

await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

const vipEventoResolvido = await resolverVipEventoProfissional(
  client,
  premiacao,
  {
    eventoNome,
    eventoData,
    ganhadorNome: ganhadorNomeRaw,
    ganhadorId: ganhadorIdRaw,
    registroTimestamp: Date.now(),
  }
).catch((err) => ({
  ok: false,
  erro: err?.message || String(err),
}));

// Mantém exatamente o que foi preenchido no formulário.
// Se achar o VIP Evento, o sistema só adiciona o link vinculado no embed.

const agoraFallback = getAgoraSPParts();

const tipoDigitadoPagamentoSocial = interaction.fields.getTextInputValue("tipoPremiacao")?.trim() || "";

const tipoInputFallbackVip = [
  vipEventoResolvido?.info?.tipo || "",
  vipEventoResolvido?.info?.premiacao || "",
].join(" ");

const categoriaVip = normalizarTipoPremiacao(
  tipoDigitadoPagamentoSocial || tipoInputFallbackVip
);

const deveUsarOCR =
  categoriaVip === "Dinheiro" ||
  !vipEventoResolvido?.ok;

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

await autoMarcarCidadePagamentoMensagem(client, mensagem, "auto:novo_registro").catch(() => null);

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

// ✅ Responde imediatamente ao usuário.
// O registro já foi enviado e salvo neste ponto.
await interaction.editReply({
  content: "✅ Registro criado!",
}).catch(() => {});

// ✅ Atualiza o dashboard depois da resposta.
// A atualização continua acontecendo normalmente,
// mas não deixa o usuário esperando.
updateDashboard(client).catch((error) => {
  console.error(
    "[PagamentoSocial] Erro ao atualizar dashboard após criar registro:",
    error
  );
});

        try {
  const pagamentoAt =
    dataEventoParaTimestampSP(
      eventoData,
      mensagem.createdTimestamp ||
      Date.now()
    );

  dashEmit("pagamento:criado", {
    /*
     * Momento operacional do pagamento.
     *
     * Quando a data do evento puder ser identificada,
     * ela será usada como referência do relatório.
     */
    __at:
      pagamentoAt,

    /*
     * Momento real em que o registro foi criado.
     *
     * Este campo permite calcular quanto tempo passou
     * entre a criação e a decisão final.
     */
    createdAt:
      mensagem.createdTimestamp ||
      Date.now(),

    source:
      "pagamento_social",

    /*
     * Usuário que criou o registro.
     */
    by:
      interaction.user.id,

    creatorId:
      interaction.user.id,

    userId:
      interaction.user.id,

    /*
     * ID permanente utilizado para relacionar
     * a criação com a aprovação ou reprovação.
     */
    operationId:
      mensagem.id,

    recordId:
      mensagem.id,

    canal:
      CANAL_PAGAMENTO,

    channelId:
      CANAL_PAGAMENTO,

    messageId:
      mensagem.id,

    dataEvento:
      eventoData,

    dedupeKey:
      `pagamento_social:criado:${mensagem.id}`,
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  // ✅ Repete a permissão no submit para impedir bypass do modal
  if (!temPermissaoAprovacao(interaction)) {
    await interaction.editReply({
      content: "🚫 Você não tem permissão para aprovar/reprovar registros.",
    }).catch(() => {});

    return true;
  }

  const parts = id.split("_desc_");
  const action = parts[0]; // pago | solicitado | reprovado
  const messageId = parts.slice(1).join("_desc_"); // segura caso tenha underscore

  const descricao =
    interaction.fields.getTextInputValue("descricao")?.trim() ||
    PADRAO_INDEFINIDO;

  const canal =
    await client.channels.fetch(CANAL_PAGAMENTO).catch(() => null);

  if (!canal || !canal.isTextBased()) {
    await interaction.editReply({
      content: "❌ Não achei o canal.",
    }).catch(() => {});

    return true;
  }

  const msgOriginal =
    await canal.messages.fetch(messageId).catch(() => null);

  if (!msgOriginal?.embeds?.[0]) {
    await interaction.editReply({
      content: "❌ Não achei o embed desse registro.",
    }).catch(() => {});

    return true;
  }

  const embedOriginal =
    EmbedBuilder.from(msgOriginal.embeds[0]);

  // ✅ Repete hierarquia + autoaprovação + bypass no submit do modal
  const criadorId =
    getCriadorIdFromEmbed(embedOriginal);

  const validacaoHierarquia =
    await validarHierarquiaDecisaoPagamento(
      interaction,
      criadorId,
      action
    );

  if (!validacaoHierarquia.ok) {
    await interaction.editReply({
      content: validacaoHierarquia.mensagem,
    }).catch(() => {});

    logPagamento(
      client,
      interaction,
      validacaoHierarquia.motivo === "hierarquia"
        ? "⛔ Bloqueado: hierarquia de aprovação (submit)"
        : "⛔ Bloqueado: auto-aprovação (submit)",
      [
        `Usuário tentou **${action.toUpperCase()}** um registro bloqueado pela regra de permissão.`,
        `Criador: ${criadorId ? `<@${criadorId}>` : "Não identificado"}`,
        `Mensagem: \`${messageId}\``,
      ].join("\n")
    ).catch(() => {});

    return true;
  }

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

  dadosVip.registroTimestamp = msgOriginal.createdTimestamp || dadosVip.registroTimestamp || Date.now();

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

  // ✅ EMITE EVENTO PRO GERALDASH ANTES DE ATUALIZAR O DASHBOARD
  // assim o gráfico já recebe o pagamento atual antes de redesenhar
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

    const dataEventoTimestamp = dataEventoParaTimestampSP(
      dataEventoEmbed,
      msgOriginal.createdTimestamp || Date.now()
    );

    const pagamentoAt = dataEventoTimestamp || Date.now();

dashEmit(map[action] || "pagamento:status", {
  /*
   * Momento real em que a decisão foi realizada.
   */
  __at:
    Date.now(),

  decidedAt:
    Date.now(),

  source:
    "pagamento_social",

  /*
   * Pessoa que clicou em:
   *
   * • Pago;
   * • Solicitado;
   * • Reprovado.
   */
  by:
    interaction.user.id,

  decisionUserId:
    interaction.user.id,

  executorId:
    interaction.user.id,

  approverId:
    action ===
      "pago"
      ? interaction.user.id
      : null,

  rejectorId:
    action ===
      "reprovado"
      ? interaction.user.id
      : null,

  action,

  status:
    action ===
      "pago"
      ? "approved"
      : action ===
          "reprovado"
        ? "rejected"
        : "requested",

  canal:
    CANAL_PAGAMENTO,

  channelId:
    CANAL_PAGAMENTO,

  /*
   * A mensagem antiga representa o registro
   * que recebeu a decisão.
   */
  operationId:
    msgOriginal.id,

  recordId:
    msgOriginal.id,

  oldMessageId:
    msgOriginal.id,

  newMessageId:
    msgNova.id,

  messageId:
    msgNova.id,

  /*
   * Quem criou o registro e recebe o ponto
   * quando o pagamento for aprovado.
   */
  creatorId:
    criadorId,

  userId:
    criadorId,

  pointOwnerId:
    criadorId,

  dataEvento:
    dataEventoEmbed,

  dataEventoTimestamp,

  operationalTimestamp:
    pagamentoAt,

  dedupeKey:
    `pagamento_social:${action}:${msgNova.id}`,
});

    // ✅ fallback geral para qualquer dashboard que esteja ouvindo status genérico
    dashEmit("pagamento:status", {
      __at: Date.now(),
      source: "pagamento_social",
      by: interaction.user.id,
      action,
      canal: CANAL_PAGAMENTO,
      oldMessageId: msgOriginal.id,
      newMessageId: msgNova.id,
      dedupeKey: `pagamento_social:status:${msgNova.id}`,
    });
  } catch {}

// ✅ A mensagem do registro já foi atualizada neste ponto.
// Confirma imediatamente para quem clicou.
await interaction.editReply({
  content: "✅ Atualizado e jogado pro final do chat!",
}).catch(() => {});

// ✅ Sincronização do dashboard e organização do menu
// continuam sendo executadas sem prender a resposta.
void (async () => {
  try {
    // Se aprovado/reprovado/solicitado,
    // recalcula estatísticas pelos registros do mês atual.
    if (["pago", "reprovado", "solicitado"].includes(action)) {
      await sincronizarDashboardSocial(client, `status:${action}`, {
        forceUnlock: true,
      }).catch(() => null);
    }

    // Reposta o menu e limpa menus duplicados.
    await canal.send({
      embeds: [criarEmbedMenu()],
      components: [criarRowMenu()],
    }).catch(() => {});

    await limparBotoesAntigos(client, canal).catch(() => {});
  } catch (error) {
    console.error(
      `[PagamentoSocial] Erro nas tarefas posteriores ao status ${action}:`,
      error
    );
  }
})();

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
