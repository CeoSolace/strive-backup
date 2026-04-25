const { ApplicationCommandOptionType } = require("discord.js");
const state = require("../../security/roleChannelBackupState");

module.exports = {
  name: "backup",
  description: "Restore a server backup using a backup ID",
  category: "AUTOMOD",
  userPermissions: ["Administrator"],

  slashCommand: {
    enabled: true,
    options: [
      {
        name: "backup_id",
        description: "The backup ID shown in the storage server",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },

  async interactionRun(interaction) {
    const id = interaction.options.getString("backup_id");

    await interaction.deferReply({ flags: 64 });

    try {
      const result = await interaction.client.roleChannelBackup.restoreBackup(interaction.guild, id);

      return interaction.editReply(`Backup restored. Roles: ${result.roles}, Channels: ${result.channels}`);
    } catch (err) {
      return interaction.editReply(`Failed to restore backup: ${err.message}`);
    }
  },
};
