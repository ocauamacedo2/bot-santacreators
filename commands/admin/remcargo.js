// remcargo_guardian_vip.js — d.js v14 (ESM) — by Macedo & ChatGPT
// • Comando !remcargo + Guardião global (guildMemberUpdate)
// • Regras de hierarquia, auto-remoção segura e cargos protegidos
// • VIP logic: se tentar remover de VIP um cargo >= topo do executor ⇒ “kick de cargos” (limpa cargos do executor)
// • Mensagens: UMA ÚNICA EMBED (a “de baixo”), com título ✅/⚠️ e “Remoção PERMITIDA/BLOQUEADA” no author
// • Logs:
//    1) LOG LOCAL (cada servidor só no canal dele, mencionando cargo normal)
//    2) LOG CENTRAL (TUDO vai pro DC principal no canal central)
//       - se o evento for DO DC principal: mantém o jeito atual (menciona cargo e sem “origem”)
//       - se o evento for DE OUTRO DC: NÃO menciona cargo/canal (Discord não resolve cross-guild),
//         então vai como NOME + ID e inclui: nome do servidor + ID + link do canal origem (quando tiver)
// • Chat: some em 15s; DM p/ executor e alvo em tentativas contra VIP
// • GIF personalizável via env: gif_mero_mortal= (fallback para o link enviado)

import { EmbedBuilder, Collection, AuditLogEvent } from 'discord.js';
import dotenv from 'dotenv';
import { resolveLogChannel } from '../../events/channelResolver.js';
dotenv.config();

/* ==========================
   CONFIG (IDs)
========================== */

// ✅ DC PRINCIPAL (central)
const MAIN_GUILD_ID = '1262262852782129183';
const MAIN_LOG_CHANNEL_ID = '1352491135339204649';

// ✅ CANAL DE ALERTAS ANTI-RAID
const ANTIRAID_LOG_CHANNEL_ID = '1389857160871280650';
const antiRaidBypass24h = new Map(); // userId -> expiryTs
const antiRaidSnapshots = new Map(); // snapshotId -> data

// ✅ LOGS LOCAIS POR SERVIDOR (cada um no seu canal)
const GUILD_LOG_CHANNEL_MAP = {
  // DC Principal
  '1262262852782129183': '1352491135339204649',

  // Cidade Santa
  '1362899773992079533': '1363295056634843226',

  // Administração
  '1452416085751234733': '1455311262237065388',
};

// Fallback opcional (se quiser que servidores fora do mapa ainda loguem EM ALGUM CANAL DO PRÓPRIO SERVIDOR)
// ⚠️ Não coloque canal de outro DC aqui.
const FALLBACK_LOGS_CHANNEL = (process.env.REMCARGO_CHANNEL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Bypass total (IDs de usuários)
const ALLOWED_REMOVERS = (process.env.ALLOWED_REMOVERS || '1262262852949905408,660311795327828008')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Cargos/Users VIP (alvos que ativam punição + DMs)
const VIP_TARGET_ROLE_IDS = (process.env.VIP_TARGET_ROLE_IDS || '1262262852949905408,1262262852949905409,1352408327983861844')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const VIP_TARGET_USER_IDS = (process.env.VIP_TARGET_USER_IDS || '660311795327828008')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// “Deus” (owner/eu) — para a frase especial
const GOD_USER_IDS = (process.env.GOD_USER_IDS || '1262262852949905408,660311795327828008')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Cargos globalmente irremovíveis (ninguém tira)
const PROTECTED_ROLE_IDS = (process.env.PROTECTED_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Cargos que o executor NUNCA perde no “kick de cargos”
const EXEMPT_ROLE_IDS = (process.env.EXEMPT_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Bloqueio de auto-remoção (críticos, ex: Interação BOT)
const SELF_LOCKED_ROLE_IDS = (process.env.SELF_LOCKED_ROLE_IDS || '1352493359897378941')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Lista extra de cargos proibidos via comando (além dos protegidos)
const CARGOSOFF_ENV = (process.env.CARGOS_NAO || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ✅ CARGOS TRAVADOS (Hardcoded) - Segurança extra
const CARGOS_TRAVADOS_FIXOS = [
  '1371733765243670538',
  '1352275728476930099',
  '1353841582176210944',
  '1403170838529966140'
];

const CARGOSOFF = [...CARGOSOFF_ENV, ...CARGOS_TRAVADOS_FIXOS];

// GIF do “mero mortal”
const GIF_MERO_MORTAL =
  process.env.gif_mero_mortal ||
  process.env.GIF_MERO_MORTAL ||
  'https://media.discordapp.net/attachments/1362477839944777889/1374893068649500783/standard_1.gif?width=2331&height=135';

// ✅ CONFIG PROTEÇÃO MASSIVA (Hierarquia & Tempo)
const HIERARCHY_THRESHOLD_ROLE = '1352275728476930099';
const MASS_REMOVE_WINDOW = 10 * 60 * 1000; // 10 minutos
const LIMIT_ABOVE = 25; // Limite para quem está acima do threshold
const LIMIT_BELOW = 15; // Limite para quem está abaixo do threshold
const removalTracker = new Map(); // userId -> { count, startTime }

function checkMassRemovalLimit(member, countToAdd = 1) {
  // ✅ Bypass para o próprio bot (evita que o bot se bloqueie em comandos massivos)
  if (member.id === member.client.user.id) return { exceeded: false };

  // Bypass total para autorizados (Owner/VcV)
  if (ALLOWED_REMOVERS.includes(member.id)) return { exceeded: false };

  const bypass24h = antiRaidBypass24h.get(member.id);
  if (bypass24h && Date.now() < bypass24h) return { exceeded: false };

  const now = Date.now();
  let data = removalTracker.get(member.id);

  if (!data || (now - data.startTime) > MASS_REMOVE_WINDOW) {
    data = { count: 0, startTime: now };
  }

  data.count += countToAdd;
  removalTracker.set(member.id, data);

  const thresholdRole = member.guild.roles.cache.get(HIERARCHY_THRESHOLD_ROLE);
  const isAbove = thresholdRole && member.roles.highest.position >= thresholdRole.position;
  const limit = isAbove ? LIMIT_ABOVE : LIMIT_BELOW;

  return { exceeded: data.count > limit, count: data.count, limit };
}

/* ==========================
   PERMISSÃO DO COMANDO
========================== */

async function hasPermission(message) {
  const owners = (process.env.OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
  if (owners.includes(message.author.id)) return true;

  const staff = (process.env.STAFF || '').split(',').map(id => id.trim()).filter(Boolean);
  // força incluir Interação BOT
  if (!staff.includes('1352493359897378941')) staff.push('1352493359897378941');

  const memberRoles = message.member.roles.cache.map(r => r.id);
  return staff.some(id => memberRoles.includes(id));
}

/* ==========================
   HELPERS
========================== */

const nowTime = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const isVipMember = (m) =>
  !!m && (VIP_TARGET_USER_IDS.includes(m.id) || m.roles.cache.some(r => VIP_TARGET_ROLE_IDS.includes(r.id)));

const isGodUser = (id) => GOD_USER_IDS.includes(id);

function isMainGuild(guildId) {
  return String(guildId) === String(MAIN_GUILD_ID);
}

function channelLink(guildId, channelId) {
  if (!guildId || !channelId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
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

/**
 * ⚠️ CORREÇÃO IMPORTANTE:
 * canais muitas vezes NÃO estão no cache. Então precisa tentar fetch.
 */

async function getLocalLogChannel(client, guild) {
  if (!guild) return null;

  const mappedId = GUILD_LOG_CHANNEL_MAP[guild.id];
  const fallbackId = FALLBACK_LOGS_CHANNEL[0];
  const channelId = mappedId || fallbackId;
  if (!channelId) return null;

  return await client.channels.fetch(channelId).catch(() => null);
}

async function sendEphemeral(channel, payload, ttlMs = 15_000) {
  if (!channel?.isTextBased()) return;
  try {
    const msg = await channel.send(payload);
    setTimeout(() => msg.delete().catch(() => {}), ttlMs);
  } catch {}
}

function canActDifferent(executor, target, role) {
  const execTop = executor.roles.highest?.position ?? 0;
  const rolePos = role?.position ?? 0;

  // ✅ REGRA ÚNICA:
  // só pode remover cargos ABAIXO do topo do executor
  if (!(rolePos < execTop)) return false;

  return true;
}


function canSelfRemove(executor, role) {
  const execTop = executor.roles.highest?.position ?? 0;
  const rolePos = role?.position ?? 0;
  if (PROTECTED_ROLE_IDS.includes(role.id)) return false;
  if (SELF_LOCKED_ROLE_IDS.includes(role.id)) return false;
  return rolePos < execTop;
}

async function kickRoles(executorMember, why) {
  try {
    const removable = executorMember.roles.cache.filter(r =>
      r.id !== executorMember.guild.id &&
      !EXEMPT_ROLE_IDS.includes(r.id) &&
      r.editable
    );
    const removedIds = [...removable.keys()];
    if (removable.size > 0) {
      await executorMember.roles.remove(removable, why);
    }
    return removedIds;
  } catch (e) {
    console.error('[REM/KICK] erro limpando cargos do executor:', e);
    return [];
  }
}

/* ==========================
   EMBED ÚNICA
   - native: logs locais e DC principal quando a origem é o principal (menciona cargo)
   - external: log central quando a origem é outro DC (NOME+ID + origem)
========================== */

function singleEmbed({
  executorMember,
  targetMember,
  role,
  allowed,
  reason,
  mode = 'native', // 'native' | 'external'
  originGuild = null,
  originChannel = null,
}) {
  const execAvatar = executorMember?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;

  const guildId = originGuild?.id || executorMember?.guild?.id || null;
  const guildName = originGuild?.name || executorMember?.guild?.name || 'Servidor desconhecido';

  const isExternal = mode === 'external';

  const execText = executorMember
    ? (isExternal ? `\`${executorMember.user.tag}\` (\`${executorMember.id}\`)` : `<@${executorMember.id}>`)
    : '—';

  const targetText = targetMember
    ? (isExternal ? `\`${targetMember.user.tag}\` (\`${targetMember.id}\`)` : `<@${targetMember.id}>`)
    : '—';

  // ✅ Se for external: NÃO mencionar cargo (senão vira “cargo desconhecido” no DC principal)
  const roleText = !role
    ? '—'
    : (isExternal ? `\`${role.name}\` (\`${role.id}\`)` : `<@&${role.id}>`);

  const emb = new EmbedBuilder()
    .setColor(allowed ? 0x00B05E : 0xFFA500)
    .setAuthor({ name: allowed ? 'Remoção PERMITIDA' : 'Remoção BLOQUEADA', iconURL: execAvatar || undefined })
    .setTitle(allowed ? '✅ Cargo removido com sucesso!' : '⚠️ Tentativa bloqueada')
    .setThumbnail(execAvatar || null)
    .setDescription(reason || '')
    .addFields(
      { name: '👤 Executor', value: execText, inline: true },
      { name: '👥 Alvo', value: targetText, inline: true },
      { name: '🏷️ Cargo', value: roleText, inline: true },
    )
    .setFooter({ text: `Hoje às ${nowTime()} • Mensagem some em 15s` })
    .setTimestamp();

  // ✅ Só aparece no LOG CENTRAL quando o evento for de outro DC
  if (isExternal) {
    const link = originChannel?.id ? channelLink(guildId, originChannel.id) : null;
    const channelLine = originChannel?.id
      ? (link ? `[Abrir canal origem](${link})` : `Canal: \`${originChannel.id}\``)
      : 'Canal: `—`';

    emb.addFields({
      name: '🌐 Origem',
      value: `Servidor: \`${guildName}\` (\`${guildId || '—'}\`)\n${channelLine}`,
      inline: false,
    });
  }

  return emb;
}

/**
 * LOGS:
 * 1) Local (só no canal do servidor de origem, mencionando cargo)
 * 2) Central (TUDO no DC principal)
 *    - se origem for DC principal => embed native (jeito atual)
 *    - se origem for outro DC     => embed external (nome+id + origem)
 */
async function sendLogs({ originGuild, originChannel, embedArgs }) {
    const client = originGuild?.client;
    if (!client) return;

    // 1) Envia apenas para o log local
    const localCh = await getLocalLogChannel(client, originGuild);
    if (localCh) {
        const embLocal = singleEmbed({ ...embedArgs, mode: 'native', originGuild, originChannel });
        // ✅ EVITA DUPLICAÇÃO: Só envia log se o canal de log for diferente do canal onde o comando foi usado
        if (originChannel && localCh.id !== originChannel.id) {
            localCh.send({ embeds: [embLocal] }).catch(() => null);
        }
    }
}

/* ==========================
   DM VIP (mero mortal)
========================== */

async function sendVipDMs({ executorMember, targetMember, phrase }) {
  const txt =
`<@${executorMember.id}> ✖️ <@${targetMember.id}>

${phrase}

${GIF_MERO_MORTAL}`;
  try { await executorMember.send({ content: txt }); } catch {}
  try { await targetMember.send({ content: txt }); } catch {}
}

/* ==========================
   CORE: avaliar tentativa
========================== */
const GOD_IDS = ['660311795327828008', '1262262852949905408'];

function evaluateAttempt({ executorMember, targetMember, role, isSelf, bypass }) {
  // ✅ OWNER BYPASS TOTAL
  if (GOD_IDS.includes(executorMember.id)) {
    return { allowed: true, code: 'GOD_BYPASS', reason: 'Acesso total concedido.' };
  }

  if (PROTECTED_ROLE_IDS.includes(role.id)) {
    return { allowed: false, code: 'GLOBAL_PROTECT', reason: 'Cargo marcado como irremovível.' };
  }

  // ✅ SELF: só remove cargos abaixo do topo do executor (como você quer)
  if (isSelf) {
    if (SELF_LOCKED_ROLE_IDS.includes(role.id)) {
      return { allowed: false, code: 'SELF_LOCKED', reason: 'Você não pode remover de si um cargo crítico de sistema.' };
    }
    const ok = canSelfRemove(executorMember, role);
    return {
      allowed: ok,
      code: 'SELF',
      reason: ok
        ? 'Você removeu esse cargo de si mesmo.'
        : 'Bloqueado: você só pode remover de si cargos abaixo do seu topo.'
    };
  }

  // ✅ bypass (owner/eu): ainda precisa o BOT conseguir editar
  if (bypass) {
    return {
      allowed: role.editable,
      code: 'BYPASS',
      reason: role.editable
        ? 'Remoção autorizada (bypass).'
        : 'Bloqueado: o bot não consegue gerenciar esse cargo (acima do bot).'
    };
  }

  // ✅ OUTROS: regra “igual Discord”
  // - cargo precisa ser abaixo do executor
  // - alvo precisa estar abaixo do executor
  const ok = canActDifferent(executorMember, targetMember, role);
  if (!ok) {
    const execTop = executorMember.roles.highest?.position ?? 0;
    const tgtTop = targetMember.roles.highest?.position ?? 0;
    const rolePos = role?.position ?? 0;

    // mensagem mais específica (pra você entender no log)
    if (rolePos >= execTop) {
      return {
        allowed: false,
        code: 'ROLE_TOO_HIGH',
        reason: 'Bloqueado: você não pode remover um cargo do mesmo nível ou acima do seu topo.'
      };
    }
    if (tgtTop >= execTop) {
      return {
  allowed: false,
  code: 'ROLE_TOO_HIGH',
  reason: 'Bloqueado: você não pode remover um cargo do mesmo nível ou acima do seu topo.'
};

    }

    return {
      allowed: false,
      code: 'HIERARCHY',
      reason: 'Bloqueado por hierarquia.'
    };
  }

  return { allowed: true, code: 'HIERARCHY_OK', reason: 'Remoção autorizada pela hierarquia.' };
}


/* ==========================
   VIP RULES
========================== */

function needsVipKick({ executorMember, targetMember, role }) {
  if (!isVipMember(targetMember)) return false;

  const execTop = executorMember.roles.highest?.position ?? 0;
  const rolePos = role?.position ?? 0;

  return rolePos >= execTop;
}

function vipPhrase(executorMember, targetMember) {
  if (isGodUser(targetMember.id)) {
    return '**VOCÊ** realmente tentou REMOVER um Cargo de um **DEUS?????** Mas respeito, mero *mortal*!';
  }
  return '**VOCÊ** realmente tentou REMOVER um Cargo de um Superior????? Mas respeito, mero *mortal*!';
}

/* ==========================
   COMANDO !remcargo
========================== */

async function execute(message, args) {
  if (!await hasPermission(message)) {
    setTimeout(() => message.delete().catch(() => {}), 1000);
    return message.reply('❌ Você não tem permissão para usar este comando.')
      .then(m => setTimeout(() => m.delete().catch(() => {}), 6000));
  }

  const roleMention = message.mentions.roles.first();
  const roleId = roleMention ? roleMention.id : args.shift();
  const role = message.guild.roles.cache.get(roleId);

  if (!role) {
    return message.reply('❌ Cargo não encontrado. Mencione o cargo ou forneça o ID corretamente.')
      .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
  }

  if (CARGOSOFF.includes(role.id) || PROTECTED_ROLE_IDS.includes(role.id)) {
    return message.reply(`🚫 O cargo **${role.name}** é protegido e não pode ser removido por comando.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
  }

  let members = message.mentions.members;
  if (!members || members.size === 0) {
    const ids = args;
    const col = new Collection();

    for (const id of ids) {
      const m = await message.guild.members.fetch(id).catch(() => null);
      if (m) col.set(m.id, m);
    }

    members = col;
    if (members.size === 0) {
      return message.reply('❗ Por favor, mencione um ou mais usuários ou forneça os IDs deles.');
    }
  }

  const bypass = ALLOWED_REMOVERS.includes(message.author.id);

  for (const targetMember of members.values()) {
    const isSelf = targetMember.id === message.member.id;

    // VIP KICK check
    if (!isSelf && needsVipKick({ executorMember: message.member, targetMember, role })) {
      const phrase = vipPhrase(message.member, targetMember);

      await kickRoles(message.member, `Punido por tentar remover cargo >= topo de um VIP (@${targetMember.id})`);

      const embChat = singleEmbed({
        executorMember: message.member,
        targetMember,
        role,
        allowed: false,
        reason: phrase,
        mode: 'native',
        originGuild: message.guild,
        originChannel: message.channel,
      });

      await sendEphemeral(message.channel, { embeds: [embChat] });

      await sendLogs({
        originGuild: message.guild,
        originChannel: message.channel, // ✅ aqui dá pra linkar certinho
        embedArgs: { executorMember: message.member, targetMember, role, allowed: false, reason: phrase },
      });

      await sendVipDMs({ executorMember: message.member, targetMember, phrase });
      continue;
    }

    // ✅ PROTEÇÃO MASSIVA (!remcargo)
    const limitCheck = checkMassRemovalLimit(message.member);
    if (limitCheck.exceeded) {
      const phrase = `🚨 **ANTIRAID:** Limite de remoção de cargos excedido (${limitCheck.limit} em 10min). Você foi punido.`;
      await kickRoles(message.member, `Excedeu limite de remoção (!remcargo): ${limitCheck.count}/${limitCheck.limit} em 10min`);

      const embChat = singleEmbed({
        executorMember: message.member,
        targetMember,
        role,
        allowed: false,
        reason: phrase,
        mode: 'native',
        originGuild: message.guild,
        originChannel: message.channel,
      });
      await sendEphemeral(message.channel, { embeds: [embChat] });
      break; // Interrompe o processamento de mais membros
    }

    // Avaliação normal
    const ev = evaluateAttempt({ executorMember: message.member, targetMember, role, isSelf, bypass });

    if (!ev.allowed) {
      const reason = isVipMember(targetMember) ? vipPhrase(message.member, targetMember) : ev.reason;

      const embChat = singleEmbed({
        executorMember: message.member,
        targetMember,
        role,
        allowed: false,
        reason,
        mode: 'native',
        originGuild: message.guild,
        originChannel: message.channel,
      });

      await sendEphemeral(message.channel, { embeds: [embChat] });

      await sendLogs({
        originGuild: message.guild,
        originChannel: message.channel,
        embedArgs: { executorMember: message.member, targetMember, role, allowed: false, reason },
      });

      if (isVipMember(targetMember)) {
        await sendVipDMs({ executorMember: message.member, targetMember, phrase: vipPhrase(message.member, targetMember) });
      }
      continue;
    }

    // bot precisa poder editar
    if (!role.editable) {
      const reason = 'O bot não consegue gerenciar esse cargo (posição acima do bot).';

      const embChat = singleEmbed({
        executorMember: message.member,
        targetMember,
        role,
        allowed: false,
        reason,
        mode: 'native',
        originGuild: message.guild,
        originChannel: message.channel,
      });

      await sendEphemeral(message.channel, { embeds: [embChat] });

      await sendLogs({
        originGuild: message.guild,
        originChannel: message.channel,
        embedArgs: { executorMember: message.member, targetMember, role, allowed: false, reason },
      });

      continue;
    }

    // Executa a remoção
    // ✅ Define bypass para que o roleProtect.js e o installRoleGuardian não interfiram
    if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
    // Define um tempo de 15 segundos para o bypass ser válido
    globalThis.__SC_ROLE_BYPASS__.set(targetMember.id, Date.now() + 15000);

    await targetMember.roles.remove(role, `!remcargo por ${message.author.tag}`);

    const embChat = singleEmbed({
      executorMember: message.member,
      targetMember,
      role,
      allowed: true,
      reason: ev.reason,
      mode: 'native',
      originGuild: message.guild,
      originChannel: message.channel,
    });

    await sendEphemeral(message.channel, { embeds: [embChat] });

    await sendLogs({
      originGuild: message.guild,
      originChannel: message.channel,
      embedArgs: { executorMember: message.member, targetMember, role, allowed: true, reason: ev.reason },
    });
  }
}

/* ==========================
   GUARDIÃO GLOBAL (UI/clicks)
========================== */

const RECENT_RESTORES = new Map();
const RESTORE_WINDOW_MS = 10_000;

export function installRoleGuardian(client) {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Se o próprio bot é o executor, permite a ação e não restaura.
    // Isso evita que o bot sabote suas próprias remoções legítimas de cargos.
    const botMember = newMember.guild.members.me;
    if (!botMember) return; // Não deveria acontecer, mas para segurança.

    // ✅ Se houver um bypass global (ex: desligamento do GI), ignora a proteção
    if (hasGlobalBypass(newMember.id)) return;

    try {
      const last = RECENT_RESTORES.get(newMember.id) || 0;
      if (Date.now() - last < 1500) return;

      // 🕒 Aguarda o log do Discord propagar para evitar falsos positivos (devolução indevida)
      await new Promise(r => setTimeout(r, 3000));

      const guild = newMember.guild;
      const oldSet = new Set(oldMember.roles.cache.keys());
      const newSet = new Set(newMember.roles.cache.keys());
    
      const removedIds = [...oldSet].filter(id => !newSet.has(id));
      if (removedIds.length === 0) return;

      const removedRoles = removedIds
        .map(id => guild.roles.cache.get(id))
        .filter(Boolean)
        .sort((a, b) => b.position - a.position);

      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 }).catch(() => null);
      let entry = null;

      if (logs) {
        entry = logs.entries.find(e =>
          e.target?.id === newMember.id &&
          Date.now() - e.createdTimestamp < 10_000
        );
      }

      const executorUser = entry?.executor || null;
      // Se não achou no log mas tem bypass ativo, confia no bypass e encerra aqui
      if (!executorUser && hasGlobalBypass(newMember.id)) return;

      const executorMember = executorUser ? await guild.members.fetch(executorUser.id).catch(() => null) : null;

      // ✅ Se o executor for o próprio bot, permite sempre
      if (executorUser && executorUser.id === client.user.id) return;

      // ✅ PROTEÇÃO MASSIVA (Moderador de Cliques)
      if (executorMember && !ALLOWED_REMOVERS.includes(executorMember.id)) {
        const limitCheck = checkMassRemovalLimit(executorMember, removedRoles.length);
        if (limitCheck.exceeded) {
          const removedFromExecutor = await kickRoles(executorMember, `🚨 ANTI-RAID: Excedeu limite (${limitCheck.count}/${limitCheck.limit})`);
          
          const snapshotId = `raid_${Date.now()}_${executorMember.id}`;
          antiRaidSnapshots.set(snapshotId, {
            executorId: executorMember.id,
            targetId: newMember.id,
            executorRoles: removedFromExecutor,
            targetRoles: removedIds, // IDs salvos no início do evento
            guildId: guild.id
          });

          const antiraidLog = await client.channels.fetch(ANTIRAID_LOG_CHANNEL_ID).catch(() => null);
          if (antiraidLog) {
            const embed = new EmbedBuilder()
              .setTitle('🚨 PUNIÇÃO ANTI-RAID APLICADA')
              .setColor('#ff0000')
              .setThumbnail(executorUser.displayAvatarURL())
              .addFields(
                { name: '👤 Executor', value: `${executorUser} (\`${executorUser.id}\`)`, inline: true },
                { name: '🎯 Alvo', value: `${newMember} (\`${newMember.id}\`)`, inline: true },
                { name: '⏱️ Tempo', value: `\`${limitCheck.count}\` cargos em menos de 10 min`, inline: true },
                { name: '🏷️ Cargos Removidos', value: removedRoles.map(r => `@${r.name}`).join(', ').slice(0, 1000) },
                { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now()/1000)}:F>` }
              )
              .setFooter({ text: 'Use o botão abaixo para ignorar por 24h e devolver cargos.' });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`antiraid_revert:${snapshotId}`)
                .setLabel('↩️ Reverter e Ignorar por 24h')
                .setStyle(ButtonStyle.Danger)
            );

            await antiraidLog.send({ content: '⚠️ **ALERTA DE SEGURANÇA**', embeds: [embed], components: [row] });
          }
          
          // Criar Snapshot para Reversão
          const snapshotId = `raid_${Date.now()}_${executorMember.id}`;
          antiRaidSnapshots.set(snapshotId, {
            executorId: executorMember.id,
            targetId: newMember.id,
            executorRoles: removedFromExecutor,
            targetRoles: removedIds,
            guildId: guild.id
          });

          // Log Detalhado no canal solicitado
          const antiraidLog = await client.channels.fetch(ANTIRAID_LOG_CHANNEL_ID).catch(() => null);
          if (antiraidLog) {
            const raidEmbed = new EmbedBuilder()
              .setTitle('🚨 PUNIÇÃO ANTI-RAID APLICADA')
              .setColor('#ff0000')
              .setThumbnail(executorUser.displayAvatarURL())
              .addFields(
                { name: '👤 Executor', value: `${executorUser} (\`${executorUser.id}\`)`, inline: true },
                { name: '🎯 Alvo', value: `${newMember} (\`${newMember.id}\`)`, inline: true },
                { name: '📍 Local', value: `<#${newMember.guild.id}> (Sistema de Cliques)`, inline: true },
                { name: '⏱️ Detecção', value: `\`${limitCheck.count}\` cargos removidos em menos de 10 min.`, inline: false },
                { name: '🏷️ Cargos do Alvo Removidos', value: removedRoles.map(r => `@${r.name}`).join(', ').slice(0, 1000), inline: false },
                { name: '🕒 Data/Hora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
              )
              .setFooter({ text: 'Proteção Automática SantaCreators' });

            const raidRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`antiraid_revert:${snapshotId}`)
                .setLabel('↩️ Reverter e Devolver Cargos')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛡️')
            );

            await antiraidLog.send({ content: '⚠️ **ALERTA DE SEGURANÇA**', embeds: [raidEmbed], components: [raidRow] });
          }

          await sendLogs({
            originGuild: guild,
            originChannel: null,
            embedArgs: {
              executorMember,
              targetMember: newMember,
              role: removedRoles[0],
              allowed: false,
              reason: `🚨 **ANTIRAID:** Limite de cliques excedido (${limitCheck.limit} em 10min). Executor punido.`,
            },
          });

          // Restaura os cargos desta remoção específica
          for (const r of removedRoles) if (r?.editable) await newMember.roles.add(r.id, 'Antiraid: restauração de massa');
          return;
        }
      }

      // ✅ BYPASS TOTAL PARA ALLOWED_REMOVERS NO FLUXO UI (CLIQUES)
      if (executorUser && ALLOWED_REMOVERS.includes(executorUser.id)) {
        return;
      }

      // Se o bot é o executor, suas ações são sempre permitidas.
      if (executorUser && executorUser.id === client.user.id) {
        return; // Não restaura, não loga como bloqueado por este guardião.
      }

      // ⚠️ UI não dá pra saber o canal com certeza
      const originChannel = null;

      for (const role of removedRoles) {
        let allowed = false;

        if (!executorMember) { // Se o executor é desconhecido, assume não permitido por segurança.
          allowed = false;
        } else if (executorMember.id === newMember.id) {
          allowed = canSelfRemove(executorMember, role);
        } else {
          allowed = canActDifferent(executorMember, newMember, role);
        }

        // VIP KICK no fluxo UI
        if (
          executorMember &&
          executorMember.id !== newMember.id &&
          needsVipKick({ executorMember, targetMember: newMember, role })
        ) {
          const phrase = vipPhrase(executorMember, newMember);

          await kickRoles(executorMember, `Punido por tentar remover cargo >= topo de um VIP (UI)`);

          await sendLogs({
            originGuild: guild,
            originChannel, // null, pq UI não tem canal confiável
            embedArgs: { executorMember, targetMember: newMember, role, allowed: false, reason: phrase },
          });

          await sendVipDMs({ executorMember, targetMember: newMember, phrase });

          // restaura sempre
          if (role?.editable) {
            await newMember.roles.add(role.id, 'Guardião: restauração (VIP)');
            RECENT_RESTORES.set(newMember.id, Date.now());
            setTimeout(() => RECENT_RESTORES.delete(newMember.id), RESTORE_WINDOW_MS);
          }
          continue;
        }

        const reason = allowed
          ? (executorMember?.id === newMember.id ? 'Auto-remoção autorizada.' : 'Remoção autorizada pela hierarquia.')
          : (PROTECTED_ROLE_IDS.includes(role.id)
            ? 'Cargo marcado como irremovível.'
            : (executorMember?.id === newMember.id
              ? (SELF_LOCKED_ROLE_IDS.includes(role.id)
                ? 'Auto-remoção bloqueada: cargo crítico.'
                : 'Auto-remoção bloqueada: apenas cargos abaixo do seu topo.')
              : 'Permissão não autorizada: cargo maior ou do mesmo nível que o seu.'));

        // ✅ LOGS (local do servidor + central no DC principal)
        await sendLogs({
          originGuild: guild,
          originChannel, // null aqui
          embedArgs: {
            executorMember: executorMember || null,
            targetMember: newMember,
            role,
            allowed,
            reason,
          },
        });

        // Se não for autorizado, restaura
        if (!allowed || PROTECTED_ROLE_IDS.includes(role.id)) {
          if (role?.editable) {
            await newMember.roles.add(role.id, 'Guardião: restauração de remoção não autorizada');
            RECENT_RESTORES.set(newMember.id, Date.now());
            setTimeout(() => RECENT_RESTORES.delete(newMember.id), RESTORE_WINDOW_MS);
          }
        }
      }
    } catch (err) {
      console.error('[ROLE_GUARDIAN] Erro em guildMemberUpdate:', err);
    }
  });

  console.log('[ROLE_GUARDIAN] instalado.');
}

/* ==========================
   HANDLER DE INTERAÇÃO (REVERTER)
========================== */

/**
 * Processa o botão de reversão do Anti-Raid
 */
export async function remcargoHandleInteraction(interaction, client) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('antiraid_revert:')) return false;

  // Evita "Interação falhou"
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const snapshotId = interaction.customId.split(':')[1];
  const data = antiRaidSnapshots.get(snapshotId);

  if (!data) {
    await interaction.editReply('❌ Dados da reversão não encontrados ou já expiraram.').catch(() => {});
    return true;
  }

  // Permissão: Verifica se quem clicou é staff autorizada
  const owners = (process.env.OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
  const staff = (process.env.STAFF || '').split(',').map(id => id.trim()).filter(Boolean);
  const isAuth = owners.includes(interaction.user.id) || interaction.member.roles.cache.some(id => staff.includes(id) || id === '1352493359897378941');

  if (!isAuth) {
    await interaction.editReply('❌ Você não tem permissão para reverter punições anti-raid.').catch(() => {});
    return true;
  }

  const guild = interaction.guild;
  const executorMember = await guild.members.fetch(data.executorId).catch(() => null);
  const targetMember = await guild.members.fetch(data.targetId).catch(() => null);

  // 1. Devolve cargos ao ALVO
  if (targetMember && data.targetRoles.length > 0) {
    for (const rid of data.targetRoles) {
      const role = guild.roles.cache.get(rid);
      if (role && role.editable) await targetMember.roles.add(rid, 'Anti-raid: reversão manual').catch(() => {});
    }
  }

  // 2. Devolve cargos ao EXECUTOR (punido) e dá bypass
  if (executorMember && data.executorRoles.length > 0) {
    for (const rid of data.executorRoles) {
      const role = guild.roles.cache.get(rid);
      if (role && role.editable) await executorMember.roles.add(rid, 'Anti-raid: reversão manual').catch(() => {});
    }
    // Aplica o Bypass de 24 horas
    antiRaidBypass24h.set(data.executorId, Date.now() + (24 * 60 * 60 * 1000));
  }

  antiRaidSnapshots.delete(snapshotId);
  await interaction.message.edit({ components: [] }).catch(() => {});
  await interaction.editReply(`✅ Punição revertida com sucesso! Cargos devolvidos e bypass de 24h aplicado para <@${data.executorId}>.`).catch(() => {});

  return true;
}

/* ==========================
   AUTO-INSTALL opcional
========================== */
try { if (globalThis.client) installRoleGuardian(globalThis.client); } catch {}

/* ==========================
   EXPORT do comando
========================== */
export default {
  name: 'remcargo',
  description: 'Remove cargos com hierarquia; VIP-punish (kick de cargos se tentar remover cargo >= topo do executor de um VIP); 1 embed em chat/log; DMs com GIF; logs local por servidor + central no DC principal.',
  async execute(message, args) { return execute(message, args); }
};
