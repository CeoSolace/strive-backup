// dashboard/utils.js
const { getUser } = require("@schemas/User");
const Discord = require("discord.js");
const { getSettings } = require("@schemas/Guild");

async function fetchGuild(guildID, client, guilds) {
  const guild = client.guilds.cache.get(guildID);
  const settings = await getSettings(guild);
  return { ...guild, ...settings._doc, ...guilds.find((g) => g.id === guild.id) };
}

function canManageGuild(guild) {
  if (!guild) return false;
  if (guild.owner === true) return true;

  try {
    const permissions = BigInt(guild.permissions || "0");
    const perms = new Discord.PermissionsBitField(permissions);

    return perms.has("Administrator") || perms.has("ManageGuild");
  } catch {
    return false;
  }
}

async function fetchUser(userData, client, query) {
  if (userData.guilds) {
    userData.guilds.forEach((guild) => {
      // Reset this every request so stale session data cannot mark random servers as manageable.
      guild.admin = canManageGuild(guild);
      guild.manageable = guild.admin;

      const inCache = client.guilds.cache.get(guild.id);

      guild.settingsUrl = inCache
        ? `/manage/${guild.id}/`
        : `https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=2146958847&guild_id=${guild.id}`;

      guild.statsUrl = inCache
        ? `/stats/${guild.id}/`
        : `https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=2146958847&guild_id=${guild.id}`;

      guild.iconURL = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
        : "https://discordemoji.com/assets/emoji/discordcry.png";

      guild.displayed = query ? guild.name.toLowerCase().includes(query.toLowerCase()) : true;
    });

    userData.displayedGuilds = userData.guilds.filter((g) => g.displayed && canManageGuild(g));
    if (userData.displayedGuilds.length < 1) delete userData.displayedGuilds;
  }

  const user = await client.users.fetch(userData.id);
  user.displayAvatar = user.displayAvatarURL();

  const userDb = await getUser(user);
  const userInfos = { ...user, ...userDb, ...userData, ...user.presence };

  return userInfos;
}

module.exports = { fetchGuild, fetchUser, canManageGuild };
