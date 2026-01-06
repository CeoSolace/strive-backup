const { EmbedBuilder, ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");
const { EMBED_COLORS } = require("@root/config.js");

// In-memory AFK store (resets on restart). If you want persistence, swap to DB.
const AFK = new Map();

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "afk",
  description: "set yourself AFK with an optional reason (auto warns pingers + changes nickname)",
  cooldown: 10,
  category: "UTILITY",
  botPermissions: ["EmbedLinks", "ManageNicknames"],
  command: {
    enabled: true,
    aliases: ["away"],
    usage: "[reason]",
    minArgsCount: 0,
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "reason",
        description: "why you're AFK (shown to people who ping you)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },

  async messageRun(message, args) {
    const reason = args.join(" ").trim() || "Away right now";
    const res = await setAfk(message.member, reason);
    return message.safeReply(res);
  },

  async interactionRun(interaction) {
    const reason = (interaction.options.getString("reason") || "").trim() || "Away right now";
    const res = await setAfk(interaction.member, reason);
    return interaction.followUp(res);
  },
};

// --- helper: set AFK + nickname change
async function setAfk(member, reason) {
  const embed = new EmbedBuilder();

  if (!member || !member.guild) {
    embed.setColor(EMBED_COLORS.ERROR).setDescription("This only works in a server.");
    return { embeds: [embed] };
  }

  const userId = member.id;
  const existing = AFK.get(userId);

  // If already AFK, just update reason (and ensure nickname is set)
  const prevNick = existing?.prevNick ?? (member.nickname ?? null);

  AFK.set(userId, {
    reason,
    since: Date.now(),
    guildId: member.guild.id,
    prevNick,
    nickSet: false,
  });

  // Try nickname change (best effort)
  const nickResult = await trySetAfkNick(member);

  embed
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setTitle("AFK enabled")
    .setDescription(`Reason: **${escapeMd(reason)}**`)
    .setFooter({ text: nickResult });

  return { embeds: [embed] };
}

// --- helper: attempt to set [AFK] nickname safely
async function trySetAfkNick(member) {
  try {
    // Bot needs permission and role position to change this user's nick
    if (!member.guild.members.me) return "Nickname: not changed (bot member missing?)";
    const me = member.guild.members.me;

    if (!me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return "Nickname: not changed (missing Manage Nicknames)";
    }
    if (!member.manageable) {
      return "Nickname: not changed (role hierarchy prevents it)";
    }

    const base = member.nickname || member.user.globalName || member.user.username;
    let next = `[AFK] ${base}`.trim();

    // Discord nickname max = 32 chars
    if (next.length > 32) next = next.slice(0, 32);

    // Avoid pointless edits
    if (member.nickname === next) return "Nickname: already set";

    await member.setNickname(next, "AFK enabled");
    const entry = AFK.get(member.id);
    if (entry) entry.nickSet = true;

    return "Nickname: updated";
  } catch (e) {
    return "Nickname: failed to update";
  }
}

// --- helper: restore nickname
async function restoreNick(member) {
  const entry = AFK.get(member.id);
  if (!entry) return false;

  AFK.delete(member.id);

  try {
    if (!member.guild.members.me) return true;
    const me = member.guild.members.me;

    if (!me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return true;
    if (!member.manageable) return true;

    // Restore previous nickname (null = clear nickname)
    await member.setNickname(entry.prevNick ?? null, "AFK disabled");
  } catch {
    // best effort
  }

  return true;
}

// --- simple markdown escape (prevents weird formatting abuse)
function escapeMd(str) {
  return String(str).replace(/[*_`~|>]/g, "\\$&");
}

/**
 * IMPORTANT:
 * This command needs a messageCreate hook to:
 * 1) auto-warn when an AFK user is mentioned
 * 2) auto-remove AFK when the AFK user speaks
 *
 * Add the snippet below to your messageCreate event (or merge into yours).
 *
 * If your framework already has an event file, paste ONLY the logic portion.
 */

// Exported utility for your messageCreate event to call (optional pattern)
module.exports.__afk = {
  AFK,
  handleMessage: async (message) => {
    if (!message.guild || message.author.bot) return;

    // If AFK user speaks, remove AFK + restore nick
    const authorEntry = AFK.get(message.author.id);
    if (authorEntry && authorEntry.guildId === message.guild.id) {
      await restoreNick(message.member);
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(`Welcome back <@${message.author.id}>. AFK removed.`);
      await message.safeReply({ embeds: [embed] });
      // continue; still allow mention checks
    }

    // If message mentions AFK users, warn once per message
    const mentioned = message.mentions.users;
    if (!mentioned || mentioned.size === 0) return;

    const warnings = [];
    for (const [id, user] of mentioned) {
      const entry = AFK.get(id);
      if (!entry) continue;
      if (entry.guildId !== message.guild.id) continue;

      warnings.push(`**${user.username}** is AFK: ${escapeMd(entry.reason)}`);
    }

    if (warnings.length) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.WARNING)
        .setDescription(warnings.join("\n"));
      await message.safeReply({ embeds: [embed] });
    }
  },
};
