// dashboard/routes/automations-api.js
const express = require("express");
const { z } = require("zod");
const CheckAuth = require("../auth/CheckAuth");
const Automation = require("../models/Automation");
const AuditLog = require("../models/AuditLog");
const { FUNCTIONS, validatePlan, BY_ID } = require("../automation/catalog");

const router = express.Router();

async function ensureGuildAdmin(req, guildId) {
  const guilds = req.userInfos?.guilds || [];
  const guild = guilds.find((g) => g.id === guildId);
  return !!(guild && guild.admin);
}

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

const MAX_FUNCS = 9;
const MIN_ID = 1;
const MAX_ID = 18;

// Keep DB tiny
const MAX_TEXT = 1400;
const MAX_SCHEDULE = 80;

function normalizeParamsForFn(fnId, params) {
  const def = BY_ID.get(fnId);
  const allowed = new Set(def ? def.params : []);
  const out = {};
  if (!params || typeof params !== "object") return out;

  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) continue;
    const v = params[k];

    if (k === "t") {
      if (typeof v !== "string") continue;
      out.t = v.slice(0, MAX_TEXT);
    } else if (k === "x") {
      if (typeof v !== "string") continue;
      out.x = v.slice(0, 200);
    } else if (k === "k") {
      if (typeof v !== "string") continue;
      out.k = v.slice(0, MAX_SCHEDULE);
    } else if (k === "s") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 86400) continue;
      out.s = Math.floor(n);
    } else if (k === "c" || k === "r" || k === "b" || k === "e") {
      if (typeof v !== "string") continue;
      out[k] = v.slice(0, 64);
    }
  }

  return out;
}

function validateAndNormalizePlan(f, p) {
  const funcIds = f.map((n) => Number(n)).filter((n) => Number.isInteger(n));
  if (funcIds.length < 1 || funcIds.length > MAX_FUNCS) throw new Error("Invalid function list length");
  for (const id of funcIds) {
    if (id < MIN_ID || id > MAX_ID) throw new Error("Invalid function id");
  }

  const { triggers, actions } = validatePlan(funcIds);
  if (triggers !== 1) throw new Error("Automation must have exactly 1 trigger");
  if (actions < 1) throw new Error("Automation must have at least 1 action");

  const paramsArr = Array.isArray(p) ? p : [];
  const normParams = funcIds.map((id, idx) => normalizeParamsForFn(id, paramsArr[idx]));
  return { f: funcIds, p: normParams };
}

// UI uses this to populate dropdowns
router.get("/automation/catalog", CheckAuth, async (req, res) => {
  return res.json({ functions: FUNCTIONS, maxFunctions: MAX_FUNCS });
});

router.get("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const items = await Automation.find({ guildId })
    .select({ name: 1, enabled: 1, f: 1, p: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();

  return res.json({ items });
});

router.post("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z
    .object({
      name: z.string().min(1).max(80),
      enabled: z.boolean().optional(),
      f: z.array(z.number().int()).min(1).max(MAX_FUNCS),
      p: z.array(z.any()).optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const { name, enabled, f, p } = parsed.data;
    const plan = validateAndNormalizePlan(f, p);
    const doc = await Automation.create({ guildId, name, enabled: enabled ?? true, f: plan.f, p: plan.p });

    await createAudit(req, guildId, "create_automation", { id: doc._id.toString(), name, f: plan.f });
    return res.json({ ok: true, item: doc });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Failed to create automation" });
  }
});

router.put("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  const automationId = req.params.automationId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z
    .object({
      name: z.string().min(1).max(80).optional(),
      enabled: z.boolean().optional(),
      f: z.array(z.number().int()).min(1).max(MAX_FUNCS).optional(),
      p: z.array(z.any()).optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  try {
    const update = {};
    if (typeof parsed.data.name === "string") update.name = parsed.data.name;
    if (typeof parsed.data.enabled === "boolean") update.enabled = parsed.data.enabled;

    if (parsed.data.f) {
      const plan = validateAndNormalizePlan(parsed.data.f, parsed.data.p || []);
      update.f = plan.f;
      update.p = plan.p;
    }

    const doc = await Automation.findOneAndUpdate({ _id: automationId, guildId }, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ error: "Not found" });

    await createAudit(req, guildId, "update_automation", { id: automationId, update: Object.keys(update) });
    return res.json({ ok: true, item: doc });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Failed to update automation" });
  }
});

router.delete("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  const automationId = req.params.automationId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  await Automation.deleteOne({ _id: automationId, guildId });
  await createAudit(req, guildId, "delete_automation", { id: automationId });

  return res.json({ ok: true });
});

module.exports = router;
