const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const state = require("../../security/guardState");

module.exports = {
  name: "securitymode",
  description: "Temporarily disable or enable security systems for this server",
  category: "AUTOMOD",
  userPermissions: ["Administrator"],

  command: {
    enabled: true,
    usage: "<pause|resume|status> [minutes]",
    minArgsCount: 1,
  },

  slashCommand: {
    enabled: true,
    options: [
      { name: "pause", type: 1, description: "Pause security for this server", options: [
        { name: "minutes", type: ApplicationCommandOptionType.Integer, required: false },
        { name: "reason", type: ApplicationCommandOptionType.String, required: false }
      ]},
      { name: "resume", type: 1, description: "Resume security" },
      { name: "status", type: 1, description: "Check security status" },
    ],
  },

  async messageRun(message, args) {
    const sub = args[0];

    if (sub === "pause") {
      const minutes = Number(args[1]) || null;

      state.pause(message.guild.id, {
        createdAt: Date.now(),
        expiresAt: minutes ? Date.now() + minutes * 60000 : null,
      });

      return message.safeReply(`Security paused${minutes ? ` for ${minutes} minutes` : ""}.`);
    }

    if (sub === "resume") {
      state.resume(message.guild.id);
      return message.safeReply("Security resumed.");
    }

    if (sub === "status") {
      const pause = state.getPause(message.guild.id);
      return message.safeReply(pause ? "Security is currently paused." : "Security is active.");
    }
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "pause") {
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No reason";

      state.pause(interaction.guild.id, {
        createdAt: Date.now(),
        expiresAt: minutes ? Date.now() + minutes * 60000 : null,
        reason,
      });

      return interaction.reply({ content: `Security paused${minutes ? ` for ${minutes} minutes` : ""}.`, flags: 64 });
    }

    if (sub === "resume") {
      state.resume(interaction.guild.id);
      return interaction.reply({ content: "Security resumed.", flags: 64 });
    }

    if (sub === "status") {
      const pause = state.getPause(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("Security Status")
        .setDescription(pause ? "Security is paused" : "Security is active")
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
