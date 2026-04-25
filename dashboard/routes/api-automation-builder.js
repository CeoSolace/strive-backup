const express = require("express");
const { z } = require("zod");

const CheckAuth = require("../auth/CheckAuth");
const Automation = require("../models/Automation");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

const BLOCKS = {
  1: { name: "Send message", key: "send_message" },
  2: { name: "Wait", key: "wait" },
  3: { name: "Add role", key: "add_role" },
  4: { name: "Remove role", key: "remove_role" },
  5: { name: "Create channel", key: "create_channel" },
  6: { name: "Delete channel", key: "delete_channel" },
  7: { name: "Lock channel", key: "lock_channel" },
  8: { name: "Unlock channel", key: "unlock_channel" },
  9: { name: "Kick member", key: "kick_member" },
  10: { name: "Ban member", key: "ban_member" },
  11: { name: "Send webhook", key: "send_webhook" },
  12: { name: "If member has role", key: "if_has_role" },
};

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
  const blocks = (item.f || []).map((id, i) => ({
    id,
    label: BLOCKS[id]?.name || `Block ${id}`,
    key: BLOCKS[id]?.key || "custom",
    params: item.p?.[i] || {},
  }));

  return {
    _id: item._id,
    guildId: item.guildId,
    name: item.name,
    enabled: item.enabled,
    f: item.f || [],
    p: item.p || [],
    blocks,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

router.get("/guild/:guildId/automation-blocks", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });
  return res.json({ blocks: BLOCKS });
});

router.get("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    const items = await Automation.find({ guildId }).sort({ updatedAt: -1 }).lean();
    return res.json({ items: items.map(normalize), blocks: BLOCKS });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch automations" });
  }
});

router.post("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    name: z.string().min(1).max(80),
    enabled: z.boolean().optional(),
    f: z.array(z.number().int().min(1).max(99)).min(1).max(9),
    p: z.array(z.record(z.any())).max(9).optional(),
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
      enabled: data.enabled !== false,
      f: data.f,
      p: params.slice(0, data.f.length),
    });

    await audit(req, guildId, "create_block_automation", {
      id: automation._id.toString(),
      name: data.name,
      blocks: data.f,
    });

    return res.json({ ok: true, item: normalize(automation.toObject()) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create automation" });
  }
});

router.put("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    name: z.string().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    f: z.array(z.number().int().min(1).max(99)).min(1).max(9).optional(),
    p: z.array(z.record(z.any())).max(9).optional(),
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid automation", details: parsed.error.flatten() });

  try {
    const update = { ...parsed.data };
    if (update.f) {
      const params = update.p || [];
      while (params.length < update.f.length) params.push({});
      update.p = params.slice(0, update.f.length);
    }

    const item = await Automation.findOneAndUpdate(
      { _id: req.params.automationId, guildId },
      { $set: update },
      { new: true }
    ).lean();

    if (!item) return res.status(404).json({ error: "Automation not found" });
    await audit(req, guildId, "update_block_automation", { id: req.params.automationId });
    return res.json({ ok: true, item: normalize(item) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update automation" });
  }
});

router.delete("/guild/:guildId/automations/:automationId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  try {
    await Automation.deleteOne({ _id: req.params.automationId, guildId });
    await audit(req, guildId, "delete_automation", { id: req.params.automationId });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete automation" });
  }
});

module.exports = router;
