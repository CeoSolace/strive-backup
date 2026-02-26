const mongoose = require("mongoose");

// Represents a scheduled automation task stored via the dashboard.
const AutomationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    schedule: { type: String, required: true },
    // simple string describing what the automation does; e.g. "reminder" or "message"
    action: { type: String, required: true },
    // optional parameters for the action
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "automations" }
);

module.exports =
  mongoose.models.Automation || mongoose.model("Automation", AutomationSchema);
