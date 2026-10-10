import { randomUUID } from 'node:crypto';

export function createTeamRequestSiteInteraction({
  guild,
  member,
  message,
  customId,
}) {
  return {
    siteOrigin: true,

    id: `site-team-${randomUUID()}`,

    guild,
    guildId: guild.id,

    channel: message.channel,
    channelId: message.channelId,

    user: member.user,
    member,
    message,
    customId,

    deferred: false,
    replied: false,
    replyKind: null,
    lastReply: null,

    isButton() {
      return true;
    },

    isModalSubmit() {
      return false;
    },

    isStringSelectMenu() {
      return false;
    },

    isChatInputCommand() {
      return false;
    },

    isRepliable() {
      return true;
    },

    async deferReply() {
      this.deferred = true;
      this.replyKind = 'reply';
    },

    async deferUpdate() {
      this.deferred = true;
      this.replyKind = 'update';
    },

    async reply(payload) {
      this.replied = true;
      this.lastReply = payload;

      return payload;
    },

    async followUp(payload) {
      this.lastReply = payload;

      return payload;
    },

    async editReply(payload) {
      this.lastReply = payload;

      if (this.replyKind === 'update') {
        const edit = {};

        for (const key of [
          'content',
          'embeds',
          'components',
          'attachments',
        ]) {
          if (Object.hasOwn(payload, key)) {
            edit[key] = payload[key];
          }
        }

        if (Object.keys(edit).length) {
          await message.edit(edit);
        }
      }

      return payload;
    },

    async update(payload) {
      await message.edit(payload);

      this.replied = true;
      this.replyKind = 'update';

      return payload;
    },
  };
}