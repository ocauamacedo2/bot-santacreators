import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dashEmit } from '../../utils/dashHub.js';

// --- CONFIG ---
// Canal para logar o uso do comando e a pontuação
const LOG_CHANNEL_ID = "1471695257010831614"; // Usando o mesmo canal de logs de correção para centralizar

// Cargos que podem usar o comando
const CARGOS_PODE_USAR = [
  '1262262852949905408', // owner
  '660311795327828008',  // você
  '1352408327983861844', // resp creator
  '1262262852949905409', // resp influ
  '1352407252216184833', // resp lider
  '1388976314253312100', // coord creators
  '1352385500614234134', // coordenação
  '1352429001188180039', // equipe creator
  '1282119104576098314', // mkt ticket
  '1372716303122567239'  // tickets
];

// ID da categoria de tickets de entrevista
const CATEGORIA_ENTREVISTA_ID = "1359244725781266492";

// Cooldown para evitar spam de pontos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOLDOWN_FILE = path.resolve(__dirname, '../../data/perguntas_cooldown.json');

function checkCooldown(userId) {
  try {
    const dir = path.dirname(COOLDOWN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    let data = {};
    if (fs.existsSync(COOLDOWN_FILE)) {
      data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    }

    const now = Date.now();
    const last = data[userId] || 0;
    const cooldown = 60 * 60 * 1000; // 1 hora

    if (now - last < cooldown) {
      const remaining = cooldown - (now - last);
      const minutes = Math.ceil(remaining / 60000);
      return { scored: false, remaining: `${minutes} minuto(s)` };
    }

    data[userId] = now;
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
    return { scored: true, remaining: '0' };
  } catch (e) {
    console.error("Erro no cooldown do !perguntas:", e);
    return { scored: true, remaining: '0' }; // Em caso de erro, permite pontuar para não bloquear o usuário
  }
}

// --- COMMAND EXECUTION ---
export default {
  name: 'perguntas',
  async execute(message, args, client) {
    // 1. Validação de permissão
    const temPermissao = message.member.roles.cache.some(r => CARGOS_PODE_USAR.includes(r.id)) || CARGOS_PODE_USAR.includes(message.author.id);
    if (!temPermissao) {
      return message.reply("🚫 Você não tem permissão para usar este comando.").catch(() => {});
    }

    // 2. Validação de contexto (só em tickets de entrevista)
    if (message.channel.parentId !== CATEGORIA_ENTREVISTA_ID) {
      return message.reply("🚫 Este comando só pode ser usado em um canal de ticket de entrevista.").catch(() => {});
    }

    // 3. Lógica de Cooldown e Pontuação
    const scoreInfo = checkCooldown(message.author.id);

    // 4. Enviar log
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🧾 !perguntas usado')
        .setColor(scoreInfo.scored ? '#57F287' : '#FEE75C') // Verde se pontuou, amarelo se em cooldown
        .setDescription(`Comando usado por ${message.author} no ticket ${message.channel}.`)
        .addFields(
          { name: 'Usuário (ganhou ponto)', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
          { name: 'Canal', value: `${message.channel}`, inline: true },
          { name: 'Pontuou?', value: scoreInfo.scored ? '✅ Sim' : `⏳ Não (cooldown: ${scoreInfo.remaining})`, inline: false }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }

    // 5. Emitir evento para o dashboard (apenas se pontuou)
    if (scoreInfo.scored) {
      dashEmit('entrevista:perguntas', {
        userId: message.author.id,
        __at: Date.now(),
        source: 'perguntas'
      });
      await message.reply({ content: '✅ Ponto de `!perguntas` contabilizado para você!', ephemeral: true }).catch(() => {});
    } else {
      await message.reply({ content: `⏳ Você já usou este comando recentemente. Espere mais ${scoreInfo.remaining} para pontuar novamente.`, ephemeral: true }).catch(() => {});
    }
  }
};