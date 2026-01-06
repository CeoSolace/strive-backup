const { commandHandler, automodHandler, statsHandler } = require("@src/handlers");
const { PREFIX_COMMANDS } = require("@root/config");
const { getSettings } = require("@schemas/Guild");
const Afk = require("@helpers/AfkManager");

/**
 * @param {import('@src/structures').BotClient} client
 * @param {import('discord.js').Message} message
 */
module.exports = async (client, message) => {
  // ignore DMs + bots
  if (!message.guild || message.author.bot) return;

  const settings = await getSettings(message.guild);

  // command handler
  let isCommand = false;

  if (PREFIX_COMMANDS.ENABLED) {
    // check for bot mentions (prefix hint)
    if (message.content?.includes(`${client.user.id}`)) {
      try {
        await message.channel.safeSend(`> My prefix is \`${settings.prefix}\``);
      } catch {
        // ignore
      }
    }

    // prefix command detect
    if (message.content && message.content.startsWith(settings.prefix)) {
      const invoke = message.content.replace(`${settings.prefix}`, "").trim().split(/\s+/)[0];
      const cmd = client.getCommand(invoke);
      if (cmd) {
        isCommand = true;

        // NOTE: keep this awaited if your handler returns a promise
        // If it doesn't, await won't hurt.
        await commandHandler.handlePrefixCommand(message, cmd, settings);
      }
    }
  }

  // stats handler
  if (settings.stats?.enabled) {
    try {
      await statsHandler.trackMessageStats(message, isCommand, settings);
    } catch {
      // ignore stats errors
    }
  }

  /**
   * AFK handler
   * - MUST run after command detection so "!afk ..." doesn't instantly unAFK the user
   * - Works for non-commands too
   */
  try {
    await Afk.handleMessage(message);
  } catch {
    // ignore AFK handler errors
  }

  // if not a command -> automod
  if (!isCommand) {
    try {
      await automodHandler.performAutomod(message, settings);
    } catch {
      // ignore automod errors
    }
  }
};
