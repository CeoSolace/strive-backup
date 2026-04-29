const { EmbedBuilder } = require("discord.js");
const { getUser } = require("@schemas/User");

const SHOP = {
  padlock: { price: 500, desc: "prevents stealing for 1h" },
  boost: { price: 300, desc: "boost next work" },
};

module.exports = {
  name: "shop",
  description: "buy items",
  category: "ECONOMY",

  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message, args) {
    return run(message.author, args[0]);
  },

  async interactionRun(interaction) {
    const item = interaction.options.getString("item");
    return interaction.reply(await run(interaction.user, item));
  },
};

async function run(user, item) {
  const userDb = await getUser(user);

  if (!item) {
    const list = Object.entries(SHOP)
      .map(([k, v]) => `**${k}** - ${v.price} coins (${v.desc})`)
      .join("\n");

    return { embeds: [new EmbedBuilder().setDescription(list)] };
  }

  const data = SHOP[item];
  if (!data) return "Invalid item";

  if (userDb.coins < data.price) return "Not enough coins";

  userDb.coins -= data.price;

  const inv = userDb.inventory.find(i => i.itemId === item);
  if (inv) inv.amount++;
  else userDb.inventory.push({ itemId: item, amount: 1 });

  await userDb.save();

  return `Bought ${item}`;
}
