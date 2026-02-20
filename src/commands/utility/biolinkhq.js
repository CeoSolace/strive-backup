const { EmbedBuilder } = require("discord.js");
const { MESSAGES } = require("@root/config.js");
const { getJson } = require("@helpers/HttpUtils");
const { stripIndent } = require("common-tags");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "biolinkstats",
  description: "shows live stats from biolinkhq.lol",
  cooldown: 10,
  category: "UTILITY",
  botPermissions: ["EmbedLinks"],
  command: {
    enabled: true,
    aliases: ["blstats", "biostats"],
    usage: "",
    minArgsCount: 0,
  },
  slashCommand: {
    enabled: true,
    options: [],
  },

  async messageRun(message) {
    const response = await buildBioLinkStatsEmbed(message.author);
    await message.safeReply(response);
  },

  async interactionRun(interaction) {
    const response = await buildBioLinkStatsEmbed(interaction.user);
    await interaction.followUp(response);
  },
};

async function buildBioLinkStatsEmbed(author) {
  const response = await getJson("https://biolinkhq.lol/api/stats");

  if (response.status === 404) return "```Stats endpoint not found (404)```";
  if (!response.success) return MESSAGES.API_ERROR;

  const data = response.data ?? {};

  // Helper: safely format values
  const val = (v, fallback = "Not Provided") => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === "string" && v.trim().length === 0) return fallback;
    return String(v);
  };

  // Helper: pick first existing key from a list
  const pick = (obj, keys) => {
    for (const k of keys) {
      if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
    }
    return undefined;
  };

  // ---- Flexible mapping (so it works even if the API field names differ) ----
  const title = val(pick(data, ["title", "name", "service", "app", "project"]), "BioLinkHQ Statistics");
  const subtitle = pick(data, ["subtitle", "tagline", "description"]);

  // Primary counters
  const totalViews = pick(data, ["views", "totalViews", "total_views", "profileViews", "pageViews", "page_views"]);
  const totalClicks = pick(data, ["clicks", "totalClicks", "total_clicks", "linkClicks", "link_clicks"]);
  const totalLinks = pick(data, ["links", "linkCount", "link_count", "totalLinks", "total_links"]);
  const totalUsers = pick(data, ["users", "userCount", "user_count", "totalUsers", "total_users"]);
  const revenue = pick(data, ["revenue", "totalRevenue", "total_revenue", "earnings"]);

  // Time / status
  const lastUpdated =
    pick(data, ["updatedAt", "updated_at", "lastUpdated", "last_updated", "timestamp"]) || new Date().toISOString();

  const status =
    pick(data, ["status", "state"]) ||
    (response.status >= 200 && response.status < 300 ? "Operational" : "Degraded");

  // Optional brand / media fields
  const iconURL = pick(data, ["icon", "iconUrl", "icon_url", "logo", "logoUrl", "logo_url"]);
  const imageURL = pick(data, ["image", "imageUrl", "image_url", "banner", "bannerUrl", "banner_url"]);
  const url = pick(data, ["url", "site", "website", "websiteUrl", "website_url"]) || "https://biolinkhq.lol";
  // -------------------------------------------------------------------------

  const embed = new EmbedBuilder()
    .setAuthor({
      name: title,
      url,
      iconURL: iconURL || undefined,
    })
    .setColor(0x0b1320)
    .setDescription(
      stripIndent`
      ${subtitle ? `*${subtitle}*\n` : ""}**Live snapshot** of current platform metrics.
      `
    )
    .addFields(
      {
        name: "Overview",
        value: stripIndent`
        **Status**: *${val(status)}*
        **Last Updated**: *${val(lastUpdated)}*
        **Source**: *[biolinkhq.lol/api/stats](${url}/api/stats)*`,
        inline: false,
      },
      {
        name: "Core Metrics",
        value: stripIndent`
        **Views**: *${val(totalViews)}*
        **Clicks**: *${val(totalClicks)}*
        **Links**: *${val(totalLinks)}*
        **Users**: *${val(totalUsers)}*`,
        inline: true,
      },
      {
        name: "Business",
        value: stripIndent`
        **Revenue**: *${val(revenue)}*
        **Uptime**: *${val(pick(data, ["uptime", "uptimePct", "uptime_pct"]))}*
        **Active**: *${val(pick(data, ["active", "activeUsers", "active_users", "online"]))}*
        **Events**: *${val(pick(data, ["events", "eventCount", "event_count"]))}*`,
        inline: true,
      }
    )
    .setFooter({
      text: `Requested by ${author.username} • Data updates whenever the API updates`,
    })
    .setTimestamp(new Date(lastUpdated).toString() !== "Invalid Date" ? new Date(lastUpdated) : new Date());

  if (imageURL) embed.setImage(imageURL);

  return { embeds: [embed] };
}
