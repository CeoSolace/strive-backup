const { EmbedBuilder } = require("discord.js");
const { getUser } = require("@schemas/User");
const { ECONOMY, EMBED_COLORS } = require("@root/config");

// Simple in-memory cooldown (per-process). If you use sharding or multiple instances,
// consider moving this to DB/Redis.
const COOLDOWN_MS = 60 * 1000; // 60 seconds
const cooldowns = new Map(); // thiefId -> timestamp when allowed again

module.exports = async (self, target) => {
  if (!target) return "Please mention a valid user to steal from";
  if (target.bot) return "You cannot steal from bots!";
  if (target.id === self.id) return "You cannot steal from yourself!";

  // cooldown
  const now = Date.now();
  const nextAllowed = cooldowns.get(self.id) || 0;
  if (nextAllowed > now) {
    const seconds = Math.ceil((nextAllowed - now) / 1000);
    return `⏳ You must wait **${seconds}s** before trying to steal again.`;
  }

  // load DB rows
  const thiefDb = await getUser(self);
  const targetDb = await getUser(target);

  // Wallet-only: steal from targetDb.coins
  if (!targetDb.coins || targetDb.coins <= 0) {
    cooldowns.set(self.id, now + COOLDOWN_MS);
    return `${target.username} has no coins in their wallet to steal.`;
  }

  // ----- Mechanics (tweak freely) -----
  const successRate = 0.4; // 40% chance
  const success = Math.random() < successRate;

  // Steal 5%–20% of target wallet, min 1, max 500
  const pct = 0.05 + Math.random() * 0.15;
  const proposedSteal = Math.max(1, Math.min(500, Math.floor(targetDb.coins * pct)));
  const stolen = Math.min(proposedSteal, targetDb.coins);

  // If caught: pay 25–150 coins from thief wallet, capped by what thief has
  const proposedPenalty = Math.floor(25 + Math.random() * 126); // 25..150
  const penalty = Math.min(proposedPenalty, Math.max(0, thiefDb.coins || 0));

  // Apply cooldown no matter what (prevents spam)
  cooldowns.set(self.id, now + COOLDOWN_MS);

  // ----- Apply result -----
  if (success) {
    targetDb.coins -= stolen;
    thiefDb.coins = (thiefDb.coins || 0) + stolen;

    await targetDb.save();
    await thiefDb.save();

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setAuthor({ name: "Wallet Updated" })
      .setDescription(`🦹 You stole **${stolen}${ECONOMY.CURRENCY}** from **${target.username}**'s wallet.`)
      .setTimestamp(Date.now());

    return { embeds: [embed] };
  }

  // Failure path (caught)
  if (penalty > 0) {
    thiefDb.coins -= penalty;
    await thiefDb.save();

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.ERROR || EMBED_COLORS.BOT_EMBED)
      .setAuthor({ name: "Caught!" })
      .setDescription(
        `🚨 You got caught trying to steal from **${target.username}** and paid **${penalty}${ECONOMY.CURRENCY}**.`
      )
      .setTimestamp(Date.now());

    return { embeds: [embed] };
  }

  // Thief has no money to penalize
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.ERROR || EMBED_COLORS.BOT_EMBED)
    .setAuthor({ name: "Caught!" })
    .setDescription(`🚨 You got caught trying to steal from **${target.username}**, but you had no coins to lose.`)
    .setTimestamp(Date.now());

  return { embeds: [embed] };
};
