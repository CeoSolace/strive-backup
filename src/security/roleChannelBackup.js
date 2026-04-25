const { ChannelType, EmbedBuilder } = require("discord.js");
const backupState = require("./roleChannelBackupState");

function makeBackupId() {
  return `bkp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function serializeOverwrite(overwrite) {
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  };
}

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
    unicodeEmoji: role.unicodeEmoji || null,
    icon: role.icon || null,
  };
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,
    topic: channel.topic || null,
    nsfw: channel.nsfw || false,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || null,
    userLimit: channel.userLimit || null,
    permissionOverwrites: channel.permissionOverwrites.cache.map(serializeOverwrite),
  };
}

async function sendBackupEmbed(client, guild, storageChannelId, snapshot) {
  const channel = await client.channels.fetch(storageChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error("Backup storage channel not found or not text based");

  const embed = new EmbedBuilder()
    .setTitle(`Backup ID: ${snapshot.id}`)
    .setDescription(
      `Manual server backup for **${guild.name}**\n` +
      `Restore from the original server with \`/backup load backup_id:${snapshot.id}\`.`
    )
    .addFields(
      { name: "Guild ID", value: guild.id, inline: true },
      { name: "Roles", value: String(snapshot.roles.length), inline: true },
      { name: "Channels", value: String(snapshot.channels.length), inline: true },
      { name: "Safety", value: "This backup was created manually with `/backup save`. It will not be overwritten automatically." }
    )
    .setFooter({ text: "Do not delete this message. The JSON attachment contains the restore data." })
    .setTimestamp(snapshot.createdAt);

  const json = Buffer.from(JSON.stringify(snapshot, null, 2));
  return channel.send({
    embeds: [embed],
    files: [{ attachment: json, name: `${snapshot.id}.json` }],
  });
}

async function createSnapshot(client, guild) {
  const config = backupState.get(guild.id);
  if (!config?.enabled || !config.storageChannelId) return null;

  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => a.position - b.position)
    .map(serializeRole);

  const channels = guild.channels.cache
    .filter((channel) => channel.type !== ChannelType.DM)
    .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
    .map(serializeChannel);

  const snapshot = {
    id: makeBackupId(),
    guildId: guild.id,
    guildName: guild.name,
    createdAt: Date.now(),
    roles,
    channels,
  };

  const msg = await sendBackupEmbed(client, guild, config.storageChannelId, snapshot);

  backupState.set(guild.id, {
    enabled: true,
    storageChannelId: config.storageChannelId,
    latestBackupId: snapshot.id,
    latestMessageId: msg.id,
    latestCreatedAt: snapshot.createdAt,
  });

  return snapshot;
}

async function findBackupAttachment(client, guildId, backupId) {
  const config = backupState.get(guildId);
  if (!config?.storageChannelId) throw new Error("No backup storage channel configured. Run /backup setup first.");

  const channel = await client.channels.fetch(config.storageChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error("Backup storage channel not found");

  let before;
  for (let page = 0; page < 10; page++) {
    const messages = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!messages?.size) break;

    const found = messages.find((msg) => {
      const titleMatch = msg.embeds?.some((embed) => embed.title === `Backup ID: ${backupId}`);
      const fileMatch = msg.attachments?.some((file) => file.name === `${backupId}.json`);
      return titleMatch || fileMatch;
    });

    if (found) {
      const attachment = found.attachments.find((file) => file.name === `${backupId}.json`) || found.attachments.first();
      if (!attachment) throw new Error("Backup message found but attachment missing");
      return attachment.url;
    }

    before = messages.last()?.id;
  }

  throw new Error("Backup ID not found in storage channel");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch backup JSON: ${res.status}`);
  return res.json();
}

async function restoreBackup(client, guild, backupId) {
  const url = await findBackupAttachment(client, guild.id, backupId);
  const snapshot = await fetchJson(url);

  if (snapshot.guildId !== guild.id) throw new Error("Backup belongs to a different server");

  const roleMap = new Map();

  for (const savedRole of snapshot.roles) {
    let role = guild.roles.cache.get(savedRole.id) || guild.roles.cache.find((r) => r.name === savedRole.name && !r.managed);

    const payload = {
      name: savedRole.name,
      color: savedRole.color,
      hoist: savedRole.hoist,
      mentionable: savedRole.mentionable,
      permissions: BigInt(savedRole.permissions),
      reason: `Restoring backup ${backupId}`,
    };

    if (!role) role = await guild.roles.create(payload).catch(() => null);
    else if (role.editable) await role.edit(payload).catch(() => null);

    if (role) roleMap.set(savedRole.id, role.id);
  }

  const categoryMap = new Map();
  const channelMap = new Map();
  const categories = snapshot.channels.filter((ch) => ch.type === ChannelType.GuildCategory);
  const normalChannels = snapshot.channels.filter((ch) => ch.type !== ChannelType.GuildCategory);

  async function buildOverwrites(savedChannel) {
    return savedChannel.permissionOverwrites.map((ow) => ({
      id: roleMap.get(ow.id) || channelMap.get(ow.id) || ow.id,
      type: ow.type,
      allow: BigInt(ow.allow),
      deny: BigInt(ow.deny),
    }));
  }

  for (const savedChannel of categories) {
    let channel = guild.channels.cache.get(savedChannel.id) || guild.channels.cache.find((ch) => ch.name === savedChannel.name && ch.type === savedChannel.type);
    const payload = {
      name: savedChannel.name,
      type: savedChannel.type,
      permissionOverwrites: await buildOverwrites(savedChannel),
      reason: `Restoring backup ${backupId}`,
    };

    if (!channel) channel = await guild.channels.create(payload).catch(() => null);
    else await channel.edit(payload).catch(() => null);

    if (channel) {
      categoryMap.set(savedChannel.id, channel.id);
      channelMap.set(savedChannel.id, channel.id);
    }
  }

  for (const savedChannel of normalChannels) {
    let channel = guild.channels.cache.get(savedChannel.id) || guild.channels.cache.find((ch) => ch.name === savedChannel.name && ch.type === savedChannel.type);
    const payload = {
      name: savedChannel.name,
      type: savedChannel.type,
      parent: categoryMap.get(savedChannel.parentId) || savedChannel.parentId || null,
      topic: savedChannel.topic || undefined,
      nsfw: savedChannel.nsfw || false,
      rateLimitPerUser: savedChannel.rateLimitPerUser || 0,
      bitrate: savedChannel.bitrate || undefined,
      userLimit: savedChannel.userLimit || undefined,
      permissionOverwrites: await buildOverwrites(savedChannel),
      reason: `Restoring backup ${backupId}`,
    };

    if (!channel) channel = await guild.channels.create(payload).catch(() => null);
    else await channel.edit(payload).catch(() => null);

    if (channel) channelMap.set(savedChannel.id, channel.id);
  }

  return { backupId, roles: snapshot.roles.length, channels: snapshot.channels.length };
}

module.exports = function roleChannelBackup(client) {
  client.roleChannelBackup = {
    createSnapshot: (guild) => createSnapshot(client, guild),
    restoreBackup: (guild, backupId) => restoreBackup(client, guild, backupId),
  };

  client.logger.success("RoleChannelBackup loaded in manual-save mode");
};
