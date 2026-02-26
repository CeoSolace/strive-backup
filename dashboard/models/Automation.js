// dashboard/models/Automation.js
const mongoose = require("mongoose");

// Ultra-compact automations:
// - f: function ID sequence (ints 1..18), max 9 items
// - p: tiny param objects aligned by index with f (short keys: c,r,t,x,s,k,e,b)

const AutomationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },

    // Function sequence: array of Numbers (1..18), length 1..9
    f: { type: [Number], default: [], required: true },

    // Params aligned with f index; Mixed to allow tiny objects (short keys).
    p: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, collection: "automations" }
);

AutomationSchema.index({ guildId: 1, updatedAt: -1 });

module.exports = mongoose.models.Automation || mongoose.model("Automation", AutomationSchema);
