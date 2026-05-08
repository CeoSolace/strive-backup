// src/events/message/automationEngine.js
const Automation = require("../../models/Automation");

/**
 * @param {import('@src/structures').BotClient} client
 * @param {import('discord.js').Message} message
 */
module.exports = async (client, message) => {
  if (!message.guild || message.author.bot) return;

  let automations;
  try {
    automations = await Automation.find({ guildId: message.guild.id, enabled: true }).lean();
  } catch (err) {
    return;
  }

  for (const auto of automations) {
    try {
      const blocks = auto.f || [];
      const params = auto.p || [];

      // Find the trigger block
      let triggerIndex = -1;
      let triggered = false;

      for (let i = 0; i < blocks.length; i++) {
        const type = blocks[i];
        const p = params[i] || {};

        // ── TRIGGERS ──
        if (type === "message_contains") {
          if (p.text && message.content.toLowerCase().includes(p.text.toLowerCase())) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }

        if (type === "message_equals") {
          if (p.text && message.content.trim().toLowerCase() === p.text.trim().toLowerCase()) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }
      }
    } catch (err) {
      client.logger?.error?.("Automation engine error", err);
    }
  }
};
