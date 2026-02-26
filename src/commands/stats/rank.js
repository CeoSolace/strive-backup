const { ApplicationCommandOptionType, AttachmentBuilder } = require("discord.js");
const { createCanvas, registerFont, loadImage } = require("canvas");
const { getMemberStats, getXpLb } = require("@schemas/MemberStats");
const { getBuffer } = require("@helpers/HttpUtils");

let fontLoaded = false;
try {
  registerFont("./assets/fonts/NotoSans-Regular.ttf", { family: "Noto Sans" });
  fontLoaded = true;
} catch (e) {
  // If Noto Sans fails, we fall back to Arial — which canvas can simulate
}

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "rank",
  description: "displays members rank in this server",
  cooldown: 5,
  category: "STATS",
  botPermissions: ["AttachFiles"],
  command: {
    enabled: true,
    usage: "[@member|id]",
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "user",
        description: "target user",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },

  async messageRun(message, args, data) {
    const member = (await message.guild.resolveMember(args[0])) || message.member;
    const attachment = await generateRankCard(member, data.settings);
    if (attachment === null) {
      return message.safeReply("Stats tracking is disabled or user has no XP.");
    }
    return message.safeReply({ files: [attachment] });
  },

  async interactionRun(interaction, data) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user);
    const attachment = await generateRankCard(member, data.settings);
    if (attachment === null) {
      return interaction.followUp("Stats tracking is disabled or user has no XP.");
    }
    return interaction.followUp({ files: [attachment] });
  },
};

async function generateRankCard(member, settings) {
  if (!settings.stats.enabled) return null;

  const { user, guild } = member;
  const stats = await getMemberStats(guild.id, user.id);
  if (!stats || !stats.xp) return null;

  const lb = await getXpLb(guild.id, 100);
  let rank = 0;
  for (let i = 0; i < lb.length; i++) {
    if (lb[i].member_id === user.id) {
      rank = i + 1;
      break;
    }
  }

  const level = stats.level;
  const xp = stats.xp;
  const xpNeeded = level * level * 100;
  const progress = Math.min(xp / xpNeeded, 1);

  let avatar = null;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });
    const buffer = await getBuffer(avatarUrl);
    avatar = await loadImage(buffer.buffer);
  } catch (e) {
    // Avatar load failed — proceed without it
  }

  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2C2F33";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(150, 150, 100, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, 50, 50, 200, 200);
  } else {
    ctx.fillStyle = "#4F545C";
    ctx.fillRect(50, 50, 200, 200);
  }
  ctx.restore();

  ctx.fillStyle = "#4F545C";
  ctx.fillRect(270, 180, 580, 20);

  ctx.fillStyle = "#068ADD";
  ctx.fillRect(270, 180, 580 * progress, 20);

  const fontFamily = fontLoaded ? "Noto Sans" : "Arial";
  ctx.textBaseline = "top";

  ctx.font = `bold 42px "${fontFamily}"`;
  ctx.fillStyle = "white";
  const displayName = user.globalName || user.username;
  const displayText = displayName.length > 16 ? displayName.substring(0, 13) + "..." : displayName;
  ctx.fillText(displayText, 270, 80);

  ctx.font = `26px "${fontFamily}"`;
  ctx.fillText(`Level: ${level}`, 270, 140);
  ctx.fillText(`Rank: #${rank || "?"} in ${guild.name}`, 270, 180);
  ctx.fillText(`XP: ${xp.toLocaleString()} / ${xpNeeded.toLocaleString()}`, 270, 220);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "rank.png" });
}
