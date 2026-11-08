// worldedit.js - the world editor, the same one for the farm and for the hubs. A host says what the world is; everything here only asks it.
// host = { title, scope, base, camera, dom, scene, layer, heightAt(wx, wz), zoneAt(wx, wz), zones(), speed, enter(tick), leave(), api, existing? }
// Placing works like furniture in the main room: what you place is picked up, dragged over the ground, and turned; the arrows and rings
// (like UniMate's) move and turn it along one axis at a time.
import * as THREE from "three";
import { HOLE_SHAPES, MATERIALS, MAT_IDS, shapeEdge } from "./worldsculpt.js";
import { SHAPES, SURFACES, shapeMesh, store, surfaceSwatch } from "./worldlayer.js";
import { CATEGORIES, SCATTER_SETS, firstScale, listModels, makeModel, makePreviews } from "./worldlibrary.js";

const CSS = `
.we-root{position:fixed;inset:0;z-index:2147480000;pointer-events:none;font:13px/1.3 system-ui,"Segoe UI",sans-serif;color:#f3f1ec}
.we-root *{box-sizing:border-box}.we-root [hidden]{display:none!important}
.we-view{position:absolute;inset:0;pointer-events:auto;cursor:crosshair;touch-action:none}
.we-panel{position:absolute;left:10px;top:10px;bottom:10px;width:300px;display:flex;flex-direction:column;gap:8px;pointer-events:auto}
.we-box{border-radius:8px;padding:8px;background:rgba(18,16,20,.93)}
.we-file{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:4px;align-items:center}.we-file b{flex:1 1 100%;font-size:12px}
.we-terra{border:3px solid #e0322c;overflow:auto;flex:0 1 auto;max-height:54%;min-height:90px}
.we-assets{border:3px solid #000;background:#050505;flex:1 1 0;min-height:210px;display:flex;flex-direction:column}
.we-box h4{margin:2px 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#d8d3c8}
.we-row{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:6px}.we-row>span{font-size:12px;color:#cfc9bd;margin-right:2px}
.we-root button,.we-root select,.we-root input[type=search]{font:inherit;color:#f3f1ec;background:#2c2a31;border:1px solid #4c4953;border-radius:5px;padding:3px 6px;min-height:26px}
.we-root button{cursor:pointer}.we-root button:hover{background:#3d3a44}.we-root button.on{background:#b5472f;border-color:#f0795c;color:#fff}.we-root button:disabled{opacity:.4;cursor:default}
.we-root button:focus-visible,.we-root select:focus-visible,.we-root input:focus-visible{outline:2px solid #ffd479;outline-offset:1px}
.we-slider{display:grid;grid-template-columns:62px 1fr 42px;gap:5px;align-items:center;margin-bottom:3px;font-size:12px;line-height:18px}.we-slider input{width:100%;min-width:0;height:16px;margin:0}.we-slider output{text-align:right;font-variant-numeric:tabular-nums}
.we-root button.we-swatch{width:28px;height:26px;padding:0;border-radius:5px;background-size:cover}.we-root button.we-swatch.on{outline:2px solid #fff;outline-offset:1px}
.we-filter{display:flex;gap:4px;margin-bottom:5px}.we-filter .we-dd,.we-filter input{flex:1 1 0;min-width:0;width:100%}
.we-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;flex:1 1 auto;min-height:0;align-content:start;overflow:hidden}
.we-root .we-tile{aspect-ratio:1;padding:0;background:#1b1a1f;overflow:hidden;position:relative;border:1px solid #3a3840;border-radius:5px}
.we-tile img{width:100%;height:100%;object-fit:contain;display:block}.we-tile span{position:absolute;inset:auto 2px 2px 2px;font-size:10px;line-height:1.1;max-height:2.2em;overflow:hidden;color:#cfcac0;text-shadow:0 1px 2px #000}
.we-root .we-tile.on{outline:2px solid #ffd479}.we-root .we-tile.in{outline:2px solid #7fe07a}
.we-turn{display:flex;align-items:flex-end;justify-content:flex-end;gap:5px;aspect-ratio:1}.we-root .we-turn button{width:34px;height:34px;padding:0}
.we-page{font-size:11px;color:#b9b4a9;margin-top:5px;text-align:right}
.we-root button.we-ax-x{color:#ff8a80}.we-root button.we-ax-y{color:#8fe388}.we-root button.we-ax-z{color:#8fc0ff}.we-root button.we-ax-x.on,.we-root button.we-ax-y.on,.we-root button.we-ax-z.on{color:#fff}
.we-float{position:absolute;display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:430px;background:rgba(18,16,20,.93);border:1px solid #e0ae4a;padding:5px 7px;border-radius:8px;pointer-events:auto;transform:translate(-50%,12px)}
.we-float .we-field{display:flex;flex-direction:column;gap:2px;flex:1 1 180px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#e9c77a}.we-float .we-field select,.we-float .we-field input{font:600 12px Nunito,sans-serif;text-transform:none;letter-spacing:0;background:#26222b;color:#fff;border:1px solid #5a4a2c;border-radius:6px;padding:4px 6px;min-width:0}.we-float .we-field select:focus,.we-float .we-field input:focus{outline:none;border-color:#e0ae4a;box-shadow:0 0 0 2px rgba(224,174,74,.25)}
.we-float b{font-size:12px;margin-right:2px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.we-float .we-slider{width:170px;margin:0}
.we-note{position:absolute;right:10px;bottom:10px;max-width:min(520px,calc(100vw - 330px));background:rgba(18,16,20,.88);padding:6px 9px;border-radius:7px;font-size:12px}
.we-ask{position:absolute;left:50%;top:70px;transform:translateX(-50%);background:#1d1b21;border:2px solid #ffd479;border-radius:9px;padding:12px;pointer-events:auto;max-width:min(440px,calc(100vw - 24px))}.we-ask p{margin:0 0 9px}.we-ask div{display:flex;gap:6px;justify-content:flex-end}
.we-root button.we-dd{display:flex;align-items:center;gap:4px;text-align:left;min-width:0;width:100%}.we-root .we-row button.we-dd{width:auto}.we-dd span{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.we-dd i{font-style:normal;opacity:.7}
.we-menu{position:fixed;z-index:5;display:flex;flex-direction:column;background:#1d1b21;border:1px solid #ffd479;border-radius:6px;padding:3px;overflow:auto;pointer-events:auto;box-shadow:0 6px 18px rgba(0,0,0,.6)}
.we-root .we-menu button{border:0;background:transparent;text-align:left;border-radius:4px;white-space:nowrap;min-height:24px}.we-root .we-menu button:hover,.we-root .we-menu button:focus{background:#3d3a44;outline:0}.we-root .we-menu button.on{background:#b5472f}
.we-head{display:flex;align-items:center;justify-content:space-between}.we-root .we-head button{min-height:22px;padding:0 7px;font-size:12px;text-transform:none;letter-spacing:0}
.we-root .we-folded>:not(.we-head){display:none}.we-root .we-terra.we-folded{flex:0 0 auto;min-height:0;max-height:none}.we-root .we-assets.we-folded{flex:0 0 auto;min-height:0}
.we-panel.we-no-assets .we-terra{max-height:none;flex:1 1 auto}
.we-chosen{font-size:11px;color:#bdb7ab;margin:-2px 0 6px}
@media (max-width:760px){.we-note{display:none}.we-panel{width:240px}}
`;

const h = (tag, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const round = (v, s) => Math.round(v / s) * s;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, TINT = { x: 0xff4a40, y: 0x54d84c, z: 0x4a90ff };
const BRUSHES = [["pencil", "✏️", "Pencil: add spheres of material that join the ground"], ["eraser", "🧽", "Eraser: take spheres out of the ground"], ["flatten", "▭", "Flatten: bring the ground to one height"], ["smooth", "〰️", "Smooth the ground"], ["paint", "🖌️", "Paint: change the material without changing the height"], ["restore", "↺", "Restore: put the world's own ground back under the brush"], ["hole", "🕳️", "Hole: dig a shaped hole, or one right through the land"]];
const BUILD = [["platform", "🟫", "Platform: place a block, round, ramp, stairs or sphere you can size and cover"], ["scatter", "🌱", "Scatter: paint many plants, stones or any models at once"]];
const IS_BRUSH = new Set(["pencil", "eraser", "flatten", "smooth", "paint", "restore", "hole"]);
const PRESETS = [["Wall", { kind: "box", w: 4, h: 3, d: 0.3 }], ["Floor", { kind: "box", w: 4, h: 0.3, d: 4 }], ["Pillar", { kind: "cylinder", w: 0.7, h: 3, d: 0.7 }], ["Steps", { kind: "stairs", w: 2, h: 1.5, d: 3 }]];
const FLY = /^(Key[WASDQEC]|Space)$/;
const colourOf = (id) => `#${MATERIALS[id].color.toString(16).padStart(6, "0")}`;

let clipboard = null;
const CLIP_KEY = "vermeil.worldEditClipboard";
function readClip() { try { return JSON.parse(localStorage.getItem(CLIP_KEY) || "null") || clipboard; } catch { return clipboard; } }
function keepClip(c) { clipboard = c; try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* not remembered: still pastes in this world */ } }

export async function openWorldEditor(host) {
  const { camera, dom, layer } = host;
  if (!document.getElementById("weStyle")) { const s = h("style"); s.id = "weStyle"; s.textContent = CSS; document.head.append(s); }
  const S = {
    tool: "select", mat: "dirt", size: 1.5, shape: { kind: "box", w: 2, h: 1, d: 2, dia: 3, mat: "planks" },
    hole: { shape: "circle", depth: 4, through: false, side: false, tilt: 15, len: 10, turn: 0 },
    scatter: { set: [], count: 12, radius: 3, foot: "circle", size: 1, vary: 0.3, spin: true },
    snap: { on: true, step: 0.5, x: true, y: false, z: true }, rot: { axis: "y", step: 45 }, model: null, scale: 1, turn: { rx: 0, ry: 0, rz: 0 },
    selected: null, more: [], dirty: false, undo: [], redo: [], speed: host.speed || 12,
  };
  const keys = new Set(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), look = new THREE.Euler(0, 0, 0, "YXZ");
  look.setFromQuaternion(camera.quaternion);
  let mouse = null, stroke = null, drag = null, lookDrag = null, ghost = null, ghostFor = 0, hover = null, closed = false, cancelAsk = null, saved = await store.load(host.scope).catch(() => null);

  // ---------------- the panel: the file box, the red box (terraform and build), the black box (assets) ----------------
  const root = h("div", "we-root"), view = h("div", "we-view"), panel = h("div", "we-panel"), file = h("section", "we-box we-file"), terra = h("section", "we-box we-terra"), assets = h("section", "we-box we-assets"), float = h("div", "we-float"), note = h("div", "we-note");
  root.setAttribute("aria-label", `World editor: ${host.title}`);
  note.setAttribute("role", "status"); float.hidden = true;
  panel.append(file, terra, assets); root.append(view, panel, float, note); document.body.append(root);
  const button = (label, title, fn, cls = "") => { const b = h("button", cls, label); b.type = "button"; b.title = title; b.setAttribute("aria-label", title); b.onclick = fn; return b; };
  const toggle = (label, title, on, fn, cls = "") => { const b = button(label, title, fn, `${cls}${on ? " on" : ""}`); b.setAttribute("aria-pressed", on); return b; };
  const say = (t) => { note.textContent = t; };
  // the red and black boxes fold away; remembered on this device
  const fold = (() => { try { return { terra: false, assets: false, ...JSON.parse(localStorage.getItem("vermeil.worldEditFold") || "{}") }; } catch { return { terra: false, assets: false }; } })();
  const showFold = () => {
    terra.classList.toggle("we-folded", !!fold.terra); assets.classList.toggle("we-folded", !!fold.assets);
    panel.classList.toggle("we-no-assets", !!fold.assets && !fold.terra);
    try { localStorage.setItem("vermeil.worldEditFold", JSON.stringify(fold)); } catch { /* private window: just not remembered */ }
  };
  const head = (title, key) => {
    const row = h("h4", "we-head"), b = h("button", "", fold[key] ? "▸ Show" : "▾ Hide");
    b.type = "button"; b.title = `${fold[key] ? "Show" : "Hide"} the ${title.toLowerCase()} box`; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!fold[key]));
    b.onclick = () => {
      fold[key] = !fold[key]; showFold();
      b.textContent = fold[key] ? "▸ Show" : "▾ Hide"; b.title = `${fold[key] ? "Show" : "Hide"} the ${title.toLowerCase()} box`; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!fold[key]));
      requestAnimationFrame(() => fit());
    };
    row.append(h("span", "", title), b);
    return row;
  };
  const slider = (label, min, max, step, get, set, done) => {
    const row = h("label", "we-slider"), input = h("input"), out = h("output");
    Object.assign(input, { type: "range", min, max, step, value: get() });
    const show = () => { out.textContent = (+input.value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0); };
    input.oninput = () => { set(+input.value); show(); };
    input.onchange = () => { done?.(); input.blur(); };
    show(); row.append(h("span", "", label), input, out);
    return row;
  };
  /** A drop-down drawn by the editor itself, on top of everything (the window's own select list could open under the panel). */
  let menu = null;
  const closeMenu = () => { if (!menu) return; const m = menu; menu = null; m.el.remove(); removeEventListener("pointerdown", m.away, true); m.dd.setAttribute("aria-expanded", "false"); };
  const dropdown = (label) => {
    const dd = h("button", "we-dd"), text = h("span"), caret = h("i", "", "▾");
    dd.type = "button"; dd.title = label; dd.setAttribute("aria-label", label); dd.setAttribute("aria-haspopup", "listbox"); dd.setAttribute("aria-expanded", "false");
    dd.append(text, caret);
    let options = [], value = "";
    const show = () => { const o = options.find(([v]) => String(v) === String(value)); text.textContent = o ? o[1] : ""; };
    Object.defineProperty(dd, "value", { get: () => value, set: (v) => { value = String(v); show(); } });
    dd.setOptions = (list, v = value) => { options = list.map(([a, b]) => [String(a), b]); value = String(v); if (!options.some(([a]) => a === value) && options.length) value = options[0][0]; show(); };
    dd.onclick = () => {
      if (menu?.dd === dd) { closeMenu(); return; }
      closeMenu();
      const el = h("div", "we-menu"), r = dd.getBoundingClientRect(), below = innerHeight - r.bottom - 8, above = r.top - 8;
      el.setAttribute("role", "listbox"); el.setAttribute("aria-label", label);
      const down = below >= 160 || below >= above;
      Object.assign(el.style, { left: `${r.left}px`, minWidth: `${r.width}px`, maxWidth: `${Math.max(r.width, innerWidth - r.left - 8)}px`, maxHeight: `${Math.max(120, down ? below : above)}px` });
      if (down) el.style.top = `${r.bottom + 2}px`; else el.style.bottom = `${innerHeight - r.top + 2}px`;
      let on = null;
      for (const [v, t] of options) {
        const b = h("button", String(v) === String(value) ? "on" : "", t); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(v) === String(value));
        b.onclick = () => { closeMenu(); const was = value; value = v; show(); dd.focus(); if (was !== v) dd.onchange?.(); };
        if (String(v) === String(value)) on = b;
        el.append(b);
      }
      el.onkeydown = (e) => {
        const list = [...el.children], i = list.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); dd.focus(); }
        else if (e.key === "Tab") closeMenu();
      };
      const away = (e) => { if (!el.contains(e.target) && e.target !== dd && !dd.contains(e.target)) closeMenu(); };
      menu = { el, dd, away }; root.append(el); dd.setAttribute("aria-expanded", "true");
      addEventListener("pointerdown", away, true);
      (on || el.firstChild)?.focus(); (on || el.firstChild)?.scrollIntoView?.({ block: "nearest" });
    };
    dd.onkeydown = (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault(); e.stopPropagation();
      const i = options.findIndex(([v]) => v === value), j = Math.max(0, Math.min(options.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      if (j !== i && options[j]) { value = options[j][0]; show(); dd.onchange?.(); }
    };
    return dd;
  };
  const choose = (label, options, value, set) => {
    const dd = dropdown(label); dd.setOptions(options, value);
    dd.onchange = () => set(dd.value);
    return dd;
  };

  function drawFile() {
    file.replaceChildren(h("b", "", `🌍 ${host.title}${S.dirty ? " • not saved" : ""}`),
      button("💾 Save", "Save your changes and leave the editor", () => saveNow(true)),
      button("📌 Save current", "Save your changes and keep editing (Ctrl+S)", () => saveNow(false)),
      button("↩ Revert", "Revert to original: back to the world as it was made", () => ask("Put this world back to how it was made? All your edits to it go away, saved ones too.", "Revert", revert)),
      button("✕ Exit", "Leave the editor", () => (S.dirty ? ask("Leave without saving? Changes since your last save go away.", "Leave without saving", discard) : close())));
  }

  /** the surfaces a platform can be covered in: the ground colours, then the drawn textures */
  function surfaceRow(current, pickIt) {
    const row = h("div", "we-row");
    for (const id of MAT_IDS) { const b = button("", MATERIALS[id].label, () => pickIt(id), `we-swatch${current === id ? " on" : ""}`); b.style.background = colourOf(id); row.append(b); }
    for (const [id, s] of Object.entries(SURFACES)) { const b = button("", s.label, () => pickIt(id), `we-swatch${current === id ? " on" : ""}`); b.style.backgroundImage = `url(${surfaceSwatch(id)})`; row.append(b); }
    return row;
  }

  /** the red box */
  function drawTerra() {
    terra.replaceChildren(head("Terraform", "terra"));
    const tools = h("div", "we-row");
    tools.append(button("👆", "Select: click something to pick it up and drag it, or use its arrows and rings", () => setTool("select"), S.tool === "select" ? "on" : ""));
    for (const [id, icon, title] of BRUSHES) tools.append(button(icon, title, () => setTool(id), S.tool === id ? "on" : ""));
    terra.append(tools, h("h4", "", "Build"));
    const build = h("div", "we-row");
    for (const [id, icon, title] of BUILD) build.append(button(`${icon} ${id === "platform" ? "Platform" : "Scatter"}`, title, () => setTool(id), S.tool === id ? "on" : ""));
    terra.append(build);

    const sel = selected(), shape = sel?.rec?.kind ? sel.rec : null;
    if (IS_BRUSH.has(S.tool)) terra.append(slider("Size", 0.25, 16, 0.25, () => S.size, (v) => { S.size = v; if (hover) drawBrush(hover); }));
    if (S.tool === "pencil" || S.tool === "paint") {
      const row = h("div", "we-row");
      for (const id of MAT_IDS) { const b = button("", MATERIALS[id].label, () => { S.mat = id; drawTerra(); }, `we-swatch${S.mat === id ? " on" : ""}`); b.style.background = colourOf(id); row.append(b); }
      terra.append(row);
    }
    if (S.tool === "hole") {
      const row = h("div", "we-row");
      for (const [id, name] of Object.entries(HOLE_SHAPES)) row.append(toggle(name, `A ${name.toLowerCase()} hole`, S.hole.shape === id, () => { S.hole.shape = id; drawTerra(); if (hover) drawBrush(hover); }));
      terra.append(row);
      const how = h("div", "we-row");
      how.append(toggle("Dig down", "A pit with straight sides, as deep as Depth", !S.hole.through && !S.hole.side, () => { S.hole.through = false; S.hole.side = false; drawTerra(); }),
        toggle("Right through", "A real hole: the land is gone there, all the way down", S.hole.through && !S.hole.side, () => { S.hole.through = true; S.hole.side = false; drawTerra(); }),
        toggle("↘ Sideways", "A tunnel at an angle: click a slope or the ground and it goes in the way you're looking", S.hole.side, () => { S.hole.side = true; drawTerra(); }));
      terra.append(how);
      if (S.hole.side) {
        terra.append(slider("Tilt down", -30, 89, 1, () => S.hole.tilt, (v) => { S.hole.tilt = v; }), slider("Length", 1, 80, 0.5, () => S.hole.len, (v) => { S.hole.len = v; }),
          h("div", "we-chosen", "0 = level into the hill, 89 = nearly straight down. It goes in the way you're looking; after placing, its rings tilt and turn it."));
      } else if (!S.hole.through) terra.append(slider("Depth", 0.5, 40, 0.5, () => S.hole.depth, (v) => { S.hole.depth = v; }));
      terra.append(slider("Turn", 0, 360, 5, () => Math.round(S.hole.turn * 180 / Math.PI), (v) => { S.hole.turn = v * Math.PI / 180; if (hover) drawBrush(hover); }));
    }
    if (shape?.kind === "tunnel") drawTunnelTools(shape);
    else if (S.tool === "platform" || shape) drawShapeTools(shape);
    if (S.tool === "scatter") drawScatter();

    const snap = h("div", "we-row");
    snap.append(h("span", "", "Snap"), toggle(S.snap.on ? "On" : "Off", "Snap to the grid when placing and moving", S.snap.on, () => { S.snap.on = !S.snap.on; drawTerra(); }));
    for (const a of ["x", "y", "z"]) snap.append(toggle(a.toUpperCase(), `Snap along the ${a.toUpperCase()} axis`, S.snap[a], () => { S.snap[a] = !S.snap[a]; drawTerra(); }, `we-ax-${a}`));
    snap.append(choose("Snap size", [0.1, 0.25, 0.5, 1, 2, 5].map((v) => [v, `${v} m`]), S.snap.step, (v) => { S.snap.step = +v; }));
    const turn = h("div", "we-row");
    turn.append(h("span", "", "Turn by"), choose("Turn by", [5, 15, 30, 45, 90].map((v) => [v, `${v}°`]), S.rot.step, (v) => { S.rot.step = +v; }), h("span", "", "(R, Shift+R)"));
    const hist = h("div", "we-row");
    hist.append(button("↶ Undo", "Undo (Ctrl+Z)", undo), button("↷ Redo", "Redo (Ctrl+Y)", redo));
    terra.append(h("h4", "", "Snap & turn"), snap, turn, hist);
  }

  /** platforms: the shape, its size and what it's covered in. For the next one, or for the selected one */
  /** a tunnel that's selected: its shape, width and length */
  function drawTunnelTools(t) {
    const set = (v) => { resize(v); finishResize(); drawTerra(); };
    const row = h("div", "we-row");
    row.append(h("span", "", "Tunnel:"));
    for (const [id, name] of Object.entries(HOLE_SHAPES)) row.append(toggle(name, `A ${name.toLowerCase()} tunnel`, (t.shape || "circle") === id, () => set({ shape: id })));
    terra.append(row,
      slider("Width", 0.4, 30, 0.1, () => t.r * 2, (v) => resize({ r: v / 2 }), finishResize),
      slider("Length", 1, 80, 0.5, () => t.len, (v) => resize({ len: v }), finishResize),
      h("div", "we-chosen", "The red ring tilts it, the green ring turns it left and right, the blue ring spins its shape."));
  }
  function drawShapeTools(shape) {
    const cur = shape || S.shape, set = (v) => { if (shape) { resize(v); finishResize(); } else Object.assign(S.shape, v); drawTerra(); syncGhost(); };
    const kinds = h("div", "we-row");
    for (const [id, name] of Object.entries(SHAPES)) kinds.append(toggle(name, `A ${name.toLowerCase()}`, cur.kind === id, () => set(id === "sphere" ? { kind: id, r: cur.r || (cur.w || 3) / 2 } : { kind: id, w: cur.w || cur.r * 2 || 2, h: cur.h || cur.r * 2 || 1, d: cur.d || cur.r * 2 || 2 })));
    terra.append(kinds);
    if (!shape) {
      const pre = h("div", "we-row");
      pre.append(h("span", "", "Quick:"));
      for (const [name, v] of PRESETS) pre.append(button(name, `A ${name.toLowerCase()}`, () => set({ ...v })));
      terra.append(pre);
    }
    const live = (k) => (v) => { if (shape) resize({ [k]: v }); else { S.shape[k] = v; syncGhost(); } };
    if (cur.kind === "sphere") terra.append(slider("Diameter", 0.5, 60, 0.25, () => (shape ? shape.r * 2 : S.shape.dia), (v) => { if (shape) resize({ r: v / 2 }); else { S.shape.dia = v; syncGhost(); } }, () => shape && finishResize()));
    else for (const [k, name] of [["w", "Width"], ["h", "Height"], ["d", "Depth"]]) terra.append(slider(name, 0.1, 60, 0.1, () => cur[k], live(k), () => shape && finishResize()));
    terra.append(h("div", "we-chosen", "Cover it with:"), surfaceRow(cur.mat, (id) => set({ mat: id })));
  }

  /** the scatter brush: what to scatter, how many, how far */
  function drawScatter() {
    const sets = h("div", "we-row");
    sets.append(h("span", "", "Scatter:"));
    for (const [name, test] of SCATTER_SETS) sets.append(button(name, `Scatter ${name.toLowerCase()}`, () => {
      const pool = all.filter((m) => test(m) && (!filter.pack || m.pack === filter.pack));
      if (!pool.length) { say(`No ${name.toLowerCase()} in ${filter.pack ? "this pack" : "the library"}.`); return; }
      S.scatter.set = pool.length > 10 ? pool.filter((_, i) => i % Math.ceil(pool.length / 10) === 0) : pool;
      filter.cat = ""; catSel.value = ""; search.value = filter.q = ""; refilter(pool);
      drawTerra(); say(`${S.scatter.set.length} ${name.toLowerCase()} chosen. Click or hold on the ground to scatter. Click models in the assets box to add or take them out.`);
    }));
    sets.append(button("Clear", "Choose nothing", () => { S.scatter.set = []; drawTerra(); drawGrid(); }));
    terra.append(sets);
    const chosen = S.scatter.set;
    terra.append(h("div", "we-chosen", chosen.length ? `${chosen.length} chosen: ${chosen.slice(0, 4).map((m) => m.name).join(", ")}${chosen.length > 4 ? "…" : ""}` : "Nothing chosen yet: press one above, or click models in the assets box (green = chosen)."));
    const foot = h("div", "we-row");
    foot.append(h("span", "", "Area"), toggle("◯ Circle", "Scatter in a circle", S.scatter.foot === "circle", () => { S.scatter.foot = "circle"; drawTerra(); }), toggle("▢ Square", "Scatter in a square", S.scatter.foot === "square", () => { S.scatter.foot = "square"; drawTerra(); }),
      toggle("⟳ Random turn", "Turn each one a different way", S.scatter.spin, () => { S.scatter.spin = !S.scatter.spin; drawTerra(); }));
    terra.append(foot,
      slider("How many", 1, 80, 1, () => S.scatter.count, (v) => { S.scatter.count = v; }),
      slider("Spread", 0.5, 25, 0.5, () => S.scatter.radius, (v) => { S.scatter.radius = v; if (hover) drawBrush(hover); }),
      slider("Size", 0.1, 4, 0.05, () => S.scatter.size, (v) => { S.scatter.size = v; }),
      slider("Vary size", 0, 0.9, 0.05, () => S.scatter.vary, (v) => { S.scatter.vary = v; }));
  }

  // ---------------- the black box: every model, by category, a page at a time. The two triangles take the last square ----------------
  let all = [], page = 0, perPage = 8, filter = { cat: "", pack: "", q: "" }, shown = [], previews = null, drawing = 0;
  const catSel = dropdown("Which kind of model"), packSel = dropdown("Which pack"), search = h("input"), grid = h("div", "we-grid"), pageNo = h("div", "we-page", "Finding every model…");
  search.type = "search"; search.placeholder = "Search"; search.setAttribute("aria-label", "Search models");
  const catRow = h("div", "we-filter"), packRow = h("div", "we-filter");
  catRow.append(catSel); packRow.append(packSel, search);
  assets.append(head("Assets", "assets"), catRow, packRow, grid, pageNo);
  function fillPacks() {
    const inCat = all.filter((m) => !filter.cat || m.cat === filter.cat), counts = new Map();
    for (const m of inCat) counts.set(m.pack, (counts.get(m.pack) || 0) + 1);
    if (filter.pack && !counts.has(filter.pack)) filter.pack = "";
    packSel.setOptions([["", `Every pack (${inCat.length})`], ...[...counts.keys()].sort((a, b) => a.localeCompare(b)).map((p) => [p, `${p.replace(/_+/g, " ")} (${counts.get(p)})`])], filter.pack);
  }
  function refilter(only = null) {
    const q = filter.q.trim().toLowerCase();
    shown = (only || all).filter((m) => (!filter.cat || m.cat === filter.cat) && (!filter.pack || m.pack === filter.pack) && (!q || m.name.toLowerCase().includes(q)));
    page = 0; drawGrid();
  }
  catSel.onchange = () => { filter.cat = catSel.value; fillPacks(); refilter(); };
  packSel.onchange = () => { filter.pack = packSel.value; refilter(); };
  search.oninput = () => { filter.q = search.value; refilter(); };
  /** as many rows as fit: the box reaches up the side of the screen */
  const fit = () => {
    const w = grid.clientWidth, hgt = grid.clientHeight;
    if (!w || !hgt) return;
    const tile = (w - 10) / 3, rows = Math.max(1, Math.floor((hgt + 5) / (tile + 5))), n = rows * 3 - 1;
    if (n !== perPage) { const first = page * perPage; perPage = n; page = Math.floor(first / perPage); drawGrid(); }
  };
  const sizer = new ResizeObserver(fit); sizer.observe(grid);
  const inSet = (m) => S.scatter.set.some((x) => x.src === m.src);
  function tileClick(m) {
    if (S.tool !== "scatter") { pick(m); return; }
    S.scatter.set = inSet(m) ? S.scatter.set.filter((x) => x.src !== m.src) : [...S.scatter.set, m];
    drawTerra(); drawGrid();
  }
  function drawGrid() {
    const token = ++drawing, pages = Math.max(1, Math.ceil(shown.length / perPage));
    page = Math.max(0, Math.min(pages - 1, page));
    grid.replaceChildren();
    for (const m of shown.slice(page * perPage, page * perPage + perPage)) {
      const on = S.tool === "scatter" ? inSet(m) : S.model?.src === m.src;
      const tile = button("", m.name, () => tileClick(m), `we-tile${on ? (S.tool === "scatter" ? " in" : " on") : ""}`), img = h("img"), label = h("span", "", m.name);
      img.alt = ""; img.hidden = true; tile.append(img, label); grid.append(tile);
      previews?.get(m.src, () => token === drawing).then((url) => { if (url && token === drawing) { img.src = url; img.hidden = false; label.hidden = true; } });
    }
    while (grid.children.length < perPage) { const blank = h("div", "we-tile"); blank.setAttribute("aria-hidden", "true"); grid.append(blank); }
    const turn = h("div", "we-turn");
    turn.append(button("◁", "Previous page", () => { page--; drawGrid(); }), button("▷", "Next page", () => { page++; drawGrid(); }));
    turn.children[0].disabled = page <= 0; turn.children[1].disabled = page >= pages - 1;
    grid.append(turn);
    pageNo.textContent = `Page ${page + 1} of ${pages} · ${shown.length} models`;
  }

  /** the little bar under what's selected: like the buttons under furniture in the main room */
  function drawFloat() {
    const it = selected();
    float.replaceChildren();
    float.hidden = !it;
    if (!it) return;
    const can = it.rec || it.movable, n = group().length;
    float.append(h("b", "", n > 1 ? `${n} things` : it.rec ? (it.rec.kind ? (it.rec.kind === "tunnel" ? "Tunnel" : SHAPES[it.rec.kind] || "Shape") : nameOf(it.rec.src)) : it.label || "A piece of the world"));
    if (can && !it.rec?.kind && n === 1) {
      const pose = poseOf(it);
      float.append(slider("Scale", 0.05, 8, 0.05, () => pose.s || 1, (v) => resize({ s: v }), finishResize));
    }
    const fields = !it.rec && n === 1 ? host.existing?.fields?.(it.key) : null;
    for (const f of fields || []) {                                   // a portal: where it goes and the name round its rim
      const set = (v) => { const before = poseOf(it); moveTo(it, { [f.key]: v }); recordMove(it, before); };
      const wrap = h("label", "we-field"), cap = h("span", "", f.label);
      let input;
      if (f.options) { input = h("select"); for (const [v, t] of f.options) { const o = h("option", "", t); o.value = v; o.selected = v === f.value; input.append(o); } input.onchange = () => set(input.value); }
      else { input = h("input"); input.type = "text"; input.maxLength = f.max || 28; input.value = f.value; input.placeholder = f.label; input.onchange = () => set(input.value.trim() || f.value); input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") input.blur(); }; }
      input.onkeyup = (e) => e.stopPropagation();
      wrap.append(cap, input); float.append(wrap);
    }
    if (can) {
      for (const a of ["x", "y", "z"]) float.append(toggle(a.toUpperCase(), `R and the turn buttons turn around ${a.toUpperCase()}`, S.rot.axis === a, () => { S.rot.axis = a; drawFloat(); }, `we-ax-${a}`));
      float.append(button("⟲", "Turn back (Shift+R)", () => spin(-1)), button("⟳", "Turn (R)", () => spin(1)), button("⤓", "Down onto the ground", dropToGround));
    }
    const moved = group().filter((o) => !o.rec && layer.changed.has(o.key));
    if (moved.length) float.append(button("↺", moved.length > 1 ? "Put these back where they were" : "Put it back where it was", () => restoreOriginal(moved)));
    if (group().length) float.append(button("⧉", "Make a copy (Ctrl+D). Ctrl+C and Ctrl+V copy and paste where the mouse points", duplicate));
    float.append(button("🗑", n > 1 ? "Remove these (Delete)" : "Remove this (Delete)", removeSelected));
  }
  const nameOf = (src) => {
    const known = all.find((m) => m.src === src)?.name; if (known) return known;
    if (String(src).startsWith("piece:")) {                       // a copy of one of the hub's own pieces: its kind, in words ("hubBookcase" -> "Bookcase")
      const t = src.slice(6).split("#")[0].replace(/^(hub|mh|pk|st|bc|mu|gp_[a-z0-9]+?_)(?=[A-Z_])/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
      return t ? t[0].toUpperCase() + t.slice(1) + " (copy)" : "Copy";
    }
    return src.split("/").pop().replace(/\.\w+$/, "").replace(/_+/g, " ");
  };
  /** pieces the world came with, back exactly where they started (one undo) */
  function restoreOriginal(list) {
    const was = list.map((o) => [o.key, layer.changed.get(o.key)]);
    const back = () => { for (const [key] of was) { host.existing.restore(key); layer.changed.delete(key); } syncGizmo(); drawFloat(); };
    back();
    did({ what: "putting it back", undo: () => { for (const [key, pose] of was) { host.existing.apply(key, pose); layer.changed.set(key, pose); } syncGizmo(); drawFloat(); }, redo: back });
    say(list.length > 1 ? "Put back where they were." : "Put back where it was.");
  }
  function placeFloat() {
    const it = selected();
    if (!it || float.hidden) return;
    const box = new THREE.Box3().setFromObject(it.node);
    if (box.isEmpty()) return;
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2).project(camera), b = dom.getBoundingClientRect();
    if (p.z > 1) { float.style.visibility = "hidden"; return; }
    float.style.visibility = "";
    const x = Math.max(330 + float.offsetWidth / 2, Math.min(innerWidth - float.offsetWidth / 2 - 8, b.left + (p.x + 1) / 2 * b.width));
    const y = Math.max(8, Math.min(innerHeight - float.offsetHeight - 24, b.top + (1 - p.y) / 2 * b.height));
    float.style.left = `${x}px`; float.style.top = `${y}px`;
  }

  function ask(text, yes, fn) {
    cancelAsk?.();
    const box = h("div", "we-ask"), row = h("div"), p = h("p", "", text);
    box.setAttribute("role", "alertdialog"); box.setAttribute("aria-label", text);
    const no = button("Cancel", "Cancel", () => cancelAsk()), ok = button(yes, yes, () => { cancelAsk(); fn(); }, "on");
    row.append(no, ok); box.append(p, row); root.append(box);
    cancelAsk = () => { box.remove(); cancelAsk = null; };
    no.focus();
  }

  // ---------------- what's in the view: the grid, the brush, the box round what's selected, the arrows and rings ----------------
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(96 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
  ring.renderOrder = 998; ring.frustumCulled = false; ring.visible = ball.visible = false; ring.userData.always = ball.userData.always = true; host.scene.add(ring, ball);
  const selBox = new THREE.BoxHelper(undefined, 0xe0ae4a); selBox.visible = false; selBox.userData.always = true; selBox.raycast = () => {}; host.scene.add(selBox);
  const moreBoxes = [];      // green boxes round the others picked with Ctrl+click
  const helpers = new THREE.Group(); helpers.visible = false; helpers.userData.always = true;
  let gridHelper = null, gridStep = 0;
  const axes = new THREE.AxesHelper(2.5); axes.material.depthTest = false; axes.renderOrder = 998; helpers.add(axes);
  const onTop = (m) => { m.renderOrder = 999; m.userData.handle = true; return m; };
  const handles = new THREE.Group(); handles.visible = false; handles.userData.always = true;
  const handleMat = (a) => new THREE.MeshBasicMaterial({ color: TINT[a], depthTest: false, transparent: true, opacity: 0.92 });
  const arrows = {}, rings = {};
  for (const a of ["x", "y", "z"]) {       // an arrow to move along each axis and a ring to turn around it, both shown at once
    const g = new THREE.Group(), stem = onTop(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 10), handleMat(a))), tip = onTop(new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.45, 14), handleMat(a)));
    stem.position.y = 1; tip.position.y = 2.2; g.add(stem, tip);
    if (a === "x") g.rotation.z = -Math.PI / 2; else if (a === "z") g.rotation.x = Math.PI / 2;
    stem.userData.axis = tip.userData.axis = a; arrows[a] = g;
    const r = onTop(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 8, 64), handleMat(a)));
    if (a === "x") r.rotation.y = Math.PI / 2; else if (a === "y") r.rotation.x = Math.PI / 2;
    r.userData.turn = a; rings[a] = r;
    handles.add(g, r);
  }
  const centre = onTop(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd479, depthTest: false })));
  centre.userData.slide = true; handles.add(centre);

  const toZone = (zone, o) => { if (o.parent !== zone.group) zone.group.add(o); };
  function syncGizmo() {
    const it = selected(), can = it && (it.rec || it.movable);
    handles.visible = !!can;
    selBox.visible = !!it;
    if (it) { selBox.setFromObject(it.node); }
    const rest = it ? group().slice(1) : [];
    while (moreBoxes.length < rest.length) { const b = new THREE.BoxHelper(undefined, 0x7fe07a); b.userData.always = true; b.raycast = () => {}; host.scene.add(b); moreBoxes.push(b); }
    moreBoxes.forEach((b, i) => { b.visible = i < rest.length; if (b.visible) b.setFromObject(rest[i].node); });
    if (!can) return;
    toZone(it.zone, handles);
    const p = poseOf(it), box = new THREE.Box3().setFromObject(it.node), mid = box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
    if (mid) it.zone.group.worldToLocal(mid);
    handles.position.set(p.x, mid ? mid.y : p.y + 0.02, p.z);
    const d = camera.position.distanceTo(it.node.getWorldPosition(new THREE.Vector3()));
    handles.scale.setScalar(Math.max(0.3, d * 0.11));
    handles.updateMatrixWorld(true);
  }
  /** the snap: only the axes you've picked */
  const snapped = (v, a) => (S.snap.on && S.snap[a] ? round(v, S.snap.step) : v);
  function showGrid(zone, x, y, z) {
    helpers.visible = S.snap.on;
    if (!S.snap.on) return;
    toZone(zone, helpers);
    if (gridStep !== S.snap.step) {
      if (gridHelper) { helpers.remove(gridHelper); gridHelper.geometry.dispose(); gridHelper.material.dispose(); }
      const count = Math.min(40, Math.max(8, Math.round(20 / S.snap.step)));
      gridHelper = new THREE.GridHelper(count * S.snap.step, count, 0xffd479, 0xffffff);
      gridHelper.material.transparent = true; gridHelper.material.opacity = 0.42; gridHelper.material.depthTest = false; gridHelper.renderOrder = 997;
      helpers.add(gridHelper); gridStep = S.snap.step;
    }
    helpers.position.set(x, y + 0.03, z);
  }

  // ---------------- where the mouse points ----------------
  function aim(e) {
    const b = dom.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
  }
  /** the first bit of ground along the mouse: stepped along, so it works whatever the ground is made of */
  function groundHit() {
    const o = ray.ray.origin, d = ray.ray.direction, reach = host.reach || 900;
    const above = (q) => { const g = host.heightAt(o.x + d.x * q, o.z + d.z * q); return g === null ? null : o.y + d.y * q - g; };
    let prevT = 0, was = above(0), t = 0.1, step = 0.2;
    while (t < reach) {
      const now = above(t);
      if (now !== null && now <= 0 && was !== null && was > 0) {       // from above the ground to under it
        let a = prevT, b = t;
        for (let i = 0; i < 12; i++) { const m = (a + b) / 2, v = above(m); if (v !== null && v <= 0) b = m; else a = m; }
        const x = o.x + d.x * b, z = o.z + d.z * b, zone = host.zoneAt(x, z);
        if (!zone) return null;
        const [lx, lz] = zone.toLocal(x, z);
        return { x, y: o.y + d.y * b, z, zone, lx, lz };
      }
      was = now; prevT = t; t += step; step = Math.min(step * 1.05, 4);
    }
    return null;
  }
  /** the ground under a point of a zone (in its own coordinates), or null */
  const groundAt = (zone, lx, lz) => { const [x, z] = zone.toWorld(lx, lz); return host.zoneAt(x, z) === zone ? host.heightAt(x, z) : null; };

  // ---------------- undo ----------------
  function markDirty() { if (!S.dirty) { S.dirty = true; drawFile(); } }
  function did(op) { S.undo.push(op); if (S.undo.length > 100) S.undo.shift(); S.redo.length = 0; markDirty(); }
  async function undo() { const op = S.undo.pop(); if (!op) { say("Nothing to undo."); return; } select(null); await op.undo(); S.redo.push(op); markDirty(); say(`Undid ${op.what}.`); }
  async function redo() { const op = S.redo.pop(); if (!op) { say("Nothing to redo."); return; } select(null); await op.redo(); S.undo.push(op); markDirty(); say(`Redid ${op.what}.`); }

  // ---------------- brushes ----------------
  function stamp(p) {
    const s = stroke.zone.sculpt, r = S.size, y = s.beforeAt(p.lx, p.lz);
    if (S.tool === "pencil") s.addSphere(p.lx, y, p.lz, r, S.mat);
    else if (S.tool === "eraser") s.carveSphere(p.lx, y, p.lz, r);
    else if (S.tool === "flatten") s.flatten(p.lx, p.lz, r, stroke.height);
    else if (S.tool === "smooth") s.smooth(p.lx, p.lz, r);
    else if (S.tool === "paint") s.paint(p.lx, p.lz, r, S.mat);
    else if (S.tool === "restore") s.restore(p.lx, p.lz, r);
    else if (S.tool === "hole") s.hole(p.lx, p.lz, r, S.hole.shape, S.hole.depth, S.hole.through, S.hole.turn);
  }
  function strokeTo(hit) {
    if (stroke.scatter) {
      if (stroke.last && Math.hypot(hit.lx - stroke.last.lx, hit.lz - stroke.last.lz) < S.scatter.radius * 1.3) return;
      stroke.last = hit; scatterAt(hit); return;
    }
    if (!stroke.last) { stamp(hit); stroke.last = hit; return; }
    const dx = hit.lx - stroke.last.lx, dz = hit.lz - stroke.last.lz, d = Math.hypot(dx, dz), gap = Math.max(S.size * (S.tool === "hole" ? 0.8 : 0.5), stroke.zone.sculpt.cell);
    if (d < gap) return;
    const n = Math.min(40, Math.floor(d / gap));
    for (let i = 1; i <= n; i++) stamp({ lx: stroke.last.lx + dx * i / n, lz: stroke.last.lz + dz * i / n });
    stroke.last = hit;
  }
  function endStroke() {
    if (!stroke) return;
    const st = stroke; stroke = null;
    if (st.scatter) {
      Promise.all(st.jobs).then(() => {
        const recs = st.recs.map((r) => ({ ...r }));
        if (!recs.length) return;
        did({ what: `scattering ${recs.length}`, undo: () => { for (const r of recs) layer.remove(r.id); }, redo: async () => { await Promise.all(recs.map((r) => layer.add({ ...r }))); } });
        say(`Scattered ${recs.length}. Ctrl+Z takes the whole stroke back.`);
      });
      return;
    }
    const s = st.zone.sculpt;
    s.flush();
    const change = s.end(), what = `the ${S.tool} stroke`;
    if (change) did({ what, undo: () => s.put(change.before), redo: () => s.put(change.after) });
  }
  function drawBrush(hit) {
    const scatter = S.tool === "scatter", on = (IS_BRUSH.has(S.tool) || scatter) && !!hit;
    ring.visible = on; ball.visible = on && (S.tool === "pencil" || S.tool === "eraser");
    if (!on) return;
    const p = ring.geometry.attributes.position, r = scatter ? S.scatter.radius : S.size, zone = hit.zone;
    const shape = scatter ? (S.scatter.foot === "square" ? "square" : "circle") : S.tool === "hole" ? S.hole.shape : "circle", turn = S.tool === "hole" ? S.hole.turn : 0;
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, e = shapeEdge(shape, a) * r, u = Math.cos(a) * e, v = Math.sin(a) * e;
      const lx = hit.lx + u * Math.cos(turn) - v * Math.sin(turn), lz = hit.lz + u * Math.sin(turn) + v * Math.cos(turn), [x, z] = zone.toWorld(lx, lz);
      const g = host.heightAt(x, z); p.setXYZ(i, x, (g === null || g < hit.y - 4 ? hit.y : g) + 0.06, z);     // over a hole the outline stays at the rim
    }
    p.needsUpdate = true;
    ring.material.color.set(S.tool === "hole" ? 0xffb347 : scatter ? 0x8fe388 : 0xffffff);
    ball.position.set(hit.x, hit.y, hit.z); ball.scale.setScalar(S.size);
    ball.material.color.set(S.tool === "eraser" ? 0xff6050 : MATERIALS[S.mat].color);
  }

  // ---------------- scattering ----------------
  const scaleOf = new Map();
  async function baseScale(src) {
    if (!scaleOf.has(src)) scaleOf.set(src, makeModel(src, host.base).then((g) => firstScale(g.userData.box)).catch(() => null));
    return scaleOf.get(src);
  }
  function scatterAt(hit) {
    const set = S.scatter.set, P = S.scatter;
    if (!set.length) { say("Choose what to scatter first: press Grass, Flowers, Rocks… or click models in the assets box."); return; }
    for (let i = 0; i < P.count; i++) {
      let ox, oz;
      if (P.foot === "square") { ox = (Math.random() * 2 - 1) * P.radius; oz = (Math.random() * 2 - 1) * P.radius; }
      else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * P.radius; ox = Math.cos(a) * d; oz = Math.sin(a) * d; }
      const lx = hit.lx + ox, lz = hit.lz + oz, y = groundAt(hit.zone, lx, lz);
      if (y === null) continue;
      const m = set[Math.floor(Math.random() * set.length)], st = stroke;
      st.jobs.push((async () => {
        const k = await baseScale(m.src);
        if (k === null) return;
        const s = k * P.size * (1 + (Math.random() * 2 - 1) * P.vary);
        const made = await layer.add({ zone: hit.zone.id, src: m.src, x: lx, y, z: lz, rx: 0, ry: P.spin ? Math.random() * Math.PI * 2 : 0, rz: 0, s: Math.max(0.01, s) });
        if (made) st.recs.push(made.rec);
      })());
    }
  }

  // ---------------- placing ----------------
  function setTool(id) {
    S.tool = id;
    if (id !== "place") { S.model = null; ghostFor++; dropGhost(); }
    if (id !== "select" && id !== "place") { S.selected = null; S.more = []; }
    ring.visible = ball.visible = false;
    if (id === "platform") makeShapeGhost();
    syncGizmo(); drawTerra(); drawFloat(); drawGrid();
    say({
      select: "Click something to pick it up and drag it over the ground, like furniture. Arrows move along one axis, rings turn. Right-drag to look, WASD to fly, Space/E up, Q/C down, wheel for speed.",
      platform: "Click the ground to place it; it's then selected so you can drag and turn it. Shift+click keeps placing.",
      scatter: "Choose what to scatter, then click or hold on the ground. One stroke is one undo.",
      hole: "Click or hold to dig. R turns the shape. Restore (↺) fills a hole back in.",
    }[id] || "Hold the left mouse button on the ground and paint. Ctrl+Z undoes a stroke, [ and ] change the size.");
  }
  function dropGhost() { if (ghost) { ghost.parent?.remove(ghost); if (ghost.userData.shapeGhost) ghost.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); ghost = null; } helpers.visible = false; }
  const shapeRec = () => (S.shape.kind === "sphere" ? { kind: "sphere", r: S.shape.dia / 2, mat: S.shape.mat } : { kind: S.shape.kind, w: S.shape.w, h: S.shape.h, d: S.shape.d, mat: S.shape.mat });
  let ghostKey = "";
  function makeShapeGhost() {
    const rec = shapeRec(), key = JSON.stringify(rec);
    if (ghost && ghostKey === key) return;
    dropGhost(); ghostKey = key;
    const m = shapeMesh(rec);
    m.material.transparent = true; m.material.opacity = 0.6; m.material.depthWrite = false; m.castShadow = false; m.raycast = () => {};
    ghost = new THREE.Group(); ghost.add(m); ghost.visible = false; ghost.userData.always = true; ghost.userData.shapeGhost = true;
    host.scene.add(ghost);
  }
  async function pick(m) {
    S.model = m; S.tool = "place"; S.scale = 1; S.selected = null; S.more = [];
    syncGizmo(); drawTerra(); drawFloat(); drawGrid();
    dropGhost();
    const token = ++ghostFor;
    say(`Loading ${m.name}…`);
    try {
      const g = await makeModel(m.src, host.base);
      if (closed || token !== ghostFor || S.tool !== "place") return;
      S.scale = firstScale(g.userData.box);
      ghost = g; ghost.visible = false; ghost.userData.always = true;
      ghost.traverse((o) => { o.raycast = () => {}; });
      host.scene.add(ghost);
      say("Click the ground to place it; it's then picked up so you can drag and turn it. Shift+click keeps placing. R turns it, [ and ] size it, Esc stops.");
      if (mouse) move(mouse);
    } catch (e) { say(`${m.name} couldn't be loaded.`); console.warn("[world editor] model", m.src, e); }
  }
  function syncGhost(hit = hover) {
    if (S.tool === "platform") makeShapeGhost();
    if (!ghost) return;
    ghost.visible = !!hit;
    if (!hit) { helpers.visible = false; return; }
    toZone(hit.zone, ghost);
    const up = S.tool !== "platform" ? 0 : S.shape.kind === "sphere" ? S.shape.dia / 2 : S.shape.h / 2;
    const x = snapped(hit.lx, "x"), y = snapped(hit.y + up, "y"), z = snapped(hit.lz, "z");
    ghost.position.set(x, y, z); ghost.rotation.set(S.turn.rx, S.turn.ry, S.turn.rz); ghost.scale.setScalar(S.tool === "place" ? S.scale : 1);
    showGrid(hit.zone, x, hit.y, z);
  }
  function spin(dir) {
    const k = `r${S.rot.axis}`, by = dir * S.rot.step * Math.PI / 180, it = selected();
    if (S.tool === "hole") { S.hole.turn = ((S.hole.turn + by) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); drawTerra(); if (hover) drawBrush(hover); return; }
    if (it && (it.rec || it.movable)) { const p = poseOf(it), before = { ...p }, list = followers(it); moveTo(it, { [k]: (p[k] || 0) + by }); follow(it, before, list, S.rot.axis); recordMove(it, before, list); return; }
    S.turn[k] += by; syncGhost();
  }
  async function placeAt(hit, keep) {
    let made = null;
    if (S.tool === "place") {
      if (!ghost || !S.model) return;
      made = await addRec({ zone: hit.zone.id, src: S.model.src, x: ghost.position.x, y: ghost.position.y, z: ghost.position.z, rx: S.turn.rx, ry: S.turn.ry, rz: S.turn.rz, s: S.scale }, `placing ${S.model.name}`);
    } else if (S.tool === "platform") {
      if (!ghost) return;
      made = await addRec({ zone: hit.zone.id, ...shapeRec(), x: ghost.position.x, y: ghost.position.y, z: ghost.position.z, rx: S.turn.rx, ry: S.turn.ry, rz: S.turn.rz }, "placing a platform");
    }
    if (made && !keep) { setTool("select"); select({ id: made.rec.id }); say("Placed. Drag it to move it, use the arrows and rings, or the buttons under it. Shift+click places more."); }
  }
  /** a sideways hole: a tunnel from where you clicked, the way the camera looks, tilted down by Tilt */
  async function digTunnel(hit, keep) {
    const f = camera.getWorldDirection(new THREE.Vector3()), q = hit.zone.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    f.applyQuaternion(q);
    const yaw = Math.atan2(f.x, f.z), tilt = S.hole.tilt * Math.PI / 180;
    const made = await addRec({ zone: hit.zone.id, kind: "tunnel", shape: S.hole.shape, r: S.size, len: S.hole.len, x: hit.lx, y: hit.y, z: hit.lz, rx: tilt, ry: yaw, rz: S.hole.turn }, "digging a tunnel");
    if (made && !keep) { setTool("select"); select({ id: made.rec.id }); say("Tunnel dug. Drag it to move it; the rings tilt and turn it; Width and Length are in the red box. Shift+click digs more."); }
  }
  async function addRec(rec, what) {
    const made = await layer.add({ ...rec });
    if (!made) { say("That couldn't be placed."); return null; }
    const { id } = made.rec;
    did({ what, undo: () => layer.remove(id), redo: async () => { await layer.add({ ...rec, id }); } });
    return made;
  }

  // ---------------- selecting and moving ----------------
  /** what's selected, in one shape: { id, rec, node, zone } for what you placed, { key, node, zone, movable } for what the world came with */
  function resolve(s) {
    if (!s) return null;
    if (s.id != null) { const e = layer.objects.get(s.id); return e ? { id: s.id, rec: e.rec, node: e.node, zone: e.zone } : null; }
    return s;
  }
  function selected() { return resolve(S.selected); }
  const same = (a, b) => !!a && !!b && ((a.id != null && a.id === b.id) || (a.key != null && a.key === b.key));
  /** everything selected: the one with the arrows first, then the ones added with Ctrl+click */
  function group() { const out = []; for (const s of [S.selected, ...S.more]) { const it = resolve(s); if (it) out.push(it); } return out; }
  /** the others that move with the one being dragged (in the same part of the world) */
  const followers = (it) => group().filter((o) => !same(o, it) && o.zone === it.zone && (o.rec || o.movable)).map((o) => ({ it: o, pose: { ...poseOf(o) } }));
  function select(s, keepMore = false) { S.selected = s; if (!keepMore) S.more = []; syncGizmo(); drawTerra(); drawFloat(); }
  /** Ctrl+click: add it to the selection, or take it out */
  function toggleSelect(thing) {
    const all = [S.selected, ...S.more].filter(Boolean);
    const i = all.findIndex((s) => same(s, thing));
    if (i >= 0) all.splice(i, 1); else all.push(thing);
    S.selected = all.length ? all[all.length - 1] : null; S.more = all.slice(0, -1);
    syncGizmo(); drawTerra(); drawFloat();
    const n = group().length;
    say(n > 1 ? `${n} things selected. Drag one, or use the arrows, rings and buttons: they all move together. Ctrl+C copies, Ctrl+V pastes.` : n ? "Selected." : "Nothing selected.");
  }
  /** the others follow what the primary just did: the same move, or the same turn around the primary */
  function follow(it, pose, list, axis = null) {
    if (!list?.length) return;
    const now = poseOf(it);
    if (axis) {
      const k = `r${axis}`, by = (now[k] || 0) - (pose[k] || 0), c = Math.cos(by), sn = Math.sin(by);
      for (const o of list) {
        const v = { [k]: (o.pose[k] || 0) + by };
        const dx = o.pose.x - pose.x, dy = o.pose.y - pose.y, dz = o.pose.z - pose.z;
        if (axis === "y") { v.x = pose.x + dx * c + dz * sn; v.z = pose.z - dx * sn + dz * c; }
        else if (axis === "x") { v.y = pose.y + dy * c - dz * sn; v.z = pose.z + dy * sn + dz * c; }
        else { v.x = pose.x + dx * c - dy * sn; v.y = pose.y + dx * sn + dy * c; }
        moveTo(o.it, v, true);
      }
    } else {
      const dx = now.x - pose.x, dy = now.y - pose.y, dz = now.z - pose.z;
      for (const o of list) moveTo(o.it, { x: o.pose.x + dx, y: o.pose.y + dy, z: o.pose.z + dz }, true);
    }
    syncGizmo();
  }
  function poseOf(it) { return it.rec ? { x: it.rec.x, y: it.rec.y, z: it.rec.z, rx: it.rec.rx || 0, ry: it.rec.ry || 0, rz: it.rec.rz || 0, s: it.rec.s } : host.existing.pose(it.key); }
  function moveTo(it, v, quiet = false) {
    if (it.rec) layer.set(it.id, v);
    else { const next = { ...poseOf(it), ...v }; host.existing.apply(it.key, next); layer.changed.set(it.key, next); it.node = host.existing.node(it.key) || it.node; }
    if (!quiet) syncGizmo();
  }
  function moveOp(it, before) {
    const now = it.rec || poseOf(it), after = {};
    for (const k of Object.keys(before)) after[k] = now[k];
    if (Object.keys(before).every((k) => before[k] === after[k])) return null;
    if (it.rec) { const { id } = it; return { undo: () => layer.set(id, before), redo: () => layer.set(id, after) }; }
    const { key } = it, go = (pose) => () => { host.existing.apply(key, pose); layer.changed.set(key, pose); };
    return { undo: go(before), redo: go(after) };
  }
  /** one undo for one whole move, turn or resize. before holds what it was: those fields are what change back */
  function recordMove(it, before, others = []) {
    const ops = [moveOp(it, before), ...others.map((o) => moveOp(o.it, o.pose))].filter(Boolean);
    if (!ops.length) return;
    did({ what: ops.length > 1 ? `moving ${ops.length} things` : it.rec ? "the change" : "the move", undo: async () => { for (const o of ops) await o.undo(); }, redo: async () => { for (const o of ops) await o.redo(); } });
  }
  let resizeFrom = null;
  function resize(v) {
    const it = selected(); if (!it) return;
    resizeFrom ??= it.rec ? { ...it.rec } : { ...poseOf(it) };
    if (it.rec?.kind && "h" in v && it.rec.kind !== "sphere" && it.rec.h) v = { ...v, y: it.rec.y + (v.h - it.rec.h) / 2 };     // a taller platform grows up, not into the ground
    moveTo(it, v);
  }
  function finishResize() { const it = selected(); if (!it || !resizeFrom) return; const before = resizeFrom; resizeFrom = null; recordMove(it, before); }
  /** what Ctrl+C keeps: the placed things selected, as offsets from the first one, and how high it stood over the ground */
  /** a placed thing's record, or one made for a piece the world came with (rebuilt from its kind and settings) */
  function recOf(o) {
    if (o.rec) { const { id, lifted, zone, ...r } = o.rec; return r; }
    const spec = host.existing.spec?.(o.key); if (!spec?.type) return null;
    const { type, ...more } = spec, p = host.existing.pose(o.key);
    return { src: `piece:${type}${Object.keys(more).length ? "#" + encodeURIComponent(JSON.stringify(more)) : ""}`, x: p.x, y: p.y, z: p.z, rx: p.rx || 0, ry: p.ry || 0, rz: p.rz || 0, s: p.s || 1 };
  }
  function copySelected() {
    const list = group().map((o) => [o, recOf(o)]).filter(([, r]) => r), it = list[0]?.[0];
    if (!it) { say(group().length ? "That piece can't be copied." : "Select something first (Ctrl+click picks more than one)."); return null; }
    const base = { ...list[0][1] }, g = groundAt(it.zone, base.x, base.z);
    const recs = list.map(([, r]) => ({ ...r, x: r.x - base.x, y: r.y - base.y, z: r.z - base.z }));
    const clip = { recs, lift: g === null ? 0 : base.y - g, from: { zone: it.zone.id, x: base.x, y: base.y, z: base.z } };
    keepClip(clip);
    say(`Copied ${recs.length === 1 ? nameOf(base.src || "") || "it" : `${recs.length} things`}. Ctrl+V pastes where the mouse points.`);
    return clip;
  }
  /** Ctrl+V: the copies go where the mouse points on the ground (or next to the first ones), as one undo, and are selected */
  async function paste(clip = readClip(), at = hover) {
    if (!clip?.recs?.length) { say("Nothing copied yet: select something and press Ctrl+C."); return []; }
    let zone, x, y, z;
    if (at?.zone) { zone = at.zone; x = snapped(at.lx, "x"); z = snapped(at.lz, "z"); const g = groundAt(zone, x, z); y = (g ?? at.y) + clip.lift; }
    else {
      zone = host.zones().find((q) => q.id === clip.from.zone) || host.zones()[0];
      x = clip.from.x + Math.max(1, S.snap.step); z = clip.from.z; y = clip.from.y;
    }
    if (!zone) return [];
    const made = [];
    for (const r of clip.recs) { const m = await layer.add({ ...r, zone: zone.id, x: x + r.x, y: y + r.y, z: z + r.z }); if (m) made.push(m.rec); }
    if (!made.length) { say("That couldn't be pasted."); return []; }
    const saved = made.map((r) => ({ ...r })), ids = saved.map((r) => r.id);
    did({ what: made.length > 1 ? `pasting ${made.length} things` : "the paste", undo: () => { for (const id of ids) layer.remove(id); }, redo: async () => { for (const r of saved) await layer.add({ ...r }); } });
    setTool("select");
    S.selected = { id: ids[ids.length - 1] }; S.more = ids.slice(0, -1).map((id) => ({ id }));
    syncGizmo(); drawTerra(); drawFloat();
    say(`Pasted ${made.length === 1 ? "it" : `${made.length} things`}. Drag to move ${made.length === 1 ? "it" : "them"}.`);
    return ids;
  }
  async function duplicate() {
    const clip = copySelected(); if (!clip) return;
    await paste(clip, null);                  // next to the first ones
  }
  function dropToGround() {
    const list = group().filter((o) => o.rec || o.movable); if (!list.length) return;
    const ops = [];
    for (const it of list) {
      const p = poseOf(it), before = { ...p };
      if (it.rec?.kind) it.rec.lifted = true;
      const g = groundAt(it.zone, p.x, p.z);
      if (it.rec?.kind) delete it.rec.lifted;
      if (g === null) continue;
      const up = !it.rec?.kind || it.rec.kind === "tunnel" ? 0 : it.rec.kind === "sphere" ? it.rec.r : it.rec.h / 2;
      moveTo(it, { y: g + up }, true); const op = moveOp(it, before); if (op) ops.push(op);
    }
    syncGizmo();
    if (ops.length) did({ what: "putting it on the ground", undo: async () => { for (const o of ops) await o.undo(); }, redo: async () => { for (const o of ops) await o.redo(); } });
  }
  /** take one thing out, and say how to put it back */
  function removeOp(it) {
    if (it.rec) { const rec = { ...it.rec }, { id } = it; delete rec.lifted; layer.remove(id); return { undo: async () => { await layer.add({ ...rec }); }, redo: () => layer.remove(id) }; }
    const { key } = it, was = layer.changed.get(key) ?? null;
    const gone = () => { host.existing.apply(key, { removed: true }); layer.changed.set(key, { removed: true }); };
    gone();
    return { undo: () => { host.existing.restore(key); layer.changed.delete(key); if (was) { host.existing.apply(key, was); layer.changed.set(key, was); } }, redo: gone };
  }
  function removeSelected() {
    const list = group(); if (!list.length) return;
    select(null);
    const ops = list.map(removeOp);
    did({ what: ops.length > 1 ? `removing ${ops.length} things` : "the removal", undo: async () => { for (const o of ops) await o.undo(); }, redo: async () => { for (const o of ops) await o.redo(); } });
  }
  /** what's under the mouse: something you placed, or a piece of the world */
  function pickThing() {
    const nodes = [...layer.objects.values()].map((e) => e.node);
    const hit = nodes.length ? ray.intersectObjects(nodes, true)[0] : null;
    const old = host.existing?.pick(ray);
    if (hit && (!old || hit.distance <= old.distance)) { let o = hit.object; while (o && o.userData.worldId == null) o = o.parent; if (o) return { id: o.userData.worldId }; }
    return old || null;
  }
  function grabHandle() {
    if (!handles.visible) return null;
    handles.updateMatrixWorld(true);
    const list = []; handles.traverse((o) => { if (o.userData.handle && o.visible && o.parent.visible) list.push(o); });
    return ray.intersectObjects(list, false)[0]?.object || null;
  }
  const axisWorld = (a, zone) => AXES[a].clone().applyQuaternion(zone.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
  function alongAxis(o, d) {       // how far along the axis line the mouse's ray comes closest
    const w = o.clone().sub(ray.ray.origin), b = d.dot(ray.ray.direction), e = ray.ray.direction.dot(w), q = d.dot(w), den = 1 - b * b;
    return Math.abs(den) < 1e-5 ? null : (b * e - q) / den;
  }
  function ringAngle(dr) {
    const hit = ray.ray.intersectPlane(dr.plane, new THREE.Vector3());
    if (!hit) return null;
    const v = hit.sub(dr.origin);
    return Math.atan2(v.dot(dr.v), v.dot(dr.u));
  }
  /** dragging the thing itself, like furniture: it slides over the ground under the mouse, keeping its height above it */
  function startSlide(it, e) {
    const pose = { ...poseOf(it) };
    if (it.rec?.kind) it.rec.lifted = true;               // its own top isn't the ground it slides on
    const hit = groundHit(), g = groundAt(it.zone, pose.x, pose.z);
    drag = { kind: "slide", it, pose, others: followers(it), x0: e.clientX, y0: e.clientY, moved: false, off: hit && hit.zone === it.zone ? { x: pose.x - hit.lx, z: pose.z - hit.lz } : { x: 0, z: 0 }, lift: g === null ? 0 : pose.y - g };
  }
  function startGizmo(handle, it) {
    const origin = handles.getWorldPosition(new THREE.Vector3()), pose = { ...poseOf(it) };
    if (handle.userData.axis) { const a = handle.userData.axis, d = axisWorld(a, it.zone); drag = { kind: "move", a, d, origin, t0: alongAxis(origin, d), pose, it, others: followers(it) }; return; }
    const a = handle.userData.turn, n = axisWorld(a, it.zone), u = new THREE.Vector3(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0).cross(n).normalize(), v = n.clone().cross(u);
    drag = { kind: "turn", a, n, u, v, origin, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin), pose, it, others: followers(it) };
    drag.a0 = ringAngle(drag);
  }
  function moveGizmo(e) {
    const D = drag, { it, pose } = D;
    D.shift = !!e.shiftKey;
    if (D.kind === "slide") {
      if (!D.moved && Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 4) return;
      D.moved = true;
      const hit = groundHit();
      if (!hit || hit.zone !== it.zone) return;
      const x = snapped(hit.lx + D.off.x, "x"), z = snapped(hit.lz + D.off.z, "z"), g = groundAt(it.zone, x, z);
      moveTo(it, { x, z, y: snapped((g ?? pose.y - D.lift) + D.lift, "y") });
      follow(it, pose, D.others);
      showGrid(it.zone, x, g ?? pose.y, z);
      return;
    }
    if (D.kind === "move") {
      const t = alongAxis(D.origin, D.d);
      if (t !== null && D.t0 !== null) { moveTo(it, { [D.a]: snapped(pose[D.a] + (t - D.t0), D.a) }); follow(it, pose, D.others); }
      return;
    }
    const ang = ringAngle(D);
    if (ang === null || D.a0 === null) return;
    let by = ang - D.a0;
    if (D.shift) by = round(by, S.rot.step * Math.PI / 180);            // the rings turn freely; hold Shift to step by the turn size
    moveTo(it, { [`r${D.a}`]: pose[`r${D.a}`] + by });
    follow(it, pose, D.others, D.a);
  }

  // ---------------- the mouse and the keys ----------------
  function move(e) {
    aim(e);
    if (stroke) { const hit = groundHit(); if (hit && hit.zone === stroke.zone) { hover = hit; strokeTo(hit); } }
    else hover = groundHit();
    if (S.tool === "place" || S.tool === "platform") syncGhost(hover);
    else helpers.visible = false;
    drawBrush(hover);
  }
  view.addEventListener("pointermove", (e) => {
    mouse = e;
    if (lookDrag) {
      look.y -= (e.clientX - lookDrag.x) * 0.004; look.x = Math.max(-1.55, Math.min(1.55, look.x - (e.clientY - lookDrag.y) * 0.004));
      lookDrag.x = e.clientX; lookDrag.y = e.clientY;
      camera.quaternion.setFromEuler(look);
      return;
    }
    if (drag) { aim(e); moveGizmo(e); return; }
    move(e);
  });
  view.addEventListener("pointerdown", async (e) => {
    view.setPointerCapture?.(e.pointerId);
    document.activeElement?.blur?.();
    if (e.button === 2 || e.button === 1) { lookDrag = { x: e.clientX, y: e.clientY }; view.style.cursor = "grabbing"; return; }
    if (e.button !== 0) return;
    mouse = e;
    aim(e);
    if (S.tool === "select") {
      const handle = grabHandle(), it = selected();
      if (handle && it && !e.ctrlKey && !e.metaKey) { if (handle.userData.slide) startSlide(it, e); else startGizmo(handle, it); return; }
      const thing = pickThing();
      if (e.ctrlKey || e.metaKey) { if (thing) toggleSelect(thing); return; }
      if (!thing) { select(null); return; }
      const inGroup = [S.selected, ...S.more].some((s) => same(s, thing));
      if (inGroup) { const rest = [S.selected, ...S.more].filter((s) => s && !same(s, thing)); S.more = rest; select(thing, true); }
      else select(thing);
      const now = selected();
      if (now && (now.rec || now.movable)) startSlide(now, e);
      else if (now) say(`${now.label}: this came with the world, and can be removed.`);
      return;
    }
    const hit = groundHit();
    if (!hit) { say("That's beyond the ground that can be edited."); return; }
    hover = hit;
    if (S.tool === "hole" && S.hole.side) { await digTunnel(hit, e.shiftKey); return; }
    if (IS_BRUSH.has(S.tool)) { hit.zone.sculpt.begin(); stroke = { zone: hit.zone, height: hit.y, last: null }; strokeTo(hit); hit.zone.sculpt.flush(); return; }
    if (S.tool === "scatter") { stroke = { zone: hit.zone, scatter: true, last: null, jobs: [], recs: [] }; strokeTo(hit); return; }
    await placeAt(hit, e.shiftKey);
  });
  const up = () => {
    view.style.cursor = "";
    lookDrag = null;
    if (drag) {
      const { it, pose, others = [] } = drag;
      if (it.rec?.kind) { delete it.rec.lifted; if (drag.kind === "slide") layer.set(it.id, {}); }
      for (const o of others) if (o.it.rec?.kind) layer.set(o.it.id, {});
      drag = null; helpers.visible = false; recordMove(it, pose, others);
    }
    endStroke();
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("lostpointercapture", up);
  view.addEventListener("contextmenu", (e) => e.preventDefault());
  view.addEventListener("wheel", (e) => { e.preventDefault(); S.speed = Math.max(1, Math.min(240, S.speed * (e.deltaY < 0 ? 1.15 : 0.87))); say(`Flying speed: ${S.speed.toFixed(0)} m/s`); }, { passive: false });

  const typing = (t) => t?.matches?.("input[type=search], input[type=text], textarea");
  const onDown = (e) => {
    if (closed) return;
    e.stopImmediatePropagation();                // the game behind mustn't act on any of these
    if (typing(e.target)) { if (e.key === "Escape") e.target.blur(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (ctrl && e.code === "KeyY") { e.preventDefault(); redo(); return; }
    if (ctrl && e.code === "KeyS") { e.preventDefault(); saveNow(false); return; }
    if (ctrl && e.code === "KeyC") { e.preventDefault(); copySelected(); return; }
    if (ctrl && e.code === "KeyV") { e.preventDefault(); paste(); return; }
    if (ctrl && e.code === "KeyD") { e.preventDefault(); duplicate(); return; }
    if (ctrl) return;
    if (FLY.test(e.code)) { const onButton = e.target?.matches?.("button, select"); if (!(onButton && e.code === "Space")) { keys.add(e.code); e.preventDefault(); } return; }
    if (e.code === "Escape") { if (cancelAsk) cancelAsk(); else if (S.tool !== "select") setTool("select"); else select(null); return; }
    if (e.code === "KeyR") spin(e.shiftKey ? -1 : 1);
    else if (e.code === "BracketLeft" || e.code === "BracketRight") {
      const k = e.code === "BracketLeft" ? 0.9 : 1.1, it = selected();
      if (IS_BRUSH.has(S.tool)) { S.size = Math.max(0.25, Math.min(16, S.size * k)); drawTerra(); if (hover) drawBrush(hover); }
      else if (S.tool === "scatter") { S.scatter.radius = Math.max(0.5, Math.min(25, S.scatter.radius * k)); drawTerra(); if (hover) drawBrush(hover); }
      else if (S.tool === "place") { S.scale = Math.max(0.02, S.scale * k); syncGhost(); }
      else if (it?.rec && !it.rec.kind) { const before = { ...poseOf(it) }; moveTo(it, { s: Math.max(0.02, (it.rec.s || 1) * k) }); recordMove(it, before); drawFloat(); }
    } else if ((e.code === "Delete" || e.code === "Backspace") && group().length) removeSelected();
  };
  const onUp = (e) => { keys.delete(e.code); if (!closed) e.stopImmediatePropagation(); };
  const onBlur = () => keys.clear();
  window.addEventListener("keydown", onDown, true);
  window.addEventListener("keyup", onUp, true);
  window.addEventListener("blur", onBlur);

  // ---------------- each frame ----------------
  const F = new THREE.Vector3(), R = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function tick(dt) {
    if (closed) return;
    const fwd = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0), side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0), rise = (keys.has("Space") || keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") || keys.has("KeyC") ? 1 : 0);
    if (fwd || side || rise) {
      camera.getWorldDirection(F); R.crossVectors(F, UP).normalize();
      camera.position.addScaledVector(F, fwd * S.speed * dt).addScaledVector(R, side * S.speed * dt).addScaledVector(UP, rise * S.speed * dt);
      if (mouse && !lookDrag && !drag) move(mouse);
    }
    for (const z of host.zones()) if (z.sculpt.dirty.size) z.sculpt.flush();
    if (selBox.visible || handles.visible || S.more.length) syncGizmo();
    placeFloat();
    host.onFrame?.(dt);
  }

  // ---------------- saving ----------------
  async function saveNow(andLeave) {
    say("Saving…");
    const data = layer.dump(), res = await store.save(host.scope, data);
    if (res?.error) { say(res.error); return; }
    saved = JSON.parse(JSON.stringify(data));
    S.dirty = false; drawFile();
    say("Saved.");
    if (andLeave) close();
  }
  async function revert() {
    select(null);
    layer.wipe();
    const res = await store.clear(host.scope);
    S.undo.length = S.redo.length = 0; saved = null; S.dirty = false; drawFile();
    say(res?.error || "Back to the world as it was made. Your last edits are kept once in a backup file.");
  }
  async function discard() {
    select(null);
    layer.wipe();
    if (saved) await layer.apply(saved);
    close();
  }
  function close() {
    if (closed) return;
    closed = true;
    drawing++; ghostFor++;
    window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true); window.removeEventListener("blur", onBlur);
    sizer.disconnect();
    dropGhost();
    for (const o of [ring, ball, helpers, handles, selBox, ...moreBoxes]) o.parent?.remove(o);
    for (const b of moreBoxes) { b.geometry.dispose(); b.material.dispose(); }
    ring.geometry.dispose(); ring.material.dispose(); ball.geometry.dispose(); ball.material.dispose(); selBox.geometry.dispose(); selBox.material.dispose();
    previews?.dispose();
    closeMenu();
    root.remove();
    host.leave();
  }

  drawFile();
  showFold();
  setTool("select");
  host.enter(tick);
  previews = makePreviews(host.base);
  const editor = { close, state: S, tick, root, view, pick, setTool, undo, redo, save: saveNow, revert, models: () => all, select, selected, group, toggleSelect, copy: copySelected, paste, scatterAt: (hit) => { stroke = { zone: hit.zone, scatter: true, last: null, jobs: [], recs: [] }; scatterAt(hit); const j = stroke; endStroke(); return Promise.all(j.jobs).then(() => j.recs); } };
  host.onOpen?.(editor);
  all = await listModels(host.base, host.api);
  if (closed) return editor;
  const counts = new Map(); for (const m of all) counts.set(m.cat, (counts.get(m.cat) || 0) + 1);
  catSel.setOptions([["", `All models (${all.length})`], ...CATEGORIES.filter(([id]) => counts.get(id)).map(([id, name]) => [id, `${name} (${counts.get(id)})`])], "");
  fillPacks();
  refilter();
  fit();
  return editor;
}
