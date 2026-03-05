// ===============================
// ===============================
// ===============================
// SANTA CREATORS — CONTROLE GESTAOINFLUENCER (v3.3 LEVE • ESM)
// — Correção crítica: elimina botões com "TEMP" e adiciona failsafe de lookup
//   pelo interaction.message.id para evitar "Registro não encontrado."
// — Mantém: tudo da v3.2 (auto-tipo, board com moldura, etc).
// ===============================
// ===============================
// SANTA CREATORS — CONTROLE GESTAOINFLUENCER (v3.4 LEVE • ESM)
// - Auto set/remove GI role em criar/pausar/despausar
// - Trava anti-remover GI: 1x devolve+DM; 2x em <2min remove TODOS cargos (não desliga), avisa logs, restaura em 10min
// - DM em criar/pausar/despausar/restauração
// - Mantém v3.3 (sem TEMP, failsafe interaction.message.id, board moldura, etc.)
// ===============================
(async () => {
  try {
    if (!globalThis.client) {
      console.warn('[SC_GI] client global não encontrado. Cole este bloco DEPOIS de criar o client do Discord.');
      return;
    }

    const {
      ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
      TextInputBuilder, TextInputStyle, EmbedBuilder,
      StringSelectMenuBuilder, UserSelectMenuBuilder,
      Events, ChannelType, MessageFlags
    } = await import('discord.js');

    const fs = await import('node:fs');
    const fsp = fs.promises;
    const path = await import('node:path');
    const { dashOn, dashEmit } = await import('../utils/dashHub.js');
    // ✅ Importa o getter de stats
    const { getStatsForUser } = await import('./scGeralWeeklyRanking.js');
    // ✅ NOVO: Importa helpers do formscreator
    let formsCreator = {};
    try {
        formsCreator = await import('./formscreator.js');
    } catch (e) {
        console.warn("[SC_GI] ⚠️ Aviso: o módulo formscreator.js não pôde ser carregado. A integração com ele estará desativada.", e.message);
    }
    const { findFormsCreatorThreadIdByUserId, setFormsCreatorStatus, setFormsCreatorArea } = formsCreator;

    if (client.__SC_GI_INSTALLED) {
      console.log('[SC_GI] Já instalado, pulando.');
      return;
    }
    client.__SC_GI_INSTALLED = true;

    // ====================== CONFIG ======================
    const GIF_SC_GI = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?width=515&height=66';

    const DATA_DIR = path.resolve(process.cwd(), 'data');
    const SC_GI_CFG = {
      TZ_OFFSET_MIN: -180,
      TICK_MS: 60 * 1000,
      DATA_FILE: path.join(DATA_DIR, 'sc_gi_registros.json'),

      CHANNEL_MENU_E_REGISTROS: '1417366889398796318',
      CHANNEL_LOGS:            '1417382559486185502',
      CHANNEL_AVISOS_1M:       '1417383360896176188',
      CHANNEL_DM_MIRROR:       '1417383732352127007',
      CHANNEL_RESP_BOARD:      '1427082727600947230',
      CHANNEL_DESLIGAMENTOS:   '1427089183847223306',
      CHANNEL_RESTORE_LOG:     '1410688804226076785',

      ROLE_GESTAOINFLUENCER:   '1371733765243670538',
      ROLE_CIDADAO:            '1262978759922028575',
      ROLE_SANTA_CREATORS:     '1352275728476930099',

      AUTH_USER_IDS: [
        '660311795327828008',
        '1262262852949905408'
      ],
      AUTH_ROLE_IDS: [
        '1352408327983861844',  // resp creator
        '1414651836861907006',  // responsáveis
        '1262262852949905409',  // resp influ
        '1352407252216184833'   // resp líder
      ],

      ROLE_OWNER:         '1262262852949905408',
      ROLE_RESP_CREATORS: '1352408327983861844',
      ROLE_RESP_INFLU:    '1262262852949905409',
      ROLE_RESP_LIDER:    '1352407252216184833',

      RESP_ALLOWED_ROLE_IDS: [
        '1262262852949905408',
        '1352408327983861844',
        '1262262852949905409',
        '1352407252216184833',
        '1414651836861907006'
      ],

      AUTO_DESLIGAR_PAUSA_DIAS: 30,

      // NOVO: regras da trava
      GI_REMOVE_WINDOW_MS: 2 * 60 * 1000, // 2 minutos
      GI_RESTORE_AFTER_PUNISH_MS: 10 * 60 * 1000 // 10 minutos
    };

    // ====================== STATE / PERSIST ======================
    const SC_GI_STATE = {
      menuMessageId: null,
      registros: new Map(),
      boardMessageIds: [],
      boardContentHash: null,
      boardDirty: true,

      // avisos por remoção do cargo GI (mesmo sem registro)
      giWarningsByUser: new Map(), // userId -> { count:number, lastAtMs:number|null }

      // bypass pra quando o bot mexe nos cargos (evita loop com GuildMemberUpdate)
      roleBypass: new Map(), // userId -> expireAtMs

      // NOVO: snapshots pra restauração após punição
      roleSnapshots: new Map(), // userId -> { roleIds: string[], restoreAtMs:number, createdAtMs:number, recordMessageId:string|null }

      // timers em memória
      restoreTimers: new Map() // userId -> timeoutId
    };

    async function SC_GI_load() {
      try {
        // Migração: se não existe na pasta data, tenta ler da raiz
        let fileToRead = SC_GI_CFG.DATA_FILE;
        if (!fs.existsSync(fileToRead) && fs.existsSync('./sc_gi_registros.json')) {
          fileToRead = './sc_gi_registros.json';
          console.log('[SC_GI] Migrando dados da raiz para pasta /data...');
        }

        if (!fs.existsSync(fileToRead)) return;

        const raw  = await fsp.readFile(fileToRead, 'utf8');
        const data = JSON.parse(raw || '{}');

        SC_GI_STATE.menuMessageId  = data.menuMessageId  || null;
        SC_GI_STATE.boardMessageIds = Array.isArray(data.boardMessageIds) ? data.boardMessageIds : (data.boardMessageId ? [data.boardMessageId] : []);
        SC_GI_STATE.boardContentHash = data.boardContentHash || null;

        const byUser = new Map();
        for (const r0 of (data.registros || [])) {
          const r = { ...r0 };
          r.joinDateMs         = Number(r.joinDateMs);
          r.createdAtMs        = Number(r.createdAtMs);
          r.active             = r.active !== false;
          r.nextWeekTickMs     = (typeof r.nextWeekTickMs === 'number') ? r.nextWeekTickMs : null;
          r.oneMonthNotified   = !!r.oneMonthNotified;
          r.oneMonthNotifiedAt = r.oneMonthNotifiedAt || null;
          r.note               = r.note || '';
          r.responsibleUserId  = r.responsibleUserId || null;
          r.responsibleType    = r.responsibleType || null;
          r.warnNoRoleGI       = !!r.warnNoRoleGI;
          r.responsibleHistory = Array.isArray(r.responsibleHistory) ? r.responsibleHistory : [];
          r.pausedAtMs         = (typeof r.pausedAtMs === 'number') ? r.pausedAtMs : null;
          r.totalPausedMs      = (typeof r.totalPausedMs === 'number') ? r.totalPausedMs : 0;
          r.roleSetAtMs        = (typeof r.roleSetAtMs === 'number') ? r.roleSetAtMs : null;
          r.messageId          = String(r.messageId);
          r.passaporte         = r.passaporte || null; // ✅ Carrega passaporte se existir

          const prev = byUser.get(r.targetId);
          if (!prev || (r.createdAtMs || 0) > (prev.createdAtMs || 0)) byUser.set(r.targetId, r);
        }
        SC_GI_STATE.registros.clear();
        for (const r of byUser.values()) SC_GI_STATE.registros.set(r.messageId, r);

        // warnings
        SC_GI_STATE.giWarningsByUser.clear();
        for (const w of (data.giWarnings || [])) {
          if (!w?.userId) continue;
          SC_GI_STATE.giWarningsByUser.set(String(w.userId), {
            count: Number(w.count || 0),
            lastAtMs: (typeof w.lastAtMs === 'number') ? w.lastAtMs : null
          });
        }

        // snapshots
        SC_GI_STATE.roleSnapshots.clear();
        for (const s of (data.roleSnapshots || [])) {
          if (!s?.userId) continue;
          SC_GI_STATE.roleSnapshots.set(String(s.userId), {
            roleIds: Array.isArray(s.roleIds) ? s.roleIds.map(String) : [],
            restoreAtMs: Number(s.restoreAtMs || 0),
            createdAtMs: Number(s.createdAtMs || 0),
            recordMessageId: s.recordMessageId ? String(s.recordMessageId) : null
          });
        }

        console.log(`[SC_GI] Carregado ${SC_GI_STATE.registros.size} registro(s).`);

        // Se leu do arquivo antigo, salva no novo imediatamente
        if (fileToRead !== SC_GI_CFG.DATA_FILE) {
          await SC_GI_saveNow();
        }
      } catch (e) {
        console.warn('[SC_GI] Falha ao carregar arquivo, seguindo em memória:', e?.message);
      }
    }

    async function SC_GI_saveNow() {
      try {
        const dir = path.dirname(SC_GI_CFG.DATA_FILE);
        if (!fs.existsSync(dir)) await fsp.mkdir(dir, { recursive: true });

        const data = {
          menuMessageId:    SC_GI_STATE.menuMessageId,
          boardMessageIds:  SC_GI_STATE.boardMessageIds,
          boardContentHash: SC_GI_STATE.boardContentHash,
          registros:        Array.from(SC_GI_STATE.registros.values()),
          giWarnings:       Array.from(SC_GI_STATE.giWarningsByUser.entries()).map(([userId, v]) => ({
            userId, count: v.count || 0, lastAtMs: v.lastAtMs ?? null
          })),
          roleSnapshots:    Array.from(SC_GI_STATE.roleSnapshots.entries()).map(([userId, s]) => ({
            userId,
            roleIds: Array.isArray(s.roleIds) ? s.roleIds : [],
            restoreAtMs: s.restoreAtMs ?? 0,
            createdAtMs: s.createdAtMs ?? 0,
            recordMessageId: s.recordMessageId ?? null
          }))
        };
        await fsp.writeFile(SC_GI_CFG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        console.error('[SC_GI] Erro ao salvar dados:', e);
      }
    }

    let saveTimer = null;
    function SC_GI_scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(SC_GI_saveNow, 750);
    }

    // ====================== UTILS ======================
    const nowMs = () => Date.now();
    const pad2 = n => (n < 10 ? '0' + n : '' + n);
    function fromDDMMYYYY_toMs(str) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str).trim());
      if (!m) return null;
      const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
      const utcMs = Date.UTC(y, mo, d, 0, 0, 0);
      return utcMs + (SC_GI_CFG.TZ_OFFSET_MIN * 60 * 1000);
    }
    function msToDDMMYYYY(ms) {
      const dt = new Date(ms - (SC_GI_CFG.TZ_OFFSET_MIN * 60 * 1000));
      return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth()+1)}/${dt.getUTCFullYear()}`;
    }
    const daysBetween       = (a, b) => Math.floor((b - a) / (24 * 60 * 60 * 1000));
    const addDaysAtMidnight = (ms, days) => ms + days * 24 * 60 * 60 * 1000;
    function alignToLocalMidnight(ms) {
      const d0  = msToDDMMYYYY(ms);
      const at0 = fromDDMMYYYY_toMs(d0);
      return ms <= at0 ? at0 : addDaysAtMidnight(at0, 1);
    }
    const monthsSince = (joinMs, n = nowMs()) => Math.max(0, Math.floor(daysBetween(joinMs, n) / 30));
    const weeksSince  = (joinMs, n = nowMs()) => Math.max(0, Math.floor(daysBetween(joinMs, n) / 7));
    function simpleHash (str) { let h=0; for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i))|0; return String(h>>>0); }

    const _userCache = new Map();
    const _memberCache = new Map();
    const TTL = 10 * 60 * 1000;
    async function fetchUserCached(id) {
      const it = _userCache.get(id);
      if (it && (nowMs() - it.at) < TTL) return it.user;
      const u = await client.users.fetch(id).catch(() => null);
      if (u) _userCache.set(id, { at: nowMs(), user: u });
      return u;
    }
    async function fetchMemberCached(guild, id) {
      const key = `${guild.id}:${id}`;
      const it = _memberCache.get(key);
      if (it && (nowMs() - it.at) < TTL) return it.member;
      const m = await guild.members.fetch(id).catch(() => null);
      if (m) _memberCache.set(key, { at: nowMs(), member: m });
      return m;
    }
    function hasAuth(member) {
      if (!member) return false;
      if (SC_GI_CFG.AUTH_USER_IDS.includes(member.id)) return true;
      return SC_GI_CFG.AUTH_ROLE_IDS.some(id => member.roles?.cache?.has?.(id));
    }

    function getLatestActiveRecordByTarget(targetId) {
      const arr = Array.from(SC_GI_STATE.registros.values()).filter(r => r.targetId === String(targetId));
      if (!arr.length) return null;
      arr.sort((a,b) => (b.createdAtMs||0) - (a.createdAtMs||0));
      return arr[0] || null;
    }
    function getLatestRecordByTarget(targetId) {
      const arr = Array.from(SC_GI_STATE.registros.values()).filter(r => r.targetId === String(targetId));
      if (!arr.length) return null;
      arr.sort((a,b) => (b.createdAtMs||0) - (a.createdAtMs||0));
      return arr[0] || null;
    }
    function recordLink(guildId, channelId, messageId) {
      if (!guildId || !channelId || !messageId) return null;
      return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    }

    // ====================== ROLE GI HELPERS (OBRIGATÓRIO) ======================
    const GI_ROLE_ID = SC_GI_CFG.ROLE_GESTAOINFLUENCER; // 1371733765243670538

    function setRoleBypass(userId, ms = 8000) {
      SC_GI_STATE.roleBypass.set(String(userId), nowMs() + ms);
    }
    function hasRoleBypass(userId) {
      const t = SC_GI_STATE.roleBypass.get(String(userId));
      if (!t) return false;
      if (nowMs() > t) { SC_GI_STATE.roleBypass.delete(String(userId)); return false; }
      return true;
    }

    async function addGIRole(guild, userId, reason = 'GI obrigatório') {
      const m = await fetchMemberCached(guild, userId);
      if (!m) return false;
      if (m.roles.cache.has(GI_ROLE_ID)) return true;
      setRoleBypass(userId);
      await m.roles.add(GI_ROLE_ID, reason).catch(()=>{});
      return true;
    }

    async function removeGIRole(guild, userId, reason = 'GI removido por pausa/desligamento') {
      const m = await fetchMemberCached(guild, userId);
      if (!m) return false;
      if (!m.roles.cache.has(GI_ROLE_ID)) return true;
      setRoleBypass(userId);
      await m.roles.remove(GI_ROLE_ID, reason).catch(()=>{});
      return true;
    }

    function getWarningData(userId) {
      const key = String(userId);
      const it = SC_GI_STATE.giWarningsByUser.get(key);
      if (it) return it;
      const fresh = { count: 0, lastAtMs: null };
      SC_GI_STATE.giWarningsByUser.set(key, fresh);
      return fresh;
    }

    // ====================== UI IDS ======================
    const BTN = {
      OPEN_MODAL: 'SC_GI_OPEN_MODAL',
      CHECK_RECORDS: 'SC_GI_CHECK_RECORDS',
      STOP_COUNT_PREFIX: 'SC_GI_STOP_',
      EDIT_PREFIX: 'SC_GI_EDIT_',
      DMNOW_PREFIX: 'SC_GI_DMNOW_',
      RESP_PREFIX: 'SC_GI_RESP_',
      DESLIGAR_PREFIX: 'SC_GI_OFF_'
    };
    const SEL = {
      RESP_USER_PREFIX: 'SC_GI_SELRESP_USER_'
    };

    // ====================== EMBEDS / ROWS ======================
    function menuEmbed() {
      return new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🛠️ Controle — **GESTAOINFLUENCER**')
        .setDescription([
          `> Registre membros do cargo <@&${SC_GI_CFG.ROLE_GESTAOINFLUENCER}> para monitorar **semanas** e **1 mês**.`,
          `> Apenas responsáveis/autorizados podem registrar, editar e gerenciar.`,
          '',
          '✅ **Automático:** DM semanal (00:00), aviso 1 mês, espelho de DM, logs.',
          '📝 **Dica:** defina um **Responsável Direto** (só escolher a pessoa; a área é detectada automática).',
          '',
          `🔒 **Trava GI:** enquanto a contagem estiver **ativa**, não pode remover o cargo <@&${GI_ROLE_ID}>.`
        ].join('\n'))
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' });
    }
    function menuRow() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BTN.OPEN_MODAL).setStyle(ButtonStyle.Primary).setEmoji('📝').setLabel('Novo Registro (GI)'),
        new ButtonBuilder().setCustomId(BTN.CHECK_RECORDS).setStyle(ButtonStyle.Secondary).setEmoji('🔄').setLabel('Check/Restaurar')
      );
    }
    function responsavelLabel(rec) {
      if (!rec?.responsibleUserId && !rec?.responsibleType) return '—';
      const typeTxt =
        rec.responsibleType === 'OWNER'          ? 'Owner'          :
        rec.responsibleType === 'RESP_CREATORS'  ? 'Resp Creators'  :
        rec.responsibleType === 'RESP_INFLU'     ? 'Resp Influ'     :
        rec.responsibleType === 'RESP_LIDER'     ? 'Resp Líder'     : '—';
      const userTxt = rec.responsibleUserId ? `<@${rec.responsibleUserId}>` : '—';
      return `${typeTxt} • ${userTxt}`;
    }
    async function registroEmbed({ targetUser, registrarUser, joinDateMs, area, weeks, months, active, rec }) {
      const emb = new EmbedBuilder()
        .setColor(active ? 0x2ecc71 : 0xe74c3c)
        .setTitle(`${active ? '🟢' : '🔴'} Registro • Gestaoinfluencer`)
        .setAuthor({
          name: (registrarUser?.globalName || registrarUser?.username || 'Registrado por'),
          iconURL: registrarUser?.displayAvatarURL?.({ size: 128 }) || undefined
        })
        .setThumbnail(targetUser?.displayAvatarURL?.({ size: 256 }) || null)
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());

     // ✅ NOVO: Find and add link to formscreator thread
let fcLink = null;
try {
  if (typeof findFormsCreatorThreadIdByUserId === 'function') {
    const fcThreadId = await findFormsCreatorThreadIdByUserId(rec.targetId).catch(() => null);
    if (fcThreadId) {
      fcLink = `https://discord.com/channels/${rec.guildId}/${fcThreadId}`;
    }
  }
} catch {}

      emb.setDescription([
          `👤 **Membro:** <@${targetUser.id}>`,
          `🗓️ **Entrada:** \`${msToDDMMYYYY(joinDateMs)}\``,
          `🧭 **Área:** \`${area}\``,
          `👨‍✈️ **Responsável Direto:** ${responsavelLabel(rec)}`,
          '',
          `⏱️ **Semanas completas:** \`${weeks}\``,
          `🗓️ **Meses já na gestão:** \`${months}\``,
          '',
          `🔗 **Evolução (Forms):** ${fcLink ? `Abrir Tópico` : 'Não encontrado'}`,
          ` **Cargo obrigatório enquanto ativo:** <@&${GI_ROLE_ID}>`,
          rec?.warnNoRoleGI
            ? '\n⚠️ *Atenção:* este membro **não possui** o cargo base de gestaoinfluencer no momento do registro.'
            : (rec?.roleSetAtMs ? `\n✅ **Cargo GI setado em:** \`${msToDDMMYYYY(rec.roleSetAtMs)}\`` : '')
        ].filter(Boolean).join('\n'))
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());
      if (rec?.note) emb.addFields({ name: '🗒️ Observação', value: rec.note.slice(0, 1024) });
      return emb;
    }
    function registroButtons(messageId, active) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(BTN.EDIT_PREFIX   + messageId).setStyle(ButtonStyle.Secondary).setEmoji('✏️').setLabel('Editar Registro'),
        new ButtonBuilder().setCustomId(BTN.RESP_PREFIX   + messageId).setStyle(ButtonStyle.Secondary).setEmoji('🧭').setLabel('Definir Responsável'),
        new ButtonBuilder().setCustomId(BTN.DMNOW_PREFIX  + messageId).setStyle(ButtonStyle.Primary)  .setEmoji('📨').setLabel('Reenviar DM agora'),
        new ButtonBuilder().setCustomId(BTN.STOP_COUNT_PREFIX + messageId)
          .setStyle(active ? ButtonStyle.Danger : ButtonStyle.Success)
          .setEmoji(active ? '⏸️' : '▶️')
          .setLabel(active ? 'Parar Contagem' : 'Retomar Contagem'),
        new ButtonBuilder().setCustomId(BTN.DESLIGAR_PREFIX + messageId).setStyle(ButtonStyle.Danger).setEmoji('🗑️').setLabel('Desligar da gestão')
      );
    }

    // ====================== HELPERS ======================
    function computeNextWeekTick(joinDateMs) {
      const n = nowMs();
      const d = daysBetween(joinDateMs, n);
      const nextMultipleDays = (Math.floor(d / 7) + 1) * 7;
      const target = addDaysAtMidnight(joinDateMs, nextMultipleDays);
      return alignToLocalMidnight(target);
    }

    function semanaResumo(rec) {
      const n = nowMs();
      const weeks = weeksSince(rec.joinDateMs, n);
      const months = monthsSince(rec.joinDateMs, n);
      const pausedStr = rec.pausedAtMs ? `Pausado desde ${msToDDMMYYYY(rec.pausedAtMs)}.` : 'Ativo.';
      return { weeks, months, pausedStr };
    }

    async function dmEmbedResumo(rec, targetUser, title = '📬 Atualização semanal — Gestaoinfluencer') {
      const { weeks, months, pausedStr } = semanaResumo(rec);
      const respLinha = rec.responsibleUserId && rec.responsibleType
        ? `👨‍✈️ **Responsável atual:** ${responsavelLabel(rec)}`
        : '👨‍✈️ **Responsável atual:** —';

      const hist = (rec.responsibleHistory || [])
        .map(h => {
          const t = h.type === 'OWNER' ? 'Owner'
            : h.type === 'RESP_CREATORS' ? 'Resp Creators'
            : h.type === 'RESP_INFLU' ? 'Resp Influ'
            : h.type === 'RESP_LIDER' ? 'Resp Líder' : '—';
          return `• ${msToDDMMYYYY(h.atMs)} — ${t}: <@${h.userId}> (definido por <@${h.setBy}>)`;
        })
        .slice(-10);

      const desc = [
        `👋 <@${rec.targetId}>, segue seu status:`,
        `🗓️ **Entrada:** \`${msToDDMMYYYY(rec.joinDateMs)}\``,
        `🧭 **Área:** \`${rec.area}\``,
        `⏱️ **Semanas completas:** \`${weeks}\``,
        `🗓️ **Meses já na gestão:** \`${months}\``,
        respLinha,
        `📌 **Status:** ${rec.active ? 'Ativo' : 'Pausado'} — ${pausedStr}`,
        '',
        `🔒 **Cargo obrigatório enquanto ativo:** <@&${GI_ROLE_ID}>`,
        '',
        '💡 *Participe nos dias de quinta, sexta e sábado pra garantir **VIP/Rolepass**.*',
        'Ao completar **1 mês**, solicite **1 VIP** ao seu responsável direto presente.'
      ].join('\n');

      const emb = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .setAuthor({
          name: targetUser?.globalName || targetUser?.username || 'Membro',
          iconURL: targetUser?.displayAvatarURL?.({ size: 256 }) || undefined
        })
        .setDescription(desc)
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());

      if (hist.length) emb.addFields({ name: '📚 Histórico de Responsáveis', value: hist.join('\n') });
      else             emb.addFields({ name: '📚 Histórico de Responsáveis', value: '—' });
      if (rec?.note)   emb.addFields({ name: '🗒️ Observação', value: rec.note.slice(0, 1024) });

      return emb;
    }

    function dmWelcomeEmbed(rec, targetUser) {
      const link = recordLink(rec.guildId, rec.channelId, rec.messageId);
      const desc = [
        `🎉 Parabéns <@${rec.targetId}>!`,
        `Você foi **registrado(a) oficialmente** na gestão da **SantaCreators** 💜`,
        '',
        `✅ A partir de agora, seu progresso vai ser acompanhado semanalmente.`,
        `🏆 Quando você completar **1 mês** e estiver **ativa(o) com a gente**, você pode ganhar **VIPs, destaques** e ir **crescendo e evoluindo** dentro da casa.`,
        '',
        `🔒 Importante: enquanto sua contagem estiver **ATIVA**, o cargo <@&${GI_ROLE_ID}> é **obrigatório**.`,
        link ? `📌 Seu registro: ${link}` : ''
      ].filter(Boolean).join('\n');

      return new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('💜 Bem-vindo(a) à Gestão — SantaCreators')
        .setAuthor({
          name: targetUser?.globalName || targetUser?.username || 'Membro',
          iconURL: targetUser?.displayAvatarURL?.({ size: 256 }) || undefined
        })
        .setDescription(desc)
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());
    }

    function dmPauseEmbed(rec, targetUser, paused) {
      const link = recordLink(rec.guildId, rec.channelId, rec.messageId);
      const desc = paused
        ? [
            `⏸️ <@${rec.targetId}>, sua **contagem foi PAUSADA** pela gestão.`,
            `O cargo <@&${GI_ROLE_ID}> foi removido automaticamente enquanto está pausado.`,
            link ? `📌 Registro: ${link}` : ''
          ].filter(Boolean).join('\n')
        : [
            `▶️ <@${rec.targetId}>, sua **contagem foi RETOMADA** pela gestão!`,
            `O cargo <@&${GI_ROLE_ID}> foi setado automaticamente de novo ✅`,
            link ? `📌 Registro: ${link}` : ''
          ].filter(Boolean).join('\n');

      return new EmbedBuilder()
        .setColor(paused ? 0xe67e22 : 0x2ecc71)
        .setTitle(paused ? '⏸️ Contagem pausada' : '▶️ Contagem retomada')
        .setAuthor({
          name: targetUser?.globalName || targetUser?.username || 'Membro',
          iconURL: targetUser?.displayAvatarURL?.({ size: 256 }) || undefined
        })
        .setDescription(desc)
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());
    }

    async function sendDM_andMirror(guild, targetUser, embed, content, extraEmbeds = []) {
      const baseContent = content ?? `<@${targetUser.id}>`;
      const allEmbeds = [embed, ...extraEmbeds];
      let dmOk = false;
      try {
        const dm = await targetUser.createDM();
        await dm.send({ content: baseContent, embeds: allEmbeds });
        dmOk = true;
      } catch { dmOk = false; }

      try {
        const mirror = await guild.channels.fetch(SC_GI_CFG.CHANNEL_DM_MIRROR).catch(() => null);
        if (mirror && mirror.type === ChannelType.GuildText) {
          const mirrorEmb = EmbedBuilder.from(embed).setColor(dmOk ? 0x2ecc71 : 0xe67e22);
          await mirror.send({ content: baseContent, embeds: [mirrorEmb, ...extraEmbeds] });
        }
      } catch {}
      return dmOk;
    }

    // ====================== MENU ======================
    function messageHasOurMenuButton(msg) {
      try {
        for (const row of msg.components || []) {
          for (const c of row.components || []) if (c.customId === BTN.OPEN_MODAL) return true;
        }
      } catch {}
      return false;
    }

    // ✅ LIMPEZA DE ÓRFÃOS E DUPLICATAS (Registros fantasmas + Menus antigos)
    async function cleanOrphans(guild) {
      let removed = 0;
      try {
        const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);
        if (!ch) return 0;

        const validIds = new Set(SC_GI_STATE.registros.keys());
        const menuId = SC_GI_STATE.menuMessageId;

        // ✅ PAGINAÇÃO AUMENTADA: Varre até 1000 mensagens (10 páginas) pra pegar tudo
        let lastId = undefined;
        for (let i = 0; i < 10; i++) {
          const msgs = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
          if (!msgs || msgs.size === 0) break;

          for (const [mId, m] of msgs) {
            if (m.author.id !== client.user.id) continue;
            if (mId === menuId) continue; // Não apaga o menu atual oficial

            // Verifica se é registro
            const isRecord = m.embeds.length > 0 && (
              m.embeds[0].title?.includes("Registro • Gestaoinfluencer") ||
              m.embeds[0].title?.includes("🔴 Registro") ||
              m.embeds[0].title?.includes("🟢 Registro")
            );

            // Verifica se é menu duplicado
            const isMenu = messageHasOurMenuButton(m);

            if (isRecord) {
              // Se é registro mas não tá no banco de dados -> LIXO
              if (!validIds.has(mId)) {
                await m.delete().catch(() => {});
                removed++;
                await new Promise(r => setTimeout(r, 700)); // Delay pra evitar rate limit
              }
            } else if (isMenu) {
              // Se é menu e não é o oficial -> LIXO
              await m.delete().catch(() => {});
              removed++;
              await new Promise(r => setTimeout(r, 700));
            }
          }
          lastId = msgs.last()?.id;
        }
      } catch (e) {
        console.warn('[SC_GI] cleanOrphans error:', e);
      }
      return removed;
    }

    async function ensureMenu(guild) {
      const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return;

      if (SC_GI_STATE.menuMessageId) {
        const old = await ch.messages.fetch(SC_GI_STATE.menuMessageId).catch(() => null);
        if (old) await old.delete().catch(() => {});
        SC_GI_STATE.menuMessageId = null;
      }
      
      // Limpa QUALQUER outro menu perdido nas últimas 100 msgs
      const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) if (messageHasOurMenuButton(m)) await m.delete().catch(() => {});
      
      // Cria novo no final
      const msg = await ch.send({ embeds: [menuEmbed()], components: [menuRow()] });
      SC_GI_STATE.menuMessageId = msg.id;
      SC_GI_scheduleSave();
    }
    async function ensureMenuIfMissing(guild) {
      const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return;

      if (SC_GI_STATE.menuMessageId) {
        const msg = await ch.messages.fetch(SC_GI_STATE.menuMessageId).catch(() => null);
        if (msg && messageHasOurMenuButton(msg)) return;
      }
      const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (msgs) {
        for (const [, m] of msgs) {
          if (messageHasOurMenuButton(m)) {
            SC_GI_STATE.menuMessageId = m.id;
            SC_GI_scheduleSave();
            return;
          }
        }
      }
      const created = await ch.send({ embeds: [menuEmbed()], components: [menuRow()] });
      SC_GI_STATE.menuMessageId = created.id;
      SC_GI_scheduleSave();
    }


    async function ensureRecordsConsistency(guild) {
      let didRestore = false;
      try {
        const restoreLogCh = await guild.channels.fetch(SC_GI_CFG.CHANNEL_RESTORE_LOG).catch(() => null);

        // Usa Array.from para evitar problemas de modificação do Map durante iteração
        const records = Array.from(SC_GI_STATE.registros.values());
        for (const rec of records) {
          const ch = await guild.channels.fetch(rec.channelId).catch(() => null);
          if (!ch) continue;

          let msg = null;
          try {
            msg = await ch.messages.fetch(rec.messageId);
          } catch (e) {
            if (e.code !== 10008) continue;
          }

          if (!msg) {
            // Se não achou a mensagem, restaura automaticamente (auto-heal do tick)
            // (O botão manual abaixo faz uma verificação mais agressiva, inclusive de autor)
            // Restore
            let targetUser = await fetchUserCached(rec.targetId);
            if (!targetUser) targetUser = { id: rec.targetId };

            const registrarUser = await fetchUserCached(rec.registrarId);
            const weeks = weeksSince(rec.joinDateMs);
            const months = monthsSince(rec.joinDateMs);

            const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });

            const newMsg = await ch.send({
              content: `<@${rec.targetId}>`,
              embeds: [emb],
              components: [registroButtons('TEMP', rec.active)]
            });

            const oldId = rec.messageId;
            rec.messageId = newMsg.id;
            
            // ✅ Atualiza a chave no Map para não perder a referência
            SC_GI_STATE.registros.delete(oldId);
            SC_GI_STATE.registros.set(rec.messageId, rec);
            
            SC_GI_scheduleSave();

            await newMsg.edit({ components: [registroButtons(rec.messageId, rec.active)] }).catch(()=>{});

            if (restoreLogCh && restoreLogCh.isTextBased()) {
               const logEmb = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('♻️ Registro Restaurado (Auto)')
                .setDescription(`O registro de <@${rec.targetId}> foi apagado manualmente, mas eu recriei.\n\n**ID Antigo:** ${oldId}\n**Novo ID:** ${rec.messageId}`)
                .setFooter({ text: 'SantaCreators • Auto-Restore' })
                .setTimestamp();
               await restoreLogCh.send({ embeds: [logEmb] });
            }
            didRestore = true;
          } else {
             if (msg.author.id !== client.user.id) return; // Ignora msg de outro bot no loop automático (usa o botão pra migrar)
             const hasButtons = (msg.components || []).some(r => (r.components || []).some(c => typeof c.customId === 'string' && (c.customId.startsWith(BTN.EDIT_PREFIX) || c.customId.startsWith(BTN.STOP_COUNT_PREFIX))));
             if (!hasButtons) {
                await msg.edit({ components: [registroButtons(rec.messageId, rec.active)] }).catch(()=>{});
             }
          }
        }
      } catch (e) {
        console.warn('[SC_GI] ensureRecordsConsistency err:', e);
      }

      // Se restaurou algo, roda limpeza de órfãos pra garantir que não sobrou lixo
      if (didRestore) {
        await cleanOrphans(guild);
      }

      return didRestore;
    }

    
    // ====================== CRUD REGISTRO (SEM "TEMP") ======================
    async function createRegistro(guild, registrar, dataStr, areaStr, targetId, options = {}) {
      const joinMs    = fromDDMMYYYY_toMs(dataStr);
      if (!joinMs) throw new Error('Data inválida. Use DD/MM/AAAA.');
      const targetUser = await fetchUserCached(targetId);
      if (!targetUser) throw new Error('ID do Discord inválido.');

      // remove registros antigos desse membro
      const antigos = Array.from(SC_GI_STATE.registros.values()).filter(r => r.targetId === targetUser.id);
      for (const r of antigos) {
        try {
          const chOld = await guild.channels.fetch(r.channelId).catch(()=>null);
          const msgOld = chOld ? await chOld.messages.fetch(r.messageId).catch(()=>null) : null;
          if (msgOld) await msgOld.delete().catch(()=>{});
        } catch {}
        SC_GI_STATE.registros.delete(r.messageId);
      }

      // cria o registro
      let warnNoRoleGI = false, roleSetAtMs = null;
      const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) throw new Error('Canal de registros indisponível.');

      const days   = daysBetween(joinMs, nowMs());
      const weeks  = Math.max(0, Math.floor(days / 7));
      const months = monthsSince(joinMs);

      const tempRec = {
        messageId: null,
        guildId: guild.id,
        channelId: ch.id,
        targetId: targetUser.id,
        registrarId: registrar.id,
        area: areaStr,
        joinDateMs: joinMs,
        createdAtMs: nowMs(),
        active: options.initialActive !== undefined ? options.initialActive : true,
        nextWeekTickMs: computeNextWeekTick(joinMs),
        oneMonthNotified: false,
        oneMonthNotifiedAt: null,
        note: '',
        responsibleUserId: null,
        responsibleType: null,
        warnNoRoleGI,
        responsibleHistory: [],
        pausedAtMs: options.initialActive === false ? nowMs() : null,
        totalPausedMs: 0,
        roleSetAtMs,
        passaporte: options.passaporte || null // ✅ Salva o ID se vier do pedirset
      };

      const emb = registroEmbed({
  targetUser,
  registrarUser: registrar,
  joinDateMs: joinMs,
  area: areaStr,
  weeks,
  months,
  active: tempRec.active,
  rec: tempRec
});

// 🔥 ENVIA JÁ COM OS BOTÕES (não depende de edit)
const msg = await ch.send({
  content: `<@${targetUser.id}>`,
  embeds: [emb],
  components: [registroButtons('TEMP', tempRec.active)]
});

// agora fixa o ID real
tempRec.messageId = msg.id;
const record = { ...tempRec };
SC_GI_STATE.registros.set(record.messageId, record);
SC_GI_scheduleSave();

// 🔁 FAILSAFE: garante IDs corretos nos botões
await msg.edit({
  components: [registroButtons(record.messageId, record.active)]
}).catch(()=>{});


      // ✅ NOVO: já seta cargo GI automaticamente ao criar
      // Se for criado pausado (via pedirset), NÃO adiciona o cargo agora
      if (record.active) {
        await addGIRole(guild, record.targetId, 'Registro criado: GI obrigatório');
      }

      // atualiza flags visuais (se conseguiu setar o cargo)
      try {
        const member = await fetchMemberCached(guild, record.targetId);
        if (!member || !member.roles.cache.has(GI_ROLE_ID)) {
          record.warnNoRoleGI = true;
        } else {
          record.warnNoRoleGI = false;
          record.roleSetAtMs = nowMs();
        }
        SC_GI_scheduleSave();
      } catch {}

      // ✅ NOVO: DM BOAS-VINDAS (parabéns + 1 mês = vip/destaques)
      const welcome = dmWelcomeEmbed(record, targetUser);
      await sendDM_andMirror(guild, targetUser, welcome);

      // log
      await logMsg(
        guild,
        'Novo Registro (GI)',
        [
          `👤 Membro: <@${targetUser.id}>`,
          `🗓️ Entrada: \`${msToDDMMYYYY(joinMs)}\``,
          `🧭 Área: \`${areaStr}\``,
          `✅ Cargo GI setado automaticamente: <@&${GI_ROLE_ID}>`,
          `🧾 Por: <@${registrar.id}>`,
          `Ir ao registro})`
        ].filter(Boolean).join('\n'),
        { thumb: targetUser.displayAvatarURL?.({ size: 128 }) }
      );

      await ensureMenu(guild);
      markBoardDirty();
      await renderRespBoard(guild, { force: true });
    }

    async function editRegistro(guild, editor, messageId, newArea, newNote, newDateStr) {
      const rec = SC_GI_STATE.registros.get(messageId);
      if (!rec) throw new Error('Registro não encontrado.');
      const ch  = await guild.channels.fetch(rec.channelId).catch(() => null);
      if (!ch) throw new Error('Canal indisponível.');
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (!msg) throw new Error('Mensagem do registro não encontrada.');

      rec.area = newArea || rec.area;
      rec.note = (newNote || '').trim();

      if (newDateStr) {
        const ms = fromDDMMYYYY_toMs(newDateStr);
        if (ms) {
          rec.joinDateMs = ms;
          if (rec.active) rec.nextWeekTickMs = computeNextWeekTick(rec.joinDateMs);
        }
      }
      SC_GI_scheduleSave();

      // ✅ NOVO: Update formscreator area
      if (newArea) {
          if (typeof findFormsCreatorThreadIdByUserId === 'function' && typeof setFormsCreatorArea === 'function') {
              const fcThreadId = await findFormsCreatorThreadIdByUserId(rec.targetId).catch(() => null);
              if (fcThreadId) {
                  await setFormsCreatorArea(client, {
                      threadId: fcThreadId,
                      newArea: newArea,
                      actor: editor
                  }).catch(e => console.error("[GI] Falha ao editar área no FormsCreator:", e));
              }
          }
      }

      const targetUser    = await fetchUserCached(rec.targetId);
      const registrarUser = await fetchUserCached(rec.registrarId);
      const days   = daysBetween(rec.joinDateMs, nowMs());
      const weeks  = Math.max(0, Math.floor(days / 7));
      const months = monthsSince(rec.joinDateMs);

      const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });
      await msg.edit({ embeds: [emb], components: [registroButtons(messageId, rec.active)] });

      await logMsg(
        guild,
        'Registro Editado (GI)',
        [
          `🧾 Editor: <@${editor.id}>`,
          `👤 Membro: <@${rec.targetId}>`,
          `🧭 Nova área: \`${rec.area}\``,
          `🗓️ Nova data: \`${msToDDMMYYYY(rec.joinDateMs)}\``,
          rec.note ? `🗒️ Nota: ${rec.note}` : '',
          `Ir ao registro})`
        ].filter(Boolean).join('\n')
      );

      markBoardDirty();
      await renderRespBoard(guild);
    }

    async function toggleActive(guild, actor, messageId) {
      const rec = SC_GI_STATE.registros.get(messageId);
      if (!rec) throw new Error('Registro não encontrado.');
      const ch  = await guild.channels.fetch(rec.channelId).catch(() => null);
      if (!ch) throw new Error('Canal indisponível.');
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (!msg) throw new Error('Mensagem do registro não encontrada.');

      // PAUSAR / DESPAUSAR
      if (rec.active) {
        rec.active = false;
        rec.pausedAtMs = nowMs();

        // ✅ remove cargo GI quando pausar
        await removeGIRole(guild, rec.targetId, 'Pausado via botão');
      } else {
        rec.active = true;

        if (rec.pausedAtMs) {
          rec.totalPausedMs += (nowMs() - rec.pausedAtMs);
          rec.pausedAtMs = null;
        }
        if (!rec.nextWeekTickMs) rec.nextWeekTickMs = computeNextWeekTick(rec.joinDateMs);

        // ✅ seta cargo GI quando despausar
        await addGIRole(guild, rec.targetId, 'Retomado via botão (GI obrigatório)');

        // ✅ ATUALIZA STATUS DO CARGO (remove aviso e seta data)
        try {
          const member = await fetchMemberCached(guild, rec.targetId);
          if (member && member.roles.cache.has(GI_ROLE_ID)) {
            rec.warnNoRoleGI = false;
            rec.roleSetAtMs = nowMs();
          }
        } catch {}
      }
      SC_GI_scheduleSave();

      // atualiza embed
      const targetUser    = await fetchUserCached(rec.targetId);
      const registrarUser = await fetchUserCached(rec.registrarId);
      const days   = daysBetween(rec.joinDateMs, nowMs());
      const weeks  = Math.max(0, Math.floor(days / 7));
      const months = monthsSince(rec.joinDateMs);

      const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });
      await msg.edit({ embeds: [emb], components: [registroButtons(messageId, rec.active)] });

      // ✅ DM avisando pause/resume
      if (targetUser) {
        const dmEmb = dmPauseEmbed(rec, targetUser, !rec.active ? true : false);
        await sendDM_andMirror(guild, targetUser, dmEmb);
      }

      await logMsg(
        guild,
        rec.active ? 'Contagem Retomada (GI)' : 'Contagem Pausada (GI)',
        [
          `🔧 Por: <@${actor.id}>`,
          `👤 Membro: <@${rec.targetId}>`,
          rec.active ? `✅ Cargo GI setado novamente: <@&${GI_ROLE_ID}>` : `⛔ Cargo GI removido: <@&${GI_ROLE_ID}>`,
          `Ir ao registro})`
        ].join('\n')
      );

      markBoardDirty();
      await renderRespBoard(guild);
    }

    async function resendDM(guild, actor, messageId) {
      const rec = SC_GI_STATE.registros.get(messageId);
      if (!rec) throw new Error('Registro não encontrado.');
      const targetUser = await fetchUserCached(rec.targetId);
      if (!targetUser) throw new Error('Usuário não encontrado.');

      // ✅ BUSCA ESTATÍSTICAS GERAIS (scGeralWeeklyRanking)
      let statsEmbed = null;
      try {
        const stats = await getStatsForUser(guild.client, rec.targetId);
        if (stats) {
          statsEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('📊 Relatório de Desempenho (Recente)')
            .setDescription(`🏆 **Total Geral:** ${stats.total} pontos`)
            .addFields(
              { name: '📂 Por Categoria', value: stats.sourcesFormatted.length ? stats.sourcesFormatted.join('\n') : '_(sem registros)_', inline: false },
              { name: '📅 Por Semana', value: stats.weeksFormatted.length ? stats.weeksFormatted.join('\n') : '_(sem registros)_', inline: false }
            );
        }
      } catch (e) {
        console.warn('[SC_GI] Falha ao buscar stats para resendDM:', e);
      }

      const dmEmb = await dmEmbedResumo(rec, targetUser, '📨 Reenvio — Atualização da gestão');
      await sendDM_andMirror(guild, targetUser, dmEmb, `<@${rec.targetId}>`, statsEmbed ? [statsEmbed] : []);
      await logMsg(guild, 'DM Reenviada (GI)', [`📨 Enviado para: <@${rec.targetId}>`,`🔧 Por: <@${actor.id}>`].join('\n'));
    }

    // Mantém SOMENTE o cargo Cidadão (conforme pedido do desligamento)
    async function setOnlyCitizenAndSCRoles(guild, userId) {
      try {
        const m = await fetchMemberCached(guild, userId);
        if (!m) return;

        // ✅ CORREÇÃO:
        // 1. Mantém cargos "managed" (de bots/integrações) pois o Discord proíbe remover.
        // 2. Mantém @everyone (guild.id).
        // 3. Adiciona Cidadão.
        // 4. Remove o resto (setando apenas essa lista).
        const keep = m.roles.cache
          .filter(r => r.managed || r.id === guild.id)
          .map(r => r.id);

        if (SC_GI_CFG.ROLE_CIDADAO && !keep.includes(SC_GI_CFG.ROLE_CIDADAO)) {
          keep.push(SC_GI_CFG.ROLE_CIDADAO);
        }

        await m.roles.set(keep).catch(e => console.warn(`[SC_GI] Erro ao limpar cargos de ${userId}:`, e.message));
      } catch (e) {
        console.warn(`[SC_GI] Erro ao buscar membro ${userId} para limpar cargos:`, e.message);
      }
    }

    function parseNickParts(raw, fallbackName) {
      const current = String(raw || '').trim();
      const parts = current.split('|').map(s => s.trim()).filter(Boolean);

      let namePart = '';
      let idTag = '';

      // Helper: verifica se é ID (só números)
      const isId = (s) => /^\d+$/.test(s.replace(/[^\d]/g, ''));

      if (parts.length === 0) {
        namePart = fallbackName;
      } else {
        const last = parts[parts.length - 1];
        if (isId(last)) {
          // Última parte é ID (ex: "Macedo | 1000" ou "eqp.c | Macedo | 1000")
          idTag = last;
          if (parts.length >= 3) {
            // "Prefix | Name | ID" -> Pega o do meio
            namePart = parts.slice(1, parts.length - 1).join(' | ');
          } else if (parts.length === 2) {
            // "Name | ID" -> Pega o primeiro
            namePart = parts[0];
          } else {
            // Só "1000" -> Usa fallback
            namePart = fallbackName;
          }
        } else {
          // Última parte NÃO é ID (ex: "Coord. | Macedo")
          // Assume que a última parte é o Nome e o ID se perdeu
          namePart = last;
        }
      }

      namePart = namePart || String(fallbackName || '').trim();
      idTag    = idTag.replace(/[^\d]+/g,'').trim();

      return { namePart, idTag };
    }

    function computeNewNick(member, storedId = null) {
  const baseName = (member.user.globalName || member.displayName || member.user.username || '').trim();
  const current  = (member.displayName || '').trim();

      const { namePart, idTag } = parseNickParts(current, baseName);

      // ✅ Usa o ID do nick atual OU o ID salvo no registro (se tiver)
      const finalId = idTag || storedId || '';

      if (finalId) {
        return `${namePart} | ${finalId}`;
  } else {
    return `${namePart}`;
  }
}


    async function applyNickTemplate(guild, userId, opts = {}) {
      try {
        const m = await fetchMemberCached(guild, userId);
        if (!m) return;
        // ✅ Passa o passaporte salvo (se houver) para restaurar o ID
        const nick = computeNewNick(m, opts.passaporte);
        await m.setNickname(nick).catch(()=>{});
      } catch {}
    }

    async function desligarRegistro(guild, actor, messageId, motivo = 'Desligado manualmente') {
  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) throw new Error('Registro não encontrado.');

  const snapshot = { ...rec };

  // 🔒 BYPASS TOTAL: impede GuildMemberUpdate / Trava GI
  setRoleBypass(snapshot.targetId, 20000);

  // 🧹 LIMPA qualquer punição/restauração pendente
  SC_GI_STATE.giWarningsByUser.delete(String(snapshot.targetId));
  SC_GI_STATE.roleSnapshots.delete(String(snapshot.targetId));
  if (SC_GI_STATE.restoreTimers.has(String(snapshot.targetId))) {
    clearTimeout(SC_GI_STATE.restoreTimers.get(String(snapshot.targetId)));
    SC_GI_STATE.restoreTimers.delete(String(snapshot.targetId));
  }
  SC_GI_scheduleSave();

  try {
    // 🔥 REMOVE TODOS OS CARGOS E MANTÉM SÓ CIDADÃO
    await setOnlyCitizenAndSCRoles(guild, snapshot.targetId);

    // ✏️ AJUSTA NICK (SEM SC |)
        // ✅ Passa o passaporte salvo no registro para garantir que o ID volte
        await applyNickTemplate(guild, snapshot.targetId, { passaporte: snapshot.passaporte });
  } catch {}

    // ✅ BUSCA ESTATÍSTICAS GERAIS (scGeralWeeklyRanking)
    let statsEmbed = null;
    try {
      const stats = await getStatsForUser(guild.client, snapshot.targetId);
      if (stats) {
        statsEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('📊 Relatório de Desempenho (Recente)')
          .setDescription(`🏆 **Total Geral:** ${stats.total} pontos`)
          .addFields(
            { name: '📂 Por Categoria', value: stats.sourcesFormatted.length ? stats.sourcesFormatted.join('\n') : '_(sem registros)_', inline: false },
            { name: '📅 Por Semana', value: stats.weeksFormatted.length ? stats.weeksFormatted.join('\n') : '_(sem registros)_', inline: false }
          );
      }
    } catch (e) {
      console.warn('[SC_GI] Falha ao buscar stats para desligamento:', e);
    }


      try {
        const ch = await guild.channels.fetch(snapshot.channelId).catch(() => null);
        const msg = ch ? await ch.messages.fetch(snapshot.messageId).catch(() => null) : null;
        if (msg) await msg.delete().catch(() => {});
      } catch {}

      SC_GI_STATE.registros.delete(snapshot.messageId);
      
      // ✅ FORÇA SALVAR IMEDIATAMENTE (sem debounce) para garantir que o delete persista
      await SC_GI_saveNow();

      // ✅ Emite evento de desligamento para o Dashboard
      dashEmit('gi:desligado', {
        userId: snapshot.targetId,
        timestamp: Date.now()
      });

      // ✅ NOVO: Desliga o registro do formscreator
      try {
          if (typeof findFormsCreatorThreadIdByUserId === 'function' && typeof setFormsCreatorStatus === 'function') {
              const fcThreadId = await findFormsCreatorThreadIdByUserId(snapshot.targetId).catch(() => null);
              await setFormsCreatorStatus(client, {
                  threadId: fcThreadId,
                  newStatus: false, // false for inactive
                  actor: actor
              });
          }
      } catch (e) {
          console.error("[GI] Falha ao desligar registro no FormsCreator:", e);
      }

      markBoardDirty();

      try {
        const user = await fetchUserCached(snapshot.targetId);
        if (user) {
          const weeks  = weeksSince(snapshot.joinDateMs);
          const months = monthsSince(snapshot.joinDateMs);
          const pausas = snapshot.totalPausedMs + (snapshot.pausedAtMs ? (nowMs() - snapshot.pausedAtMs) : 0);
          const diasPausa = Math.floor(pausas / (24*60*60*1000));

          const dmText = [
            `💜 **Poxa, que pena!** Você foi desligado(a) da gestão.`,
            `Se quiser voltar um dia, a casa é sua. Obrigado pelo tempo com a gente!`,
            '',
            `🗓️ **Entrada:** \`${msToDDMMYYYY(snapshot.joinDateMs)}\``,
            `⏱️ **Semanas:** \`${weeks}\`  •  **Meses:** \`${months}\``,
            `⏸️ **Pausas acumuladas:** \`${diasPausa} dia(s)\``,
            snapshot.pausedAtMs ? `📍 **Estava pausado desde:** \`${msToDDMMYYYY(snapshot.pausedAtMs)}\`` : '',
            `🧭 **Área:** \`${snapshot.area}\``,
            `📝 **Motivo:** ${motivo}`
          ].filter(Boolean).join('\n');

          const dmEmb = await dmEmbedResumo(snapshot, user, '🗑️ Desligamento — Gestaoinfluencer');
          await sendDM_andMirror(guild, user, dmEmb, dmText, statsEmbed ? [statsEmbed] : []);
        }
      } catch (e) {
        console.warn(`[SC_GI] Falha ao enviar DM de desligamento para ${snapshot.targetId}:`, e.message);
      }

      try {
        const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_DESLIGAMENTOS).catch(() => null);
        if (ch && ch.type === ChannelType.GuildText) {
          const weeks = weeksSince(snapshot.joinDateMs);
          const months = monthsSince(snapshot.joinDateMs);
          const hist = (snapshot.responsibleHistory || [])
            .map(h => {
              const t = h.type === 'OWNER' ? 'Owner' :
                        h.type === 'RESP_CREATORS' ? 'Resp Creators' :
                        h.type === 'RESP_INFLU' ? 'Resp Influ' :
                        h.type === 'RESP_LIDER' ? 'Resp Líder' : '—';
              return `• ${msToDDMMYYYY(h.atMs)} — ${t}: <@${h.userId}> (def. por <@${h.setBy}>)`;
            })
            .join('\n') || '—';

          const emb = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🗑️ Desligamento — Gestaoinfluencer')
            .setDescription([
              `👤 Membro: <@${snapshot.targetId}>`,
              `🧭 Área: \`${snapshot.area}\``,
              `🗓️ Entrada: \`${msToDDMMYYYY(snapshot.joinDateMs)}\``,
              `⏱️ Semanas/Meses: \`${weeks}\` / \`${months}\``,
              `🧾 Registrado por: <@${snapshot.registrarId}>`,
              `🔧 Desligado por: <@${actor.id}>`,
              `📝 Motivo: ${motivo}`,
              '',
              `📚 Histórico de Responsáveis:\n${hist}`
            ].join('\n'))
            .setImage(GIF_SC_GI)
            .setTimestamp(new Date());
          await ch.send({ embeds: [emb] });
        }
      } catch {}

      await renderRespBoard(guild, { force: true });
    }

    // ====================== RESPONSÁVEL DIRETO (AUTO-TIPO) ======================
    async function getRespCandidates(guild) {
      const roleIds = SC_GI_CFG.RESP_ALLOWED_ROLE_IDS || [];
      const bucket  = new Map();
      for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
        if (!role) continue;
        for (const [id, member] of role.members) bucket.set(id, member);
      }
      const arr = Array.from(bucket.values())
        .sort((a, b) => (a.displayName || a.user?.username || '').localeCompare(b.displayName || b.user?.username || '', 'pt-BR'))
        .slice(0, 25);
      return arr.map(m => ({ id: m.id, label: (m.displayName || m.user?.username || m.id).slice(0, 100) }));
    }
    function getHighestTypeFromMember(member) {
      if (!member) return null;
      const has = (rid) => member.roles.cache.has(rid);

      if (has(SC_GI_CFG.ROLE_OWNER))         return 'OWNER';
      if (has(SC_GI_CFG.ROLE_RESP_CREATORS)) return 'RESP_CREATORS';
      if (has(SC_GI_CFG.ROLE_RESP_INFLU))    return 'RESP_INFLU';
      if (has(SC_GI_CFG.ROLE_RESP_LIDER))    return 'RESP_LIDER';

      if (SC_GI_CFG.RESP_ALLOWED_ROLE_IDS?.includes('1414651836861907006') &&
          member.roles.cache.has('1414651836861907006')) {
        return 'RESP_LIDER';
      }
      return null;
    }

    const TYPE_LABEL = (t) => t === 'OWNER' ? 'Owner'
      : t === 'RESP_CREATORS' ? 'Resp. Creators'
      : t === 'RESP_INFLU' ? 'Resp. Influ'
      : t === 'RESP_LIDER' ? 'Resp. Líder'
      : null;

    async function setResponsibleAuto(guild, actorId, messageId, pickedUserId) {
      const rec = SC_GI_STATE.registros.get(messageId);
      if (!rec) throw new Error('Registro não encontrado.');

      const mem = await fetchMemberCached(guild, pickedUserId);
      if (!mem) throw new Error('Usuário inválido ou fora do servidor.');
      const type = getHighestTypeFromMember(mem);
      if (!type) throw new Error('Este usuário não possui cargos válidos de responsável.');

      if (rec.responsibleUserId !== pickedUserId || rec.responsibleType !== type) {
        rec.responsibleHistory.push({ atMs: nowMs(), userId: pickedUserId, type, setBy: actorId });
      }
      rec.responsibleUserId = pickedUserId;
      rec.responsibleType   = type;
      SC_GI_scheduleSave();

      try {
        const ch  = await guild.channels.fetch(rec.channelId).catch(()=>null);
        const msg = ch ? await ch.messages.fetch(messageId).catch(()=>null) : null;
        if (msg) {
          const targetUser    = await fetchUserCached(rec.targetId);
          const registrarUser = await fetchUserCached(rec.registrarId);
          const weeks  = Math.max(0, Math.floor(daysBetween(rec.joinDateMs, nowMs()) / 7)); //
          const months = monthsSince(rec.joinDateMs);
          const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });
          await msg.edit({ embeds: [emb], components: [registroButtons(messageId, rec.active)] });
        }
      } catch {}

      await logMsg(
        guild,
        'Responsável Direto Definido (GI)',
        [
          `👤 Membro: <@${rec.targetId}>`,
          `🧭 Tipo: ${TYPE_LABEL(rec.responsibleType) || '—'}`,
          `👨‍✈️ Responsável: <@${rec.responsibleUserId}>`
        ].join('\n')
      );

      markBoardDirty();
      await renderRespBoard(guild, { force: true });
      return true;
    }

    // ====================== BOARD (moldura) ======================
    const CATEGORY_ORDER  = { OWNER:0, RESP_CREATORS:1, RESP_INFLU:2, RESP_LIDER:3, OUTRO:9 };
    const CATEGORY_TITLES = { OWNER:'Owner', RESP_CREATORS:'Resp Creators', RESP_INFLU:'Resp Influ', RESP_LIDER:'Resp Líder', OUTRO:'Outros' };
    const CATEGORY_EMOJI  = { OWNER:'👑',   RESP_CREATORS:'🧑‍🎨',         RESP_INFLU:'🧑‍🚀',     RESP_LIDER:'🧑‍✈️',     OUTRO:'📦' };

    const BOX_W   = 58;
    const BOX_TOP = '┏' + '━'.repeat(BOX_W) + '┓';
    const BOX_BOT = '┗' + '━'.repeat(BOX_W) + '┛';

    function markBoardDirty() { SC_GI_STATE.boardDirty = true; }

    function splitIntoChunks(str, max = 1900) {
      const parts = [];
      let buf = '';
      const lines = str.split('\n');
      for (const ln of lines) {
        if ((buf + '\n' + ln).length > max) {
          if (buf.length) parts.push(buf);
          if (ln.length > max) {
            for (let i = 0; i < ln.length; i += max) parts.push(ln.slice(i, i + max));
            buf = '';
          } else {
            buf = ln;
          }
        } else {
          buf = buf ? (buf + '\n' + ln) : ln;
        }
      }
      if (buf.length) parts.push(buf);
      return parts;
    }

    async function renderRespBoard(guild, { force = false } = {}) {
      try {
        if (!force && !SC_GI_STATE.boardDirty) return;

        const grupos = new Map();
        for (const rec of SC_GI_STATE.registros.values()) {
          const respUid = rec.responsibleUserId || '—';
          let tipoAtual = 'OUTRO';
          try {
            const respMem = respUid !== '—' ? await fetchMemberCached(guild, respUid) : null;
            tipoAtual = getHighestTypeFromMember(respMem) || rec.responsibleType || 'OUTRO';
            if (!['OWNER','RESP_CREATORS','RESP_INFLU','RESP_LIDER'].includes(tipoAtual)) tipoAtual = 'OUTRO';
          } catch {
            tipoAtual = rec.responsibleType || 'OUTRO';
            if (!['OWNER','RESP_CREATORS','RESP_INFLU','RESP_LIDER'].includes(tipoAtual)) tipoAtual = 'OUTRO';
          }
          const key = `${tipoAtual}:${respUid}`;
          if (!grupos.has(key)) grupos.set(key, []);
          grupos.get(key).push(rec);
        }

        const porCategoria = new Map();
        for (const [key, arr] of grupos.entries()) {
          const [tipo0, uid] = key.split(':');
          const tipo = (['OWNER','RESP_CREATORS','RESP_INFLU','RESP_LIDER'].includes(tipo0)) ? tipo0 : 'OUTRO';
          if (!porCategoria.has(tipo)) porCategoria.set(tipo, new Map());
          if (!porCategoria.get(tipo).has(uid)) porCategoria.get(tipo).set(uid, []);
          porCategoria.get(tipo).get(uid).push(...arr);
        }

        const tiposOrdenados = Array.from(porCategoria.keys())
          .sort((a,b) => (CATEGORY_ORDER[a] ?? 9) - (CATEGORY_ORDER[b] ?? 9));

        const blocks = [];
        blocks.push('📋 **Responsáveis e Membros (Gestão)**\n_Agrupado por responsável; edite no cartão do membro._');

        for (const tipo of tiposOrdenados) {
          const mapa = porCategoria.get(tipo);
          if (!mapa || mapa.size === 0) continue;

          blocks.push(`\n${CATEGORY_EMOJI[tipo]} **${CATEGORY_TITLES[tipo]}**\n`);

          const pares = Array.from(mapa.entries()).sort((a,b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR'));
          for (const [uid, recs] of pares) {
            const linhas = [];
            linhas.push(BOX_TOP);
            linhas.push(`Responsável: ${uid !== '—' ? `<@${uid}>` : '—'}`);
            linhas.push('Membros:');

            const ordenados = recs.slice().sort((a,b) => String(a.targetId).localeCompare(String(b.targetId), 'pt-BR'));
            for (const r of ordenados) {
              let membroTipoTxt = '';
              try {
                const mem = await fetchMemberCached(guild, r.targetId);
                const t   = getHighestTypeFromMember(mem);
                if (t) membroTipoTxt = ` (${TYPE_LABEL(t)})`;
              } catch {}
              const pausado = r.active ? '' : ' • pausado';
              linhas.push(`• <@${r.targetId}> (\`${r.area}\`${pausado})${membroTipoTxt}`);
            }

            linhas.push(BOX_BOT);
            blocks.push(linhas.join('\n'));
          }
        }

        const content = blocks.join('\n');
        const hash = simpleHash(content);
        if (!force && hash === SC_GI_STATE.boardContentHash) {
          SC_GI_STATE.boardDirty = false;
          return;
        }

        let ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_RESP_BOARD).catch(() => null);
        if (!ch) { try { ch = await client.channels.fetch(SC_GI_CFG.CHANNEL_RESP_BOARD).catch(() => null); } catch {} }
        if (!ch || (typeof ch.isTextBased === 'function' ? !ch.isTextBased() : false) || ch.guildId !== guild.id) return;

        const chunks = splitIntoChunks(content, 1900);

        // Tenta reutilizar mensagens existentes (Edição)
        const oldIds = SC_GI_STATE.boardMessageIds || [];
        const validMsgs = [];
        let canEdit = true;

        // Verifica se as mensagens antigas ainda existem
        for (const mid of oldIds) {
          const m = await ch.messages.fetch(mid).catch(() => null);
          if (m) validMsgs.push(m);
          else canEdit = false;
        }

        // Se quantidade mudou ou alguma sumiu, não edita -> apaga e recria
        if (validMsgs.length !== chunks.length) canEdit = false;

        if (canEdit) {
          // Edita
          for (let i = 0; i < chunks.length; i++) {
            if (validMsgs[i].content !== chunks[i]) {
              await validMsgs[i].edit(chunks[i]).catch(() => {});
            }
          }
          // IDs mantidos
        } else {
          // Apaga as que achou
          for (const m of validMsgs) await m.delete().catch(() => {});
          
          // Cria novas
          const newIds = [];
          for (const chunk of chunks) {
            const m = await ch.send(chunk);
            newIds.push(m.id);
          }
          SC_GI_STATE.boardMessageIds = newIds;
        }

        SC_GI_STATE.boardContentHash = hash;
        SC_GI_STATE.boardDirty = false;
        SC_GI_scheduleSave();

        // LIMPEZA DE SOBRAS (Auto-healing)
        // Remove qualquer mensagem do bot neste canal que pareça parte do board mas não esteja na lista oficial
        try {
          const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
          if (recent) {
            const currentIds = new Set(SC_GI_STATE.boardMessageIds);
            const botId = client.user.id;
            for (const [id, m] of recent) {
              if (m.author.id === botId && !currentIds.has(id)) {
                // Critério expandido: cabeçalho, moldura (top/bot) ou item de lista
                if (
                  m.content.includes('📋 **Responsáveis e Membros (Gestão)**') ||
                  m.content.includes('┏━') ||
                  m.content.includes('┗━') ||
                  m.content.includes('• <@')
                ) {
                  await m.delete().catch(() => {});
                }
              }
            }
          }
        } catch {}

      } catch (e) {
        console.warn('[SC_GI] renderRespBoard err:', e?.message);
      }
    }

    // ====================== LOG ======================
    async function logMsg(guild, title, description, extra = {}) {
      try {
        const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_LOGS).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return;

        const emb = new EmbedBuilder()
          .setColor(0x8e44ad)
          .setTitle('🧾 ' + title)
          .setDescription(description)
          .setImage(GIF_SC_GI)
          .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
          .setTimestamp(new Date());

        if (extra.footer) emb.setFooter({ text: extra.footer });
        if (extra.thumb)  emb.setThumbnail(extra.thumb);

        await ch.send({ embeds: [emb] });
      } catch {}
    }

    // ====================== TRAVA ANTI-REMOVER GI ======================
    async function scheduleRestoreRoles(guild, userId) {
      const snap = SC_GI_STATE.roleSnapshots.get(String(userId));
      if (!snap) return;

      const delay = Math.max(0, (snap.restoreAtMs || 0) - nowMs());
      if (SC_GI_STATE.restoreTimers.has(String(userId))) {
        clearTimeout(SC_GI_STATE.restoreTimers.get(String(userId)));
        SC_GI_STATE.restoreTimers.delete(String(userId));
      }

      const t = setTimeout(async () => {
        try {
          const member = await fetchMemberCached(guild, userId);
          if (!member) return;

          setRoleBypass(userId, 12000);

          // restaura roles anteriores (sem @everyone)
          const rolesToSet = (snap.roleIds || []).filter(Boolean);

          await member.roles.set(rolesToSet).catch(()=>{});

          // se o registro estiver ativo, garante GI de volta
          const rec = snap.recordMessageId ? SC_GI_STATE.registros.get(String(snap.recordMessageId)) : getLatestRecordByTarget(userId);
          if (rec?.active) await addGIRole(guild, userId, 'Restore pós-punição: GI obrigatório');

          // DM final
          const u = await fetchUserCached(userId);
          if (u) {
            const link = rec ? recordLink(rec.guildId, rec.channelId, rec.messageId) : null;
            const emb = new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle('✅ Cargos restaurados')
              .setDescription([
                `Pronto <@${userId}>, seus cargos foram **devolvidos**.`,
                `Mas fica esperto(a): **não remove** o cargo <@&${GI_ROLE_ID}> enquanto sua contagem estiver **ativa**.`,
                link ? `📌 Registro: ${link}` : ''
              ].filter(Boolean).join('\n'))
              .setImage(GIF_SC_GI)
              .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
              .setTimestamp(new Date());

            await sendDM_andMirror(guild, u, emb, `<@${userId}>`);
          }

          // limpa snapshot
          SC_GI_STATE.roleSnapshots.delete(String(userId));
          SC_GI_scheduleSave();
        } catch {}
      }, delay);

      SC_GI_STATE.restoreTimers.set(String(userId), t);
    }

    async function punishSecondRemoval(guild, userId, rec) {
      try {
        const member = await fetchMemberCached(guild, userId);
        if (!member) return;

        // snapshot roles atuais (antes de remover tudo)
        // pega ids (sem @everyone)
        const currentRoles = member.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => r.id);

        const restoreAt = nowMs() + SC_GI_CFG.GI_RESTORE_AFTER_PUNISH_MS;

        SC_GI_STATE.roleSnapshots.set(String(userId), {
          roleIds: currentRoles,
          restoreAtMs: restoreAt,
          createdAtMs: nowMs(),
          recordMessageId: rec?.messageId ? String(rec.messageId) : null
        });
        SC_GI_scheduleSave();

        // remove TODOS cargos
        setRoleBypass(userId, 15000);
        await member.roles.set([]).catch(()=>{});

        // DM punição (mas sem desligar do registro)
        const u = await fetchUserCached(userId);
        if (u) {
          const link = rec ? recordLink(rec.guildId, rec.channelId, rec.messageId) : null;
          const emb = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ Atenção — remoção repetida do cargo')
            .setDescription([
              `Bom, vi que você **ignorou** o aviso e removeu o cargo <@&${GI_ROLE_ID}> **de novo** em menos de 2 minutos.`,
              ``,
              `Então eu removi **todos os seus cargos** temporariamente.`,
              `Mas relaxa: **eu NÃO te desliguei da gestão**.`,
              ``,
              `👉 Agora você precisa contatar um **superior** (um **responsável**, pra ser exato) e explicar a situação.`,
              `⏳ Seus cargos voltam automaticamente em **10 minutos**.`,
              link ? `📌 Registro: ${link}` : ''
            ].filter(Boolean).join('\n'))
            .setImage(GIF_SC_GI)
            .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
            .setTimestamp(new Date());

          await sendDM_andMirror(guild, u, emb, `<@${userId}>`);
        }

        // avisa logs/responsáveis
        const link = rec ? recordLink(rec.guildId, rec.channelId, rec.messageId) : null;
        await logMsg(
          guild,
          '🚨 Tentou remover cargo GI (2x <2min)',
          [
            `👤 Membro: <@${userId}>`,
            `🎯 Cargo: <@&${GI_ROLE_ID}>`,
            `⚠️ Ação: removeu 2x em menos de 2 minutos`,
            `🧯 Medida: removi todos os cargos (temporário) • restaura em 10 minutos`,
            link ? `📌 Registro: ${link}` : ''
          ].filter(Boolean).join('\n')
        );

        // agenda restore
        await scheduleRestoreRoles(guild, userId);
      } catch {}
    }

    async function warnAndReAddGI(guild, userId, rec) {
      try {
        await addGIRole(guild, userId, 'Trava GI: cargo obrigatório enquanto ativo');

        const u = await fetchUserCached(userId);
        if (!u) return;

        const link = rec ? recordLink(rec.guildId, rec.channelId, rec.messageId) : null;

        const emb = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('⚠️ Cargo obrigatório — não remove!')
          .setDescription([
            `⚠️ <@${userId}>, o cargo <@&${GI_ROLE_ID}> é **obrigatório** enquanto seu registro estiver **ativo**.`,
            `Eu já setei ele de volta automaticamente ✅`,
            ``,
            `Se você remover **de novo** em menos de **2 minutos**, eu vou remover **todos os seus cargos** (temporário) e avisar os responsáveis.`,
            link ? `📌 Seu registro: ${link}` : ''
          ].filter(Boolean).join('\n'))
          .setImage(GIF_SC_GI)
          .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
          .setTimestamp(new Date());

        await sendDM_andMirror(guild, u, emb, `<@${userId}>`);
      } catch {}
    }

    async function handleGIRoleRemoved(guild, userId) {
  const rec = getLatestRecordByTarget(userId);

  // ❌ se não existe mais registro, IGNORA totalmente
  if (!rec) return;

  // ❌ se não está ativo, ignora
  if (!rec.active) return;


      const warn = getWarningData(userId);
      const now = nowMs();
      const last = warn.lastAtMs || 0;

      // 2x em <2min => punição
      if (last && (now - last) <= SC_GI_CFG.GI_REMOVE_WINDOW_MS) {
        warn.count = (warn.count || 0) + 1;
        warn.lastAtMs = now;
        SC_GI_scheduleSave();

        await punishSecondRemoval(guild, userId, rec);
        return;
      }

      // 1ª vez (ou fora da janela) => devolve + DM
      warn.count = 1;
      warn.lastAtMs = now;
      SC_GI_scheduleSave();

      await warnAndReAddGI(guild, userId, rec);
    }

    // ====================== LOOP ======================
    let isTicking = false; // ✅ Trava para evitar sobreposição de execuções
    async function tick() {
      if (isTicking) return;
      isTicking = true;

      try {
        const n = nowMs();

        for (const rec of SC_GI_STATE.registros.values()) {
          if (rec.active && rec.nextWeekTickMs && n >= rec.nextWeekTickMs) {
            const guild = client.guilds.cache.get(rec.guildId);
            if (guild) {
              const targetUser = await fetchUserCached(rec.targetId);
              if (targetUser) {
                const dmEmb = await dmEmbedResumo(rec, targetUser, '📬 Atualização semanal — Gestaoinfluencer');
                await sendDM_andMirror(guild, targetUser, dmEmb);
              }
            }
            rec.nextWeekTickMs = computeNextWeekTick(rec.joinDateMs);
            SC_GI_scheduleSave();
          }

          const days = daysBetween(rec.joinDateMs, n);
          if (!rec.oneMonthNotified && days >= 30) {
            try {
              const guild = client.guilds.cache.get(rec.guildId);
              const chAviso = guild ? await guild.channels.fetch(SC_GI_CFG.CHANNEL_AVISOS_1M).catch(() => null) : null;
              if (chAviso && chAviso.type === ChannelType.GuildText) {
                const emb = new EmbedBuilder()
                  .setColor(0xf1c40f)
                  .setTitle('🏆 1 MÊS — Gestaoinfluencer')
                  .setDescription([
                    `🎉 <@${rec.targetId}> completou **1 mês** com a gente na **gestaoinfluencer**!`,
                    `🧭 Área: \`${rec.area}\``,
                    `👉 Já pode solicitar **1 VIP** ao **Resp Líder**, **Resp Influ** ou **Resp Creators** presente.`,
                    '',
                    `💜 *E continue ativa(o) com a gente: vai ganhando destaque, VIPs e evoluindo dentro da casa!*`
                  ].join('\n'))
                  .setImage(GIF_SC_GI)
                  .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
                  .setTimestamp(new Date());
                await chAviso.send({ content: `<@${rec.targetId}>`, embeds: [emb] });
              }
            } catch {}
            rec.oneMonthNotified   = true;
            rec.oneMonthNotifiedAt = n;
            SC_GI_scheduleSave();
          }

          if (!rec.active && rec.pausedAtMs) {
            const dias = Math.floor((n - rec.pausedAtMs) / (24*60*60*1000));
            if (dias >= SC_GI_CFG.AUTO_DESLIGAR_PAUSA_DIAS) {
              const guild = client.guilds.cache.get(rec.guildId);
              if (guild) await desligarRegistro(guild, { id: client.user.id }, rec.messageId, `Auto-desligado após ${dias} dias pausado`);
            }
          }
        }

        for (const [, g] of client.guilds.cache) {
          // 🔧 FAILSAFE: repara registros sem botões ou deletados
          const restoredAny = await ensureRecordsConsistency(g);

          // ✅ Se restaurou algo (mandou msg nova), recria o menu no final.
          if (restoredAny) {
            await ensureMenu(g);
          } else {
            await ensureMenuIfMissing(g);
          }

  await renderRespBoard(g);


          // re-agenda restores pendentes (failsafe)
          // (só faz isso com baixa frequência via tick mesmo)
          for (const [uid, snap] of SC_GI_STATE.roleSnapshots.entries()) {
            if (!snap?.restoreAtMs) continue;
            if (snap.restoreAtMs <= nowMs() + 5000) {
              if (!SC_GI_STATE.restoreTimers.has(uid)) await scheduleRestoreRoles(g, uid);
            } else {
              if (!SC_GI_STATE.restoreTimers.has(uid)) await scheduleRestoreRoles(g, uid);
            }
          }
        }
      } catch (e) {
        console.warn('[SC_GI] tick err:', e.message);
      }
      finally {
        isTicking = false;
      }
    }

    // ====================== INIT ======================
    client.once(Events.ClientReady, async () => {
      try {
        await SC_GI_load();
        for (const [, guild] of client.guilds.cache) {
          await ensureMenu(guild);
          markBoardDirty();
          await renderRespBoard(guild, { force: true });

          // re-agenda restores pendentes na hora que o bot liga
          for (const [uid] of SC_GI_STATE.roleSnapshots.entries()) {
            await scheduleRestoreRoles(guild, uid);
          }
        }
        setInterval(tick, SC_GI_CFG.TICK_MS);
        console.log('[SC_GI] Controle GI v3.4 LEVE iniciado.');
      } catch (e) {
        console.warn('[SC_GI] Erro no init:', e.message);
      }
    });

    // ====================== INTERAÇÕES (FAILSAFE do "TEMP") ======================
    function resolveRecordByInteraction(interaction, rawId) {
      let id = String(rawId || '');
      let rec = SC_GI_STATE.registros.get(id);
      if (!rec && id === 'TEMP' && interaction?.message?.id) {
        id = interaction.message.id;
        rec = SC_GI_STATE.registros.get(id);
      }
      if (!rec && interaction?.message?.id) {
        rec = SC_GI_STATE.registros.get(interaction.message.id);
        if (rec) id = interaction.message.id;
      }
      return { rec, id };
    }

    // ====================== TRAVA (GuildMemberUpdate) ======================
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        const guild = newMember.guild;
        if (!guild) return;

        // se foi o bot mexendo, ignora
        if (hasRoleBypass(newMember.id)) return;

        const hadGI = oldMember.roles.cache.has(GI_ROLE_ID);
        const hasGI = newMember.roles.cache.has(GI_ROLE_ID);

        // detecta REMOÇÃO do cargo GI
        if (hadGI && !hasGI) {
          await handleGIRoleRemoved(guild, newMember.id);
        }
      } catch {}
    });

    // ====================== LISTENER EXTERNO (PEDIR SET) ======================
    // ✅ Isso aqui que faltava para criar o controle sozinho!
    dashOn('pedirset:aprovado', async (data) => {
      try {
        // data: { userId, guildId, approverId, ... }
        const guild = client.guilds.cache.get(data.guildId);
        if (!guild) return;

        // Cria registro PAUSADO (active: false)
        // Data de entrada = hoje (Fuso SP para não virar o dia errado)
        const now = new Date();
        const parts = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).formatToParts(now);

        const dd = parts.find(p => p.type === 'day').value;
        const mm = parts.find(p => p.type === 'month').value;
        const yyyy = parts.find(p => p.type === 'year').value;
        const dataStr = `${dd}/${mm}/${yyyy}`;

        // Registrar como se fosse o bot (sistema)
        // ✅ Força a área "A Definir" (conforme solicitado)
        // ✅ Passa o passaporte para salvar no registro
        await createRegistro(guild, client.user, dataStr, 'A Definir', data.userId, { initialActive: false, passaporte: data.passaporte });
        console.log(`[SC_GI] Registro automático criado (pausado) para ${data.userId} em ${dataStr}`);
      } catch (e) {
        console.error('[SC_GI] Erro ao criar registro automático via pedirset:', e);
      }
    });

    // ====================== INTERACTION HANDLER ======================
    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        const guild = interaction.guild;
        if (!guild) return;

        // Abrir modal criar
        if (interaction.isButton() && interaction.customId === BTN.OPEN_MODAL) {
          if (!hasAuth(interaction.member)) {
            return interaction.reply({ content: '❌ Você não tem permissão para usar isto.', flags: MessageFlags.Ephemeral });
          }
          return interaction.showModal(new ModalBuilder()
            .setCustomId('SC_GI_MODAL_CREATE')
            .setTitle('Novo Registro — Gestaoinfluencer')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('SC_GI_INP_DATA').setLabel('Dia que entrou? (DD/MM/AAAA)').setStyle(TextInputStyle.Short).setPlaceholder('16/09/2025').setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('SC_GI_INP_AREA').setLabel('Área').setStyle(TextInputStyle.Short).setPlaceholder('SocialMedias').setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('SC_GI_INP_ID').setLabel('ID do Discord da pessoa').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
              )
            )
          );
        }

        // Botão Check/Restaurar (Migração/Correção Manual)
        if (interaction.isButton() && interaction.customId === BTN.CHECK_RECORDS) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          let fixedCount = 0;
          let orphansRemoved = 0;
          const guild = interaction.guild;
          const restoreLogCh = await guild.channels.fetch(SC_GI_CFG.CHANNEL_RESTORE_LOG).catch(() => null);

          for (const rec of SC_GI_STATE.registros.values()) {
            const ch = await guild.channels.fetch(rec.channelId).catch(() => null);
            if (!ch) continue;

            let msg = null;
            let needsFix = false;
            let reason = '';

            try {
              msg = await ch.messages.fetch(rec.messageId);
              // Se a mensagem existe mas não é minha (é do bot antigo), precisa recriar
              if (msg.author.id !== client.user.id) {
                needsFix = true;
                reason = 'Mensagem de outro bot (migração)';
              }
            } catch (e) {
              if (e.code === 10008) {
                needsFix = true;
                reason = 'Mensagem não encontrada (deletada)';
              }
            }

            if (needsFix) {
              // Recria o registro
              let targetUser = await fetchUserCached(rec.targetId);
              if (!targetUser) targetUser = { id: rec.targetId }; // Fallback visual

              const registrarUser = await fetchUserCached(rec.registrarId);
              const weeks = weeksSince(rec.joinDateMs);
              const months = monthsSince(rec.joinDateMs);

              const emb = registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });

              const newMsg = await ch.send({
                content: `<@${rec.targetId}>`,
                embeds: [emb],
                components: [registroButtons('TEMP', rec.active)]
              }).catch(() => null);

              if (newMsg) {
                // Tenta apagar a antiga se existir (e for deletável)
                if (msg && msg.deletable) await msg.delete().catch(() => {});

                const oldId = rec.messageId;
                rec.messageId = newMsg.id;
                
                SC_GI_STATE.registros.delete(oldId);
                SC_GI_STATE.registros.set(rec.messageId, rec);

                SC_GI_scheduleSave();

                await newMsg.edit({ components: [registroButtons(rec.messageId, rec.active)] }).catch(()=>{});
                fixedCount++;

                if (restoreLogCh && restoreLogCh.isTextBased()) {
                   const logEmb = new EmbedBuilder().setColor(0xFFA500).setTitle('♻️ Registro Restaurado (Manual)').setDescription(`**Membro:** <@${rec.targetId}>\n**Motivo:** ${reason}\n**ID Antigo:** ${oldId}\n**Novo ID:** ${rec.messageId}`).setFooter({ text: 'SantaCreators • Check Manual' }).setTimestamp();
                   await restoreLogCh.send({ embeds: [logEmb] }).catch(() => {});
                }
                await new Promise(r => setTimeout(r, 1000)); // Delay pra não tomar rate limit
              }
            }
          }

          // 🧹 LIMPEZA DE ÓRFÃOS (Duplicatas fantasmas)
          orphansRemoved = await cleanOrphans(guild);

          // ✅ NOVO: Garante que o menu desce pro final após o check
          await ensureMenu(guild);

          await interaction.editReply({ content: `✅ Verificação completa.\n**${fixedCount}** registros restaurados/migrados.\n**${orphansRemoved}** duplicatas (órfãs) removidas.` });
          return;
        }

        // Parar/Retomar contagem
        if (interaction.isButton() && interaction.customId.startsWith(BTN.STOP_COUNT_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.STOP_COUNT_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            await toggleActive(guild, interaction.user, messageId);
            await interaction.editReply({ content: '✅ Estado da contagem atualizado!' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }
          return;
        }

        // Editar registro
        if (interaction.isButton() && interaction.customId.startsWith(BTN.EDIT_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.EDIT_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          const inpArea = new TextInputBuilder()
            .setCustomId('SC_GI_EDIT_AREA').setLabel('Área (visual)').setStyle(TextInputStyle.Short)
            .setPlaceholder(rec.area || 'SocialMedias').setValue(rec.area || 'SocialMedias').setRequired(true);
          
          const inpDate = new TextInputBuilder()
            .setCustomId('SC_GI_EDIT_DATE').setLabel('Data Entrada (DD/MM/AAAA)').setStyle(TextInputStyle.Short)
            .setPlaceholder('DD/MM/AAAA').setValue(msToDDMMYYYY(rec.joinDateMs)).setRequired(true);

          const inpNote = new TextInputBuilder()
            .setCustomId('SC_GI_EDIT_NOTE').setLabel('Observação/Nota (opcional)').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex.: destaque, mudança visual, etc.').setRequired(false);

          const modal = new ModalBuilder()
            .setCustomId(`SC_GI_MODAL_EDIT_${messageId}`)
            .setTitle('Editar Registro — Gestaoinfluencer')
            .addComponents(
              new ActionRowBuilder().addComponents(inpArea),
              new ActionRowBuilder().addComponents(inpDate),
              new ActionRowBuilder().addComponents(inpNote)
            );
          return interaction.showModal(modal);
        }

        // Reenviar DM agora
        if (interaction.isButton() && interaction.customId.startsWith(BTN.DMNOW_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.DMNOW_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            await resendDM(guild, interaction.user, messageId);
            await interaction.editReply({ content: '✅ DM reenviada e espelhada!' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }
          return;
        }

        // Definir responsável (abrir select)
        if (interaction.isButton() && interaction.customId.startsWith(BTN.RESP_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.RESP_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          const rows = [];
          const candidates = await getRespCandidates(guild);
          if (candidates.length > 0 && candidates.length <= 25) {
            rows.push(new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(SEL.RESP_USER_PREFIX + messageId)
                .setPlaceholder('Selecione o Responsável (lista filtrada por cargos)')
                .addOptions(candidates.map(c => ({ label: c.label, value: c.id, emoji: '👤' })))
            ));
          } else if (typeof UserSelectMenuBuilder !== 'undefined') {
            rows.push(new ActionRowBuilder().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId(SEL.RESP_USER_PREFIX + messageId)
                .setPlaceholder('Selecione o Responsável (será validado pelos cargos)')
                .setMinValues(1).setMaxValues(1)
            ));
          } else {
            return interaction.reply({ content: '⚠️ Não foi possível carregar a lista de responsáveis.', flags: MessageFlags.Ephemeral });
          }

          return interaction.reply({
            content: '🧭 **Defina o Responsável Direto** (a área será detectada automaticamente pelo maior cargo).',
            components: rows,
            flags: MessageFlags.Ephemeral
          });
        }

        // Select de usuário p/ responsável
        if ((interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) &&
            interaction.customId.startsWith(SEL.RESP_USER_PREFIX)) {
          const raw = interaction.customId.replace(SEL.RESP_USER_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          const pickedUserId = interaction.values?.[0];
          try {
            await setResponsibleAuto(guild, interaction.user.id, messageId, pickedUserId);
            return interaction.reply({ content: `✅ Responsável definido: <@${pickedUserId}> (área detectada automaticamente).`, flags: MessageFlags.Ephemeral });
          } catch (e) {
            return interaction.reply({ content: '⚠️ ' + (e?.message || 'Falha ao definir responsável.'), flags: MessageFlags.Ephemeral });
          }
        }

        // Modal criar
        if (interaction.isModalSubmit() && interaction.customId === 'SC_GI_MODAL_CREATE') {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const dataStr = interaction.fields.getTextInputValue('SC_GI_INP_DATA')?.trim();
          const areaStr = interaction.fields.getTextInputValue('SC_GI_INP_AREA')?.trim();
          const idStr   = interaction.fields.getTextInputValue('SC_GI_INP_ID')?.trim();
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            await createRegistro(guild, interaction.user, dataStr, areaStr, idStr);
            await interaction.editReply({ content: '✅ Registro criado com sucesso! (cargo GI setado + DM enviada)' });
          } catch (e) { await interaction.editReply({ content: '⚠️ ' + e.message }); }
          return;
        }

        // Modal editar
        if (interaction.isModalSubmit() && interaction.customId.startsWith('SC_GI_MODAL_EDIT_')) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const messageId = interaction.customId.replace('SC_GI_MODAL_EDIT_', '');
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            const area = interaction.fields.getTextInputValue('SC_GI_EDIT_AREA')?.trim();
            const note = interaction.fields.getTextInputValue('SC_GI_EDIT_NOTE')?.trim();
            const date = interaction.fields.getTextInputValue('SC_GI_EDIT_DATE')?.trim();
            await editRegistro(guild, interaction.user, messageId, area, note, date);
            await interaction.editReply({ content: '✅ Registro atualizado!' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }
          return;
        }

        // Desligar
        if (interaction.isButton() && interaction.customId.startsWith(BTN.DESLIGAR_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.DESLIGAR_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            await desligarRegistro(guild, interaction.user, messageId, 'Desligamento via botão');
            await interaction.editReply({ content: '✅ Membro desligado (controle removido, DM/log enviados).' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }
          return;
        }

      } catch (e) {
        console.warn('[SC_GI] interaction err:', e.message);
        try {
          if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '⚠️ Ocorreu um erro. Tenta de novo em alguns segundos.', flags: MessageFlags.Ephemeral });
          }
        } catch {}
      }
    });

  } catch (err) {
    console.warn('[SC_GI] Falha ao instalar módulo (ESM):', err.message);
  }
})();