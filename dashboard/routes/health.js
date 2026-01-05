// dashboard/routes/health.js
const os = require("os");

module.exports = (client, db) => (req, res) => {
  const isReady = client?.isReady?.() ?? Boolean(client?.readyAt);

  const mem = process.memoryUsage();

  // Mongoose connection state (if available)
  const readyState = db?.readyState ?? db?.connection?.readyState ?? null;
  const mongooseStates = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const dbInfo =
    readyState === null
      ? null
      : {
          ok: readyState === 1,
          state: mongooseStates[readyState] ?? "unknown",
        };

  const ok = isReady && (dbInfo ? dbInfo.ok : true);

  res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),

    bot: {
      id: client.user?.id ?? null,
      tag: client.user?.tag ?? null,
      ready: isReady,
      guilds: client.guilds?.cache?.size ?? null,
      pingMs: typeof client.ws?.ping === "number" ? client.ws.ping : null,
      readyAt: client.readyAt ? client.readyAt.toISOString?.() ?? String(client.readyAt) : null,
    },

    db: dbInfo,

    system: {
      uptimeSec: Math.floor(process.uptime()),
      hostname: os.hostname(),
      platform: process.platform,
      node: process.version,
      memoryMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
    },
  });
};
