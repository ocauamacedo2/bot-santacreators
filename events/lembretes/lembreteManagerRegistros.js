// application/events/lembretes/lembreteManagerRegistros.js

export function startLembreteManagerRegistros(client) {
  // anti-duplicação (hot reload / reexec)
  if (globalThis.__LEMBRETE_MANAGER_REGISTROS__) return;
  globalThis.__LEMBRETE_MANAGER_REGISTROS__ = true;

  // === LEMBRETE ÚNICO (SEG → QUA | 08:00 e 18:00) ===
  const CANAL_GERAL_ID = "1392677042931105843";
  const LINK_REGISTRO = "https://discord.com/channels/1262262852782129183/1392680204517769277";

  // Cargos monitorados
  const CARGOS_MONITORADOS = [
    "1388976155830255697", // Manager Creator
    "1392678638176043029"  // Equipe Manager
  ];

  // Armazena a última mensagem enviada para poder apagar
  let ultimoLembreteId = null;
  let proximoTimeout = null;

  function calcularProximaExecucao(agora = new Date()) {
    const d = new Date(agora.getTime());
    d.setSeconds(0, 0);

    for (let addDia = 0; addDia < 7; addDia++) {
      const base = new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDia, 0, 0, 0, 0);

      const diaSemana = base.getDay(); // 0 dom, 1 seg, ... 3 qua
      const diasValidos = [1, 2, 3];
      if (!diasValidos.includes(diaSemana)) continue;

      const candidatos = [
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), 8, 0, 0, 0),
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), 18, 0, 0, 0),
      ];

      for (const cand of candidatos) {
        const limite = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 50, 0, 0);
        if (cand > limite) continue;
        if (cand > agora) return cand;
      }
    }

    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0, 0);
  }

  async function enviarLembreteUnico() {
    try {
      const agora = new Date();
      const dia = agora.getDay();
      if (dia < 1 || dia > 3) return;

      const limiteHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 50, 0, 0);
      if (agora > limiteHoje) return;

      const canal = await client.channels.fetch(CANAL_GERAL_ID).catch(() => null);
      if (!canal) return;

      const mencaoCargos = CARGOS_MONITORADOS.map(id => `<@&${id}>`).join(" ");
      const usuariosSet = new Set();

      for (const guild of client.guilds.cache.values()) {
        for (const cargoId of CARGOS_MONITORADOS) {
          const role = guild.roles.cache.get(cargoId);
          if (!role) continue;
          role.members.forEach(m => {
            if (!m.user.bot) usuariosSet.add(m.id);
          });
        }
      }

      const mencaoUsuarios = Array.from(usuariosSet).map(id => `<@${id}>`).join(" ");

      const conteudo =
        `🚨 ${mencaoCargos} **lembrete!**\n` +
        `Já fizeram os **registros das orgs** que vão para os eventos da semana?\n\n` +
        `👉 Façam aqui: ${LINK_REGISTRO}\n` +
        `⏳ Prazo: **quarta 23:50**\n\n` +
        `${mencaoUsuarios}`;

      if (ultimoLembreteId) {
        await canal.messages.delete(ultimoLembreteId).catch(() => {});
        ultimoLembreteId = null;
      }

      const msg = await canal.send({
        content: conteudo,
        allowedMentions: {
          parse: [],
          roles: CARGOS_MONITORADOS,
          users: Array.from(usuariosSet),
          repliedUser: false,
        },
      });

      ultimoLembreteId = msg.id;
      console.log(`✅ [ManagerRegistros] Lembrete enviado às ${agora.toLocaleTimeString()}`);
    } catch (err) {
      console.error("❌ [ManagerRegistros] Erro ao enviar lembrete:", err);
    } finally {
      agendarProximo();
    }
  }

  function agendarProximo() {
    try {
      if (proximoTimeout) {
        clearTimeout(proximoTimeout);
        proximoTimeout = null;
      }
      const agora = new Date();
      const prox = calcularProximaExecucao(agora);
      const delay = Math.max(0, prox.getTime() - agora.getTime());
      proximoTimeout = setTimeout(enviarLembreteUnico, delay);
      console.log(`🕒 [ManagerRegistros] Próximo: ${prox.toString()}`);
    } catch (e) {
      console.error("❌ [ManagerRegistros] Erro ao agendar:", e);
    }
  }

  console.log("✅ [ManagerRegistros] Sistema iniciado (Seg–Qua | 08:00 e 18:00).");
  agendarProximo();
}
