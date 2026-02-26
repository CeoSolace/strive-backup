const Stripe = require("stripe");
const Premium = require("../database/schemas/premium");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;

  if (event.type === "checkout.session.completed") {
    await Premium.findOneAndUpdate(
      { userId: data.metadata.userId },
      {
        userId: data.metadata.userId,
        stripeCustomerId: data.customer,
        stripeSubscriptionId: data.subscription,
        status: "active",
      },
      { upsert: true }
    );
  }

  if (event.type === "customer.subscription.deleted") {
    await Premium.findOneAndUpdate(
      { stripeSubscriptionId: data.id },
      { status: "canceled" }
    );
  }

  res.json({ received: true });
};
