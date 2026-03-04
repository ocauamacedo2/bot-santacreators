// ./events/roleProtect.js
import { AuditLogEvent, PermissionFlagsBits } from "discord.js";

// ======================================================
// SC_ROLE_PROTECT — Proteção contra remoção de cargos
// • Protege cargos de usuários protegidos contra terceiros
// • EXCEÇÃO: o próprio protegido pode remover os próprios cargos (SELF)
// • EXCEÇÃO: ALLOWED_REMOVERS pode remover cargos de protegidos sem restore/punição
// • Intercepta !remcargo: só pune se alvo for PROTEGIDO e autor não for allowed
// ======================================================

// ===== CONFIG =====
const PROTECTED_USER_IDS = [
  "660311795327828008",  // eu (usuário)
  "1262262852949905408", // owner
  "1352741003639132160", // admin
  "1352408327983861844", // resp creator
  "1262262852949905409", // resp influ
];

const CANAL_CREATORS_ID = "1381597720007151698"; // canal onde manda o aviso público

const EXEMPT_ROLE_IDS = [
  // roles que você NUNCA quer que o bot remova do executor (ex: staff)
  // se não quiser, deixa vazio
];

const ALLOWED_REMOVERS = [
  // quem pode mexer em protegido sem o bot interferir
  "1262262852949905408", // owner
  "660311795327828008",  // você
];

// Mensagens personalizadas
const DM_TO_EXECUTOR = (executorTag, victimTag) =>
  `Eita, ${executorTag}... você realmente tentou remover os cargos do DONO da SantaCreators (${victimTag})??? Mais respeito, mero mortal... 😏`;

const DM_TO_VICTIM = (victimTag, executorTag) =>
  `Alerta: ${executorTag} tentou remover seus cargos. Já reverti e tomei providências.`;

const PUBLIC_MSG = (executorId, victimTag) =>
  `<@${executorId}> tentou remover cargos do ${victimTag} — nosso sistema não perdoa, mero mortal. 👑`;

// ===== helpers =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isProtected(userId) {
  return PROTECTED_USER_IDS.includes(userId);
}
function isAllowedRemover(userId) {
  return ALLOWED_REMOVERS.includes(userId);
}
function isRecent(entry, ms = 10_000) {
  return entry && (Date.now() - entry.createdTimestamp) < ms;
}

function getCreatorsChannel(guild) {
  const ch = guild.channels.cache.get(CANAL_CREATORS_ID);
  return ch && ch.isTextBased() ? ch : null;
}

function rolesRemoviveisDoExecutor(execMember) {
  const guild = execMember.guild;
  const botMember = guild.members.me;
  if (!botMember) return [];

  return execMember.roles.cache
    .filter((r) =>
      r &&
      r.id !== guild.id &&                 // não @everyone
      !r.managed &&                        // não integração/bot
      !EXEMPT_ROLE_IDS.includes(r.id) &&   // não isentas
      botMember.roles.highest.position > r.position // bot acima
    )
    .map((r) => r.id);
}

async function fetchRecentRoleUpdateExecutor(guild, targetUserId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 6,
    });

    const entry = logs.entries.find(
      (e) => e?.target?.id === targetUserId && isRecent(e, 15_000)
    );

    return entry?.executor ?? null;
  } catch {
    return null;
  }
}

// ======================================================
// HOOK: READY
// ======================================================
export async function roleProtectOnReady(client) {
  try {
    if (client.__SC_ROLE_PROTECT_READY_ONCE) return;
    client.__SC_ROLE_PROTECT_READY_ONCE = true;

    const guild = client.guilds.cache.first();
    const botMember = guild?.members?.me;

    if (!botMember) {
      console.log("[ROLE-PROTECT] ready: guild/me indisponível (ok).");
      return;
    }

    const need = [
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.SendMessages,
    ];

    const hasAll = need.every((p) => botMember.permissions.has(p));
    // console.log(
    //   `[ROLE-PROTECT] ready: perms ok? ${hasAll ? "SIM" : "NÃO"} (ManageRoles/ViewAuditLog/SendMessages)`
    // );
  } catch (e) {
    console.warn("[ROLE-PROTECT] ready erro:", e?.message ?? e);
  }
}

// ======================================================
// HOOK: GUILD MEMBER UPDATE (proteção real)
// ======================================================
export async function roleProtectHandleGuildMemberUpdate(oldMember, newMember, client) {
  try {
    // Só protege “alvos protegidos”
    if (!isProtected(newMember.id)) return false;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    const removed = [...oldRoles].filter((rid) => !newRoles.has(rid));
    if (removed.length === 0) return false;

    const guild = newMember.guild;

    // ✅ FIX: Aguarda propagação do Audit Log (evita falso positivo em self-remove)
    await sleep(2000);

    // tenta achar executor
    const executorUser = await fetchRecentRoleUpdateExecutor(guild, newMember.id);
    const executorId = executorUser?.id || null;

    // ✅ 1) SE FOI O PRÓPRIO PROTEGIDO REMOVENDO (SELF) → NÃO RESTAURA, NÃO PUNE
    // (mesmo que audit log venha vazio, o comportamento “self” normalmente não aparece.
    // então só consideramos self quando executorId bate.)
    if (executorId && executorId === newMember.id) {
      console.log(`[ROLE-PROTECT] SELF: ${newMember.user.tag} removeu cargos próprios. Não vou restaurar.`);
      return false;
    }

    // ✅ 2) SE O EXECUTOR É ALLOWED → NÃO RESTAURA, NÃO PUNE
    if (executorId && isAllowedRemover(executorId)) {
      console.log(`[ROLE-PROTECT] ALLOWED: ${executorUser.tag} mexeu em protegido (${newMember.user.tag}). Não vou restaurar.`);
      return false;
    }

    // Re-adiciona roles removidas que o bot consegue gerenciar
    const rolesToRestore = removed
      .map((rid) => guild.roles.cache.get(rid))
      .filter((role) => role && role.editable)
      .map((role) => role.id);

    if (rolesToRestore.length > 0) {
      await newMember.roles
        .add(rolesToRestore, "Proteção: restauração de cargos protegidos")
        .catch(() => {});
    }

    // Se não achou executor: restaura e avisa (fail-safe)
    if (!executorId) {
      await newMember
        .send("Alerta: detectei remoção de cargos e já restaurei. Executor não identificado (audit log).")
        .catch(() => {});
      console.log(`[ROLE-PROTECT] Executor não identificado. Restore=${rolesToRestore.length} em ${newMember.user.tag}`);
      return true;
    }

    // executor fetch
    const execMember = await guild.members.fetch(executorId).catch(() => null);

    // Se executor inválido ou bot/protegido → só restaura (já foi) e avisa
    if (!execMember || execMember.user.bot || isProtected(execMember.id)) {
      await newMember
        .send("Alerta: detectei remoção de cargos e já restaurei. Executor era bot/protegido ou não foi encontrado.")
        .catch(() => {});
      return true;
    }

    // ✅ 3) aqui sim: terceiro não-allowed mexeu em protegido → pune
    const punishRoleIds = rolesRemoviveisDoExecutor(execMember);

    if (punishRoleIds.length > 0) {
      await execMember.roles
        .remove(punishRoleIds, `Tentativa de remoção de cargos protegidos (${newMember.id})`)
        .catch(() => {});
    }

    await execMember
      .send(DM_TO_EXECUTOR(execMember.user.tag, `${newMember.user.tag}`))
      .catch(() => {});
    await newMember
      .send(DM_TO_VICTIM(`${newMember.user.tag}`, execMember.user.tag))
      .catch(() => {});

    const creatorsChannel = getCreatorsChannel(guild);
    if (creatorsChannel) {
      await creatorsChannel
        .send(PUBLIC_MSG(execMember.id, `${newMember.user.tag}`))
        .catch(() => {});
    }

    console.log(
      `[ROLE-PROTECT] ${execMember.user.tag} mexeu em ${newMember.user.tag}. ` +
      `Restore=${rolesToRestore.length} | PunishRemoved=${punishRoleIds.length}`
    );

    return true;
  } catch (err) {
    console.error("[ROLE-PROTECT] erro no guildMemberUpdate:", err);
    return false;
  }
}

// ======================================================
// HOOK: MESSAGE CREATE (intercepta !remcargo)
// ✅ agora: só pune se o ALVO do comando for PROTEGIDO
// ======================================================
export async function roleProtectHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;

    const content = message.content?.trim();
    if (!content) return false;

    if (!content.toLowerCase().startsWith("!remcargo")) return false;

    const guild = message.guild;
    const execMember = message.member;
    if (!guild || !execMember) return false;

    // tenta descobrir alvo
    const targetUser = message.mentions?.users?.first?.() || null;

    let targetId = targetUser?.id || null;
    if (!targetId) {
      const match = content.match(/\b(\d{15,20})\b/);
      if (match) targetId = match[1];
    }

    // sem alvo detectável -> não pune
    if (!targetId) return false;

    // alvo não protegido -> não interfere
    if (!isProtected(targetId)) return false;

    // se autor é allowed -> deixa rodar
    if (isAllowedRemover(message.author.id)) return false;

    // 🚨 tentou usar !remcargo em protegido sem permissão
    const punishRoleIds = rolesRemoviveisDoExecutor(execMember);

    if (punishRoleIds.length > 0) {
      await execMember.roles
        .remove(punishRoleIds, "Tentou usar !remcargo em usuário protegido")
        .catch(() => {});
    }

    await execMember
      .send(DM_TO_EXECUTOR(execMember.user.tag, `<@${targetId}>`))
      .catch(() => {});

    const victimMember = await guild.members.fetch(targetId).catch(() => null);
    if (victimMember) {
      await victimMember
        .send(DM_TO_VICTIM(victimMember.user.tag, execMember.user.tag))
        .catch(() => {});
    }

    const creatorsChannel = getCreatorsChannel(guild);
    if (creatorsChannel) {
      await creatorsChannel
        .send(PUBLIC_MSG(execMember.id, `<@${targetId}>`))
        .catch(() => {});
    }

    await message.delete().catch(() => {});
    return true;
  } catch (err) {
    console.error("[ROLE-PROTECT] erro no messageCreate:", err);
    return false;
  }
}
