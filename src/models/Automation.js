const mongoose = require("mongoose");

const AutomationSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    f: {
      type: Array,
      default: [],
    },
    p: {
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Automation ||
  mongoose.model("Automation", AutomationSchema);
