const express = require("express");
const utils = require("../utils");

const router = express.Router();

function page(req, res, view, title, props = {}) {
  return res.render(view, {
    pageTitle: title,
    user: req.userInfos || null,
    botClient: req.client || null,
    sessionUser: req.session?.user || null,
    activePath: req.originalUrl || req.path || "",
    ...props,
  });
}

router.get(["/", "/overview"], async (req, res) => {
  return page(req, res, "app/overview", "Overview");
});

router.get("/servers", async (req, res) => {
  const query = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : "";

  let userInfos = req.userInfos;

  if (query) {
    try {
      userInfos = await utils.fetchUser(req.user, req.client, query);
    } catch (e) {
      console.error("Failed to refetch user for server search:", e);
    }
  }

  // 🔥 FILTER ONLY MANAGEABLE SERVERS
  if (userInfos && Array.isArray(userInfos.guilds)) {
    userInfos.guilds = userInfos.guilds.filter(g => g && g.admin);
  }

  return page(req, res, "app/servers", "Servers", {
    user: userInfos,
    search: query,
  });
});

router.get("/modules", async (req, res) => {
  return page(req, res, "app/modules", "Modules");
});

router.get("/commands", async (req, res) => {
  return page(req, res, "app/commands", "Commands");
});

router.get("/automations", async (req, res) => {
  return page(req, res, "app/automations", "Automations");
});

router.get("/logs", async (req, res) => {
  const AuditLog = require("../models/AuditLog");
  const discordId = req.session?.user?.id;

  const pageNum = Math.max(1, Number(req.query.page || 1));
  const limit = 20;
  const skip = (pageNum - 1) * limit;

  const allGuilds = Array.isArray(req.userInfos?.guilds) ? req.userInfos.guilds : [];
  const guilds = allGuilds.filter((g) => g && g.admin);

  const filter = {};
  if (discordId) filter.discordId = discordId;
  if (req.query.guildId) filter.guildId = req.query.guildId;

  const logs = { items: [], page: pageNum, hasPrev: pageNum > 1, hasNext: false };

  try {
    const items = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .lean();

    logs.hasNext = items.length > limit;
    logs.items = items.slice(0, limit);
  } catch (e) {
    console.error("Failed to load audit logs:", e);
  }

  return page(req, res, "app/logs", "Logs", {
    logs,
    guilds,
    selectedGuildId: typeof req.query.guildId === "string" ? req.query.guildId : "",
  });
});

module.exports = router;
