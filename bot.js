// bot.js
require("dotenv").config();
require("module-alias/register");
require("@helpers/extenders/Message");
require("@helpers/extenders/Guild");
require("@helpers/extenders/GuildChannel");

const { once } = require("events");
const { checkForUpdates } = require("@helpers/BotUtils");
const { initializeMongoose } = require("@src/database/mongoose");
const { initializeEconomyMongoose } = require("@src/database/economy");
const { BotClient } = require("@src/structures");
const { validateConfiguration } = require("@helpers/Validator");
const { OmniDiscordLogger } = require("./logging");

validateConfiguration();

const client = new BotClient();
client.loadCommands("src/commands");
client.loadContexts("src/contexts");
client.loadEvents("src/events");
client.loadSecurityModules("src/security");
client.omniLogger = new OmniDiscordLogger(client);

process.on("unhandledRejection", (err) => client.logger?.error("Unhandled promise rejection", err));
process.on("uncaughtException", (err) => client.logger?.error("Uncaught exception", err));
process.on("warning", (warning) => client.logger?.warn?.(`${warning.name}: ${warning.message}`));

async function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

(async () => {
  try { await withTimeout(checkForUpdates(), 10000); } catch {}

  if (client.config?.DASHBOARD?.enabled) {
    try { const { launch } = require("@root/dashboard/app"); await withTimeout(launch(client), 20000); } catch {}
  }

  try { await withTimeout(initializeMongoose(), 15000); } catch {}
  try { await withTimeout(initializeEconomyMongoose(), 15000); } catch {}

  try {
    client.login(process.env.BOT_TOKEN);
    await once(client, "ready");
  } catch (err) { process.exit(1); }

  try { await withTimeout(client.registerInteractions(), 30000); } catch {}
})();
