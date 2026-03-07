// events/bemvindo.js — discord.js v14 (ESM)
import { EmbedBuilder, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const TTL_MS = Number(process.env.BEMVINDO_TTL_MS || 86_400_000); // 24h
const COLOR = process.env.BASE_COLORS || '#ff009a';
const CANAL_BEMVINDO = process.env.CANAL_BEMVINDO; // fallback (SantaCreators original)

// 🔒 Constante única para o GIF (evita colisão com outros blocos/arquivos)
// Se quiser trocar sem mexer no código, defina BEMVINDO_GIF_URL no .env
const SC_GIF_BEMVINDO_UNICO =
  (process.env.BEMVINDO_GIF_URL && process.env.BEMVINDO_GIF_URL.trim()) ||
  'https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif?ex=68dc27d1&is=68dad651&hm=6945c4f850142baacf43e05be6e0e285ebc3c034a86359c0369fedb8a4f254a0&=&width=585&height=75';

// IDs padrão (como você já tava usando)
const regrasServidorIdPadrao = '1352710960204484628';
const regrasSCPadrao = '1352285379302002710';

/**
 * Config por servidor:
 * - channelId: canal onde vai aparecer o boas-vindas naquele servidor
 * - showRules: se deve mostrar os campos de regras
 * - regrasServidorId / regrasSCId: permite customizar se quiser (mantive padrão)
 */
const GUILD_CONFIG = {
  // MARESIA (server 1362899773992079533)
  '1362899773992079533': {
    channelId: '1363295052461510840', // Canal de entrada Maresia
    showRules: true,
    regrasServidorId: regrasServidorIdPadrao,
    regrasSCId: regrasSCPadrao,
  },

  // DC ADMINISTRAÇÃO (server 1452416085751234733 -> canal 1455301073844568300)
  // Aqui você pediu pra REMOVER as regras
  '1452416085751234733': {
    channelId: '1455301073844568300',
    showRules: false,
  },
};

export default {
  name: Events.GuildMemberAdd, // ou 'guildMemberAdd' se teu loader exigir string
  once: false,
  async execute(member) {
    try {
      const guildId = member.guild?.id;

      // pega config do servidor atual (se tiver)
      const cfg = (guildId && GUILD_CONFIG[guildId]) ? GUILD_CONFIG[guildId] : null;

      // canal alvo: por guild -> senão fallback do .env (comportamento antigo)
      const canalIdAlvo = cfg?.channelId || CANAL_BEMVINDO;

      if (!canalIdAlvo) {
        console.warn('[bemvindo] ❗ Falta canal alvo (nem config por guild, nem CANAL_BEMVINDO no .env)');
        return;
      }

      // garante canal mesmo sem cache
      const canal =
        member.guild.channels.cache.get(canalIdAlvo) ||
        (await member.guild.channels.fetch(canalIdAlvo).catch(() => null));

      if (!canal || !canal.isTextBased()) {
        console.warn(`[bemvindo] ❗ Canal inválido: ${canalIdAlvo}`);
        return;
      }

      // regras: padrão ligado (como antes), mas pode desligar por guild
      const showRules = cfg?.showRules ?? true;
      const regrasServidorId = cfg?.regrasServidorId || regrasServidorIdPadrao;
      const regrasSCId = cfg?.regrasSCId || regrasSCPadrao;

      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('👋 Bem-vindo(a)!')
        .setDescription(`Olá <@${member.user.id}>, estamos felizes em tê-lo conosco!`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setImage(SC_GIF_BEMVINDO_UNICO)
        .setTimestamp();

      // só adiciona as regras quando for pra adicionar
      if (showRules) {
        embed.addFields(
          { name: 'Regras do Servidor', value: `<#${regrasServidorId}>`, inline: true },
        );
      }

      const msg = await canal.send({ embeds: [embed] });

      if (TTL_MS > 0) {
        setTimeout(() => {
          msg.delete().catch(() => {});
        }, TTL_MS);
      }

      console.log(
        `[bemvindo] ✅ Mensagem enviada para ${member.user.tag} em #${canal.name} (guild ${guildId})`
      );
    } catch (err) {
      console.error('[bemvindo] Erro ao enviar mensagem de boas-vindas:', err);
    }
  },
};
