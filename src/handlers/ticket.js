const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  StringSelectMenuBuilder,
  ComponentType,
  PermissionFlagsBits,
} = require("discord.js");
const { TICKET } = require("@root/config.js");

// schemas
const { getSettings } = require("@schemas/Guild");

// helpers
const { postToBin } = require("@helpers/HttpUtils");
const { error } = require("@helpers/Logger");

const OPEN_PERMS = ["ManageChannels"];
const CLOSE_PERMS = ["ManageChannels", "ReadMessageHistory"];

/**
 * Utils
 */
function toChannelSlug(str) {
  return (str || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);
}

function getTicketNumberFromName(name) {
  const m = (name || "").match(/-(\d+)$/);
  return m ? m[1] : null;
}

/**
 * IMPORTANT:
 * - Do NOT depend on channel.name, because claim renames it.
 * - Topic is the reliable identifier.
 * - Backwards compatible with old "tіcket|" prefix (non-ascii i).
 * @param {import('discord.js').Channel} channel
 */
function isTicketChannel(channel) {
  return (
    channel?.type === ChannelType.GuildText &&
    typeof channel.topic === "string" &&
    (channel.topic.startsWith("ticket|") || channel.topic.startsWith("tіcket|"))
  );
}

/**
 * @param {import('discord.js').Guild} guild
 */
function getTicketChannels(guild) {
  return guild.channels.cache.filter((ch) => isTicketChannel(ch));
}

/**
 * Ticket number generator:
 * scans ALL ticket channels (open + claimed) and returns max+1.
 * This stays correct even if tickets are deleted or renamed on claim.
 * @param {import('discord.js').Guild} guild
 */
function getNextTicketNumber(guild) {
  const chans = getTicketChannels(guild);
  let max = 0;

  for (const ch of chans.values()) {
    const nStr = getTicketNumberFromName(ch.name);
    if (!nStr) continue;
    const n = parseInt(nStr, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }

  return String(max + 1);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 */
function getExistingTicketChannel(guild, userId) {
  const tktChannels = getTicketChannels(guild);
  return tktChannels.filter((ch) => ch.topic.split("|")[1] === userId).first();
}

/**
 * @param {import('discord.js').BaseGuildTextChannel} channel
 */
async function parseTicketDetails(channel) {
  if (!channel.topic) return;
  const split = channel.topic.split("|");
  const userId = split[1];
  const catName = split[2] || "Default";
  const user = await channel.client.users.fetch(userId, { cache: false }).catch(() => {});
  return { user, catName };
}

function getCustomId(btn) {
  // v14 stores it as custom_id internally
  return btn?.data?.custom_id || btn?.data?.customId || null;
}

/**
 * @param {import('discord.js').BaseGuildTextChannel} channel
 * @param {import('discord.js').User} closedBy
 * @param {string} [reason]
 */
async function closeTicket(channel, closedBy, reason) {
  if (!channel.deletable || !channel.permissionsFor(channel.guild.members.me).has(CLOSE_PERMS)) {
    return "MISSING_PERMISSIONS";
  }

  try {
    const config = await getSettings(channel.guild);
    const messages = await channel.messages.fetch();
    const reversed = Array.from(messages.values()).reverse();

    let content = "";
    reversed.forEach((m) => {
      content += `[${new Date(m.createdAt).toLocaleString("en-US")}] - ${m.author.username}\n`;
      if (m.cleanContent !== "") content += `${m.cleanContent}\n`;
      if (m.attachments.size > 0) content += `${m.attachments.map((att) => att.proxyURL).join(", ")}\n`;
      content += "\n";
    });

    const logsUrl = await postToBin(content, `Ticket Logs for ${channel.name}`);
    const ticketDetails = await parseTicketDetails(channel);

    const components = [];
    if (logsUrl) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Transcript").setURL(logsUrl.short).setStyle(ButtonStyle.Link)
        )
      );
    }

    if (channel.deletable) await channel.delete();

    const embed = new EmbedBuilder().setAuthor({ name: "Ticket Closed" }).setColor(TICKET.CLOSE_EMBED);
    const fields = [];

    if (reason) fields.push({ name: "Reason", value: reason, inline: false });
    fields.push(
      {
        name: "Opened By",
        value: ticketDetails?.user ? ticketDetails.user.username : "Unknown",
        inline: true,
      },
      {
        name: "Closed By",
        value: closedBy ? closedBy.username : "Unknown",
        inline: true,
      }
    );

    embed.setFields(fields);

    // send embed to log channel
    if (config.ticket.log_channel) {
      const logChannel = channel.guild.channels.cache.get(config.ticket.log_channel);
      logChannel?.safeSend?.({ embeds: [embed], components });
    }

    // send embed to user
    if (ticketDetails?.user) {
      const dmEmbed = embed
        .setDescription(`**Server:** ${channel.guild.name}\n**Category:** ${ticketDetails.catName}`)
        .setThumbnail(channel.guild.iconURL());
      ticketDetails.user.send({ embeds: [dmEmbed], components }).catch(() => {});
    }

    return "SUCCESS";
  } catch (ex) {
    error("closeTicket", ex);
    return "ERROR";
  }
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} author
 */
async function closeAllTickets(guild, author) {
  const channels = getTicketChannels(guild);
  let success = 0;
  let failed = 0;

  for (const ch of channels) {
    const status = await closeTicket(ch[1], author, "Force close all open tickets");
    if (status === "SUCCESS") success += 1;
    else failed += 1;
  }

  return [success, failed];
}

/**
 * CLAIM RULES (as requested):
 * - Anyone with ADMINISTRATOR is staff for ALL tickets,
 *   BUT admins cannot claim their own ticket.
 * - Non-admin staff can claim if:
 *   - they have ManageChannels OR
 *   - they have a staff role for that ticket's category (settings.ticket.categories[].staff_roles)
 * - No one can claim their own ticket.
 * - Claim renames channel by replacing "ticket" with staff username:
 *     ticket-user-12 -> staffname-user-12
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleTicketClaim(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { channel, guild, user, message } = interaction;
  if (!guild || !channel) return interaction.editReply("Invalid ticket.");
  if (!isTicketChannel(channel)) return interaction.editReply("This is not a ticket channel.");

  const split = channel.topic.split("|");
  const openerId = split[1];
  const catName = split[2] || "Default";

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply("Could not verify your permissions.");

  // nobody can claim their own ticket (admins included)
  if (openerId === user.id) {
    return interaction.editReply("You can’t claim your own ticket.");
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const hasManageChannels = member.permissions.has(PermissionFlagsBits.ManageChannels);

  // category staff roles from settings
  const settings = await getSettings(guild);
  const picked = (settings.ticket.categories || []).find((c) => c.name === catName);
  const staffRoles = picked?.staff_roles || [];
  const hasStaffRole = staffRoles.some((rid) => member.roles.cache.has(rid));

  // Admins are staff for all tickets; otherwise must be ManageChannels or staff role
  if (!isAdmin && !hasManageChannels && !hasStaffRole) {
    return interaction.editReply("You can't claim this ticket.");
  }

  // already claimed? (we define: not starting with ticket-/tіcket- anymore)
  const isUnclaimed = channel.name.startsWith("ticket-") || channel.name.startsWith("tіcket-");
  if (!isUnclaimed) return interaction.editReply("This ticket is already claimed.");

  const staffSlug = toChannelSlug(user.username);

  // expected: ticket-<userslug>-<num> (but tolerate variations)
  const parts = channel.name.split("-");
  const num = getTicketNumberFromName(channel.name) || "0";
  const userPart = parts.length >= 3 ? parts.slice(1, -1).join("-") : "user";
  const newName = `${staffSlug}-${userPart}-${num}`.slice(0, 100);

  try {
    await channel.setName(newName);

    // Disable claim button on the original ticket message
    const newComponents = (message.components || []).map((row) => {
      const newRow = ActionRowBuilder.from(row);
      newRow.components = newRow.components.map((c) => {
        const btn = ButtonBuilder.from(c);
        const cid = getCustomId(btn);
        if (cid === "TICKET_CLAIM") {
          btn.setDisabled(true);
          btn.setLabel(`Claimed by ${user.username}`);
          btn.setStyle(ButtonStyle.Secondary);
        }
        return btn;
      });
      return newRow;
    });

    if (newComponents.length) await message.edit({ components: newComponents });

    await channel.send(`✅ Ticket claimed by ${user.toString()}.`);
    return interaction.editReply(`Ticket claimed! Go to <#${channel.id}>`);
  } catch (ex) {
    error("handleTicketClaim", ex);
    return interaction.editReply("Failed to claim ticket (likely missing channel rename permissions).");
  }
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleTicketOpen(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  if (!guild.members.me.permissions.has(OPEN_PERMS)) {
    return interaction.followUp(
      "Cannot create ticket channel, missing `Manage Channel` permission. Contact server manager for help!"
    );
  }

  const alreadyExists = getExistingTicketChannel(guild, user.id);
  if (alreadyExists) return interaction.followUp("You already have an open ticket");

  const settings = await getSettings(guild);

  // limit check
  const openCount = getTicketChannels(guild).size;
  if (openCount > settings.ticket.limit) return interaction.followUp("There are too many open tickets. Try again later");

  // pick ticket category (type)
  let catName = null;
  let catPerms = [];
  let parentCategoryId = null;

  const categories = settings.ticket.categories || [];
  if (categories.length > 0) {
    const options = categories.map((cat) => ({ label: cat.name, value: cat.name }));

    const menuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket-menu")
        .setPlaceholder("Choose the ticket category")
        .addOptions(options)
    );

    await interaction.followUp({ content: "Please choose a ticket category", components: [menuRow] });

    const res = await interaction.channel
      .awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60 * 1000,
      })
      .catch((err) => {
        if (err.message?.includes("time")) return;
      });

    if (!res) return interaction.editReply({ content: "Timed out. Try again", components: [] });

    // IMPORTANT: acknowledge the select interaction
    await res.deferUpdate().catch(() => {});

    // remove the menu
    await interaction.editReply({ content: "Processing...", components: [] });

    catName = res.values[0];
    const picked = categories.find((cat) => cat.name === catName);

    catPerms = picked?.staff_roles || [];
    parentCategoryId = picked?.parent_category || null; // Discord Category Channel ID per ticketcat
  }

  try {
    const ticketNumber = getNextTicketNumber(guild);
    const userSlug = toChannelSlug(user.username);

    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: ["ViewChannel"] },
      { id: user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      { id: guild.members.me.roles.highest.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
    ];

    if (catPerms?.length > 0) {
      catPerms.forEach((roleId) => {
        const role = guild.roles.cache.get(roleId);
        if (!role) return;
        permissionOverwrites.push({
          id: role.id,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
        });
      });
    }

    const tktChannel = await guild.channels.create({
      name: `ticket-${userSlug}-${ticketNumber}`, // ticket-user-number
      type: ChannelType.GuildText,
      parent: parentCategoryId || null, // put tickets in the category channel assigned to the ticketcat
      topic: `ticket|${user.id}|${catName || "Default"}`, // ASCII-safe topic prefix
      permissionOverwrites,
    });

    const embed = new EmbedBuilder()
      .setAuthor({ name: `Ticket #${ticketNumber}` })
      .setDescription(
        `Hello ${user.toString()}
Support will be with you shortly
${catName ? `\n**Category:** ${catName}` : ""}`
      )
      .setFooter({ text: "You may close your ticket anytime by clicking the button below" });

    // Close + Claim buttons
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Close Ticket")
        .setCustomId("TICKET_CLOSE")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setLabel("Claim").setCustomId("TICKET_CLAIM").setEmoji("🧑‍💼").setStyle(ButtonStyle.Success)
    );

    const sent = await tktChannel.send({
      content: user.toString(),
      embeds: [embed],
      components: [buttonsRow],
    });

    // DM user
    const dmEmbed = new EmbedBuilder()
      .setColor(TICKET.CREATE_EMBED)
      .setAuthor({ name: "Ticket Created" })
      .setThumbnail(guild.iconURL())
      .setDescription(`**Server:** ${guild.name}\n${catName ? `**Category:** ${catName}` : ""}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("View Channel").setURL(sent.url).setStyle(ButtonStyle.Link)
    );

    user.send({ embeds: [dmEmbed], components: [row] }).catch(() => {});

    // user asked: show #channel so they can jump straight to it
    await interaction.editReply(`Ticket created! 🔥 Go to <#${tktChannel.id}>`);
  } catch (ex) {
    error("handleTicketOpen", ex);
    return interaction.editReply("Failed to create ticket channel, an error occurred!");
  }
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleTicketClose(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const status = await closeTicket(interaction.channel, interaction.user);
  if (status === "MISSING_PERMISSIONS") {
    return interaction.followUp("Cannot close the ticket, missing permissions. Contact server manager for help!");
  } else if (status === "ERROR") {
    return interaction.followUp("Failed to close the ticket, an error occurred!");
  }
}

module.exports = {
  getTicketChannels,
  getExistingTicketChannel,
  isTicketChannel,
  closeTicket,
  closeAllTickets,
  handleTicketOpen,
  handleTicketClose,
  handleTicketClaim,
};
