const { EmbedBuilder } = require("discord.js");

async function sendInteractionResponse(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function buildSnipeEmbed(snipe) {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: snipe.authorTag || "Unknown User",
      iconURL: snipe.authorAvatar || undefined,
    })
    .setDescription(snipe.content || "*No text content*")
    .setFooter({
      text: `Deleted ${Math.floor((Date.now() - snipe.deletedAt) / 1000)}s ago`,
    })
    .setTimestamp(snipe.deletedAt || Date.now());

  if (snipe.attachments?.length) {
    embed.setImage(snipe.attachments[0].url);
  }

  return embed;
}

module.exports = {
  name: "snipe",
  description: "Show the last deleted message in this channel",
  category: "UTILITY",

  command: {
    enabled: true,
  },

  slashCommand: {
    enabled: true,
    ephemeral: false,
    options: [],
  },

  async messageRun(message) {
    const snipe = message.client.snipes?.get(message.channel.id);

    if (!snipe) {
      return message.safeReply("No recently deleted messages in this channel.");
    }

    return message.safeReply({ embeds: [buildSnipeEmbed(snipe)] });
  },

  async interactionRun(interaction) {
    const snipe = interaction.client.snipes?.get(interaction.channel.id);

    if (!snipe) {
      return sendInteractionResponse(interaction, {
        content: "No recently deleted messages in this channel.",
      });
    }

    return sendInteractionResponse(interaction, {
      embeds: [buildSnipeEmbed(snipe)],
    });
  },
};
