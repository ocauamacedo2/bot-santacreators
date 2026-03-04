import { SC_GI_STATE, scheduleSave } from "./state.js";
import { addGIRole, removeGIRole } from "./roles.js";
import { registroEmbed, registroButtons } from "./ui.js";
import { logGI } from "./logs.js";
import { notifyGI } from "./alerts.js";
import { addGIHistory } from "./history.js";

export async function createRegistro({
  guild,
  channel,
  target,
  registrar,
  area,
  joinDateMs
}) {
  const rec = {
  messageId: null,
  guildId: guild.id,
  channelId: channel.id,
  targetId: target.id,
  registrarId: registrar.id,
  responsibleUserId: null, // 👈 NOVO
  area,
  joinDateMs,
  createdAtMs: Date.now(),
  active: true
};


  const embed = registroEmbed({ rec, member: target, registrar });

  const msg = await channel.send({
    content: `<@${target.id}>`,
    embeds: [embed],
    components: [registroButtons("TEMP", true)]
  });

  rec.messageId = msg.id;
SC_GI_STATE.registros.set(msg.id, rec);
SC_GI_STATE.boardDirty = true; // 👈 ADD
scheduleSave();


  await msg.edit({
    components: [registroButtons(msg.id, true)]
  });

 await addGIRole(guild, target.id, "Registro criado — GI obrigatório");

addGIHistory(target.id, {
  action: "Registro criado",
  authorId: registrar.id,
  extra: area
});


return rec;

}

export async function toggleRegistro(guild, messageId, author) {
  if (!guild || !author) return;
  if (SC_GI_STATE.actionLocks.has(messageId)) return;

  SC_GI_STATE.actionLocks.add(messageId);

  try {
    const rec = SC_GI_STATE.registros.get(messageId);
    if (!rec) throw new Error("Registro não encontrado");




if (rec.active) {
  // indo PAUSAR
  rec.pausedAtMs = Date.now();
} else {
  // indo RETOMAR
  rec.totalPausedMs =
    (rec.totalPausedMs || 0) + (Date.now() - rec.pausedAtMs);
  rec.pausedAtMs = null;
}

rec.active = !rec.active;

SC_GI_STATE.boardDirty = true;
scheduleSave();

addGIHistory(rec.targetId, {
  action: rec.active ? "Registro retomado" : "Registro pausado",
  authorId: author.id
});


await notifyGI(guild.client, {
  title: rec.active ? "▶️ Registro retomado" : "⏸️ Registro pausado",
  targetId: rec.targetId,
responsibleId: rec.responsibleUserId || null,
  description: `
Área: ${rec.area}
Status: ${rec.active ? "Ativo" : "Pausado"}
  `
});


  if (rec.active) {
    await addGIRole(guild, rec.targetId, "Registro retomado");
  } else {
    await removeGIRole(guild, rec.targetId, "Registro pausado");
  }

  const member = await guild.members.fetch(rec.targetId);
const registrar = await guild.members.fetch(rec.registrarId);

const embed = registroEmbed({ rec, member, registrar });

const channel = await guild.channels.fetch(rec.channelId).catch(() => null);
if (!channel) return;

const msg = await channel.messages.fetch(messageId).catch(() => null);
if (!msg) return;

await msg.edit({
  embeds: [embed],
  components: [registroButtons(messageId, rec.active)]
});


} finally {
  SC_GI_STATE.actionLocks.delete(messageId);
}

}

export async function desligarRegistro(guild, messageId, author) {

  const rec = SC_GI_STATE.registros.get(messageId);
  if (!rec) return;

  const channel = await guild.channels.fetch(rec.channelId);
  const msg = await channel.messages.fetch(messageId).catch(() => null);

  await removeGIRole(guild, rec.targetId, "Desligado da gestão");

  if (msg) await msg.delete().catch(() => {});

rec.pausedAtMs = null;
rec.totalPausedMs = rec.totalPausedMs || 0;

SC_GI_STATE.registros.delete(messageId);
SC_GI_STATE.actionLocks.delete(messageId);
SC_GI_STATE.boardDirty = true;
scheduleSave();

addGIHistory(rec.targetId, {
  action: "Registro desligado",
  authorId: author.id
});


await notifyGI(guild.client, {
  title: "🗑️ Registro desligado",
  targetId: rec.targetId,
responsibleId: rec.responsibleUserId || null,
  description: `Área: ${rec.area}`,
  color: 0xe74c3c
});




}
