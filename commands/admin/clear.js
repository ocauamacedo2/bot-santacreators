// clear.js — v7.9 (clear + clearbotao + isenção total p/ OWNER)
// • !clear        -> NÃO apaga mensagens com botões (protege componentes)
// • !clearbotao   -> SÓ apaga mensagens com botões
// • Transcript/Log bonitos, S3/Gist, limites e anti-flood
// • NOVO: OWNER (ID em env OWNER) não sofre NENHUMA limitação nem punição
// Discord.js v14 (ESM)

import {
  AttachmentBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { resolveLogChannel } from '../../events/channelResolver.js';
import dotenv from 'dotenv';
dotenv.config();

/* ==========================
   CONFIG (.env)
========================== */

const PREFIX = process.env.PREFIX || '!';

// proteger botões por label no modo botões
const CLEARBOTAO_IGNORE_PROTECT_LABELS =
  String(process.env.CLEARBOTAO_IGNORE_PROTECT_LABELS || 'true').toLowerCase() === 'true';

// cargos limitados
const CLEAR_LIMITED_ROLE_IDS = (process.env.CLEAR_LIMITED_ROLE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// usuários isentos
const CLEAR_EXEMPT_USER_IDS = (process.env.CLEAR_EXEMPT_USER_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// limites / anti-flood (p/ não-owner)
const LIMITED_MAX_AMOUNT = parseInt(process.env.CLEAR_LIMITED_MAX || '20', 10);
const FLOOD_MAX_CALLS    = parseInt(process.env.CLEAR_FLOOD_MAX_CALLS || '5', 10);
const FLOOD_WINDOW_SEC   = parseInt(process.env.CLEAR_FLOOD_WINDOW_SEC || '120', 10);
const FLOOD_EXTRA_KICKS  = parseInt(process.env.CLEAR_FLOOD_EXTRA_KICKS || '3', 10);

// hard caps / delays
const MAX_DELETE_REQUEST     = parseInt(process.env.CLEAR_HARD_CAP || '1000000', 10);
const PER_ITEM_DELETE_DELAY  = parseInt(process.env.CLEAR_SLOW_DELETE_DELAY_MS || '250', 10);

// export extra
const EXPORT_FORMATS = (process.env.CLEAR_EXPORT_FORMATS || 'html')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// prévia (mini-transcripts) no canal de logs?
const SHOW_PREVIEW = String(process.env.CLEAR_SHOW_PREVIEW || 'false').toLowerCase() === 'true';
const PREVIEW_PAGE_SIZE   = parseInt(process.env.CLEAR_PREVIEW_PAGE_SIZE || '8', 10);
const PREVIEW_MAX_EMBEDS  = parseInt(process.env.CLEAR_PREVIEW_MAX_EMBEDS || '6', 10);

// canal de logs
const LOG_CLEAR_CHANNEL_ID = process.env.LOG_CLEAR_CHANNEL_ID;

// ROLES que NÃO devem ser removidos na punição
const PUNISH_EXEMPT_ROLE_IDS = (process.env.CLEAR_PUNISH_EXEMPT_ROLE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Proteção de botões (modo normal !clear)
const CLEAR_PROTECT_ANY_COMPONENTS =
  String(process.env.CLEAR_PROTECT_ANY_COMPONENTS || 'true').toLowerCase() === 'true';

// labels protegidas (se optar por respeitar no modo botões)
const PROTECT_COMPONENT_LABELS = (process.env.CLEAR_PROTECT_LABELS ||
  'Assumir Ticket,Assumir Resp,Fechar Ticket,Adicionar Usuário,Remover Usuário')
  .split(',').map(s => s.trim()).filter(Boolean);

// S3/R2
const s3Client = (process.env.TRANSCRIPT_S3_BUCKET)
  ? new S3Client({
      region: process.env.TRANSCRIPT_S3_REGION || 'auto',
      endpoint: process.env.TRANSCRIPT_S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.TRANSCRIPT_S3_ACCESS_KEY,
        secretAccessKey: process.env.TRANSCRIPT_S3_SECRET_KEY,
      },
      forcePathStyle: !!process.env.TRANSCRIPT_S3_ENDPOINT,
    })
  : null;

/* ==========================
   Limite “40+” (p/ não-owner)
========================== */
const OVER40_THRESHOLD = parseInt(process.env.CLEAR_OVER40_THRESHOLD || '40', 10);
const OVER40_MAX_USES  = parseInt(process.env.CLEAR_OVER40_MAX_USES || '2', 10);
const OVER40_WINDOW_SEC= parseInt(process.env.CLEAR_OVER40_WINDOW_SEC || '86400', 10); // 24h

// mapa: userId -> [timestamps de limpezas >= OVER40_THRESHOLD]
const OVER40_TRACK = new Map();
function registerOver40(uid, now = Date.now()) {
  const list = OVER40_TRACK.get(uid) || [];
  list.push(now);
  const cut = now - OVER40_WINDOW_SEC * 1000;
  OVER40_TRACK.set(uid, list.filter(ts => ts >= cut));
}
function over40Count(uid, now = Date.now()) {
  const list = OVER40_TRACK.get(uid) || [];
  const cut = now - OVER40_WINDOW_SEC * 1000;
  return list.filter(ts => ts >= cut).length;
}

/* ==========================
   UTILS
========================== */
const sleep    = (ms)=>new Promise(r=>setTimeout(r,ms));
const formatTS = (d)=> new Date(d).toLocaleString('pt-BR', { hour12:false });
const fmtDay   = (d)=> new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

const escapeHtml = (s='') => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const isImage = (u='') => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u);
const isVideo = (u='') => /\.(mp4|webm|mov|m4v|ogg)$/i.test(u);
const hasAnyRole = (m, ids)=> !!m && ids.some(id => m.roles.cache.has(id));

/* Anti-flood (p/ não-owner) */
const FLOOD_TRACK = new Map();
function registerCall(uid, now=Date.now()){
  const list = FLOOD_TRACK.get(uid) || [];
  list.push(now);
  const cut = now - FLOOD_WINDOW_SEC*1000;
  FLOOD_TRACK.set(uid, list.filter(ts => ts>=cut));
}
function callsInWindow(uid, now=Date.now()){
  const list = FLOOD_TRACK.get(uid) || [];
  const cut = now - FLOOD_WINDOW_SEC*1000;
  return list.filter(ts => ts>=cut).length;
}

/* Permissão do comando (roles gerais) */
async function hasPermission(message) {
  const owners = (process.env.OWNER || '').split(',').map(s=>s.trim()).filter(Boolean);
  if (owners.includes(message.author.id)) return true; // OWNER sempre pode

  const roleIds = (process.env.INTERACAO_BOT || '')
    .split(',').map(s=>s.trim()).filter(Boolean);

  return roleIds.some(id => message.member.roles.cache.has(id));
}

/* Detector de mensagens com botões */
function isMessageWithProtectedComponents(msg) {
  try {
    const rows = msg?.components ?? [];
    if (!rows.length) return false;

    if (CLEAR_PROTECT_ANY_COMPONENTS) return true;

    for (const row of rows) {
      const comps = row?.components ?? [];
      for (const c of comps) {
        const label = c?.label || c?.data?.label || '';
        if (label && PROTECT_COMPONENT_LABELS.includes(label)) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

function hasProtectedLabel(msg) {
  try {
    for (const row of (msg.components ?? [])) {
      for (const c of (row.components ?? [])) {
        const label = c?.label || c?.data?.label || '';
        if (label && PROTECT_COMPONENT_LABELS.includes(label)) return true;
      }
    }
  } catch {}
  return false;
}

/* ==========================
   TRANSCRIPT (HTML bonito)
========================== */
function buildTranscriptHTML({ guild, channel, executor, startedAt, finishedAt, requested, deleted, rows }) {
  const byDay = [];
  for (const r of rows) {
    const key = fmtDay(r.ts);
    let bucket = byDay.find(b => b.day === key);
    if (!bucket) { bucket = { day:key, items:[] }; byDay.push(bucket); }
    bucket.items.push(r);
  }

  return `<!doctype html>
<html lang="pt-br"><meta charset="utf-8">
<title>Transcrição — #${escapeHtml(channel.name)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0e14;color:#e6e9ef;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Inter}
a{color:#86a8ff;text-decoration:none}a:hover{text-decoration:underline}
.header{position:sticky;top:0;z-index:5;background:#0e1320;border-bottom:1px solid #1a2138;padding:14px 18px}
.header h1{margin:0 0 6px;font-size:18px}
.meta{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:#b6bfd6}
.meta b{color:#fff}
.wrap{max-width:980px;margin:18px auto;padding:0 16px 48px}
.day{display:flex;align-items:center;gap:12px;margin:22px 0 10px}
.day:before,.day:after{content:"";flex:1;height:1px;background:#1a2138}
.day .pill{padding:4px 10px;border-radius:999px;background:#141a2d;border:1px solid #1a2237;color:#c9d3f3;font-size:12px}
.msg{display:flex;gap:12px;padding:10px 12px;border-radius:12px;margin:6px 0}
.msg:hover{background:#0e1426}
.ava{width:42px;height:42px;border-radius:50%;flex:0 0 42px}
.content{flex:1;min-width:0}
.headerline{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.author{font-weight:700}
.time{font-size:12px;color:#98a2b3}
.bubble{margin-top:4px;display:inline-block;padding:10px 12px;border-radius:12px;background:#111827;border:1px solid #1a2238;max-width:100%}
.text{white-space:pre-wrap;word-wrap:break-word}
.attach{margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.attach .card{border:1px solid #1a2138;border-radius:10px;overflow:hidden;background:#0f1527}
.attach img{display:block;max-width:100%;height:auto}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#18223b;color:#cbd5f5;font-size:12px;margin-right:6px}
.jump{font-size:12px}
.footer{margin-top:32px;color:#9aa3b2}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
</style>

<div class="header">
  <h1>Transcript — <span class="code">#${escapeHtml(channel.name)}</span></h1>
  <div class="meta">
    <div><b>Servidor:</b> ${escapeHtml(guild.name)}</div>
    <div><b>Canal:</b> ${channel.id}</div>
    <div><b>Executor:</b> ${escapeHtml(executor.tag)} (${executor.id})</div>
    <div><b>Início:</b> ${formatTS(startedAt)}</div>
    <div><b>Fim:</b> ${formatTS(finishedAt)}</div>
    <div><b>Solicitadas:</b> ${requested}</div>
    <div><b>Apagadas:</b> ${deleted}</div>
    <div><a class="badge" href="https://discord.com/channels/${channel.guildId}/${channel.id}" target="_blank">Abrir chat</a></div>
  </div>
</div>

<div class="wrap">
${byDay.map(bucket => `
  <div class="day"><span class="pill">${escapeHtml(bucket.day)}</span></div>
  ${bucket.items.map(r => {
    const atts = (r.attachments||[]).map(u=>{
      if (isImage(u)) return `<div class="card"><a href="${u}" target="_blank"><img src="${u}" alt="imagem"></a></div>`;
      if (isVideo(u)) return `<div class="card" style="padding:10px"><a href="${u}" target="_blank">🎬 Vídeo</a></div>`;
      return `<div class="card" style="padding:10px"><a href="${u}" target="_blank">📎 Arquivo</a></div>`;
    }).join('');
    const embeds = r.embedsCount ? `<span class="badge">embeds: ${r.embedsCount}</span>` : '';
    return `
    <div class="msg">
      <img class="ava" src="${r.avatarUrl}" alt="">
      <div class="content">
        <div class="headerline">
          <div class="author">${escapeHtml(r.authorTag)}</div>
          <div class="time">• ${formatTS(r.ts)} — <a class="jump" href="${r.url}" target="_blank">abrir</a></div>
        </div>
        <div class="bubble"><div class="text">${escapeHtml(r.clean || r.content || '(sem texto)')}</div></div>
        ${(atts || embeds) ? `<div class="attach">${embeds}${atts}</div>` : ''}
      </div>
    </div>`;
  }).join('')}
`).join('')}

  <div class="footer">Gerado automaticamente — ${new Date().toLocaleString('pt-BR')}</div>
</div>
</html>`;
}

/* CSV (opcional) */
function buildCsv({ rows }) {
  const header = 'quando;autor_tag;autor_id;conteudo;anexos;embeds;jump;message_id\n';
  const esc = (s='') => `"${String(s).replace(/"/g,'""')}"`;
  return header + rows.map(r => [
    esc(formatTS(r.ts)), esc(r.authorTag), esc(r.authorId), esc(r.clean || r.content || ''),
    esc((r.attachments||[]).join(' ')), esc(r.embedsCount||0), esc(r.url), esc(r.messageId)
  ].join(';')).join('\n');
}

/* Prévia em embeds (só se SHOW_PREVIEW=true) */
function buildPreviewEmbeds({ guild, channel, rows }) {
  const pages = [];
  const chunks = [];
  for (let i=0; i<rows.length; i+=PREVIEW_PAGE_SIZE) {
    chunks.push(rows.slice(i, i+PREVIEW_PAGE_SIZE));
    if (chunks.length >= PREVIEW_MAX_EMBEDS) break;
  }
  chunks.forEach((chunk, idx) => {
    const desc = chunk.map(r =>
      `**${r.authorTag}**  •  ${formatTS(r.ts)}\n${r.clean || r.content || '(sem texto)'}\n[abrir](${r.url})`
    ).join('\n\n');
    const eb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: `Transcript prévia — #${channel.name} (${idx+1}/${chunks.length})` })
      .setDescription(desc)
      .setFooter({ text: `Servidor: ${guild?.name ?? ''}` });
    pages.push(eb);
  });
  return pages;
}

/* ==========================
   UPLOAD — S3/R2 + Gist (com viewer HTML)
========================== */
async function uploadTranscriptHTML(html, slug) {
  if (!s3Client) return null;
  const bucket = process.env.TRANSCRIPT_S3_BUCKET;
  const items = [
    { Key:`transcript/${slug}.html`,      Body: html },
    { Key:`transcript/${slug}/index.html`,Body: html },
  ];
  for (const it of items) {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: it.Key,
      Body: Buffer.from(it.Body, 'utf-8'),
      ContentType: 'text/html; charset=utf-8',
      ACL: 'public-read'
    });
    await s3Client.send(cmd);
  }
  const base = (process.env.TRANSCRIPT_PUBLIC_BASE || '').replace(/\/+$/,'');
  return `${base}/transcript/${slug}`;
}

// Fallback: Gist público + viewer
async function uploadTranscriptToGistWithViewer(html, filename) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'Discord clear transcript (HTML)',
      public: true,
      files: { [filename]: { content: html } }
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const fileObj = data.files[filename];
  const raw = fileObj?.raw_url;
  const viewer = raw ? `https://htmlpreview.github.io/?${raw}` : data.html_url;
  return { viewerUrl: viewer, gistUrl: data.html_url };
}

/* ==========================
   Punição (remove cargos) — NUNCA em OWNER/EXEMPT
========================== */
async function punishMemberRoles(member, reason='Abuso do !clear') {
  try {
    const owners = (process.env.OWNER || '').split(',').map(s=>s.trim()).filter(Boolean);
    const isOwner = owners.includes(member.id);
    const isExempt = CLEAR_EXEMPT_USER_IDS.includes(member.id);
    if (isOwner || isExempt) return; // DONO ou ISENTO nunca é punido

    const rolesToRemove = member.roles.cache.filter(r =>
      r.id !== member.guild.id &&
      !PUNISH_EXEMPT_ROLE_IDS.includes(r.id) &&
      r.editable
    );
    if (rolesToRemove.size > 0) {
      await member.roles.remove(rolesToRemove, reason);
    }
  } catch (e) {
    console.error('[CLEAR] Falha ao punir:', e);
  }
}

/* ==========================
   COMMAND
========================== */
export default {
  name: 'clear',
  description: 'Limpa mensagens do canal com transcript visual, limites e anti-flood (protege botões).',
  hasPermission,

  async execute(message, args) {
    // 🔒 anti-duplicado: se algum outro listener também chamar, ignora
    if (message.__CLEAR_ALREADY_HANDLED__) return;
    message.__CLEAR_ALREADY_HANDLED__ = true;

    // Detecta modo "só botões" vindo do wrapper clearbotao.js OU pelo próprio nome
    const invoked = (message.content || '')
      .slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();

    const isClearButtons =
      message.__FORCE_CLEAR_BUTTONS__ === true || invoked === 'clearbotao';

    // Identidade (OWNER/EXEMPT)
    const ownersArr = (process.env.OWNER || '').split(',').map(s=>s.trim()).filter(Boolean);
    const isOwner   = ownersArr.includes(message.author.id);
    const isExempt  = CLEAR_EXEMPT_USER_IDS.includes(message.author.id);

    // perm do comando (OWNER sempre pode)
    if (!isOwner && !await hasPermission(message)) {
      setTimeout(() => message.delete().catch(() => {}), 1000);
      return message.reply('❌ Você não tem permissão para usar este comando.')
        .then(m => setTimeout(()=>m.delete().catch(()=>{}), 5000));
    }

// perms do Discord: usuário pode não ter ManageMessages se for OWNER; o bot precisa ter sempre
const me = message.guild.members.me;

// ✅ BOT precisa ter "Gerenciar Mensagens" **neste canal**
if (!me.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages)) {
  return message.reply('❌ Eu preciso da permissão **Gerenciar Mensagens** neste canal.')
    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
}

// ✅ USUÁRIO precisa ter "Gerenciar Mensagens" **neste canal** (OWNER ignora)
if (!isOwner && !message.member.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages)) {
  return message.reply('❌ Você precisa da permissão **Gerenciar Mensagens** neste canal.')
    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
}


    // TRAVA “terceira vez 40+” — não se aplica a OWNER/EXEMPT
    if (!isOwner && !isExempt) {
      const usedOver40 = over40Count(message.author.id);
      if (usedOver40 >= OVER40_MAX_USES) {
        await punishMemberRoles(message.member, `Abuso do ${isClearButtons ? '!clearbotao' : '!clear'} — terceira tentativa após ${OVER40_MAX_USES} limpezas >= ${OVER40_THRESHOLD}`);
        const warn = new EmbedBuilder()
          .setColor(0xFF3B30)
          .setAuthor({ name: 'Medida de segurança aplicada' })
          .setDescription([
            `Você já realizou **${usedOver40}** limpeza(s) com **${OVER40_THRESHOLD}+** mensagens apagadas nas últimas **${Math.round(OVER40_WINDOW_SEC/3600)}h**.`,
            `Na terceira tentativa, seus cargos foram removidos por segurança.`
          ].join('\n'));
        const w = await message.channel.send({ embeds:[warn] });
        setTimeout(()=>w.delete().catch(()=>{}), 15000);
        return;
      }
    }

    // quantidade
    const requestedRaw = parseInt(args[0], 10);
    if (!requestedRaw || requestedRaw <= 0) {
      const uso = isClearButtons ? '`!clearbotao <quantidade>`' : '`!clear <quantidade>`';
      return message.reply(`Use: ${uso} (ex: ${isClearButtons ? '`!clearbotao 100`' : '`!clear 20`'})`)
        .then(m => setTimeout(()=>m.delete().catch(()=>{}), 6000));
    }

    // limites / anti-flood — ignorados para OWNER/EXEMPT
    const isLimited = !isOwner && !isExempt && hasAnyRole(message.member, CLEAR_LIMITED_ROLE_IDS);

    if (!isOwner && !isExempt && isLimited) {
      registerCall(message.author.id);
      const calls = callsInWindow(message.author.id);

      if (calls > FLOOD_MAX_CALLS + FLOOD_EXTRA_KICKS) {
        await punishMemberRoles(message.member, `Abuso do ${isClearButtons ? '!clearbotao' : '!clear'} (anti-flood)`);
        const warn = new EmbedBuilder()
          .setColor(0xFF3B30)
          .setAuthor({ name: 'Medida de segurança aplicada' })
          .setDescription([
            `Você insistiu em usar \`${isClearButtons ? '!clearbotao' : '!clear'}\` rápido demais.`,
            'Seus cargos foram removidos por segurança.'
          ].join('\n'));
        const w = await message.channel.send({ embeds:[warn] });
        setTimeout(()=>w.delete().catch(()=>{}), 15000);
        return;
      }

      if (calls > FLOOD_MAX_CALLS) {
        const warn = new EmbedBuilder()
          .setColor(0xFFA500)
          .setAuthor({ name: 'Vai devagar…' })
          .setDescription(`Você já usou \`${calls}\` vezes em ${FLOOD_WINDOW_SEC}s. Se insistir, vai perder cargos.`);
        const m = await message.channel.send({ embeds:[warn] });
        setTimeout(()=>m.delete().catch(()=>{}), 12000);
      }
    }

    let requested = requestedRaw;
    let note = '';
    if (!isOwner && !isExempt && isLimited && requested > LIMITED_MAX_AMOUNT) {
      requested = LIMITED_MAX_AMOUNT;
      note = `\n> Limite do seu cargo: \`${LIMITED_MAX_AMOUNT}\` por limpeza.`;
    }

    const amountToDelete = Math.min(requested, MAX_DELETE_REQUEST);
    const channel = message.channel;
    const cutoff14d = Date.now() - 14*24*60*60*1000;

    let totalDeleted = 0;
    let fetchedLastId;
    const rows = [];
    const startedAt = new Date();

    // coleta + apaga
    while (totalDeleted < amountToDelete) {
      const remaining = amountToDelete - totalDeleted;
      const fetchLimit = Math.min(100, remaining);

      const fetched = await channel.messages.fetch({ limit: fetchLimit, before: fetchedLastId });
      if (fetched.size === 0) break;

      // Filtro central:
      //  - modo normal (!clear)       -> NÃO apaga mensagens com botões
      //  - modo botões (!clearbotao)  -> SÓ apaga mensagens com botões
      const batch = fetched.filter(m => {
        if (m.pinned) return false;
        const hasComp = isMessageWithProtectedComponents(m);

        if (isClearButtons) {
          if (!hasComp) return false;
          if (!CLEARBOTAO_IGNORE_PROTECT_LABELS && hasProtectedLabel(m)) return false;
          return true;
        }
        return !hasComp;
      });

      if (batch.size === 0) {
        fetchedLastId = fetched.last()?.id;
        continue;
      }

      for (const msg of batch.values()) {
        rows.push({
          ts: msg.createdAt,
          authorTag: msg.author?.tag ?? '??',
          authorId: msg.author?.id ?? '??',
          avatarUrl: msg.author?.displayAvatarURL?.({ size: 64, dynamic: true }) ?? '',
          clean: msg.cleanContent || '',
          content: msg.content || '',
          attachments: msg.attachments?.size ? [...msg.attachments.values()].map(a => a.url) : [],
          embedsCount: msg.embeds?.length || 0,
          url: msg.url,
          messageId: msg.id
        });
      }

      const younger = batch.filter(m => m.createdTimestamp > cutoff14d);
      const older   = batch.filter(m => m.createdTimestamp <= cutoff14d);

      if (younger.size > 0) {
        const deleted = await channel.bulkDelete(younger, true).catch(()=>null);
        totalDeleted += deleted?.size ?? 0;
      }
      if (older.size > 0) {
        for (const m of older.values()) {
          await m.delete().catch(()=>{});
          totalDeleted++;
          await sleep(PER_ITEM_DELETE_DELAY);
          if (totalDeleted >= amountToDelete) break;
        }
      }

      fetchedLastId = fetched.last()?.id;
      if (fetched.size < fetchLimit) break;
    }

    // registrar “uso no limite” se >= OVER40_THRESHOLD (NÃO para OWNER/EXEMPT)
    if (!isOwner && !isExempt && totalDeleted >= OVER40_THRESHOLD) {
      registerOver40(message.author.id);
      const nowCount = over40Count(message.author.id);
      if (nowCount === OVER40_MAX_USES) {
        const heads = new EmbedBuilder()
          .setColor(0xFFA500)
          .setAuthor({ name: 'Atenção ao limite de limpezas grandes' })
          .setDescription([
            `Você alcançou **${OVER40_MAX_USES}/${OVER40_MAX_USES}** limpezas com **${OVER40_THRESHOLD}+** mensagens em ~${Math.round(OVER40_WINDOW_SEC/3600)}h.`,
            `Na **próxima tentativa**, seus cargos serão removidos automaticamente.`
          ].join('\n'));
        const hh = await message.channel.send({ embeds:[heads] });
        setTimeout(()=>hh.delete().catch(()=>{}), 15000);
      }
    }

    /* transcript/link */
    const payloadCommon = {
      guild: message.guild,
      channel,
      executor: message.author,
      startedAt,
      finishedAt: new Date(),
      requested: amountToDelete,
      deleted: totalDeleted,
      rows
    };

    const html = buildTranscriptHTML(payloadCommon);
    const slug = `${channel.id}_${Date.now()}${isClearButtons ? '_btn' : ''}`;

    let publicUrl = null;
    try { publicUrl = await uploadTranscriptHTML(html, slug); } catch {}

    if (!publicUrl) {
      const gist = await uploadTranscriptToGistWithViewer(html, `transcript_${slug}.html`).catch(()=>null);
      if (gist) publicUrl = gist.viewerUrl;
    }

    const files = [];
    if (!publicUrl && EXPORT_FORMATS.includes('html')) {
      files.push(new AttachmentBuilder(Buffer.from(html,'utf-8'), {
        name: `transcript_${slug}.html`
      }));
    }
    if (EXPORT_FORMATS.includes('csv')) {
      const csv = buildCsv(payloadCommon);
      files.push(new AttachmentBuilder(Buffer.from(csv,'utf-8'), {
        name: `transcript_${slug}.csv`
      }));
    }

    // mensagem bonita no chat (15s)
    const jumpChannel = `https://discord.com/channels/${channel.guildId}/${channel.id}`;
    const pretty = new EmbedBuilder()
      .setColor(0x00B05E)
      .setAuthor({
        name: isClearButtons ? '✅ Limpeza de BOTÕES realizada' : '✅ Limpeza realizada',
        iconURL: message.author.displayAvatarURL({ size: 128 })
      })
      .addFields(
        { name: 'Canal', value: `<#${channel.id}>`, inline: true },
        { name: 'Executor', value: `<@${message.author.id}>`, inline: true },
        { name: 'Apagadas', value: `\`${totalDeleted}\` / \`${amountToDelete}\``, inline: true },
      )
      .setFooter({ text: `Início: ${formatTS(startedAt)} • Fim: ${formatTS(new Date())}` });

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir chat').setURL(jumpChannel),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir Transcript').setURL(publicUrl || jumpChannel)
    );

    const chatMsg = await channel.send({ embeds:[pretty], components:[buttonsRow] });
    setTimeout(()=>chatMsg.delete().catch(()=>{}), 15000);

    // LOG no canal de logs
    const logChannel = await resolveLogChannel(message.client, LOG_CLEAR_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: isClearButtons
            ? `🧹 Log — Limpeza de BOTÕES — ${message.guild?.name ?? 'Servidor'}`
            : `🧹 Log de Limpeza — ${message.guild?.name ?? 'Servidor'}`,
          iconURL: message.author.displayAvatarURL({ size:128 })
        })
        .addFields(
          { name: 'Canal', value: `<#${channel.id}>`, inline: true },
          { name: 'Executor', value: `<@${message.author.id}>`, inline: true },
          { name: 'Apagadas', value: `\`${totalDeleted}\` / \`${amountToDelete}\``, inline: true },
          { name: 'Limpeza 40+?', value: totalDeleted >= OVER40_THRESHOLD ? 'Sim' : 'Não', inline: true },
          { name: 'Executor é OWNER?', value: isOwner ? 'Sim' : 'Não', inline: true },
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir chat').setURL(jumpChannel),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir Transcript').setURL(publicUrl || jumpChannel)
      );

      await logChannel.send({ embeds:[logEmbed], files, components:[row] });

      if (SHOW_PREVIEW && rows.length > 0) {
        const pages = buildPreviewEmbeds({ guild: message.guild, channel, rows: rows.slice().reverse() });
        for (const eb of pages) await logChannel.send({ embeds:[eb] });
      }
    }

    if (note) {
      const n = await channel.send(note);
      setTimeout(()=>n.delete().catch(()=>{}), 8000);
    }
  }
};
