const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const CheckAuth = require("../auth/CheckAuth");

function loadPatchNotes() {
  try {
    const file = path.join(__dirname, "..", "data", "patchNotes.json");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.get("/", CheckAuth, (req, res) => {
  const patchNotes = loadPatchNotes();

  res.render("news", {
    user: req.userInfos,
    currentURL: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    patchNotes,
  });
});

module.exports = router;
