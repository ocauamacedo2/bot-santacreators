// /application/commands/admin/criarcargo.js
// SC_CMD — !criarcargo (com COR) — modular (ESM) + LOG completo
// • Cria cargo SEM permissão (tag), aceita emojis/símbolos
// • Cor opcional: "!criarcargo Nome | #FF66CC" OU nomes (roxo, rosa...)
// • Se não informar cor, pergunta via botões (Definir cor / Sem cor)
// • mentionable:true, hoist:false
// • Permissão travada aos IDs/cargos
// • LOG COMPLETO em 1459302055851200522 (jump link, botões, ícones, tempo no server, qual cargo liberou)
// • Timeout 3 min
// ======================================================================

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { resolveLogChannel } from "../../events/channelResolver.js";

// quem pode por ID direto
const ALLOWED_USER_IDS = [
  "660311795327828008", // você
];

// quem pode por cargo
const ALLOWED_ROLE_IDS = [
  "1262262852949905408", // owner
  "1352407252216184833", // resp líder
  "1352408327983861844", // resp creator
  "1262262852949905409", // resp influ
  "1282119104576098314", // mktticket
  "1414651836861907006", // responsáveis
];

// canal do LOG
const LOG_CHANNEL_ID = "1459302055851200522";

// cor padrão embeds
const BASE_COLOR =
  (process.env.BASE_COLORS && Number.isInteger(+process.env.BASE_COLORS))
    ? +process.env.BASE_COLORS
    : 0x8651F6;

// timeouts
const ASK_TIMEOUT_MS = 180_000; // 3 min
const AUTO_DELETE_MS = 10_000;

// nomes comuns => hex
const COLOR_NAMES = {
  roxo: "#7D3CFF",
  roxosc: "#8651F6",
  rosa: "#FF69B4",
  vermelho: "#FF3B30",
  azul: "#258CFF",
  verde: "#2ECC71",
  amarelo: "#FFD60A",
  laranja: "#FF9500",
  preto: "#000000",
  branco: "#FFFFFF",
  ciano: "#00FFFF",
  turquesa: "#1ABC9C",
  magenta: "#FF00FF",
  lilas: "#C8A2C8",
};

// ================== HELPERS ==================
function normalizeHex(s) {
  let v = s.trim().toLowerCase();
  if (v.startsWith("0x")) v = "#" + v.slice(2);
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return v;
}

function parseColor(input) {
  if (!input) return null;
  const raw = input.trim();

  const byName = COLOR_NAMES[raw.toLowerCase()];
  if (byName) return byName;

  if (/^#?[0-9a-f]{3}$/i.test(raw) || /^#?[0-9a-f]{6}$/i.test(raw)) {
    return normalizeHex(raw);
  }

  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 0 && n <= 0xFFFFFF) return n;
  }

  if (/^0x[0-9a-f]{6}$/i.test(raw)) {
    return parseInt(raw, 16);
  }

  return null;
}

function splitNameAndColorFromArgs(rest) {
  const joined = rest.join(" ").trim();
  if (!joined) return { name: null, colorRaw: null };

  const parts = joined.split("|");
  if (parts.length >= 2) {
    const name = parts[0].trim();
    const colorRaw = parts.slice(1).join("|").trim();
    return { name: name || null, colorRaw: colorRaw || null };
  }
  return { name: joined, colorRaw: null };
}

function hexFromNumber(n) {
  return `#${Number(n).toString(16).padStart(6, "0").toUpperCase()}`;
}

function jumpLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function pickAllowReason(member, authorId) {
  // retorna { allowed: boolean, via: "USER_ID"/"ROLE", roleUsed: Role|null }
  if (ALLOWED_USER_IDS.includes(authorId)) {
    return { allowed: true, via: "USER_ID", roleUsed: null };
  }

  if (!member) return { allowed: false, via: null, roleUsed: null };

  const allowedRoles = member.roles.cache.filter(r => ALLOWED_ROLE_IDS.includes(r.id));
  if (!allowedRoles.size) return { allowed: false, via: null, roleUsed: null };

  // pega o mais alto (maior position)
  const roleUsed = allowedRoles.sort((a, b) => b.position - a.position).first() || null;
  return { allowed: true, via: "ROLE", roleUsed };
}

async function sendTimed(channel, payload, ms = AUTO_DELETE_MS) {
  const sent = await channel.send(payload);
  setTimeout(() => sent.delete().catch(() => {}), ms);
  return sent;
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h && !m) parts.push(`${ss}s`);
  return parts.join(" ");
}

// ================== EXPORT PADRÃO ==================
const command = {
  name: 'criarcargo',
  description: 'Cria um novo cargo com nome e cor opcionais.',
  async execute(message, args, client) {
    // Evita duplicidade (caso rode no index.js e no messageCreate.js ao mesmo tempo)
    if (message.__CRIARCARGO_RUN) return;
    message.__CRIARCARGO_RUN = true;

    try {
      if (!message?.guild) return;
      if (message.author?.bot) return;

      // Permissão
      const perm = pickAllowReason(message.member, message.author.id);
      if (!perm.allowed) {
        setTimeout(() => message.delete().catch(() => {}), 1000);
        await sendTimed(message.channel, { content: "Você não tem permissão para usar este comando." }, 7000);
        return;
      }

      const { name: parsedName, colorRaw: parsedColorRaw } = splitNameAndColorFromArgs(args);

      let roleName = parsedName;
      let colorResolved = parseColor(parsedColorRaw);

    // pede nome se não veio
    if (!roleName) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Qual será o **nome** do novo cargo?")
            .setDescription("Pode usar **emojis e símbolos**.\nEx: `!criarcargo SantaCreators 💜 | roxo` ou responda aqui com o nome.")
            .setColor(BASE_COLOR),
        ],
      });

      const nameFilter = (m) => m.author.id === message.author.id && m.content?.trim()?.length;
      const collected = await message.channel.awaitMessages({ filter: nameFilter, max: 1, time: ASK_TIMEOUT_MS }).catch(() => null);
      const first = collected?.first();

      if (!first) {
        await sendTimed(message.channel, { content: "Tempo esgotado para informar o nome." }, 7000);
        return;
      }

      roleName = first.content.trim();
      await first.delete().catch(() => {});
    }

    // se não veio cor no comando, pergunta via botões
    if (parsedColorRaw === null) {
      const ask = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Deseja definir uma **cor** para o cargo?")
            .setDescription("Você pode informar **hex** (`#FF66CC`) ou um nome como **roxo, rosa, azul**…")
            .setColor(BASE_COLOR),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`criarcargo:cor_sim:${message.author.id}`)
              .setLabel("Definir cor")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`criarcargo:cor_nao:${message.author.id}`)
              .setLabel("Sem cor")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });

      const btnFilter = (i) =>
        i.user.id === message.author.id &&
        (i.customId === `criarcargo:cor_sim:${message.author.id}` ||
         i.customId === `criarcargo:cor_nao:${message.author.id}`);

      const btn = await ask.awaitMessageComponent({ filter: btnFilter, time: ASK_TIMEOUT_MS }).catch(() => null);
      if (!btn) {
        try { await ask.edit({ components: [] }); } catch {}
        await sendTimed(message.channel, { content: "Tempo esgotado para escolher sobre a cor." }, 7000);
        return;
      }

      await btn.deferUpdate().catch(() => {});
      try { await ask.edit({ components: [] }); } catch {}

      if (btn.customId.startsWith("criarcargo:cor_sim:")) {
        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Informe a cor do cargo")
              .setDescription("Exemplos: `#8651F6`, `#FF69B4`, `roxo`, `azul`, `255` (0-16777215), `0x8651F6`.")
              .setColor(BASE_COLOR),
          ],
        });

        const colorFilter = (m) => m.author.id === message.author.id && m.content?.trim()?.length;
        const ccol = await message.channel.awaitMessages({ filter: colorFilter, max: 1, time: ASK_TIMEOUT_MS }).catch(() => null);
        const cmsg = ccol?.first();

        if (cmsg) {
          const maybe = parseColor(cmsg.content);
          if (maybe === null) {
            await sendTimed(message.channel, { content: "Cor inválida. Vou criar o cargo com a cor padrão." }, 7000);
          } else {
            colorResolved = maybe;
          }
          await cmsg.delete().catch(() => {});
        } else {
          await sendTimed(message.channel, { content: "Tempo esgotado para informar a cor. Usarei cor padrão." }, 7000);
        }
      }
    }

    // cria cargo
    let newRole = null;
    try {
      const createPayload = {
        name: roleName,
        permissions: [],
        mentionable: true,
        hoist: false,
      };
      if (colorResolved !== null) createPayload.color = colorResolved;

      newRole = await message.guild.roles.create(createPayload);
    } catch (err) {
      console.error("[criarcargo] Erro ao criar cargo:", err);
      await sendTimed(message.channel, { content: "Ocorreu um erro ao criar o cargo (verifique permissões/hierarquia do bot)." }, 10_000);
      return;
    }

    // confirma no chat (curtinho)
    await sendTimed(message.channel, {
      embeds: [
        new EmbedBuilder()
          .setDescription(`Cargo criado com sucesso (sem permissões): <@&${newRole.id}>`)
          .setColor(BASE_COLOR),
      ],
    });

    // ================== LOG COMPLETO ==================
    const logChannel = await resolveLogChannel(client, LOG_CHANNEL_ID);
    if (logChannel?.isTextBased?.()) {
      const member = message.member;
      const nowTs = Math.floor(Date.now() / 1000);

      const who = message.author;
      const userAvatar = who.displayAvatarURL({ extension: "png", size: 256 });

      const joinAge =
        member?.joinedTimestamp
          ? fmtDuration(Date.now() - member.joinedTimestamp)
          : "desconhecido";

      const msgJump = jumpLink(message.guild.id, message.channel.id, message.id);

      const allowText =
        perm.via === "USER_ID"
          ? `✅ **Liberado por:** ID fixo (\`${who.id}\`)`
          : perm.via === "ROLE"
            ? `✅ **Liberado por cargo:** ${perm.roleUsed ? `${perm.roleUsed} (\`${perm.roleUsed.id}\`)` : "cargo permitido"}`
            : "❌ (não deveria acontecer)";

      const colorText =
        colorResolved === null
          ? "Padrão"
          : (typeof colorResolved === "number" ? hexFromNumber(colorResolved) : String(colorResolved).toUpperCase());

      const embed = new EmbedBuilder()
        .setTitle("🆕 CriarCargo — Log Completo")
        .setColor(BASE_COLOR)
        .setThumbnail(userAvatar)
        .addFields(
          { name: "👤 Quem criou", value: `${who} \n\`${who.tag}\` \nID: \`${who.id}\``, inline: true },
          { name: "🕒 Data/Hora", value: `<t:${nowTs}:F>\n(<t:${nowTs}:R>)`, inline: true },
          { name: "⏳ Tempo no servidor", value: joinAge, inline: true },

          { name: "📛 Cargo criado", value: `<@&${newRole.id}>\nID: \`${newRole.id}\``, inline: true },
          { name: "🎨 Cor", value: colorText, inline: true },
          { name: "📌 Posição", value: `\`${newRole.position}\``, inline: true },

          { name: "💬 Onde foi usado", value: `Canal: ${message.channel}\nMsg: [Abrir mensagem](${msgJump})`, inline: false },
          { name: "🔐 Permissão", value: allowText, inline: false },
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Abrir mensagem")
          .setURL(msgJump),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Abrir canal")
          .setURL(`https://discord.com/channels/${message.guild.id}/${message.channel.id}`),
      );

      await logChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
    }

    } catch (err) {
      console.error("[criarcargo] Handler error:", err);
    }
  }
};

export default command;

// ================== COMPATIBILIDADE (index.js) ==================
export async function criarCargoHandleMessage(message, client) {
  const content = message.content || "";
  if (!content.toLowerCase().startsWith("!criarcargo")) return false;

  const args = content.slice("!criarcargo".length).trim().split(/\s+/);
  await command.execute(message, args, client);
  return true;
}
