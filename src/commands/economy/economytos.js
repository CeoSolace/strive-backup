const { requireEconomyUser } = require("@src/database/economy");

module.exports = {
  name: "economytos",
  description: "accept economy terms",
  category: "ECONOMY",

  command: { enabled: true },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "accept",
        description: "accept the terms",
        type: 1,
      },
    ],
  },

  async messageRun(message) {
    return message.safeReply(await accept(message.author));
  },

  async interactionRun(interaction) {
    return interaction.reply(await accept(interaction.user));
  },
};

async function accept(user) {
  const { account } = await requireEconomyUser(user, { requireTos: false });

  account.acceptedTos = true;
  account.tosAcceptedAt = new Date();
  await account.save();

  return "You accepted the economy terms. This system uses fake crypto and has no real world value. Trading or selling will result in blacklist.";
}
