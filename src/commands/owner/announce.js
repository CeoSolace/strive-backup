module.exports = {
  name: "announce",
  aliases: ["ann"],
  description: "Send a global announcement to all servers",
  usage: ",announce <message>",
  category: "Owner", // MUST match folder name
  ownerOnly: true,

  async execute(client, message, args) {
    // Ensure message exists
    if (!message || !message.guild) return;

    // Ensure content
    if (!args.length) {
      return message.reply("❌ Please provide an announcement message.");
    }

    const announcement = args.join(" ");

    let sent = 0;
    let failed = 0;

    // Iterate all guilds
    for (const guild of client.guilds.cache.values()) {
      try {
        // Prefer system channel, fallback to first available text channel
        const channel =
          guild.systemChannel ||
          guild.channels.cache.find(
            (c) =>
              c.isTextBased() &&
              c
                .permissionsFor(guild.members.me)
                ?.has(["ViewChannel", "SendMessages"])
          );

        if (!channel) {
          failed++;
          continue;
        }

        await channel.send(
          `📢 **GLOBAL ANNOUNCEMENT**\n\n${announcement}`
        );

        sent++;
      } catch (err) {
        failed++;
      }
    }

    // Confirmation to command sender
    return message.reply(
      `✅ **Announcement Completed**\n\n📨 Sent: **${sent}**\n❌ Failed: **${failed}**`
    );
  },
};