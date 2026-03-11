// /application/events/doacao.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";
import { resolveLogChannel } from "./channelResolver.js";

// ✅ __dirname no ESM (pra path absoluto e estável)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * SC_DOACAO — Botão Universal de Doações + Ranking Mensal FIXO (v4.2)
 * - Modular (SEM client.on aqui dentro)
 * - Ranking mensal (1..31), zera automático e guarda vencedor anterior
 * - Ranking no canal fixo: cria 1 mensagem e só EDITA (sem spam)
 *
 * ✅ NOVO (anti-farm):
 * - Qualquer pessoa pode registrar quantas vezes quiser
 * - MAS pontua no ranking + dash SOMENTE 1 ponto por hora por usuário
 * - EXCETO isentos (IDs/cargos) -> pontua sempre
 *
 * Como usar no index:
 *   import { doacaoOnReady, doacaoHandleMessage, doacaoHandleInteraction } from "./events/doacao.js";
 *   no messageCreate: if (await doacaoHandleMessage(message, client)) return;
 *   no interactionCreate: if (await doacaoHandleInteraction(interaction, client)) return;
 *   no ready: await doacaoOnReady(client);
 */

// ================== CONFIG ==================
const CARGOS_DOACAO = [
  "1262262852949905408", // OWNER (pode ativar/desligar no canal)
  "660311795327828008",  // EU (user id - aqui tá ok pq você usa como bypass no temPermissaoDoacao)
  "1352275728476930099", // SANTACREATORS
];

// ====== ANTI-FARM (PONTUAÇÃO) ======
// ⚠️ TROCA AQUI se quiser ajustar regras:
const SCORE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora (pontua 1 ponto por hora)
const DASH_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 horas (ranking geral)

const EXEMPT_USER_IDS = new Set([
  "660311795327828008", // você (id)
]);

const EXEMPT_ROLE_IDS = new Set([
  "1262262852949905408", // OWNER (cargo)
  "1352408327983861844", // RESP CREATORS (cargo)
]);

const CANAL_LOGS_ID = process.env.SCDOACAO_LOGS_ID?.trim() || "1392343906535870597";
const CANAL_RANK_ID = process.env.SCDOACAO_RANK_ID?.trim() || "1418098124924256378";

const TEMPO_ATUALIZACAO = 24 * 60 * 60 * 1000; // 24h (refresh do botão no canal ativado)
const GIF_DOACAO_URL =
  "https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66";

const PREFIXO = "scdoa"; // customIds

// ================== PATHS (persistência) ==================
// ✅ Regra: usar path ABSOLUTO e sempre o mesmo.
// ✅ Preferência: env SQUARECLOUD_STORAGE_PATH (se existir)
// ✅ Senão: tentar /storage e variações
// ✅ Senão: cair no /application/data (relativo ao arquivo, NÃO ao process.cwd)

function pickPersistRoot() {
  const candidates = [
    process.env.SQUARECLOUD_STORAGE_PATH?.trim(),
    "/storage",
    "/home/container/storage",
    "/home/squarecloud/storage",
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {}
  }
  return null;
}

const PERSIST_ROOT = pickPersistRoot();

// ✅ fallback final: ../data (ao lado do teu projeto, estável)
const FALLBACK_DATA_DIR = path.resolve(__dirname, "../data");

// ✅ diretório final da store
const BASE_DIR = path.resolve(PERSIST_ROOT || FALLBACK_DATA_DIR, "sc_doacoes");

// arquivos
const FILE_CANAIS = path.join(BASE_DIR, "canais_ativos.json");   // { [canalId]: true }
const FILE_RANK   = path.join(BASE_DIR, "ranking_mensal.json");  // estrutura abaixo
const FILE_UI     = path.join(BASE_DIR, "ui_state.json");        // { buttonMessageIdByChannel: { [canalId]: msgId } }

// ================== RANK MARKER (pra achar a msg antiga e NÃO DUPLICAR) ==================
const RANK_MARKER = "SC_DOACAO_RANK::V1"; // não muda depois de rodar

function encodeRankStateForDiscord(state) {
  try {
    const safe = {
      monthKey: state.monthKey,
      counts: state.counts || {},
      lastWinner: state.lastWinner || null,
      lastScoreAtByUser: state.lastScoreAtByUser || {},
      // rankMessageId a gente seta pelo scan
    };
    const json = JSON.stringify(safe);
    return Buffer.from(json, "utf8").toString("base64");
  } catch {
    return "";
  }
}

function decodeRankStateFromDiscord(content) {
  try {
    if (!content) return null;
    const m = content.match(/\|\|SC_DOACAO_STATE:([A-Za-z0-9+/=]+)\|\|/);
    if (!m) return null;
    const json = Buffer.from(m[1], "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

async function findExistingRankMessage(client, canalRank) {
  try {
    // puxa bastante msg (pode ajustar pra 50 se quiser mais leve)
    const msgs = await canalRank.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs) return null;

    // 1) tenta achar por content marker (mais confiável)
    const byContent = msgs.find((m) => {
      if (m.author?.id !== client.user.id) return false;
      if (!m.content) return false;
      return m.content.includes(RANK_MARKER);
    });
    if (byContent) return byContent;

    // 2) fallback: achar por footer marker (caso alguém apagou o content)
    const byFooter = msgs.find((m) => {
      if (m.author?.id !== client.user.id) return false;
      const emb = m.embeds?.[0];
      const ft = emb?.footer?.text || "";
      return typeof ft === "string" && ft.includes(RANK_MARKER);
    });
    if (byFooter) return byFooter;

    return null;
  } catch {
    return null;
  }
}

async function limparDuplicatasRanking(client, canalRank, keepMessageId) {
  try {
    const msgs = await canalRank.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs) return;

    const duplicadas = msgs.filter((m) => {
      if (m.id === keepMessageId) return false;
      if (m.author?.id !== client.user.id) return false;

      const isMarkedContent = (m.content || "").includes(RANK_MARKER);
      const ft = m.embeds?.[0]?.footer?.text || "";
      const isMarkedFooter = typeof ft === "string" && ft.includes(RANK_MARKER);

      return isMarkedContent || isMarkedFooter;
    });

    for (const [, msg] of duplicadas) {
      await msg.delete().catch(() => {});
    }
  } catch {}
}



function ensureStore() {
  try {
    if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  } catch {}

  // cria arquivos padrão se não existirem
  try {
    if (!fs.existsSync(FILE_CANAIS)) fs.writeFileSync(FILE_CANAIS, JSON.stringify({}, null, 2));
  } catch {}

  try {
    if (!fs.existsSync(FILE_RANK)) {
      fs.writeFileSync(
        FILE_RANK,
        JSON.stringify(
          {
            monthKey: getMonthKey(),
            counts: {},
            lastWinner: null,
            rankMessageId: null,
            lastScoreAtByUser: {},
            lastDashEmitAtByUser: {},
          },
          null,
          2
        )
      );
    }
  } catch {}

  try {
    if (!fs.existsSync(FILE_UI)) {
      fs.writeFileSync(
        FILE_UI,
        JSON.stringify({ buttonMessageIdByChannel: {} }, null, 2)
      );
    }
  } catch {}
}

function readJSON(file, fallback) {
  try {
    ensureStore();
    if (!fs.existsSync(file)) return fallback;

    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;

    return JSON.parse(raw);
  } catch (e) {
    console.error("[SC_DOACAO] ⚠️ JSON inválido/corrompido:", file, e?.message || e);
    return fallback;
  }
}

// ✅ write ATÔMICO (evita corromper e “zerar” no restart)
function writeJSON(file, data) {
  try {
    ensureStore();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("[SC_DOACAO] ❌ Falha ao salvar:", file, e?.message || e);
  }
}


// ================== UI state (persistente) ==================
function loadUI() {
  const ui = readJSON(FILE_UI, { buttonMessageIdByChannel: {} });
  if (!ui.buttonMessageIdByChannel) ui.buttonMessageIdByChannel = {};
  return ui;
}
function saveUI(ui) {
  writeJSON(FILE_UI, ui);
}


// ================== utils mês ==================
function getMonthKey(date = new Date()) {
  // ✅ força mês pelo fuso SP (evita bug de virar mês “no UTC”)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  });

  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || String(date.getFullYear());
  const m = parts.find((p) => p.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");

  return `${y}-${m}`;
}


function rolloverIfNeeded(rankState) {
  const nowKey = getMonthKey();
  if (rankState.monthKey === nowKey) return rankState;

  // fechou mês anterior → define winner
  const entries = Object.entries(rankState.counts || {});
  if (entries.length > 0) {
    entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    const [userId, count] = entries[0];
    rankState.lastWinner = { userId, count, monthKey: rankState.monthKey };
  }

  // reseta pro mês novo
  rankState.monthKey = nowKey;
  rankState.counts = {};

  // ✅ opcional: também reseta anti-farm no mês novo (pra não carregar "travas" antigas)
  rankState.lastScoreAtByUser = {};
  rankState.lastDashEmitAtByUser = {};

  return rankState;
}

function getTop(rankState, limit = 5) {
  const entries = Object.entries(rankState.counts || {});
  entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return entries.slice(0, limit).map(([userId, count]) => ({ userId, count }));
}

function formatTop(top) {
  if (!top.length) return "—";
  return top
    .map((t, i) => `**${i + 1}.** <@${t.userId}> — **${t.count}**`)
    .join("\n");
}

// ================== perm (ativar/desligar botão no canal) ==================
function temPermissaoDoacao(member) {
  try {
    if (!member) return false;
    if (member.id === "660311795327828008") return true;
    return CARGOS_DOACAO.some((cargoId) => member.roles?.cache?.has(cargoId));
  } catch {
    return false;
  }
}

// ================== anti-farm (pontuação) ==================
function isExemptFromScore(memberOrNull, userId) {
  try {
    if (EXEMPT_USER_IDS.has(String(userId))) return true;
    if (!memberOrNull) return false;
    return memberOrNull.roles?.cache?.some((r) => EXEMPT_ROLE_IDS.has(r.id)) || false;
  } catch {
    return false;
  }
}

function msToHuman(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

// ================== UI (botão + embed) ==================
function buildBotao(canalId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}:open:${canalId}`)
      .setLabel("📦 Registrar Doação")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildEmbedDoacao() {
  return new EmbedBuilder()
    .setColor(0x32cd32)
    .setImage(GIF_DOACAO_URL)
    .setTitle("🎁 Doações — SantaCreators")
    .setDescription(
      [
        "**Como funciona:**",
        "1) Clique em **Registrar Doação**.",
        "2) Preencha **Para quem**, **Item** e **Quantidade** (todos opcionais).",
        "3) (Opcional) Envie **1 imagem** no chat em até **2 minutos**.",
        "4) A doação é registrada nos **logs**.",
        "",
        "✅ **Anti-farm:** para a maioria, a pontuação conta **1 ponto por hora**.",
        "⚡ Isentos (pontuam sempre): Owner / Resp Creators / Você.",
      ].join("\n")
    );
}

// ================== estado em memória (por processo) ==================
const intervalosPorCanal = new Map(); // canalId -> interval

async function limparDuplicatasDoBotao(client, canal, keepMessageId = null) {
  try {
    const historico = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    if (!historico) return;

    const duplicadas = historico.filter((m) => {
      if (keepMessageId && m.id === keepMessageId) return false;

      return (
        m.author?.id === client.user.id &&
        (m.components?.length || 0) > 0 &&
        m.components.some((row) =>
          row.components?.some((c) => {
            const cid = c.customId || c.data?.custom_id || "";
            return cid.startsWith(`${PREFIXO}:open:`);
          })
        )
      );
    });

    for (const [, msg] of duplicadas) {
      await msg.delete().catch(() => {});
    }
  } catch {}
}

async function upsertBotaoNoCanal(client, canal) {
  try {
    const ui = loadUI();
    const savedMsgId = ui.buttonMessageIdByChannel?.[canal.id] || null;

    const payload = {
      content: `📝 Clique abaixo para **registrar uma doação**:`,
      embeds: [buildEmbedDoacao()],
      components: [buildBotao(canal.id)],
    };

    // 1) tenta EDITAR a msg salva
    if (savedMsgId) {
      const msg = await canal.messages.fetch(savedMsgId).catch(() => null);
      if (msg) {
        await msg.edit(payload).catch(() => {});
        await msg.pin().catch(() => {});

        // remove duplicatas mantendo essa
        await limparDuplicatasDoBotao(client, canal, msg.id);

        // remove aviso "pinned a message"
        setTimeout(async () => {
          const ultimas = await canal.messages.fetch({ limit: 5 }).catch(() => null);
          if (!ultimas) return;
          const avisoFixado = ultimas.find((m) => m.author?.id === client.user.id && m.type === 6);
          if (avisoFixado) await avisoFixado.delete().catch(() => {});
        }, 800);

        return msg;
      }

      // se não existe mais, zera pra CRIAR outra
      ui.buttonMessageIdByChannel[canal.id] = null;
      saveUI(ui);
    }

    // 2) CRIA nova
    const novaMsg = await canal.send(payload).catch(() => null);
    if (!novaMsg) return null;

    await novaMsg.pin().catch(() => {});

    setTimeout(async () => {
      const ultimas = await canal.messages.fetch({ limit: 5 }).catch(() => null);
      if (!ultimas) return;
      const avisoFixado = ultimas.find((m) => m.author?.id === client.user.id && m.type === 6);
      if (avisoFixado) await avisoFixado.delete().catch(() => {});
    }, 800);

    ui.buttonMessageIdByChannel[canal.id] = novaMsg.id;
    saveUI(ui);

    // remove duplicatas mantendo essa
    await limparDuplicatasDoBotao(client, canal, novaMsg.id);

    return novaMsg;
  } catch {
    return null;
  }
}


// ================== ranking (persistente) ==================
function loadRank() {
  const state = readJSON(FILE_RANK, {
    monthKey: getMonthKey(),
    counts: {},
    lastWinner: null,
    rankMessageId: null,
    lastScoreAtByUser: {},
    lastDashEmitAtByUser: {},
  });

  // migração segura
  if (!("rankMessageId" in state)) state.rankMessageId = null;
  if (!("lastWinner" in state)) state.lastWinner = null;
  if (!("counts" in state)) state.counts = {};
  if (!("monthKey" in state)) state.monthKey = getMonthKey();
  if (!("lastScoreAtByUser" in state)) state.lastScoreAtByUser = {};
  if (!("lastDashEmitAtByUser" in state)) state.lastDashEmitAtByUser = {};

  return rolloverIfNeeded(state);
}
function saveRank(state) {
  writeJSON(FILE_RANK, state);
}

// Decide se pontua, e já grava o "último ponto" se pontuar
function shouldScoreAndStamp(rankState, memberOrNull, userId) {
  const uid = String(userId);
  if (isExemptFromScore(memberOrNull, uid)) {
    return { score: true, exempt: true, remainingMs: 0, nextAt: 0 };
  }

  const now = Date.now();
  const last = Number(rankState.lastScoreAtByUser?.[uid] || 0);
  const delta = now - last;

  if (!last || delta >= SCORE_COOLDOWN_MS) {
    // vai pontuar -> carimba
    if (!rankState.lastScoreAtByUser) rankState.lastScoreAtByUser = {};
    rankState.lastScoreAtByUser[uid] = now;
    return { score: true, exempt: false, remainingMs: 0, nextAt: now + SCORE_COOLDOWN_MS };
  }

  const remainingMs = SCORE_COOLDOWN_MS - delta;
  return { score: false, exempt: false, remainingMs, nextAt: last + SCORE_COOLDOWN_MS };
}

function shouldEmitDashAndStamp(rankState, memberOrNull, userId) {
  const uid = String(userId);
  if (isExemptFromScore(memberOrNull, uid)) {
    return true;
  }

  const now = Date.now();
  const last = Number(rankState.lastDashEmitAtByUser?.[uid] || 0);
  const delta = now - last;

  if (!last || delta >= DASH_COOLDOWN_MS) {
    if (!rankState.lastDashEmitAtByUser) rankState.lastDashEmitAtByUser = {};
    rankState.lastDashEmitAtByUser[uid] = now;
    return true;
  }
  return false;
}

async function bumpRankAndBuildSummary(client, donorId, memberOrNull) {
  let rank = loadRank();
  rank = rolloverIfNeeded(rank);

  const decision = shouldScoreAndStamp(rank, memberOrNull, donorId);
  const dashDecision = shouldEmitDashAndStamp(rank, memberOrNull, donorId);

  // Só incrementa se pontuar
  if (decision.score) {
    rank.counts[donorId] = Number(rank.counts[donorId] || 0) + 1;
    saveRank(rank);
  } else {
    // não pontuou, mas pode salvar rank (carimbo não mudou aqui)
    saveRank(rank);
  }

  const top5 = getTop(rank, 5);
  const leader = top5[0] || null;

  const lastWinnerTxt = rank.lastWinner
    ? `🏆 **Vencedor anterior (${rank.lastWinner.monthKey}):** <@${rank.lastWinner.userId}> — **${rank.lastWinner.count}**`
    : "🏆 **Vencedor anterior:** —";

  const nowTxt = leader
    ? `🔥 **Líder do mês (${rank.monthKey}):** <@${leader.userId}> — **${leader.count}**`
    : `🔥 **Líder do mês (${rank.monthKey}):** —`;

  const topTxt = `📊 **Top 5 do mês:**\n${formatTop(top5)}`;

  const antiFarmTxt = decision.exempt
    ? `⚡ **Pontuação:** isento (conta tudo)`
    : decision.score
      ? `✅ **Pontuação:** +1 (cooldown 1h)`
      : `⏳ **Pontuação:** não contou (faltam **${msToHuman(decision.remainingMs)}**)`;

  return {
    rank,
    leader,
    scored: decision.score,
    exempt: decision.exempt,
    remainingMs: decision.remainingMs,
    summaryText: [nowTxt, lastWinnerTxt, antiFarmTxt, "", topTxt].join("\n"),
    shouldEmitDash: dashDecision,
  };
}

function buildRankEmbed(rankState) {
  const top5 = getTop(rankState, 5);
  const leader = top5[0] || null;

  return new EmbedBuilder()
    .setColor(0xff009a)
    .setTitle("🏁 Ranking de Doações — Mensal")
    .setDescription(
      [
        `📅 **Mês:** \`${rankState.monthKey}\``,
        leader ? `🔥 **Líder atual:** <@${leader.userId}> — **${leader.count}**` : `🔥 **Líder atual:** —`,
        "",
        `📊 **Top 5:**`,
        formatTop(top5),
        "",
        rankState.lastWinner
          ? `🏆 **Vencedor anterior (${rankState.lastWinner.monthKey}):** <@${rankState.lastWinner.userId}> — **${rankState.lastWinner.count}**`
          : `🏆 **Vencedor anterior:** —`,
        "",
        `🧠 **Anti-farm:** normalmente conta **1 ponto por hora** por pessoa.`,
      ].join("\n")
        )
    .setFooter({ text: `Painel fixo — atualiza automaticamente. • ${RANK_MARKER}` })
    .setTimestamp();

}

async function upsertRankingMessage(client) {
  const canalRank = await client.channels.fetch(CANAL_RANK_ID).catch(() => null);
  if (!canalRank?.isTextBased?.()) return;

  // 1) carrega do arquivo
  let rank = loadRank();
  rank = rolloverIfNeeded(rank);

  // 2) se não tem rankMessageId (ou arquivo resetou), tenta achar msg antiga no canal
  if (!rank.rankMessageId || Object.keys(rank.counts || {}).length === 0) {

    const found = await findExistingRankMessage(client, canalRank);
    if (found) {
      // tenta recuperar estado salvo dentro da msg (mesmo se arquivo sumiu)
      const recovered = decodeRankStateFromDiscord(found.content);
      if (recovered) {
        // junta com estrutura atual (migração segura)
        rank.monthKey = recovered.monthKey || rank.monthKey;
        rank.counts = recovered.counts || {};
        rank.lastWinner = recovered.lastWinner || null;
        rank.lastScoreAtByUser = recovered.lastScoreAtByUser || {};
        rank = rolloverIfNeeded(rank);
      }

      rank.rankMessageId = found.id;
      saveRank(rank);
    }
  }

  const embed = buildRankEmbed(rank);

  // conteúdo escondido que guarda o estado (persistência via Discord)
  // const stateB64 = encodeRankStateForDiscord(rank); // Removido para limpar visual
  const contentHidden = `‎\n${RANK_MARKER}`; // Mantém apenas o marcador (com caractere invisível)

  // 3) tenta editar a msg salva (ou encontrada)
  if (rank.rankMessageId) {
    const msg = await canalRank.messages.fetch(rank.rankMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ content: contentHidden, embeds: [embed] }).catch(() => {});
      await msg.pin().catch(() => {});

      // remove duplicadas do painel, mantendo só essa
      await limparDuplicatasRanking(client, canalRank, msg.id);

      // remove aviso de fixado
      setTimeout(async () => {
        const ultimas = await canalRank.messages.fetch({ limit: 5 }).catch(() => null);
        if (!ultimas) return;
        const avisoFixado = ultimas.find((m) => m.author?.id === client.user.id && m.type === 6);
        if (avisoFixado) await avisoFixado.delete().catch(() => {});
      }, 800);

      return;
    }

    // se não achou, zera pra recriar (apagaram a msg)
    rank.rankMessageId = null;
    saveRank(rank);
  }

  // 4) se não existe nenhuma, cria UMA e salva
  const nova = await canalRank.send({ content: contentHidden, embeds: [embed] }).catch(() => null);
  if (!nova) return;

  await nova.pin().catch(() => {});
  setTimeout(async () => {
    const ultimas = await canalRank.messages.fetch({ limit: 5 }).catch(() => null);
    if (!ultimas) return;
    const avisoFixado = ultimas.find((m) => m.author?.id === client.user.id && m.type === 6);
    if (avisoFixado) await avisoFixado.delete().catch(() => {});
  }, 800);

  rank.rankMessageId = nova.id;
  saveRank(rank);

  // se por algum motivo tinha outra perdida, limpa
  await limparDuplicatasRanking(client, canalRank, nova.id);
}


// ================== handlers (pra usar no teu roteador) ==================
export async function doacaoHandleMessage(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return false;
    const content = (message.content || "").trim().toLowerCase();

    // !doacao — ativa botão universal no canal
    if (content.startsWith("!doacao")) {
      if (!temPermissaoDoacao(message.member)) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        await message
          .reply("❌ Você não tem permissão para usar esse comando.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
          .catch(() => {});
        return true;
      }

      await message.delete().catch(() => {});

      const canais = readJSON(FILE_CANAIS, {});
      canais[message.channel.id] = true;
      writeJSON(FILE_CANAIS, canais);

            await upsertBotaoNoCanal(client, message.channel);

      // agenda refresh a cada 24h (por canal) -> agora só edita / recria se apagaram
      if (intervalosPorCanal.has(message.channel.id)) {
        clearInterval(intervalosPorCanal.get(message.channel.id));
      }
      const intervalo = setInterval(() => upsertBotaoNoCanal(client, message.channel), TEMPO_ATUALIZACAO);
      intervalosPorCanal.set(message.channel.id, intervalo);


      const aviso = await message.channel.send(`📦 Botão de doações **ativado** neste canal.`);
      setTimeout(() => aviso.delete().catch(() => {}), 5 * 60 * 1000);
      return true;
    }

    // !desligardoacao — desativa no canal
    if (content.startsWith("!desligardoacao")) {
      if (!temPermissaoDoacao(message.member)) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        await message
          .reply("❌ Você não tem permissão para usar esse comando.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
          .catch(() => {});
        return true;
      }

      await message.delete().catch(() => {});

      if (intervalosPorCanal.has(message.channel.id)) {
        clearInterval(intervalosPorCanal.get(message.channel.id));
        intervalosPorCanal.delete(message.channel.id);
      }

            // apaga a msg do botão se existir no UI state
      const ui = loadUI();
      const savedMsgId = ui.buttonMessageIdByChannel?.[message.channel.id] || null;

      if (savedMsgId) {
        const msg = await message.channel.messages.fetch(savedMsgId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }

      // limpa do state
      if (!ui.buttonMessageIdByChannel) ui.buttonMessageIdByChannel = {};
      delete ui.buttonMessageIdByChannel[message.channel.id];
      saveUI(ui);

      // limpa duplicatas restantes do histórico (se existir)
      await limparDuplicatasDoBotao(client, message.channel, null);


      const canais = readJSON(FILE_CANAIS, {});
      delete canais[message.channel.id];
      writeJSON(FILE_CANAIS, canais);

      const aviso = await message.channel.send("🛑 O botão de doação automático foi **desativado** neste canal.");
      setTimeout(() => aviso.delete().catch(() => {}), 15000);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function doacaoHandleInteraction(interaction, client) {
  try {
    if (!interaction) return false;

    // ===== BOTÃO abre modal =====
    if (interaction.isButton?.() && interaction.customId?.startsWith(`${PREFIXO}:open:`)) {
      const canalId = interaction.customId.split(`${PREFIXO}:open:`)[1];

      const modal = new ModalBuilder()
        .setCustomId(`${PREFIXO}:modal:${canalId}`)
        .setTitle("📦 Registrar Doação");

      const paraQuem = new TextInputBuilder()
        .setCustomId("para_quem")
        .setLabel("👤 Para quem? (Nome ou ID) — OPCIONAL")
        .setPlaceholder("Nome + id ou 123456789012345678")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const item = new TextInputBuilder()
        .setCustomId("item")
        .setLabel("🧾 Item — OPCIONAL")
        .setPlaceholder("ex.: COCA")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const qtd = new TextInputBuilder()
        .setCustomId("quantidade")
        .setLabel("📦 Quantidade — OPCIONAL")
        .setPlaceholder("ex.: 3x, 1kg, 2 unid...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(paraQuem),
        new ActionRowBuilder().addComponents(item),
        new ActionRowBuilder().addComponents(qtd)
      );

      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    // ===== MODAL submit =====
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith(`${PREFIXO}:modal:`)) {
      const canalId = interaction.customId.split(`${PREFIXO}:modal:`)[1];
      const canal = await client.channels.fetch(canalId).catch(() => interaction.channel);

      const rawParaQuem = (interaction.fields.getTextInputValue("para_quem") || "").trim();
      const rawItem = (interaction.fields.getTextInputValue("item") || "").trim();
      const rawQtd = (interaction.fields.getTextInputValue("quantidade") || "").trim();

      let userId = null;
      if (rawParaQuem) {
        const mentionMatch = rawParaQuem.match(/^<@!?(\d+)>$/);
        if (mentionMatch) userId = mentionMatch[1];
        else if (/^\d{5,}$/.test(rawParaQuem)) userId = rawParaQuem;
      }

      const displayParaQuem = userId ? `<@${userId}>` : rawParaQuem || "—";
      const displayItem = rawItem || "—";
      const displayQtd = rawQtd || "—";

      await interaction
        .reply({
          content: "📸 Você tem até **2 minutos** para enviar **1 imagem** neste chat (opcional).",
          ephemeral: true,
        })
        .catch(() => {});

      // coletor de 1 imagem (opcional)
      let collectedMsg = null;
      const collector = canal.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
        max: 1,
        time: 2 * 60 * 1000,
      });

      collector.on("collect", (msg) => {
        collectedMsg = msg;
      });

      collector.on("end", async () => {
        // >>> atualiza ranking (anti-farm: pode NÃO pontuar) <<<
        const member = interaction.member || null;
        const { summaryText, scored, exempt, remainingMs, shouldEmitDash } = await bumpRankAndBuildSummary(
          client,
          interaction.user.id,
          member
        );

        // 📊 DASH (só conta quando pontua mesmo)
        if (shouldEmitDash) {
  dashEmit("doacao:registrada", {
    userId: interaction.user.id,
    __at: Date.now(),
    source: "doacao",
  });
}


        const scoreLine = exempt
          ? "⚡ Pontuação: **isento** (conta tudo)"
          : scored
            ? "✅ Pontuação: **+1** (limite 1/h)"
            : `⏳ Pontuação: **não contou** (faltam **${msToHuman(remainingMs)}**)`;

        const embedBase = new EmbedBuilder()
          .setTitle("📦 Nova Doação Registrada")
          .addFields(
            { name: "👤 Doado para", value: displayParaQuem, inline: true },
            { name: "🧾 Item", value: displayItem, inline: true },
            { name: "📦 Quantidade", value: displayQtd, inline: true },
            { name: "✍️ Registrado por", value: `<@${interaction.user.id}>`, inline: false },
            { name: "🧠 Anti-farm", value: scoreLine, inline: false },
            { name: "🏁 Ranking mensal (1–31)", value: summaryText, inline: false }
          )
          .setTimestamp()
          .setColor("Green");

        const canalLog = await resolveLogChannel(client, CANAL_LOGS_ID);

        if (collectedMsg && collectedMsg.attachments.size > 0) {
          const att = collectedMsg.attachments.first();
          const fileName = att?.name || `doacao-${Date.now()}.png`;
          const file = { attachment: att.url, name: fileName };
          const embed = EmbedBuilder.from(embedBase).setImage(`attachment://${fileName}`);

          if (canalLog) await canalLog.send({ embeds: [embed], files: [file] }).catch(() => {});
          await collectedMsg.delete().catch(() => {});
          await interaction.followUp({ content: "✅ Doação registrada **com imagem**!", ephemeral: true }).catch(() => {});
        } else {
          if (canalLog) await canalLog.send({ embeds: [embedBase] }).catch(() => {});
          await interaction.followUp({ content: "✅ Doação registrada **sem imagem**.", ephemeral: true }).catch(() => {});
        }

        // ✅ Ranking FIXO: atualiza sempre (mesmo se não pontuar, pra manter painel vivo)
        await upsertRankingMessage(client);

        // ✅ Só garante que o botão do canal atual existe/está atualizado
        const canalAtual = interaction.channel;
        if (canalAtual?.isTextBased?.()) {
          await upsertBotaoNoCanal(client, canalAtual);
        }

      });

      return true;
    }

    return false;
  } catch (e) {
    try {
      if (interaction?.isRepliable?.()) {
        if (interaction.deferred) await interaction.editReply("⚠️ Ocorreu um erro ao processar a ação.");
        else await interaction.reply({ content: "⚠️ Ocorreu um erro ao processar a ação.", ephemeral: true });
      }
    } catch {}
    console.error("[SC_DOACAO] erro:", e);
    return true; // tratou (deu erro mas é desse módulo)
  }
}

export async function doacaoOnReady(client) {
  try {
    ensureStore();

    // 🔎 DEBUG PERSISTÊNCIA (pra matar a dúvida do reset)
    // console.log(`[SC_DOACAO] PERSIST_ROOT => ${PERSIST_ROOT || "(fallback ../data)"}`);
    // console.log(`[SC_DOACAO] BASE_DIR => ${BASE_DIR}`);
    // console.log(`[SC_DOACAO] FILE_RANK => ${FILE_RANK} | exists=${fs.existsSync(FILE_RANK) ? "YES" : "NO"}`);
    // console.log(`[SC_DOACAO] FILE_UI   => ${FILE_UI}   | exists=${fs.existsSync(FILE_UI) ? "YES" : "NO"}`);
    // console.log(`[SC_DOACAO] FILE_CANAIS=> ${FILE_CANAIS}| exists=${fs.existsSync(FILE_CANAIS) ? "YES" : "NO"}`);


    // garante rollover mensal ao ligar
    const rank = loadRank();
    saveRank(rank);

    // ✅ garante que o painel do ranking fixo exista/esteja atualizado
    await upsertRankingMessage(client);


    // restaura canais ativos e recria botões
    const canais = readJSON(FILE_CANAIS, {});
    for (const canalId of Object.keys(canais || {})) {
      const canal = await client.channels.fetch(canalId).catch(() => null);
      if (!canal?.isTextBased?.()) continue;

            // garante 1 botão por canal e só edita (recria se apagaram)
      await upsertBotaoNoCanal(client, canal);

      if (intervalosPorCanal.has(canal.id)) clearInterval(intervalosPorCanal.get(canal.id));
      const intervalo = setInterval(() => upsertBotaoNoCanal(client, canal), TEMPO_ATUALIZACAO);
      intervalosPorCanal.set(canal.id, intervalo);

    }

    console.log(`✅ [SC_DOACAO] pronto | logs=${CANAL_LOGS_ID} rank=${CANAL_RANK_ID} (FIXO) | anti-farm=1/h`);

  } catch (e) {
    console.error("[SC_DOACAO] onReady error:", e);
  }
}
