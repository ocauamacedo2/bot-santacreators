import { ChannelType, PermissionFlagsBits, Events } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const VOICE_CHANNEL_ID_PADRAO = "1415386915137388664";

const RECONNECT_MIN_DELAY = 3_000;
const RECONNECT_MAX_DELAY = 30_000;

const log = (...a) => console.log("🎧 [AutoJoin]", ...a);
const warn = (...a) => console.warn("⚠️ [AutoJoin]", ...a);
const err = (...a) => console.error("❌ [AutoJoin]", ...a);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function fetchVoiceChannel(client) {
  const canal = await client.channels.fetch(VOICE_CHANNEL_ID_PADRAO).catch(() => null);
  if (!canal) return { ok: false, reason: "not_found" };
  if (canal.type !== ChannelType.GuildVoice) return { ok: false, reason: "not_voice" };
  return { ok: true, canal };
}

function isHealthyConnection(conn, channelId) {
  if (!conn) return false;
  if (conn.joinConfig?.channelId !== channelId) return false;

  // ✅ só considera “ok” se estiver READY
  return conn.state.status === VoiceConnectionStatus.Ready;
}

async function ensureConnection(client, reason = "ensure") {
  if (client.__autojoinLock) return;
  client.__autojoinLock = true;

  try {
    // log(`ensureConnection(${reason})`);

    const result = await fetchVoiceChannel(client);
    if (!result.ok) {
      if (result.reason === "not_found") err("Canal não encontrado. ID:", VOICE_CHANNEL_ID_PADRAO);
      else err("O canal informado não é GuildVoice.");
      return;
    }

    const canal = result.canal;
    const guild = canal.guild;
    if (!guild) return err("Não consegui pegar a guild pelo canal.");

    const me =
      guild.members.me ?? (await guild.members.fetch(client.user.id).catch(() => null));
    if (!me) return err("Não consegui buscar o member do bot na guild.");

    const perms = canal.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ViewChannel)) return err("Sem VIEW_CHANNEL no canal.");
    if (!perms?.has(PermissionFlagsBits.Connect)) return err("Sem CONNECT no canal.");
    if (!perms?.has(PermissionFlagsBits.Speak)) warn("Sem SPEAK (entra, mas não fala).");

    const conn = getVoiceConnection(guild.id);

    // ✅ AGORA: só “já está no canal” se estiver READY
    if (isHealthyConnection(conn, canal.id)) {
      // log("Já está no canal padrão e READY ✅");
      return;
    }

    // se existe conexão mas tá ruim/desconectada, mata ela
    if (conn) {
      warn(`Conexão existe mas não está READY (status=${conn.state.status}). Reiniciando conexão...`);
      try { conn.destroy(); } catch {}
      await wait(2000); // Espera 2s para garantir que desconectou limpo
    }

    log(`Conectando no canal: ${canal.name} (${canal.id}) [${reason}]`);

    const connection = joinVoiceChannel({
      channelId: canal.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      log("Conectado e READY ✅");
    } catch {
      warn("Não ficou READY em 20s. Vou continuar tentando pelo monitor.");
    }

    attachGuards(client, guild.id);
  } catch (e) {
    err("Erro no ensureConnection:", e);
  } finally {
    client.__autojoinLock = false;
  }
}

function attachGuards(client, guildId) {
  if (client.__autojoinGuardsAttached) return;
  client.__autojoinGuardsAttached = true;

  log("Guards ativados (reconnect + anti-move).");

  let backoff = RECONNECT_MIN_DELAY;

  const scheduleReconnect = async (why) => {
    const delay = clamp(backoff, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);
    backoff = clamp(backoff * 1.6, RECONNECT_MIN_DELAY, RECONNECT_MAX_DELAY);

    warn(`Reconnect em ${delay}ms (${why})`);
    await wait(delay);
    await ensureConnection(client, `reconnect:${why}`);
  };

  // monitor a cada 10s
  client.__autojoinInterval && clearInterval(client.__autojoinInterval);
  client.__autojoinInterval = setInterval(() => {
    const conn = getVoiceConnection(guildId);

    if (!conn) {
      scheduleReconnect("no_connection").catch(() => {});
      return;
    }

    const st = conn.state.status;

    // ✅ se não estiver READY, reconecta
    if (st !== VoiceConnectionStatus.Ready) {
      scheduleReconnect(`status:${st}`).catch(() => {});
    } else {
      backoff = RECONNECT_MIN_DELAY;
    }
  }, 10_000);

  // anti-move (se moverem/kickarem o bot, volta)
  if (!client.__autojoinVoiceStateHook) {
    client.__autojoinVoiceStateHook = true;

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      // Ignora eventos que não são do bot
      if (!client.user || newState.id !== client.user.id) return;

      const oldCh = oldState.channelId;
      const newCh = newState.channelId;

      // Se não houve mudança, não faz nada
      if (oldCh === newCh) return;

      // Loga a mudança para depuração
      warn(`Estado de voz do bot alterado: ${oldCh ?? 'Nenhum'} -> ${newCh ?? 'Nenhum'}`);

      // Cenário 1: O bot foi movido para um canal que NÃO é o canal padrão.
      // Ação: Forçar o retorno ao canal correto.
      if (newCh && newCh !== VOICE_CHANNEL_ID_PADRAO) {
        warn(`[Anti-Move] Bot movido para canal incorreto. Forçando retorno...`);
        // Um pequeno delay ajuda a evitar race conditions com a API do Discord.
        setTimeout(() => ensureConnection(client, "moved_to_wrong_channel"), 1500);
        return;
      }

      // Cenário 2: O bot foi desconectado. Ação: Não fazer nada. O monitor periódico
      // (setInterval) já está configurado para reconectar com backoff, evitando loops.
      if (!newCh) {
        warn("[Anti-Move] Bot desconectado. Aguardando monitor periódico...");
        return;
      }
    });
  }
}

export function iniciarAutoJoin(client) {
  if (client.__autoJoinStarted) return;
  client.__autoJoinStarted = true;

  log("Módulo carregado (v2 - FIX LOOP ATIVO).");

  const run = async () => {
    log("Client READY — iniciando autojoin...");
    await ensureConnection(client, "startup");

    setInterval(() => {
      ensureConnection(client, "interval").catch(() => {});
    }, 3 * 60 * 1000);
  };

  if (client.isReady()) run();
  else client.once(Events.ClientReady, run);
}
