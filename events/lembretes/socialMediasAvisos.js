// application/events/lembretes/socialMediasAvisos.js

export function startSocialMediasAvisos(client) {
  if (globalThis.__LEMBRETES_SOCIAL_MEDIAS__) return;
  globalThis.__LEMBRETES_SOCIAL_MEDIAS__ = true;

  const GUILD_ID_SOCIAL = "1262262852782129183";

  const ROLES_SOCIAL = [
    "1388976094920704141", // Social Medias
    "1387253972661964840"  // Equipe Social Medias
  ];

  const ROLES_RESPS = [
    "1352407252216184833", // RESP LÍDER
    "1262262852949905409"  // RESP INFLU
  ];

  const CANAL_SOCIAL_MEDIAS = "1424489278615978114";
  const CANAL_EVENTO_DIARIO  = "1385003944803041371";

  const LINK_SOCIAL = `https://discord.com/channels/${GUILD_ID_SOCIAL}/${CANAL_SOCIAL_MEDIAS}`;
  const LINK_EVENTO_DIARIO = `https://discord.com/channels/${GUILD_ID_SOCIAL}/${CANAL_EVENTO_DIARIO}`;

  function coletarMembrosComRolesDoGuild(guildId, roleIds) {
    const g = client.guilds.cache.get(guildId);
    if (!g) return [];
    const ids = new Set();
    roleIds.forEach(rid => {
      const role = g.roles.cache.get(rid);
      role?.members.forEach(m => {
        if (!m.user?.bot) ids.add(m.id);
      });
    });
    return Array.from(ids);
  }

  async function enviarDMs(userIds, mensagem) {
    for (const id of userIds) {
      try {
        const user = await client.users.fetch(id);
        await user.send(mensagem);
      } catch {}
    }
  }

  async function enviarNoChat(canalId, conteudo, { roles = [], users = [] } = {}) {
    const canal = await client.channels.fetch(canalId).catch(() => null);
    if (!canal) return;
    await canal.send({
      content: conteudo,
      allowedMentions: {
        parse: [],
        roles,
        users,
        repliedUser: false
      }
    });
  }

  function agendar({ horasHM, diasPermitidos, fn }) {
    const agora = new Date();
    let proxima = null;

    for (let d = 0; d < 8 && !proxima; d++) {
      const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + d);
      const dia = base.getDay();
      if (!diasPermitidos.includes(dia)) continue;

      for (const hm of horasHM) {
        const [H, M] = hm.split(":").map(n => parseInt(n, 10));
        const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate(), H, M, 0, 0);
        if (cand > agora) { proxima = cand; break; }
      }
    }

    if (!proxima) return;
    const delay = Math.max(0, proxima.getTime() - agora.getTime());

    setTimeout(async () => {
      try { await fn(); }
      finally { agendar({ horasHM, diasPermitidos, fn }); }
    }, delay);

    console.log(`🕒 [SocialMedias] Próxima execução ${fn.name}: ${proxima.toString()}`);
  }

  // 1) Seg→Qua 15:00 — DM cobrando sugestões
  async function dmSugestoesEventos() {
    const membros = coletarMembrosComRolesDoGuild(GUILD_ID_SOCIAL, ROLES_SOCIAL);

    const mensagem =
`🎯 **Social Medias**, tudo certo?

Tem **alguma ideia de EVENTO** pra sugerir? Se tiver, manda **direitinho** no canal:
👉 ${LINK_SOCIAL}

**Como enviar bem:**
• Título do evento + dia sugerido
• Objetivo / dinâmica resumida
• Regras-chave (se houver)
• Materiais/apoios que precisa

Valeu! Bora manter o calendário girando. 🚀`;

    await enviarDMs(membros, mensagem);
  }

  // 2) Domingo (vários horários) — calendário semanal
  async function domingoCalendarioSemanal() {
    const membros = coletarMembrosComRolesDoGuild(GUILD_ID_SOCIAL, ROLES_SOCIAL);

    const textoDM =
`📅 **Cobrança semanal – Social Medias**

Precisamos do **CALENDÁRIO SEMANAL DE EVENTOS** e da **ORGANIZAÇÃO dos eventos** de **sexta/sábado**.
Lembrando: **quinta é fixa — SantaCreators: Missão Rosa**.

📌 Envie no canal: ${LINK_SOCIAL}
e **marque no chat** os responsáveis (**Resp Líder** ou **Resp Influ**) para validar.
Se estiver ok, **safe!**`;

    const mencaoRoles = ROLES_SOCIAL.map(id => `<@&${id}>`).join(" ");
    const textoChat =
`📣 ${mencaoRoles}

**Cobrança semanal – CALENDÁRIO + ORGANIZAÇÃO**
• Enviar **calendário semanal** e **organização** dos eventos de **sexta/sábado**
• **Quinta é fixa:** *SantaCreators: Missão Rosa*
• Postar aqui: ${LINK_SOCIAL}
• Marcar para revisão: <@&${ROLES_RESPS[0]}> ou <@&${ROLES_RESPS[1]}>`;

    await enviarDMs(membros, textoDM);

    await enviarNoChat(
      CANAL_SOCIAL_MEDIAS,
      textoChat,
      { roles: [...ROLES_SOCIAL, ...ROLES_RESPS], users: membros }
    );
  }

  // 3) Qui/Sex/Sáb 07:00 — evento diário até 14:00
  async function lembreteEventoDiario() {
    const membros = coletarMembrosComRolesDoGuild(GUILD_ID_SOCIAL, ROLES_SOCIAL);

    const textoDM =
`⏰ **Lembrete de Evento Diário**

Por favor, **enviar (ou checar se já enviaram)** o **evento do dia** até **14:00**.

• Enviar/consultar aqui: ${LINK_EVENTO_DIARIO}
• Também avisar no chat da equipe: ${LINK_SOCIAL}

Valeu!`;

    const mencaoRoles = ROLES_SOCIAL.map(id => `<@&${id}>`).join(" ");
    const textoChat =
`🔔 ${mencaoRoles}
**Lembrete de Evento Diário** — enviem até **14:00**.
Canal do evento diário: ${LINK_EVENTO_DIARIO}`;

    await enviarDMs(membros, textoDM);

    await enviarNoChat(
      CANAL_SOCIAL_MEDIAS,
      textoChat,
      { roles: [...ROLES_SOCIAL, ...ROLES_RESPS], users: membros }
    );
  }

  console.log("✅ [SocialMedias] Rotinas iniciadas.");

  agendar({ horasHM: ["15:00"], diasPermitidos: [1, 2, 3], fn: dmSugestoesEventos });
  agendar({ horasHM: ["00:00", "08:00", "12:00", "14:00", "18:00", "22:00"], diasPermitidos: [0], fn: domingoCalendarioSemanal });
  agendar({ horasHM: ["07:00"], diasPermitidos: [4, 5, 6], fn: lembreteEventoDiario });
}
