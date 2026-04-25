// dashboard/app.js
const path = require("path");

const config = require("@root/config");
const utils = require("./utils");
const CheckAuth = require("./auth/CheckAuth");

module.exports.launch = async (client) => {
  const express = require("express");
  const session = require("express-session");
  const MongoStore = require("connect-mongo");

  const rateLimit = require("express-rate-limit");
  const cookieParser = require("cookie-parser");
  const csrf = require("csurf");

  const mongoose = require("@src/database/mongoose");

  const app = express();

  const mainRouter = require("./routes/index");
  const appPagesRouter = require("./routes/app-pages");
  const discordAuthRouter = require("./routes/discord");
  const apiRouter = require("./routes/api");
  const automationBuilderRouter = require("./routes/api-automation-builder");

  let logoutRouter, guildManagerRouter, newsRouter, healthRouter;
  try { logoutRouter = require("./routes/logout"); } catch { logoutRouter = null; }
  try { guildManagerRouter = require("./routes/guild-manager"); } catch { guildManagerRouter = null; }
  try { newsRouter = require("./routes/news"); } catch { newsRouter = null; }
  try { healthRouter = require("./routes/health"); } catch { healthRouter = null; }

  client.states = {};
  client.config = config;

  const db = await mongoose.initializeMongoose();
  const port = process.env.PORT || config.DASHBOARD.port;

  app.set("trust proxy", 1);

  app.use("/api", rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded" },
    skip: (req) => req.path.startsWith("/login") || req.path.startsWith("/auth/callback"),
  }));

  try {
    const ejsMate = require("ejs-mate");
    app.engine("ejs", ejsMate);
  } catch {}

  app
    .use(express.json({ limit: "1mb" }))
    .use(express.urlencoded({ extended: true }))
    .use(cookieParser())
    .engine("html", require("ejs").renderFile)
    .set("view engine", "ejs")
    .use(express.static(path.join(__dirname, "/public"), { maxAge: "1h" }))
    .set("views", path.join(__dirname, "/views"))
    .use(session({
      secret: process.env.SESSION_PASSWORD || "CHANGE_ME_SESSION_PASSWORD",
      cookie: {
        maxAge: 336 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      name: "djs_connection_cookie",
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: db.getClient(),
        dbName: db.name,
        collectionName: "sessions",
        stringify: false,
        autoRemove: "interval",
        autoRemoveInterval: 10,
      }),
    }))
    .use(async (req, res, next) => {
      req.user = req.session.user;
      req.client = client;
      next();
    });

  app.use(async (req, res, next) => {
    res.locals.baseURL = client.config.DASHBOARD.baseURL;
    res.locals.currentURL = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    res.locals.brand = { name: "Bright", byline: "built by TheCeoTyro" };

    if (req.user && req.url !== "/") {
      try {
        req.userInfos = await utils.fetchUser(req.user, req.client);
      } catch {
        req.userInfos = null;
      }
    }

    next();
  });

  const csrfProtection = csrf({ cookie: false });

  if (healthRouter) app.get("/health", healthRouter(client, db));

  app.use("/api", discordAuthRouter);

  // CSRF token endpoint must run through csurf first so req.csrfToken exists.
  // GET is safe and does not require an incoming token, but it creates one for later POST/PUT/DELETE requests.
  app.get("/api/csrf", csrfProtection, (req, res) => {
    return res.json({ csrfToken: req.csrfToken() });
  });

  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (req.path.startsWith("/login") || req.path.startsWith("/auth/callback")) return next();
    return csrfProtection(req, res, next);
  });

  app.use("/api", automationBuilderRouter);
  app.use("/api", apiRouter);

  // Return JSON for CSRF errors instead of crashing through the HTML error pages/log spam.
  app.use("/api", (err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ error: "Invalid CSRF token. Refresh the page and try again." });
    }
    return next(err);
  });

  if (logoutRouter) app.use("/logout", logoutRouter);
  if (guildManagerRouter) app.use("/manage", guildManagerRouter);
  if (newsRouter) app.use("/news", newsRouter);

  app.use("/app", CheckAuth, appPagesRouter);
  app.use("/", mainRouter);

  app.use(CheckAuth, (req, res) => {
    res.status(404).render("404", { user: req.userInfos });
  });

  app.use(CheckAuth, (err, req, res, next) => {
    console.error(err.stack);
    if (!req.user) return res.redirect("/");
    res.status(500).render("500", { user: req.userInfos });
  });

  app.listen(port, "0.0.0.0", () => {
    client.logger.success(`Dashboard is listening on port ${port}`);
  });
};