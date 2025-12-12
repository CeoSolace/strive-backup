const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors
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

    this.client.on('ready', () => this.deployToAllGuilds());
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

  async log(guild, channelName, embedData) {
    if (!this.deployedGuilds.has(guild.id)) {
      await this.deployToGuild(guild);
    }

    const channel = this.getLogChannel(guild, channelName);
    if (!channel) return;

    // Determine color based on parent category
    const categoryName = [...Object.keys(this.LOG_STRUCTURE)].find(name => 
      this.LOG_STRUCTURE[name].includes(channelName)
    );
    const colorMap = {
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

    const embed = new EmbedBuilder()
      .setColor(colorMap[categoryName] || Colors.Blurple)
      .setTimestamp()
      .setFooter({ 
        text: `OmniLogger v5.0 • ${new Date().toISOString().split('T')[0]}`,
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
      console.error(`Failed to send log to ${channelName} in ${guild.name}:`, error.message);
    }
  }
}

module.exports = { OmniDiscordLogger };
