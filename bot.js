// bot.js
require("dotenv").config();
require("module-alias/register");

// register extenders
require("@helpers/extenders/Message");
require("@helpers/extenders/Guild");
require("@helpers/extenders/GuildChannel");

const { once } = require("events");
const { checkForUpdates } = require("@helpers/BotUtils");
const { initializeMongoose } = require("@src/database/mongoose");
const { BotClient } = require("@src/structures");
const { validateConfiguration } = require("@helpers/Validator");
const { OmniDiscordLogger } = require("./logging");

validateConfiguration();

// initialize client
const client = new BotClient();

// load systems
client.loadCommands("src/commands");
client.loadContexts("src/contexts");
client.loadEvents("src/events");
client.loadSecurityModules("src/security");

// logging
client.omniLogger = new OmniDiscordLogger(client);

// safety
process.on("unhandledRejection", (err) => {
  client.logger?.error("Unhandled promise rejection", err);
});

process.on("uncaughtException", (err) => {
  client.logger?.error("Uncaught exception", err);
});

process.on("warning", (warning) => {
  client.logger?.warn?.(`${warning.name}: ${warning.message}`);
});

async function withTimeout(promise, ms, label) {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  // non-fatal update check
  try {
    await withTimeout(checkForUpdates(), 10000, "Update check");
  } catch (e) {
    client.logger.error("VersionCheck: Failed to check for bot updates", e);
  }

  // start dashboard early so Render sees an open port
  if (client.config?.DASHBOARD?.enabled) {
    client.logger.log("Launching dashboard...");
    try {
      const { launch } = require("@root/dashboard/app");
      await withTimeout(launch(client), 20000, "Dashboard launch");
      client.logger.success("Dashboard launched successfully.");
    } catch (ex) {
      client.logger.error("Failed to launch dashboard", ex);
    }
  }

  // DB should not kill the bot if it fails
  try {
    await withTimeout(initializeMongoose(), 15000, "MongoDB connection");
    client.logger.success("Database connected");
  } catch (e) {
    client.logger.error("Database connection failed (bot features may break)", e);
  }

  // login bot
  try {
    if (!process.env.BOT_TOKEN) {
      throw new Error("Missing BOT_TOKEN in environment variables");
    }

    client.logger.log("Logging into Discord...");
    client.login(process.env.BOT_TOKEN).catch((err) => {
      client.logger.error("Discord login failed", err);
      process.exit(1);
    });

    await once(client, "ready");
    client.logger.success(`Bot is online as ${client.user.tag}`);
  } catch (err) {
    client.logger.error("Failed during Discord startup", err);
    process.exit(1);
  }

  // register slash commands once ready
  try {
    client.logger.log("Registering global slash commands...");
    await withTimeout(client.registerInteractions(), 30000, "Slash command registration");
    client.logger.success("Global slash commands registered successfully.");
  } catch (err) {
    client.logger.error("Failed to register global slash commands", err);
  }
})();
