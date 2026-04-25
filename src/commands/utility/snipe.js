const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "snipe",
  description: "Show the last deleted message in this channel",
  category: "UTILITY",

  command: {
    enabled: true,
  },

  slashCommand: {
    enabled: true,
    options: [],
  },

  async messageRun(message) {
    const snipe = message.client.snipes?.get(message.channel.id);

    if (!snipe) {
      return message.safeReply("No recently deleted messages in this channel.");
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: snipe.authorTag,
        iconURL: snipe.authorAvatar || undefined,
      })
      .setDescription(snipe.content || "*No text content*")
      .setFooter({
        text: `Deleted ${Math.floor((Date.now() - snipe.deletedAt) / 1000)}s ago`,
      })
      .setTimestamp();

    if (snipe.attachments?.length) {
      embed.setImage(snipe.attachments[0].url);
    }

    return message.safeReply({ embeds: [embed] });
  },

  async interactionRun(interaction) {
    const snipe = interaction.client.snipes?.get(interaction.channel.id);

    if (!snipe) {
      return interaction.followUp("No recently deleted messages in this channel.");
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: snipe.authorTag,
        iconURL: snipe.authorAvatar || undefined,
      })
      .setDescription(snipe.content || "*No text content*")
      .setFooter({
        text: `Deleted ${Math.floor((Date.now() - snipe.deletedAt) / 1000)}s ago`,
      })
      .setTimestamp();

    if (snipe.attachments?.length) {
      embed.setImage(snipe.attachments[0].url);
    }

    return interaction.followUp({ embeds: [embed] });
  },
};
