const express = require("express");
const { z } = require("zod");

const CheckAuth = require("../auth/CheckAuth");
const Automation = require("../models/Automation");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

const BLOCKS = {
  message_trigger: { name: "When message is sent", key: "trigger_message" },
  send_message: { name: "Send message", key: "send_message" },
  wait: { name: "Wait", key: "wait" },
  add_role: { name: "Add role", key: "add_role" },
  remove_role: { name: "Remove role", key: "remove_role" },
  if_role: { name: "If member has role", key: "if_has_role" },
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
    label: BLOCKS[id]?.name || id,
    key: BLOCKS[id]?.key || "custom",
    params: item.p?.[i] || {},
  }));

  return { ...item, blocks };
}

router.post("/guild/:guildId/automations", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  if (!(await ensureGuildAdmin(req, guildId))) return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    name: z.string().min(1).max(80),
    f: z.array(z.string()).min(1),
    p: z.array(z.record(z.any())).optional(),
    c: z.array(z.record(z.any())).optional(),
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid automation" });

  try {
    const data = parsed.data;

    const automation = await Automation.create({
      guildId,
      name: data.name,
      f: data.f,
      p: data.p || [],
      c: data.c || []
    });

    await audit(req, guildId, "create_feature", { name: data.name });

    return res.json({ ok: true, item: normalize(automation.toObject()) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create" });
  }
});

module.exports = router;
