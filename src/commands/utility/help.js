// src/commands/utility/help.js
const { CommandCategory } = require("@src/structures");
const { EMBED_COLORS, SUPPORT_SERVER } = require("@root/config.js");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ApplicationCommandOptionType,
  ButtonStyle,
} = require("discord.js");
const { getCommandUsage, getSlashUsage } = require("@handlers/command");

const CMDS_PER_PAGE = 5;
const IDLE_TIMEOUT = 30;

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "help",
  description: "command help menu",
  category: "UTILITY",
  botPermissions: ["EmbedLinks"],
  command: {
    enabled: true,
    usage: "[command]",
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "command",
        description: "name of the command",
        required: false,
        type: ApplicationCommandOptionType.String,
      },
    ],
  },

  async messageRun(message, args, data) {
    const trigger = args[0];

    if (!trigger) {
      const response = await getHelpMenu(message, data.prefix);
      const sent = await message.safeReply(response);
      return waiter(sent, message.author.id, data.prefix);
    }

    const cmd = message.client.getCommand(trigger);
    if (cmd) {
      const embed = getCommandUsage(cmd, data.prefix, trigger);
      return message.safeReply({ embeds: [embed] });
    }

    await message.safeReply("No matching command found");
  },

  async interactionRun(interaction) {
    const cmdName = interaction.options.getString("command");

    if (!cmdName) {
      const response = await getHelpMenu(interaction);
      const sent = await interaction.followUp(response);
      return waiter(sent, interaction.user.id);
    }

    const cmd = interaction.client.slashCommands.get(cmdName);
    if (cmd) {
      const embed = getSlashUsage(cmd);
      return interaction.followUp({ embeds: [embed] });
    }

    await interaction.followUp("No matching command found");
  },
};

// =========================
// HELP MENU BUILDER
// =========================
async function getHelpMenu({ client, guild }, prefix = "=") {
  const options = [];

  // Normal categories
  for (const [k, v] of Object.entries(CommandCategory)) {
    if (v.enabled === false) continue;
    options.push({
      label: v.name,
      value: k,
      description: `View commands in ${v.name}`,
      emoji: v.emoji,
    });
  }

  // 🔥 PREFIX-ONLY CATEGORY: ANTI-NUKE
  options.push({
    label: "Anti-Nuke",
    value: "ANTI_NUKE",
    description: "Server protection & restore system",
    emoji: "🚨",
  });

  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help-menu")
      .setPlaceholder("Choose a command category")
      .addOptions(options)
  );

  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("previousBtn")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("nextBtn")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setThumbnail(client.user.displayAvatarURL())
    .setDescription(
      `**About Me**\n` +
        `Hello, I am **${guild.members.me.displayName}**.\n` +
        `A multipurpose Discord bot with built-in security.\n\n` +
        `**🚨 Anti-Nuke Protection**\n` +
        `Available via **\`${prefix}help\` only**.\n\n` +
        `**Invite Me:** [Here](${client.getInvite()})\n` +
        `**Support Server:** [Join](${SUPPORT_SERVER})`
    );

  return {
    embeds: [embed],
    components: [menuRow, buttonsRow],
  };
}

// =========================
// INTERACTION HANDLER
// =========================
const waiter = (msg, userId, prefix) => {
  const collector = msg.channel.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.message.id === msg.id,
    idle: IDLE_TIMEOUT * 1000,
  });

  let embeds = [];
  let page = 0;
  let menuRow = msg.components[0];
  let buttonsRow = msg.components[1];

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    if (i.customId === "help-menu") {
      const category = i.values[0];

      embeds =
        prefix
          ? getMsgCategoryEmbeds(msg.client, category, prefix)
          : getSlashCategoryEmbeds(msg.client, category);

      page = 0;
      buttonsRow.components.forEach((b) =>
        b.setDisabled(embeds.length <= 1)
      );

      return msg.edit({ embeds: [embeds[0]], components: [menuRow, buttonsRow] });
    }

    if (i.customId === "previousBtn" && page > 0) page--;
    if (i.customId === "nextBtn" && page < embeds.length - 1) page++;

    await msg.edit({ embeds: [embeds[page]], components: [menuRow, buttonsRow] });
  });

  collector.on("end", () => msg.edit({ components: [] }).catch(() => {}));
};

// =========================
// SLASH HELP (ANTI-NUKE HIDDEN)
// =========================
function getSlashCategoryEmbeds(client, category) {
  // ❌ Anti-Nuke never shows in slash help
  if (category === "ANTI_NUKE") {
    return [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setDescription("This category is available via `=help` only."),
    ];
  }

  const cmds = [...client.slashCommands.values()].filter(
    (c) => c.category === category
  );

  if (!cmds.length) {
    return [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setDescription("No commands in this category"),
    ];
  }

  return buildPagedEmbeds(cmds, true);
}

// =========================
// PREFIX HELP (ANTI-NUKE LIVES HERE)
// =========================
function getMsgCategoryEmbeds(client, category, prefix) {
  if (category === "ANTI_NUKE") {
    return [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setAuthor({ name: "Anti-Nuke System" })
        .setDescription(
          "**Server Protection Active**\n\n" +
          "• Detects nukes & mass admin abuse\n" +
          "• Auto restores roles, channels & perms\n" +
          "• Logs threats in `#bright-threats`\n" +
          "• Owner review & restore panels\n\n" +
          `Accessed via **\`${prefix}help\` only**`
        ),
    ];
  }

  const cmds = [...client.commands.values()].filter(
    (c) => c.category === category
  );

  if (!cmds.length) {
    return [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setDescription("No commands in this category"),
    ];
  }

  return buildPagedEmbeds(cmds, false, prefix);
}

// =========================
// PAGINATION
// =========================
function buildPagedEmbeds(commands, slash, prefix = "") {
  const pages = [];
  while (commands.length) pages.push(commands.splice(0, CMDS_PER_PAGE));

  return pages.map((page, i) =>
    new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setDescription(
        page
          .map((c) =>
            slash
              ? `\`/${c.name}\` — ${c.description}`
              : `\`${prefix}${c.name}\` — ${c.description}`
          )
          .join("\n\n")
      )
      .setFooter({ text: `Page ${i + 1} of ${pages.length}` })
  );
}
