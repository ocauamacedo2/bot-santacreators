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
  Events, ChannelType, MessageFlags, AuditLogEvent, PermissionFlagsBits
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

const {
  findFormsCreatorThreadIdByUserId,
  findFormsCreatorThreadLinkByUserId,
  findFormsCreatorThreadIdFastByUserId,
  setFormsCreatorStatus,
  setFormsCreatorArea,
  findOriginalFormsCreatorThreadIdByUserId,
  migrateFormsCreatorDiscordId
} = formsCreator;

    // ✅ IDENTIDADE DISCORD
    // Mantém o histórico quando a pessoa troca de conta.
    let discordIdentity = {};

    try {
      discordIdentity =
        await import(
          '../shared/scDiscordIdentity.js'
        );
    } catch (e) {
      console.warn(
        '[SC_GI] scDiscordIdentity.js indisponível. Troca de Discord ficará bloqueada por segurança:',
        e?.message || e
      );
    }

    const {
      resolveDiscordIdentity,
      validateDiscordIdentityMigration,
      registerDiscordIdentityMigration,
      rollbackDiscordIdentityMigration
    } = discordIdentity;

    // ✅ EVOLUÇÃO EM TRÊS FASES
    let evolutionHierarchy = {};

    try {
      evolutionHierarchy =
        await import(
          './evolutionHierarchy.js'
        );
    } catch (e) {
      console.warn(
        '[SC_GI] evolutionHierarchy.js indisponível:',
        e?.message || e
      );
    }

    const {
      syncEvolutionHierarchyForMember,
      lockEvolutionHierarchyForMember
    } = evolutionHierarchy;

    // ✅ NOVO: importa a hierarquia institucional oficial.
    // A automação de área NÃO usa posição técnica dos cargos do Discord.
    let hierarchyDivisoes = {};
    try {
      hierarchyDivisoes = await import('./hierarquiaDivisoes.js');
    } catch (e) {
      console.warn(
        "[SC_GI] ⚠️ hierarquiaDivisoes.js não pôde ser carregado. " +
        "A automação inteligente de Área ficará bloqueada por segurança.",
        e.message
      );
    }

    const {
      getOfficialSantaCreatorsHierarchyRank,
      getOfficialSantaCreatorsHierarchyRankForRoleId
    } = hierarchyDivisoes;

    // =====================================================
    // IA — COMENTÁRIO SEMANAL INDIVIDUAL
    // =====================================================

    let weeklyMemberAiFeedback = {};

    try {
      weeklyMemberAiFeedback =
        await import(
          './weeklyMemberAiFeedback.js'
        );
    } catch (e) {
      console.warn(
        "[SC_GI] ⚠️ weeklyMemberAiFeedback.js não pôde ser carregado. " +
        "Os comentários semanais por IA ficarão desativados.",
        e?.message || e
      );
    }

    const {
      weeklyMemberAiFeedbackOnReady,
      forceWeeklyMemberAiFeedback,
      generateWeeklyMemberPrivateDm,
      generateMemberLifecyclePrivateDm,
      generateMemberDismissalFormsSummary,
      generateMemberReturnFormsSummary,
      migrateWeeklyMemberAiFeedbackDiscordId
    } = weeklyMemberAiFeedback;

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
CHANNEL_LOGS:             '1486006878914875412',
CHANNEL_AVISOS_1M:        '1486084383575113758',
CHANNEL_DM_MIRROR:        '1554974969648382083',
CHANNEL_RESP_BOARD:       '1427082727600947230',
CHANNEL_DESLIGAMENTOS:    '1427089183847223306',
CHANNEL_RESTORE_LOG:      '1486006878914875412',

// Histórico completo individual de alterações do Controle GI.
CHANNEL_MEMBER_HISTORY_LOG: '1555344870195994754',

      ROLE_GESTAOINFLUENCER:   '1371733765243670538',
      ROLE_CREATOR_BASE:       '1352939011253076000',
      ROLE_CIDADAO:            '1262978759922028575',
      ROLE_SANTA_CREATORS:     '1352275728476930099',
      CHANNEL_CARGO_LOGS:      '1352491088870375531',
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
      ROLE_COORD_CREATORS: '1388976314253312100',

      RESP_ALLOWED_ROLE_IDS: [
        '1262262852949905408',
        '1352408327983861844',
        '1262262852949905409',
        '1352407252216184833',
        '1414651836861907006'
      ],

            AUTO_DESLIGAR_PAUSA_DIAS: 30,

      // Atualização visual automática dos controles.
      CONTROL_REFRESH_ACTIVE_MS: 30 * 60 * 1000,
      CONTROL_REFRESH_PAUSED_MS: 2 * 60 * 1000,

      // A conferência completa percorre todos os registros
      // e faz várias leituras no Discord.
      // Não precisa rodar a cada minuto.
      RECORDS_CONSISTENCY_MS: 5 * 60 * 1000,

      // NOVO: regras da trava
      GI_REMOVE_WINDOW_MS: 2 * 60 * 1000,
      GI_RESTORE_AFTER_PUNISH_MS: 10 * 60 * 1000
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

      // snapshots pra restauração após punição
      // NOVO: lastCountdownWarningAt para evitar spam de DM
      roleSnapshots: new Map(), // userId -> { roleIds: string[], restoreAtMs:number, createdAtMs:number, recordMessageId:string|null }

      // =====================================================
      // SNAPSHOTS PERSISTENTES DE DESLIGAMENTO
      // =====================================================
      //
      // Chave: ID da mensagem antiga do Controle GI.
      //
      // Diferente de roleSnapshots, estes snapshots NÃO são
      // temporários. Eles preservam a trajetória necessária
      // para o botão "Restaurar Membro" continuar funcionando
      // mesmo depois de restart/deploy.
      // =====================================================
      disconnectedSnapshots: new Map(),

      // 👑 OVERRIDE ABSOLUTO
      // Mudanças manuais feitas por:
      // 660311795327828008
      // 1262262852949905408
      //
      // targetId -> Map(roleId -> "present" | "absent")
      masterRoleOverridesByUser: new Map(),

      // timers em memória
      restoreTimers: new Map() // userId -> timeoutId
    };

    // =====================================================
    // API VIVA DO CONTROLE GI
    // =====================================================
    // Permite que outros módulos do mesmo processo consultem o estado REAL
    // dos controles em memória, inclusive controles pausados.
    //
    // IMPORTANTE:
    // - active === true  -> Controle GI ativo
    // - active === false -> Controle GI pausado, MAS ainda existente
    // - sem registro     -> pessoa não possui mais Controle GI
    //
    // O sortChannels usa isso como failsafe para não depender somente
    // de eventos antigos ou do cargo GI.
    let SC_GI_DATA_READY = false;
    let SC_GI_DATA_AUTHORITATIVE = false;

    function SC_GI_resolveRecordGuildId(rec) {
      if (!rec) return null;

      const directGuildId =
        String(
          rec.guildId ||
          ''
        );

      if (directGuildId) {
        return directGuildId;
      }

      const channelGuildId =
        String(
          client.channels.cache.get(
            String(rec.channelId || '')
          )?.guildId ||
          ''
        );

      if (channelGuildId) {
        rec.guildId =
          channelGuildId;

        SC_GI_scheduleSave();

        return channelGuildId;
      }

      return null;
    }
    function SC_GI_findCurrentControl(guildId, userId) {
      const wantedGuildId =
        String(
          guildId ||
          ''
        );

      const rawWantedUserId =
        String(
          userId ||
          ''
        );

      if (!rawWantedUserId) {
        return null;
      }

      const wantedUserId =
        typeof resolveDiscordIdentity ===
          "function"
          ? resolveDiscordIdentity(
              rawWantedUserId
            )
          : rawWantedUserId;

      let newest =
        null;

      for (
        const rec
        of SC_GI_STATE
          .registros
          .values()
      ) {
        const rawRecordUserId =
          String(
            rec?.targetId ||
            ''
          );

        const recordUserId =
          typeof resolveDiscordIdentity ===
            "function"
            ? resolveDiscordIdentity(
                rawRecordUserId
              )
            : rawRecordUserId;

        if (
          recordUserId !==
          wantedUserId
        ) {
          continue;
        }

        const recordGuildId =
          SC_GI_resolveRecordGuildId(
            rec
          );

        if (
          wantedGuildId &&
          recordGuildId &&
          recordGuildId !== wantedGuildId
        ) {
          continue;
        }

        if (
          wantedGuildId &&
          !recordGuildId
        ) {
          continue;
        }

        if (
          !newest ||
          Number(rec?.createdAtMs || 0) > Number(newest?.createdAtMs || 0)
        ) {
          newest = rec;
        }
      }

      return newest;
    }

    function SC_GI_toPublicControl(rec) {
      if (!rec) return null;

      return {
        targetId: String(rec.targetId || ''),
        guildId: rec.guildId ? String(rec.guildId) : null,
        messageId: rec.messageId ? String(rec.messageId) : null,
        channelId: rec.channelId ? String(rec.channelId) : null,
        active: rec.active !== false,
        paused: rec.active === false,
        area: rec.area || null,
        responsibleUserId: rec.responsibleUserId || null,
        responsibleType: rec.responsibleType || null,
        pausedAtMs: rec.pausedAtMs || null,
        createdAtMs: rec.createdAtMs || null,
        personalTicketChannelId: rec.personalTicketChannelId || null,
        note: rec.note || ''
      };
    }

    const SC_GI_CONTROL_API = {
      get ready() {
        return SC_GI_DATA_READY;
      },

      get authoritative() {
        return SC_GI_DATA_AUTHORITATIVE;
      },

      getControl(guildId, userId) {
        return SC_GI_toPublicControl(
          SC_GI_findCurrentControl(guildId, userId)
        );
      },

      hasControl(guildId, userId) {
        return !!SC_GI_findCurrentControl(guildId, userId);
      },

      async desligarFromForms({ guildId, userId, actor, reason } = {}) {
        if (!SC_GI_DATA_READY) {
          throw new Error("O Controle GI ainda está carregando os registros.");
        }
        const targetGuildId = String(guildId || "").trim();
        const targetUserId = String(userId || "").trim();
        if (!targetGuildId || !targetUserId || !actor?.id) {
          throw new Error("Dados insuficientes para desligar pelo FormsCreator.");
        }
        const record = SC_GI_findCurrentControl(targetGuildId, targetUserId);
        if (!record) return { ok: true, status: "no_control" };

        const guild = client.guilds.cache.get(targetGuildId) ||
          await client.guilds.fetch(targetGuildId);

        // A rotina existente valida permissões e hierarquia antes de remover cargos.
        await desligarRegistro(
          guild,
          actor,
          record.messageId,
          reason || "Desligamento pelo FormsCreator"
        );
        return { ok: true, status: "disabled" };
      },

      listControls(guildId = null) {
        const wantedGuildId = String(guildId || '');
        const byUser = new Map();

        for (const rec of SC_GI_STATE.registros.values()) {
          if (!rec?.targetId) continue;

          const recordGuildId =
            SC_GI_resolveRecordGuildId(
              rec
            );

          if (
            wantedGuildId &&
            recordGuildId !== wantedGuildId
          ) {
            continue;
          }

          const userId = String(rec.targetId);
          const previous = byUser.get(userId);

          if (
            !previous ||
            Number(rec?.createdAtMs || 0) >
              Number(previous?.createdAtMs || 0)
          ) {
            byUser.set(userId, rec);
          }
        }

        return [...byUser.values()]
          .map(SC_GI_toPublicControl)
          .filter(Boolean);
      },

      // =====================================================
      // PEDIR SET — GARANTIA DIRETA DO CONTROLE GI
      // =====================================================
      //
      // Permite que o pedirset.js garanta o Controle GI sem
      // depender exclusivamente do dashHub.
      //
      // É idempotente:
      //
      // - se já existir Controle GI, apenas devolve o existente;
      // - se não existir, cria um Controle GI pausado;
      // - nunca recria/destrói um Controle GI existente.
      // =====================================================

      async ensureFromPedirSet({
        guildId,
        userId,
        passaporte = null,
      } = {}) {
        const targetGuildId =
          String(
            guildId ||
            ""
          ).trim();

        const targetUserId =
          String(
            userId ||
            ""
          ).trim();

        if (
          !targetGuildId ||
          !targetUserId
        ) {
          throw new Error(
            "guildId/userId inválidos para criar Controle GI via Pedir Set."
          );
        }

        const guild =
          client.guilds.cache.get(
            targetGuildId
          ) ||
          await client.guilds
            .fetch(
              targetGuildId
            )
            .catch(
              () => null
            );

        if (!guild) {
          throw new Error(
            `Guilda ${targetGuildId} não encontrada para criar Controle GI.`
          );
        }

        // =================================================
        // JÁ EXISTE
        // =================================================

        const existing =
          SC_GI_findCurrentControl(
            guild.id,
            targetUserId
          );

        if (existing) {
          // O Forms já foi criado/reativado antes desta etapa.
          // Atualiza o controle existente para garantir que
          // o link do Forms apareça imediatamente.
          await refreshRegistroMessage(
            guild,
            client.user,
            existing.messageId,
            "Pedir Set: sincronizando Controle GI com FormsCreator",
            {
              log:
                false,
            }
          ).catch(() => {});

          return {
            ok:
              true,

            created:
              false,

            control:
              SC_GI_toPublicControl(
                existing
              ),
          };
        }

        // =================================================
        // DATA DE ENTRADA — HORÁRIO DE SÃO PAULO
        // =================================================

        const now =
          new Date();

        const parts =
          new Intl.DateTimeFormat(
            "pt-BR",
            {
              timeZone:
                "America/Sao_Paulo",

              day:
                "2-digit",

              month:
                "2-digit",

              year:
                "numeric",
            }
          ).formatToParts(
            now
          );

        const dd =
          parts.find(
            part =>
              part.type ===
              "day"
          )?.value;

        const mm =
          parts.find(
            part =>
              part.type ===
              "month"
          )?.value;

        const yyyy =
          parts.find(
            part =>
              part.type ===
              "year"
          )?.value;

        const dataStr =
          `${dd}/${mm}/${yyyy}`;

        // =================================================
        // CRIA PAUSADO, IGUAL AO FLUXO ANTIGO
        // =================================================

        await createRegistro(
          guild,
          client.user,
          dataStr,
          "A Definir",
          targetUserId,
          {
            initialActive:
              false,

            passaporte:
              passaporte
                ? String(
                    passaporte
                  )
                : null,

            // Fluxo automático do Pedir Set:
            // não faz buscas históricas pesadas antes de criar
            // o núcleo do Controle GI.
            fastCreate:
              true,
          }
        );

        const createdRecord =
          SC_GI_findCurrentControl(
            guild.id,
            targetUserId
          );

        if (!createdRecord) {
          throw new Error(
            `Controle GI de ${targetUserId} não apareceu no state após a criação.`
          );
        }

        return {
          ok:
            true,

          created:
            true,

          control:
            SC_GI_toPublicControl(
              createdRecord
            ),
        };
      }
    };

    globalThis.SC_GI_CONTROL_API = SC_GI_CONTROL_API;

    async function SC_GI_load() {
      try {
        // Migração: se não existe na pasta data, tenta ler da raiz
        let fileToRead = SC_GI_CFG.DATA_FILE;
        if (!fs.existsSync(fileToRead) && fs.existsSync('./sc_gi_registros.json')) {
          fileToRead = './sc_gi_registros.json';
          console.log('[SC_GI] Migrando dados da raiz para pasta /data...');
        }

        if (!fs.existsSync(fileToRead)) {
          SC_GI_DATA_READY = true;
          SC_GI_DATA_AUTHORITATIVE = false;
          return;
        }

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
r.responsibleManual  = !!r.responsibleManual;
r.responsibleSetBy   = r.responsibleSetBy || null;
r.responsibleUpdatedAtMs = typeof r.responsibleUpdatedAtMs === 'number' ? r.responsibleUpdatedAtMs : null;
r.warnNoRoleGI       = !!r.warnNoRoleGI;
r.responsibleHistory = Array.isArray(r.responsibleHistory) ? r.responsibleHistory : [];

// =====================================================
// MIGRAÇÃO DO HISTÓRICO DE RESPONSÁVEL
// =====================================================
//
// Registros antigos podiam possuir responsibleUserId atual,
// mas responsibleHistory vazio. Nesse caso o desligamento
// mostrava "—" mesmo existindo um responsável direto.
//
// Garante que o responsável atual também exista como a
// última etapa conhecida do histórico.
// =====================================================
if (r.responsibleUserId) {
  const lastResponsible =
    r.responsibleHistory.at(-1) ||
    null;

  if (
    String(lastResponsible?.userId || "") !==
      String(r.responsibleUserId) ||
    String(lastResponsible?.type || "") !==
      String(r.responsibleType || "")
  ) {
    r.responsibleHistory.push({
      atMs:
        Number(r.responsibleUpdatedAtMs || 0) ||
        Number(r.createdAtMs || 0) ||
        Number(r.joinDateMs || 0) ||
        Date.now(),

      userId:
        String(r.responsibleUserId),

      type:
        r.responsibleType ||
        null,

      setBy:
        r.responsibleSetBy ||
        r.registrarId ||
        client.user?.id ||
        null,

      manual:
        !!r.responsibleManual,

      source:
        "legacy_current_responsible_recovered"
    });
  }
}
          r.pausedAtMs         = (typeof r.pausedAtMs === 'number') ? r.pausedAtMs : null;
          r.totalPausedMs      = (typeof r.totalPausedMs === 'number') ? r.totalPausedMs : 0;
          r.roleSetAtMs        = (typeof r.roleSetAtMs === 'number') ? r.roleSetAtMs : null;
          r.messageId          = String(r.messageId);
r.lastCountdownWarningAt = r.lastCountdownWarningAt || null;
r.passaporte         = r.passaporte || null;
r.personalTicketChannelId = r.personalTicketChannelId || null;
r.lastControlVisualRefreshAtMs = Number(r.lastControlVisualRefreshAtMs || 0);

if (!r.guildId && r.channelId) {
  r.guildId =
    client.channels.cache.get(String(r.channelId))?.guildId ||
    null;
}

// ✅ MIGRAÇÃO/CORREÇÃO: registros pausados criados já com tempo acumulado errado.
// Caso o registro tenha nascido pausado, com pausedAtMs igual ao createdAtMs,
// e o totalPausedMs seja praticamente o tempo entre entrada e criação,
// zera o acumulado para o contador começar corretamente em 30 dias.
try {
  const nasceuPausado = r.active === false;
  const pausaComecouNaCriacao = r.pausedAtMs && r.createdAtMs && Math.abs(Number(r.pausedAtMs) - Number(r.createdAtMs)) <= 5000;
  const acumuladoDoNascimento = r.joinDateMs && r.createdAtMs && Math.abs(Number(r.totalPausedMs || 0) - Math.max(0, Number(r.createdAtMs) - Number(r.joinDateMs))) <= 120000;

  if (nasceuPausado && pausaComecouNaCriacao && acumuladoDoNascimento) {
    r.totalPausedMs = 0;
  }
} catch {}

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

        // =====================================================
        // SNAPSHOTS PERSISTENTES DE DESLIGAMENTO
        // =====================================================

        SC_GI_STATE.disconnectedSnapshots.clear();

        for (const item of (data.disconnectedSnapshots || [])) {
          const controlMessageId =
            String(
              item?.controlMessageId ||
              item?.snapshot?.messageId ||
              ""
            ).trim();

          const targetId =
            String(
              item?.snapshot?.targetId ||
              item?.targetId ||
              ""
            ).trim();

          if (
            !controlMessageId ||
            !targetId
          ) {
            continue;
          }

          SC_GI_STATE.disconnectedSnapshots.set(
            controlMessageId,
            {
              ...item,
              controlMessageId,

              snapshot: {
                ...(item.snapshot || {}),
                messageId:
                  String(
                    item?.snapshot?.messageId ||
                    controlMessageId
                  ),
                targetId,
              },

              roleIdsBefore:
                Array.isArray(
                  item?.roleIdsBefore
                )
                  ? item.roleIdsBefore.map(String)
                  : [],

              restored:
                item?.restored ===
                true,
            }
          );
        }

        // =====================================================
        // SNAPSHOTS PERSISTENTES DE DESLIGAMENTO
        // =====================================================

        SC_GI_STATE.disconnectedSnapshots.clear();

        for (const item of (data.disconnectedSnapshots || [])) {
          const controlMessageId =
            String(
              item?.controlMessageId ||
              item?.snapshot?.messageId ||
              ""
            ).trim();

          const targetId =
            String(
              item?.snapshot?.targetId ||
              item?.targetId ||
              ""
            ).trim();

          if (
            !controlMessageId ||
            !targetId
          ) {
            continue;
          }

          SC_GI_STATE.disconnectedSnapshots.set(
            controlMessageId,
            {
              ...item,
              controlMessageId,

              snapshot: {
                ...(item.snapshot || {}),
                messageId:
                  String(
                    item?.snapshot?.messageId ||
                    controlMessageId
                  ),
                targetId,
              },

              roleIdsBefore:
                Array.isArray(
                  item?.roleIdsBefore
                )
                  ? item.roleIdsBefore.map(String)
                  : [],

              restored:
                item?.restored ===
                true,
            }
          );
        }

        // 👑 OVERRIDES MANUAIS PERSISTENTES
        SC_GI_STATE.masterRoleOverridesByUser.clear();

        for (const item of (data.masterRoleOverrides || [])) {
          if (!item?.targetId) continue;

          const targetId =
            String(item.targetId);

          const roleMap =
            new Map();

          for (const role of (item.roles || [])) {
            const roleId =
              String(role?.roleId || "").trim();

            const state =
              String(role?.state || "").trim();

            if (
              !roleId ||
              !["present", "absent"].includes(state)
            ) {
              continue;
            }

            roleMap.set(
              roleId,
              state
            );
          }

          if (roleMap.size > 0) {
            SC_GI_STATE.masterRoleOverridesByUser.set(
              targetId,
              roleMap
            );
          }
        }

        console.log(`[SC_GI] Carregado ${SC_GI_STATE.registros.size} registro(s).`);

        // A partir daqui a memória do Controle GI já é uma fonte confiável.
        SC_GI_DATA_READY = true;
        SC_GI_DATA_AUTHORITATIVE = true;

        // Se leu do arquivo antigo, salva no novo imediatamente
        if (fileToRead !== SC_GI_CFG.DATA_FILE) {
          await SC_GI_saveNow();
        }
      } catch (e) {
        SC_GI_DATA_READY = false;
        SC_GI_DATA_AUTHORITATIVE = false;
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

          giWarnings: Array.from(
            SC_GI_STATE.giWarningsByUser.entries()
          ).map(([userId, v]) => ({
            userId,
            count: v.count || 0,
            lastAtMs: v.lastAtMs ?? null
          })),
          roleSnapshots: Array.from(
            SC_GI_STATE.roleSnapshots.entries()
          ).map(([userId, s]) => ({
            userId,
            roleIds: Array.isArray(s.roleIds)
              ? s.roleIds
              : [],
            restoreAtMs: s.restoreAtMs ?? 0,
            createdAtMs: s.createdAtMs ?? 0,
            recordMessageId: s.recordMessageId ?? null
          })),

          disconnectedSnapshots: Array.from(
            SC_GI_STATE.disconnectedSnapshots.entries()
          ).map(([controlMessageId, snapshotData]) => ({
            ...snapshotData,
            controlMessageId,
            roleIdsBefore: Array.isArray(snapshotData?.roleIdsBefore)
              ? snapshotData.roleIdsBefore.map(String)
              : [],
          })),

          // 👑 Alterações manuais feitas por Você/Owner.
          masterRoleOverrides: Array.from(
            SC_GI_STATE.masterRoleOverridesByUser.entries()
          ).map(([targetId, roleMap]) => ({
            targetId,
            roles: Array.from(
              roleMap.entries()
            ).map(([roleId, state]) => ({
              roleId,
              state
            }))
          }))
        };
        await fsp.writeFile(SC_GI_CFG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        SC_GI_DATA_READY = true;
        SC_GI_DATA_AUTHORITATIVE = true;
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
    const HIERARCHY_ORDER = [
      "1262262852949905408", // owner
      "1352408327983861844", // resp creators
      "1262262852949905409", // resp influ
      "1352407252216184833", // resp lider
      "1388976314253312100", // coord
      "1388975939161161728", // gestor
      "1388976155830255697", // manager
      "1388976094920704141", // social
      "1392678638176043029", // equipe manager
      "1387253972661964840", // equipe social
      "1352429001188180039"  // equipe creators
    ];

    function getManagementRank(member) {
      if (!member) return Infinity;
      for (let i = 0; i < HIERARCHY_ORDER.length; i++) {
        if (member.roles.cache.has(HIERARCHY_ORDER[i])) return i;
      }
      return Infinity;
    }

    async function findBestResponsible(guild, targetId = null) {
      try {
        const targetMember = targetId ? await guild.members.fetch(targetId).catch(() => null) : null;
        const targetRank = getManagementRank(targetMember);

        const eligibleRoles = [
  SC_GI_CFG.ROLE_RESP_CREATORS,
  SC_GI_CFG.ROLE_RESP_INFLU,
  SC_GI_CFG.ROLE_RESP_LIDER,
  '1414651836861907006'
];
        const candidates = new Map(); // userId -> { member, count }

        for (const roleId of eligibleRoles) {
          const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
          if (!role) continue;
          for (const [uid, member] of role.members) {
            // Ignora Owner e Resp Creators da seleção automática
            if (uid === SC_GI_CFG.ROLE_OWNER || member.roles.cache.has(SC_GI_CFG.ROLE_RESP_CREATORS)) continue;
            
            // 🚫 Não pode ser responsável de si mesmo
            if (uid === targetId) continue;

            // 🔒 HIERARQUIA RÍGIDA: O responsável deve ter rank maior (índice menor na lista) que o membro
            if (getManagementRank(member) >= targetRank) continue;

            if (!candidates.has(uid)) candidates.set(uid, { member, count: 0 });
          }
        }

        if (candidates.size === 0) return null;

        // Conta quantos membros cada um já tem
        for (const rec of SC_GI_STATE.registros.values()) {
          if (rec.responsibleUserId && candidates.has(rec.responsibleUserId)) {
            candidates.get(rec.responsibleUserId).count++;
          }
        }

        // Ordena por menor contagem e depois por hierarquia do cargo (maior cargo primeiro)
        const sorted = Array.from(candidates.values()).sort((a, b) => {
          if (a.count !== b.count) return a.count - b.count;
          return b.member.roles.highest.position - a.member.roles.highest.position;
        });

        const best = sorted[0];
        return {
          userId: best.member.id,
          type: getHighestTypeFromMember(best.member)
        };
      } catch (e) {
        console.error("[SC_GI] Erro ao buscar melhor responsável:", e);
        return null;
      }
    }

    const nowMs = () => Date.now();
    const pad2 = n => (n < 10 ? '0' + n : '' + n);
  function fromDDMMYYYY_toMs(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str).trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
  const utcMs = Date.UTC(y, mo, d, 0, 0, 0);

  // ✅ Converte 00:00 do horário local configurado para UTC corretamente.
  // Ex.: SP -03 => 00:00 local = 03:00 UTC.
  return utcMs - (SC_GI_CFG.TZ_OFFSET_MIN * 60 * 1000);
}
    function msToDDMMYYYY(ms) {
      const dt = new Date(ms + (SC_GI_CFG.TZ_OFFSET_MIN * 60 * 1000));
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
    const AUTO_DESLIGAR_PAUSA_MS = SC_GI_CFG.AUTO_DESLIGAR_PAUSA_DIAS * 24 * 60 * 60 * 1000;
// =====================================================
// AUTO-DESLIGAMENTO INDIVIDUAL POR REGISTRO
// =====================================================
//
// O tick geral continua existindo como FAILSAFE.
//
// Este mapa adiciona um relógio individual para cada GI
// pausado, evitando depender exclusivamente da varredura
// global de 60 segundos.
//
const SC_GI_AUTO_DISABLE_TIMERS =
  new Map();

function clearGiAutoDisableTimer(
  messageId
) {
  const key =
    String(
      messageId ||
      ""
    );

  const timer =
    SC_GI_AUTO_DISABLE_TIMERS.get(
      key
    );

  if (timer) {
    clearTimeout(
      timer
    );

    SC_GI_AUTO_DISABLE_TIMERS.delete(
      key
    );
  }
}

function scheduleGiAutoDisableTimer(
  rec
) {
  if (
    !rec?.messageId
  ) {
    return;
  }

  clearGiAutoDisableTimer(
    rec.messageId
  );

  if (
    rec.active !== false
  ) {
    return;
  }

  const remainingMs =
    getPauseCountdownMs(
      rec,
      nowMs()
    );

  // setTimeout do Node não deve receber intervalos enormes.
  // Se faltar mais que aproximadamente 24 dias,
  // agenda uma checagem intermediária e depois reagenda.
  const MAX_SAFE_TIMER_MS =
    24 *
    24 *
    60 *
    60 *
    1000;

  const delay =
    Math.max(
      1000,
      Math.min(
        remainingMs + 1500,
        MAX_SAFE_TIMER_MS
      )
    );

  const timer =
    setTimeout(
      async () => {
        SC_GI_AUTO_DISABLE_TIMERS.delete(
          String(
            rec.messageId
          )
        );

        try {
          const liveRecord =
            SC_GI_STATE.registros.get(
              String(
                rec.messageId
              )
            );

          if (
            !liveRecord ||
            liveRecord.active !==
              false
          ) {
            return;
          }

          const remainingNow =
            getPauseCountdownMs(
              liveRecord,
              nowMs()
            );

          // Ainda não venceu.
          // Reagenda o restante.
          if (
            remainingNow >
            0
          ) {
            scheduleGiAutoDisableTimer(
              liveRecord
            );

            return;
          }

          const channelGuild =
            client.channels.cache.get(
              String(
                liveRecord.channelId ||
                ""
              )
            )?.guild ||
            null;

          const guild =
            channelGuild ||
            client.guilds.cache.get(
              String(
                liveRecord.guildId ||
                ""
              )
            );

          if (!guild) {
            console.warn(
              `[SC_GI] Auto-desligamento de ${liveRecord.targetId}: guild não encontrada. Tentarei novamente.`
            );

            scheduleGiAutoDisableTimer(
              liveRecord
            );

            return;
          }

          if (
            !liveRecord.guildId
          ) {
            liveRecord.guildId =
              guild.id;

            SC_GI_scheduleSave();
          }

          await autoDesligarPausadosVencidos(
            guild,
            "timer_individual"
          );

          // Verificação final.
          const stillExists =
            SC_GI_STATE.registros.has(
              String(
                liveRecord.messageId
              )
            );

          if (
            stillExists
          ) {
            const stillLive =
              SC_GI_STATE.registros.get(
                String(
                  liveRecord.messageId
                )
              );

            if (
              stillLive?.active ===
              false &&
              getPauseCountdownMs(
                stillLive,
                nowMs()
              ) <= 0
            ) {
              console.warn(
                `[SC_GI] Registro ${stillLive.messageId} venceu, mas continua ativo no storage. Reagendando failsafe.`
              );

              setTimeout(
                () => {
                  scheduleGiAutoDisableTimer(
                    stillLive
                  );
                },
                30_000
              ).unref?.();
            }
          }
        } catch (error) {
          console.error(
            "[SC_GI] Falha no timer individual de auto-desligamento:",
            error
          );
        }
      },
      delay
    );

  timer.unref?.();

  SC_GI_AUTO_DISABLE_TIMERS.set(
    String(
      rec.messageId
    ),
    timer
  );
}
function formatDurationFull(ms) {
  ms = Math.max(0, Number(ms || 0));

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
}

    function getPausedTotalMs(rec, n = nowMs()) {
  const saved = Number(rec?.totalPausedMs || 0);
  const current = rec?.pausedAtMs ? Math.max(0, n - rec.pausedAtMs) : 0;
  return saved + current;
}

function getActiveTotalMs(rec, n = nowMs()) {
  const raw = Math.max(0, n - Number(rec?.joinDateMs || n));
  return Math.max(0, raw - getPausedTotalMs(rec, n));
}

function getCurrentPauseMs(rec, n = nowMs()) {
  const pausedAtMs = Number(rec?.pausedAtMs);

  if (
    rec?.active !== false ||
    !Number.isFinite(pausedAtMs) ||
    pausedAtMs <= 0
  ) {
    return 0;
  }

  return Math.max(0, n - pausedAtMs);
}

function getPauseCountdownMs(rec, n = nowMs()) {
  return Math.max(0, AUTO_DESLIGAR_PAUSA_MS - getCurrentPauseMs(rec, n));
}

    function pauseCountdownText(rec, n = nowMs()) {
  if (rec?.active) return '—';

  const remainingMs = getPauseCountdownMs(rec, n);

  if (remainingMs <= 0) {
    return '**agora**';
  }

  const deadlineUnix = Math.floor((n + remainingMs) / 1000);

  return `<t:${deadlineUnix}:R>`;
}

function activeTimeText(rec, n = nowMs()) {
  return formatDurationFull(getActiveTotalMs(rec, n));
}
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
      if (member.roles?.cache?.has?.(SC_GI_CFG.ROLE_OWNER)) return true;
      return SC_GI_CFG.AUTH_ROLE_IDS.some(id => member.roles?.cache?.has?.(id));
    }

    function hasAreaEditAuth(member) {
      if (!member) return false;

      // Você/Macedo, Owner e quem já possui autorização geral continuam liberados.
      if (hasAuth(member)) return true;

      // Coord. Creators pode editar Área/cargo, mas continua preso à hierarquia.
      return member.roles?.cache?.has?.(SC_GI_CFG.ROLE_COORD_CREATORS) || false;
    }

    function isHierarchyBypassMember(member) {
      if (!member) return false;

      // 👑 Bypass absoluto somente para os usuários já configurados
      // e para quem possui o cargo Owner.
      if (SC_GI_CFG.AUTH_USER_IDS.includes(String(member.id || ''))) return true;
      if (member.roles?.cache?.has?.(SC_GI_CFG.ROLE_OWNER)) return true;

      return false;
    }

    // =====================================================
    // 👑 MASTER OVERRIDE
    // =====================================================

    function isMasterOverrideUser(userId) {
      return SC_GI_CFG.AUTH_USER_IDS.includes(
        String(userId || "")
      );
    }

    function getMasterRoleOverrideMap(targetId, create = false) {
      const key =
        String(targetId || "").trim();

      if (!key) return null;

      let roleMap =
        SC_GI_STATE.masterRoleOverridesByUser.get(
          key
        );

      if (
        !roleMap &&
        create
      ) {
        roleMap =
          new Map();

        SC_GI_STATE.masterRoleOverridesByUser.set(
          key,
          roleMap
        );
      }

      return roleMap || null;
    }

    function setMasterRoleOverride(
      targetId,
      roleId,
      state
    ) {
      const normalizedTargetId =
        String(targetId || "").trim();

      const normalizedRoleId =
        String(roleId || "").trim();

      if (
        !normalizedTargetId ||
        !normalizedRoleId ||
        !["present", "absent"].includes(state)
      ) {
        return false;
      }

      const roleMap =
        getMasterRoleOverrideMap(
          normalizedTargetId,
          true
        );

      roleMap.set(
        normalizedRoleId,
        state
      );

      SC_GI_scheduleSave();

      return true;
    }

    function getMasterRoleOverride(
      targetId,
      roleId
    ) {
      const roleMap =
        getMasterRoleOverrideMap(
          targetId,
          false
        );

      if (!roleMap) {
        return null;
      }

      return (
        roleMap.get(
          String(roleId || "")
        ) ||
        null
      );
    }

    async function findRecentManualRoleUpdate(
      guild,
      targetId
    ) {
      try {
        const logs =
          await guild.fetchAuditLogs({
            type:
              AuditLogEvent.MemberRoleUpdate,
            limit: 8
          });

        const now =
          Date.now();

        for (
          const entry
          of logs.entries.values()
        ) {
          if (
            String(entry.target?.id || "") !==
            String(targetId)
          ) {
            continue;
          }

          if (
            now -
              Number(
                entry.createdTimestamp || 0
              ) >
            10000
          ) {
            continue;
          }

          const executorId =
            String(
              entry.executor?.id || ""
            );

          if (
            !isMasterOverrideUser(
              executorId
            )
          ) {
            continue;
          }

          return {
            executorId,
            entry
          };
        }
      } catch (error) {
        console.warn(
          "[SC_GI] Não foi possível consultar Audit Log para Master Override:",
          error?.message || error
        );
      }

      return null;
    }

    function extractAuditRoleIds(
      entry,
      changeKey
    ) {
      const ids =
        [];

      for (
        const change
        of (entry?.changes || [])
      ) {
        if (
          change?.key !== changeKey
        ) {
          continue;
        }

        const value =
          Array.isArray(change.new)
            ? change.new
            : [];

        for (
          const role
          of value
        ) {
          if (role?.id) {
            ids.push(
              String(role.id)
            );
          }
        }
      }

      return ids;
    }

    // =====================================================
    // AUTOMAÇÃO INTELIGENTE DE ÁREA / FUNÇÃO
    // =====================================================

    const AREA_ROLE_IDS = Object.freeze({
      MKT_CREATORS: "1282119104576098314",

      TICKETS: "1372716303122567239",

      COORD_CREATORS: "1388976314253312100",
      COORDENACAO: "1352385500614234134",
      GESTOR_CREATORS: "1388975939161161728",
      MANAGER_CREATORS: "1388976155830255697",
      SOCIAL_MEDIAS: "1388976094920704141",
      EQUIPE_MANAGER: "1392678638176043029",
      EQUIPE_SOCIAL_MEDIAS: "1387253972661964840",
      CREATOR: "1352939011253076000",
      EQUIPE_CREATOR: "1352429001188180039",
      SENIOR_CREATORS: "1352493359897378941",
      RESPONSAVEIS: "1414651836861907006",
      RESP_LIDER: "1352407252216184833",
      RESP_INFLU: "1262262852949905409",
      RESP_CREATORS: "1352408327983861844",
      SANTA_CREATORS: "1352275728476930099",
      GESTAOINFLUENCER: "1371733765243670538"
    });

    const AREA_PROFILES = Object.freeze({
      COORD_CREATORS: Object.freeze({
        canonicalName: "Coord. Creators",
        primaryRoleId: AREA_ROLE_IDS.COORD_CREATORS,
        aliases: Object.freeze([
          "coord creators",
          "coord creator",
          "coord",
          "coord.",
          "coordenador creators",
          "coordenacao creators"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.COORD_CREATORS,
          AREA_ROLE_IDS.MKT_CREATORS,
          AREA_ROLE_IDS.COORDENACAO,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Coord.",
        skipRoleTransition: false,
        skipNickname: false
      }),

      GESTOR_CREATORS: Object.freeze({
        canonicalName: "Gestor. Creators",
        primaryRoleId: AREA_ROLE_IDS.GESTOR_CREATORS,
        aliases: Object.freeze([
          "gestor",
          "gestor creator",
          "gestor creators",
          "gestor.",
          "gestor creators."
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.MKT_CREATORS,
          AREA_ROLE_IDS.GESTOR_CREATORS,
          AREA_ROLE_IDS.COORDENACAO,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Gestor.",
        skipRoleTransition: false,
        skipNickname: false
      }),

      MANAGER_CREATORS: Object.freeze({
        canonicalName: "Manager Creators",
        primaryRoleId: AREA_ROLE_IDS.MANAGER_CREATORS,
        aliases: Object.freeze([
          "manager",
          "manager creator",
          "manager creators",
          "manager.",
          "manager creators."
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.MANAGER_CREATORS,
          AREA_ROLE_IDS.COORDENACAO,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Manager.",
        skipRoleTransition: false,
        skipNickname: false
      }),

      SOCIAL_MEDIAS: Object.freeze({
        canonicalName: "Social Medias",
        primaryRoleId: AREA_ROLE_IDS.SOCIAL_MEDIAS,
        aliases: Object.freeze([
          "social",
          "social medias",
          "social media",
          "social midias",
          "social mídia",
          "social m",
          "social. m",
          "social.m"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.SOCIAL_MEDIAS,
          AREA_ROLE_IDS.COORDENACAO,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Social.M",
        skipRoleTransition: false,
        skipNickname: false
      }),

      EQUIPE_MANAGER: Object.freeze({
        canonicalName: "Equipe Manager",
        primaryRoleId: AREA_ROLE_IDS.EQUIPE_MANAGER,
        aliases: Object.freeze([
          "equipe manager",
          "equipe manager creator",
          "equipe manager creators",
          "eqp manager",
          "eqp manager creator",
          "eqp.m",
          "equp manager"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.EQUIPE_MANAGER,
          AREA_ROLE_IDS.CREATOR,
          AREA_ROLE_IDS.EQUIPE_CREATOR,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "EQP.M",
        skipRoleTransition: false,
        skipNickname: false
      }),

      EQUIPE_SOCIAL_MEDIAS: Object.freeze({
        canonicalName: "Equipe Social Medias",
        primaryRoleId: AREA_ROLE_IDS.EQUIPE_SOCIAL_MEDIAS,
        aliases: Object.freeze([
          "equipe social medias",
          "equipe social media",
          "equipe social",
          "equipe sociais medias",
          "equipe social midias",
          "eqp social medias",
          "eqp social",
          "eqp social midias",
          "eqps",
          "eqp.s"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.EQUIPE_SOCIAL_MEDIAS,
          AREA_ROLE_IDS.CREATOR,
          AREA_ROLE_IDS.EQUIPE_CREATOR,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "EQP.S",
        skipRoleTransition: false,
        skipNickname: false
      }),

      EQUIPE_CREATOR: Object.freeze({
        canonicalName: "Equipe Creator",
        primaryRoleId: AREA_ROLE_IDS.EQUIPE_CREATOR,
        aliases: Object.freeze([
          "equipe creator",
          "equipe creators",
          "eqp creator",
          "eqp creators",
          "equipe",
          "eqp.c"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.CREATOR,
          AREA_ROLE_IDS.EQUIPE_CREATOR,
          AREA_ROLE_IDS.SANTA_CREATORS,
          SC_GI_CFG.ROLE_CIDADAO
        ]),
        nicknamePrefix: "EQP.C",
        skipRoleTransition: false,
        skipNickname: false
      }),

      A_DEFINIR: Object.freeze({
        canonicalName: "A Definir",
        primaryRoleId: null,
        aliases: Object.freeze([
          "a definir",
          "definir",
          "indefinido",
          "sem area",
          "sem área"
        ]),
        requiredRoleIds: Object.freeze([]),
        nicknamePrefix: null,
        skipRoleTransition: true,
        skipNickname: true
      }),

      RESP_LIDER: Object.freeze({
        canonicalName: "Resp Lider",
        primaryRoleId: AREA_ROLE_IDS.RESP_LIDER,
        aliases: Object.freeze([
          "resp lider",
          "resp líder",
          "responsavel lider",
          "responsável lider",
          "responsável líder",
          "resp. lider"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.RESP_LIDER,
          AREA_ROLE_IDS.RESPONSAVEIS,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Resp Lider",
        skipRoleTransition: false,
        skipNickname: false
      }),

      RESP_INFLU: Object.freeze({
        canonicalName: "Resp Influ",
        primaryRoleId: AREA_ROLE_IDS.RESP_INFLU,
        aliases: Object.freeze([
          "resp influ",
          "responsavel influ",
          "responsável influ",
          "resp influencer",
          "resp. influ"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.RESP_INFLU,
          AREA_ROLE_IDS.RESPONSAVEIS,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: "Resp Influ",
        skipRoleTransition: false,
        skipNickname: false
      }),

      RESP_CREATORS: Object.freeze({
        canonicalName: "Resp Creators",
        primaryRoleId: AREA_ROLE_IDS.RESP_CREATORS,
        aliases: Object.freeze([
          "resp creators",
          "resp creator",
          "responsavel creators",
          "responsável creators",
          "responsavel creator",
          "resp. creators"
        ]),
        requiredRoleIds: Object.freeze([
          AREA_ROLE_IDS.RESP_CREATORS,
          AREA_ROLE_IDS.RESPONSAVEIS,
          AREA_ROLE_IDS.SENIOR_CREATORS,
          AREA_ROLE_IDS.SANTA_CREATORS
        ]),
        nicknamePrefix: null,
        skipRoleTransition: false,
        skipNickname: false
      })
    });

    const AREA_MANAGED_REMOVABLE_ROLE_IDS = new Set([
      AREA_ROLE_IDS.COORD_CREATORS,
      AREA_ROLE_IDS.COORDENACAO,
      AREA_ROLE_IDS.GESTOR_CREATORS,
      AREA_ROLE_IDS.MANAGER_CREATORS,
      AREA_ROLE_IDS.SOCIAL_MEDIAS,
      AREA_ROLE_IDS.EQUIPE_MANAGER,
      AREA_ROLE_IDS.EQUIPE_SOCIAL_MEDIAS,
      AREA_ROLE_IDS.CREATOR,
      AREA_ROLE_IDS.EQUIPE_CREATOR,
      AREA_ROLE_IDS.RESPONSAVEIS,
      AREA_ROLE_IDS.RESP_LIDER,
      AREA_ROLE_IDS.RESP_INFLU,
      AREA_ROLE_IDS.RESP_CREATORS
    ]);

    // =====================================================
    // TRANSIÇÃO INTERNA DE ÁREA DO CONTROLE GI
    // =====================================================
    //
    // Usamos um marcador separado para o Forms não disparar
    // uma segunda sincronização durante o pacote automático.
    //
    // Também ativa o bypass curto já existente para impedir
    // que o roleProtect interprete a própria troca do GI como
    // uma remoção externa de cargo protegido.
    // =====================================================

    function markGiAreaTransitionInProgress(
      userId,
      ms = 12000
    ) {
      if (
        !(
          globalThis
            .__SC_GI_AREA_TRANSITION__
          instanceof Map
        )
      ) {
        globalThis
          .__SC_GI_AREA_TRANSITION__ =
          new Map();
      }

      globalThis
        .__SC_GI_AREA_TRANSITION__
        .set(
          String(userId),
          Date.now() + ms
        );

      setRoleBypass(
        userId,
        ms
      );
    }

    // =====================================================
    // CARGOS PROIBIDOS NOS RESPONSÁVEIS DE TOPO
    // =====================================================

    const TOP_RESPONSIBLE_FORBIDDEN_ROLE_IDS =
      new Set([
        AREA_ROLE_IDS.MKT_CREATORS,
        AREA_ROLE_IDS.TICKETS,
      ]);

    function isTopResponsibleAreaProfile(
      areaProfile
    ) {
      return (
        areaProfile ===
          AREA_PROFILES.RESP_LIDER ||
        areaProfile ===
          AREA_PROFILES.RESP_INFLU ||
        areaProfile ===
          AREA_PROFILES.RESP_CREATORS
      );
    }
    function normalizeAreaText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const AREA_ALIAS_INDEX = (() => {
      const index = new Map();

      for (const profile of Object.values(AREA_PROFILES)) {
        const candidates = [
          profile.canonicalName,
          ...profile.aliases
        ];

        for (const candidate of candidates) {
          const normalized =
            normalizeAreaText(candidate);

          if (!normalized) {
            continue;
          }

          const existing =
            index.get(normalized);

          if (
            existing &&
            existing.canonicalName !== profile.canonicalName
          ) {
            console.warn(
              `[SC_GI] Alias de área ambíguo ignorado: "${candidate}" ` +
              `(${existing.canonicalName} x ${profile.canonicalName})`
            );
            index.delete(normalized);
            continue;
          }

          index.set(
            normalized,
            profile
          );
        }
      }

      return index;
    })();

    function resolveAreaProfile(value) {
      const normalized =
        normalizeAreaText(value);

      if (!normalized) {
        return null;
      }

      return (
        AREA_ALIAS_INDEX.get(normalized) ||
        null
      );
    }

    function getAreaRoleProfile(value) {
      return resolveAreaProfile(value);
    }

    function getAreaNicknameProfile(value) {
      return resolveAreaProfile(value);
    }

    function buildDesiredRoleSet(profile) {
      return new Set(
        Array.isArray(profile?.requiredRoleIds)
          ? profile.requiredRoleIds
          : []
      );
    }

    function hierarchyLabelFromRank(rank) {
      if (rank === 0) return "Owner";
      if (rank === 1) return "Resp Creators";
      if (rank === 2) return "Resp Influ";
      if (rank === 3) return "Resp Lider";
      if (rank === 4) return "Coord. Creators";
      if (rank === 5) return "Gestor";
      if (rank === 6) return "Manager Creators";
      if (rank === 7) return "Social Medias";
      if (rank === 8) return "Equipe Manager";
      if (rank === 9) return "Equipe Social Medias";
      if (rank === 10) return "Equipe Creator";
      return "Sem cargo institucional";
    }

    async function assertCanSetArea(
      guild,
      actorUser,
      targetUserId,
      areaProfile
    ) {
      const actorId =
        String(actorUser?.id || "").trim();

      if (!actorId) {
        throw new Error(
          "Não foi possível identificar quem tentou alterar a área."
        );
      }

      const actorMember =
        await guild.members
          .fetch(actorId)
          .catch(() => null);

      if (!actorMember) {
        throw new Error(
          "Não consegui localizar o executor no servidor para validar a hierarquia."
        );
      }

      if (!hasAreaEditAuth(actorMember)) {
        throw new Error(
          "Você não tem permissão para alterar este Controle GI."
        );
      }

      // 👑 Você/Macedo e Owner ignoram a hierarquia.
      if (
        isHierarchyBypassMember(
          actorMember
        )
      ) {
        return true;
      }

      // A Definir não representa promoção hierárquica.
      if (
        !areaProfile?.primaryRoleId
      ) {
        return true;
      }

      if (
        typeof getOfficialSantaCreatorsHierarchyRank !== "function" ||
        typeof getOfficialSantaCreatorsHierarchyRankForRoleId !== "function"
      ) {
        throw new Error(
          "A hierarquia institucional não está disponível. " +
          "A alteração foi bloqueada por segurança."
        );
      }

      const actorRank =
        getOfficialSantaCreatorsHierarchyRank(
          actorMember
        );

      const targetAreaRank =
        getOfficialSantaCreatorsHierarchyRankForRoleId(
          areaProfile.primaryRoleId
        );

      if (
        !Number.isFinite(actorRank)
      ) {
        throw new Error(
          "Alteração bloqueada pela hierarquia da SantaCreators. " +
          "Seu cargo não pertence à hierarquia institucional autorizada."
        );
      }

      if (
        !Number.isFinite(targetAreaRank)
      ) {
        throw new Error(
          `A Área "${areaProfile.canonicalName}" não possui posição ` +
          "institucional válida configurada."
        );
      }

      if (
        actorRank >= targetAreaRank
      ) {
        await logMsg(
          guild,
          "Alteração de Área Bloqueada pela Hierarquia",
          [
            `🛡️ **Executor:** <@${actorId}>`,
            `👤 **Membro alvo:** <@${targetUserId}>`,
            `🎚️ **Função do executor:** \`${hierarchyLabelFromRank(actorRank)}\``,
            `🎯 **Área solicitada:** \`${areaProfile.canonicalName}\``,
            `🎚️ **Posição da área:** \`${hierarchyLabelFromRank(targetAreaRank)}\``,
            "",
            "❌ **Resultado:** bloqueado porque o executor não está acima da função solicitada."
          ].join("\n")
        );

        throw new Error(
          `Alteração bloqueada pela hierarquia da SantaCreators. ` +
          `Sua função (${hierarchyLabelFromRank(actorRank)}) não possui ` +
          `autoridade para definir ${areaProfile.canonicalName}.`
        );
      }

      return true;
    }

    const KNOWN_INSTITUTIONAL_NICKNAME_PREFIXES = new Set([
      "coord",
      "coord creators",
      "gestor",
      "gestor creators",
      "manager",
      "manager creators",
      "social m",
      "social medias",
      "equipe",
      "equipe creator",
      "equipe creators",
      "eqp c",
      "eqp m",
      "eqp s",
      "eqps",
      "equipe manager",
      "equipe social medias",
      "resp lider",
      "resp influ"
    ]);

    function extractNicknameIdentity(member) {
      const current =
        String(
          member?.nickname ||
          member?.user?.globalName ||
          member?.user?.username ||
          ""
        ).trim();

      const parts =
        current
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean);

      if (parts.length === 0) {
        return {
          current,
          name: member?.user?.globalName ||
                member?.user?.username ||
                "Membro",
          idText: null
        };
      }

      if (parts.length === 1) {
        return {
          current,
          name: parts[0],
          idText: null
        };
      }

      const firstNormalized =
        normalizeAreaText(
          parts[0]
        );

      if (
        KNOWN_INSTITUTIONAL_NICKNAME_PREFIXES.has(
          firstNormalized
        )
      ) {
        return {
          current,
          name:
            parts[1] ||
            member?.user?.globalName ||
            member?.user?.username ||
            "Membro",
          idText:
            parts.length >= 3
              ? parts.slice(2).join(" | ")
              : null
        };
      }

      return {
        current,
        name: parts[0],
        idText:
          parts.length >= 2
            ? parts.slice(1).join(" | ")
            : null
      };
    }

    function buildNicknameForArea(
      member,
      areaProfile
    ) {
      if (
        !member ||
        areaProfile?.skipNickname
      ) {
        return member?.nickname || null;
      }

      const identity =
        extractNicknameIdentity(
          member
        );

      const pieces = [];

      if (
        areaProfile.nicknamePrefix
      ) {
        pieces.push(
          areaProfile.nicknamePrefix
        );
      }

      pieces.push(
        identity.name
      );

      if (
        identity.idText
      ) {
        pieces.push(
          identity.idText
        );
      }

      return pieces.join(" | ");
    }

    async function applyAreaRoleTransition(
      guild,
      rec,
      areaProfile
    ) {
      const member =
        await guild.members
          .fetch(rec.targetId)
          .catch(() => null);

      if (!member) {
        throw new Error(
          "Não consegui localizar o membro alvo no servidor."
        );
      }

      const result = {
        addedRoleIds: [],
        removedRoleIds: [],
        nicknameBefore:
          member.nickname ||
          member.user?.globalName ||
          member.user?.username ||
          "",
        nicknameAfter:
          member.nickname ||
          member.user?.globalName ||
          member.user?.username ||
          "",
        nicknameUpdated: false,
        roleTransitionSkipped: Boolean(
          areaProfile.skipRoleTransition
        )
      };

      if (
        areaProfile.skipRoleTransition
      ) {
        if (
          !areaProfile.skipNickname
        ) {
          const wantedNickname =
            buildNicknameForArea(
              member,
              areaProfile
            );

          if (
            wantedNickname &&
            wantedNickname !== member.nickname
          ) {
            await member.setNickname(
              wantedNickname,
              `Controle GI: área alterada para ${areaProfile.canonicalName}`
            );

            result.nicknameAfter =
              wantedNickname;

            result.nicknameUpdated =
              true;
          }
        }

        return result;
      }

      const desiredRoleIds =
        buildDesiredRoleSet(
          areaProfile
        );
      const topResponsibleProfile =
        isTopResponsibleAreaProfile(
          areaProfile
        );

      if (
        topResponsibleProfile
      ) {
        for (
          const forbiddenRoleId
          of TOP_RESPONSIBLE_FORBIDDEN_ROLE_IDS
        ) {
          desiredRoleIds.delete(
            forbiddenRoleId
          );
        }
      }
      // =====================================================
      // 👑 RESPEITA ALTERAÇÕES MANUAIS DE VOCÊ / OWNER
      // =====================================================

      const masterOverrides =
        getMasterRoleOverrideMap(
          rec.targetId,
          false
        );

      if (masterOverrides) {
        for (
          const [roleId, overrideState]
          of masterOverrides.entries()
        ) {
          const belongsToCreatorTransition =
            AREA_MANAGED_REMOVABLE_ROLE_IDS.has(roleId) ||
            areaProfile.requiredRoleIds.includes(roleId);

          if (
            areaProfile === AREA_PROFILES.EQUIPE_CREATOR &&
            belongsToCreatorTransition
          ) {
            continue;
          }

          // =================================================
          // REGRA ABSOLUTA DOS RESPONSÁVEIS DE TOPO
          // =================================================
          //
          // Mesmo um Master Override antigo NÃO pode
          // recolocar MKT Creators ou Tickets quando
          // a pessoa estiver em:
          //
          // - Resp Líder
          // - Resp Influ
          // - Resp Creators
          //
          // =================================================

          if (
            topResponsibleProfile &&
            TOP_RESPONSIBLE_FORBIDDEN_ROLE_IDS.has(
              roleId
            )
          ) {
            desiredRoleIds.delete(
              roleId
            );

            continue;
          }

          if (
            overrideState === "present"
          ) {
            desiredRoleIds.add(
              roleId
            );
          }

          if (
            overrideState === "absent"
          ) {
            desiredRoleIds.delete(
              roleId
            );
          }
        }
      }

      const currentRoleIds =
        new Set(
          member.roles.cache.keys()
        );

      const removableRoleIds =
        new Set([
          ...AREA_MANAGED_REMOVABLE_ROLE_IDS,

          ...(
            topResponsibleProfile
              ? TOP_RESPONSIBLE_FORBIDDEN_ROLE_IDS
              : []
          ),
        ]);

      const removeRoleIds =
        [...removableRoleIds]
          .filter(
            (roleId) =>
              currentRoleIds.has(
                roleId
              ) &&
              !desiredRoleIds.has(
                roleId
              )
          );

      const addRoleIds =
        [...desiredRoleIds]
          .filter(
            (roleId) =>
              !currentRoleIds.has(roleId)
          );

      const nicknameBefore =
        member.nickname;

      const wantedNickname =
        buildNicknameForArea(
          member,
          areaProfile
        );

      // =====================================================
      // PRÉ-VALIDAÇÃO DE PERMISSÕES / HIERARQUIA DO DISCORD
      // =====================================================
      //
      // Antes de remover/adicionar qualquer cargo, confirma que
      // o bot realmente consegue gerenciar TODOS os cargos que
      // fazem parte da transição.
      //
      // Isso evita:
      // - remover alguns cargos e falhar no meio;
      // - "Missing Permissions" sem dizer qual cargo bloqueou;
      // - rollback desnecessário;
      // - deixar a Área visual diferente dos cargos reais.
      // =====================================================

      const botMember =
        guild.members.me;

      const roleIdsToChange =
        [
          ...new Set([
            ...removeRoleIds,
            ...addRoleIds
          ])
        ];

      if (
        roleIdsToChange.length > 0 &&
        !botMember?.permissions?.has(
          PermissionFlagsBits.ManageRoles
        )
      ) {
        throw new Error(
          "O bot não possui a permissão Gerenciar Cargos neste servidor."
        );
      }

      const blockedRoles =
        [];

      for (
        const roleId
        of roleIdsToChange
      ) {
        const role =
          guild.roles.cache.get(
            roleId
          ) ||
          await guild.roles
            .fetch(
              roleId
            )
            .catch(
              () => null
            );

        if (
          !role ||
          role.managed ||
          role.editable !== true
        ) {
          blockedRoles.push({
            id:
              roleId,

            name:
              role?.name ||
              "cargo não encontrado",
          });
        }
      }

      if (
        blockedRoles.length > 0
      ) {
        throw new Error(
          "O bot não consegue gerenciar o(s) cargo(s): " +
          blockedRoles
            .map(
              role =>
                `${role.name} (<@&${role.id}>)`
            )
            .join(", ") +
          ". Coloque o cargo do bot acima desses cargos na hierarquia do Discord e confirme Gerenciar Cargos."
        );
      }

      if (
        wantedNickname &&
        wantedNickname !== member.nickname
      ) {
        if (
          !botMember?.permissions?.has(
            PermissionFlagsBits.ManageNicknames
          )
        ) {
          throw new Error(
            "O bot não possui a permissão Gerenciar Apelidos."
          );
        }

        if (
          member.manageable === false
        ) {
          throw new Error(
            "O bot não consegue alterar o nickname deste membro porque a hierarquia do Discord bloqueia a ação. Coloque o cargo do bot acima do maior cargo gerenciável do membro."
          );
        }
      }

      if (
        removeRoleIds.length > 0 ||
        addRoleIds.length > 0
      ) {
        markGiAreaTransitionInProgress(
          rec.targetId,
          12000
        );
      }

      try {
        if (
          removeRoleIds.length > 0
        ) {
          await member.roles.remove(
            removeRoleIds,
            `Controle GI: saída de cargos antigos ao mudar para ${areaProfile.canonicalName}`
          );

          result.removedRoleIds.push(
            ...removeRoleIds
          );
        }

        if (
          addRoleIds.length > 0
        ) {
          await member.roles.add(
            addRoleIds,
            `Controle GI: pacote automático da área ${areaProfile.canonicalName}`
          );

          result.addedRoleIds.push(
            ...addRoleIds
          );
        }

        if (
          wantedNickname &&
          wantedNickname !== member.nickname
        ) {
          await member.setNickname(
            wantedNickname,
            `Controle GI: nickname da área ${areaProfile.canonicalName}`
          );

          result.nicknameUpdated =
            true;

          result.nicknameAfter =
            wantedNickname;
        }

        // O cargo Gestaoinfluencer NÃO é manipulado aqui.
        // Ele continua sob o sistema atual de pausa/despausa.
        // Isso evita criar dois sistemas brigando pelo mesmo cargo.

        return result;
      } catch (error) {
        try {
          if (
            result.addedRoleIds.length > 0
          ) {
            await member.roles.remove(
              result.addedRoleIds,
              "Controle GI: rollback após falha na mudança de área"
            ).catch(() => {});
          }

          if (
            result.removedRoleIds.length > 0
          ) {
            await member.roles.add(
              result.removedRoleIds,
              "Controle GI: rollback após falha na mudança de área"
            ).catch(() => {});
          }

          if (
            member.nickname !== nicknameBefore
          ) {
            await member.setNickname(
              nicknameBefore,
              "Controle GI: rollback de nickname"
            ).catch(() => {});
          }
        } catch {}

        throw new Error(
          `Falha ao aplicar os cargos/nickname da área ${areaProfile.canonicalName}: ` +
          `${error?.message || error}`
        );
      }
    }

    async function resolveFormsCreatorThreadIdForGI(
      userId
    ) {
      const normalizedUserId =
        String(
          userId ||
          ""
        ).trim();

      if (!normalizedUserId) {
        return null;
      }

      // Caminho rápido:
      // consulta somente o state já carregado do FormsCreator.
      // Não varre tópicos do Discord.
      if (
        typeof findFormsCreatorThreadIdFastByUserId ===
          "function"
      ) {
        const fastThreadId =
          findFormsCreatorThreadIdFastByUserId(
            normalizedUserId
          );

        if (fastThreadId) {
          return String(
            fastThreadId
          );
        }
      }

      // Fallback de recuperação:
      // só faz busca profunda se o state rápido não encontrou.
      if (
        typeof findOriginalFormsCreatorThreadIdByUserId !==
          "function"
      ) {
        return null;
      }

      return await findOriginalFormsCreatorThreadIdByUserId(
        client,
        normalizedUserId
      ).catch((error) => {
        console.error(
          "[GI] Falha ao localizar registro original do FormsCreator:",
          error
        );

        return null;
      });
    }

    async function syncAreaToFormsCreator(
      rec,
      canonicalArea,
      editor
    ) {
      if (
        (
          typeof findFormsCreatorThreadIdFastByUserId !==
            "function" &&
          typeof findOriginalFormsCreatorThreadIdByUserId !==
            "function"
        ) ||
        typeof setFormsCreatorArea !== "function"
      ) {
        return {
          status: "unavailable",
          threadId: null,
          error: "Integração FormsCreator indisponível."
        };
      }

      const fcThreadId =
        await resolveFormsCreatorThreadIdForGI(
          rec.targetId
        );

      if (!fcThreadId) {
        return {
          status: "not_found",
          threadId: null,
          error: "Tópico do FormsCreator não encontrado."
        };
      }

      try {
        const update = await setFormsCreatorArea(
          client,
          {
            threadId: fcThreadId,
            newArea: canonicalArea,
            actor: editor
          }
        );

        return {
          status:
            update.activeTopicSyncPending
              ? "pending"
              : (
                  update.activeTopicUpdated
                    ? "synced"
                    : "partial"
                ),
          threadId: fcThreadId,
          error: null
        };
      } catch (error) {
        console.error(
          "[GI] Falha ao sincronizar área no FormsCreator:",
          error
        );

        return {
          status: "failed",
          threadId: fcThreadId,
          error:
            error?.message ||
            String(error)
        };
      }
    }

    function formatRoleMentions(roleIds) {
      if (
        !Array.isArray(roleIds) ||
        roleIds.length === 0
      ) {
        return "Nenhum";
      }

      return roleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(", ");
    }

    function hierarchyNameByRank(rank) {
  if (rank === 0) return 'Owner';
  if (rank === 1) return 'Resp Creators';
  if (rank === 2) return 'Resp Influ';
  if (rank === 3) return 'Resp Líder';
  if (rank === 4) return 'Coord';
  if (rank === 5) return 'Gestor';
  if (rank === 6) return 'Manager';
  if (rank === 7) return 'Social';
  if (rank === 8) return 'Equipe Manager';
  if (rank === 9) return 'Equipe Social';
  if (rank === 10) return 'Equipe Creators';
  return 'Sem cargo de hierarquia';
}

async function assertCanManageGIRecord(
  guild,
  actorUser,
  targetUserId,
  actionName = 'gerenciar este registro',
  options = {}
) {
  const actorId = String(actorUser?.id || '');

  if (!actorId) {
    throw new Error('Não foi possível identificar quem tentou executar essa ação.');
  }

  // ✅ PERMITE AÇÕES AUTOMÁTICAS DO PRÓPRIO BOT
  // Exemplo: auto-desligamento após 30 dias pausado
  // ou desligamento automático quando o membro sai do servidor.
  if (client?.user?.id && actorId === client.user.id) {
    return true;
  }

  const actorMember = await guild.members.fetch(actorId).catch(() => null);

  if (!actorMember) {
    throw new Error('Não consegui encontrar seu membro no servidor para validar a hierarquia.');
  }

  // 🔒 Primeiro confirma se o executor possui permissão.
  // Isso impede que alguém sem autorização aproveite a ausência
  // do membro alvo para desligar o controle.
  const allowCoordAreaEdit =
    options?.allowCoordAreaEdit === true;

  const coordCanUseThisAction =
    allowCoordAreaEdit &&
    actorMember.roles?.cache?.has?.(SC_GI_CFG.ROLE_COORD_CREATORS);

  if (
    !hasAuth(actorMember) &&
    !coordCanUseThisAction
  ) {
    throw new Error('Você não tem permissão para mexer nesse controle.');
  }

  // 👑 Você/Macedo e Owner ignoram a hierarquia.
  if (isHierarchyBypassMember(actorMember)) {
    return true;
  }

  const targetMember = await guild.members
    .fetch(String(targetUserId))
    .catch(() => null);

  // ✅ O membro já saiu do servidor.
  // Como o executor já teve sua permissão validada acima,
  // permite encerrar o registro mesmo sem conseguir comparar
  // a hierarquia atual do membro alvo.
  if (!targetMember) {
    await logMsg(
      guild,
      'Desligamento de membro ausente (GI)',
      [
        `🛡️ **Ação:** ${actionName}`,
        `👮 **Executor:** <@${actorId}>`,
        `👤 **Membro alvo:** <@${targetUserId}> (\`${targetUserId}\`)`,
        '',
        '✅ **Resultado:** permitido porque o executor possui permissão e o membro alvo já não está no servidor.'
      ].join('\n')
    ).catch(() => {});

    return true;
  }

  const actorRank = getManagementRank(actorMember);
  const targetRank = getManagementRank(targetMember);

  if (actorRank === Infinity) {
    throw new Error('Você até pode ter permissão, mas não possui cargo de hierarquia configurado.');
  }

  if (targetRank === Infinity) {
    return true;
  }

  if (actorRank >= targetRank) {
    await logMsg(
      guild,
      'Ação Bloqueada por Hierarquia (GI)',
      [
        `🛡️ Ação: ${actionName}`,
        `👤 Autor: <@${actorId}>`,
        `🎚️ Cargo do autor: \`${hierarchyNameByRank(actorRank)}\``,
        `🎯 Alvo: <@${targetUserId}>`,
        `🎚️ Cargo do alvo: \`${hierarchyNameByRank(targetRank)}\``,
        '',
        '❌ Resultado: bloqueado porque o autor não está acima do alvo na hierarquia.'
      ].join('\n')
    );

    throw new Error(
      `Hierarquia bloqueada: você só pode ${actionName} de alguém abaixo de você. Seu cargo: ${hierarchyNameByRank(actorRank)} | Alvo: ${hierarchyNameByRank(targetRank)}.`
    );
  }

  return true;
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
    async function resolvePersonalTicketInfo(
      guildId,
      userId,
      storedChannelId = null
    ) {
      const guild =
        client.guilds.cache.get(
          String(guildId || "")
        );

      if (!guild) {
        return null;
      }

      if (storedChannelId) {
        const stored =
          guild.channels.cache.get(
            String(storedChannelId)
          ) ||
          await guild.channels
            .fetch(
              String(storedChannelId)
            )
            .catch(() => null);

        if (stored?.isTextBased?.()) {
          return {
            channelId:
              stored.id,

            url:
              `https://discord.com/channels/${guild.id}/${stored.id}`,
          };
        }
      }

      const api =
        globalThis.SC_PERSONAL_TICKET_API;

      if (
        !api ||
        typeof api.findByUser !==
          "function"
      ) {
        return null;
      }

      const channel =
        await api.findByUser(
          guild,
          String(userId || "")
        ).catch(() => null);

      if (!channel) {
        return null;
      }

      return {
        channelId:
          channel.id,

        url:
          `https://discord.com/channels/${guild.id}/${channel.id}`,
      };
    }

    // =====================================================
    // AVISO PADRÃO NO TICKET PESSOAL APÓS DESLIGAMENTO
    // =====================================================
    //
    // O ticket pessoal é permanente.
    //
    // O sortChannels pode mover o canal para a categoria de
    // inativos, mas usa lockPermissions:false e preserva os
    // overwrites existentes do canal.
    //
    // Portanto o canal continua sendo o mesmo ticket pessoal.
    // =====================================================

    async function sendPersonalTicketDisconnectNotice(
      guild,
      userId,
      ticketChannelId
    ) {
      if (
        !guild ||
        !userId ||
        !ticketChannelId
      ) {
        return false;
      }

      const channel =
        guild.channels.cache.get(
          String(
            ticketChannelId
          )
        ) ||
        await guild.channels
          .fetch(
            String(
              ticketChannelId
            )
          )
          .catch(
            () => null
          );

      if (
        !channel?.isTextBased?.()
      ) {
        return false;
      }

      const embed =
        new EmbedBuilder()
          .setColor(
            0x8e44ad
          )
          .setTitle(
            '💜 Até logo por enquanto'
          )
          .setDescription(
            [
              `Poxa, <@${userId}>. Vi que sua etapa atual na **SantaCreators** foi encerrada.`,
              '',
              'Sinto muito por essa saída e espero que a gente se encontre novamente por aqui no futuro.',
              '',
              '🎫 **Este continua sendo o seu ticket pessoal.** O desligamento não apaga este canal nem transforma ele em uma nova entrevista.',
              '',
              'Se um dia você quiser conversar sobre retornar à SantaCreators, pode usar este mesmo ticket para chamar a equipe e explicar que deseja voltar.',
              '',
              '📌 Pelo fluxo atual do Ticket Pessoal, você não precisa abrir uma nova entrevista do zero apenas para iniciar esse retorno. A equipe poderá conferir seu histórico e orientar os próximos passos por aqui, seguindo as regras vigentes no momento.',
              '',
              'A gente se vê mais pra frente. Se cuida, beijinho e fica com Deus. 💜',
            ].join(
              '\n'
            )
          )
          .setFooter({
            text:
              'SantaCreators • Ticket Pessoal'
          })
          .setTimestamp();

      await channel.send({
        content:
          `<@${userId}>`,

        embeds: [
          embed
        ],

        allowedMentions: {
          parse: [],
          users: [
            String(
              userId
            )
          ],
        },
      });

      return true;
    }

    // =====================================================
    // AVISO PADRÃO NO TICKET PESSOAL APÓS RESTAURAÇÃO
    // =====================================================

    async function sendPersonalTicketRestoreNotice(
      guild,
      userId,
      ticketChannelId
    ) {
      if (
        !guild ||
        !userId ||
        !ticketChannelId
      ) {
        return false;
      }

      const channel =
        guild.channels.cache.get(
          String(ticketChannelId)
        ) ||
        await guild.channels
          .fetch(
            String(ticketChannelId)
          )
          .catch(
            () => null
          );

      if (
        !channel?.isTextBased?.()
      ) {
        return false;
      }

      const embed =
        new EmbedBuilder()
          .setColor(
            0x2ecc71
          )
          .setTitle(
            '💜 Que bom ter você de volta'
          )
          .setDescription(
            [
              `Que bom te ver de volta, <@${userId}>! Seu retorno à **SantaCreators** foi registrado.`,
              '',
              '🎫 **Este continua sendo o mesmo Ticket Pessoal de antes.** Seu histórico anterior foi preservado e você pode continuar usando este canal normalmente.',
              '',
              '📌 Como este ticket já representa sua trajetória, você não precisa abrir outra entrevista apenas por causa desta restauração do Controle GI.',
              '',
              'A partir daqui, a equipe pode retomar o acompanhamento pelo ponto em que você havia parado e orientar os próximos passos. Bem-vindo(a) de volta. 💜',
            ].join(
              '\n'
            )
          )
          .setFooter({
            text:
              'SantaCreators • Ticket Pessoal'
          })
          .setTimestamp();

      await channel.send({
        content:
          `<@${userId}>`,

        embeds: [
          embed
        ],

        allowedMentions: {
          parse: [],
          users: [
            String(userId)
          ],
        },
      });

      return true;
    }

    // ====================== ROLE GI HELPERS (OBRIGATÓRIO) ======================
    const GI_ROLE_ID = SC_GI_CFG.ROLE_GESTAOINFLUENCER; // 1371733765243670538

    function setRoleBypass(userId, ms = 8000) {
      if (!globalThis.__SC_ROLE_BYPASS__) globalThis.__SC_ROLE_BYPASS__ = new Map();
      globalThis.__SC_ROLE_BYPASS__.set(String(userId), Date.now() + ms);
    }
    function hasRoleBypass(userId) {
      if (!globalThis.__SC_ROLE_BYPASS__) return false;
      const t = globalThis.__SC_ROLE_BYPASS__.get(String(userId));
      if (!t) return false;
      if (Date.now() > t) { globalThis.__SC_ROLE_BYPASS__.delete(String(userId)); return false; }
      return true;
    }

    async function addGIRole(
      guild,
      userId,
      reason = 'GI obrigatório'
    ) {
      const m =
        await fetchMemberCached(
          guild,
          userId
        );

      if (!m) {
        return false;
      }

      if (
        m.roles.cache.has(
          GI_ROLE_ID
        )
      ) {
        return true;
      }

      setRoleBypass(
        userId
      );

      try {
        await m.roles.add(
          GI_ROLE_ID,
          reason
        );

        return true;
      } catch (error) {
        console.error(
          `[SC_GI] Falha ao adicionar o cargo GI em ${userId}:`,
          error?.message || error
        );

        return false;
      }
    }

    async function removeGIRole(
      guild,
      userId,
      reason = 'GI removido por pausa/desligamento'
    ) {
      const m =
        await fetchMemberCached(
          guild,
          userId
        );

      if (!m) {
        return false;
      }

      if (
        !m.roles.cache.has(
          GI_ROLE_ID
        )
      ) {
        return true;
      }

      setRoleBypass(
        userId
      );

      try {
        await m.roles.remove(
          GI_ROLE_ID,
          reason
        );

        return true;
      } catch (error) {
        console.error(
          `[SC_GI] Falha ao remover o cargo GI de ${userId}:`,
          error?.message || error
        );

        return false;
      }
    }

    function emitGIReturned(targetId, extra = {}) {
  try {
    if (!targetId) return;
    dashEmit('gi:retornou', {
      userId: String(targetId),
      timestamp: Date.now(),
      ...extra
    });
  } catch (e) {
    console.warn('[SC_GI] Falha ao emitir gi:retornou:', e?.message || e);
  }
}


    const CREATOR_BASE_ROLE_ID = SC_GI_CFG.ROLE_CREATOR_BASE;

function extractFirstTimestampFromEmbed(embed) {
  if (!embed) return null;

  if (embed.timestamp) {
    const ts = new Date(embed.timestamp).getTime();
    if (Number.isFinite(ts)) return ts;
  }

  const raw = [
    embed.title || '',
    embed.description || '',
    ...(Array.isArray(embed.fields) ? embed.fields.flatMap(f => [f?.name || '', f?.value || '']) : []),
    embed.footer?.text || ''
  ].join('\n');

  // Exemplo: segunda-feira, 23 de março de 2026 05:13
  const m = raw.match(/(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\s+(\d{2}):(\d{2})/i);
  if (!m) return null;

  const meses = {
    janeiro: 0,
    fevereiro: 1,
    março: 2,
    marco: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11
  };

  const dia = Number(m[1]);
  const mes = meses[m[2].toLowerCase()];
  const ano = Number(m[3]);
  const hora = Number(m[4]);
  const minuto = Number(m[5]);

  if (mes == null) return null;

  // horário SP (-03)
  return Date.UTC(ano, mes, dia, hora + 3, minuto, 0, 0);
}

function messageMentionsUserInEmbed(msg, userId) {
  const uid = String(userId);
  const embeds = Array.isArray(msg?.embeds) ? msg.embeds : [];
  for (const emb of embeds) {
    const raw = [
      emb.title || '',
      emb.description || '',
      ...(Array.isArray(emb.fields) ? emb.fields.flatMap(f => [f?.name || '', f?.value || '']) : []),
      emb.footer?.text || ''
    ].join('\n');

    if (
      raw.includes(`<@${uid}>`) ||
      raw.includes(`(${uid})`) ||
      raw.includes(`| ${uid}`) ||
      raw.includes(` ${uid}`)
    ) {
      return true;
    }
  }
  return false;
}

function embedContainsTrackedRoleAdd(msg) {
  const embeds = Array.isArray(msg?.embeds) ? msg.embeds : [];
  for (const emb of embeds) {
    const raw = [
      emb.title || '',
      emb.description || '',
      ...(Array.isArray(emb.fields) ? emb.fields.flatMap(f => [f?.name || '', f?.value || '']) : []),
      emb.footer?.text || ''
    ].join('\n').toLowerCase();

    const isCargoAdded =
      raw.includes('cargo adicionado') ||
      raw.includes('cargos adicionados');

    if (!isCargoAdded) continue;

    const hasGI =
      raw.includes('gestaoinfluencer') ||
      raw.includes(`<@&${GI_ROLE_ID}>`) ||
      raw.includes(GI_ROLE_ID);

    const hasCreator =
      raw.includes('creator') ||
      raw.includes(`<@&${CREATOR_BASE_ROLE_ID}>`) ||
      raw.includes(CREATOR_BASE_ROLE_ID);

    if (hasGI || hasCreator) return true;
  }
  return false;
}

async function findEarliestTrackedRoleSetAtFromLogs(guild, userId) {
  try {
    const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_CARGO_LOGS).catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    let earliest = null;
    let before = undefined;

    // varre bastante, mas sem mudar a lógica do resto
    for (let page = 0; page < 20; page++) {
      const msgs = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!msgs || msgs.size === 0) break;

      const ordered = [...msgs.values()].reverse(); // mais antigas -> mais novas
      for (const msg of ordered) {
        if (!messageMentionsUserInEmbed(msg, userId)) continue;
        if (!embedContainsTrackedRoleAdd(msg)) continue;

        const ts = extractFirstTimestampFromEmbed(msg.embeds?.[0]) || msg.createdTimestamp || null;
        if (ts && (!earliest || ts < earliest)) {
          earliest = ts;
        }
      }

      before = msgs.last()?.id;
      if (!before) break;
    }

    return earliest;
  } catch (e) {
    console.warn('[SC_GI] Falha ao buscar primeira setagem pelos logs:', e?.message);
    return null;
  }
}

async function resolveInitialRoleSetAtMs(guild, targetId) {
  const fromLogs = await findEarliestTrackedRoleSetAtFromLogs(guild, targetId);
  if (fromLogs) return fromLogs;

  const member = await fetchMemberCached(guild, targetId).catch(() => null);
  if (member && (member.roles.cache.has(GI_ROLE_ID) || member.roles.cache.has(CREATOR_BASE_ROLE_ID))) {
    return nowMs();
  }

  return null;
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
  REFRESH_PREFIX: 'SC_GI_REFRESH_',
  FEEDBACK_AI_PREFIX: 'SC_GI_FEEDBACK_AI_',
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

// ✅ LINK DO TÓPICO DE EVOLUÇÃO / FORMSCREATOR
//
// IMPORTANTE:
// o controle GI NÃO faz mais uma varredura profunda de tópicos
// do Discord só para montar este link visual.
//
// A consulta rápida usa apenas o state já carregado do FormsCreator.
// Se o Forms ainda não existir, o controle mostra "Não encontrado"
// e uma atualização posterior preencherá o link automaticamente.
let fcLink = null;

try {
  // =====================================================
  // PRIMEIRO TENTA O TÓPICO HIERÁRQUICO ATIVO
  // =====================================================
  //
  // Assim o Controle GI acompanha a fase atual da pessoa
  // (Equipe, Gestão, Coordenação, Resp Líder ou Resp Influ)
  // em vez de ficar preso ao Forms original.
  // =====================================================

  if (
    typeof findFormsCreatorThreadLinkByUserId ===
      'function'
  ) {
    fcLink =
      await findFormsCreatorThreadLinkByUserId(
        client,
        rec.targetId,
        rec.guildId
      );
  }

  // =====================================================
  // FALLBACK: FORMS ORIGINAL
  // =====================================================
  //
  // Se a Evolução ainda estiver iniciando, mantém o link
  // antigo como recuperação temporária.
  // =====================================================

  if (
    !fcLink &&
    typeof findFormsCreatorThreadIdFastByUserId ===
      'function'
  ) {
    const fcThreadId =
      findFormsCreatorThreadIdFastByUserId(
        rec.targetId
      );

    if (
      fcThreadId &&
      rec.guildId
    ) {
      fcLink =
        `https://discord.com/channels/${rec.guildId}/${fcThreadId}`;
    }
  }
} catch (e) {
  console.warn(
    '[SC_GI] Falha ao buscar tópico ativo do FormsCreator:',
    e?.message || e
  );
}

// ✅ TICKET PESSOAL VINCULADO AO CONTROLE GI
let personalTicket = null;

try {
  personalTicket =
    await resolvePersonalTicketInfo(
      rec.guildId,
      rec.targetId,
      rec.personalTicketChannelId
    );

  if (
    personalTicket?.channelId &&
    rec.personalTicketChannelId !==
      personalTicket.channelId
  ) {
    rec.personalTicketChannelId =
      personalTicket.channelId;

    SC_GI_scheduleSave();
  }
} catch (e) {
  console.warn(
    '[SC_GI] Falha ao localizar ticket pessoal:',
    e?.message || e
  );
}

///teste besta 
      emb.setDescription([
          `👤 **Membro:** <@${targetUser.id}>`,
          `🗓️ **Entrada:** \`${msToDDMMYYYY(joinDateMs)}\``,
          `🧭 **Área:** \`${area}\``,
          `👨‍✈️ **Responsável Direto:** ${responsavelLabel(rec)}`,
          '',
          `⏱️ **Semanas completas:** \`${weeks}\``,
          `🗓️ **Meses já na gestão:** \`${months}\``,
          '',
          `🔗 **Evolução (Forms):** ${fcLink ? `[Abrir Tópico](${fcLink})` : 'Não encontrado'}`,
          `🎫 **Ticket pessoal:** ${personalTicket?.url ? `[Abrir Ticket](${personalTicket.url})` : 'Aguardando vínculo automático'}`,

          `📌 **Status:** ${active ? 'Ativo' : 'Pausado'}`,
`⏳ **Tempo ativo real:** \`${activeTimeText(rec)}\``,
!active ? `⏸️ **Tempo pausado acumulado:** \`${formatDurationFull(getPausedTotalMs(rec))}\`` : '',
!active ? `🧨 **Auto-desligamento em:** ${pauseCountdownText(rec)}` : '',
`🔒 **Cargo obrigatório enquanto ativo:** <@&${GI_ROLE_ID}>`,
          rec?.warnNoRoleGI
  ? '\n⚠️ *Atenção:* este membro **não possui** GI/Creator base no momento do registro.'
  : (rec?.roleSetAtMs ? `\n✅ **Primeira setagem GI/Creator em:** \`${msToDDMMYYYY(rec.roleSetAtMs)}\`` : '')
        ].filter(Boolean).join('\n'))
        .setImage(GIF_SC_GI)
        .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
        .setTimestamp(new Date());
      if (rec?.note) emb.addFields({ name: '🗒️ Observação', value: rec.note.slice(0, 1024) });
      return emb;
    }
function registroButtons(messageId, active) {
  const rowMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BTN.EDIT_PREFIX + messageId).setStyle(ButtonStyle.Secondary).setEmoji('✏️').setLabel('Editar Registro'),
    new ButtonBuilder().setCustomId(BTN.RESP_PREFIX + messageId).setStyle(ButtonStyle.Secondary).setEmoji('🧭').setLabel('Definir Responsável'),
    new ButtonBuilder().setCustomId(BTN.REFRESH_PREFIX + messageId).setStyle(ButtonStyle.Secondary).setEmoji('🔄').setLabel('Atualizar Controle'),
    new ButtonBuilder().setCustomId(BTN.DMNOW_PREFIX + messageId).setStyle(ButtonStyle.Primary).setEmoji('📨').setLabel('Reenviar DM agora'),
    new ButtonBuilder().setCustomId(BTN.STOP_COUNT_PREFIX + messageId)
      .setStyle(active ? ButtonStyle.Danger : ButtonStyle.Success)
      .setEmoji(active ? '⏸️' : '▶️')
      .setLabel(active ? 'Parar Contagem' : 'Retomar Contagem')
  );

  const rowDanger = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN.FEEDBACK_AI_PREFIX + messageId)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🧠')
      .setLabel('Comentário IA'),

    new ButtonBuilder()
      .setCustomId(BTN.DESLIGAR_PREFIX + messageId)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setLabel('Desligar da gestão')
  );

  return [rowMain, rowDanger];
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

      const ended = Number(rec.endedAtMs || 0) > 0;

      const desc = [
        `👋 <@${rec.targetId}>, segue seu status:`,
        `🗓️ **Entrada:** \`${msToDDMMYYYY(rec.joinDateMs)}\``,
        `🧭 **Área:** \`${rec.area}\``,
        `⏱️ **Semanas completas:** \`${weeks}\``,
        `🗓️ **Meses já na gestão:** \`${months}\``,
        respLinha,
        ended
          ? '📌 **Status:** Desligado da SantaCreators.'
          : `📌 **Status:** ${rec.active ? 'Ativo' : 'Pausado'} — ${pausedStr}`,
        ended
          ? `🗓️ **Saída:** \`${msToDDMMYYYY(rec.endedAtMs)}\``
          : `🔒 **Cargo obrigatório enquanto ativo:** <@&${GI_ROLE_ID}>`,
        ended
          ? ''
          : '💡 *Participe nos dias de quinta, sexta e sábado pra garantir **VIP/Rolepass**.*',
        ended
          ? ''
          : 'Ao completar **1 mês**, solicite **1 VIP** ao seu responsável direto presente.'
      ].filter(Boolean).join('\n');

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
      const originals = [embed, ...extraEmbeds]
        .filter(Boolean)
        .map(value => structuredClone(value.data || value));

      const baseContent = content ?? `<@${targetUser.id}>`;
      const roleIds = new Set(
        [...JSON.stringify([baseContent, originals]).matchAll(/<@&(\d{17,20})>/g)]
          .map(match => match[1])
      );

      const roleNames = new Map();
      for (const roleId of roleIds) {
        const role = guild.roles.cache.get(roleId) ||
          await guild.roles.fetch(roleId).catch(() => null);
        roleNames.set(roleId, role?.name || `Cargo de ID ${roleId}`);
      }

      const readable = value => String(value ?? "").replace(
        /<@&(\d{17,20})>/g,
        (_, roleId) => roleNames.get(roleId) || `Cargo de ID ${roleId}`
      );

      function splitText(value, limit) {
        const parts = [];
        let remaining = String(value ?? "");
        while (remaining.length > limit) {
          let end = remaining.lastIndexOf("\n", limit);
          if (end < limit / 2) end = remaining.lastIndexOf(" ", limit);
          if (end < limit / 2) end = limit;
          const lastCode = remaining.charCodeAt(end - 1);
          if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
          parts.push(remaining.slice(0, end));
          remaining = remaining.slice(end);
        }
        if (remaining) parts.push(remaining);
        return parts;
      }

      const lengthOf = data =>
        (data.title?.length || 0) +
        (data.description?.length || 0) +
        (data.author?.name?.length || 0) +
        (data.footer?.text?.length || 0) +
        (data.fields || []).reduce(
          (total, field) => total + field.name.length + field.value.length,
          0
        );

      const pages = [];
      for (const original of originals) {
        const fields = original.fields || [];
        const description = readable(original.description);
        const base = { ...original, fields: [] };
        delete base.description;
        if (base.title) base.title = readable(base.title);
        if (base.author?.name) base.author.name = readable(base.author.name);
        if (base.footer?.text) base.footer.text = readable(base.footer.text);

        let page = null;
        const descriptions = splitText(description, 2800);
        for (const part of descriptions.length ? descriptions : [""]) {
          page = { ...base, fields: [] };
          if (part) page.description = part;
          pages.push(page);
        }

        for (const field of fields) {
          const name = readable(field.name);
          const values = splitText(readable(field.value) || "—", 1000);
          for (const value of values) {
            if (
              page.fields.length >= 25 ||
              lengthOf(page) + name.length + value.length > 5900
            ) {
              page = { ...base, fields: [] };
              pages.push(page);
            }
            page.fields.push({ ...field, name, value });
          }
        }
      }

      const contents = splitText(readable(baseContent), 1900);
      const payloads = [];
      const count = Math.max(contents.length, pages.length);
      for (let index = 0; index < count; index++) {
        const payload = { allowedMentions: { parse: [] } };
        if (contents[index]?.trim()) payload.content = contents[index];
        if (pages[index]) payload.embeds = [pages[index]];
        if (payload.content || payload.embeds) payloads.push(payload);
      }

      let delivered = 0;
      try {
        const dm = await targetUser.createDM();
        for (const payload of payloads) {
          await dm.send(payload);
          delivered++;
        }
      } catch (error) {
        console.warn(
          `[SC_GI] DM incompleta para ${targetUser.id}: ${delivered}/${payloads.length} partes.`,
          error?.message || error
        );
      }

      const dmOk = payloads.length > 0 && delivered === payloads.length;
      try {
        const mirror = await client.channels
          .fetch(SC_GI_CFG.CHANNEL_DM_MIRROR)
          .catch(() => null);

        if (mirror && mirror.type === ChannelType.GuildText) {
          for (const payload of payloads) {
            await mirror.send({
              ...payload,
              embeds: payload.embeds?.map(data =>
                EmbedBuilder.from(data).setColor(dmOk ? 0x2ecc71 : 0xe67e22)
              )
            });
          }
        }
      } catch (error) {
        console.warn('[SC_GI] Falha ao espelhar DM:', error?.message || error);
      }

      return dmOk;
    }

    // ====================== MENU / LOGS ======================
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
        const restoreLogCh = await client.channels.fetch(SC_GI_CFG.CHANNEL_RESTORE_LOG).catch(() => null);

        // Usa Array.from para evitar problemas de modificação do Map durante iteração
        const records = Array.from(SC_GI_STATE.registros.values());
        for (const rec of records) {
          // ✅ SEGURANÇA: ignora registros que não pertencem a este servidor no loop
          if (rec.guildId !== guild.id) continue;

          // 🔧 Auto-atribuição de responsável se estiver vazio
          if (!rec.responsibleUserId) {
            const newBest = await findBestResponsible(guild, rec.targetId);
            if (newBest) {
              rec.responsibleUserId = newBest.userId;
              rec.responsibleType = newBest.type;
              rec.responsibleHistory.push({ atMs: Date.now(), userId: newBest.userId, type: newBest.type, setBy: client.user.id });
              
              const chToEdit = await guild.channels.fetch(rec.channelId).catch(() => null);
              const msgToEdit = chToEdit ? await chToEdit.messages.fetch(rec.messageId).catch(() => null) : null;
              if (msgToEdit) {
                const targetU = await fetchUserCached(rec.targetId);
                const regU = await fetchUserCached(rec.registrarId);
                const emb = await registroEmbed({ targetUser: targetU, registrarUser: regU, joinDateMs: rec.joinDateMs, area: rec.area, weeks: weeksSince(rec.joinDateMs), months: monthsSince(rec.joinDateMs), active: rec.active, rec });
                await msgToEdit.edit({ embeds: [emb] }).catch(() => {});
              }
            }
          }

          // 🔧 Verificação de responsável desligado
          const respMem = rec.responsibleUserId ? await guild.members.fetch(rec.responsibleUserId).catch(() => null) : null;
const targetMem = rec.targetId ? await guild.members.fetch(rec.targetId).catch(() => null) : null;

const respType = getHighestTypeFromMember(respMem);
const respRank = getManagementRank(respMem);
const targetRank = getManagementRank(targetMem);

const isRespStillValid =
  respMem &&
  respType &&
  rec.responsibleUserId !== rec.targetId &&
  (targetRank === Infinity || respRank < targetRank);

if (rec.responsibleUserId && !isRespStillValid) {
  const newBest = await findBestResponsible(guild, rec.targetId);
            if (newBest) {
              rec.responsibleUserId = newBest.userId;
              rec.responsibleType = newBest.type;
              rec.responsibleHistory.push({ atMs: Date.now(), userId: newBest.userId, type: newBest.type, setBy: client.user.id });
              
              const chToEdit = await guild.channels.fetch(rec.channelId).catch(() => null);
              const msgToEdit = chToEdit ? await chToEdit.messages.fetch(rec.messageId).catch(() => null) : null;
              if (msgToEdit) {
                const targetU = await fetchUserCached(rec.targetId);
                const regU = await fetchUserCached(rec.registrarId);
                const emb = await registroEmbed({ targetUser: targetU, registrarUser: regU, joinDateMs: rec.joinDateMs, area: rec.area, weeks: weeksSince(rec.joinDateMs), months: monthsSince(rec.joinDateMs), active: rec.active, rec });
                await msgToEdit.edit({ embeds: [emb] }).catch(() => {});
              }
            }
          }

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
              embeds: [emb]
            });

            const oldId = rec.messageId;
            rec.messageId = newMsg.id;
            
            // ✅ Atualiza a chave no Map para não perder a referência
            SC_GI_STATE.registros.delete(oldId);
            SC_GI_STATE.registros.set(rec.messageId, rec);
            
            SC_GI_scheduleSave();

            await newMsg.edit({ components: registroButtons(rec.messageId, rec.active) }).catch(()=>{});

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
             if (msg.author.id !== client.user.id) {
               // Ignora somente este registro antigo.
               // NÃO encerra a conferência dos demais registros.
               continue;
             }

             const componentCustomIds =
               (msg.components || [])
                 .flatMap(row => row.components || [])
                 .map(component => String(component.customId || ''))
                 .filter(Boolean);

             const hasButtons =
               componentCustomIds.some(customId =>
                 customId.startsWith(BTN.EDIT_PREFIX) ||
                 customId.startsWith(BTN.STOP_COUNT_PREFIX)
               );

             const hasTempButtons =
               componentCustomIds.some(customId =>
                 customId.endsWith('_TEMP') ||
                 customId.includes('_TEMP')
               );

             if (!hasButtons || hasTempButtons) {
                await msg.edit({
                  components: registroButtons(
                    rec.messageId,
                    rec.active
                  )
                }).catch((error) => {
                  console.warn(
                    `[SC_GI] Falha ao corrigir botões do registro ${rec.messageId}:`,
                    error?.message || error
                  );
                });
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
      
      // 🚫 ANTI-DUPLICAÇÃO: remove qualquer registro pendente para o mesmo targetId antes de criar
      const existing = Array.from(SC_GI_STATE.registros.values()).filter(r => r.targetId === String(targetId));
      for (const old of existing) {
        SC_GI_STATE.registros.delete(old.messageId);
        const oldCh = await guild.channels.fetch(old.channelId).catch(() => null);
        if (oldCh) {
          const oldMsg = await oldCh.messages.fetch(old.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        }
      }

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
let warnNoRoleGI = false;

let roleSetAtMs =
  options.fastCreate === true
    ? null
    : await resolveInitialRoleSetAtMs(
        guild,
        targetUser.id
      );

      const ch = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) throw new Error('Canal de registros indisponível.');

      // ✅ RESPONSÁVEL AUTOMÁTICO
      let autoResp = null;
      if (!options.responsibleUserId) {
        autoResp = await findBestResponsible(guild, targetId);
      }

      const initialResponsibleUserId =
        options.responsibleUserId ||
        autoResp?.userId ||
        null;

      const initialResponsibleType =
        options.responsibleType ||
        autoResp?.type ||
        null;

      const days   = daysBetween(joinMs, nowMs());
      const weeks  = Math.max(0, Math.floor(days / 7));
      const months = monthsSince(joinMs);

      const initialActive = options.initialActive ?? false;
      const createdNowMs = nowMs();

      const tempRec = {
        messageId: null,
        guildId: guild.id,
        channelId: ch.id,
        targetId: targetUser.id,
        registrarId: registrar.id,
        area: areaStr,
        joinDateMs: joinMs,
        createdAtMs: createdNowMs,
        active: initialActive,
        nextWeekTickMs: initialActive ? computeNextWeekTick(joinMs) : null,
        oneMonthNotified: false,
        oneMonthNotifiedAt: null,
        note: '',

responsibleUserId: initialResponsibleUserId,
responsibleType: initialResponsibleType,
responsibleManual: !!options.responsibleUserId,
responsibleSetBy: options.responsibleUserId ? registrar.id : null,
responsibleUpdatedAtMs: createdNowMs,
warnNoRoleGI,
responsibleHistory: initialResponsibleUserId
  ? [
      {
        atMs: createdNowMs,
        userId: String(initialResponsibleUserId),
        type: initialResponsibleType,
        setBy: registrar.id,
        manual: !!options.responsibleUserId,
        source: options.restoreSnapshot
          ? "restore"
          : "creation",
      }
    ]
  : [],

// =====================================================
// HISTÓRICO DE ÁREAS / CARGOS
// =====================================================

areaHistory: [
  {
    area:
      areaStr,

    startedAtMs:
      createdNowMs,

    endedAtMs:
      null,

    changedBy:
      registrar.id,

    source:
      "creation",
  }
],

// =====================================================
// HISTÓRICO DE ATIVIDADE
// =====================================================

activityHistory: [
  {
    status:
      initialActive
        ? "active"
        : "paused",

    atMs:
      createdNowMs,

    changedBy:
      registrar.id,

    reason:
      initialActive
        ? "Registro criado ativo"
        : "Registro criado pausado",
  }
],

pausedAtMs: initialActive ? null : createdNowMs,

// ✅ Registro criado pausado deve começar zerado.
// O tempo pausado passa a contar a partir do createdNowMs.
totalPausedMs: 0,
        roleSetAtMs,
        passaporte: options.passaporte || null,// ✅ Salva o ID se vier do pedirset
        personalTicketChannelId:
          options.personalTicketChannelId
            ? String(options.personalTicketChannelId)
            : null,
        lastControlVisualRefreshAtMs: 0
      };

      const emb = await registroEmbed({
  targetUser,
  registrarUser: registrar,
  joinDateMs: joinMs,
  area: areaStr,
  weeks,
  months,
  active: tempRec.active,
  rec: tempRec
});

// 🔥 ENVIA PRIMEIRO SEM BOTÕES TEMPORÁRIOS
// O ID real da mensagem só existe depois do send().
const msg = await ch.send({
  content: `<@${targetUser.id}>`,
  embeds: [emb]
});

// agora fixa o ID real
tempRec.messageId = msg.id;
const record = { ...tempRec };

SC_GI_STATE.registros.set(
  record.messageId,
  record
);

SC_GI_scheduleSave();

// Se nasceu pausado, já recebe seu próprio relógio.
if (
  record.active === false
) {
  scheduleGiAutoDisableTimer(
    record
  );
}

// =====================================================
// AVISA O SISTEMA DE TICKETS ASSIM QUE O NÚCLEO EXISTE
// =====================================================
//
// Não espera DM, logs, menu ou dashboard.
//
// A partir daqui o Controle GI já existe no state e já possui
// mensagem real no Discord, então o ticket pode descer de
// "Contratar em Game" para a categoria da Equipe Creator.
// =====================================================
if (options.suppressLifecycleEvents !== true) {
  dashEmit(
    'gi:controle_criado',
    {
      userId:
        record.targetId,

      guildId:
        guild.id,

      active:
        record.active,

      timestamp:
        Date.now()
    }
  );
}

// 🔁 Agora adiciona os botões com o ID REAL da mensagem.
// Nunca deixa customId com TEMP no registro oficial.
await msg.edit({
  components: registroButtons(record.messageId, record.active)
}).catch((error) => {
  console.error(
    `[SC_GI] Falha ao aplicar botões reais no registro ${record.messageId}:`,
    error?.message || error
  );
});


// ✅ NOVO: já seta cargo GI automaticamente ao criar
// Se for criado pausado (via pedirset), NÃO adiciona o cargo agora
if (record.active) {
  await addGIRole(guild, record.targetId, 'Registro criado: GI obrigatório');

  // ✅ se a pessoa foi desligada antes e voltou na mesma semana,
  // isso limpa o bloqueio visual (-99999) e devolve os pontos antigos + novos
  if (options.suppressLifecycleEvents !== true) {
    emitGIReturned(record.targetId, {
      reason: 'create_registro_active',
      messageId: record.messageId
    });
  }
}

// atualiza flags visuais sem sobrescrever a primeira data histórica
try {
  const member = await fetchMemberCached(guild, record.targetId);

  const hasTrackedRole = !!(
    member &&
    (member.roles.cache.has(GI_ROLE_ID) || member.roles.cache.has(CREATOR_BASE_ROLE_ID))
  );

  if (!hasTrackedRole) {
    record.warnNoRoleGI = true;
  } else {
    record.warnNoRoleGI = false;

    // só define se ainda não existe nada salvo
    if (!record.roleSetAtMs) {
      record.roleSetAtMs = await resolveInitialRoleSetAtMs(guild, record.targetId);
    }
  }

  SC_GI_scheduleSave();
} catch {}

      if (options.suppressWelcomeDm !== true) {
        // ✅ NOVO: DM BOAS-VINDAS (parabéns + 1 mês = vip/destaques)
        const welcome = dmWelcomeEmbed(record, targetUser);
        await sendDM_andMirror(guild, targetUser, welcome);
      }

      if (options.suppressNewRecordLog !== true) {
        // log
        await logMsg(
          guild,
          'Novo Registro (GI)',
          [
            `👤 **Membro:** <@${targetUser.id}> (\`${targetUser.id}\`)`,
            `🗓️ **Entrada:** \`${msToDDMMYYYY(joinMs)}\``,
            `🧭 **Área:** \`${areaStr}\``,
            record.active
              ? `✅ **Cargo GI setado automaticamente:** <@&${GI_ROLE_ID}>`
              : `⏸️ **Registro criado pausado** (sem setar o cargo GI agora).`,
            `🧾 **Por:** <@${registrar.id}> (\`${registrar.id}\`)`,
            `🔗 **Link:** [Abrir registro](https://discord.com/channels/${guild.id}/${record.channelId}/${record.messageId})`
          ].filter(Boolean).join('\n'),
          { 
            thumb: targetUser.displayAvatarURL?.({ size: 128 }),
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`SC_GI_UNDO_DESLIGAR:${record.messageId}`).setLabel('Desfazer (Remover)').setStyle(ButtonStyle.Danger)
              )
            ]
          }
        );
      }

      await ensureMenu(guild);

      scheduleRespBoardRender(
        guild,
        {
          force: true,
        }
      );
    }

    // =====================================================
    // 🔁 MIGRAÇÃO DE IDENTIDADE DISCORD
    // =====================================================
    //
    // Permite trocar a conta Discord do mesmo membro
    // preservando:
    //
    // - registro GI
    // - histórico
    // - pontos
    // - ranking
    // - dashboard
    // - FormsCreator
    // - responsável
    // - snapshots
    // - overrides
    // - cargos
    // - nickname
    //
    // =====================================================

    function mergeGIWarningState(
      oldValue,
      newValue
    ) {
      if (
        !oldValue &&
        !newValue
      ) {
        return null;
      }

      return {
        count:
          Number(
            oldValue?.count ||
            0
          ) +
          Number(
            newValue?.count ||
            0
          ),

        lastAtMs:
          Math.max(
            Number(
              oldValue?.lastAtMs ||
              0
            ),

            Number(
              newValue?.lastAtMs ||
              0
            )
          ) ||
          null
      };
    }

    async function migrateGIInternalIdentityState(
      guild,
      oldUserId,
      newUserId
    ) {
      const oldId =
        String(
          oldUserId
        );

      const newId =
        String(
          newUserId
        );

      // =====================================================
      // WARNINGS DA TRAVA GI
      // =====================================================

      const oldWarning =
        SC_GI_STATE
          .giWarningsByUser
          .get(
            oldId
          );

      const newWarning =
        SC_GI_STATE
          .giWarningsByUser
          .get(
            newId
          );

      const mergedWarning =
        mergeGIWarningState(
          oldWarning,
          newWarning
        );

      if (
        mergedWarning
      ) {
        SC_GI_STATE
          .giWarningsByUser
          .set(
            newId,
            mergedWarning
          );
      }

      SC_GI_STATE
        .giWarningsByUser
        .delete(
          oldId
        );

      // =====================================================
      // SNAPSHOT TEMPORÁRIO DE CARGOS
      // =====================================================

      const oldSnapshot =
        SC_GI_STATE
          .roleSnapshots
          .get(
            oldId
          );

      const newSnapshot =
        SC_GI_STATE
          .roleSnapshots
          .get(
            newId
          );

      if (
        oldSnapshot ||
        newSnapshot
      ) {
        const selectedSnapshot =
          !newSnapshot
            ? oldSnapshot
            : !oldSnapshot
              ? newSnapshot
              : Number(
                  oldSnapshot
                    .restoreAtMs ||
                  0
                ) >=
                Number(
                  newSnapshot
                    .restoreAtMs ||
                  0
                )
                ? oldSnapshot
                : newSnapshot;

        SC_GI_STATE
          .roleSnapshots
          .set(
            newId,
            selectedSnapshot
          );
      }

      SC_GI_STATE
        .roleSnapshots
        .delete(
          oldId
        );

      // =====================================================
      // OVERRIDES MANUAIS
      // =====================================================

      const oldOverrides =
        SC_GI_STATE
          .masterRoleOverridesByUser
          .get(
            oldId
          );

      const newOverrides =
        SC_GI_STATE
          .masterRoleOverridesByUser
          .get(
            newId
          );

      if (
        oldOverrides ||
        newOverrides
      ) {
        const mergedOverrides =
          new Map();

        for (
          const [
            roleId,
            state
          ]
          of oldOverrides ||
          []
        ) {
          mergedOverrides.set(
            roleId,
            state
          );
        }

        for (
          const [
            roleId,
            state
          ]
          of newOverrides ||
          []
        ) {
          mergedOverrides.set(
            roleId,
            state
          );
        }

        SC_GI_STATE
          .masterRoleOverridesByUser
          .set(
            newId,
            mergedOverrides
          );
      }

      SC_GI_STATE
        .masterRoleOverridesByUser
        .delete(
          oldId
        );

      // =====================================================
      // RESPONSÁVEL ATUAL DE OUTROS MEMBROS
      // =====================================================
      //
      // Se a pessoa que trocou de Discord também era
      // responsável por outros membros, atualiza somente
      // o ponteiro atual.
      //
      // O histórico antigo continua intacto.
      // =====================================================

      for (
        const otherRec
        of SC_GI_STATE
          .registros
          .values()
      ) {
        if (
          String(
            otherRec
              ?.responsibleUserId ||
            ''
          ) ===
          oldId
        ) {
          otherRec
            .responsibleUserId =
            newId;
        }
      }

      // =====================================================
      // BYPASS TEMPORÁRIO
      // =====================================================

      if (
        globalThis
          .__SC_ROLE_BYPASS__
          instanceof Map
      ) {
        const oldBypass =
          Number(
            globalThis
              .__SC_ROLE_BYPASS__
              .get(
                oldId
              ) ||
            0
          );

        const newBypass =
          Number(
            globalThis
              .__SC_ROLE_BYPASS__
              .get(
                newId
              ) ||
            0
          );

        if (
          oldBypass ||
          newBypass
        ) {
          globalThis
            .__SC_ROLE_BYPASS__
            .set(
              newId,
              Math.max(
                oldBypass,
                newBypass
              )
            );
        }

        globalThis
          .__SC_ROLE_BYPASS__
          .delete(
            oldId
          );
      }

      // =====================================================
      // TIMER DE RESTAURAÇÃO
      // =====================================================

      if (
        SC_GI_STATE
          .restoreTimers
          .has(
            oldId
          )
      ) {
        clearTimeout(
          SC_GI_STATE
            .restoreTimers
            .get(
              oldId
            )
        );

        SC_GI_STATE
          .restoreTimers
          .delete(
            oldId
          );
      }

      if (
        SC_GI_STATE
          .roleSnapshots
          .has(
            newId
          ) &&
        typeof scheduleRestoreRoles ===
          'function'
      ) {
        await scheduleRestoreRoles(
          guild,
          newId
        ).catch(
          () => {}
        );
      }
    }

    // =====================================================
    // TRANSFERE OS CARGOS DO DISCORD ANTIGO PARA O NOVO
    // =====================================================

    async function transferDiscordMemberRoles(
      guild,
      oldUserId,
      newUserId
    ) {
      const oldMember =
        await guild.members
          .fetch(
            oldUserId
          )
          .catch(
            () => null
          );

      const newMember =
        await guild.members
          .fetch(
            newUserId
          )
          .catch(
            () => null
          );

      if (
        !newMember
      ) {
        throw new Error(
          'O novo ID Discord não está no servidor.'
        );
      }

      if (
        newMember
          .user
          ?.bot
      ) {
        throw new Error(
          'O novo ID informado pertence a um bot.'
        );
      }

      // Conta antiga já saiu do servidor.
      //
      // Ainda podemos fazer a troca de identidade,
      // apenas não haverá cargos ao vivo para remover.

      if (
        !oldMember
      ) {
        return {
          oldMember:
            null,

          newMember,

          transferableRoleIds:
            [],

          addedRoleIds:
            [],

          removedRoleIds:
            [],

          skippedRoleIds:
            [],

          newNicknameBefore:
            newMember.nickname,

          nicknameTransferred:
            false,

          oldMemberMissing:
            true
        };
      }

      const botMember =
        guild.members.me ||
        await guild.members
          .fetch(
            client.user.id
          )
          .catch(
            () => null
          );

      if (
        !botMember
      ) {
        throw new Error(
          'Não consegui validar a hierarquia de cargos do bot.'
        );
      }

      // Somente cargos que o bot realmente consegue administrar.

      const transferableRoles =
        oldMember
          .roles
          .cache
          .filter(
            role =>
              role.id !==
                guild.id &&
              !role.managed &&
              role.comparePositionTo(
                botMember
                  .roles
                  .highest
              ) < 0
          );

      // Cargos impossíveis de transferir.
      //
      // Exemplo:
      // - cargos managed
      // - integração
      // - cargo acima do bot

      const skippedRoles =
        oldMember
          .roles
          .cache
          .filter(
            role =>
              role.id !==
                guild.id &&
              (
                role.managed ||
                role.comparePositionTo(
                  botMember
                    .roles
                    .highest
                ) >= 0
              )
          );

      const transferableRoleIds =
        transferableRoles
          .map(
            role =>
              role.id
          );

      const addedRoleIds =
        transferableRoleIds
          .filter(
            roleId =>
              !newMember
                .roles
                .cache
                .has(
                  roleId
                )
          );

      const newNicknameBefore =
        newMember.nickname;

      try {
        // Primeiro coloca no novo.
        //
        // Isso evita tirar tudo do antigo e só depois
        // descobrir que não consegue colocar no novo.

        if (
          addedRoleIds.length
        ) {
          await newMember
            .roles
            .add(
              addedRoleIds,
              `Troca de Discord: ${oldUserId} -> ${newUserId}`
            );
        }

        // Depois de confirmar a adição,
        // remove da conta antiga.

        if (
          transferableRoleIds.length
        ) {
          await oldMember
            .roles
            .remove(
              transferableRoleIds,
              `Troca de Discord: ${oldUserId} -> ${newUserId}`
            );
        }
      } catch (
        error
      ) {
        // Se der erro, devolve o novo membro
        // ao estado anterior.

        if (
          addedRoleIds.length
        ) {
          await newMember
            .roles
            .remove(
              addedRoleIds,
              'Rollback da troca de Discord'
            )
            .catch(
              () => {}
            );
        }

        throw new Error(
          `Falha ao transferir cargos entre as contas: ${error?.message || error}`
        );
      }

      let nicknameTransferred =
        false;

      if (
        oldMember.nickname &&
        newMember.manageable
      ) {
        nicknameTransferred =
          await newMember
            .setNickname(
              oldMember.nickname,
              `Troca de Discord: ${oldUserId} -> ${newUserId}`
            )
            .then(
              () => true
            )
            .catch(
              () => false
            );
      }

      return {
        oldMember,

        newMember,

        transferableRoleIds,

        addedRoleIds,

        removedRoleIds:
          transferableRoleIds,

        skippedRoleIds:
          skippedRoles
            .map(
              role =>
                role.id
            ),

        newNicknameBefore,

        nicknameTransferred,

        oldMemberMissing:
          false
      };
    }

    // =====================================================
    // ROLLBACK DOS CARGOS
    // =====================================================

    async function rollbackDiscordMemberRoles(
      transferResult
    ) {
      if (
        !transferResult
      ) {
        return;
      }

      const {
        oldMember,
        newMember,
        removedRoleIds = [],
        addedRoleIds = [],
        newNicknameBefore
      } =
        transferResult;

      // Devolve os cargos ao antigo.

      if (
        oldMember &&
        removedRoleIds.length
      ) {
        await oldMember
          .roles
          .add(
            removedRoleIds,
            'Rollback da troca de Discord'
          )
          .catch(
            () => {}
          );
      }

      // Remove os cargos adicionados no novo.

      if (
        newMember &&
        addedRoleIds.length
      ) {
        await newMember
          .roles
          .remove(
            addedRoleIds,
            'Rollback da troca de Discord'
          )
          .catch(
            () => {}
          );
      }

      // Restaura nickname anterior do novo membro.

      if (
        newMember
          ?.manageable
      ) {
        await newMember
          .setNickname(
            newNicknameBefore ||
            null,

            'Rollback da troca de Discord'
          )
          .catch(
            () => {}
          );
      }
    }

    // =====================================================
    // FUNÇÃO CENTRAL
    // =====================================================

    async function migrateDiscordIdentityForGI({
      guild,
      editor,
      rec,
      messageId,
      newUserId
    }) {
      const oldUserId =
        String(
          rec.targetId ||
          ''
        ).trim();

      const nextUserId =
        String(
          newUserId ||
          ''
        ).trim();

      // Se não mudou o Discord,
      // não executa nenhuma migração.

      if (
        !nextUserId ||
        nextUserId ===
          oldUserId
      ) {
        return {
          changed:
            false,

          oldUserId,

          newUserId:
            oldUserId,

          formsResult: {
            status:
              'unchanged'
          },

          roleTransfer:
            null
        };
      }

      // =====================================================
      // VALIDA ID
      // =====================================================

      if (
        !/^\d{17,20}$/.test(
          nextUserId
        )
      ) {
        throw new Error(
          'Novo ID Discord inválido. Informe somente o ID numérico da conta.'
        );
      }

      // =====================================================
      // NÃO PERMITE DUPLICAR REGISTRO GI
      // =====================================================

      const duplicatedGIRecord =
        Array.from(
          SC_GI_STATE
            .registros
            .values()
        )
          .find(
            item =>
              String(
                item
                  ?.messageId ||
                ''
              ) !==
                String(
                  messageId
                ) &&
              String(
                item
                  ?.targetId ||
                ''
              ) ===
                nextUserId
          );

      if (
        duplicatedGIRecord
      ) {
        throw new Error(
          'O novo Discord já possui outro registro Gestaoinfluencer. A troca foi bloqueada para não misturar históricos.'
        );
      }

      // =====================================================
      // CONFERE MÓDULO CENTRAL
      // =====================================================

      if (
        typeof validateDiscordIdentityMigration !==
          'function' ||
        typeof registerDiscordIdentityMigration !==
          'function' ||
        typeof rollbackDiscordIdentityMigration !==
          'function'
      ) {
        throw new Error(
          'Módulo central de identidade indisponível. A troca foi bloqueada para evitar perda de pontos.'
        );
      }

      // =====================================================
      // CONFERE FORMSCREATOR
      // =====================================================

      if (
        typeof migrateFormsCreatorDiscordId !==
          'function'
      ) {
        throw new Error(
          'Integração do FormsCreator sem suporte à troca de Discord. A troca foi bloqueada para evitar histórico quebrado.'
        );
      }

      // =====================================================
      // VALIDA IDENTIDADE
      // =====================================================

      validateDiscordIdentityMigration(
        oldUserId,
        nextUserId
      );

      // =====================================================
      // NOVO MEMBRO PRECISA ESTAR NO SERVIDOR
      // =====================================================

      const newMember =
        await guild.members
          .fetch(
            nextUserId
          )
          .catch(
            () => null
          );

      if (
        !newMember
      ) {
        throw new Error(
          'O novo ID Discord precisa estar dentro do servidor antes da troca.'
        );
      }

      // =====================================================
      // TRANSFERE CARGOS
      // =====================================================

      const roleTransfer =
        await transferDiscordMemberRoles(
          guild,
          oldUserId,
          nextUserId
        );

      let identityRegistered =
        false;

      let formsMigrated =
        false;

      let ticketMigrated =
        false;

      let weeklyMigrated =
        false;

      let giInternalMigrated =
        false;

      const identitySnapshot = {
        targetId:
          rec.targetId,

        personalTicketChannelId:
          rec.personalTicketChannelId ||
          null,

        discordIdHistory:
          Array.isArray(
            rec.discordIdHistory
          )
            ? structuredClone(
                rec.discordIdHistory
              )
            : [],

        lastDiscordMigration:
          rec.lastDiscordMigration
            ? structuredClone(
                rec.lastDiscordMigration
              )
            : null,
      };

      let formsResult = {
        status:
          "not_started",
      };

      let ticketResult = {
        status:
          "not_started",
      };

      try {
        // =====================================================
        // 1. MIGRA O FORMS ANTES DE REGISTRAR O ALIAS CENTRAL
        // =====================================================

        formsResult =
          await migrateFormsCreatorDiscordId(
            guild.client,
            {
              oldUserId,

              newUserId:
                nextUserId,

              actor:
                editor
            }
          );

        // =====================================================
        // MARCA SE A IDENTIDADE DO FORMS JÁ FOI ALTERADA
        // =====================================================
        //
        // "partial" significa que o registro principal do Forms
        // já foi migrado, mas alguma etapa complementar
        // (Evolução ou espelho) não terminou corretamente.
        //
        // Portanto ele também precisa entrar no rollback.
        // =====================================================

        formsMigrated =
          formsResult?.status ===
            "synced" ||
          formsResult?.status ===
            "partial";

        if (
          formsResult?.status !==
            "synced" &&
          formsResult?.status !==
            "unchanged"
        ) {
          throw new Error(
            `O FormsCreator não foi migrado completamente. Status: ${formsResult?.status || "desconhecido"}.`
          );
        }

        // =====================================================
        // 2. MIGRA O TICKET PESSOAL
        // =====================================================

        const personalTicketApi =
          globalThis
            .SC_PERSONAL_TICKET_API;

        if (
          personalTicketApi &&
          typeof personalTicketApi
            .migrateDiscordIdentity ===
            "function"
        ) {
          ticketResult =
            await personalTicketApi
              .migrateDiscordIdentity({
                guild,

                channelId:
                  rec.personalTicketChannelId ||
                  null,

                oldUserId,

                newUserId:
                  nextUserId,

                reason:
                  `Troca de Discord pelo Controle GI: ${oldUserId} -> ${nextUserId}`,
              });

          ticketMigrated =
            ticketResult?.status ===
            "synced";

          if (
            rec.personalTicketChannelId &&
            ticketResult?.status !==
              "synced" &&
            ticketResult?.status !==
              "unchanged"
          ) {
            throw new Error(
              `O ticket pessoal vinculado ao Controle GI não foi migrado. Status: ${ticketResult?.status || "desconhecido"}.`
            );
          }

          if (
            ticketResult?.channelId
          ) {
            rec.personalTicketChannelId =
              String(
                ticketResult.channelId
              );
          }
        } else if (
          rec.personalTicketChannelId
        ) {
          throw new Error(
            "Existe ticket pessoal vinculado, mas a API de migração do ticket está indisponível."
          );
        }

        // =====================================================
        // 3. MIGRA O ESTADO DO FEEDBACK SEMANAL
        // =====================================================

        if (
          typeof migrateWeeklyMemberAiFeedbackDiscordId ===
            "function"
        ) {
          const weeklyResult =
            migrateWeeklyMemberAiFeedbackDiscordId(
              oldUserId,
              nextUserId
            );

          weeklyMigrated =
            weeklyResult?.changed ===
            true;
        }

        // =====================================================
        // 4. HISTÓRICO DA TROCA
        // =====================================================

        rec.discordIdHistory =
          Array.isArray(
            rec.discordIdHistory
          )
            ? rec.discordIdHistory
            : [];

        rec.discordIdHistory.push({
          from:
            oldUserId,

          to:
            nextUserId,

          changedAtMs:
            nowMs(),

          changedBy:
            editor.id
        });

        rec.lastDiscordMigration = {
          from:
            oldUserId,

          to:
            nextUserId,

          changedAtMs:
            nowMs(),

          changedBy:
            editor.id
        };

        // =====================================================
        // 5. TROCA O ID PRINCIPAL
        // =====================================================

        rec.targetId =
          nextUserId;

        // =====================================================
        // 6. MOVE ESTADOS INTERNOS DO GI
        // =====================================================

        await migrateGIInternalIdentityState(
          guild,
          oldUserId,
          nextUserId
        );

        giInternalMigrated =
          true;

        // =====================================================
        // 7. REGISTRA O ALIAS CENTRAL SOMENTE AGORA
        // =====================================================

        const identityResult =
          registerDiscordIdentityMigration({
            oldUserId,

            newUserId:
              nextUserId,

            actorId:
              editor.id,

            reason:
              'Troca de Discord pelo Editar Registro do Gestaoinfluencer'
          });

        identityRegistered =
          identityResult
            ?.changed ===
          true;

        // =====================================================
        // 8. SALVA O CONTROLE GI
        // =====================================================

        await SC_GI_saveNow();

        // =====================================================
        // 9. AVISA DASHBOARD / RANKING / OUTROS MÓDULOS
        // =====================================================

        dashEmit(
          'identity:migrated',
          {
            oldUserId,

            newUserId:
              nextUserId,

            actorId:
              editor.id,

            formsThreadId:
              formsResult?.threadId ||
              null,

            personalTicketChannelId:
              rec.personalTicketChannelId ||
              ticketResult?.channelId ||
              null,

            __at:
              Date.now()
          }
        );

        // =====================================================
        // 10. LOG NORMAL
        // =====================================================

        await logMsg(
          guild,
          'Troca de Discord (GI)',
          [
            `🔁 **Discord anterior:** <@${oldUserId}> (\`${oldUserId}\`)`,
            `✅ **Discord atual:** <@${nextUserId}> (\`${nextUserId}\`)`,
            `🧾 **Executado por:** <@${editor.id}> (\`${editor.id}\`)`,
            "",
            `📚 **FormsCreator:** ${formsResult?.status || "desconhecido"}`,
            `🎫 **Ticket pessoal:** ${ticketResult?.status || "não localizado"}`,
            `🧠 **Feedback semanal:** ${weeklyMigrated ? "estado migrado" : "sem estado antigo para migrar"}`,
            `🎭 **Cargos transferidos:** ${roleTransfer.removedRoleIds.length}`,
            "",
            roleTransfer.skippedRoleIds.length
              ? `⚠️ **Cargos não gerenciáveis pelo bot:** ${formatRoleMentions(roleTransfer.skippedRoleIds)}`
              : "✅ **Cargos não gerenciáveis:** nenhum",
            "",
            roleTransfer.oldMemberMissing
              ? "⚠️ A conta antiga não estava mais no servidor."
              : "✅ Os cargos transferíveis foram removidos da conta antiga.",
            "",
            "📊 **Ranking:** histórico antigo continua resolvido pela identidade canônica.",
            "🧠 **Auditoria:** nenhum histórico antigo foi apagado."
          ].join(
            "\n"
          )
        ).catch(
          () => {}
        );

        // =====================================================
        // 11. LOG HISTÓRICO INDIVIDUAL
        // =====================================================

        if (
          typeof logMemberHistoryEvent ===
            "function"
        ) {
          await logMemberHistoryEvent(
            guild,
            {
              type:
                "Troca de Discord",

              memberId:
                nextUserId,

              actorId:
                editor.id,

              before: {
                discordId:
                  oldUserId,

                formsUserId:
                  oldUserId,

                ticketOwnerId:
                  oldUserId,
              },

              after: {
                discordId:
                  nextUserId,

                formsStatus:
                  formsResult?.status ||
                  null,

                ticketStatus:
                  ticketResult?.status ||
                  null,
              },

              addedRoleIds:
                roleTransfer.addedRoleIds ||
                [],

              removedRoleIds:
                roleTransfer.removedRoleIds ||
                [],

              record:
                rec,

              note:
                "Identidade histórica preservada do ID antigo para o novo.",
            }
          ).catch(
            () => {}
          );
        }

        return {
          changed:
            true,

          oldUserId,

          newUserId:
            nextUserId,

          formsResult,

          ticketResult,

          roleTransfer
        };
      } catch (
        error
      ) {
        console.error(
          `[SC_GI] Falha na migração transacional ${oldUserId} -> ${nextUserId}:`,
          error
        );

        // =====================================================
        // ROLLBACK DO ALIAS CENTRAL
        // =====================================================

        if (
          identityRegistered
        ) {
          try {
            rollbackDiscordIdentityMigration({
              oldUserId,

              newUserId:
                nextUserId
            });
          } catch {}
        }

        // =====================================================
        // ROLLBACK DO GI INTERNO
        // =====================================================

        if (
          giInternalMigrated
        ) {
          await migrateGIInternalIdentityState(
            guild,
            nextUserId,
            oldUserId
          ).catch(
            () => {}
          );
        }

        rec.targetId =
          identitySnapshot.targetId;

        rec.personalTicketChannelId =
          identitySnapshot
            .personalTicketChannelId;

        rec.discordIdHistory =
          identitySnapshot
            .discordIdHistory;

        rec.lastDiscordMigration =
          identitySnapshot
            .lastDiscordMigration;

        // =====================================================
        // ROLLBACK DO FEEDBACK SEMANAL
        // =====================================================

        if (
          weeklyMigrated &&
          typeof migrateWeeklyMemberAiFeedbackDiscordId ===
            "function"
        ) {
          try {
            migrateWeeklyMemberAiFeedbackDiscordId(
              nextUserId,
              oldUserId
            );
          } catch {}
        }

        // =====================================================
        // ROLLBACK DO TICKET
        // =====================================================

        if (
          ticketMigrated &&
          globalThis
            .SC_PERSONAL_TICKET_API &&
          typeof globalThis
            .SC_PERSONAL_TICKET_API
            .migrateDiscordIdentity ===
            "function"
        ) {
          await globalThis
            .SC_PERSONAL_TICKET_API
            .migrateDiscordIdentity({
              guild,

              channelId:
                ticketResult?.channelId ||
                identitySnapshot
                  .personalTicketChannelId ||
                null,

              oldUserId:
                nextUserId,

              newUserId:
                oldUserId,

              reason:
                "Rollback automático da troca de Discord",
            })
            .catch(
              () => {}
            );
        }

        // =====================================================
        // ROLLBACK DO FORMS
        // =====================================================

        if (
          formsMigrated
        ) {
          await migrateFormsCreatorDiscordId(
            guild.client,
            {
              oldUserId:
                nextUserId,

              newUserId:
                oldUserId,

              actor:
                guild.client.user
            }
          ).catch(
            rollbackError =>
              console.error(
                "[SC_GI] Falha grave ao reverter FormsCreator:",
                rollbackError
              )
          );
        }

        // =====================================================
        // ROLLBACK DOS CARGOS
        // =====================================================

        await rollbackDiscordMemberRoles(
          roleTransfer
        );

        await SC_GI_saveNow()
          .catch(
            () => {}
          );

        throw error;
      }
    }

    async function editRegistro(
      guild,
      editor,
      messageId,
      newArea,
      newNote,
      newDateStr,
      newDiscordId
    ) {
      const rec =
        SC_GI_STATE
          .registros
          .get(
            messageId
          );

      if (!rec) {
        throw new Error(
          'Registro não encontrado.'
        );
      }

      await assertCanManageGIRecord(
        guild,
        editor,
        rec.targetId,
        'editar o controle e alterar a Área/cargo',
        { allowCoordAreaEdit: true }
      );

      const ch =
        await guild.channels
          .fetch(rec.channelId)
          .catch(() => null);

      if (!ch) {
        throw new Error('Canal indisponível.');
      }

      const msg =
        await ch.messages
          .fetch(messageId)
          .catch(() => null);

      if (!msg) {
        throw new Error('Mensagem do registro não encontrada.');
      }

      const typedArea =
        String(newArea || "").trim();

      const newAreaProfile =
        resolveAreaProfile(
          typedArea
        );

      if (!newAreaProfile) {
        throw new Error(
          "Não consegui identificar com segurança essa Área de Interesse."
        );
      }

      const requestedDiscordId =
        String(
          newDiscordId ||
          rec.targetId ||
          ""
        ).trim();

      const identityMigrationResult =
        await migrateDiscordIdentityForGI({
          guild,
          editor,
          rec,
          messageId,

          newUserId:
            requestedDiscordId
        });

      const previousArea =
        String(
          rec.area ||
          "A Definir"
        ).trim();

      const previousAreaProfile =
        resolveAreaProfile(
          previousArea
        );

      const previousCanonicalArea =
        previousAreaProfile?.canonicalName ||
        previousArea;

      const canonicalArea =
        newAreaProfile.canonicalName;

      const institutionalAreaChanged =
        previousCanonicalArea !== canonicalArea;

      const storedAreaChanged =
        previousArea !== canonicalArea;

      let transitionResult = {
        addedRoleIds: [],
        removedRoleIds: [],
        nicknameBefore: null,
        nicknameAfter: null,
        nicknameUpdated: false,
        roleTransitionSkipped: false
      };

      // Reaplica Equipe Creator para corrigir registros salvos
      // quando esse perfil ainda ignorava a troca de cargos.
      if (
        institutionalAreaChanged ||
        newAreaProfile === AREA_PROFILES.EQUIPE_CREATOR
      ) {
        await assertCanSetArea(
          guild,
          editor,
          rec.targetId,
          newAreaProfile
        );

        transitionResult =
          await applyAreaRoleTransition(
            guild,
            rec,
            newAreaProfile
          );
      }

      if (
        institutionalAreaChanged
      ) {
        rec.areaHistory =
          Array.isArray(
            rec.areaHistory
          )
            ? rec.areaHistory
            : [];

        // Registros antigos ainda podem não possuir areaHistory.
        // Neste caso reconstruímos a fase anterior
        // usando a criação do Controle GI como início mínimo conhecido.

        if (
          rec.areaHistory.length ===
            0
        ) {
          rec.areaHistory.push({
            area:
              previousCanonicalArea,

            startedAtMs:
              Number(
                rec.createdAtMs ||
                rec.joinDateMs ||
                nowMs()
              ),

            endedAtMs:
              nowMs(),

            changedBy:
              editor.id,

            source:
              "legacy_reconstructed",
          });
        } else {
          const currentHistory =
            rec.areaHistory[
              rec.areaHistory.length -
              1
            ];

          if (
            currentHistory &&
            !currentHistory
              .endedAtMs
          ) {
            currentHistory.endedAtMs =
              nowMs();
          }
        }

        rec.areaHistory.push({
          area:
            canonicalArea,

          startedAtMs:
            nowMs(),

          endedAtMs:
            null,

          changedBy:
            editor.id,

          source:
            "gi_edit",
        });
      }

      rec.area =
        canonicalArea;

      rec.note =
        (newNote || "").trim();

      if (newDateStr) {
        const ms =
          fromDDMMYYYY_toMs(
            newDateStr
          );

        if (ms) {
          rec.joinDateMs = ms;

          if (rec.active) {
            rec.nextWeekTickMs =
              computeNextWeekTick(
                rec.joinDateMs
              );
          }
        }
      }

      SC_GI_scheduleSave();

      let formsSyncResult = {
        status: "unchanged",
        threadId: null,
        error: null
      };

      if (
        storedAreaChanged ||
        identityMigrationResult.changed ||
        newAreaProfile === AREA_PROFILES.EQUIPE_CREATOR
      ) {
        formsSyncResult =
          await syncAreaToFormsCreator(
            rec,
            canonicalArea,
            editor
          );
      }

      const targetUser =
        await fetchUserCached(
          rec.targetId
        );

      const registrarUser =
        await fetchUserCached(
          rec.registrarId
        );

      const days =
        daysBetween(
          rec.joinDateMs,
          nowMs()
        );

      const weeks =
        Math.max(
          0,
          Math.floor(days / 7)
        );

      const months =
        monthsSince(
          rec.joinDateMs
        );

      const emb =
        await registroEmbed({
          targetUser,
          registrarUser,
          joinDateMs: rec.joinDateMs,
          area: rec.area,
          weeks,
          months,
          active: rec.active,
          rec
        });

      await msg.edit({
        embeds: [emb],
        components:
          registroButtons(
            messageId,
            rec.active
          )
      });

      if (
        institutionalAreaChanged ||
        storedAreaChanged
      ) {
        const formsText =
          formsSyncResult.status === "synced"
            ? "✅ sincronizado"
            : formsSyncResult.status === "pending"
              ? "⏳ registro original atualizado; espelho será sincronizado em segundo plano"
            : formsSyncResult.status === "partial"
              ? "⚠️ registro original atualizado; resumo do tópico ativo pendente"
            : formsSyncResult.status === "not_found"
              ? "⚠️ tópico não encontrado"
              : formsSyncResult.status === "failed"
                ? `❌ falhou: ${formsSyncResult.error}`
                : formsSyncResult.status === "unavailable"
                  ? "⚠️ integração indisponível"
                  : "➖ sem alteração";

        await logMsg(
          guild,
          "Mudança Inteligente de Área",
          [
            `🧾 **Executor:** <@${editor.id}> (\`${editor.id}\`)`,
            `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
            `⌨️ **Entrada digitada:** \`${typedArea}\``,
            `🧠 **Identificado como:** \`${canonicalArea}\``,
            `📤 **Área anterior:** \`${previousArea}\``,
            `📥 **Nova área:** \`${canonicalArea}\``,
            "",
            `🧹 **Cargos removidos:** ${formatRoleMentions(transitionResult.removedRoleIds)}`,
            `➕ **Cargos adicionados:** ${formatRoleMentions(transitionResult.addedRoleIds)}`,
            transitionResult.roleTransitionSkipped
              ? "🛡️ **Pacote de cargos:** não alterado para esta Área."
              : "✅ **Pacote de cargos:** processado.",
            transitionResult.nicknameUpdated
              ? `🏷️ **Nickname:** \`${transitionResult.nicknameBefore || "Sem nickname"}\` → \`${transitionResult.nicknameAfter}\``
              : "🏷️ **Nickname:** sem alteração.",
            `📚 **FormsCreator:** ${formsText}`,
            "",
            `🟢 **Status GI:** ${rec.active ? "Ativo" : "Pausado"}`,
            "ℹ️ O cargo Gestaoinfluencer continua sendo controlado pela regra atual de pausa/despausa."
          ].join("\n")
        );
      }

      await logMsg(
        guild,
        'Registro Editado (GI)',
        [
          `🧾 **Editor:** <@${editor.id}> (\`${editor.id}\`)`,
          `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
          `🧭 **Nova área:** \`${rec.area}\``,
          `🗓️ **Nova data:** \`${msToDDMMYYYY(rec.joinDateMs)}\``,
          rec.note ? `🗒️ **Nota:** ${rec.note}` : '',
          `🔗 **Link:** [Abrir registro](https://discord.com/channels/${guild.id}/${rec.channelId}/${rec.messageId})`
        ].filter(Boolean).join('\n'),
        {
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`SC_GI_UNDO_EDIT:${messageId}`)
                .setLabel('Reverter Edição')
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        }
      );

      await logMemberHistoryEvent(
        guild,
        {
          type:
            institutionalAreaChanged
              ? "Alteração de Área / Cargo"
              : "Edição do Controle GI",

          memberId:
            rec.targetId,

          actorId:
            editor.id,

          before: {
            discordId:
              identityMigrationResult
                ?.oldUserId ||
              rec.targetId,

            area:
              previousArea,

            dataEntrada:
              msToDDMMYYYY(
                rec.joinDateMs
              ),
          },

          after: {
            discordId:
              rec.targetId,

            area:
              canonicalArea,

            nickname:
              transitionResult.nicknameAfter ||
              transitionResult.nicknameBefore ||
              null,

            nota:
              rec.note ||
              null,

            dataEntrada:
              msToDDMMYYYY(
                rec.joinDateMs
              ),
          },

          addedRoleIds:
            transitionResult.addedRoleIds,

          removedRoleIds:
            transitionResult.removedRoleIds,

          record:
            rec,

          note:
            institutionalAreaChanged
              ? `${previousArea} -> ${canonicalArea}`
              : "Registro editado sem mudança institucional de área.",
        }
      );

      scheduleRespBoardRender(
        guild
      );

      return {
        previousArea,
        canonicalArea,
        institutionalAreaChanged,
        storedAreaChanged,
        addedRoleIds:
          transitionResult.addedRoleIds,
        removedRoleIds:
          transitionResult.removedRoleIds,
        nicknameUpdated:
          transitionResult.nicknameUpdated,
        nicknameBefore:
          transitionResult.nicknameBefore,
        nicknameAfter:
          transitionResult.nicknameAfter,
        roleTransitionSkipped:
          transitionResult.roleTransitionSkipped,

        identityMigration:
          identityMigrationResult,

        formsSyncResult
      };
    }


    async function refreshRegistroMessage(
      guild,
      actor,
      messageId,
      reason = 'Atualização manual',
      options = {}
    ) {
  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) throw new Error('Registro não encontrado.');

  const ch = await guild.channels.fetch(rec.channelId).catch(() => null);
  if (!ch) throw new Error('Canal indisponível.');

  const msg = await ch.messages.fetch(rec.messageId).catch(() => null);
  if (!msg) throw new Error('Mensagem do registro não encontrada.');

  const targetUser = await fetchUserCached(rec.targetId);
  const registrarUser = await fetchUserCached(rec.registrarId);

  const emb = await registroEmbed({
    targetUser,
    registrarUser,
    joinDateMs: rec.joinDateMs,
    area: rec.area,
    weeks: weeksSince(rec.joinDateMs),
    months: monthsSince(rec.joinDateMs),
    active: rec.active,
    rec
  });

  await msg.edit({
    embeds: [emb],
    components: registroButtons(rec.messageId, rec.active)
  });

  rec.lastControlVisualRefreshAtMs =
    nowMs();

  SC_GI_scheduleSave();
if (
  rec.active === false
) {
  scheduleGiAutoDisableTimer(
    rec
  );
} else {
  clearGiAutoDisableTimer(
    rec.messageId
  );
}
  if (options.log !== false) {
  await logMsg(
    guild,
    'Controle Atualizado (GI)',
    [
      `🔄 **Motivo:** ${reason}`,
      `🔧 **Por:** <@${actor.id}>`,
      `👤 **Membro:** <@${rec.targetId}>`,
      `📌 **Status:** ${rec.active ? 'Ativo' : 'Pausado'}`,
      `⏳ **Tempo ativo real:** \`${activeTimeText(rec)}\``,
      !rec.active ? `⏸️ **Pausado acumulado:** \`${formatDurationFull(getPausedTotalMs(rec))}\`` : '',
      !rec.active ? `🧨 **Auto-desligamento em:** ${pauseCountdownText(rec)}` : '',
      `🔗 **Registro:** ${recordLink(rec.guildId || guild.id, rec.channelId, rec.messageId) || 'Não disponível'}`
    ].filter(Boolean).join('\n')
  );
  }

  return rec;
}

   async function toggleActive(guild, actor, messageId) {
  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) throw new Error('Registro não encontrado.');

  const previousActive =
    rec.active ===
    true;

  const previousPausedAtMs =
    rec.pausedAtMs ||
    null;

  const previousTotalPausedMs =
    Number(
      rec.totalPausedMs ||
      0
    );

  await assertCanManageGIRecord(
    guild,
    actor,
    rec.targetId,
    rec.active ? 'pausar a contagem' : 'retomar a contagem'
  );
      const ch  = await guild.channels.fetch(rec.channelId).catch(() => null);
      if (!ch) throw new Error('Canal indisponível.');
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (!msg) throw new Error('Mensagem do registro não encontrada.');

      // PAUSAR / DESPAUSAR
      if (rec.active) {
        // Primeiro confirma a remoção do cargo.
        // Só depois altera o state.
        const roleRemoved =
          await removeGIRole(
            guild,
            rec.targetId,
            'Pausado via botão'
          );

        if (!roleRemoved) {
          throw new Error(
            `Não consegui remover o cargo GI de <@${rec.targetId}>. ` +
            'Confira a permissão Gerenciar Cargos e a posição do cargo do bot.'
          );
        }

        rec.active = false;
        rec.pausedAtMs = nowMs();
      } else {
        // Primeiro confirma que o cargo voltou.
        // Só depois marca o registro como Ativo.
        const roleAdded =
          await addGIRole(
            guild,
            rec.targetId,
            'Retomado via botão (GI obrigatório)'
          );

        if (!roleAdded) {
          throw new Error(
            `Não consegui adicionar o cargo GI em <@${rec.targetId}>. ` +
            'Confira a permissão Gerenciar Cargos e a posição do cargo do bot.'
          );
        }

        rec.active = true;

        if (rec.pausedAtMs) {
          rec.totalPausedMs +=
            (
              nowMs() -
              rec.pausedAtMs
            );

          rec.pausedAtMs =
            null;
        }

        if (!rec.nextWeekTickMs) {
          rec.nextWeekTickMs =
            computeNextWeekTick(
              rec.joinDateMs
            );
        }

        // ✅ AVISA O DASH/RANKING QUE A PESSOA VOLTOU
        emitGIReturned(rec.targetId, {
          reason: 'despause_registro',
          messageId: rec.messageId
        });

        // ✅ atualiza status visual SEM mudar a data histórica do primeiro set
        try {
          const member = await fetchMemberCached(guild, rec.targetId);
          const hasTrackedRole = !!(
            member &&
            (member.roles.cache.has(GI_ROLE_ID) || member.roles.cache.has(CREATOR_BASE_ROLE_ID))
          );

          if (hasTrackedRole) {
            rec.warnNoRoleGI = false;

            // não sobrescreve nunca a data se já existir
            if (!rec.roleSetAtMs) {
              rec.roleSetAtMs = await resolveInitialRoleSetAtMs(guild, rec.targetId);
            }
          } else {
            rec.warnNoRoleGI = true;
          }
        } catch {}
      }
      rec.activityHistory =
        Array.isArray(
          rec.activityHistory
        )
          ? rec.activityHistory
          : [];

      rec.activityHistory.push({
        status:
          rec.active
            ? "active"
            : "paused",

        atMs:
          nowMs(),

        changedBy:
          actor.id,

        reason:
          rec.active
            ? "Controle despausado"
            : "Controle pausado",
      });

      SC_GI_scheduleSave();

      // atualiza embed
      const targetUser    = await fetchUserCached(rec.targetId);
      const registrarUser = await fetchUserCached(rec.registrarId);
      const days   = daysBetween(rec.joinDateMs, nowMs());
      const weeks  = Math.max(0, Math.floor(days / 7));
      const months = monthsSince(rec.joinDateMs);

      const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });
      await msg.edit({ embeds: [emb], components: registroButtons(messageId, rec.active) });

      // ✅ DM avisando pause/resume
      if (targetUser) {
        const paused =
          !rec.active;

        const dmEmb =
          dmPauseEmbed(
            rec,
            targetUser,
            paused
          );

        let lifecycleBundle =
          null;

        if (
          typeof generateMemberLifecyclePrivateDm ===
            "function"
        ) {
          lifecycleBundle =
            await generateMemberLifecyclePrivateDm({
              client:
                guild.client,

              guild,

              record:
                rec,

              eventType:
                paused
                  ? "paused"
                  : "resumed",

              reason:
                paused
                  ? "Controle pausado por inatividade"
                  : "Controle despausado após retorno de atividade",
            })
            .catch(
              error => {
                console.warn(
                  `[SC_GI] IA de ${paused ? "pausa" : "retorno"} indisponível para ${rec.targetId}:`,
                  error?.message ||
                  error
                );

                return null;
              }
            );
        }

        const lifecycleEmbeds =
          (
            lifecycleBundle
              ?.chunks ||
            []
          ).map(
            (
              chunk,
              index
            ) => ({
              color:
                paused
                  ? 0xe67e22
                  : 0x2ecc71,

              title:
                index ===
                0
                  ? (
                      paused
                        ? "💡 Sobre sua pausa"
                        : "💜 Sobre seu retorno"
                    )
                  : "💬 Continuação",

              description:
                chunk,

              footer: {
                text:
                  "SantaCreators • acompanhamento pessoal",
              },
            })
          );

        await sendDM_andMirror(
          guild,
          targetUser,
          dmEmb,
          "",
          lifecycleEmbeds
        );
      }

      await logMsg(
        guild,
        rec.active ? 'Contagem Retomada (GI)' : 'Contagem Pausada (GI)',
        [
          `🔧 **Por:** <@${actor.id}> (\`${actor.id}\`)`,
          `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
          rec.active
            ? `✅ **Cargo GI setado novamente:** <@&${GI_ROLE_ID}>`
            : `⛔ **Cargo GI removido:** <@&${GI_ROLE_ID}>`,
          `⏳ **Tempo ativo real:** \`${activeTimeText(rec)}\``,
          !rec.active ? `⏸️ **Tempo pausado acumulado:** \`${formatDurationFull(getPausedTotalMs(rec))}\`` : '',
          `🔗 **Link:** [Abrir registro](https://discord.com/channels/${guild.id}/${rec.channelId}/${rec.messageId})`
        ].filter(Boolean).join('\n'),
        {
          color: rec.active ? 0x2ecc71 : 0xe67e22,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`SC_GI_UNDO_TOGGLE:${messageId}:${!rec.active}`).setLabel('Desfazer Alteração').setStyle(ButtonStyle.Secondary)
            )
          ]
        }
      );

      await logMemberHistoryEvent(
        guild,
        {
          type:
            rec.active
              ? "Controle Despausado"
              : "Controle Pausado",

          memberId:
            rec.targetId,

          actorId:
            actor.id,

          before: {
            status:
              previousActive
                ? "Ativo"
                : "Pausado",

            pausedAtMs:
              previousPausedAtMs,

            totalPausedMs:
              previousTotalPausedMs,
          },

          after: {
            status:
              rec.active
                ? "Ativo"
                : "Pausado",

            pausedAtMs:
              rec.pausedAtMs ||
              null,

            totalPausedMs:
              Number(
                rec.totalPausedMs ||
                0
              ),

            autoDesligamentoDias:
              SC_GI_CFG
                .AUTO_DESLIGAR_PAUSA_DIAS,
          },

          record:
            rec,

          note:
            rec.active
              ? "O membro voltou a apresentar atividade e a contagem de inatividade foi interrompida."
              : `A contagem de inatividade foi iniciada. O limite configurado é de ${SC_GI_CFG.AUTO_DESLIGAR_PAUSA_DIAS} dia(s).`,
        }
      );

      scheduleRespBoardRender(
        guild
      );
    }

    async function resendDM(guild, actor, messageId) {
      const rec = SC_GI_STATE.registros.get(messageId);

      if (!rec) {
        throw new Error('Registro não encontrado.');
      }

      const targetUser =
        await fetchUserCached(
          rec.targetId
        );

      if (!targetUser) {
        throw new Error(
          'Usuário não encontrado.'
        );
      }

      // =====================================================
      // ✅ BUSCA ESTATÍSTICAS GERAIS
      // =====================================================
      //
      // Mantém exatamente o relatório que já existia.
      //
      let statsEmbed =
        null;

      try {
        const stats =
          await getStatsForUser(
            guild.client,
            rec.targetId
          );

        if (stats) {
          statsEmbed = {
            color: 0x2b2d31,
            title: '📊 Relatório de Desempenho (Recente)',
            description: `🏆 **Total no período consultado:** ${stats.total} pontos\n\n${stats.coverage}`,
            fields: [
              {
                name: '📂 Por Categoria',
                value: stats.sourcesFormatted.join('\n') || '_(sem registros)_',
                inline: false
              },
              {
                name: '📅 Por Semana',
                value: stats.weeksFormatted.join('\n') || '_(sem registros)_',
                inline: false
              }
            ]
          };
        }
      } catch (e) {
        console.warn(
          '[SC_GI] Falha ao buscar stats para resendDM:',
          e
        );
      }

      // =====================================================
      // ✅ ENVIA PRIMEIRO A DM QUE JÁ EXISTIA
      // =====================================================
      //
      // Não removemos nem substituímos nada do comportamento
      // anterior.
      //
      const dmEmb =
        await dmEmbedResumo(
          rec,
          targetUser,
          '📨 Reenvio — Atualização da gestão'
        );

      const baseDmOk =
        await sendDM_andMirror(
          guild,
          targetUser,
          dmEmb,
          `<@${rec.targetId}>`,
          statsEmbed
            ? [
                statsEmbed,
              ]
            : []
        );

      // =====================================================
      // ✅ ORIENTAÇÃO PRIVADA INTELIGENTE
      // =====================================================
      //
      // Esta parte utiliza:
      //
      // - semana atual;
      // - semana anterior;
      // - ranking;
      // - origem dos registros;
      // - histórico do Forms;
      // - feedbacks anteriores;
      // - sinais de evolução;
      //
      // Mas gera um NOVO texto feito especificamente para o
      // membro, sem copiar comentários internos.
      //
      let privateGuidanceSent =
        false;

      let privateGuidanceParts =
        0;
      let privateGuidanceSentParts = 0;

      if (
        typeof generateWeeklyMemberPrivateDm ===
        'function'
      ) {
        try {
          const privateFeedback =
            await generateWeeklyMemberPrivateDm({
              client:
                guild.client,

              guild,

              record:
                rec,
            });

          const chunks =
            Array.isArray(
              privateFeedback
                ?.chunks
            )
              ? privateFeedback
                  .chunks
              : [];

          privateGuidanceParts =
            chunks.length;

          for (
            let index = 0;
            index < chunks.length;
            index++
          ) {
            const chunk =
              String(
                chunks[index] ||
                  ''
              ).trim();

            if (!chunk) {
              continue;
            }

            const guidanceEmbed =
              new EmbedBuilder()
                .setColor(
                  0x5865f2
                )
                .setTitle(
                  index ===
                    0
                    ? '💡 Um retorno para você'
                    : `↳ Continuação ${index + 1}/${chunks.length}`
                )
                .setDescription(
                  chunk.slice(
                    0,
                    4096
                  )
                );

            if (
              index ===
              0
            ) {
              guidanceEmbed
                .setFooter({
                  text:
                    'SantaCreators • acompanhamento pessoal',
                })
                .setTimestamp(
                  new Date()
                );
            }

            const partSent =
              await sendDM_andMirror(
                guild,
                targetUser,
                guidanceEmbed,

                // String vazia evita marcar novamente o membro
                // em cada continuação.
                '',
                []
              );

            if (partSent) {
              privateGuidanceSentParts++;
            }
          }
          privateGuidanceSent = privateGuidanceParts > 0 &&
            privateGuidanceSentParts === privateGuidanceParts;
        } catch (e) {
          console.warn(
            `[SC_GI] Não foi possível gerar/enviar orientação privada de ${rec.targetId}:`,
            e?.message ||
              e
          );
        }
      } else {
        console.warn(
          '[SC_GI] generateWeeklyMemberPrivateDm indisponível. A DM padrão será mantida sem orientação IA adicional.'
        );
      }

      // =====================================================
      // ✅ LOG
      // =====================================================

      await logMsg(
        guild,
        'DM Reenviada (GI)',
        [
          `📨 **Enviado para:** <@${rec.targetId}> (\`${rec.targetId}\`)`,

          `🔧 **Por:** <@${actor.id}> (\`${actor.id}\`)`,

          `📊 **Resumo/estatísticas:** ${
            baseDmOk
              ? 'enviado'
              : 'não confirmado'
          }`,

          `🧠 **Orientação personalizada:** ${
            privateGuidanceSent
              ? `enviada em ${privateGuidanceParts} parte(s)`
              : (
                typeof generateWeeklyMemberPrivateDm ===
                'function'
                  ? `entrega incompleta ou não confirmada: ${privateGuidanceSentParts}/${privateGuidanceParts} parte(s)`
                  : 'indisponível'
              )
          }`,

          `🔗 **Link:** [Abrir registro](https://discord.com/channels/${guild.id}/${rec.channelId}/${rec.messageId})`
        ].join(
          '\n'
        ),
        {
          thumb:
            targetUser
              .displayAvatarURL?.({
                size:
                  128
              })
        }
      );
    }

    // Mantém SOMENTE o cargo Cidadão (conforme pedido do desligamento)
    async function setOnlyCitizenAndSCRoles(guild, userId) {
      try {
        // ✅ Busca o membro fresh da API para evitar cache de cargos desatualizado
        const m = await guild.members.fetch(userId).catch(() => null);
        if (!m) return;

        const botMember = guild.members.me;

        // ✅ CORREÇÃO DE HIERARQUIA:
        // Mantém cargos "managed", @everyone e cargos que o bot NÃO consegue editar (acima dele).
        // Se o bot tentar remover um cargo acima dele, o Discord cancela a operação toda.
        const keep = m.roles.cache
          .filter(r => r.managed || r.id === guild.id || r.comparePositionTo(botMember.roles.highest) >= 0)
          .map(r => r.id);

        if (SC_GI_CFG.ROLE_CIDADAO && !keep.includes(SC_GI_CFG.ROLE_CIDADAO)) {
          keep.push(SC_GI_CFG.ROLE_CIDADAO);
        }

        await m.roles.set(keep, "Desligamento Gestaoinfluencer: limpeza de cargos").catch(e => {
            throw new Error(`Falha ao substituir cargos (Hierarquia?): ${e.message}`);
        });
      } catch (e) {
        throw e;
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
        const m = await guild.members.fetch(userId).catch(() => null);
        if (!m) return;
        // ✅ Passa o passaporte salvo (se houver) para restaurar o ID
        const nick = computeNewNick(m, opts.passaporte);
        await m.setNickname(nick, "Desligamento Gestaoinfluencer: reset de nick").catch(() => {});
      } catch {}
    }

async function removeControleRegistroDoChat(guild, snapshot, motivo = 'Desligamento') {
  try {
    const ch = await guild.channels.fetch(snapshot.channelId).catch(() => null);

    if (!ch || !ch.isTextBased()) {
      await logMsg(
        guild,
        'Falha ao remover controle GI',
        [
          `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
          `🧾 **Registro:** \`${snapshot.messageId}\``,
          `⚠️ **Erro:** canal do controle não encontrado ou não é texto.`,
          `📝 **Motivo:** ${motivo}`
        ].join('\n')
      );
      return false;
    }

    const msg = await ch.messages.fetch(snapshot.messageId).catch(() => null);

    if (!msg) {
      return true;
    }

    const deleted = await msg.delete().then(() => true).catch(() => false);

    if (deleted) {
      return true;
    }

    await msg.edit({
      content: `🗑️ <@${snapshot.targetId}> foi desligado(a) da gestão. Controle encerrado automaticamente.`,
      components: []
    }).catch(() => {});

    await logMsg(
      guild,
      'Controle GI não pôde ser apagado',
      [
        `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
        `🧾 **Registro:** \`${snapshot.messageId}\``,
        `⚠️ **Ação:** não consegui apagar a mensagem, então removi os botões e deixei como encerrado.`,
        `📝 **Motivo:** ${motivo}`
      ].join('\n')
    );

    return false;
  } catch (e) {
    await logMsg(
      guild,
      'Erro ao remover controle GI',
      [
        `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
        `🧾 **Registro:** \`${snapshot.messageId}\``,
        `⚠️ **Erro:** \`${String(e?.message || e).slice(0, 900)}\``,
        `📝 **Motivo:** ${motivo}`
      ].join('\n')
    ).catch(() => {});

    return false;
  }
}

// =====================================================
// RECUPERAÇÃO RETROATIVA DE DESLIGAMENTOS ANTIGOS
// =====================================================
//
// Desligamentos feitos antes da criação de
// disconnectedSnapshots não possuem snapshot persistente.
//
// Ao clicar no botão antigo, usamos o próprio embed do log
// para reconstruir somente aquilo que está comprovado nele.
// Dados que não existem no log NÃO são inventados.
// =====================================================

function recoverLegacyDisconnectSnapshotFromLogMessage(
  guild,
  logMessage,
  controlMessageId
) {
  const normalizedControlMessageId =
    String(
      controlMessageId ||
      ""
    ).trim();

  if (!normalizedControlMessageId) {
    return null;
  }

  const existing =
    SC_GI_STATE.disconnectedSnapshots.get(
      normalizedControlMessageId
    );

  if (existing) {
    return existing;
  }

  const embed =
    logMessage?.embeds?.[0] ||
    null;

  const description =
    String(
      embed?.description ||
      ""
    );

  const targetId =
    description.match(
      /👤\s*\*\*Membro:\*\*\s*<@!?(\d{17,20})>/i
    )?.[1] ||
    null;

  if (!targetId) {
    return null;
  }

  const area =
    description.match(
      /🧭\s*\*\*Área:\*\*\s*`([^`]+)`/i
    )?.[1]?.trim() ||
    "A Definir";

  const entryText =
    description.match(
      /🗓️\s*\*\*Entrada:\*\*\s*`([^`]+)`/i
    )?.[1]?.trim() ||
    null;

  const registrarId =
    description.match(
      /🧾\s*\*\*Registrado por:\*\*\s*<@!?(\d{17,20})>/i
    )?.[1] ||
    guild.client.user.id;

  const disconnectedBy =
    description.match(
      /🔧\s*\*\*Desligado por:\*\*\s*<@!?(\d{17,20})>/i
    )?.[1] ||
    null;

  const reason =
    description.match(
      /📝\s*\*\*Motivo:\*\*\s*([^\n]+)/i
    )?.[1]?.trim() ||
    "Desligamento anterior recuperado pelo log";

  const disconnectedAtMs =
    Number(
      logMessage?.createdTimestamp ||
      0
    ) ||
    Date.now();

  const joinDateMs =
    entryText
      ? fromDDMMYYYY_toMs(
          entryText
        )
      : null;

  const responsibleHistory =
    [];

  const responsibleRegex =
    /•\s*(\d{2}\/\d{2}\/\d{4})\s*—\s*([^:\n]+):\s*<@!?(\d{17,20})>\s*\(def\.\s*por\s*<@!?(\d{17,20})>\)/g;

  let responsibleMatch;

  while (
    (
      responsibleMatch =
        responsibleRegex.exec(
          description
        )
    )
  ) {
    const label =
      String(
        responsibleMatch[2] ||
        ""
      )
        .toLowerCase();

    const type =
      label.includes(
        "owner"
      )
        ? "OWNER"
        : label.includes(
            "creators"
          )
          ? "RESP_CREATORS"
          : label.includes(
              "influ"
            )
            ? "RESP_INFLU"
            : label.includes(
                "líder"
              ) ||
              label.includes(
                "lider"
              )
              ? "RESP_LIDER"
              : null;

    responsibleHistory.push({
      atMs:
        fromDDMMYYYY_toMs(
          responsibleMatch[1]
        ) ||
        disconnectedAtMs,

      userId:
        responsibleMatch[3],

      type,

      setBy:
        responsibleMatch[4],

      manual:
        true,

      source:
        "legacy_disconnect_log",
    });
  }

  const lastResponsible =
    responsibleHistory.at(-1) ||
    null;

  const member =
    guild.members.cache.get(
      targetId
    ) ||
    null;

  const passportMatch =
    String(
      member?.displayName ||
      ""
    ).match(
      /\|\s*(\d{1,12})\s*$/
    );

  const safeJoinDateMs =
    Number(joinDateMs || 0) ||
    disconnectedAtMs;

  const snapshot = {
    messageId:
      normalizedControlMessageId,

    guildId:
      guild.id,

    channelId:
      SC_GI_CFG.CHANNEL_MENU_E_REGISTROS,

    targetId,

    registrarId,

    area,

    joinDateMs:
      safeJoinDateMs,

    createdAtMs:
      safeJoinDateMs,

    active:
      false,

    nextWeekTickMs:
      null,

    oneMonthNotified:
      false,

    oneMonthNotifiedAt:
      null,

    note:
      "",

    responsibleUserId:
      lastResponsible?.userId ||
      null,

    responsibleType:
      lastResponsible?.type ||
      null,

    responsibleManual:
      !!lastResponsible,

    responsibleSetBy:
      lastResponsible?.setBy ||
      null,

    responsibleUpdatedAtMs:
      lastResponsible?.atMs ||
      null,

    responsibleHistory,

    warnNoRoleGI:
      false,

    areaHistory: [
      {
        area,
        startedAtMs:
          safeJoinDateMs,
        endedAtMs:
          disconnectedAtMs,
        changedBy:
          registrarId,
        source:
          "legacy_disconnect_log",
      }
    ],

    activityHistory: [
      {
        status:
          "disconnected",
        atMs:
          disconnectedAtMs,
        changedBy:
          disconnectedBy ||
          registrarId,
        reason,
      }
    ],

    pausedAtMs:
      null,

    totalPausedMs:
      0,

    roleSetAtMs:
      null,

    passaporte:
      passportMatch?.[1] ||
      null,

    personalTicketChannelId:
      null,

    discordIdHistory:
      [],

    lastControlVisualRefreshAtMs:
      0,
  };

  const archive = {
    controlMessageId:
      normalizedControlMessageId,

    snapshot,

    roleIdsBefore:
      [],

    nicknameBefore:
      null,

    personalTicketChannelId:
      null,

    formsOriginalThreadId:
      null,

    disconnectedAtMs,

    disconnectedBy,

    reason,

    disconnectLogMessageId:
      logMessage?.id ||
      null,

    restored:
      false,

    restoredAtMs:
      null,

    restoredBy:
      null,

    restoredControlMessageId:
      null,

    legacyRecovered:
      true,
  };

  SC_GI_STATE.disconnectedSnapshots.set(
    normalizedControlMessageId,
    archive
  );

  SC_GI_scheduleSave();

  return archive;
}

async function restoreRolesFromDisconnectArchive(
  guild,
  archive,
  restoredRecord
) {
  const member =
    await guild.members
      .fetch(
        restoredRecord.targetId
      )
      .catch(
        () => null
      );

  if (!member) {
    throw new Error(
      "Membro não encontrado no servidor para restaurar os cargos."
    );
  }

  setRoleBypass(
    restoredRecord.targetId,
    30000
  );

  const savedRoleIds =
    Array.isArray(
      archive?.roleIdsBefore
    )
      ? archive.roleIdsBefore
          .map(String)
          .filter(Boolean)
      : [];

  const addedRoleIds =
    [];

  if (
    savedRoleIds.length >
    0
  ) {
    const botMember =
      guild.members.me;

    const restorableRoleIds =
      savedRoleIds.filter(
        roleId => {
          const role =
            guild.roles.cache.get(
              roleId
            );

          if (
            !role ||
            role.managed ||
            role.id === guild.id ||
            member.roles.cache.has(
              role.id
            )
          ) {
            return false;
          }

          return (
            role.comparePositionTo(
              botMember.roles.highest
            ) <
            0
          );
        }
      );

    if (
      restorableRoleIds.length >
      0
    ) {
      await member.roles.add(
        restorableRoleIds,
        "Controle GI: restauração do snapshot anterior ao desligamento"
      );

      addedRoleIds.push(
        ...restorableRoleIds
      );
    }

    if (
      archive?.nicknameBefore &&
      member.manageable
    ) {
      await member.setNickname(
        String(
          archive.nicknameBefore
        ).slice(
          0,
          32
        ),
        "Controle GI: restaurar nickname anterior ao desligamento"
      ).catch(
        () => null
      );
    }
  } else {
    const areaProfile =
      resolveAreaProfile(
        restoredRecord.area
      );

    if (
      areaProfile &&
      !areaProfile.skipRoleTransition
    ) {
      const transition =
        await applyAreaRoleTransition(
          guild,
          restoredRecord,
          areaProfile
        );

      addedRoleIds.push(
        ...(transition?.addedRoleIds || [])
      );
    }
  }

  await addGIRole(
    guild,
    restoredRecord.targetId,
    "Membro restaurado: GI obrigatório"
  );

  return [
    ...new Set(
      addedRoleIds
    )
  ];
}

async function desligarRegistro(guild, actor, messageId, motivo = 'Desligado manualmente') {
  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) throw new Error('Registro não encontrado.');

  await assertCanManageGIRecord(
    guild,
    actor,
    rec.targetId,
    'desligar da gestão'
  );

  const snapshot =
    structuredClone(
      rec
    );

  const disconnectedAtMs =
    nowMs();

  snapshot.responsibleHistory =
    Array.isArray(
      snapshot.responsibleHistory
    )
      ? structuredClone(
          snapshot.responsibleHistory
        )
      : [];

  // =====================================================
  // GARANTE O RESPONSÁVEL ATUAL NO HISTÓRICO
  // =====================================================

  if (snapshot.responsibleUserId) {
    const lastResponsible =
      snapshot.responsibleHistory.at(-1) ||
      null;

    if (
      String(lastResponsible?.userId || "") !==
        String(snapshot.responsibleUserId) ||
      String(lastResponsible?.type || "") !==
        String(snapshot.responsibleType || "")
    ) {
      snapshot.responsibleHistory.push({
        atMs:
          Number(snapshot.responsibleUpdatedAtMs || 0) ||
          disconnectedAtMs,

        userId:
          String(snapshot.responsibleUserId),

        type:
          snapshot.responsibleType ||
          null,

        setBy:
          snapshot.responsibleSetBy ||
          snapshot.registrarId ||
          actor?.id ||
          guild.client.user.id,

        manual:
          !!snapshot.responsibleManual,

        source:
          "disconnect_snapshot_recovery"
      });
    }
  }

  // =====================================================
  // SNAPSHOT EXATO DOS CARGOS / NICK ANTES DA LIMPEZA
  // =====================================================

  const memberBeforeDisconnect =
    await guild.members
      .fetch(
        snapshot.targetId
      )
      .catch(
        () => null
      );

  const roleIdsBeforeDisconnect =
    memberBeforeDisconnect
      ? memberBeforeDisconnect.roles.cache
          .filter(
            role =>
              role.id !== guild.id &&
              !role.managed
          )
          .map(
            role =>
              String(role.id)
          )
      : [];

  const nicknameBeforeDisconnect =
    memberBeforeDisconnect?.nickname ||
    null;

  // =====================================================
  // PRESERVA O VÍNCULO DO TICKET ANTES DE APAGAR O GI
  // =====================================================
  //
  // O Controle GI é uma das fontes mais confiáveis para
  // saber qual é o ticket pessoal da pessoa.
  //
  // Depois que o registro é apagado, essa informação pode
  // desaparecer da API viva.
  //
  // Portanto resolvemos e guardamos o ticket ANTES do delete.
  // =====================================================

  let desligamentoPersonalTicketChannelId =
    snapshot.personalTicketChannelId
      ? String(snapshot.personalTicketChannelId)
      : null;

  if (!desligamentoPersonalTicketChannelId) {
    const resolvedPersonalTicket =
      await resolvePersonalTicketInfo(
        guild.id,
        snapshot.targetId,
        null
      ).catch(() => null);

    if (resolvedPersonalTicket?.channelId) {
      desligamentoPersonalTicketChannelId =
        String(resolvedPersonalTicket.channelId);
    }
  }

  snapshot.personalTicketChannelId =
    desligamentoPersonalTicketChannelId ||
    snapshot.personalTicketChannelId ||
    null;

  const desligamentoFormsOriginalThreadId =
    await resolveFormsCreatorThreadIdForGI(
      snapshot.targetId
    ).catch(
      () => null
    );

  snapshot.activityHistory =
    Array.isArray(
      snapshot.activityHistory
    )
      ? structuredClone(
          snapshot.activityHistory
        )
      : [];

  snapshot.activityHistory.push({
    status:
      "disconnected",

    atMs:
      disconnectedAtMs,

    changedBy:
      actor?.id ||
      guild.client.user.id,

    reason:
      motivo,
  });

  snapshot.areaHistory =
    Array.isArray(
      snapshot.areaHistory
    )
      ? structuredClone(
          snapshot.areaHistory
        )
      : [];

  if (
    snapshot.areaHistory.length >
    0
  ) {
    const lastArea =
      snapshot.areaHistory[
        snapshot.areaHistory.length -
        1
      ];

    if (
      lastArea &&
      !lastArea.endedAtMs
    ) {
      lastArea.endedAtMs =
        disconnectedAtMs;
    }
  }

  // =====================================================
  // SNAPSHOT PERSISTENTE DO DESLIGAMENTO
  // =====================================================

  SC_GI_STATE.disconnectedSnapshots.set(
    String(snapshot.messageId),
    {
      controlMessageId:
        String(snapshot.messageId),

      snapshot:
        structuredClone(
          snapshot
        ),

      roleIdsBefore:
        roleIdsBeforeDisconnect,

      nicknameBefore:
        nicknameBeforeDisconnect,

      personalTicketChannelId:
        snapshot.personalTicketChannelId ||
        null,

      formsOriginalThreadId:
        desligamentoFormsOriginalThreadId ||
        null,

      disconnectedAtMs,

      disconnectedBy:
        actor?.id ||
        null,

      reason:
        motivo,

      disconnectLogMessageId:
        null,

      restored:
        false,

      restoredAtMs:
        null,

      restoredBy:
        null,

      restoredControlMessageId:
        null,

      legacyRecovered:
        false,
    }
  );

  // Salva ANTES de qualquer remoção de cargo/controle.
  await SC_GI_saveNow();

  // =====================================================
  // GERA A RETROSPECTIVA ANTES DE REMOVER CARGOS,
  // APAGAR O CONTROLE OU INATIVAR O FORMS
  // =====================================================

  let lifecycleDisconnectBundle =
    null;

  if (
    typeof generateMemberLifecyclePrivateDm ===
      "function"
  ) {
    lifecycleDisconnectBundle =
      await generateMemberLifecyclePrivateDm({
        client:
          guild.client,

        guild,

        record:
          snapshot,

        eventType:
          "disconnected",

        reason:
          motivo,
      })
      .catch(
        error => {
          console.warn(
            `[SC_GI] Retrospectiva de desligamento indisponível para ${snapshot.targetId}:`,
            error?.message ||
            error
          );

          return null;
        }
      );
  }

  // =====================================================
  // RESUMO INTERNO CURTO PARA O ÚLTIMO FORMS ATIVO
  // =====================================================
  //
  // Reutiliza os mesmos fatos da retrospectiva acima.
  // Não executa outra varredura completa.
  // =====================================================

  let formsDisconnectSummary =
    null;

  if (
    typeof generateMemberDismissalFormsSummary ===
      "function" &&
    lifecycleDisconnectBundle?.facts
  ) {
    formsDisconnectSummary =
      await generateMemberDismissalFormsSummary({
        facts:
          lifecycleDisconnectBundle.facts,

        record:
          snapshot,

        reason:
          motivo,
      })
      .catch(
        error => {
          console.warn(
            `[SC_GI] Resumo final interno do Forms indisponível para ${snapshot.targetId}:`,
            error?.message ||
            error
          );

          return null;
        }
      );
  }

  // =====================================================
  // FECHA A ÚLTIMA ETAPA DO HISTÓRICO DE ÁREA
  // =====================================================

  snapshot.areaHistory =
    Array.isArray(
      snapshot.areaHistory
    )
      ? structuredClone(
          snapshot.areaHistory
        )
      : [];

  if (
    snapshot.areaHistory.length >
    0
  ) {
    const lastArea =
      snapshot.areaHistory[
        snapshot.areaHistory.length -
        1
      ];

    if (
      lastArea &&
      !lastArea.endedAtMs
    ) {
      lastArea.endedAtMs =
        nowMs();
    }
  }

  // =====================================================
  // LOG HISTÓRICO ANTES DE APAGAR O CONTROLE
  // =====================================================

  await logMemberHistoryEvent(
    guild,
    {
      type:
        "Desligamento da SantaCreators",

      memberId:
        snapshot.targetId,

      actorId:
        actor?.id ||
        null,

      before: {
        status:
          snapshot.active
            ? "Ativo"
            : "Pausado",

        area:
          snapshot.area,

        dataEntrada:
          msToDDMMYYYY(
            snapshot.joinDateMs
          ),

        tempoAtivo:
          activeTimeText(
            snapshot
          ),

        tempoPausado:
          formatDurationFull(
            getPausedTotalMs(
              snapshot
            )
          ),

        responsibleUserId:
          snapshot.responsibleUserId ||
          null,

        responsibleType:
          snapshot.responsibleType ||
          null,

        discordIdHistory:
          snapshot.discordIdHistory ||
          [],

        activityHistory:
          snapshot.activityHistory ||
          [],
      },

      after: {
        status:
          "Desligado",

        motivo:
          motivo,

        desligadoEm:
          new Date()
            .toISOString(),
      },

      record:
        snapshot,

      note:
        "Encerramento da trajetória atual. O histórico disponível foi preservado antes da remoção do Controle GI.",
    }
  ).catch(
    () => {}
  );

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
  } catch (e) {
    console.error(`[SC_GI] Erro crítico no processamento de cargos/nick durante desligamento de ${snapshot.targetId}:`, e.message);
  }

    // ✅ BUSCA ESTATÍSTICAS GERAIS (scGeralWeeklyRanking)
    let statsEmbed = null;
    try {
      const stats = await getStatsForUser(guild.client, snapshot.targetId);
      if (stats) {
        statsEmbed = {
          color: 0x2b2d31,
          title: '📊 Relatório de Desempenho (Recente)',
          description: `🏆 **Total no período consultado:** ${stats.total} pontos\n\n${stats.coverage}`,
          fields: [
            {
              name: '📂 Por Categoria',
              value: stats.sourcesFormatted.join('\n') || '_(sem registros)_',
              inline: false
            },
            {
              name: '📅 Por Semana',
              value: stats.weeksFormatted.join('\n') || '_(sem registros)_',
              inline: false
            }
          ]
        };
      }
    } catch (e) {
      console.warn('[SC_GI] Falha ao buscar stats para desligamento:', e);
    }


      await removeControleRegistroDoChat(guild, snapshot, motivo);
clearGiAutoDisableTimer(
  snapshot.messageId
);
      SC_GI_STATE.registros.delete(snapshot.messageId);
      
      // ✅ FORÇA SALVAR IMEDIATAMENTE (sem debounce) para garantir que o delete persista
      await SC_GI_saveNow();

      // ✅ Emite evento de desligamento para o Dashboard
      // ✅ Também informa o ticket pessoal que estava
      //    vinculado ao Controle GI antes do delete.
      dashEmit('gi:desligado', {
        userId: snapshot.targetId,
        guildId: guild.id,

        personalTicketChannelId:
          desligamentoPersonalTicketChannelId,

        controlMessageId:
          snapshot.messageId || null,

        timestamp: Date.now()
      });

// =====================================================
// DESLIGA O FORMS + REGISTRA RESUMO FINAL + TRAVA TUDO
// =====================================================
try {
  if (
    (
      typeof findFormsCreatorThreadIdFastByUserId ===
        "function" ||
      typeof findOriginalFormsCreatorThreadIdByUserId ===
        "function"
    ) &&
    typeof setFormsCreatorStatus ===
      "function"
  ) {
    const fcThreadId =
      await resolveFormsCreatorThreadIdForGI(
        snapshot.targetId
      );

    if (fcThreadId) {
      // Primeiro marca o registro original como INATIVO.
      // O Forms não publicará mais a frase genérica
      // "Fulano alterou o status..." quando fromGi=true.
      await setFormsCreatorStatus(
        guild.client,
        {
          threadId:
            fcThreadId,

          newStatus:
            false,

          actor,

          fromGi:
            true,
        }
      );

      // Depois registra a nota curta no ÚLTIMO tópico ativo
      // e trava fisicamente TODOS os tópicos da trajetória.
      if (
        typeof lockEvolutionHierarchyForMember ===
          "function"
      ) {
        const lockResult =
          await lockEvolutionHierarchyForMember(
            guild.client,
            {
              userId:
                snapshot.targetId,

              originalThreadId:
                fcThreadId,

              finalSummary:
                formsDisconnectSummary ||
                (
                  `O membro foi desligado da SantaCreators. ` +
                  `Os registros disponíveis permanecem preservados como histórico desta etapa. ` +
                  `Não houve resumo analítico adicional disponível no momento do encerramento.`
                ),

              reason:
                `Desligamento da SantaCreators: ${motivo}`,
            }
          );

        await logMsg(
          guild,
          "FormsCreator encerrado junto com desligamento GI",
          [
            `👤 Membro: <@${snapshot.targetId}>`,
            `📌 FormsCreator original: <#${fcThreadId}>`,
            lockResult?.lastActiveThreadId
              ? `🧭 Último tópico ativo: <#${lockResult.lastActiveThreadId}>`
              : "🧭 Último tópico ativo: não identificado",
            `🔒 Tópicos travados: ${Number(lockResult?.lockedThreads || 0)}`,
            `🧾 Motivo: ${motivo}`,
            `👮 Autor: <@${actor?.id || guild.client.user.id}>`,
          ]
            .filter(Boolean)
            .join("\n")
        );
      } else {
        await logMsg(
          guild,
          "FormsCreator inativado junto com desligamento GI",
          [
            `👤 Membro: <@${snapshot.targetId}>`,
            `📌 FormsCreator: <#${fcThreadId}>`,
            `🧾 Motivo: ${motivo}`,
            `👮 Autor: <@${actor?.id || guild.client.user.id}>`,
            "⚠️ A função de trava da Evolução não estava disponível.",
          ].join("\n")
        );
      }
    } else {
      await logMsg(
        guild,
        "FormsCreator não encontrado no desligamento GI",
        [
          `👤 Membro: <@${snapshot.targetId}>`,
          `🧾 Motivo: ${motivo}`,
          "⚠️ O GI foi desligado, mas não achei FormsCreator para inativar/travar.",
        ].join("\n")
      );
    }
  }
} catch (e) {
  console.error(
    "[GI] Falha ao desligar/inativar/travar registro no FormsCreator:",
    e
  );
}

// =====================================================
// AVISO PADRÃO NO TICKET PESSOAL
// =====================================================

try {
  if (
    desligamentoPersonalTicketChannelId
  ) {
    const sentTicketNotice =
      await sendPersonalTicketDisconnectNotice(
        guild,
        snapshot.targetId,
        desligamentoPersonalTicketChannelId
      );

    if (!sentTicketNotice) {
      console.warn(
        `[SC_GI] Ticket pessoal ${desligamentoPersonalTicketChannelId} não recebeu aviso de desligamento de ${snapshot.targetId}.`
      );
    }
  }
} catch (error) {
  console.error(
    `[SC_GI] Falha ao enviar aviso de desligamento no ticket pessoal de ${snapshot.targetId}:`,
    error?.message ||
    error
  );
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
            `Obrigado pelo tempo com a gente! Se sua saída foi tranquila e, no futuro, você quiser retornar, procure a equipe para conhecer os critérios e seguir o processo de ingresso vigente.`,
            '',
            `🗓️ **Entrada:** \`${msToDDMMYYYY(snapshot.joinDateMs)}\``,
            `⏱️ **Semanas:** \`${weeks}\`  •  **Meses:** \`${months}\``,
            `⏸️ **Pausas acumuladas:** \`${diasPausa} dia(s)\``,
            snapshot.pausedAtMs ? `📍 **Estava pausado desde:** \`${msToDDMMYYYY(snapshot.pausedAtMs)}\`` : '',
            `🧭 **Área:** \`${snapshot.area}\``,
            `📝 **Motivo:** ${motivo}`
          ].filter(Boolean).join('\n');

          const dmEmb = await dmEmbedResumo(
            {
              ...snapshot,
              active: false,
              endedAtMs: nowMs()
            },
            user,
            '🗑️ Desligamento — Gestaoinfluencer'
          );
          const lifecycleEmbeds =
            (
              lifecycleDisconnectBundle
                ?.chunks ||
              []
            ).map(
              (
                chunk,
                index
              ) => ({
                color:
                  0x8e44ad,

                title:
                  index ===
                  0
                    ? "💜 Sua trajetória na SantaCreators"
                    : "💜 Continuação da sua trajetória",

                description:
                  chunk,

                footer: {
                  text:
                    "SantaCreators • retrospectiva de trajetória",
                },
              })
            );

          await sendDM_andMirror(
            guild,
            user,
            dmEmb,
            dmText,
            [
              ...(
                statsEmbed
                  ? [
                      statsEmbed
                    ]
                  : []
              ),

              ...lifecycleEmbeds,
            ]
          );
        }
      } catch (e) {
        console.warn(`[SC_GI] Falha ao enviar DM de desligamento para ${snapshot.targetId}:`, e.message);
      }

      try {
        const ch = await guild.client.channels.fetch(SC_GI_CFG.CHANNEL_DESLIGAMENTOS).catch(() => null);

        if (!ch || ch.type !== ChannelType.GuildText) {
          await logMsg(
            guild,
            'Falha ao enviar desligamento GI',
            [
              `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
              `🧾 **Registro:** \`${snapshot.messageId}\``,
              `⚠️ **Erro:** canal de desligamentos não encontrado ou inválido.`,
              `📌 **Canal esperado:** \`${SC_GI_CFG.CHANNEL_DESLIGAMENTOS}\``
            ].join('\n')
          );
        } else {
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
              `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
              `🧭 **Área:** \`${snapshot.area}\``,
              `🗓️ **Entrada:** \`${msToDDMMYYYY(snapshot.joinDateMs)}\``,
              `⏱️ **Semanas/Meses:** \`${weeks}\` / \`${months}\``,
              `🧾 **Registrado por:** <@${snapshot.registrarId}>`,
              `🔧 **Desligado por:** <@${actor.id}>`,
              `📝 **Motivo:** ${motivo}`,
              '',
              `📚 Histórico de Responsáveis:\n${hist}`
            ].join('\n'))
            .setImage(GIF_SC_GI)
            .setTimestamp(new Date());

          const rowUndo = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`SC_GI_UNDO_DESLIGAR:${snapshot.messageId}`)
              .setLabel('Restaurar Membro')
              .setStyle(ButtonStyle.Success)
          );

          const disconnectLogMessage =
            await ch.send({
              embeds: [emb],
              components: [rowUndo]
            });

          const archivedDisconnect =
            SC_GI_STATE.disconnectedSnapshots.get(
              String(snapshot.messageId)
            );

          if (archivedDisconnect) {
            archivedDisconnect.disconnectLogMessageId =
              disconnectLogMessage.id;

            SC_GI_STATE.disconnectedSnapshots.set(
              String(snapshot.messageId),
              archivedDisconnect
            );

            SC_GI_scheduleSave();
          }
        }
      } catch (e) {
        await logMsg(
          guild,
          'Erro ao enviar desligamento GI',
          [
            `👤 **Membro:** <@${snapshot.targetId}> (\`${snapshot.targetId}\`)`,
            `🧾 **Registro:** \`${snapshot.messageId}\``,
            `⚠️ **Erro:** \`${String(e?.message || e).slice(0, 900)}\``
          ].join('\n')
        ).catch(() => {});
      }

           scheduleRespBoardRender(
        guild,
        {
          force: true,
        }
      );
    }

    // =====================================================
    // RESTAURAÇÃO COMPLETA DE UM DESLIGAMENTO
    // =====================================================

    async function restoreDesligamento(
      guild,
      actor,
      oldControlMessageId
    ) {
      const archiveKey =
        String(
          oldControlMessageId ||
          ""
        ).trim();

      if (!archiveKey) {
        throw new Error(
          "ID do desligamento inválido."
        );
      }

      const archive =
        SC_GI_STATE.disconnectedSnapshots.get(
          archiveKey
        );

      if (!archive?.snapshot?.targetId) {
        throw new Error(
          "Snapshot do desligamento não encontrado. Clique novamente no botão original de Restaurar Membro para recuperar os dados do log."
        );
      }

      const snapshot =
        structuredClone(
          archive.snapshot
        );

      await assertCanManageGIRecord(
        guild,
        actor,
        snapshot.targetId,
        "restaurar o membro na gestão"
      );

      const alreadyActive =
        getLatestRecordByTarget(
          snapshot.targetId
        );

      if (alreadyActive) {
        throw new Error(
          `Este membro já possui um Controle GI ativo/pausado: ${alreadyActive.messageId}.`
        );
      }

      const member =
        await guild.members
          .fetch(
            snapshot.targetId
          )
          .catch(
            () => null
          );

      if (!member) {
        throw new Error(
          "O membro não está mais no servidor. Não é possível restaurar o Controle GI enquanto ele estiver fora."
        );
      }

      const ticketInfo =
        await resolvePersonalTicketInfo(
          guild.id,
          snapshot.targetId,
          archive.personalTicketChannelId ||
          snapshot.personalTicketChannelId ||
          null
        ).catch(
          () => null
        );

      const personalTicketChannelId =
        ticketInfo?.channelId ||
        archive.personalTicketChannelId ||
        snapshot.personalTicketChannelId ||
        null;

      const originalFormsThreadId =
        archive.formsOriginalThreadId ||
        await resolveFormsCreatorThreadIdForGI(
          snapshot.targetId
        ).catch(
          () => null
        );

      let responsibleUserId =
        snapshot.responsibleUserId ||
        null;

      let responsibleType =
        snapshot.responsibleType ||
        null;

      if (responsibleUserId) {
        const responsibleMember =
          await guild.members
            .fetch(
              responsibleUserId
            )
            .catch(
              () => null
            );

        const currentType =
          getHighestTypeFromMember(
            responsibleMember
          );

        if (
          !responsibleMember ||
          !currentType ||
          responsibleUserId ===
            snapshot.targetId
        ) {
          responsibleUserId =
            null;

          responsibleType =
            null;
        } else {
          responsibleType =
            currentType;
        }
      }

      if (!responsibleUserId) {
        const automaticResponsible =
          await findBestResponsible(
            guild,
            snapshot.targetId
          );

        responsibleUserId =
          automaticResponsible?.userId ||
          null;

        responsibleType =
          automaticResponsible?.type ||
          null;
      }

      await createRegistro(
        guild,
        actor,
        msToDDMMYYYY(
          snapshot.joinDateMs ||
          archive.disconnectedAtMs ||
          Date.now()
        ),
        snapshot.area ||
        "A Definir",
        snapshot.targetId,
        {
          initialActive:
            true,

          passaporte:
            snapshot.passaporte ||
            null,

          responsibleUserId:
            responsibleUserId ||
            undefined,

          responsibleType:
            responsibleType ||
            undefined,

          personalTicketChannelId:
            personalTicketChannelId ||
            null,

          fastCreate:
            true,

          restoreSnapshot:
            true,

          suppressWelcomeDm:
            true,

          suppressNewRecordLog:
            true,

          suppressLifecycleEvents:
            true,
        }
      );

      const restoredRecord =
        getLatestRecordByTarget(
          snapshot.targetId
        );

      if (!restoredRecord) {
        throw new Error(
          "O novo Controle GI não apareceu no state após a restauração."
        );
      }

      const restoredAtMs =
        nowMs();

      const disconnectedAtMs =
        Number(
          archive.disconnectedAtMs ||
          0
        ) ||
        restoredAtMs;

      const pausedBeforeDisconnectMs =
        Math.max(
          0,
          Number(
            snapshot.totalPausedMs ||
            0
          ) +
          (
            snapshot.pausedAtMs
              ? Math.max(
                  0,
                  disconnectedAtMs -
                  Number(
                    snapshot.pausedAtMs
                  )
                )
              : 0
          )
        );

      const disconnectedDurationMs =
        Math.max(
          0,
          restoredAtMs -
          disconnectedAtMs
        );

      restoredRecord.registrarId =
        snapshot.registrarId ||
        restoredRecord.registrarId;

      restoredRecord.joinDateMs =
        Number(
          snapshot.joinDateMs ||
          restoredRecord.joinDateMs
        );

      restoredRecord.createdAtMs =
        Number(
          snapshot.createdAtMs ||
          restoredRecord.createdAtMs
        );

      restoredRecord.oneMonthNotified =
        !!snapshot.oneMonthNotified;

      restoredRecord.oneMonthNotifiedAt =
        snapshot.oneMonthNotifiedAt ||
        null;

      restoredRecord.note =
        snapshot.note ||
        "";

      restoredRecord.responsibleUserId =
        responsibleUserId ||
        null;

      restoredRecord.responsibleType =
        responsibleType ||
        null;

      restoredRecord.responsibleManual =
        !!snapshot.responsibleManual;

      restoredRecord.responsibleSetBy =
        snapshot.responsibleSetBy ||
        actor.id;

      restoredRecord.responsibleUpdatedAtMs =
        restoredAtMs;

      restoredRecord.responsibleHistory =
        Array.isArray(
          snapshot.responsibleHistory
        )
          ? structuredClone(
              snapshot.responsibleHistory
            )
          : [];

      if (responsibleUserId) {
        const lastResponsible =
          restoredRecord.responsibleHistory.at(-1) ||
          null;

        if (
          String(lastResponsible?.userId || "") !==
            String(responsibleUserId) ||
          String(lastResponsible?.type || "") !==
            String(responsibleType || "")
        ) {
          restoredRecord.responsibleHistory.push({
            atMs:
              restoredAtMs,

            userId:
              String(responsibleUserId),

            type:
              responsibleType ||
              null,

            setBy:
              actor.id,

            manual:
              false,

            source:
              "restore_after_disconnect",
          });
        }
      }

      restoredRecord.areaHistory =
        Array.isArray(
          snapshot.areaHistory
        )
          ? structuredClone(
              snapshot.areaHistory
            )
          : [];

      const lastOldArea =
        restoredRecord.areaHistory.at(-1) ||
        null;

      if (
        lastOldArea &&
        !lastOldArea.endedAtMs
      ) {
        lastOldArea.endedAtMs =
          disconnectedAtMs;
      }

      restoredRecord.areaHistory.push({
        area:
          snapshot.area ||
          restoredRecord.area,

        startedAtMs:
          restoredAtMs,

        endedAtMs:
          null,

        changedBy:
          actor.id,

        source:
          "restore_after_disconnect",
      });

      restoredRecord.activityHistory =
        Array.isArray(
          snapshot.activityHistory
        )
          ? structuredClone(
              snapshot.activityHistory
            )
          : [];

      const hasDisconnectEvent =
        restoredRecord.activityHistory.some(
          item =>
            item?.status ===
              "disconnected" &&
            Math.abs(
              Number(item?.atMs || 0) -
              disconnectedAtMs
            ) <
              5000
        );

      if (!hasDisconnectEvent) {
        restoredRecord.activityHistory.push({
          status:
            "disconnected",

          atMs:
            disconnectedAtMs,

          changedBy:
            archive.disconnectedBy ||
            null,

          reason:
            archive.reason ||
            "Desligamento",
        });
      }

      restoredRecord.activityHistory.push({
        status:
          "active",

        atMs:
          restoredAtMs,

        changedBy:
          actor.id,

        reason:
          "Membro restaurado após desligamento",
      });

      restoredRecord.active =
        true;

      restoredRecord.pausedAtMs =
        null;

      restoredRecord.totalPausedMs =
        pausedBeforeDisconnectMs +
        disconnectedDurationMs;

      restoredRecord.nextWeekTickMs =
        computeNextWeekTick(
          restoredRecord.joinDateMs
        );

      restoredRecord.roleSetAtMs =
        Number(
          snapshot.roleSetAtMs ||
          0
        ) ||
        restoredAtMs;

      restoredRecord.passaporte =
        snapshot.passaporte ||
        restoredRecord.passaporte ||
        null;

      restoredRecord.personalTicketChannelId =
        personalTicketChannelId ||
        null;

      restoredRecord.discordIdHistory =
        Array.isArray(
          snapshot.discordIdHistory
        )
          ? structuredClone(
              snapshot.discordIdHistory
            )
          : [];

      const restoredRoleIds =
        await restoreRolesFromDisconnectArchive(
          guild,
          archive,
          restoredRecord
        );

      await SC_GI_saveNow();

      await refreshRegistroMessage(
        guild,
        actor,
        restoredRecord.messageId,
        "Membro restaurado após desligamento"
      );

      let evolutionResult =
        null;

      if (
        originalFormsThreadId &&
        typeof setFormsCreatorStatus ===
          "function"
      ) {
        await setFormsCreatorStatus(
          guild.client,
          {
            threadId:
              originalFormsThreadId,

            newStatus:
              true,

            actor,

            fromGi:
              true,
          }
        ).catch(
          error =>
            console.warn(
              `[SC_GI] Não consegui reativar o Forms original ${originalFormsThreadId}:`,
              error?.message ||
              error
            )
        );

        if (
          typeof syncEvolutionHierarchyForMember ===
            "function"
        ) {
          evolutionResult =
            await syncEvolutionHierarchyForMember(
              guild.client,
              {
                guildId:
                  guild.id,

                userId:
                  restoredRecord.targetId,

                originalThreadId:
                  originalFormsThreadId,

                reason:
                  "Membro restaurado após desligamento",
              }
            ).catch(
              error => {
                console.warn(
                  `[SC_GI] Evolução não pôde ser reativada para ${restoredRecord.targetId}:`,
                  error?.message ||
                  error
                );

                return null;
              }
            );
        }
      }

      let lifecycleReturnBundle =
        null;

      if (
        typeof generateMemberLifecyclePrivateDm ===
          "function"
      ) {
        lifecycleReturnBundle =
          await generateMemberLifecyclePrivateDm({
            client:
              guild.client,

            guild,

            record:
              restoredRecord,

            eventType:
              "resumed",

            reason:
              "Membro restaurado após desligamento",
          })
          .catch(
            error => {
              console.warn(
                `[SC_GI] IA de retorno indisponível para ${restoredRecord.targetId}:`,
                error?.message ||
                error
              );

              return null;
            }
          );
      }

      let formsReturnSummary =
        null;

      if (
        typeof generateMemberReturnFormsSummary ===
          "function" &&
        lifecycleReturnBundle?.facts
      ) {
        formsReturnSummary =
          await generateMemberReturnFormsSummary({
            facts:
              lifecycleReturnBundle.facts,

            record:
              restoredRecord,

            reason:
              "Membro restaurado após desligamento",
          }).catch(
            () => null
          );
      }

      const activeEvolutionThreadId =
        evolutionResult?.threadId ||
        null;

      if (
        activeEvolutionThreadId
      ) {
        const activeEvolutionThread =
          await guild.client.channels
            .fetch(
              activeEvolutionThreadId
            )
            .catch(
              () => null
            );

        if (
          activeEvolutionThread?.isTextBased?.()
        ) {
          await activeEvolutionThread.send({
            embeds: [
              new EmbedBuilder()
                .setColor(
                  0x2ecc71
                )
                .setTitle(
                  "💜 Membro reativado de volta na gestão"
                )
                .setDescription(
                  formsReturnSummary ||
                  (
                    `O membro foi reativado na SantaCreators e retoma o acompanhamento na área **${restoredRecord.area || "não informada"}**. ` +
                    `O histórico anterior permanece válido; o foco inicial deve ser revisar os últimos direcionamentos registrados antes de seguir com novas avaliações.`
                  )
                )
                .setFooter({
                  text:
                    "SantaCreators • retomada do acompanhamento",
                })
                .setTimestamp(),
            ],

            allowedMentions: {
              parse: [],
            },
          }).catch(
            error =>
              console.warn(
                `[SC_GI] Não consegui publicar a nota de retorno no Forms de ${restoredRecord.targetId}:`,
                error?.message ||
                error
              )
          );
        }
      }

      // Só emite depois de o novo Controle estar completo.
      dashEmit(
        "gi:controle_criado",
        {
          userId:
            restoredRecord.targetId,

          guildId:
            guild.id,

          active:
            true,

          personalTicketChannelId:
            personalTicketChannelId ||
            null,

          timestamp:
            Date.now(),
        }
      );

      emitGIReturned(
        restoredRecord.targetId,
        {
          reason:
            "restore_after_disconnect",

          messageId:
            restoredRecord.messageId,
        }
      );

      if (
        personalTicketChannelId
      ) {
        await sendPersonalTicketRestoreNotice(
          guild,
          restoredRecord.targetId,
          personalTicketChannelId
        ).catch(
          error =>
            console.warn(
              `[SC_GI] Aviso de retorno no ticket indisponível para ${restoredRecord.targetId}:`,
              error?.message ||
              error
            )
        );
      }

      const targetUser =
        await fetchUserCached(
          restoredRecord.targetId
        );

      if (targetUser) {
        const baseRestoreEmbed =
          new EmbedBuilder()
            .setColor(
              0x2ecc71
            )
            .setTitle(
              "💜 Que bom ter você de volta!"
            )
            .setDescription(
              [
                `Seu retorno à **SantaCreators** foi confirmado.`,
                `🧭 Você retoma na área **${restoredRecord.area || "não informada"}**.`,
                `📚 Seu histórico anterior foi preservado. Você não está começando do zero.`,
                personalTicketChannelId
                  ? `🎫 Seu mesmo Ticket Pessoal continua vinculado ao acompanhamento.`
                  : "",
                activeEvolutionThreadId
                  ? `📝 Seu Forms/Evolução anterior foi reativado no ponto compatível com sua hierarquia atual.`
                  : "",
              ]
                .filter(Boolean)
                .join(
                  "\n"
                )
            )
            .setImage(
              GIF_SC_GI
            )
            .setFooter({
              text:
                "SantaCreators • retorno à gestão",
            })
            .setTimestamp();

        const lifecycleEmbeds =
          (
            lifecycleReturnBundle?.chunks ||
            []
          ).map(
            (
              chunk,
              index
            ) => ({
              color:
                0x2ecc71,

              title:
                index === 0
                  ? "💡 Sobre sua retomada"
                  : "💬 Continuação",

              description:
                chunk,

              footer: {
                text:
                  "SantaCreators • acompanhamento pessoal",
              },
            })
          );

        await sendDM_andMirror(
          guild,
          targetUser,
          baseRestoreEmbed,
          "",
          lifecycleEmbeds
        );
      }

      await logMemberHistoryEvent(
        guild,
        {
          type:
            "Membro Restaurado após Desligamento",

          memberId:
            restoredRecord.targetId,

          actorId:
            actor.id,

          before: {
            status:
              "Desligado",

            controlMessageId:
              archiveKey,

            disconnectedAtMs,

            reason:
              archive.reason ||
              null,
          },

          after: {
            status:
              "Ativo",

            newControlMessageId:
              restoredRecord.messageId,

            area:
              restoredRecord.area,

            personalTicketChannelId:
              personalTicketChannelId ||
              null,

            formsOriginalThreadId:
              originalFormsThreadId ||
              null,

            activeEvolutionThreadId:
              activeEvolutionThreadId ||
              null,
          },

          addedRoleIds:
            restoredRoleIds,

          record:
            restoredRecord,

          note:
            archive.legacyRecovered
              ? "Restauração executada a partir de um desligamento antigo recuperado pelo próprio log. Cargos exatos anteriores inexistentes foram reconstruídos somente pelo pacote oficial da última área conhecida."
              : "Restauração executada a partir do snapshot persistente salvo antes do desligamento.",
        }
      ).catch(
        () => null
      );

      archive.personalTicketChannelId =
        personalTicketChannelId ||
        archive.personalTicketChannelId ||
        null;

      archive.formsOriginalThreadId =
        originalFormsThreadId ||
        archive.formsOriginalThreadId ||
        null;

      archive.restored =
        true;

      archive.restoredAtMs =
        restoredAtMs;

      archive.restoredBy =
        actor.id;

      archive.restoredControlMessageId =
        restoredRecord.messageId;

      SC_GI_STATE.disconnectedSnapshots.set(
        archiveKey,
        archive
      );

      await SC_GI_saveNow();

      markBoardDirty();

      scheduleRespBoardRender(
        guild,
        {
          force:
            true,
        }
      );

      return {
        ok:
          true,

        archive,

        restoredRecord,

        personalTicketChannelId,

        originalFormsThreadId,

        activeEvolutionThreadId,
      };
    }

    // ====================== RESPONSÁVEL DIRETO
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

  await assertCanManageGIRecord(guild, { id: actorId }, rec.targetId, 'definir responsável direto');

  const mem = await fetchMemberCached(guild, pickedUserId);
  if (!mem) throw new Error('Usuário inválido ou fora do servidor.');

  const targetMem = await fetchMemberCached(guild, rec.targetId);
  const type = getHighestTypeFromMember(mem);
  if (!type) throw new Error('Este usuário não possui cargos válidos de responsável.');

  const respRank = getManagementRank(mem);
  const targetRank = getManagementRank(targetMem);

  if (pickedUserId === rec.targetId) {
    throw new Error('O membro não pode ser responsável por ele mesmo.');
  }

  if (targetRank !== Infinity && respRank >= targetRank) {
    throw new Error('Hierarquia bloqueada: o responsável direto precisa estar acima do membro.');
  }

  if (rec.responsibleUserId !== pickedUserId || rec.responsibleType !== type) {
    rec.responsibleHistory.push({
      atMs: nowMs(),
      userId: pickedUserId,
      type,
      setBy: actorId,
      manual: true
    });
  }

  rec.responsibleUserId = pickedUserId;
  rec.responsibleType = type;
  rec.responsibleManual = true;
  rec.responsibleSetBy = actorId;
  rec.responsibleUpdatedAtMs = nowMs();

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
          await msg.edit({ embeds: [emb], components: registroButtons(messageId, rec.active) });
        }
      } catch {}

      await logMsg(
        guild,
        'Responsável Direto Definido (GI)',
        [
          `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
          `🧭 **Tipo:** ${TYPE_LABEL(rec.responsibleType) || '—'}`,
          `👨‍✈️ **Responsável:** <@${rec.responsibleUserId}> (\`${rec.responsibleUserId}\`)`,
          `🔗 **Link:** [Abrir registro](https://discord.com/channels/${guild.id}/${rec.channelId}/${rec.messageId})`
        ].join('\n'),
        {
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`SC_GI_UNDO_RESP:${messageId}`)
                .setLabel('Alterar Responsável')
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        }
      );

      scheduleRespBoardRender(
        guild,
        {
          force: true,
        }
      );

      return true;
    }

    // ====================== BOARD (moldura) ======================
    const CATEGORY_ORDER  = { OWNER:0, RESP_CREATORS:1, RESP_INFLU:2, RESP_LIDER:3, OUTRO:9 };
    const CATEGORY_TITLES = { OWNER:'Owner', RESP_CREATORS:'Resp Creators', RESP_INFLU:'Resp Influ', RESP_LIDER:'Resp Líder', OUTRO:'Outros' };
    const CATEGORY_EMOJI  = { OWNER:'👑',   RESP_CREATORS:'🧑‍🎨',         RESP_INFLU:'🧑‍🚀',     RESP_LIDER:'🧑‍✈️',     OUTRO:'📦' };

    const BOX_W   = 58;
    const BOX_TOP = '┏' + '━'.repeat(BOX_W) + '┓';
    const BOX_BOT = '┗' + '━'.repeat(BOX_W) + '┛';

    function markBoardDirty() {
      SC_GI_STATE.boardDirty =
        true;
    }

    const SC_GI_BOARD_RENDER_TIMERS =
      new Map();

    function scheduleRespBoardRender(
      guild,
      {
        force = false,
        delayMs = 350,
      } = {}
    ) {
      if (!guild?.id) {
        return;
      }

      markBoardDirty();

      const guildId =
        String(
          guild.id
        );

      const previousTimer =
        SC_GI_BOARD_RENDER_TIMERS.get(
          guildId
        );

      if (previousTimer) {
        clearTimeout(
          previousTimer
        );
      }

      const timer =
        setTimeout(
          () => {
            SC_GI_BOARD_RENDER_TIMERS.delete(
              guildId
            );

            void renderRespBoard(
              guild,
              {
                force,
              }
            ).catch(
              error => {
                console.warn(
                  '[SC_GI] Falha ao atualizar board em segundo plano:',
                  error?.message ||
                  error
                );
              }
            );
          },
          Math.max(
            0,
            Number(
              delayMs ||
              0
            )
          )
        );

      timer.unref?.();

      SC_GI_BOARD_RENDER_TIMERS.set(
        guildId,
        timer
      );
    }

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
        const ch = await client.channels.fetch(SC_GI_CFG.CHANNEL_LOGS).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return;

        const emb = new EmbedBuilder()
          .setColor(extra.color || 0x8e44ad)
          .setTitle('🧾 LOG — ' + title)
          .setDescription(description)
          .setImage(GIF_SC_GI)
          .setFooter({ text: 'SantaCreators • gestaoinfluencer' })
          .setTimestamp(new Date());

        if (extra.footer) emb.setFooter({ text: extra.footer });
        if (extra.thumb)  emb.setThumbnail(extra.thumb);
        if (extra.fields) emb.addFields(extra.fields);

        const payload = { embeds: [emb] };
        if (extra.components) payload.components = extra.components;

        await ch.send(payload);
      } catch {}
    }

    // =====================================================
    // HISTÓRICO PERMANENTE INDIVIDUAL
    // =====================================================

    async function logMemberHistoryEvent(
      guild,
      {
        type,
        memberId,
        actorId = null,
        before = null,
        after = null,
        addedRoleIds = [],
        removedRoleIds = [],
        record = null,
        note = null,
      } = {}
    ) {
      try {
        const channel =
          await client.channels
            .fetch(
              SC_GI_CFG
                .CHANNEL_MEMBER_HISTORY_LOG
            )
            .catch(
              () => null
            );

        if (
          !channel ||
          channel.type !==
            ChannelType.GuildText
        ) {
          return false;
        }

        const safeMemberId =
          String(
            memberId ||
            ""
          );

        const roleText =
          (roleIds) => {
            if (
              !Array.isArray(
                roleIds
              ) ||
              roleIds.length ===
                0
            ) {
              return "Nenhum";
            }

            return roleIds
              .map(
                roleId => {
                  const role =
                    guild.roles.cache.get(
                      String(
                        roleId
                      )
                    );

                  return (
                    `• ${
                      role?.name ||
                      "Cargo não encontrado"
                    } | ID: \`${roleId}\``
                  );
                }
              )
              .join(
                "\n"
              );
          };

        const safeJson =
          (value) => {
            if (
              value == null
            ) {
              return "—";
            }

            try {
              return (
                typeof value ===
                  "string"
                  ? value
                  : JSON.stringify(
                      value,
                      null,
                      2
                    )
              );
            } catch {
              return String(
                value
              );
            }
          };

        const formatLocalDateTime =
          (timestampMs) => {
            const timestamp =
              Number(
                timestampMs ||
                0
              );

            if (
              !timestamp
            ) {
              return "não informado";
            }

            return new Date(
              timestamp
            ).toLocaleString(
              "pt-BR",
              {
                timeZone:
                  "America/Sao_Paulo",

                day:
                  "2-digit",

                month:
                  "2-digit",

                year:
                  "numeric",

                hour:
                  "2-digit",

                minute:
                  "2-digit",

                second:
                  "2-digit",
              }
            );
          };

        const splitLogText =
          (
            value,
            maximum = 1700
          ) => {
            const text =
              String(
                value ??
                ""
              );

            if (!text) {
              return [
                "—"
              ];
            }

            const chunks =
              [];

            let remaining =
              text;

            while (
              remaining.length >
              maximum
            ) {
              let cutAt =
                remaining.lastIndexOf(
                  "\n",
                  maximum
                );

              if (
                cutAt <
                Math.floor(
                  maximum *
                  0.5
                )
              ) {
                cutAt =
                  maximum;
              }

              chunks.push(
                remaining
                  .slice(
                    0,
                    cutAt
                  )
              );

              remaining =
                remaining
                  .slice(
                    cutAt
                  )
                  .replace(
                    /^\n+/,
                    ""
                  );
            }

            if (
              remaining
            ) {
              chunks.push(
                remaining
              );
            }

            return chunks.length
              ? chunks
              : [
                  "—"
                ];
          };

        const formatAreaHistory =
          () => {
            const history =
              Array.isArray(
                record?.areaHistory
              )
                ? record.areaHistory
                : [];

            if (
              history.length ===
                0
            ) {
              return "Sem histórico estruturado de áreas.";
            }

            return history
              .map(
                (
                  item,
                  index
                ) => {
                  const start =
                    Number(
                      item?.startedAtMs ||
                      0
                    );

                  const end =
                    Number(
                      item?.endedAtMs ||
                      Date.now()
                    );

                  const duration =
                    start > 0
                      ? formatDurationFull(
                          Math.max(
                            0,
                            end -
                            start
                          )
                        )
                      : "tempo não calculado";

                  const changedBy =
                    item?.changedBy
                      ? ` | alterado por ID: ${item.changedBy}`
                      : "";

                  return (
                    `${index + 1}. ` +
                    `${item?.area || "Área desconhecida"}` +
                    ` | início: ${formatLocalDateTime(start)}` +
                    ` | fim: ${item?.endedAtMs ? formatLocalDateTime(end) : "atual"}` +
                    ` | duração: ${duration}` +
                    `${changedBy}`
                  );
                }
              )
              .join(
                "\n"
              );
          };

        const sendCompleteSection =
          async (
            title,
            value,
            {
              codeLanguage = null,
            } = {}
          ) => {
            const chunks =
              splitLogText(
                value,
                codeLanguage
                  ? 1650
                  : 1800
              );

            for (
              let index = 0;
              index < chunks.length;
              index++
            ) {
              const prefix =
                index === 0
                  ? title
                  : `${title} • continuação ${index + 1}/${chunks.length}`;

              const body =
                codeLanguage
                  ? `${prefix}\n\`\`\`${codeLanguage}\n${chunks[index]}\n\`\`\``
                  : `${prefix}\n${chunks[index]}`;

              await channel.send({
                content:
                  body,

                allowedMentions: {
                  parse:
                    [],

                  users:
                    [],

                  roles:
                    [],
                },
              });
            }
          };

        const user =
          safeMemberId
            ? await fetchUserCached(
                safeMemberId
              )
            : null;

        const eventMs =
          Date.now();

        const eventUnix =
          Math.floor(
            eventMs /
            1000
          );

        const localDateTime =
          formatLocalDateTime(
            eventMs
          );

        const summaryDescription =
          [
            safeMemberId
              ? `👤 **Membro:** <@${safeMemberId}>`
              : "👤 **Membro:** não identificado",

            safeMemberId
              ? `🆔 **Discord:** \`${safeMemberId}\``
              : "",

            actorId
              ? `👮 **Executor:** <@${actorId}> (\`${actorId}\`)`
              : "🤖 **Executor:** Sistema",

            `🕒 **Data/Hora São Paulo:** \`${localDateTime}\``,
            `🕒 **Timestamp Discord:** <t:${eventUnix}:F>`,

            "",

            record?.messageId &&
            record?.channelId
              ? `🧾 **Controle GI:** https://discord.com/channels/${guild.id}/${record.channelId}/${record.messageId}`
              : "",

            record?.personalTicketChannelId
              ? `🎫 **Ticket pessoal:** https://discord.com/channels/${guild.id}/${record.personalTicketChannelId}`
              : "",

            "",

            "➕ **Cargos adicionados**",
            roleText(
              addedRoleIds
            ),

            "",

            "➖ **Cargos removidos**",
            roleText(
              removedRoleIds
            ),
          ]
            .filter(
              Boolean
            )
            .join(
              "\n"
            );

        const embed =
          new EmbedBuilder()
            .setColor(
              0x8e44ad
            )
            .setTitle(
              `📚 Histórico • ${type || "Alteração GI"}`
            )
            .setDescription(
              summaryDescription
                .slice(
                  0,
                  4096
                )
            )
            .setFooter({
              text:
                "SantaCreators • histórico permanente da gestão",
            })
            .setTimestamp(
              new Date(
                eventMs
              )
            );

        if (
          user?.displayAvatarURL
        ) {
          embed.setThumbnail(
            user.displayAvatarURL({
              size:
                256,
            })
          );
        }

        await channel.send({
          embeds: [
            embed
          ],

          allowedMentions: {
            users: [
              safeMemberId,
              actorId,
            ].filter(Boolean),

            roles:
              [],

            parse:
              [],
          },
        });

        await sendCompleteSection(
          "📤 **ANTES • conteúdo completo**",
          safeJson(
            before
          ),
          {
            codeLanguage:
              "json",
          }
        );

        await sendCompleteSection(
          "📥 **DEPOIS • conteúdo completo**",
          safeJson(
            after
          ),
          {
            codeLanguage:
              "json",
          }
        );

        await sendCompleteSection(
          "🧭 **Trajetória completa de áreas/cargos**",
          formatAreaHistory()
        );

        if (
          note
        ) {
          await sendCompleteSection(
            "📝 **Observação completa**",
            String(
              note
            )
          );
        }

        return true;
      } catch (
        error
      ) {
        console.warn(
          "[SC_GI] Falha ao registrar histórico individual:",
          error?.message ||
          error
        );

        return false;
      }
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

          setRoleBypass(userId, 12000); // 12s de bypass

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
              .setDescription([ // NOVO: link para o registro
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
          }); // NOVO: recordMessageId
        SC_GI_scheduleSave();

        // remove TODOS cargos
        setRoleBypass(userId, 15000);
        await member.roles.set([]).catch(()=>{});

        // DM punição (mas sem desligar do registro)
        const u = await fetchUserCached(userId);
        if (u) {
            const link = rec ? recordLink(rec.guildId, rec.channelId, rec.messageId) : null; // NOVO: link para o registro
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

            await warnAndReAddGI(guild, userId, rec); // NOVO: passa o registro
    }

const AUTO_DESLIGAR_IN_PROGRESS =
  new Set();

async function autoDesligarPausadosVencidos(guild, origem = 'tick') {
  const n = nowMs();
  const records = Array.from(SC_GI_STATE.registros.values());

  for (const rec of records) {
    if (!rec) continue;

    const resolvedGuildId =
      String(
        rec.guildId ||
        client.channels.cache.get(
          String(rec.channelId || "")
        )?.guildId ||
        ""
      );

    if (!resolvedGuildId) {
      console.warn(
        `[SC_GI] Registro ${rec.messageId} de ${rec.targetId} sem guildId resolvível.`
      );
      continue;
    }

    if (!rec.guildId) {
      rec.guildId =
        resolvedGuildId;

      SC_GI_scheduleSave();
    }

    if (resolvedGuildId !== guild.id) continue;
    if (rec.active) continue;

    const pausedTotalMs = getCurrentPauseMs(rec, n);
    const dias = Math.floor(pausedTotalMs / (24 * 60 * 60 * 1000));

    if (pausedTotalMs < AUTO_DESLIGAR_PAUSA_MS) continue;

    const autoKey =
      `${guild.id}:${rec.messageId}`;

    if (
      AUTO_DESLIGAR_IN_PROGRESS.has(
        autoKey
      )
    ) {
      continue;
    }

    AUTO_DESLIGAR_IN_PROGRESS.add(
      autoKey
    );

    try {
      await logMsg(
        guild,
        'Auto-desligamento detectado (GI)',
        [
          `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
          `⏸️ **Tempo da pausa atual:** \`${formatDurationFull(pausedTotalMs)}\``,
          `📅 **Dias pausado:** \`${dias}\``,
          `🤖 **Origem:** \`${origem}\``,
          `🧾 **Registro:** \`${rec.messageId}\``,
          '',
          '✅ Resultado: tentando desligar automaticamente agora.'
        ].join('\n')
      );

      await desligarRegistro(
        guild,
        client.user,
        rec.messageId,
        `Auto-desligado após ${dias} dias consecutivos na pausa atual`
      );
    } catch (e) {
      console.warn(
        `[SC_GI] Falha ao auto-desligar ${rec.targetId} após ${dias} dias pausado:`,
        e?.message || e
      );

      await logMsg(
        guild,
        'Falha no Auto-desligamento (GI)',
        [
          `👤 **Membro:** <@${rec.targetId}> (\`${rec.targetId}\`)`,
          `⏸️ **Tempo da pausa atual:** \`${formatDurationFull(pausedTotalMs)}\``,
          `📅 **Dias pausado:** \`${dias}\``,
          `🤖 **Origem:** \`${origem}\``,
          `🧾 **Registro:** \`${rec.messageId}\``,
          `⚠️ **Erro:** \`${String(e?.message || e).slice(0, 900)}\``
        ].join('\n')
      );
    } finally {
      AUTO_DESLIGAR_IN_PROGRESS.delete(
        autoKey
      );
    }
  }
}

    // ====================== RELÓGIO CRÍTICO DA PAUSA ======================
    // Mantém o auto-desligamento independente do loop pesado de manutenção.
    // Assim, mesmo que o tick principal demore em outras rotinas,
    // a contagem crítica de pausa continua sendo verificada.
    let isPauseClockTicking = false;
    let lastPauseClockRunAtMs = 0;

    async function pauseClockTick(origem = 'interval_critico') {
      const n = nowMs();

      // Evita duas execuções praticamente juntas quando o tick principal
      // e o intervalo crítico dispararem no mesmo instante.
      if ((n - lastPauseClockRunAtMs) < 30 * 1000) return;
      if (isPauseClockTicking) return;

      isPauseClockTicking = true;
      lastPauseClockRunAtMs = n;

      try {
        for (const [, guild] of client.guilds.cache) {
          await autoDesligarPausadosVencidos(guild, origem);
        }
      } catch (e) {
        console.warn('[SC_GI] pauseClockTick err:', e?.message || e);
      } finally {
        isPauseClockTicking = false;
      }
    }

    // ====================== LOOP ======================
    let isTicking = false; // ✅ Trava para evitar sobreposição de execuções

    let lastRecordsConsistencyAtMs =
      0;

    async function tick() {
      if (isTicking) return;
      isTicking = true;

      try {
        await pauseClockTick('tick_principal');

        // NOVO: DM de aviso de auto-desligamento
        for (const rec of SC_GI_STATE.registros.values()) {
          if (!rec.active) {
            const pauseCountdownMs = getPauseCountdownMs(rec, nowMs());
            // Envia DM se faltar menos de 3 dias e não tiver avisado nas últimas 12h
            if (pauseCountdownMs > 0 && pauseCountdownMs < 3 * 24 * 60 * 60 * 1000) {
              if (!rec.lastCountdownWarningAt || (nowMs() - rec.lastCountdownWarningAt) > 12 * 60 * 60 * 1000) {
                const targetUser = await fetchUserCached(rec.targetId);
                if (targetUser) {
                  const dmEmbed = new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle('⚠️ Aviso: Auto-desligamento da Gestão Influencer')
                    .setDescription(`Olá <@${rec.targetId}>, seu controle GI está pausado. Se não for retomado, você será **automaticamente desligado(a)** da gestão em **${pauseCountdownText(rec, nowMs())}**.`)
                    .addFields({ name: '🔗 Seu Registro', value: recordLink(rec.guildId, rec.channelId, rec.messageId) || '—', inline: false })
                    .setFooter({ text: 'SantaCreators • Gestaoinfluencer' }).setTimestamp(new Date());
                  
                  const guild = client.guilds.cache.get(rec.guildId);
                  if (guild) {
                    await sendDM_andMirror(guild, targetUser, dmEmbed, `<@${rec.targetId}>`);
                  }
                  rec.lastCountdownWarningAt = nowMs();
                  SC_GI_scheduleSave();
                }
              }
            }
          }
        }
        const n = nowMs();

        for (const rec of SC_GI_STATE.registros.values()) {
          // ✅ Atualização visual automática do controle.
          // Controles pausados atualizam com mais frequência porque
          // exibem tempo pausado e contagem de auto-desligamento.
          const visualRefreshEveryMs =
            rec.active
              ? SC_GI_CFG.CONTROL_REFRESH_ACTIVE_MS
              : SC_GI_CFG.CONTROL_REFRESH_PAUSED_MS;

          if (
            !rec.lastControlVisualRefreshAtMs ||
            (
              n -
              Number(
                rec.lastControlVisualRefreshAtMs ||
                0
              )
            ) >=
              visualRefreshEveryMs
          ) {
            const refreshGuild =
              client.guilds.cache.get(
                String(rec.guildId || "")
              ) ||
              client.channels.cache.get(
                String(rec.channelId || "")
              )?.guild ||
              null;

            if (refreshGuild) {
              if (!rec.guildId) {
                rec.guildId =
                  refreshGuild.id;

                SC_GI_scheduleSave();
              }

              await refreshRegistroMessage(
                refreshGuild,
                client.user,
                rec.messageId,
                'Atualização visual automática',
                {
                  log:
                    false,
                }
              ).catch(
                error => {
                  console.warn(
                    `[SC_GI] Falha ao atualizar visualmente ${rec.targetId}:`,
                    error?.message || error
                  );
                }
              );
            }
          }

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
              const chAviso = await client.channels.fetch(SC_GI_CFG.CHANNEL_AVISOS_1M).catch(() => null);
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

        }

        const shouldRunRecordsConsistency =
          !lastRecordsConsistencyAtMs ||
          (
            n -
            lastRecordsConsistencyAtMs
          ) >=
            SC_GI_CFG.RECORDS_CONSISTENCY_MS;

        for (const [, g] of client.guilds.cache) {
          // 🔧 FAILSAFE: repara registros sem botões ou deletados.
          //
          // Essa varredura completa é propositalmente mais
          // espaçada porque percorre todos os registros e faz
          // várias leituras no Discord.
          let restoredAny =
            false;

          if (
            shouldRunRecordsConsistency
          ) {
            restoredAny =
              await ensureRecordsConsistency(
                g
              );
          }

          // ✅ Se restaurou algo (mandou msg nova),
          // recria o menu no final.
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
    let SC_GI_RUNTIME_STARTED =
      false;

    let SC_GI_PAUSE_CLOCK_INTERVAL =
      null;

    let SC_GI_MAIN_TICK_INTERVAL =
      null;

    async function startScGiRuntime() {
      if (
        SC_GI_RUNTIME_STARTED
      ) {
        return;
      }

      SC_GI_RUNTIME_STARTED =
        true;

      try {
        await SC_GI_load();

        // =====================================================
        // RESTAURA OS TIMERS INDIVIDUAIS DOS CONTROLES PAUSADOS
        // =====================================================
        //
        // O arquivo JSON pode carregar controles que já estavam
        // pausados antes de um restart/deploy.
        //
        // O relógio global continua existindo como failsafe,
        // mas cada registro pausado volta a ter seu próprio
        // timer individual imediatamente após o carregamento.
        //
        // scheduleGiAutoDisableTimer() já limpa qualquer timer
        // anterior da mesma mensagem antes de criar outro.
        // Portanto este processo é seguro contra duplicação.
        // =====================================================

        for (
          const rec
          of SC_GI_STATE.registros.values()
        ) {
          if (
            rec?.active === false &&
            rec?.messageId
          ) {
            scheduleGiAutoDisableTimer(
              rec
            );
          }
        }

        // =====================================================
        // IA — FEEDBACK SEMANAL DOS MEMBROS
        // =====================================================

        if (
          typeof weeklyMemberAiFeedbackOnReady ===
          'function'
        ) {
          weeklyMemberAiFeedbackOnReady(
            client
          );
        } else {
          console.warn(
            '[SC_GI] Weekly Member AI indisponível. Scheduler não iniciado.'
          );
        }

        for (const [, guild] of client.guilds.cache) {
          await ensureMenu(guild);

          await autoDesligarPausadosVencidos(
            guild,
            'runtime_start'
          );

          markBoardDirty();

          await renderRespBoard(
            guild,
            {
              force:
                true,
            }
          );

          for (
            const rec
            of SC_GI_STATE.registros.values()
          ) {
            const resolvedGuildId =
              String(
                rec.guildId ||
                client.channels.cache.get(
                  String(rec.channelId || '')
                )?.guildId ||
                ''
              );

            if (
              resolvedGuildId !==
              guild.id
            ) {
              continue;
            }

            if (!rec.guildId) {
              rec.guildId =
                resolvedGuildId;

              SC_GI_scheduleSave();
            }

            await refreshRegistroMessage(
              guild,
              client.user,
              rec.messageId,
              'Atualização automática ao iniciar o runtime',
              {
                log:
                  false,
              }
            ).catch(() => {});
          }

          // re-agenda restores pendentes na hora que o runtime inicia
          for (
            const [uid]
            of SC_GI_STATE.roleSnapshots.entries()
          ) {
            await scheduleRestoreRoles(
              guild,
              uid
            );
          }
        }

        // Executa um tick imediatamente.
        await tick();

        // Relógio crítico independente.
        SC_GI_PAUSE_CLOCK_INTERVAL =
          setInterval(
            () => {
              void pauseClockTick(
                'interval_critico'
              );
            },
            SC_GI_CFG.TICK_MS
          );

        SC_GI_MAIN_TICK_INTERVAL =
          setInterval(
            () => {
              void tick();
            },
            SC_GI_CFG.TICK_MS
          );

        SC_GI_PAUSE_CLOCK_INTERVAL
          .unref?.();

        SC_GI_MAIN_TICK_INTERVAL
          .unref?.();

        console.log(
          '[SC_GI] Controle GI v3.4 LEVE iniciado.'
        );
      } catch (e) {
        SC_GI_RUNTIME_STARTED =
          false;

        console.warn(
          '[SC_GI] Erro no init:',
          e?.message || e
        );
      }
    }

    // Funciona tanto quando o módulo é carregado ANTES quanto
    // DEPOIS do ClientReady.
    if (
      client.isReady?.()
    ) {
      void startScGiRuntime();
    } else {
      client.once(
        Events.ClientReady,
        () => {
          void startScGiRuntime();
        }
      );
    }

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
        const guild =
          newMember.guild;

        if (!guild) return;

        /*
         * Confere se houve qualquer mudança
         * nos cargos do membro.
         */

        const rolesMudaram =
          oldMember.roles.cache.size !==
            newMember.roles.cache.size ||
          oldMember.roles.cache.some(
            (role) =>
              !newMember.roles.cache.has(
                role.id
              )
          );

        /*
         * A sincronização hierárquica fica antes
         * do bypass do Controle GI.
         *
         * Assim até alterações feitas pelo próprio
         * bot atualizam corretamente os tópicos.
         */

        if (
          rolesMudaram &&
          typeof syncEvolutionHierarchyForMember ===
            'function'
        ) {
          const originalThreadId =
            await resolveFormsCreatorThreadIdForGI(
              newMember.id
            );

          await syncEvolutionHierarchyForMember(
            client,
            {
              guildId:
                guild.id,

              userId:
                newMember.id,

              originalThreadId,

              reason:
                'Cargo do membro alterado no Discord'
            }
          ).catch(
            (error) => {
              console.error(
                `[SC_GI] Falha ao sincronizar evolução de ${newMember.id}:`,
                error
              );
            }
          );
        }

        // Se foi uma alteração interna do próprio sistema,
        // não registra como decisão manual.
        if (
          hasRoleBypass(
            newMember.id
          )
        ) {
          return;
        }

        const oldRoleIds =
          new Set(
            oldMember.roles.cache.keys()
          );

        const newRoleIds =
          new Set(
            newMember.roles.cache.keys()
          );

        const addedRoleIds =
          [...newRoleIds].filter(
            (roleId) =>
              !oldRoleIds.has(roleId)
          );

        const removedRoleIds =
          [...oldRoleIds].filter(
            (roleId) =>
              !newRoleIds.has(roleId)
          );

        // =====================================================
        // RESPONSÁVEIS DE TOPO NÃO PODEM TER MKT/TICKET
        // =====================================================
        //
        // Vale inclusive quando alguém tenta adicionar
        // os cargos manualmente depois.
        //
        // Resp Líder:
        // 1352407252216184833
        //
        // Resp Influ:
        // 1262262852949905409
        //
        // Resp Creators:
        // 1352408327983861844
        //
        // =====================================================

        const isTopResponsibleMember =
          newMember.roles.cache.has(
            AREA_ROLE_IDS.RESP_LIDER
          ) ||
          newMember.roles.cache.has(
            AREA_ROLE_IDS.RESP_INFLU
          ) ||
          newMember.roles.cache.has(
            AREA_ROLE_IDS.RESP_CREATORS
          );

        if (
          rolesMudaram &&
          isTopResponsibleMember
        ) {
          const forbiddenPresent =
            [
              AREA_ROLE_IDS.MKT_CREATORS,
              AREA_ROLE_IDS.TICKETS,
            ].filter(
              roleId =>
                newMember.roles.cache.has(
                  roleId
                )
            );

          if (
            forbiddenPresent.length >
            0
          ) {
            setRoleBypass(
              newMember.id,
              12000
            );

            await newMember.roles
              .remove(
                forbiddenPresent,
                "Hierarquia GI: Resp Líder, Resp Influ e Resp Creators não utilizam MKT Creators nem Tickets"
              )
              .catch(
                error =>
                  console.warn(
                    `[SC_GI] Não consegui remover cargos incompatíveis de ${newMember.id}:`,
                    error?.message ||
                    error
                  )
              );

            await logMsg(
              guild,
              "🧹 Correção automática de hierarquia",
              [
                `👤 **Membro:** <@${newMember.id}> (\`${newMember.id}\`)`,
                "",
                "**Cargos incompatíveis removidos:**",
                ...forbiddenPresent.map(
                  roleId => {
                    const role =
                      guild.roles.cache.get(
                        roleId
                      );

                    return (
                      `• ${
                        role?.name ||
                        "Cargo não encontrado"
                      } | ID: \`${roleId}\``
                    );
                  }
                ),
                "",
                "📌 Resp Líder, Resp Influ e Resp Creators não utilizam MKT Creators nem o cargo de Tickets."
              ].join(
                "\n"
              )
            ).catch(
              () => {}
            );

            await logMemberHistoryEvent(
              guild,
              {
                type:
                  "Correção Automática de Hierarquia",

                memberId:
                  newMember.id,

                actorId:
                  guild.client.user?.id ||
                  null,

                before: {
                  cargosIncompatíveis:
                    forbiddenPresent,
                },

                after: {
                  cargosIncompatíveis:
                    [],
                },

                removedRoleIds:
                  forbiddenPresent,

                record:
                  SC_GI_findCurrentControl(
                    guild.id,
                    newMember.id
                  ),

                note:
                  "MKT Creators/Tickets removidos automaticamente por incompatibilidade com a hierarquia atual.",
              }
            ).catch(
              () => {}
            );

            return;
          }
        }

        // Aguarda alguns ms para o Audit Log do Discord aparecer.
        if (
          addedRoleIds.length > 0 ||
          removedRoleIds.length > 0
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(resolve, 800)
          );

          const masterChange =
            await findRecentManualRoleUpdate(
              guild,
              newMember.id
            );

          if (masterChange) {
            const auditAddedRoleIds =
              extractAuditRoleIds(
                masterChange.entry,
                "$add"
              );

            const auditRemovedRoleIds =
              extractAuditRoleIds(
                masterChange.entry,
                "$remove"
              );

            const confirmedAddedRoleIds =
              auditAddedRoleIds.length > 0
                ? addedRoleIds.filter(
                    (roleId) =>
                      auditAddedRoleIds.includes(
                        roleId
                      )
                  )
                : addedRoleIds;

            const confirmedRemovedRoleIds =
              auditRemovedRoleIds.length > 0
                ? removedRoleIds.filter(
                    (roleId) =>
                      auditRemovedRoleIds.includes(
                        roleId
                      )
                  )
                : removedRoleIds;

            for (
              const roleId
              of confirmedAddedRoleIds
            ) {
              setMasterRoleOverride(
                newMember.id,
                roleId,
                "present"
              );
            }

            for (
              const roleId
              of confirmedRemovedRoleIds
            ) {
              setMasterRoleOverride(
                newMember.id,
                roleId,
                "absent"
              );
            }

            // Se você/Owner removeu GI,
            // limpa avisos anteriores e NÃO devolve.
            if (
              confirmedRemovedRoleIds.includes(
                GI_ROLE_ID
              )
            ) {
              SC_GI_STATE.giWarningsByUser.delete(
                String(
                  newMember.id
                )
              );

              SC_GI_scheduleSave();
            }

            await logMsg(
              guild,
              "👑 Master Override Manual",
              [
                `👑 **Executor:** <@${masterChange.executorId}>`,
                `👤 **Membro:** <@${newMember.id}>`,
                "",
                confirmedAddedRoleIds.length > 0
                  ? `➕ **Cargos protegidos como PRESENTES:** ${confirmedAddedRoleIds.map((id) => `<@&${id}>`).join(", ")}`
                  : "",
                confirmedRemovedRoleIds.length > 0
                  ? `➖ **Cargos protegidos como AUSENTES:** ${confirmedRemovedRoleIds.map((id) => `<@&${id}>`).join(", ")}`
                  : "",
                "",
                "🔒 Esta decisão manual passa a ter prioridade sobre a automação de Área/hierarquia."
              ]
                .filter(Boolean)
                .join("\n")
            ).catch(() => {});

            // 👑 Mudança manual de você/Owner termina aqui.
            // Nenhuma trava GI, punição ou restauração poderá desfazer.
            return;
          }
        }

        const hadGI =
          oldMember.roles.cache.has(
            GI_ROLE_ID
          );

        const hasGI =
          newMember.roles.cache.has(
            GI_ROLE_ID
          );

        // Se existe override dizendo que GI deve ficar ausente,
        // não devolve o cargo.
        const giMasterOverride =
          getMasterRoleOverride(
            newMember.id,
            GI_ROLE_ID
          );

        if (
          hadGI &&
          !hasGI &&
          giMasterOverride !== "absent"
        ) {
          await handleGIRoleRemoved(
            guild,
            newMember.id
          );
        }
      } catch (error) {
        console.warn(
          "[SC_GI] GuildMemberUpdate:",
          error?.message || error
        );
      }
    });

    // ====================== SAÍDA DO SERVIDOR (GuildMemberRemove) ======================
    // ✅ Desliga automaticamente todos os Controles GI ainda existentes
    // da pessoa que saiu, quitou ou foi removida do servidor.
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        const guild = member.guild;
        const targetId = String(member.id || '');

        if (!guild || !targetId) {
          return;
        }

        // ✅ Cria uma cópia antes de desligar porque desligarRegistro()
        // remove cada registro de SC_GI_STATE.registros.
        const registrosDoMembro = Array.from(
          SC_GI_STATE.registros.values()
        ).filter((rec) =>
          rec.guildId === guild.id &&
          String(rec.targetId) === targetId
        );

        if (registrosDoMembro.length === 0) {
          return;
        }

        for (const rec of registrosDoMembro) {
          try {
            await desligarRegistro(
              guild,
              client.user,
              rec.messageId,
              'Desligamento automático: membro saiu do servidor'
            );

            await logMsg(
              guild,
              'Desligamento automático por saída do servidor (GI)',
              [
                `👤 **Membro:** <@${targetId}> (\`${targetId}\`)`,
                `🧾 **Registro:** \`${rec.messageId}\``,
                `🤖 **Executor:** <@${client.user.id}>`,
                '',
                '✅ **Resultado:** o Controle GI foi desligado automaticamente porque o membro saiu do servidor.'
              ].join('\n')
            ).catch(() => {});
          } catch (error) {
            console.warn(
              `[SC_GI] Falha ao desligar automaticamente o membro ${targetId} que saiu do servidor:`,
              error?.message || error
            );

            await logMsg(
              guild,
              'Falha no desligamento automático por saída (GI)',
              [
                `👤 **Membro:** <@${targetId}> (\`${targetId}\`)`,
                `🧾 **Registro:** \`${rec.messageId}\``,
                `⚠️ **Erro:** \`${String(error?.message || error).slice(0, 900)}\``
              ].join('\n')
            ).catch(() => {});
          }
        }
      } catch (error) {
        console.warn(
          '[SC_GI] GuildMemberRemove:',
          error?.message || error
        );
      }
    });

    // ====================== LISTENER EXTERNO (PEDIR SET) ======================
    // ✅ Isso aqui que faltava para criar o controle sozinho!

dashOn('ticket:pessoal_vinculado', async (data) => {
  try {
    const userId =
      String(
        data?.userId ||
        ''
      );

    const channelId =
      String(
        data?.channelId ||
        ''
      );

    const guildId =
      String(
        data?.guildId ||
        ''
      );

    if (
      !userId ||
      !channelId
    ) {
      return;
    }

    const rec =
      getLatestRecordByTarget(
        userId
      );

    if (!rec) {
      return;
    }

    if (
      guildId &&
      rec.guildId &&
      String(rec.guildId) !==
        guildId
    ) {
      return;
    }

    // =====================================================
    // FAILSAFE DE PERFORMANCE
    // =====================================================
    //
    // O supervisor do sortChannels reconcilia os Controles GI
    // periodicamente. Se o ticket já está vinculado ao mesmo
    // controle, NÃO precisamos editar o card novamente.
    //
    // Sem esta trava, cada reconciliação periódica pode gerar
    // dezenas de edits desnecessários nos cards GI.
    // =====================================================

    if (
      String(
        rec.personalTicketChannelId ||
        ''
      ) ===
      channelId
    ) {
      return;
    }

    rec.personalTicketChannelId =
      channelId;

    SC_GI_scheduleSave();

    const guild =
      client.guilds.cache.get(
        guildId ||
        String(rec.guildId || '')
      );

    if (guild) {
      await refreshRegistroMessage(
        guild,
        client.user,
        rec.messageId,
        'Ticket pessoal vinculado automaticamente',
        {
          log:
            false,
        }
      ).catch(() => {});
    }
  } catch (e) {
    console.warn(
      '[SC_GI] Falha ao vincular ticket pessoal ao controle:',
      e?.message || e
    );
  }
});
dashOn(
  'pedirset:aprovado',
  async (data) => {
    try {
      // ===================================================
      // Se o pedirset.js já iniciou a garantia DIRETA do GI,
      // este listener fica apenas como compatibilidade e não
      // dispara uma segunda criação concorrente.
      // ===================================================
      if (
        data?.directGiStarted ===
          true
      ) {
        return;
      }

      const result =
        await SC_GI_CONTROL_API
          .ensureFromPedirSet({
            guildId:
              data?.guildId,

            userId:
              data?.userId,

            passaporte:
              data?.passaporte ||
              null,
          });

      console.log(
        result?.created
          ? `[SC_GI] Registro automático criado (pausado) para ${data?.userId}.`
          : `[SC_GI] Registro automático já existia para ${data?.userId}; criação duplicada ignorada.`
      );
    } catch (e) {
      console.error(
        '[SC_GI] Erro ao garantir registro automático via pedirset:',
        e
      );
    }
  }
);

    // ====================== INTERAÇÕES ======================
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
          const defaultChan = await guild.channels.fetch(SC_GI_CFG.CHANNEL_MENU_E_REGISTROS).catch(() => null);

          // ✅ FIX: Converte para Array para não bugar o Map durante a modificação dos IDs
          const currentRecords = Array.from(SC_GI_STATE.registros.values());

          for (const rec of currentRecords) {
            // Tenta o canal salvo, se falhar usa o padrão
            let ch = await guild.channels.fetch(rec.channelId).catch(() => null);
            if (!ch) ch = defaultChan;
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

              const emb = await registroEmbed({ targetUser, registrarUser, joinDateMs: rec.joinDateMs, area: rec.area, weeks, months, active: rec.active, rec });

              const newMsg = await ch.send({
                content: `<@${rec.targetId}>`,
                embeds: [emb]
              }).catch(() => null);

              if (newMsg) {
                // Tenta apagar a antiga se existir (e for deletável)
                if (msg && msg.deletable) {
                  await msg.delete().catch(() => {});
                }

                const oldId = rec.messageId;
                rec.messageId = newMsg.id;
                
                SC_GI_STATE.registros.delete(oldId);
                SC_GI_STATE.registros.set(
                  rec.messageId,
                  rec
                );

                SC_GI_scheduleSave();

                // Só coloca os botões DEPOIS de possuir
                // o ID real da nova mensagem.
                await newMsg.edit({
                  components: registroButtons(
                    rec.messageId,
                    rec.active
                  )
                }).catch((error) => {
                  console.warn(
                    `[SC_GI] Falha ao aplicar os botões reais no registro restaurado ${rec.messageId}:`,
                    error?.message || error
                  );
                });

                fixedCount++;

                if (
                  restoreLogCh &&
                  restoreLogCh.isTextBased()
                ) {
                  const logEmb =
                    new EmbedBuilder()
                      .setColor(0xFFA500)
                      .setTitle(
                        '♻️ Registro Restaurado (Manual)'
                      )
                      .setDescription(
                        `**Membro:** <@${rec.targetId}>\n` +
                        `**Motivo:** ${reason}\n` +
                        `**ID Antigo:** ${oldId}\n` +
                        `**Novo ID:** ${rec.messageId}`
                      )
                      .setFooter({
                        text:
                          'SantaCreators • Check Manual'
                      })
                      .setTimestamp();

                  await restoreLogCh.send({
                    embeds: [logEmb]
                  }).catch(() => {});
                }

                await new Promise(
                  r =>
                    setTimeout(
                      r,
                      1000
                    )
                );
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

        // =====================================================
        // COMENTÁRIO SEMANAL POR IA
        // =====================================================

        if (
          interaction.isButton() &&
          interaction.customId.startsWith(
            BTN.FEEDBACK_AI_PREFIX
          )
        ) {
          const raw =
            interaction.customId.replace(
              BTN.FEEDBACK_AI_PREFIX,
              ''
            );

          const {
            rec,
            id: messageId
          } =
            resolveRecordByInteraction(
              interaction,
              raw
            );

          if (!rec) {
            return interaction.reply({
              content:
                '❌ Registro GI não encontrado.',
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.deferReply({
            flags:
              MessageFlags.Ephemeral
          });

          try {
            await assertCanManageGIRecord(
              guild,
              interaction.user,
              rec.targetId,
              'gerar o comentário semanal de IA'
            );

            // =====================================================
            // 1) COMENTÁRIO INTERNO DO FORMS
            // =====================================================
            //
            // Uma falha aqui NÃO impede mais a orientação privada.
            // =====================================================

            let formsResult =
              null;

            let formsError =
              null;

            if (
              typeof forceWeeklyMemberAiFeedback ===
                'function'
            ) {
              try {
                formsResult =
                  await forceWeeklyMemberAiFeedback({
                    client,
                    guild,
                    record:
                      rec,
                    actorUser:
                      interaction.user
                  });
              } catch (error) {
                formsError =
                  error;

                console.warn(
                  `[SC_GI] Comentário IA no Forms falhou para ${rec.targetId}:`,
                  error?.message || error
                );
              }
            } else {
              formsError =
                new Error(
                  'O módulo de comentário semanal por IA não está disponível.'
                );
            }

            // =====================================================
            // 2) ORIENTAÇÃO PRIVADA DO MEMBRO
            // =====================================================
            //
            // É gerada separadamente do texto interno do Forms.
            // Uma falha no Forms NÃO bloqueia mais o PV.
            // =====================================================

            let privateDmSent =
              false;

            let privateDmError =
              null;

            let privateDmSentParts =
              0;

            let privateDmTotalParts =
              0;

            if (
              typeof generateWeeklyMemberPrivateDm ===
                'function'
            ) {
              try {
                const targetUser =
                  await fetchUserCached(
                    rec.targetId
                  );

                if (!targetUser) {
                  throw new Error(
                    'Usuário do registro não encontrado para envio privado.'
                  );
                }

                const privateFeedback =
                  await generateWeeklyMemberPrivateDm({
                    client:
                      guild.client,
                    guild,
                    record:
                      rec,

                    facts:
                      formsResult?.facts ||
                      null,
                  });

                const chunks =
                  Array.isArray(
                    privateFeedback?.chunks
                  )
                    ? privateFeedback.chunks
                    : [];

                privateDmTotalParts =
                  chunks.length;

                if (!chunks.length) {
                  throw new Error(
                    'A orientação privada ficou vazia.'
                  );
                }

                for (
                  let index = 0;
                  index < chunks.length;
                  index++
                ) {
                  const chunk =
                    String(
                      chunks[index] ||
                      ''
                    ).trim();

                  if (!chunk) {
                    continue;
                  }

                  const guidanceEmbed =
                    new EmbedBuilder()
                      .setColor(
                        0x5865f2
                      )
                      .setTitle(
                        index === 0
                          ? '💡 Um retorno para você'
                          : `↳ Continuação ${index + 1}/${chunks.length}`
                      )
                      .setDescription(
                        chunk.slice(
                          0,
                          4096
                        )
                      );

                  if (
                    index ===
                    0
                  ) {
                    guidanceEmbed
                      .setFooter({
                        text:
                          'SantaCreators • acompanhamento pessoal'
                      })
                      .setTimestamp(
                        new Date()
                      );
                  }

                  const sent =
                    await sendDM_andMirror(
                      guild,
                      targetUser,
                      guidanceEmbed,
                      `<@${rec.targetId}>`
                    );

                  if (sent) {
                    privateDmSentParts++;
                  }
                }

                privateDmSent = privateDmTotalParts > 0 &&
                  privateDmSentParts === privateDmTotalParts;

                if (!privateDmSent) {
                  throw new Error(
                    `A orientação foi gerada, mas a entrega ficou incompleta: ${privateDmSentParts}/${privateDmTotalParts} parte(s) confirmadas.`
                  );
                }
              } catch (error) {
                privateDmError =
                  error;

                console.warn(
                  `[SC_GI] Orientação privada IA falhou para ${rec.targetId}:`,
                  error?.message || error
                );
              }
            } else {
              privateDmError =
                new Error(
                  'O gerador de orientação privada não está disponível.'
                );
            }

            // =====================================================
            // LINK DO FORMS
            // =====================================================

            let formsUrl =
              formsResult
                ?.facts
                ?.formsData
                ?.threadUrl ||
              (
                formsResult
                  ?.facts
                  ?.formsThread
                  ?.id
                  ? `https://discord.com/channels/${guild.id}/${formsResult.facts.formsThread.id}`
                  : null
              );

            if (
              !formsUrl &&
              typeof findFormsCreatorThreadIdFastByUserId ===
                'function'
            ) {
              const formsThreadId =
                findFormsCreatorThreadIdFastByUserId(
                  rec.targetId
                );

              if (formsThreadId) {
                formsUrl =
                  `https://discord.com/channels/${guild.id}/${formsThreadId}`;
              }
            }

            const responseLines = [
              `👤 **Membro:** <@${rec.targetId}>`,
              ''
            ];

            if (formsResult) {
              responseLines.push(
                formsResult?.replaced
                  ? '🔄 **Forms:** comentário semanal atualizado com sucesso.'
                  : '🧠 **Forms:** comentário semanal criado com sucesso.'
              );

              if (formsUrl) {
                responseLines.push(
                  `🔗 **Forms pessoal:** ${formsUrl}`
                );
              }
            } else {
              responseLines.push(
                `⚠️ **Forms:** ${formsError?.message || 'não foi possível publicar o comentário interno.'}`
              );
            }

            if (privateDmSent) {
              responseLines.push(
                privateDmTotalParts > 1
                  ? `📨 **Privado:** orientação personalizada enviada em ${privateDmSentParts}/${privateDmTotalParts} partes.`
                  : '📨 **Privado:** orientação personalizada enviada ao membro.'
              );
            } else {
              responseLines.push(
                `⚠️ **Privado:** ${privateDmError?.message || 'não foi possível entregar a orientação privada.'}`
              );
            }

            await interaction.editReply({
              content:
                responseLines.join('\n')
            });
          } catch (e) {
            await interaction.editReply({
              content:
                `⚠️ ${e?.message || 'Não foi possível gerar o acompanhamento.'}`
            });
          }

          return;
        }

        // Parar/Retomar contagem
        if (interaction.isButton() && interaction.customId.startsWith(BTN.STOP_COUNT_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.STOP_COUNT_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // NOVO: defer para evitar timeout
          try {
            await toggleActive(guild, interaction.user, messageId);
            await interaction.editReply({ content: '✅ Estado da contagem atualizado!' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }
          return;
        }

        // Editar registro
        if (interaction.isButton() && interaction.customId.startsWith(BTN.EDIT_PREFIX)) { // NOVO: Botão de edição
          if (!hasAreaEditAuth(interaction.member)) {
            return interaction.reply({
              content: '❌ Você não tem permissão.',
              flags: MessageFlags.Ephemeral
            });
          }

          const raw = interaction.customId.replace(BTN.EDIT_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);

          if (!rec) {
            return interaction.reply({
              content: 'Registro não encontrado.',
              flags: MessageFlags.Ephemeral
            });
          }

          // A validação hierárquica completa continua dentro de editRegistro().
          // Aqui não fazemos chamadas lentas antes de showModal(), porque o Discord
          // exige que o modal seja aberto imediatamente.
          const inpDiscordId =
            new TextInputBuilder()
              .setCustomId(
                'SC_GI_EDIT_DISCORD_ID'
              )
              .setLabel(
                'Discord ID atual / novo'
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setPlaceholder(
                'Ex.: 123456789012345678'
              )
              .setValue(
                String(
                  rec.targetId ||
                  ''
                )
              )
              .setMinLength(17)
              .setMaxLength(20)
              .setRequired(true);

          const inpArea =
            new TextInputBuilder()
              .setCustomId(
                'SC_GI_EDIT_AREA'
              )
              .setLabel(
                'Área (visual)'
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setPlaceholder(
                rec.area ||
                'SocialMedias'
              )
              .setValue(
                rec.area ||
                'SocialMedias'
              )
              .setRequired(true);
          
          const inpDate =
            new TextInputBuilder()
              .setCustomId(
                'SC_GI_EDIT_DATE'
              )
              .setLabel(
                'Data Entrada (DD/MM/AAAA)'
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setPlaceholder(
                'DD/MM/AAAA'
              )
              .setValue(
                msToDDMMYYYY(
                  rec.joinDateMs
                )
              )
              .setRequired(true);
          
          const inpNote =
            new TextInputBuilder()
              .setCustomId(
                'SC_GI_EDIT_NOTE'
              )
              .setLabel(
                'Observação/Nota (opcional)'
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setPlaceholder(
                'Ex.: destaque, mudança visual, etc.'
              )
              .setRequired(false);

          const modal =
            new ModalBuilder()
              .setCustomId(
                `SC_GI_MODAL_EDIT_${messageId}`
              )
              .setTitle(
                'Editar Registro — Gestaoinfluencer'
              )
              .addComponents(
                new ActionRowBuilder()
                  .addComponents(
                    inpDiscordId
                  ),

                new ActionRowBuilder()
                  .addComponents(
                    inpArea
                  ),

                new ActionRowBuilder()
                  .addComponents(
                    inpDate
                  ),

                new ActionRowBuilder()
                  .addComponents(
                    inpNote
                  )
              );

          return interaction.showModal(
            modal
          );
        }

        // Reenviar DM agora
        if (interaction.isButton() && interaction.customId.startsWith(BTN.DMNOW_PREFIX)) { // NOVO: Botão de reenviar DM
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const raw = interaction.customId.replace(BTN.DMNOW_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            await resendDM(
              guild,
              interaction.user,
              messageId
            );

            await interaction.editReply({
              content:
                '✅ DM reenviada! O membro recebeu a atualização da gestão, os dados de desempenho e a orientação personalizada da semana.'
            });
          } catch (e) {
            await interaction.editReply({
              content:
                '⚠️ ' +
                e.message
            });
          }

          return;
        }

        // Definir responsável (abrir select)
        if (interaction.isButton() && interaction.customId.startsWith(BTN.RESP_PREFIX)) {
          if (!hasAuth(interaction.member)) {
            return interaction.reply({
              content: '❌ Você não tem permissão.',
              flags: MessageFlags.Ephemeral
            });
          }

          const raw = interaction.customId.replace(BTN.RESP_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);

          if (!rec) {
            return interaction.reply({
              content: 'Registro não encontrado.',
              flags: MessageFlags.Ephemeral
            });
          }

          // ACK imediato para não estourar o limite de resposta do Discord.
          await interaction.deferReply({
            flags: MessageFlags.Ephemeral
          });

          const rows = [];
          const candidates = await getRespCandidates(guild);

          if (candidates.length > 0 && candidates.length <= 25) {
            rows.push(
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(SEL.RESP_USER_PREFIX + messageId)
                  .setPlaceholder('Selecione o Responsável (lista filtrada por cargos)')
                  .addOptions(
                    candidates.map(c => ({
                      label: c.label,
                      value: c.id,
                      emoji: '👤'
                    }))
                  )
              )
            );
          } else if (typeof UserSelectMenuBuilder !== 'undefined') {
            rows.push(
              new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                  .setCustomId(SEL.RESP_USER_PREFIX + messageId)
                  .setPlaceholder('Selecione o Responsável (será validado pelos cargos)')
                  .setMinValues(1)
                  .setMaxValues(1)
              )
            );
          } else {
            return interaction.editReply({
              content: '⚠️ Não foi possível carregar a lista de responsáveis.',
              components: []
            });
          }

          return interaction.editReply({
            content: '🧭 **Defina o Responsável Direto** (a área será detectada automaticamente pelo maior cargo).',
            components: rows
          });
        }

        // Select de usuário p/ responsável
        if (
          (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) &&
          interaction.customId.startsWith(SEL.RESP_USER_PREFIX)
        ) {
          const raw = interaction.customId.replace(SEL.RESP_USER_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);

          if (!rec) {
            return interaction.reply({
              content: 'Registro não encontrado.',
              flags: MessageFlags.Ephemeral
            });
          }

          await interaction.deferReply({
            flags: MessageFlags.Ephemeral
          });

          const pickedUserId = interaction.values?.[0];

          try {
            await setResponsibleAuto(
              guild,
              interaction.user.id,
              messageId,
              pickedUserId
            );

            return interaction.editReply({
              content: `✅ Responsável definido: <@${pickedUserId}> (área detectada automaticamente).`
            });
          } catch (e) {
            return interaction.editReply({
              content: '⚠️ ' + (e?.message || 'Falha ao definir responsável.')
            });
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

        // Modal editar // NOVO: Modal de edição
        if (interaction.isModalSubmit() && interaction.customId.startsWith('SC_GI_MODAL_EDIT_')) {
          if (!hasAreaEditAuth(interaction.member)) {
            return interaction.reply({
              content: '❌ Você não tem permissão.',
              flags: MessageFlags.Ephemeral
            });
          }

          const messageId =
            interaction.customId.replace(
              'SC_GI_MODAL_EDIT_',
              ''
            );

          await interaction.deferReply({
            flags: MessageFlags.Ephemeral
          });

          try {
            const discordId =
              interaction.fields
                .getTextInputValue(
                  'SC_GI_EDIT_DISCORD_ID'
                )
                ?.trim();

            const area =
              interaction.fields
                .getTextInputValue(
                  'SC_GI_EDIT_AREA'
                )
                ?.trim();

            const note =
              interaction.fields
                .getTextInputValue(
                  'SC_GI_EDIT_NOTE'
                )
                ?.trim();

            const date =
              interaction.fields
                .getTextInputValue(
                  'SC_GI_EDIT_DATE'
                )
                ?.trim();

            const result =
              await editRegistro(
                guild,
                interaction.user,
                messageId,
                area,
                note,
                date,
                discordId
              );

            const responseLines = [];

            if (
              result
                .identityMigration
                ?.changed
            ) {
              responseLines.push(
                `🔁 Discord trocado: <@${result.identityMigration.oldUserId}> → <@${result.identityMigration.newUserId}>.`
              );

              responseLines.push(
                `🎭 Cargos transferidos: **${result.identityMigration.roleTransfer?.removedRoleIds?.length || 0}**.`
              );

              if (
                result
                  .identityMigration
                  .roleTransfer
                  ?.skippedRoleIds
                  ?.length
              ) {
                responseLines.push(
                  `⚠️ ${result.identityMigration.roleTransfer.skippedRoleIds.length} cargo(s) não puderam ser movidos por hierarquia/integração do Discord.`
                );
              }

              responseLines.push(
                '📊 Ranking e Dashboard vinculados ao novo Discord sem zerar o histórico.'
              );

              responseLines.push(
                result
                  .identityMigration
                  .formsResult
                  ?.status ===
                    'synced'
                  ? '📚 FormsCreator mantido no mesmo histórico/tópico.'
                  : result
                      .identityMigration
                      .formsResult
                      ?.status ===
                        'not_found'
                    ? '⚠️ FormsCreator não encontrado para este membro.'
                    : '📚 FormsCreator verificado durante a troca.'
              );
            }

            if (
              result.storedAreaChanged
            ) {
              responseLines.push(
                `✅ Área atualizada para **${result.canonicalArea}**.`
              );
            } else {
              responseLines.push(
                '✅ Registro atualizado!'
              );
            }

            if (
              result.institutionalAreaChanged
            ) {
              if (
                result.roleTransitionSkipped
              ) {
                responseLines.push(
                  '🛡️ Pacote de cargos não foi alterado para essa Área.'
                );
              } else {
                responseLines.push(
                  `🔄 Cargos adicionados: **${result.addedRoleIds.length}**`
                );

                responseLines.push(
                  `🧹 Cargos antigos removidos: **${result.removedRoleIds.length}**`
                );
              }

              responseLines.push(
                result.nicknameUpdated
                  ? '🏷️ Nickname atualizado.'
                  : '🏷️ Nickname já estava correto ou não precisou ser alterado.'
              );
            }

            if (
              result.formsSyncResult.status === 'synced'
            ) {
              responseLines.push(
                '📚 FormsCreator sincronizado.'
              );
            } else if (
              result.formsSyncResult.status === 'pending'
            ) {
              responseLines.push(
                '📚 FormsCreator original atualizado; o espelho do tópico ativo será sincronizado em segundo plano.'
              );
            } else if (
              result.formsSyncResult.status === 'partial'
            ) {
              responseLines.push(
                '⚠️ Registro original atualizado; resumo do tópico ativo pendente. Consulte o log.'
              );
            } else if (
              result.formsSyncResult.status === 'not_found'
            ) {
              responseLines.push(
                '⚠️ FormsCreator: tópico pessoal não encontrado.'
              );
            } else if (
              result.formsSyncResult.status === 'failed'
            ) {
              responseLines.push(
                `⚠️ FormsCreator não foi sincronizado: ${result.formsSyncResult.error}`
              );
            } else if (
              result.formsSyncResult.status === 'unavailable'
            ) {
              responseLines.push(
                '⚠️ Integração com FormsCreator indisponível.'
              );
            }

            await interaction.editReply({
              content:
                responseLines.join('\n')
            });
          } catch (e) {
            await interaction.editReply({
              content:
                '⚠️ ' +
                (
                  e?.message ||
                  'Falha ao editar o registro.'
                )
            });
          }

          return;
        }
        // Atualizar controle
        if (interaction.isButton() && interaction.customId.startsWith(BTN.REFRESH_PREFIX)) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });

          const raw = interaction.customId.replace(BTN.REFRESH_PREFIX, '');
          const { rec, id: messageId } = resolveRecordByInteraction(interaction, raw);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            await assertCanManageGIRecord(guild, interaction.user, rec.targetId, 'atualizar o controle');
            await refreshRegistroMessage(guild, interaction.user, messageId, 'Botão Atualizar Controle');
            await interaction.editReply({ content: '✅ Controle atualizado com sucesso.' });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + e.message });
          }

          return;
        }
        // NOVO: Botões de Undo no Log
        if (interaction.isButton() && interaction.customId.startsWith('SC_GI_UNDO_')) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          
          const parts = interaction.customId.split(':');
          const action = parts[0].replace('SC_GI_UNDO_', '');
          const messageId = parts[1];
          const oldValue = parts[2]; // Para toggle_active

          const activeRecordForUndo =
            resolveRecordByInteraction(
              interaction,
              messageId
            )?.rec ||
            null;

          // =================================================
          // RESTAURAR UM MEMBRO JÁ DESLIGADO
          // =================================================
          //
          // Neste caso o antigo registro NÃO deve existir em
          // SC_GI_STATE.registros. A fonte é disconnectedSnapshots.
          //
          // Se o desligamento for antigo, recupera o snapshot
          // mínimo pelo próprio embed do log.
          // =================================================

          if (
            action === 'DESLIGAR' &&
            !activeRecordForUndo
          ) {
            let disconnectArchive =
              SC_GI_STATE.disconnectedSnapshots.get(
                String(messageId)
              );

            if (!disconnectArchive) {
              disconnectArchive =
                recoverLegacyDisconnectSnapshotFromLogMessage(
                  guild,
                  interaction.message,
                  messageId
                );
            }

            if (!disconnectArchive) {
              return interaction.reply({
                content:
                  '❌ Não consegui recuperar os dados deste desligamento pelo log. Nenhuma restauração foi executada.',
                flags:
                  MessageFlags.Ephemeral
              });
            }

            const modal =
              new ModalBuilder()
                .setCustomId(
                  `SC_GI_MODAL_RESTORE_DESLIGAR:${messageId}`
                )
                .setTitle(
                  'Restaurar Desligamento?'
                )
                .addComponents(
                  new ActionRowBuilder()
                    .addComponents(
                      new TextInputBuilder()
                        .setCustomId('confirm')
                        .setLabel('Confirme digitando "RESTAURAR"')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                    )
                );

            await interaction.showModal(
              modal
            );

            return;
          }

          const { rec, id: recordId } = resolveRecordByInteraction(interaction, messageId);
          if (!rec) return interaction.reply({ content: 'Registro não encontrado.', flags: MessageFlags.Ephemeral });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            if (action === 'TOGGLE') {
              const newStatus = oldValue === 'true'; // Reverte para o status anterior
              rec.active = newStatus;
              if (newStatus) { // Se está ativando
                rec.pausedAtMs = null;
                if (!rec.nextWeekTickMs) rec.nextWeekTickMs = computeNextWeekTick(rec.joinDateMs);
                await addGIRole(guild, rec.targetId, 'Revertido: GI obrigatório');
              } else { // Se está pausando
                rec.pausedAtMs = nowMs();
                await removeGIRole(guild, rec.targetId, 'Revertido: GI removido');
              }
              SC_GI_scheduleSave();
              await refreshRegistroMessage(guild, interaction.user, recordId, 'Revertido status');
              await interaction.editReply({ content: `✅ Status do registro de <@${rec.targetId}> revertido para **${newStatus ? 'Ativo' : 'Pausado'}**.` });
                       } else if (action === 'EDIT') {
              // Para edição, abre o modal de edição novamente para o usuário preencher

              const inpDiscordId =
                new TextInputBuilder()
                  .setCustomId(
                    'SC_GI_EDIT_DISCORD_ID'
                  )
                  .setLabel(
                    'Discord ID atual / novo'
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setPlaceholder(
                    'Ex.: 123456789012345678'
                  )
                  .setValue(
                    String(
                      rec.targetId ||
                      ''
                    )
                  )
                  .setMinLength(17)
                  .setMaxLength(20)
                  .setRequired(true);

              const inpArea =
                new TextInputBuilder()
                  .setCustomId(
                    'SC_GI_EDIT_AREA'
                  )
                  .setLabel(
                    'Área (visual)'
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setPlaceholder(
                    rec.area ||
                    'SocialMedias'
                  )
                  .setValue(
                    rec.area ||
                    'SocialMedias'
                  )
                  .setRequired(true);

              const inpDate =
                new TextInputBuilder()
                  .setCustomId(
                    'SC_GI_EDIT_DATE'
                  )
                  .setLabel(
                    'Data Entrada (DD/MM/AAAA)'
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setPlaceholder(
                    'DD/MM/AAAA'
                  )
                  .setValue(
                    msToDDMMYYYY(
                      rec.joinDateMs
                    )
                  )
                  .setRequired(true);

              const inpNote =
                new TextInputBuilder()
                  .setCustomId(
                    'SC_GI_EDIT_NOTE'
                  )
                  .setLabel(
                    'Observação/Nota (opcional)'
                  )
                  .setStyle(
                    TextInputStyle.Paragraph
                  )
                  .setPlaceholder(
                    'Ex.: destaque, mudança visual, etc.'
                  )
                  .setRequired(false);

              const modal =
                new ModalBuilder()
                  .setCustomId(
                    `SC_GI_MODAL_EDIT_${recordId}`
                  )
                  .setTitle(
                    'Re-editar Registro — Gestaoinfluencer'
                  )
                  .addComponents(
                    new ActionRowBuilder()
                      .addComponents(
                        inpDiscordId
                      ),

                    new ActionRowBuilder()
                      .addComponents(
                        inpArea
                      ),

                    new ActionRowBuilder()
                      .addComponents(
                        inpDate
                      ),

                    new ActionRowBuilder()
                      .addComponents(
                        inpNote
                      )
                  );
              
              await interaction.showModal(
                modal
              );

              await interaction.editReply({
                content:
                  '✅ Modal de edição aberto para reverter a edição.'
              });
            } else if (action === 'RESP') {
              // Para responsável, abre o select novamente
              const rows = [];
              const candidates = await getRespCandidates(guild);
              if (candidates.length > 0 && candidates.length <= 25) {
                rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(SEL.RESP_USER_PREFIX + recordId).setPlaceholder('Selecione o Responsável (lista filtrada por cargos)').addOptions(candidates.map(c => ({ label: c.label, value: c.id, emoji: '👤' })))));
              } else if (typeof UserSelectMenuBuilder !== 'undefined') {
                rows.push(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(SEL.RESP_USER_PREFIX + recordId).setPlaceholder('Selecione o Responsável (será validado pelos cargos)').setMinValues(1).setMaxValues(1)));
              }
              await interaction.editReply({ content: '🧭 **Re-defina o Responsável Direto** para reverter a alteração.', components: rows });
            } else if (action === 'DESLIGAR') {
              // Este caso acontece no botão "Desfazer (Remover)"
              // do log de criação, quando o Controle GI ainda existe.
              await desligarRegistro(
                guild,
                interaction.user,
                recordId,
                'Criação do Controle GI desfeita pelo botão de log'
              );

              await interaction.editReply({
                content:
                  `✅ O Controle GI de <@${rec.targetId}> foi removido/desfeito com sucesso.`
              });
            }
            // Desativa o botão de undo no log
            await interaction.message.edit({ components: [] });
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + (e.message || 'Falha ao tentar reverter a ação.') });
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

        // NOVO: Modal de confirmação para restaurar desligamento
        if (interaction.isModalSubmit() && interaction.customId.startsWith('SC_GI_MODAL_RESTORE_DESLIGAR:')) {
          if (!hasAuth(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão.', flags: MessageFlags.Ephemeral });
          const messageId = interaction.customId.replace('SC_GI_MODAL_RESTORE_DESLIGAR:', '');

          const confirmation =
            String(
              interaction.fields.getTextInputValue('confirm') ||
              ""
            ).trim();

          if (confirmation.toLowerCase() !== 'restaurar') {
            return interaction.reply({ content: '❌ Confirmação inválida. O desligamento não foi restaurado.', flags: MessageFlags.Ephemeral });
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const restoreResult =
              await restoreDesligamento(
                guild,
                interaction.user,
                messageId
              );

            await interaction.editReply({
              content:
                `✅ Membro restaurado com sucesso! Novo Controle GI: \`${restoreResult?.restoredRecord?.messageId || "não identificado"}\`.`
            });

            // =================================================
            // DESATIVA O BOTÃO SOMENTE DEPOIS DO SUCESSO
            // =================================================

            let disconnectLogMessage =
              interaction.message ||
              null;

            if (
              !disconnectLogMessage &&
              restoreResult?.archive?.disconnectLogMessageId
            ) {
              const disconnectChannel =
                await guild.channels
                  .fetch(
                    SC_GI_CFG.CHANNEL_DESLIGAMENTOS
                  )
                  .catch(
                    () => null
                  );

              disconnectLogMessage =
                await disconnectChannel?.messages
                  ?.fetch(
                    restoreResult.archive.disconnectLogMessageId
                  )
                  .catch(
                    () => null
                  );
            }

            if (disconnectLogMessage) {
              await disconnectLogMessage.edit({
                components: []
              }).catch(
                () => null
              );
            }
          } catch (e) {
            await interaction.editReply({ content: '⚠️ ' + (e.message || 'Falha ao restaurar desligamento.') });
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