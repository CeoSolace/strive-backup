const mongoose = require("mongoose");

const premiumSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },

    status: {
      type: String,
      enum: ["active", "canceled", "incomplete", "past_due"],
      default: "incomplete",
    },

    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Premium", premiumSchema);
