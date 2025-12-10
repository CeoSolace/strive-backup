require("dotenv").config();
const fetch = require("node-fetch");

// Load environment variables
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BOT_SECRET = process.env.BOT_SECRET; // Only needed for OAuth (not required for this operation)

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing BOT_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

async function resetGlobalCommands() {
  try {
    console.log("Resetting GLOBAL slash commands...");

    const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${TOKEN}`,
      },
      body: JSON.stringify([]), // empty array wipes commands
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Error resetting global commands:", data);
      return;
    }

    console.log("✔ Successfully reset ALL global slash commands.");
  } catch (err) {
    console.error("Failed to reset commands:", err);
  }
}

async function main() {
  console.log("Using CLIENT_ID:", CLIENT_ID);
  console.log("Using BOT_TOKEN: Loaded (" + TOKEN.length + " chars)");

  await resetGlobalCommands();

  console.log("Done. Restart your bot to re-register commands.");
}

main();
