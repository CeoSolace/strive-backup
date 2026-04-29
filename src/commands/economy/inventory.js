const { EmbedBuilder } = require("discord.js");
const { getUser } = require("@schemas/User");

module.exports = {
  name: "inventory",
  description: "view items",
  category: "ECONOMY",

  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message) {
    return message.safeReply(await run(message.author));
  },

  async interactionRun(interaction) {
    return interaction.reply(await run(interaction.user));
  },
};

async function run(user) {
  const userDb = await getUser(user);

  if (!userDb.inventory.length) return "Inventory empty";

  const items = userDb.inventory
    .map(i => `${i.itemId} x${i.amount}`)
    .join("\n");

  return { embeds: [new EmbedBuilder().setDescription(items)] };
}
