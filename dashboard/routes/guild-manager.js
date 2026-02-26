const express = require("express");
const CheckAuth = require("../auth/CheckAuth");

const router = express.Router();

// Guild manager home page
// Requires authentication and renders a placeholder page for managing server settings.
router.get("/", CheckAuth, (req, res) => {
  res.render("app/placeholder", {
    user: req.userInfos,
    pageTitle: "Guild Manager",
    heading: "Guild Manager",
    content: "Guild management tools will appear here soon.",
  });
});

module.exports = router;