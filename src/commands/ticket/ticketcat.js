const { ApplicationCommandOptionType, EmbedBuilder, ChannelType } = require("discord.js");
const { getSettings, saveSettings } = require("@schemas/Guild");

module.exports = {
  name: "ticketcat",
  description: "manage ticket categories",
  category: "TICKET",
  userPermissions: ["ManageGuild"],
  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      { trigger: "list", description: "list all ticket categories" },
      { trigger: "add <category> | <description> | <staff_roles> | <emoji>", description: "add a ticket category" },
      { trigger: "remove <category>", description: "remove a ticket category" },
    ],
  },
  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "list",
        description: "list all ticket categories",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "add",
        description: "add a ticket category",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "name",
            description: "the category name",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: "description",
            description: "the category description",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: "staff_roles",
            description: "comma-separated role IDs",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: "emoji",
            description: "emoji for category",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: "remove",
        description: "remove a ticket category",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "name",
            description: "the category name",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
    ],
  },
  async messageRun(message, args, data) {
    const sub = args[0].toLowerCase();
    let response;
    if (sub === "list") {
      response = listCategories(data);
    } else if (sub === "add") {
      const split = args.slice(1).join(" ").split("|");
      if (split.length < 2) return message.safeReply("Invalid format. Use: add <category> | <description> | <staff_roles> | <emoji>");
      const name = split[0].trim();
      const desc = split[1].trim();
      const staff_roles = split[2]?.trim();
      const emoji = split[3]?.trim() || '';
      response = await addCategory(message.guild, data, name, desc, staff_roles, emoji);
    } else if (sub === "remove") {
      const name = args.slice(1).join(" ").trim();
      response = await removeCategory(message.guild, data, name);
    } else {
      response = "Invalid subcommand.";
    }
    await message.safeReply(response);
  },
  async interactionRun(interaction, data) {
    const sub = interaction.options.getSubcommand();
    let response;
    if (sub === "list") {
      response = listCategories(data);
    } else if (sub === "add") {
      const name = interaction.options.getString("name");
      const desc = interaction.options.getString("description");
      const staff_roles = interaction.options.getString("staff_roles");
      const emoji = interaction.options.getString("emoji") || '';
      response = await addCategory(interaction.guild, data, name, desc, staff_roles, emoji);
    } else if (sub === "remove") {
      const name = interaction.options.getString("name");
      response = await removeCategory(interaction.guild, data, name);
    } else {
      response = "Invalid subcommand";
    }
    await interaction.followUp(response);
  },
};

function listCategories(data) {
  const categories = data.settings.ticket.categories;
  if (!categories?.length) return "No ticket categories found.";
  const fields = categories.map(category => ({
    name: category.name,
    value: `**Description:** ${category.desc}\n**Emoji:** ${category.emoji || "None"}\n**Staff Roles:** ${category.staff_roles.map(r => `<@&${r}>`).join(", ") || "None"}\n**Parent Category:** ${category.parent_category ? `<#${category.parent_category}>` : "None"}`
  }));
  return {
    embeds: [new EmbedBuilder()
      .setAuthor({ name: "Ticket Categories" })
      .addFields(fields)
    ]
  };
}

async function addCategory(guild, data, name, desc, staff_roles, emoji) {
  if (!name) return "Category name required.";
  if (!desc) return "Category description required.";
  if (data.settings.ticket.categories.find(c => c.name === name)) {
    return `Category \`${name}\` already exists.`;
  }
  let parentCategoryId = null;
  try {
    const catChannel = await guild.channels.create({
      name: `🎟️・${name}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ["ViewChannel"] }
      ]
    });
    parentCategoryId = catChannel.id;
  } catch (ex) {
    return "Failed to create category channel. Ensure bot has Manage Channels permission.";
  }
  const staffRoles = (staff_roles?.split(",").map(r => r.trim()).filter(r => /^\d+$/.test(r)) || [])
    .filter(roleId => guild.roles.cache.has(roleId));
  data.settings.ticket.categories.push({
    name,
    desc,
    staff_roles: staffRoles,
    emoji,
    parent_category: parentCategoryId
  });
  await data.settings.save();
  return `✅ Category \`${name}\` created with dedicated channel category.`;
}

async function removeCategory(guild, data, name) {
  const category = data.settings.ticket.categories.find(c => c.name === name);
  if (!category) return `Category \`${name}\` not found.`;
  if (category.parent_category) {
    const channel = guild.channels.cache.get(category.parent_category);
    if (channel?.type === ChannelType.GuildCategory) {
      await channel.delete().catch(() => {});
    }
  }
  data.settings.ticket.categories = data.settings.ticket.categories.filter(c => c.name !== name);
  await data.settings.save();
  return `✅ Category \`${name}\` removed.`;
}
