const guardState = require("./guardState");

/**
 * GuardPauseBridge
 *
 * Global per-server maintenance switch for security listeners.
 * This wraps future roleUpdate listeners so admins can pause enforcement in one server
 * without affecting any other server.
 */
module.exports = function guardPauseBridge(client) {
  if (client.__guardPauseBridgeLoaded) return;
  client.__guardPauseBridgeLoaded = true;

  const originalOn = client.on.bind(client);

  client.on = function patchedOn(eventName, listener) {
    if (eventName !== "roleUpdate" || typeof listener !== "function") {
      return originalOn(eventName, listener);
    }

    const wrappedListener = async function wrappedRoleUpdate(oldRole, newRole, ...rest) {
      const guildId = newRole?.guild?.id || oldRole?.guild?.id;
      if (guildId && guardState.isPaused(guildId)) return;
      return listener(oldRole, newRole, ...rest);
    };

    return originalOn(eventName, wrappedListener);
  };

  client.logger.success("GuardPauseBridge loaded");
};
