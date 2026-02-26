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
  // csurf middleware in app.js attaches req.csrfToken
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

  // Never auto-enable training: only change it if explicitly provided.
  // Essential is always true.
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
    // Ensure training defaults to false on first write unless explicitly true
    if (incoming.training !== true) nextConsent.training = false;
  }

  // Compute changes
  const changes = [];
  const keys = ["analytics", "diagnostics", "training", "marketing"];
  for (const key of keys) {
    const from = !!(current ? current[key] : defaultConsent()[key]);
    const to = !!nextConsent[key];
    if (from !== to) changes.push({ key, from, to });
  }

  await UserConsent.updateOne(
    { discordId },
    {
      $set: nextConsent,
      $setOnInsert: { discordId },
    },
    { upsert: true }
  );

  // Only write audit event if something actually changed OR first choice
  if (!current || changes.length > 0) {
    await ConsentAuditEvent.create({
      discordId,
      changedAt: new Date(),
      changes: current ? changes : [{ key: "consent_created", from: null, to: "created" }],
      version: CONSENT_VERSION,
      actor: discordId,
      userAgent: req.get("user-agent") || undefined,
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

  return res.json({
    page,
    limit,
    total,
    items,
  });
});

/**
 * POST /api/account/export
 */
router.post("/account/export", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

  const [user, consent, history] = await Promise.all([
    DashboardUser.findOne({ discordId }).lean(),
    UserConsent.findOne({ discordId }).lean(),
    ConsentAuditEvent.find({ discordId }).sort({ changedAt: -1 }).limit(500).lean(),
  ]);

  // TODO: include any guild/module settings if you store them elsewhere
  return res.json({
    exportedAt: new Date().toISOString(),
    discordProfile: {
      ...req.session.user,
      guilds: Array.isArray(req.session.user.guilds) ? req.session.user.guilds : [],
    },
    dashboardUser: user,
    consent: consent || null,
    consentHistory: history,
    other: {
      note: "Server/module settings export not yet wired in (placeholder).",
    },
  });
});

/**
 * POST /api/account/delete
 * Requires typed confirmation in body: { confirm: "DELETE" }
 */
router.post("/account/delete", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

  const schema = z.object({ confirm: z.literal("DELETE") }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confirmation required" });

  await Promise.all([
    UserConsent.deleteOne({ discordId }),
    ConsentAuditEvent.deleteMany({ discordId }),
    DashboardUser.deleteOne({ discordId }),
  ]);

  // Invalidate this session and all others for this user (cleanest in this stack): bump sessionVersion
  // If user record is deleted, also wipe sessions that match this discordId if desired.
  // For safety, attempt session store wipe by bumping version before delete is not possible here.
  // Instead: destroy current session; other sessions will fail CheckAuth due to missing user record.
  req.session.destroy(() => {
    return res.json({ ok: true });
  });
});

/**
 * POST /api/account/signout-all
 * Bumps sessionVersion so all sessions become invalid.
 */
router.post("/account/signout-all", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

  const user = await DashboardUser.findOne({ discordId });
  if (!user) return res.status(404).json({ error: "User not found" });

  user.sessionVersion += 1;
  await user.save();

  req.session.destroy(() => {
    return res.json({ ok: true });
  });
});

module.exports = router;
