const canvas = document.getElementById("builderCanvas");
const library = document.getElementById("blockLibrary");
const tutorial = document.getElementById("tutorialBox");
const saveBtn = document.getElementById("saveFeatureBtn");
const nameInput = document.getElementById("featureName");

const BLOCKS = [
  { id: "message_trigger", name: "When Message Contains", type: "trigger", color: "#a855f7", fields: [{ key: "text", label: "Message contains" }] },
  { id: "send_message", name: "Send Message", type: "action", color: "#3b82f6", fields: [{ key: "channel" }, { key: "message", type: "textarea" }] },
  { id: "wait", name: "Wait", type: "action", color: "#3b82f6", fields: [{ key: "seconds", type: "number" }] },
  { id: "add_role", name: "Add Role", type: "action", color: "#3b82f6", fields: [{ key: "role" }] },
  { id: "remove_role", name: "Remove Role", type: "action", color: "#3b82f6", fields: [{ key: "role" }] }
];

let nodes = [];
let connections = [];
let dragState = null;
let connectState = null;

function createLibrary() {
  library.innerHTML = "";
  BLOCKS.forEach((b) => {
    const el = document.createElement("div");
    el.className = "block-card";
    el.innerHTML = `<div class="block-icon" style="background:${b.color}">•</div><div>${b.name}</div>`;
    el.onclick = () => createNode(b);
    library.appendChild(el);
  });
}

function createNode(def) {
  const node = document.createElement("div");
  node.className = "node";
  node.style.left = "120px";
  node.style.top = "120px";

  const id = Date.now().toString();
  node.dataset.id = id;

  node.innerHTML = `<div class="node-header" style="background:${def.color}">${def.name}<button class="node-remove">✕</button></div><div class="node-body"></div><div class="node-port in"></div><div class="node-port out"></div>`;

  const body = node.querySelector(".node-body");
  const params = {};

  def.fields.forEach((f) => {
    const input = document.createElement(f.type === "textarea" ? "textarea" : "input");
    input.placeholder = f.label || f.key;
    input.oninput = () => params[f.key] = input.value;
    body.appendChild(input);
  });

  node.querySelector(".node-remove").onclick = () => {
    node.remove();
    nodes = nodes.filter(n => n.id !== id);
  };

  enableDrag(node);
  enablePorts(node);

  canvas.appendChild(node);
  nodes.push({ id, def, params });
}

function enableDrag(node) {
  node.onmousedown = (e) => {
    dragState = { node, offsetX: e.clientX - node.offsetLeft, offsetY: e.clientY - node.offsetTop };
  };

  document.onmousemove = (e) => {
    if (!dragState) return;
    dragState.node.style.left = e.clientX - dragState.offsetX + "px";
    dragState.node.style.top = e.clientY - dragState.offsetY + "px";
  };

  document.onmouseup = () => dragState = null;
}

function enablePorts(node) {
  node.querySelector(".node-port.out").onclick = () => connectState = node.dataset.id;
  node.querySelector(".node-port.in").onclick = () => {
    if (!connectState) return;
    connections.push({ from: connectState, to: node.dataset.id });
    connectState = null;
  };
}

saveBtn.onclick = async () => {
  const name = nameInput.value || "Untitled";

  await fetch(`/api/guild/${window.guildId}/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      f: nodes.map(n => n.def.id),
      p: nodes.map(n => n.params),
      c: connections
    })
  });

  alert("Saved feature");
};

function startTutorial() {
  tutorial.innerHTML = `<h3>Tutorial</h3><p>1. Add trigger → 2. Add actions → 3. Connect → 4. Save</p>`;
}

createLibrary();
startTutorial();
