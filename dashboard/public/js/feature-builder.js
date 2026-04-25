const canvas = document.getElementById("builderCanvas");
const library = document.getElementById("blockLibrary");
const tutorial = document.getElementById("tutorialBox");
const saveBtn = document.getElementById("saveFeatureBtn");
const nameInput = document.getElementById("featureName");
const searchInput = document.querySelector(".block-search");

const COLORS = {
  trigger: "#a855f7",
  action: "#3b82f6",
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
  { id: "command_trigger", name: "Custom Command Trigger", type: "trigger", color: COLORS.trigger, fields: [{ key: "command", label: "Command name" }] },
  { id: "member_join", name: "When Member Joins", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "member_leave", name: "When Member Leaves", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "role_given", name: "When Role Is Given", type: "trigger", color: COLORS.trigger, fields: [{ key: "role", label: "Role ID" }] },
  { id: "reaction_added", name: "When Reaction Added", type: "trigger", color: COLORS.trigger, fields: [{ key: "emoji", label: "Emoji" }, { key: "message", label: "Message ID" }] },

  // Message actions
  { id: "send_message", name: "Send Message", type: "action", color: COLORS.action, fields: [{ key: "channel", label: "Channel ID" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "reply_message", name: "Reply To Message", type: "action", color: COLORS.action, fields: [{ key: "message", label: "Reply text", type: "textarea" }] },
  { id: "dm_user", name: "DM User", type: "action", color: COLORS.action, fields: [{ key: "message", label: "DM message", type: "textarea" }] },
  { id: "send_embed", name: "Send Embed", type: "action", color: COLORS.action, fields: [{ key: "channel", label: "Channel ID" }, { key: "title", label: "Embed title" }, { key: "description", label: "Embed description", type: "textarea" }, { key: "color", label: "Hex color" }] },
  { id: "delete_trigger", name: "Delete Trigger Message", type: "action", color: COLORS.action, fields: [] },
  { id: "react", name: "React To Message", type: "action", color: COLORS.action, fields: [{ key: "emoji", label: "Emoji" }] },
  { id: "send_webhook", name: "Send Webhook", type: "action", color: COLORS.action, fields: [{ key: "url", label: "Webhook URL" }, { key: "message", label: "Message", type: "textarea" }] },

  // Role/member actions
  { id: "add_role", name: "Add Role", type: "action", color: COLORS.action, fields: [{ key: "role", label: "Role ID" }] },
  { id: "remove_role", name: "Remove Role", type: "action", color: COLORS.action, fields: [{ key: "role", label: "Role ID" }] },
  { id: "toggle_role", name: "Toggle Role", type: "action", color: COLORS.action, fields: [{ key: "role", label: "Role ID" }] },
  { id: "set_nickname", name: "Set Nickname", type: "action", color: COLORS.action, fields: [{ key: "nickname", label: "Nickname" }] },
  { id: "timeout_user", name: "Timeout User", type: "moderation", color: COLORS.moderation, fields: [{ key: "minutes", label: "Minutes", type: "number" }, { key: "reason", label: "Reason" }] },
  { id: "kick_user", name: "Kick User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "ban_user", name: "Ban User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "warn_user", name: "Warn User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },

  // Channel/server actions
  { id: "create_channel", name: "Create Channel", type: "action", color: COLORS.action, fields: [{ key: "name", label: "Channel name" }, { key: "type", label: "Type: text / voice" }] },
  { id: "delete_channel", name: "Delete Channel", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "lock_channel", name: "Lock Channel", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "unlock_channel", name: "Unlock Channel", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "slowmode", name: "Set Slowmode", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID" }, { key: "seconds", label: "Seconds", type: "number" }] },
  { id: "rename_channel", name: "Rename Channel", type: "action", color: COLORS.action, fields: [{ key: "channel", label: "Channel ID" }, { key: "name", label: "New name" }] },

  // Logic/conditions
  { id: "wait", name: "Wait", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds", type: "number" }] },
  { id: "if_role", name: "If User Has Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_no_role", name: "If User Does Not Have Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_channel", name: "If In Channel", type: "condition", color: COLORS.condition, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "if_user_id", name: "If User ID Is", type: "condition", color: COLORS.condition, fields: [{ key: "user", label: "User ID" }] },
  { id: "if_random", name: "Random Chance", type: "condition", color: COLORS.condition, fields: [{ key: "chance", label: "Chance %", type: "number" }] },
  { id: "stop_flow", name: "Stop Flow", type: "utility", color: COLORS.utility, fields: [] },

  // Data/counters
  { id: "set_variable", name: "Set Variable", type: "data", color: COLORS.data, fields: [{ key: "name", label: "Variable name" }, { key: "value", label: "Value" }] },
  { id: "increase_variable", name: "Increase Variable", type: "data", color: COLORS.data, fields: [{ key: "name", label: "Variable name" }, { key: "amount", label: "Amount", type: "number" }] },
  { id: "if_variable_equals", name: "If Variable Equals", type: "condition", color: COLORS.condition, fields: [{ key: "name", label: "Variable name" }, { key: "value", label: "Value" }] },
  { id: "cooldown", name: "Cooldown", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds", type: "number" }] },
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
  tutorial.innerHTML = `<h3>Tutorial</h3><p>Add a trigger like “When Message Contains”, connect actions like Add Role, Send Message, Wait, and save it as a custom feature.</p>`;
}

saveBtn.onclick = async () => {
  const name = nameInput.value || "Untitled Feature";
  const payload = {
    name,
    f: nodes.map(n => n.def.id),
    p: nodes.map(n => n.params),
    c: connections
  };

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
