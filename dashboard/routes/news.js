const express = require("express");
const CheckAuth = require("../auth/CheckAuth");

const router = express.Router();

// News route
// Shows a simple placeholder page until real announcements are implemented.
router.get("/", CheckAuth, (req, res) => {
  res.render("app/placeholder", {
    user: req.userInfos,
    pageTitle: "News",
    heading: "News",
    content: "There are currently no news posts. Check back later!",
  });
});

module.exports = router;