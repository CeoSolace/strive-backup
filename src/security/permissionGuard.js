const { AuditLogEvent, ChannelType, PermissionFlagsBits } = require("discord.js");

/**
 * PermissionGuard
 *
 * Real security layer:
 * - Watches role permission changes
 * - Detects dangerous permissions being added
 * - Instantly reverts the role back to its previous permissions
 * - Stores a short rollback record so admins can approve/undo the revert
 * - Splits logs into two private admin channels
 */
module.exports = function permissionGuard(client) {
  const config = {
    enabled: true,

    trustedUsers: [...(client.config?.OWNER_IDS || [])],
    containExecutor: true,

    channels: {
      blocks: "security-permission-blocks",
      actions: "security-permission-actions",
    },

    maxRollbackRecords: 50,

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
  const channelCache = new Map();
  const rollbackRecords = [];

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

  function trimRollbackRecords() {
    while (rollbackRecords.length > config.maxRollbackRecords) rollbackRecords.shift();
  }

  function getRollbackRecord(guildId, roleId) {
    const matching = rollbackRecords
      .filter((record) => record.guildId === guildId && (!roleId || record.roleId === roleId))
      .sort((a, b) => b.createdAt - a.createdAt);

    return matching[0] || null;
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

  async function getPrivateSecurityChannel(guild, channelName, introMessage) {
    const cacheKey = `${guild.id}:${channelName}`;
    const cachedId = channelCache.get(cacheKey);
    const cached = cachedId ? guild.channels.cache.get(cachedId) : null;
    if (cached?.isTextBased?.()) return cached;

    let channel = guild.channels.cache.find((ch) => ch.name === channelName && ch.isTextBased?.());
    if (channel) {
      channelCache.set(cacheKey, channel.id);
      return channel;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

    const adminRoles = guild.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.managed) return false;
      return role.permissions.has(PermissionFlagsBits.Administrator);
    });

    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
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

    if (channel && introMessage) {
      await channel.send({ content: introMessage }).catch(() => null);
    }

    return channel;
  }

  async function ensureChannels(guild) {
    const blocks = await getPrivateSecurityChannel(
      guild,
      config.channels.blocks,
      "**PermissionGuard Blocks enabled**\nThis private channel logs permission escalations that were blocked and reverted."
    );

    const actions = await getPrivateSecurityChannel(
      guild,
      config.channels.actions,
      "**PermissionGuard Actions enabled**\nThis private channel logs admin-approved undo/revert actions and containment results."
    );

    return { blocks, actions };
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

    return dangerousRoles.map((role) => ({ id: role.id, name: role.name }));
  }

  async function logBlock(oldRole, newRole, executor, addedPermissions, removedRoles, recordId) {
    const { blocks } = await ensureChannels(newRole.guild);
    if (!blocks) return;

    const permissionList = addedPermissions.map(formatPermission).map((p) => `\`${p}\``).join(", ");
    const removedRoleText = removedRoles.length ? removedRoles.map((r) => `\`${r.name}\``).join(", ") : "None";

    const content = [
      "**PermissionGuard Blocked Permission Escalation**",
      `Record ID: \`${recordId}\``,
      `Role: **${newRole.name}** (${newRole.id})`,
      `Executor: ${executor ? `**${executor.tag}** (${executor.id})` : "Unknown"}`,
      `Blocked permissions: ${permissionList}`,
      `Action taken: **Role permissions reverted instantly**`,
      `Executor roles removed: ${removedRoleText}`,
      "",
      `To approve this change anyway, run: \`,permissionguard revert ${newRole.id}\` or \`/permissionguard revert role:${newRole.name}\``,
      `Time: <t:${Math.floor(Date.now() / 1000)}:F>`,
    ].join("\n");

    await blocks.send({ content }).catch(() => null);
  }

  async function logAction(guild, content) {
    const { actions } = await ensureChannels(guild);
    if (actions) await actions.send({ content }).catch(() => null);
  }

  async function approveRevert(guild, roleId, moderator) {
    const record = getRollbackRecord(guild.id, roleId);
    if (!record) {
      return { ok: false, message: "No recent PermissionGuard revert record found for that role." };
    }

    if (record.approved) {
      return { ok: false, message: "That revert was already undone/approved." };
    }

    const role = await guild.roles.fetch(record.roleId).catch(() => null);
    if (!role) {
      return { ok: false, message: "The role from that revert record no longer exists." };
    }

    const cooldownKey = `${guild.id}:${role.id}`;
    revertCooldown.add(cooldownKey);

    try {
      await role.setPermissions(
        BigInt(record.blockedBitfield),
        `PermissionGuard revert approved by ${moderator?.tag || moderator?.id || "unknown admin"}`
      );

      record.approved = true;
      record.approvedBy = moderator?.id || null;
      record.approvedAt = Date.now();

      await logAction(
        guild,
        [
          "**PermissionGuard Revert Approved**",
          `Record ID: \`${record.id}\``,
          `Role: **${role.name}** (${role.id})`,
          `Approved by: ${moderator ? `**${moderator.tag}** (${moderator.id})` : "Unknown"}`,
          `Restored permissions: ${record.addedPermissions.map(formatPermission).map((p) => `\`${p}\``).join(", ")}`,
          `Time: <t:${Math.floor(Date.now() / 1000)}:F>`,
        ].join("\n")
      );

      return { ok: true, message: `PermissionGuard revert undone for ${role.name}. The blocked permissions were restored.` };
    } catch (err) {
      client.logger.error("PermissionGuard failed to approve revert", err);
      return { ok: false, message: "Failed to restore the blocked permissions. Check my role hierarchy and Manage Roles permission." };
    } finally {
      setTimeout(() => revertCooldown.delete(cooldownKey), 5_000);
    }
  }

  client.permissionGuard = {
    config,
    ensureChannels,
    getLastRevert(guildId, roleId) {
      const record = getRollbackRecord(guildId, roleId);
      if (!record) return null;
      return {
        id: record.id,
        guildId: record.guildId,
        roleId: record.roleId,
        roleName: record.roleName,
        executorId: record.executorId,
        executorTag: record.executorTag,
        addedPermissions: record.addedPermissions.map(formatPermission),
        removedRoles: record.removedRoles,
        createdAt: record.createdAt,
        approved: record.approved,
      };
    },
    approveRevert,
  };

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
      const recordId = `${Date.now().toString(36)}-${newRole.id.slice(-4)}`;

      rollbackRecords.push({
        id: recordId,
        guildId: newRole.guild.id,
        roleId: newRole.id,
        roleName: newRole.name,
        executorId: executor?.id || null,
        executorTag: executor?.tag || null,
        safeBitfield: oldRole.permissions.bitfield.toString(),
        blockedBitfield: newRole.permissions.bitfield.toString(),
        addedPermissions,
        removedRoles,
        createdAt: Date.now(),
        approved: false,
      });
      trimRollbackRecords();

      await logBlock(oldRole, newRole, executor, addedPermissions, removedRoles, recordId);

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
      await ensureChannels(guild).catch(() => null);
    }
  });

  client.on("guildCreate", async (guild) => {
    await ensureChannels(guild).catch(() => null);
  });

  client.logger.success("PermissionGuard loaded");
};
