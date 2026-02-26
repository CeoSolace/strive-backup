const {
  EmbedBuilder,
  ApplicationCommandOptionType,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");
const { EMBED_COLORS } = require("@root/config.js");
const { stripIndent } = require("common-tags");

/** ---------- helpers ---------- **/
function parseToggle(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (["on", "true", "enable", "enabled", "yes"].includes(v)) return true;
  if (["off", "false", "disable", "disabled", "no"].includes(v)) return false;
  return null;
}

function requireInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function fmtBool(b) {
  return b ? "✓" : "✕";
}

function safeChannelMention(guild, channelId) {
  const ch = guild.channels.cache.get(channelId);
  return ch ? ch.toString() : "Not Configured";
}

function ensureAutomodDefaults(settings) {
  // Make sure these exist so the bot doesn't crash on undefined
  settings.automod ??= {};
  const a = settings.automod;

  a.strikes ??= 5;
  a.action ??= "TIMEOUT";
  a.debug ??= false;
  a.wh_channels ??= [];

  a.max_lines ??= 0;

  // toggles
  a.anti_ghostping ??= false;
  a.anti_spam ??= false;
  a.anti_massmention ??= 0; // 0 disabled, >0 threshold
  a.anti_attachments ??= false;
  a.anti_links ??= false;
  a.anti_invites ??= false;
}

function buildStatusEmbed(settings, guild) {
  ensureAutomodDefaults(settings);
  const { automod } = settings;

  const logChannel = settings.modlog_channel
    ? safeChannelMention(guild, settings.modlog_channel)
    : "Not Configured";

  const desc = stripIndent`
    ❯ **Max Lines**: ${automod.max_lines === 0 ? "Disabled" : automod.max_lines}
    ❯ **Anti-Massmention**: ${
      automod.anti_massmention > 0 ? `✓ (threshold: ${automod.anti_massmention})` : "✕"
    }
    ❯ **Anti-Attachments**: ${fmtBool(automod.anti_attachments)}
    ❯ **Anti-Links**: ${fmtBool(automod.anti_links)}
    ❯ **Anti-Invites**: ${fmtBool(automod.anti_invites)}
    ❯ **Anti-Spam**: ${fmtBool(automod.anti_spam)}
    ❯ **Anti-Ghostping**: ${fmtBool(automod.anti_ghostping)}
  `;

  return {
    embeds: [
      new EmbedBuilder()
        .setAuthor({ name: "Automod Configuration", iconURL: guild.iconURL() })
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setDescription(desc)
        .addFields(
          { name: "Log Channel", value: logChannel, inline: true },
          { name: "Max Strikes", value: String(automod.strikes), inline: true },
          { name: "Action", value: String(automod.action), inline: true },
          { name: "Debug", value: fmtBool(automod.debug), inline: true }
        ),
    ],
  };
}

function buildGuideEmbeds(guild) {
  const me = guild.members.me;
  const checks = [
    {
      name: "Manage Messages",
      ok: me.permissions.has(PermissionsBitField.Flags.ManageMessages),
      why: "delete messages that violate rules",
    },
    {
      name: "Moderate Members",
      ok: me.permissions.has(PermissionsBitField.Flags.ModerateMembers),
      why: "timeout action",
    },
    {
      name: "Kick Members",
      ok: me.permissions.has(PermissionsBitField.Flags.KickMembers),
      why: "kick action",
    },
    {
      name: "Ban Members",
      ok: me.permissions.has(PermissionsBitField.Flags.BanMembers),
      why: "ban action",
    },
    {
      name: "View Audit Log (optional)",
      ok: me.permissions.has(PermissionsBitField.Flags.ViewAuditLog),
      why: "better context for moderation logs",
    },
  ];

  const permissionLines = checks
    .map((c) => `- ${fmtBool(c.ok)} **${c.name}** — ${c.why}`)
    .join("\n");

  const setup = stripIndent`
  ## 1) Create a log channel
  Create something like **#mod-log** (private). Set \`settings.modlog_channel\` in your config / DB to that channel ID.
  
  ## 2) Pick your automod baseline
  Recommended:
  - **Strikes**: \`/automod strikes 5\`
  - **Action**: \`/automod action TIMEOUT\` (safer than kick/ban)
  - **Debug**: keep OFF unless you want staff messages moderated too
  
  ## 3) Configure the filters
  Suggested defaults:
  - Anti-Spam: \`/anti spam ON\`
  - Anti-Ghostping: \`/anti ghostping ON\`
  - Mass mentions: \`/anti massmention ON threshold:3\`
  - Links: \`/autodelete links ON\` (or OFF if you allow them)
  - Invites: \`/autodelete invites ON\`
  - Attachments: \`/autodelete attachments OFF\` (depends on server)
  - Max lines: \`/autodelete maxlines 8\` (**0 disables**)

  ## 4) Whitelist channels
  Add channels where rules should not apply (bot commands, staff chat):
  - \`/automod whitelistadd #bot-commands\`
  - \`/automod whitelistadd #staff\`
  
  ## 5) Verify
  Run:
  - \`/automod status\`
  Make sure everything shows enabled/disabled correctly.
  `;

  const caveats = stripIndent`
  ## Common reasons automod "barely works"
  - Your modules use inconsistent DB keys (fixed in these files).
  - You used **0 disables** but your code rejected 0 (fixed).
  - You pasted multiple exports into one file (fixed: separate files).
  - You didn’t whitelist channels (so you think it’s broken because it’s skipping, or the opposite).
  - Missing permissions (see checklist).
  `;

  return [
    new EmbedBuilder()
      .setTitle("Automod Setup Guide")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(
        "This explains how to set up automod correctly and why it might not work."
      ),

    new EmbedBuilder()
      .setTitle("Permission Checklist (bot role)")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(permissionLines),

    new EmbedBuilder()
      .setTitle("Recommended Setup Steps")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(setup),

    new EmbedBuilder()
      .setTitle("Troubleshooting")
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(caveats),
  ];
}

/** ---------- command ---------- **/
module.exports = {
  name: "automod",
  description: "various automod configuration",
  category: "AUTOMOD",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      { trigger: "status", description: "check automod configuration for this guild" },
      { trigger: "guide", description: "how to set up automod correctly" },
      { trigger: "strikes <number>", description: "max strikes before action" },
      { trigger: "action <TIMEOUT|KICK|BAN>", description: "set action after max strikes" },
      { trigger: "debug <on|off>", description: "include staff messages in automod" },
      { trigger: "whitelist", description: "list whitelisted channels" },
      { trigger: "whitelistadd <channel>", description: "add a channel to whitelist" },
      { trigger: "whitelistremove <channel>", description: "remove a channel from whitelist" },
    ],
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      { name: "status", description: "check automod configuration", type: ApplicationCommandOptionType.Subcommand },

      { name: "guide", description: "how to set up automod correctly", type: ApplicationCommandOptionType.Subcommand },

      {
        name: "strikes",
        description: "set maximum strikes before action",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: "amount", description: "1-50", required: true, type: ApplicationCommandOptionType.Integer },
        ],
      },

      {
        name: "action",
        description: "set action to perform after max strikes",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "action",
            description: "TIMEOUT/KICK/BAN",
            required: true,
            type: ApplicationCommandOptionType.String,
            choices: [
              { name: "TIMEOUT", value: "TIMEOUT" },
              { name: "KICK", value: "KICK" },
              { name: "BAN", value: "BAN" },
            ],
          },
        ],
      },

      {
        name: "debug",
        description: "enable/disable automod for staff messages",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "status",
            description: "ON/OFF",
            required: true,
            type: ApplicationCommandOptionType.String,
            choices: [
              { name: "ON", value: "ON" },
              { name: "OFF", value: "OFF" },
            ],
          },
        ],
      },

      { name: "whitelist", description: "view whitelisted channels", type: ApplicationCommandOptionType.Subcommand },

      {
        name: "whitelistadd",
        description: "add a channel to whitelist",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "channel",
            description: "text channel",
            required: true,
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText],
          },
        ],
      },

      {
        name: "whitelistremove",
        description: "remove a channel from whitelist",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "channel",
            description: "text channel",
            required: true,
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText],
          },
        ],
      },
    ],
  },

  async messageRun(message, args, data) {
    const sub = (args[0] || "").toLowerCase();
    const settings = data.settings;

    ensureAutomodDefaults(settings);

    if (sub === "status") {
      return message.safeReply(buildStatusEmbed(settings, message.guild));
    }

    if (sub === "guide") {
      const embeds = buildGuideEmbeds(message.guild);
      return message.safeReply({ embeds });
    }

    if (sub === "strikes") {
      const strikes = requireInt(args[1], { min: 1, max: 50 });
      if (strikes === null) return message.safeReply("Strikes must be an integer between 1 and 50.");
      settings.automod.strikes = strikes;
      await settings.save();
      return message.safeReply(`Configuration saved! Maximum strikes is set to **${strikes}**.`);
    }

    if (sub === "action") {
      const action = (args[1] || "").toUpperCase();
      if (!["TIMEOUT", "KICK", "BAN"].includes(action))
        return message.safeReply("Not a valid action. Use `TIMEOUT`/`KICK`/`BAN`.");

      const me = message.guild.members.me;
      if (action === "TIMEOUT" && !me.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return message.safeReply("I need **Moderate Members** permission for TIMEOUT.");
      if (action === "KICK" && !me.permissions.has(PermissionsBitField.Flags.KickMembers))
        return message.safeReply("I need **Kick Members** permission for KICK.");
      if (action === "BAN" && !me.permissions.has(PermissionsBitField.Flags.BanMembers))
        return message.safeReply("I need **Ban Members** permission for BAN.");

      settings.automod.action = action;
      await settings.save();
      return message.safeReply(`Configuration saved! Automod action is set to **${action}**.`);
    }

    if (sub === "debug") {
      const t = parseToggle(args[1]);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.debug = t;
      await settings.save();
      return message.safeReply(`Configuration saved! Automod debug is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "whitelist") {
      const list = settings.automod.wh_channels || [];
      if (!list.length) return message.safeReply("No channels are whitelisted.");

      const channels = list
        .map((id) => message.guild.channels.cache.get(id))
        .filter(Boolean)
        .map((ch) => ch.toString());

      return message.safeReply(`Whitelisted channels: ${channels.join(", ") || "None"}`);
    }

    if (sub === "whitelistadd") {
      const match = message.guild.findMatchingChannels(args[1]);
      if (!match.length) return message.safeReply(`No channel found matching ${args[1]}`);

      const channelId = match[0].id;
      settings.automod.wh_channels ??= [];
      if (settings.automod.wh_channels.includes(channelId)) return message.safeReply("Channel is already whitelisted.");

      settings.automod.wh_channels.push(channelId);
      await settings.save();
      return message.safeReply("Channel whitelisted!");
    }

    if (sub === "whitelistremove") {
      const match = message.guild.findMatchingChannels(args[1]);
      if (!match.length) return message.safeReply(`No channel found matching ${args[1]}`);

      const channelId = match[0].id;
      settings.automod.wh_channels ??= [];
      if (!settings.automod.wh_channels.includes(channelId)) return message.safeReply("Channel is not whitelisted.");

      settings.automod.wh_channels = settings.automod.wh_channels.filter((x) => x !== channelId);
      await settings.save();
      return message.safeReply("Channel removed from whitelist!");
    }

    return message.safeReply("Invalid command usage!");
  },

  async interactionRun(interaction, data) {
    const sub = interaction.options.getSubcommand();
    const settings = data.settings;

    ensureAutomodDefaults(settings);

    if (sub === "status") return interaction.followUp(buildStatusEmbed(settings, interaction.guild));

    if (sub === "guide") {
      const embeds = buildGuideEmbeds(interaction.guild);
      return interaction.followUp({ embeds });
    }

    if (sub === "strikes") {
      const strikes = requireInt(interaction.options.getInteger("amount"), { min: 1, max: 50 });
      if (strikes === null) return interaction.followUp("Strikes must be an integer between 1 and 50.");
      settings.automod.strikes = strikes;
      await settings.save();
      return interaction.followUp(`Configuration saved! Maximum strikes is set to **${strikes}**.`);
    }

    if (sub === "action") {
      const action = interaction.options.getString("action");
      const me = interaction.guild.members.me;

      if (action === "TIMEOUT" && !me.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return interaction.followUp("I need **Moderate Members** permission for TIMEOUT.");
      if (action === "KICK" && !me.permissions.has(PermissionsBitField.Flags.KickMembers))
        return interaction.followUp("I need **Kick Members** permission for KICK.");
      if (action === "BAN" && !me.permissions.has(PermissionsBitField.Flags.BanMembers))
        return interaction.followUp("I need **Ban Members** permission for BAN.");

      settings.automod.action = action;
      await settings.save();
      return interaction.followUp(`Configuration saved! Automod action is set to **${action}**.`);
    }

    if (sub === "debug") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.debug = !!t;
      await settings.save();
      return interaction.followUp(`Configuration saved! Automod debug is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "whitelist") {
      const list = settings.automod.wh_channels || [];
      if (!list.length) return interaction.followUp("No channels are whitelisted.");

      const channels = list
        .map((id) => interaction.guild.channels.cache.get(id))
        .filter(Boolean)
        .map((ch) => ch.toString());

      return interaction.followUp(`Whitelisted channels: ${channels.join(", ") || "None"}`);
    }

    if (sub === "whitelistadd") {
      const channelId = interaction.options.getChannel("channel").id;
      settings.automod.wh_channels ??= [];
      if (settings.automod.wh_channels.includes(channelId)) return interaction.followUp("Channel is already whitelisted.");

      settings.automod.wh_channels.push(channelId);
      await settings.save();
      return interaction.followUp("Channel whitelisted!");
    }

    if (sub === "whitelistremove") {
      const channelId = interaction.options.getChannel("channel").id;
      settings.automod.wh_channels ??= [];
      if (!settings.automod.wh_channels.includes(channelId)) return interaction.followUp("Channel is not whitelisted.");

      settings.automod.wh_channels = settings.automod.wh_channels.filter((x) => x !== channelId);
      await settings.save();
      return interaction.followUp("Channel removed from whitelist!");
    }

    return interaction.followUp("Invalid command usage!");
  },
};
