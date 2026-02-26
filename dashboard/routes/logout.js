const express = require("express");
const router = express.Router();

// Logout route: destroy the current session and redirect to the home page
router.get("/", (req, res) => {
  if (req.session) {
    // Destroy the session to sign the user out
    req.session.destroy(() => {
      res.redirect("/");
    });
  } else {
    res.redirect("/");
  }
});

module.exports = router;