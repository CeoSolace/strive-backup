const { Collection, PermissionsBitField } = require("discord.js");

module.exports = (client) => {
  const nukeCache = new Collection();
  const whitelist = new Collection();

  const MAX_CHANNEL_DELETES = 5;
  const MAX_ROLE_DELETES = 5;
  const MAX_BANS = 5;
  const WINDOW = 30_000;
  const EXTRA_WHITELIST_ID = "1400281740978815118";

  setInterval(() => {
    const now = Date.now();
    for (const [guildId, data] of nukeCache.entries()) {
      if (now - data.lastAction > WINDOW) {
        nukeCache.delete(guildId);
      }
    }
  }, WINDOW);

  function getGuildData(guildId) {
    if (!nukeCache.has(guildId)) {
      nukeCache.set(guildId, {
        deleteChannels: 0,
        deleteRoles: 0,
        banCount: 0,
        lastAction: Date.now(),
        locked: false,
      });
    }
    return nukeCache.get(guildId);
  }

  function isWhitelisted(guild, user) {
    if (!guild || !user) return false;
    if (user.id === guild.ownerId || user.id === EXTRA_WHITELIST_ID) return true;
    const guildWhitelist = whitelist.get(guild.id);
    return guildWhitelist ? guildWhitelist.has(user.id) : false;
  }

  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith("=whitelist")) return;
    if (message.author.id !== message.guild.ownerId && message.author.id !== EXTRA_WHITELIST_ID) {
      await message.reply("⚠️ Only the server owner or authorized bot admins can manage the antinuke whitelist.");
      return;
    }

    const target = message.mentions.users.first() || await message.client.users.fetch(message.content.split(" ")[1]).catch(() => null);
    if (!target) {
      await message.reply("⚠️ Please mention or provide a valid user ID to whitelist.");
      return;
    }

    if (!whitelist.has(message.guild.id)) whitelist.set(message.guild.id, new Set());
    whitelist.get(message.guild.id).add(target.id);
    await message.reply(`✅ ${target.tag} has been whitelisted from antinuke actions.`);
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild || channel.guild.available === false) return;
    if (isWhitelisted(channel.guild, channel.client.user)) return;
    const executor = await channel.guild.fetchAuditLogs({ limit: 1, type: 12 }).then(audit => audit.entries.first());
    if (executor && isWhitelisted(channel.guild, executor.executor)) return;
    const data = getGuildData(channel.guild.id);
    data.deleteChannels++;
    data.lastAction = Date.now();
    if (data.deleteChannels >= MAX_CHANNEL_DELETES && !data.locked) {
      await lockdownGuild(channel.guild, "Channel nuke detected");
    }
  });

  client.on("roleDelete", async (role) => {
    if (role.guild.available === false) return;
    if (isWhitelisted(role.guild, role.client.user)) return;
    const executor = await role.guild.fetchAuditLogs({ limit: 1, type: 32 }).then(audit => audit.entries.first());
    if (executor && isWhitelisted(role.guild, executor.executor)) return;
    const data = getGuildData(role.guild.id);
    data.deleteRoles++;
    data.lastAction = Date.now();
    if (data.deleteRoles >= MAX_ROLE_DELETES && !data.locked) {
      await lockdownGuild(role.guild, "Role nuke detected");
    }
  });

  client.on("guildBanAdd", async (ban) => {
    if (ban.guild.available === false) return;
    if (isWhitelisted(ban.guild, ban.client.user)) return;
    const executor = await ban.guild.fetchAuditLogs({ limit: 1, type: 22 }).then(audit => audit.entries.first());
    if (executor && isWhitelisted(ban.guild, executor.executor)) return;
    const data = getGuildData(ban.guild.id);
    data.banCount++;
    data.lastAction = Date.now();
    if (data.banCount >= MAX_BANS && !data.locked) {
      await lockdownGuild(ban.guild, "Mass ban detected");
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (!newMember.guild || newMember.guild.available === false) return;
    if (oldMember.pending === true && newMember.pending === false) return;
    if (oldMember.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (!newMember.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (newMember.user.id === newMember.guild.ownerId) return;
    if (isWhitelisted(newMember.guild, newMember.user)) return;

    try {
      await newMember.roles.set(oldMember.roles.cache.map(r => r.id));
      const logChannel = newMember.guild.channels.cache.find(
        c => c.type === 0 && c.permissionsFor(client.user)?.has('SendMessages')
      );
      await logChannel?.send(
        `⚠️ Auto-reverted **Administrator** permission granted to ${newMember.user} — only the server owner or whitelisted users may hold this.`
      );
      client.logger.warn(`[ANTINUKE] Blocked non-owner/whitelisted admin grant: ${newMember.user.tag} in ${newMember.guild.name}`);
    } catch (err) {
      client.logger.error(`[ANTINUKE] Failed to revert admin role for ${newMember.user.tag}:`, err);
    }
  });

  async function lockdownGuild(guild, reason) {
    const data = getGuildData(guild.id);
    if (data.locked) return;
    data.locked = true;

    for (const role of guild.roles.cache.values()) {
      if (role.managed || role.id === guild.id) continue;
      if (role.permissions.has(PermissionsBitField.Flags.Administrator) ||
          role.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
          role.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
          role.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        try {
          const safePerms = role.permissions
            .remove(PermissionsBitField.Flags.Administrator)
            .remove(PermissionsBitField.Flags.ManageGuild)
            .remove(PermissionsBitField.Flags.ManageRoles)
            .remove(PermissionsBitField.Flags.ManageChannels);
          await role.setPermissions(safePerms);
        } catch (err) {
          client.logger.warn(`[ANTINUKE] Could not sanitize role ${role.name} in ${guild.name}`);
        }
      }
    }

    const alertChannel = guild.channels.cache.find(
      c => c.type === 0 && c.permissionsFor(client.user)?.has('SendMessages')
    );

    const message = `🚨 **ANTI-NUKE LOCKDOWN ACTIVATED**\n` +
                    `**Reason:** ${reason}\n` +
                    `All roles stripped of destructive permissions. Audit log review strongly advised.`;

    await alertChannel?.send({ content: message }).catch(() => {});
    client.logger.warn(`[ANTINUKE] Lockdown executed in ${guild.name} (${guild.id}): ${reason}`);
  }
};
