const Stripe = require("stripe");
const Config = require("../database/schemas/config");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getOrCreatePrice() {
  let priceConfig = await Config.findOne({ key: "PREMIUM_PRICE_ID" });
  if (priceConfig) return priceConfig.value;

  const product = await stripe.products.create({
    name: "Premium Subscription",
    description: "Full access to all premium features",
  });

  const price = await stripe.prices.create({
    unit_amount: 1500, // £15
    currency: "gbp",
    recurring: { interval: "month" },
    product: product.id,
  });

  await Config.create({
    key: "PREMIUM_PRICE_ID",
    value: price.id,
  });

  return price.id;
}

module.exports = {
  stripe,
  getOrCreatePrice,
};
