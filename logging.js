const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  AuditLogEvent
} = require('discord.js');

class OmniDiscordLogger {
  constructor(client) {
    if (!client) throw new Error('Client instance required');
    this.client = client;
    this.deployedGuilds = new Set();

    this.LOG_STRUCTURE = {
      '💬・Message Logs': [
        'message-deleted',
        'message-edited',
        'bulk-deletes',
        'ghost-pings',
        'link-detection',
        'media-logs'
      ],
      '👥・Member Logs': [
        'member-joins',
        'member-leaves',
        'nickname-changes',
        'timeout-logs',
        'boost-logs',
        'screening-logs'
      ],
      '🛡️・Moderation Logs': [
        'ban-logs',
        'kick-logs',
        'mute-logs',
        'warn-logs',
        'lockdown-logs',
        'raid-alerts'
      ],
      '🎤・Voice Logs': [
        'voice-joins',
        'voice-leaves',
        'voice-moves',
        'stream-starts',
        'video-starts',
        'voice-deafen-mute'
      ],
      '⚙️・Server Logs': [
        'channel-creates',
        'channel-deletes',
        'channel-updates',
        'role-creates',
        'role-deletes',
        'role-updates'
      ],
      '🌐・Integration Logs': [
        'webhook-creates',
        'webhook-deletes',
        'webhook-updates',
        'bot-added',
        'bot-removed',
        'integration-sync'
      ],
      '🎫・Ticket Logs': [
        'ticket-creates',
        'ticket-closes',
        'ticket-deletes',
        'ticket-reopens',
        'ticket-transcripts',
        'ticket-claims'
      ],
      '🤖・Bot Logs': [
        'command-usage',
        'error-logs',
        'performance-metrics',
        'api-calls',
        'cache-updates',
        'shard-logs'
      ],
      '🔍・Audit Logs': [
        'permission-changes',
        'invite-creates',
        'invite-deletes',
        'emoji-creates',
        'emoji-deletes',
        'sticker-updates'
      ],
      '📊・Analytics': [
        'member-growth',
        'message-volume',
        'voice-activity',
        'command-stats',
        'server-uptime',
        'feature-usage'
      ]
    };

    this.COLOR_MAP = {
      '💬・Message Logs': Colors.Yellow,
      '👥・Member Logs': Colors.Green,
      '🛡️・Moderation Logs': Colors.Red,
      '🎤・Voice Logs': Colors.Purple,
      '⚙️・Server Logs': Colors.Blue,
      '🌐・Integration Logs': Colors.White,
      '🎫・Ticket Logs': Colors.Orange,
      '🤖・Bot Logs': Colors.DarkGold,
      '🔍・Audit Logs': Colors.DarkGrey,
      '📊・Analytics': Colors.Fuchsia
    };

    this._attachEventListeners();
    this.client.on('ready', () => this.deployToAllGuilds());
  }

  _attachEventListeners() {
    // Message events
    this.client.on('messageCreate', (msg) => this._handleMessageCreate(msg));
    this.client.on('messageUpdate', (oldMsg, newMsg) => this._handleMessageUpdate(oldMsg, newMsg));
    this.client.on('messageDelete', (msg) => this._handleMessageDelete(msg));
    this.client.on('messageDeleteBulk', (msgs) => this._handleMessageDeleteBulk(msgs));

    // Member events
    this.client.on('guildMemberAdd', (member) => this._handleGuildMemberAdd(member));
    this.client.on('guildMemberRemove', (member) => this._handleGuildMemberRemove(member));
    this.client.on('guildMemberUpdate', (oldMember, newMember) => this._handleGuildMemberUpdate(oldMember, newMember));

    // Moderation events
    this.client.on('guildBanAdd', (ban) => this._handleGuildBanAdd(ban));
    this.client.on('guildBanRemove', (ban) => this._handleGuildBanRemove(ban));

    // Voice events
    this.client.on('voiceStateUpdate', (oldState, newState) => this._handleVoiceStateUpdate(oldState, newState));

    // Server events
    this.client.on('channelCreate', (channel) => this._handleChannelCreate(channel));
    this.client.on('channelDelete', (channel) => this._handleChannelDelete(channel));
    this.client.on('channelUpdate', (oldChannel, newChannel) => this._handleChannelUpdate(oldChannel, newChannel));
    this.client.on('roleCreate', (role) => this._handleRoleCreate(role));
    this.client.on('roleDelete', (role) => this._handleRoleDelete(role));
    this.client.on('roleUpdate', (oldRole, newRole) => this._handleRoleUpdate(oldRole, newRole));

    // Integration events
    this.client.on('webhookUpdate', (channel) => this._handleWebhookUpdate(channel));
    this.client.on('guildIntegrationsUpdate', (guild) => this._handleGuildIntegrationsUpdate(guild));

    // Emoji/Sticker events
    this.client.on('emojiCreate', (emoji) => this._handleEmojiCreate(emoji));
    this.client.on('emojiDelete', (emoji) => this._handleEmojiDelete(emoji));
    this.client.on('emojiUpdate', (oldEmoji, newEmoji) => this._handleEmojiUpdate(oldEmoji, newEmoji));
    this.client.on('stickerCreate', (sticker) => this._handleStickerCreate(sticker));
    this.client.on('stickerDelete', (sticker) => this._handleStickerDelete(sticker));
    this.client.on('stickerUpdate', (oldSticker, newSticker) => this._handleStickerUpdate(oldSticker, newSticker));

    // Invite events (requires gateway intent)
    this.client.on('inviteCreate', (invite) => this._handleInviteCreate(invite));
    this.client.on('inviteDelete', (invite) => this._handleInviteDelete(invite));
  }

  async deployToGuild(guild) {
    if (!guild || this.deployedGuilds.has(guild.id)) return;
    
    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return;

    const adminRole = guild.roles.cache.find(r => 
      r.permissions.has(PermissionFlagsBits.Administrator) || 
      r.permissions.has(PermissionFlagsBits.ManageGuild)
    ) || guild.roles.cache.find(r => r.name.toLowerCase().includes('admin')) || 
    guild.roles.everyone;

    // Create all categories first
    const categories = new Map();
    for (const categoryName of Object.keys(this.LOG_STRUCTURE)) {
      let category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name === categoryName
      );

      if (!category) {
        category = await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] }
          ]
        });
      }
      categories.set(categoryName, category.id);
    }

    // Create all channels under correct categories
    for (const [categoryName, channelNames] of Object.entries(this.LOG_STRUCTURE)) {
      const categoryId = categories.get(categoryName);
      for (const channelName of channelNames) {
        let channel = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildText && 
          c.name === channelName
        );

        // If channel exists but is in wrong category, move it
        if (channel && channel.parentId !== categoryId) {
          await channel.setParent(categoryId, { lockPermissions: false });
        } 
        // If channel doesn't exist, create it
        else if (!channel) {
          await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parentId: categoryId,
            topic: `${channelName.replace(/-/g, ' ')} logs for ${guild.name}`,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: adminRole.id, allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]}
            ],
            rateLimitPerUser: 2
          });
        }
      }
    }

    this.deployedGuilds.add(guild.id);
  }

  async deployToAllGuilds() {
    for (const guild of this.client.guilds.cache.values()) {
      await this.deployToGuild(guild).catch(() => {});
    }
  }

  getLogChannel(guild, channelName) {
    return guild.channels.cache.find(c => 
      c.type === ChannelType.GuildText && 
      c.name === channelName
    );
  }

  async _sendLog(guild, channelName, embedData) {
    if (!this.deployedGuilds.has(guild.id)) {
      await this.deployToGuild(guild);
    }

    const channel = this.getLogChannel(guild, channelName);
    if (!channel) return;

    const categoryName = [...Object.keys(this.LOG_STRUCTURE)].find(name => 
      this.LOG_STRUCTURE[name].includes(channelName)
    );

    const embed = new EmbedBuilder()
      .setColor(this.COLOR_MAP[categoryName] || Colors.Blurple)
      .setTimestamp()
      .setFooter({ 
        text: `Strive Logging v6.0 • ${new Date().toISOString().split('T')[0]}`,
        iconURL: this.client.user.displayAvatarURL()
      });

    if (typeof embedData === 'string') {
      embed.setDescription(embedData);
    } else {
      if (embedData.title) embed.setTitle(embedData.title);
      if (embedData.description) embed.setDescription(embedData.description);
      if (embedData.fields) embed.addFields(embedData.fields);
      if (embedData.author) embed.setAuthor(embedData.author);
      if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
      if (embedData.image) embed.setImage(embedData.image);
    }

    try {
      await channel.send({ embeds: [embed] });
    } catch (error) {
      // Silent fail to prevent spam
    }
  }

  // MESSAGE LOGGING
  _handleMessageCreate(msg) {
    if (msg.author.bot || !msg.guild) return;
    
    // Link detection
    if (/(https?:\/\/[^\s]+)/.test(msg.content)) {
      this._sendLog(msg.guild, 'link-detection', {
        title: '🔗 Link Detected',
        description: `${msg.author} posted a link in ${msg.channel}`,
        fields: [
          { name: 'Link', value: msg.content.match(/(https?:\/\/[^\s]+)/)[0], inline: false },
          { name: 'Jump', value: `[Go to Message](${msg.url})`, inline: true }
        ],
        author: { name: msg.author.tag, iconURL: msg.author.displayAvatarURL() }
      });
    }

    // Media detection
    if (msg.attachments.size > 0) {
      this._sendLog(msg.guild, 'media-logs', {
        title: '📸 Media Posted',
        description: `${msg.author} posted media in ${msg.channel}`,
        fields: [
          { name: 'Attachments', value: msg.attachments.size.toString(), inline: true },
          { name: 'Jump', value: `[Go to Message](${msg.url})`, inline: true }
        ],
        author: { name: msg.author.tag, iconURL: msg.author.displayAvatarURL() }
      });
    }
  }

  _handleMessageUpdate(oldMsg, newMsg) {
    if (newMsg.author.bot || !newMsg.guild || oldMsg.content === newMsg.content) return;
    
    this._sendLog(newMsg.guild, 'message-edited', {
      title: '✏️ Message Edited',
      description: `${newMsg.author} edited a message in ${newMsg.channel}`,
      fields: [
        { name: 'Before', value: this._truncate(oldMsg.content || '*(no content)*', 1020), inline: false },
        { name: 'After', value: this._truncate(newMsg.content || '*(no content)*', 1020), inline: false },
        { name: 'Jump', value: `[Go to Message](${newMsg.url})`, inline: true }
      ],
      author: { name: newMsg.author.tag, iconURL: newMsg.author.displayAvatarURL() }
    });
  }

  _handleMessageDelete(msg) {
    if (msg.author.bot || !msg.guild) return;
    
    this._sendLog(msg.guild, 'message-deleted', {
      title: '🗑️ Message Deleted',
      description: `${msg.author}'s message was deleted in ${msg.channel}`,
      fields: [
        { name: 'Content', value: this._truncate(msg.content || '*(no content)*', 1020), inline: false },
        { name: 'Author', value: msg.author.tag, inline: true },
        { name: 'Channel', value: msg.channel.name, inline: true }
      ],
      author: { name: msg.author.tag, iconURL: msg.author.displayAvatarURL() }
    });
  }

  _handleMessageDeleteBulk(msgs) {
    if (!msgs.first()?.guild) return;
    const guild = msgs.first().guild;
    
    this._sendLog(guild, 'bulk-deletes', {
      title: '🗑️ Bulk Message Delete',
      description: `${msgs.size} messages were bulk deleted in ${msgs.first().channel}`,
      fields: [
        { name: 'Messages Deleted', value: msgs.size.toString(), inline: true },
        { name: 'Channel', value: msgs.first().channel.name, inline: true }
      ]
    });
  }

  // MEMBER LOGGING
  _handleGuildMemberAdd(member) {
    this._sendLog(member.guild, 'member-joins', {
      title: '👋 Member Joined',
      description: `${member.user.tag} joined the server`,
      fields: [
        { name: 'User ID', value: member.id, inline: true },
        { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Member Count', value: member.guild.memberCount.toLocaleString(), inline: true }
      ],
      author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
    });
  }

  _handleGuildMemberRemove(member) {
    this._sendLog(member.guild, 'member-leaves', {
      title: '🚪 Member Left',
      description: `${member.user.tag} left the server`,
      fields: [
        { name: 'User ID', value: member.id, inline: true },
        { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Roles', value: member.roles.cache.size > 1 ? member.roles.cache.map(r => r.name).slice(1).join(', ') : 'None', inline: true }
      ],
      author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
    });
  }

  _handleGuildMemberUpdate(oldMember, newMember) {
    // Nickname change
    if (oldMember.nickname !== newMember.nickname) {
      this._sendLog(newMember.guild, 'nickname-changes', {
        title: '📛 Nickname Changed',
        description: `${newMember.user.tag}'s nickname was updated`,
        fields: [
          { name: 'Old Nickname', value: oldMember.nickname || '*(none)*', inline: true },
          { name: 'New Nickname', value: newMember.nickname || '*(none)*', inline: true }
        ],
        author: { name: newMember.user.tag, iconURL: newMember.displayAvatarURL() }
      });
    }

    // Role changes
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    
    if (addedRoles.size > 0) {
      this._sendLog(newMember.guild, 'role-changes', {
        title: '➕ Roles Added',
        description: `${newMember.user.tag} was given new roles`,
        fields: [{ name: 'Roles', value: addedRoles.map(r => r.name).join(', '), inline: false }],
        author: { name: newMember.user.tag, iconURL: newMember.displayAvatarURL() }
      });
    }
    
    if (removedRoles.size > 0) {
      this._sendLog(newMember.guild, 'role-changes', {
        title: '➖ Roles Removed',
        description: `${newMember.user.tag} had roles removed`,
        fields: [{ name: 'Roles', value: removedRoles.map(r => r.name).join(', '), inline: false }],
        author: { name: newMember.user.tag, iconURL: newMember.displayAvatarURL() }
      });
    }
  }

  // MODERATION LOGGING
  _handleGuildBanAdd(ban) {
    this._sendLog(ban.guild, 'ban-logs', {
      title: '🔨 User Banned',
      description: `${ban.user.tag} was banned from the server`,
      fields: [
        { name: 'User ID', value: ban.user.id, inline: true },
        { name: 'Reason', value: ban.reason || 'No reason provided', inline: false }
      ],
      author: { name: ban.user.tag, iconURL: ban.user.displayAvatarURL() }
    });
  }

  _handleGuildBanRemove(ban) {
    this._sendLog(ban.guild, 'ban-logs', {
      title: '🔓 User Unbanned',
      description: `${ban.user.tag} was unbanned from the server`,
      fields: [
        { name: 'User ID', value: ban.user.id, inline: true }
      ],
      author: { name: ban.user.tag, iconURL: ban.user.displayAvatarURL() }
    });
  }

  // VOICE LOGGING
  _handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    if (!oldState.channelId && newState.channelId) {
      this._sendLog(guild, 'voice-joins', {
        title: '🔊 Voice Joined',
        description: `${member.user.tag} joined **${newState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    } else if (oldState.channelId && !newState.channelId) {
      this._sendLog(guild, 'voice-leaves', {
        title: '🔇 Voice Left',
        description: `${member.user.tag} left **${oldState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    } else if (oldState.channelId !== newState.channelId) {
      this._sendLog(guild, 'voice-moves', {
        title: '🔄 Voice Moved',
        description: `${member.user.tag} moved from **${oldState.channel.name}** to **${newState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    }

    // Stream/video detection
    if (!oldState.streaming && newState.streaming) {
      this._sendLog(guild, 'stream-starts', {
        title: '🔴 Stream Started',
        description: `${member.user.tag} started streaming in **${newState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    }
    
    if (!oldState.selfVideo && newState.selfVideo) {
      this._sendLog(guild, 'video-starts', {
        title: '🎥 Video Started',
        description: `${member.user.tag} turned on video in **${newState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    }

    // Deafen/mute changes
    if (oldState.serverDeaf !== newState.serverDeaf || oldState.serverMute !== newState.serverMute) {
      const actions = [];
      if (oldState.serverDeaf !== newState.serverDeaf) {
        actions.push(newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened');
      }
      if (oldState.serverMute !== newState.serverMute) {
        actions.push(newState.serverMute ? 'Server Muted' : 'Server Unmuted');
      }
      
      this._sendLog(guild, 'voice-deafen-mute', {
        title: '🔇 Voice State Changed',
        description: `${member.user.tag} ${actions.join(', ').toLowerCase()} in **${newState.channel?.name || oldState.channel.name}**`,
        author: { name: member.user.tag, iconURL: member.displayAvatarURL() }
      });
    }
  }

  // SERVER LOGGING
  _handleChannelCreate(channel) {
    if (channel.type === ChannelType.GuildCategory || !channel.guild) return;
    
    this._sendLog(channel.guild, 'channel-creates', {
      title: '🆕 Channel Created',
      description: `**${channel.name}** (${ChannelType[channel.type]}) was created`,
      fields: [
        { name: 'Channel ID', value: channel.id, inline: true },
        { name: 'Type', value: ChannelType[channel.type], inline: true }
      ]
    });
  }

  _handleChannelDelete(channel) {
    if (channel.type === ChannelType.GuildCategory || !channel.guild) return;
    
    this._sendLog(channel.guild, 'channel-deletes', {
      title: '❌ Channel Deleted',
      description: `**${channel.name}** (${ChannelType[channel.type]}) was deleted`,
      fields: [
        { name: 'Channel ID', value: channel.id, inline: true },
        { name: 'Type', value: ChannelType[channel.type], inline: true }
      ]
    });
  }

  _handleChannelUpdate(oldChannel, newChannel) {
    if (oldChannel.type === ChannelType.GuildCategory || !newChannel.guild) return;
    if (oldChannel.name === newChannel.name && oldChannel.topic === newChannel.topic) return;
    
    const changes = [];
    if (oldChannel.name !== newChannel.name) {
      changes.push(`**Name**: ${oldChannel.name} → ${newChannel.name}`);
    }
    if (oldChannel.topic !== newChannel.topic) {
      changes.push(`**Topic**: Updated`);
    }
    
    this._sendLog(newChannel.guild, 'channel-updates', {
      title: '✏️ Channel Updated',
      description: `**${newChannel.name}** was updated`,
      fields: [{ name: 'Changes', value: changes.join('\n'), inline: false }]
    });
  }

  _handleRoleCreate(role) {
    this._sendLog(role.guild, 'role-creates', {
      title: '🆕 Role Created',
      description: `**${role.name}** was created`,
      fields: [
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Color', value: role.hexColor, inline: true }
      ]
    });
  }

  _handleRoleDelete(role) {
    this._sendLog(role.guild, 'role-deletes', {
      title: '❌ Role Deleted',
      description: `**${role.name}** was deleted`,
      fields: [{ name: 'Role ID', value: role.id, inline: true }]
    });
  }

  _handleRoleUpdate(oldRole, newRole) {
    if (oldRole.name === newRole.name && oldRole.color === newRole.color && oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
    
    const changes = [];
    if (oldRole.name !== newRole.name) {
      changes.push(`**Name**: ${oldRole.name} → ${newRole.name}`);
    }
    if (oldRole.color !== newRole.color) {
      changes.push(`**Color**: ${oldRole.hexColor} → ${newRole.hexColor}`);
    }
    
    this._sendLog(newRole.guild, 'role-updates', {
      title: '✏️ Role Updated',
      description: `**${newRole.name}** was updated`,
      fields: [{ name: 'Changes', value: changes.join('\n'), inline: false }]
    });
  }

  // INTEGRATION LOGGING
  _handleWebhookUpdate(channel) {
    // We can't get specific webhook changes without audit logs, so we log the update
    this._sendLog(channel.guild, 'webhook-updates', {
      title: '🔄 Webhook Updated',
      description: `Webhooks were updated in **${channel.name}**`
    });
  }

  _handleGuildIntegrationsUpdate(guild) {
    this._sendLog(guild, 'integration-sync', {
      title: '🔄 Integrations Synced',
      description: 'Server integrations were updated'
    });
  }

  // EMOJI/STICKER LOGGING
  _handleEmojiCreate(emoji) {
    this._sendLog(emoji.guild, 'emoji-creates', {
      title: '🆕 Emoji Created',
      description: `**${emoji.name}** was added`,
      fields: [{ name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true }]
    });
  }

  _handleEmojiDelete(emoji) {
    this._sendLog(emoji.guild, 'emoji-deletes', {
      title: '❌ Emoji Deleted',
      description: `**${emoji.name}** was removed`
    });
  }

  _handleEmojiUpdate(oldEmoji, newEmoji) {
    if (oldEmoji.name === newEmoji.name) return;
    
    this._sendLog(newEmoji.guild, 'emoji-updates', {
      title: '✏️ Emoji Updated',
      description: `Emoji renamed from **${oldEmoji.name}** to **${newEmoji.name}**`
    });
  }

  _handleStickerCreate(sticker) {
    this._sendLog(sticker.guild, 'sticker-updates', {
      title: '🆕 Sticker Created',
      description: `**${sticker.name}** was added`,
      fields: [
        { name: 'Type', value: sticker.type, inline: true },
        { name: 'Format', value: sticker.format, inline: true }
      ]
    });
  }

  _handleStickerDelete(sticker) {
    this._sendLog(sticker.guild, 'sticker-updates', {
      title: '❌ Sticker Deleted',
      description: `**${sticker.name}** was removed`
    });
  }

  _handleStickerUpdate(oldSticker, newSticker) {
    if (oldSticker.name === newSticker.name && oldSticker.description === newSticker.description) return;
    
    const changes = [];
    if (oldSticker.name !== newSticker.name) {
      changes.push(`**Name**: ${oldSticker.name} → ${newSticker.name}`);
    }
    if (oldSticker.description !== newSticker.description) {
      changes.push(`**Description**: Updated`);
    }
    
    this._sendLog(newSticker.guild, 'sticker-updates', {
      title: '✏️ Sticker Updated',
      description: `**${newSticker.name}** was updated`,
      fields: [{ name: 'Changes', value: changes.join('\n'), inline: false }]
    });
  }

  // INVITE LOGGING
  _handleInviteCreate(invite) {
    if (!invite.guild) return;
    
    this._sendLog(invite.guild, 'invite-creates', {
      title: '🆕 Invite Created',
      description: `Invite created for **${invite.channel?.name || 'Unknown Channel'}**`,
      fields: [
        { name: 'Code', value: invite.code, inline: true },
        { name: 'Max Uses', value: invite.maxUses || '∞', inline: true },
        { name: 'Expires', value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Never', inline: true }
      ]
    });
  }

  _handleInviteDelete(invite) {
    if (!invite.guild) return;
    
    this._sendLog(invite.guild, 'invite-deletes', {
      title: '❌ Invite Deleted',
      description: `Invite for **${invite.channel?.name || 'Unknown Channel'}** was deleted`,
      fields: [{ name: 'Code', value: invite.code, inline: true }]
    });
  }

  _truncate(str, max) {
    return str.length > max ? str.substring(0, max - 3) + '...' : str;
  }
}

module.exports = { OmniDiscordLogger };
