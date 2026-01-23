const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, SelectMenuBuilder, SelectMenuOptionBuilder, TextInputStyle, ButtonStyle, ChannelType, ApplicationCommandOptionType, ComponentType, PermissionFlagsBits, AttachmentBuilder, Colors } = require('discord.js');
const Ticket = require('@schemas/Ticket');
const GuildSettings = require('@schemas/Guild');

module.exports = {
  name: 'ticket',
  category: 'ADMIN',
  botPermissions: ['ManageChannels', 'ManageRoles', 'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
  userPermissions: ['ManageGuild'],
  description: 'Advanced ticket management with applications and verifications',
  slashCommand: {
    enabled: true,
    options: [
      {
        name: 'setup',
        description: 'Setup ticket panel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'channel', description: 'Panel channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
          { name: 'title', description: 'Custom title', type: ApplicationCommandOptionType.String, required: false },
          { name: 'description', description: 'Custom desc', type: ApplicationCommandOptionType.String, required: false },
          { name: 'color', description: 'Embed color (hex)', type: ApplicationCommandOptionType.String, required: false },
          { name: 'footer', description: 'Footer text', type: ApplicationCommandOptionType.String, required: false },
          { name: 'image', description: 'Image URL', type: ApplicationCommandOptionType.String, required: false },
        ],
      },
      {
        name: 'category',
        description: 'Manage ticket categories',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'add',
            description: 'Add a category',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              { name: 'name', description: 'Category name', type: ApplicationCommandOptionType.String, required: true },
              { name: 'description', description: 'Category description', type: ApplicationCommandOptionType.String, required: true },
              { name: 'role', description: 'Role to ping', type: ApplicationCommandOptionType.Role, required: true },
              { name: 'emoji', description: 'Emoji for category', type: ApplicationCommandOptionType.String, required: false },
            ],
          },
          {
            name: 'remove',
            description: 'Remove a category',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              { name: 'name', description: 'Category name', type: ApplicationCommandOptionType.String, required: true },
            ],
          },
        ],
      },
      {
        name: 'staff',
        description: 'Set staff role',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'role', description: 'Staff role', type: ApplicationCommandOptionType.Role, required: true },
        ],
      },
      {
        name: 'log',
        description: 'Set log channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'channel', description: 'Log channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
        ],
      },
      {
        name: 'limit',
        description: 'Set max open tickets per user',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'amount', description: 'Max number', type: ApplicationCommandOptionType.Integer, required: true },
        ],
      },
      {
        name: 'close',
        description: 'Close ticket',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'reason', description: 'Close reason', type: ApplicationCommandOptionType.String, required: false },
        ],
      },
      {
        name: 'closeall',
        description: 'Close all tickets',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'add',
        description: 'Add to ticket',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'target', description: 'User or role', type: ApplicationCommandOptionType.String, required: true },
        ],
      },
      {
        name: 'remove',
        description: 'Remove from ticket',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: 'target', description: 'User or role', type: ApplicationCommandOptionType.String, required: true },
        ],
      },
      {
        name: 'claim',
        description: 'Claim ticket',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'reopen',
        description: 'Reopen ticket',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'delete',
        description: 'Delete ticket',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'transcript',
        description: 'Generate transcript',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'customize',
        description: 'Customize system',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'color',
            description: 'Set default embed color',
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: 'hex', description: 'Hex color', type: ApplicationCommandOptionType.String, required: true }],
          },
          {
            name: 'welcome',
            description: 'Set welcome message',
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: 'message', description: 'Welcome text', type: ApplicationCommandOptionType.String, required: true }],
          },
          {
            name: 'buttons',
            description: 'Enable/disable buttons in tickets',
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: 'enable', description: 'Yes/No', type: ApplicationCommandOptionType.Boolean, required: true }],
          },
          {
            name: 'autoclose',
            description: 'Set auto-close timeout (minutes)',
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: 'minutes', description: 'Timeout', type: ApplicationCommandOptionType.Integer, required: true }],
          },
          {
            name: 'blacklist',
            description: 'Blacklist user from tickets',
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: 'user', description: 'User', type: ApplicationCommandOptionType.User, required: true }],
          },
        ],
      },
      {
        name: 'application',
        description: 'Manage application system',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'enable',
            description: 'Enable applications',
            type: ApplicationCommandOptionType.Subcommand,
          },
          {
            name: 'disable',
            description: 'Disable applications',
            type: ApplicationCommandOptionType.Subcommand,
          },
          {
            name: 'channel',
            description: 'Set review channel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              { name: 'channel', description: 'Review channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
            ],
          },
          {
            name: 'question',
            description: 'Manage questions',
            type: ApplicationCommandOptionType.SubcommandGroup,
            options: [
              {
                name: 'add',
                description: 'Add question',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                  { name: 'question', description: 'Question text', type: ApplicationCommandOptionType.String, required: true },
                  { name: 'style', description: 'Input style', type: ApplicationCommandOptionType.String, choices: [{name: 'Short', value: 'short'}, {name: 'Paragraph', value: 'paragraph'}], required: false },
                  { name: 'required', description: 'Required?', type: ApplicationCommandOptionType.Boolean, required: false },
                ],
              },
              {
                name: 'remove',
                description: 'Remove question',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                  { name: 'index', description: 'Question index (1-based)', type: ApplicationCommandOptionType.Integer, required: true },
                ],
              },
              {
                name: 'list',
                description: 'List questions',
                type: ApplicationCommandOptionType.Subcommand,
              },
            ],
          },
        ],
      },
      {
        name: 'verification',
        description: 'Manage verification system',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'enable',
            description: 'Enable verifications',
            type: ApplicationCommandOptionType.Subcommand,
          },
          {
            name: 'disable',
            description: 'Disable verifications',
            type: ApplicationCommandOptionType.Subcommand,
          },
          {
            name: 'role',
            description: 'Set verified role',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              { name: 'role', description: 'Role to assign', type: ApplicationCommandOptionType.Role, required: true },
            ],
          },
          {
            name: 'channel',
            description: 'Set review channel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              { name: 'channel', description: 'Review channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
            ],
          },
          {
            name: 'question',
            description: 'Manage questions',
            type: ApplicationCommandOptionType.SubcommandGroup,
            options: [
              {
                name: 'add',
                description: 'Add question',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                  { name: 'question', description: 'Question text', type: ApplicationCommandOptionType.String, required: true },
                  { name: 'style', description: 'Input style', type: ApplicationCommandOptionType.String, choices: [{name: 'Short', value: 'short'}, {name: 'Paragraph', value: 'paragraph'}], required: false },
                  { name: 'required', description: 'Required?', type: ApplicationCommandOptionType.Boolean, required: false },
                  { name: 'expected', description: 'Expected answer for auto-accept (case-insensitive)', type: ApplicationCommandOptionType.String, required: false },
                ],
              },
              {
                name: 'remove',
                description: 'Remove question',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                  { name: 'index', description: 'Question index (1-based)', type: ApplicationCommandOptionType.Integer, required: true },
                ],
              },
              {
                name: 'list',
                description: 'List questions',
                type: ApplicationCommandOptionType.Subcommand,
              },
            ],
          },
        ],
      },
    ],
  },

  async execute(client, interaction) {
    let settings = await Guild.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new Guild({ guildId: interaction.guild.id });
      await settings.save();
    }
    const sub = interaction.options.getSubcommand();
    const subGroup = interaction.options.getSubcommandGroup();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const custom = {
        title: interaction.options.getString('title') || 'Support Tickets',
        desc: interaction.options.getString('description') || 'Select a category or action',
        color: interaction.options.getString('color') || '#0099ff',
        footer: interaction.options.getString('footer') || 'Ticket System',
        image: interaction.options.getString('image'),
      };
      await setupPanel(interaction, channel, settings, custom);
      return interaction.editReply('Panel setup complete');
    }

    if (subGroup === 'category') {
      if (sub === 'add') {
        const name = interaction.options.getString('name');
        const desc = interaction.options.getString('description');
        const role = interaction.options.getRole('role');
        const emoji = interaction.options.getString('emoji') || '';
        if (!settings.ticket.categories) settings.ticket.categories = [];
        if (settings.ticket.categories.find(c => c.name === name)) return interaction.editReply('Category exists');
        settings.ticket.categories.push({ name, desc, roleId: role.id, emoji });
        await settings.save();
        return interaction.editReply('Category added');
      } else if (sub === 'remove') {
        const name = interaction.options.getString('name');
        settings.ticket.categories = settings.ticket.categories.filter(c => c.name !== name);
        await settings.save();
        return interaction.editReply('Category removed');
      }
    }

    if (sub === 'staff') {
      const role = interaction.options.getRole('role');
      settings.ticket.staff_role = role.id;
      await settings.save();
      return interaction.editReply('Staff role set');
    }

    if (sub === 'log') {
      const channel = interaction.options.getChannel('channel');
      settings.ticket.log_channel = channel.id;
      await settings.save();
      return interaction.editReply('Log channel set');
    }

    if (sub === 'limit') {
      const amount = interaction.options.getInteger('amount');
      if (amount < 1) return interaction.editReply('Limit too low');
      settings.ticket.limit = amount;
      await settings.save();
      return interaction.editReply('Limit set');
    }

    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || 'No reason';
      const response = await close(interaction, interaction.user, reason);
      if (response) return interaction.editReply(response);
      return;
    }

    if (sub === 'closeall') {
      const response = await closeAll(interaction, interaction.user);
      return interaction.editReply(response);
    }

    if (sub === 'add') {
      const target = interaction.options.getString('target');
      const response = await addToTicket(interaction, target);
      return interaction.editReply(response);
    }

    if (sub === 'remove') {
      const target = interaction.options.getString('target');
      const response = await removeFromTicket(interaction, target);
      return interaction.editReply(response);
    }

    if (sub === 'claim') {
      const response = await claimTicket(interaction, interaction.user);
      if (response) return interaction.editReply(response);
      return;
    }

    if (sub === 'reopen') {
      const response = await reopenTicket(interaction);
      return interaction.editReply(response);
    }

    if (sub === 'delete') {
      const response = await deleteTicket(interaction);
      if (response) return interaction.editReply(response);
      return;
    }

    if (sub === 'transcript') {
      await generateTranscript(interaction);
      return;
    }

    if (subGroup === 'customize') {
      if (sub === 'color') {
        const hex = interaction.options.getString('hex');
        if (!/^#[0-9A-F]{6}$/i.test(hex)) return interaction.editReply('Invalid hex');
        settings.ticket.custom.color = hex;
        await settings.save();
        return interaction.editReply('Color set');
      }
      if (sub === 'welcome') {
        const msg = interaction.options.getString('message');
        settings.ticket.custom.welcome = msg;
        await settings.save();
        return interaction.editReply('Welcome set');
      }
      if (sub === 'buttons') {
        const enable = interaction.options.getBoolean('enable');
        settings.ticket.custom.buttons = enable;
        await settings.save();
        return interaction.editReply(`Buttons ${enable ? 'enabled' : 'disabled'}`);
      }
      if (sub === 'autoclose') {
        const min = interaction.options.getInteger('minutes');
        if (min < 0) return interaction.editReply('Invalid');
        settings.ticket.custom.autoclose = min * 60000;
        await settings.save();
        return interaction.editReply('Autoclose set');
      }
      if (sub === 'blacklist') {
        const user = interaction.options.getUser('user');
        if (!settings.ticket.blacklist) settings.ticket.blacklist = [];
        if (settings.ticket.blacklist.includes(user.id)) return interaction.editReply('Already blacklisted');
        settings.ticket.blacklist.push(user.id);
        await settings.save();
        return interaction.editReply('Blacklisted');
      }
    }

    if (subGroup === 'application') {
      if (sub === 'enable') {
        settings.ticket.application.enabled = true;
        await settings.save();
        return interaction.editReply('Applications enabled');
      }
      if (sub === 'disable') {
        settings.ticket.application.enabled = false;
        await settings.save();
        return interaction.editReply('Applications disabled');
      }
      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel');
        settings.ticket.application.reviewChannel = channel.id;
        await settings.save();
        return interaction.editReply('Review channel set');
      }
      if (sub === 'question') {
        const innerSub = interaction.options.getSubcommand();
        if (innerSub === 'add') {
          const q = interaction.options.getString('question');
          const style = interaction.options.getString('style') || 'short';
          const req = interaction.options.getBoolean('required') ?? true;
          if (!settings.ticket.application.questions) settings.ticket.application.questions = [];
          if (settings.ticket.application.questions.length >= 5) return interaction.editReply('Max 5 questions');
          settings.ticket.application.questions.push({ question: q, style, required: req });
          await settings.save();
          return interaction.editReply('Question added');
        }
        if (innerSub === 'remove') {
          const idx = interaction.options.getInteger('index') - 1;
          if (idx < 0 || idx >= (settings.ticket.application.questions?.length || 0)) return interaction.editReply('Invalid index');
          settings.ticket.application.questions.splice(idx, 1);
          await settings.save();
          return interaction.editReply('Question removed');
        }
        if (innerSub === 'list') {
          const qs = settings.ticket.application.questions || [];
          const list = qs.map((q, i) => `${i+1}. ${q.question} (${q.style}, required: ${q.required})`).join('\n') || 'No questions';
          return interaction.editReply(list);
        }
      }
    }

    if (subGroup === 'verification') {
      if (sub === 'enable') {
        settings.ticket.verification.enabled = true;
        await settings.save();
        return interaction.editReply('Verifications enabled');
      }
      if (sub === 'disable') {
        settings.ticket.verification.enabled = false;
        await settings.save();
        return interaction.editReply('Verifications disabled');
      }
      if (sub === 'role') {
        const role = interaction.options.getRole('role');
        settings.ticket.verification.verifiedRole = role.id;
        await settings.save();
        return interaction.editReply('Verified role set');
      }
      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel');
        settings.ticket.verification.reviewChannel = channel.id;
        await settings.save();
        return interaction.editReply('Review channel set');
      }
      if (sub === 'question') {
        const innerSub = interaction.options.getSubcommand();
        if (innerSub === 'add') {
          const q = interaction.options.getString('question');
          const style = interaction.options.getString('style') || 'short';
          const req = interaction.options.getBoolean('required') ?? true;
          const exp = interaction.options.getString('expected');
          if (!settings.ticket.verification.questions) settings.ticket.verification.questions = [];
          if (settings.ticket.verification.questions.length >= 5) return interaction.editReply('Max 5 questions');
          settings.ticket.verification.questions.push({ question: q, style, required: req, expected: exp ? exp.toLowerCase() : null });
          await settings.save();
          return interaction.editReply('Question added');
        }
        if (innerSub === 'remove') {
          const idx = interaction.options.getInteger('index') - 1;
          if (idx < 0 || idx >= (settings.ticket.verification.questions?.length || 0)) return interaction.editReply('Invalid index');
          settings.ticket.verification.questions.splice(idx, 1);
          await settings.save();
          return interaction.editReply('Question removed');
        }
        if (innerSub === 'list') {
          const qs = settings.ticket.verification.questions || [];
          const list = qs.map((q, i) => `${i+1}. ${q.question} (${q.style}, required: ${q.required}, expected: ${q.expected || 'none'})`).join('\n') || 'No questions';
          return interaction.editReply(list);
        }
      }
    }
  },
};

async function setupPanel(interaction, targetChannel, settings, custom) {
  const categories = settings.ticket.categories || [];
  const hasApps = settings.ticket.application?.enabled || false;
  const hasVerif = settings.ticket.verification?.enabled || false;
  if (categories.length === 0 && !hasApps && !hasVerif) return interaction.editReply('No categories, applications, or verifications enabled');

  const embed = new EmbedBuilder()
    .setColor(custom.color)
    .setTitle(custom.title)
    .setDescription(custom.desc)
    .setFooter({ text: custom.footer })
    .setImage(custom.image || null);

  const components = [];

  if (categories.length > 0) {
    const selectRow = new ActionRowBuilder().addComponents(
      new SelectMenuBuilder()
        .setCustomId('TICKET_SELECT')
        .setPlaceholder('Choose support category')
        .addOptions(categories.map(cat => new SelectMenuOptionBuilder()
          .setLabel(cat.name)
          .setDescription(cat.desc)
          .setValue(cat.name)
          .setEmoji(cat.emoji || '❓')
        ))
    );
    components.push(selectRow);
  }

  const buttonRow = new ActionRowBuilder();
  if (hasApps) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('APPLICATION_BUTTON')
        .setLabel('Apply')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📝')
    );
  }
  if (hasVerif) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('VERIFICATION_BUTTON')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅')
    );
  }
  if (buttonRow.components.length > 0) components.push(buttonRow);

  const msg = await targetChannel.send({ embeds: [embed], components });
  settings.ticket.panelMessageId = msg.id;
  await settings.save();
}

async function isTicketChannel(channel) {
  return channel.name.startsWith('ticket-') || channel.name.startsWith('application-') || channel.name.startsWith('verification-');
}

async function getOpenTicketsCount(userId, guildId) {
  return await Ticket.countDocuments({ owner: userId, guild: guildId, status: 'open' });
}

async function createTicket(interaction, settings, cat, categoryType = 'support') {
  if (settings.ticket.blacklist?.includes(interaction.user.id)) return interaction.editReply('You are blacklisted from creating tickets');

  const openCount = await getOpenTicketsCount(interaction.user.id, interaction.guild.id);
  if (openCount >= settings.ticket.limit) return interaction.editReply('Ticket limit reached');

  const ticketNum = await Ticket.countDocuments({ guild: interaction.guild.id }) + 1;
  const prefix = categoryType === 'application' ? 'application' : categoryType === 'verification' ? 'verification' : 'ticket';
  const channelName = `${prefix}-${ticketNum.toString().padStart(4, '0')}-${interaction.user.username.toLowerCase()}`;

  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: settings.ticket.staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings.ticket.parentCategoryId || null,
    permissionOverwrites: overwrites,
    topic: `Ticket for ${interaction.user.tag} | Type: ${categoryType}`,
  });

  const ticket = new Ticket({
    guild: interaction.guild.id,
    channel: ticketChannel.id,
    owner: interaction.user.id,
    category: categoryType,
    status: 'open',
    createdAt: new Date(),
  });
  await ticket.save();

  const welcomeMsg = settings.ticket.custom.welcome || `Welcome to your ticket! Staff will assist soon.`;
  const welcomeEmbed = new EmbedBuilder()
    .setColor(settings.ticket.custom.color || Colors.Blue)
    .setDescription(welcomeMsg)
    .setTimestamp()
    .setFooter({ text: 'Ticket System' });

  let buttons;
  if (settings.ticket.custom.buttons) {
    buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('TICKET_CLOSE').setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('TICKET_CLAIM').setLabel('Claim').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('TICKET_TRANSCRIPT').setLabel('Transcript').setStyle(ButtonStyle.Secondary)
    );
  }

  await ticketChannel.send({ content: `<@${interaction.user.id}> <@&${cat.roleId || settings.ticket.staff_role}>`, embeds: [welcomeEmbed], components: buttons ? [buttons] : [] });

  if (settings.ticket.custom.autoclose > 0) {
    setTimeout(async () => {
      const updatedTicket = await Ticket.findOne({ channel: ticketChannel.id });
      if (updatedTicket && updatedTicket.status === 'open') {
        await closeTicket(ticketChannel, interaction.client.user, 'Auto-close due to inactivity', settings);
      }
    }, settings.ticket.custom.autoclose);
  }

  return ticketChannel;
}

async function close(interaction, closer, reason) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  const ticket = await Ticket.findOne({ channel: interaction.channel.id });
  if (!ticket || ticket.status !== 'open') return 'Ticket not open';

  const transcriptText = await generateTranscriptText(interaction.channel);
  const file = new AttachmentBuilder(Buffer.from(transcriptText), { name: 'transcript.html' });

  const logChannel = interaction.guild.channels.cache.get(settings.ticket.log_channel);
  if (logChannel) await logChannel.send({ content: `Ticket ${interaction.channel.name} closed by ${closer.tag}: ${reason}`, files: [file] });

  const owner = await interaction.client.users.fetch(ticket.owner);
  if (owner) await owner.send({ content: `Your ticket in ${interaction.guild.name} was closed: ${reason}`, files: [file] }).catch(() => {});

  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closer = closer.id;
  ticket.reason = reason;
  await ticket.save();

  await interaction.channel.delete();
}

async function closeTicket(channel, closer, reason, settings) {
  const ticket = await Ticket.findOne({ channel: channel.id });
  if (!ticket || ticket.status !== 'open') return;

  const transcriptText = await generateTranscriptText(channel);
  const file = new AttachmentBuilder(Buffer.from(transcriptText), { name: 'transcript.html' });

  const logChannel = channel.guild.channels.cache.get(settings.ticket.log_channel);
  if (logChannel) await logChannel.send({ content: `Ticket ${channel.name} closed by ${closer.tag}: ${reason}`, files: [file] });

  const owner = await channel.client.users.fetch(ticket.owner);
  if (owner) await owner.send({ content: `Your ticket in ${channel.guild.name} was closed: ${reason}`, files: [file] }).catch(() => {});

  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closer = closer.id;
  ticket.reason = reason;
  await ticket.save();

  await channel.delete();
}

async function closeAll(interaction, user) {
  const tickets = await Ticket.find({ guild: interaction.guild.id, status: 'open' });
  let success = 0, failed = 0;
  for (const t of tickets) {
    const ch = interaction.guild.channels.cache.get(t.channel);
    if (ch) {
      await closeTicket(ch, user, 'Mass close', interaction.guild.settings);
      success++;
    } else {
      failed++;
    }
  }
  return `Closed ${success} tickets, failed ${failed}`;
}

async function addToTicket(interaction, targetId) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  if (!/^\d+$/.test(targetId)) return 'Invalid ID';
  await interaction.channel.permissionOverwrites.edit(targetId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  return `Added <@${targetId}>`;
}

async function removeFromTicket(interaction, targetId) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  if (!/^\d+$/.test(targetId)) return 'Invalid ID';
  await interaction.channel.permissionOverwrites.delete(targetId);
  return `Removed <@${targetId}>`;
}

async function claimTicket(interaction, user) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  const ticket = await Ticket.findOne({ channel: interaction.channel.id });
  if (ticket.claimer) return 'Already claimed';
  ticket.claimer = user.id;
  await ticket.save();
  await interaction.channel.send(`${user.tag} has claimed this ticket`);
}

async function reopenTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  const ticket = await Ticket.findOne({ channel: interaction.channel.id });
  if (ticket.status !== 'closed') return 'Ticket not closed';
  ticket.status = 'open';
  ticket.closedAt = null;
  ticket.closer = null;
  ticket.reason = null;
  await ticket.save();
  return 'Ticket reopened';
}

async function deleteTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) return 'Not a ticket channel';
  await Ticket.deleteOne({ channel: interaction.channel.id });
  await interaction.channel.delete();
}

async function generateTranscript(interaction) {
  if (!isTicketChannel(interaction.channel)) return interaction.editReply('Not a ticket channel');
  const transcriptText = await generateTranscriptText(interaction.channel);
  const file = new AttachmentBuilder(Buffer.from(transcriptText), { name: 'transcript.html' });
  await interaction.editReply({ files: [file] });
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
