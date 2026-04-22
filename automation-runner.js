const Automation = require("../dashboard/models/Automation");

function matchesKeyword(mode, keyword, content) {
  if (!keyword) return false;
  if (!content) return false;
  if (mode === "contains") return content.toLowerCase().includes(keyword.toLowerCase());
  return content.trim().toLowerCase() === keyword.trim().toLowerCase();
}

function startAutomationRunner(client) {
  // Keyword replies
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const list = await Automation.find({
        guildId: message.guild.id,
        enabled: true,
        type: "keyword_reply",
      }).lean();

      for (const a of list) {
        const keyword = a.config?.keyword || "";
        const reply = a.config?.reply || "";
        const mode = a.config?.matchMode || "exact";

        if (reply && matchesKeyword(mode, keyword, message.content)) {
          await message.reply(reply);
          break; // avoid spam if multiple match
        }
      }
    } catch (e) {
      console.error("Automation keyword_reply error:", e);
    }
  });

  // NOTE: schedule_message needs cron scheduler in your bot process.
  // If you want this, tell me whether you already use node-cron / cron / bull etc.
  // I can plug it in cleanly without race conditions.
}

module.exports = { startAutomationRunner };
