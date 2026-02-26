const mongoose = require("mongoose");

// Stores per-user dashboard preferences.
const UserPreferencesSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    defaultGuild: { type: String, default: null },
    emailExport: { type: Boolean, default: false },
    plan: { type: String, default: "free" },
    preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "user_preferences" }
);

module.exports =
  mongoose.models.UserPreferences || mongoose.model("UserPreferences", UserPreferencesSchema);
