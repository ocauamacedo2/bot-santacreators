    import fs from "node:fs";
    import path from "node:path";
    import cron from "node-cron";
    import { fileURLToPath } from "node:url";
    import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags,
    PermissionsBitField
    } from "discord.js";
    import { dashEmit } from "../utils/dashHub.js";

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // ===============================
    // CONFIGURAÇÃO
    // ===============================
    const DATA_DIR = path.resolve(process.cwd(), "data");
    const CHECKLIST_FILE = path.join(DATA_DIR, "sc_logs_checklist.json");
    const GI_DATA_FILE = path.join(DATA_DIR, "sc_gi_registros.json");

    const TZ = "America/Sao_Paulo";
    const ROLE_PRIORITY = "1371733765243670538"; // Membros Prioritários
    const LOG_CHANNEL_ID = "1460339582842310731"; // Auditoria

    const PANEL_CONFIG = {
    CHANNEL_ID: "1477800974574682242",
    STATE_FILE: path.join(DATA_DIR, "sc_checklist_panel_state.json")
    };

    const AUTH_CONFIG = {
    // Acesso Total (Admins)
    SUPER_IDS: ["660311795327828008", "1262262852949905408", "1352408327983861844"],
    // Cargos autorizados do GI
    ROLE_IDS: [
        "1352408327983861844", // resp creator
        "1414651836861907006", // responsáveis
        "1262262852949905409", // resp influ
        "1352407252216184833"  // resp líder
    ]
    };

    // ===============================
    // HELPERS DE TEMPO (SP)
    // ===============================
export function getNowSP() { // Exportado para possível uso externo
    return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
    }

    /**
     * Gera a chave da semana (Domingo) baseada em uma data.
 * Garante que a data é interpretada no fuso horário correto antes de calcular o domingo.
 * Exemplo: Se inputDate for uma data de sábado à noite em UTC, mas domingo de manhã em SP,
 * ele corretamente identificará a semana que *começa* naquele domingo.
 *
 * @param {Date|number|string|null} inputDate - A data a ser usada. Se nulo, usa a data/hora atual em SP.
     * @param {Date|number|string} inputDate 
     * @returns {string} YYYY-MM-DD
     */
    function weekKeyFromDateSP(inputDate = null) {
    const date = inputDate ? new Date(inputDate) : getNowSP();
    const d = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
    const day = d.getDay(); // 0 = Dom
    const diff = d.getDate() - day;
    const sunday = new Date(d.setDate(diff));
    return sunday.toISOString().slice(0, 10);
    }

    function getWeekRangeLabel(weekKey) {
    const start = new Date(weekKey + "T00:00:00");
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(start)} → ${fmt(end)}`;
    }

/**
 * Resolve a guilda principal de forma consistente.
 */
function resolveMainGuild(client, sourceGuild = null) {
  return sourceGuild || client.guilds.cache.first() || null;
}

/**
 * Resolve a identificação visual de um usuário com menção e nome (Robusto).
 */
async function resolveMemberDisplay(guild, userId) {
  if (!guild || !userId) return "Usuário desconhecido";

  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {}
  }

  if (member) {
    const name = member.displayName || member.user?.username || "Usuário";
    return `<@${userId}> (${name})`;
  }

  try {
    const user = await guild.client.users.fetch(userId);
    if (user) return `<@${userId}> (${user.username})`;
  } catch {}

  return `<@${userId}>`;
}

/**
 * Resolve apenas o nome de exibição de um usuário, sem menção (Robusto).
 */
async function resolveMemberNameOnly(guild, userId) {
  if (!guild || !userId) return "Usuário desconhecido";

  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {}
  }

  if (member) {
    return member.displayName || member.user?.username || "Usuário desconhecido";
  }

  try {
    const user = await guild.client.users.fetch(userId);
    if (user) return user.username || "Usuário desconhecido";
  } catch {}

  return `Usuário não encontrado`;
}

    // ===============================
    // PERSISTÊNCIA ATÔMICA
    // ===============================
    function loadJSON(file, fallback = {}) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch { return fallback; }
    }

    function saveJSON(file, data) {
    try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, file);
    } catch (e) {
        console.error(`[ChecklistLogs] Erro ao salvar:`, e);
    }
    }

    // ===============================
    // LÓGICA DE DADOS & SINCRONIZAÇÃO
    // ===============================
    function syncWeekData() {
    const checklist = loadJSON(CHECKLIST_FILE, { weeks: {} });
    const giData = loadJSON(GI_DATA_FILE, { registros: [] });
    const weekKey = weekKeyFromDateSP();

    if (!checklist.weeks[weekKey]) {
        checklist.weeks[weekKey] = { lastSyncedAt: null, responsaveis: {} };
    }

    const currentWeek = checklist.weeks[weekKey];
    const activeGIRegistros = (giData.registros || []).filter(r => r.active && r.responsibleUserId);

    // 1. Mapear o que existe no GI agora
    const giMap = new Map(); // RespId -> [MemberId]
    activeGIRegistros.forEach(reg => {
        if (!giMap.has(reg.responsibleUserId)) giMap.set(reg.responsibleUserId, []);
        giMap.get(reg.responsibleUserId).push({ id: reg.targetId, area: reg.area || "Geral" });
    });

    // 2. Limpar membros e responsáveis que não existem mais no GI ou mudaram de Resp
    const newResponsaveis = {};
    giMap.forEach((members, respId) => {
        newResponsaveis[respId] = { members: {} };
        members.forEach(m => {
        // Se o membro já existia para este responsável nesta semana, preserva o status
        const existing = currentWeek.responsaveis[respId]?.members[m.id];
        if (existing) {
            newResponsaveis[respId].members[m.id] = existing;
        } else {
            // Novo membro vinculado
            newResponsaveis[respId].members[m.id] = {
            checked: false,
            checkedAt: null,
            checkedBy: null,
            area: m.area
            };
        }
        });
    });

    currentWeek.responsaveis = newResponsaveis;
    currentWeek.lastSyncedAt = Date.now();
    
    saveJSON(CHECKLIST_FILE, checklist);
    return checklist;
    }

    function hasPermission(member, type = "use") {
    if (!member) return false;
    if (AUTH_CONFIG.SUPER_IDS.includes(member.id)) return true;
    if (type === "admin") return false; // Somente Super IDs para admin total
    return member.roles.cache.some(r => AUTH_CONFIG.ROLE_IDS.includes(r.id));
    }

    // ===============================
    // UI BUILDERS
    // ===============================
    function buildProgressBar(value, total) {
    const size = 10;
    const progress = Math.round((value / total) * size) || 0;
    const empty = size - progress;
    return `${"🟩".repeat(progress)}${"⬛".repeat(empty)} **${Math.round((value / total) * 100) || 0}%**`;
    }

    async function buildMainPanel(client, sourceGuild = null) {
    const guild = resolveMainGuild(client, sourceGuild);
    const checklist = syncWeekData();
    const weekKey = weekKeyFromDateSP();
    const data = checklist.weeks[weekKey];
    const isSunday = getNowSP().getDay() === 0; // 0 = Domingo

    let totalMembers = 0;
    let checkedMembers = 0;
    let respsWithPending = 0;

    const fields = [];
    const respEntries = Object.entries(data.responsaveis);

    for (const [respId, content] of respEntries) {
        const members = Object.values(content.members);
        const membersEntries = Object.entries(content.members);
        const count = members.length;
        const checked = members.filter(m => m.checked).length;
        
        totalMembers += count;
        checkedMembers += checked;
        if (checked < count) respsWithPending++;

        const nameDisplay = await resolveMemberNameOnly(guild, respId);
        const allDone = checked === count;
        const statusIcon = allDone ? "🟢" : (isSunday ? "🟡" : "🔴");
        
        // Gera a lista de membros com a nova identificação
        const memberLines = [];
        for (const [mId, m] of membersEntries.slice(0, 5)) {
        const mStatus = m.checked ? "🟢" : (isSunday ? "🟡" : "🔴");
        const mDisplay = await resolveMemberDisplay(guild, mId); // Menção + Nome
        memberLines.push(`${mStatus} ${mDisplay}`);
        }

        let memberListText = memberLines.join("\n");

        if (count > 5) memberListText += `\n*+${count - 5} restantes...*`;
        if (count === 0) memberListText = "_Nenhum membro vinculado._";

        fields.push({
        name: `👤 Responsável: ${nameDisplay} ${allDone ? "🟢" : "🔴"}`, // Nome limpo no título
        value: `📊 ${checked}/${count} conferidos\n\n${memberListText}\n━━━━━━━━━━━━━━━━━━━`,
        inline: false
        });
    }

    const embed = new EmbedBuilder()
        .setTitle("📋 Checklist Semanal de Logs")
        .setDescription(
        `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
        `🕒 **Fechamento:** Domingo às 23:59\n\n` +
        `📌 **Responsáveis com pendência:** \`${respsWithPending}\`\n` +
        `✅ **Membros conferidos:** \`${checkedMembers}\`\n` +
        `❌ **Membros pendentes:** \`${totalMembers - checkedMembers}\`\n\n` +
        `📊 **Progresso Geral:**\n${buildProgressBar(checkedMembers, totalMembers)}\n`
        )
        .addFields(fields)
        .setColor(respsWithPending === 0 ? "#2ecc71" : (isSunday ? "#f1c40f" : "#9b59b6"))
        .setThumbnail(client.user.displayAvatarURL())
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("logcheck_my_members").setLabel("Gerenciar Meus Membros").setStyle(ButtonStyle.Success).setEmoji("✅"),
        new ButtonBuilder().setCustomId("logcheck_admin_view").setLabel("Visão Geral").setStyle(ButtonStyle.Primary).setEmoji("👑"),
        new ButtonBuilder().setCustomId("logcheck_sync_gi").setLabel("Sincronizar GI").setStyle(ButtonStyle.Secondary).setEmoji("🔄")
    );

    return { embeds: [embed], components: [row] };
    }

    // ===============================
    // HANDLERS (Interações)
    // ===============================
    export async function checklistHandleInteraction(interaction, client) {
    if (!interaction.guild) return false;
    const customId = interaction.customId;

    // 1. Sincronizar GI
    // Já tem permissão e deferReply, então só precisa do syncData e buildPanel
    if (customId === "logcheck_sync_gi") {
        if (!hasPermission(interaction.member)) return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        syncWeekData();
        const panel = await buildMainPanel(client, interaction.guild);
        await interaction.message.edit(panel);
        return interaction.editReply("✅ Dados sincronizados com sucesso!");
    }

    // 2. Gerenciar Meus Membros
    // CRITICAL FIX: Adicionado safe guards para weekData e myData
    // Usando syncWeekData() para garantir que a estrutura da semana esteja atualizada
    // e que weekData exista.
    if (customId === "logcheck_my_members") {
        if (!hasPermission(interaction.member)) return interaction.reply({ content: "❌ Você não é um responsável registrado.", flags: MessageFlags.Ephemeral });
        
        const checklist = loadJSON(CHECKLIST_FILE);
        const weekKey = weekKeyFromDateSP();
        const weekData = checklist?.weeks?.[weekKey]; // Safe guard

        if (!weekData) {
            return interaction.reply({ content: "❌ Não foi possível carregar os dados da semana atual.", flags: MessageFlags.Ephemeral });
        }

        const myData = weekData.responsaveis?.[interaction.user.id]; // Safe guard

        if (!myData || Object.keys(myData.members).length === 0) {
        return interaction.reply({ content: "❌ Você não possui membros vinculados a você nesta semana.", flags: MessageFlags.Ephemeral });
        }

        return sendPersonalManager(interaction, interaction.user.id, weekKey, myData);
    }

    // 3. Visão Geral (Admin)
    // CRITICAL FIX: Adicionado safe guards para weekData e weekData.responsaveis
    if (customId === "logcheck_admin_view") {
        const guild = interaction.guild;
        if (!hasPermission(interaction.member, "admin")) return interaction.reply({ content: "❌ Apenas Administradores podem acessar a visão geral.", flags: MessageFlags.Ephemeral });
        
        const checklist = loadJSON(CHECKLIST_FILE);
        const weekKey = weekKeyFromDateSP();
        const weekData = checklist?.weeks?.[weekKey]; // Safe guard

        if (!weekData) {
            return interaction.reply({ content: "❌ Não foi possível carregar os dados da semana atual.", flags: MessageFlags.Ephemeral });
        }

        const options = [];
        // Garante que responsaveis é um objeto, mesmo que vazio
        for (const [respId, content] of Object.entries(weekData.responsaveis || {})) {
        const pending = Object.values(content.members).filter(m => !m.checked).length;
        
        // CRITICAL FIX: Usar resolveMemberNameOnly para o label do select menu
        const rawName = await resolveMemberNameOnly(guild, respId);

        options.push({
            label: rawName,
            value: `logcheck_inspect:${respId}:${weekKey}`,
            description: pending === 0 ? "Em dia" : `${pending} pendências encontradas`,
            emoji: pending === 0 ? "🟢" : "🔴"
        });
        }

        const select = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("logcheck_admin_select")
            .setPlaceholder("Selecione um responsável para inspecionar")
            .addOptions(options.slice(0, 25))
        );

        return interaction.reply({ content: "👑 **Painel Administrativo**\nEscolha um responsável para ver detalhes ou alterar status.", components: [select], flags: MessageFlags.Ephemeral });
    }

    // 4. Seleção Admin
    // CRITICAL FIX: Adicionado safe guards para weekData e respData
    if (interaction.isStringSelectMenu() && customId === "logcheck_admin_select") {
        const [, respId, weekKey] = interaction.values[0].split(":");
        const checklist = loadJSON(CHECKLIST_FILE);
        const weekData = checklist?.weeks?.[weekKey]; // Safe guard
        const respData = weekData?.responsaveis?.[respId]; // Safe guard

        if (!respData) return interaction.reply({ content: "❌ Dados do responsável não encontrados.", flags: MessageFlags.Ephemeral });
        return sendPersonalManager(interaction, respId, weekKey, respData, true);
    }

    // 5. Toggle Status Individual
    // CRITICAL FIX: Adicionado safe guards para weekData e member
    if (interaction.isStringSelectMenu() && customId.startsWith("logcheck_toggle:")) {
        const [, respId, weekKey] = customId.split(":");
        const memberId = interaction.values[0];
        
        const checklist = loadJSON(CHECKLIST_FILE);
        const weekData = checklist?.weeks?.[weekKey]; // Safe guard
        const member = weekData?.responsaveis?.[respId]?.members?.[memberId]; // Safe guard

        if (!member) return interaction.reply({ content: "❌ Membro não encontrado para alterar o status.", flags: MessageFlags.Ephemeral });
        
        const oldStatus = member.checked;
        member.checked = !oldStatus;
        member.checkedAt = member.checked ? Date.now() : null;
        member.checkedBy = member.checked ? interaction.user.id : null;

        saveJSON(CHECKLIST_FILE, checklist);
        
        // Log Auditoria
        await logAudit(client, interaction.user, respId, memberId, member.checked, weekKey); // Loga a ação

        // Refresh UI
        const updatedData = checklist.weeks[weekKey].responsaveis[respId];
        await sendPersonalManager(interaction, respId, weekKey, updatedData, interaction.user.id !== respId, true);
        
        // Update Painel Principal se existir
        const mainPayload = await buildMainPanel(client, interaction.guild);
        const panelState = loadJSON(PANEL_CONFIG.STATE_FILE);
        if (panelState.messageId) {
        const channel = await client.channels.fetch(PANEL_CONFIG.CHANNEL_ID).catch(() => null);
        const msg = await channel?.messages.fetch(panelState.messageId).catch(() => null);
        if (msg) await msg.edit(mainPayload).catch(() => {});
        }
    }

    // 6. Ações em Massa
    if (interaction.isButton() && customId.startsWith("logcheck_bulk:")) {
        const [, action, respId, weekKey] = customId.split(":");
        const checklist = loadJSON(CHECKLIST_FILE);
        const members = checklist.weeks[weekKey].responsaveis[respId].members;

        Object.keys(members).forEach(mId => {
        members[mId].checked = action === "check";
        members[mId].checkedAt = action === "check" ? Date.now() : null;
        members[mId].checkedBy = action === "check" ? interaction.user.id : null;
        });

        saveJSON(CHECKLIST_FILE, checklist);
        await logAudit(client, interaction.user, respId, "TODOS", action === "check", weekKey, true);

        const updatedData = checklist.weeks[weekKey].responsaveis[respId];
        await sendPersonalManager(interaction, respId, weekKey, updatedData, interaction.user.id !== respId, true);
        
        const mainPayload = await buildMainPanel(client, interaction.guild);
        const panelState = loadJSON(PANEL_CONFIG.STATE_FILE);
        if (panelState.messageId) {
        const channel = await client.channels.fetch(PANEL_CONFIG.CHANNEL_ID).catch(() => null);
        const msg = await channel?.messages.fetch(panelState.messageId).catch(() => null);
        if (msg) await msg.edit(mainPayload).catch(() => {});
        }
    }

    return false;
    } // Fim de checklistHandleInteraction

    // Helper para enviar o menu de gerenciamento (pessoal ou admin)
    async function sendPersonalManager(interaction, respId, weekKey, data, isAdmin = false, isUpdate = false) {
    const guild = resolveMainGuild(interaction.client, interaction.guild);
    const isSunday = getNowSP().getDay() === 0;
    const members = Object.entries(data.members || {}); // Safe guard para data.members
    const checked = members.filter(([_, m]) => m.checked).length;
    const total = members.length;
    const respNameOnly = await resolveMemberNameOnly(guild, respId); // Nome limpo para o título

    const memberLines = [];
    // CRITICAL FIX: Usar resolveMemberDisplay para a lista de membros
    // e resolveMemberNameOnly para o nome do checker
    for (const [id, m] of members) {
        const timeStr = m.checkedAt ? `<t:${Math.floor(m.checkedAt/1000)}:R>` : "";
        const mDisplay = await resolveMemberDisplay(guild, id);
        
        if (m.checked) {
        const checkerClean = await resolveMemberNameOnly(guild, m.checkedBy || ""); // Nome limpo do checker
        memberLines.push(`🟢 ${mDisplay} — conferido por **${checkerClean}** ${timeStr}`);
        } else {
        memberLines.push(`${isSunday ? "🟡" : "🔴"} ${mDisplay} — pendente`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`📖 Gerenciar Logs: ${respNameOnly}`) // Título com nome limpo
        .setDescription(
        `📅 **Semana:** ${getWeekRangeLabel(weekKey)}\n` +
        `📊 **Progresso:** ${checked}/${total} conferidos\n\n` +
        memberLines.join("\n")
        )
        .setColor(checked === total ? "#2ecc71" : "#3498db");

    const selectOptions = [];
    // CRITICAL FIX: Usar resolveMemberNameOnly para o label do select menu
    // e resolveMemberDisplay para a descrição
    for (const [id, m] of members) {
        let member = guild.members.cache.get(id);
        if (!member) { try { member = await guild.members.fetch(id); } catch {} }
        const rawName = member?.displayName || member?.user?.username || `ID:${id}`; // Nome limpo para o label

        selectOptions.push({
        label: rawName,
        value: id,
        emoji: m.checked ? "🔴" : "🟢",
        description: `${await resolveMemberDisplay(guild, id)} | Área: ${m.area} | Status: ${m.checked ? "Conferido" : "Pendente"}` // Menção + Nome na descrição
        });
    }

    const select = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId(`logcheck_toggle:${respId}:${weekKey}`)
        .setPlaceholder("Clique para inverter o status de um membro")
        .addOptions(selectOptions)
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`logcheck_bulk:check:${respId}:${weekKey}`).setLabel("Marcar Todos").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`logcheck_bulk:uncheck:${respId}:${weekKey}`).setLabel("Desmarcar Todos").setStyle(ButtonStyle.Danger)
    );

    const payload = { embeds: [embed], components: [select, buttons], flags: MessageFlags.Ephemeral };
    
    if (isUpdate) return interaction.update(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
    }

    async function logAudit(client, actor, respId, memberId, status, weekKey, isBulk = false) {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(isBulk ? "📑 Checklist: Ação em Massa" : "📑 Checklist Individual Atualizado")
        .setColor(status ? "#2ecc71" : "#e74c3c")
        .addFields(
        { name: "👤 Responsável", value: `<@${respId}>`, inline: true },
        { name: "🧍 Membro(s)", value: memberId === "TODOS" ? "Todos os vinculados" : `<@${memberId}>`, inline: true },
        { name: "📌 Ação", value: status ? "✅ Marcou como Conferido" : "❌ Marcou como Pendente", inline: true },
        { name: "🔧 Alterado por", value: `${actor}`, inline: true },
        { name: "📅 Semana", value: weekKey, inline: true }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
    }

    // ===============================
    // LEMBRETES & CRON
    // ===============================
    async function sendSundayReminders(client) {
    const checklist = syncWeekData();
    const weekKey = weekKeyFromDateSP();
    const data = checklist.weeks[weekKey];
    const range = getWeekRangeLabel(weekKey);

    for (const [respId, content] of Object.entries(data.responsaveis)) {
        const pending = Object.entries(content.members).filter(([_, m]) => !m.checked);
        if (pending.length === 0) continue;

        try {
        const user = await client.users.fetch(respId).catch(() => null);
        if (!user) continue;

        let hasPriority = false;
        const guild = client.guilds.cache.first();
        const memberLines = pending.map(([mId, _]) => {
            const guildMember = guild?.members.cache.get(mId);
            if (guildMember?.roles.cache.has(ROLE_PRIORITY)) {
            hasPriority = true;
            return `• <@${mId}> 🚨 **(Prioritário)**`;
            }
            return `• <@${mId}>`;
        });

        const embed = new EmbedBuilder()
            .setTitle("📩 **CHECKLIST DE LOGS PENDENTE**")
            .setColor(hasPriority ? "#ff0000" : "#f1c40f")
            .setDescription(
            `Você ainda precisa verificar as logs dos seguintes membros:\n\n` +
            memberLines.join("\n") +
            `\n\n📅 **Semana:** ${range}\n\n` +
            `⚠️ Verifique se há logs indevidas ou inconsistentes e marque no painel após a conferência.` +
            (hasPriority ? `\n\n🚨 **Atenção:** Há membros prioritários pendentes!` : "")
            )
            .setFooter({ text: "Lembrete Automático • SantaCreators" })
            .setTimestamp();

        await user.send({ embeds: [embed] }).catch(() => {});
        } catch (e) {
        console.warn(`[ChecklistLogs] Falha ao enviar DM para ${respId}`);
        }
    }
    }

    export async function checklistOnReady(client) {
    syncWeekData();
    cron.schedule("0 0,12,16 * * 0", () => sendSundayReminders(client), { timezone: TZ });
    }

    export async function checklistHandleMessage(message, client) {
    if (!message.guild || message.author.bot) return false;
    if (message.content.toLowerCase() !== "!checklogs") return false;

    if (!hasPermission(message.member)) return message.reply("❌ Sem permissão.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));

    await message.delete().catch(() => {});
    const payload = await buildMainPanel(client, message.guild);
    const sent = await message.channel.send(payload);
    saveJSON(PANEL_CONFIG.STATE_FILE, { messageId: sent.id });
    return true;
    }
