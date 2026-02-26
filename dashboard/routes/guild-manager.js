const express = require("express");
const CheckAuth = require("../auth/CheckAuth");

const router = express.Router();

// Guild manager home page
// Redirect to servers selector
router.get("/", CheckAuth, (req, res) => {
  return res.redirect("/app/servers");
});

// Guild-specific management page
router.get("/:guildId", CheckAuth, async (req, res) => {
  const guildId = req.params.guildId;
  const user = req.userInfos;
  // ensure userInfos has guilds
  const guilds = user?.guilds || [];
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || !guild.admin) {
    return res.status(403).render("404", { user });
  }
  // Determine which tab to display
  const tab = req.query.tab || '';
  return res.render("app/manage", {
    user,
    guild,
    tab,
    pageTitle: `${guild.name} · Manage`,
  });
});

module.exports = router;
