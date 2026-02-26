const mongoose = require("mongoose");

const ChangeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const ConsentAuditEventSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    changedAt: { type: Date, default: Date.now, index: true },
    changes: { type: [ChangeSchema], default: [] },
    version: { type: String, required: true },
    actor: { type: String, required: true },
    userAgent: { type: String },
  },
  { timestamps: false, collection: "consent_audit_events" }
);

module.exports =
  mongoose.models.ConsentAuditEvent || mongoose.model("ConsentAuditEvent", ConsentAuditEventSchema);
