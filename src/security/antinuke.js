// antinuke.js (discord.js v14) - Bright
//
// Bright Review (bots with dangerous perms): kick-first + owner Accept/Deny
// Anti-nuke counters + lockdown
// Human mass-role stripping defense: derole executor + owner Restore/Keep panel
//
// NO MONGODB:
// Temporary restore data is stored in-server inside #bright-log as "restore capsules" (base64 JSON).
// Buttons on review panels fetch capsule message and restore.
// This survives restarts because the capsule is in the channel.

const {
  Collection,
  PermissionsBitField,
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = (client) => {
  // =========================
  // CONFIG
  // =========================
  const WINDOW = 30_000;
  const ENTRY_MAX_AGE = 12_000;

  const EXTRA_WHITELIST_ID = "1414726263112732775";

  const BRIGHT_REVIEW_CHANNEL_NAME = "bright-review";
  const BRIGHT_LOG_CHANNEL_NAME = "bright-log";

  // Dedupe to stop triple panels from cascaded events
  const BRIGHT_DEDUPE_MS = 60_000;

  // Capsule TTL (auto-delete the log message after this, optional)
  const LOG_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  // Anti mass role removal
  const ROLE_STRIP_WINDOW = 180_000; // ~3 minutes
  const ROLE_STRIP_THRESHOLD = 5;

  // Bot perms that trigger Bright Review kick
  const BOT_DANGEROUS_PERMS = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.KickMembers,
  ];

  // Anti-nuke limits
  const LIMITS = {
    channelDelete: 4,
    categoryDelete: 2,
    channelCreate: 8,
    channelPermEdit: 5,

    roleDelete: 3,
    roleCreate: 8,
    rolePermEdit: 4,

    webhookChange: 4,
    memberBan: 4,
  };

  // =========================
  // STATE
  // =========================

  // Scoped whitelist (for human protections only): guildId -> Map(userId -> Set(scopes))
  const whitelist = new Collection();

  // anti-nuke actor cache: `${guildId}:${userId}` -> counters
  const actorCache = new Collection();

  // Bright review state:
  const pendingBotReview = new Collection(); // guildId -> Map(botId -> info)
  const approvedBots = new Collection(); // guildId -> Set(botId)
  const deniedBots = new Collection(); // guildId -> Set(botId)

  // Dedupes
  const brightDedupe = new Collection(); // `${guildId}:${botId}` -> time

  // Human mass-role-strip counters
  const roleStripCache = new Collection(); // `${guildId}:${executorId}` -> {count,lastAction}

  // Human review pending: guildId -> Map(executorId -> { at, removedRoles, managedKeep })
  const pendingHumanReview = new Collection();

  // =========================
  // SCOPES (human whitelist)
  // =========================
  const VALID_SCOPES = new Set(["roles", "channels", "webhooks", "bans", "admin", "all"]);

  const ACTION_SCOPE = {
    channelDelete: "channels",
    categoryDelete: "channels",
    channelCreate: "channels",
    channelPermEdit: "channels",

    roleDelete: "roles",
    roleCreate: "roles",
    rolePermEdit: "roles",

    webhookChange: "webhooks",
    memberBan: "bans",

    adminGrant: "admin",
  };

  // =========================
  // CLEANUPS
  // =========================
  setInterval(() => {
    const now = Date.now();

    for (const [key, data] of actorCache.entries()) {
      if (now - data.lastAction > WINDOW) actorCache.delete(key);
    }

    for (const [key, data] of roleStripCache.entries()) {
      if (now - data.lastAction > ROLE_STRIP_WINDOW) roleStripCache.delete(key);
    }

    for (const [key, t] of brightDedupe.entries()) {
      if (now - t > BRIGHT_DEDUPE_MS) brightDedupe.delete(key);
    }
  }, 30_000);

  // =========================
  // HELPERS
  // =========================
  function keyOf(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  function getActorData(guildId, userId) {
    const key = keyOf(guildId, userId);
    if (!actorCache.has(key)) {
      actorCache.set(key, {
        lastAction: Date.now(),
        locked: false,

        channelDelete: 0,
        categoryDelete: 0,
        channelCreate: 0,
        channelPermEdit: 0,

        roleDelete: 0,
        roleCreate: 0,
        rolePermEdit: 0,

        webhookChange: 0,
        memberBan: 0,
      });
    }
    return actorCache.get(key);
  }

  function getWhitelistMap(guildId) {
    if (!whitelist.has(guildId)) whitelist.set(guildId, new Map());
    return whitelist.get(guildId);
  }

  function normalizeScopes(scopes) {
    if (!scopes || scopes.length === 0) return new Set(["all"]);
    const set = new Set();
    for (const s of scopes) {
      const v = String(s || "").toLowerCase();
      if (VALID_SCOPES.has(v)) set.add(v);
    }
    return set.size ? set : new Set(["all"]);
  }

  function formatScopes(set) {
    const arr = [...set.values()];
    return arr.length ? arr.join(", ") : "none";
  }

  function isWhitelisted(guild, user, action) {
    if (!guild || !user) return false;
    if (user.id === guild.ownerId || user.id === EXTRA_WHITELIST_ID) return true;

    const scopeNeeded = ACTION_SCOPE[action] ?? "all";
    const map = whitelist.get(guild.id);
    if (!map) return false;

    const scopes = map.get(user.id);
    if (!scopes) return false;

    return scopes.has("all") || scopes.has(scopeNeeded);
  }

  function parseScopesFromCommand(tokens) {
    const lower = tokens.map((t) => String(t).toLowerCase());
    const forIndex = lower.indexOf("for");
    if (forIndex === -1) return [];
    return tokens.slice(forIndex + 1).map((x) => String(x).toLowerCase());
  }

  async function safeFetchUser(client, token) {
    if (!token) return null;
    const id = token.replace(/[<@!>]/g, "");
    if (!/^\d{16,22}$/.test(id)) return null;
    return client.users.fetch(id).catch(() => null);
  }

  async function getAuditExecutor(guild, event, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 8, type: event });
      const now = Date.now();
      const entry = logs.entries.find((e) => {
        if (now - e.createdTimestamp > ENTRY_MAX_AGE) return false;
        if (!targetId) return true;
        return e.target?.id === targetId;
      });
      return entry?.executor ?? null;
    } catch {
      return null;
    }
  }

  function getPendingMap(guildId) {
    if (!pendingBotReview.has(guildId)) pendingBotReview.set(guildId, new Map());
    return pendingBotReview.get(guildId);
  }

  function getPendingHumanMap(guildId) {
    if (!pendingHumanReview.has(guildId)) pendingHumanReview.set(guildId, new Map());
    return pendingHumanReview.get(guildId);
  }

  function getApprovedSet(guildId) {
    if (!approvedBots.has(guildId)) approvedBots.set(guildId, new Set());
    return approvedBots.get(guildId);
  }

  function getDeniedSet(guildId) {
    if (!deniedBots.has(guildId)) deniedBots.set(guildId, new Set());
    return deniedBots.get(guildId);
  }

  function isBotApproved(guildId, botId) {
    return getApprovedSet(guildId).has(botId);
  }

  function isBotDenied(guildId, botId) {
    return getDeniedSet(guildId).has(botId);
  }

  function hasDangerousGuildPerms(member) {
    return BOT_DANGEROUS_PERMS.some((p) => member.permissions.has(p));
  }

  function dangerousPermsList(member) {
    const out = [];
    const map = [
      [PermissionsBitField.Flags.Administrator, "Administrator"],
      [PermissionsBitField.Flags.ManageGuild, "Manage Server"],
      [PermissionsBitField.Flags.ManageRoles, "Manage Roles"],
      [PermissionsBitField.Flags.ManageChannels, "Manage Channels"],
      [PermissionsBitField.Flags.ManageWebhooks, "Manage Webhooks"],
      [PermissionsBitField.Flags.BanMembers, "Ban Members"],
      [PermissionsBitField.Flags.KickMembers, "Kick Members"],
    ];
    for (const [flag, label] of map) {
      if (member.permissions.has(flag)) out.push(label);
    }
    return out.length ? out : ["(unknown)"];
  }

  async function getBotAdder(guild, botMember) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 8, type: AuditLogEvent.BotAdd });
      const now = Date.now();
      const entry = logs.entries.find((e) => {
        if (e.target?.id !== botMember.id) return false;
        if (now - e.createdTimestamp > ENTRY_MAX_AGE) return false;
        return true;
      });
      return entry?.executor ?? null;
    } catch {
      return null;
    }
  }

  // =========================
  // CHANNEL ENSURE: REVIEW + LOG
  // =========================
  async function ensureBrightReviewChannel(guild) {
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === BRIGHT_REVIEW_CHANNEL_NAME
    );

    if (
      existing &&
      existing
        .permissionsFor(guild.members.me)
        ?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])
    ) {
      return existing;
    }

    try {
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: guild.ownerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ];

      if (guild.members.cache.has(EXTRA_WHITELIST_ID)) {
        overwrites.push({
          id: EXTRA_WHITELIST_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }

      return await guild.channels.create({
        name: BRIGHT_REVIEW_CHANNEL_NAME,
        type: ChannelType.GuildText,
        reason: "Bright Review approvals channel",
        permissionOverwrites: overwrites,
      });
    } catch {
      return guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)
      );
    }
  }

  async function ensureBrightLogChannel(guild) {
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === BRIGHT_LOG_CHANNEL_NAME
    );

    if (
      existing &&
      existing
        .permissionsFor(guild.members.me)
        ?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])
    ) {
      return existing;
    }

    try {
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: guild.ownerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ];

      if (guild.members.cache.has(EXTRA_WHITELIST_ID)) {
        overwrites.push({
          id: EXTRA_WHITELIST_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }

      return await guild.channels.create({
        name: BRIGHT_LOG_CHANNEL_NAME,
        type: ChannelType.GuildText,
        reason: "Bright temporary restore log",
        permissionOverwrites: overwrites,
      });
    } catch {
      return guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)
      );
    }
  }

  // =========================
  // RESTORE CAPSULES (NO DB)
  // =========================
  function encodeCapsule(obj) {
    const json = JSON.stringify(obj);
    return Buffer.from(json, "utf8").toString("base64");
  }

  function decodeCapsule(b64) {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  }

  function extractCapsuleFromMessageContent(content) {
    const m = content.match(/restore:([A-Za-z0-9+/=]+)/);
    return m?.[1] ?? null;
  }

  async function postRestoreCapsule(guild, title, capsuleObj) {
    const logCh = await ensureBrightLogChannel(guild);
    if (!logCh) return null;

    const capsule = {
      v: 1,
      guildId: guild.id,
      at: Date.now(),
      expiresAt: Date.now() + LOG_TTL_MS,
      title,
      ...capsuleObj,
    };

    const b64 = encodeCapsule(capsule);

    const msg = await logCh
      .send({
        content:
          `🧾 **BRIGHT RESTORE CAPSULE**: ${title}\n` +
          `Expires: <t:${Math.floor(capsule.expiresAt / 1000)}:R>\n` +
          `\`\`\`txt\nrestore:${b64}\n\`\`\``,
      })
      .catch(() => null);

    if (msg) {
      // auto-delete after TTL (keeps it "temporary")
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, LOG_TTL_MS).unref?.();
    }

    return msg;
  }

  async function restoreFromCapsule(guild, capsule) {
    if (!capsule || capsule.guildId !== guild.id) {
      return { ok: false, msg: "Capsule guild mismatch." };
    }
    if (Date.now() > (capsule.expiresAt ?? 0)) {
      return { ok: false, msg: "Capsule expired." };
    }

    // Restore member roles (after Bright deroles executor)
    if (capsule.type === "member.roles") {
      const targetId = capsule.targetId;
      const roleIds = Array.isArray(capsule.roleIds) ? capsule.roleIds : [];
      const managedKeep = Array.isArray(capsule.managedKeep) ? capsule.managedKeep : [];

      const member = await guild.members.fetch(targetId).catch(() => null);
      if (!member) return { ok: false, msg: "Member not found in guild." };

      const valid = roleIds.filter((rid) => {
        const r = guild.roles.cache.get(rid);
        return r && !r.managed;
      });

      const managedStill = managedKeep.filter((rid) => guild.roles.cache.get(rid));
      const final = [...new Set([...managedStill, ...valid])];

      await member.roles.set(final, "Bright restore (capsule)").catch(() => {});
      return { ok: true, msg: `Restored roles for ${member.user.tag} (best-effort).` };
    }

    // Recreate deleted channel (messages cannot be restored)
    if (capsule.type === "channel.recreate") {
      const snap = capsule.channel;
      if (!snap) return { ok: false, msg: "Capsule missing channel snapshot." };

      // Parent may be missing too. Best-effort.
      const parent = snap.parentId ? guild.channels.cache.get(snap.parentId) : null;

      const overwrites = Array.isArray(snap.permissionOverwrites)
        ? snap.permissionOverwrites.map((o) => ({
            id: o.id,
            allow: BigInt(o.allow ?? 0),
            deny: BigInt(o.deny ?? 0),
            type: o.type,
          }))
        : [];

      const createData = {
        name: snap.name,
        type: snap.type,
        parent: parent?.id ?? null,
        permissionOverwrites: overwrites,
        reason: "Bright restore (capsule)",
      };

      // Per-type options
      if (snap.type === ChannelType.GuildText || snap.type === ChannelType.GuildAnnouncement) {
        createData.topic = snap.topic ?? null;
        createData.nsfw = !!snap.nsfw;
        createData.rateLimitPerUser = snap.rateLimitPerUser ?? 0;
      }
      if (snap.type === ChannelType.GuildVoice) {
        createData.bitrate = snap.bitrate ?? null;
        createData.userLimit = snap.userLimit ?? 0;
        createData.rtcRegion = snap.rtcRegion ?? null;
        createData.videoQualityMode = snap.videoQualityMode ?? null;
      }

      const recreated = await guild.channels.create(createData).catch(() => null);
      if (!recreated) return { ok: false, msg: "Failed to recreate channel (permissions/hierarchy?)." };

      // Try to restore position (best-effort)
      if (typeof snap.position === "number") {
        await recreated.setPosition(snap.position).catch(() => {});
      }

      return { ok: true, msg: `Recreated channel: #${recreated.name}` };
    }

    return { ok: false, msg: "Unknown capsule type." };
  }

  // =========================
  // REVIEW BUTTONS
  // =========================
  function makeReviewButtons(guildId, botId, disabled = false) {
    const accept = new ButtonBuilder()
      .setCustomId(`bright:accept:${guildId}:${botId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    const deny = new ButtonBuilder()
      .setCustomId(`bright:deny:${guildId}:${botId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder().addComponents(accept, deny);
  }

  function makeHumanReviewButtons(guildId, executorId, disabled = false) {
    const restore = new ButtonBuilder()
      .setCustomId(`bright:restore_roles:${guildId}:${executorId}`)
      .setLabel("Restore Roles")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    const keep = new ButtonBuilder()
      .setCustomId(`bright:keep_derolled:${guildId}:${executorId}`)
      .setLabel("Keep Derolled")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder().addComponents(restore, keep);
  }

  function makeRestoreCapsuleButtonRow(guildId, logChannelId, logMessageId, disabled = false) {
    // customId length limit is 100, this stays under it.
    const restore = new ButtonBuilder()
      .setCustomId(`bright:restorecap:${logChannelId}:${logMessageId}`)
      .setLabel("Restore")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    return new ActionRowBuilder().addComponents(restore);
  }

  // =========================
  // PANELS
  // =========================
  async function postBrightReviewPanel({
    guild,
    botId,
    botTag,
    ownerId,
    adder,
    reason,
    perms,
    origin,
  }) {
    const reviewChannel = await ensureBrightReviewChannel(guild);
    if (!reviewChannel) return;

    const ownerPing = `<@${ownerId}>`;
    const adderLine = adder ? `<@${adder.id}> (${adder.tag})` : "Unknown (audit log missing)";
    const permsLine = perms?.length ? perms.join(", ") : "(unknown)";

    const embed = new EmbedBuilder()
      .setTitle("🚨 Bright Review: Bot Kicked")
      .setDescription(
        `${ownerPing}\n\n` +
          `A bot was **kicked first** because it had **dangerous permissions**.\n\n` +
          `✅ **Accept** = allow future re-adds (no auto-kick)\n` +
          `❌ **Deny** = block this bot ID (auto-kick every time)\n`
      )
      .addFields(
        { name: "Bot", value: `**${botTag}**\n\`${botId}\``, inline: false },
        { name: "Added / Changed by", value: adderLine, inline: false },
        { name: "Dangerous Permissions", value: permsLine, inline: false },
        { name: "Reason", value: reason, inline: false },
        { name: "Event", value: origin, inline: true }
      )
      .setFooter({ text: "Buttons only work for the server owner (and configured bot admin)." })
      .setTimestamp(Date.now());

    await reviewChannel
      .send({
        content: ownerPing,
        embeds: [embed],
        components: [makeReviewButtons(guild.id, botId, false)],
        allowedMentions: { users: [ownerId] },
      })
      .catch(() => {});
  }

  async function postHumanReviewPanel({ guild, executorUser, reason, removedRoles }) {
    const reviewChannel = await ensureBrightReviewChannel(guild);
    if (!reviewChannel) return;

    const ownerId = guild.ownerId;
    const ownerPing = `<@${ownerId}>`;

    const removedPreview =
      removedRoles?.length ? removedRoles.map((r) => `<@&${r}>`).slice(0, 20).join(", ") : "(none)";

    const embed = new EmbedBuilder()
      .setTitle("🚨 Bright Review: Mass Role Removal Detected")
      .setDescription(
        `${ownerPing}\n\n` +
          `A user appears to be stripping roles quickly. They were **derolled** as a precaution.\n\n` +
          `✅ **Restore Roles** = puts previous roles back\n` +
          `❌ **Keep Derolled** = leave them stripped\n`
      )
      .addFields(
        { name: "Executor", value: `<@${executorUser.id}> (${executorUser.tag})`, inline: false },
        { name: "Reason", value: reason, inline: false },
        { name: "Roles Removed (snapshot)", value: removedPreview, inline: false }
      )
      .setFooter({ text: "Buttons only work for the server owner (and configured bot admin)." })
      .setTimestamp(Date.now());

    await reviewChannel
      .send({
        content: ownerPing,
        embeds: [embed],
        components: [makeHumanReviewButtons(guild.id, executorUser.id, false)],
        allowedMentions: { users: [ownerId] },
      })
      .catch(() => {});
  }

  async function postChannelRestorePanel({ guild, deletedChannelName, executor, capsuleMsg }) {
    const reviewChannel = await ensureBrightReviewChannel(guild);
    if (!reviewChannel || !capsuleMsg) return;

    const ownerId = guild.ownerId;
    const ownerPing = `<@${ownerId}>`;

    const embed = new EmbedBuilder()
      .setTitle("🧯 Bright Restore: Channel Deleted")
      .setDescription(
        `${ownerPing}\n\n` +
          `A channel was deleted.\n\n` +
          `✅ **Restore** will recreate the channel with stored settings + overwrites (messages cannot be restored).`
      )
      .addFields(
        { name: "Channel", value: `\`${deletedChannelName}\``, inline: true },
        { name: "Executor", value: executor ? `<@${executor.id}> (${executor.tag})` : "Unknown", inline: true },
        { name: "Restore Capsule", value: `Stored in <#${capsuleMsg.channelId}>`, inline: false }
      )
      .setFooter({ text: "Restore button uses the in-server capsule (no DB)." })
      .setTimestamp(Date.now());

    await reviewChannel
      .send({
        content: ownerPing,
        embeds: [embed],
        components: [makeRestoreCapsuleButtonRow(guild.id, capsuleMsg.channelId, capsuleMsg.id, false)],
        allowedMentions: { users: [ownerId] },
      })
      .catch(() => {});
  }

  // =========================
  // BRIGHT REVIEW KICK-FIRST
  // =========================
  async function triggerBrightReviewKickFirst({
    guild,
    botMember,
    adderOrExecutor,
    origin,
    reason,
  }) {
    const botId = botMember.id;

    // dedupe panels
    const dk = `${guild.id}:${botId}`;
    const last = brightDedupe.get(dk) ?? 0;
    if (Date.now() - last < BRIGHT_DEDUPE_MS) return;
    brightDedupe.set(dk, Date.now());

    const botTag = botMember.user?.tag ?? "UnknownBot";
    const ownerId = guild.ownerId;

    const perms = dangerousPermsList(botMember);

    // store pending before kick
    const pending = getPendingMap(guild.id);
    pending.set(botId, {
      at: Date.now(),
      reason,
      origin,
      perms,
      adderId: adderOrExecutor?.id ?? null,
    });

    // kick first
    if (botMember.kickable) {
      await botMember.kick(`Bright Review: ${reason}`).catch(() => {});
    } else {
      await botMember.roles.set([], `Bright Review: ${reason}`).catch(() => {});
    }

    await postBrightReviewPanel({
      guild,
      botId,
      botTag,
      ownerId,
      adder: adderOrExecutor,
      reason,
      perms,
      origin,
    });
  }

  // =========================
  // ROLE STRIP DEFENSE HELPERS
  // =========================
  async function deroleMemberKeepManaged(guild, member, reason) {
    const removable = member.roles.cache
      .filter((r) => r.id !== guild.id && !r.managed)
      .map((r) => r.id);

    const keepManaged = member.roles.cache.filter((r) => r.managed).map((r) => r.id);

    try {
      await member.roles.set(keepManaged, `[BRIGHT][ANTINUKE] ${reason}`);
    } catch {}
    return { removed: removable, managedKeep: keepManaged };
  }

  // =========================
  // ANTI-NUKE COUNTERS
  // =========================
  async function bumpAndCheck(guild, executor, field, reason) {
    if (!guild || !executor) return;
    if (executor.id === client.user.id) return;
    if (isWhitelisted(guild, executor, field)) return;

    const data = getActorData(guild.id, executor.id);
    data[field]++;
    data.lastAction = Date.now();

    if (!data.locked && data[field] >= (LIMITS[field] ?? 9999)) {
      await lockdownGuild(guild, executor, reason);
      data.locked = true;
    }
  }

  // =========================
  // INTERACTIONS
  // =========================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split(":");

    // restore capsule button: bright:restorecap:<logChannelId>:<logMessageId>
    if (parts[0] === "bright" && parts[1] === "restorecap") {
      const guild = interaction.guild;
      if (!guild) return;

      const allowed =
        interaction.user.id === guild.ownerId || interaction.user.id === EXTRA_WHITELIST_ID;

      if (!allowed) {
        await interaction.reply({ content: "⚠️ Only the server owner can do that.", ephemeral: true }).catch(() => {});
        return;
      }

      const logChannelId = parts[2];
      const logMessageId = parts[3];
      if (!logChannelId || !logMessageId) return;

      const logCh = guild.channels.cache.get(logChannelId);
      if (!logCh || logCh.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "⚠️ Log channel missing.", ephemeral: true }).catch(() => {});
        return;
      }

      const msg = await logCh.messages.fetch(logMessageId).catch(() => null);
      if (!msg) {
        await interaction.reply({ content: "⚠️ Capsule message missing (expired or deleted).", ephemeral: true }).catch(() => {});
        return;
      }

      const b64 = extractCapsuleFromMessageContent(msg.content);
      if (!b64) {
        await interaction.reply({ content: "⚠️ Capsule payload missing/corrupt.", ephemeral: true }).catch(() => {});
        return;
      }

      let capsule;
      try {
        capsule = decodeCapsule(b64);
      } catch {
        await interaction.reply({ content: "⚠️ Capsule decode failed.", ephemeral: true }).catch(() => {});
        return;
      }

      const result = await restoreFromCapsule(guild, capsule);
      await interaction.reply({ content: result.ok ? `✅ ${result.msg}` : `❌ ${result.msg}`, ephemeral: true }).catch(() => {});
      return;
    }

    // other bright buttons use format: bright:<action>:<guildId>:<targetId>
    if (parts.length !== 4) return;
    const [ns, action, guildId, targetId] = parts;
    if (ns !== "bright") return;

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) {
      await interaction.reply({ content: "⚠️ Guild mismatch.", ephemeral: true }).catch(() => {});
      return;
    }

    const allowed =
      interaction.user.id === guild.ownerId || interaction.user.id === EXTRA_WHITELIST_ID;

    if (!allowed) {
      await interaction.reply({ content: "⚠️ Only the server owner can do that.", ephemeral: true }).catch(() => {});
      return;
    }

    // BOT accept/deny
    if (action === "accept" || action === "deny") {
      const approved = getApprovedSet(guild.id);
      const denied = getDeniedSet(guild.id);
      const botId = targetId;

      if (action === "accept") {
        approved.add(botId);
        denied.delete(botId);
        getPendingMap(guild.id).delete(botId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0x2ecc71)
          .addFields({ name: "Decision", value: `✅ **ACCEPTED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message.edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] }).catch(() => {});
        await interaction.reply({ content: `✅ Accepted. You can re-add \`${botId}\` and it will NOT be auto-kicked for dangerous perms.`, ephemeral: true }).catch(() => {});
        return;
      }

      if (action === "deny") {
        denied.add(botId);
        approved.delete(botId);
        getPendingMap(guild.id).delete(botId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0xe74c3c)
          .addFields({ name: "Decision", value: `❌ **DENIED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message.edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] }).catch(() => {});
        await interaction.reply({ content: `❌ Denied. If \`${botId}\` is re-added, it will be kicked automatically.`, ephemeral: true }).catch(() => {});
        return;
      }
    }

    // HUMAN restore/keep derolled
    if (action === "restore_roles" || action === "keep_derolled") {
      const executorId = targetId;
      const pending = getPendingHumanMap(guild.id);
      const info = pending.get(executorId);

      if (!info) {
        await interaction.reply({ content: "ℹ️ No pending human review found.", ephemeral: true }).catch(() => {});
        return;
      }

      const execMember = await guild.members.fetch(executorId).catch(() => null);
      if (!execMember) {
        await interaction.reply({ content: "⚠️ Executor not found in guild.", ephemeral: true }).catch(() => {});
        return;
      }

      if (action === "restore_roles") {
        const roleIds = Array.isArray(info.removedRoles) ? info.removedRoles : [];
        const managedKeep = Array.isArray(info.managedKeep) ? info.managedKeep : [];

        const valid = roleIds.filter((rid) => {
          const r = guild.roles.cache.get(rid);
          return r && !r.managed;
        });

        const managedStill = managedKeep.filter((rid) => guild.roles.cache.get(rid));
        const final = [...new Set([...managedStill, ...valid])];

        await execMember.roles.set(final, "Bright Review: restore roles").catch(() => {});

        pending.delete(executorId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0x2ecc71)
          .addFields({ name: "Decision", value: `✅ **RESTORED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message.edit({ embeds: [edited], components: [makeHumanReviewButtons(guild.id, executorId, true)] }).catch(() => {});
        await interaction.reply({ content: "✅ Roles restored (best-effort).", ephemeral: true }).catch(() => {});
        return;
      }

      if (action === "keep_derolled") {
        pending.delete(executorId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0xe74c3c)
          .addFields({ name: "Decision", value: `❌ **KEPT DEROLED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message.edit({ embeds: [edited], components: [makeHumanReviewButtons(guild.id, executorId, true)] }).catch(() => {});
        await interaction.reply({ content: "❌ Kept derolled.", ephemeral: true }).catch(() => {});
        return;
      }
    }
  });

  // =========================
  // COMMANDS
  // =========================
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith("=")) return;

    const tokens = content.split(/\s+/);
    const cmd = tokens[0].toLowerCase();

    if (cmd === "=help") {
      await message.reply(
        `**Anti-nuke commands**\n` +
          `• \`=help\`\n` +
          `• \`=whitelist <@user|id>\` *(defaults to \`all\`)*\n` +
          `• \`=whitelist <@user|id> for <scopes...>\`\n` +
          `• \`=whitelist list\`\n` +
          `• \`=removewhitelist <@user|id>\`\n` +
          `• \`=removewhitelist <@user|id> for <scopes...>\`\n\n` +
          `**Scopes**: \`roles\`, \`channels\`, \`webhooks\`, \`bans\`, \`admin\`, \`all\`\n\n` +
          `**Restore (no DB)**\n` +
          `Panels include restore buttons when Bright takes action. Capsules are stored in #${BRIGHT_LOG_CHANNEL_NAME}.\n`
      );
      return;
    }

    const isOwnerOrAdmin =
      message.author.id === message.guild.ownerId || message.author.id === EXTRA_WHITELIST_ID;

    // whitelist list
    if (cmd === "=whitelist" && tokens[1]?.toLowerCase() === "list") {
      const map = whitelist.get(message.guild.id) ?? new Map();
      if (map.size === 0) return void (await message.reply("✅ Whitelist is empty."));
      const lines = [];
      for (const [userId, scopes] of map.entries()) lines.push(`• **${userId}** → \`${formatScopes(scopes)}\``);
      await message.reply(`✅ Whitelisted users:\n${lines.join("\n")}`);
      return;
    }

    if (cmd !== "=whitelist" && cmd !== "=removewhitelist") return;

    if (!isOwnerOrAdmin) {
      await message.reply("⚠️ Only the server owner / bot admin can manage the whitelist.");
      return;
    }

    const target =
      message.mentions.users.first() || (await safeFetchUser(message.client, tokens[1]));

    if (!target) {
      await message.reply("⚠️ Invalid user ID/mention.");
      return;
    }

    const scopeTokens = parseScopesFromCommand(tokens);
    const scopes = normalizeScopes(scopeTokens);
    const map = getWhitelistMap(message.guild.id);

    if (cmd === "=whitelist") {
      const existing = map.get(target.id) ?? new Set();
      if (scopes.has("all") || existing.has("all")) map.set(target.id, new Set(["all"]));
      else {
        for (const s of scopes) existing.add(s);
        map.set(target.id, existing);
      }
      await message.reply(`✅ Whitelisted **${target.tag}** for: \`${formatScopes(map.get(target.id))}\``);
      return;
    }

    // removewhitelist
    if (!map.has(target.id)) {
      await message.reply(`ℹ️ ${target.tag} is not whitelisted.`);
      return;
    }

    const hasFor = tokens.map((t) => t.toLowerCase()).includes("for");
    if (!hasFor || scopes.has("all")) {
      map.delete(target.id);
      await message.reply(`✅ Removed **${target.tag}** from the whitelist.`);
      return;
    }

    const existing = map.get(target.id);
    if (existing.has("all")) {
      map.delete(target.id);
      await message.reply(
        `✅ Removed **${target.tag}** from \`all\` whitelist.\n` +
          `Re-add partial with: \`=whitelist ${target.id} for roles channels\``
      );
      return;
    }

    for (const s of scopes) existing.delete(s);
    if (existing.size === 0) map.delete(target.id);
    else map.set(target.id, existing);

    await message.reply(
      `✅ Updated whitelist for **${target.tag}**: ` +
        (map.has(target.id) ? `\`${formatScopes(map.get(target.id))}\`` : "`(removed)`")
    );
  });

  // =========================
  // BRIGHT REVIEW ENFORCEMENT
  // =========================
  client.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    if (!guild || guild.available === false) return;
    if (!member.user.bot) return;

    if (isBotDenied(guild.id, member.id)) {
      const adder = await getBotAdder(guild, member);
      await triggerBrightReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        origin: "JOIN",
        reason: "Bot is DENIED in Bright Review (blocked from re-adding).",
      });
      return;
    }

    if (isBotApproved(guild.id, member.id)) return;

    if (hasDangerousGuildPerms(member)) {
      const adder = await getBotAdder(guild, member);
      await triggerBrightReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        origin: "JOIN",
        reason: "Bot joined with dangerous permissions.",
      });
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const guild = newMember.guild;
    if (!guild || guild.available === false) return;

    // BOT PATH
    if (newMember.user.bot) {
      const pend = getPendingMap(guild.id).get(newMember.id);
      if (pend && Date.now() - pend.at < BRIGHT_DEDUPE_MS) return;

      if (isBotDenied(guild.id, newMember.id)) {
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
        await triggerBrightReviewKickFirst({
          guild,
          botMember: newMember,
          adderOrExecutor: executor,
          origin: "ROLE_UPDATE",
          reason: "Bot is DENIED in Bright Review (blocked from re-adding).",
        });
        return;
      }

      if (isBotApproved(guild.id, newMember.id)) return;

      const rolesChanged =
        oldMember.roles.cache.size !== newMember.roles.cache.size ||
        oldMember.roles.cache.some((r) => !newMember.roles.cache.has(r.id));

      if (!rolesChanged) return;

      if (hasDangerousGuildPerms(newMember)) {
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
        await triggerBrightReviewKickFirst({
          guild,
          botMember: newMember,
          adderOrExecutor: executor,
          origin: "ROLE_UPDATE",
          reason: "Bot was granted dangerous permissions after joining.",
        });
      }
      return;
    }

    // HUMAN mass role removal defense
    const removedCount = oldMember.roles.cache.size - newMember.roles.cache.size;
    if (removedCount > 0) {
      const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

      if (
        executor &&
        executor.id !== client.user.id &&
        executor.id !== guild.ownerId &&
        !isWhitelisted(guild, executor, "roles")
      ) {
        const k = `${guild.id}:${executor.id}`;
        const rec = roleStripCache.get(k) ?? { count: 0, lastAction: Date.now() };

        if (Date.now() - rec.lastAction > ROLE_STRIP_WINDOW) rec.count = 0;

        rec.count += removedCount;
        rec.lastAction = Date.now();
        roleStripCache.set(k, rec);

        if (rec.count >= ROLE_STRIP_THRESHOLD) {
          rec.count = 0;
          roleStripCache.set(k, rec);

          const execMember = await guild.members.fetch(executor.id).catch(() => null);
          if (execMember) {
            const pending = getPendingHumanMap(guild.id);

            const already = pending.get(execMember.id);
            if (!already || Date.now() - already.at > ROLE_STRIP_WINDOW) {
              const beforeRoleIds = execMember.roles.cache
                .filter((r) => r.id !== guild.id && !r.managed)
                .map((r) => r.id);
              const managedKeep = execMember.roles.cache.filter((r) => r.managed).map((r) => r.id);

              const { removed, managedKeep: keepManaged } = await deroleMemberKeepManaged(
                guild,
                execMember,
                "Mass role removal detected"
              );

              pending.set(execMember.id, {
                at: Date.now(),
                removedRoles: beforeRoleIds, // store what THEY had (restore target is executor)
                managedKeep,
              });

              // store capsule in #bright-log (no DB)
              const capsuleMsg = await postRestoreCapsule(guild, "Restore executor roles", {
                type: "member.roles",
                targetId: execMember.id,
                roleIds: beforeRoleIds,
                managedKeep: keepManaged,
                reason: "Mass role removal defense derole",
                executorId: executor.id,
              });

              await postHumanReviewPanel({
                guild,
                executorUser: execMember.user,
                reason: `Removed ${ROLE_STRIP_THRESHOLD}+ roles within ~3 minutes`,
                removedRoles: removed,
              });

              // (Optional) also post a one-click capsule restore panel
              // Uses the capsule message (survives restart).
              if (capsuleMsg) {
                const reviewCh = await ensureBrightReviewChannel(guild);
                const ownerId = guild.ownerId;
                const ownerPing = `<@${ownerId}>`;

                const emb = new EmbedBuilder()
                  .setTitle("🧾 Bright Restore: Executor Derolled")
                  .setDescription(
                    `${ownerPing}\n\n` +
                      `Bright derolled <@${execMember.id}> as a precaution.\n` +
                      `Click **Restore** to apply the stored role snapshot.`
                  )
                  .addFields(
                    { name: "Executor", value: `<@${execMember.id}> (${execMember.user.tag})`, inline: false },
                    { name: "Capsule", value: `Stored in <#${capsuleMsg.channelId}>`, inline: false }
                  )
                  .setTimestamp(Date.now());

                await reviewCh
                  .send({
                    content: ownerPing,
                    embeds: [emb],
                    components: [makeRestoreCapsuleButtonRow(guild.id, capsuleMsg.channelId, capsuleMsg.id, false)],
                    allowedMentions: { users: [ownerId] },
                  })
                  .catch(() => {});
              }
            }
          }
        }
      }
    }

    // Optional admin-grant revert (your existing behavior)
    const hadAdmin = oldMember.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasAdmin = newMember.permissions.has(PermissionsBitField.Flags.Administrator);
    if (hadAdmin || !hasAdmin) return;

    if (newMember.id === guild.ownerId) return;
    if (isWhitelisted(guild, newMember.user, "adminGrant")) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    if (executor && isWhitelisted(guild, executor, "adminGrant")) return;

    try {
      await newMember.roles.set(oldMember.roles.cache.map((r) => r.id));
    } catch {}
  });

  // =========================
  // ANTI-NUKE EVENTS + RESTORE PANELS
  // =========================
  client.on("channelDelete", async (channel) => {
    const guild = channel.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id);
    const field =
      channel.type === ChannelType.GuildCategory ? "categoryDelete" : "channelDelete";

    // snapshot BEFORE anything else
    const snap = {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId ?? null,
      position: channel.rawPosition ?? null,
      // overwrites
      permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type, // 0 role, 1 member
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      })),
    };

    // extra fields by type
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
      snap.topic = channel.topic ?? null;
      snap.nsfw = !!channel.nsfw;
      snap.rateLimitPerUser = channel.rateLimitPerUser ?? 0;
    }
    if (channel.type === ChannelType.GuildVoice) {
      snap.bitrate = channel.bitrate ?? null;
      snap.userLimit = channel.userLimit ?? 0;
      snap.rtcRegion = channel.rtcRegion ?? null;
      snap.videoQualityMode = channel.videoQualityMode ?? null;
    }

    // store capsule in #bright-log
    const capsuleMsg = await postRestoreCapsule(guild, "Recreate deleted channel", {
      type: "channel.recreate",
      channel: snap,
      executorId: executor?.id ?? null,
      reason: "Channel deleted (anti-nuke restore capsule)",
    });

    // post restore button panel
    if (capsuleMsg) {
      await postChannelRestorePanel({
        guild,
        deletedChannelName: channel.name,
        executor,
        capsuleMsg,
      });
    }

    await bumpAndCheck(guild, executor, field, "Channel/Category nuke detected");
  });

  client.on("channelCreate", async (channel) => {
    const guild = channel.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelCreate, channel.id);
    await bumpAndCheck(guild, executor, "channelCreate", "Mass channel creation detected");
  });

  client.on("channelUpdate", async (oldCh, newCh) => {
    const guild = newCh.guild;
    if (!guild || guild.available === false) return;

    const overwritesChanged =
      oldCh.permissionOverwrites.cache.size !== newCh.permissionOverwrites.cache.size ||
      oldCh.permissionOverwrites.cache.some((o) => {
        const n = newCh.permissionOverwrites.cache.get(o.id);
        if (!n) return true;
        return o.allow.bitfield !== n.allow.bitfield || o.deny.bitfield !== n.deny.bitfield;
      });

    if (!overwritesChanged) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelOverwriteUpdate, newCh.id);
    await bumpAndCheck(guild, executor, "channelPermEdit", "Mass channel permission overwrite edits detected");
  });

  client.on("roleDelete", async (role) => {
    const guild = role.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, role.id);
    await bumpAndCheck(guild, executor, "roleDelete", "Role nuke detected");
  });

  client.on("roleCreate", async (role) => {
    const guild = role.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.RoleCreate, role.id);
    await bumpAndCheck(guild, executor, "roleCreate", "Mass role creation detected");
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    const guild = newRole.guild;
    if (!guild || guild.available === false) return;

    const gainedDanger =
      (!oldRole.permissions.has(PermissionsBitField.Flags.Administrator) &&
        newRole.permissions.has(PermissionsBitField.Flags.Administrator)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        newRole.permissions.has(PermissionsBitField.Flags.ManageGuild)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
        newRole.permissions.has(PermissionsBitField.Flags.ManageRoles)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
        newRole.permissions.has(PermissionsBitField.Flags.ManageChannels)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.ManageWebhooks) &&
        newRole.permissions.has(PermissionsBitField.Flags.ManageWebhooks)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.BanMembers) &&
        newRole.permissions.has(PermissionsBitField.Flags.BanMembers)) ||
      (!oldRole.permissions.has(PermissionsBitField.Flags.KickMembers) &&
        newRole.permissions.has(PermissionsBitField.Flags.KickMembers));

    if (!gainedDanger) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id);
    await bumpAndCheck(guild, executor, "rolePermEdit", "Dangerous role permission edits detected");
  });

  client.on("guildBanAdd", async (ban) => {
    const guild = ban.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await bumpAndCheck(guild, executor, "memberBan", "Mass ban detected");
  });

  client.on("webhooksUpdate", async (channel) => {
    const guild = channel.guild;
    if (!guild || guild.available === false) return;

    const executor =
      (await getAuditExecutor(guild, AuditLogEvent.WebhookCreate, null)) ||
      (await getAuditExecutor(guild, AuditLogEvent.WebhookDelete, null)) ||
      (await getAuditExecutor(guild, AuditLogEvent.WebhookUpdate, null));

    await bumpAndCheck(guild, executor, "webhookChange", "Webhook nuking detected");
  });

  // =========================
  // LOCKDOWN
  // =========================
  async function lockdownGuild(guild, executor, reason) {
    try {
      for (const role of guild.roles.cache.values()) {
        if (role.managed) continue;
        if (role.id === guild.id) continue; // @everyone

        const perms = role.permissions;
        const hasBad =
          perms.has(PermissionsBitField.Flags.Administrator) ||
          perms.has(PermissionsBitField.Flags.ManageGuild) ||
          perms.has(PermissionsBitField.Flags.ManageRoles) ||
          perms.has(PermissionsBitField.Flags.ManageChannels) ||
          perms.has(PermissionsBitField.Flags.ManageWebhooks) ||
          perms.has(PermissionsBitField.Flags.BanMembers) ||
          perms.has(PermissionsBitField.Flags.KickMembers);

        if (!hasBad) continue;

        const safePerms = perms
          .remove(PermissionsBitField.Flags.Administrator)
          .remove(PermissionsBitField.Flags.ManageGuild)
          .remove(PermissionsBitField.Flags.ManageRoles)
          .remove(PermissionsBitField.Flags.ManageChannels)
          .remove(PermissionsBitField.Flags.ManageWebhooks)
          .remove(PermissionsBitField.Flags.BanMembers)
          .remove(PermissionsBitField.Flags.KickMembers);

        await role.setPermissions(safePerms, `[BRIGHT][ANTINUKE] ${reason}`).catch(() => {});
      }

      const alertChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)
      );

      const msg =
        `🚨 **BRIGHT ANTI-NUKE LOCKDOWN ACTIVATED**\n` +
        `**Reason:** ${reason}\n` +
        `**Executor:** ${executor ? `${executor.tag} (${executor.id})` : "Unknown"}\n` +
        `✅ Removed destructive permissions from roles.\n` +
        `⚠️ Review **Audit Logs** immediately.`;

      await alertChannel?.send({ content: msg }).catch(() => {});
    } catch (err) {
      client.logger?.error?.(`[BRIGHT][ANTINUKE] Lockdown failed:`, err);
    }
  }
};
