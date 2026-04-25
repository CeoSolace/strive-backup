const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");

/**
 * PowerSecurity
 * A high-speed anti-nuke intelligence layer for Strive/Bright.
 *
 * Goal:
 * - Detect dangerous staff behaviour by pattern, not by one single action.
 * - Score risk in real time.
 * - Auto-contain attackers before a server is fully damaged.
 *
 * Loaded automatically by BotClient.loadSecurityModules("src/security").
 */
module.exports = function powerSecurity(client) {
  const config = {
    enabled: true,

    // How long actions stay relevant for scoring
    windowMs: 30_000,

    // Score thresholds
    warnScore: 35,
    containScore: 70,
    criticalScore: 110,

    // Optional automatic response
    autoContain: true,
    autoBanCritical: false,

    // Ignore bot owners
    trustedUsers: [...(client.config?.OWNER_IDS || [])],

    // Event weights
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

  function cleanOldActions() {
    const cutoff = now() - config.windowMs;
    while (recentActions.length && recentActions[0].createdAt < cutoff) {
      recentActions.shift();
    }

    for (const [userId, data] of userScores.entries()) {
      data.actions = data.actions.filter((action) => action.createdAt >= cutoff);
      data.score = data.actions.reduce((total, action) => total + action.weight, 0);
      if (data.actions.length === 0) userScores.delete(userId);
    }
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

  async function scoreAction(guild, executor, actionType, weight, metadata = {}) {
    if (!executor || executor.bot || isTrusted(executor.id)) return;

    cleanOldActions();

    const action = {
      guildId: guild.id,
      userId: executor.id,
      actionType,
      weight,
      metadata,
      createdAt: now(),
    };

    recentActions.push(action);

    const current = userScores.get(executor.id) || { score: 0, actions: [] };
    current.actions.push(action);
    current.score += weight;
    userScores.set(executor.id, current);

    const level = getThreatLevel(current.score);

    client.logger.warn(
      `[PowerSecurity] ${guild.name}: ${executor.tag} scored ${weight} for ${actionType}. Total: ${current.score} (${level})`
    );

    if (current.score >= config.criticalScore) {
      await handleCritical(guild, executor, current);
    } else if (current.score >= config.containScore) {
      await containUser(guild, executor, current, "CONTAIN");
    } else if (current.score >= config.warnScore) {
      await notifyGuild(guild, executor, current, "WARN");
    }
  }

  function getThreatLevel(score) {
    if (score >= config.criticalScore) return "CRITICAL";
    if (score >= config.containScore) return "HIGH";
    if (score >= config.warnScore) return "MEDIUM";
    return "LOW";
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
