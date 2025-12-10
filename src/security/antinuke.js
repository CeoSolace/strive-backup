const { Collection, PermissionsBitField } = require("discord.js");

module.exports = (client) => {
  const nukeCache = new Collection(); // guildId => { deleteChannels, deleteRoles, banCount, lastAction, locked }

  const MAX_CHANNEL_DELETES = 5;
  const MAX_ROLE_DELETES = 5;
  const MAX_BANS = 5;
  const WINDOW = 30_000; // 30 seconds

  // Clear expired entries every 30s
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

  // --- Channel Deletion ---
  client.on("channelDelete", async (channel) => {
    if (!channel.guild || channel.guild.available === false) return;
    const data = getGuildData(channel.guild.id);
    data.deleteChannels++;
    data.lastAction = Date.now();

    if (data.deleteChannels >= MAX_CHANNEL_DELETES && !data.locked) {
      await lockdownGuild(channel.guild, "Channel nuke detected");
    }
  });

  // --- Role Deletion ---
  client.on("roleDelete", async (role) => {
    if (role.guild.available === false) return;
    const data = getGuildData(role.guild.id);
    data.deleteRoles++;
    data.lastAction = Date.now();

    if (data.deleteRoles >= MAX_ROLE_DELETES && !data.locked) {
      await lockdownGuild(role.guild, "Role nuke detected");
    }
  });

  // --- Mass Banning ---
  client.on("guildBanAdd", async (ban) => {
    if (ban.guild.available === false) return;
    const data = getGuildData(ban.guild.id);
    data.banCount++;
    data.lastAction = Date.now();

    if (data.banCount >= MAX_BANS && !data.locked) {
      await lockdownGuild(ban.guild, "Mass ban detected");
    }
  });

  // --- Prevent Unauthorized Admin Grants ---
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (!newMember.guild || newMember.guild.available === false) return;
    if (oldMember.pending === true && newMember.pending === false) return; // skip welcome screen bypass
    if (oldMember.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (!newMember.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    if (newMember.user.id === newMember.guild.ownerId) return;

    // Revert admin if not owner
    try {
      await newMember.roles.set(oldMember.roles.cache.map(r => r.id));
      const logChannel = newMember.guild.channels.cache.find(
        c => c.type === 0 && c.permissionsFor(client.user)?.has('SendMessages')
      );
      await logChannel?.send(
        `⚠️ Auto-reverted **Administrator** permission granted to ${newMember.user} — only the server owner may hold this.`
      );
      client.logger.warn(`[ANTINUKE] Blocked non-owner admin grant: ${newMember.user.tag} in ${newMember.guild.name}`);
    } catch (err) {
      client.logger.error(`[ANTINUKE] Failed to revert admin role for ${newMember.user.tag}:`, err);
    }
  });

  // --- Lockdown Function ---
  async function lockdownGuild(guild, reason) {
    const data = getGuildData(guild.id);
    if (data.locked) return;
    data.locked = true;

    // Strip dangerous perms from all roles (except @everyone and managed roles)
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

    // Notify in a safe channel
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
