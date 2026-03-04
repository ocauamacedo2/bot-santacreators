// utils/cacheDiscord.js
export async function getChannel(client, id) {
  return client.channels.cache.get(id) ?? await client.channels.fetch(id);
}
export async function getGuild(client, id) {
  return client.guilds.cache.get(id) ?? await client.guilds.fetch(id);
}
export async function getRole(guild, id) {
  return guild.roles.cache.get(id) ?? await guild.roles.fetch(id);
}
export async function getMessage(channel, id) {
  return channel.messages.cache.get(id) ?? await channel.messages.fetch(id);
}
