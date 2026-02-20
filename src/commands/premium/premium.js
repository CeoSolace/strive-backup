"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { stripe, getOrCreatePrice } = require("../../services/stripe");
const Premium = require("../../database/schemas/premium");

const NAME = "premium";
const CATEGORY = "PREMIUM";

module.exports = {
  // ----------------------------------------------------
  // ✅ Common metadata (many loaders + help systems use this)
  // ----------------------------------------------------
  name: NAME,
  description: "Manage premium subscription",
  category: CATEGORY,
  enabled: true,

  // ----------------------------------------------------
  // ✅ discord.js v14 SlashCommandBuilder (many loaders require this)
  // ----------------------------------------------------
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription("Manage premium subscription")
    .addSubcommand((sub) =>
      sub.setName("buy").setDescription("Buy premium")
    )
    .addSubcommand((sub) =>
      sub.setName("cancel").setDescription("Cancel premium")
    ),

  // ----------------------------------------------------
  // ✅ Some frameworks still read "options" instead of builder
  // ----------------------------------------------------
  options: [
    { name: "buy", description: "Buy premium", type: 1 },
    { name: "cancel", description: "Cancel premium", type: 1 }
  ],

  // ----------------------------------------------------
  // ✅ Most common handler name
  // ----------------------------------------------------
  async execute(interaction) {
    // slash interaction path
    if (interaction?.isChatInputCommand?.()) {
      const sub = interaction.options.getSubcommand();
      return handle(interaction.user.id, sub, interaction);
    }

    // if your loader calls execute for prefix messages too (rare)
    if (interaction?.author && interaction?.content) {
      const args = interaction.content.trim().split(/\s+/).slice(1);
      const sub = args[0];
      return handle(interaction.author.id, sub, interaction);
    }
  },

  // ----------------------------------------------------
  // ✅ Your original framework-style handlers kept for compatibility
  // ----------------------------------------------------
  async executeSlash(interaction) {
    const sub = interaction.options.getSubcommand();
    return handle(interaction.user.id, sub, interaction);
  },

  async executePrefix(message, args) {
    const sub = args[0];
    return handle(message.author.id, sub, message);
  }
};

async function handle(userId, sub, ctx) {
  if (!sub) return reply(ctx, "Use `/premium buy` or `/premium cancel`.");

  if (sub === "buy") {
    const priceId = await getOrCreatePrice();

    // Make sure PUBLIC_URL exists or this creates broken links.
    const baseUrl = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return reply(
        ctx,
        "PUBLIC_URL is not set. Add it to .env (example: https://yourdomain.com)."
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: { userId }
    });

    return reply(ctx, `💎 Buy Premium:\n${session.url}`);
  }

  if (sub === "cancel") {
    const premium = await Premium.findOne({ userId });

    if (!premium?.stripeSubscriptionId) {
      return reply(ctx, "No active subscription found.");
    }

    await stripe.subscriptions.update(premium.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    premium.status = "canceled";
    await premium.save();

    return reply(ctx, "Subscription will end at the billing period.");
  }

  return reply(ctx, "Unknown subcommand. Use `buy` or `cancel`.");
}

function reply(ctx, content) {
  // Discord interactions
  if (ctx?.reply && typeof ctx.reply === "function") {
    // If it's an interaction, prefer ephemeral
    const isInteraction =
      typeof ctx.isChatInputCommand === "function" || !!ctx.deferred || !!ctx.replied;

    return ctx.reply({ content, ephemeral: !!isInteraction }).catch(() => {});
  }

  // Prefix message
  if (ctx?.channel?.send) return ctx.channel.send(content);

  // Fallback
  return null;
}
