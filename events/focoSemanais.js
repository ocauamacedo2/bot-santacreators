import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} from 'discord.js';

// Guard to prevent multiple initializations if imported multiple times
if (globalThis.__SC_FOCO_INSTALLED__) {
    // already loaded
}
globalThis.__SC_FOCO_INSTALLED__ = true;

// ================= CONFIG =================
const CANAL_MENU_ID       = '1401815712216907796';
const CANAL_LOGS_FOCO_ID  = '1400278534320029768';
const CARGOS_AUTORIZADOS_FOCO = [
  '660311795327828008', // Cauã
  '1262262852949905408', // Owner
  '1352408327983861844', // Resp Creator
  '1262262852949905409', // Resp Influ
  '1352407252216184833', // Resp Líder
  '1282119104576098314'  // MKT Ticket
];

// Estado local
let focoAtual = null;       // { titulo, foco, ids, horario }
let mensagemAtual = null;   // id da msg “foco semanal”
let botaoMenuId  = null;    // id do botão do menu

// ================= Persistência (autor/menções) =================
const CAMINHO_FOCO_STATS = path.resolve(process.cwd(), 'foco_stats.json');

function focoLoad() {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_FOCO_STATS, 'utf-8') || '{}');
  } catch { return { byUserCreated:{}, byUserMentioned:{} }; }
}
function focoSave(data) {
  try { fs.writeFileSync(CAMINHO_FOCO_STATS, JSON.stringify(data, null, 2)); } catch {}
}

const __FOCO_CACHE__ = (() => {
  const disk = focoLoad();
  return {
    byUserCreated:   disk.byUserCreated   || {}, // { uid: count }
    byUserMentioned: disk.byUserMentioned || {}, // { uid: count }
    scanCache: new Map(),                          // key -> { at, val }
    ttlMs: 5 * 60 * 1000,
  };
})();

function focoBumpCreated(userId, delta=1){
  const uid = String(userId);
  __FOCO_CACHE__.byUserCreated[uid] = Math.max(0, (+__FOCO_CACHE__.byUserCreated[uid]||0) + delta);
  focoSave({ byUserCreated: __FOCO_CACHE__.byUserCreated, byUserMentioned: __FOCO_CACHE__.byUserMentioned });
  __FOCO_CACHE__.scanCache.clear();
}
function focoBumpMentioned(userId, delta=1){
  const uid = String(userId);
  __FOCO_CACHE__.byUserMentioned[uid] = Math.max(0, (+__FOCO_CACHE__.byUserMentioned[uid]||0) + delta);
  focoSave({ byUserCreated: __FOCO_CACHE__.byUserCreated, byUserMentioned: __FOCO_CACHE__.byUserMentioned });
  __FOCO_CACHE__.scanCache.clear();
}

// ================= Time helpers (namespaced) =================
const FOCO_TIME = (() => {
  const nowInSP = () => new Date(new Date().toLocaleString('en-US',{ timeZone:'America/Sao_Paulo' }));
  const startOfDaySP = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x; };
  const addDays = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const weekKeyFromDateSP = (d)=>{
    const dz = startOfDaySP(new Date(d.toLocaleString('en-US',{ timeZone:'America/Sao_Paulo' })));
    const dow = dz.getDay(); const sunday = startOfDaySP(addDays(dz, -dow));
    return sunday.toISOString().slice(0,10);
  };
  const getCurrentWeekSP = ()=>{
    const now = nowInSP(); const dow = now.getDay();
    const sunday = startOfDaySP(addDays(now,-dow));
    const saturday = startOfDaySP(addDays(sunday,6));
    const thursday = startOfDaySP(addDays(sunday,4));
    const friday   = startOfDaySP(addDays(sunday,5));
    const weekKey  = sunday.toISOString().slice(0,10);
    return { sunday, saturday, thursday, friday, weekKey };
  };
  return { nowInSP, startOfDaySP, addDays, weekKeyFromDateSP, getCurrentWeekSP };
})();

// ================= Scan de LOGS (histórico) =================
function focoParseFromLogEmbed(emb) {
  const fields = emb?.fields || [];
  const autorF = fields.find(f => (f.name||'').includes('Autor'));
  const idsF   = fields.find(f => (f.name||'').includes('IDs'));
  const authorId = /<@!?(\d+)>/.exec(autorF?.value||'')?.[1] || null;
  const idsRaw = String(idsF?.value||'').trim();
  const mentioned = idsRaw.split(/\s+/).filter(x => /^\d{17,20}$/.test(x));
  return { authorId, mentioned };
}
async function focoCollectAll(canalLogs) {
  const out = [];
  try {
    let lastId;
    for (let i=0;i<50;i++){
      const batch = await canalLogs.messages.fetch({ limit:100, before:lastId }).catch(()=>null);
      if (!batch?.size) break;
      for (const m of batch.values()) {
        const emb = m.embeds?.[0];
        if (!emb || !(emb.title||'').includes('Novo Foco Semanal Registrado')) continue;
        const { authorId, mentioned } = focoParseFromLogEmbed(emb);
        if (!authorId && !mentioned.length) continue;
        const ts = new Date(m.createdTimestamp);
        out.push({ ts, weekKey: FOCO_TIME.weekKeyFromDateSP(ts), authorId, mentioned });
      }
      lastId = batch.last()?.id; if (!lastId) break;
    }
  } catch {}
  return out;
}

// ================= APIs Globais (opcional p/ DMs) =================
globalThis.SC_FOCO_getTotals = async function (userId, client){
  const uid = String(userId);
  const savedCreated   = +(__FOCO_CACHE__.byUserCreated[uid]||0);
  const savedMentioned = +(__FOCO_CACHE__.byUserMentioned[uid]||0);

  const have = (savedCreated>0 || savedMentioned>0);
  const keyLT = 'lt|'+uid;
  const hit = __FOCO_CACHE__.scanCache.get(keyLT);
  const now = Date.now();

  let lifetimeCreated = savedCreated;
  let lifetimeMentioned = savedMentioned;

  if (!have && (!hit || (now-hit.at)>=__FOCO_CACHE__.ttlMs)) {
    const canalLogs = await client.channels.fetch(CANAL_LOGS_FOCO_ID).catch(()=>null);
    if (canalLogs) {
      const all = await focoCollectAll(canalLogs);
      lifetimeCreated   = all.filter(e => String(e.authorId)===uid).length;
      lifetimeMentioned = all.reduce((acc,e)=>acc + (e.mentioned.some(x=>x===uid)?1:0), 0);
      __FOCO_CACHE__.scanCache.set(keyLT, { at: now, val: { lifetimeCreated, lifetimeMentioned } });
    }
  } else if (hit) {
    lifetimeCreated   = hit.val.lifetimeCreated;
    lifetimeMentioned = hit.val.lifetimeMentioned;
  }

  const { sunday, weekKey } = FOCO_TIME.getCurrentWeekSP();
  const lastWeekKey = FOCO_TIME.addDays(sunday, -7).toISOString().slice(0,10);

  async function countWeek(weekK){
    const k = `wk|${uid}|${weekK}`;
    const h = __FOCO_CACHE__.scanCache.get(k);
    const n = Date.now();
    if (h && (n-h.at) < __FOCO_CACHE__.ttlMs) return h.val;
    const canalLogs = await client.channels.fetch(CANAL_LOGS_FOCO_ID).catch(()=>null);
    if (!canalLogs) return { created:0, mentioned:0 };
    const all = await focoCollectAll(canalLogs);
    const created   = all.filter(e => e.weekKey===weekK && String(e.authorId)===uid).length;
    const mentioned = all.reduce((acc,e)=>acc + (e.weekKey===weekK && e.mentioned.some(x=>x===uid) ? 1 : 0), 0);
    const val = { created, mentioned };
    __FOCO_CACHE__.scanCache.set(k, { at:n, val });
    return val;
  }

  const [wk, prev] = await Promise.all([countWeek(weekKey), countWeek(lastWeekKey)]);

  return {
    lifetime: { created:lifetimeCreated, mentioned:lifetimeMentioned, total: lifetimeCreated + lifetimeMentioned },
    thisWeek: wk,
    lastWeek: prev
  };
};

// ================= UI – Menu/Botão =================
function buildMenuButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sc_foco_open').setLabel('📋 Registrar Foco Semanal').setStyle(ButtonStyle.Success)
  );
}
function buildMenuEmbed() {
  return new EmbedBuilder()
    .setTitle('🧠 Foco Semanal – SantaCreators')
    .setDescription(
`Este formulário é usado para organizar **os focos semanais** da equipe. Ele deve conter:

> 🎯 O objetivo da semana  
> 👥 Quem deve cumprir  
> ⏰ E o horário diário de lembrete  

⚠️ Apenas cargos autorizados podem registrar.  
O foco é enviado **1x por dia**, no mesmo horário, até ser substituído por um novo.

📍Use com responsabilidade!

⠀`)
    .setThumbnail('https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png')
    .setColor('DarkButNotBlack');
}

async function ensureSingleMenuButton(canal, client) {
  const msgs = await canal.messages.fetch({ limit: 20 }).catch(()=>null);
  if (msgs) {
    for (const m of msgs.values()) {
      const hasBtn = m.author?.id === client.user.id &&
        (m.components?.length || 0) > 0 &&
        (m.components[0]?.components?.some(c => (c.customId || c.data?.custom_id) === 'sc_foco_open'));
      if (hasBtn) await m.delete().catch(()=>{});
    }
  }
  const msg = await canal.send({ embeds:[buildMenuEmbed()], components:[buildMenuButton()] }).catch(()=>null);
  botaoMenuId = msg?.id || null;
  return msg;
}

// ================= EXPORTS =================

export async function focoSemanaisOnReady(client) {
  const canal = await client.channels.fetch(CANAL_MENU_ID).catch(()=>null);
  if (!canal) return;

  // warm-up de lifetime usando os logs
  setTimeout(async () => {
    try {
      const canalLogs = await client.channels.fetch(CANAL_LOGS_FOCO_ID).catch(()=>null);
      if (!canalLogs) return;
      const all = await focoCollectAll(canalLogs);
      const sumCreated={}, sumMentioned={};
      for (const e of all) {
        if (e.authorId) sumCreated[e.authorId] = (sumCreated[e.authorId]||0) + 1;
        for (const m of e.mentioned) sumMentioned[m] = (sumMentioned[m]||0) + 1;
      }
      let changed=false;
      for (const [uid,n] of Object.entries(sumCreated))   if (!__FOCO_CACHE__.byUserCreated[uid])   { __FOCO_CACHE__.byUserCreated[uid]=n; changed=true; }
      for (const [uid,n] of Object.entries(sumMentioned)) if (!__FOCO_CACHE__.byUserMentioned[uid]) { __FOCO_CACHE__.byUserMentioned[uid]=n; changed=true; }
      if (changed) focoSave({ byUserCreated: __FOCO_CACHE__.byUserCreated, byUserMentioned: __FOCO_CACHE__.byUserMentioned });
    } catch {}
  }, 1500);

  await ensureSingleMenuButton(canal, client);
}

export async function focoSemanaisHandleMessage(message, client) {
    if (!message.guild || message.author.bot) return false;
    if (message.content.toLowerCase() === "!focomenu") {
        const autorizado = CARGOS_AUTORIZADOS_FOCO.some(r => message.member?.roles?.cache?.has(r)) || CARGOS_AUTORIZADOS_FOCO.includes(message.author.id);
        if (!autorizado) {
             const m = await message.reply("🚫 Sem permissão.");
             setTimeout(() => m.delete().catch(() => {}), 5000);
             return true;
        }
        await message.delete().catch(() => {});
        
        const canal = await client.channels.fetch(CANAL_MENU_ID).catch(()=>null);
        if (canal) {
            await ensureSingleMenuButton(canal, client);
            const m = await message.channel.send("✅ Menu de Foco Semanal recriado.");
            setTimeout(() => m.delete().catch(() => {}), 5000);
        }
        return true;
    }
    return false;
}

export async function focoSemanaisHandleInteraction(interaction, client) {
  try {
    // abrir modal
    if (interaction.isButton() && interaction.customId === 'sc_foco_open') {
      const autorizado = CARGOS_AUTORIZADOS_FOCO.some(r => interaction.member?.roles?.cache?.has(r)) || CARGOS_AUTORIZADOS_FOCO.includes(interaction.user.id);
      if (!autorizado) return interaction.reply({ content: '❌ Você não tem permissão para usar isso.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('sc_foco_modal').setTitle('Registrar Foco Semanal');

      const titulo  = new TextInputBuilder().setCustomId('titulo').setLabel('📌 Título do foco semanal').setStyle(TextInputStyle.Short).setPlaceholder('ex: Organização dos baús').setRequired(true);
      const focoTx  = new TextInputBuilder().setCustomId('foco').setLabel('🎯 Qual será o foco da semana?').setStyle(TextInputStyle.Paragraph).setPlaceholder('ex: organizar os baús, revisar conteúdos...').setRequired(true);
      const idsTx   = new TextInputBuilder().setCustomId('ids').setLabel('👥 IDs dos responsáveis').setStyle(TextInputStyle.Short).setPlaceholder('ex: 660311795327828008 1320574533194874890').setRequired(true);
      const horario = new TextInputBuilder().setCustomId('horario').setLabel('⏰ Dia e horário do lembrete diário').setStyle(TextInputStyle.Short).setPlaceholder('ex: segunda 19h').setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titulo),
        new ActionRowBuilder().addComponents(focoTx),
        new ActionRowBuilder().addComponents(idsTx),
        new ActionRowBuilder().addComponents(horario)
      );

      return interaction.showModal(modal);
    }

    // submit modal
    if (interaction.isModalSubmit() && interaction.customId === 'sc_foco_modal') {
      const titulo        = interaction.fields.getTextInputValue('titulo').trim();
      const focoTexto     = interaction.fields.getTextInputValue('foco').trim();
      const ids           = interaction.fields.getTextInputValue('ids').trim();
      const horarioTexto  = interaction.fields.getTextInputValue('horario').trim();

      focoAtual = { titulo, foco: focoTexto, ids, horario: horarioTexto };

      const canalMenu = await client.channels.fetch(CANAL_MENU_ID).catch(()=>null);
      if (!canalMenu) return interaction.reply({ content: '⚠️ Canal de menu indisponível.', ephemeral: true });

      // apaga o foco anterior
      if (mensagemAtual) {
        const oldMsg = await canalMenu.messages.fetch(mensagemAtual).catch(()=>null);
        if (oldMsg) await oldMsg.delete().catch(()=>{});
      }

      const embedFoco = new EmbedBuilder()
        .setTitle(`📋 Foco Semanal: ${titulo}`)
        .setDescription(
`📌 **Foco da Semana:**\n${focoTexto}

👥 **Responsáveis:**
<@${ids.replace(/\s+/g, '>, <@')}>

⏰ **Lembrete diário:** ${horarioTexto}`)
        .setFooter({ text: `Enviado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setThumbnail('https://media.discordapp.net/attachments/1362477839944777889/1368084293905285170/sc2.png')
        .setImage('https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif')
        .setColor('DarkGreen');

      const msg = await canalMenu.send({ embeds: [embedFoco] }).catch(()=>null);
      mensagemAtual = msg?.id || null;

      // log detalhado
      const canalLogs = await resolveLogChannel(client, CANAL_LOGS_FOCO_ID);
      if (canalLogs) {
        const embedLog = new EmbedBuilder()
          .setTitle('📥 Novo Foco Semanal Registrado')
          .addFields(
            { name:'👤 Autor',   value:`<@${interaction.user.id}> | ${interaction.user.tag}`, inline:true },
            { name:'📌 Título',  value: titulo, inline:true },
            { name:'🎯 Foco',    value: focoTexto.slice(0, 1024) },
            { name:'👥 IDs',     value: ids },
            { name:'⏰ Horário', value: horarioTexto },
            { name:'🔗 Canal',   value: `<#${CANAL_MENU_ID}>` }
          )
          .setThumbnail('https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif')
          .setTimestamp()
          .setColor('Blurple');
        await canalLogs.send({ embeds: [embedLog] }).catch(()=>{});
      }

      // contagem (autor + menções)
      try {
        focoBumpCreated(interaction.user.id, 1);
        const menc = ids.split(/\s+/).filter(x => /^\d{17,20}$/.test(x));
        for (const mid of menc) focoBumpMentioned(mid, 1);
      } catch {}

      await interaction.reply({ content: '✅ Foco semanal registrado com sucesso!', ephemeral: true });

      // ============= Agendamento diário (node-cron) =============
      // encerra job anterior
      if (globalThis.__SC_FOCO_JOB__) {
        try { globalThis.__SC_FOCO_JOB__.stop(); } catch {}
        globalThis.__SC_FOCO_JOB__ = null;
      }

      // parse de "segunda 19h", "quinta 08h30", etc
      const diasSemana = {
        domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6
      };
      const partes = horarioTexto.toLowerCase().trim().split(/\s+/);
      const dia    = diasSemana[partes[0]] ?? '*';
      const hm     = (partes[1] || '12h').split('h');
      const hora   = String(hm[0]||'12').replace(/\D/g,'') || '12';
      const minuto = String(hm[1]||'0').replace(/\D/g,'')   || '0';

      const regraCron = `${minuto} ${hora} * * ${dia}`;
      const job = cron.schedule(regraCron, async () => {
        if (!focoAtual) return;
        const embedDiario = new EmbedBuilder()
          .setTitle(`📢 Lembrete Diário: ${focoAtual.titulo}`)
          .setDescription(
`📌 **Foco da Semana:**\n${focoAtual.foco}

👥 **Responsáveis:**
<@${focoAtual.ids.replace(/\s+/g, '>, <@')}>

⏰ **Enviado automaticamente**`)
          .setColor('DarkGreen')
          .setThumbnail('https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif')
          .setTimestamp();
        await canalMenu.send({ embeds: [embedDiario] }).catch(()=>{});
      });

      globalThis.__SC_FOCO_JOB__ = job;
      if (canalLogs) await canalLogs.send(`🕒 Novo lembrete agendado: \`${regraCron}\``).catch(()=>{});
    }
  } catch (err) {
    console.error('[SC_FOCO] erro na interação:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Ocorreu um erro ao processar sua ação.', ephemeral: true });
      }
    } catch {}
  }
  return false;
}