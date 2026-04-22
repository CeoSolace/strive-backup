const mongoose = require("mongoose");

const premiumSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    stripeCustomerId: String,
    stripeSubscriptionId: String,

    status: {
      type: String,
      enum: ["active", "canceled", "incomplete", "past_due"],
      default: "incomplete",
    },

    currentPeriodEnd: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Premium", premiumSchema);
