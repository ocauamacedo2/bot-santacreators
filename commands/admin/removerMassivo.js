// /application/commands/admin/removerMassivo.js
// ✅ REMOVER MASSIVO DE CARGO — comando: !remover
// • Remove um cargo de todo mundo (exceto protegidos)
// • Log completo em arquivo .txt no canal de logs
// • Anti concorrência por guild+role (lock global)
// • ESM / discord.js v14

import { EmbedBuilder } from 'discord.js';

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
  '1262262852949905408', // OWNER (id do cargo)
  '1352408327983861844', // RESP CREATOR (id do cargo)
];

const CONFIRM_TTL_MS = 12_000;
const SMALL_DELAY_MS = 350; // Mais seguro contra rate limit do Discord
const STATUS_UPDATE_EVERY = 1; // Atualiza o painel a cada membro processado
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

async function getMembersWithRoleOnly(guild, role) {
  const byRoleCache = role.members?.filter((m) => m.roles.cache.has(role.id));

  if (byRoleCache && byRoleCache.size > 0) {
    return byRoleCache;
  }

  const byGuildCache = guild.members.cache.filter((m) => {
    return m.roles.cache.has(role.id);
  });

  return byGuildCache;
}

async function editStatus(statusMsg, {
  color = 0x3498db,
  title = '⏳ Remoção em andamento',
  role,
  authorId,
  candidatesTotal = 0,
  targetsTotal = 0,
  processed = 0,
  removed = 0,
  skippedProtected = 0,
  failed = 0,
  extra = ''
}) {
  if (!statusMsg) return;

  await statusMsg.edit({
    embeds: [
      {
        color,
        title,
        description:
          `Alvo: ${role}\n` +
          `Solicitado por: <@${authorId}>\n\n` +
          `👥 Encontrados com o cargo: **${candidatesTotal}**\n` +
          `🎯 Válidos para remoção: **${targetsTotal}**\n` +
          `📊 Processados: **${processed}/${targetsTotal}**\n` +
          `✅ Removidos: **${removed}**\n` +
          `🛡️ Protegidos: **${skippedProtected}**\n` +
          `❌ Falhas: **${failed}**` +
          `${extra ? `\n\n${extra}` : ''}`,
        footer: { text: 'SantaCreators • Remoção massiva em tempo real' },
        timestamp: new Date().toISOString()
      }
    ]
  }).catch(() => null);
}

export async function removerMassivoHandleMessage(message, client) {
  try {
    if (!message || message.author?.bot) return false;
    if (!message.guild) return false;

    const content = message.content || '';
    const parts = content.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // ✅ Correção: Checa o comando exato para não confundir !remover com !removerperm ou !remperm
    if (cmd !== '!remover') return false;

    const startedAt = Date.now();
    const args = parts.slice(1);

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

    const me = message.guild.members.me || await message.guild.members.fetch(client.user.id).catch(() => null);
    if (!me) {
      await sendTemp(message.channel, { content: '❌ Não consegui identificar meu usuário no servidor.' });
      return true;
    }

    if (!me.permissions.has('ManageRoles')) {
      await sendTemp(message.channel, { content: '❌ Eu não tenho a permissão **Gerenciar Cargos** para executar esta ação.' });
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
    const statusMsg = await message.channel.send({
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
      // ✅ Busca somente membros que estão no cache com o cargo alvo
      // Usa a mesma lógica rápida do comando !grupo
      const candidates = await getMembersWithRoleOnly(message.guild, role);

      if (!candidates || candidates.size === 0) {
        const cached = message.guild.members.cache.size;
        const totalGuild = message.guild.memberCount ?? cached;

        await editStatus(statusMsg, {
          color: 0x2ecc71,
          title: '✅ Remoção finalizada',
          role,
          authorId: message.author.id,
          candidatesTotal: 0,
          targetsTotal: 0,
          processed: 0,
          removed,
          skippedProtected,
          failed,
          extra:
            cached < totalGuild
              ? `⚠️ Nenhum membro com **${role.name}** foi encontrado no cache atual.\nCache atual: **${cached}/${totalGuild}** membros. Use \`!grupo ${role.id}\` antes ou tente novamente em alguns segundos.`
              : `ℹ️ Nenhum membro possui o cargo **${role.name}**.`
        });

        return true;
      }

      await editStatus(statusMsg, {
        color: 0xf1c40f,
        title: '🔍 Membros encontrados',
        role,
        authorId: message.author.id,
        candidatesTotal: candidates.size,
        targetsTotal: 0,
        processed: 0,
        removed,
        skippedProtected,
        failed,
        extra: 'Filtrando protegidos, falhas de hierarquia e membros válidos...'
      });

      const targets = [];
      for (const m of Array.from(candidates.values())) {
        if (!m.roles.cache.has(role.id)) {
          continue;
        }

        // Se o bot não consegue gerenciar o membro (ex: dono do server ou cargo maior que o bot)
        if (!m.manageable) {
          failed++;
          failedIds.push(m.id);
          continue;
        }

        const isProtectedById = PROTECTED_USER_IDS.includes(m.id);
        const isProtectedByRole = m.roles.cache.some((r) => PROTECTED_ROLE_IDS.includes(r.id));
        if (isProtectedById || isProtectedByRole) {
          skippedProtected++;
          skippedIds.push(m.id);
          continue;
        }

        targets.push(m);
      }

      let processed = 0;

      await editStatus(statusMsg, {
        color: 0x3498db,
        title: '⏳ Remoção em massa em andamento',
        role,
        authorId: message.author.id,
        candidatesTotal: candidates.size,
        targetsTotal: targets.length,
        processed,
        removed,
        skippedProtected,
        failed,
        extra: targets.length === 0
          ? 'Nenhum membro válido para remover após o filtro.'
          : 'Iniciando remoção dos membros válidos...'
      });

      for (const m of targets) {
        processed++;
        try {
          if (!m.roles.cache.has(role.id)) {
            continue;
          }

          // se mexeram na hierarquia durante o processo
          if (!roleEditableByBot(me, role)) {
            failed++;
            failedIds.push(m.id);
            continue;
          }

          // ✅ Aplica bypass temporário (3 minutos) para que as proteções não devolvam o cargo
          if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
          globalThis.__SC_ROLE_BYPASS__.set(m.id, Date.now() + 180000);

          await m.roles.remove(role.id, `Remoção massiva por ${message.author.tag}`);
          removed++;
          removedIds.push(m.id);

          if (processed % STATUS_UPDATE_EVERY === 0 || processed === targets.length) {
            await editStatus(statusMsg, {
              color: 0x3498db,
              title: '⏳ Remoção em massa em andamento',
              role,
              authorId: message.author.id,
              candidatesTotal: candidates.size,
              targetsTotal: targets.length,
              processed,
              removed,
              skippedProtected,
              failed
            });
          }
        } catch (err) {
          failed++;
          failedIds.push(m.id);

          await editStatus(statusMsg, {
            color: 0xe74c3c,
            title: '⚠️ Remoção em andamento com falhas',
            role,
            authorId: message.author.id,
            candidatesTotal: candidates.size,
            targetsTotal: targets.length,
            processed,
            removed,
            skippedProtected,
            failed,
            extra: `Última falha: <@${m.id}>`
          });
        }

        await sleep(SMALL_DELAY_MS);
      }
    } finally {
      globalThis.__SC_REMOVE_ROLE_LOCK.delete(lockKey);
    }

    // resumo final fixo no chat
    await message.channel.send({
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
    const logs = LOG_CHANNEL_ID ? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null) : null;
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
