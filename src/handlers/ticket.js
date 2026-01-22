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
const { getSettings } = require("@schemas/Guild");
const { postToBin } = require("@helpers/HttpUtils");
const { error } = require("@helpers/Logger");

const OPEN_PERMS = ["ManageChannels"];
const CLOSE_PERMS = ["ManageChannels", "ReadMessageHistory"];

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

function isTicketChannel(channel) {
  return channel.name.startsWith('ticket-') || channel.name.startsWith('application-') || channel.name.startsWith('verification-');
}

function getTicketChannels(guild) {
  return guild.channels.cache.filter((ch) => isTicketChannel(ch));
}

function getNextTicketNumber(guild) {
  const chans = getTicketChannels(guild);
  let max = 0;
  for (const ch of chans.values()) {
    const nStr = getTicketNumberFromName(ch.name);
    if (!nStr) continue;
    const n = parseInt(nStr, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, '0');
}

function getExistingTicketChannel(guild, userId) {
  const tktChannels = getTicketChannels(guild);
  return tktChannels.filter((ch) => ch.topic.split("|")[1] === userId).first();
}

async function parseTicketDetails(channel) {
  if (!channel.topic) return;
  const split = channel.topic.split("|");
  const userId = split[1];
  const catName = split[2] || "Default";
  const user = await channel.client.users.fetch(userId, { cache: false }).catch(() => {});
  return { user, catName };
}

function getCustomId(btn) {
  return btn?.data?.custom_id || btn?.data?.customId || null;
}

async function closeTicket(channel, closedBy, reason) {
  if (!channel.deletable || !channel.permissionsFor(channel.guild.members.me).has(CLOSE_PERMS)) {
    return "MISSING_PERMISSIONS";
  }
  try {
    const config = await getSettings(channel.guild);
    const messages = await channel.messages.fetch({ limit: 100 });
    let transcriptText = await generateTranscriptText(channel);
    const file = new AttachmentBuilder(Buffer.from(transcriptText), { name: 'transcript.html' });

    const logsUrl = await postToBin(transcriptText, `Ticket Logs for ${channel.name}`); // Assuming postToBin can handle HTML

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
    if (config.ticket.log_channel) {
      const logChannel = channel.guild.channels.cache.get(config.ticket.log_channel);
      logChannel?.safeSend?.({ embeds: [embed], components, files: [file] });
    }
    if (ticketDetails?.user) {
      const dmEmbed = embed
        .setDescription(`**Server:** ${channel.guild.name}\n**Category:** ${ticketDetails.catName}`)
        .setThumbnail(channel.guild.iconURL());
      ticketDetails.user.send({ embeds: [dmEmbed], components, files: [file] }).catch(() => {});
    }
    return "SUCCESS";
  } catch (ex) {
    error("closeTicket", ex);
    return "ERROR";
  }
}

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

async function handleTicketClaim(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { channel, guild, user, message } = interaction;
  if (!guild || !channel) return interaction.editReply("Invalid ticket.");
  if (!isTicketChannel(channel)) return interaction.editReply("This is not a ticket channel.");
  const split = channel.topic.split("|");
  const openerId = split[1];
  const catName = split[2] || "Default";
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply("Could not verify permissions.");
  if (openerId === user.id) {
    return interaction.editReply("You can’t claim your own ticket.");
  }
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const hasManageChannels = member.permissions.has(PermissionFlagsBits.ManageChannels);
  const settings = await getSettings(guild);
  const picked = (settings.ticket.categories || []).find((c) => c.name === catName);
  const staffRoles = picked?.staff_roles || [];
  const hasStaffRole = staffRoles.some((rid) => member.roles.cache.has(rid));
  if (!isAdmin && !hasManageChannels && !hasStaffRole) {
    return interaction.editReply("You can't claim this ticket.");
  }
  const isUnclaimed = channel.name.startsWith("ticket-") || channel.name.startsWith("application-") || channel.name.startsWith("verification-");
  if (!isUnclaimed) return interaction.editReply("This ticket is already claimed.");
  const staffSlug = toChannelSlug(user.username);
  const num = getTicketNumberFromName(channel.name) || "0";
  const userPart = channel.name.split("-").length >= 3 ? channel.name.split("-").slice(1, -1).join("-") : "user";
  const newName = `${staffSlug}-${userPart}-${num}`.slice(0, 100);
  try {
    await channel.setName(newName);
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
    return interaction.editReply("Failed to claim ticket (missing permissions).");
  }
}

async function handleTicketOpen(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;
  if (!guild.members.me.permissions.has(OPEN_PERMS)) {
    return interaction.followUp("Missing `Manage Channels` permission. Contact server admin!");
  }
  const alreadyExists = getExistingTicketChannel(guild, user.id);
  if (alreadyExists) return interaction.followUp("You already have an open ticket");
  const settings = await getSettings(guild);
  const openCount = getTicketChannels(guild).size;
  if (openCount > settings.ticket.limit) return interaction.followUp("Too many open tickets. Try later.");
  let catName = null;
  let catPerms = [];
  let parentCategoryId = null;
  const categories = settings.ticket.categories || [];
  if (categories.length > 0) {
    const options = categories.map(cat => ({ label: cat.name, value: cat.name, description: cat.desc, emoji: cat.emoji }));
    const menuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket-menu")
        .setPlaceholder("Choose ticket category")
        .addOptions(options)
    );
    await interaction.followUp({ content: "Please choose a ticket category", components: [menuRow] });
    const res = await interaction.channel
      .awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      })
      .catch(() => null);
    if (!res) return interaction.editReply({ content: "Timed out. Try again", components: [] });
    await res.deferUpdate().catch(() => {});
    await interaction.editReply({ content: "Processing...", components: [] });
    catName = res.values[0];
    const picked = categories.find(cat => cat.name === catName);
    catPerms = picked?.staff_roles || [];
    parentCategoryId = picked?.parent_category || null;
  }
  try {
    const ticketNumber = getNextTicketNumber(guild);
    const userSlug = toChannelSlug(user.username);
    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: ["ViewChannel"] },
      { id: user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"] },
      { id: guild.members.me.roles.highest.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"] },
    ];
    if (catPerms?.length > 0) {
      catPerms.forEach(roleId => {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          permissionOverwrites.push({
            id: role.id,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"],
          });
        }
      });
    }
    const tktChannel = await guild.channels.create({
      name: `ticket-${userSlug}-${ticketNumber}`,
      type: ChannelType.GuildText,
      parent: parentCategoryId,
      topic: `ticket|${user.id}|${catName || "Default"}`,
      permissionOverwrites,
    });
    const embed = new EmbedBuilder()
      .setAuthor({ name: `Ticket #${ticketNumber}` })
      .setDescription(
        `Hello ${user.toString()}\nSupport will be with you shortly${
          catName ? `\n\n**Category:** ${catName}` : ""
        }`
      )
      .setFooter({ text: "Close your ticket anytime with the button below" });
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Close Ticket")
        .setCustomId("TICKET_CLOSE")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setLabel("Claim")
        .setCustomId("TICKET_CLAIM")
        .setEmoji("🧑‍💼")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("Transcript")
        .setCustomId("TICKET_TRANSCRIPT")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Secondary)
    );
    const sent = await tktChannel.send({
      content: user.toString(),
      embeds: [embed],
      components: [buttonsRow],
    });
    const dmEmbed = new EmbedBuilder()
      .setColor(TICKET.CREATE_EMBED)
      .setAuthor({ name: "Ticket Created" })
      .setThumbnail(guild.iconURL())
      .setDescription(`**Server:** ${guild.name}${catName ? `\n**Category:** ${catName}` : ""}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("View Channel").setURL(sent.url).setStyle(ButtonStyle.Link)
    );
    user.send({ embeds: [dmEmbed], components: [row] }).catch(() => {});
    await interaction.editReply(`Ticket created! 🔥 Go to <#${tktChannel.id}>`);
  } catch (ex) {
    error("handleTicketOpen", ex);
    return interaction.editReply("Failed to create ticket channel!");
  }
}

async function handleTicketClose(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const status = await closeTicket(interaction.channel, interaction.user);
  if (status === "MISSING_PERMISSIONS") {
    return interaction.followUp("Missing permissions to close ticket. Contact server admin!");
  } else if (status === "ERROR") {
    return interaction.followUp("Failed to close ticket!");
  }
}

async function generateTranscriptText(channel) {
  let messages = [];
  let lastId;
  do {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const fetched = await channel.messages.fetch(opts);
    messages.push(...Array.from(fetched.values()));
    lastId = fetched.size === 100 ? fetched.last().id : null;
  } while (lastId);

  messages.reverse();

  let html = `<!DOCTYPE html><html><head><style>body{background:#2f3136;color:#dcddde;font-family:Whitney, sans-serif;}.message{margin:10px;padding:10px;border-radius:5px;}.user{color:#fff;font-weight:600;}.timestamp{color:#72767d;font-size:12px;}</style></head><body>`;
  for (const msg of messages) {
    const content = msg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const attachments = msg.attachments.map(a => `<br><a href="${a.url}">${a.name}</a>`).join('');
    html += `<div class="message"><span class="user">${msg.author.tag}</span> <span class="timestamp">[${msg.createdAt.toISOString()}]</span><br>${content}${attachments}</div>`;
  }
  html += '</body></html>';
  return html;
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
