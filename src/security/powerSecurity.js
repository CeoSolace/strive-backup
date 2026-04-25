const { AuditLogEvent, ChannelType, PermissionFlagsBits } = require("discord.js");

/**
 * PowerSecurity
 * Real-time anti-nuke intelligence layer.
 *
 * Channels created automatically:
 * - powersecurity-live: raw real-time action stream
 * - powersecurity-incidents: incident timelines, threat tags and containment summaries
 */
module.exports = function powerSecurity(client) {
  const config = {
    enabled: true,
    windowMs: 30_000,
    incidentWindowMs: 5 * 60_000,
    maxStoredActions: 250,

    liveChannelName: "powersecurity-live",
    incidentChannelName: "powersecurity-incidents",

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
  const channelCache = new Map();
  const lastIncidentPost = new Map();

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

  function getPatternTags(actions, score) {
    const counts = actions.reduce((acc, action) => {
      acc[action.actionType] = (acc[action.actionType] || 0) + 1;
      return acc;
    }, {});

    const tags = [];

    if ((counts.CHANNEL_DELETE || 0) >= 2) tags.push("POSSIBLE_CHANNEL_NUKE");
    if ((counts.ROLE_DELETE || 0) >= 2 || (counts.ROLE_UPDATE_DANGEROUS || 0) >= 1) tags.push("ROLE_SYSTEM_ATTACK");
    if ((counts.MEMBER_BAN_ADD || 0) + (counts.MEMBER_KICK || 0) >= 2) tags.push("MASS_MEMBER_REMOVAL");
    if ((counts.WEBHOOK_CREATE || 0) >= 1) tags.push("WEBHOOK_ABUSE_RISK");
    if ((counts.CHANNEL_CREATE || 0) >= 3) tags.push("SPAM_CHANNEL_CREATION");
    if (score >= config.containScore) tags.push("ADMIN_ABUSE_RISK");
    if (score >= config.criticalScore) tags.push("ACTIVE_NUKE_ATTEMPT");

    return tags.length ? tags : ["SUSPICIOUS_ACTIVITY"];
  }

  function formatTags(tags) {
    return (tags?.length ? tags : ["SUSPICIOUS_ACTIVITY"]).map((tag) => `\`${tag}\``).join(" ");
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
      tags: action.tags || [],
      metadata: action.metadata,
      createdAt: action.createdAt,
    };
  }

  client.powerSecurity = {
    config,

    async ensureChannels(guild) {
      return ensurePowerSecurityChannels(guild);
    },

    async ensureAllGuildChannels() {
      return ensureAllGuildChannels();
    },

    getStatus(guildId) {
      cleanOldScores();

      const activeThreats = [...userScores.entries()]
        .map(([userId, data]) => ({
          userId,
          userTag: data.userTag,
          score: data.score,
          threatLevel: getThreatLevel(data.score),
          tags: getPatternTags(data.actions, data.score),
          actionCount: data.actions.length,
          lastActionAt: data.actions.at(-1)?.createdAt || null,
        }))
        .filter((entry) => !guildId || dataBelongsToGuild(entry.userId, guildId))
        .sort((a, b) => b.score - a.score);

      return {
        enabled: config.enabled,
        liveChannelName: config.liveChannelName,
        incidentChannelName: config.incidentChannelName,
        windowSeconds: Math.round(config.windowMs / 1000),
        incidentWindowSeconds: Math.round(config.incidentWindowMs / 1000),
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
        tags: data ? getPatternTags(data.actions, data.score) : [],
        activeActions: data?.actions?.length || 0,
        logs: userLogs,
      };
    },

    getIncident(guildId, limit = 25) {
      return buildIncident(guildId, limit);
    },
  };

  function dataBelongsToGuild(userId, guildId) {
    return recentActions.some((action) => action.userId === userId && action.guildId === guildId);
  }

  function getChannelCacheKey(guildId, channelName) {
    return `${guildId}:${channelName}`;
  }

  async function ensurePrivateChannel(guild, channelName, reason, introMessage) {
    const cacheKey = getChannelCacheKey(guild.id, channelName);
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

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      ...adminRoles.map((role) => ({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      })),
    ];

    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      reason,
      permissionOverwrites,
    }).catch(() => null);

    if (channel) {
      channelCache.set(cacheKey, channel.id);
      if (introMessage) await channel.send({ content: introMessage }).catch(() => null);
    }

    return channel;
  }

  async function ensurePowerSecurityChannels(guild) {
    const live = await ensurePrivateChannel(
      guild,
      config.liveChannelName,
      "PowerSecurity admin-only live security stream",
      "**PowerSecurity Live Stream enabled**\nThis private channel receives raw suspicious action logs in real time."
    );

    const incidents = await ensurePrivateChannel(
      guild,
      config.incidentChannelName,
      "PowerSecurity admin-only incident and tag analysis",
      "**PowerSecurity Incident Analysis enabled**\nThis private channel receives incident timelines, attack tags and containment summaries."
    );

    return { live, incidents };
  }

  async function ensureAllGuildChannels() {
    const guilds = [...client.guilds.cache.values()];
    for (const guild of guilds) {
      await ensurePowerSecurityChannels(guild).catch(() => null);
    }
  }

  function buildIncident(guildId, limit = 25) {
    const cutoff = now() - config.incidentWindowMs;
    const logs = recentActions
      .filter((action) => action.guildId === guildId && action.createdAt >= cutoff)
      .slice(-limit);

    if (!logs.length) {
      return {
        active: false,
        title: "No recent incident detected",
        totalScore: 0,
        highestThreat: "LOW",
        tags: [],
        startedAt: null,
        endedAt: null,
        users: [],
        timeline: [],
      };
    }

    const totalScore = logs.reduce((sum, action) => sum + action.weight, 0);
    const users = [...new Map(logs.map((action) => [action.userId, action.userTag])).entries()].map(([userId, userTag]) => ({ userId, userTag }));
    const allTags = [...new Set(logs.flatMap((action) => action.tags || []))];
    const highestScore = Math.max(...logs.map((action) => action.scoreAfter || 0));

    return {
      active: true,
      title: totalScore >= config.criticalScore ? "Critical incident timeline" : "Recent security incident timeline",
      totalScore,
      highestThreat: getThreatLevel(highestScore),
      tags: allTags.length ? allTags : ["SUSPICIOUS_ACTIVITY"],
      startedAt: logs[0].createdAt,
      endedAt: logs.at(-1).createdAt,
      users,
      timeline: logs.map(getPublicAction),
    };
  }

  async function sendLiveLog(guild, action) {
    const { live } = await ensurePowerSecurityChannels(guild);
    if (!live) return;

    const content = [
      `**PowerSecurity Live Log**`,
      `User: **${action.userTag}** (${action.userId})`,
      `Action: **${action.actionType}** (+${action.weight})`,
      `Threat: **${action.threatLevel}** | Score: **${action.scoreAfter}**`,
      `Time: <t:${Math.floor(action.createdAt / 1000)}:F>`,
    ].join("\n");

    await live.send({ content }).catch(() => null);
  }

  async function sendIncidentAnalysis(guild, action, current) {
    if (action.threatLevel === "LOW") return;

    const cooldownKey = `${guild.id}:${action.userId}:${action.threatLevel}`;
    const lastPost = lastIncidentPost.get(cooldownKey) || 0;
    if (now() - lastPost < 10_000 && action.threatLevel !== "CRITICAL") return;
    lastIncidentPost.set(cooldownKey, now());

    const { incidents } = await ensurePowerSecurityChannels(guild);
    if (!incidents) return;

    const incident = buildIncident(guild.id, 12);
    const timeline = incident.timeline
      .slice(-8)
      .map((item) => `• <t:${Math.floor(item.createdAt / 1000)}:T> ${item.userTag}: ${item.actionType} (+${item.weight})`)
      .join("\n");

    const content = [
      `**${incident.title}**`,
      `Primary user: **${action.userTag}** (${action.userId})`,
      `Current score: **${current.score}** | Threat: **${action.threatLevel}**`,
      `Incident score: **${incident.totalScore}** | Users involved: **${incident.users.length}**`,
      `Attack tags: ${formatTags(incident.tags)}`,
      "",
      `**Timeline**`,
      timeline || "No timeline available.",
    ].join("\n");

    await incidents.send({ content }).catch(() => null);
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
    action.tags = getPatternTags(current.actions, current.score);

    userScores.set(executor.id, current);
    recentActions.push(action);
    trimStoredActions();

    client.logger.warn(
      `[PowerSecurity] ${guild.name}: ${executor.tag} scored ${weight} for ${actionType}. Total: ${current.score} (${action.threatLevel})`
    );

    await sendLiveLog(guild, action);
    await sendIncidentAnalysis(guild, action, current);

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
    const { incidents } = await ensurePowerSecurityChannels(guild);
    if (!incidents) return;

    const summary = data.actions
      .slice(-8)
      .map((action) => `• ${action.actionType} (+${action.weight})`)
      .join("\n");

    const tags = getPatternTags(data.actions, data.score);

    const message = [
      `**PowerSecurity ${mode} Alert**`,
      `User: ${executor.tag} (${executor.id})`,
      `Threat score: ${data.score}`,
      `Tags: ${formatTags(tags)}`,
      `Window: ${Math.round(config.windowMs / 1000)} seconds`,
      "",
      summary || "No action summary available.",
    ].join("\n");

    await incidents.send({ content: message }).catch(() => null);
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

  client.once("ready", async () => {
    await ensureAllGuildChannels();
  });

  client.on("guildCreate", async (guild) => {
    await ensurePowerSecurityChannels(guild);
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await scoreAction(channel.guild, executor, "CHANNEL_DELETE", config.weights.CHANNEL_DELETE, { channelId: channel.id });
  });

  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    if ([config.liveChannelName, config.incidentChannelName].includes(channel.name)) return;
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
