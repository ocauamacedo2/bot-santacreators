import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const idPattern = /^\d{17,20}$/;
const copy = value => JSON.parse(JSON.stringify(value));
const failure = (status, message) => Object.assign(new Error(message), { status });
const dateKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const cloneReadOnly = value => {
  const result = copy(value);
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.rights) for (const key of Object.keys(node.rights)) {
      if (typeof node.rights[key] === 'boolean' && !['orgs', 'players', 'view'].includes(key)) node.rights[key] = false;
    }
    Object.values(node).forEach(visit);
  };
  visit(result); return result;
};

export function createSiteHubExperience({ client, channels, isTeamMember, generateAI, getContext = async () => ({}), logAI = async () => ({ queued: false }) }) {
  const directory = resolve(process.env.SANTA_SITE_HISTORY_DIR || 'data/site-history');
  const cache = new Map(), identities = new Map(), aiLocks = new Set(), aiRate = new Map();
  const archiveChannels = {
    manager: ['1486084441762693291', '1486006866046615682', '1486009491702153349'],
    social: ['1486084352403312843', '1523099386052214874'],
    hierarchy: ['1486009555606437978'],
    gi: ['1486006878914875412', '1427089183847223306'],
    hall: ['1521946409207730347', '1518723758574276750'],
    cronograma: ['1486009619846529075'],
    weekly: ['1486009647923200120', '1486009598237212793', '1486084249755979950',
      '1486084262867370105', '1486009619846529075', '1486006866046615682',
      '1486006908056899748', '1425256185707233301', '1515132246728638574']
  };
  let generation = 0, writes = Promise.resolve(), profileWrites = Promise.resolve();
  const ttl = 15000;
  const invalidate = () => { generation++; cache.clear(); identities.clear(); };
  for (const event of ['guildMemberUpdate', 'guildMemberRemove', 'roleUpdate', 'roleDelete',
    'channelUpdate', 'channelDelete', 'userUpdate']) client.on(event, invalidate);
  for (const event of ['messageCreate', 'messageUpdate', 'messageDelete']) {
    client.on(event, (first, second) => {
      const message = second || first;
      if (Object.values(channels).flat().includes(message?.channelId)) invalidate();
    });
  }
  const scopeKey = (guild, actorId, module, payload = {}) => createHash('sha256')
    .update(JSON.stringify([guild.id, actorId, module, payload.city || ''])).digest('hex');
  function profile(member) {
    const user = member.user;
    return { id: user.id, name: member.displayName || user.globalName || user.username,
      username: user.username, mention: `<@${user.id}>`,
      avatar: member.displayAvatarURL({ size: 256, extension: 'png' }),
      roles: [...member.roles.cache.values()].filter(role => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position).map(role => ({ id: role.id, name: role.name })),
      team: Boolean(isTeamMember(member)), profileUrl: `https://discord.com/users/${user.id}` };
  }
  async function person(guild, id, fetchMissing = true) {
    if (!idPattern.test(String(id))) return null;
    const key = guild.id + ':' + id;
    const saved = identities.get(key);
    if (saved && Date.now() - saved.at < 300000) return saved.value;
    const member = guild.members.cache.get(id) || (fetchMissing ? await guild.members.fetch(id).catch(() => null) : null);
    const user = member?.user || client.users.cache.get(id) || (fetchMissing ? await client.users.fetch(id).catch(() => null) : null);
    const value = { id, name: member?.displayName || user?.globalName || user?.username || 'Perfil indisponível',
      username: user?.username || '', mention: `<@${id}>`,
      avatar: member?.displayAvatarURL({ size: 128, extension: 'png' }) ||
        user?.displayAvatarURL({ size: 128, extension: 'png' }) ||
        `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`,
      profileUrl: `https://discord.com/users/${id}`, available: Boolean(user) };
    if (identities.size > 5000) identities.delete(identities.keys().next().value);
    if (user || fetchMissing) identities.set(key, { at: Date.now(), value });
    return value;
  }
  function collectPeople(data) {
    const found = new Set();
    const visit = (node, key = '', parent = null) => {
      if (typeof node === 'string') {
        for (const match of node.matchAll(/<@!?(\d{17,20})>/g)) found.add(match[1]);
        if (/^(userId|actorId|targetId|managerId|leaderId|responsibleId|responsibleUserId|registrarUserId|targetUserId|memberId|registrantId|by|createdBy|updatedBy|registeredBy|responsavelId|discordId)$/i.test(key) && idPattern.test(node)) found.add(node);
        if (key === 'id' && idPattern.test(node) && parent &&
          ('points' in parent || 'score' in parent || 'acertos' in parent || 'userName' in parent ||
            'approved' in parent || 'rejected' in parent || 'total' in parent)) found.add(node);
      } else if (Array.isArray(node)) node.forEach(item => visit(item, key, node));
      else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => visit(v, k, node));
    };
    visit(data); return [...found];
  }
  async function enrich(guild, data) {
    const result = copy(data);
    // ID no jogo não é ID Discord. Só vincula quando o apelido comprova uma correspondência única.
    for (const item of result.players || []) {
      if (!item.playerId || item.discordId || item.userId) continue;
      const matches = [...guild.members.cache.values()].filter(member => {
        const match = String(member.displayName || '').match(/\|\s*(\d+)\s*$/);
        return match && match[1] === String(item.playerId);
      });
      if (matches.length === 1) item.discordId = matches[0].id;
    }
    const ids = collectPeople(result), people = {};
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length) { const id = ids[next++]; people[id] = await person(guild, id, false); }
    }));
    return { ...result, people };
  }
  function saveSnapshot(guild, actorId, module, payload, data, roleIds) {
    const day = dateKey(Date.now()), folder = join(directory, guild.id, module, day);
    const file = join(folder, scopeKey(guild, actorId, module, payload) + '.json');
    const saved = JSON.stringify({ capturedAt: Date.now(), actorId, module, city: payload.city || '', roleIds, data });
    writes = writes.catch(() => {}).then(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(file + '.tmp', saved, { mode: 0o600 }); await rename(file + '.tmp', file);
    });
    void writes.catch(error => console.error('[SITE HISTORY] Não foi possível guardar a consulta:', error.code));
  }
  async function accessible(guild, member, module) {
    if (!Object.hasOwn(channels, module) || !Array.isArray(channels[module])) throw failure(404, 'Categoria desconhecida.');
    const results = [];
    for (const id of channels[module]) {
      const channel = guild.channels.cache.get(id) || await client.channels.fetch(id).catch(() => null);
      if (channel?.guildId === guild.id && (member.id === '660311795327828008' || channel.permissionsFor(member)?.has('ViewChannel'))) results.push(channel);
    }
    if (!results.length) throw failure(403, 'Você não possui acesso a esta área no Discord.');
    return results;
  }
  function validateDay(day) {
    const parsed = new Date(String(day) + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day) throw failure(400, 'Data inválida.');
    return day;
  }
  async function history(guild, member, action, payload) {
    const module = String(payload.module || '');
    const allowed = await accessible(guild, member, module);
    if (action === 'history.list') {
      await writes.catch(() => {});
      const folder = join(directory, guild.id, module);
      const days = await readdir(folder).catch(() => []), dates = [];
      for (const day of days.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)).sort().reverse()) {
        try {
          const item = JSON.parse(await readFile(join(folder, day, scopeKey(guild, member.id, module, payload) + '.json'), 'utf8'));
          dates.push({ date: day, capturedAt: item.capturedAt });
        } catch (error) { if (error.code !== 'ENOENT') console.error('[SITE HISTORY]', error.code || error.name); }
      }
      return { dates, timezone: 'America/Sao_Paulo' };
    }
    if (action === 'history.snapshot') {
      const day = validateDay(payload.date);
      const file = join(directory, guild.id, module, day, scopeKey(guild, member.id, module, payload) + '.json');
      let item;
      try { item = JSON.parse(await readFile(file, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') throw failure(404, 'Nenhuma consulta foi salva nesta data. Use os registros do Discord para períodos anteriores.'); throw error; }
      if (!Array.isArray(item.roleIds) || item.roleIds.some(id => !member.roles.cache.has(id))) {
        throw failure(403, 'Os cargos que autorizavam esta consulta mudaram. Consulte os registros do Discord disponíveis para a sua conta atual.');
      }
      const data = cloneReadOnly(item.data);
      if (module === 'hall') {
        const ids = new Set(allowed.map(channel => channel.id));
        // Mesmos canais verificados individualmente no provedor original do Hall.
        if (!ids.has('1518696187237236816')) { data.orgs = []; if (data.rights) data.rights.orgs = false; }
        if (!ids.has('1518696133071863838')) { data.players = []; if (data.rights) data.rights.players = false; }
      }
      return { ...data, historical: true, capturedAt: item.capturedAt, historicalDate: day };
    }
    if (action !== 'history.logs') throw failure(404, 'Consulta de histórico desconhecida.');
    const logChannels = [];
    // Ter acesso à categoria não libera automaticamente os arquivos privados de auditoria.
    for (const id of [...new Set([...(archiveChannels[module] || []), ...channels[module]])]) {
      const channel = guild.channels.cache.get(id) || await client.channels.fetch(id).catch(() => null);
      if (channel?.guildId === guild.id && channel.messages &&
        channel.permissionsFor(member)?.has(['ViewChannel', 'ReadMessageHistory'])) logChannels.push(channel);
    }
    const channelId = String(payload.channelId || logChannels[0]?.id || '');
    const channel = logChannels.find(item => item.id === channelId);
    if (!channel?.messages || !channel.permissionsFor(member)?.has('ReadMessageHistory')) {
      throw failure(403, 'Este canal exige a permissão Ler histórico de mensagens.');
    }
    const from = validateDay(payload.from), to = validateDay(payload.to);
    if (from > to) throw failure(400, 'A data inicial deve ser anterior à final.');
    const begin = Date.parse(from + 'T00:00:00-03:00');
    const end = Date.parse(to + 'T00:00:00-03:00') + 86400000;
    const initial = ((BigInt(end) - 1420070400000n) << 22n).toString();
    const before = String(payload.before || initial);
    if (!idPattern.test(before)) throw failure(400, 'Página de histórico inválida.');
    const page = await channel.messages.fetch({ limit: 100, before });
    const sorted = [...page.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const inRange = sorted.filter(message => message.createdTimestamp >= begin && message.createdTimestamp < end);
    const messages = inRange.map(message => ({ id: message.id, url: message.url,
      createdAt: message.createdTimestamp, authorId: message.author?.id,
      authorName: message.member?.displayName || message.author?.globalName || message.author?.username || 'Discord',
      content: message.content || '', embeds: message.embeds.map(embed => ({
        title: embed.title || '', description: embed.description || '', fields: embed.fields || [] })),
      attachments: [...message.attachments.values()].map(file => ({ name: file.name, url: file.url, size: file.size })) }));
    const last = sorted.at(-1), hasMore = page.size === 100 && last?.createdTimestamp >= begin;
    return { ...await enrich(guild, { messages }), source: 'discord-history', channelId,
      channels: logChannels
        .map(item => ({ id: item.id, name: item.name })),
      from, to, nextBefore: hasMore ? last.id : null, hasMore,
      scanned: page.size, timezone: 'America/Sao_Paulo' };
  }
  async function ask(guild, member, payload) {
    const [channel] = await accessible(guild, member, 'ai');
    const prompt = String(payload.prompt || '').trim();
    if (!prompt || prompt.length > 4000) throw failure(400, 'Envie uma mensagem de até 4000 caracteres.');
    const actor = guild.id + ':' + member.id;
    if (aiLocks.has(actor)) throw failure(409, 'A IA ainda está respondendo à sua mensagem anterior.');
    if (Date.now() - (aiRate.get(actor) || 0) < 3000) throw failure(429, 'Aguarde um instante antes de enviar outra mensagem.');
    aiLocks.add(actor); aiRate.set(actor, Date.now());
    try {
      const folder = join(directory, guild.id, 'ai-conversations');
      const file = join(folder, member.id + '.json');
      let conversation = { messages: [], threadId: null };
      try { conversation = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const context = { profile: profile(member), channel: { id: channel.id, name: channel.name },
        consultedAt: new Date().toISOString(), availableModules: [] };
      for (const module of Object.keys(channels)) {
        try { await accessible(guild, member, module); context.availableModules.push(module); } catch {}
      }
      // Reaproveita somente as consultas autorizadas feitas pela própria conta.
      const rolesKey = [...member.roles.cache.keys()].sort().join(',');
      context.recentConsultations = [...cache.values()].filter(item => item.actorId === member.id && item.rolesKey === rolesKey &&
        item.generation === generation && context.availableModules.includes(item.module))
        .slice(-3).map(item => ({ module: item.module, data: cloneReadOnly(item.data) }));
      context.liveInformation = await getContext({ guild, member, prompt });
      const answer = await generateAI({ prompt, profile: context.profile,
        context, history: (conversation.messages || []).slice(-16) });
      if (!String(answer || '').trim()) throw failure(502, 'A IA respondeu sem conteúdo. Tente novamente.');
      // O chat do site permanece privado; somente logAI registra a auditoria.
      conversation.messages = [...(conversation.messages || []), { role: 'user', text: prompt },
        { role: 'model', text: String(answer) }].slice(-24);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(file + '.tmp', JSON.stringify(conversation), { mode: 0o600 }); await rename(file + '.tmp', file);
      let auditQueued = false, auditWarning = '';
      try {
        auditQueued = Boolean((await logAI({ member, prompt, answer: String(answer) }))?.queued);
        if (!auditQueued) auditWarning = 'A fila das logs da IA não foi configurada.';
      } catch (error) {
        auditWarning = 'A conversa foi salva, mas não consegui gravar a fila das logs.';
        console.error('[SITE AI AUDIT]', error.code || error.message);
      }
      return {
        answer: String(answer),
        discordSynced: false,
        discordWarning: 'A conversa do site é privada.',
        threadUrl: null,
        auditQueued,
        auditWarning,
        profile: context.profile,
      };
    } finally { aiLocks.delete(actor); }
  }
  async function preferences(guild, member) {
    try {
      return JSON.parse(await readFile(join(directory, guild.id, 'profiles', member.id + '.json'), 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function handle({ guild, member, action, payload, res }) {
    if (action === 'profile.preferences') {
      if (!isTeamMember(member)) throw failure(403, 'A personalização da Central Creators é exclusiva da equipe.');
      const previous = await preferences(guild, member);
      const value = {
        ...previous,
        headline: String(payload.headline ?? previous.headline ?? '').trim().slice(0, 100),
        bio: String(payload.bio ?? previous.bio ?? '').trim().slice(0, 500),
        accent: ['purple', 'blue', 'pink'].includes(payload.accent ?? previous.accent)
          ? (payload.accent ?? previous.accent) : 'purple',
        motto: String(payload.motto ?? previous.motto ?? '').trim().slice(0, 120),
        cover: ['aurora', 'nebula', 'minimal'].includes(payload.cover ?? previous.cover)
          ? (payload.cover ?? previous.cover) : 'aurora',
        density: ['comfortable', 'compact'].includes(payload.density ?? previous.density)
          ? (payload.density ?? previous.density) : 'comfortable',
        showRoles: payload.showRoles === undefined
          ? previous.showRoles !== false : payload.showRoles === 'yes',
      };
      const folder = join(directory, guild.id, 'profiles'), file = join(folder, member.id + '.json');
      profileWrites = profileWrites.catch(() => {}).then(async () => {
        await mkdir(folder, { recursive: true, mode: 0o700 });
        await writeFile(file + '.tmp', JSON.stringify(value), { mode: 0o600 }); await rename(file + '.tmp', file);
      });
      await profileWrites;
      res.json({ preferences: value }); return true;
    }
    if (action.startsWith('history.')) { res.json(await history(guild, member, action, payload)); return true; }
    if (action === 'identity.batch') {
      const ids = Array.isArray(payload.ids) ? [...new Set(payload.ids.map(String))].slice(0, 100) : [];
      const people = {};
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (next < ids.length) { const id = ids[next++]; people[id] = await person(guild, id); }
      }));
      res.json({ people }); return true;
    }
    if (action === 'ai.ask') { res.json(await ask(guild, member, payload)); return true; }
    const module = action.split('.')[0], snapshot = action.endsWith('.snapshot');
    const editing = ['staff.decide', 'manager.decision', 'manager.presence', 'social.refresh',
      'social.decision', 'quiz.reset', 'gi.action', 'hierarchy.action', 'weekly.adjust'].includes(action);
    if (editing && !isTeamMember(member)) throw failure(403, 'A edição da Central Creators é exclusiva da equipe.');
    if (!snapshot) {
      if (editing) {
        const send = res.json.bind(res); res.json = data => { invalidate(); return send(data); };
      }
      return false;
    }
    await accessible(guild, member, module);
    const roles = [...member.roles.cache.keys()].sort().join(',');
    const key = scopeKey(guild, member.id, module, payload) + ':' + roles;
    const saved = cache.get(key);
    if (!payload.refresh && saved && saved.generation === generation && Date.now() - saved.at < ttl) {
      res.json(copy(saved.data)); return true;
    }
    const send = res.json.bind(res), requestGeneration = generation;
    res.json = async data => {
      if (res.statusCode >= 400 || data?.error) return send(data);
      try {
        const value = await enrich(guild, data);
        value.generatedAt = Date.now();
        cache.set(key, { at: Date.now(), generation: requestGeneration, rolesKey: roles, actorId: member.id, module, data: value });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        saveSnapshot(guild, member.id, module, payload, value, [...member.roles.cache.keys()]);
        return send(value);
      } catch (error) {
        // Uma foto indisponível não pode impedir a consulta autorizada do provedor original.
        console.error('[SITE PROFILE]', error.code || error.name);
        return send({ ...data, people: {}, identityWarning: 'Alguns perfis do Discord estão temporariamente indisponíveis.' });
      }
    };
    return false;
  }
  return { profile, preferences, handle, invalidate, flush: () => writes };
}
