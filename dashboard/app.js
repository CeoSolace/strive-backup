// dashboard/app.js
const path = require("path");

const config = require("@root/config");
const utils = require("./utils");
const CheckAuth = require("./auth/CheckAuth");

module.exports.launch = async (client) => {
  const express = require("express");
  const session = require("express-session");
  const MongoStore = require("connect-mongo");

  const helmet = require("helmet");
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

  app.use("/api", rateLimit({ windowMs: 60000, max: 120 }));

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
    .use(express.static(path.join(__dirname, "/public")))
    .set("views", path.join(__dirname, "/views"))
    .use(session({ secret: "CHANGE_ME", resave: false, saveUninitialized: false }))
    .use(async (req, res, next) => {
      req.user = req.session.user;
      req.client = client;
      next();
    });

  const csrfProtection = csrf();

  app.use("/api", discordAuthRouter);

  app.use("/api", csrfProtection, automationBuilderRouter);
  app.use("/api", csrfProtection, apiRouter);

  if (logoutRouter) app.use("/logout", logoutRouter);
  if (guildManagerRouter) app.use("/manage", guildManagerRouter);

  app.use("/app", CheckAuth, appPagesRouter);
  app.use("/", mainRouter);

  app.listen(port, () => {
    client.logger.success(`Dashboard running on ${port}`);
  });
};