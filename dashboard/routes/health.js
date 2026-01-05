const os = require("os");

module.exports = (client) => (req, res) => {
  const isReady = client?.isReady?.() ?? Boolean(client?.readyAt);
  const mem = process.memoryUsage();

  res.status(isReady ? 200 : 503).json({
    ok: isReady,
    status: isReady ? "ok" : "degraded",
    timestamp: new Date().toISOString(),

    bot: {
      id: client.user?.id ?? null,
      tag: client.user?.tag ?? null,
      ready: isReady,
      guilds: client.guilds?.cache?.size ?? null,
      pingMs: client.ws?.ping ?? null,
    },

    system: {
      uptimeSec: Math.floor(process.uptime()),
      hostname: os.hostname(),
      node: process.version,
      memoryMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
    },
  });
};
