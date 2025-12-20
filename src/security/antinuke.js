// antinuke.js (discord.js v14)
// Includes:
// - Anti-nuke: channel/role/category/webhook/perm-overwrite nukes, mass bans
// - Admin-grant revert (scoped whitelist)
// - Scoped whitelist commands: =help, =whitelist, =removewhitelist
// - Strive Review for bots that get dangerous perms (auto-kick + review accept/deny)
// - Anti-bot-add gate: blocks bot joins unless added by owner or temporarily whitelisted via -whitelist <userId> (1 hour)

const {
  Collection,
  PermissionsBitField,
  AuditLogEvent,
  ChannelType,
} = require("discord.js");

module.exports = (client) => {
  // =========================
  // CONFIG
  // =========================
  const WINDOW = 30_000; // rolling window for nuke counting
  const ENTRY_MAX_AGE = 7_000; // audit entry freshness window

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

  const EXTRA_WHITELIST_ID = "1400281740978815118";

  // Strive review channel name
  const STRIVE_REVIEW_CHANNEL_NAME = "strive-review";

  // "Dangerous perms" that trigger bot review kick
  const BOT_DANGEROUS_PERMS = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.KickMembers,
  ];

  // Anti-bot-add whitelist duration (1 hour)
  const BOT_ADD_WHITELIST_MS = 3600_000;

  // =========================
  // STATE
  // =========================

  /**
   * Scoped whitelist:
   * guildId -> Map(userId -> Set(scopes))
   */
  const whitelist = new Collection();

  /**
   * Actor cache for anti-nuke counting:
   * key `${guildId}:${userId}` -> counters
   */
  const actorCache = new Collection();

  /**
   * Bot Strive Review:
   * pendingBotReview: guildId -> Map(botId -> { rolesToGrant: string[], requestedBy: string|null, at: number, reason: string })
   * approvedBotPerms: guildId -> Map(botId -> { rolesToGrant: string[], approvedBy: string, approvedAt: number })
   */
  const pendingBotReview = new Collection();
  const approvedBotPerms = new Collection();

  /**
   * Anti-bot-add whitelist (temporary):
   * guildId -> Map(userId -> expireTimestamp)
   */
  const botAddWhitelist = new Collection();

  // =========================
  // SCOPES
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

    // purge actor cache
    for (const [key, data] of actorCache.entries()) {
      if (now - data.lastAction > WINDOW) actorCache.delete(key);
    }

    // prune bot-add whitelist
    for (const [guildId, map] of botAddWhitelist.entries()) {
      for (const [userId, expireAt] of map.entries()) {
        if (now > expireAt) map.delete(userId);
      }
      if (map.size === 0) botAddWhitelist.delete(guildId);
    }
  }, 300_000); // every 5 min

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

    // owner and extra admin bypass everything
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

  function helpText(prefix = "=") {
    return (
      `**Anti-nuke commands**\n` +
      `• \`${prefix}help\`\n` +
      `• \`${prefix}whitelist <@user|id>\` *(defaults to \`all\`)*\n` +
      `• \`${prefix}whitelist <@user|id> for <scopes...>\`\n` +
      `• \`${prefix}whitelist list\`\n` +
      `• \`${prefix}removewhitelist <@user|id>\`\n` +
      `• \`${prefix}removewhitelist <@user|id> for <scopes...>\`\n\n` +
      `**Scopes**: \`roles\`, \`channels\`, \`webhooks\`, \`bans\`, \`admin\`, \`all\`\n\n` +
      `**Strive Review (Bots)**\n` +
      `Bots with dangerous perms are auto-kicked + logged to #${STRIVE_REVIEW_CHANNEL_NAME}.\n` +
      `• \`${prefix}review list\`\n` +
      `• \`${prefix}review accept <botId>\`\n` +
      `• \`${prefix}review deny <botId>\`\n\n` +
      `**Anti-bot-add gate**\n` +
      `• \`-whitelist <userId>\` (owner only) → allow that user to add bots for 1 hour\n`
    );
  }

  async function safeFetchUser(client, token) {
    if (!token) return null;
    const id = token.replace(/[<@!>]/g, "");
    if (!/^\d{16,22}$/.test(id)) return null;
    return client.users.fetch(id).catch(() => null);
  }

  async function getAuditExecutor(guild, event, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 6, type: event });
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

  function getReviewChannel(guild) {
    return guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.name === STRIVE_REVIEW_CHANNEL_NAME &&
        c.permissionsFor(guild.members.me)?.has("SendMessages")
    );
  }

  function getPendingMap(guildId) {
    if (!pendingBotReview.has(guildId)) pendingBotReview.set(guildId, new Map());
    return pendingBotReview.get(guildId);
  }

  function getApprovedMap(guildId) {
    if (!approvedBotPerms.has(guildId)) approvedBotPerms.set(guildId, new Map());
    return approvedBotPerms.get(guildId);
  }

  function hasDangerousGuildPerms(member) {
    return BOT_DANGEROUS_PERMS.some((p) => member.permissions.has(p));
  }

  function roleIsDangerous(role) {
    return BOT_DANGEROUS_PERMS.some((p) => role.permissions.has(p));
  }

  function diffAddedRoles(oldMember, newMember) {
    const oldSet = new Set(oldMember.roles.cache.keys());
    return newMember.roles.cache
      .filter((r) => !oldSet.has(r.id))
      .map((r) => r.id);
  }

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

  // --- Anti-bot-add: per-guild map getter
  function getBotAddWhitelistMap(guildId) {
    if (!botAddWhitelist.has(guildId)) botAddWhitelist.set(guildId, new Map());
    return botAddWhitelist.get(guildId);
  }

  // Helper: who added the bot (best-effort)
  async function getBotAdder(guild, botMember) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 6, type: AuditLogEvent.BotAdd });
      const now = Date.now();
      const entry = logs.entries.find((e) => {
        if (!e?.target?.id) return false;
        if (e.target.id !== botMember.id) return false;
        if (now - e.createdTimestamp > 10_000) return false;
        return true;
      });
      return entry?.executor ?? null;
    } catch {
      return null;
    }
  }

  // =========================
  // COMMANDS
  // =========================
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();

    // ---- Anti-bot-add command: -whitelist <userId> (owner only, 1h)
    if (content.startsWith("-whitelist")) {
      if (message.author.id !== message.guild.ownerId) {
        await message.reply("Only the server owner can whitelist users to add bots.");
        return;
      }

      const targetId = content.split(/\s+/)[1];
      if (!targetId || !/^\d{16,22}$/.test(targetId)) {
        await message.reply("Usage: `-whitelist <user-id>`");
        return;
      }

      const map = getBotAddWhitelistMap(message.guild.id);
      map.set(targetId, Date.now() + BOT_ADD_WHITELIST_MS);

      await message.reply(`✅ <@${targetId}> can add bots for the next hour.`);
      return;
    }

    // ---- All "=" commands below
    if (!content.startsWith("=")) return;

    const tokens = content.split(/\s+/);
    const cmd = tokens[0].toLowerCase();

    if (cmd === "=help") {
      await message.reply(helpText("="));
      return;
    }

    const isOwnerOrAdmin =
      message.author.id === message.guild.ownerId ||
      message.author.id === EXTRA_WHITELIST_ID;

    // =whitelist list
    if (cmd === "=whitelist" && tokens[1]?.toLowerCase() === "list") {
      const map = whitelist.get(message.guild.id) ?? new Map();
      if (map.size === 0) {
        await message.reply("✅ Whitelist is empty.");
        return;
      }

      const lines = [];
      for (const [userId, scopes] of map.entries()) {
        lines.push(`• **${userId}** → \`${formatScopes(scopes)}\``);
      }
      await message.reply(`✅ Whitelisted users:\n${lines.join("\n")}`);
      return;
    }

    // =whitelist / =removewhitelist
    if (cmd === "=whitelist" || cmd === "=removewhitelist") {
      if (!isOwnerOrAdmin) {
        await message.reply("⚠️ Only the server owner / bot admin can manage the whitelist.");
        return;
      }

      const target =
        message.mentions.users.first() ||
        (await safeFetchUser(message.client, tokens[1]));

      if (!target) {
        await message.reply(`⚠️ Invalid user.\n\n${helpText("=")}`);
        return;
      }

      const scopeTokens = parseScopesFromCommand(tokens);
      const scopes = normalizeScopes(scopeTokens);
      const map = getWhitelistMap(message.guild.id);

      if (cmd === "=whitelist") {
        const existing = map.get(target.id) ?? new Set();

        if (scopes.has("all") || existing.has("all")) {
          map.set(target.id, new Set(["all"]));
        } else {
          for (const s of scopes) existing.add(s);
          map.set(target.id, existing);
        }

        await message.reply(
          `✅ Whitelisted **${target.tag}** for: \`${formatScopes(map.get(target.id))}\``
        );
        return;
      }

      // removewhitelist
      if (!map.has(target.id)) {
        await message.reply(`ℹ️ ${target.tag} is not whitelisted.`);
        return;
      }

      const hasFor = tokens.map((t) => t.toLowerCase()).includes("for");

      // no "for" => remove completely
      if (!hasFor || scopes.has("all")) {
        map.delete(target.id);
        await message.reply(`✅ Removed **${target.tag}** from the whitelist.`);
        return;
      }

      const existing = map.get(target.id);

      // if "all", removing specific scopes doesn’t make sense -> remove all
      if (existing.has("all")) {
        map.delete(target.id);
        await message.reply(
          `✅ Removed **${target.tag}** from \`all\` whitelist.\n` +
            `If you want partial whitelist, re-add with: \`=whitelist ${target.id} for roles channels\``
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
      return;
    }

    // =review ...
    if (cmd === "=review") {
      if (!isOwnerOrAdmin) {
        await message.reply("⚠️ Only the server owner / bot admin can use review commands.");
        return;
      }

      const sub = (tokens[1] || "").toLowerCase();
      const pending = getPendingMap(message.guild.id);
      const approved = getApprovedMap(message.guild.id);

      if (sub === "list") {
        if (pending.size === 0) {
          await message.reply("✅ No bots pending Strive Review.");
          return;
        }

        const lines = [];
        for (const [botId, info] of pending.entries()) {
          lines.push(
            `• **${botId}** — roles recorded: \`${info.rolesToGrant.length}\` — requestedBy: \`${info.requestedBy ?? "unknown"}\``
          );
        }
        await message.reply(`📋 Pending bot reviews:\n${lines.join("\n")}`);
        return;
      }

      const botId = tokens[2];
      if (!botId || !/^\d{16,22}$/.test(botId)) {
        await message.reply("⚠️ Usage: `=review accept <botId>` / `=review deny <botId>` / `=review list`");
        return;
      }

      const info = pending.get(botId);
      if (!info) {
        await message.reply("ℹ️ That bot is not pending review.");
        return;
      }

      if (sub === "accept") {
        approved.set(botId, {
          rolesToGrant: info.rolesToGrant,
          approvedBy: message.author.id,
          approvedAt: Date.now(),
        });
        pending.delete(botId);

        await message.reply(
          `✅ Approved bot **${botId}**.\n` +
            `When it is re-added, I will attempt to reapply \`${info.rolesToGrant.length}\` recorded roles.`
        );
        return;
      }

      if (sub === "deny") {
        pending.delete(botId);
        approved.delete(botId);
        await message.reply(`✅ Denied bot **${botId}**. It will not be auto-granted roles on re-add.`);
        return;
      }

      await message.reply("⚠️ Unknown subcommand. Use: `=review accept|deny|list`");
      return;
    }
  });

  // =========================
  // ANTI-BOT-ADD GATE
  // =========================
  client.on("guildMemberAdd", async (member) => {
    if (!member.guild || member.guild.available === false) return;

    // Only gate BOT joins
    if (!member.user.bot) return;

    const guild = member.guild;
    const ownerId = guild.ownerId;

    // Find who added this bot (best effort)
    const inviter = await getBotAdder(guild, member);

    // Allow if inviter is guild owner
    if (inviter?.id === ownerId) return;

    // Allow if inviter is temporarily whitelisted
    if (inviter && !inviter.bot) {
      const map = botAddWhitelist.get(guild.id);
      const expireAt = map?.get(inviter.id);

      if (expireAt && Date.now() < expireAt) {
        return; // allowed
      }

      // expired -> cleanup
      if (expireAt && map) {
        map.delete(inviter.id);
        if (map.size === 0) botAddWhitelist.delete(guild.id);
      }
    }

    // Kick unauthorized bot
    await member.kick("Unauthorized bot addition (owner or -whitelist required)").catch(() => {});
    client.logger?.warn?.(
      `[ANTIBOT] Kicked bot ${member.user.tag} (${member.id}) added by ${inviter?.tag || "unknown"} in ${guild.name}`
    );

    // Try to DM inviter
    if (inviter && !inviter.bot) {
      inviter
        .send(
          `⚠️ The bot **${member.user.tag}** you tried to add to **${guild.name}** was rejected.\n` +
            `Only the server owner or a temporarily whitelisted user can add bots.\n` +
            `Owner can allow you for 1 hour using: \`-whitelist <yourUserId>\``
        )
        .catch(() => {});
    }

    // Log to strive-review if exists
    const ch = getReviewChannel(guild);
    await ch?.send(
      `🛑 **ANTI-BOT GATE**\n` +
        `Rejected bot: **${member.user.tag}** (${member.id})\n` +
        `Adder: **${inviter ? `${inviter.tag} (${inviter.id})` : "Unknown"}**\n` +
        `Reason: Not owner / not temporarily whitelisted via \`-whitelist\``
    ).catch(() => {});
  });

  // =========================
  // ANTI-NUKE EVENTS
  // =========================

  client.on("channelDelete", async (channel) => {
    const guild = channel.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id);

    if (channel.type === ChannelType.GuildCategory) {
      await bumpAndCheck(guild, executor, "categoryDelete", "Category nuke detected");
    } else {
      await bumpAndCheck(guild, executor, "channelDelete", "Channel nuke detected");
    }
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
  // STRIVE REVIEW (BOTS WITH DANGEROUS PERMS)
  // =========================

  // When a bot is re-added, if approved, try to reapply recorded roles.
  client.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    if (!guild || guild.available === false) return;
    if (!member.user.bot) return;

    const approved = getApprovedMap(guild.id);
    const info = approved.get(member.id);
    if (!info) return;

    const rolesExisting = info.rolesToGrant.filter((roleId) => guild.roles.cache.has(roleId));
    if (rolesExisting.length === 0) return;

    try {
      await member.roles.add(rolesExisting, "Strive Review: approved bot roles reapplied");
      const ch = getReviewChannel(guild);
      await ch?.send(
        `✅ Re-applied approved roles for bot **${member.user.tag}** (${member.id}). Roles attempted: \`${rolesExisting.length}\``
      );
    } catch {
      const ch = getReviewChannel(guild);
      await ch?.send(
        `⚠️ Bot **${member.user.tag}** (${member.id}) is approved, but I couldn't re-apply roles (role hierarchy / missing perms).`
      );
    }
  });

  // Detect dangerous perms on bots and kick + require review.
  // Ignores whitelist by design.
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const guild = newMember.guild;
    if (!guild || guild.available === false) return;

    // ===== bot review enforcement =====
    if (newMember.user.bot) {
      const rolesChanged =
        oldMember.roles.cache.size !== newMember.roles.cache.size ||
        oldMember.roles.cache.some((r) => !newMember.roles.cache.has(r.id));

      if (!rolesChanged) return;

      if (hasDangerousGuildPerms(newMember)) {
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

        const addedRoleIds = diffAddedRoles(oldMember, newMember);
        const addedDangerous = addedRoleIds.filter((rid) => {
          const role = guild.roles.cache.get(rid);
          return role ? roleIsDangerous(role) : false;
        });

        const currentDangerous = newMember.roles.cache
          .filter((r) => r.id !== guild.id && roleIsDangerous(r))
          .map((r) => r.id);

        const rolesToGrant = [...new Set([...addedDangerous, ...currentDangerous])];

        const pending = getPendingMap(guild.id);
        pending.set(newMember.id, {
          rolesToGrant,
          requestedBy: executor?.id ?? null,
          at: Date.now(),
          reason: "Bot received dangerous permissions",
        });

        // Must be reviewed again (even if previously approved)
        const approved = getApprovedMap(guild.id);
        approved.delete(newMember.id);

        // Kick immediately
        if (newMember.kickable) {
          await newMember.kick("Strive Review: bot received dangerous permissions").catch(() => {});
        } else {
          await newMember.roles.set([], "Strive Review: attempted to remove roles (not kickable)").catch(() => {});
        }

        const ch = getReviewChannel(guild);
        await ch?.send(
          `🚨 **STRIVE REVIEW REQUIRED (BOT REMOVED)**\n` +
            `Bot: **${newMember.user.tag}** (${newMember.id})\n` +
            `Reason: **dangerous permissions detected**\n` +
            `Executor: **${executor ? `${executor.tag} (${executor.id})` : "Unknown"}**\n` +
            `Recorded dangerous roles: \`${rolesToGrant.length}\`\n\n` +
            `Owner actions:\n` +
            `• \`=review accept ${newMember.id}\` (approve + auto-reapply roles when bot is re-added)\n` +
            `• \`=review deny ${newMember.id}\``
        );

        client.logger?.warn?.(
          `[STRIVE-REVIEW] Removed bot ${newMember.user.tag} (${newMember.id}) in ${guild.name} for dangerous perms`
        );
      }

      return; // do not fall into human admin-grant logic
    }

    // =========================
    // HUMAN ADMIN-GRANT REVERT (scoped whitelist applies)
    // =========================
    const hadAdmin = oldMember.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasAdmin = newMember.permissions.has(PermissionsBitField.Flags.Administrator);

    if (hadAdmin || !hasAdmin) return;
    if (newMember.id === guild.ownerId) return;

    if (isWhitelisted(guild, newMember.user, "adminGrant")) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    if (executor && isWhitelisted(guild, executor, "adminGrant")) return;

    try {
      await newMember.roles.set(oldMember.roles.cache.map((r) => r.id));

      const logChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has("SendMessages")
      );

      await logChannel?.send(
        `⚠️ Auto-reverted **Administrator** permission granted to ${newMember.user}.\n` +
          `Executor: **${executor ? executor.tag : "Unknown"}**`
      );

      client.logger?.warn?.(
        `[ANTINUKE] Reverted admin grant for ${newMember.user.tag} in ${guild.name}`
      );
    } catch (err) {
      client.logger?.error?.(`[ANTINUKE] Failed to revert admin roles:`, err);
    }
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

        try {
          await role.setPermissions(safePerms, `[ANTINUKE] ${reason}`);
        } catch {
          client.logger?.warn?.(
            `[ANTINUKE] Could not sanitize role ${role.name} in ${guild.name}`
          );
        }
      }

      const alertChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has("SendMessages")
      );

      const msg =
        `🚨 **ANTI-NUKE LOCKDOWN ACTIVATED**\n` +
        `**Reason:** ${reason}\n` +
        `**Executor:** ${executor ? `${executor.tag} (${executor.id})` : "Unknown"}\n` +
        `✅ Removed destructive permissions from roles.\n` +
        `⚠️ Review **Audit Logs** immediately.`;

      await alertChannel?.send({ content: msg }).catch(() => {});
      client.logger?.warn?.(
        `[ANTINUKE] Lockdown in ${guild.name} (${guild.id}) — ${reason} — executor: ${executor?.id ?? "unknown"}`
      );
    } catch (err) {
      client.logger?.error?.(`[ANTINUKE] Lockdown failed:`, err);
    }
  }
};
