const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "logs", "server-guard-state.json");
const paused = new Map();

function ensureDir() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    paused.clear();
    for (const [guildId, value] of Object.entries(data.paused || {})) {
      if (!value.expiresAt || Date.now() < value.expiresAt) paused.set(guildId, value);
    }
    save();
  } catch {
    // ignore corrupted local state
  }
}

function save() {
  ensureDir();
  const data = { paused: Object.fromEntries(paused.entries()) };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isPaused(guildId) {
  const value = paused.get(guildId);
  if (!value) return false;

  if (value.expiresAt && Date.now() > value.expiresAt) {
    paused.delete(guildId);
    save();
    return false;
  }

  return true;
}

function getPause(guildId) {
  isPaused(guildId);
  return paused.get(guildId) || null;
}

function pause(guildId, data) {
  paused.set(guildId, data);
  save();
}

function resume(guildId) {
  const existed = paused.delete(guildId);
  save();
  return existed;
}

load();

module.exports = {
  isPaused,
  getPause,
  pause,
  resume,
};
