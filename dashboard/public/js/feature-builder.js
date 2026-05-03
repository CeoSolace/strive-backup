// dashboard/public/js/feature-builder.js

const canvas = document.getElementById("builderCanvas");
const library = document.getElementById("blockLibrary");
const tutorial = document.getElementById("tutorialBox");
const saveBtn = document.getElementById("saveFeatureBtn");
const newBtn = document.getElementById("newFeatureBtn");
const nameInput = document.getElementById("featureName");
const searchInput = document.querySelector(".block-search");
const automationList = document.getElementById("automationList");
const blockTabBtns = document.querySelectorAll(".block-tab");
const statusBar = document.getElementById("builderStatus");

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
  { id: "message_regex", name: "When Message Matches Pattern", type: "trigger", color: COLORS.trigger, fields: [{ key: "pattern", label: "Pattern (regex)" }] },
  { id: "command_trigger", name: "Custom Command Trigger", type: "trigger", color: COLORS.trigger, fields: [{ key: "command", label: "Command name (no prefix)" }] },
  { id: "member_join", name: "When Member Joins", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "member_leave", name: "When Member Leaves", type: "trigger", color: COLORS.trigger, fields: [] },
  { id: "role_given", name: "When Role Is Given", type: "trigger", color: COLORS.trigger, fields: [{ key: "role", label: "Role ID" }] },
  { id: "role_removed", name: "When Role Is Removed", type: "trigger", color: COLORS.trigger, fields: [{ key: "role", label: "Role ID" }] },
  { id: "reaction_added", name: "When Reaction Added", type: "trigger", color: COLORS.trigger, fields: [{ key: "emoji", label: "Emoji" }, { key: "message", label: "Message ID" }] },

  // Actions - Message
  { id: "reply_message", name: "Reply To Message", type: "message", color: COLORS.message, fields: [{ key: "message", label: "Reply text", type: "textarea" }] },
  { id: "send_message", name: "Send Message", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "dm_user", name: "DM User", type: "message", color: COLORS.message, fields: [{ key: "message", label: "DM message", type: "textarea" }] },
  { id: "send_embed", name: "Send Embed", type: "message", color: COLORS.message, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "title", label: "Embed title" }, { key: "description", label: "Embed description", type: "textarea" }, { key: "color", label: "Hex color" }] },
  { id: "delete_trigger", name: "Delete Trigger Message", type: "message", color: COLORS.message, fields: [] },
  { id: "react", name: "React To Message", type: "message", color: COLORS.message, fields: [{ key: "emoji", label: "Emoji" }] },

  // Actions - Ping
  { id: "ping_user", name: "Ping User", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "user", label: "User ID (optional)" }, { key: "message", label: "Message", type: "textarea" }] },
  { id: "ping_role", name: "Ping Role", type: "ping", color: COLORS.ping, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "role", label: "Role ID" }, { key: "message", label: "Message", type: "textarea" }] },

  // Actions - Role
  { id: "add_role", name: "Add Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "remove_role", name: "Remove Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },
  { id: "toggle_role", name: "Toggle Role", type: "role", color: COLORS.role, fields: [{ key: "role", label: "Role ID" }] },

  // Actions - Channel
  { id: "lock_channel", name: "Lock Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID (optional)" }] },
  { id: "unlock_channel", name: "Unlock Channel", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID (optional)" }] },
  { id: "slowmode", name: "Set Slowmode", type: "channel", color: COLORS.channel, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "seconds", label: "Seconds", type: "number" }] },
  { id: "create_thread", name: "Create Thread", type: "thread", color: COLORS.thread, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "name", label: "Thread name" }] },

  // Actions - Moderation
  { id: "set_nickname", name: "Set Nickname", type: "moderation", color: COLORS.moderation, fields: [{ key: "nickname", label: "Nickname" }] },
  { id: "timeout_user", name: "Timeout User", type: "moderation", color: COLORS.moderation, fields: [{ key: "minutes", label: "Minutes", type: "number" }, { key: "reason", label: "Reason" }] },
  { id: "kick_user", name: "Kick User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "ban_user", name: "Ban User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "warn_user", name: "Warn User", type: "moderation", color: COLORS.moderation, fields: [{ key: "reason", label: "Reason" }] },
  { id: "purge_messages", name: "Purge Messages", type: "moderation", color: COLORS.moderation, fields: [{ key: "channel", label: "Channel ID (optional)" }, { key: "amount", label: "Amount (max 99)", type: "number" }] },

  // Conditions
  { id: "if_role", name: "If User Has Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_no_role", name: "If User Lacks Role", type: "condition", color: COLORS.condition, fields: [{ key: "role", label: "Role ID" }] },
  { id: "if_channel", name: "If In Channel", type: "condition", color: COLORS.condition, fields: [{ key: "channel", label: "Channel ID" }] },
  { id: "if_user_id", name: "If User ID Is", type: "condition", color: COLORS.condition, fields: [{ key: "user", label: "User ID" }] },
  { id: "if_message_includes", name: "If Message Includes", type: "condition", color: COLORS.condition, fields: [{ key: "text", label: "Text" }] },
  { id: "if_message_has_attachment", name: "If Message Has Attachment", type: "condition", color: COLORS.condition, fields: [] },
  { id: "if_random", name: "Random Chance", type: "condition", color: COLORS.condition, fields: [{ key: "chance", label: "Chance %", type: "number" }] },
  { id: "if_bot", name: "If User Is Bot", type: "condition", color: COLORS.condition, fields: [] },
  { id: "if_not_bot", name: "If User Is Not Bot", type: "condition", color: COLORS.condition, fields: [] },

  // Utility
  { id: "wait", name: "Wait", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds (max 30)", type: "number" }] },
  { id: "cooldown", name: "Per-User Cooldown", type: "utility", color: COLORS.utility, fields: [{ key: "seconds", label: "Seconds", type: "number" }] },
  { id: "stop_flow", name: "Stop Flow", type: "utility", color: COLORS.utility, fields: [] },
];

// ── State ──────────────────────────────────────────────────────────────────
let nodes = [];
let connections = [];
let dragState = null;
let activeTab = "option"; // option = triggers
let currentAutomationId = null; // null = new
let allAutomations = [];

// ── CSRF ──────────────────────────────────────────────────────────────────
async function getCsrfToken() {
  try {
    const res = await fetch("/api/csrf", { credentials: "same-origin" });
    const data = await res.json();
    return data.csrfToken || "";
  } catch {
    return "";
  }
}

// ── Status bar ────────────────────────────────────────────────────────────
function setStatus(msg, type = "info") {
  if (!statusBar) return;
  statusBar.textContent = msg;
  statusBar.className = `builder-status builder-status--${type}`;
  if (type === "success" || type === "error") {
    setTimeout(() => { statusBar.textContent = ""; statusBar.className = "builder-status"; }, 3000);
  }
}

// ── Library rendering ─────────────────────────────────────────────────────
const TAB_TYPES = {
  option: ["trigger"],
  action: ["message", "role", "channel", "ping", "thread", "invite", "moderation", "utility"],
  condition: ["condition", "data"],
};

function createLibrary(filter = "") {
  if (!library) return;
  library.innerHTML = "";
  const query = filter.toLowerCase();
  const allowedTypes = TAB_TYPES[activeTab] || [];

  BLOCKS
    .filter((b) => {
      const matchesTab = allowedTypes.includes(b.type);
      const matchesSearch = query ? `${b.name} ${b.type}`.toLowerCase().includes(query) : true;
      return matchesTab && matchesSearch;
    })
    .forEach((b) => {
      const el = document.createElement("div");
      el.className = "block-card";
      el.draggable = true;
      el.innerHTML = `
        <div class="block-icon" style="background:${b.color}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="18" height="18" rx="4"/>
          </svg>
        </div>
        <div>
          <div style="font-size:13px;font-weight:600">${b.name}</div>
          <div style="font-size:11px;opacity:.55;text-transform:capitalize;margin-top:2px">${b.type}</div>
        </div>`;
      el.onclick = () => createNode(b);
      el.ondragstart = (e) => {
        e.dataTransfer.setData("blockId", b.id);
      };
      library.appendChild(el);
    });
}

// ── Node creation ─────────────────────────────────────────────────────────
function createNode(def, savedParams = {}, position = null) {
  const node = document.createElement("div");
  node.className = "node";

  const rect = canvas.getBoundingClientRect();
  const left = position ? position.left : 80 + Math.floor(Math.random() * 200);
  const top = position ? position.top : 80 + Math.floor(Math.random() * 200);
  node.style.left = left + "px";
  node.style.top = top + "px";

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  node.dataset.id = id;

  node.innerHTML = `
    <div class="node-header" style="background:${def.color}20;border-bottom:2px solid ${def.color}">
      <div class="node-header-dot" style="background:${def.color}"></div>
      <span style="font-weight:700;font-size:13px">${def.name}</span>
      <button class="node-remove" title="Remove block" aria-label="Remove">✕</button>
    </div>
    <div class="node-body"></div>
    <div class="node-port in" title="Connect input"></div>
    <div class="node-port out" title="Connect output"></div>`;

  const body = node.querySelector(".node-body");
  const params = { nodeId: id, type: def.type, blockId: def.id };

  // Restore saved params
  Object.assign(params, savedParams);

  def.fields.forEach((f) => {
    const wrap = document.createElement("div");
    wrap.className = "node-field";
    wrap.innerHTML = `<label>${f.label || f.key}</label>`;

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : "text";
    }
    input.placeholder = f.label || f.key;
    if (savedParams[f.key] !== undefined) input.value = savedParams[f.key];
    input.oninput = () => { params[f.key] = input.value; };
    wrap.appendChild(input);
    body.appendChild(wrap);
  });

  node.querySelector(".node-remove").onclick = (e) => {
    e.stopPropagation();
    node.remove();
    nodes = nodes.filter((n) => n.id !== id);
    connections = connections.filter((c) => c.from !== id && c.to !== id);
    renderConnections();
  };

  enableDrag(node);
  enablePorts(node);
  canvas.appendChild(node);
  nodes.push({ id, def, params, el: node });
  return id;
}

// ── Canvas drag-drop ──────────────────────────────────────────────────────
canvas.addEventListener("dragover", (e) => e.preventDefault());
canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const blockId = e.dataTransfer.getData("blockId");
  const def = BLOCKS.find((b) => b.id === blockId);
  if (!def) return;
  const rect = canvas.getBoundingClientRect();
  createNode(def, {}, { left: e.clientX - rect.left - 155, top: e.clientY - rect.top - 20 });
});

// ── Node dragging ─────────────────────────────────────────────────────────
function enableDrag(node) {
  const header = node.querySelector(".node-header");
  header.onmousedown = (e) => {
    if (e.target.closest("button")) return;
    dragState = { node, offsetX: e.clientX - node.offsetLeft, offsetY: e.clientY - node.offsetTop };
  };
}

document.onmousemove = (e) => {
  if (!dragState) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - dragState.offsetX, canvas.offsetWidth - dragState.node.offsetWidth));
  const y = Math.max(0, Math.min(e.clientY - dragState.offsetY, canvas.offsetHeight - dragState.node.offsetHeight));
  dragState.node.style.left = x + "px";
  dragState.node.style.top = y + "px";
  renderConnections();
};
document.onmouseup = () => { dragState = null; };

// ── Port connections ──────────────────────────────────────────────────────
let connectState = null;

function enablePorts(node) {
  node.querySelector(".node-port.out").onclick = (e) => {
    e.stopPropagation();
    if (connectState === node.dataset.id) { connectState = null; return; }
    connectState = node.dataset.id;
    setStatus("Click an input port on another block to connect", "info");
  };
  node.querySelector(".node-port.in").onclick = (e) => {
    e.stopPropagation();
    if (!connectState || connectState === node.dataset.id) { connectState = null; return; }
    // Prevent duplicate connections
    const alreadyConnected = connections.some((c) => c.from === connectState && c.to === node.dataset.id);
    if (!alreadyConnected) {
      connections.push({ from: connectState, to: node.dataset.id });
      renderConnections();
    }
    connectState = null;
    setStatus("");
  };
}

function renderConnections() {
  document.querySelectorAll(".connection-line").forEach((el) => el.remove());
  connections.forEach((c) => {
    const fromNode = nodes.find((n) => n.id === c.from)?.el;
    const toNode = nodes.find((n) => n.id === c.to)?.el;
    if (!fromNode || !toNode) return;

    const line = document.createElement("div");
    line.className = "connection-line";
    const x1 = fromNode.offsetLeft + fromNode.offsetWidth / 2;
    const y1 = fromNode.offsetTop + fromNode.offsetHeight;
    const x2 = toNode.offsetLeft + toNode.offsetWidth / 2;
    const y2 = toNode.offsetTop;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    line.style.width = len + "px";
    line.style.left = x1 + "px";
    line.style.top = y1 + "px";
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    canvas.appendChild(line);
  });
}

// ── Automation list ───────────────────────────────────────────────────────
async function loadAutomations() {
  if (!automationList) return;
  try {
    const res = await fetch(`/api/guild/${window.guildId}/builder/automations`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    allAutomations = data.items || [];
    renderAutomationList();
  } catch (e) {
    automationList.innerHTML = `<div class="automation-list-empty">Failed to load automations.</div>`;
  }
}

function renderAutomationList() {
  if (!automationList) return;
  if (allAutomations.length === 0) {
    automationList.innerHTML = `<div class="automation-list-empty">No automations yet. Click <strong>New</strong> to create one.</div>`;
    return;
  }
  automationList.innerHTML = allAutomations.map((a) => `
    <div class="automation-list-item ${currentAutomationId === String(a._id) ? "active" : ""}" data-id="${a._id}">
      <div class="automation-list-item-info">
        <span class="automation-list-name">${escapeHtml(a.name)}</span>
        <span class="automation-list-blocks">${a.f?.length || 0} blocks</span>
      </div>
      <div class="automation-list-actions">
        <button class="al-toggle ${a.enabled ? "enabled" : "disabled"}" data-id="${a._id}" title="${a.enabled ? "Disable" : "Enable"}">
          ${a.enabled ? "●" : "○"}
        </button>
        <button class="al-delete" data-id="${a._id}" title="Delete">✕</button>
      </div>
    </div>`).join("");

  // Click to load
  automationList.querySelectorAll(".automation-list-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const id = el.dataset.id;
      const auto = allAutomations.find((a) => String(a._id) === id);
      if (auto) loadAutomationIntoBuilder(auto);
    });
  });

  // Toggle enabled
  automationList.querySelectorAll(".al-toggle").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const token = await getCsrfToken();
      try {
        const res = await fetch(`/api/guild/${window.guildId}/builder/automations/${id}/toggle`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const idx = allAutomations.findIndex((a) => String(a._id) === id);
        if (idx !== -1) allAutomations[idx].enabled = data.item.enabled;
        renderAutomationList();
        setStatus(`Automation ${data.item.enabled ? "enabled" : "disabled"}`, "success");
      } catch {
        setStatus("Failed to toggle automation", "error");
      }
    });
  });

  // Delete
  automationList.querySelectorAll(".al-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this automation?")) return;
      const id = btn.dataset.id;
      const token = await getCsrfToken();
      try {
        const res = await fetch(`/api/guild/${window.guildId}/builder/automations/${id}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "X-CSRF-Token": token },
        });
        if (!res.ok) throw new Error();
        allAutomations = allAutomations.filter((a) => String(a._id) !== id);
        if (currentAutomationId === id) clearBuilder();
        renderAutomationList();
        setStatus("Automation deleted", "success");
      } catch {
        setStatus("Failed to delete automation", "error");
      }
    });
  });
}

function loadAutomationIntoBuilder(auto) {
  clearCanvas();
  currentAutomationId = String(auto._id);
  nameInput.value = auto.name || "";

  const blockIds = auto.f || [];
  const blockParams = auto.p || [];

  // Stagger positions
  const cols = 3;
  blockIds.forEach((blockId, i) => {
    const def = BLOCKS.find((b) => b.id === blockId);
    if (!def) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    createNode(def, blockParams[i] || {}, {
      left: 40 + col * 340,
      top: 60 + row * 200,
    });
  });

  // Restore connections
  const savedConnections = auto.c || [];
  // Connections reference block indexes since node IDs are regenerated;
  // store them by index mapping
  if (savedConnections.length && nodes.length >= 2) {
    savedConnections.forEach((conn) => {
      if (typeof conn.fromIdx === "number" && typeof conn.toIdx === "number") {
        const fromNode = nodes[conn.fromIdx];
        const toNode = nodes[conn.toIdx];
        if (fromNode && toNode) {
          connections.push({ from: fromNode.id, to: toNode.id });
        }
      }
    });
    renderConnections();
  }

  updateBuilderTitle();
  renderAutomationList();
}

function clearCanvas() {
  nodes.forEach((n) => n.el.remove());
  nodes = [];
  connections = [];
  document.querySelectorAll(".connection-line").forEach((el) => el.remove());
}

function clearBuilder() {
  clearCanvas();
  currentAutomationId = null;
  nameInput.value = "";
  updateBuilderTitle();
}

function updateBuilderTitle() {
  const titleEl = document.getElementById("builderCurrentTitle");
  if (titleEl) {
    titleEl.textContent = currentAutomationId ? `Editing: ${nameInput.value || "Untitled"}` : "New Automation";
  }
}

// ── Save ──────────────────────────────────────────────────────────────────
if (saveBtn) {
  saveBtn.onclick = async () => {
    const name = (nameInput.value || "").trim();
    if (!name) { setStatus("Please enter a name for this automation", "error"); nameInput.focus(); return; }
    if (nodes.length === 0) { setStatus("Add at least one block", "error"); return; }

    // Check there's at least one trigger block
    const hasTrigger = nodes.some((n) => TAB_TYPES.option.includes(n.def.type));
    if (!hasTrigger) { setStatus("You need at least one trigger block (e.g. When Message Contains)", "error"); return; }

    // Build connection index map (by node array position)
    const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));
    const indexedConnections = connections
      .map((c) => ({ fromIdx: nodeIndexMap.get(c.from), toIdx: nodeIndexMap.get(c.to) }))
      .filter((c) => c.fromIdx !== undefined && c.toIdx !== undefined);

    const payload = {
      name,
      f: nodes.map((n) => n.def.id),
      p: nodes.map((n) => {
        const { nodeId, type, blockId, ...rest } = n.params;
        return rest;
      }),
      c: indexedConnections,
    };

    try {
      saveBtn.disabled = true;
      setStatus("Saving...", "info");
      const token = await getCsrfToken();
      const isUpdate = !!currentAutomationId;
      const url = isUpdate
        ? `/api/guild/${window.guildId}/builder/automations/${currentAutomationId}`
        : `/api/guild/${window.guildId}/builder/automations`;
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      currentAutomationId = String(data.item._id);
      // Update local list
      const idx = allAutomations.findIndex((a) => String(a._id) === currentAutomationId);
      if (idx !== -1) allAutomations[idx] = data.item;
      else allAutomations.unshift(data.item);

      renderAutomationList();
      updateBuilderTitle();
      setStatus(isUpdate ? "Automation updated ✓" : "Automation created ✓", "success");
    } catch (e) {
      setStatus(e.message || "Failed to save", "error");
    } finally {
      saveBtn.disabled = false;
    }
  };
}

// ── New button ────────────────────────────────────────────────────────────
if (newBtn) {
  newBtn.onclick = () => {
    if (nodes.length > 0 && !confirm("Discard current canvas and start new?")) return;
    clearBuilder();
  };
}

// ── Tab switching ─────────────────────────────────────────────────────────
blockTabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    blockTabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.type || "option";
    createLibrary(searchInput?.value || "");
  });
});

// ── Search ────────────────────────────────────────────────────────────────
if (searchInput) {
  searchInput.addEventListener("input", () => {
    // When searching, show all tabs
    createLibrary(searchInput.value);
  });
}

// ── Tutorial ──────────────────────────────────────────────────────────────
function closeTutorial() {
  if (tutorial) tutorial.classList.add("hidden");
  try { localStorage.setItem("brightBuilderTutorialV2", "1"); } catch {}
}

function startTutorial() {
  try { if (localStorage.getItem("brightBuilderTutorialV2") === "1") { tutorial?.classList.add("hidden"); return; } } catch {}
  if (!tutorial) return;
  tutorial.classList.remove("hidden");
  tutorial.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <strong style="font-size:14px">⚡ Automation Builder</strong>
      <button type="button" style="background:none;border:0;color:#fff;cursor:pointer;font-size:16px" aria-label="Close">✕</button>
    </div>
    <p style="font-size:13px;opacity:.85;line-height:1.6;margin:0 0 12px">
      1. Pick a <strong>Trigger</strong> block (e.g. "When Message Contains").<br>
      2. Optionally add <strong>Condition</strong> blocks to filter.<br>
      3. Add <strong>Action</strong> blocks to define what happens.<br>
      4. Name your automation and hit <strong>Save</strong>.
    </p>
    <button type="button" class="builder-btn muted" style="font-size:12px;padding:6px 12px">Got it</button>`;
  tutorial.querySelector("button[aria-label='Close']")?.addEventListener("click", closeTutorial);
  tutorial.querySelector(".builder-btn")?.addEventListener("click", closeTutorial);
}

// ── Helper ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

// ── Init ──────────────────────────────────────────────────────────────────
createLibrary();
loadAutomations();
startTutorial();
