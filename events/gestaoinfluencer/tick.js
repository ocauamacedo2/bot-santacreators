import { SC_GI_STATE, scheduleSave } from "./state.js";
import { EmbedBuilder } from "discord.js";
import { SC_GI_CFG } from "./config.js";
import { weeksBetween, monthsFromWeeks, isMidnightTZ } from "./utils.js";
import {
  sendDMWithMirror,
  weeklyDMEmbed,
  oneMonthEmbed,
  autoOffEmbed
} from "./dm.js";
import { renderBoard } from "./board.js";
import { sendGIResumo } from "./resumo.js";
import { updateGIDashboard } from "./dashboard.js";

export function SC_GI_tickStart(client) {
  setInterval(() => tick(client), SC_GI_CFG.TICK_MS);
}

async function tick(client) {
  if (!isMidnightTZ(SC_GI_CFG.TZ_OFFSET_MIN)) return;

  let ativos = 0;
  let pausados = 0;
  let veteranos = [];

for (const rec of SC_GI_STATE.registros.values()) {

  if (rec.active) {
    ativos++;
  } else {
    pausados++;
  }

  const weeks = weeksBetween(
    rec.joinDateMs,
    rec.totalPausedMs || 0
  );

  if (weeks >= 4 && rec.active) {
    veteranos.push(`<@${rec.targetId}> (${weeks} semanas)`);
  }


  // lógica por registro (DM, pausa, desligamento)


  // 📴 AUTO-DESLIGAR SE PAUSADO POR MUITO TEMPO
  if (!rec.active && rec.pausedAtMs) {
    const pausedDays =
      Math.floor((Date.now() - rec.pausedAtMs) / (24 * 60 * 60 * 1000));

    if (
      pausedDays >= SC_GI_CFG.AUTO_DESLIGAR_PAUSA_DIAS &&
      !rec.autoOffDone
    ) {
      const guild = client.guilds.cache.get(rec.guildId);
      if (!guild) continue;

      const member = await guild.members
        .fetch(rec.targetId)
        .catch(() => null);

      if (member) {
        await member.roles
          .remove(SC_GI_CFG.ROLE_GESTAOINFLUENCER)
          .catch(() => {});
      }

      await sendDMWithMirror(
        client,
        rec.targetId,
        autoOffEmbed(pausedDays)
      );

      const logCh = await guild.channels
        .fetch(SC_GI_CFG.CHANNEL_DESLIGAMENTOS)
        .catch(() => null);

      if (logCh) {
        await logCh.send(
          `⛔ Registro de <@${rec.targetId}> desligado automaticamente ` +
          `(${pausedDays} dias pausado).`
        );
      }

      rec.autoOffDone = true;
      scheduleSave();
    }

    continue; // ⛔ registro pausado NÃO entra no fluxo semanal
  }

  // ⏱️ DAQUI PRA BAIXO SÓ REGISTRO ATIVO
  if (!rec.active) continue;


  const months = monthsFromWeeks(weeks);

  // 📩 DM semanal
  if (rec.lastWeeklyDM !== weeks) {
    await sendDMWithMirror(
      client,
      rec.targetId,
      weeklyDMEmbed(weeks)
    );
    rec.lastWeeklyDM = weeks;
    scheduleSave();
  }

  // 🏆 Aviso 1 mês
  if (months >= 1 && !rec.oneMonthNotified) {
    await sendDMWithMirror(
      client,
      rec.targetId,
      oneMonthEmbed()
    );
    rec.oneMonthNotified = true;
    scheduleSave();
  }
}

const today = new Date().toDateString();

if (SC_GI_STATE.lastResumoDay !== today) {
 await updateGIDashboard(client, {
  ativos,
  pausados,
  veteranos
});

  SC_GI_STATE.lastResumoDay = today;
  scheduleSave();
}

// ✅ AGORA SIM: UMA VEZ SÓ
  await renderBoard(client);
}
