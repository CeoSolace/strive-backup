const mongoose = require("mongoose");
const { CACHE_SIZE } = require("@root/config.js");
const FixedSizeMap = require("fixedsize-map");

const cache = new FixedSizeMap(CACHE_SIZE.USERS);

const inventoryItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    amount: { type: Number, default: 0, min: 0 },
    acquiredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const Schema = new mongoose.Schema(
  {
    _id: String,
    username: String,
    discriminator: String,
    logged: Boolean,
    coins: { type: Number, default: 0, min: 0 },
    bank: { type: Number, default: 0, min: 0 },
    reputation: {
      received: { type: Number, default: 0 },
      given: { type: Number, default: 0 },
      timestamp: Date,
    },
    daily: {
      streak: { type: Number, default: 0 },
      timestamp: Date,
    },

    // Smart economy state. This keeps the old coins/bank system compatible
    // while adding real work, shop items, tax/sinks, and anti-spam controls.
    economy: {
      job: { type: String, default: "freelancer" },
      lastWorkAt: Date,
      workStreak: { type: Number, default: 0 },
      fatigue: { type: Number, default: 0, min: 0, max: 100 },
      totalEarned: { type: Number, default: 0, min: 0 },
      totalSpent: { type: Number, default: 0, min: 0 },
      nextWorkBoost: { type: Number, default: 0, min: 0 },
      robberyShieldUntil: Date,
    },

    inventory: {
      type: [inventoryItemSchema],
      default: [],
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

const Model = mongoose.model("user", Schema);

function normaliseEconomy(userDb) {
  if (!userDb.economy) userDb.economy = {};
  if (!userDb.economy.job) userDb.economy.job = "freelancer";
  if (typeof userDb.economy.workStreak !== "number") userDb.economy.workStreak = 0;
  if (typeof userDb.economy.fatigue !== "number") userDb.economy.fatigue = 0;
  if (typeof userDb.economy.totalEarned !== "number") userDb.economy.totalEarned = 0;
  if (typeof userDb.economy.totalSpent !== "number") userDb.economy.totalSpent = 0;
  if (typeof userDb.economy.nextWorkBoost !== "number") userDb.economy.nextWorkBoost = 0;
  if (!Array.isArray(userDb.inventory)) userDb.inventory = [];
  return userDb;
}

module.exports = {
  model: Model,

  /**
   * @param {import('discord.js').User} user
   */
  getUser: async (user) => {
    if (!user) throw new Error("User is required.");
    if (!user.id) throw new Error("User Id is required.");

    const cached = cache.get(user.id);
    if (cached) return normaliseEconomy(cached);

    let userDb = await Model.findById(user.id);
    if (!userDb) {
      userDb = new Model({
        _id: user.id,
        username: user.username,
        discriminator: user.discriminator,
      });
    }

    // Temporary fix for users who where added to DB before v5.0.0
    // Update username and discriminator in previous DB
    else if (!userDb.username || !userDb.discriminator) {
      userDb.username = user.username;
      userDb.discriminator = user.discriminator;
    }

    normaliseEconomy(userDb);
    cache.add(user.id, userDb);
    return userDb;
  },

  getReputationLb: async (limit = 10) => {
    return Model.find({ "reputation.received": { $gt: 0 } })
      .sort({ "reputation.received": -1, "reputation.given": 1 })
      .limit(limit)
      .lean();
  },

  getWealthLb: async (limit = 10) => {
    return Model.aggregate([
      {
        $project: {
          username: 1,
          coins: { $ifNull: ["$coins", 0] },
          bank: { $ifNull: ["$bank", 0] },
          netWorth: { $add: [{ $ifNull: ["$coins", 0] }, { $ifNull: ["$bank", 0] }] },
        },
      },
      { $match: { netWorth: { $gt: 0 } } },
      { $sort: { netWorth: -1 } },
      { $limit: limit },
    ]);
  },
};
