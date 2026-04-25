const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "permissionguard",
  description: "Manage PermissionGuard reverts and approvals",
  category: "AUTOMOD",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    usage: "<revert> [roleId]",
    minArgsCount: 1,
  },

  slashCommand: {
    enabled: true,
    options: [
      {
        name: "revert",
        description: "Approve and undo a PermissionGuard revert",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "role",
            description: "Role to restore permissions for",
            type: ApplicationCommandOptionType.Role,
            required: false,
          },
        ],
      },
    ],
  },

  async messageRun(message, args) {
    const pg = message.client.permissionGuard;
    if (!pg) return message.safeReply("PermissionGuard not loaded");

    if (args[0] === "revert") {
      const roleId = args[1];

      const res = await pg.approveRevert(message.guild, roleId, message.author);
      return message.safeReply(res.message);
    }
  },

  async interactionRun(interaction) {
    const pg = interaction.client.permissionGuard;
    if (!pg) return interaction.followUp("PermissionGuard not loaded");

    const sub = interaction.options.getSubcommand();

    if (sub === "revert") {
      const role = interaction.options.getRole("role");

      const res = await pg.approveRevert(interaction.guild, role?.id, interaction.user);

      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle(res.ok ? "Revert Approved" : "Revert Failed")
            .setDescription(res.message),
        ],
      });
    }
  },
};
