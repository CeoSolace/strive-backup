// bot.js
require("dotenv").config();
require("module-alias/register");

// register extenders
require("@helpers/extenders/Message");
require("@helpers/extenders/Guild");
require("@helpers/extenders/GuildChannel");

const { checkForUpdates } = require("@helpers/BotUtils");
const { initializeMongoose } = require("@src/database/mongoose");
const { BotClient } = require("@src/structures");
const { validateConfiguration } = require("@helpers/Validator");
const { OmniDiscordLogger } = require("./logging");
const { ApplicationCommandOptionType } = require("discord.js");

validateConfiguration();

// initialize client
const client = new BotClient();

// load systems
client.loadCommands("src/commands");
client.loadContexts("src/contexts");
client.loadEvents("src/events");

// 🔒 security modules
client.loadSecurityModules("src/security");

// logging
client.omniLogger = new OmniDiscordLogger(client);

// unhandled rejections
process.on("unhandledRejection", (err) => client.logger.error("Unhandled promise rejection", err));

(async () => {
  // update check (non-fatal)
  try {
    await checkForUpdates();
  } catch (e) {
    client.logger.error("VersionCheck: Failed to check for bot updates", e);
  }

  // ✅ ALWAYS initialize MongoDB for bot features (giveaways, reaction roles, etc.)
  try {
    await initializeMongoose();
    client.logger.success("Database connected");
  } catch (e) {
    client.logger.error("Database connection failed (bot features may break)", e);
  }

  // dashboard (optional)
  if (client.config.DASHBOARD.enabled) {
    client.logger.log("Launching dashboard");
    try {
      const { launch } = require("@root/dashboard/app");
      await launch(client);
    } catch (ex) {
      client.logger.error("Failed to launch dashboard", ex);
      // Bot keeps running even if dashboard fails
    }
  }

  // login
  await client.login(process.env.BOT_TOKEN);

  // 🔹 REGISTER /annouce SLASH COMMAND
  try {
    client.logger.log("Registering /annouce slash command...");

    await client.application.commands.create({
      name: "annouce",
      description: "Send a global announcement to all servers",
      options: [
        {
          name: "message",
          description: "Announcement message",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    });

    client.logger.success("/annouce registered successfully.");
  } catch (err) {
    client.logger.error("Failed to register /annouce command", err);
  }

  // register remaining commands
  try {
    client.logger.log("Registering global slash commands...");
    await client.registerInteractions();
    client.logger.success("Global slash commands registered successfully.");
  } catch (err) {
    client.logger.error("Failed to register global slash commands", err);
  }
})();
