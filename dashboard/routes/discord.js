const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const btoa = require("btoa");

/**
 * LOGIN ROUTE
 */
router.get("/login", async function (req, res) {
  const clientId = req.client.user?.id;
  const baseURL = req.client.config.DASHBOARD.baseURL;
  const redirectURI = encodeURIComponent(`${baseURL}/api/auth/callback`);
  const state = req.query.state || "no";

  if (!clientId) {
    req.client.logger.debug("Client not ready, redirect /login");
    return res.redirect("/login");
  }

  const url =
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&scope=identify%20guilds` +
    `&response_type=code` +
    `&redirect_uri=${redirectURI}` +
    `&state=${state}`;

  return res.redirect(url);
});

/**
 * CALLBACK ROUTE
 * Discord redirects users here
 */
router.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const baseURL = req.client.config.DASHBOARD.baseURL;

  if (!code) {
    req.client.logger.error("Missing OAuth code");
    return res.redirect(req.client.config.DASHBOARD.failureURL);
  }

  const redirectURI = `${baseURL}/api/auth/callback`;

  // Prepare token exchange request
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectURI);

  // Exchange code for tokens
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: params.toString(),
    headers: {
      Authorization: `Basic ${btoa(
        `${req.client.user.id}:${process.env.BOT_SECRET}`
      )}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const tokens = await tokenResponse.json();

  if (!tokens.access_token) {
    req.client.logger.error("Token exchange failed", tokens);
    return res.redirect(`/api/login?state=${state}`);
  }

  // Fetch user info
  const headers = { Authorization: `Bearer ${tokens.access_token}` };

  const userRes = await fetch("https://discord.com/api/users/@me", { headers });
  const userInfo = await userRes.json();

  const guildRes = await fetch("https://discord.com/api/users/@me/guilds", {
    headers,
  });
  const guildData = await guildRes.json();

  // Save session
  req.session.user = {
    ...userInfo,
    guilds: guildData,
  };

  const redirectURL = req.client.states[state] || "/selector";
  return res.redirect(redirectURL);
});

module.exports = router;
