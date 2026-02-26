const { PermissionsBitField } = require("discord.js");

const DISCORD_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|com|me|io|li|link)|discordapp\.com)(?:\/\S*)?/i;

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    // Ignore DMs and empty messages
    if (!message.guild || !message.content) return;

    // Allow your own bot unconditionally
    if (message.author.id === client.user.id) return;

    // Block ANY other bot — no exceptions
    if (message.author.bot) {
      if (DISCORD_LINK_REGEX.test(message.content)) {
        await message.delete().catch(() => {});
        client.logger.warn(
          `[ANTIBRIGHTDISCORD] Deleted Discord link from bot: ${message.author.tag} (${message.author.id})`
        );
      }
      return; // Bots can't get DMs or timeouts, and are never exempt beyond your bot
    }

    // Now handle regular users
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (DISCORD_LINK_REGEX.test(message.content)) {
      try {
        await message.delete().catch(() => {});

        if (message.member.moderatable) {
          await message.member
            .timeout(10 * 60 * 1000, "Posted Discord invite link")
            .catch(() => {});
        }

        await message.author
          .send(
            `⚠️ **Link Removed**\n` +
              `You sent a Discord invite link in **${message.guild.name}**, which is not allowed.\n` +
              `Your message was deleted and you've been timed out for 10 minutes.\n` +
              `If this was a mistake, contact a server moderator.`
          )
          .catch(() => {});

        client.logger.warn(
          `[ANTIBRIGHTDISCORD] Removed Discord link from ${message.author.tag} (${message.author.id}) in #${message.channel.name} (${message.guild.name})`
        );
      } catch (err) {
        client.logger.error("[ANTIBRIGHTDISCORD] Enforcement failed:", err);
      }
    }
  });
};
