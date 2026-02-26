const express = require("express");
const CheckAuth = require("../auth/CheckAuth");
const NewsPost = require("../models/NewsPost");

const router = express.Router();

// Determine whether the current user is an admin based on env variable
function isAdmin(discordId) {
  const admins = process.env.DASHBOARD_ADMIN_IDS || "";
  const list = admins.split(/[\s,]+/).filter(Boolean);
  return list.includes(discordId);
}

// News page: list posts and show admin controls if applicable
router.get("/", CheckAuth, async (req, res) => {
  let posts = [];
  try {
    posts = await NewsPost.find().sort({ createdAt: -1 }).lean();
  } catch (e) {
    console.error(e);
  }
  const discordId = req.session.user?.id;
  const admin = isAdmin(discordId);
  res.render("app/news", {
    user: req.userInfos,
    pageTitle: "News",
    posts,
    isAdmin: admin,
  });
});

module.exports = router;
