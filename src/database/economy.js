const mongoose = require("mongoose");
const { log, success, warn, error } = require("../helpers/Logger");

let economyConnection;
let EconomyUser;
let EconomyAsset;

const DEFAULT_ASSETS = [
  { symbol: "BRI", name: "BrightCoin", price: 12.5, volatility: 0.06, drift: 0.002 },
  { symbol: "SOL", name: "Solace Token", price: 35, volatility: 0.08, drift: 0.001 },
  { symbol: "STR", name: "Strive Credits", price: 5.75, volatility: 0.04, drift: 0.0015 },
  { symbol: "NOVA", name: "Nova Cash", price: 82, volatility: 0.1, drift: -0.0005 },
];

function getModels() {
  if (!economyConnection) throw new Error("Economy database is not connected. Set E_MONGODB_URI.");
  if (EconomyUser && EconomyAsset) return { EconomyUser, EconomyAsset };

  const holdingSchema = new mongoose.Schema(
    {
      symbol: { type: String, required: true, uppercase: true },
      amount: { type: Number, default: 0, min: 0 },
      averageBuyPrice: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
  );

  const inventorySchema = new mongoose.Schema(
    {
      itemId: { type: String, required: true },
      amount: { type: Number, default: 0, min: 0 },
      acquiredAt: { type: Date, default: Date.now },
    },
    { _id: false }
  );

  const userSchema = new mongoose.Schema(
    {
      _id: String,
      username: String,
      wallet: { type: Number, default: 250, min: 0 },
      bank: { type: Number, default: 0, min: 0 },
      acceptedTos: { type: Boolean, default: false },
      tosAcceptedAt: Date,
      blacklisted: { type: Boolean, default: false },
      blacklistReason: String,
      job: { type: String, default: "runner" },
      lastWorkAt: Date,
      workStreak: { type: Number, default: 0, min: 0 },
      fatigue: { type: Number, default: 0, min: 0, max: 100 },
      totalEarned: { type: Number, default: 0, min: 0 },
      totalSpent: { type: Number, default: 0, min: 0 },
      nextWorkBoost: { type: Number, default: 0, min: 0 },
      robberyShieldUntil: Date,
      portfolio: { type: [holdingSchema], default: [] },
      inventory: { type: [inventorySchema], default: [] },
    },
    { timestamps: true }
  );

  const assetSchema = new mongoose.Schema(
    {
      symbol: { type: String, required: true, unique: true, uppercase: true },
      name: { type: String, required: true },
      price: { type: Number, required: true, min: 0.01 },
      previousPrice: { type: Number, default: 0 },
      volatility: { type: Number, default: 0.05 },
      drift: { type: Number, default: 0 },
      lastUpdatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  );

  EconomyUser = economyConnection.model("EconomyUser", userSchema);
  EconomyAsset = economyConnection.model("EconomyAsset", assetSchema);
  return { EconomyUser, EconomyAsset };
}

async function seedAssets() {
  const { EconomyAsset } = getModels();
  for (const asset of DEFAULT_ASSETS) {
    await EconomyAsset.updateOne({ symbol: asset.symbol }, { $setOnInsert: asset }, { upsert: true });
  }
}

async function initializeEconomyMongoose() {
  if (!process.env.E_MONGODB_URI) {
    warn("env: E_MONGODB_URI is missing. Economy commands will be unavailable.");
    return null;
  }

  if (economyConnection) return economyConnection;

  log("Connecting to Economy MongoDB...");
  try {
    economyConnection = await mongoose.createConnection(process.env.E_MONGODB_URI).asPromise();
    getModels();
    await seedAssets();
    success("Economy MongoDB: Database connection established");
    return economyConnection;
  } catch (err) {
    error("Economy MongoDB: Failed to connect to database", err);
    return null;
  }
}

async function getEconomyUser(user) {
  const { EconomyUser } = getModels();
  let doc = await EconomyUser.findById(user.id);
  if (!doc) {
    doc = new EconomyUser({ _id: user.id, username: user.username });
    await doc.save();
  } else if (doc.username !== user.username) {
    doc.username = user.username;
  }
  return doc;
}

async function requireEconomyUser(user, options = {}) {
  const account = await getEconomyUser(user);
  if (account.blacklisted) {
    return {
      error: `⛔ You are blacklisted from the economy system. Reason: ${account.blacklistReason || "policy breach"}`,
      account,
    };
  }
  if (options.requireTos !== false && !account.acceptedTos) {
    return {
      error:
        "You must accept the economy terms first. Run `/economytos accept`. This system uses fake coins and fake crypto only. It has no real money value.",
      account,
    };
  }
  return { account };
}

async function updateAssetPrice(symbol) {
  const { EconomyAsset } = getModels();
  const asset = await EconomyAsset.findOne({ symbol: symbol.toUpperCase() });
  if (!asset) return null;

  const now = Date.now();
  const elapsedMinutes = Math.max(1, Math.floor((now - new Date(asset.lastUpdatedAt).getTime()) / 60000));
  const cappedSteps = Math.min(elapsedMinutes, 60);

  let price = asset.price;
  for (let i = 0; i < cappedSteps; i++) {
    const shock = (Math.random() * 2 - 1) * asset.volatility;
    price = Math.max(0.01, price * (1 + asset.drift + shock));
  }

  asset.previousPrice = asset.price;
  asset.price = Number(price.toFixed(4));
  asset.lastUpdatedAt = new Date(now);
  await asset.save();
  return asset;
}

async function updateAllAssetPrices() {
  const { EconomyAsset } = getModels();
  const assets = await EconomyAsset.find().sort({ symbol: 1 });
  const updated = [];
  for (const asset of assets) {
    updated.push(await updateAssetPrice(asset.symbol));
  }
  return updated.filter(Boolean);
}

module.exports = {
  initializeEconomyMongoose,
  getModels,
  getEconomyUser,
  requireEconomyUser,
  updateAssetPrice,
  updateAllAssetPrices,
};
