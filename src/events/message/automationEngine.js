// src/events/message/automationEngine.js
const Automation = require("../../../../dashboard/models/Automation");

/**
 * @param {import('@src/structures').BotClient} client
 * @param {import('discord.js').Message} message
 */
module.exports = async (client, message) => {
  if (!message.guild || message.author.bot) return;

  let automations;
  try {
    automations = await Automation.find({ guildId: message.guild.id, enabled: true }).lean();
  } catch (err) {
    return;
  }

  for (const auto of automations) {
    try {
      const blocks = auto.f || [];
      const params = auto.p || [];

      // Find the trigger block
      let triggerIndex = -1;
      let triggered = false;

      for (let i = 0; i < blocks.length; i++) {
        const type = blocks[i];
        const p = params[i] || {};

        // ── TRIGGERS ──
        if (type === "message_contains") {
          if (p.text && message.content.toLowerCase().includes(p.text.toLowerCase())) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }
        if (type === "message_equals") {
          if (p.text && message.content.trim().toLowerCase() === p.text.trim().toLowerCase()) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }
        if (type === "message_starts") {
          if (p.text && message.content.toLowerCase().startsWith(p.text.toLowerCase())) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }
        if (type === "message_ends") {
          if (p.text && message.content.toLowerCase().endsWith(p.text.toLowerCase())) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }
        if (type === "message_regex") {
          try {
            const regex = new RegExp(p.pattern || "", "i");
            if (regex.test(message.content)) {
              triggerIndex = i;
              triggered = true;
            }
          } catch {
            // invalid regex – skip
          }
          continue;
        }
        if (type === "command_trigger") {
          const prefix = p.command ? `!${p.command}` : null;
          if (prefix && message.content.toLowerCase().startsWith(prefix.toLowerCase())) {
            triggerIndex = i;
            triggered = true;
          }
          continue;
        }

        // ── CONDITIONS (only evaluated after a trigger) ──
        if (!triggered) continue;

        if (type === "if_role") {
          if (p.role && !message.member?.roles.cache.has(p.role)) {
            triggered = false; // condition failed – stop flow
          }
          continue;
        }
        if (type === "if_no_role") {
          if (p.role && message.member?.roles.cache.has(p.role)) {
            triggered = false;
          }
          continue;
        }
        if (type === "if_channel") {
          if (p.channel && message.channelId !== p.channel) {
            triggered = false;
          }
          continue;
        }
        if (type === "if_user_id") {
          if (p.user && message.author.id !== p.user) {
            triggered = false;
          }
          continue;
        }
        if (type === "if_message_includes") {
          if (p.text && !message.content.toLowerCase().includes(p.text.toLowerCase())) {
            triggered = false;
          }
          continue;
        }
        if (type === "if_message_has_attachment") {
          if (message.attachments.size === 0) triggered = false;
          continue;
        }
        if (type === "if_random") {
          const chance = Number(p.chance) || 50;
          if (Math.random() * 100 > chance) triggered = false;
          continue;
        }
        if (type === "if_bot") {
          if (!message.author.bot) triggered = false;
          continue;
        }
        if (type === "if_not_bot") {
          if (message.author.bot) triggered = false;
          continue;
        }

        // ── ACTIONS ──
        if (type === "reply_message") {
          const text = p.message || p.text || "";
          if (text) await message.reply({ content: text }).catch(() => {});
          continue;
        }
        if (type === "send_message") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const text = p.message || p.text || "";
          if (ch && text) await ch.send({ content: text }).catch(() => {});
          continue;
        }
        if (type === "dm_user") {
          const text = p.message || p.text || "";
          if (text) await message.author.send({ content: text }).catch(() => {});
          continue;
        }
        if (type === "send_embed") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          if (ch) {
            const { EmbedBuilder } = require("discord.js");
            const embed = new EmbedBuilder();
            if (p.title) embed.setTitle(p.title);
            if (p.description) embed.setDescription(p.description);
            if (p.color) {
              try { embed.setColor(p.color); } catch {}
            }
            await ch.send({ embeds: [embed] }).catch(() => {});
          }
          continue;
        }
        if (type === "delete_trigger") {
          if (message.deletable) await message.delete().catch(() => {});
          continue;
        }
        if (type === "react") {
          if (p.emoji) await message.react(p.emoji).catch(() => {});
          continue;
        }
        if (type === "add_role") {
          const role = p.role ? message.guild.roles.cache.get(p.role) : null;
          if (role && message.member) await message.member.roles.add(role).catch(() => {});
          continue;
        }
        if (type === "remove_role") {
          const role = p.role ? message.guild.roles.cache.get(p.role) : null;
          if (role && message.member) await message.member.roles.remove(role).catch(() => {});
          continue;
        }
        if (type === "toggle_role") {
          const role = p.role ? message.guild.roles.cache.get(p.role) : null;
          if (role && message.member) {
            if (message.member.roles.cache.has(role.id)) {
              await message.member.roles.remove(role).catch(() => {});
            } else {
              await message.member.roles.add(role).catch(() => {});
            }
          }
          continue;
        }
        if (type === "set_nickname") {
          if (p.nickname && message.member?.manageable) {
            await message.member.setNickname(p.nickname).catch(() => {});
          }
          continue;
        }
        if (type === "timeout_user") {
          const minutes = Number(p.minutes) || 5;
          if (message.member?.moderatable) {
            await message.member.timeout(minutes * 60 * 1000, p.reason || "Automation").catch(() => {});
          }
          continue;
        }
        if (type === "kick_user") {
          if (message.member?.kickable) {
            await message.member.kick(p.reason || "Automation").catch(() => {});
          }
          continue;
        }
        if (type === "ban_user") {
          if (message.member?.bannable) {
            await message.guild.members.ban(message.author.id, { reason: p.reason || "Automation" }).catch(() => {});
          }
          continue;
        }
        if (type === "warn_user") {
          // Integrates with the existing warn system if available
          try {
            const { warnTarget } = require("../../helpers/ModUtils");
            if (message.guild.members.me && message.member) {
              await warnTarget(message.guild.members.me, message.member, p.reason || "Automation warning");
            }
          } catch {}
          continue;
        }
        if (type === "wait") {
          const ms = (Number(p.seconds) || 1) * 1000;
          await new Promise((r) => setTimeout(r, Math.min(ms, 30000))); // cap at 30s
          continue;
        }
        if (type === "cooldown") {
          // Cooldown blocks future runs of this automation for the user
          // Simple in-memory implementation
          const key = `${auto._id}:${message.author.id}`;
          if (!client._automationCooldowns) client._automationCooldowns = new Map();
          if (client._automationCooldowns.has(key)) {
            triggered = false;
            continue;
          }
          const cooldownMs = (Number(p.seconds) || 30) * 1000;
          client._automationCooldowns.set(key, Date.now());
          setTimeout(() => client._automationCooldowns?.delete(key), cooldownMs);
          continue;
        }
        if (type === "stop_flow") {
          break;
        }
        if (type === "ping_role") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const role = p.role ? message.guild.roles.cache.get(p.role) : null;
          if (ch && role) {
            const text = p.message || "";
            await ch.send({ content: `${role} ${text}`, allowedMentions: { roles: [role.id] } }).catch(() => {});
          }
          continue;
        }
        if (type === "ping_user") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const userId = p.user || message.author.id;
          if (ch) {
            const text = p.message || "";
            await ch.send({ content: `<@${userId}> ${text}`, allowedMentions: { users: [userId] } }).catch(() => {});
          }
          continue;
        }
        if (type === "create_thread") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const threadName = p.name || "Thread";
          if (ch?.isTextBased?.()) {
            await ch.threads?.create({ name: threadName, reason: "Automation" }).catch(() => {});
          }
          continue;
        }
        if (type === "lock_channel") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          if (ch) {
            await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
          }
          continue;
        }
        if (type === "unlock_channel") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          if (ch) {
            await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
          }
          continue;
        }
        if (type === "slowmode") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const seconds = Number(p.seconds) || 0;
          if (ch?.isTextBased?.()) {
            await ch.setRateLimitPerUser(seconds).catch(() => {});
          }
          continue;
        }
        if (type === "purge_messages") {
          const ch = p.channel ? message.guild.channels.cache.get(p.channel) : message.channel;
          const amount = Math.min(Number(p.amount) || 5, 99);
          if (ch?.isTextBased?.()) {
            const msgs = await ch.messages.fetch({ limit: amount }).catch(() => null);
            if (msgs) await ch.bulkDelete(msgs, true).catch(() => {});
          }
          continue;
        }
      }
    } catch (err) {
      client.logger?.error?.("Automation engine error", err);
    }
  }
};
