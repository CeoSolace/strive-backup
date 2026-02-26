const mongoose = require("mongoose");

// Stores per-guild dashboard configuration including enabled modules and commands.
const GuildSettingsSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    // Map of module name -> enabled (boolean). True means enabled.
    modules: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // Map of command name -> enabled (boolean). True means enabled.
    commands: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // Generic settings object for additional guild-specific preferences.
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, collection: "guild_settings" }
);

module.exports =
  mongoose.models.GuildSettings || mongoose.model("GuildSettings", GuildSettingsSchema);
