// ./events/logs/botRemove.js
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

const REMOVE_LOG_CHANNEL_ID = "1377906318869790801";
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

function formatDuration(ms) {
  if (!ms || ms < 0) return "Desconhecido";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

async function findRemoveAudit(guild, botUserId) {
  try {
    const kickLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 8 }).catch(() => null);
    const kickEntry = kickLogs?.entries?.find(e =>
      e?.target?.id === botUserId &&
      (Date.now() - e.createdTimestamp) < 60_000
    );
    if (kickEntry) return { type: "KICK", entry: kickEntry };

    const banLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 8 }).catch(() => null);
    const banEntry = banLogs?.entries?.find(e =>
      e?.target?.id === botUserId &&
      (Date.now() - e.createdTimestamp) < 60_000
    );
    if (banEntry) return { type: "BAN", entry: banEntry };

    return { type: "SAIU", entry: null };
  } catch {
    return { type: "SAIU", entry: null };
  }
}

export function setupBotRemoveLog(client) {
  console.log("✅ setupBotRemoveLog ligado");

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (!member?.user?.bot) return;

      const guild = member.guild;

      const channel = await client.channels.fetch(REMOVE_LOG_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      // perm no canal
      const me = guild.members.me;
      if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages)) {
          console.log("[BOT REMOVE] sem perm no canal", REMOVE_LOG_CHANNEL_ID);
          return;
        }
      }

      const botAvatar = member.user.displayAvatarURL({ size: 256 });
      const botProfile = `https://discord.com/users/${member.id}`;

      // duração pelo DB
      const db = readDB();
      const key = `${guild.id}:${member.id}`;
      const joinedAtSaved = db?.[key]?.joinedAt ?? null;
      const duration = joinedAtSaved ? formatDuration(Date.now() - joinedAtSaved) : "Desconhecido";

      // limpa DB
      if (db[key]) {
        delete db[key];
        writeDB(db);
      }

      const auditRes = await findRemoveAudit(guild, member.id);
      const entry = auditRes.entry;
      const executor = entry?.executor ?? null;
      const reason = entry?.reason ?? "Sem motivo (ou não informado)";

      let actionLabel = "🚪 Bot saiu";
      if (auditRes.type === "KICK") actionLabel = "👢 Bot removido (KICK)";
      if (auditRes.type === "BAN") actionLabel = "⛔ Bot removido (BAN)";

      const execAvatar = executor?.displayAvatarURL?.({ size: 256 }) ?? null;

      const botCreatedAt = member.user.createdAt ? time(member.user.createdAt, TimestampStyles.F) : "Desconhecido";
      const botCreatedRel = member.user.createdAt ? time(member.user.createdAt, TimestampStyles.R) : "";

      const execCreatedAt = executor?.createdAt ? time(executor.createdAt, TimestampStyles.F) : null;
      const execCreatedRel = executor?.createdAt ? time(executor.createdAt, TimestampStyles.R) : null;

      const embed = new EmbedBuilder()
        .setTitle(actionLabel)
        .setColor(auditRes.type === "BAN" ? 0xe74c3c : auditRes.type === "KICK" ? 0xf39c12 : 0x95a5a6)
        .setThumbnail(botAvatar)
        .setDescription(
          [
            `🤖 **Bot:** <@${member.id}> (\`${member.user.tag}\`)`,
            `🆔 **ID:** \`${member.id}\``,
            `🔗 **Perfil:** ${botProfile}`,
            ``,
            `📅 **Conta criada:** ${botCreatedAt} ${botCreatedRel ? `(${botCreatedRel})` : ""}`,
            `⏱️ **Tempo no servidor:** **${duration}**`,
            ``,
            executor
              ? `👤 **Removido por:** ${executor} (\`${executor.tag}\`)\n🆔 **ID:** \`${executor.id}\`${execCreatedAt ? `\n📅 **Conta do executor criada:** ${execCreatedAt} (${execCreatedRel})` : ""}`
              : `👤 **Removido por:** \`Não achei no Audit Log (pode ter só saído)\``,
            ``,
            `🧾 **Motivo:** ${reason}`,
            ``,
            `🕒 **Log gerado em:** ${time(new Date(), TimestampStyles.F)} (${time(new Date(), TimestampStyles.R)})`
          ].join("\n")
        )
        .setFooter({
          text: executor ? `Executor: ${executor.tag} (${executor.id})` : `Servidor: ${guild.name}`,
          iconURL: execAvatar ?? undefined
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("👤 Perfil do Bot")
          .setURL(botProfile),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("👤 Perfil do Executor")
          .setURL(executor ? `https://discord.com/users/${executor.id}` : "https://discord.com")
          .setDisabled(!executor)
      );

      await channel.send({
        content: executor
          ? `📌 **Quem removeu:** ${executor} | **Bot:** <@${member.id}>`
          : `📌 **Bot:** <@${member.id}>`,
        embeds: [embed],
        components: [row]
      });

    } catch (e) {
      console.error("botRemove log error:", e);
    }
  });
}
