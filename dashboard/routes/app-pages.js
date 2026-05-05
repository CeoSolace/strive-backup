const express = require("express");
const utils = require("../utils");
const router = express.Router();

function page(req, res, view, title, props = {}) {
  return res.render(view, {
    pageTitle: title,
    user: req.userInfos || null,
    client: req.client || null,
    sessionUser: req.session?.user || null,
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
    } catch (e) {}
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

// Keep automations but only as selector (no broken backend assumptions)
router.get("/automations", async (req, res) => {
  return page(req, res, "app/automations", "Automations");
});

router.get("/logs", async (req, res) => {
  const AuditLog = require("../models/AuditLog");
  const discordId = req.session.user?.id;
  const pageNum = Math.max(1, Number(req.query.page || 1));
  const limit = 20;
  const skip = (pageNum - 1) * limit;

  const filter = { discordId };
  if (req.query.guildId) filter.guildId = req.query.guildId;

  let items = [];
  try {
    items = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  } catch (e) {}

  return page(req, res, "app/logs", "Logs", { logs: { items } });
});

// Simplified analytics (remove fragile Automation dependency)
router.get("/analytics", async (req, res) => {
  const AuditLog = require("../models/AuditLog");
  const discordId = req.session.user?.id;

  const analytics = {
    settingsChanges: 0,
    modulesChanged: 0,
    commandsChanged: 0,
  };

  try {
    analytics.settingsChanges = await AuditLog.countDocuments({ discordId, action: "update_settings" });
    analytics.modulesChanged = await AuditLog.countDocuments({ discordId, action: "toggle_module" });
    analytics.commandsChanged = await AuditLog.countDocuments({ discordId, action: "toggle_command" });
  } catch (e) {}

  return page(req, res, "app/analytics", "Analytics", { analytics });
});

router.get("/account/profile", async (req, res) => {
  return page(req, res, "app/account-profile", "Account · Profile");
});

router.get("/account/security", async (req, res) => {
  return page(req, res, "app/account-security", "Account · Security");
});

router.get("/privacy-consent", async (req, res) => {
  return page(req, res, "app/privacy-consent", "Privacy & Consent");
});

router.get("/settings", async (req, res) => {
  return page(req, res, "app/settings", "Settings");
});

router.get("/billing", async (req, res) => {
  return page(req, res, "app/billing", "Billing");
});

module.exports = router;
