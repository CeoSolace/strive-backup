// src/commands/information/announce.js
const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  name: "announce",
  aliases: ["ann"],
  description: "Send a global announcement to all servers",
  usage: ",announce <message>",
  category: "INFORMATION",
  ownerOnly: true,

  async execute(client, message, args) {
    if (!args.length) {
      return message.reply("❌ Please provide an announcement message.");
    }

    const announcement = args.join(" ");
    let sent = 0;
    let failed = 0;

    const embed = new EmbedBuilder()
      .setTitle("Bright Announcements")
      .setDescription(announcement)
      .setTimestamp(Date.now());

    for (const guild of client.guilds.cache.values()) {
      try {
        const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        if (!me) {
          failed++;
          continue;
        }

        // Prefer system channel if usable
        let channel =
          guild.systemChannel &&
          (guild.systemChannel.type === ChannelType.GuildText ||
            guild.systemChannel.type === ChannelType.GuildAnnouncement) &&
          guild.systemChannel
            .permissionsFor(me)
            ?.has([
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
            ])
            ? guild.systemChannel
            : null;

        // Otherwise find first usable text/announcement channel
        if (!channel) {
          channel = guild.channels.cache.find((c) => {
            if (
              c.type !== ChannelType.GuildText &&
              c.type !== ChannelType.GuildAnnouncement
            )
              return false;

            const perms = c.permissionsFor(me);
            if (!perms) return false;

            return perms.has([
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
            ]);
          });
        }

        if (!channel) {
          failed++;
          continue;
        }

        // Only ping @everyone if this channel allows it
        const perms = channel.permissionsFor(me);
        const canEveryone = perms?.has(PermissionsBitField.Flags.MentionEveryone);

        await channel.send({
          content: canEveryone ? "@everyone" : undefined,
          embeds: [embed],
          allowedMentions: canEveryone ? { parse: ["everyone"] } : { parse: [] },
        });

        sent++;

        // Small delay to be nicer to rate limits (adjust if you have tons of guilds)
        await sleep(700);
      } catch {
        failed++;
      }
    }

    return message.reply(
      `✅ Announcement completed\n\n📨 Sent: **${sent}**\n❌ Failed: **${failed}**`
    );
  },
};
