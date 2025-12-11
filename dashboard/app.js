const config = require("@root/config"),
  utils = require("./utils"),
  CheckAuth = require("./auth/CheckAuth");

module.exports.launch = async (client) => {
  const express = require("express"),
    session = require("express-session"),
    MongoStore = require("connect-mongo"),
    mongoose = require("@src/database/mongoose"),
    path = require("path"),
    app = express();

  const mainRouter = require("./routes/index"),
    discordAPIRouter = require("./routes/discord"),
    logoutRouter = require("./routes/logout"),
    guildManagerRouter = require("./routes/guild-manager");

  client.states = {};
  client.config = config;

  const db = await mongoose.initializeMongoose();

  // Use Render's PORT or fallback to config for local dev
  const port = process.env.PORT || config.DASHBOARD.port;

  app
    .use(express.json())
    .use(express.urlencoded({ extended: true }))
    .engine("html", require("ejs").renderFile)
    .set("view engine", "ejs")
    .use(express.static(path.join(__dirname, "/public")))
    .set("views", path.join(__dirname, "/views"))
    .use(
      session({
        secret: process.env.SESSION_PASSWORD,
        cookie: { maxAge: 336 * 60 * 60 * 1000 },
        name: "djs_connection_cookie",
        resave: true,
        saveUninitialized: false,
        store: MongoStore.create({
          client: db.getClient(),
          dbName: db.name,
          collectionName: "sessions",
          stringify: false,
          autoRemove: "interval",
          autoRemoveInterval: 1,
        }),
      })
    )
    .use(async (req, res, next) => {
      req.user = req.session.user;
      req.client = client;
      if (req.user && req.url !== "/")
        req.userInfos = await utils.fetchUser(req.user, req.client);
      next();
    })
    .use("/api", discordAPIRouter)
    .use("/logout", logoutRouter)
    .use("/manage", guildManagerRouter)
    .use("/", mainRouter)
    .use(CheckAuth, (req, res) => {
      res.status(404).render("404", {
        user: req.userInfos,
        currentURL: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      });
    })
    .use(CheckAuth, (err, req, res, next) => {
      console.error(err.stack);
      if (!req.user) return res.redirect("/");
      res.status(500).render("500", {
        user: req.userInfos,
        currentURL: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      });
    });

  // Bind to 0.0.0.0 and dynamic PORT
  app.listen(port, "0.0.0.0", () => {
    client.logger.success(
      `Dashboard is listening on HTTP port ${port} (handled by NGINX HTTPS)`
    );
  });
};
