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
      '💬・Message Logs': {
        color: Colors.Yellow,
        channels: [
          'message-deleted',
          'message-edited',
          'bulk-deletes',
          'ghost-pings',
          'link-detection',
          'media-logs'
        ]
      },
      '👥・Member Logs': {
        color: Colors.Green,
        channels: [
          'member-joins',
          'member-leaves',
          'nickname-changes',
          'timeout-logs',
          'boost-logs',
          'screening-logs'
        ]
      },
      '🛡️・Moderation Logs': {
        color: Colors.Red,
        channels: [
          'ban-logs',
          'kick-logs',
          'mute-logs',
          'warn-logs',
          'lockdown-logs',
          'raid-alerts'
        ]
      },
      '🎤・Voice Logs': {
        color: Colors.Purple,
        channels: [
          'voice-joins',
          'voice-leaves',
          'voice-moves',
          'stream-starts',
          'video-starts',
          'voice-deafen-mute'
        ]
      },
      '⚙️・Server Logs': {
        color: Colors.Blue,
        channels: [
          'channel-creates',
          'channel-deletes',
          'channel-updates',
          'role-creates',
          'role-deletes',
          'role-updates'
        ]
      },
      '🌐・Integration Logs': {
        color: Colors.White,
        channels: [
          'webhook-creates',
          'webhook-deletes',
          'webhook-updates',
          'bot-added',
          'bot-removed',
          'integration-sync'
        ]
      },
      '🎫・Ticket Logs': {
        color: Colors.Orange,
        channels: [
          'ticket-creates',
          'ticket-closes',
          'ticket-deletes',
          'ticket-reopens',
          'ticket-transcripts',
          'ticket-claims'
        ]
      },
      '🤖・Bot Logs': {
        color: Colors.DarkGold,
        channels: [
          'command-usage',
          'error-logs',
          'performance-metrics',
          'api-calls',
          'cache-updates',
          'shard-logs'
        ]
      },
      '🔍・Audit Logs': {
        color: Colors.DarkGrey,
        channels: [
          'permission-changes',
          'invite-creates',
          'invite-deletes',
          'emoji-creates',
          'emoji-deletes',
          'sticker-updates'
        ]
      },
      '📊・Analytics': {
        color: Colors.Fuchsia,
        channels: [
          'member-growth',
          'message-volume',
          'voice-activity',
          'command-stats',
          'server-uptime',
          'feature-usage'
        ]
      }
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

    for (const [categoryName, config] of Object.entries(this.LOG_STRUCTURE)) {
      // Create or find category
      let category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name === categoryName
      );

      if (!category) {
        category = await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: adminRole.id,
              allow: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
      }

      // Create or find channels
      for (const channelName of config.channels) {
        let channel = guild.channels.cache.find(c => 
          c.type === ChannelType.GuildText && 
          c.name === channelName && 
          c.parentId === category.id
        );

        if (!channel) {
          channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parentId: category.id,
            topic: `${channelName.replace(/-/g, ' ')} logs for ${guild.name}`,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              {
                id: adminRole.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              }
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

    const category = Object.values(this.LOG_STRUCTURE).find(cat => 
      cat.channels.includes(channelName)
    );

    const embed = new EmbedBuilder()
      .setColor(category?.color || Colors.Blurple)
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
