// commands/grupo.js (rápido: evita fetch pesado a cada uso)
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// ENVs normalizadas
const OWNER_IDS = (process.env.OWNER || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_ROLE_IDS = (process.env.ROLES_PERMISSION || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// resolve cor (#hex | decimal | nome)
function resolveColor(input) {
  if (!input) return 0xff009a;
  const s = String(input).trim();
  if (s.startsWith('#')) return parseInt(s.slice(1), 16);
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}
const BASE_COLOR = resolveColor(process.env.BASE_COLORS);

// normaliza nome pra busca tolerante
function norm(txt) {
  return String(txt || '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // zero-width
    .replace(/[|┃│]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// timeout helper: não deixa o comando “prender”
async function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

// tenta “completar cache” sem travar: poucos segundos e sem force
async function tryWarmMembersCache(guild, ms = 3500) {
  // Se o cache já tá “ok”, nem tenta.
  const cached = guild.members.cache.size;
  const total = guild.memberCount ?? cached;
  if (cached >= total) return { warmed: true, note: '' };

  try {
    // Sem force: busca só o que falta, e com timeout curto
    await withTimeout(guild.members.fetch({ withPresences: false }), ms);
    return { warmed: true, note: '' };
  } catch (e) {
    const msg = String(e?.message || '');
    // intents faltando (muito comum)
    if (msg.toLowerCase().includes('missing intents')) {
      return { warmed: false, note: 'INTENTS' };
    }
    // TIMEOUT / rate / qualquer outra -> segue rápido com cache
    return { warmed: false, note: 'PARTIAL' };
  }
}

export default {
  name: 'grupo',
  description: 'Lista todos os membros que possuem o cargo mencionado.',
  async execute(message, args) {
    try {
      if (!message.guild || message.author.bot) return;

      // ---- permissão
      const isOwner = OWNER_IDS.includes(message.author.id);
      const member = message.member;
      const hasAdmin = member?.permissions?.has(PermissionsBitField.Flags.Administrator);

      const memberRoles = member?.roles?.cache?.map(r => r.id) ?? [];
      const hasAllowedRole = ALLOWED_ROLE_IDS.some(id => memberRoles.includes(id));

      if (!isOwner && !hasAdmin && !hasAllowedRole) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        const msg = await message.reply('❌ Você não tem permissão para usar este comando.');
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return;
      }

      // ---- parse
      if (!args?.length) {
        return message.reply('Uso: `!grupo @cargo` | `!grupo <id>` | `!grupo <nome do cargo>`.');
      }

      let role =
        message.mentions.roles.first() ||
        message.guild.roles.cache.get(args[0]);

      if (!role) {
        const alvo = norm(args.join(' '));
        role = message.guild.roles.cache.find(r => {
          const n = norm(r.name);
          return n === alvo || n.includes(alvo);
        });
      }

      if (!role) {
        return message.reply('❌ Não achei esse cargo. Mencione o cargo, passe o **ID** ou o **nome**.');
      }

      // ---- tenta aquecer cache RAPIDINHO (sem travar)
      let fetchNote = '';
      const warm = await tryWarmMembersCache(message.guild, 3500);

      if (warm.note === 'INTENTS') {
        return message.reply('⚠️ Ativa o **Server Members Intent** no Developer Portal pra listar membros por cargo.');
      }
      if (warm.note === 'PARTIAL') {
        fetchNote = ' (cache parcial)';
      }

      // ---- coletar membros (rápido)
      // role.members costuma ser a forma mais rápida quando o cache existe
      let membersWithRole = role.members;

      // fallback: filtra no cache
      if (!membersWithRole || membersWithRole.size === 0) {
        membersWithRole = message.guild.members.cache.filter(m => m.roles.cache.has(role.id));
      }

      if (membersWithRole.size === 0) {
        const cached = message.guild.members.cache.size;
        const total = message.guild.memberCount ?? cached;

        if (cached < total) {
          return message.reply(
            `ℹ️ Não encontrei membros no cargo **${role.name}** agora${fetchNote}. ` +
            `Meu cache ainda não cobriu todos os **${total}** membros (tenho **${cached}** em cache). ` +
            `Tenta de novo daqui a uns segundinhos.`
          );
        }

        return message.reply(`ℹ️ Não há membros com o cargo **${role.name}**.`);
      }

      // ---- paginação por embed (limite 4096 chars)
      const maxDesc = 4096;
      const list = [...membersWithRole.values()].map(m => `<@${m.id}>`);

      const embeds = [];
      let chunk = [];

      const baseEmbed = () =>
        new EmbedBuilder()
          .setColor(BASE_COLOR)
          .setTitle(`👥 Membros com o cargo: ${role.name}`)
          .setThumbnail(message.guild.iconURL({ dynamic: true }))
          .setFooter({
            text: `Total: ${membersWithRole.size} membro(s)${fetchNote}`,
            iconURL: message.author.displayAvatarURL()
          });

      for (const mention of list) {
        const next = [...chunk, mention].join('\n');
        if (next.length > maxDesc) {
          embeds.push(baseEmbed().setDescription(chunk.join('\n')));
          chunk = [mention];
        } else {
          chunk.push(mention);
        }
      }
      if (chunk.length) embeds.push(baseEmbed().setDescription(chunk.join('\n')));

      // manda os embeds
      for (const embed of embeds) {
        await message.channel.send({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[COMANDO !grupo] erro:', err);
      return message.reply('⚠️ Rolou um erro ao listar o cargo. Tenta de novo mais tarde.');
    }
  }
};
