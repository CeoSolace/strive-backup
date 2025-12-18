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
  a.anti_attachments ??= false;
  a.anti_invites ??= false;
  a.anti_links ??= false;
  a.max_lines ??= 0; // 0 disabled
}

module.exports = {
  name: "autodelete",
  description: "manage the autodelete settings for the server",
  category: "AUTOMOD",
  userPermissions: ["ManageGuild"],

  command: {
    enabled: true,
    minArgsCount: 2,
    subcommands: [
      { trigger: "attachments <on|off>", description: "delete messages with attachments" },
      { trigger: "invites <on|off>", description: "delete messages with discord invites" },
      { trigger: "links <on|off>", description: "delete messages with links" },
      { trigger: "maxlines <number>", description: "max lines allowed per message (0 disables)" },
    ],
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "attachments",
        description: "delete messages with attachments",
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
        name: "invites",
        description: "delete messages with discord invites",
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
        name: "links",
        description: "delete messages with links",
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
        name: "maxlines",
        description: "set max lines allowed (0 disables)",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "amount",
            description: "0-50 (0 disables)",
            required: true,
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

    if (sub === "attachments") {
      const t = parseToggle(args[1]);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.anti_attachments = t;
      await settings.save();
      return message.safeReply(
        t ? "Messages **with attachments** will now be automatically deleted."
          : "Messages will **not** be filtered for attachments now."
      );
    }

    if (sub === "invites") {
      const t = parseToggle(args[1]);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.anti_invites = t;
      await settings.save();
      return message.safeReply(
        t ? "Messages **with Discord invites** will now be automatically deleted."
          : "Messages will **not** be filtered for Discord invites now."
      );
    }

    if (sub === "links") {
      const t = parseToggle(args[1]);
      if (t === null) return message.safeReply("Invalid status. Value must be `on/off`.");
      settings.automod.anti_links = t;
      await settings.save();
      return message.safeReply(
        t ? "Messages **with links** will now be automatically deleted."
          : "Messages will **not** be filtered for links now."
      );
    }

    if (sub === "maxlines") {
      const lines = Number(args[1]);
      if (!Number.isInteger(lines) || lines < 0 || lines > 50)
        return message.safeReply("Max lines must be an integer between 0 and 50 (0 disables).");

      settings.automod.max_lines = lines;
      await settings.save();

      return message.safeReply(
        lines === 0
          ? "Maximum line limit is **disabled**."
          : `Messages longer than **${lines}** lines will now be automatically deleted.`
      );
    }

    return message.safeReply("Invalid command usage!");
  },

  async interactionRun(interaction, data) {
    const settings = data.settings;
    ensureAutomodDefaults(settings);

    const sub = interaction.options.getSubcommand();

    if (sub === "attachments") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.anti_attachments = !!t;
      await settings.save();
      return interaction.followUp(
        t ? "Messages **with attachments** will now be automatically deleted."
          : "Messages will **not** be filtered for attachments now."
      );
    }

    if (sub === "invites") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.anti_invites = !!t;
      await settings.save();
      return interaction.followUp(
        t ? "Messages **with Discord invites** will now be automatically deleted."
          : "Messages will **not** be filtered for Discord invites now."
      );
    }

    if (sub === "links") {
      const t = parseToggle(interaction.options.getString("status"));
      settings.automod.anti_links = !!t;
      await settings.save();
      return interaction.followUp(
        t ? "Messages **with links** will now be automatically deleted."
          : "Messages will **not** be filtered for links now."
      );
    }

    if (sub === "maxlines") {
      const lines = interaction.options.getInteger("amount");
      if (!Number.isInteger(lines) || lines < 0 || lines > 50)
        return interaction.followUp("Max lines must be an integer between 0 and 50 (0 disables).");

      settings.automod.max_lines = lines;
      await settings.save();

      return interaction.followUp(
        lines === 0
          ? "Maximum line limit is **disabled**."
          : `Messages longer than **${lines}** lines will now be automatically deleted.`
      );
    }

    return interaction.followUp("Invalid command usage!");
  },
};
