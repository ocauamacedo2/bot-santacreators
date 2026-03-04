// application/events/rolesOnlineMonitor.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmbedBuilder } from "discord.js";

export function startRolesOnlineMonitor(client) {
  // trava global (evita 2x)
  if (globalThis.__sc_rolesOnlineMonitor_v3) return;
  globalThis.__sc_rolesOnlineMonitor_v3 = true;

  const MONITOR_CHANNEL_ID = "1411428081373151232";
  const BANNER_URL =
    "https://cdn.discordapp.com/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif";
  const ONLINE_STATUSES = new Set(["online", "idle", "dnd"]);

  // assinatura pra achar a msg existente
  const SIGNATURE = "HIERARQUIA ONLINE — SANTACREATORS";

  // ===== armazenamento do messageId (pra ficar fixo) =====
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const STORE_DIR = path.join(__dirname, "data");
  const STORE_FILE = path.join(STORE_DIR, "rolesOnlineMonitor.json");

  function ensureStore() {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify({ messageId: null }, null, 2));
    }
  }
  function loadStore() {
    ensureStore();
    try {
      return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    } catch {
      return { messageId: null };
    }
  }
  function saveStore(data) {
    ensureStore();
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch {}
  }

  const ROLE_LINES = [
    { label: "Owner / Resp Creators", roleIds: ["1262262852949905408"] },
    { label: "Resp. Creator / Resp. Creators", roleIds: ["1352408327983861844"] },
    { label: "Resp. Influ", roleIds: ["1262262852949905409"] },
    { label: "Resp. Líder", roleIds: ["1352407252216184833"] },
    { label: "Coord. Creators", roleIds: ["1388976314253312100"] },

    { label: "Coordenação", roleNames: ["Coordenação"] },
    { label: "MKT Ticket", roleNames: ["MKT Ticket"] },
    { label: "Equipe Creator", roleNames: ["Equipe Creator"] },
    { label: "Tickets", roleNames: ["Tickets"] },

    { label: "Manager Creator", roleIds: ["1352385500614234134"] },
    { label: "Gestor Creator", roleNames: ["Gestor Creator"] },
    { label: "Social Medias", roleIds: ["1282119104576098314"] },

    { label: "Creator Líder", roleIds: ["1352939011253076000"] },
    { label: "Creator", roleIds: ["1352429001188180039"] },
    { label: "Creator (2)", roleIds: ["1372716303122567239"] },

    { label: "Creator Novato", roleNames: ["Creator Novato"] },
    { label: "Creator Júnior", roleNames: ["Creator Júnior"] },
    { label: "Creator Pleno", roleNames: ["Creator Pleno"] },

    { label: "SantaCreators (Membros)", roleIds: ["1352275728476930099"] },
  ];

  const resolveRoleIds = (guild, entry) => {
    const ids = new Set(entry.roleIds || []);
    (entry.roleNames || []).forEach((name) => {
      const role = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === name.toLowerCase()
      );
      if (role) ids.add(role.id);
    });
    return [...ids];
  };

  const countForRoleIds = (guild, ids) => {
    const members = guild.members.cache.filter(
      (m) => !m.user.bot && ids.some((id) => m.roles.cache.has(id))
    );
    const online = members.filter((m) =>
      ONLINE_STATUSES.has(m.presence?.status || "offline")
    );
    return { online: online.size, total: members.size };
  };

  const buildEmbed = (guild) => {
    const lines = [];

    for (const entry of ROLE_LINES) {
      const ids = resolveRoleIds(guild, entry);
      if (!ids.length) continue;

      const { online, total } = countForRoleIds(guild, ids);
      const roleLabel =
        ids.length === 1 && guild.roles.cache.get(ids[0])
          ? `<@&${ids[0]}>`
          : `**${entry.label}**`;

      lines.push(`${roleLabel} — **${online} online** de ${total}`);
    }

    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(["👑 **" + SIGNATURE + "**", "", ...lines].join("\n"))
      .setImage(BANNER_URL)
      .setFooter({ text: "Última atualização" })
      .setTimestamp();
  };

  const findAndCleanup = async (channel) => {
    const store = loadStore();

    // 1) tenta pelo messageId salvo
    let mainMsg = null;
    if (store.messageId) {
      mainMsg = await channel.messages.fetch(store.messageId).catch(() => null);
    }

    // 2) busca recentes e acha todas as msgs do monitor
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const matches = recent
      ? [...recent.values()].filter((m) => {
          const e = m.embeds?.[0];
          const desc = e?.data?.description || e?.description || "";
          return (
            m.author?.id === client.user.id &&
            typeof desc === "string" &&
            desc.includes(SIGNATURE)
          );
        })
      : [];

    // se não achou via store, usa a mais recente encontrada
    if (!mainMsg && matches.length > 0) {
      mainMsg = matches[0];
      store.messageId = mainMsg.id;
      saveStore(store);
    }

    // 3) se tiver várias, apaga as extras (mantém mainMsg)
    if (matches.length > 1) {
      for (const m of matches) {
        if (mainMsg && m.id === mainMsg.id) continue;
        await m.delete().catch(() => {});
      }
    }

    // 4) se não existir nenhuma, cria
    if (!mainMsg) {
      const sent = await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setDescription("🔄 Carregando...")
              .setImage(BANNER_URL),
          ],
        })
        .catch(() => null);

      if (sent) {
        store.messageId = sent.id;
        saveStore(store);
        mainMsg = sent;
      }
    }

    return mainMsg;
  };

  const start = async () => {
    const channel = await client.channels.fetch(MONITOR_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error("[SC rolesOnlineMonitor] Canal inválido:", MONITOR_CHANNEL_ID);
      return;
    }

    const guild = channel.guild;

    // garante cache de membros
    await guild.members.fetch().catch(() => {});

    // garante 1 mensagem só (e apaga duplicadas)
    const msg = await findAndCleanup(channel);
    if (!msg) return;

    // trava pra evitar update concorrente (não empilha)
    let updating = false;

    const update = async () => {
      if (updating) return;
      updating = true;
      try {
        await guild.members.fetch().catch(() => {});
        const embed = buildEmbed(guild);
        await msg.edit({ embeds: [embed] }).catch(() => {});
      } finally {
        updating = false;
      }
    };

    await update();
    setInterval(update, 60_000);
  };

  // chama no ready (ou depois)
  start();
}
