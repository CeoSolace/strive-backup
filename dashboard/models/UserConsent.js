const mongoose = require("mongoose");

const UserConsentSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    version: { type: String, required: true },
    essential: { type: Boolean, default: true },
    analytics: { type: Boolean, default: false },
    diagnostics: { type: Boolean, default: false },
    training: { type: Boolean, default: false },
    marketing: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
    source: { type: String, default: "banner" },
    ipHash: { type: String },
  },
  { timestamps: false, collection: "user_consents" }
);

module.exports = mongoose.models.UserConsent || mongoose.model("UserConsent", UserConsentSchema);
