const { EmbedBuilder } = require("discord.js");
const { getUser } = require("@schemas/User");
const { EMBED_COLORS, ECONOMY } = require("@root/config");

const JOBS = {
  freelancer: { min: 50, max: 150 },
  developer: { min: 120, max: 260 },
  trader: { min: 80, max: 300 },
};

const COOLDOWN = 30 * 60 * 1000;

module.exports = {
  name: "work",
  description: "earn coins by working",
  category: "ECONOMY",

  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message) {
    const res = await work(message.author);
    return message.safeReply(res);
  },

  async interactionRun(interaction) {
    const res = await work(interaction.user);
    return interaction.reply(res);
  },
};

async function work(user) {
  const userDb = await getUser(user);
  const now = Date.now();

  if (userDb.economy.lastWorkAt && now - userDb.economy.lastWorkAt < COOLDOWN) {
    const remaining = Math.ceil((COOLDOWN - (now - userDb.economy.lastWorkAt)) / 60000);
    return `⏳ You are tired. Come back in ${remaining} minutes.`;
  }

  const job = JOBS[userDb.economy.job] || JOBS.freelancer;

  let amount = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

  amount = Math.floor(amount * (1 - userDb.economy.fatigue / 150));

  userDb.economy.workStreak += 1;
  amount += userDb.economy.workStreak * 5;

  if (userDb.economy.nextWorkBoost > 0) {
    amount += userDb.economy.nextWorkBoost;
    userDb.economy.nextWorkBoost = 0;
  }

  userDb.coins += amount;
  userDb.economy.totalEarned += amount;
  userDb.economy.lastWorkAt = now;
  userDb.economy.fatigue = Math.min(100, userDb.economy.fatigue + 10);

  await userDb.save();

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setDescription(`💼 You worked as **${userDb.economy.job}** and earned **${amount}${ECONOMY.CURRENCY}**`);

  return { embeds: [embed] };
}
