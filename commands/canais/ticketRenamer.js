// ===============================
// SC_TICKET_RENAMER — módulo (abridor por EMBED)
// • Descobre o abridor pelo embed inicial ("Aberto por: <@id>")
// • Cache por canal para não refetchar sempre
// • Regras de nome (nome do MEIO), 🎫┋ prefix, superíndice, varredura 30s, sweep inicial
// • ENTREVISTA vira "-sc" se ganhar SantaCreators
// • IGNORA completamente a categoria Líder de Organização
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

  // ====== CONFIG ======
  const ROLE_SANTA_CREATORS = '1352275728476930099';
  const ROLE_CIDADAO       = '1262978759922028575';

  // 👇 NOVO
  const ROLE_OWNER      = '1262262852949905408';
  const EXEMPT_USER_IDS = new Set(['660311795327828008']); // você

  const NAME_PREFIX = '🎫┋';
  const PREFIX_RE   = /^🎫┋\s*/;

  // IDs das categorias
  const CATEGORIES_WATCH = {
    entrevista: '1359244725781266492',
    suporte:    '1359245003523756136',
    lider:      '1414687963161559180', // << totalmente ignorada
    ideias:     '1359245055239655544',
    roupas:     '1352706815594598420',
    banners:    '1404568518179029142'
  };

  // categoria -> sufixo (líder está aqui só por completude; é ignorada)
  const CATEGORY_SUFFIX = {
    entrevista: 'entrevista',
    suporte: 'suporte',
    lider: 'lider',
    ideias: 'ideias',
    roupas: 'roupas',
    banners: 'banners'
  };

  // ====== STATE (cache de abridores) ======
  const OPENER_CACHE = new Map();       // canalId -> userId
  const OPENER_MISS  = new Set();       // canalId onde já tentamos e não achamos
  const OPENER_TTL   = 60 * 60 * 1000;  // 1h
  const OPENER_TIME  = new Map();       // canalId -> timestamp

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
        const nameCore = ch.name.replace(PREFIX_RE, '');
        if (nameCore === `${base}-${suffix}` || nameCore.startsWith(`${base}-${suffix}`)) {
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
    const rawSuffix = (type === 'entrevista' && hasSC) ? 'sc' : CATEGORY_SUFFIX[type];

    const existing = countSameTypeChannels(guild, base, rawSuffix);
    const ordinal  = existing > 1 ? (SUPER[existing] || String(existing)) : '';

    const desiredCore = `${base}-${rawSuffix}${ordinal}`;
    const desired     = `${NAME_PREFIX}${desiredCore}`;
    return desired.slice(0, 100);
  }

  async function maybeRenameChannel(channel) {
    try {
      if (!channel || channel.type !== ChannelType.GuildText) return;
      if (!channel.parentId) return;

      const type = detectTicketTypeByCategoryId(channel.parentId);
      if (!type || type === 'lider') return; // NÃO TOCA EM LÍDER

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

  // ====== WATCHERS ======

  // Canal criado (espera embed nascer)
  client.on(Events.ChannelCreate, async (channel) => {
    setTimeout(() => maybeRenameChannel(channel), 1500);
  });

  // Mudou SantaCreators -> renomeia tickets do membro (exceto líder)
  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    const before = oldM.roles.cache.has(ROLE_SANTA_CREATORS);
    const after  = newM.roles.cache.has(ROLE_SANTA_CREATORS);
    if (before === after) return;

    const parentIds = getWatchedParentIdsExcludingLider();
    newM.guild.channels.cache.forEach(async ch => {
      if (ch?.type !== ChannelType.GuildText) return;
      if (!ch.parentId || !parentIds.has(ch.parentId)) return;

      const openerId = await resolveOpenerId(ch);
      if (openerId === newM.id) await maybeRenameChannel(ch);
    });
  });

  // Sweep inicial ao ligar — ignora líder
  client.once(Events.ClientReady, async () => {
    try {
      const parentIds = getWatchedParentIdsExcludingLider();

      for (const [, guild] of client.guilds.cache) {
        guild.channels.cache.forEach(async ch => {
          if (ch?.type !== ChannelType.GuildText) return;
          if (!ch.parentId || !parentIds.has(ch.parentId)) return;
          await maybeRenameChannel(ch);
        });
      }

      // console.log('[SC_TICKET_RENAMER] Sweep inicial feito — abridor por embed, prefixos ok, líder ignorado.');
    } catch (_) {}
  });

  // Varredura periódica (30s)
  setInterval(async () => {
    try {
      for (const [, guild] of client.guilds.cache) {
        const parentIds = getWatchedParentIdsExcludingLider();

        guild.channels.cache.forEach(async ch => {
          if (ch?.type !== ChannelType.GuildText) return;
          if (!ch.parentId || !parentIds.has(ch.parentId)) return;
          await maybeRenameChannel(ch);
        });
      }
    } catch (_) {}
  }, 30_000);
 }
