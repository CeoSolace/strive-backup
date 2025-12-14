module.exports = {
  name: "announce",
  aliases: ["ann"],
  description: "Send a global announcement to all servers",
  usage: ",announce <message>",
  category: "Admin",
  ownerOnly: true,

  async execute(client, message, args) {
    if (!args.length) {
      return message.reply("❌ Please provide an announcement message.");
    }

    const content = args.join(" ");

    let success = 0;
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

        if (!channel) continue;

        await channel.send({
          content: `📢 **GLOBAL ANNOUNCEMENT**\n\n${content}`,
        });

        success++;
      } catch {
        failed++;
      }
    }

    return message.reply(
      `✅ Announcement completed\n\n📨 Sent: **${success}**\n❌ Failed: **${failed}**`
    );
  },
};