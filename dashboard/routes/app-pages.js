const express = require("express");

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
  return page(res, "app/placeholder", "Servers", {
    user: req.userInfos,
    placeholder: {
      title: "Servers",
      description: "Pick a server to manage settings, modules, and commands.",
      icon: "server",
    },
  });
});

router.get("/modules", async (req, res) => {
  return page(res, "app/placeholder", "Modules", {
    user: req.userInfos,
    placeholder: {
      title: "Modules",
      description: "Enable and configure Bright modules per server.",
      icon: "puzzle",
    },
  });
});

router.get("/commands", async (req, res) => {
  return page(res, "app/placeholder", "Commands", {
    user: req.userInfos,
    placeholder: {
      title: "Commands",
      description: "Browse and customize command behavior.",
      icon: "terminal",
    },
  });
});

router.get("/automations", async (req, res) => {
  return page(res, "app/placeholder", "Automations", {
    user: req.userInfos,
    placeholder: {
      title: "Automations",
      description: "Create automations and scheduled actions.",
      icon: "zap",
    },
  });
});

router.get("/logs", async (req, res) => {
  return page(res, "app/placeholder", "Logs", {
    user: req.userInfos,
    placeholder: {
      title: "Logs",
      description: "Audit bot activity and configuration changes.",
      icon: "scroll",
    },
  });
});

router.get("/analytics", async (req, res) => {
  return page(res, "app/placeholder", "Analytics", {
    user: req.userInfos,
    placeholder: {
      title: "Analytics",
      description: "Usage insights and operational analytics.",
      icon: "chart",
    },
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
  return page(res, "app/placeholder", "Settings", {
    user: req.userInfos,
    placeholder: {
      title: "Settings",
      description: "Dashboard preferences and integrations.",
      icon: "settings",
    },
  });
});

router.get("/billing", async (req, res) => {
  return page(res, "app/placeholder", "Billing", {
    user: req.userInfos,
    placeholder: {
      title: "Billing",
      description: "Billing is coming soon.",
      icon: "creditcard",
    },
  });
});

module.exports = router;
