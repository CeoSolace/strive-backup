// dashboard/models/Automation.js
const mongoose = require("mongoose");

// Bright Feature Builder automations
// f = ordered block IDs, stored as strings so the builder can grow without numeric limits
// p = parameter objects aligned with f by index
// c = optional visual connections between node IDs for flow UI

const AutomationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },

    f: { type: [String], default: [], required: true },
    p: { type: [mongoose.Schema.Types.Mixed], default: [] },
    c: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, collection: "automations" }
);

AutomationSchema.index({ guildId: 1, updatedAt: -1 });

module.exports = mongoose.models.Automation || mongoose.model("Automation", AutomationSchema);
