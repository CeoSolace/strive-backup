const canvas = document.getElementById("builderCanvas");
const library = document.getElementById("blockLibrary");
const tutorial = document.getElementById("tutorialBox");
const saveBtn = document.getElementById("saveFeatureBtn");
const nameInput = document.getElementById("featureName");
const searchInput = document.querySelector(".block-search");

const COLORS = {
  trigger: "#a855f7",
  message: "#3b82f6",
  role: "#14b8a6",
  channel: "#f59e0b",
  category: "#f97316",
  ping: "#ec4899",
  thread: "#6366f1",
  invite: "#22c55e",
  condition: "#22c55e",
  moderation: "#ef4444",
  utility: "#eab308",
  data: "#06b6d4",
};

const BLOCKS = [
  // Triggers
  { id: "message_contains", name: "When Message Contains", type: "trigger", color: COLORS.trigger, fields: [{ key: "text", label: "Message contains" }] },
  { id: "message_equals", name: "When Message Equals", type: "trigger", color: COLORS.trigger, fields: [{ key: "text", label: "Message equals" }] },
  { id: "message_starts", name: "When Message Starts With", type: "trigger", color: COLORS.trigger, fields: [{ key: "text", label: "Starts with" }] },
  { id: "message_ends", name: "When Message Ends With", type: "trigger", color: COLORS.trigger, fields: [{ key: "text", label: "Ends with" }] },
  { id: "message_regex", name: "When Message Matches Pattern", type: "trigger", color: COLORS.trigger, fields: [{ key: "pattern", label: "Pattern" }] },
  { id: "command_trigger", name: "Custom Command Trigger", type: "trigger", color: COLORS.trigger, fields: [{ key: "command", label: "Command name" }] },
  { id: "member_join", name: "When Member Joins", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "member_leave", name: "When Member Leaves", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "role_given", name: "When Role Is Given", type: "trigger", color: COLORS.trigger, fields: [{ key: "role", label: "Role ID" }] },
  { id: "role_removed", name: "When Role Is Removed", type: "trigger", color: COLORS.trigger, fields: [{ key: "role", label: "Role ID" }] },
  { id: "reaction_added", name: "When Reaction Added", type: "trigger", color: COLORS.trigger, fields: [{ key: "emoji", label: "Emoji" }, { key: "message", label: "Message ID" }] },
  { id: "channel_created", name: "When Channel Created", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "channel_deleted", name: "When Channel Deleted", type: "trigger", color: COLORS.trigger, fields: [] },

  // Messages
  { id: "send_message", name: "Send Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "reply_message", name: "Reply To Trigger Message", type: "message", color: COLORS.message, fields: [{ key: "message", label: "Reply text", type: "textarea" }] },
  { id: "dm_user", name: "DM User", type: "message", color: COLORS.message, fields: [{ key: "message", label: "DM message", type: "textarea" }] },
  { id: "send_embed", name: "Send Embed", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID" }, { key: "title", label: "Embed title" }, { key: "description", label: "Embed description", type: "textarea" }, { key: "color", label: "Hex color" }] },
  { id: "edit_message", name: "Edit Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID" }, { key: "messageId", label: "Message ID" }, { key: "content", label: "New content", type: "textarea" }] },
  { id: "delete_message", name: "Delete Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID" }, { key: "messageId", label: "Message ID" }] },
  { id: "delete_trigger", name: "Delete Trigger Message", type: "message", color: COLORS.message, fields: [] },
  { id: "react", name: "React To Trigger Message", type: "message", color: COLORS.message, fields: [{ key: "emoji", label: "Emoji" }] },
  { id: "pin_message", name: "Pin Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID" }, { key: "messageId", label: "Message ID" }] },
  { id: "crosspost_message", name: "Publish Announcement Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Announcement Channel ID" }, { key: "messageId", label: "Message ID" }] },
  { id: "send_webhook", name: "Send Webhook", type: "message", color: COLORS.message, fields: [{ key: "url", label: "Webhook URL" }, { key: "message", label: "Message", type: "textarea" }] },

  // Pings
  { id: "ping_user", name: "Ping User", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID" }, { key: "user", label: "User ID" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "ping_role", name: "Ping Role", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID" }, { key: "role", label: "Role ID" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "ping_everyone", name: "Ping Everyone", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "silent_ping_role", name: "Silent Role Mention", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID" }, { key: "role", label: "Role ID" }, { key: "message", label: "Message", type: "textarea" }] },

  // Roles
  { id: "add_role", name: "Add Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "remove_role", name: "Remove Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "toggle_role", name: "Toggle Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "create_role", name: "Create Role", type: "role", color: COLORS.role, fields: [{ key: "name", label: "Role name" }, { key: "color", label: "Color hex" }, { key: "mentionable", label: "Mentionable true/false" }] },
  { id: "delete_role", name: "Delete Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "rename_role", name: "Rename Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }, { key: "name", label: "New name" }] },
  { id: "set_role_color", name: "Set Role Color", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }, { key: "color", label: "Hex color" }] },
  { id: "move_role", name: "Move Role Position", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }, { key: "position", label: "Position", type: "number" }] },

  // Channels
  { id: "create_text_channel", name: "Create Text Channel", type: "channel", color: COLORS.channel, fields: [{ key: "name", label: "Channel name" }, { key: "category", label: "Category ID optional" }] },
  { id: "create_voice_channel", name: "Create Voice Channel", type: "channel", color: COLORS.channel, fields: [{ key: "name", label: "Channel name" }, { key: "category", label: "Category ID optional" }, { key: "limit", label: "User limit", type: "number" }] },
  { id: "create_announcement_channel", name: "Create Announcement Channel", type: "channel", color: COLORS.channel, fields: [{ key: "name", label: "Channel name" }, { key: "category", label: "Category ID optional" }] },
  { id: "delete_channel", name: "Delete Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "rename_channel", name: "Rename Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }, { key: "name", label: "New name" }] },
  { id: "move_channel", name: "Move Channel To Category", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }, { key: "category", label: "Category ID" }] },
  { id: "set_channel_topic", name: "Set Channel Topic", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }, { key: "topic", label: "Topic", type: "textarea" }] },
  { id: "lock_channel", name: "Lock Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "unlock_channel", name: "Unlock Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "hide_channel", name: "Hide Channel From Everyone", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "show_channel", name: "Show Channel To Everyone", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "slowmode", name: "Set Slowmode", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }, { key: "seconds", label: "Seconds", type: "number" }] },
  { id: "clone_channel", name: "Clone Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID" }, { key: "name", label: "New channel name optional" }] },

  // Categories
  { id: "create_category", name: "Create Category", type: "category", color: COLORS.category, fields: [{ key: "name", label: "Category name" }] },
  { id: "delete_category", name: "Delete Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }] },
  { id: "rename_category", name: "Rename Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }, { key: "name", label: "New name" }] },
  { id: "lock_category", name: "Lock Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }] },
  { id: "unlock_category", name: "Unlock Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }] },
  { id: "hide_category", name: "Hide Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }] },
  { id: "show_category", name: "Show Category", type: "category", color: COLORS.category, fields: [{ key: "category", label: "Category ID" }] },

  // Threads and invites
  { id: "create_thread", name: "Create Thread", type: "thread", color: COLORS.thread, fields: [{ key: "channel", label: "Channel ID" }, { key: "name", label: "Thread name" }] },
  { id: "archive_thread", name: "Archive Thread", type: "thread", color: COLORS.thread, fields: [{ key: "thread", label: "Thread ID" }] },
  { id: "create_invite", name: "Create Invite", type: "invite", color: COLORS.invite, fields: [{ key: "channel", label: "Channel ID" }, { key: "maxAge", label: "Max age seconds", type: "number" }, { key: "maxUses", label: "Max uses", type: "number" }] },

  // Moderation / member
  { id: "set_nickname", name: "Set Nickname", type: "moderation", color: COLORS.moderation, fields: [{ key: "nickname", label: "Nickname" }] },
  { id: "timeout_user", name: "Timeout User", type: "moderation", color: COLORS.moderation, fields: [{ key: "minutes", label: "Minutes", type: "number" }, { key: "reason", label: "Reason" }] },
  { id: "remove_timeout", name: "Remove Timeout", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "kick_user", name: "Kick User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "ban_user", name: "Ban User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "unban_user", name: "Unban User ID", type: "moderation", color: COLORS.moderation, fields: [{ key: "user", label: "User ID" }, { key: "reason", label: "Reason" }] },
  { id: "warn_user", name: "Warn User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "purge_messages", name: "Purge Messages", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID" }, { key: "amount", label: "Amount", type: "number" }] },

  // Conditions
  { id: "if_role", name: "If User Has Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_no_role", name: "If User Does Not Have Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_channel", name: "If In Channel", type: "condition", color: COLORS.condition, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "if_category", name: "If Channel In Category", type: "condition", color: COLORS.condition, fields: [{ key: "category", label: "Category ID" }] },
  { id: "if_user_id", name: "If User ID Is", type: "condition", color: COLORS.condition, fields: [{ key: "user", label: "User ID" }] },
  { id: "if_message_includes", name: "If Message Includes", type: "condition", color: COLORS.condition, fields: [{ key: "text", label: "Text" }] },
  { id: "if_message_has_attachment", name: "If Message Has Attachment", type: "condition", color: COLORS.condition, fields: [] },
  { id: "if_random", name: "Random Chance", type: "condition", color: COLORS.condition, fields: [{ key: "chance", label: "Chance %", type: "number" }] },
  { id: "if_bot", name: "If User Is Bot", type: "condition", color: COLORS.condition, fields: [] },
  { id: "if_not_bot", name: "If User Is Not Bot", type: "condition", color: COLORS.condition, fields: [] },

  // Utility / Data
  { id: "wait", name: "Wait", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds", type: "number" }] },
  { id: "cooldown", name: "Cooldown", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds", type: "number" }] },
  { id: "stop_flow", name: "Stop Flow", type: "utility", color: COLORS.utility, fields: [] },
  { id: "set_variable", name: "Set Variable", type: "data", color: COLORS.data, fields: [{ key: "name", label: "Variable name" }, { key: "value", label: "Value" }] },
  { id: "increase_variable", name: "Increase Variable", type: "data", color: COLORS.data, fields: [{ key: "name", label: "Variable name" }, { key: "amount", label: "Amount", type: "number" }] },
  { id: "if_variable_equals", name: "If Variable Equals", type: "condition", color: COLORS.condition, fields: [{ key: "name", label: "Variable name" }, { key: "value", label: "Value" }] },
  { id: "random_number", name: "Random Number", type: "data", color: COLORS.data, fields: [{ key: "min", label: "Min", type: "number" }, { key: "max", label: "Max", type: "number" }, { key: "saveAs", label: "Save as variable" }] },
];

let nodes = [];
let connections = [];
let dragState = null;
let connectState = null;

function createLibrary(filter = "") {
  library.innerHTML = "";
  const query = filter.toLowerCase();
  BLOCKS.filter((b) => `${b.name} ${b.type}`.toLowerCase().includes(query)).forEach((b) => {
    const el = document.createElement("div");
    el.className = "block-card";
    el.innerHTML = `<div class="block-icon" style="background:${b.color}">•</div><div><div>${b.name}</div><div style="font-size:12px;opacity:.7">${b.type}</div></div>`;
    el.onclick = () => createNode(b);
    library.appendChild(el);
  });
}

function createNode(def) {
  const node = document.createElement("div");
  node.className = "node";
  node.style.left = 120 + Math.floor(Math.random() * 160) + "px";
  node.style.top = 120 + Math.floor(Math.random() * 160) + "px";

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  node.dataset.id = id;

  node.innerHTML = `<div class="node-header" style="background:${def.color}">${def.name}<button class="node-remove">✕</button></div><div class="node-body"></div><div class="node-port in"></div><div class="node-port out"></div>`;

  const body = node.querySelector(".node-body");
  const params = { nodeId: id, type: def.type };

  def.fields.forEach((f) => {
    const wrap = document.createElement("div");
    wrap.className = "node-field";
    wrap.innerHTML = `<label>${f.label || f.key}</label>`;
    const input = document.createElement(f.type === "textarea" ? "textarea" : "input");
    input.type = f.type && f.type !== "textarea" ? f.type : "text";
    input.placeholder = f.label || f.key;
    input.oninput = () => params[f.key] = input.value;
    wrap.appendChild(input);
    body.appendChild(wrap);
  });

  node.querySelector(".node-remove").onclick = (e) => {
    e.stopPropagation();
    node.remove();
    nodes = nodes.filter(n => n.id !== id);
    connections = connections.filter(c => c.from !== id && c.to !== id);
    renderConnections();
  };

  enableDrag(node);
  enablePorts(node);

  canvas.appendChild(node);
  nodes.push({ id, def, params, el: node });
}

function enableDrag(node) {
  const header = node.querySelector(".node-header");
  header.onmousedown = (e) => {
    if (e.target.closest("button")) return;
    dragState = { node, offsetX: e.clientX - node.offsetLeft, offsetY: e.clientY - node.offsetTop };
  };
}

document.onmousemove = (e) => {
  if (!dragState) return;
  dragState.node.style.left = e.clientX - dragState.offsetX + "px";
  dragState.node.style.top = e.clientY - dragState.offsetY + "px";
  renderConnections();
};

document.onmouseup = () => dragState = null;

function enablePorts(node) {
  node.querySelector(".node-port.out").onclick = (e) => {
    e.stopPropagation();
    connectState = node.dataset.id;
  };
  node.querySelector(".node-port.in").onclick = (e) => {
    e.stopPropagation();
    if (!connectState || connectState === node.dataset.id) return;
    connections.push({ from: connectState, to: node.dataset.id });
    connectState = null;
    renderConnections();
  };
}

function renderConnections() {
  document.querySelectorAll(".connection-line").forEach(el => el.remove());
  connections.forEach(c => {
    const fromNode = nodes.find(n => n.id === c.from)?.el;
    const toNode = nodes.find(n => n.id === c.to)?.el;
    if (!fromNode || !toNode) return;
    const line = document.createElement("div");
    line.className = "connection-line";
    const x1 = fromNode.offsetLeft + fromNode.offsetWidth / 2;
    const y1 = fromNode.offsetTop + fromNode.offsetHeight;
    const x2 = toNode.offsetLeft + toNode.offsetWidth / 2;
    const y2 = toNode.offsetTop;
    const dx = x2 - x1;
    const dy = y2 - y1;
    line.style.width = Math.sqrt(dx * dx + dy * dy) + "px";
    line.style.left = x1 + "px";
    line.style.top = y1 + "px";
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    canvas.appendChild(line);
  });
}

function startTutorial() {
  tutorial.innerHTML = `<h3>Tutorial</h3><p>Search for message, role, channel, category, ping, condition, or moderation blocks. Add them, connect them, then save the feature.</p>`;
}

saveBtn.onclick = async () => {
  const name = nameInput.value || "Untitled Feature";
  const payload = { name, f: nodes.map(n => n.def.id), p: nodes.map(n => n.params), c: connections };
  const res = await fetch(`/api/guild/${window.guildId}/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return alert("Failed to save feature");
  alert("Saved feature");
};

if (searchInput) searchInput.addEventListener("input", () => createLibrary(searchInput.value));
createLibrary();
startTutorial();
