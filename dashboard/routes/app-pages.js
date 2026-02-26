const express = require("express");
const utils = require("../utils");

const router = express.Router();

function page(res, view, title, props = {}) {
  return res.render(view, {
    pageTitle: title,
    ...props,
  });
}

router.get(["/", "/overview"], async (req, res) => {
  return page(res, "app/overview", "Overview", { user: req.userInfos });
});

router.get("/servers", async (req, res) => {
  // Allow filtering servers via ?q query
  const query = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : "";
  let userInfos = req.userInfos;
  if (query) {
    try {
      // Re-fetch user to apply search filter to displayedGuilds
      userInfos = await utils.fetchUser(req.user, req.client, query);
    } catch (e) {
      // fall back to existing userInfos on error
    }
  }
  return page(res, "app/servers", "Servers", {
    user: userInfos,
    search: query,
  });
});

// Modules page: list guilds and link to manage page. No placeholders.
router.get("/modules", async (req, res) => {
  return page(res, "app/modules", "Modules", {
    user: req.userInfos,
  });
});

// Commands page: list guilds and link to manage page. No placeholders.
router.get("/commands", async (req, res) => {
  return page(res, "app/commands", "Commands", {
    user: req.userInfos,
  });
});

// Automations page: list guilds and link to manage page. No placeholders.
router.get("/automations", async (req, res) => {
  return page(res, "app/automations", "Automations", {
    user: req.userInfos,
  });
});

// Logs page: display audit logs for the current user. Supports optional pagination via query params.
router.get("/logs", async (req, res) => {
  const AuditLog = require("../models/AuditLog");
  const discordId = req.session.user?.id;
  const pageNum = Math.max(1, Number(req.query.page || 1));
  const limit = 20;
  const skip = (pageNum - 1) * limit;
  const filter = { discordId };
  if (req.query.guildId) {
    filter.guildId = req.query.guildId;
  }
  let logs = { items: [] };
  try {
    const items = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    logs.items = items;
  } catch (e) {
    console.error(e);
  }
  return page(res, "app/logs", "Logs", {
    user: req.userInfos,
    logs,
  });
});

// Analytics page: compute simple analytics for the user.
router.get("/analytics", async (req, res) => {
  const AuditLog = require("../models/AuditLog");
  const Automation = require("../models/Automation");
  const discordId = req.session.user?.id;
  const guilds = req.userInfos?.guilds || [];
  const adminGuilds = guilds.filter((g) => g.admin);
  const guildIds = adminGuilds.map((g) => g.id);
  const analytics = {
    guildCount: adminGuilds.length,
    settingsChanges: 0,
    automationsCount: 0,
    modulesChanged: 0,
    commandsChanged: 0,
  };
  try {
    analytics.settingsChanges = await AuditLog.countDocuments({ discordId, action: "update_settings" });
    analytics.modulesChanged = await AuditLog.countDocuments({ discordId, action: "toggle_module" });
    analytics.commandsChanged = await AuditLog.countDocuments({ discordId, action: "toggle_command" });
    analytics.automationsCount = await Automation.countDocuments({ guildId: { $in: guildIds } });
  } catch (e) {
    console.error(e);
  }
  return page(res, "app/analytics", "Analytics", {
    user: req.userInfos,
    analytics,
  });
});

router.get("/account/profile", async (req, res) => {
  return page(res, "app/account-profile", "Account · Profile", { user: req.userInfos });
});

router.get("/account/security", async (req, res) => {
  return page(res, "app/account-security", "Account · Security", { user: req.userInfos });
});

router.get("/privacy-consent", async (req, res) => {
  return page(res, "app/privacy-consent", "Privacy & Consent", { user: req.userInfos });
});

router.get("/settings", async (req, res) => {
  return page(res, "app/settings", "Settings", {
    user: req.userInfos,
  });
});

router.get("/billing", async (req, res) => {
  return page(res, "app/billing", "Billing", {
    user: req.userInfos,
  });
});

module.exports = router;
