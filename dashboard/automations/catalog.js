// dashboard/automation/catalog.js
// Numeric automation function catalog (IDs 1..18).
// Stored in DB as f[] (function IDs) + p[] (tiny param objects aligned by index).
// Validate: exactly one Trigger (1..6), at least one Action (13..18), max 9 steps.

const CATEGORIES = {
  TRIGGER: { min: 1, max: 6 },
  CONDITION: { min: 7, max: 12 },
  ACTION: { min: 13, max: 18 },
};

const FUNCTIONS = [
  // Triggers (1–6)
  { id: 1, cat: "TRIGGER", key: "TRIGGER_MESSAGE", label: "Message posted", params: [] },
  { id: 2, cat: "TRIGGER", key: "TRIGGER_MEMBER_JOIN", label: "Member joins", params: [] },
  { id: 3, cat: "TRIGGER", key: "TRIGGER_MEMBER_LEAVE", label: "Member leaves", params: [] },
  { id: 4, cat: "TRIGGER", key: "TRIGGER_REACTION_ADD", label: "Reaction added", params: ["e"] }, // e=emoji optional
  { id: 5, cat: "TRIGGER", key: "TRIGGER_SCHEDULE", label: "Scheduled", params: ["k"] }, // k=schedule string
  { id: 6, cat: "TRIGGER", key: "TRIGGER_BUTTON_CLICK", label: "Button click", params: ["b"] }, // b=button key

  // Conditions (7–12)
  { id: 7, cat: "CONDITION", key: "COND_CHANNEL_IS", label: "Channel is", params: ["c"] }, // c=channelId
  { id: 8, cat: "CONDITION", key: "COND_HAS_ROLE", label: "User has role", params: ["r"] }, // r=roleId
  { id: 9, cat: "CONDITION", key: "COND_MESSAGE_CONTAINS", label: "Message contains", params: ["t"] }, // t=text
  { id: 10, cat: "CONDITION", key: "COND_MESSAGE_REGEX", label: "Message matches regex", params: ["x"] }, // x=regex
  { id: 11, cat: "CONDITION", key: "COND_COOLDOWN", label: "Cooldown", params: ["s"] }, // s=seconds
  { id: 12, cat: "CONDITION", key: "COND_USER_IS_ADMIN", label: "User is admin", params: [] },

  // Actions (13–18)
  { id: 13, cat: "ACTION", key: "ACT_SEND_MESSAGE", label: "Send message", params: ["c", "t"] }, // c channel, t text
  { id: 14, cat: "ACTION", key: "ACT_REPLY", label: "Reply", params: ["t"] },
  { id: 15, cat: "ACTION", key: "ACT_DM_USER", label: "DM user", params: ["t"] },
  { id: 16, cat: "ACTION", key: "ACT_ADD_ROLE", label: "Add role", params: ["r"] },
  { id: 17, cat: "ACTION", key: "ACT_REMOVE_ROLE", label: "Remove role", params: ["r"] },
  { id: 18, cat: "ACTION", key: "ACT_DELETE_MESSAGE", label: "Delete message", params: [] },
];

const BY_ID = new Map(FUNCTIONS.map((f) => [f.id, f]));

function isIdInCategory(id, cat) {
  const range = CATEGORIES[cat];
  if (!range) return false;
  return id >= range.min && id <= range.max;
}

function validatePlan(f) {
  const triggers = f.filter((id) => isIdInCategory(id, "TRIGGER")).length;
  const actions = f.filter((id) => isIdInCategory(id, "ACTION")).length;
  return { triggers, actions };
}

module.exports = {
  CATEGORIES,
  FUNCTIONS,
  BY_ID,
  isIdInCategory,
  validatePlan,
};
