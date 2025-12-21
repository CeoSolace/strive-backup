// antinuke.command.js
// /antinuke guide
// Explains the entire anti-nuke + Strive Review system.
// Adds two buttons:
//  - "Dumbify" (simpler explanation)
//  - "ik what im talking about" (full nerd mode)
//
// Note: This is a GUIDE command only. No DB config required.

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
  This is an **anti-nuke** system. It assumes the server will be attacked because… it’s a Discord server.

  **It does 3 main things:**
  1) **Stops scary bots**: if a bot shows up with dangerous permissions, it gets **kicked immediately**.
  2) **Stops mass destruction**: if someone starts deleting channels/roles or banning people fast, it triggers **lockdown**.
  3) **Stops role stripping**: if someone removes a bunch of roles quickly, they get **derolled** and the owner gets a decision panel.
  `;

  const strive = stripIndent`
  ## 1) Strive Review (dangerous bots)
  If a bot has permissions like **Admin**, **Manage Roles**, **Manage Channels**, **Ban/Kick**, etc:
  - The bot is **kicked first**
  - A private channel **#strive-review** is created if needed
  - The owner gets buttons:
    - ✅ **Accept** = allow that bot in the future even with scary perms
    - ❌ **Deny** = auto-kick that bot every time it joins

  It’s basically “approve the bot ID or block it forever”.
  `;

  const humans = stripIndent`
  ## 2) Humans doing suspicious role stuff
  If someone removes **5+ roles** within about **3 minutes**:
  - The person doing it gets **derolled** (roles removed)
  - Owner gets a panel:
    - ✅ **Restore Roles**
    - ❌ **Keep Derolled**
  `;

  const nukes = stripIndent`
  ## 3) Anti-nuke lockdown
  If someone does too many destructive actions quickly (delete channels, delete roles, spam webhooks, mass bans):
  - The bot triggers **LOCKDOWN**
  - LOCKDOWN removes dangerous permissions from roles so the attacker can’t keep nuking
  - You still need to check audit logs and clean up after
  `;

  const perms = stripIndent`
  ## Permissions needed (or it’s just decorative)
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
  This module is two systems glued together with paranoia:

  **A) Strive Review (Bot gate)**
  - Maintains **approved** and **denied** bot ID sets per guild (in-memory here).
  - Detects dangerous perms on **bot join** or **later role updates**.
  - Enforces: **kick first**, then open a private review panel for the owner.

  **B) Anti-nuke counters + lockdown**
  - Tracks executor action rates using audit log resolution with a short freshness window.
  - When limits are exceeded: triggers **lockdownGuild()** to strip destructive perms from roles.

  Plus human protections:
  - anti mass role removal (derole + owner restore/keep panel)
  - optional admin-grant revert unless scoped whitelisted
  `;

  const strive = stripIndent`
  ## A) Strive Review (Bot gate)

  **Dangerous perms trigger list**
  - Administrator, ManageGuild, ManageRoles, ManageChannels, ManageWebhooks, BanMembers, KickMembers

  **Decision memory**
  - \`approvedBots[guildId] -> Set(botId)\`
  - \`deniedBots[guildId]   -> Set(botId)\`
  - If denied: always kick on join and on role update.
  - If approved: bypass dangerous perm kicks forever (for that guild).

  **Detection points**
  1) \`guildMemberAdd\` (bots only)
     - if denied -> kick + panel
     - else if not approved and has dangerous perms -> kick + panel
  2) \`guildMemberUpdate\` (bots only)
     - ignores immediate cascades via a pending timestamp + dedupe window
     - if roles changed and now has dangerous perms and not approved -> kick + panel
     - if denied -> kick + panel

  **Kick-first rule**
  - The bot gets kicked before the owner even reads the message.
  - If not kickable, it tries \`roles.set([])\` as a fallback.

  **Dedupe**
  - \`striveDedupe[guildId:botId]\` blocks multi-panels for 60s to avoid cascades.
  - \`pendingBotReview\` stores timestamp to avoid reacting to our own enforcement role updates.

  **Review channel**
  - \`#strive-review\` is created if missing with overwrites:
    - @everyone denied view
    - owner allowed view/send
    - bot allowed view/send/embed/read history
    - optional extra admin ID allowed view/send

  **Buttons**
  - Accept -> approved add, denied delete, pending delete, edits panel to disabled
  - Deny   -> denied add, approved delete, pending delete, edits panel to disabled
  `;

  const humans = stripIndent`
  ## B) Human protections

  ### 1) Anti mass role removal
  - Triggered inside \`guildMemberUpdate\` for humans when roles decrease.
  - Uses audit executor \`MemberRoleUpdate\` to attribute the action.
  - Tracks executor removal counts in \`roleStripCache\`:
    - window: 180s
    - threshold: 5 roles removed
  - On threshold:
    - derole executor (keeps managed roles)
    - store snapshot of removed role IDs
    - post owner panel with Restore/Keep

  ### 2) Optional admin-grant revert
  - If target member gains Administrator compared to old snapshot:
    - if target not owner and not whitelisted for adminGrant
    - and executor not whitelisted for adminGrant
    - revert target roles back to oldMember role set
  `;

  const nuke = stripIndent`
  ## C) Anti-nuke counters + lockdown

  **Attribution**
  - Uses \`getAuditExecutor(guild, AuditLogEvent.*, targetId)\`
  - Selects a recent entry (max age ~12s) to avoid stale attribution.

  **Counters**
  - actorCache key: \`\${guildId}:\${userId}\`
  - window: 30s
  - limits (defaults in your file):
    - channelDelete: 4, categoryDelete: 2, channelCreate: 8, channelPermEdit: 5
    - roleDelete: 3, roleCreate: 8, rolePermEdit: 4
    - webhookChange: 4, memberBan: 4

  **Events wired**
  - channelDelete, channelCreate, channelUpdate (overwrite edits)
  - roleDelete, roleCreate, roleUpdate (dangerous perms gained)
  - guildBanAdd
  - webhooksUpdate (tries create/delete/update logs)

  **Lockdown**
  - \`lockdownGuild\` iterates roles and removes:
    Admin, ManageGuild, ManageRoles, ManageChannels, ManageWebhooks, Ban, Kick
  - Posts an alert message in a channel it can send in.

  **Whitelist**
  - scoped whitelist for humans: roles/channels/webhooks/bans/admin/all
  - owner + EXTRA_WHITELIST_ID always bypass
  `;

  const perms = stripIndent`
  ## Permissions needed
  ${permissionChecklistLines(guild)}

  If any are missing, parts of this system degrade into “strong opinions, weak enforcement”.
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

/** ---------- command ---------- **/
module.exports = {
  name: "antinuke",
  description: "anti-nuke + Strive Review help",
  category: "INFORMATION",
  userPermissions: ["ManageGuild"],
