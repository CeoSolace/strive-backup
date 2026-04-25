/**
 * @param {import('@src/structures').BotClient} client
 * @param {Error} error
 */
module.exports = async (client, error) => {
  client.logger.error(`Client Error`, error);
};

// --- AUTOMATION ENGINE ---
const Automation = require("../../dashboard/models/Automation");

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const automations = await Automation.find({ guildId: message.guild.id, enabled: true }).lean();

  for (const auto of automations) {
    try {
      const blocks = auto.f || [];
      const params = auto.p || [];

      let triggered = false;

      for (let i = 0; i < blocks.length; i++) {
        const type = blocks[i];
        const p = params[i] || {};

        if (type === "message_starts" && message.content.startsWith(p.text || "")) {
          triggered = true;
          continue;
        }

        if (!triggered) continue;

        if (type === "reply_message") {
          await message.reply({ content: p.message || "" });
        }

        if (type === "send_message") {
          const ch = message.guild.channels.cache.get(p.channel) || message.channel;
          await ch.send({ content: p.message || "" });
        }

        if (type === "add_role") {
          const role = message.guild.roles.cache.get(p.role);
          if (role) await message.member.roles.add(role).catch(() => {});
        }

        if (type === "remove_role") {
          const role = message.guild.roles.cache.get(p.role);
          if (role) await message.member.roles.remove(role).catch(() => {});
        }

        if (type === "wait") {
          await new Promise(r => setTimeout(r, (p.seconds || 1) * 1000));
        }
      }
    } catch (err) {
      console.error("Automation run error", err);
    }
  }
});