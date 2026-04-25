const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "powersecurity",
  description: "View real-time anti-nuke intelligence logs and threat data",
  category: "AUTOMOD",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    usage: "<logs|status|user> [userId]",
    minArgsCount: 1,
  },

  slashCommand: {
    enabled: true,
    options: [
      {
        name: "logs",
        description: "View recent security logs",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "status",
        description: "View current threat status",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "user",
        description: "View a specific user's threat profile",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "userid",
            description: "User ID",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
    ],
  },

  async messageRun(message, args) {
    const ps = message.client.powerSecurity;
    if (!ps) return message.safeReply("PowerSecurity not loaded");

    const sub = args[0];

    if (sub === "logs") {
      const logs = ps.getRecentLogs(message.guild.id, 10);
      if (!logs.length) return message.safeReply("No recent security activity");

      const desc = logs
        .map(l => `**${l.userTag}** • ${l.actionType} (+${l.weight}) → ${l.threatLevel}`)
        .join("\n");

      return message.safeReply({ embeds: [new EmbedBuilder().setTitle("PowerSecurity Logs").setDescription(desc)] });
    }

    if (sub === "status") {
      const status = ps.getStatus(message.guild.id);

      const desc = status.activeThreats
        .slice(0, 5)
        .map(u => `**${u.userTag || u.userId}** • ${u.score} (${u.threatLevel})`)
        .join("\n") || "No active threats";

      return message.safeReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("PowerSecurity Status")
            .setDescription(desc)
            .addFields(
              { name: "Stored Actions", value: String(status.storedActions), inline: true },
              { name: "Window", value: `${status.windowSeconds}s`, inline: true }
            ),
        ],
      });
    }

    if (sub === "user") {
      const userId = args[1];
      if (!userId) return message.safeReply("Provide a user ID");

      const data = ps.getUser(message.guild.id, userId);

      const desc = data.logs
        .map(l => `${l.actionType} (+${l.weight}) → ${l.threatLevel}`)
        .join("\n") || "No recent actions";

      return message.safeReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`User Threat: ${data.userTag}`)
            .addFields(
              { name: "Score", value: String(data.score), inline: true },
              { name: "Threat", value: data.threatLevel, inline: true }
            )
            .setDescription(desc),
        ],
      });
    }
  },

  async interactionRun(interaction) {
    const ps = interaction.client.powerSecurity;
    if (!ps) return interaction.followUp("PowerSecurity not loaded");

    const sub = interaction.options.getSubcommand();

    if (sub === "logs") {
      const logs = ps.getRecentLogs(interaction.guild.id, 10);

      const desc = logs
        .map(l => `**${l.userTag}** • ${l.actionType} (+${l.weight}) → ${l.threatLevel}`)
        .join("\n") || "No recent activity";

      return interaction.followUp({ embeds: [new EmbedBuilder().setTitle("PowerSecurity Logs").setDescription(desc)] });
    }

    if (sub === "status") {
      const status = ps.getStatus(interaction.guild.id);

      const desc = status.activeThreats
        .slice(0, 5)
        .map(u => `**${u.userTag || u.userId}** • ${u.score} (${u.threatLevel})`)
        .join("\n") || "No active threats";

      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle("PowerSecurity Status")
            .setDescription(desc),
        ],
      });
    }

    if (sub === "user") {
      const userId = interaction.options.getString("userid");
      const data = ps.getUser(interaction.guild.id, userId);

      const desc = data.logs
        .map(l => `${l.actionType} (+${l.weight}) → ${l.threatLevel}`)
        .join("\n") || "No recent actions";

      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle(`User Threat: ${data.userTag}`)
            .setDescription(desc),
        ],
      });
    }
  },
};
