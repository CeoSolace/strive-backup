const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");

/**
 * PowerSecurity
 * Real-time anti-nuke intelligence layer.
 *
 * This module does two jobs:
 * 1. Scores dangerous server actions in a rolling time window.
 * 2. Exposes readable security logs to commands through client.powerSecurity.
 */
module.exports = function powerSecurity(client) {
  const config = {
    enabled: true,
    windowMs: 30_000,
    maxStoredActions: 250,

    warnScore: 35,
    containScore: 70,
    criticalScore: 110,

    autoContain: true,
    autoBanCritical: false,

    trustedUsers: [...(client.config?.OWNER_IDS || [])],

    weights: {
      CHANNEL_DELETE: 30,
      CHANNEL_CREATE: 12,
      ROLE_DELETE: 35,
      ROLE_CREATE: 18,
      ROLE_UPDATE_DANGEROUS: 45,
      MEMBER_BAN_ADD: 30,
      MEMBER_KICK: 25,
      WEBHOOK_CREATE: 25,
      BOT_ADD: 50,
    },
  };

  if (!config.enabled) return;

  const userScores = new Map();
  const recentActions = [];

  function now() {
    return Date.now();
  }

  function cleanOldScores() {
    const cutoff = now() - config.windowMs;

    for (const [userId, data] of userScores.entries()) {
      data.actions = data.actions.filter((action) => action.createdAt >= cutoff);
      data.score = data.actions.reduce((total, action) => total + action.weight, 0);
      if (data.actions.length === 0) userScores.delete(userId);
    }
  }

  function trimStoredActions() {
    while (recentActions.length > config.maxStoredActions) recentActions.shift();
  }

  async function getExecutor(guild, type, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 5 });
      const entry = logs.entries.find((log) => {
        const sameTarget = !targetId || log.target?.id === targetId;
        const fresh = now() - log.createdTimestamp < 7_500;
        return sameTarget && fresh;
      });

      return entry?.executor || null;
    } catch {
      return null;
    }
  }

  function isTrusted(userId) {
    return config.trustedUsers.includes(userId);
  }

  function getThreatLevel(score) {
    if (score >= config.criticalScore) return "CRITICAL";
    if (score >= config.containScore) return "HIGH";
    if (score >= config.warnScore) return "MEDIUM";
    return "LOW";
  }

  function getPublicAction(action) {
    return {
      guildId: action.guildId,
      userId: action.userId,
      userTag: action.userTag,
      actionType: action.actionType,
      weight: action.weight,
      scoreAfter: action.scoreAfter,
      threatLevel: action.threatLevel,
      metadata: action.metadata,
      createdAt: action.createdAt,
    };
  }

  client.powerSecurity = {
    config,

    getStatus(guildId) {
      cleanOldScores();

      const activeThreats = [...userScores.entries()]
        .map(([userId, data]) => ({
          userId,
          userTag: data.userTag,
          score: data.score,
          threatLevel: getThreatLevel(data.score),
          actionCount: data.actions.length,
          lastActionAt: data.actions.at(-1)?.createdAt || null,
        }))
        .filter((entry) => !guildId || dataBelongsToGuild(entry.userId, guildId))
        .sort((a, b) => b.score - a.score);

      return {
        enabled: config.enabled,
        windowSeconds: Math.round(config.windowMs / 1000),
        warnScore: config.warnScore,
        containScore: config.containScore,
        criticalScore: config.criticalScore,
        autoContain: config.autoContain,
        autoBanCritical: config.autoBanCritical,
        storedActions: recentActions.filter((action) => !guildId || action.guildId === guildId).length,
        activeThreats,
      };
    },

    getRecentLogs(guildId, limit = 10) {
      cleanOldScores();
      return recentActions
        .filter((action) => !guildId || action.guildId === guildId)
        .slice(-limit)
        .reverse()
        .map(getPublicAction);
    },

    getUser(guildId, userId) {
      cleanOldScores();
      const data = userScores.get(userId);
      const userLogs = recentActions
        .filter((action) => action.userId === userId && (!guildId || action.guildId === guildId))
        .slice(-10)
        .reverse()
        .map(getPublicAction);

      return {
        userId,
        userTag: data?.userTag || userLogs[0]?.userTag || "Unknown user",
        score: data?.score || 0,
        threatLevel: getThreatLevel(data?.score || 0),
        activeActions: data?.actions?.length || 0,
        logs: userLogs,
      };
    },
  };

  function dataBelongsToGuild(userId, guildId) {
    return recentActions.some((action) => action.userId === userId && action.guildId === guildId);
  }

  async function scoreAction(guild, executor, actionType, weight, metadata = {}) {
    if (!executor || executor.bot || isTrusted(executor.id)) return;

    cleanOldScores();

    const current = userScores.get(executor.id) || {
      score: 0,
      userTag: executor.tag,
      actions: [],
    };

    const action = {
      guildId: guild.id,
      userId: executor.id,
      userTag: executor.tag,
      actionType,
      weight,
      metadata,
      createdAt: now(),
    };

    current.actions.push(action);
    current.score += weight;
    current.userTag = executor.tag;

    action.scoreAfter = current.score;
    action.threatLevel = getThreatLevel(current.score);

    userScores.set(executor.id, current);
    recentActions.push(action);
    trimStoredActions();

    client.logger.warn(
      `[PowerSecurity] ${guild.name}: ${executor.tag} scored ${weight} for ${actionType}. Total: ${current.score} (${action.threatLevel})`
    );

    if (current.score >= config.criticalScore) {
      await handleCritical(guild, executor, current);
    } else if (current.score >= config.containScore) {
      await containUser(guild, executor, current, "CONTAIN");
    } else if (current.score >= config.warnScore) {
      await notifyGuild(guild, executor, current, "WARN");
    }
  }

  async function containUser(guild, executor, data, mode = "CONTAIN") {
    if (!config.autoContain) return notifyGuild(guild, executor, data, mode);

    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member || !member.manageable) return notifyGuild(guild, executor, data, mode);

    const removableRoles = member.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.managed) return false;
      if (!role.editable) return false;
      return role.permissions.has(PermissionFlagsBits.Administrator) ||
        role.permissions.has(PermissionFlagsBits.ManageGuild) ||
        role.permissions.has(PermissionFlagsBits.ManageChannels) ||
        role.permissions.has(PermissionFlagsBits.ManageRoles) ||
        role.permissions.has(PermissionFlagsBits.BanMembers) ||
        role.permissions.has(PermissionFlagsBits.KickMembers) ||
        role.permissions.has(PermissionFlagsBits.ManageWebhooks);
    });

    if (removableRoles.size > 0) {
      await member.roles.remove(
        removableRoles,
        `[PowerSecurity] ${mode}: dangerous activity detected. Score ${data.score}`
      ).catch(() => null);
    }

    await notifyGuild(guild, executor, data, mode);
  }

  async function handleCritical(guild, executor, data) {
    await containUser(guild, executor, data, "CRITICAL");

    if (!config.autoBanCritical) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (member?.bannable) {
      await member.ban({ reason: `[PowerSecurity] Critical anti-nuke trigger. Score ${data.score}` }).catch(() => null);
    }
  }

  async function notifyGuild(guild, executor, data, mode) {
    const summary = data.actions
      .slice(-8)
      .map((action) => `• ${action.actionType} (+${action.weight})`)
      .join("\n");

    const message = [
      `**PowerSecurity ${mode} Alert**`,
      `User: ${executor.tag} (${executor.id})`,
      `Threat score: ${data.score}`,
      `Window: ${Math.round(config.windowMs / 1000)} seconds`,
      "",
      summary || "No action summary available.",
    ].join("\n");

    const channel = guild.systemChannel || guild.channels.cache.find((ch) => {
      return ch.isTextBased?.() && ch.permissionsFor(guild.members.me)?.has("SendMessages");
    });

    if (channel) await channel.send({ content: message }).catch(() => null);
  }

  function dangerousPermissionAdded(oldRole, newRole) {
    const dangerous = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageWebhooks,
    ];

    return dangerous.some((perm) => !oldRole.permissions.has(perm) && newRole.permissions.has(perm));
  }

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await scoreAction(channel.guild, executor, "CHANNEL_DELETE", config.weights.CHANNEL_DELETE, { channelId: channel.id });
  });

  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await scoreAction(channel.guild, executor, "CHANNEL_CREATE", config.weights.CHANNEL_CREATE, { channelId: channel.id });
  });

  client.on("roleDelete", async (role) => {
    const executor = await getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    await scoreAction(role.guild, executor, "ROLE_DELETE", config.weights.ROLE_DELETE, { roleId: role.id });
  });

  client.on("roleCreate", async (role) => {
    const executor = await getExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    await scoreAction(role.guild, executor, "ROLE_CREATE", config.weights.ROLE_CREATE, { roleId: role.id });
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    if (!dangerousPermissionAdded(oldRole, newRole)) return;
    const executor = await getExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    await scoreAction(newRole.guild, executor, "ROLE_UPDATE_DANGEROUS", config.weights.ROLE_UPDATE_DANGEROUS, {
      roleId: newRole.id,
    });
  });

  client.on("guildBanAdd", async (ban) => {
    const executor = await getExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await scoreAction(ban.guild, executor, "MEMBER_BAN_ADD", config.weights.MEMBER_BAN_ADD, { targetId: ban.user.id });
  });

  client.on("guildMemberRemove", async (member) => {
    const executor = await getExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    await scoreAction(member.guild, executor, "MEMBER_KICK", config.weights.MEMBER_KICK, { targetId: member.id });
  });

  client.on("webhookUpdate", async (channel) => {
    const executor = await getExecutor(channel.guild, AuditLogEvent.WebhookCreate, channel.id);
    await scoreAction(channel.guild, executor, "WEBHOOK_CREATE", config.weights.WEBHOOK_CREATE, { channelId: channel.id });
  });

  client.logger.success("PowerSecurity intelligence layer loaded");
};
