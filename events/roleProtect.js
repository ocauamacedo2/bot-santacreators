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
  // ✅ ADD BOT ID HERE dynamically in roleProtectOnReady
  // "YOUR_BOT_ID_HERE",
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

async function getCreatorsChannel(guild) {
  const ch = await guild.channels.fetch(CANAL_CREATORS_ID).catch(() => null);
  return ch?.isTextBased() ? ch : null;
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

// ✅ NOVO: maior posição real entre oldMember/newMember
function getComparableHighestRolePosition(...members) {
  let highest = -1;

  for (const member of members) {
    const pos = member?.roles?.highest?.position ?? -1;
    if (pos > highest) highest = pos;
  }

  return highest;
}

// ✅ NOVO: tenta identificar entrada correta do audit log com retries
async function fetchRecentRoleUpdateEntry(guild, targetUserId, removedRoleIds = []) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 12,
      });

      const entry = logs.entries.find((e) => {
        if (!e) return false;
        if (e?.target?.id !== targetUserId) return false;
        if (!isRecent(e, 30_000)) return false;

        const changes = Array.isArray(e.changes) ? e.changes : [];

        const removedRolesFromLog = changes
          .filter((c) => c?.key === "$remove" && Array.isArray(c?.new))
          .flatMap((c) => c.new.map((r) => r?.id).filter(Boolean));

        if (removedRoleIds.length === 0) return true;

        return removedRoleIds.some((rid) => removedRolesFromLog.includes(rid));
      });

      if (entry) return entry;
    } catch {}

    await sleep(1500);
  }

  return null;
}

// ✅ compatibilidade com o resto do arquivo
async function fetchRecentRoleUpdateExecutor(guild, targetUserId, removedRoleIds = []) {
  const entry = await fetchRecentRoleUpdateEntry(guild, targetUserId, removedRoleIds);
  return entry?.executor ?? null;
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

    // ✅ Add bot's ID to ALLOWED_REMOVERS dynamically
    if (!ALLOWED_REMOVERS.includes(client.user.id)) {
      ALLOWED_REMOVERS.push(client.user.id);
      console.log(`[ROLE-PROTECT] Added bot ID (${client.user.id}) to ALLOWED_REMOVERS.`);
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

    // ✅ Aguarda a propagação do audit log
    await sleep(2500);

    // ✅ Busca entrada mais confiável do audit log, casando também com os cargos removidos
    const auditEntry = await fetchRecentRoleUpdateEntry(guild, newMember.id, removed);
    const executorUser = auditEntry?.executor ?? null;
    const executorId = executorUser?.id || null;

    // ✅ 1) SELF
    if (executorId && executorId === newMember.id) {
      return false;
    }

    // ✅ 2) ALLOWED
    if (executorId && isAllowedRemover(executorId)) {
      console.log(`[ROLE-PROTECT] ALLOWED: ${executorUser.tag} mexeu em protegido (${newMember.user.tag}). Não vou restaurar.`);
      return false;
    }

    // ✅ 3) HIERARCHY CHECK REAL
    // compara com o maior cargo do alvo entre ANTES e DEPOIS, evitando falso restore
    const executorMember = executorId
      ? await guild.members.fetch(executorId).catch(() => null)
      : null;

    if (executorMember) {
      const executorHighestPos = getComparableHighestRolePosition(executorMember);
      const targetHighestPos = getComparableHighestRolePosition(oldMember, newMember);

      if (executorHighestPos > targetHighestPos) {
        console.log(
          `[ROLE-PROTECT] HIERARCHY ALLOWED: ${executorMember.user.tag} ` +
          `(pos ${executorHighestPos}) removeu cargo de protegido ${newMember.user.tag} ` +
          `(pos ${targetHighestPos}). Não vou restaurar.`
        );
        return false;
      }
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

    // Se não achou executor: restaura e avisa
    if (!executorId) {
      await newMember
        .send("Alerta: detectei remoção de cargos e já restaurei. Executor não identificado com segurança no audit log.")
        .catch(() => {});
      console.log(
        `[ROLE-PROTECT] Executor não identificado com segurança. ` +
        `Target=${newMember.user.tag} | Removed=${removed.join(", ") || "nenhum"} | Restore=${rolesToRestore.length}`
      );
      return true;
    }

    // executor fetch
    const execMember = executorMember || await guild.members.fetch(executorId).catch(() => null);

    // Se executor inválido ou bot/protegido → só restaura (já foi) e avisa
    if (!execMember || execMember.user.bot || isProtected(execMember.id)) {
      await newMember
        .send("Alerta: detectei remoção de cargos e já restaurei. Executor era bot/protegido ou não foi encontrado.")
        .catch(() => {});
      return true;
    }

    // aqui sim: terceiro não-allowed mexeu em protegido → pune
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

    const creatorsChannel = await getCreatorsChannel(guild);
    if (creatorsChannel) {
      await creatorsChannel
        .send(PUBLIC_MSG(execMember.id, `${newMember.user.tag}`))
        .catch(() => {});
    }

    console.log(
      `[ROLE-PROTECT] ${execMember.user.tag} mexeu em ${newMember.user.tag}. ` +
      `Removed=${removed.join(", ") || "nenhum"} | Restore=${rolesToRestore.length} | PunishRemoved=${punishRoleIds.length}`
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

    // ✅ NEW: HIERARCHY CHECK for !remcargo on protected user
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember) {
      const executorHighestPos = getHighestRolePosition(execMember);
      const targetHighestPos = getHighestRolePosition(targetMember);

      if (executorHighestPos > targetHighestPos) {
        console.log(`[ROLE-PROTECT] HIERARCHY ALLOWED (!remcargo): ${execMember.user.tag} (pos ${executorHighestPos}) usou !remcargo em protegido ${targetMember.user.tag} (pos ${targetHighestPos}). Não vou punir.`);
        return false; // Allow !remcargo, do not punish executor.
      }
    }

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
    
    const creatorsChannel = await getCreatorsChannel(client, guild);
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
