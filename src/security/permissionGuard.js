const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");

/**
 * PermissionGuard
 *
 * First real security layer:
 * - Watches role permission changes
 * - Detects dangerous permissions being added
 * - Instantly reverts the role back to its previous permissions
 * - Optionally removes dangerous roles from the executor
 *
 * This is prevention-first, not log-first.
 */
module.exports = function permissionGuard(client) {
  const config = {
    enabled: true,

    // Users that can change dangerous permissions without being reverted
    trustedUsers: [...(client.config?.OWNER_IDS || [])],

    // If true, removes dangerous roles from the person who made the change
    containExecutor: true,

    // Permissions that should never be added without trust
    protectedPermissions: [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ModerateMembers,
    ],
  };

  if (!config.enabled) return;

  const revertCooldown = new Set();

  function isTrusted(userId) {
    return config.trustedUsers.includes(userId);
  }

  function getAddedProtectedPermissions(oldRole, newRole) {
    return config.protectedPermissions.filter((permission) => {
      return !oldRole.permissions.has(permission) && newRole.permissions.has(permission);
    });
  }

  function formatPermission(permission) {
    return Object.entries(PermissionFlagsBits).find(([, value]) => value === permission)?.[0] || String(permission);
  }

  async function getExecutor(guild, roleId) {
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 5 });
      const entry = logs.entries.find((log) => {
        const sameRole = log.target?.id === roleId;
        const fresh = Date.now() - log.createdTimestamp < 7_500;
        return sameRole && fresh;
      });

      return entry?.executor || null;
    } catch {
      return null;
    }
  }

  async function getPrivateSecurityChannel(guild) {
    const channelName = "security-permissions";
    let channel = guild.channels.cache.find((ch) => ch.name === channelName && ch.isTextBased?.());
    if (channel) return channel;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

    const adminRoles = guild.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.managed) return false;
      return role.permissions.has(PermissionFlagsBits.Administrator);
    });

    channel = await guild.channels.create({
      name: channelName,
      reason: "PermissionGuard private security channel",
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        ...adminRoles.map((role) => ({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
    }).catch(() => null);

    if (channel) {
      await channel.send({
        content: "**PermissionGuard enabled**\nThis private channel logs dangerous permission changes that were automatically reverted.",
      }).catch(() => null);
    }

    return channel;
  }

  async function removeExecutorDangerousRoles(guild, executor) {
    if (!config.containExecutor || !executor) return [];

    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member || !member.manageable) return [];

    const dangerousRoles = member.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.managed) return false;
      if (!role.editable) return false;
      return config.protectedPermissions.some((permission) => role.permissions.has(permission));
    });

    if (!dangerousRoles.size) return [];

    await member.roles.remove(
      dangerousRoles,
      "PermissionGuard containment: attempted dangerous permission escalation"
    ).catch(() => null);

    return dangerousRoles.map((role) => role.name);
  }

  async function logRevert(oldRole, newRole, executor, addedPermissions, removedRoles) {
    const channel = await getPrivateSecurityChannel(newRole.guild);
    if (!channel) return;

    const permissionList = addedPermissions.map(formatPermission).map((p) => `\`${p}\``).join(", ");
    const removedRoleText = removedRoles.length ? removedRoles.map((r) => `\`${r}\``).join(", ") : "None";

    const content = [
      "**PermissionGuard Blocked Permission Escalation**",
      `Role: **${newRole.name}** (${newRole.id})`,
      `Executor: ${executor ? `**${executor.tag}** (${executor.id})` : "Unknown"}`,
      `Blocked permissions: ${permissionList}`,
      `Action taken: **Role permissions reverted instantly**`,
      `Executor roles removed: ${removedRoleText}`,
      `Time: <t:${Math.floor(Date.now() / 1000)}:F>`,
    ].join("\n");

    await channel.send({ content }).catch(() => null);
  }

  client.on("roleUpdate", async (oldRole, newRole) => {
    if (!oldRole.guild || oldRole.managed || newRole.managed) return;

    const addedPermissions = getAddedProtectedPermissions(oldRole, newRole);
    if (!addedPermissions.length) return;

    const cooldownKey = `${newRole.guild.id}:${newRole.id}`;
    if (revertCooldown.has(cooldownKey)) return;

    const executor = await getExecutor(newRole.guild, newRole.id);
    if (executor?.bot || isTrusted(executor?.id)) return;

    revertCooldown.add(cooldownKey);

    try {
      await newRole.setPermissions(
        oldRole.permissions.bitfield,
        "PermissionGuard: reverted dangerous permission escalation"
      );

      const removedRoles = await removeExecutorDangerousRoles(newRole.guild, executor);
      await logRevert(oldRole, newRole, executor, addedPermissions, removedRoles);

      client.logger.warn(
        `[PermissionGuard] Reverted dangerous permission change on role ${newRole.name} in ${newRole.guild.name}`
      );
    } catch (err) {
      client.logger.error("PermissionGuard failed to revert role permissions", err);
    } finally {
      setTimeout(() => revertCooldown.delete(cooldownKey), 5_000);
    }
  });

  client.once("ready", async () => {
    for (const guild of client.guilds.cache.values()) {
      await getPrivateSecurityChannel(guild).catch(() => null);
    }
  });

  client.on("guildCreate", async (guild) => {
    await getPrivateSecurityChannel(guild).catch(() => null);
  });

  client.logger.success("PermissionGuard loaded");
};
