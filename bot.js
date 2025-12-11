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

validateConfiguration();

// initialize client
const client = new BotClient();
client.loadCommands("src/commands");
client.loadContexts("src/contexts");
client.loadEvents("src/events");

// 🔒 LOAD SECURITY MODULES
client.loadSecurityModules("src/security");

// find unhandled promise rejections
process.on("unhandledRejection", (err) => client.logger.error(`Unhandled exception`, err));

(async () => {
  // check for updates
  await checkForUpdates();

  // start the dashboard if enabled
  if (client.config.DASHBOARD.enabled) {
    client.logger.log("Launching dashboard");
    try {
      const { launch } = require("@root/dashboard/app");
      await launch(client);
    } catch (ex) {
      client.logger.error("Failed to launch dashboard", ex);
    }
  } else {
    // only init DB if dashboard is off (dashboard handles it otherwise)
    await initializeMongoose();
  }

  // login bot
  await client.login(process.env.BOT_TOKEN);

  // register global slash commands
  try {
    client.logger.log("Registering global slash commands...");
    await client.registerInteractions();
    client.logger.success("Global slash commands registered successfully.");
  } catch (err) {
    client.logger.error("Failed to register global slash commands", err);
  }
})();
