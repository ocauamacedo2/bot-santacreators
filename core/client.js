import { Client, GatewayIntentBits, Partials } from "discord.js";

// =====================================================
// Client Singleton (Garante apenas uma instância)
// =====================================================

if (!globalThis.__SC_CLIENT__) {
  globalThis.__SC_CLIENT__ = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel, Partials.Reaction],
    allowedMentions: { parse: [], repliedUser: false },
  });
}

export const client = globalThis.__SC_CLIENT__;

// Compatibilidade para módulos que buscam no global
globalThis.client = client;