const express = require("express");
const { z } = require("zod");

const CheckAuth = require("../auth/CheckAuth");
const Automation = require("../models/Automation");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

async function ensureGuildAdmin(req, guildId) {
  const guilds = req.userInfos?.guilds || [];
  const guild = guilds.find((g) => g.id === guildId);
  return !!(guild && guild.admin);
}

async function audit(req, guildId, action, details = {}) {
  try {
    const discordId = req.session.user.id;
    await AuditLog.create({ discordId, guildId, action, details, actor: discordId });
  } catch (e) {
    console.error("Automation audit failed", e);
  }
}

function normalize(item) {
  const obj = item.toObject ? item.toObject() : item;
  return {
    _id: obj._id,
    guildId: obj.guildId,
    name: obj.name,
    enabled: obj.enabled !== false,
    f: obj.f || [],
    p: obj.p || [],
    c: obj.c || [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    blocks: (obj.f || []).map((id, i) => ({ id, params: obj.p?.[i] || {} })),
  };
}

router.get("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    const items = await Automation.find({ guildId }).sort({ updatedAt: -1 }).lean();
    return res.json({ ok: true, items: items.map(normalize) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load features" });
  }
});

router.post("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    name: z.string().min(1).max(80),
    f: z.array(z.string()).min(1).max(80),
    p: z.array(z.record(z.any())).max(80).optional(),
    c: z.array(z.record(z.any())).max(160).optional(),
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid automation", details: parsed.error.flatten() });

  try {
    const data = parsed.data;
    const params = data.p || [];
    while (params.length < data.f.length) params.push({});

    const automation = await Automation.create({
      guildId,
      name: data.name,
      enabled: true,
      f: data.f,
      p: params.slice(0, data.f.length),
      c: data.c || [],
    });

    await audit(req, guildId, "create_feature", { id: automation._id.toString(), name: data.name, blocks: data.f });
    return res.json({ ok: true, item: normalize(automation) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create feature" });
  }
});

router.delete("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    await Automation.deleteOne({ _id: req.params.automationId, guildId });
    await audit(req, guildId, "delete_feature", { id: req.params.automationId });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete feature" });
  }
});

module.exports = router;
