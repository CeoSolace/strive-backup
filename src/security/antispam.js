const { Collection } = require("discord.js");

module.exports = (client) => {
  const messageCache = new Collection(); // userId => [timestamps of non-reply messages]
  const mentionCache = new Collection(); // userId => rolling mention count (non-reply only)

  const MAX_MESSAGES = 5;    // non-reply messages in 10 sec
  const MAX_MENTIONS = 8;    // non-reply mentions in 10 sec
  const WINDOW = 10_000;     // 10 seconds
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  // Clean caches every 10 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of messageCache.entries()) {
      const valid = timestamps.filter(t => now - t < WINDOW);
      if (valid.length === 0) messageCache.delete(userId);
      else messageCache.set(userId, valid);
    }
    for (const [userId, count] of mentionCache.entries()) {
      if (count <= 0) mentionCache.delete(userId);
    }
  }, 10_000);

  client.on("messageCreate", async (message) => {
    if (!message.guild || !message.content || message.author.bot) return;

    // Skip if it's a reply — those shouldn’t count as spammy
    if (message.reference) return;

    const userId = message.author.id;
    const now = Date.now();

    // === Message flood (non-reply only) ===
    if (!messageCache.has(userId)) messageCache.set(userId, []);
    messageCache.get(userId).push(now);

    const recentMessages = messageCache.get(userId).filter(t => now - t < WINDOW);
    if (recentMessages.length > MAX_MESSAGES) {
      await purgeAndPunish(message, "Sending too many messages too quickly");
      return;
    }

    // === Mention flood (non-reply only) ===
    const totalMentions = message.mentions.users.size + message.mentions.roles.size;
    if (totalMentions > 0) {
      // Only track if not a reply (already ensured above)
      const currentMentions = mentionCache.get(userId) || 0;
      const newCount = currentMentions + totalMentions;
      mentionCache.set(userId, newCount);

      // Reset after window implicitly via interval + threshold check
      if (newCount > MAX_MENTIONS) {
        await purgeAndPunish(message, "Excessive mentions in a short time");
        mentionCache.set(userId, 0); // reset to prevent repeated triggers
        return;
      }
    }
  });

  async function purgeAndPunish(message, reason) {
    try {
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = fetched.filter(m => m.author.id === message.author.id && !m.reference);
      const toDelete = userMessages.first(20);

      if (toDelete.size > 0) {
        if (toDelete.size >= 2) {
          await message.channel.bulkDelete(toDelete, true).catch(() => {});
        } else {
          await toDelete.first().delete().catch(() => {});
        }
      }

      if (message.member.moderatable) {
        await message.member.timeout(TIMEOUT_MS, reason).catch(() => {});
      }

      await message.author.send(
        `⚠️ **Action Taken in ${message.guild.name}**\n` +
        `Reason: ${reason}\n` +
        `• Your last ${toDelete.size} non-reply message(s) were deleted\n` +
        `• You’ve been timed out for 10 minutes\n\n` +
        `This helps keep the server clean. Repeated violations may lead to a ban.`
      ).catch(() => {});

      client.logger.warn(`[ANTISPAM] Purged ${toDelete.size} messages from ${message.author.tag} for ${reason}`);
    } catch (err) {
      client.logger.error("[ANTISPAM] Enforcement failed:", err);
    }
  }
};
