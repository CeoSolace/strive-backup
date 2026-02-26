const mongoose = require("mongoose");

const DashboardUserSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String },
    avatar: { type: String },
    discriminator: { type: String },
    sessionVersion: { type: Number, default: 1 },
  },
  { timestamps: true, collection: "dashboard_users" }
);

module.exports = mongoose.models.DashboardUser || mongoose.model("DashboardUser", DashboardUserSchema);
