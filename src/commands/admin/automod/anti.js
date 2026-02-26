const { ApplicationCommandOptionType } = require("discord.js");

function parseToggle(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (["on", "true", "enable", "enabled", "yes"].includes(v)) return true;
  if (["off", "false", "disable", "disabled", "no"].includes(v)) return false;
  return null;
}

function ensureAutomodDefaults(settings) {
  settings.automod ??= {};
  const a = settings.automod;
  a.anti_ghostping ??= false;
  a.anti_spam ??= false;
  a.anti_massmention ??= 0; // 0 disabled
}

module.exports = {
  name: "anti",
  description: "manage various automod settings for the server",
  category: "AUTOMOD",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 2,
    subcommands: [
      { trigger: "ghostping <on|off>", description: "detect and log ghost mentions" },
      { trigger: "spam <on|off>", description: "enable or disable antispam detection" },
      {
        trigger: "massmention <on|off> [threshold]",
        description: "enable/disable massmention detection (default threshold 3)",
      },
    ],
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "ghostping",
        description: "detects and logs ghost mentions",
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
      {
        name: "spam",
        description: "enable or disable antispam detection",
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
      {
        name: "massmention",
        description: "enable or disable massmention detection",
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
          {
            name: "threshold",
            description: "mention threshold (default 3). Required when ON.",
            required: false,
            type: ApplicationCommandOptionType.Integer,
          },
        ],
      },
    ],
  },

  async messageRun(message, args, data) {
    const settings = data.settings;
    ensureAutomodDefaults(settings);

    const sub = (args[0] || "").toLowerCase();
    const raw = args[1];

    if (!raw) return message.safeReply("Missing status. Use `on/off`.");

    if (sub === "ghostping") {
      const t = parseToggle(raw);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.anti_ghostping = t;
      await settings.save();
      return message.safeReply(`Configuration saved! Anti-Ghostping is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "spam") {
      const t = parseToggle(raw);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.anti_spam = t;
      await settings.save();
      return message.safeReply(`Antispam detection is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "massmention") {
      const t = parseToggle(raw);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");

      if (!t) {
        settings.automod.anti_massmention = 0;
        await settings.save();
        return message.safeReply("Mass mention detection is now **disabled**.");
      }

      const threshold = args[2] ? Number(args[2]) : 3;
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50)
        return message.safeReply("Threshold must be an integer between 1 and 50.");

      settings.automod.anti_massmention = threshold;
      await settings.save();
      return message.safeReply(`Mass mention detection is now **enabled** (threshold: **${threshold}**).`);
    }

    return message.safeReply("Invalid command usage!");
  },

  async interactionRun(interaction, data) {
    const settings = data.settings;
    ensureAutomodDefaults(settings);

    const sub = interaction.options.getSubcommand();

    if (sub === "ghostping") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.anti_ghostping = !!t;
      await settings.save();
      return interaction.followUp(`Configuration saved! Anti-Ghostping is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "spam") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.anti_spam = !!t;
      await settings.save();
      return interaction.followUp(`Antispam detection is now **${t ? "enabled" : "disabled"}**.`);
    }

    if (sub === "massmention") {
      const t = parseToggle(interaction.options.getString("status"));
      if (!t) {
        settings.automod.anti_massmention = 0;
        await settings.save();
        return interaction.followUp("Mass mention detection is now **disabled**.");
      }

      const threshold = interaction.options.getInteger("threshold") ?? 3;
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50)
        return interaction.followUp("Threshold must be an integer between 1 and 50.");

      settings.automod.anti_massmention = threshold;
      await settings.save();
      return interaction.followUp(`Mass mention detection is now **enabled** (threshold: **${threshold}**).`);
    }

    return interaction.followUp("Invalid command usage!");
  },
};
