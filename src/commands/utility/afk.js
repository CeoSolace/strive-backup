const { ApplicationCommandOptionType } = require("discord.js");
const Afk = require("@helpers/AfkManager");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "afk",
  description: "set yourself AFK with an optional reason (auto warns pingers + changes nickname)",
  cooldown: 10,
  category: "UTILITY",
  botPermissions: ["EmbedLinks", "ManageNicknames"],
  command: {
    enabled: true,
    aliases: ["away"],
    usage: "[reason]",
    minArgsCount: 0,
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "reason",
        description: "why you're AFK (shown to people who ping you)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },

  async messageRun(message, args) {
    const reason = args.join(" ").trim() || "Away right now";
    const { response } = await Afk.setAfk(message.member, reason);
    return message.safeReply(response);
  },

  async interactionRun(interaction) {
    const reason = (interaction.options.getString("reason") || "").trim() || "Away right now";
    const { response } = await Afk.setAfk(interaction.member, reason);
    return interaction.followUp(response);
  },
};
