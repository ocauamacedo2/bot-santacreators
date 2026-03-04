// d:\bots\events\hierarquiaDivisoes.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionsBitField,
} from "discord.js";

// ================= CONFIGURAÇÃO =================
const CONFIG = {
  // Canais
  PANEL_CHANNEL_ID: "1370830395637239928", // Canal onde aparece a hierarquia
  LOG_CHANNEL_ID: "1476721200314187796",   // Canal de logs

  // Cargos (IDs)
  ROLES: {
    OWNER: "1262262852949905408",
    RESP_CREATOR: "1352408327983861844",
    RESP_INFLU: "1262262852949905409",
    RESP_LIDER: "1352407252216184833",
    COORD_CREATOR: "1388976314253312100",
    MANAGER: "1352385500614234134",
    CREATOR: "1352429001188180039",

    // ✅ ORDEM POR CARGOS (GESTÃO)
    GESTOR: "1388975939161161728",
    MANAGER_CREATOR: "1388976155830255697",
    SOCIAL_MEDIAS: "1388976094920704141",

    // ✅ ORDEM POR CARGOS (EQUIPES)
    EQ_MANAGER: "1392678638176043029",
    EQ_SOCIAL_MEDIAS: "1387253972661964840",
    EQ_CREATORS: "1352429001188180039", // mesmo que CREATOR (ok)
  },

  // ✅ Grupos e ordem visual (do mais alto pro mais baixo)
  GROUPS: {
    GESTAO: [
      { id: "GESTOR", title: "👑 Gestor" },
      { id: "MANAGER_CREATOR", title: "🎯 Manager Creators" },
      { id: "SOCIAL_MEDIAS", title: "📱 Social Medias" },
    ],
    EQUIPE: [
      { id: "EQ_MANAGER", title: "🎯 Equipe Manager" },
      { id: "EQ_SOCIAL_MEDIAS", title: "📱 Equipe Social Medias" },
      { id: "EQ_CREATORS", title: "🎬 Equipe Creators" },
    ],
  },

  // Usuários com permissão TOTAL (Bypass)
  ADMIN_USERS: [
    "660311795327828008",  // Você
    "1262262852949905408", // Owner
  ],

  // Cargos com permissão TOTAL
  ADMIN_ROLES: [
    "1352408327983861844", // Resp Creator
    "1262262852949905409", // Resp Influ
  ],

  // Cargos com permissão PARCIAL (apenas abaixo deles)
  MOD_ROLES: [
    "1352407252216184833", // Resp Líder
  ],

  // Slots de Horário
  SLOTS: {
    NONE: "none",
    EVENING: "evening", // 17:00 - 19:00
    DAWN: "dawn",       // 01:00 - 03:00
  },

  LABELS: {
    evening: "🌅 17:00 às 19:00",
    dawn: "🌌 01:00 às 03:00",
    none: "⚪ Sem Horário Fixo",
  },

  // Visual
  GIF_FOOTER:
    "https://media.discordapp.net/attachments/1362477839944777889/1374893068649500783/standard_1.gif?ex=69a18133&is=69a02fb3&hm=ea8c7358946665a87e0ec2b3caa3d7bb671c12fb854f9b88e251a67a0e80bc56&=&width=1867&height=108",

  EMOJIS: {
    CROWN_BLACK: "<a:blackcrown:1306729071551582208>",
    CROWN_GOLD: "<a:coroa:842223866742046730>",
    CROWN_MASTER: "<a:coroa:1306686455715725313>",
    CROWN_INFLU: "<a:coroa:1324521312328351906>",
    CROWN_CYAN: "<a:coroa_ciano:1321956650067824650>",
    CROWN_GREEN: "<a:verde_coroa:1306686191458058313>",
    DOT: "<:ponto1:1183282270761664622>",
  },

  // Fallbacks caso o bot não tenha UseExternalEmojis no canal
  EMOJI_FALLBACKS: {
    CROWN_BLACK: "👑",
    CROWN_GOLD: "👑",
    CROWN_MASTER: "👑",
    CROWN_INFLU: "👑",
    CROWN_CYAN: "👑",
    CROWN_GREEN: "🟢",
    DOT: "•",
  },
};

// ================= PERSISTÊNCIA =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STATE_FILE = path.join(DATA_DIR, "hierarquia_slots.json");
const PANEL_STATE_FILE = path.join(DATA_DIR, "hierarquia_panel_state.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSlots() {
  ensureDir();
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSlots(data) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadPanelState() {
  ensureDir();
  try {
    if (!fs.existsSync(PANEL_STATE_FILE)) return { messageId: null, lastHash: null };
    return JSON.parse(fs.readFileSync(PANEL_STATE_FILE, "utf8"));
  } catch {
    return { messageId: null, lastHash: null };
  }
}

function savePanelState(data) {
  ensureDir();
  fs.writeFileSync(PANEL_STATE_FILE, JSON.stringify(data, null, 2));
}

// ================= HELPERS =================
function checkPermission(member) {
  if (!member) return "NONE";
  if (CONFIG.ADMIN_USERS.includes(member.id)) return "ADMIN";
  if (member.roles?.cache?.some((r) => CONFIG.ADMIN_ROLES.includes(r.id))) return "ADMIN";
  if (member.roles?.cache?.some((r) => CONFIG.MOD_ROLES.includes(r.id))) return "MOD";
  return "NONE";
}

// Filtra membros que podem ser editados pelo executor
async function getEditableMembers(guild, permissionLevel) {
  await guild.members.fetch();

  // Cargos que podem ter horário definido (Coord e Resp Lider)
  const targetRoles = [CONFIG.ROLES.COORD_CREATOR, CONFIG.ROLES.RESP_LIDER];

  let members = guild.members.cache.filter(
    (m) => !m.user.bot && m.roles.cache.some((r) => targetRoles.includes(r.id))
  );

  // Se for MOD (Resp Líder), só pode editar Coord Creators (abaixo dele)
  if (permissionLevel === "MOD") {
    members = members.filter((m) => !m.roles.cache.has(CONFIG.ROLES.RESP_LIDER));
  }

  return members.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function parseEmojiCode(code) {
  const m = String(code || "").match(/^<a?:(\w+):(\d+)>$/);
  if (!m) return null;
  return { name: m[1], id: m[2] };
}

function canUseExternalEmojis(channel) {
  const me = channel?.guild?.members?.me;
  if (!me) return true;
  const perms = channel.permissionsFor(me);
  if (!perms) return true;
  return perms.has(PermissionsBitField.Flags.UseExternalEmojis);
}

function resolveEmoji(channel, code, fallback) {
  const parsed = parseEmojiCode(code);
  if (!parsed) return fallback;

  if (!canUseExternalEmojis(channel)) return fallback;

  const inClient = channel.client.emojis.cache.get(parsed.id);
  if (inClient) return code;

  const inGuild = channel.guild.emojis.cache.get(parsed.id);
  if (inGuild) return code;

  return fallback;
}

// Lista formatada por grupos (ex: Gestor/Manager/Social)
// ✅ "seen" dá prioridade: se já apareceu em cima, não aparece em baixo
function getMembersByRoleGroups(guild, groupDefs, slots, filterSlot, E, seen) {
  const lines = [];

  for (const g of groupDefs) {
    const roleId = CONFIG.ROLES[g.id];
    const role = guild.roles.cache.get(roleId);

    const title = `### ${g.title}`;
    lines.push(title);

    if (!role) {
      lines.push("_Cargo não encontrado_");
      lines.push("");
      continue;
    }

    let members = role.members
      .filter((m) => !m.user.bot)
      .map((m) => m);

    // aplica filtro slot se vier (se você quiser usar no futuro)
    if (filterSlot !== "ANY") {
      members = members.filter((m) => {
        const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
        return userSlot === filterSlot;
      });
    }

    // ✅ prioridade (não duplica)
    if (seen) {
      members = members.filter((m) => !seen.has(m.id));
    }

    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (members.length === 0) {
      lines.push("_Ninguém_");
      lines.push("");
      continue;
    }

    // ✅ marca como "já listado" pra não aparecer em categorias abaixo
    if (seen) {
      for (const m of members) seen.add(m.id);
    }

    lines.push(
      members
        .map((m) => {
          const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
          let icon = "";
          if (filterSlot === "ANY") {
            if (userSlot === CONFIG.SLOTS.EVENING) icon = "🌅 ";
            if (userSlot === CONFIG.SLOTS.DAWN) icon = "🌌 ";
          }
          return `${E.DOT} ${icon}${m.toString()}`;
        })
        .join("\n")
    );

    lines.push("");
  }

  return lines.join("\n");
}

let PANEL_UPDATING = false;
let PANEL_NEEDS_UPDATE = false;
let UPDATE_DEBOUNCE = null;

// ✅ Fila de atualização (resolve: "diz que atualizou mas não atualiza")
let PANEL_UPDATE_PROMISE = null;

// ================= CORE: ATUALIZAR PAINEL =================
async function updateHierarchyPanel(client) {
  // ✅ FILA REAL: se já estiver atualizando, não "finge" que atualizou
  if (PANEL_UPDATE_PROMISE) {
    PANEL_NEEDS_UPDATE = true;
    return PANEL_UPDATE_PROMISE;
  }

  PANEL_NEEDS_UPDATE = false;

  PANEL_UPDATE_PROMISE = (async () => {
    do {
      PANEL_UPDATING = true;

      try {
        const channel = await client.channels.fetch(CONFIG.PANEL_CHANNEL_ID).catch((err) => {
          console.error("[Hierarquia] ❌ Erro ao buscar canal:", err);
          return null;
        });

        if (!channel || !channel.isTextBased()) {
          console.error(`[Hierarquia] ❌ Canal ${CONFIG.PANEL_CHANNEL_ID} não encontrado ou sem permissão.`);
          return;
        }

        const guild = channel.guild;

        // ✅ força atualizar cache (melhora "demora pra refletir")
        await guild.roles.fetch();
        try {
          await guild.members.fetch({ time: 60000 });
        } catch (e) {
          console.warn("[Hierarquia] Fetch members timeout (usando cache parcial):", e.message);
        }

        const slots = loadSlots();

        // Resolve emojis (com fallback)
        const E = {};
        for (const k of Object.keys(CONFIG.EMOJIS)) {
          E[k] = resolveEmoji(channel, CONFIG.EMOJIS[k], CONFIG.EMOJI_FALLBACKS[k] || "");
        }

        // ✅ prioridade global: quem apareceu em cima não aparece em baixo
        const seen = new Set();

        // Helper para pegar lista formatada
        const getMembersByRole = (roleId, filterSlot = null) => {
          const role = guild.roles.cache.get(roleId);
          if (!role) return "";

          const members = role.members
            .filter((m) => !m.user.bot)
            .map((m) => m);

          const filtered = members.filter((m) => {
            const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
            if (filterSlot === "ANY") return true;
            return userSlot === filterSlot;
          });

          // ✅ não repete se já apareceu (prioridade)
          const finalList = filtered.filter((m) => !seen.has(m.id));

          if (finalList.length === 0) return "";

          // ✅ marca como já listado
          for (const m of finalList) seen.add(m.id);

          return finalList
            .map((m) => {
              const userSlot = slots[m.id] || CONFIG.SLOTS.NONE;
              let icon = "";
              if (filterSlot === "ANY") {
                if (userSlot === CONFIG.SLOTS.EVENING) icon = "🌅 ";
                if (userSlot === CONFIG.SLOTS.DAWN) icon = "🌌 ";
              }
              return `${E.DOT} ${icon}${m.toString()}`;
            })
            .join("\n");
        };

        const sections = [
          `# ${E.CROWN_BLACK}   👑 HIERARQUIA OFICIAL — SANTACREATORS  ${E.CROWN_BLACK}`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_GOLD} OWNER ${E.CROWN_GOLD}`,
          getMembersByRole(CONFIG.ROLES.OWNER, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_GOLD} RESP. CREATORS ${E.CROWN_GOLD}`,
          getMembersByRole(CONFIG.ROLES.RESP_CREATOR, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_INFLU}   RESP. INFLU  ${E.CROWN_INFLU}`,
          getMembersByRole(CONFIG.ROLES.RESP_INFLU, "ANY") || `${E.DOT} (Vago)`,
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_CYAN}   RESP. LIDER ${E.CROWN_CYAN}`,
          "",
          `### 🌅 HORÁRIO: 17:00 às 19:00`,
          getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.EVENING) || "_Ninguém definido_",
          "",
          `### 🌌 HORÁRIO: 01:00 às 03:00`,
          getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.DAWN) || "_Ninguém definido_",
          "",
          `### ⚪ Sem Horário Fixo / Flexível`,
          getMembersByRole(CONFIG.ROLES.RESP_LIDER, CONFIG.SLOTS.NONE) || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_GREEN}  COORD. CREATORS  ${E.CROWN_GREEN}`,
          "",
          `### 🌅 HORÁRIO: 17:00 às 19:00`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.EVENING) || "_Ninguém definido_",
          "",
          `### 🌌 HORÁRIO: 01:00 às 03:00`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.DAWN) || "_Ninguém definido_",
          "",
          `### ⚪ Sem Horário Fixo / Flexível`,
          getMembersByRole(CONFIG.ROLES.COORD_CREATOR, CONFIG.SLOTS.NONE) || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_INFLU}  COORDENAÇÃO / GESTÃO ${E.CROWN_INFLU}`,
          "",
          getMembersByRoleGroups(guild, CONFIG.GROUPS.GESTAO, slots, "ANY", E, seen) || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          `#  ${E.CROWN_CYAN}    EQUIPE CREATOR  ${E.CROWN_CYAN}`,
          "",
          getMembersByRoleGroups(guild, CONFIG.GROUPS.EQUIPE, slots, "ANY", E, seen) || "_Ninguém_",
          "",
          "┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅",
          "",
          "🧩 **Organização e comunicação são pilares da nossa estrutura.**",
          "⚠️ *Qualquer denúncia deve ser tratada com os responsáveis!*",
          "",
          "**⚠️ AVISO IMPORTANTE — SANTACREATORS ⚠️**",
          "Pedimos a atenção e o respeito à **hierarquia oficial da empresa**.",
          "Qualquer assunto relacionado à **SantaCreators** deve ser tratado **diretamente com a gestão**.",
        ];

        const embed = new EmbedBuilder()
          .setColor("#2b2d31")
          .setDescription(sections.join("\n"))
          .setImage(CONFIG.GIF_FOOTER);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("hier_manage_slots")
            .setLabel("⚙️ Gerenciar Horários (Coord+)")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🕰️"),
          new ButtonBuilder()
            .setCustomId("hier_refresh")
            .setLabel("🔄 Atualizar")
            .setStyle(ButtonStyle.Secondary)
        );

        // ✅ OTIMIZAÇÃO: Verifica se houve mudança real antes de editar (Anti-Flood)
        const payloadData = {
          embeds: [embed.toJSON()],
          components: [row.toJSON()]
        };
        const newHash = crypto.createHash('md5').update(JSON.stringify(payloadData)).digest('hex');
        const panelState = loadPanelState();

        // Se o hash for igual ao último salvo e a mensagem existe, não faz nada
        if (panelState.messageId && panelState.lastHash === newHash) {
          // console.log("[Hierarquia] 💤 Nenhuma alteração detectada. Pulando edição.");
          PANEL_UPDATING = false;
          return;
        }

        if (panelState.messageId) {
          try {
            const msg = await channel.messages.fetch(panelState.messageId);
            await msg.edit({ embeds: [embed], components: [row] });
            savePanelState({ messageId: msg.id, lastHash: newHash });
            console.log("[Hierarquia] ✅ Painel editado com sucesso.");
            return;
          } catch (err) {
            console.error("[Hierarquia] ⚠️ Não consegui editar a msg antiga do painel. Vou recriar.", err);
          }
        }

        // Apaga mensagens antigas do bot para limpar o canal
        try {
          const recent = await channel.messages.fetch({ limit: 10 });
          const botMsgs = recent.filter((m) => m.author.id === client.user.id);
          for (const m of botMsgs.values()) await m.delete().catch(() => {});
        } catch {}

        const newMsg = await channel.send({ embeds: [embed], components: [row] });
        savePanelState({ messageId: newMsg.id });
        console.log("[Hierarquia] ✅ Novo painel enviado.");
      } catch (err) {
        console.error("[Hierarquia] ❌ ERRO REAL (updateHierarchyPanel):", err);
      } finally {
        PANEL_UPDATING = false;
      }

      // se alguém pediu update enquanto rodava, roda de novo imediatamente
    } while (PANEL_NEEDS_UPDATE === true);

  })().finally(() => {
    PANEL_UPDATE_PROMISE = null;
  });

  return PANEL_UPDATE_PROMISE;
}

// ================= LOGS COM BOTÃO DE REVERTER =================
async function logChange(client, actor, targetUser, oldSlot, newSlot) {
  const channel = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const oldKey = oldSlot || CONFIG.SLOTS.NONE;
  const newKey = newSlot || CONFIG.SLOTS.NONE;

  const embed = new EmbedBuilder()
    .setTitle("🕰️ Alteração de Horário na Hierarquia")
    .setColor(newKey === CONFIG.SLOTS.NONE ? "#e74c3c" : "#2ecc71")
    .addFields(
      { name: "👤 Membro", value: `${targetUser.toString()} (\`${targetUser.id}\`)`, inline: true },
      { name: "👮 Alterado por", value: `${actor.toString()} (\`${actor.id}\`)`, inline: true },
      { name: "📉 Antes", value: CONFIG.LABELS[oldKey] || oldKey, inline: true },
      { name: "📈 Depois", value: CONFIG.LABELS[newKey] || newKey, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Sistema de Hierarquia • SantaCreators" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hier_revert:${targetUser.id}:${oldKey}`)
      .setLabel("↩️ Reverter Alteração")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// ================= AUTO-UPDATE (MUDANÇA DE CARGO) =================
export async function hierarquiaHandleGuildMemberUpdate(oldMember, newMember, client) {
  // ✅ OTIMIZAÇÃO: Desativado para evitar flood.
  // O painel será atualizado apenas 1x ao dia ou via botão manual.
  return;
}

// ================= HANDLERS =================
export async function hierarquiaOnReady(client) {
  console.log("[Hierarquia] 🔄 Iniciando verificação do painel...");
  await updateHierarchyPanel(client);

  setInterval(() => {
    updateHierarchyPanel(client).catch(() => {});
  }, 24 * 60 * 60 * 1000); // ✅ Alterado para 24 horas (1 vez ao dia)
}

export async function hierarquiaHandleInteraction(interaction, client) {
  if (!interaction.guild) return false;

  // Debug para ver se o clique chega
  if (interaction.customId?.startsWith("hier_")) {
    console.log(`[Hierarquia] Interação: ${interaction.customId} por ${interaction.user.tag}`);
  }

  // 1) Botão Refresh
  if (interaction.isButton() && interaction.customId === "hier_refresh") {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({
        content: "🚫 Você não tem permissão para atualizar.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      await updateHierarchyPanel(client);
      await interaction.editReply("✅ Painel atualizado.").catch(() => {});
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no refresh:", err);
      await interaction.editReply("❌ Falhou ao atualizar. Olha o console.").catch(() => {});
    }
    return true;
  }

  // 2) Botão Gerenciar (Abre Menu de Seleção de Usuário)
 if (interaction.isButton() && interaction.customId === "hier_manage_slots") {

  const perm = checkPermission(interaction.member);
  if (perm === "NONE") {
    return interaction.reply({
      content: "🚫 Você não tem permissão para gerenciar a hierarquia.",
      ephemeral: true,
    });
  }

  // ✅ ACK IMEDIATO (responde antes de qualquer coisa pesada)
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  try {
    // 🔥 NÃO FAZER guild.members.fetch() completo
    // Vamos buscar apenas membros dos cargos necessários

    const guild = interaction.guild;

    const targetRoles = [
      CONFIG.ROLES.COORD_CREATOR,
      CONFIG.ROLES.RESP_LIDER,
    ];

    let members = [];

    for (const roleId of targetRoles) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;

      const roleMembers = role.members.filter(m => !m.user.bot);
      members.push(...roleMembers.values());
    }

    // Remove duplicados
    members = [...new Map(members.map(m => [m.id, m])).values()];

    // Se for MOD, remove Resp Líder da lista
    if (perm === "MOD") {
      members = members.filter(
        (m) => !m.roles.cache.has(CONFIG.ROLES.RESP_LIDER)
      );
    }

    if (members.length === 0) {
      return interaction.editReply({
        content: "⚠️ Nenhum membro editável encontrado.",
      }).catch(() => {});
    }

    members.sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    const first25 = members.slice(0, 25);

    const options = first25.map((m) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(m.displayName.slice(0, 100))
        .setValue(m.id)
        .setDescription(m.roles.highest?.name?.slice(0, 100) || "Membro")
        .setEmoji("👤")
    );

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("hier_select_user")
        .setPlaceholder("Selecione o membro para alterar o horário")
        .addOptions(options)
    );

    const extra =
      members.length > 25
        ? `\n⚠️ Mostrando 25 de ${members.length}.`
        : "";

    await interaction.editReply({
      content: `👤 **Selecione o membro** que deseja alterar o horário:${extra}`,
      components: [row],
    }).catch(() => {});
  } catch (err) {
    console.error("[Hierarquia] ❌ Erro no hier_manage_slots:", err);
    await interaction.editReply({
      content: "❌ Deu erro ao abrir o gerenciador. Veja o console.",
    }).catch(() => {});
  }

  return true;
}

  // 3) Seleção de Usuário (Mostra botões de horário)
  if (interaction.isStringSelectMenu() && interaction.customId === "hier_select_user") {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
    }

    const targetId = interaction.values[0];

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: "⚠️ Não encontrei esse membro no servidor.", ephemeral: true });
    }

    // MOD não pode mexer em Resp Líder
    if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
      return interaction.reply({ content: "🚫 Resp Líder só pode editar COORD.", ephemeral: true });
    }

    const slots = loadSlots();
    const currentSlot = slots[targetId] || CONFIG.SLOTS.NONE;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.EVENING}`)
        .setLabel("🌅 17:00 - 19:00")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentSlot === CONFIG.SLOTS.EVENING),
      new ButtonBuilder()
        .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.DAWN}`)
        .setLabel("🌌 01:00 - 03:00")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentSlot === CONFIG.SLOTS.DAWN),
      new ButtonBuilder()
        .setCustomId(`hier_set:${targetId}:${CONFIG.SLOTS.NONE}`)
        .setLabel("⚪ Remover Horário")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentSlot === CONFIG.SLOTS.NONE)
    );

    await interaction.update({
      content: `🛠️ Editando horário para <@${targetId}>\nAtualmente: **${CONFIG.LABELS[currentSlot]}**`,
      components: [row],
    }).catch(() => {});
    return true;
  }

  // 4) Botão de Setar Horário
  if (interaction.isButton() && interaction.customId.startsWith("hier_set:")) {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({
        content: "🚫 Você não tem permissão para alterar horários.",
        ephemeral: true,
      });
    }

    // ✅ ACK IMEDIATO (antes de qualquer fetch pesado)
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      const [, targetId, newSlot] = interaction.customId.split(":");

      if (!Object.values(CONFIG.SLOTS).includes(newSlot)) {
        return interaction.editReply({ content: "⚠️ Slot inválido." }).catch(() => {});
      }

      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "⚠️ Não encontrei esse membro no servidor." }).catch(() => {});
      }

      const isTargetEditableRole =
        targetMember.roles.cache.has(CONFIG.ROLES.COORD_CREATOR) ||
        targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER);

      if (!isTargetEditableRole) {
        return interaction.editReply({ content: "⚠️ Esse membro não está em COORD/RESP LÍDER." }).catch(() => {});
      }

      if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
        return interaction.editReply({ content: "🚫 Resp Líder só pode editar COORD." }).catch(() => {});
      }

      const slots = loadSlots();
      const oldSlot = slots[targetId] || CONFIG.SLOTS.NONE;

      if (oldSlot === newSlot && newSlot !== CONFIG.SLOTS.NONE) {
        return interaction.editReply({ content: "⚠️ Esse usuário já está nesse horário." }).catch(() => {});
      }

      slots[targetId] = newSlot;
      saveSlots(slots);

      await updateHierarchyPanel(client);

      const targetUser = await client.users.fetch(targetId).catch(() => null);
      if (targetUser) {
        await logChange(client, interaction.user, targetUser, oldSlot, newSlot);
      }

      return interaction.editReply({
        content: `✅ Horário de <@${targetId}> alterado para **${CONFIG.LABELS[newSlot]}**.\n🧾 Painel atualizado.`,
      }).catch(() => {});
    } catch (err) {
      console.error("[Hierarquia] ❌ Erro no hier_set:", err);
      return interaction.editReply({
        content: "❌ Deu erro ao alterar/atualizar. Olha o console pra ver o motivo.",
      }).catch(() => {});
    }
  }

  // 5) Botão de REVERTER (Log)
  if (interaction.isButton() && interaction.customId.startsWith("hier_revert:")) {
    const perm = checkPermission(interaction.member);
    if (perm === "NONE") {
      return interaction.reply({ content: "🚫 Sem permissão para reverter.", ephemeral: true });
    }

    // ✅ DEFER REPLY AQUI (evita timeout enquanto atualiza painel)
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const [, targetId, slotToRestore] = interaction.customId.split(":");

    if (!Object.values(CONFIG.SLOTS).includes(slotToRestore)) {
      return interaction.editReply({ content: "⚠️ Slot inválido no botão de reversão." });
    }

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ content: "⚠️ Não encontrei esse membro no servidor." });
    }

    if (perm === "MOD" && targetMember.roles.cache.has(CONFIG.ROLES.RESP_LIDER)) {
      return interaction.editReply({ content: "🚫 Resp Líder só pode reverter COORD." });
    }

    const slots = loadSlots();
    const currentSlot = slots[targetId] || CONFIG.SLOTS.NONE;

    slots[targetId] = slotToRestore;
    saveSlots(slots);

    await updateHierarchyPanel(client);

    const targetUser = await client.users.fetch(targetId).catch(() => null);

    // Atualiza a mensagem do log original para mostrar que foi revertido
    if (interaction.message?.embeds?.[0]) {
      const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0]);
      embedOriginal.setColor("#95a5a6").setFooter({ text: `Revertido por ${interaction.user.tag}` });
      await interaction.message.edit({ embeds: [embedOriginal], components: [] }).catch(() => {});
    }

    if (targetUser) {
      await logChange(client, interaction.user, targetUser, currentSlot, slotToRestore);
    }

    await interaction.editReply({
      content: `↩️ Alteração revertida! <@${targetId}> voltou para **${CONFIG.LABELS[slotToRestore]}**.`,
    }).catch(() => {});
    return true;
  }

  return false;
}

// Comando manual de emergência
export async function hierarquiaHandleMessage(message, client) {
  if (message.content === "!hierarquia") {
    if (checkPermission(message.member) !== "ADMIN") {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      const msg = await message.reply("❌ Você não tem permissão para usar este comando.");
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      return true;
    }
    await message.reply("🔄 Forçando atualização do painel... (olhe o console se não aparecer)").catch(() => {});
    await updateHierarchyPanel(client);
    return true;
  }
  return false;
}
