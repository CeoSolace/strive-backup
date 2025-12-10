const { CommandCategory, BotClient } = require("@src/structures");
const { EMBED_COLORS, SUPPORT_SERVER } = require("@root/config.js");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Message,
  ButtonBuilder,
  CommandInteraction,
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
    let trigger = args[0];

    if (!trigger) {
      const response = await getHelpMenu(message);
      const sentMsg = await message.safeReply(response);
      return waiter(sentMsg, message.author.id, data.prefix);
    }

    const cmd = message.client.getCommand(trigger);
    if (cmd) {
      const embed = getCommandUsage(cmd, data.prefix, trigger);
      return message.safeReply({ embeds: [embed] });
    }

    await message.safeReply("No matching command found");
  },

  async interactionRun(interaction) {
    let cmdName = interaction.options.getString("command");

    if (!cmdName) {
      const response = await getHelpMenu(interaction);
      const sentMsg = await interaction.followUp(response);
      return waiter(sentMsg, interaction.user.id);
    }

    const cmd = interaction.client.slashCommands.get(cmdName);
    if (cmd) {
      const embed = getSlashUsage(cmd);
      return interaction.followUp({ embeds: [embed] });
    }

    await interaction.followUp("No matching command found");
  },
};

async function getHelpMenu({ client, guild }) {
  const options = [];

  // Add all normal categories
  for (const [k, v] of Object.entries(CommandCategory)) {
    if (v.enabled === false) continue;
    options.push({
      label: v.name,
      value: k,
      description: `View commands in ${v.name} category`,
      emoji: v.emoji,
    });
  }

  // 🔥 HARD-CODED SPECIAL CATEGORY: WHITELISTING
  options.push({
    label: "Whitelisting",
    value: "WHITELISTING",
    description: "Manage temporary bot whitelists (1-hour)",
    emoji: "🛡️",
  });

  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help-menu")
      .setPlaceholder("Choose the command category")
      .addOptions(options)
  );

  let components = [];
  components.push(
    new ButtonBuilder().setCustomId("previousBtn").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("nextBtn").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  let buttonsRow = new ActionRowBuilder().addComponents(components);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setThumbnail(client.user.displayAvatarURL())
    .setDescription(
      "**About Me:**\n" +
        `Hello I am ${guild.members.me.displayName}!\n` +
        "A cool multipurpose discord bot which can serve all your needs\n\n" +
        `**Invite Me:** [Here](${client.getInvite()})\n` +
        `**Support Server:** [Join](${SUPPORT_SERVER})`
    );

  return {
    embeds: [embed],
    components: [menuRow, buttonsRow],
  };
}

const waiter = (msg, userId, prefix) => {
  const collector = msg.channel.createMessageComponentCollector({
    filter: (reactor) => reactor.user.id === userId && msg.id === reactor.message.id,
    idle: IDLE_TIMEOUT * 1000,
    dispose: true,
    time: 5 * 60 * 1000,
  });

  let arrEmbeds = [];
  let currentPage = 0;
  let menuRow = msg.components[0];
  let buttonsRow = msg.components[1];

  collector.on("collect", async (response) => {
    if (!["help-menu", "previousBtn", "nextBtn"].includes(response.customId)) return;
    await response.deferUpdate();

    switch (response.customId) {
      case "help-menu": {
        const cat = response.values[0].toUpperCase();
        arrEmbeds = prefix ? getMsgCategoryEmbeds(msg.client, cat, prefix) : getSlashCategoryEmbeds(msg.client, cat);
        currentPage = 0;

        let components = [];
        buttonsRow.components.forEach((button) =>
          components.push(ButtonBuilder.from(button).setDisabled(arrEmbeds.length > 1 ? false : true))
        );

        buttonsRow = new ActionRowBuilder().addComponents(components);
        msg.editable && (await msg.edit({ embeds: [arrEmbeds[currentPage]], components: [menuRow, buttonsRow] }));
        break;
      }

      case "previousBtn":
        if (currentPage !== 0) {
          --currentPage;
          msg.editable && (await msg.edit({ embeds: [arrEmbeds[currentPage]], components: [menuRow, buttonsRow] }));
        }
        break;

      case "nextBtn":
        if (currentPage < arrEmbeds.length - 1) {
          currentPage++;
          msg.editable && (await msg.edit({ embeds: [arrEmbeds[currentPage]], components: [menuRow, buttonsRow] }));
        }
        break;
    }
  });

  collector.on("end", () => {
    if (!msg.guild || !msg.channel) return;
    return msg.editable && msg.edit({ components: [] });
  });
};

function getSlashCategoryEmbeds(client, category) {
  // 🔥 SPECIAL: WHITELISTING (slash only shows prefix command info here)
  if (category === "WHITELISTING") {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setAuthor({ name: "Whitelisting Commands" })
      .setDescription(
        "`-whitelist <user-id>`\n" +
        "❯ Allows a user to add bots for **1 hour**.\n" +
        "❯ **Only the server owner** can use this command.\n\n" +
        "This is a security feature to prevent unauthorized bot additions."
      )
      .setFooter({ text: "This command is prefix-only (-whitelist)" });
    return [embed];
  }

  let collector = "";

  if (category === "IMAGE") {
    client.slashCommands
      .filter((cmd) => cmd.category === category)
      .forEach((cmd) => (collector += `\`/${cmd.name}\`\n ❯ ${cmd.description}\n\n`));

    const availableFilters = client.slashCommands
      .get("filter")
      ?.slashCommand.options?.[0]?.choices?.map((ch) => ch.name)
      .join(", ") || "None";

    const availableGens = client.slashCommands
      .get("generator")
      ?.slashCommand.options?.[0]?.choices?.map((ch) => ch.name)
      .join(", ") || "None";

    collector +=
      "**Available Filters:**\n" + `${availableFilters}\n\n**Available Generators**\n` + `${availableGens}`;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription(collector);

    return [embed];
  }

  const commands = Array.from(client.slashCommands.filter((cmd) => cmd.category === category).values());

  if (commands.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription("No commands in this category");

    return [embed];
  }

  const arrSplitted = [];
  const arrEmbeds = [];

  while (commands.length) {
    let toAdd = commands.splice(0, commands.length > CMDS_PER_PAGE ? CMDS_PER_PAGE : commands.length);

    toAdd = toAdd.map((cmd) => {
      const subCmds = cmd.slashCommand.options?.filter((opt) => opt.type === ApplicationCommandOptionType.Subcommand);
      const subCmdsString = subCmds?.map((s) => s.name).join(", ");

      return `\`/${cmd.name}\`\n ❯ **Description**: ${cmd.description}\n ${
        !subCmds?.length ? "" : `❯ **SubCommands [${subCmds?.length}]**: ${subCmdsString}\n`
      } `;
    });

    arrSplitted.push(toAdd);
  }

  arrSplitted.forEach((item, index) => {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription(item.join("\n"))
      .setFooter({ text: `page ${index + 1} of ${arrSplitted.length}` });
    arrEmbeds.push(embed);
  });

  return arrEmbeds;
}

function getMsgCategoryEmbeds(client, category, prefix) {
  // 🔥 SPECIAL: WHITELISTING
  if (category === "WHITELISTING") {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setAuthor({ name: "Whitelisting Commands" })
      .setDescription(
        `\`${prefix}whitelist <user-id>\`\n` +
        "❯ Allows a user to add bots for **1 hour**.\n" +
        "❯ **Only the server owner** can use this command.\n\n" +
        "This is a security feature to prevent unauthorized bot additions."
      );
    return [embed];
  }

  let collector = "";

  if (category === "IMAGE") {
    client.commands
      .filter((cmd) => cmd.category === category)
      .forEach((cmd) =>
        cmd.command.aliases.forEach((alias) => {
          collector += `\`${alias}\`, `;
        })
      );

    collector +=
      "\n\nYou can use these image commands in following formats\n" +
      `**${prefix}cmd:** Picks message authors avatar as image\n` +
      `**${prefix}cmd <@member>:** Picks mentioned members avatar as image\n` +
      `**${prefix}cmd <url>:** Picks image from provided URL\n` +
      `**${prefix}cmd [attachment]:** Picks attachment image`;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription(collector);

    return [embed];
  }

  const commands = client.commands.filter((cmd) => cmd.category === category);

  if (commands.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription("No commands in this category");

    return [embed];
  }

  const arrSplitted = [];
  const arrEmbeds = [];

  while (commands.length) {
    let toAdd = commands.splice(0, commands.length > CMDS_PER_PAGE ? CMDS_PER_PAGE : commands.length);
    toAdd = toAdd.map((cmd) => `\`${prefix}${cmd.name}\`\n ❯ ${cmd.description}\n`);
    arrSplitted.push(toAdd);
  }

  arrSplitted.forEach((item, index) => {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setThumbnail(CommandCategory[category]?.image)
      .setAuthor({ name: `${category} Commands` })
      .setDescription(item.join("\n"))
      .setFooter({
        text: `page ${index + 1} of ${arrSplitted.length} | Type ${prefix}help <command> for more command information`,
      });
    arrEmbeds.push(embed);
  });

  return arrEmbeds;
}
