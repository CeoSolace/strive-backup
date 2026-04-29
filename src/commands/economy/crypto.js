const { requireEconomyUser, updateAllAssetPrices } = require("@src/database/economy");

module.exports = {
  name: "crypto",
  description: "fake crypto market",
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
  const { error } = await requireEconomyUser(user);
  if (error) return error;

  const assets = await updateAllAssetPrices();
  return assets.map(a => `${a.symbol}: ${a.price}`).join("\n");
}
