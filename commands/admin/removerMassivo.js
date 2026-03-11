// /application/commands/admin/removerMassivo.js
import { resolveLogChannel } from '../../events/channelResolver.js';
// ✅ REMOVER MASSIVO DE CARGO — comando: !remover
// • Remove um cargo de todo mundo (exceto protegidos)
// • Log completo em arquivo .txt no canal de logs
// • Anti concorrência por guild+role (lock global)
// • ESM / discord.js v14

const LOG_CHANNEL_ID = '1423088696835571804';

// Quem PODE USAR o comando
const ALLOWED_USER_IDS = ['660311795327828008']; // você
const ALLOWED_ROLE_IDS = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
];

// Quem NUNCA PERDE o cargo-alvo
const PROTECTED_USER_IDS = ['660311795327828008']; // você
const PROTECTED_ROLE_IDS = [
  '1262262852949905408', // OWNER
  '1352408327983861844', // RESP CREATOR
];

const CONFIRM_TTL_MS = 12_000;
const SMALL_DELAY_MS = 80;
const TZ = 'America/Sao_Paulo';

// lock global (não roda 2x no mesmo cargo)
globalThis.__SC_REMOVE_ROLE_LOCK ??= new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasPermissionToUse(message) {
  if (!message?.member) return false;
  if (ALLOWED_USER_IDS.includes(message.author.id)) return true;
  return message.member.roles.cache.some((r) => ALLOWED_ROLE_IDS.includes(r.id));
}

function pickRoleFromArgs(message, args) {
  // 1) menção <@&id>
  const mentioned = message.mentions?.roles?.first?.();
  if (mentioned) return mentioned;

  // 2) ID cru
  const id = (args[0] || '').replace(/[<@&>]/g, '');
  if (/^\d{17,20}$/.test(id)) {
    return message.guild.roles.cache.get(id) || null;
  }

  // 3) nome do cargo (match exato)
  if (args.length) {
    const name = args.join(' ').toLowerCase();
    return message.guild.roles.cache.find((r) => r.name.toLowerCase() === name) || null;
  }

  return null;
}

function roleEditableByBot(me, role) {
  // bot só edita cargos ABAIXO do cargo mais alto dele
  return role.comparePositionTo(me.roles.highest) < 0;
}

async function sendTemp(channel, payload, ttl = CONFIRM_TTL_MS) {
  try {
    const msg = await channel.send(payload);
    setTimeout(() => msg.delete().catch(() => {}), ttl);
    return msg;
  } catch {
    return null;
  }
}

export async function removerMassivoHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;
    if (!message.guild) return false;

    const content = message.content || '';
    if (!content.startsWith('!remover')) return false;

    const startedAt = Date.now();

    // explode args
    const [, ...args] = content.slice(1).trim().split(/\s+/);

    // permissão
    if (!hasPermissionToUse(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      await sendTemp(message.channel, { content: '❌ Você não tem permissão pra usar esse comando.' });
      return true;
    }

    // tenta apagar a msg do comando
    message.delete().catch(() => {});

    // cargo alvo
    const role = pickRoleFromArgs(message, args);
    if (!role) {
      await sendTemp(message.channel, {
        content: '❌ Informe um cargo válido. Ex: `!remover @Cargo` ou `!remover 123456...`'
      });
      return true;
    }

    // não deixa remover cargo protegido como alvo
    if (PROTECTED_ROLE_IDS.includes(role.id)) {
      await sendTemp(message.channel, {
        content: '⚠️ Esse cargo é protegido e não pode ser alvo de remoção em massa.'
      });
      return true;
    }

    const me = message.guild.members.me;
    if (!me) {
      await sendTemp(message.channel, { content: '❌ Não consegui identificar meu usuário no servidor.' });
      return true;
    }

    if (!roleEditableByBot(me, role)) {
      await sendTemp(message.channel, {
        content: '❌ Não consigo remover esse cargo: ele está **acima** (ou no mesmo nível) do meu cargo mais alto.'
      });
      return true;
    }

    // lock por guild+role
    const lockKey = `${message.guild.id}:${role.id}`;
    if (globalThis.__SC_REMOVE_ROLE_LOCK.get(lockKey)) {
      await sendTemp(message.channel, { content: '⏳ Já existe uma remoção em andamento pra esse cargo. Aguarde terminar.' });
      return true;
    }
    globalThis.__SC_REMOVE_ROLE_LOCK.set(lockKey, true);

    // aviso inicial
    await sendTemp(message.channel, {
      embeds: [
        {
          color: 0xffa500,
          title: '🔧 Remoção em massa iniciada',
          description: `Alvo: ${role}\nSolicitado por: <@${message.author.id}>`,
          footer: { text: 'Removendo de todos que têm o cargo, exceto protegidos…' },
          timestamp: new Date().toISOString()
        }
      ]
    });

    let removed = 0,
      skippedProtected = 0,
      failed = 0;

    const removedIds = [];
    const skippedIds = [];
    const failedIds = [];

    try {
      const members = await message.guild.members.fetch();
      const candidates = members.filter((m) => m.roles.cache.has(role.id));

      const targets = [];
      for (const m of candidates.values()) {
        const isProtectedById = PROTECTED_USER_IDS.includes(m.id);
        const isProtectedByRole = m.roles.cache.some((r) => PROTECTED_ROLE_IDS.includes(r.id));
        if (isProtectedById || isProtectedByRole) {
          skippedProtected++;
          skippedIds.push(m.id);
          continue;
        }
        targets.push(m);
      }

      for (const m of targets) {
        try {
          // se mexeram na hierarquia durante o processo
          if (!roleEditableByBot(me, role)) {
            failed++;
            failedIds.push(m.id);
            continue;
          }

          await m.roles.remove(role, `Remoção em massa por ${message.author.tag} (${message.author.id})`);
          removed++;
          removedIds.push(m.id);
        } catch {
          failed++;
          failedIds.push(m.id);
        }
        await sleep(SMALL_DELAY_MS);
      }
    } finally {
      globalThis.__SC_REMOVE_ROLE_LOCK.delete(lockKey);
    }

    // resumo temporário no chat
    await sendTemp(message.channel, {
      embeds: [
        {
          color: 0x2ecc71,
          title: '✅ Remoção concluída',
          fields: [
            { name: 'Cargo alvo', value: `${role} \`${role.id}\``, inline: true },
            { name: 'Removidos', value: String(removed), inline: true },
            { name: 'Protegidos', value: String(skippedProtected), inline: true },
            { name: 'Falhas', value: String(failed), inline: true }
          ],
          footer: { text: 'Resumo temporário • detalhes no canal de logs' },
          timestamp: new Date().toISOString()
        }
      ]
    });

    // ----- LOG COMPLETO -----
    const logs = await resolveLogChannel(client, LOG_CHANNEL_ID);
    if (logs) {
      const elapsed = Date.now() - startedAt;
      const originalCmd = (content || `!remover ${role.id}`).slice(0, 1000);

      const logText = `Remoção massiva de cargo
Servidor: ${message.guild.name} (${message.guild.id})
Canal origem: #${message.channel?.name} (${message.channel?.id})
Executor: ${message.author.tag} (${message.author.id})
Cargo alvo: ${role.name} (${role.id})
Data (BR): ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}
Duração: ${(elapsed / 1000).toFixed(1)}s

Totais:
- Removidos: ${removed}
- Protegidos: ${skippedProtected}
- Falhas: ${failed}

IDs removidos (${removedIds.length}):
${removedIds.join(', ') || '—'}

IDs protegidos (${skippedIds.length}):
${skippedIds.join(', ') || '—'}

IDs com falha (${failedIds.length}):
${failedIds.join(', ') || '—'}
`;

      const files = [
        {
          attachment: Buffer.from(logText, 'utf-8'),
          name: `remocao_${role.id}_${Date.now()}.txt`
        }
      ];

      const embed = {
        color: 0x5865f2,
        title: '🧹 Remoção massiva de cargo',
        author: {
          name: `${message.author.tag}`,
          icon_url: message.author.displayAvatarURL?.({ size: 128 })
        },
        thumbnail: { url: message.guild.iconURL?.({ size: 128 }) },
        fields: [
          { name: 'Cargo alvo', value: `${role} \`${role.id}\``, inline: true },
          { name: 'Solicitado por', value: `<@${message.author.id}> \`${message.author.id}\``, inline: true },
          { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Data/Hora (BR)', value: new Date().toLocaleString('pt-BR', { timeZone: TZ }), inline: true },
          { name: 'Duração', value: `${(elapsed / 1000).toFixed(1)}s`, inline: true },
          { name: 'Removidos', value: String(removed), inline: true },
          { name: 'Protegidos (ignorados)', value: String(skippedProtected), inline: true },
          { name: 'Falhas', value: String(failed), inline: true },
          { name: 'Comando usado', value: '```' + originalCmd + '```' }
        ],
        timestamp: new Date().toISOString()
      };

      await logs.send({ embeds: [embed], files }).catch(() => {});
    }

    return true;
  } catch (e) {
    console.error('[removerMassivo] erro:', e);
    return false;
  }
}
