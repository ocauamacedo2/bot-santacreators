// d:\bots\events\monitorCargos.js
import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';

// =====================================================
// ⚙️ CONFIGURAÇÃO
// =====================================================

const DASHBOARD_CHANNEL_ID = '1411878799561457765'; // Canal do Painel Fixo
const ALERT_CHANNEL_ID = '1401815638233710685';     // Canal de Alertas (Estourou)

// Cargo "Total" (Pai)
const TOTAL_ROLE_ID = '1371733765243670538';
const TOTAL_LIMIT = 40;

// Lista de cargos para monitorar (Gestão 40 ideal)
// Obs: "Treinamento / Equipe Creator" é rotativo e NÃO entra na conta da gestão.
// Mantive no painel com limite bem alto pra não estourar e não gerar alerta.
const ROLES_CONFIG = [
  { id: '1352429001188180039', limit: 20, emoji: '🧪', name: 'Treinamento' }, // rotativo (fora da conta da gestão)
  { id: '1388976094920704141', limit: 5,   emoji: '📱', name: 'Social Media' },
  { id: '1388976155830255697', limit: 12,  emoji: '🎯', name: 'Manager' },
  { id: '1388975939161161728', limit: 5,   emoji: '🧠', name: 'Gestor' },
  { id: '1388976314253312100', limit: 5,   emoji: '🧩', name: 'Coordenação' },
  { id: '1352407252216184833', limit: 4,   emoji: '🛡️', name: 'Resp. Líder' },
  { id: '1262262852949905409', limit: 4,   emoji: '🌟', name: 'Resp. Influ' },
  { id: '1352408327983861844', limit: 2,   emoji: '👑', name: 'Resp. Creators' }
];

// Cargos que recebem o relatório semanal no PV (Resp Líder, Resp Influ, Resp Creators)
const WEEKLY_DM_ROLES = [
  '1352407252216184833', // Resp Líder
  '1262262852949905409', // Resp Influ
  '1352408327983861844'  // Resp Creators
];

const GIF_BANNER = 'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif';

// Caminho para salvar estado (evita recriar msg toda hora e evita flood de alerta)
const STORAGE_PATH = path.resolve(process.cwd(), 'storage', 'monitor_cargos_state.json');

// =====================================================
// 💾 PERSISTÊNCIA
// =====================================================

function loadState() {
  try {
    if (!fs.existsSync(STORAGE_PATH)) return { dashboardMsgId: null, alertedRoles: {}, lastWeeklyRun: null };
    return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
  } catch {
    return { dashboardMsgId: null, alertedRoles: {}, lastWeeklyRun: null };
  }
}

function saveState(data) {
  try {
    const dir = path.dirname(STORAGE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[MonitorCargos] Erro ao salvar estado:', e);
  }
}

// =====================================================
// 📊 LÓGICA VISUAL
// =====================================================

function createProgressBar(current, max, size = 8) {
  const percentage = Math.min(1, Math.max(0, current / max));
  const progress = Math.round(size * percentage);
  const empty = size - progress;
  
  const filledChar = '■';
  const emptyChar = '□';
  
  return `[${filledChar.repeat(progress)}${emptyChar.repeat(empty)}]`;
}

function getStatusEmoji(current, max) {
  if (current > max) return '🔴'; // Estourou
  if (current === max) return '🟠'; // Cheio
  if (current >= max * 0.7) return '📈'; // Quase cheio
  return '📉'; // Tranquilo
}

// =====================================================
// 🔄 CORE FUNCTIONS
// =====================================================

async function updateDashboard(client) {
  const state = loadState();
  const channel = await client.channels.fetch(DASHBOARD_CHANNEL_ID).catch(() => null);
  
  if (!channel || !channel.isTextBased()) {
    console.error(`[MonitorCargos] ❌ Erro: Canal do painel (${DASHBOARD_CHANNEL_ID}) não encontrado ou sem permissão.`);
    return;
  }

  const guild = channel.guild;
  try {
    await guild.members.fetch({ time: 45000 }); // Garante cache atualizado (45s timeout)
  } catch (e) {
    // console.warn('[MonitorCargos] Fetch timeout (usando cache):', e.message);
  }
  await guild.roles.fetch();

  let description = '';
  
  // 1. Lista os cargos individuais
  for (const cfg of ROLES_CONFIG) {
    const role = guild.roles.cache.get(cfg.id);
    const count = role ? role.members.size : 0;
    const status = getStatusEmoji(count, cfg.limit);
    const bar = createProgressBar(count, cfg.limit, 6);
    
    // Formato: 🧪 <@&ID> (Nome): 20 pessoas — 8/20 📉 [■■□□□□]
    description += `${cfg.emoji} <@&${cfg.id}>\n` +
                   `└─ **${count}/${cfg.limit}** pessoas ${status} \`${bar}\`\n\n`;
  }

  // 2. Totalizador
  const totalRole = guild.roles.cache.get(TOTAL_ROLE_ID);
  const totalCount = totalRole ? totalRole.members.size : 0;
  const totalStatus = totalCount > TOTAL_LIMIT ? '🔴' : '✅';
  
  description += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  description += `👥 **Total Geral da Equipe** (<@&${TOTAL_ROLE_ID}>)\n`;
  description += `📊 **${totalCount}/${TOTAL_LIMIT}** Colaboradores ${totalStatus}`;

  const embed = new EmbedBuilder()
    .setTitle('📊 Limite Máximo por Função / Pasta – SantaCreators')
    .setDescription(description)
    .setColor('#2b2d31')
    .setImage(GIF_BANNER)
    .setFooter({ text: 'Atualizado em tempo real • SantaCreators', iconURL: guild.iconURL() })
    .setTimestamp();

  // Edita ou Envia
  if (state.dashboardMsgId) {
    try {
      const msg = await channel.messages.fetch(state.dashboardMsgId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch (e) {
      console.log('[MonitorCargos] Mensagem antiga não encontrada, criando nova...');
      // Se falhar (msg deletada), cria nova
    }
  }

  const newMsg = await channel.send({ embeds: [embed] });
  state.dashboardMsgId = newMsg.id;
  saveState(state);
}

async function checkLimitsAndAlert(client) {
  const state = loadState();
  const channelAlert = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => null);
  if (!channelAlert) return;

  const guild = channelAlert.guild;
  
  // Garante inicialização do objeto
  if (!state.alertedRoles) state.alertedRoles = {};

  for (const cfg of ROLES_CONFIG) {
    const role = guild.roles.cache.get(cfg.id);
    if (!role) continue;

    const count = role.members.size;
    const isOverLimit = count > cfg.limit;
    const wasOverLimit = state.alertedRoles[cfg.id] || false;

    // 🚨 CASO 1: Acabou de estourar (Transição OK -> OVER)
    if (isOverLimit && !wasOverLimit) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 LIMITE DE CARGO EXCEDIDO')
        .setColor('#ff0000')
        .setDescription(
          `O cargo **${role.name}** ultrapassou o limite permitido!\n\n` +
          `📉 **Limite:** ${cfg.limit}\n` +
          `📈 **Atual:** ${count}\n\n` +
          `⚠️ Por favor, verifiquem a organização da equipe.`
        )
        .addFields({ name: 'Cargo', value: `<@&${cfg.id}>`, inline: true })
        .setThumbnail(guild.iconURL())
        .setTimestamp();

      await channelAlert.send({ content: `⚠️ Atenção <@&${TOTAL_ROLE_ID}>`, embeds: [embed] });
      
      // Marca como alertado para não floodar
      state.alertedRoles[cfg.id] = true;
      saveState(state);
    }

    // ✅ CASO 2: Voltou ao normal (Transição OVER -> OK)
    if (!isOverLimit && wasOverLimit) {
      // Remove o flag de alerta, permitindo alertar novamente no futuro se subir de novo
      state.alertedRoles[cfg.id] = false;
      saveState(state);
    }
  }
}

async function runWeeklyReport(client) {
  const state = loadState();
  const now = new Date();
  
  // Ajusta fuso horário para Brasil (UTC-3) para garantir que "Sábado 12:00" seja horário local
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brTime = new Date(utc - (3 * 60 * 60 * 1000));

  // Verifica se é Sábado (6) e se já passou das 12:00
  const isSaturday = brTime.getDay() === 6;
  const isTime = brTime.getHours() >= 12;

  // Cria uma chave única para o dia (ex: "2023-10-21")
  const todayKey = brTime.toISOString().split('T')[0];

  // Se não é sábado, ou não é hora, ou JÁ RODOU hoje -> sai
  if (!isSaturday || !isTime || state.lastWeeklyRun === todayKey) return;

  // --- INÍCIO DO RELATÓRIO ---
  const channel = await client.channels.fetch(DASHBOARD_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  const guild = channel.guild;
  try {
    await guild.members.fetch({ time: 45000 });
  } catch (e) {
    console.warn('[MonitorCargos] Weekly fetch timeout:', e.message);
  }

  const overLimitRoles = [];

  for (const cfg of ROLES_CONFIG) {
    const role = guild.roles.cache.get(cfg.id);
    if (role && role.members.size > cfg.limit) {
      overLimitRoles.push({
        name: role.name,
        id: cfg.id,
        count: role.members.size,
        limit: cfg.limit,
        emoji: cfg.emoji
      });
    }
  }

  // Se tiver alguém estourado, manda DM
  if (overLimitRoles.length > 0) {
    const description = overLimitRoles.map(r => 
      `${r.emoji} **${r.name}**: ${r.count}/${r.limit} (Excedido em ${r.count - r.limit})`
    ).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📑 Relatório Semanal de Limites')
      .setColor('#ffcc00')
      .setDescription(
        `Olá! Este é o aviso automático de sábado.\n` +
        `Os seguintes cargos estão **acima do limite** permitido:\n\n` +
        description + 
        `\n\nPor favor, realizem o alinhamento necessário.`
      )
      .setTimestamp();

    // Envia para todos os membros que possuem os cargos de responsabilidade
    const membersToNotify = new Set();

    for (const roleId of WEEKLY_DM_ROLES) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        role.members.forEach(m => {
          if (!m.user.bot) membersToNotify.add(m.id);
        });
      }
    }

    for (const userId of membersToNotify) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error(`[MonitorCargos] Não consegui enviar DM para ${userId}`);
      }
    }
  }

  // Marca como rodado hoje
  state.lastWeeklyRun = todayKey;
  saveState(state);
}

// =====================================================
// 🚀 EXPORTS & HANDLERS
// =====================================================

export async function monitorCargosOnReady(client) {
  console.log('✅ [MONITOR CARGOS] Sistema iniciado. Verificando painel...');
  
  // Atualiza painel ao ligar
  await updateDashboard(client);
  
  // Verifica alertas iniciais (caso tenha reiniciado enquanto estava estourado)
  await checkLimitsAndAlert(client);

  // Inicia o loop do Scheduler Semanal (checa a cada 10 min)
  setInterval(() => runWeeklyReport(client), 10 * 60 * 1000);
}

export async function monitorCargosHandleUpdate(oldMember, newMember, client) {
  // Verifica se houve mudança de cargos
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  
  // Se a quantidade de cargos for igual e os IDs forem os mesmos, ignora
  // (Otimização básica, mas guildMemberUpdate dispara pra muita coisa)
  const hasRoleChange = !oldRoles.equals(newRoles);

  if (hasRoleChange) {
    // Atualiza o painel visual
    await updateDashboard(client);
    
    // Verifica se precisa alertar
    await checkLimitsAndAlert(client);
  }
}

// ✅ COMANDO MANUAL PARA FORÇAR ATUALIZAÇÃO
export async function monitorCargosHandleMessage(message, client) {
  if (!message.guild || message.author.bot) return false;

  if (message.content === '!atualizarpainel') {
    // Verifica permissão (opcional, aqui deixei liberado pra quem tem permissão de admin ou cargos altos se quiser filtrar)
    await message.reply("🔄 Processando painel de cargos...");
    try {
      await updateDashboard(client);
      await message.channel.send("✅ Painel verificado/enviado com sucesso!");
    } catch (e) {
      await message.channel.send(`❌ Erro ao atualizar: \`${e.message}\``);
    }
    return true;
  }
  return false;
}
