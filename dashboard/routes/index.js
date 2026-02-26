const express = require("express");
const CheckAuth = require("../auth/CheckAuth");

const router = express.Router();

// Home: send authenticated users into the app
router.get("/", async (req, res) => {
  if (req.session.user) return res.redirect("/app/overview");
  return res.redirect("/api/login?state=no");
});

// Selector (legacy; keep it working)
router.get("/selector", CheckAuth, async (req, res) => {
  res.redirect("/app/servers");
});

// Terms of Service
router.get("/tos", CheckAuth, async (req, res) => {
  res.render("legal", {
    user: req.userInfos,
    pageTitle: "Terms of Service",
    heading: "Terms of Service",
    updatedAt: "January 5, 2026",
    content: "See repository docs for full Terms of Service (placeholder).",
  });
});

// Privacy Policy
router.get("/privacy", CheckAuth, async (req, res) => {
  res.render("legal", {
    user: req.userInfos,
    pageTitle: "Privacy Policy",
    heading: "Privacy Policy",
    updatedAt: "January 5, 2026",
    content: "See repository PRIVACY.md for full policy (placeholder).",
  });
});

module.exports = router;
