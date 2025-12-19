const { ApplicationCommandOptionType, EmbedBuilder, ChannelType } = require("discord.js");
const { getSettings, saveSettings } = require("@schemas/Guild");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "ticketcat",
  description: "manage ticket categories",
  category: "TICKET",
  userPermissions: ["ManageGuild"],
  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      {
        trigger: "list",
        description: "list all ticket categories",
      },
      {
        trigger: "add <category> | <staff_roles>",
        description: "add a ticket category",
      },
      {
        trigger: "remove <category>",
        description: "remove a ticket category",
      },
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
            name: "category",
            description: "the category name",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
          {
            name: "staff_roles",
            description: "the staff roles",
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
            name: "category",
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
      const category = split[0].trim();
      const staff_roles = split[1]?.trim();
      response = await addCategory(message.guild, data, category, staff_roles);
    } else if (sub === "remove") {
      const category = args.slice(1).join(" ").trim();
      response = await removeCategory(message.guild, data, category);
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
      const category = interaction.options.getString("category");
      const staff_roles = interaction.options.getString("staff_roles");
      response = await addCategory(interaction.guild, data, category, staff_roles);
    } else if (sub === "remove") {
      const category = interaction.options.getString("category");
      response = await removeCategory(interaction.guild, data, category);
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
    value: `**Staff:** ${category.staff_roles.map(r => `<@&${r}>`).join(", ") || "None"}\n**Category ID:** \`${category.parent_category || "None"}\``
  }));

  return {
    embeds: [new EmbedBuilder().setAuthor({ name: "Ticket Categories" }).addFields(fields)]
  };
}

async function addCategory(guild, data, categoryName, staff_roles) {
  if (!categoryName) return "Invalid usage! Missing category name.";
  if (data.settings.ticket.categories.find(c => c.name === categoryName)) {
    return `Category \`${categoryName}\` already exists.`;
  }

  // Create Discord category channel
  let parentCategoryId = null;
  try {
    const categoryChannel = await guild.channels.create({
      name: `🎟️・${categoryName}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ["ViewChannel"] }
      ]
    });
    parentCategoryId = categoryChannel.id;
  } catch (ex) {
    return "Failed to create category channel. Ensure bot has Manage Channels permission.";
  }

  const staffRoles = (staff_roles?.split(",").map(r => r.trim()).filter(r => /^\d+$/.test(r)) || [])
    .filter(roleId => guild.roles.cache.has(roleId));

  data.settings.ticket.categories.push({
    name: categoryName,
    staff_roles: staffRoles,
    parent_category: parentCategoryId
  });
  await data.settings.save();

  return `Category \`${categoryName}\` added with dedicated channel category.`;
}

async function removeCategory(guild, data, categoryName) {
  const categories = data.settings.ticket.categories;
  const category = categories.find(c => c.name === categoryName);
  if (!category) {
    return `Category \`${categoryName}\` does not exist.`;
  }

  // Delete Discord category channel if exists
  if (category.parent_category) {
    const channel = guild.channels.cache.get(category.parent_category);
    if (channel?.type === ChannelType.GuildCategory) {
      await channel.delete().catch(() => {});
    }
  }

  data.settings.ticket.categories = categories.filter(c => c.name !== categoryName);
  await data.settings.save();

  return `Category \`${categoryName}\` removed.`;
}
