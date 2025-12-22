const { stripe, getOrCreatePrice } = require("../../services/stripe");
const Premium = require("../../database/schemas/premium");

module.exports = {
  name: "premium",
  description: "Manage premium subscription",
  category: "PREMIUM",

  options: [
    {
      name: "buy",
      description: "Buy premium",
      type: 1,
    },
    {
      name: "cancel",
      description: "Cancel premium",
      type: 1,
    },
  ],

  async executeSlash(interaction) {
    const sub = interaction.options.getSubcommand();
    return handle(interaction.user.id, sub, interaction);
  },

  async executePrefix(message, args) {
    const sub = args[0];
    return handle(message.author.id, sub, message);
  },
};

async function handle(userId, sub, ctx) {
  if (sub === "buy") {
    const priceId = await getOrCreatePrice();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.PUBLIC_URL}/success`,
      cancel_url: `${process.env.PUBLIC_URL}/cancel`,
      metadata: { userId },
    });

    return reply(ctx, `💎 Buy Premium: ${session.url}`);
  }

  if (sub === "cancel") {
    const premium = await Premium.findOne({ userId });
    if (!premium || !premium.stripeSubscriptionId)
      return reply(ctx, "You don’t have an active subscription.");

    await stripe.subscriptions.update(premium.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    premium.status = "canceled";
    await premium.save();

    return reply(ctx, "Your subscription will end at the billing period.");
  }
}

function reply(ctx, content) {
  if (ctx.reply) return ctx.reply({ content, ephemeral: true });
  return ctx.channel.send(content);
}
