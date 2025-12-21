// src/commands/information/antinuke.js
// /antinuke guide
// Explains the entire anti-nuke + Strive Review system.
// Adds two buttons:
//  - "Dumbify" (simpler explanation)
//  - "ik what im talking about" (full nerd mode)

const {
  EmbedBuilder,
  ApplicationCommandOptionType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { EMBED_COLORS } = require("@root/config.js");
const { stripIndent } = require("common-tags");

const BTN_DUMB = "antinuke:guide:dumbify";
const BTN_NERD = "antinuke:guide:nerd";

/** ---------- helpers ---------- **/
function fmtBool(b) {
  return b ? "✓" : "✕";
}

function permissionChecklistLines(guild) {
  const me = guild.members.me;

  const checks = [
    {
      name: "View Audit Log (strongly recommended)",
      ok: me.permissions.has(PermissionsBitField.Flags.ViewAuditLog),
      why: "identify who added bots / edited roles / nuked stuff",
    },
    {
      name: "Kick Members",
      ok: me.permissions.has(PermissionsBitField.Flags.KickMembers),
      why: "kick dangerous bots immediately (Strive Review kick-first)",
    },
    {
      name: "Manage Roles",
      ok: me.permissions.has(PermissionsBitField.Flags.ManageRoles),
      why: "derole execs + revert admin grants + strip dangerous perms in lockdown",
    },
    {
      name: "Manage Channels",
      ok: me.permissions.has(PermissionsBitField.Flags.ManageChannels),
      why: "create #strive-review if missing",
    },
    {
      name: "Manage Webhooks",
      ok: me.permissions.has(PermissionsBitField.Flags.ManageWebhooks),
      why: "contain webhook nukes; detect changes",
    },
    {
      name: "Send Messages + Embed Links",
      ok:
        me.permissions.has(PermissionsBitField.Flags.SendMessages) &&
        me.permissions.has(PermissionsBitField.Flags.EmbedLinks),
      why: "post panels + alerts",
    },
  ];

  return checks.map((c) => `- ${fmtBool(c.ok)} **${c.name}** — ${c.why}`).join("\n");
}

function buildButtons(disabled = false) {
  const dumbify = new ButtonBuilder()
    .setCustomId(BTN_DUMB)
    .setLabel("Dumbify")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);

  const nerd = new ButtonBuilder()
    .setCustomId(BTN_NERD)
    .setLabel("ik what im talking about")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return [new ActionRowBuilder().addComponents(dumbify, nerd)];
}

/** ---------- content builders ---------- **/
function buildDumbEmbeds(guild) {
  const overview = stripIndent`
  This is an **anti-nuke** system. It assumes the server will be attacked because it’s a Discord server.

  **It does 3 main things:**
  1) **Stops scary bots**: if a bot shows up with dangerous permissions, it gets **kicked immediately**.
  2) **Stops mass destruction**: if someone starts deleting channels/roles or banning people fast, it triggers **lockdown**.
  3) **Stops role stripping**: if someone removes a bunch of roles quickly, they get **derolled** and the owner gets a decision panel.
  `;

  const strive = stripIndent`
  ## 1) Strive Review (dangerous bots)
  If a bot has permissions like **Admin**, **Manage Roles**, **Manage Channels**, **Manage Webhooks**, **Ban/Kick**:
  - bot is **kicked first**
  - **#strive-review** is created if missing
  - owner gets a panel with buttons:
    - ✅ **Accept** = allow bot ID in future even with dangerous perms
    - ❌ **Deny** = block bot ID (auto-kicked every time)

  This is bot ID allow/deny, not “trust the name and vibes”.
  `;

  const humans = stripIndent`
  ## 2) Humans stripping roles fast
  If someone removes **5+ roles** within about **3 minutes**:
  - executor gets **derolled** (roles removed, managed roles kept)
  - owner gets a panel:
    - ✅ **Restore Roles**
    - ❌ **Keep Derolled**
  `;

  const nukes = stripIndent`
  ## 3) Anti-nuke lockdown
  If someone does too many destructive actions quickly (delete channels, delete roles, webhook spam, mass bans):
  - bot triggers **LOCKDOWN**
  - LOCKDOWN removes dangerous permissions from roles so the attacker can’t keep nuking
  - you still review audit logs and clean up
  `;

  const perms = stripIndent`
  ## Permissions needed (or it’s just theatre)
  ${permissionChecklistLines(guild)}
  `;

  return [
    new EmbedBuilder()
      .setTitle("Anti-Nuke Guide (Dumbified)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(overview),

    new EmbedBuilder()
      .setTitle("Strive Review (Bots)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(strive),

    new EmbedBuilder()
      .setTitle("Human Role Stripping")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(humans),

    new EmbedBuilder()
      .setTitle("Lockdown (Anti-Nuke)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(nukes),

    new EmbedBuilder()
      .setTitle("Permission Checklist")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(perms),
  ];
}

function buildNerdEmbeds(guild) {
  const overview = stripIndent`
  This module is two systems duct-taped together with paranoia:

  **A) Strive Review (Bot gate)**
  - Tracks per-guild **approved** and **denied** bot IDs.
  - Detects dangerous perms on **join** or **later role updates**.
  - Enforces **kick first**, then posts owner decision panel.

  **B) Anti-nuke counters + lockdown**
  - Uses audit logs to attribute actions.
  - If a user exceeds action limits in a short window, triggers **lockdownGuild()** to strip dangerous perms from roles.

  Plus human protections:
  - anti mass role removal (derole executor + owner restore/keep)
  - optional admin-grant revert unless whitelisted
  `;

  const strive = stripIndent`
  ## A) Strive Review (Bot gate)

  **Dangerous perms trigger list**
  - Administrator, ManageGuild, ManageRoles, ManageChannels, ManageWebhooks, BanMembers, KickMembers

  **Decision memory**
  - approvedBots[guildId] -> Set(botId)
  - deniedBots[guildId]   -> Set(botId)

  **Enforcement**
  - guildMemberAdd (bots):
    - denied -> kick + panel
    - not approved + dangerous -> kick + panel
  - guildMemberUpdate (bots):
    - if roles changed and now dangerous and not approved -> kick + panel
    - denied -> kick + panel

  **Kick-first**
  - kick if possible; if not kickable, tries roles.set([])

  **Dedupe**
  - striveDedupe blocks multiple panels per bot within a time window
  - pendingBotReview timestamps prevent reacting to our own follow-on role changes

  **Review channel**
  - #strive-review created if missing; private to owner + bot + optional admin ID
  - Accept/Deny buttons only work for owner/extra admin
  `;

  const humans = stripIndent`
  ## B) Human protections

  ### 1) Anti mass role removal
  - Detect role decreases in guildMemberUpdate (humans)
  - Attribute executor via AuditLogEvent.MemberRoleUpdate
  - Track executor in roleStripCache:
    - window ~180s
    - threshold 5 removed roles
  - On threshold:
    - derole executor (keep managed roles)
    - save removed role snapshot
    - post owner restore/keep panel

  ### 2) Optional admin-grant revert
  - If member gains Administrator and isn’t whitelisted:
    - revert to old roles snapshot (best-effort)
  `;

  const nuke = stripIndent`
  ## C) Anti-nuke counters + lockdown

  **Attribution**
  - getAuditExecutor(fetchAuditLogs) with short freshness window to avoid stale entries

  **Counters**
  - actorCache[guildId:userId] tracks action counts in a short rolling window
  - once any counter crosses its limit:
    - lockdownGuild() runs
    - dangerous perms are stripped from roles

  **Events monitored**
  - channelDelete / channelCreate / channelUpdate (overwrite edits)
  - roleDelete / roleCreate / roleUpdate (dangerous perms gained)
  - guildBanAdd
  - webhooksUpdate

  **Lockdown action**
  - removes Admin / Manage* / Ban / Kick perms from roles (excluding managed and @everyone)
  - posts an alert message in the first writable channel
  `;

  const perms = stripIndent`
  ## Permissions needed
  ${permissionChecklistLines(guild)}
  `;

  return [
    new EmbedBuilder()
      .setTitle("Anti-Nuke Guide (Nerd Mode)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(overview),

    new EmbedBuilder()
      .setTitle("Strive Review: Bot Gate")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(strive),

    new EmbedBuilder()
      .setTitle("Human Protections")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(humans),

    new EmbedBuilder()
      .setTitle("Anti-Nuke Counters + Lockdown")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(nuke),

    new EmbedBuilder()
      .setTitle("Permission Checklist")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(perms),
  ];
}

async function runGuide(interactionOrMessage, guild, authorId, replyFn, editFn, isEphemeral) {
  const embeds = buildNerdEmbeds(guild);

  const msg = await replyFn({
    embeds,
    components: buildButtons(false),
    ...(typeof isEphemeral === "boolean" ? { ephemeral: isEphemeral } : {}),
  });

  // If ephemeral responses return a Message-like object depends on your framework.
  // Guard collector creation.
  if (!msg || typeof msg.createMessageComponentCollector !== "function") return;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === authorId,
  });

  collector.on("collect", async (i) => {
    if (i.customId === BTN_DUMB) {
      await i
        .update({ embeds: buildDumbEmbeds(guild), components: buildButtons(false) })
        .catch(() => {});
      return;
    }

    if (i.customId === BTN_NERD) {
      await i
        .update({ embeds: buildNerdEmbeds(guild), components: buildButtons(false) })
        .catch(() => {});
      return;
    }
  });

  collector.on("end", async () => {
    await editFn(msg, { components: buildButtons(true) }).catch(() => {});
  });
}

/** ---------- command ---------- **/
module.exports = {
  name: "antinuke",
  description: "anti-nuke + Strive Review guide",
  category: "INFORMATION",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [{ trigger: "guide", description: "explain the entire anti-nuke system" }],
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "guide",
        description: "explain the entire anti-nuke system",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message) {
    const args = message.content.trim().split(/\s+/).slice(1);
    const sub = (args[0] || "").toLowerCase();

    if (sub !== "guide") return message.safeReply("Invalid command usage! Try: `=antinuke guide`");

    return runGuide(
      message,
      message.guild,
      message.author.id,
      (payload) => message.safeReply(payload),
      (msg, payload) => msg.edit(payload),
      false
    );
  },

  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "guide") return interaction.followUp("Invalid command usage!");

    // followUp returns the sent message in discord.js when fetchReply is true.
    // Some frameworks wrap it. If yours doesn’t, you can switch to reply({ fetchReply: true }).
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const sent = await interaction
      .followUp({ ...(buildNerdEmbeds(interaction.guild) && {}), fetchReply: true })
      .catch(() => null);

    // If you want the buttons + collector reliably, do it in ONE message:
    // We'll just send it properly here and collect from that message.
    const msg = await interaction
      .followUp({
        embeds: buildNerdEmbeds(interaction.guild),
        components: buildButtons(false),
        ephemeral: true,
        fetchReply: true,
      })
      .catch(() => null);

    if (!msg) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === BTN_DUMB) {
        await i.update({ embeds: buildDumbEmbeds(interaction.guild), components: buildButtons(false) }).catch(() => {});
        return;
      }
      if (i.customId === BTN_NERD) {
        await i.update({ embeds: buildNerdEmbeds(interaction.guild), components: buildButtons(false) }).catch(() => {});
        return;
      }
    });

    collector.on("end", async () => {
      await msg.edit({ components: buildButtons(true) }).catch(() => {});
    });
  },
};
