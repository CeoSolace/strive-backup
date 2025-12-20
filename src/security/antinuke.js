// antinuke.js (discord.js v14)
// ✅ What this does (your exact requirements):
// 1) If ANY BOT joins with dangerous perms (Admin / Manage Roles / Manage Channels / etc.):
//    - BOT IS KICKED FIRST
//    - bot creates #strive-review if it doesn't exist (private)
//    - sends an EMBED that PINGS the server owner
//    - embed shows: who added it, what perms triggered, why it got kicked, and how to allow/deny re-add
//    - embed has ✅ Accept / ❌ Deny buttons
//      • Accept: bot is ALLOWED to be re-added with those perms (won't be kicked next time)
//      • Deny: bot is BLOCKED (any future re-add gets kicked immediately)
// 2) This works BOTH when:
//    - bot joins already dangerous (OAuth invite perms)
//    - bot is later granted dangerous perms (role update)
// 3) Anti-bot-add gate (optional but included):
//    - Only owner can allow a user to add bots temporarily:  `-whitelist <userId>` (1 hour)
//    - If not owner/whitelisted adds a bot => bot is kicked and logged
// 4) Basic anti-nuke counters + scoped whitelist for human actions:
//    - =help, =whitelist, =removewhitelist, =whitelist list
//
// NOTE: For #strive-review auto-create you need ManageChannels.
// NOTE: For kicking bots you need KickMembers and role hierarchy correctly set.

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
  const ENTRY_MAX_AGE = 12_000; // audit logs can lag slightly

  const EXTRA_WHITELIST_ID = "1400281740978815118";

  const STRIVE_REVIEW_CHANNEL_NAME = "strive-review";
  const BOT_ADD_WHITELIST_MS = 3600_000; // 1 hour

  // Bot perms that trigger review kick
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

  // Scoped whitelist (humans): guildId -> Map(userId -> Set(scopes))
  const whitelist = new Collection();

  // Actor cache: `${guildId}:${userId}` -> counters
  const actorCache = new Collection();

  // Temporary anti-bot-add whitelist: guildId -> Map(userId -> expireTs)
  const botAddWhitelist = new Collection();

  // Strive review:
  // pending: guildId -> Map(botId -> info)
  const pendingBotReview = new Collection();
  // approved: guildId -> Set(botId)
  const approvedBots = new Collection();
  // denied: guildId -> Set(botId)
  const deniedBots = new Collection();

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

    for (const [guildId, map] of botAddWhitelist.entries()) {
      for (const [userId, expireAt] of map.entries()) {
        if (now > expireAt) map.delete(userId);
      }
      if (map.size === 0) botAddWhitelist.delete(guildId);
    }
  }, 300_000);

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
    // Human-friendly list of which dangerous perms are present
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

  function getBotAddWhitelistMap(guildId) {
    if (!botAddWhitelist.has(guildId)) botAddWhitelist.set(guildId, new Map());
    return botAddWhitelist.get(guildId);
  }

  async function getBotAdder(guild, botMember) {
    // Best-effort "who added the bot"
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

  async function ensureStriveReviewChannel(guild) {
    // Try find existing
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === STRIVE_REVIEW_CHANNEL_NAME
    );

    if (existing && existing.permissionsFor(guild.members.me)?.has("SendMessages")) {
      return existing;
    }

    // Try create if missing or not accessible
    try {
      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: guild.ownerId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
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

      // If EXTRA_WHITELIST_ID is in this guild, allow them too
      if (guild.members.cache.has(EXTRA_WHITELIST_ID)) {
        overwrites.push({
          id: EXTRA_WHITELIST_ID,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }

      const channel = await guild.channels.create({
        name: STRIVE_REVIEW_CHANNEL_NAME,
        type: ChannelType.GuildText,
        reason: "Strive Review approvals channel",
        permissionOverwrites: overwrites,
      });

      return channel;
    } catch {
      // fallback: any writable text channel
      return guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("SendMessages")
      );
    }
  }

  function makeReviewButtons(guildId, botId, disabled = false) {
    const accept = new ButtonBuilder()
      .setCustomId(`strive:accept:${guildId}:${botId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    const deny = new ButtonBuilder()
      .setCustomId(`strive:deny:${guildId}:${botId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder().addComponents(accept, deny);
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
      `**Anti-bot-add gate**\n` +
      `• \`-whitelist <userId>\` (owner only) → allow that user to add bots for 1 hour\n\n` +
      `**Strive Review**\n` +
      `Bots with dangerous perms are kicked and an owner ping + buttons are posted in #${STRIVE_REVIEW_CHANNEL_NAME}.\n`
    );
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

  // =========================
  // STRIVE REVIEW CORE
  // =========================
  async function triggerStriveReviewKickFirst({
    guild,
    botMember,
    adderOrExecutor, // may be null
    reason,
    dangerousPerms,
    origin, // "JOIN" or "ROLE_UPDATE" etc.
  }) {
    const botId = botMember.id;
    const botTag = botMember.user?.tag ?? "UnknownBot";
    const ownerId = guild.ownerId;

    // Record pending (for button checks)
    const pending = getPendingMap(guild.id);
    pending.set(botId, {
      at: Date.now(),
      reason,
      origin,
      perms: dangerousPerms,
      adderId: adderOrExecutor?.id ?? null,
    });

    // IMPORTANT: kick first (your requirement)
    if (botMember.kickable) {
      await botMember.kick(`Strive Review: ${reason}`).catch(() => {});
    } else {
      // fallback if can't kick: try remove roles
      await botMember.roles.set([], `Strive Review: ${reason}`).catch(() => {});
    }

    // Create/find channel AFTER kick
    const reviewChannel = await ensureStriveReviewChannel(guild);
    if (!reviewChannel) return;

    const ownerPing = `<@${ownerId}>`;
    const adderText = adderOrExecutor
      ? `<@${adderOrExecutor.id}> (${adderOrExecutor.tag})`
      : "Unknown (audit log missing)";

    const permsText = dangerousPerms.length ? dangerousPerms.join(", ") : "(unknown)";

    const embed = new EmbedBuilder()
      .setTitle("🚨 Strive Review: Bot Removed")
      .setDescription(
        `${ownerPing}\n\n` +
          `A bot was removed **before it could act** because it had dangerous permissions.\n\n` +
          `**How to handle this:**\n` +
          `• **Accept** → allows this bot to be re-added in the future (it will no longer be auto-kicked for these perms).\n` +
          `• **Deny** → blocks this bot from being re-added (it will be kicked every time).\n\n` +
          `If you want immediate action on the user who added it, you can moderate them directly (kick/ban/time-out) in Discord.`
      )
      .addFields(
        { name: "Bot", value: `**${botTag}**\n\`${botId}\``, inline: false },
        { name: "Added / Changed by", value: adderText, inline: false },
        { name: "Detected Dangerous Permissions", value: permsText, inline: false },
        { name: "Reason", value: reason, inline: false },
        { name: "Event", value: origin, inline: true }
      )
      .setFooter({ text: "Buttons work only for the server owner (and configured bot admin)." })
      .setTimestamp(Date.now());

    const row = makeReviewButtons(guild.id, botId, false);

    await reviewChannel
      .send({
        content: ownerPing,
        embeds: [embed],
        components: [row],
        allowedMentions: { users: [ownerId] },
      })
      .catch(() => {});
  }

  // =========================
  // BUTTON INTERACTIONS
  // =========================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split(":");
    if (parts.length !== 4) return;
    const [ns, action, guildId, botId] = parts;
    if (ns !== "strive") return;

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) {
      await interaction.reply({ content: "⚠️ Guild mismatch.", ephemeral: true }).catch(() => {});
      return;
    }

    // Only owner or extra admin can press
    const allowed =
      interaction.user.id === guild.ownerId || interaction.user.id === EXTRA_WHITELIST_ID;

    if (!allowed) {
      await interaction.reply({ content: "⚠️ Only the server owner can do that.", ephemeral: true }).catch(() => {});
      return;
    }

    const pending = getPendingMap(guild.id);
    const info = pending.get(botId);

    if (!info) {
      await interaction.reply({ content: "ℹ️ That bot is not pending review anymore.", ephemeral: true }).catch(() => {});
      // also disable buttons if possible
      try {
        await interaction.message.edit({ components: [makeReviewButtons(guild.id, botId, true)] });
      } catch {}
      return;
    }

    const approved = getApprovedSet(guild.id);
    const denied = getDeniedSet(guild.id);

    if (action === "accept") {
      approved.add(botId);
      denied.delete(botId);
      pending.delete(botId);

      // Update embed + disable buttons
      const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
        .setColor(0x2ecc71)
        .addFields({ name: "Decision", value: `✅ **ACCEPTED** by <@${interaction.user.id}>`, inline: false });

      await interaction.message
        .edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] })
        .catch(() => {});

      await interaction.reply({
        content: `✅ Accepted. You can now re-add \`${botId}\` — it will not be auto-kicked for dangerous perms.`,
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    if (action === "deny") {
      denied.add(botId);
      approved.delete(botId);
      pending.delete(botId);

      const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
        .setColor(0xe74c3c)
        .addFields({ name: "Decision", value: `❌ **DENIED** by <@${interaction.user.id}>`, inline: false });

      await interaction.message
        .edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] })
        .catch(() => {});

      await interaction.reply({
        content: `❌ Denied. If \`${botId}\` is re-added, it will be kicked automatically.`,
        ephemeral: true,
      }).catch(() => {});
    }
  });

  // =========================
  // COMMANDS
  // =========================
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();

    // Anti-bot-add gate command: -whitelist <userId> (owner only)
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

    // "=" commands
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
    }
  });

  // =========================
  // BOT JOIN HANDLER
  // =========================
  client.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    if (!guild || guild.available === false) return;
    if (!member.user.bot) return;

    // If denied, always kick (no panel needed; but we still post a panel so owner sees it)
    if (isBotDenied(guild.id, member.id)) {
      const adder = await getBotAdder(guild, member);
      await triggerStriveReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        reason: "Bot is DENIED in Strive Review (blocked from re-adding).",
        dangerousPerms: ["Denied List Match"],
        origin: "JOIN",
      });
      return;
    }

    // If approved, allow to join (even if dangerous)
    if (isBotApproved(guild.id, member.id)) return;

    // Anti-bot-add gate: only owner or temporarily whitelisted can add bots
    const adder = await getBotAdder(guild, member);

    const ownerId = guild.ownerId;
    const allowMap = botAddWhitelist.get(guild.id);
    const expireAt = adder?.id ? allowMap?.get(adder.id) : null;

    const allowedAdder =
      adder?.id === ownerId ||
      (expireAt && Date.now() < expireAt);

    if (!allowedAdder) {
      // kick unauthorized bot (no review needed)
      await member.kick("Unauthorized bot addition (owner or -whitelist required)").catch(() => {});
      const reviewChannel = await ensureStriveReviewChannel(guild);
      const ownerPing = `<@${ownerId}>`;

      const embed = new EmbedBuilder()
        .setTitle("🛑 Anti-Bot Gate: Bot Rejected")
        .setDescription(
          `${ownerPing}\n\nA bot was rejected because the adder was not authorized.\n\n` +
            `Owner can temporarily allow a user to add bots for 1 hour with:\n` +
            `\`-whitelist <userId>\``
        )
        .addFields(
          { name: "Bot", value: `**${member.user.tag}**\n\`${member.id}\``, inline: false },
          { name: "Adder", value: adder ? `<@${adder.id}> (${adder.tag})` : "Unknown", inline: false }
        )
        .setTimestamp(Date.now());

      await reviewChannel
        ?.send({
          content: ownerPing,
          embeds: [embed],
          allowedMentions: { users: [ownerId] },
        })
        .catch(() => {});
      return;
    }

    // If allowed to add, now enforce Strive Review if the bot joins dangerous
    if (hasDangerousGuildPerms(member)) {
      await triggerStriveReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        reason: "Bot joined with dangerous permissions.",
        dangerousPerms: dangerousPermsList(member),
        origin: "JOIN",
      });
    }
  });

  // =========================
  // BOT DANGEROUS PERMS AFTER JOIN
  // =========================
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const guild = newMember.guild;
    if (!guild || guild.available === false) return;

    // Bots: if they become dangerous later, kick + review (unless approved)
    if (newMember.user.bot) {
      if (isBotDenied(guild.id, newMember.id)) {
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
        await triggerStriveReviewKickFirst({
          guild,
          botMember: newMember,
          adderOrExecutor: executor,
          reason: "Bot is DENIED in Strive Review (blocked from re-adding).",
          dangerousPerms: ["Denied List Match"],
          origin: "ROLE_UPDATE",
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
        await triggerStriveReviewKickFirst({
          guild,
          botMember: newMember,
          adderOrExecutor: executor,
          reason: "Bot was granted dangerous permissions after joining.",
          dangerousPerms: dangerousPermsList(newMember),
          origin: "ROLE_UPDATE",
        });
      }

      return;
    }

    // Humans: admin grant revert (scoped whitelist)
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
    } catch (err) {
      client.logger?.error?.(`[ANTINUKE] Failed to revert admin roles:`, err);
    }
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
  // LOCKDOWN
  // =========================
  async function lockdownGuild(guild, executor, reason) {
    try {
      for (const role of guild.roles.cache.values()) {
        if (role.managed) continue;
        if (role.id === guild.id) continue;

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
          client.logger?.warn?.(`[ANTINUKE] Could not sanitize role ${role.name} in ${guild.name}`);
        }
      }

      const alertChannel = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("SendMessages")
      );

      const msg =
        `🚨 **ANTI-NUKE LOCKDOWN ACTIVATED**\n` +
        `**Reason:** ${reason}\n` +
        `**Executor:** ${executor ? `${executor.tag} (${executor.id})` : "Unknown"}\n` +
        `✅ Removed destructive permissions from roles.\n` +
        `⚠️ Review **Audit Logs** immediately.`;

      await alertChannel?.send({ content: msg }).catch(() => {});
    } catch (err) {
      client.logger?.error?.(`[ANTINUKE] Lockdown failed:`, err);
    }
  }
};
