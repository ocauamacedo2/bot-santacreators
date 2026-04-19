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
];

const ALLOWED_REMOVERS = [
  "1262262852949905408", // owner
  "660311795327828008",  // você
];

// Cargos que nem o próprio usuário pode remover de si mesmo (segurança do bot)
const SELF_LOCKED_ROLE_IDS = ["1352493359897378941"]; 

// Mensagens personalizadas
const DM_TO_EXECUTOR = (executorTag, victimTag) =>
  `Eita, ${executorTag}... você realmente tentou remover os cargos do responsável da SantaCreators (${victimTag})??? Mais respeito, mero mortal... 😏`;

const DM_TO_VICTIM = (victimTag, executorTag) =>
  `Alerta: ${executorTag} tentou remover seus cargos. Já reverti e tomei providências.`;

const PUBLIC_MSG = (executorId, victimTag) =>
  `<@${executorId}> tentou remover cargos do ${victimTag} — nosso sistema não perdoa, mero mortal. 👑`;

// ===== HELPERS =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isProtected(userId) {
  return PROTECTED_USER_IDS.includes(userId);
}
function isAllowedRemover(userId) {
  return ALLOWED_REMOVERS.includes(userId);
}

function hasGlobalBypass(userId) {
  if (!globalThis.__SC_ROLE_BYPASS__) return false;
  const t = globalThis.__SC_ROLE_BYPASS__.get(String(userId));
  if (!t) return false;
  if (Date.now() > t) {
    globalThis.__SC_ROLE_BYPASS__.delete(String(userId));
    return false;
  }
  return true;
}

function isRecent(entry, ms = 15_000) {
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
      botMember.roles.highest.position > r.position // bot consegue tirar
    )
    .map((r) => r.id);
}

/**
 * Pega a maior posição de cargo de um membro.
 * @param {import("discord.js").GuildMember} member 
 */
function getHighestRolePosition(member) {
  if (!member) return -1;
  return member.roles.highest?.position ?? -1;
}

/**
 * Busca entrada recente do audit log com retries para garantir que o Discord processou a ação.
 */
async function fetchRecentRoleUpdateEntry(guild, targetUserId, removedRoleIds = []) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 8,
      });

      const entry = logs.entries.find((e) => {
        if (!e || e.target?.id !== targetUserId) return false;
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
    if (attempt < maxAttempts) await sleep(1000);
  }
  return null;
}

// ======================================================
// HOOK: READY
// ======================================================
export async function roleProtectOnReady(client) {
  try {
    if (client.__SC_ROLE_PROTECT_READY_ONCE) return;
    client.__SC_ROLE_PROTECT_READY_ONCE = true;

    if (!ALLOWED_REMOVERS.includes(client.user.id)) {
      ALLOWED_REMOVERS.push(client.user.id);
    }
    console.log("[ROLE-PROTECT] Sistema de proteção carregado.");
  } catch (e) {
    console.warn("[ROLE-PROTECT] ready erro:", e);
  }
}

// ======================================================
// HOOK: GUILD MEMBER UPDATE (Proteção por UI/Clique)
// ======================================================
export async function roleProtectHandleGuildMemberUpdate(oldMember, newMember, client) {
  try {
    // Só protege alvos configurados
    if (!isProtected(newMember.id)) return false;

    // ✅ Check global bypass (setado por outros sistemas como gestaoinfluencer)
    if (hasGlobalBypass(newMember.id)) return false;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    // Identifica quais cargos sumiram
    const removed = [...oldRoles].filter((rid) => !newRoles.has(rid));
    if (removed.length === 0) return false;

    const guild = newMember.guild;

    // ✅ Aguarda um pouco mais a propagação do log do Discord
    await sleep(3000);

    const auditEntry = await fetchRecentRoleUpdateEntry(guild, newMember.id, removed);
    const executorUser = auditEntry?.executor ?? null;
    const executorId = executorUser?.id || null;

    // 1) Se o executor for o próprio bot (remoção legítima programada), libera
    if (executorId === client.user.id) return false;

    // ✅ BYPASS TOTAL PARA OWNER E USUÁRIOS AUTORIZADOS
    const envOwners = (process.env.OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
    const isAuthorized = executorId && (envOwners.includes(executorId) || isAllowedRemover(executorId));
    
    if (isAuthorized) {
      return false; 
    }

    // 2) SELF: O próprio usuário tirando o cargo
    if (executorId && executorId === newMember.id) {
      // Bloqueia se for cargo crítico de sistema
      const hasLocked = removed.some(rid => SELF_LOCKED_ROLE_IDS.includes(rid));
      if (hasLocked) {
        const rolesToRestore = removed.filter(rid => SELF_LOCKED_ROLE_IDS.includes(rid));
        await newMember.roles.add(rolesToRestore, "Proteção: cargo crítico irremovível por self-remove");
        return true;
      }
      return false;
    }

    // 3) ALLOWED: Usuários na lista branca (Owner/VcV)
    if (executorId && isAllowedRemover(executorId)) {
      return false;
    }

    // 4) HIERARCHY CHECK REAL
    const executorMember = executorId ? await guild.members.fetch(executorId).catch(() => null) : null;

    if (executorMember) {
      const executorHighestPos = getHighestRolePosition(executorMember);
      // ✅ FIX: Compara com o topo do alvo ANTES da remoção (oldMember)
      const targetOriginalHighestPos = getHighestRolePosition(oldMember);

      // Se o executor for superior ao topo original do alvo, a remoção é legítima por hierarquia
      if (executorHighestPos > targetOriginalHighestPos) {
        console.log(`[ROLE-PROTECT] Hierarquia Permitida: ${executorUser.tag} (> ${targetOriginalHighestPos}) removeu de ${newMember.user.tag}`);
        return false; 
      }
    }

    // 5) RESTAURAÇÃO (Se chegou aqui, a remoção foi indevida)
    const rolesToRestore = removed
      .map((rid) => guild.roles.cache.get(rid))
      .filter((role) => role && role.editable)
      .map((role) => role.id);

    if (rolesToRestore.length > 0) {
      await newMember.roles
        .add(rolesToRestore, "Proteção: restauração de cargos protegidos")
        .catch(() => {});
    }

    // Se não achou executor no log (fail-safe)
    if (!executorId) {
      await newMember.send("⚠️ Detectei remoção de cargos protegidos e restaurei. Executor não identificado com segurança.").catch(() => {});
      return true;
    }

    const execMember = executorMember || await guild.members.fetch(executorId).catch(() => null);

    // Se o executor for protegido ou bot, apenas restaura e não pune
    if (!execMember || execMember.user.bot || isProtected(execMember.id)) {
      return true;
    }

    // 6) PUNIÇÃO (Terceiro não autorizado mexeu em protegido)
    const punishRoleIds = rolesRemoviveisDoExecutor(execMember);
    if (punishRoleIds.length > 0) {
      await execMember.roles
        .remove(punishRoleIds, `Punição: tentativa de remover cargos de usuário protegido (${newMember.user.tag})`)
        .catch(() => {});
    }

    // Notificações
    await execMember.send(DM_TO_EXECUTOR(execMember.user.tag, newMember.user.tag)).catch(() => {});
    await newMember.send(DM_TO_VICTIM(newMember.user.tag, execMember.user.tag)).catch(() => {});

    const creatorsChannel = await getCreatorsChannel(guild);
    if (creatorsChannel) {
      await creatorsChannel.send(PUBLIC_MSG(execMember.id, newMember.user.tag)).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("[ROLE-PROTECT] erro no guildMemberUpdate:", err);
    return false;
  }
}

// ======================================================
// HOOK: MESSAGE CREATE (Intercepta comando !remcargo)
// ======================================================
export async function roleProtectHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;

    const content = message.content?.trim();
    if (!content || !content.toLowerCase().startsWith("!remcargo")) return false;

    const guild = message.guild;
    const execMember = message.member;
    if (!guild || !execMember) return false;

    // Tenta identificar o alvo por menção ou ID
    const targetUser = message.mentions?.users?.first?.() || null;
    let targetId = targetUser?.id || null;
    if (!targetId) {
      const match = content.match(/\b(\d{17,20})\b/);
      if (match) targetId = match[1];
    }

    if (!targetId || !isProtected(targetId)) return false;
    if (isAllowedRemover(message.author.id)) return false;

    // ✅ FIX: Hierarchy Check para o comando manual
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember) {
      const executorPos = getHighestRolePosition(execMember);
      const targetPos = getHighestRolePosition(targetMember);

      // Se quem usou o comando for maior que o alvo, o sistema original do !remcargo já lidará com isso.
      // Aqui só interferimos para impedir punição indevida se a hierarquia for válida.
      if (executorPos > targetPos) {
        return false; 
      }
    }

    // Tentativa indevida via comando manual
    const punishRoleIds = rolesRemoviveisDoExecutor(execMember);
    if (punishRoleIds.length > 0) {
      await execMember.roles.remove(punishRoleIds, "Tentou usar !remcargo em usuário protegido sem hierarquia");
    }

    await execMember.send(DM_TO_EXECUTOR(execMember.user.tag, `<@${targetId}>`)).catch(() => {});
    
    const creatorsChannel = await getCreatorsChannel(guild);
    if (creatorsChannel) {
      await creatorsChannel.send(PUBLIC_MSG(execMember.id, `<@${targetId}>`)).catch(() => {});
    }

    await message.delete().catch(() => {});
    return true;
  } catch (err) {
    console.error("[ROLE-PROTECT] erro no messageCreate:", err);
    return false;
  }
}
