// src/commands/information/antinuke.js
// /antinuke guide
// Explains the entire anti-nuke + Bright Review system.

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

/* ---------------- helpers ---------------- */

function fmtBool(v) {
  return v ? "✓" : "✕";
}

function permissionChecklistLines(guild) {
  const me =
    guild.members.me ??
    guild.members.cache.get(guild.client.user.id);

  if (!me) return "Bot member not cached yet.";

  const perms = me.permissions;

  const checks = [
    {
      name: "View Audit Log (strongly recommended)",
      ok: perms.has(PermissionsBitField.Flags.ViewAuditLog),
      why: "identify who added bots / edited roles / nuked stuff",
    },
    {
      name: "Kick Members",
      ok: perms.has(PermissionsBitField.Flags.KickMembers),
      why: "kick dangerous bots immediately (Bright Review kick-first)",
    },
    {
      name: "Manage Roles",
      ok: perms.has(PermissionsBitField.Flags.ManageRoles),
      why: "derole executors + revert admin grants + strip dangerous perms in lockdown",
    },
    {
      name: "Manage Channels",
      ok: perms.has(PermissionsBitField.Flags.ManageChannels),
      why: "create #bright-review if missing",
    },
    {
      name: "Manage Webhooks",
      ok: perms.has(PermissionsBitField.Flags.ManageWebhooks),
      why: "detect/contain webhook nukes",
    },
    {
      name: "Send Messages + Embed Links",
      ok:
        perms.has(PermissionsBitField.Flags.SendMessages) &&
        perms.has(PermissionsBitField.Flags.EmbedLinks),
      why: "post panels + alerts",
    },
  ];

  return checks
    .map((c) => `- ${fmtBool(c.ok)} **${c.name}** — ${c.why}`)
    .join("\n");
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

/* ---------------- dumb embeds ---------------- */

function buildDumbEmbeds(guild) {
  const overview = stripIndent`
This is an **anti-nuke** system. It assumes the server will be attacked because it’s Discord.

**It does 3 main things:**
1) **Stops scary bots** – if a bot shows up with dangerous permissions, it gets **kicked immediately**.
2) **Stops mass destruction** – if someone starts deleting channels/roles or banning people fast, it triggers **lockdown**.
3) **Stops role stripping** – if someone removes a bunch of roles quickly, they get **derolled** and the owner gets a decision panel.
`;

  const bright = stripIndent`
## 1) Bright Review (dangerous bots)

If a bot has perms like **Admin**, **Manage Roles**, **Manage Channels**, **Manage Webhooks**, **Ban/Kick**:

- bot is **kicked first**
- private **#bright-review** is created if missing

Owner gets buttons:

✅ **Accept** = allow this bot ID in future  
❌ **Deny** = block this bot ID (auto-kicked forever)

It’s **approve/deny the bot ID**, not trusting vibes.
`;

  const humans = stripIndent`
## 2) Humans stripping roles fast

If someone removes **5+ roles** within about **3 minutes**:

- executor gets **derolled**
- owner gets panel:

✅ Restore Roles  
❌ Keep Derolled
`;

  const nukes = stripIndent`
## 3) Anti-nuke lockdown

If someone does destructive actions quickly (delete channels, roles, bans, webhook spam):

- triggers **LOCKDOWN**
- dangerous role permissions get stripped
- attacker loses ability to continue
`;

  const perms = stripIndent`
## Permissions needed (or it's theatre)

${permissionChecklistLines(guild)}
`;

  return [
    new EmbedBuilder()
      .setTitle("Anti-Nuke Guide (Dumbified)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(overview),

    new EmbedBuilder()
      .setTitle("Bright Review (Bots)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(bright),

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

/* ---------------- nerd embeds ---------------- */

function buildNerdEmbeds(guild) {
  const overview = stripIndent`
Two systems combined:

**A) Bright Review**
Bot approval system with kick-first enforcement.

**B) Anti-nuke protection**
Counters destructive actions and triggers lockdown.
`;

  const bright = stripIndent`
## Bright Review

Dangerous perms trigger review:

Administrator  
ManageGuild  
ManageRoles  
ManageChannels  
ManageWebhooks  
BanMembers  
KickMembers

Bot joins → checked  
Role update → checked

If dangerous and not approved:

→ bot kicked  
→ owner panel appears
`;

  const humans = stripIndent`
## Human protections

Mass role removal detection:

- track executor via audit logs
- count removals in 180s window
- threshold triggers:

→ derole executor  
→ snapshot roles  
→ owner panel
`;

  const nukes = stripIndent`
## Anti-nuke system

Counters destructive actions:

channelDelete  
channelCreate  
roleDelete  
roleCreate  
guildBanAdd  
webhooksUpdate

If threshold exceeded:

→ **LOCKDOWN**

Lockdown strips dangerous permissions from roles.
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
      .setTitle("Bright Review")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(bright),

    new EmbedBuilder()
      .setTitle("Human Protections")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(humans),

    new EmbedBuilder()
      .setTitle("Anti-nuke Lockdown")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(nukes),

    new EmbedBuilder()
      .setTitle("Permission Checklist")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(perms),
  ];
}

/* ---------------- command ---------------- */

module.exports = {
  name: "antinuke",
  description: "Anti-nuke + Bright Review guide",
  category: "INFORMATION",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [{ trigger: "guide" }],
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "guide",
        description: "Explain the anti-nuke system",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  async messageRun(message) {
    const args = message.content.trim().split(/\s+/).slice(1);
    if (args[0]?.toLowerCase() !== "guide")
      return message.safeReply("Try: `=antinuke guide`");

    const msg = await message.safeReply({
      embeds: buildNerdEmbeds(message.guild),
      components: buildButtons(false),
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (i) => i.user.id === message.author.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === BTN_DUMB)
        return i.update({
          embeds: buildDumbEmbeds(message.guild),
          components: buildButtons(false),
        });

      if (i.customId === BTN_NERD)
        return i.update({
          embeds: buildNerdEmbeds(message.guild),
          components: buildButtons(false),
        });
    });

    collector.on("end", () => {
      msg.edit({ components: buildButtons(true) }).catch(() => {});
    });
  },

  async interactionRun(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const msg = await interaction.editReply({
      embeds: buildNerdEmbeds(interaction.guild),
      components: buildButtons(false),
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === BTN_DUMB)
        return i.update({
          embeds: buildDumbEmbeds(interaction.guild),
          components: buildButtons(false),
        });

      if (i.customId === BTN_NERD)
        return i.update({
          embeds: buildNerdEmbeds(interaction.guild),
          components: buildButtons(false),
        });
    });

    collector.on("end", () => {
      msg.edit({ components: buildButtons(true) }).catch(() => {});
    });
  },
};
