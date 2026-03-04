import { PermissionsBitField } from "discord.js";

export async function guessTicketOpenerByOverwrites(channel) {
  try {
    if (!channel?.permissionOverwrites) return null;
    const guild = channel.guild;
    if (!guild) return null;

    const overwrites = channel.permissionOverwrites.cache;
    const memberOverwrites = overwrites.filter(ow => ow.type === 1); // 1 = MEMBER

    if (!memberOverwrites.size) return null;

    const candidates = [];
    for (const ow of memberOverwrites.values()) {
      const allowsView =
        ow.allow?.has(PermissionsBitField.Flags.ViewChannel) ||
        ow.allow?.has(PermissionsBitField.Flags.ReadMessageHistory) ||
        ow.allow?.has(PermissionsBitField.Flags.SendMessages);

      if (!allowsView) continue;

      let member = guild.members.cache.get(ow.id);
      if (!member) member = await guild.members.fetch(ow.id).catch(() => null);
      if (!member) continue;

      if (member.user?.bot) continue;
      if (member.id === guild.ownerId) continue;

      candidates.push(member);
    }

    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

export function looksLikeTicket(channel, ticketNameHints = []) {
  const name = (channel?.name || "").toLowerCase();
  if (!name) return false;

  if (name.includes("ticket")) return true;

  if (Array.isArray(ticketNameHints) && ticketNameHints.length) {
    return ticketNameHints.some(h => name.includes(String(h).toLowerCase()));
  }

  return false;
}
