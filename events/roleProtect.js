// ./events/roleProtect.js
// Assuming channelResolver.js exists and exports resolveLogChannel
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
];

const PROTECTED_ROLE_IDS = [
  "1352408327983861844", // resp creators
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

// ===== MASS REMOVAL PROTECTION CONFIG =====
const HIERARCHY_THRESHOLD_ROLE = '1352275728476930099'; // SantaCreators role
const SPECIAL_ROLE_ID = '1371733765243670538'; // User-requested special role

const DEFAULT_MASS_REMOVE_WINDOW = 10 * 60 * 1000; // 10 minutes
const SPECIAL_MASS_REMOVE_WINDOW = 20 * 60 * 1000; // 20 minutes

const DEFAULT_LIMIT_ABOVE_THRESHOLD = 50; // User-requested limit
const DEFAULT_LIMIT_BELOW_THRESHOLD = 15; // Existing limit

const SPECIAL_LIMIT = 50; // User-requested limit for special role

const PUNISHMENT_NOTIFICATION_CHANNEL_ID = '1378206851467972778'; // User-requested notification channel

const PUBLIC_MSG = (executorId, victimTag) =>
  `<@${executorId}> tentou remover cargos do ${victimTag} — nosso sistema não perdoa, mero mortal. 👑`;

// ===== HELPERS =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isProtectedUserId(userId) {
  return PROTECTED_USER_IDS.includes(
    String(
      userId ||
      ""
    )
  );
}

function hasProtectedRole(member) {
  if (!member?.roles?.cache) {
    return false;
  }

  return PROTECTED_ROLE_IDS.some(
    roleId =>
      member.roles.cache.has(
        roleId
      )
  );
}

function isProtectedMember(member) {
  return (
    !!member &&
    (
      isProtectedUserId(
        member.id
      ) ||
      hasProtectedRole(
        member
      )
    )
  );
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
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
       const logs = await guild.fetchAuditLogs({
         type: AuditLogEvent.MemberRoleUpdate,
         limit: 15,
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

// Global tracker for mass role removals
const removalTracker = new Map(); // userId -> { count: number, startTime: number }

/**
 * Checks if a member has exceeded the mass role removal limit.
 * @param {import("discord.js").GuildMember} member The member performing the removal.
 * @param {number} countToAdd The number of roles being removed in the current action.
 * @returns {{ exceeded: boolean, count: number, limit: number, window: number }}
 */
export function checkMassRemovalLimit(member, countToAdd = 1) {
  // Bypass total for allowed removers
  if (ALLOWED_REMOVERS.includes(member.id)) return { exceeded: false, count: 0, limit: 0, window: 0 };

  const now = Date.now();
  let data = removalTracker.get(member.id);

  let currentWindow = DEFAULT_MASS_REMOVE_WINDOW;
  let currentLimit = DEFAULT_LIMIT_BELOW_THRESHOLD;

  // Determine window and limit based on roles
  if (member.roles.cache.has(SPECIAL_ROLE_ID)) {
    currentWindow = SPECIAL_MASS_REMOVE_WINDOW;
    currentLimit = SPECIAL_LIMIT;
  } else {
    const thresholdRole = member.guild.roles.cache.get(HIERARCHY_THRESHOLD_ROLE);
    if (thresholdRole && member.roles.highest.position >= thresholdRole.position) {
      currentLimit = DEFAULT_LIMIT_ABOVE_THRESHOLD;
    }
  }

  if (!data || (now - data.startTime) > currentWindow) {
    data = { count: 0, startTime: now };
  }

  data.count += countToAdd;
  removalTracker.set(member.id, data);

  return { exceeded: data.count > currentLimit, count: data.count, limit: currentLimit, window: currentWindow };
}

/**
 * Sends a notification to the punishment channel.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").GuildMember} executorMember
 * @param {string} reason
 * @param {string[]} rolesRemovedIds
 */
async function sendPunishmentNotification(client, executorMember, reason, rolesRemovedIds) {
  const notificationChannel = await client.channels.fetch(PUNISHMENT_NOTIFICATION_CHANNEL_ID).catch(() => null);
  if (!notificationChannel || !notificationChannel.isTextBased()) {
    console.warn(`[ROLE-PROTECT] Canal de notificação de punição ${PUNISHMENT_NOTIFICATION_CHANNEL_ID} não encontrado ou não é de texto.`);
    return;
  }

  const rolesMention = rolesRemovedIds.map(id => `<@&${id}>`).join(', ') || 'Nenhum cargo';

  const embed = new EmbedBuilder()
    .setTitle('🚨 Punição por Remoção Massiva de Cargos')
    .setColor('#FF0000')
    .setThumbnail(executorMember.user.displayAvatarURL())
    .addFields(
      { name: '👤 Executor Punido', value: `${executorMember} (\`${executorMember.id}\`)`, inline: false },
      { name: '📝 Motivo da Punição', value: reason, inline: false },
      { name: '🗑️ Cargos Removidos do Executor', value: rolesMention, inline: false },
      { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: 'Sistema de Proteção de Cargos • SantaCreators' })
    .setTimestamp();

  await notificationChannel.send({ embeds: [embed] }).catch(console.error);
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
    // Só protege alvos configurados.
    // Usa oldMember também porque justamente o cargo protegido
    // pode ter sido removido nesta atualização.
    if (
      !isProtectedMember(
        oldMember
      ) &&
      !isProtectedMember(
        newMember
      )
    ) {
      return false;
    }

    // ✅ Check global bypass (setado por outros sistemas como gestaoinfluencer)
    if (hasGlobalBypass(newMember.id)) return false;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    // Identifica quais cargos sumiram
    const removed = [...oldRoles].filter((rid) => !newRoles.has(rid));
    if (removed.length === 0) return false;

    const guild = newMember.guild;

    // ✅ Aguarda um pouco mais a propagação do log do Discord
    await sleep(4000);

    const auditEntry = await fetchRecentRoleUpdateEntry(guild, newMember.id, removed);
    const executorUser = auditEntry?.executor ?? null;
    const executorId = executorUser?.id || null;


        // =====================================================
    // AUDIT LOG INCERTO = NÃO RESTAURA NO ESCURO
    // =====================================================
    //
    // Antes o sistema assumia que "executor desconhecido"
    // significava remoção indevida.
    //
    // Isso causava falso positivo em alterações legítimas.
    //
    // Agora:
    //
    // - sem executor confirmado, não pune;
    // - não restaura automaticamente;
    // - deixa aviso no console;
    // - um cargo SELF_LOCKED continua protegido quando
    //   houver executor identificável.
    //
    // =====================================================

    if (!executorId) {
      console.warn(
        `[ROLE-PROTECT] Remoção de cargo em ${newMember.user.tag} não teve executor confirmado no Audit Log. ` +
        `Cargos observados: ${removed.join(", ")}. Nenhuma restauração/punição foi executada no escuro.`
      );

      return false;
    }

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

    // 5) RESTAURAÇÃO
    //
    // Se chegou aqui:
    //
    // - existe executor confirmado;
    // - não é o próprio bot;
    // - não está na whitelist;
    // - não foi uma remoção própria permitida;
    // - não passou na hierarquia.
    //
    // Portanto agora existe evidência suficiente
    // para restaurar os cargos.

    const rolesToRestore = removed
      .map((rid) => guild.roles.cache.get(rid))
      .filter((role) => role && role.editable)
      .map((role) => role.id);

    if (rolesToRestore.length > 0) {
      await newMember.roles
        .add(
          rolesToRestore,
          "Proteção: restauração de cargos protegidos"
        )
        .catch(() => {});
    }

    const execMember =
      executorMember ||
      await guild.members
        .fetch(
          executorId
        )
        .catch(
          () => null
        );
    // Se o executor for protegido ou bot, apenas restaura e não pune
    if (
      !execMember ||
      execMember.user.bot ||
      isProtectedMember(
        execMember
      )
    ) {
      return true;
    }

    // 6) PUNIÇÃO (Terceiro não autorizado mexeu em protegido)
    const punishRoleIds = rolesRemoviveisDoExecutor(execMember);
    if (punishRoleIds.length > 0) {
      await execMember.roles
        .remove(punishRoleIds, `Punição: tentativa de remover cargos de usuário protegido (${newMember.user.tag})`)
        .catch(() => {});

      // Send punishment notification
      await sendPunishmentNotification(client, execMember, `Punição: tentativa de remover cargos de usuário protegido (${newMember.user.tag})`, punishRoleIds);
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

    if (!targetId) return false;

    const targetMember =
      await guild.members
        .fetch(
          targetId
        )
        .catch(
          () => null
        );

    if (
      !targetMember ||
      !isProtectedMember(
        targetMember
      )
    ) {
      return false;
    }

    if (isAllowedRemover(message.author.id)) return false;

    // ✅ FIX: Hierarchy Check para o comando manual
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
      // Send punishment notification
      await sendPunishmentNotification(client, execMember, `Tentou usar !remcargo em usuário protegido (${targetUser?.tag || targetId}) sem hierarquia`, punishRoleIds);
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
