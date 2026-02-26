const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");

const CheckAuth = require("../auth/CheckAuth");
const DashboardUser = require("../models/DashboardUser");
const UserConsent = require("../models/UserConsent");
const ConsentAuditEvent = require("../models/ConsentAuditEvent");

const router = express.Router();

const CONSENT_VERSION = "2026-01-05";

function hashIp(ip) {
  if (!ip) return undefined;
  const salt = process.env.CONSENT_IP_SALT;
  if (!salt) return undefined;
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function defaultConsent() {
  return {
    version: CONSENT_VERSION,
    essential: true,
    analytics: false,
    diagnostics: false,
    training: false,
    marketing: false,
  };
}

// CSRF helper for client fetches
router.get("/csrf", CheckAuth, (req, res) => {
  return res.json({ csrfToken: req.csrfToken ? req.csrfToken() : null });
});

/**
 * GET /api/me
 */
router.get("/me", CheckAuth, async (req, res) => {
  const discord = req.session.user;
  const guilds = Array.isArray(discord.guilds) ? discord.guilds : [];

  return res.json({
    discord: {
      id: discord.id,
      username: discord.username,
      discriminator: discord.discriminator,
      avatar: discord.avatar,
      global_name: discord.global_name,
      email: discord.email || null,
    },
    app: {
      guildCount: guilds.length,
      baseURL: req.client.config.DASHBOARD.baseURL,
      consentVersion: CONSENT_VERSION,
    },
  });
});

/**
 * GET /api/consent
 */
router.get("/consent", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  const record = await UserConsent.findOne({ discordId }).lean();

  if (!record) {
    return res.json({
      hasChoice: false,
      consent: defaultConsent(),
      updatedAt: null,
    });
  }

  return res.json({
    hasChoice: true,
    consent: {
      version: record.version,
      essential: true,
      analytics: !!record.analytics,
      diagnostics: !!record.diagnostics,
      training: !!record.training,
      marketing: !!record.marketing,
    },
    updatedAt: record.updatedAt,
    source: record.source,
  });
});

/**
 * PUT /api/consent
 */
router.put("/consent", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

  const schema = z
    .object({
      version: z.string().optional(),
      analytics: z.boolean().optional(),
      diagnostics: z.boolean().optional(),
      training: z.boolean().optional(),
      marketing: z.boolean().optional(),
      source: z.enum(["banner", "settings", "api"]).optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const incoming = parsed.data;

  const current = await UserConsent.findOne({ discordId }).lean();
  const base = current ? { ...current } : { ...defaultConsent(), discordId };

  const nextConsent = {
    discordId,
    version: CONSENT_VERSION,
    essential: true,
    analytics: incoming.analytics ?? !!base.analytics,
    diagnostics: incoming.diagnostics ?? !!base.diagnostics,
    training: incoming.training ?? !!base.training,
    marketing: incoming.marketing ?? !!base.marketing,
    updatedAt: new Date(),
    source: incoming.source || "settings",
  };

  if (!current) {
    if (incoming.training !== true) nextConsent.training = false;
  }

  const changes = [];
  const keys = ["analytics", "diagnostics", "training", "marketing"];
  for (const key of keys) {
    const from = !!(current ? current[key] : defaultConsent()[key]);
    const to = !!nextConsent[key];
    if (from !== to) changes.push({ key, from, to });
  }

  await UserConsent.updateOne(
    { discordId },
    { $set: nextConsent, $setOnInsert: { discordId } },
    { upsert: true }
  );

  if (!current || changes.length > 0) {
    await ConsentAuditEvent.create({
      discordId,
      changedAt: new Date(),
      changes: current ? changes : [{ key: "consent_created", from: null, to: "created" }],
      version: CONSENT_VERSION,
      actor: discordId,
      userAgent: req.get("user-agent") || undefined,
      ipHash: hashIp(req.ip),
    });
  }

  return res.json({ ok: true, consent: { ...nextConsent, essential: true } });
});

/**
 * GET /api/consent/history
 */
router.get("/consent/history", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(5, Number(req.query.limit || 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ConsentAuditEvent.find({ discordId }).sort({ changedAt: -1 }).skip(skip).limit(limit).lean(),
    ConsentAuditEvent.countDocuments({ discordId }),
  ]);

  return res.json({ page, limit, total, items });
});

/**
 * POST /api/account/export
 * Export the user's dashboard-related data (dashboard user record, consent preferences, consent history).
 */
router.post("/account/export", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    // Fetch dashboard user record (excluding internal fields)
    const userRecord = await DashboardUser.findOne({ discordId }).lean();
    // Fetch current consent
    const consent = await UserConsent.findOne({ discordId }).lean();
    // Fetch consent audit events
    const history = await ConsentAuditEvent.find({ discordId }).sort({ changedAt: 1 }).lean();
    // Build export payload
    return res.json({
      discord: {
        id: req.session.user.id,
        username: req.session.user.username,
        discriminator: req.session.user.discriminator,
        email: req.session.user.email || null,
      },
      dashboardUser: userRecord
        ? {
            discordId: userRecord.discordId,
            username: userRecord.username,
            avatar: userRecord.avatar,
            discriminator: userRecord.discriminator,
            createdAt: userRecord.createdAt,
            updatedAt: userRecord.updatedAt,
          }
        : null,
      consent: consent
        ? {
            version: consent.version,
            essential: true,
            analytics: !!consent.analytics,
            diagnostics: !!consent.diagnostics,
            training: !!consent.training,
            marketing: !!consent.marketing,
            updatedAt: consent.updatedAt,
            source: consent.source,
          }
        : null,
      consentHistory: history.map((ev) => ({
        changedAt: ev.changedAt,
        changes: ev.changes,
        version: ev.version,
        actor: ev.actor,
        userAgent: ev.userAgent,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to export data" });
  }
});

/**
 * POST /api/account/delete
 * Delete the user's dashboard-only data: consent, audit history, and dashboard user record.
 */
router.post("/account/delete", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  // Validate payload: confirm must equal 'DELETE'
  const schema = z
    .object({
      confirm: z.literal("DELETE"),
    })
    .strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  try {
    // Remove consent and audit events and dashboard user record
    await Promise.all([
      UserConsent.deleteOne({ discordId }),
      ConsentAuditEvent.deleteMany({ discordId }),
      DashboardUser.deleteOne({ discordId }),
    ]);
    // Destroy session to sign the user out
    req.session.destroy(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete account data" });
  }
});

/**
 * POST /api/account/signout-all
 * Invalidate all sessions by bumping the sessionVersion on the dashboard user record.
 */
router.post("/account/signout-all", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    const user = await DashboardUser.findOne({ discordId });
    if (user) {
      user.sessionVersion = (user.sessionVersion || 1) + 1;
      await user.save();
    }
    // Destroy current session so user must log in again
    req.session.destroy(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to sign out sessions" });
  }
});

module.exports = router;
