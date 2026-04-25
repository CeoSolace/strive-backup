const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const state = require("../../security/guardState");

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

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
    ephemeral: true,
    options: [
      {
        name: "pause",
        type: ApplicationCommandOptionType.Subcommand,
        description: "Pause security enforcement for this server only",
        options: [
          {
            name: "minutes",
            description: "Optional number of minutes before security automatically resumes",
            type: ApplicationCommandOptionType.Integer,
            required: false,
          },
          {
            name: "reason",
            description: "Reason for pausing security in this server",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: "resume",
        type: ApplicationCommandOptionType.Subcommand,
        description: "Resume security enforcement for this server",
      },
      {
        name: "status",
        type: ApplicationCommandOptionType.Subcommand,
        description: "Check whether security is active or paused in this server",
      },
    ],
  },

  async messageRun(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === "pause") {
      const minutes = Number(args[1]) || null;
      const reason = args.slice(minutes ? 2 : 1).join(" ") || "No reason provided";

      state.pause(message.guild.id, {
        createdAt: Date.now(),
        expiresAt: minutes ? Date.now() + minutes * 60000 : null,
        reason,
      });

      return message.safeReply(`Security paused for this server${minutes ? ` for ${minutes} minutes` : ""}.`);
    }

    if (sub === "resume") {
      state.resume(message.guild.id);
      return message.safeReply("Security resumed for this server.");
    }

    if (sub === "status") {
      const pause = state.getPause(message.guild.id);
      return message.safeReply(pause ? "Security is currently paused for this server." : "Security is active for this server.");
    }

    return message.safeReply("Use `pause`, `resume`, or `status`.");
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "pause") {
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No reason provided";

      state.pause(interaction.guild.id, {
        createdAt: Date.now(),
        expiresAt: minutes ? Date.now() + minutes * 60000 : null,
        reason,
      });

      return respond(interaction, {
        content: `Security paused for this server${minutes ? ` for ${minutes} minutes` : ""}.`,
      });
    }

    if (sub === "resume") {
      state.resume(interaction.guild.id);
      return respond(interaction, { content: "Security resumed for this server." });
    }

    if (sub === "status") {
      const pause = state.getPause(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle("Security Status")
        .setDescription(pause ? "Security is paused for this server." : "Security is active for this server.")
        .setTimestamp();

      if (pause?.expiresAt) {
        embed.addFields({ name: "Auto-resumes", value: `<t:${Math.floor(pause.expiresAt / 1000)}:R>` });
      }

      if (pause?.reason) {
        embed.addFields({ name: "Reason", value: pause.reason });
      }

      return respond(interaction, { embeds: [embed] });
    }
  },
};
