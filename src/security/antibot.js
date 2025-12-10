const { Collection } = require("discord.js");

module.exports = (client) => {
  // In-memory whitelist: { userId: expireTimestamp }
  const whitelist = new Collection();

  // Auto-prune expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [userId, expireAt] of whitelist.entries()) {
      if (now > expireAt) whitelist.delete(userId);
    }
  }, 300_000);

  // Command: -whitelist (only guild owner)
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith("-whitelist")) return;

    if (message.author.id !== message.guild.ownerId) {
      await message.reply("Only the server owner can whitelist users to add bots.");
      return;
    }

    const targetId = message.content.trim().split(" ")[1];
    if (!targetId || !(/^\d{17,20}$/.test(targetId))) {
      await message.reply("Usage: `-whitelist <user-id>`");
      return;
    }

    whitelist.set(targetId, Date.now() + 3600_000); // +1 hour
    await message.reply(`✅ <@${targetId}> can add bots for the next hour.`);
  });

  // Block bot joins
  client.on("guildMemberAdd", async (member) => {
    if (!member.user.bot) return;

    const guildOwner = member.guild.ownerId;
    const inviter = await getInviter(member.guild, member);

    // Allow if inviter is guild owner
    if (inviter?.id === guildOwner) return;

    // Allow if inviter is whitelisted (and entry not expired)
    if (inviter && whitelist.has(inviter.id)) {
      const expireAt = whitelist.get(inviter.id);
      if (Date.now() < expireAt) return;
      whitelist.delete(inviter.id); // auto-clean expired
    }

    // Kick unauthorized bot
    await member.kick("Unauthorized bot addition").catch(() => {});
    client.logger.warn(`[ANTIBOT] Kicked bot ${member.user.tag} added by ${inviter?.tag || 'unknown'}`);

    // Try to DM inviter
    if (inviter && !inviter.bot) {
      inviter.send(
        `⚠️ The bot **${member.user.tag}** you tried to add to **${member.guild.name}** was rejected.\n` +
        `Only the server owner or a temporarily whitelisted user can add bots.`
      ).catch(() => {});
    }
  });
};

// Helper: get who invited the member (approximate)
async function getInviter(guild, member) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 28 }); // BOT_ADD
    const entry = auditLogs.entries.first();
    if (entry && entry.target.id === member.id && Date.now() - entry.createdTimestamp < 10_000) {
      return entry.executor;
    }
  } catch {}
  return null;
}
