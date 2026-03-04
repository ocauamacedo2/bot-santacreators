// d:\bots\events\logs\memberJoinLog.js
import { EmbedBuilder } from "discord.js";

const LOG_CHANNEL_ID = "1362651746866036837";

// Cache local de convites: GuildID -> Map<Code, Uses>
const invitesCache = new Map();

export async function initInviteCache(client) {
  // Aguarda um pouco para garantir que o bot está pronto e com guilds carregadas
  await new Promise(r => setTimeout(r, 2000));
  
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      if (invites) {
        const codeUses = new Map();
        invites.forEach(inv => codeUses.set(inv.code, inv.uses));
        invitesCache.set(guildId, codeUses);
      }
    } catch (e) {
      // console.log(`[MemberJoinLog] Sem permissão para ver convites em ${guild.name}`);
    }
  }
  console.log("[MemberJoinLog] Cache de convites inicializado.");
}

export async function handleInviteCreate(invite) {
  const guildId = invite.guild?.id;
  if (!guildId) return;
  
  const cached = invitesCache.get(guildId) || new Map();
  cached.set(invite.code, invite.uses);
  invitesCache.set(guildId, cached);
}

export async function handleInviteDelete(invite) {
  const guildId = invite.guild?.id;
  if (!guildId) return;
  
  const cached = invitesCache.get(guildId);
  if (cached) {
    cached.delete(invite.code);
  }
}

export async function execute(member, client) {
  const guild = member.guild;
  
  // 1. Tenta descobrir qual convite foi usado
  let inviteUsed = null;
  let inviteInfo = "Desconhecido / Vanity / Temporário";
  let inviter = "Desconhecido";

  try {
    // Pega convites atuais
    const currentInvites = await guild.invites.fetch().catch(() => null);
    const cachedInvites = invitesCache.get(guild.id) || new Map();

    if (currentInvites) {
      // Procura qual convite teve o uso incrementado
      inviteUsed = currentInvites.find(inv => {
        const oldUses = cachedInvites.get(inv.code) || 0;
        return inv.uses > oldUses;
      });

      // Atualiza o cache para o estado atual
      const newCache = new Map();
      currentInvites.forEach(inv => newCache.set(inv.code, inv.uses));
      invitesCache.set(guild.id, newCache);
    }

    if (inviteUsed) {
      inviteInfo = `\`${inviteUsed.code}\` (${inviteUsed.uses} usos)`;
      if (inviteUsed.inviter) {
        inviter = `${inviteUsed.inviter.tag} (<@${inviteUsed.inviter.id}>)`;
      }
    } else {
      // Se não achou convite normal, verifica Vanity
      try {
        const vanity = await guild.fetchVanityData().catch(() => null);
        if (vanity && guild.vanityURLCode) {
           // Se não achou outro, assume que pode ser vanity
           // (Lógica simplificada, pois vanity uses nem sempre atualizam realtime na API)
           inviteInfo = `Vanity: .gg/${guild.vanityURLCode}`;
        }
      } catch {}
    }
  } catch (e) {
    console.error("[MemberJoinLog] Erro ao processar convites:", e);
  }

  // 2. Envia Log
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel || !logChannel.isTextBased()) return;

  const accountCreatedTimestamp = Math.floor(member.user.createdTimestamp / 1000);
  const joinedTimestamp = Math.floor(member.joinedTimestamp / 1000);
  
  // Cargos (ignora @everyone)
  const roles = member.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString())
    .join(", ") || "Nenhum";

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setAuthor({ name: `Entrada: ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription(`**${member.user.tag}** entrou no servidor.`)
    .addFields(
      { name: "👤 Membro", value: `<@${member.id}> (\`${member.id}\`)`, inline: true },
      { name: "🔢 Membro #", value: `${guild.memberCount}`, inline: true },
      { name: "\u200b", value: "\u200b", inline: true }, // Spacer

      { name: "📨 Convite", value: inviteInfo, inline: true },
      { name: "👋 Convidado por", value: inviter, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },

      { name: "📅 Conta Criada", value: `<t:${accountCreatedTimestamp}:F> (<t:${accountCreatedTimestamp}:R>)`, inline: false },
      { name: "📥 Entrada", value: `<t:${joinedTimestamp}:F>`, inline: false },
      
      { name: "🛡️ Cargos Atuais", value: roles, inline: false }
    )
    .setFooter({ text: `ID: ${member.id}` })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}
