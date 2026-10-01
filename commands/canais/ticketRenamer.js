// ===============================
// SC_TICKET_RENAMER — módulo (abridor por EMBED)
// • Descobre o abridor pelo embed inicial ("Aberto por: <@id>")
// • Cache por canal para não refetchar sempre
// • Regras de nome (nome do MEIO), 🎫┋ prefix, superíndice, varredura 30s, sweep inicial
// • ENTREVISTA vira "-sc" se ganhar SantaCreators
// • Categorias de Líder/Organização usam fonte monoespaçada Unicode com Title Case automático
// ===============================

import {
  ChannelType,
  PermissionsBitField,
  OverwriteType,
  Events
} from 'discord.js';

export function setupTicketRenamer(client) {
  if (!client) {
    console.warn('[SC_TICKET_RENAMER] client não recebido.');
    return;
  }

  // evita duplicar em hot-reload / reexecução
  if (client.__SC_TICKET_RENAMER_INSTALLED) {
    console.log('[SC_TICKET_RENAMER] Já instalado, pulando.');
    return;
  }
  client.__SC_TICKET_RENAMER_INSTALLED = true;

  console.log(
    '[SC_TICKET_RENAMER] instalado — fonte automática ativa nas categorias de Líder/Organização.'
  );

  // ====== CONFIG ======
  const ROLE_SANTA_CREATORS = '1352275728476930099';
  const ROLE_CIDADAO       = '1262978759922028575';

  // 👇 NOVO
  const ROLE_OWNER      = '1262262852949905408';
  const EXEMPT_USER_IDS = new Set(['660311795327828008']); // você

  const NAME_PREFIX = '🎫┋';
  const PREFIX_RE   = /^🎫┋\s*/;

  // Categorias em que TODO canal recebe a fonte 𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎
  // e cada palavra fica com a primeira letra maiúscula.
  const LEADER_FONT_CATEGORY_IDS = new Set([
    '1414687963161559180',
    '1428572742051168378',
    '1482874296685695118'
  ]);

  // IDs das categorias
const CATEGORIES_WATCH = {
  entrevista: '1359244725781266492',
  suporte: '1359245003523756136',
  lider: '1414687963161559180',
  ideias: '1359245055239655544',
  roupas: '1352706815594598420',
  banners: '1404568518179029142',

  // Fluxo automático do membro / Controle GI
  membroAguardando: '1444857594517913742',
  membroAtivo: '1384650670145278033',

  // Categorias atuais de inativos
  membroInativo1: '1482866398396022967',
  membroInativo2: '1410071955159122051',
  membroInativo3: '1477566945598640251',

  // Categoria antiga preservada para tickets antigos
  membroInativoLegacy: '1383899907244425246'
};

const CATEGORY_SUFFIX = {
  entrevista: 'entrevista',
  suporte: 'suporte',
  lider: 'lider',
  ideias: 'ideias',
  roupas: 'roupas',
  banners: 'banners',

  // Nestas categorias o ticket sempre usa o sufixo SC.
  membroAguardando: 'sc',
  membroAtivo: 'sc',
  membroInativo1: 'sc',
  membroInativo2: 'sc',
  membroInativo3: 'sc',
  membroInativoLegacy: 'sc'
};

  // Nestes locais o nome final também recebe a fonte
  // Mathematical Monospace usada no restante do sistema.
const MEMBER_FONT_CATEGORY_IDS = new Set([
  '1444857594517913742',
  '1384650670145278033',

  '1482866398396022967',
  '1410071955159122051',
  '1477566945598640251',

  // Legado
  '1383899907244425246'
]);

  // ====== STATE (cache de abridores) ======
  const OPENER_CACHE = new Map();       // canalId -> userId
  const OPENER_MISS  = new Set();       // canalId onde já tentamos e não achamos
  const OPENER_TTL   = 60 * 60 * 1000;  // 1h
  const OPENER_TIME  = new Map();       // canalId -> timestamp

  // Evita duas tentativas de renomear o mesmo canal ao mesmo tempo.
  const LEADER_FONT_RENAME_IN_PROGRESS = new Set();

  // Debounce por canal para não perder atualização durante um rename do próprio bot.
  const LEADER_FONT_RECHECK_TIMERS = new Map();

  // Impede duas varreduras de segurança das categorias de Líder/Organização ao mesmo tempo.
  let LEADER_FONT_WATCHDOG_RUNNING = false;

  // ====== UTIL ======
  const SUPER = ['','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];

  function slugify(str) {
    return (str ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9| ]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  function fromMonospaceUnicode(str) {
    return Array.from(String(str ?? ''))
      .map(char => {
        const code = char.codePointAt(0);

        if (code >= 0x1D670 && code <= 0x1D689) {
          return String.fromCharCode(65 + (code - 0x1D670));
        }

        if (code >= 0x1D68A && code <= 0x1D6A3) {
          return String.fromCharCode(97 + (code - 0x1D68A));
        }

        if (code >= 0x1D7F6 && code <= 0x1D7FF) {
          return String.fromCharCode(48 + (code - 0x1D7F6));
        }

        return char;
      })
      .join('')
      .normalize('NFC');
  }

  function toMonospaceUnicode(str) {
    return Array.from(
      String(str ?? '').normalize('NFD')
    )
      .map(char => {
        const code = char.codePointAt(0);

        if (code >= 65 && code <= 90) {
          return String.fromCodePoint(0x1D670 + (code - 65));
        }

        if (code >= 97 && code <= 122) {
          return String.fromCodePoint(0x1D68A + (code - 97));
        }

        if (code >= 48 && code <= 57) {
          return String.fromCodePoint(0x1D7F6 + (code - 48));
        }

        return char;
      })
      .join('');
  }

  function titleCaseChannelName(str) {
    const plain = fromMonospaceUnicode(str)
      .trim()
      .replace(/\s+/g, ' ');

    return plain
      .split(/([\s_-]+)/)
      .map(part => {
        if (!part || /^[\s_-]+$/.test(part)) {
          return part;
        }

        const lower = part.toLocaleLowerCase('pt-BR');

        return lower.replace(
          /[A-Za-zÀ-ÖØ-öø-ÿ]/,
          letter => letter.toLocaleUpperCase('pt-BR')
        );
      })
      .join('');
  }

  function formatLeaderFontChannelName(channelName) {
    const titleCaseName =
      titleCaseChannelName(channelName);

    const formatted =
      toMonospaceUnicode(titleCaseName);

    return Array.from(formatted)
      .slice(0, 100)
      .join('');
  }

  // Nome no MEIO
  function extractPreferredName(displayName) {
    if (!displayName) return 'usuario';
    const hasDigits = /\d/.test(displayName);
    const parts = displayName.split('|').map(s => s.trim()).filter(Boolean);

    if (parts.length >= 3) return parts[1];          // Tag | Nome | 123
    if (parts.length === 2) return !hasDigits ? parts[1] : parts[0];
    return parts[0] || displayName;
  }

  // -------- ABRIDOR PELO EMBED "Aberto por:" --------
  async function extractOpenerFromTicketHeader(channel) {
    try {
      // 1) tenta pins
      const pins = await channel.messages.fetchPinned().catch(() => null);
      const pool = [];

      if (pins && pins.size) pool.push(...pins.values());

      // 2) se não achou nos pins, pega últimas 30
      if (!pool.length) {
        const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
        if (recent?.size) pool.push(...recent.values());
      }

      // 3) procura embed com campo "Aberto por:"
      for (const msg of pool) {
        const embeds = msg.embeds || [];
        for (const e of embeds) {
          const fields = e.data?.fields || e.fields || [];
          const abertoField = fields.find(f => (f.name || '').toLowerCase() === 'aberto por:');
          if (abertoField?.value) {
            const m = abertoField.value.match(/<@(\d+)>/);
            if (m) return m[1];
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // Fallback: pega primeiro overwrite Member com ViewChannel allow
  function getOpenerIdFromOverwrites(channel) {
    const pov = channel.permissionOverwrites?.cache;
    if (!pov) return null;

    const memberOverwrites = pov.filter(ow =>
      ow.type === OverwriteType.Member &&
      ow.allow.has(PermissionsBitField.Flags.ViewChannel)
    );

    // prioriza quem também tem SendMessages allow
    const cand = memberOverwrites.find(ow => ow.allow.has(PermissionsBitField.Flags.SendMessages));
    if (cand) return cand.id;

    const first = memberOverwrites.first();
    return first?.id ?? null;
  }

  function detectTicketTypeByCategoryId(categoryId) {
    for (const [type, id] of Object.entries(CATEGORIES_WATCH)) {
      if (id === categoryId) return type;
    }
    return null;
  }

  function getWatchedParentIdsExcludingLider() {
    return new Set(
      Object.entries(CATEGORIES_WATCH)
        .filter(([type]) => type !== 'lider')
        .map(([, id]) => id)
    );
  }

  function getAllManagedParentIds() {
    return new Set([
      ...getWatchedParentIdsExcludingLider(),
      ...LEADER_FONT_CATEGORY_IDS
    ]);
  }

  // Resolve abridor com cache -> embed -> overwrite
  async function resolveOpenerId(channel) {
    const now = Date.now();

    // cache válido?
    if (OPENER_CACHE.has(channel.id)) {
      const ts = OPENER_TIME.get(channel.id) || 0;
      if (now - ts < OPENER_TTL) return OPENER_CACHE.get(channel.id);
      // expirou: tenta de novo
    }

    // evita tentar sem parar caso já tenhamos falhado
    if (OPENER_MISS.has(channel.id)) {
      return null;
    }

    // 1) embed
    const fromEmbed = await extractOpenerFromTicketHeader(channel);
    if (fromEmbed) {
      OPENER_CACHE.set(channel.id, fromEmbed);
      OPENER_TIME.set(channel.id, now);
      return fromEmbed;
    }

    // 2) overwrite
    const fromOW = getOpenerIdFromOverwrites(channel);
    if (fromOW) {
      OPENER_CACHE.set(channel.id, fromOW);
      OPENER_TIME.set(channel.id, now);
      return fromOW;
    }

    OPENER_MISS.add(channel.id);
    return null;
  }

  // Conta canais do MESMO tipo/base (considera prefixo), exceto Líder
  function countSameTypeChannels(guild, base, suffix) {
    const parentIds = getWatchedParentIdsExcludingLider();
    let count = 0;

    guild.channels.cache.forEach(ch => {
      if (ch?.type === ChannelType.GuildText && ch.parentId && parentIds.has(ch.parentId)) {
        const nameCore = fromMonospaceUnicode(ch.name)
          .replace(PREFIX_RE, '')
          .toLocaleLowerCase('pt-BR');

        const expectedCore = `${base}-${suffix}`.toLocaleLowerCase('pt-BR');

        if (nameCore === expectedCore || nameCore.startsWith(expectedCore)) {
          count += 1;
        }
      }
    });

    return count;
  }

  async function computeDesiredName(guild, channel) {
    const type = detectTicketTypeByCategoryId(channel.parentId);
    if (!type || type === 'lider') return null; // ignora líder

    const openerId = await resolveOpenerId(channel);
    if (!openerId) return null;

    const member = await guild.members.fetch(openerId).catch(() => null);
    if (!member) return null;

    // Garante Cidadão (com isenção)
    const isExempt =
      EXEMPT_USER_IDS.has(member.id) ||
      member.roles.cache.has(ROLE_OWNER);

    if (!isExempt && !member.roles.cache.has(ROLE_CIDADAO)) {
      await member.roles.add(ROLE_CIDADAO).catch(() => {});
    }

    const preferred = extractPreferredName(member.displayName);
    const base = slugify(preferred);

    const hasSC = member.roles.cache.has(ROLE_SANTA_CREATORS);

    let rawSuffix = CATEGORY_SUFFIX[type];

    // Entrevista vira SC somente depois de ganhar SantaCreators.
    if (type === 'entrevista' && hasSC) {
      rawSuffix = 'sc';
    }

    // Na categoria intermediária, antes do Set aprovado continua como entrevista.
    // Depois que ganha SantaCreators/Set, passa para SC.
    if (type === 'membroAguardando' && !hasSC) {
      rawSuffix = 'entrevista';
    }

    const existing = countSameTypeChannels(guild, base, rawSuffix);
    const ordinal  = existing > 1 ? (SUPER[existing] || String(existing)) : '';

    const desiredCore = `${base}-${rawSuffix}${ordinal}`;
    const desired = `${NAME_PREFIX}${desiredCore}`;

    if (MEMBER_FONT_CATEGORY_IDS.has(channel.parentId)) {
      return formatLeaderFontChannelName(desired).slice(0, 100);
    }

    return desired.slice(0, 100);

    if (MEMBER_FONT_CATEGORY_IDS.has(channel.parentId)) {
      return formatLeaderFontChannelName(desired).slice(0, 100);
    }

    return desired.slice(0, 100);
  }

  async function maybeRenameChannel(channel) {
    try {
      if (!channel || channel.type !== ChannelType.GuildText) return;
      if (!channel.parentId) return;

      // =====================================================
      // 👑 CATEGORIAS DE LÍDER / ORGANIZAÇÃO
      // =====================================================
      //
      // Nessas categorias não usamos o nome do abridor.
      // Pegamos o nome ATUAL do canal, corrigimos o Title Case
      // e aplicamos a fonte monoespaçada Unicode.
      //
      // Isso permite:
      // - ticket recém-criado;
      // - canal movido manualmente para a categoria;
      // - canal renomeado manualmente depois;
      // - correção automática após restart/sweep.
      // =====================================================
      if (LEADER_FONT_CATEGORY_IDS.has(channel.parentId)) {
        const desired =
          formatLeaderFontChannelName(channel.name);

        if (!desired || channel.name === desired) {
          return;
        }

        if (
          LEADER_FONT_RENAME_IN_PROGRESS.has(
            channel.id
          )
        ) {
          return;
        }

        LEADER_FONT_RENAME_IN_PROGRESS.add(
          channel.id
        );

        try {
          const previousName = channel.name;

          await channel.setName(
            desired,
            'SC Ticket Renamer — fonte automática das categorias de Líder/Organização'
          );

          console.log(
            `[SC_TICKET_RENAMER] Fonte corrigida: ${previousName} -> ${desired} (${channel.id})`
          );
        } catch (error) {
          console.warn(
            `[SC_TICKET_RENAMER] Não foi possível aplicar a fonte no canal ${channel.id}:`,
            error?.message || error
          );
        } finally {
          LEADER_FONT_RENAME_IN_PROGRESS.delete(
            channel.id
          );
        }

        return;
      }

      const type = detectTicketTypeByCategoryId(channel.parentId);
      if (!type || type === 'lider') return;

      const guild   = channel.guild;
      const desired = await computeDesiredName(guild, channel);
      if (!desired) return;

      const currentCore = channel.name.replace(PREFIX_RE, '');
      const desiredCore = desired.replace(PREFIX_RE, '');
      const hasPrefix   = PREFIX_RE.test(channel.name);

      if (currentCore !== desiredCore || !hasPrefix) {
        await channel.setName(desired, 'SC Ticket Renamer — ajuste de prefixo/miolo (abridor fix)').catch(() => {});
      }
    } catch (_) {}
  }

  function scheduleLeaderFontRecheck(channel, delay = 350) {
    if (!channel?.id) return;

    const previousTimer =
      LEADER_FONT_RECHECK_TIMERS.get(channel.id);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(async () => {
      LEADER_FONT_RECHECK_TIMERS.delete(channel.id);

      const latestChannel =
        channel.guild?.channels?.cache?.get(channel.id) ||
        channel;

      if (
        !latestChannel ||
        latestChannel.type !== ChannelType.GuildText ||
        !latestChannel.parentId ||
        !LEADER_FONT_CATEGORY_IDS.has(latestChannel.parentId)
      ) {
        return;
      }

      if (
        LEADER_FONT_RENAME_IN_PROGRESS.has(
          latestChannel.id
        )
      ) {
        scheduleLeaderFontRecheck(
          latestChannel,
          350
        );
        return;
      }

      await maybeRenameChannel(latestChannel);
    }, delay);

    LEADER_FONT_RECHECK_TIMERS.set(
      channel.id,
      timer
    );
  }

  // ====== WATCHERS ======

  // Canal criado.
  // Para as categorias especiais, a fonte será aplicada automaticamente.
  // Para os demais tickets, o atraso continua permitindo o embed nascer.
  client.on(Events.ChannelCreate, async (channel) => {
    setTimeout(() => maybeRenameChannel(channel), 1500);
  });

  // Canal alterado:
  // - renomeado manualmente;
  // - movido para uma das 3 categorias.
  //
  // Só agenda nova conferência quando NOME ou CATEGORIA realmente mudarem.
  // O pequeno debounce evita perder uma edição manual feita exatamente durante
  // o rename executado pelo próprio bot.
  client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    if (!newChannel || newChannel.type !== ChannelType.GuildText) return;
    if (!newChannel.parentId) return;

    const nameChanged =
      oldChannel?.name !== newChannel.name;

    const parentChanged =
      oldChannel?.parentId !== newChannel.parentId;

    if (!nameChanged && !parentChanged) return;

    const managedParentIds = getAllManagedParentIds();
    if (!managedParentIds.has(newChannel.parentId)) return;

    // Categorias de Líder mantêm o debounce específico já existente.
    if (LEADER_FONT_CATEGORY_IDS.has(newChannel.parentId)) {
      scheduleLeaderFontRecheck(
        newChannel,
        350
      );
      return;
    }

    // Tickets normais e tickets do fluxo SC também são corrigidos
    // imediatamente quando mudam de categoria ou são renomeados.
    setTimeout(
      () => maybeRenameChannel(newChannel),
      350
    );
  });

  async function enforceLeaderFontCategories() {
    if (LEADER_FONT_WATCHDOG_RUNNING) return;

    LEADER_FONT_WATCHDOG_RUNNING = true;

    try {
      for (const [, guild] of client.guilds.cache) {
        for (const categoryId of LEADER_FONT_CATEGORY_IDS) {
          const category =
            guild.channels.cache.get(categoryId);

          if (
            !category ||
            category.type !== ChannelType.GuildCategory
          ) {
            continue;
          }

          for (
            const channel of
            category.children.cache.values()
          ) {
            if (
              channel.type !== ChannelType.GuildText
            ) {
              continue;
            }

            const desired =
              formatLeaderFontChannelName(
                channel.name
              );

            if (
              !desired ||
              channel.name === desired
            ) {
              continue;
            }

            await maybeRenameChannel(
              channel
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        '[SC_TICKET_RENAMER] Falha na varredura de segurança das categorias de Líder/Organização:',
        error?.message || error
      );
    } finally {
      LEADER_FONT_WATCHDOG_RUNNING = false;
    }
  }

  // Varredura rápida somente das 3 categorias de Líder/Organização.
  // Não renomeia canais que já estejam corretos.
  setInterval(
    () => {
      enforceLeaderFontCategories();
    },
    10_000
  );

  // Mudou SantaCreators OU mudou o nome/apelido -> renomeia tickets do membro.
  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    const before = oldM.roles.cache.has(ROLE_SANTA_CREATORS);
    const after  = newM.roles.cache.has(ROLE_SANTA_CREATORS);

    const santaCreatorsChanged = before !== after;
    const displayNameChanged = oldM.displayName !== newM.displayName;

    if (!santaCreatorsChanged && !displayNameChanged) return;

    const parentIds = getWatchedParentIdsExcludingLider();
    newM.guild.channels.cache.forEach(async ch => {
      if (ch?.type !== ChannelType.GuildText) return;
      if (!ch.parentId || !parentIds.has(ch.parentId)) return;

      const openerId = await resolveOpenerId(ch);
      if (openerId === newM.id) await maybeRenameChannel(ch);
    });
  });

  // Sweep inicial ao ligar:
  // corrige tickets normais e TODOS os canais das 3 categorias especiais.
  client.once(Events.ClientReady, async () => {
    try {
      const parentIds = getAllManagedParentIds();

      for (const [, guild] of client.guilds.cache) {
        guild.channels.cache.forEach(async ch => {
          if (ch?.type !== ChannelType.GuildText) return;
          if (!ch.parentId || !parentIds.has(ch.parentId)) return;
          await maybeRenameChannel(ch);
        });
      }

      // console.log('[SC_TICKET_RENAMER] Sweep inicial feito — tickets e categorias especiais padronizados.');
    } catch (_) {}
  });

  // Varredura periódica (30s):
  // serve como backup caso algum evento de criação/update seja perdido.
  setInterval(async () => {
    try {
      for (const [, guild] of client.guilds.cache) {
        const parentIds = getAllManagedParentIds();

        guild.channels.cache.forEach(async ch => {
          if (ch?.type !== ChannelType.GuildText) return;
          if (!ch.parentId || !parentIds.has(ch.parentId)) return;
          await maybeRenameChannel(ch);
        });
      }
    } catch (_) {}
  }, 30_000);
 }
