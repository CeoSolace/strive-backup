module.exports = {
  name: "announce",
  aliases: ["ann"],
  description: "Send a global announcement to all servers",
  usage: ",announce <message>",
  category: "owner", // 🔥 MUST MATCH CATEGORY KEY
  ownerOnly: true,

  async execute(client, message, args) {
    if (!args.length) {
      return message.reply("❌ Please provide an announcement message.");
    }

    const announcement = args.join(" ");

    let sent = 0;
    let failed = 0;

    for (const guild of client.guilds.cache.values()) {
      try {
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

        await channel.send(`📢 **GLOBAL ANNOUNCEMENT**\n\n${announcement}`);
        sent++;
      } catch {
        failed++;
      }
    }

    return message.reply(
      `✅ Announcement completed\n\n📨 Sent: **${sent}**\n❌ Failed: **${failed}**`
    );
  },
};