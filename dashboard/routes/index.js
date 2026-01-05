const express = require("express"),
  CheckAuth = require("../auth/CheckAuth"),
  router = express.Router();

// Home
router.get("/", CheckAuth, async (req, res) => {
  res.render("home", {
    user: req.userInfos,
    currentURL: `${req.client.config.DASHBOARD.baseURL}${req.originalUrl}`,
  });
});

// Selector
router.get("/selector", CheckAuth, async (req, res) => {
  res.render("selector", {
    user: req.userInfos,
    currentURL: `${req.client.config.DASHBOARD.baseURL}${req.originalUrl}`,
  });
});

// Terms of Service
router.get("/tos", CheckAuth, async (req, res) => {
  res.render("tos", {
    user: req.userInfos,
    currentURL: `${req.client.config.DASHBOARD.baseURL}${req.originalUrl}`,
    tosUpdatedAt: "January 5, 2026",
  });
});

// Privacy Policy
router.get("/privacy", CheckAuth, async (req, res) => {
  res.render("privacy", {
    user: req.userInfos,
    currentURL: `${req.client.config.DASHBOARD.baseURL}${req.originalUrl}`,
    privacyUpdatedAt: "January 5, 2026",
  });
});

module.exports = router;
