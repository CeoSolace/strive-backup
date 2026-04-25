const canvas = document.getElementById("builderCanvas");
const library = document.getElementById("blockLibrary");
const tutorial = document.getElementById("tutorialBox");
const saveBtn = document.getElementById("saveFeatureBtn");

const BLOCKS = [
  { id: "send_message", name: "Send or Edit a Message", type: "action", color: "#3b82f6", fields: [
    { key: "channel", label: "Channel ID" },
    { key: "message", label: "Message", type: "textarea" }
  ]},
  { id: "wait", name: "Wait", type: "action", color: "#3b82f6", fields: [
    { key: "seconds", label: "Seconds", type: "number" }
  ]},
  { id: "if_role", name: "If Member Has Role", type: "condition", color: "#22c55e", fields: [
    { key: "role", label: "Role ID" }
  ]}
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
    el.innerHTML = `<div class="block-icon" style="background:${b.color}">•</div><div><div>${b.name}</div><div style="font-size:12px;opacity:.7">${b.type}</div></div>`;
    el.onclick = () => createNode(b);
    library.appendChild(el);
  });
}

function createNode(def) {
  const node = document.createElement("div");
  node.className = "node";
  node.style.left = 120 + Math.random()*120 + "px";
  node.style.top = 120 + Math.random()*120 + "px";

  const id = Date.now().toString();
  node.dataset.id = id;

  node.innerHTML = `
    <div class="node-header" style="background:${def.color}">
      <span>${def.name}</span>
      <button class="node-remove">✕</button>
    </div>
    <div class="node-body"></div>
    <div class="node-port in"></div>
    <div class="node-port out"></div>
  `;

  const body = node.querySelector(".node-body");
  const params = {};

  def.fields.forEach((f) => {
    const wrap = document.createElement("div");
    wrap.className = "node-field";
    wrap.innerHTML = `<label>${f.label}</label>`;

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
    } else {
      input = document.createElement("input");
      input.type = f.type || "text";
    }

    input.oninput = () => params[f.key] = input.value;
    wrap.appendChild(input);
    body.appendChild(wrap);
  });

  node.querySelector(".node-remove").onclick = () => {
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
    dragState = {
      node,
      offsetX: e.clientX - node.offsetLeft,
      offsetY: e.clientY - node.offsetTop
    };
  };

  document.onmousemove = (e) => {
    if (!dragState) return;
    const { node, offsetX, offsetY } = dragState;
    node.style.left = e.clientX - offsetX + "px";
    node.style.top = e.clientY - offsetY + "px";
    renderConnections();
  };

  document.onmouseup = () => dragState = null;
}

function enablePorts(node) {
  const out = node.querySelector(".node-port.out");
  const input = node.querySelector(".node-port.in");

  out.onclick = (e) => {
    e.stopPropagation();
    connectState = { from: node.dataset.id };
  };

  input.onclick = (e) => {
    e.stopPropagation();
    if (!connectState) return;
    connections.push({ from: connectState.from, to: node.dataset.id });
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
    const dist = Math.sqrt(dx*dx + dy*dy);

    line.style.width = dist + "px";
    line.style.left = x1 + "px";
    line.style.top = y1 + "px";
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;

    canvas.appendChild(line);
  });
}

function startTutorial() {
  let step = 0;
  const steps = [
    "Click a block on the left to add it.",
    "Drag blocks around the canvas.",
    "Connect blocks using the dots.",
    "Click save when you're done."
  ];

  tutorial.onclick = () => {
    step++;
    if (step >= steps.length) return tutorial.classList.add("hidden");
    tutorial.querySelector("p").innerText = steps[step];
  };

  tutorial.querySelector("p").innerText = steps[0];
}

saveBtn.onclick = async () => {
  const payload = nodes.map(n => ({ id: n.def.id, params: n.params }));

  await fetch(`/api/guild/${window.guildId}/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "flow", f: payload.map(p=>p.id), p: payload.map(p=>p.params) })
  });

  alert("Saved");
};

createLibrary();
startTutorial();
