const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { EMBED_COLORS } = require("@root/config.js");

// In-memory store (resets on restart). Swap to DB if you want persistence.
const AFK = new Map();

function escapeMd(str) {
  return String(str ?? "").replace(/[*_`~|>]/g, "\\$&");
}

function buildAfkNick(member) {
  const base = member.nickname || member.user.globalName || member.user.username;
  let next = `[AFK] ${base}`.trim();
  if (next.length > 32) next = next.slice(0, 32);
  return next;
}

async function trySetNickname(member, nickname, reason) {
  try {
    const me = member.guild.members.me;
    if (!me) return { ok: false, why: "bot member missing" };
    if (!me.permissions.has(PermissionsBitField.Flags.ManageNicknames))
      return { ok: false, why: "missing Manage Nicknames" };
    if (!member.manageable) return { ok: false, why: "role hierarchy prevents it" };

    if (member.nickname === nickname) return { ok: true, why: "already set" };

    await member.setNickname(nickname, reason);
    return { ok: true, why: "updated" };
  } catch {
    return { ok: false, why: "failed" };
  }
}

async function setAfk(member, reason = "Away right now") {
  if (!member?.guild) {
    return { ok: false, response: "This only works in a server." };
  }

  const userId = member.id;

  // Preserve original nickname once, don’t keep overwriting it.
  const existing = AFK.get(userId);
  const prevNick = existing?.prevNick ?? (member.nickname ?? null);

  AFK.set(userId, {
    guildId: member.guild.id,
    reason,
    since: Date.now(),
    prevNick,
  });

  const desired = buildAfkNick(member);
  const nickRes = await trySetNickname(member, desired, "AFK enabled");

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setTitle("AFK enabled")
    .setDescription(`Reason: **${escapeMd(reason)}**`)
    .setFooter({ text: `Nickname: ${nickRes.ok ? nickRes.why : `not changed (${nickRes.why})`}` });

  return { ok: true, response: { embeds: [embed] } };
}

async function clearAfk(member) {
  const entry = AFK.get(member.id);
  if (!entry) return { cleared: false };

  AFK.delete(member.id);

  // Best-effort nickname restore
  try {
    const me = member.guild.members.me;
    if (me?.permissions.has(PermissionsBitField.Flags.ManageNicknames) && member.manageable) {
      await member.setNickname(entry.prevNick ?? null, "AFK disabled");
    }
  } catch {
    // ignore
  }

  return { cleared: true, entry };
}

/**
 * Call this from messageCreate.
 * - UnAFK when the author talks
 * - Warn when AFK users are mentioned
 */
async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;

  // 1) If AFK user speaks: clear AFK + restore nick
  const authorEntry = AFK.get(message.author.id);
  if (authorEntry && authorEntry.guildId === message.guild.id) {
    const res = await clearAfk(message.member);
    if (res.cleared) {
      const back = new EmbedBuilder()
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(`Welcome back <@${message.author.id}>. AFK removed.`);

      // Don’t crash if channel blocks bot replies
      try {
        await message.safeReply?.({ embeds: [back] }) ?? message.reply({ embeds: [back] });
      } catch {}
    }
  }

  // 2) If message mentions AFK users: warn
  const mentioned = message.mentions?.users;
  if (!mentioned?.size) return;

  const lines = [];
  for (const [id, user] of mentioned) {
    const entry = AFK.get(id);
    if (!entry) continue;
    if (entry.guildId !== message.guild.id) continue;

    lines.push(`**${user.username}** is AFK: ${escapeMd(entry.reason)}`);
  }

  if (lines.length) {
    const warn = new EmbedBuilder()
      .setColor(EMBED_COLORS.WARNING)
      .setDescription(lines.join("\n"));

    try {
      await message.safeReply?.({ embeds: [warn] }) ?? message.reply({ embeds: [warn] });
    } catch {}
  }
}

module.exports = {
  AFK,
  setAfk,
  clearAfk,
  handleMessage,
};
