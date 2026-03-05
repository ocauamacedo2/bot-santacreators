// application/events/lembretes/socialMediasAvisos.js
import fs from "node:fs";
import path from "node:path";
import { EmbedBuilder } from "discord.js";

export function startSocialMediasAvisos(client) {
  if (globalThis.__LEMBRETES_SOCIAL_MEDIAS__) return;
  globalThis.__LEMBRETES_SOCIAL_MEDIAS__ = true;

  // ================= CONFIGURAÇÃO =================
  const GUILD_ID = "1262262852782129183";
  const CHANNEL_REMINDER_ID = "1424489278615978114"; // Canal de avisos (onde o bot manda e apaga)
  const CHANNEL_EVENTOS_DIARIOS_ID = "1385003944803041371"; // Onde o evento é postado (para checar se já foi feito)
  const CHANNEL_CRONOGRAMA_ID = "1474605177771397223"; // Painel do cronograma (para checar domingo)

  // Cargos para mencionar/DM
  const TARGET_ROLES = [
    "1388976094920704141", // Social Medias
    "1387253972661964840", // Equipe Social Medias
    "1352407252216184833", // RESP LÍDER
    "1262262852949905409", // RESP INFLU
    "1352408327983861844"  // RESP CREATORS
  ];

  // Horários de disparo (SP)
  const SCHEDULE_HOURS = [0, 3, 5, 10, 12, 14, 15, 16, 17];

  // Caminho do JSON do cronograma (para ler o evento do dia)
  // Usa process.cwd() para garantir que pegue a pasta data na raiz do bot
  const CRONO_FILE = path.resolve(process.cwd(), "data", "cronograma_state.json");

  // Variável para guardar ID da última msg no canal (para apagar e não floodar)
  let lastReminderMsgId = null;

  // ================= HELPERS =================
  const getNowSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  const getDayKey = (date) => {
    const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    return days[date.getDay()];
  };

  // Lê o cronograma para saber o evento do dia
  const getDailyEventInfo = () => {
    try {
      if (!fs.existsSync(CRONO_FILE)) return null;
      const data = JSON.parse(fs.readFileSync(CRONO_FILE, "utf8"));
      const todayKey = getDayKey(getNowSP());
      
      const info = data.schedule?.[todayKey];
      if (!info || !info.active) return null; // Sem evento hoje ou inativo
      
      return {
        name: info.eventName || "Evento",
        city: info.city || "Cidade",
        time: info.time || "19:00"
      };
    } catch (e) {
      console.error("[SocialMedias] Erro ao ler cronograma:", e);
      return null;
    }
  };

  // Verifica se o evento diário JÁ FOI POSTADO hoje no canal oficial
  const checkDailyPosted = async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_EVENTOS_DIARIOS_ID).catch(() => null);
      if (!channel) return false;

      const now = getNowSP();
      const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      if (!messages) return false;

      // Procura mensagem do BOT enviada HOJE
      const posted = messages.find(m => {
        if (m.author.id !== client.user.id) return false;
        
        const mSP = new Date(m.createdTimestamp).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const mDateSP = new Date(mSP);
        
        return mDateSP.getDate() === now.getDate() && 
               mDateSP.getMonth() === now.getMonth() && 
               mDateSP.getFullYear() === now.getFullYear();
      });

      return !!posted;
    } catch (e) {
      console.error("[SocialMedias] Erro checkDailyPosted:", e);
      return false;
    }
  };

  // Verifica se o cronograma (Domingo) JÁ FOI POSTADO/ATUALIZADO neste fim de semana
  const checkWeeklyPosted = async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_CRONOGRAMA_ID).catch(() => null);
      if (!channel) return false;

      const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (!messages) return false;

      const now = getNowSP();
      // Se não for fim de semana, assume que já foi feito (para não bugar em testes)
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      if (!isWeekend) return true; 

      // Procura msg do bot com "EVENTOS SEMANAIS" (título do painel)
      const panelMsg = messages.find(m => 
        m.author.id === client.user.id && 
        (m.content.includes("EVENTOS SEMANAIS") || m.embeds?.[0]?.title?.includes("EVENTOS SEMANAIS") || m.content.includes("Painel de Controle"))
      );

      if (!panelMsg) return false;

      const lastUpdate = panelMsg.editedTimestamp || panelMsg.createdTimestamp;
      const dateUpdate = new Date(lastUpdate).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const dUpdate = new Date(dateUpdate);

      // Se foi atualizado nas últimas 60h (cobre o fim de semana)
      const diffTime = Math.abs(now - dUpdate);
      const diffDays = diffTime / (1000 * 60 * 60 * 24); 

      return diffDays <= 2.5; 
    } catch (e) {
      console.error("[SocialMedias] Erro checkWeeklyPosted:", e);
      return false;
    }
  };

  // ================= LÓGICA PRINCIPAL =================
  const runCheckAndSend = async () => {
    const now = getNowSP();
    const day = now.getDay(); // 0=Dom

    let isDone = false;
    let messageContent = "";
    let embed = null;

    if (day === 0) {
      // DOMINGO -> Cronograma
      isDone = await checkWeeklyPosted();
      if (isDone) return; // Já feito, silêncio.

      messageContent = `📅 **Atenção Equipe!** Hoje é Domingo.\n\nPrecisamos postar o **Cronograma Semanal** aprovado.\nVerifiquem e atualizem o painel!`;
      embed = new EmbedBuilder()
        .setTitle("📅 Lembrete: Cronograma Semanal")
        .setDescription("O cronograma da próxima semana precisa ser definido e postado.\nUse `!cronograma` ou o painel fixo.")
        .setColor("#ff009a")
        .addFields({ name: "Status", value: "❌ Pendente" })
        .setFooter({ text: "SantaCreators • Gestão" });

    } else {
      // SEG-SAB -> Evento Diário
      isDone = await checkDailyPosted();
      if (isDone) return;

      const evt = getDailyEventInfo();
      if (!evt) return; // Não tem evento hoje no cronograma, silêncio.

      messageContent = `⏰ **Lembrete de Evento Diário!**\n\nHoje temos **${evt.name}** em **${evt.city}**.\nConfiram as infos e soltem o evento diário!`;
      
      embed = new EmbedBuilder()
        .setTitle(`🎉 Evento de Hoje: ${evt.name}`)
        .setDescription(`**Cidade:** ${evt.city}\n**Horário:** ${evt.time}\n\nPor favor, registrem o evento diário no canal oficial para pontuar!`)
        .setColor("#00ffff")
        .setImage("https://media.discordapp.net/attachments/1362477839944777889/1384245215249825832/standard_2rss.gif")
        .setFooter({ text: "SantaCreators • Eventos Diários" });
    }

    // 1. Enviar DMs
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
      const membersToNotify = new Set();
      for (const rid of TARGET_ROLES) {
        const role = await guild.roles.fetch(rid).catch(() => null);
        if (role) role.members.forEach(m => { if (!m.user.bot) membersToNotify.add(m); });
      }

      for (const member of membersToNotify) {
        try {
          // Marca a pessoa na DM também
          await member.send({ content: `👋 Olá <@${member.id}>!\n\n${messageContent}`, embeds: [embed] });
        } catch {} // DM fechada
      }
    }

    // 2. Enviar no Canal (Apagando anterior)
    const channel = await client.channels.fetch(CHANNEL_REMINDER_ID).catch(() => null);
    if (channel) {
      // Tenta apagar a última msg se tivermos o ID
      if (lastReminderMsgId) {
        try {
          const oldMsg = await channel.messages.fetch(lastReminderMsgId).catch(() => null);
          if (oldMsg) await oldMsg.delete();
        } catch {}
      } else {
        // Fallback: procura última msg do bot no canal
        const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
        if (msgs) {
          const botMsg = msgs.find(m => m.author.id === client.user.id);
          if (botMsg) await botMsg.delete().catch(() => {});
        }
      }

      const mentions = TARGET_ROLES.map(r => `<@&${r}>`).join(" ");
      const sent = await channel.send({ 
        content: `${mentions}\n${messageContent}`, 
        embeds: [embed] 
      });
      lastReminderMsgId = sent.id;
    }
  };

  // ================= AGENDADOR =================
  let lastRunHour = -1;

  const scheduler = () => {
    const now = getNowSP();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Se estivermos no minuto 0 de uma hora agendada E ainda não rodamos nessa hora
    if (minute === 0 && SCHEDULE_HOURS.includes(hour) && lastRunHour !== hour) {
      lastRunHour = hour;
      runCheckAndSend();
    }
  };

  // Roda a cada 1 minuto para checar o horário
  setInterval(scheduler, 60 * 1000);
  
  console.log("✅ [SocialMedias] Sistema de Lembretes Diários/Semanais V2 iniciado.");
}
