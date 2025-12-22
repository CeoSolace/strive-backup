const config = require("@root/config");

module.exports = {
  ADMIN: {
    name: "Admin",
    image: "https://icons.iconarchive.com/icons/dakirby309/simply-styled/256/Settings-icon.png",
    emoji: "⚙️",
    enabled: true,
  },

  ANIME: {
    name: "Anime",
    image: "https://wallpaperaccess.com/full/5680679.jpg",
    emoji: "🎨",
    enabled: true,
  },

  AUTOMOD: {
    name: "AutoMod",
    image: "https://icons.iconarchive.com/icons/papirus-team/papirus-status/128/security-high-icon.png",
    emoji: "🛡️",
    enabled: config.AUTOMOD?.ENABLED ?? true,
  },

  ECONOMY: {
    name: "Economy",
    image: "https://icons.iconarchive.com/icons/custom-icon-design/pretty-office-11/128/coins-icon.png",
    emoji: "🪙",
    enabled: config.ECONOMY.ENABLED,
  },

  FUN: {
    name: "Fun",
    image: "https://icons.iconarchive.com/icons/flameia/aqua-smiles/128/make-fun-icon.png",
    emoji: "😂",
    enabled: true,
  },

  GIVEAWAYS: {
    name: "Giveaways",
    image: "https://cdn-icons-png.flaticon.com/512/4470/4470928.png",
    emoji: "🎉",
    enabled: config.GIVEAWAYS.ENABLED,
  },

  IMAGE: {
    name: "Image",
    image: "https://icons.iconarchive.com/icons/dapino/summer-holiday/128/photo-icon.png",
    emoji: "🖼️",
    enabled: config.IMAGE.ENABLED,
  },

  INFORMATION: {
    name: "Information",
    image: "https://icons.iconarchive.com/icons/graphicloads/100-flat/128/information-icon.png",
    emoji: "🪧",
    enabled: true,
  },

  INVITE: {
    name: "Invites",
    image: "https://cdn4.iconfinder.com/data/icons/general-business/150/Invite-512.png",
    emoji: "📨",
    enabled: config.INVITE.ENABLED,
  },

  MODERATION: {
    name: "Moderation",
    image: "https://icons.iconarchive.com/icons/lawyerwordpress/law/128/Gavel-Law-icon.png",
    emoji: "🔨",
    enabled: config.MODERATION.ENABLED,
  },

  MUSIC: {
    name: "Music",
    image: "https://icons.iconarchive.com/icons/wwalczyszyn/iwindows/256/Music-Library-icon.png",
    emoji: "🎵",
    enabled: config.MUSIC.ENABLED,
  },

  OWNER: {
    name: "Owner",
    image: "https://www.pinclipart.com/picdir/middle/531-5318253_web-designing-icon-png-clipart.png",
    emoji: "🤴",
    enabled: true,
  },

  SOCIAL: {
    name: "Social",
    image: "https://icons.iconarchive.com/icons/dryicons/aesthetica-2/128/community-users-icon.png",
    emoji: "🫂",
    enabled: true,
  },

  STATS: {
    name: "Statistics",
    image: "https://icons.iconarchive.com/icons/graphicloads/flat-finance/256/dollar-stats-icon.png",
    emoji: "📈",
    enabled: config.STATS.ENABLED,
  },

  SUGGESTIONS: {
    name: "Suggestions",
    image: "https://cdn-icons-png.flaticon.com/512/1484/1484815.png",
    emoji: "📝",
    enabled: config.SUGGESTIONS.ENABLED,
  },

  TICKET: {
    name: "Ticket",
    image: "https://icons.iconarchive.com/icons/custom-icon-design/flatastic-2/512/ticket-icon.png",
    emoji: "🎫",
    enabled: config.TICKET.ENABLED,
  },

  UTILITY: {
    name: "Utility",
    image: "https://icons.iconarchive.com/icons/blackvariant/button-ui-system-folders-alt/128/Utilities-icon.png",
    emoji: "🛠",
    enabled: true,
  },

  PREMIUM: {
    name: "Premium",
    image: "https://icons.iconarchive.com/icons/papirus-team/papirus-apps/256/stripe-icon.png",
    emoji: "💎",
    enabled: true,
  },
};
