const { ApplicationCommandOptionType } = require("discord.js");
const state = require("../../security/roleChannelBackupState");

module.exports = {
  name: "backup",
  description: "Manage server backups",
  category: "AUTOMOD",
  userPermissions: ["Administrator"],

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "setup",
        description: "Set the external backup storage channel",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "channel_id",
            description: "Channel ID in backup server",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
      {
        name: "save",
        description: "Manually create a safe backup",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "load",
        description: "Restore a backup",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "backup_id",
            description: "Backup ID from storage server",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
    ],
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "setup") {
        const channelId = interaction.options.getString("channel_id");

        state.set(interaction.guild.id, {
          enabled: true,
          storageChannelId: channelId,
        });

        return interaction.editReply("Backup storage channel configured successfully.");
      }

      if (sub === "save") {
        const snapshot = await interaction.client.roleChannelBackup.createSnapshot(interaction.guild);

        if (!snapshot) return interaction.editReply("Backup system not configured. Run /backup setup first.");

        return interaction.editReply(`Backup created successfully. ID: ${snapshot.id}`);
      }

      if (sub === "load") {
        const id = interaction.options.getString("backup_id");

        const result = await interaction.client.roleChannelBackup.restoreBackup(interaction.guild, id);

        return interaction.editReply(`Backup restored. Roles: ${result.roles}, Channels: ${result.channels}`);
      }
    } catch (err) {
      return interaction.editReply(`Error: ${err.message}`);
    }
  },
};
