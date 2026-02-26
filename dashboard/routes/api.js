const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");

const CheckAuth = require("../auth/CheckAuth");
const DashboardUser = require("../models/DashboardUser");
const UserConsent = require("../models/UserConsent");
const ConsentAuditEvent = require("../models/ConsentAuditEvent");

// Additional models for guild settings, automations, audit logs, user preferences and news
const GuildSettings = require("../models/GuildSettings");
const Automation = require("../models/Automation");
const AuditLog = require("../models/AuditLog");
const UserPreferences = require("../models/UserPreferences");
const NewsPost = require("../models/NewsPost");

// Helper to ensure a user has Manage Guild permissions for the given guild ID
async function ensureGuildAdmin(req, guildId) {
  const guilds = req.userInfos?.guilds || [];
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || !guild.admin) return false;
  return true;
}

// Helper to create an audit log entry
async function createAudit(req, guildId, action, details = {}) {
  try {
    const discordId = req.session.user.id;
    await AuditLog.create({
      discordId,
      guildId: guildId || null,
      action,
      details,
      actor: discordId,
    });
  } catch (e) {
    console.error("Audit log creation failed", e);
  }
}

const router = express.Router();

const CONSENT_VERSION = "2026-01-05";
const CONSENT_COOKIE = "bright_consent";

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

function parseConsentCookie(req) {
  try {
    if (!req.cookies || !req.cookies[CONSENT_COOKIE]) return null;
    const raw = req.cookies[CONSENT_COOKIE];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setConsentCookie(res, nextConsent) {
  // Compact cookie payload (keep small)
  const cookiePayload = {
    v: CONSENT_VERSION,
    a: !!nextConsent.analytics,
    d: !!nextConsent.diagnostics,
    t: !!nextConsent.training,
    m: !!nextConsent.marketing,
    ts: Date.now(),
  };

  // If you do NOT need JS access, set httpOnly: true for better security.
  res.cookie(CONSENT_COOKIE, JSON.stringify(cookiePayload), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  });
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
 * - Primary source of truth: Mongo UserConsent
 * - If no Mongo record exists, fall back to consent cookie (if present and version matches)
 */
router.get("/consent", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  const record = await UserConsent.findOne({ discordId }).lean();

  if (!record) {
    const cookie = parseConsentCookie(req);
    if (cookie) {
      return res.json({
        hasChoice: true,
        consent: {
          version: CONSENT_VERSION,
          essential: true,
          analytics: !!cookie.a,
          diagnostics: !!cookie.d,
          training: !!cookie.t,
          marketing: !!cookie.m,
        },
        updatedAt: cookie.ts ? new Date(cookie.ts) : null,
        source: "cookie",
      });
    }

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
 * Saves consent in Mongo AND writes a compact cookie reflecting the choice.
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

  // Safety: on first-time record, do not allow silent training opt-in unless explicit true
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

  // Write/update consent cookie to match saved selection
  setConsentCookie(res, nextConsent);

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
 */
router.post("/account/export", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    const userRecord = await DashboardUser.findOne({ discordId }).lean();
    const consent = await UserConsent.findOne({ discordId }).lean();
    const history = await ConsentAuditEvent.find({ discordId }).sort({ changedAt: 1 }).lean();

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
 * Clears the consent cookie too.
 */
router.post("/account/delete", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

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
    await Promise.all([
      UserConsent.deleteOne({ discordId }),
      ConsentAuditEvent.deleteMany({ discordId }),
      DashboardUser.deleteOne({ discordId }),
    ]);

    // Clear consent cookie
    res.clearCookie(CONSENT_COOKIE);

    req.session.destroy(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete account data" });
  }
});

/**
 * POST /api/account/signout-all
 */
router.post("/account/signout-all", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    const user = await DashboardUser.findOne({ discordId });
    if (user) {
      user.sessionVersion = (user.sessionVersion || 1) + 1;
      await user.save();
    }
    req.session.destroy(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to sign out sessions" });
  }
});

// -------------------------- Guild Settings Endpoints --------------------------

router.get("/guild/:guildId/settings", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    let record = await GuildSettings.findOne({ guildId });
    if (!record) record = await GuildSettings.create({ guildId });
    return res.json({
      settings: record.settings || {},
      modules: record.modules || {},
      commands: record.commands || {},
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch guild settings" });
  }
});

router.put("/guild/:guildId/settings", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({ settings: z.record(z.any()) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const { settings } = parsed.data;
    const record = await GuildSettings.findOneAndUpdate(
      { guildId },
      { $set: { settings } },
      { new: true, upsert: true }
    );
    await createAudit(req, guildId, "update_settings", { settings });
    return res.json({ ok: true, settings: record.settings });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update guild settings" });
  }
});

router.get("/guild/:guildId/modules", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    const availableModules = ["admin", "music", "fun", "moderation", "utility", "economy", "social"];
    let record = await GuildSettings.findOne({ guildId });
    if (!record) record = await GuildSettings.create({ guildId });

    const enabled = {};
    availableModules.forEach((m) => (enabled[m] = record.modules?.get(m) ?? false));
    return res.json({ availableModules, enabled });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch modules" });
  }
});

router.put("/guild/:guildId/modules", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({ module: z.string(), enabled: z.boolean() }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const { module, enabled } = parsed.data;
    const record = await GuildSettings.findOneAndUpdate(
      { guildId },
      { $set: { [`modules.${module}`]: enabled } },
      { new: true, upsert: true }
    );
    await createAudit(req, guildId, "toggle_module", { module, enabled });
    return res.json({ ok: true, enabled: record.modules?.get(module) ?? enabled });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update module" });
  }
});

router.get("/guild/:guildId/commands", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    const availableCommands = [];
    if (req.client?.commands && Array.isArray(req.client.commands)) {
      for (const cmd of req.client.commands) if (cmd?.name) availableCommands.push(cmd.name);
    }

    let record = await GuildSettings.findOne({ guildId });
    if (!record) record = await GuildSettings.create({ guildId });

    const enabled = {};
    availableCommands.forEach((c) => {
      const val = record.commands?.get(c);
      enabled[c] = val === undefined ? true : !!val;
    });

    return res.json({ availableCommands, enabled });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch commands" });
  }
});

router.put("/guild/:guildId/commands", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({ command: z.string(), enabled: z.boolean() }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const { command, enabled } = parsed.data;
    const record = await GuildSettings.findOneAndUpdate(
      { guildId },
      { $set: { [`commands.${command}`]: enabled } },
      { new: true, upsert: true }
    );
    await createAudit(req, guildId, "toggle_command", { command, enabled });
    return res.json({ ok: true, enabled: record.commands?.get(command) ?? enabled });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update command" });
  }
});

router.get("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    const items = await Automation.find({ guildId }).lean();
    return res.json({ items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch automations" });
  }
});

router.post("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z
    .object({
      name: z.string().min(1),
      schedule: z.string().min(1),
      action: z.string().min(1),
      params: z.record(z.any()).optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const data = parsed.data;
    const automation = await Automation.create({ guildId, ...data });
    await createAudit(req, guildId, "create_automation", { id: automation._id.toString(), ...data });
    return res.json({ ok: true, item: automation });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create automation" });
  }
});

router.delete("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  const automationId = req.params.automationId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    await Automation.deleteOne({ _id: automationId, guildId });
    await createAudit(req, guildId, "delete_automation", { id: automationId });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete automation" });
  }
});

// -------------------------- Logs & Analytics Endpoints --------------------------

router.get("/logs", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(5, Number(req.query.limit || 10)));
  const guildId = req.query.guildId;
  const skip = (page - 1) * limit;
  const filter = { discordId };
  if (guildId) filter.guildId = guildId;

  try {
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.json({ page, limit, total, items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.get("/analytics", CheckAuth, async (req, res) => {
  try {
    const discordId = req.session.user.id;
    const guilds = req.userInfos?.guilds || [];
    const guildCount = guilds.filter((g) => g.admin).length;
    const settingsChanges = await AuditLog.countDocuments({ discordId, action: "update_settings" });
    const automationsCount = await Automation.countDocuments({ guildId: { $in: guilds.map((g) => g.id) } });
    const modulesChanged = await AuditLog.countDocuments({ discordId, action: "toggle_module" });
    const commandsChanged = await AuditLog.countDocuments({ discordId, action: "toggle_command" });

    return res.json({ guildCount, settingsChanges, automationsCount, modulesChanged, commandsChanged });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to compute analytics" });
  }
});

// -------------------------- User Preferences & Billing Endpoints --------------------------

router.get("/user/preferences", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    let prefs = await UserPreferences.findOne({ discordId });
    if (!prefs) prefs = await UserPreferences.create({ discordId });
    return res.json({ preferences: prefs });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.put("/user/preferences", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;

  const schema = z
    .object({
      defaultGuild: z.string().optional().nullable(),
      emailExport: z.boolean().optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const update = parsed.data;
    const prefs = await UserPreferences.findOneAndUpdate(
      { discordId },
      { $set: update },
      { new: true, upsert: true }
    );
    await createAudit(req, null, "update_preferences", update);
    return res.json({ ok: true, preferences: prefs });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

router.get("/billing", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  try {
    let prefs = await UserPreferences.findOne({ discordId });
    if (!prefs) prefs = await UserPreferences.create({ discordId });
    return res.json({ plan: prefs.plan || "free" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch billing info" });
  }
});

// -------------------------- News Endpoints --------------------------

router.get("/news", CheckAuth, async (req, res) => {
  try {
    const posts = await NewsPost.find().sort({ createdAt: -1 }).lean();
    return res.json({ posts });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch news" });
  }
});

function isAdmin(discordId) {
  const admins = process.env.DASHBOARD_ADMIN_IDS || "";
  const list = admins.split(/[,\\s]+/).filter(Boolean);
  return list.includes(discordId);
}

router.post("/news", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  if (!isAdmin(discordId)) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({ title: z.string().min(1), content: z.string().min(1) }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const post = await NewsPost.create({ ...parsed.data, authorId: discordId });
    await createAudit(req, null, "create_news", { id: post._id.toString() });
    return res.json({ ok: true, post });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create news post" });
  }
});

router.put("/news/:postId", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  if (!isAdmin(discordId)) return res.status(403).json({ error: "Forbidden" });

  const postId = req.params.postId;
  const schema = z.object({ title: z.string().optional(), content: z.string().optional() }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const update = parsed.data;
    const post = await NewsPost.findOneAndUpdate({ _id: postId }, { $set: update }, { new: true });
    if (!post) return res.status(404).json({ error: "Not found" });

    await createAudit(req, null, "update_news", { id: postId, ...update });
    return res.json({ ok: true, post });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update news post" });
  }
});

router.delete("/news/:postId", CheckAuth, async (req, res) => {
  const discordId = req.session.user.id;
  if (!isAdmin(discordId)) return res.status(403).json({ error: "Forbidden" });

  const postId = req.params.postId;
  try {
    await NewsPost.deleteOne({ _id: postId });
    await createAudit(req, null, "delete_news", { id: postId });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete news post" });
  }
});

module.exports = router;
