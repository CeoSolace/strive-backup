// src/commands/information/antinuke.js
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

function fmtBool(v) {
  return v ? "✓" : "✕";
}

function permissionChecklistLines(guild) {
  const me = guild.members.me ?? guild.members.cache.get(guild.client.user.id);

  if (!me) return "Bot member not cached yet.";

  const perms = me.permissions;

  const checks = [
    {
      name: "View Audit Log (strongly recommended)",
      ok: perms.has(PermissionsBitField.Flags.ViewAuditLog),
      why: "identify who added bots, edited roles, or nuked things",
    },
    {
      name: "Kick Members",
      ok: perms.has(PermissionsBitField.Flags.KickMembers),
      why: "kick dangerous bots immediately",
    },
    {
      name: "Manage Roles",
      ok: perms.has(PermissionsBitField.Flags.ManageRoles),
      why: "derole executors and strip dangerous permissions in lockdown",
    },
    {
      name: "Manage Channels",
      ok: perms.has(PermissionsBitField.Flags.ManageChannels),
      why: "create #bright-review if missing",
    },
    {
      name: "Manage Webhooks",
      ok: perms.has(PermissionsBitField.Flags.ManageWebhooks),
      why: "detect and contain webhook abuse",
    },
    {
      name: "Send Messages + Embed Links",
      ok:
        perms.has(PermissionsBitField.Flags.SendMessages) &&
        perms.has(PermissionsBitField.Flags.EmbedLinks),
      why: "post alerts and review panels",
    },
  ];

  return checks.map((c) => `- ${fmtBool(c.ok)} **${c.name}**: ${c.why}`).join("\n");
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

function buildDumbEmbeds(guild) {
  const overview = stripIndent`
This is an **anti-nuke** system.

It does 3 main things:

1. **Stops dangerous bots**
If a bot joins with dangerous permissions, it gets **kicked immediately**.

2. **Stops mass destruction**
If someone starts deleting channels, roles, or banning people quickly, it can trigger **lockdown**.

3. **Stops rapid role stripping**
If someone removes a bunch of roles quickly, they get **derolled** and the owner gets a decision panel.
`;

  const bright = stripIndent`
## 1) Bright Review

If a bot has dangerous permissions such as:

- Administrator
- Manage Roles
- Manage Channels
- Manage Webhooks
- Ban Members
- Kick Members

Then:

- the bot is **kicked first**
- private **#bright-review** is created if missing

The owner gets buttons:

✅ **Accept** = allow this bot ID in future  
❌ **Deny** = block this bot ID in future
`;

  const humans = stripIndent`
## 2) Human role stripping

If someone removes **5 or more roles** in around **3 minutes**:

- executor gets **derolled**
- owner gets panel with options to restore or keep removed
`;

  const nukes = stripIndent`
## 3) Anti-nuke lockdown

If someone does destructive actions quickly, such as:

- deleting channels
- deleting roles
- mass bans
- webhook abuse

Then lockdown can trigger and dangerous permissions get stripped from roles.
`;

  const perms = stripIndent`
## Permissions needed

${permissionChecklistLines(guild)}
`;

  return [
    new EmbedBuilder()
      .setTitle("Anti-Nuke Guide")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(overview),

    new EmbedBuilder()
      .setTitle("Bright Review")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(bright),

    new EmbedBuilder()
      .setTitle("Human Protection")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(humans),

    new EmbedBuilder()
      .setTitle("Lockdown")
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
Two systems combined:

**A) Bright Review**
Bot approval system with kick-first enforcement

**B) Anti-nuke protection**
Counters destructive actions and triggers lockdown
`;

  const bright = stripIndent`
## Bright Review

Dangerous permissions trigger review:

- Administrator
- ManageGuild
- ManageRoles
- ManageChannels
- ManageWebhooks
- BanMembers
- KickMembers

Bot join or bot role update -> checked

If dangerous and not approved:

- bot is kicked
- owner review panel appears
`;

  const humans = stripIndent`
## Human protections

Mass role removal detection:

- executor identified via audit logs
- removals counted in a 180 second window
- threshold hit triggers derole flow

Actions:

- derole executor
- snapshot their roles
- owner gets restore/deny panel
`;

  const nukes = stripIndent`
## Anti-nuke system

Counters destructive actions such as:

- channelDelete
- channelCreate
- roleDelete
- roleCreate
- guildBanAdd
- webhooksUpdate

If threshold is exceeded:

- **LOCKDOWN** triggers
- dangerous permissions are stripped from roles
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
      .setTitle("Anti-Nuke Lockdown")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(nukes),

    new EmbedBuilder()
      .setTitle("Permission Checklist")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(perms),
  ];
}

module.exports = {
  name: "antinuke",
  description: "Anti-nuke + Bright Review guide",
  category: "INFORMATION",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      {
        trigger: "guide",
        description: "Explain the anti-nuke system",
      },
    ],
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

    if (args[0]?.toLowerCase() !== "guide") {
      return message.safeReply("Try: `=antinuke guide`");
    }

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
      if (i.customId === BTN_DUMB) {
        return i.update({
          embeds: buildDumbEmbeds(message.guild),
          components: buildButtons(false),
        });
      }

      if (i.customId === BTN_NERD) {
        return i.update({
          embeds: buildNerdEmbeds(message.guild),
          components: buildButtons(false),
        });
      }
    });

    collector.on("end", () => {
      msg.edit({ components: buildButtons(true) }).catch(() => {});
    });
  },

  async interactionRun(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand(false);
    if (sub !== "guide") {
      return interaction.editReply({
        content: "Invalid subcommand.",
        components: [],
        embeds: [],
      });
    }

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
      if (i.customId === BTN_DUMB) {
        return i.update({
          embeds: buildDumbEmbeds(interaction.guild),
          components: buildButtons(false),
        });
      }

      if (i.customId === BTN_NERD) {
        return i.update({
          embeds: buildNerdEmbeds(interaction.guild),
          components: buildButtons(false),
        });
      }
    });

    collector.on("end", () => {
      msg.edit({ components: buildButtons(true) }).catch(() => {});
    });
  },
};
