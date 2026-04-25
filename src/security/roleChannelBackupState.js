const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "logs", "role-channel-backup-state.json");
const guildConfigs = new Map();

function ensureDir() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    if (!fs.existsSync(filePath)) return;

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    guildConfigs.clear();

    for (const [guildId, config] of Object.entries(data.guilds || {})) {
      guildConfigs.set(guildId, config);
    }
  } catch {
    // Ignore corrupt local state so the bot can still boot.
  }
}

function save() {
  ensureDir();
  fs.writeFileSync(
    filePath,
    JSON.stringify({ guilds: Object.fromEntries(guildConfigs.entries()) }, null, 2)
  );
}

function get(guildId) {
  return guildConfigs.get(guildId) || null;
}

function set(guildId, data) {
  const previous = guildConfigs.get(guildId) || {};
  const next = { ...previous, ...data, updatedAt: Date.now() };
  guildConfigs.set(guildId, next);
  save();
  return next;
}

function remove(guildId) {
  const existed = guildConfigs.delete(guildId);
  save();
  return existed;
}

function all() {
  return [...guildConfigs.entries()].map(([guildId, config]) => ({ guildId, ...config }));
}

function roleChannelBackupState(client) {
  load();
  client.roleChannelBackupState = api;
  client.logger?.success?.("RoleChannelBackupState loaded");
}

const api = { load, save, get, set, remove, all };
Object.assign(roleChannelBackupState, api);

load();

module.exports = roleChannelBackupState;
