const mongoose = require("mongoose");

// Audit log model for tracking state-changing actions performed via the dashboard.
const AuditLogSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    guildId: { type: String, index: true },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    actor: { type: String },
  },
  { timestamps: true, collection: "audit_logs" }
);

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
