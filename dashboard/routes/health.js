/**
 * Health check route factory.
 * Returns a simple status JSON indicating whether the bot and database are alive.
 *
 * @param {import('discord.js').Client} client The Discord client instance
 * @param {import('mongoose').Connection} db The Mongoose connection or database wrapper
 * @returns {Function} Express request handler
 */
module.exports = (client, db) => {
  return (req, res) => {
    // Check if the Discord bot client is ready
    const botReady = typeof client.isReady === "function" ? client.isReady() : false;

    // Determine MongoDB connection status
    let mongoConnected;
    if (db && typeof db.readyState === "number") {
      // Mongoose readyState codes: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      mongoConnected = db.readyState === 1;
    } else if (db && typeof db.getClient === "function") {
      // If db is a MongoStore, try to detect connection using the underlying client
      try {
        const clientConnection = db.getClient();
        mongoConnected =
          clientConnection && clientConnection.topology && clientConnection.topology.isConnected();
      } catch {
        mongoConnected = undefined;
      }
    } else {
      mongoConnected = undefined;
    }

    res.status(200).json({
      ok: true,
      botReady,
      mongoConnected,
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  };
};