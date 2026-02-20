const { EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "getinvite",
  description: "creates an invite for a server by ID",
  category: "OWNER",
  botPermissions: ["CreateInstantInvite", "EmbedLinks"],
  command: {
    enabled: true,
    usage: "<server-id>",
    minArgsCount: 1,
  },
  slashCommand: {
    enabled: false,
  },

  async messageRun(message, args) {
    const { client, channel } = message;
    const serverId = args[0];

    // Validate server ID
    if (!(/^\d{17,20}$/.test(serverId))) {
      return message.safeReply("Invalid server ID. Must be a numeric Discord server ID.");
    }

    const guild = client.guilds.cache.get(serverId);
    if (!guild) {
      return message.safeReply("I am not in a server with that ID.");
    }

    // Check if bot can create invite
    const me = guild.members.me;
    if (!me.permissions.has("CreateInstantInvite")) {
      return message.safeReply(`I don't have permission to create invites in **${guild.name}**.`);
    }

    try {
      // Get existing invites
      const invites = await guild.invites.fetch();
      let invite = invites.first();

      // If no existing invite, create one
      if (!invite) {
        const channelToUse = guild.channels.cache
          .filter(c => c.type === 0 && c.permissionsFor(me).has("CreateInstantInvite"))
          .sort((a, b) => a.position - b.position)
          .first();

        if (!channelToUse) {
          return message.safeReply(`No text channel found where I can create an invite in **${guild.name}**.`);
        }

        invite = await channelToUse.createInvite({
          maxAge: 0, // permanent
          maxUses: 0,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(client.config.EMBED_COLORS.SUCCESS)
        .setAuthor({ name: `Invite for ${guild.name}` })
        .setDescription(`[Click here to join](${invite.url})`)
        .addFields(
          { name: "Server ID", value: `\`${guild.id}\``, inline: true },
          { name: "Members", value: `\`${guild.memberCount}\``, inline: true }
        )
        .setThumbnail(guild.iconURL());

      await channel.send({ embeds: [embed] });
    } catch (err) {
      client.logger.error("getinvite", err);
      return message.safeReply(`Failed to create invite for **${guild.name}**: ${err.message}`);
    }
  },
};
