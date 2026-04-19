import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, Events
} from "discord.js";
import { dashEmit } from "../utils/dashHub.js";

// ================== CONFIG ==================
const CANAL_REGISTRO_ADV_ID = '1394463945443512391';

// quem pode usar o comando e abrir o modal pelo botão
const CARGOS_PODE_USAR_COMANDO = [
  '1262262852949905409', // resp influ
  '1414651836861907006', // responsaveis
  '1388976314253312100', // coord
  '1352385500614234134', // coordenação
  '1352408327983861844', // resp creators
  '1352429001188180039', // equipe creator
  '1262262852949905408', // owner
  '660311795327828008'   // eu
];

// controla a mensagem do botão fixo
let botaoFixoId = null;

// ================== PERSISTÊNCIA DE CONTAGEM ==================
const CAMINHO_ADV_STATS = path.resolve(process.cwd(), 'adv_stats.json');
function advLoad() {
  try { return JSON.parse(fs.readFileSync(CAMINHO_ADV_STATS, 'utf-8') || '{}'); }
  catch { return { byUser: {} }; }
}
function advSave(data) {
  try { 
    const dir = path.dirname(CAMINHO_ADV_STATS);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CAMINHO_ADV_STATS, JSON.stringify(data, null, 2)); 
  } catch {}
}

const __ADV_CACHE__ = {
  byUser: advLoad().byUser || {},  // { [userId]: lifetimeCount }
  scanCache: new Map(),            // key -> { at, val }
  ttlMs: 5 * 60 * 1000             // 5 minutos
};
function advBumpUser(userId, delta = 1) {
  const uid = String(userId);
  __ADV_CACHE__.byUser[uid] = Math.max(0, (+__ADV_CACHE__.byUser[uid] || 0) + delta);
  advSave({ byUser: __ADV_CACHE__.byUser });
  __ADV_CACHE__.scanCache.clear();
}

// ================== TIME HELPERS (namespaced) ==================
const ADV_TIME = (() => {
  const nowInSP = () =>
    new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const startOfDaySP = (d) => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
  const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const weekKeyFromDateSP = (d) => {
    const dz = startOfDaySP(new Date(d.toLocaleString('en-US',{ timeZone:'America/Sao_Paulo' })));
    const dow = dz.getDay(); const sunday = startOfDaySP(addDays(dz, -dow));
    return sunday.toISOString().slice(0,10);
  };
  const getCurrentWeekSP = () => {
    const now = nowInSP(); const dow = now.getDay();
    const sunday = startOfDaySP(addDays(now, -dow));
    const friday = startOfDaySP(addDays(sunday, 5));
    const thursday = startOfDaySP(addDays(sunday, 4));
    const saturday = startOfDaySP(addDays(sunday, 6));
    const weekKey = sunday.toISOString().slice(0,10);
    return { sunday, thursday, friday, saturday, weekKey };
  };
  return { nowInSP, startOfDaySP, addDays, weekKeyFromDateSP, getCurrentWeekSP };
})();

// ================== SCAN DO CANAL (histórico) ==================
function advParseRegistrant(emb) {
  // Procura "Registro por: <@id>" na descrição do embed
  const txt = emb?.description || '';
  const m = /Registro por:\s*<@!?(\d+)>/i.exec(txt);
  return m ? m[1] : null;
}

async function advCollectAll(canal) {
  const out = [];
  try {
    let lastId;
    for (let i=0; i<50; i++) { // até ~5000 msgs
      const batch = await canal.messages.fetch({ limit: 100, before: lastId }).catch(()=>null);
      if (!batch?.size) break;
      for (const m of batch.values()) {
        const emb = m.embeds?.[0];
        if (!emb) continue;
        if (!String(emb.title||'').includes('Prova de Advertência Registrada')) continue;

        const uid = advParseRegistrant(emb);
        if (!uid) continue;

        const ts = new Date(m.createdTimestamp);
        out.push({ userId: uid, ts, weekKey: ADV_TIME.weekKeyFromDateSP(ts) });
      }
      lastId = batch.last()?.id;
      if (!lastId) break;
    }
  } catch {}
  return out;
}

// ================== APIS GLOBAIS (opcional pra DMs) ==================
globalThis.SC_ADV_countForUser = async function (userId, client) {
  client = client || globalThis.client;
  if (!client) return 0;
  const uid = String(userId);
  const saved = +(__ADV_CACHE__.byUser[uid] || 0);
  if (saved > 0) return saved;

  const key = 'lifetime|' + uid;
  const hit = __ADV_CACHE__.scanCache.get(key);
  const now = Date.now();
  if (hit && (now - hit.at) < __ADV_CACHE__.ttlMs) return hit.val;

  const canal = await client.channels.fetch(CANAL_REGISTRO_ADV_ID).catch(()=>null);
  if (!canal) return saved;
  const all = await advCollectAll(canal);
  const val = all.filter(e => String(e.userId) === uid).length;
  __ADV_CACHE__.scanCache.set(key, { at: now, val });
  return val;
};

globalThis.SC_ADV_countForUserWeek = async function (userId, weekKey, client) {
  client = client || globalThis.client;
  if (!client) return 0;
  const uid = String(userId);
  const key = `week|${uid}|${weekKey}`;
  const hit = __ADV_CACHE__.scanCache.get(key);
  const now = Date.now();
  if (hit && (now - hit.at) < __ADV_CACHE__.ttlMs) return hit.val;

  const canal = await client.channels.fetch(CANAL_REGISTRO_ADV_ID).catch(()=>null);
  if (!canal) return 0;
  const all = await advCollectAll(canal);
  const val = all.filter(e => String(e.userId) === uid && e.weekKey === weekKey).length;
  __ADV_CACHE__.scanCache.set(key, { at: now, val });
  return val;
};

globalThis.SC_ADV_getTotals = async function (userId, client) {
  client = client || globalThis.client;
  if (!client) return { lifetime: 0, thisWeek: 0, lastWeek: 0 };
  try {
    const { sunday, weekKey } = ADV_TIME.getCurrentWeekSP();
    const lastWeekKey = ADV_TIME.addDays(sunday, -7).toISOString().slice(0,10);
    const [lifetime, thisWeek, lastWeek] = await Promise.all([
      globalThis.SC_ADV_countForUser(userId, client),
      globalThis.SC_ADV_countForUserWeek(userId, weekKey, client),
      globalThis.SC_ADV_countForUserWeek(userId, lastWeekKey, client)
    ]);
    return { lifetime, thisWeek, lastWeek };
  } catch { return { lifetime: 0, thisWeek: 0, lastWeek: 0 }; }
};

// ================== UI: BOTÃO FIXO ==================
function criarBotaoRegistro() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('abrir_prova_adv')
      .setLabel('📁 Registrar Prova de Advertência')
      .setStyle(ButtonStyle.Primary)
  );
}

async function garantirBotaoFixoNoFim(canal, client) {
  // apaga o antigo que eu mesmo controlei
  if (botaoFixoId) {
    const antiga = await canal.messages.fetch(botaoFixoId).catch(() => null);
    if (antiga) await antiga.delete().catch(() => {});
  }
  // apaga quaisquer outros "iguais" do bot (anti-duplicata)
  const ultimas = await canal.messages.fetch({ limit: 50 }).catch(() => null);
  if (ultimas) {
    for (const msg of ultimas.values()) {
      const hasBtn = (msg.author?.id === client.user.id) &&
        (msg.components?.length || 0) > 0 &&
        (msg.components[0]?.components?.some(c =>
          (c.customId || c.data?.custom_id) === 'abrir_prova_adv'
        ));
      if (hasBtn) await msg.delete().catch(()=>{});
    }
  }

  const embedMenu = new EmbedBuilder()
    .setTitle('📁 Registro de Provas de Advertência')
    .setDescription(
`🎯 Sistema para registrar provas de advertência.

📌 Após clicar no botão abaixo, você preencherá:
- 👤 ID do Discord do acusado
- 🪪 ID/Passaporte
- 📆 Data da infração
- 📝 O que foi cometido

📎 Envie a imagem/vídeo da prova após registrar.`)
    .setImage('https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif')
    .setColor(0x2f3136)
    .setFooter({ text: 'SantaCreators – Sistema Oficial de Registro de ADV' });

  const msg = await canal.send({ embeds: [embedMenu], components: [criarBotaoRegistro()] }).catch(()=>null);
  botaoFixoId = msg?.id || null;
}

// ================== EXPORTED HANDLERS ==================

export async function provasAdvOnReady(client) {
  if (globalThis.__SC_PROVAS_ADV_READY_RAN__) return;
  globalThis.__SC_PROVAS_ADV_READY_RAN__ = true;

  const canal = await client.channels.fetch(CANAL_REGISTRO_ADV_ID).catch(()=>null);
  if (!canal) return;

  // warm-up de contagem (assíncrono)
  setTimeout(async () => {
    try {
      const all = await advCollectAll(canal);
      const sum = {};
      for (const e of all) sum[e.userId] = (sum[e.userId] || 0) + 1;
      let changed = false;
      for (const [uid, n] of Object.entries(sum)) {
        if (!__ADV_CACHE__.byUser[uid]) { __ADV_CACHE__.byUser[uid] = n; changed = true; }
      }
      if (changed) advSave({ byUser: __ADV_CACHE__.byUser });
    } catch {}
  }, 1500);

  await garantirBotaoFixoNoFim(canal, client);
}

export async function provasAdvHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (!message.content.toLowerCase().startsWith('!provasadv')) return false;

  const temPerm = CARGOS_PODE_USAR_COMANDO.some(id => message.member?.roles?.cache?.has(id)) || CARGOS_PODE_USAR_COMANDO.includes(message.author.id);
  if (!temPerm) return true;

  const canal = await client.channels.fetch(CANAL_REGISTRO_ADV_ID).catch(() => null);
  if (!canal) return true;

  await message.delete().catch(()=>{});
  await garantirBotaoFixoNoFim(canal, client);
  return true;
}

export async function provasAdvHandleInteraction(interaction, client) {
  try {
    // abrir modal (com checagem de cargo)
    if (interaction.isButton() && interaction.customId === 'abrir_prova_adv') {
      const temPerm = CARGOS_PODE_USAR_COMANDO.some(id => interaction.member?.roles?.cache?.has(id)) || CARGOS_PODE_USAR_COMANDO.includes(interaction.user.id);
      if (!temPerm) return interaction.reply({ content: '❌ Você não tem permissão para abrir este formulário.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId('modal_prova_adv')
        .setTitle('Registrar Prova de Advertência')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id_discord_acusado').setLabel('ID Discord do Acusado').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome_acusado').setLabel('Nome da Pessoa que Cometeu a ADV').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id_adv').setLabel('ID/Passaporte').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('data_adv').setLabel('Data da Infração').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('descricao_adv').setLabel('Descrição do Acontecido').setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

      await interaction.showModal(modal).catch(()=>{});
      return true;
    }

    // submit do modal
    if (interaction.isModalSubmit() && interaction.customId === 'modal_prova_adv') {
      // ✅ Responde imediatamente para o Discord não dar "Falha na Interação"
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const idDiscord = (interaction.fields.getTextInputValue('id_discord_acusado')||'').trim();
      const nome      = (interaction.fields.getTextInputValue('nome_acusado')||'').trim();
      const idAdv     = (interaction.fields.getTextInputValue('id_adv')||'').trim();
      const data      = (interaction.fields.getTextInputValue('data_adv')||'').trim();
      const descricao = (interaction.fields.getTextInputValue('descricao_adv')||'').trim();

      const canal = await client.channels.fetch(CANAL_REGISTRO_ADV_ID).catch(()=>null);
      if (!canal) return interaction.editReply({ content: '⚠️ Canal de registro indisponível.' });

      const membro = await interaction.guild.members.fetch(idDiscord).catch(() => null);
      const avatar = membro?.user.displayAvatarURL({ dynamic: true, size: 4096 }) || null;
      const mencao = membro ? `<@${membro.user.id}>` : `\`${nome || 'Usuário não encontrado'}\``;

      const embed = new EmbedBuilder()
        .setTitle('📁 Prova de Advertência Registrada')
        .setDescription(
`🎯 **Registro por:** <@${interaction.user.id}>
🙍‍♂️ **Acusado:** ${mencao}
🆔 **ID Discord:** \`${idDiscord || '—'}\`
🪪 **Passaporte:** \`${idAdv || '—'}\`
📅 **Data:** \`${data || '—'}\`
📝 **Descrição:**
${descricao || '—'}

📎 Envie abaixo a imagem ou vídeo da prova.`)
        .setColor(0xff0000)
        .setImage(avatar)
        .setFooter({ text: 'SantaCreators – Registro de ADV' })
        .setTimestamp();

      await canal.send({ embeds: [embed] }).catch(()=>{});

      // ✅ Integração com Ranking Semanal / GeralDash
      try {
        dashEmit("adv:registrada", {
          userId: interaction.user.id,
          targetId: idDiscord,
          __at: Date.now()
        });
      } catch {}

      try { advBumpUser(interaction.user.id, 1); } catch {}

      await interaction.editReply({ content: '✅ Registro enviado. Agora envie a prova (imagem/vídeo) neste canal.' });

      // coletor de 5 min pra reposicionar botão no fim após a mídia
      const collector = canal.createMessageCollector({
        filter: m => m.author.id === interaction.user.id && m.attachments.size > 0,
        max: 1,
        time: 5 * 60 * 1000
      });

      collector.on('collect', async () => { await garantirBotaoFixoNoFim(canal, client); });
      collector.on('end', async (col) => {
        if (col.size === 0) await garantirBotaoFixoNoFim(canal, client);
      });

      // se o clique veio do botão fixo atual, apaga e deixa o garantirBotao recolocar no fim
      if (interaction.message?.id === botaoFixoId) {
        const msgBtn = await canal.messages.fetch(botaoFixoId).catch(()=>null);
        if (msgBtn) await msgBtn.delete().catch(()=>{});
      }
      return true;
    }
  } catch (err) {
    console.error('[PROVAS_ADV] erro na interação:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Ocorreu um erro ao processar sua ação.', ephemeral: true });
      }
    } catch {}
    return true; // Retorna true para parar o roteador se for um erro interno de um ID nosso
  }
  return false;
}