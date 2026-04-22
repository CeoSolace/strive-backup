const mongoose = require("mongoose");

// Stores per-user preferences including default guild, export flags, consent categories and billing plan.
const UserPreferencesSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },

    // ID of the guild to pre-select when navigating the dashboard; nullable.
    defaultGuild: { type: String, default: null },

    // Whether the user wants to receive exports via email.
    emailExport: { type: Boolean, default: false },

    // Optional consent flags for various data processing categories.
    analytics: { type: Boolean, default: false },
    diagnostics: { type: Boolean, default: false },
    training: { type: Boolean, default: false },
    marketing: { type: Boolean, default: false },

    // Billing plan: "free", "premium", etc.
    plan: { type: String, default: "free" },
  },
  { timestamps: true, collection: "user_preferences" }
);

module.exports =
  mongoose.models.UserPreferences || mongoose.model("UserPreferences", UserPreferencesSchema);