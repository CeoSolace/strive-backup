const DashboardUser = require("../models/DashboardUser");

module.exports = async (req, res, next) => {
  if (!req.session.user) {
    const redirectURL = req.originalUrl.includes("login") || req.originalUrl === "/" ? "/selector" : req.originalUrl;
    const state = Math.random().toString(36).substring(5);
    req.client.states[state] = redirectURL;
    return res.redirect(`/api/login?state=${state}`);
  }

  // Session invalidation strategy: sessionVersion gate
  try {
    const discordId = req.session.user.id;
    const user = await DashboardUser.findOne({ discordId }).lean();
    if (!user) {
      // Create minimal record (rare: DB wiped)
      const created = await DashboardUser.create({
        discordId,
        username: req.session.user.username,
        avatar: req.session.user.avatar,
        discriminator: req.session.user.discriminator,
      });
      req.session.sessionVersion = created.sessionVersion;
      return next();
    }

    const sessionVersion = req.session.sessionVersion;
    if (!sessionVersion || Number(sessionVersion) !== Number(user.sessionVersion)) {
      // Kill session and restart auth
      req.session.destroy(() => {
        const state = Math.random().toString(36).substring(5);
        req.client.states[state] = req.originalUrl || "/app";
        return res.redirect(`/api/login?state=${state}`);
      });
      return;
    }

    return next();
  } catch (e) {
    // Fail closed
    req.session.destroy(() => res.redirect("/api/login?state=error"));
  }
};
