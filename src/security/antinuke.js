// antinuke.js (discord.js v14)
// Strive Review ONLY (no anti-bot-add gate)
//
// ✅ If a bot has dangerous perms (on JOIN or later via role update):
//    - kick first
//    - create #strive-review if missing
//    - send embed pinging owner with Accept / Deny buttons
// ✅ Accept => bot is allowed to rejoin in future even with dangerous perms
// ✅ Deny   => bot is blocked (kicked every time)
//
// Plus: basic anti-nuke counters (channels/roles/webhooks/bans)
// + optional human admin-grant revert with scoped whitelist.
// + anti-mass role removal: removing 5 roles within ~3 minutes => derole executor + owner review panel (restore/keep)

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

  const EXTRA_WHITELIST_ID = "1400281740978815118";
  const STRIVE_REVIEW_CHANNEL_NAME = "strive-review";

  // Dedupe to stop triple panels from cascaded events
  const STRIVE_DEDUPE_MS = 60_000;

  // Anti mass role removal ("anti-massrole delete")
  const ROLE_STRIP_WINDOW = 180_000; // ~3 minutes
  const ROLE_STRIP_THRESHOLD = 5;

  // Bot perms that trigger Strive Review kick
  const BOT_DANGEROUS_PERMS = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.KickMembers,
  ];

  // Anti-nuke limits (tweak as needed)
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

  // Strive review:
  // pending: guildId -> Map(botId -> info)
  const pendingBotReview = new Collection();
  // approved: guildId -> Set(botId)
  const approvedBots = new Collection();
  // denied: guildId -> Set(botId)
  const deniedBots = new Collection();

  // Strive dedupe: `${guildId}:${botId}` -> lastPostedAt
  const striveDedupe = new Collection();

  // Human mass-role-strip counters: `${guildId}:${executorId}` -> { count, lastAction }
  const roleStripCache = new Collection();

  // Human review pending: guildId -> Map(userId -> { at, reason, origin, removedRoles })
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

    for (const [key, t] of striveDedupe.entries()) {
      if (now - t > STRIVE_DEDUPE_MS) striveDedupe.delete(key);
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

  async function ensureStriveReviewChannel(guild) {
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === STRIVE_REVIEW_CHANNEL_NAME
    );

    if (existing && existing.permissionsFor(guild.members.me)?.has("SendMessages")) return existing;

    try {
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
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

      if (guild.members.cache.has(EXTRA_WHITELIST_ID)) {
        overwrites.push({
          id: EXTRA_WHITELIST_ID,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }

      const ch = await guild.channels.create({
        name: STRIVE_REVIEW_CHANNEL_NAME,
        type: ChannelType.GuildText,
        reason: "Strive Review approvals channel",
        permissionOverwrites: overwrites,
      });

      return ch;
    } catch {
      return guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has("SendMessages")
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

  function makeHumanReviewButtons(guildId, userId, disabled = false) {
    const restore = new ButtonBuilder()
      .setCustomId(`strive:restore:${guildId}:${userId}`)
      .setLabel("Restore Roles")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled);

    const keep = new ButtonBuilder()
      .setCustomId(`strive:keep:${guildId}:${userId}`)
      .setLabel("Keep Derolled")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled);

    return new ActionRowBuilder().addComponents(restore, keep);
  }

  async function postStriveReviewPanel({
    guild,
    botId,
    botTag,
    ownerId,
    adder,
    reason,
    perms,
    origin,
  }) {
    const reviewChannel = await ensureStriveReviewChannel(guild);
    if (!reviewChannel) return;

    const ownerPing = `<@${ownerId}>`;
    const adderLine = adder ? `<@${adder.id}> (${adder.tag})` : "Unknown (audit log missing)";
    const permsLine = perms?.length ? perms.join(", ") : "(unknown)";

    const embed = new EmbedBuilder()
      .setTitle("🚨 Strive Review: Bot Kicked")
      .setDescription(
        `${ownerPing}\n\n` +
          `A bot was **kicked first** to prevent damage because it had **dangerous permissions**.\n\n` +
          `**What to do:**\n` +
          `• ✅ **Accept** — allows this bot to be re-added (it will NOT be auto-kicked for dangerous perms).\n` +
          `• ❌ **Deny** — blocks this bot ID (it will be kicked every time it is re-added).\n\n` +
          `**Immediate action on the adder:**\n` +
          `If needed, you can kick/ban/timeout the user who added the bot: ${
            adder ? `<@${adder.id}>` : "unknown"
          }`
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

  async function postHumanReviewPanel({ guild, targetUser, executor, reason, removedRoles }) {
    const reviewChannel = await ensureStriveReviewChannel(guild);
    if (!reviewChannel) return;

    const ownerId = guild.ownerId;
    const ownerPing = `<@${ownerId}>`;

    const removedPreview =
      removedRoles?.length
        ? removedRoles.map((r) => `<@&${r}>`).slice(0, 20).join(", ")
        : "(none)";

    const embed = new EmbedBuilder()
      .setTitle("🚨 Strive Review: Mass Role Removal Detected")
      .setDescription(
        `${ownerPing}\n\n` +
          `A user appears to be stripping roles quickly. As a precaution, they were **derolled** (not kicked).\n\n` +
          `**What to do:**\n` +
          `• ✅ **Restore Roles** — puts their previous roles back.\n` +
          `• ❌ **Keep Derolled** — leaves them stripped.\n`
      )
      .addFields(
        {
          name: "Executor",
          value: executor ? `<@${executor.id}> (${executor.tag})` : "Unknown",
          inline: false,
        },
        { name: "Reason", value: reason, inline: false },
        { name: "Previous Roles (snapshot)", value: removedPreview, inline: false }
      )
      .setFooter({ text: "Buttons only work for the server owner (and configured bot admin)." })
      .setTimestamp(Date.now());

    await reviewChannel
      .send({
        content: ownerPing,
        embeds: [embed],
        components: [makeHumanReviewButtons(guild.id, targetUser.id, false)],
        allowedMentions: { users: [ownerId] },
      })
      .catch(() => {});
  }

  async function triggerStriveReviewKickFirst({
    guild,
    botMember,
    adderOrExecutor,
    origin,
    reason,
  }) {
    const botId = botMember.id;

    // ---- DEDUPE: avoid multi-panels from cascading events ----
    const dk = `${guild.id}:${botId}`;
    const last = striveDedupe.get(dk) ?? 0;
    if (Date.now() - last < STRIVE_DEDUPE_MS) return;
    striveDedupe.set(dk, Date.now());
    // ---------------------------------------------------------

    const botTag = botMember.user?.tag ?? "UnknownBot";
    const ownerId = guild.ownerId;

    const perms = dangerousPermsList(botMember);

    // Store pending BEFORE we mutate roles/kick (prevents guildMemberUpdate loops)
    const pending = getPendingMap(guild.id);
    pending.set(botId, {
      at: Date.now(),
      reason,
      origin,
      perms,
      adderId: adderOrExecutor?.id ?? null,
    });

    // KICK FIRST (your requirement)
    if (botMember.kickable) {
      await botMember.kick(`Strive Review: ${reason}`).catch(() => {});
    } else {
      await botMember.roles.set([], `Strive Review: ${reason}`).catch(() => {});
    }

    // Then post review embed + buttons + owner ping
    await postStriveReviewPanel({
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

  async function deroleMemberKeepManaged(guild, member, reason) {
    const removable = member.roles.cache
      .filter((r) => r.id !== guild.id && !r.managed)
      .map((r) => r.id);

    const keepManaged = member.roles.cache.filter((r) => r.managed).map((r) => r.id);

    try {
      await member.roles.set(keepManaged, `[ANTINUKE] ${reason}`);
    } catch {}
    return removable;
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
  // BUTTON INTERACTIONS (Accept / Deny + Human Restore/Keep)
  // =========================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split(":");
    if (parts.length !== 4) return;
    const [ns, action, guildId, targetId] = parts;
    if (ns !== "strive") return;

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) {
      await interaction.reply({ content: "⚠️ Guild mismatch.", ephemeral: true }).catch(() => {});
      return;
    }

    const allowed =
      interaction.user.id === guild.ownerId || interaction.user.id === EXTRA_WHITELIST_ID;

    if (!allowed) {
      await interaction
        .reply({ content: "⚠️ Only the server owner can do that.", ephemeral: true })
        .catch(() => {});
      return;
    }

    // Bot decisions
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
          .addFields({
            name: "Decision",
            value: `✅ **ACCEPTED** by <@${interaction.user.id}>`,
            inline: false,
          });

        await interaction.message
          .edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] })
          .catch(() => {});

        await interaction
          .reply({
            content: `✅ Accepted. You can re-add \`${botId}\` and it will NOT be auto-kicked for dangerous perms.`,
            ephemeral: true,
          })
          .catch(() => {});
        return;
      }

      if (action === "deny") {
        denied.add(botId);
        approved.delete(botId);
        getPendingMap(guild.id).delete(botId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0xe74c3c)
          .addFields({
            name: "Decision",
            value: `❌ **DENIED** by <@${interaction.user.id}>`,
            inline: false,
          });

        await interaction.message
          .edit({ embeds: [edited], components: [makeReviewButtons(guild.id, botId, true)] })
          .catch(() => {});

        await interaction
          .reply({
            content: `❌ Denied. If \`${botId}\` is re-added, it will be kicked automatically.`,
            ephemeral: true,
          })
          .catch(() => {});
        return;
      }
    }

    // Human mass role removal decisions
    if (action === "restore" || action === "keep") {
      const userId = targetId;
      const pending = getPendingHumanMap(guild.id);
      const info = pending.get(userId);

      if (!info) {
        await interaction.reply({ content: "ℹ️ No pending human review found.", ephemeral: true }).catch(() => {});
        return;
      }

      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) {
        await interaction.reply({ content: "⚠️ User not found in guild.", ephemeral: true }).catch(() => {});
        return;
      }

      if (action === "restore") {
        const valid = (info.removedRoles ?? []).filter((rid) => {
          const r = guild.roles.cache.get(rid);
          return r && !r.managed;
        });

        try {
          const managed = targetMember.roles.cache.filter((r) => r.managed).map((r) => r.id);
          await targetMember.roles.set([...new Set([...managed, ...valid])], "Strive Review: restore roles");
        } catch {}

        pending.delete(userId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0x2ecc71)
          .addFields({ name: "Decision", value: `✅ **RESTORED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message
          .edit({ embeds: [edited], components: [makeHumanReviewButtons(guild.id, userId, true)] })
          .catch(() => {});

        await interaction.reply({ content: "✅ Roles restored (best-effort).", ephemeral: true }).catch(() => {});
        return;
      }

      if (action === "keep") {
        pending.delete(userId);

        const edited = EmbedBuilder.from(interaction.message.embeds?.[0] ?? new EmbedBuilder())
          .setColor(0xe74c3c)
          .addFields({ name: "Decision", value: `❌ **KEPT DEROLED** by <@${interaction.user.id}>`, inline: false });

        await interaction.message
          .edit({ embeds: [edited], components: [makeHumanReviewButtons(guild.id, userId, true)] })
          .catch(() => {});

        await interaction.reply({ content: "❌ Kept derolled.", ephemeral: true }).catch(() => {});
        return;
      }
    }
  });

  // =========================
  // COMMANDS (whitelist + help)
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
          `**Strive Review**\n` +
          `Bots with dangerous perms are kicked and an owner ping + Accept/Deny buttons are posted in #${STRIVE_REVIEW_CHANNEL_NAME}.\n` +
          `Humans stripping roles fast get derolled + owner review panel (Restore/Keep).\n`
      );
      return;
    }

    const isOwnerOrAdmin =
      message.author.id === message.guild.ownerId || message.author.id === EXTRA_WHITELIST_ID;

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

      await message.reply(
        `✅ Whitelisted **${target.tag}** for: \`${formatScopes(map.get(target.id))}\``
      );
      return;
    }

    // =removewhitelist
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
  // STRIVE REVIEW ENFORCEMENT
  // =========================

  // On bot join: if denied -> kick+review; if approved -> allow; else if dangerous -> kick+review
  client.on("guildMemberAdd", async (member) => {
    const guild = member.guild;
    if (!guild || guild.available === false) return;
    if (!member.user.bot) return;

    if (isBotDenied(guild.id, member.id)) {
      const adder = await getBotAdder(guild, member);
      await triggerStriveReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        origin: "JOIN",
        reason: "Bot is DENIED in Strive Review (blocked from re-adding).",
      });
      return;
    }

    if (isBotApproved(guild.id, member.id)) return;

    if (hasDangerousGuildPerms(member)) {
      const adder = await getBotAdder(guild, member);
      await triggerStriveReviewKickFirst({
        guild,
        botMember: member,
        adderOrExecutor: adder,
        origin: "JOIN",
        reason: "Bot joined with dangerous permissions.",
      });
    }
  });

  // If bot is granted dangerous perms later: kick+review (unless approved)
  // Plus: anti mass role removal (humans)
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const guild = newMember.guild;
    if (!guild || guild.available === false) return;

    // -------------------------
    // BOT REVIEW PATH
    // -------------------------
    if (newMember.user.bot) {
      // Ignore cascade updates right after we acted
      const pend = getPendingMap(guild.id).get(newMember.id);
      if (pend && Date.now() - pend.at < STRIVE_DEDUPE_MS) return;

      if (isBotDenied(guild.id, newMember.id)) {
        const executor = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
        await triggerStriveReviewKickFirst({
          guild,
          botMember: newMember,
          adderOrExecutor: executor,
          origin: "ROLE_UPDATE",
          reason: "Bot is DENIED in Strive Review (blocked from re-adding).",
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
          origin: "ROLE_UPDATE",
          reason: "Bot was granted dangerous permissions after joining.",
        });
      }
      return;
    }

    // -------------------------
    // HUMAN: anti mass role removal (stripping roles)
    // -------------------------
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
          // reset so we don't spam-derole repeatedly
          rec.count = 0;
          roleStripCache.set(k, rec);

          const execMember = await guild.members.fetch(executor.id).catch(() => null);
          if (execMember) {
            const pending = getPendingHumanMap(guild.id);

            const already = pending.get(execMember.id);
            if (!already || Date.now() - already.at > ROLE_STRIP_WINDOW) {
              const stripped = await deroleMemberKeepManaged(
                guild,
                execMember,
                "Mass role removal detected"
              );

              pending.set(execMember.id, {
                at: Date.now(),
                reason: `Removed ${ROLE_STRIP_THRESHOLD}+ roles within ~3 minutes`,
                origin: "MASS_ROLE_REMOVE",
                removedRoles: stripped,
              });

              await postHumanReviewPanel({
                guild,
                targetUser: execMember.user,
                executor,
                reason: `Mass role removal detected (threshold ${ROLE_STRIP_THRESHOLD} roles / ~3 min).`,
                removedRoles: stripped,
              });
            }
          }
        }
      }
    }

    // -------------------------
    // (Optional) Human admin-grant revert
    // -------------------------
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
  // ANTI-NUKE EVENTS
  // =========================
  client.on("channelDelete", async (channel) => {
    const guild = channel.guild;
    if (!guild || guild.available === false) return;

    const executor = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, channel.id);
    const field =
      channel.type === ChannelType.GuildCategory ? "categoryDelete" : "channelDelete";

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
    await bumpAndCheck(
      guild,
      executor,
      "channelPermEdit",
      "Mass channel permission overwrite edits detected"
    );
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

        await role.setPermissions(safePerms, `[ANTINUKE] ${reason}`).catch(() => {});
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
    } catch (err) {
      client.logger?.error?.(`[ANTINUKE] Lockdown failed:`, err);
    }
  }
};
