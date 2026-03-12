// ./events/logs/botAdd.js
import fs from "fs";
import path from "path";
import {
  EmbedBuilder,
  AuditLogEvent,
  Events,
  time,
  TimestampStyles,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

const ADD_LOG_CHANNEL_ID = "1377900084293009418";
const DB_PATH = path.resolve("./events/logs/_bot_joins.json");

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeDB(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch {}
}

function permsToHuman(permsArr = []) {
  if (!Array.isArray(permsArr) || permsArr.length === 0) return "Nenhuma / padrão";
  return permsArr.map(p => `\`${p}\``).join(" • ");
}

function rolesToHuman(member) {
  const roles = member.roles?.cache
    ?.filter(r => r.id !== member.guild.id)
    ?.sort((a, b) => b.position - a.position);

  if (!roles || roles.size === 0) return "Nenhum";

  const highest = member.roles.highest?.id !== member.guild.id ? member.roles.highest : null;
  const list = roles.map(r => `<@&${r.id}>`).slice(0, 15).join(" ");
  const more = roles.size > 15 ? `\n… +${roles.size - 15} cargos` : "";

  return `${highest ? `🏷️ Highest: <@&${highest.id}>\n` : ""}${list}${more}`;
}

function buildInviteLink(botId, permissionsBitfield) {
  const perms = BigInt(permissionsBitfield ?? 0n).toString();
  return `https://discord.com/oauth2/authorize?client_id=${botId}&scope=bot%20applications.commands&permissions=${perms}`;
}

function getDangerPerms(member) {
  const p = member.permissions;

  const checks = [
    ["Administrator", PermissionsBitField.Flags.Administrator],
    ["ManageGuild", PermissionsBitField.Flags.ManageGuild],
    ["ManageRoles", PermissionsBitField.Flags.ManageRoles],
    ["ManageChannels", PermissionsBitField.Flags.ManageChannels],
    ["ManageWebhooks", PermissionsBitField.Flags.ManageWebhooks],
    ["BanMembers", PermissionsBitField.Flags.BanMembers],
    ["KickMembers", PermissionsBitField.Flags.KickMembers],
    ["ModerateMembers", PermissionsBitField.Flags.ModerateMembers],
    ["ManageMessages", PermissionsBitField.Flags.ManageMessages],
    ["MentionEveryone", PermissionsBitField.Flags.MentionEveryone],
    ["ManageNicknames", PermissionsBitField.Flags.ManageNicknames],
    ["ViewAuditLog", PermissionsBitField.Flags.ViewAuditLog],
  ];

  const hits = checks.filter(([, flag]) => p?.has(flag));
  if (hits.length === 0) return "✅ Nenhuma perigosa detectada";

  return hits.map(([name]) => `⚠️ \`${name}\``).join(" • ");
}

async function findBotAddExecutor(guild, botUserId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 8 });
    const entry = logs.entries.find(e =>
      e?.target?.id === botUserId &&
      (Date.now() - e.createdTimestamp) < 60_000
    );
    return entry ?? null;
  } catch {
    return null;
  }
}

export function setupBotAddLog(client) {
  console.log("✅ setupBotAddLog ligado");

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!member?.user?.bot) return;

      const guild = member.guild;

      // salva join time (pra duração quando sair)
      const db = readDB();
      const key = `${guild.id}:${member.id}`;
      db[key] = { joinedAt: Date.now(), joinedAtISO: new Date().toISOString() };
      writeDB(db);

      const channel = ADD_LOG_CHANNEL_ID ? await client.channels.fetch(ADD_LOG_CHANNEL_ID).catch(() => null) : null;
      if (!channel || !channel.isTextBased()) return;

      // perm no canal
      const me = guild.members.me;
      if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages)) {
          console.log("[BOT ADD] sem perm no canal", ADD_LOG_CHANNEL_ID);
          return;
        }
      }

      const audit = await findBotAddExecutor(guild, member.id);
      const executor = audit?.executor ?? null;

      const botAvatar = member.user.displayAvatarURL({ size: 256 });
      const execAvatar = executor?.displayAvatarURL?.({ size: 256 }) ?? null;

      const botPermsArr = member.permissions?.toArray?.() ?? [];
      const botPermsBit = member.permissions?.bitfield ?? 0n;

      const botProfile = `https://discord.com/users/${member.id}`;
      const botInvite = buildInviteLink(member.id, botPermsBit);

      const botCreatedAt = member.user.createdAt ? time(member.user.createdAt, TimestampStyles.F) : "Desconhecido";
      const botCreatedRel = member.user.createdAt ? time(member.user.createdAt, TimestampStyles.R) : "";

      const joinedAt = member.joinedAt ? time(member.joinedAt, TimestampStyles.F) : time(new Date(), TimestampStyles.F);
      const joinedRel = member.joinedAt ? time(member.joinedAt, TimestampStyles.R) : time(new Date(), TimestampStyles.R);

      const execCreatedAt = executor?.createdAt ? time(executor.createdAt, TimestampStyles.F) : null;
      const execCreatedRel = executor?.createdAt ? time(executor.createdAt, TimestampStyles.R) : null;

      const embed = new EmbedBuilder()
        .setTitle("✅ Bot adicionado no servidor")
        .setColor(0x2ecc71)
        .setThumbnail(botAvatar)
        .setDescription(
          [
            `🤖 **Bot:** ${member}  (\`${member.user.tag}\`)`,
            `🆔 **ID:** \`${member.id}\``,
            `🔗 **Perfil:** ${botProfile}`,
            `➕ **Invite (OAuth2):** ${botInvite}`,
            ``,
            `📅 **Conta criada:** ${botCreatedAt} ${botCreatedRel ? `(${botCreatedRel})` : ""}`,
            `📥 **Entrou no servidor:** ${joinedAt} (${joinedRel})`,
            ``,
            executor
              ? `👤 **Adicionado por:** ${executor} (\`${executor.tag}\`)\n🆔 **ID:** \`${executor.id}\`${execCreatedAt ? `\n📅 **Conta do executor criada:** ${execCreatedAt} (${execCreatedRel})` : ""}`
              : `👤 **Adicionado por:** \`Não consegui puxar do Audit Log\``,
            ``,
            `🕒 **Log gerado em:** ${time(new Date(), TimestampStyles.F)} (${time(new Date(), TimestampStyles.R)})`
          ].join("\n")
        )
        .addFields(
          { name: "🎭 Cargos do bot", value: rolesToHuman(member), inline: false },
          { name: "🛡️ Permissões perigosas", value: getDangerPerms(member).slice(0, 1024), inline: false },
          { name: "🧩 Todas permissões (resumo)", value: permsToHuman(botPermsArr).slice(0, 1024) || "Nenhuma / padrão", inline: false }
        )
        .setFooter({
          text: executor ? `Executor: ${executor.tag} (${executor.id})` : `Servidor: ${guild.name}`,
          iconURL: execAvatar ?? undefined
        });

      // Botões
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("👤 Perfil do Bot")
          .setURL(botProfile),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("➕ Invite do Bot")
          .setURL(botInvite),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("👤 Perfil do Executor")
          .setURL(executor ? `https://discord.com/users/${executor.id}` : "https://discord.com")
          .setDisabled(!executor)
      );

      await channel.send({
        content: executor
          ? `📌 **Quem adicionou:** ${executor} | **Bot:** ${member}`
          : `📌 **Bot:** ${member}`,
        embeds: [embed],
        components: [row]
      });

    } catch (e) {
      console.error("botAdd log error:", e);
    }
  });
}
