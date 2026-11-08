// mainhub.js - The Main Hub: a floating plaza above the clouds. You arrive inside the beacon (a column of light on a glowing
// glass disc), step out under a huge white tensile canopy, and roam: a long boardwalk vault with portals to every other hub,
// a skybridge with blossom trees, stepped terraces, and a canyon of tall pale blades leading out to a spire.
// Everything is drawn here (no model files): each piece is one catalog item, merged per material so it stays cheap to draw.
// Every piece answers a click (an act or an info line); seats sit; the floor walks.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { boardRows, boardVersion, boardIsLive, fmtV, MEDALS, SOCIZ_LINES, drawAvatar, drawGem, drawCrown, fitText } from "./hubboard.js";

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- shapes
/** a grid surface: fn(u, v, out) puts the point for u, v in 0..1 */
function surface(nu, nv, fn) {
  const pos = [], uv = [], idx = [], p = V();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const tube = (pts, r, seg = 0, rad = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg || Math.max(8, pts.length * 6), r, rad, false);
const flatPlane = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
/** texture coordinates from where it is in the world (x, z) / tile metres - so one plank texture lines up everywhere */
function worldUV(g, tile, rotate = false) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv[i * 2] = (rotate ? z : x) / tile; uv[i * 2 + 1] = (rotate ? x : -z) / tile; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
const clean = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  n.morphAttributes = {};
  return n;
};

/** Collects pieces by material and merges each material's pieces into one mesh (one draw each). */
class Kit {
  constructor() { this.parts = new Map(); }
  add(geo, mat, o = {}) {
    const m = new THREE.Matrix4().compose(V(o.x || 0, o.y || 0, o.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, o.order || "XYZ")),
      V(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1));
    geo.applyMatrix4(m);
    if (o.uv) worldUV(geo, o.uv, o.uvRot);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(geo);
    return geo;
  }
  box(w, h, d, mat, o) { return this.add(new THREE.BoxGeometry(w, h, d), mat, o); }
  cyl(r0, r1, h, mat, o, n = 16, open = false) { return this.add(new THREE.CylinderGeometry(r0, r1, h, n, 1, open), mat, o); }
  into(group, { cast = true } = {}) {
    for (const [mat, list] of this.parts) {
      const g = list.length === 1 ? clean(list[0]) : mergeGeometries(list.map(clean), false);
      if (!g) { console.warn("[main hub] could not merge", mat.name); continue; }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = cast && !mat.userData.noShadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

// ---------------------------------------------------------------- pictures
function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (repeat) t.repeat.set(...repeat);
  return t;
}
const dotMatrix = (g, w, h, step = 4) => { g.fillStyle = "rgba(0,0,0,.55)"; for (let x = 0; x < w; x += step) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += step) g.fillRect(0, y, w, 1); };

const PIC = {
  planks: () => canvasTex(512, 512, (g, w, h) => {            // 4 m of weathered boardwalk: 8 boards, staggered joints
    const r = seeded(31);
    for (let i = 0; i < 8; i++) {
      const x0 = i * 64, L = 31 + r() * 12;
      g.fillStyle = `hsl(${24 + r() * 6},${22 + r() * 10}%,${L}%)`; g.fillRect(x0, 0, 64, h);
      for (let k = 0; k < 26; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,235,210"},${0.05 + r() * 0.08})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const gx = x0 + r() * 64; g.moveTo(gx, 0); g.bezierCurveTo(gx + r() * 6 - 3, h * 0.3, gx + r() * 6 - 3, h * 0.7, gx + r() * 4 - 2, h); g.stroke(); }
      for (const jy of [r() * h, r() * h]) { g.fillStyle = "rgba(25,15,8,.75)"; g.fillRect(x0, jy, 64, 3); g.fillStyle = "rgba(20,12,6,.5)"; g.fillRect(x0 + 8, jy - 7, 3, 3); g.fillRect(x0 + 52, jy - 7, 3, 3); }
      g.fillStyle = "#1c120b"; g.fillRect(x0, 0, 3, h);
    }
    const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0, "rgba(255,240,220,.06)"); sh.addColorStop(1, "rgba(0,0,0,.08)"); g.fillStyle = sh; g.fillRect(0, 0, w, h);
  }),
  plate: () => canvasTex(256, 256, (g, w, h) => {             // 2 m of blue-grey diamond plate
    g.fillStyle = "#3b4752"; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h + 16; y += 16, row++) for (let x = (row % 2) * 8; x < w + 16; x += 16) {
      g.save(); g.translate(x, y); g.rotate((row % 2 ? 1 : -1) * Math.PI / 4);
      g.fillStyle = "#5d6e7d"; g.fillRect(-6, -1.6, 12, 3.2); g.fillStyle = "rgba(190,215,235,.35)"; g.fillRect(-6, -1.6, 12, 1); g.restore();
    }
    const r = seeded(9); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "200,220,240"},.05)`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
  }),
  glass: () => canvasTex(1024, 1024, (g, w, h) => {           // the beacon's glowing tiles
    g.fillStyle = "#e8fbff"; g.fillRect(0, 0, w, h);
    const n = 22, s = w / n, r = seeded(5);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const L = 62 + r() * 18, gr = g.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, `hsl(${196 + r() * 10},85%,${L + 8}%)`); gr.addColorStop(1, `hsl(${200 + r() * 8},80%,${L - 6}%)`);
      g.fillStyle = gr; g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      if (r() < 0.12) { g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6); }
    }
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); rg.addColorStop(0, "rgba(255,255,255,.75)"); rg.addColorStop(0.45, "rgba(255,255,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }),
  membrane: () => canvasTex(512, 512, (g, w, h) => {         // fabric: soft seams along the panels
    g.fillStyle = "#f6f1e9"; g.fillRect(0, 0, w, h);
    for (let i = 1; i < 10; i++) { g.fillStyle = "rgba(160,140,115,.16)"; g.fillRect((i / 10) * w - 1, 0, 2, h); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect((i / 10) * w + 1, 0, 1, h); }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,250,240,.0)"); gr.addColorStop(1, "rgba(150,125,100,.10)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  sail: () => canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = "#eee3cf"; g.fillRect(0, 0, w, h);
    for (let i = 1; i < 5; i++) { g.fillStyle = "rgba(150,125,90,.22)"; g.fillRect((i / 5) * w, 0, 2, h); }
    g.fillStyle = "rgba(150,125,90,.3)"; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 12, w, 12); g.fillRect(0, 0, 8, h);
    for (let y = 24; y < h; y += 40) { g.fillStyle = "#8b7759"; g.beginPath(); g.arc(4, y, 3, 0, TAU); g.fill(); }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0.6, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(120,90,60,.18)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  sand: () => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#d8c4a3"; g.fillRect(0, 0, w, h);
    const r = seeded(77); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "120,95,60" : "255,245,225"},${0.04 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = "rgba(150,120,80,.10)"; g.lineWidth = 3; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 20, w * 0.6, y - 20, w, y); g.stroke(); }
  }),
  clouds: () => canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#efdcc8"; g.fillRect(0, 0, w, h);
    const r = seeded(123);
    for (let i = 0; i < 520; i++) {
      const x = r() * w, y = r() * h, s = 20 + r() * 90, shade = r() < 0.35;
      for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, s);
        gr.addColorStop(0, shade ? "rgba(196,170,150,.35)" : "rgba(255,250,244,.75)"); gr.addColorStop(1, "rgba(255,250,244,0)");
        g.fillStyle = gr; g.fillRect(x + dx - s, y + dy - s, s * 2, s * 2);
      }
    }
  }),
  puff: () => canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,248,240,.95)"); gr.addColorStop(0.5, "rgba(250,238,226,.55)"); gr.addColorStop(1, "rgba(250,238,226,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, w); }),
  glowDisc: () => canvasTex(256, 256, (g, w) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(190,240,255,.6)"); gr.addColorStop(1, "rgba(150,220,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, w); }),
  facade: () => canvasTex(128, 512, (g, w, h) => {           // far towers: pale, with lit vertical seams
    g.fillStyle = "#ece0cf"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(120,100,80,.10)"; g.fillRect(0, y, w, 2); }
    for (const x of [18, 62, 104]) { g.fillStyle = "rgba(255,255,250,.95)"; g.fillRect(x, 0, 4, h); }
  }),
  swirl: () => canvasTex(512, 512, (g, w, h) => {            // a portal's surface
    g.fillStyle = "#0a2350"; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, TAU); g.clip();
    const r = seeded(17);
    for (let i = 0; i < 420; i++) {
      const rad = 10 + r() * 240, a0 = r() * TAU, len = 0.4 + r() * 1.6, warm = r() < 0.07;
      g.strokeStyle = warm ? `hsla(${20 + r() * 20},90%,${60 + r() * 20}%,.55)` : `hsla(${195 + r() * 25},85%,${45 + r() * 45}%,${0.25 + r() * 0.45})`;
      g.lineWidth = 2 + r() * 9; g.beginPath();
      for (let k = 0; k <= 20; k++) { const a = a0 + (k / 20) * len, rr = rad * (1 - (k / 20) * 0.25); const x = w / 2 + Math.cos(a) * rr, y = h / 2 + Math.sin(a) * rr; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    const c = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.22); c.addColorStop(0, "rgba(235,250,255,.95)"); c.addColorStop(1, "rgba(160,220,255,0)"); g.fillStyle = c; g.fillRect(0, 0, w, h);
    const e = g.createRadialGradient(w / 2, h / 2, w * 0.38, w / 2, h / 2, w / 2); e.addColorStop(0, "rgba(0,0,0,0)"); e.addColorStop(1, "rgba(120,210,255,.75)"); g.fillStyle = e; g.fillRect(0, 0, w, h);
    g.restore();
  }),
};
/** the name written round a portal's rim */
const ringText = (text) => canvasTex(1024, 1024, (g, w) => {
  const R = 466, chars = [...`${text}  ✦  ${text}  ✦  `];
  g.translate(w / 2, w / 2); g.font = "800 58px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "#7fe4ff"; g.shadowBlur = 14; g.fillStyle = "#e9fbff";
  const step = TAU / chars.length;
  chars.forEach((ch, i) => { g.save(); g.rotate(i * step); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); });
}, { repeat: [1, 1] });
/** a kiosk's little name board: white enamel, timber lettering */
const kioskSign = (name) => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = "#f4efe6"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6b4a33"; g.fillRect(0, h - 10, w, 10);
  g.fillStyle = "#3c2a1e"; g.textAlign = "center"; g.textBaseline = "middle";
  fitText(g, name, w - 40, 64, 900); g.fillText(name, w / 2, h / 2 - 2);
});

// ---------------------------------------------------------------- the leaderboard pictures (the Hall of Fame and the holo ring)
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function trendMark(g, x, y, row, i) {
  const d = (row.prev ?? i) - i;
  if (!d) { g.fillStyle = "rgba(160,190,220,.4)"; g.fillRect(x - 8, y - 2, 16, 4); return; }
  g.fillStyle = d > 0 ? "#5dff9e" : "#ff6b7d"; g.beginPath();
  if (d > 0) { g.moveTo(x - 9, y + 6); g.lineTo(x + 9, y + 6); g.lineTo(x, y - 8); } else { g.moveTo(x - 9, y - 6); g.lineTo(x + 9, y - 6); g.lineTo(x, y + 8); }
  g.closePath(); g.fill();
}
const BW = 1600, BH = 900;
/** one ranked line: rank, face, name and server, Lumen counting up, the arrow for which way they moved */
function boardRow(g, row, i, x, y, w, h, slide, val) {
  const md = MEDALS[i], a = ease(slide);
  if (a <= 0) return;
  g.save(); g.globalAlpha = a; g.translate((1 - a) * 220, 0);
  rrect(g, x, y + 4, w, h - 8, 14);
  const bg = g.createLinearGradient(x, 0, x + w, 0);
  bg.addColorStop(0, md ? md[0] + "40" : row.me ? "rgba(93,255,158,.18)" : "rgba(80,150,255,.12)"); bg.addColorStop(1, "rgba(80,150,255,.03)");
  g.fillStyle = bg; g.fill();
  if (md) { g.strokeStyle = md[0] + "aa"; g.lineWidth = 2; g.stroke(); }
  const cy = y + h / 2;
  g.textBaseline = "middle"; g.textAlign = "center";
  g.font = `900 ${Math.round(h * 0.42)}px Nunito, sans-serif`; g.fillStyle = md ? md[0] : "#8fb8e6"; g.fillText(String(i + 1), x + 42, cy + 1);
  drawAvatar(g, x + 112, cy, h * 0.36, row, { ring: md ? md[0] : null });
  g.textAlign = "left"; g.fillStyle = "#f2f8ff";
  fitText(g, row.name, w * 0.36, Math.round(h * 0.4), 900); g.fillText(row.name, x + 164, cy - h * 0.11);
  g.font = `700 ${Math.round(h * 0.22)}px Nunito, sans-serif`; g.fillStyle = "rgba(170,205,240,.75)"; g.fillText(row.server ? `${row.server} server` : "", x + 164, cy + h * 0.24);
  g.textAlign = "right"; g.font = `900 ${Math.round(h * 0.4)}px Nunito, sans-serif`; g.fillStyle = md ? md[0] : "#7ff3ff";
  g.fillText(fmtV(val(row)), x + w - 92, cy + 1);
  drawGem(g, x + w - 70, cy, h * 0.3, md ? md[0] : "#7ff3ff");
  trendMark(g, x + w - 30, cy, row, i);
  g.restore();
}
/** the Hall of Fame: page 0 is number one in the spotlight beside 2-10; page 1 the podium beside 11-20 */
function drawBoard(g, page, slide, t, val) {
  const rows = boardRows();
  const bg = g.createLinearGradient(0, 0, 0, BH); bg.addColorStop(0, "#0a1630"); bg.addColorStop(1, "#040915"); g.fillStyle = bg; g.fillRect(0, 0, BW, BH);
  g.strokeStyle = "rgba(90,170,255,.06)"; g.lineWidth = 1;
  for (let x = 0; x <= BW; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, BH); g.stroke(); }
  for (let y = 0; y <= BH; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(BW, y); g.stroke(); }
  // the header
  g.textBaseline = "middle"; g.textAlign = "left";
  g.font = "900 40px Nunito, sans-serif"; g.fillStyle = "#7fe9ff"; g.shadowColor = "#3ad6ff"; g.shadowBlur = 18; g.fillText("HALL OF FAME", 48, 58); g.shadowBlur = 0;
  g.font = "800 22px Nunito, sans-serif"; g.fillStyle = "rgba(200,230,255,.62)"; g.fillText(page ? "THE PODIUM   ·   RANKS 11 TO 20" : "MOST LUMEN   ·   EVERY SERVER", 352, 61);
  const live = boardIsLive();
  g.textAlign = "right"; g.font = "900 24px Nunito, sans-serif"; g.fillStyle = "#e9f6ff"; g.fillText(live ? "LIVE" : "PREVIEW", BW - 48, 60);
  g.fillStyle = live ? `rgba(255,80,105,${0.55 + 0.45 * Math.sin(t * 5)})` : `rgba(127,233,255,${0.55 + 0.45 * Math.sin(t * 3)})`;
  g.beginPath(); g.arc(BW - (live ? 120 : 172), 59, 9, 0, TAU); g.fill();
  const hl = g.createLinearGradient(0, 0, BW, 0); hl.addColorStop(0, "rgba(127,233,255,0)"); hl.addColorStop(0.5, "rgba(127,233,255,.8)"); hl.addColorStop(1, "rgba(127,233,255,0)");
  g.fillStyle = hl; g.fillRect(40, 100, BW - 80, 2);
  const px = 40, py = 124, pw = 540, ph = 740, a0 = ease(slide * 1.4);
  g.save(); g.globalAlpha = a0;
  rrect(g, px, py, pw, ph, 26);
  const pg = g.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, "rgba(255,215,106,.20)"); pg.addColorStop(1, "rgba(255,215,106,.02)"); g.fillStyle = pg; g.fill();
  g.strokeStyle = "rgba(255,215,106,.55)"; g.lineWidth = 2; g.stroke();
  if (!page) {                                                           // number one, in the light
    const top = rows[0];
    if (top) {
      const cx = px + pw / 2, cy = py + 270, R = 150;
      const sp = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2); sp.addColorStop(0, "rgba(255,225,140,.35)"); sp.addColorStop(1, "rgba(255,225,140,0)"); g.fillStyle = sp; g.fillRect(px, py, pw, 560);
      g.save(); g.translate(cx, cy); g.rotate(t * 0.25);                  // slow rays behind the face
      for (let k = 0; k < 12; k++) { g.rotate(TAU / 12); g.fillStyle = "rgba(255,215,106,.07)"; g.beginPath(); g.moveTo(0, 0); g.lineTo(-30, -R * 1.9); g.lineTo(30, -R * 1.9); g.closePath(); g.fill(); }
      g.restore();
      drawAvatar(g, cx, cy, R, top, { ring: MEDALS[0][0], glow: 40 });
      drawCrown(g, cx, cy - R - 26, 46);
      g.textAlign = "left"; g.font = "900 64px Nunito, sans-serif"; g.fillStyle = MEDALS[0][0]; g.fillText("#1", px + 28, py + 52);
      g.textAlign = "center"; g.fillStyle = "#fff8e6"; fitText(g, top.name, pw - 60, 76, 900); g.fillText(top.name, cx, py + 500);
      g.font = "700 26px Nunito, sans-serif"; g.fillStyle = "rgba(255,236,190,.75)"; g.fillText(top.server ? `${top.server} server` : "", cx, py + 552);
      g.font = "900 70px Nunito, sans-serif"; g.fillStyle = MEDALS[0][0]; g.shadowColor = "#ffb800"; g.shadowBlur = 22;
      const s = fmtV(val(top)), sw = g.measureText(s).width; g.fillText(s, cx + 22, py + 640); g.shadowBlur = 0;
      drawGem(g, cx - sw / 2 - 18, py + 638, 40, MEDALS[0][0]);
      g.font = "800 20px Nunito, sans-serif"; g.fillStyle = "rgba(255,236,190,.55)"; g.fillText("LUMEN", cx, py + 696);
    }
  } else {                                                               // the podium: silver, gold, bronze
    const spots = [[1, px + 30, 180], [0, px + 190, 250], [2, px + 350, 140]];
    for (const [i, bx, bh] of spots) {
      const row = rows[i]; if (!row) continue;
      const md = MEDALS[i], grow = ease(slide * 1.3 - (i === 0 ? 0.25 : i === 1 ? 0.1 : 0)), h = bh * grow, by = py + ph - 30 - h, bw = 160;
      const bgr = g.createLinearGradient(0, by, 0, by + h); bgr.addColorStop(0, md[0]); bgr.addColorStop(1, md[1]);
      rrect(g, bx, by, bw, Math.max(1, h), 10); g.fillStyle = bgr; g.fill();
      g.textAlign = "center"; g.font = "900 64px Nunito, sans-serif"; g.fillStyle = "rgba(0,0,0,.35)"; if (h > 70) g.fillText(String(i + 1), bx + bw / 2, by + 52);
      const R = i === 0 ? 66 : 56, cy = by - R - 64;
      drawAvatar(g, bx + bw / 2, cy, R, row, { ring: md[0], glow: 26 });
      if (i === 0) drawCrown(g, bx + bw / 2, cy - R - 18, 26);
      g.fillStyle = "#fff"; fitText(g, row.name, bw + 20, 30, 900); g.fillText(row.name, bx + bw / 2, cy + R + 26);
      g.font = "800 22px Nunito, sans-serif"; g.fillStyle = md[0]; g.fillText(fmtV(val(row)), bx + bw / 2, cy + R + 54);
    }
    g.textAlign = "center"; g.font = "900 30px Nunito, sans-serif"; g.fillStyle = MEDALS[0][0]; g.fillText("THE PODIUM", px + pw / 2, py + 52);
  }
  g.restore();
  // the list
  const first = page ? 10 : 1, n = page ? 10 : 9, lx = 610, ly = 124, lw = BW - lx - 40, lh = ph / n;
  for (let j = 0; j < n; j++) { const i = first + j, row = rows[i]; if (row) boardRow(g, row, i, lx, ly + j * lh, lw, lh, slide * 1.6 - j * 0.07, val); }
}

/** a holo card for each of the top ten, all in one picture: 5 across, 2 down */
const CARD_W = 512, CARD_H = 720;
function drawCards(g) {
  g.clearRect(0, 0, CARD_W * 5, CARD_H * 2);
  boardRows().slice(0, 10).forEach((row, i) => {
    const x0 = (i % 5) * CARD_W, y0 = Math.floor(i / 5) * CARD_H, cx = x0 + CARD_W / 2, md = MEDALS[i], col = md ? md[0] : "#7fe9ff";
    g.save(); g.beginPath(); g.rect(x0, y0, CARD_W, CARD_H); g.clip();
    const bg = g.createLinearGradient(0, y0, 0, y0 + CARD_H); bg.addColorStop(0, md ? md[0] + "30" : "rgba(80,190,255,.20)"); bg.addColorStop(1, "rgba(40,90,200,.06)");
    rrect(g, x0 + 30, y0 + 30, CARD_W - 60, CARD_H - 60, 30); g.fillStyle = bg; g.fill();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 96px Nunito, sans-serif"; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 30; g.fillText(`#${i + 1}`, cx, y0 + 110); g.shadowBlur = 0;
    drawAvatar(g, cx, y0 + 345, 122, row, { ring: col, glow: 44 });
    if (i === 0) drawCrown(g, cx, y0 + 196, 40);
    g.fillStyle = "#ffffff"; fitText(g, row.name.toUpperCase(), CARD_W - 90, 66, 900); g.fillText(row.name.toUpperCase(), cx, y0 + 528);
    g.font = "700 30px Nunito, sans-serif"; g.fillStyle = "rgba(205,235,255,.8)"; g.fillText(row.server || "", cx, y0 + 578);
    g.font = "900 46px Nunito, sans-serif"; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16;
    const s = fmtV(row.vcash), sw = g.measureText(s).width; g.fillText(s, cx + 18, y0 + 646); g.shadowBlur = 0;
    drawGem(g, cx - sw / 2 - 14, y0 + 644, 30, col);
    g.restore();
  });
}

/** a screen that reads the right way round from both sides, with scanlines and a sheen sweeping across */
function screenMat(map, { scan = 1, sheen = 1, add = false, rep = [1, 1] } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, toneMapped: false, fog: false, transparent: add, depthWrite: !add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { map: { value: map }, uTime: { value: 0 }, uScan: { value: scan }, uSheen: { value: sheen }, uBright: { value: 1 }, uRep: { value: new THREE.Vector2(...rep) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D map; uniform float uTime, uScan, uSheen, uBright; uniform vec2 uRep; varying vec2 vUv;
void main(){
  vec2 uv = vUv; if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
  vec4 tx = texture2D(map, uv * uRep); vec3 c = tx.rgb;
  float s = 1.0 - uScan * 0.10 * (0.5 + 0.5 * sin(uv.y * 1300.0 - uTime * 2.0));
  float band = exp(-pow((uv.x + uv.y * 0.35 - fract(uTime * 0.07) * 2.0 + 0.3) * 8.0, 2.0)) * uSheen * 0.16;
  float vig = smoothstep(0.0, 0.03, uv.x) * (1.0 - smoothstep(0.97, 1.0, uv.x)) * smoothstep(0.0, 0.04, uv.y) * (1.0 - smoothstep(0.96, 1.0, uv.y));
  gl_FragColor = vec4((c * s + band) * uBright * (0.8 + 0.2 * vig), ${add ? "tx.a" : "1.0"});
  #include <colorspace_fragment>
}`,
  });
}
/** the holo cards: see-through light with a frame in their medal colour, a light running round it, scanlines and the odd glitch */
function cardMat(map) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { map: { value: map }, uTime: { value: 0 }, uBoost: { value: 1 }, uMedal: { value: MEDALS.map(([c]) => new THREE.Color(c)) }, uCyan: { value: new THREE.Color(0x6fe6ff) } },
    vertexShader: "attribute float aCard; varying vec2 vUv; varying float vCard; void main(){ vUv=uv; vCard=aCard; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D map; uniform float uTime, uBoost; uniform vec3 uMedal[3]; uniform vec3 uCyan; varying vec2 vUv; varying float vCard;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 luv = vUv; if (!gl_FrontFacing) luv.x = 1.0 - luv.x;
  float id = floor(vCard + 0.5), tier = step(id, 2.5);
  vec3 rim = id < 0.5 ? uMedal[0] : id < 1.5 ? uMedal[1] : id < 2.5 ? uMedal[2] : uCyan;
  float gt = floor(uTime * 9.0 + id * 3.1);
  float gl = step(0.94, hash(gt + id)) * step(abs(luv.y - hash(gt + 7.0)), 0.05);
  vec2 suv = clamp(luv + vec2(gl * (hash(gt + 3.0) - 0.5) * 0.08, 0.0), 0.0, 1.0);
  vec2 cell = vec2(mod(id, 5.0), floor(id / 5.0));
  vec2 auv = vec2((cell.x + suv.x) / 5.0, 1.0 - (cell.y + 1.0 - suv.y) / 2.0);
  vec4 tx = texture2D(map, auv);
  float split = gl * 0.006; float rr = texture2D(map, auv + vec2(split, 0.0)).r, bb = texture2D(map, auv - vec2(split, 0.0)).b;
  vec3 img = vec3(mix(tx.r, rr, gl), tx.g, mix(tx.b, bb, gl)) * tx.a;
  vec2 q = abs(luv - 0.5) * 2.0; vec2 d = (1.0 - q) * vec2(0.711, 1.0) * 0.5; float de = min(d.x, d.y);
  float frame = 1.0 - smoothstep(0.0, 0.006 + tier * 0.003, abs(de - 0.028));
  float glow = exp(-abs(de - 0.028) * (34.0 - tier * 12.0));
  float per = atan(luv.y - 0.5, (luv.x - 0.5) * 0.711) / 6.2831 + 0.5;
  float run = pow(fract(per - uTime * 0.21 - id * 0.1), 12.0) + 0.7 * pow(fract(-per - uTime * 0.13 + id * 0.37), 16.0);
  float sh = tier * exp(-pow((luv.x + luv.y * 0.6 - fract(uTime * 0.22 + id * 0.33) * 2.6 + 0.5) * 6.0, 2.0));
  float scan = 0.78 + 0.22 * sin(luv.y * 820.0 - uTime * 7.0);
  float flick = 1.0 - 0.25 * step(0.93, hash(floor(uTime * 12.0) + id * 13.0));
  float inside = smoothstep(0.02, 0.034, de);
  vec3 c = img * scan * 1.15 * inside;
  c += rim * (frame * (1.4 + tier * 1.0) + glow * (0.35 + tier * 0.45)) * (1.0 + run * 3.5);
  c += mix(vec3(1.0), rim, 0.35) * sh * (0.25 + 0.75 * tx.a) * inside;
  c += rim * 0.05 * inside;
  gl_FragColor = vec4(c * flick * uBoost, 1.0);
  #include <colorspace_fragment>
}`,
  });
}

const bannerText = (text) => canvasTex(2048, 160, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.font = "800 96px Nunito, sans-serif"; g.textBaseline = "middle"; g.fillStyle = "#e9fdff"; g.shadowColor = "#6fe6ff"; g.shadowBlur = 24;
  g.fillText(`${text}   ✦   ${text}   ✦   `, 20, h / 2 + 4);
}, { repeat: [2, 1] });

// ---------------------------------------------------------------- materials (made once, shared)
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const tex = Object.fromEntries(Object.entries(PIC).map(([k, f]) => [k, f()]));
  const glass = std({ color: 0xffffff, map: tex.glass, emissive: 0xbfefff, emissiveMap: tex.glass, emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.15 });
  const additive = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, ...o });
  MATS = {
    tex,
    planks: std({ map: tex.planks, roughness: 0.85 }),
    plate: std({ map: tex.plate, roughness: 0.72, metalness: 0.12 }),
    glass,
    metal: std({ color: 0x9aa2aa, roughness: 0.35, metalness: 0.7 }),
    darkMetal: std({ color: 0x2c3036, roughness: 0.45, metalness: 0.6 }),
    white: std({ color: 0xf1ede6, roughness: 0.55 }),
    cream: std({ color: 0xe8dccb, roughness: 0.7 }),
    timber: std({ color: 0x6b4a33, roughness: 0.85 }),
    darkTimber: std({ color: 0x3c2a1e, roughness: 0.9 }),
    rope: std({ color: 0x5a4a3a, roughness: 1 }),
    line: std({ color: 0xf7f4ee, emissive: 0xfaf6ee, emissiveIntensity: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 }),
    membrane: std({ map: tex.membrane, color: 0xffffff, emissive: 0xf3e6d4, emissiveIntensity: 0.14, roughness: 0.95, side: THREE.DoubleSide }),
    sail: std({ map: tex.sail, emissive: 0xe9dcc6, emissiveIntensity: 0.18, roughness: 1, side: THREE.DoubleSide }),
    fin: std({ color: 0xeee3d3, roughness: 0.72, side: THREE.DoubleSide }),
    finWarm: std({ color: 0xdcc4a6, roughness: 0.78, side: THREE.DoubleSide }),
    sand: std({ map: tex.sand, roughness: 1 }),
    soil: std({ color: 0x3d2c20, roughness: 1 }),
    grass: std({ color: 0x7d9a4c, roughness: 1 }),
    bark: std({ color: 0x5b4636, roughness: 0.95 }),
    pinks: [0xf3b3c8, 0xe993b3, 0xf8cad7, 0xdc7fa2].map((c) => std({ color: c, roughness: 0.9, emissive: c, emissiveIntensity: 0.08 })),
    facade: std({ map: tex.facade, emissive: 0xffffff, emissiveMap: tex.facade, emissiveIntensity: 0.25, roughness: 0.8 }),
    tower: std({ color: 0xeee4d6, roughness: 0.8 }),
    cloudSea: new THREE.MeshBasicMaterial({ map: tex.clouds, color: 0xffffff }),
    puff: new THREE.SpriteMaterial({ map: tex.puff, transparent: true, depthWrite: false, opacity: 0.9 }),
    cyan: new THREE.MeshBasicMaterial({ color: 0x8ff7ff, toneMapped: false }),
    cyanSoft: additive(0x57d9ff, { opacity: 0.55 }),
    orb: std({ color: 0x9fdcff, emissive: 0x3aa8ff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }),
    orbShell: additive(0x6cc8ff, { opacity: 0.35 }),
    glowDisc: additive(0xd8f6ff, { map: tex.glowDisc, opacity: 0.45 }),
    signGreen: std({ color: 0x1d5f3e, roughness: 0.5 }),
    screenDark: std({ color: 0x0b0d10, roughness: 0.4, metalness: 0.4 }),
    railGlass: std({ color: 0xdff4ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    panel: std({ color: 0xffffff, emissive: 0xfffaf2, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.88 }),
    led: new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }),
    edge: new THREE.MeshBasicMaterial({ color: 0xc8f6ff, toneMapped: false }),       // canopy outlines: blaze on every arrival
    halo: new THREE.SpriteMaterial({ map: tex.glowDisc, color: 0xbfefff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    haloWarm: new THREE.SpriteMaterial({ map: tex.glowDisc, color: 0xfff0d0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  };
  for (const k of ["membrane", "sail", "line", "railGlass", "panel", "glass"]) MATS[k].userData.noShadow = k !== "sail";
  for (const m of Object.values(MATS).flat()) if (m?.isMaterial) m.userData.shared = true;   // made once, used every visit: leaving the hub must not throw them away
  return MATS;
}

// ---------------------------------------------------------------- the layout (shared by the pieces, the floor heights and the edges)
const L = {
  plazaR: 84, ringR: 14, ringY: 42,
  blvd: { x: 25.5, z0: -252, z1: -50 }, wing: { x0: 25, x1: 57.5, z0: -150, z1: -66 },
  bridge: { x: 50, z0: -128, z1: -112, y: 8 }, ramp: { x0: 44, x1: 50, top: -112, foot: -70 },
  north: { x: 8, z0: 70, z1: 112 }, canyon: { x: 16, z0: 108, z1: 262 },
  terrace: { x0: 66, x1: 104, z: 30, step: 4, rise: 0.45, steps: 4 },
  vault: { half: 24.5, z0: -70, bay: 16, bays: 11 },
};
const terraceY = (ax) => (ax < L.terrace.x0 ? 0 : Math.min(L.terrace.steps, Math.floor((ax - L.terrace.x0) / L.terrace.step) + 1) * L.terrace.rise);

/** how high the walkable floor is at x, z for someone standing at `near` (so under the bridge you stay on the ground) */
export function mainHeightAt(x, z, near) {
  const n = near ?? 0, ok = (y) => y <= n + 1.2;
  let h = 0;
  const B = L.bridge, R = L.ramp, T = L.terrace, ax = Math.abs(x);
  if (ax <= B.x && z >= B.z0 && z <= B.z1 && ok(B.y)) h = B.y;
  if (ax >= R.x0 && ax <= R.x1 && z >= R.top && z <= R.foot) { const y = B.y * (R.foot - z) / (R.foot - R.top); if (ok(y)) h = Math.max(h, y); }
  if (ax >= T.x0 && ax <= T.x1 && Math.abs(z) <= T.z) { const y = terraceY(ax); if (ok(y)) h = Math.max(h, y); }
  const r = Math.hypot(x, z); if (r >= 6.5 && r <= 9) h = Math.max(h, 0.14);
  return h;
}
/** the edges of the deck: past them is the cloud sea */
export function mainWalkable(x, z) {
  const ax = Math.abs(x);
  if (Math.hypot(x, z) <= L.plazaR - 0.6) return true;
  if (ax <= L.blvd.x - 0.4 && z >= L.blvd.z0 + 1 && z <= L.blvd.z1) return true;
  if (ax <= L.wing.x1 - 0.4 && z >= L.wing.z0 + 0.6 && z <= L.wing.z1 - 0.6) return true;
  if (ax <= L.bridge.x && z >= L.bridge.z0 + 0.25 && z <= L.bridge.z1 - 0.25) return true;
  if (ax <= L.north.x - 0.6 && z >= L.north.z0 && z <= L.north.z1) return true;
  if (ax <= 5.5 && z >= L.canyon.z0 && z <= L.canyon.z1) return true;                 // the canyon pier: inside its rails
  if (ax >= 60 && ax <= L.terrace.x1 - 0.6 && Math.abs(z) <= L.terrace.z - 0.4) return true;
  return false;
}

// ---------------------------------------------------------------- the pieces
/** the beacon: boost() is the arrival glow you control; flare() is the burst of light whenever anyone arrives */
const _white = new THREE.Color(0xffffff);
const BEAM = { set: null, onFlare: null, boost(v) { this.set?.(v); }, flare(v = 1, tint = null) { CAN_U.uTint.value.set(tint ?? CAN_COOL); this.onFlare?.(v); } };
const P = (label, make, extra = {}) => ({ label, mount: "floor", hubOnly: true, category: "hub", ...extra,
  build(ctx) { const group = new THREE.Group(); const ex = make(group, ctx.spec, ctx) || {}; return { group, walkable: extra.flat && extra.walk, ...ex }; } });

/** the whole floor: plaza, lanes, wings, terraces, the north walk, the canyon floor, and the deck's thick edges over the clouds */
function buildDeck(g) {
  const M = mats(), K = new Kit(), R = L.plazaR;
  K.add(new THREE.CircleGeometry(R, 160).rotateX(-Math.PI / 2), M.planks, { uv: 4 });
  for (const [r0, r1] of [[22, 25.5], [40, 43.5], [58.5, 61.5], [76, 79]]) {
    K.add(new THREE.RingGeometry(r0, r1, 160).rotateX(-Math.PI / 2), M.plate, { y: 0.008, uv: 2 });
    for (const r of [r0, r1]) K.add(new THREE.RingGeometry(r - 0.12, r + 0.12, 160).rotateX(-Math.PI / 2), M.metal, { y: 0.02 });
  }
  for (const r of [12, 33, 50, 69]) K.add(new THREE.RingGeometry(r - 0.07, r + 0.07, 160).rotateX(-Math.PI / 2), M.line, { y: 0.016 });
  for (let i = 0; i < 24; i++) {                                   // spokes: thin white inlays out from the beacon
    const a = (i / 24) * TAU, len = R - 10, cx = Math.cos(a) * (10 + len / 2), cz = Math.sin(a) * (10 + len / 2);
    K.add(flatPlane(0.1, len), M.line, { x: cx, y: 0.014, z: cz, ry: -a + Math.PI / 2 });
  }
  // the boulevard: wood and diamond-plate lanes with steel strips between, all the way to the far viewpoint
  const B = L.blvd, len = B.z1 - B.z0, zc = (B.z0 + B.z1) / 2;
  const lanes = [[-25.5, -20, "plate"], [-20, -15, "planks"], [-15, -11, "plate"], [-11, -7, "planks"], [-7, -3, "plate"], [-3, 3, "planks"], [3, 7, "plate"], [7, 11, "planks"], [11, 15, "plate"], [15, 20, "planks"], [20, 25.5, "plate"]];
  for (const [x0, x1, m] of lanes) K.add(flatPlane(x1 - x0, len), M[m], { x: (x0 + x1) / 2, y: 0.03, z: zc, uv: m === "plate" ? 2 : 4 });
  for (const [x0] of lanes.slice(1)) { K.box(0.24, 0.05, len, M.metal, { x: x0, y: 0.04, z: zc }); K.add(flatPlane(0.07, len), M.line, { x: x0 + 0.3, y: 0.045, z: zc }); }
  // join every lane to the plaza: run it on until it meets the grating ring (r 40-43.5), so no lane stops short on bare boards
  const meet = (x) => -Math.sqrt(41.9 * 41.9 - x * x);
  for (const [x0, x1, m] of lanes) { const ze = meet((x0 + x1) / 2), l = ze - B.z1; if (l > 0.2) K.add(flatPlane(x1 - x0, l), M[m], { x: (x0 + x1) / 2, y: 0.03, z: B.z1 + l / 2, uv: m === "plate" ? 2 : 4 }); }
  for (const [x0] of lanes.slice(1)) { const l = meet(x0) - B.z1; if (l > 0.2) K.box(0.24, 0.05, l, M.metal, { x: x0, y: 0.04, z: B.z1 + l / 2 }); }
  // the side wings by the skybridge
  for (const s of [1, -1]) {
    const W = L.wing, wx = s * (W.x0 + W.x1) / 2;
    K.add(flatPlane(W.x1 - W.x0, W.z1 - W.z0), M.planks, { x: wx, y: 0.025, z: (W.z0 + W.z1) / 2, uv: 4, uvRot: true });
    K.add(flatPlane(2, W.z1 - W.z0), M.plate, { x: s * (W.x1 - 1), y: 0.03, z: (W.z0 + W.z1) / 2, uv: 2 });
  }
  // north walk to the canyon
  const N = L.north;
  K.add(flatPlane(N.x * 2, N.z1 - N.z0), M.planks, { y: 0.03, z: (N.z0 + N.z1) / 2, uv: 4 });
  for (const x of [-N.x + 0.6, N.x - 0.6]) K.add(flatPlane(0.12, N.z1 - N.z0), M.line, { x, y: 0.04, z: (N.z0 + N.z1) / 2 });
  // canyon: sand with a boardwalk down the middle
  const C = L.canyon;
  K.add(flatPlane(12, C.z1 - C.z0), M.planks, { y: 0.03, z: (C.z0 + C.z1) / 2, uv: 4 });
  for (const x of [-5.4, 5.4]) { K.add(flatPlane(0.12, C.z1 - C.z0), M.line, { x, y: 0.04, z: (C.z0 + C.z1) / 2 }); K.box(0.22, 0.06, C.z1 - C.z0, M.metal, { x: x * 1.1, y: 0.03, z: (C.z0 + C.z1) / 2 }); }
  // terraces, east and west: four wide steps up to a garden deck
  const T = L.terrace;
  for (const s of [1, -1]) {
    for (let i = 0; i < T.steps; i++) {
      const xa = T.x0 + i * T.step, xb = i === T.steps - 1 ? T.x1 : xa + T.step, y = (i + 1) * T.rise;
      K.add(flatPlane(xb - xa, T.z * 2), M.planks, { x: s * (xa + xb) / 2, y, uv: 4, uvRot: true });
      K.box(0.3, y, T.z * 2, M.white, { x: s * (xa + 0.15), y: y / 2 });                                 // the riser
      K.box(0.06, 0.05, T.z * 2, M.led, { x: s * (xa - 0.02), y: y - 0.06 });                            // a light strip under each step's lip
    }
    const shape = new THREE.Shape(); shape.moveTo(T.x0, 0);                                                 // the sides: one cut-out stair profile
    for (let i = 0; i < T.steps; i++) { shape.lineTo(T.x0 + i * T.step, (i + 1) * T.rise); shape.lineTo(T.x0 + (i + 1) * T.step, (i + 1) * T.rise); }
    shape.lineTo(T.x1, T.steps * T.rise); shape.lineTo(T.x1, -3); shape.lineTo(T.x0, -3);
    for (const sz of [1, -1]) K.add(new THREE.ShapeGeometry(shape), M.white, { z: sz * T.z, sx: s });
    K.box(T.x1 - T.x0, 3, T.z * 2, M.darkTimber, { x: s * (T.x0 + T.x1) / 2, y: -1.5 });
    // closed and filled underneath: a solid body under every step, and a finished end wall with a fascia and a light line
    for (let i = 0; i < T.steps; i++) { const xa = T.x0 + i * T.step, xb = i === T.steps - 1 ? T.x1 : xa + T.step, y = (i + 1) * T.rise; K.box(xb - xa - 0.3, y + 3 - 0.06, T.z * 2 - 0.4, M.darkTimber, { x: s * (xa + xb) / 2, y: (y - 3) / 2 - 0.03 }); }
    const ty = T.steps * T.rise;
    K.box(0.3, ty + 3, T.z * 2 + 0.02, M.white, { x: s * (T.x1 - 0.14), y: (ty - 3) / 2 });
    K.box(0.42, 0.34, T.z * 2 + 0.3, M.white, { x: s * (T.x1 - 0.1), y: ty - 0.17 });
    K.box(0.06, 0.05, T.z * 2, M.led, { x: s * (T.x1 + 0.12), y: ty - 0.4 });
  }
  // the deck's edge and underside: a thick timber platform floating over the clouds
  K.cyl(R, R - 3, 3.2, M.darkTimber, { y: -1.62 }, 160, true);
  K.add(new THREE.CircleGeometry(R - 3, 160).rotateX(Math.PI / 2), M.darkTimber, { y: -3.22 });          // closed underneath, no hollow to see into
  K.add(new THREE.TorusGeometry(R, 0.25, 6, 160).rotateX(Math.PI / 2), M.metal, { y: 0.02 });
  K.box(B.x * 2, 3.2, len, M.darkTimber, { y: -1.62, z: zc });
  for (const s of [1, -1]) K.box(L.wing.x1 - L.wing.x0, 3.2, L.wing.z1 - L.wing.z0, M.darkTimber, { x: s * (L.wing.x0 + L.wing.x1) / 2, y: -1.62, z: (L.wing.z0 + L.wing.z1) / 2 });
  K.box(N.x * 2, 3.2, N.z1 - N.z0, M.darkTimber, { y: -1.62, z: (N.z0 + N.z1) / 2 });
  for (let z = B.z0 + 6; z < B.z1; z += 12) K.box(B.x * 2 + 1, 1.2, 0.8, M.timber, { y: -3.6, z });           // cross beams under the boulevard
  K.into(g, { cast: false });
}

/** one stretch of glass railing between two points (they may be at different heights: ramps) */
function railSeg(K, M, [x0, y0, z0], [x1, y1, z1]) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const top = [V(x0, y0 + 1.05, z0), V(x1, y1 + 1.05, z1)];
  K.add(tube(top, 0.045, 2, 8), M.metal);
  const glass = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([x0, y0 + 0.1, z0, x1, y1 + 0.1, z1, x1, y1 + 1.0, z1, x0, y0 + 1.0, z0], 3)).setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  glass.setIndex([0, 1, 2, 0, 2, 3]); glass.computeVertexNormals();
  K.add(glass, M.railGlass);
  K.add(tube([V(x0, y0 + 0.08, z0), V(x1, y1 + 0.08, z1)], 0.025, 2, 6), M.led);
  const n = Math.max(1, Math.round(len / 2.4));
  for (let k = 0; k <= n; k++) { const t = k / n; K.box(0.07, 1.1, 0.07, M.metal, { x: x0 + dx * t, y: y0 + dy * t + 0.55, z: z0 + dz * t }); }
}
/** railings along every edge that drops to the clouds */
function buildRails(g) {
  const M = mats(), K = new Kit();
  const run = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
      K.box(0.08, 0.08, len, M.metal, { x: (x0 + x1) / 2, y: 1.05, z: (z0 + z1) / 2, ry: a });
      K.add(new THREE.PlaneGeometry(len, 0.9), M.railGlass, { x: (x0 + x1) / 2, y: 0.55, z: (z0 + z1) / 2, ry: a + Math.PI / 2 });
      const n = Math.max(1, Math.round(len / 2.4));
      for (let k = 0; k <= n; k++) K.box(0.07, 1.1, 0.07, M.metal, { x: x0 + dx * (k / n), y: 0.55, z: z0 + dz * (k / n) });
    }
  };
  const R = L.plazaR - 0.3, arc = (a0, a1) => { const out = []; const n = Math.ceil(Math.abs(a1 - a0) / 0.04); for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([Math.cos(a) * R, Math.sin(a) * R]); } return out; };
  const gapAt = (dx) => Math.asin(dx / R);
  const bl = gapAt(L.blvd.x), nr = gapAt(L.north.x), tz = Math.asin(L.terrace.z / R);
  // the plaza's rim, with openings for the boulevard (south, -z), the north walk (+z) and the terraces (east/west)
  run(arc(-Math.PI / 2 + bl, -tz)); run(arc(tz, Math.PI / 2 - nr)); run(arc(Math.PI / 2 + nr, Math.PI - tz)); run(arc(Math.PI + tz, (3 * Math.PI) / 2 - bl));
  const B = L.blvd, W = L.wing;
  for (const s of [1, -1]) {
    const zr = -Math.sqrt(R * R - B.x * B.x);
    run([[s * (B.x - 0.2), zr], [s * (B.x - 0.2), W.z1]]);
    run([[s * (B.x - 0.2), W.z1], [s * (W.x1 - 0.2), W.z1], [s * (W.x1 - 0.2), W.z0], [s * (B.x - 0.2), W.z0]]);
    run([[s * (B.x - 0.2), W.z0], [s * (B.x - 0.2), B.z0 + 0.3]]);
    run([[s * (L.north.x - 0.2), Math.sqrt(R * R - L.north.x ** 2)], [s * (L.north.x - 0.2), L.north.z1]]);
    // the terraces stand 1.8 m up: their railings stand on them, round the outer end and along both sides past the plaza
    const T = L.terrace, ty = T.steps * T.rise, xr = Math.sqrt(R * R - T.z * T.z);
    railSeg(K, M, [s * (T.x1 - 0.2), ty, -T.z + 0.2], [s * (T.x1 - 0.2), ty, T.z - 0.2]);
    for (const sz of [1, -1]) railSeg(K, M, [s * xr, ty, sz * (T.z - 0.2)], [s * (T.x1 - 0.2), ty, sz * (T.z - 0.2)]);
  }
  run([[-B.x + 0.2, B.z0 + 0.3], [B.x - 0.2, B.z0 + 0.3]]);
  K.into(g, { cast: false });
}

// ---------------------------------------------------------------- the great canopy
// A crown ring floats 42 m up and the beacon's beam goes straight through it. Twelve arched trusses fly out from the crown to twelve
// leaning masts. Between them the fabric dips to low corners tied down to the deck, and lifts into a gateway over each of the four ways in.
// Every panel is cut into triangles, and every seam and edge carries light: a soft glow at rest. When someone arrives the crown
// blazes, a spark runs round it, and a wave in that person's colour rolls out over the sails to the masts, lighting triangles as it goes.
const CAN = { Rc: 14, Yc: 42, rPeak: 66, yPeak: 30, rLow: 59, yLow: 10, yGate: 22, ySouth: 29, sag: 6, arch: 7, dip: 4, n: 12, mastR: 61, tipY: 36.5 };
const canAng = (k) => (k / CAN.n) * TAU;                                         // the low corners; the peaks sit halfway between
const kMod = (k) => ((k % CAN.n) + CAN.n) % CAN.n;
const isGate = (k) => kMod(k) % 3 === 0;                                         // east, north, west, south: lifted over the ways in
const polar = (a, r, y = 0) => V(Math.cos(a) * r, y, Math.sin(a) * r);
/** a low corner of the fabric (over a way in it is lifted into a gateway; the south one higher, to frame the boulevard's vault) */
const lowPt = (k) => (isGate(k) ? polar(canAng(k), CAN.rLow + 3, kMod(k) === 9 ? CAN.ySouth : CAN.yGate) : polar(canAng(k), CAN.rLow, CAN.yLow));
const peakPt = (k) => polar(canAng(k + 0.5), CAN.rPeak, CAN.yPeak);
/** the fabric's free edge across sector k (u 0..1: low corner, peak at 0.5, next low corner): a cable curving in between its fixings */
function edgePt(k, u, p = V()) {
  const first = u <= 0.5, t = first ? u * 2 : (1 - u) * 2;
  const Q = lowPt(first ? k : k + 1), P = peakPt(k);
  p.lerpVectors(Q, P, t);
  const rr = Math.hypot(p.x, p.z) || 1, pull = Math.sin(Math.PI * t) * CAN.sag;
  p.x -= (p.x / rr) * pull; p.z -= (p.z / rr) * pull;
  p.y = lerp(Q.y, P.y, (1 - Math.cos(Math.PI * t)) / 2) - 1.2 * Math.sin(Math.PI * t);
  return p;
}
const _ce = V();
/** a point on sector k's sail: v 0 at the crown, 1 at the free edge. It humps over the truss on the ridge and dips along the valleys */
function canPt(k, u, v, p = V()) {
  const a = lerp(canAng(k), canAng(k + 1), u), E = edgePt(k, u, _ce);
  p.set(lerp(Math.cos(a) * CAN.Rc, E.x, v), 0, lerp(Math.sin(a) * CAN.Rc, E.z, v));
  p.y = lerp(CAN.Yc, E.y, v) + lerp(-CAN.dip, CAN.arch, Math.pow(Math.max(0, Math.sin(Math.PI * u)), 1.6)) * Math.sin(Math.PI * v);
  return p;
}
/** where a mast's two backstays come down: either side of it, or both away from a way in so no cable crosses a walkway */
function stayAngles(k) {
  const aP = canAng(k + 0.5);
  if (isGate(k)) return [aP + 0.16, aP + 0.3];
  if (isGate(k + 1)) return [aP - 0.16, aP - 0.3];
  return [aP - 0.12, aP + 0.12];
}
/** a backstay's anchor ring on the deck (kept off the terraces) */
function stayAnchor(a) {
  const p = polar(a, 79);
  if (Math.abs(p.x) > 62 && Math.abs(p.z) < 32.5) { p.z = (Math.sign(p.z) || 1) * 33; p.x = Math.sign(p.x) * Math.sqrt(79 * 79 - 33 * 33); }
  p.y = mainHeightAt(p.x, p.z, 99);
  return p;
}
const mastTip = (k) => polar(canAng(k + 0.5), CAN.mastR + (CAN.rPeak - CAN.mastR) * (CAN.tipY / CAN.yPeak), CAN.tipY);   // in line with the peak
const tieAnchors = (k) => (isGate(k) ? [] : [-0.035, 0.035].map((da) => polar(canAng(k) + da, CAN.rLow + 5)));
/** everything the canopy stands on: the masts' feet, the backstays' anchors, the low corners' tie-downs */
function canopyFeet() {
  const out = [];
  for (let k = 0; k < CAN.n; k++) {
    out.push({ kind: "mast", p: polar(canAng(k + 0.5), CAN.mastR), r: 1.0 });
    for (const a of stayAngles(k)) out.push({ kind: "stay", p: stayAnchor(a), r: 0.65 });
    for (const p of tieAnchors(k)) out.push({ kind: "tie", p, r: 0.6 });
  }
  return out;
}

const _yUp = V(0, 1, 0);
/** a straight rod from a to b (radius r0 at a, r1 at b) */
function strut(K, a, b, r0, mat, n = 6, r1 = r0) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(r1, r0, len, n, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_yUp, d.divideScalar(len)));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return K.add(g, mat);
}
/** a flat triangle with a little thickness, seen from both sides */
function triPlate(a, b, c, th = 0.08) {
  const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize().multiplyScalar(th / 2), pos = [];
  for (const q of [a.clone().add(n), b.clone().add(n), c.clone().add(n), a.clone().sub(n), c.clone().sub(n), b.clone().sub(n)]) pos.push(q.x, q.y, q.z);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0], 2)); g.computeVertexNormals();
  return g;
}

/** the canopy's light, shared by the sails, the outlines, the vault and the floor (the canopy writes it once a frame).
 *  uWave: seconds since the last arrival; uWaveA: how strong that wave still is; uTint: the colour of whoever arrived */
const CAN_U = { uTime: { value: 0 }, uFlare: { value: 0 }, uWave: { value: 99 }, uWaveA: { value: 0 }, uTint: { value: new THREE.Color(0xbff4ff) } };
const CAN_COOL = 0xbff4ff;
const WAVE_GLSL = `
uniform float uTime, uFlare, uWave, uWaveA; uniform vec3 uTint;
float canFront(){ return max(14.0, 6.0 + uWave * 62.0); }                         // rolls out with the wave in the floor
float canWave(float r, float w){ float d = (r - canFront()) / w; return exp(-d * d) * uWaveA; }
float hsh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`;
/** the sails: white fabric cut into a lattice of triangles. The seams glow, the wave lights triangles as it passes,
 *  and the fabric near the crown glows warm from the beam going up through it */
function membraneMat(grid) {
  const m = new THREE.MeshStandardMaterial({ map: mats().tex.membrane, color: 0xffffff, emissive: 0xf3e6d4, emissiveIntensity: 0.12, roughness: 0.92, side: THREE.DoubleSide });
  const uGrid = { value: new THREE.Vector2(grid[0], grid[1]) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CAN_U, { uGrid });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vSeam; varying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeam = uv; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec2 vSeam; varying vec3 vWp; uniform vec2 uGrid;${WAVE_GLSL}`)
      .replace("#include <map_fragment>", `#include <map_fragment>
vec2 sg = vSeam * uGrid, sf = fract(sg), sid = floor(sg), sw = max(fwidth(sg), vec2(1e-4));
float salt = mod(sid.x + sid.y, 2.0);
float sdg = salt < 0.5 ? (sf.x - sf.y) : (sf.x + sf.y - 1.0);
float slu = 1.0 - smoothstep(0.0, max(0.03, sw.x * 1.3), min(sf.x, 1.0 - sf.x));
float slv = 1.0 - smoothstep(0.0, max(0.03, sw.y * 1.3), min(sf.y, 1.0 - sf.y));
float sld = 1.0 - smoothstep(0.0, max(0.022, length(sw) * 0.9), abs(sdg) * 0.7071);
float seam = max(max(slu, slv), sld) * (1.0 - smoothstep(0.14, 0.5, max(sw.x, sw.y)));
float shf = salt < 0.5 ? step(sf.y, sf.x) : step(1.0, sf.x + sf.y);
float stri = hsh(sid * 2.0 + vec2(shf, shf * 3.7));
diffuseColor.rgb *= 1.0 - seam * 0.16;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
{
  float r = length(vWp.xz), wv = canWave(r, 5.0);
  float trail = (1.0 - smoothstep(canFront() - 6.0, canFront() + 2.0, r)) * uWaveA;
  float shimmer = pow(0.5 + 0.5 * sin(uTime * 0.55 + stri * 40.0), 16.0);
  float rest = 0.2 + 0.06 * sin(uTime * 1.1 - r * 0.09);
  vec3 cool = vec3(0.6, 0.92, 1.0), tint = mix(cool, uTint, clamp(uWaveA * uWaveA * 2.2 + wv, 0.0, 1.0));
  totalEmissiveRadiance += tint * seam * (rest + uFlare * 1.1 + wv * 5.0 + shimmer * 0.5);
  float lit = step(0.42, stri) * wv * 1.5 + step(0.78, stri) * trail * 0.3 + shimmer * 0.06;
  totalEmissiveRadiance += uTint * lit + vec3(1.0, 0.93, 0.82) * (0.12 * exp(-(r - 14.0) / 14.0) + uFlare * 0.12 * exp(-(r - 14.0) / 26.0));
  float below = smoothstep(-1.0, 8.0, vWp.y - cameraPosition.y);                   // seen from underneath, daylight comes through the cloth
  totalEmissiveRadiance += vec3(1.0, 0.96, 0.9) * below * (0.2 + 0.06 * (1.0 - seam));
}`);
  };
  m.customProgramCacheKey = () => "mh-membrane-v1";
  m.userData.noShadow = true; m.userData.shared = true;
  return m;
}
/** the outlines: every cable, edge and rib light. A soft glow at rest with pulses running outward; blazes in the arrival's colour */
function outlineMat(base = 1) {
  const m = new THREE.ShaderMaterial({
    toneMapped: false, fog: false,
    uniforms: { ...CAN_U, uBase: { value: base } },
    vertexShader: "varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uBase; varying vec3 vWp;${WAVE_GLSL}
void main(){
  float r = length(vWp.xz), wv = canWave(r, 3.5);
  float run = pow(fract((r - uTime * 7.0) / 26.0), 18.0);
  float ang = atan(vWp.z, vWp.x), sweep = pow(0.5 + 0.5 * cos(ang - uWave * 6.0), 24.0) * uWaveA * (1.0 - smoothstep(18.0, 24.0, r));
  float I = uBase * (0.72 + 0.12 * sin(uTime * 1.3 + r * 0.05)) + run * 1.1 + uFlare * 2.2 + wv * 8.0 + sweep * 6.0;
  vec3 c = mix(vec3(0.74, 0.95, 1.0), uTint, clamp(uWaveA * uWaveA * 2.0 + uFlare * 0.6 + wv, 0.0, 1.0) * 0.88);
  gl_FragColor = vec4(c * I, 1.0);
  #include <colorspace_fragment>
}`,
  });
  m.userData.noShadow = true; m.userData.shared = true;
  return m;
}
let CMATS = null;
const canMats = () => (CMATS ??= { sail: membraneMat([20, 14]), vault: membraneMat([20, 4]), line: outlineMat(1.25), hot: outlineMat(1.9) });
/** one frame of the canopy's light, from the beacon's flare and the seconds since the last arrival */
function canopyLight(t) {
  const U = CAN_U, w = FX.wave;
  U.uTime.value = t; U.uFlare.value = FX.flare; U.uWave.value = w; U.uWaveA.value = w < 7 ? Math.pow(1 - w / 7, 1.3) : 0;
}

function buildCanopy(g) {
  const M = mats(), C = canMats(), K = new Kit(), N = CAN.n, up = V(0, 1, 0);
  const curve = (fn, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(fn(i / n)); return out; };
  const lanterns = [];
  for (let k = 0; k < N; k++) {
    // the sail
    K.add(surface(72, 48, (u, v, p) => canPt(k, u, v, p)), C.sail);
    // its free edge: a white cable with light along it, and the valley line down to the low corner
    const edge = curve((u) => edgePt(k, u), 64);
    K.add(tube(edge, 0.24, 128, 8), M.white);
    K.add(tube(edge.map((q) => q.clone().add(V(0, -0.22, 0))), 0.11, 128, 6), C.line);
    const valley = curve((v) => canPt(k, 0, lerp(0.03, 1, v)).add(V(0, 0.16, 0)), 40);
    K.add(tube(valley, 0.2, 80, 6), M.white);
    K.add(tube(valley.map((q) => q.clone().add(V(0, 0.2, 0))), 0.09, 80, 5), C.line);
    // the ridge: a light line along the top of the sail, seen from the air
    const ridge = curve((v) => canPt(k, 0.5, lerp(0.03, 0.985, v)).add(V(0, 0.22, 0)), 40);
    K.add(tube(ridge, 0.16, 80, 6), M.white);
    K.add(tube(ridge.map((q) => q.clone().add(V(0, 0.18, 0))), 0.08, 80, 5), C.line);
    // the truss under the ridge: a triangular girder (one chord up under the fabric, two below), braced in triangles on every face
    const aP = canAng(k + 0.5), side = V(-Math.sin(aP), 0, Math.cos(aP)), S = 44, top = [], bl = [], br = [];
    for (let i = 0; i <= S; i++) {
      const v = lerp(0.035, 0.975, i / S), q = canPt(k, 0.5, v).add(V(0, -0.38, 0)), d = 0.5 + 2.6 * Math.sin(Math.PI * v), wd = 0.32 + 0.55 * Math.sin(Math.PI * v);
      top.push(q); bl.push(q.clone().addScaledVector(up, -d).addScaledVector(side, wd)); br.push(q.clone().addScaledVector(up, -d).addScaledVector(side, -wd));
    }
    K.add(tube(top, 0.26, 120, 8), M.white);
    for (const ch of [bl, br]) { K.add(tube(ch, 0.17, 120, 6), M.white); K.add(tube(ch.map((q) => q.clone().add(V(0, -0.2, 0))), 0.075, 120, 5), C.line); }
    for (let i = 0; i < S; i++) {
      const e = i % 2 === 0;
      strut(K, e ? top[i] : bl[i], e ? bl[i + 1] : top[i + 1], 0.07, M.white);
      strut(K, e ? top[i] : br[i], e ? br[i + 1] : top[i + 1], 0.07, M.white);
      strut(K, e ? bl[i] : br[i], e ? br[i + 1] : bl[i + 1], 0.06, M.metal);
      if (i % 4 === 0) strut(K, bl[i], br[i], 0.06, M.metal);
    }
    // the mast: leans out, carries the peak, two backstays to the deck; a lantern on top lights when the wave reaches it
    const base = polar(aP, CAN.mastR), tip = mastTip(k);
    strut(K, base, tip, 0.62, M.white, 14, 0.3);
    strut(K, base.clone().add(V(0, 0.6, 0)).add(polar(aP, -0.7)), tip.clone().add(V(0, -0.4, 0)).add(polar(aP, -0.38)), 0.06, C.line, 5);   // a light seam up its inner face
    K.cyl(1.2, 1.5, 0.6, M.darkMetal, { x: base.x, y: 0.3, z: base.z }, 20);
    K.add(new THREE.TorusGeometry(1.32, 0.05, 6, 40).rotateX(Math.PI / 2), C.line, { x: base.x, y: 0.62, z: base.z });
    K.add(new THREE.OctahedronGeometry(0.75, 0), C.hot, { x: tip.x, y: tip.y + 1.1, z: tip.z, sy: 1.7 });
    K.cyl(0.42, 0.5, 0.5, M.metal, { x: tip.x, y: tip.y - 0.1, z: tip.z }, 10);
    lanterns.push(V(tip.x, tip.y + 1.1, tip.z));
    for (const q of [edgePt(k, 0.44), edgePt(k, 0.56)]) strut(K, tip, q, 0.05, M.metal, 4);          // the peak hangs from the mast head
    for (const a of stayAngles(k)) {
      const A = stayAnchor(a);
      strut(K, tip, A.clone().add(V(0, 0.45, 0)), 0.08, M.white, 5); strut(K, tip.clone().add(V(0, -0.25, 0)), A.clone().add(V(0, 0.55, 0)), 0.035, C.line, 4);
      K.cyl(0.55, 0.7, 0.5, M.darkMetal, { x: A.x, y: A.y + 0.25, z: A.z }, 14);
      K.add(new THREE.TorusGeometry(0.62, 0.04, 6, 28).rotateX(Math.PI / 2), C.line, { x: A.x, y: A.y + 0.52, z: A.z });
    }
    // the low corner: a steel plate, tied down by a fork of cables (over the ways in it simply flies, high)
    const Q = lowPt(k);
    K.add(new THREE.OctahedronGeometry(0.55, 0), M.metal, { x: Q.x, y: Q.y, z: Q.z });
    for (const A of tieAnchors(k)) {
      strut(K, Q, A.clone().add(V(0, 0.45, 0)), 0.09, M.white, 5); strut(K, Q.clone().add(V(0, -0.15, 0)), A.clone().add(V(0, 0.5, 0)), 0.035, C.line, 4);
      K.cyl(0.5, 0.62, 0.45, M.darkMetal, { x: A.x, y: 0.22, z: A.z }, 14);
      K.add(new THREE.TorusGeometry(0.55, 0.035, 6, 28).rotateX(Math.PI / 2), C.line, { x: A.x, y: 0.46, z: A.z });
    }
  }
  // the crown: a drum of three rings braced in triangles, spokes in to a hub round the beam, a tiara of blades on top
  const { Rc, Yc } = CAN, NR = 48, hub = 4.4;
  const ring = (r, y, off = 0) => { const out = []; for (let i = 0; i <= NR; i++) out.push(polar(((i + off) / NR) * TAU, r, y)); return out; };
  K.add(new THREE.TorusGeometry(Rc, 0.95, 16, 180).rotateX(Math.PI / 2), M.white, { y: Yc });
  K.add(new THREE.TorusGeometry(Rc - 1.6, 0.34, 10, 160).rotateX(Math.PI / 2), M.metal, { y: Yc - 1.7 });
  K.add(new THREE.TorusGeometry(Rc - 0.8, 0.3, 10, 160).rotateX(Math.PI / 2), M.white, { y: Yc + 2.3 });
  const mid = ring(Rc, Yc), low = ring(Rc - 1.6, Yc - 1.7, 0.5), hi = ring(Rc - 0.8, Yc + 2.3, 0.5);
  for (let i = 0; i < NR; i++) {
    strut(K, mid[i], low[i], 0.1, M.metal); strut(K, low[i], mid[i + 1], 0.1, M.metal);
    strut(K, mid[i], hi[i], 0.1, M.white); strut(K, hi[i], mid[i + 1], 0.1, M.white);
  }
  for (const [r, y, th] of [[Rc, Yc - 0.97, 0.15], [Rc - 0.8, Yc + 2.62, 0.12], [Rc - 1.6, Yc - 2.06, 0.1], [Rc + 0.97, Yc, 0.1]]) K.add(new THREE.TorusGeometry(r, th, 6, 180).rotateX(Math.PI / 2), C.hot, { y });
  K.add(new THREE.TorusGeometry(hub, 0.3, 10, 96).rotateX(Math.PI / 2), M.white, { y: Yc - 1.7 });
  K.add(new THREE.TorusGeometry(hub, 0.1, 6, 96).rotateX(Math.PI / 2), C.hot, { y: Yc - 2.02 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, a2 = a + (i % 2 ? 0.09 : -0.09);
    strut(K, polar(a, Rc - 1.6, Yc - 1.7), polar(a2, hub, Yc - 1.7), 0.07, M.metal, 5);
    if (i % 2 === 0) strut(K, polar(a, Rc - 1.6, Yc - 1.95), polar(a2, hub, Yc - 1.95), 0.035, C.line, 4);
  }
  for (let i = 0; i < 24; i++) {                                                  // the tiara: blades leaning out, lit along their edges
    const a = (i / 24) * TAU, h = i % 2 ? 4.2 : 6.8, tilt = 0.32;
    const B = polar(a, Rc - 0.8, Yc + 2.4), T = V(-Math.sin(a), 0, Math.cos(a)), A = B.clone().add(V(0, h * Math.cos(tilt), 0)).add(polar(a, h * Math.sin(tilt)));
    const c0 = B.clone().addScaledVector(T, -0.95), c1 = B.clone().addScaledVector(T, 0.95);
    K.add(triPlate(c0, c1, A, 0.12), M.white);
    strut(K, c0, A, 0.06, C.hot, 4); strut(K, c1, A, 0.06, C.hot, 4);
  }
  K.into(g);
  // the glow round the crown, seen from anywhere in the hub, and a lantern glow on every mast head
  const glow = (color, opacity) => new THREE.SpriteMaterial({ map: M.tex.glowDisc, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const haloMat = glow(0xd8f6ff, 0.3), halo = new THREE.Sprite(haloMat); halo.position.y = Yc; halo.scale.setScalar(46); g.add(halo);
  const lampMat = glow(0xd8f6ff, 0.4);
  for (const p of lanterns) { const s = new THREE.Sprite(lampMat); s.position.copy(p); s.scale.setScalar(7); g.add(s); }
  const under = new THREE.Mesh(new THREE.RingGeometry(hub + 0.2, Rc + 1, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: M.tex.glowDisc, color: 0xcff4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  under.position.y = Yc - 2.1; g.add(under);
  const white = new THREE.Color(0xd8f6ff), tmp = new THREE.Color(), lampR = Math.hypot(lanterns[0].x, lanterns[0].z);
  return (t) => {
    canopyLight(t);
    const U = CAN_U, a = U.uWaveA.value, f = FX.flare, front = Math.max(14, 6 + U.uWave.value * 62), hit = Math.exp(-(((front - lampR) / 9) ** 2)) * a;
    tmp.copy(white).lerp(U.uTint.value, Math.min(1, a * 1.2));
    haloMat.color.copy(tmp); haloMat.opacity = 0.16 + 0.03 * Math.sin(t * 1.2) + 0.22 * f + 0.12 * a;
    halo.scale.setScalar(38 + 10 * f + 6 * a);
    under.material.color.copy(tmp); under.material.opacity = 0.22 + 0.3 * f + 0.2 * a;
    lampMat.color.copy(tmp); lampMat.opacity = 0.32 + 0.06 * Math.sin(t * 2.1) + 0.9 * hit + 0.3 * f;
  };
}

/** the boulevard's vault: arched ribs every 16 m with the fabric sagging between them */
function vaultY(x) { const h = L.vault.half; return 12 + 16 * Math.sqrt(Math.max(0, 1 - (x / h) ** 2)); }
function buildVault(g) {
  const M = mats(), C = canMats(), K = new Kit(), Vt = L.vault, h = Vt.half;
  const ribZ = (k) => Vt.z0 - k * Vt.bay;
  for (let k = 0; k <= Vt.bays; k++) {
    const z = ribZ(k), pts = [V(-h, 0, z), V(-h, 6, z)];
    for (let i = 0; i <= 24; i++) { const x = -h + (2 * h * i) / 24; pts.push(V(x, vaultY(x) + 0.3, z)); }
    pts.push(V(h, 6, z), V(h, 0, z));
    K.add(tube(pts, 0.5, 120, 10), M.white);
    K.add(tube(pts.slice(2, -2).map((q) => q.clone().add(V(0, -0.52, 0))), 0.06, 96, 5), M.led);
    K.add(tube(pts.map((q, i) => q.clone().add(V(0, i > 1 && i < pts.length - 2 ? 0.48 : 0, 0))), 0.13, 120, 6), C.line);   // the rib's outline
    for (const s of [1, -1]) { K.cyl(0.9, 1.2, 0.5, M.metal, { x: s * h, y: 0.25, z }, 16); K.add(new THREE.SphereGeometry(0.45, 12, 8), M.led, { x: s * (h - 0.7), y: 11.4, z }); }
    if (k < Vt.bays) K.add(surface(48, 20, (u, v, p) => {
      const x = lerp(-h + 0.4, h - 0.4, u), w = Math.sqrt(Math.max(0, 1 - (x / h) ** 2));
      p.set(x, vaultY(x) - 2.6 * Math.sin(Math.PI * v) * (0.35 + 0.65 * w), lerp(z, ribZ(k + 1), v));
    }), C.vault);
  }
  const ridge = []; for (let k = 0; k <= Vt.bays; k++) ridge.push(V(0, vaultY(0) + 0.35, ribZ(k)));
  K.add(tube(ridge, 0.18, 60, 6), M.timber);
  for (const s of [1, -1]) { const eave = []; for (let k = 0; k <= Vt.bays; k++) eave.push(V(s * (h - 0.4), vaultY(s * (h - 0.4)) + 0.2, ribZ(k))); K.add(tube(eave, 0.13, 60, 6), C.line); }
  K.into(g);
}

/** a column of light on its glass disc, with chevrons drifting down through it */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 }, uColor: { value: new THREE.Color(0xdff8ff) }, uAlpha: { value: 0.3 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
    fragmentShader: "uniform float uTime; uniform float uBoost; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying vec3 vN; varying vec3 vV;\n" +
      "void main(){ float edge=pow(1.0-abs(dot(vN,vV)),1.6); float fall=pow(1.0-vUv.y,0.55); float streak=0.55+0.45*sin(vUv.x*62.83+uTime*1.3)*sin(vUv.y*40.0-uTime*3.0);\n" +
      "float inside=0.1+0.9*smoothstep(2.6,7.0,length(cameraPosition.xz)); float a=uAlpha*fall*(0.35+0.65*edge)*(0.75+0.25*streak)*uBoost*inside; gl_FragColor=vec4(uColor*(0.7+0.6*edge),a); }",
  });
}
function chevronGeo() {
  const s = new THREE.Shape(); s.moveTo(-1, 0.55); s.lineTo(0, -0.3); s.lineTo(1, 0.55); s.lineTo(1, 0.15); s.lineTo(0, -0.7); s.lineTo(-1, 0.15); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05);
}

/** the beam's body: a soft column of light summed along the whole line of sight through it (not painted on its skin), so it
 *  glows from anywhere - gently from the side, brighter the more of it you look along, a tunnel of light from inside.
 *  The near faces carry it from outside (so things behind it are still covered by its glow), the far faces from inside */
function volBeamMat(side) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: side !== THREE.BackSide, blending: THREE.AdditiveBlending, side, fog: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 }, uCap: { value: side === THREE.BackSide ? 1.0 : 1.8 }, uTint: CAN_U.uTint, uFlare: CAN_U.uFlare },
    vertexShader: "varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime, uBoost, uFlare, uCap; uniform vec3 uTint; varying vec3 vWp;
float erfa(float x){ return tanh(clamp(1.2025 * x, -9.0, 9.0)); }
void main(){
  vec3 ro = cameraPosition, rd = normalize(vWp - ro);
  vec2 c = ro.xz, d = rd.xz; float s = max(length(d), 1e-3);
  float tc = -dot(c, d) / (s * s);                                            // where the line of sight passes closest to the axis
  float tEnd = rd.y < -1e-4 ? max(0.0, (0.02 - ro.y) / rd.y) : rd.y > 1e-4 ? max(0.0, (176.0 - ro.y) / rd.y) : 1e5;   // ...and where it leaves (floor or top)
  vec2 q = c + d * tc; float dm2 = dot(q, q), a0 = -s * tc, a1 = s * (tEnd - tc);
  float g1 = 0.886 * 2.4 / s * exp(-dm2 / 5.76) * (erfa(a1 / 2.4) - erfa(a0 / 2.4));        // a gaussian glow, integrated exactly along the ray
  float g2 = 0.886 * 0.95 / s * exp(-dm2 / 0.9025) * (erfa(a1 / 0.95) - erfa(a0 / 0.95));  // and its bright core
  float y = ro.y + rd.y * clamp(tc, 0.0, tEnd);
  float dens = smoothstep(-0.5, 1.5, y) * (0.3 + 0.7 * exp(-max(y, 0.0) / 80.0)) * (1.0 - smoothstep(110.0, 175.0, y));
  float tw = clamp(tc + sqrt(max(0.0, 12.96 - dm2)) / s, 0.0, tEnd), yw = ro.y + rd.y * tw;
  float flow = 0.78 + 0.22 * sin(yw * 0.32 - uTime * 5.0) * (0.6 + 0.4 * sin(yw * 0.07 + uTime * 1.3));   // light streaming up it
  float I = (g1 * 0.05 + g2 * 0.13) * dens * flow * uBoost;
  I = uCap * (1.0 - exp(-I / uCap));                                          // softer from inside, so the plaza shows through
  vec3 col = mix(vec3(0.84, 0.96, 1.0), uTint, clamp(uFlare * 1.2, 0.0, 0.85));
  gl_FragColor = vec4(col * I, 1.0);
}`,
  });
}

/** the camera's view of the beacon, run once a frame after the camera has moved: the lens flare, and which side of the glow to draw */
const BEACON_CAM = { update: null };
function flareTextures() {
  const ring = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [p, c] of [[0, "rgba(255,255,255,0.04)"], [0.72, "rgba(255,255,255,0.07)"], [0.84, "rgba(200,240,255,0.9)"], [0.9, "rgba(255,200,240,0.35)"], [1, "rgba(255,255,255,0)"]]) r.addColorStop(p, c);
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const hex = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,0.55)"); r.addColorStop(0.8, "rgba(255,255,255,0.3)"); r.addColorStop(1, "rgba(255,255,255,0.05)");
    g.fillStyle = r; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(w / 2 + Math.cos(a) * w * 0.46, w / 2 + Math.sin(a) * w * 0.46); }
    g.closePath(); g.fill();
  });
  const streak = canvasTex(512, 64, (g, w, h) => {
    g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.22, "rgba(200,235,255,0.5)"); r.addColorStop(1, "rgba(150,210,255,0)");
    g.fillStyle = r; g.fillRect(-w / 2, -w / 2, w, w); g.restore();
  });
  return { ring, hex, streak };
}
/** a lens flare: soft shapes strung across the screen from the beam's foot through the middle, the way a real lens sees a bright light */
function makeFlare(M) {
  const T = flareTextures(), group = new THREE.Group(), els = [];
  const spec = [[T.streak, 1.5, 0, 0xd6f2ff, 0.5, 0.125], [M.tex.glowDisc, 0.5, 0, 0xffffff, 0.55, 1], [T.hex, 0.07, 0.3, 0x9fd8ff, 0.22, 1], [T.ring, 0.17, 0.47, 0xbfe9ff, 0.2, 1],
    [T.hex, 0.05, 0.62, 0xffd9a8, 0.24, 1], [M.tex.glowDisc, 0.1, 0.76, 0xa8c8ff, 0.3, 1], [T.hex, 0.12, 0.92, 0xc9b5ff, 0.16, 1], [T.ring, 0.32, 1.18, 0x9fe8ff, 0.1, 1]];
  for (const [map, size, dist, color, alpha, aspect] of spec) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    s.renderOrder = 1000; s.frustumCulled = false; s.raycast = () => {}; s.visible = false; group.add(s);
    els.push({ s, size, dist, alpha, aspect, base: new THREE.Color(color) });
  }
  const src = V(0, 2.6, 0), ndc = V(), q = V(), tint = new THREE.Color();
  return {
    group,
    update(cam, strength) {
      const ahead = q.copy(src).applyMatrix4(cam.matrixWorldInverse).z < -0.5;
      ndc.copy(src).project(cam);
      const on = strength > 0.01 && ahead && Math.abs(ndc.x) < 1.25 && Math.abs(ndc.y) < 1.25;
      const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 0.75, 1.2);
      const H = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), A = cam.aspect;
      tint.copy(FX.tint).lerp(_white, 0.55);
      for (const e of els) {
        e.s.visible = on;
        if (!on) continue;
        const k = 1 - 2 * e.dist;                                                // from the light, through the middle, out the far side
        q.set(ndc.x * k * (A * H / 2), ndc.y * k * (H / 2), -1).applyMatrix4(cam.matrixWorld);
        e.s.position.copy(group.worldToLocal(q));
        e.s.scale.set(e.size * H, e.size * H * e.aspect, 1);
        e.s.material.opacity = e.alpha * strength * edge;
        e.s.material.color.copy(e.base).multiply(tint);
      }
    },
  };
}

// ---------------------------------------------------------------- the canyon and the far city
function finGeo(H, W, T, bend, lean, twist) {
  return surface(12, 30, (a, u, p) => {
    const ang = a * TAU, w = W * Math.pow(1 - u, 0.8) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.25 + u))) + 0.08;
    const xs = Math.cos(ang) * w / 2, zs = Math.sin(ang) * (T * Math.pow(1 - u, 0.7) + 0.05) * (1 - Math.abs(Math.cos(ang)) * 0.4);
    const tw = twist * u, cx = bend * u * u, cz = lean * u * u;
    p.set(cx + Math.cos(tw) * xs - Math.sin(tw) * zs, H * u, cz + Math.sin(tw) * xs + Math.cos(tw) * zs);
  });
}
function buildCanyon(g) {
  const M = mats(), K = new Kit(), r = seeded(2024);
  for (let z = L.canyon.z0 + 4; z < 268; z += 4.2) for (const s of [1, -1]) {
    for (let layer = 0; layer < 2; layer++) {
      const x = s * (18 + layer * 20 + r() * 16), H = 12 + r() * 22 + layer * 18 + (z - 110) * 0.08, W = 4 + r() * 7;
      const D = 70 + layer * 10;                                            // they rise out of the cloud sea far below, like the towers, not off a floor
      const bend = -s * H * (0.15 + r() * 0.3) * 0.75, lean = (r() - 0.5) * H * 0.25, u0 = D / (H + D);
      const geo = finGeo(H + D, W * 2.1, (0.6 + r() * 0.8) * 2.4, bend, lean, (r() - 0.5) * 1.2);   // thick, solid blades
      geo.translate(-bend * u0 * u0, 0, -lean * u0 * u0);                    // where it passes deck level is where it always stood, clear of the pier
      K.add(geo, r() < 0.35 ? M.finWarm : M.fin, { x, y: -D, z: z + r() * 3, ry: (r() - 0.5) * 1.4 });
    }
  }
  // the boardwalk is a pier over the drop: a thick timber deck, white piers down into the clouds, glass rails with a rope of light
  const C = L.canyon, cl = C.z1 - C.z0, cz = (C.z0 + C.z1) / 2;
  K.box(12.6, 1.1, cl, M.darkTimber, { y: -0.56, z: cz });
  for (const s of [1, -1]) {
    K.box(0.3, 0.32, cl, M.white, { x: s * 6.3, y: -0.2, z: cz });
    K.add(new THREE.PlaneGeometry(cl, 0.95).rotateY(Math.PI / 2), M.railGlass, { x: s * 5.95, y: 0.6, z: cz });
    K.add(new THREE.CylinderGeometry(0.06, 0.06, cl, 10).rotateX(Math.PI / 2), M.metal, { x: s * 5.95, y: 1.1, z: cz });
    K.add(new THREE.CylinderGeometry(0.03, 0.03, cl, 6).rotateX(Math.PI / 2), M.led, { x: s * 5.95, y: 0.12, z: cz });
    for (let z = C.z0 + 4; z < C.z1; z += 3) K.cyl(0.035, 0.035, 1.1, M.metal, { x: s * 5.95, y: 0.55, z }, 8);
  }
  for (let z = C.z0 + 10; z < C.z1; z += 18) for (const s of [1, -1]) { K.cyl(0.7, 1.1, 70, M.white, { x: s * 4.2, y: -36, z }, 24); K.box(9, 0.6, 0.8, M.white, { y: -1.4, z }); }
  // the spire at the canyon's end: white ribs of light, a holo ring
  const sp = V(0, 0, 300);
  K.add(new THREE.LatheGeometry([V(9, 0), V(7.5, 30), V(5, 80), V(3.2, 120), V(0.6, 160)], 32), M.white, { x: sp.x, z: sp.z });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const pts = [0, 30, 80, 120, 158].map((y, j) => { const rr = [9.2, 7.7, 5.2, 3.4, 0.7][j]; return V(sp.x + Math.cos(a) * rr, y, sp.z + Math.sin(a) * rr); }); K.add(tube(pts, 0.22, 40, 5), M.led); }
  for (const [y, rr] of [[64, 13], [70, 14.5], [76, 13]]) K.add(new THREE.TorusGeometry(rr, 0.28, 8, 96).rotateX(Math.PI / 2), M.cyan, { x: sp.x, y, z: sp.z });
  K.into(g);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 13.6, 7, 96, 1, true), new THREE.MeshBasicMaterial({ map: bannerText("THE MAIN HUB"), transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  band.position.set(sp.x, 70, sp.z); g.add(band);
  return (t) => { band.rotation.y = t * 0.08; };
}
function buildSkyline(g) {
  const M = mats(), K = new Kit(), r = seeded(808);
  for (let i = 0; i < 110; i++) {
    const a = r() * TAU, d = 300 + r() * 320, x = Math.cos(a) * d, z = Math.sin(a) * d, H = 90 + r() * 260, w = 10 + r() * 26, kind = r();
    if (kind < 0.45) K.box(w, H, w * (0.6 + r() * 0.8), M.facade, { x, y: H / 2 - 80, z, ry: r() * 3 });
    else if (kind < 0.8) K.cyl(w * 0.35, w * 0.55, H, M.facade, { x, y: H / 2 - 80, z }, 20);
    else K.add(finGeo(H, w * 1.4, 2, (r() - 0.5) * H * 0.4, 0, 0.6), M.tower, { x, y: -80, z, ry: r() * TAU });
  }
  K.add(flatPlane(4000, 4000), M.cloudSea, { y: -70, uv: 220 });
  K.into(g, { cast: false });
  const puffs = new THREE.Group(), q = seeded(55);
  for (let i = 0; i < 70; i++) { const a = q() * TAU, d = 95 + q() * 260, s = new THREE.Sprite(M.puff); s.position.set(Math.cos(a) * d, -14 - q() * 40, Math.sin(a) * d - 60); s.scale.setScalar(50 + q() * 70); puffs.add(s); }
  g.add(puffs);
}

// ---------------------------------------------------------------- light effects
/** how bright the hub is right now: the beacon writes it (flare: 0..1 as someone arrives, wave: seconds since) and everything else reads it */
const FX = { flare: 0, wave: 99, tint: CAN_U.uTint.value };
const GLOW_U = { uTime: { value: 0 }, uFlare: { value: 0 }, uWave: { value: 999 }, uWaveA: { value: 0 }, uTint: CAN_U.uTint };
/** light running in the floor's white inlays: the rings, the spokes and the boulevard lines glow, pulses run out along them,
 *  and each arrival sends a bright wave out across the whole deck. REGION 0 the plaza, 1 the boulevard, 2 the north walk and canyon */
function floorGlowMat(region) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -8,
    defines: { REGION: region }, uniforms: GLOW_U,
    vertexShader: "varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime, uFlare, uWave, uWaveA; uniform vec3 uTint; varying vec2 vP;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float ln(float d, float w){ return 1.0 - smoothstep(0.0, w, abs(d)); }
float soft(float d, float w){ return exp(-abs(d) / w); }
void main(){
  vec2 p = vP; float r = length(p);
  float core = 0.0, halo = 0.0, run = 0.0, dash = 0.0;
#if REGION == 0
  if ((abs(p.x) < 25.5 && p.y < -50.0) || (abs(p.x) < 8.0 && p.y > 70.0) || r > 84.0 || r < 9.2) discard;
  float rings[4] = float[](12.0, 33.0, 50.0, 69.0);
  for (int i = 0; i < 4; i++) { float d = r - rings[i], rip = 0.65 + 0.35 * sin(uTime * 1.3 - rings[i] * 0.12); core += ln(d, 0.1) * rip; halo += soft(d, 0.45) * rip; }
  float edges[8] = float[](22.0, 25.5, 40.0, 43.5, 58.5, 61.5, 76.0, 79.0);
  for (int i = 0; i < 8; i++) { float d = r - edges[i]; halo += soft(d, 0.3) * 0.35; }
  float seg = 6.28318 / 24.0, ang = atan(p.y, p.x) + seg * 0.5, idx = floor(ang / seg), da = (mod(ang, seg) - seg * 0.5) * r;
  float sp = step(10.0, r);
  core += ln(da, 0.07) * sp * 0.8; halo += soft(da, 0.3) * sp * 0.6;
  float ph = fract((r - uTime * 9.0) / 30.0 + hash(idx * 1.7));
  run += pow(ph, 22.0) * soft(da, 0.18) * sp * 3.0;
  float lanes[4] = float[](23.75, 41.75, 60.0, 77.5);                  // dashes marching round the middle of each grating ring
  for (int i = 0; i < 4; i++) { float f = fract((atan(p.y, p.x) * lanes[i] - uTime * 2.0 * (mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0)) / 3.0); dash += ln(r - lanes[i], 0.09) * smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.42, 0.47, f)); }
#elif REGION == 1
  float xs[10] = float[](-19.7, -14.7, -10.7, -6.7, -2.7, 3.3, 7.3, 11.3, 15.3, 20.3);
  for (int i = 0; i < 10; i++) {
    float d = p.x - xs[i]; core += ln(d, 0.07); halo += soft(d, 0.3) * 0.7;
    float ph = fract((-p.y - uTime * 13.0) / 46.0 + hash(float(i) * 3.1));
    run += pow(ph, 26.0) * soft(d, 0.15) * 3.0;
  }
  float lx2[6] = float[](-22.75, -13.0, -5.0, 5.0, 13.0, 22.75);       // and down the middle of each grating lane
  for (int i = 0; i < 6; i++) { float f = fract((p.y + uTime * 2.0 * sign(lx2[i])) / 3.0); dash += ln(p.x - lx2[i], 0.09) * smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.42, 0.47, f)); }
#else
  float lx = p.y < 110.0 ? 7.4 : 5.4;
  for (int i = 0; i < 2; i++) {
    float d = abs(p.x) - lx; core += ln(d, 0.09); halo += soft(d, 0.35) * 0.7;
    float ph = fract((p.y - uTime * 10.0) / 36.0 + float(i) * 0.5 + step(0.0, p.x) * 0.25);
    run += pow(ph, 24.0) * soft(d, 0.18) * 3.0;
  }
#endif
  float wd = (r - uWave) / 4.0, wave = exp(-wd * wd) * uWaveA, front = ln(r - uWave, 0.5) * uWaveA;
  float I = 0.28 + 0.06 * sin(uTime * 0.9) + uFlare * 2.6 + wave * 5.0;
  vec3 c = mix(vec3(1.0, 0.98, 0.94), uTint, clamp(wave * 1.6, 0.0, 0.85)) * core * I + vec3(0.45, 0.85, 1.0) * (halo * (0.07 + uFlare * 0.6 + wave * 1.6) + run * (0.5 + uFlare));
  c += mix(vec3(0.55, 0.9, 1.0), uTint, clamp(uWaveA * 1.5, 0.0, 1.0)) * (wave * 0.05 + front * 0.18);
  c += mix(vec3(0.15, 0.75, 1.0), uTint, clamp(wave * 1.6, 0.0, 0.85)) * dash * (0.55 + uFlare * 1.8 + wave * 3.0);
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}
/** a portal's surface: arms of light spiralling in to a white core, in the colour of where it goes */
function vortexMat(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uBoost: { value: 1 }, uRip: { value: 0 }, uRipC: { value: new THREE.Vector2() }, uFlash: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform float uTime, uBoost, uRip, uFlash; uniform vec2 uRipC; uniform vec3 uColor; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  vec2 rp = p - uRipC; float rd = length(rp), wv = sin(rd * 22.0 - uTime * 8.0) * exp(-rd * 1.4) * uRip;   // someone walking in: rings spread from where they touch
  p += rp / max(rd, 1e-3) * wv * 0.08;
  float a = atan(p.y, p.x);
  float arms = 0.5 + 0.5 * sin(a * 3.0 + log(r + 0.03) * 5.0 + uTime * 2.2);
  float tw = uTime * 0.9 - log(r + 0.05) * 1.6; vec2 q = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
  float n = noise(q * 3.5 + 7.0) * 0.6 + noise(q * 9.0 - 3.0) * 0.4;
  float core = exp(-r * r * 10.0), edge = smoothstep(0.6, 1.0, r), v = arms * n;
  vec3 c = mix(uColor * 0.12, uColor * 1.25, smoothstep(0.15, 0.75, v)) * (0.35 + 0.65 * r);
  c += vec3(1.0) * pow(v, 5.0) * 0.9 + vec3(1.0, 0.98, 0.95) * core * 1.3 + uColor * edge * 1.1;
  c += mix(uColor, vec3(1.0), 0.5) * max(wv, 0.0) * 1.8 + vec3(1.0, 0.98, 0.95) * uFlash * (1.2 - 0.5 * r);
  gl_FragColor = vec4(c * uBoost, 0.94 * (1.0 - smoothstep(0.97, 1.0, r)));
  #include <colorspace_fragment>
}`,
  });
}
/** a thin beam into the sky, brightest at its foot */
function skyBeamMat(color, alpha = 0.5) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
    fragmentShader: `uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float fall = pow(1.0 - vUv.y, 1.6); float ripple = 0.75 + 0.25 * sin(vUv.y * 90.0 - uTime * 4.0);
  gl_FragColor = vec4(uColor, uAlpha * fall * edge * ripple); }`,
  });
}
/** light bands rising up a cylinder: the projector's field under the holo cards */
function fieldMat(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uBoost: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform float uTime, uBoost; uniform vec3 uColor; varying vec2 vUv;
void main(){ float fall = pow(1.0 - vUv.y, 2.2); float lines = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 60.0 + uTime * 0.7);
  float rise = 0.6 + 0.4 * sin(vUv.y * 26.0 - uTime * 3.0);
  gl_FragColor = vec4(uColor, 0.16 * fall * lines * rise * uBoost); }`,
  });
}
/** a portal's street sign: green enamel, a white border, a dot in the portal's colour, the name and an arrow in */
const streetSign = (name, col) => canvasTex(1024, 218, (g, w, h) => {
  g.fillStyle = "#1d6b3e"; rrect(g, 0, 0, w, h, 26); g.fill();
  g.strokeStyle = "#f4f7f2"; g.lineWidth = 9; rrect(g, 14, 14, w - 28, h - 28, 18); g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(78, h / 2, 24, 0, TAU); g.fill();
  g.fillStyle = "#f4f7f2"; g.textBaseline = "middle"; g.textAlign = "left";
  fitText(g, name, w - 330, 112, 900); g.fillText(name, 124, h / 2 + 6);
  const ax = w - 160, ay = h / 2;
  g.lineWidth = 22; g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#f4f7f2";                      // a chevron pointing down into the portal (the sign turns, so no left/right arrow)
  for (const dy of [-26, 18]) { g.globalAlpha = dy < 0 ? 0.55 : 1; g.beginPath(); g.moveTo(ax - 34, ay + dy - 18); g.lineTo(ax + 6, ay + dy + 18); g.lineTo(ax + 46, ay + dy - 18); g.stroke(); }
  g.globalAlpha = 1;
});
/** stepping through a portal: the screen floods with its light, then clears on the other side */
function portalFlash(col) {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9000;opacity:0;background:radial-gradient(circle at 50% 50%, #ffffff 0%, ${col} 38%, rgba(0,0,0,0) 80%)`;
  document.body.appendChild(d);
  d.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 1000, easing: "ease-out" });
  setTimeout(() => d.remove(), 1050);
}
const _dbs = new THREE.Vector2();
/** things drifting in the air, sized in metres: blossom petals (kind 0) turning as they fall, or golden dust (kind 1) twinkling */
function airMat(kind) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: kind ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uViewH: { value: 900 } },
    vertexShader: `attribute float aSize, aSeed; uniform float uTime, uViewH; varying float vA, vRot, vFlip, vTone;
void main(){
  vec3 p = position; float s = aSeed;
  ${kind ? "p.y += sin(uTime * (0.2 + s * 0.3) + s * 40.0) * 1.2; p.x += sin(uTime * 0.13 + s * 17.0) * 2.0; p.z += cos(uTime * 0.11 + s * 23.0) * 2.0;"
    : "p.y = mod(p.y - uTime * (0.55 + s * 0.6), 22.0); float k = uTime * (0.6 + s * 0.5) + s * 60.0; p.x += sin(k) * 1.4 + sin(uTime * 0.21 + s * 9.0) * 3.0; p.z += cos(k * 0.8) * 1.2;"}
  vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
  gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(d, 0.3), 0.0, 96.0);
  vA = smoothstep(0.4, 2.0, d) * (1.0 - smoothstep(${kind ? "35.0, 70.0" : "45.0, 95.0"}, d));
  vRot = uTime * (0.8 + s * 1.6) + s * 30.0; vFlip = cos(uTime * (1.1 + s) + s * 11.0); vTone = fract(s * 7.13);
  ${kind ? "vA *= 0.55 + 0.45 * sin(uTime * (1.5 + s * 2.0) + s * 50.0);" : ""}
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `varying float vA, vRot, vFlip, vTone;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  ${kind ? `float a = exp(-dot(q, q) * 22.0); vec3 c = mix(vec3(1.0, 0.8, 0.48), vec3(1.0, 0.95, 0.8), vTone) * a * 0.9;
  gl_FragColor = vec4(c * vA, 1.0);`
    : `float cs = cos(vRot), sn = sin(vRot); q = mat2(cs, -sn, sn, cs) * q; q.x /= max(0.18, abs(vFlip));
  float e = length(vec2(q.x * 2.3, q.y * 1.35 + 0.04)), a = 1.0 - smoothstep(0.4, 0.5, e);
  a *= smoothstep(0.03, 0.09, length(q - vec2(0.0, 0.33)));
  if (a * vA < 0.02) discard;
  vec3 c = mix(vec3(1.0, 0.62, 0.76), vec3(0.9, 0.38, 0.58), vTone) * (0.8 + 0.25 * abs(vFlip));
  gl_FragColor = vec4(c, a * vA * 0.95);`}
  #include <colorspace_fragment>
}`,
  });
}
/** a shaft of sunlight: soft at its edges, fading out towards the floor and when you're standing in it */
function godRayMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.72, 0.36) }, uBoost: { value: 1 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN, vV; varying float vD, vX; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vec3 tc = cameraPosition - w.xyz; vD = length(tc); vV = tc / max(vD, 1e-3); vX = w.x + w.z; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime, uBoost; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN, vV; varying float vD, vX;
void main(){
  float edge = pow(abs(dot(normalize(vN), vV)), 2.5);
  float fall = smoothstep(0.0, 0.035, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * mix(0.75, 1.0, smoothstep(0.0, 0.3, vUv.y));   // soft where it lands, dissolving up into the sky
  float shim = 0.7 + 0.3 * sin(uTime * 0.45 + vX * 0.07) * sin(uTime * 0.31 + vUv.x * 18.85);
  float a = edge * fall * shim * smoothstep(3.0, 14.0, vD) * 1.3 * uBoost;   // has to be strong: it's warm light over a white canopy
  gl_FragColor = vec4(uColor * a, 1.0);
}`,
  });
}
let CROWN_MAT = null;
const SIGN_Y = 8.6;                                                     // the floating sign over each portal ring
const PORTAL_LIST = [["park", "Central Park"], ["cafe", "The Café"], ["library", "The Library"], ["museum", "The Museum"], ["arcade", "The Arcade"],
  ["beach", "Beach Resort"], ["stalls", "Community Stalls"], ["home", "Go Home"]];
const PORTAL_COLOR = { park: "#46e08a", cafe: "#ffa35c", library: "#7b92ff", museum: "#c08cff", arcade: "#ff4f8e", beach: "#ffc556", stalls: "#ff8148", home: "#dfe7f2" };

// ---------------------------------------------------------------- the catalog
const additive2 = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
const leaf = (r, s) => { const ico = new THREE.IcosahedronGeometry(s, 2); ico.deleteAttribute("normal"); ico.deleteAttribute("uv"); const geo = mergeVertices(ico), p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } geo.computeVertexNormals(); return geo; };

export const MAIN_CATALOG = {
  mhDeck: P("Boardwalk", (g) => { buildDeck(g); }, { flat: true, walk: true, colliders: (s) => {
    const T = L.terrace, out = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) out.push([sx > 0 ? T.x0 : -T.x1, sz * T.z - 0.25, sx > 0 ? T.x1 : -T.x0, sz * T.z + 0.25]);   // the terraces' sides
    return out;
  } }),
  mhRails: P("Railing", (g) => { buildRails(g); }, { colliders: () => [], stay: true, info: "Glass railings. Beyond them, nothing but cloud for miles." }),
  mhCanopy: P("The great canopy", (g) => ({ update: buildCanopy(g) }), { stay: true,
    info: "Twelve sails cut into thousands of triangles, flown from a crown ring 42 m up on twelve leaning masts. Every seam carries light: each time someone arrives, a wave in their colour rolls out across it.",
    colliders: () => canopyFeet().map(({ p, r }) => [p.x - r, p.z - r, p.x + r, p.z + r]) }),
  mhVault: P("Boulevard vault", (g) => { buildVault(g); }, { stay: true, info: "Ribbed arches carry the canopy down the whole boulevard. The portals are under here.",
    colliders: () => { const out = []; for (let k = 0; k <= L.vault.bays; k++) for (const s of [1, -1]) { const z = L.vault.z0 - k * L.vault.bay, x = s * L.vault.half; out.push([x - 1, z - 1, x + 1, z + 1]); } return out; } }),
  mhBeacon: P("The beacon", (g, s, ctx) => {
    const M = mats(), K = new Kit();
    K.add(new THREE.CircleGeometry(6.5, 96).rotateX(-Math.PI / 2), M.glass, { y: 0.05 });
    for (const r of [2.6, 4.4, 6.3]) K.add(new THREE.RingGeometry(r - 0.05, r + 0.05, 96).rotateX(-Math.PI / 2), M.cyan, { y: 0.07 });
    K.add(new THREE.LatheGeometry([V(6.5, 0.0), V(6.55, 0.12), V(6.7, 0.14), V(8.85, 0.14), V(9.0, 0.1), V(9.05, 0)], 128), M.planks);   // the wooden ring round the disc
    K.add(new THREE.TorusGeometry(9.02, 0.07, 6, 128).rotateX(Math.PI / 2), M.metal, { y: 0.12 });
    K.add(new THREE.TorusGeometry(6.55, 0.06, 6, 128).rotateX(Math.PI / 2), M.cyan, { y: 0.13 });
    K.into(g, { cast: false });
    const beamMat = beamMaterial(), coreMat = beamMaterial(); coreMat.uniforms.uAlpha.value = 0.45; coreMat.uniforms.uColor.value.set(0xffffff);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 170, 64, 1, true), beamMat); beam.position.y = 85;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 170, 32, 1, true), coreMat); core.position.y = 85;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 48).rotateX(-Math.PI / 2), M.glowDisc); pool.position.y = 0.09;
    g.add(beam, core, pool);
    // the light's body: a soft column of glow around the beam, worked out through its whole depth
    const volGeo = new THREE.CylinderGeometry(10, 10, 180, 48, 1, false), volOut = new THREE.Mesh(volGeo, volBeamMat(THREE.FrontSide)), volIn = new THREE.Mesh(volGeo, volBeamMat(THREE.BackSide));
    for (const m of [volOut, volIn]) { m.position.y = 89; m.renderOrder = 3; m.frustumCulled = false; m.raycast = () => {}; g.add(m); }
    volIn.visible = false;
    const chevGeo = chevronGeo(), chevrons = [];
    for (let i = 0; i < 7; i++) { const c = new THREE.Group(); for (const ry of [0, Math.PI / 2]) { const m = new THREE.Mesh(chevGeo, M.cyan); m.rotation.y = ry; c.add(m); } c.scale.setScalar(0.85); g.add(c); chevrons.push(c); }
    const rings = []; for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.05, 6, 64).rotateX(Math.PI / 2), M.cyanSoft); g.add(m); rings.push(m); }
    const N = 260, pos = new Float32Array(N * 3), r = seeded(3);
    for (let i = 0; i < N; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 2.6; pos.set([Math.cos(a) * d, r() * 40, Math.sin(a) * d], i * 3); }
    const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xe8fbff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    g.add(motes);
    // an arrival: rings of light race up the column in that person's colour
    const pulses = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.16, 8, 80).rotateX(Math.PI / 2), additive2(0xffffff)); m.visible = false; m.raycast = () => {}; g.add(m); pulses.push(m); }
    let base = 1, flare = 0, shockT = 9, fNow = 0;
    BEAM.set = (v) => { base = v; };
    BEAM.onFlare = (v) => { flare = Math.max(flare, v); shockT = 0; };
    const light = new THREE.PointLight(0xdff8ff, 0, 90, 1.2); light.position.y = 5; g.add(light);
    const shock = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96).rotateX(-Math.PI / 2), additive2(0xe6fbff)); shock.position.y = 0.2; shock.visible = false; g.add(shock);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glowDisc, color: 0xe8fcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 })); halo.position.y = 6; g.add(halo);
    const flareFx = makeFlare(M); g.add(flareFx.group);
    const beamCol = new THREE.Color(0xdff8ff), smooth = THREE.MathUtils.smoothstep;
    BEACON_CAM.update = (cam) => {
      cam.updateMatrixWorld();
      const p = cam.position, rr = Math.hypot(p.x, p.z), inside = rr < 10.2 && p.y > -1 && p.y < 179;
      volOut.visible = !inside; volIn.visible = inside;
      // the beam's foot is in sight from under the canopy, and from low down out past its edge
      const seen = rr < 64 ? p.y < lerp(36, 9, THREE.MathUtils.clamp((rr - 14) / 46, 0, 1)) : p.y < 9.5 && rr < 150;
      flareFx.update(cam, seen ? (0.3 + 0.25 * Math.max(0, base - 1) + 0.9 * fNow) * smooth(rr, 2.5, 7) : 0);
    };
    return { update(t, dt) {
      beamMat.uniforms.uTime.value = t; coreMat.uniforms.uTime.value = t;
      flare = Math.max(0, flare - dt * 0.4); shockT += dt;
      const f = flare * flare * (3 - 2 * flare), b = base + 7 * f;
      FX.flare = f; FX.wave = shockT; fNow = f;          // the flare: the whole column blazes, then settles
      beamMat.uniforms.uBoost.value = b; coreMat.uniforms.uBoost.value = b * 1.2;
      beamMat.uniforms.uColor.value.copy(beamCol).lerp(FX.tint, 0.55 * f);
      const vb = 0.55 + 0.45 * base + 1.3 * f;
      for (const m of [volOut, volIn]) { const u = m.material.uniforms; u.uTime.value = t; u.uBoost.value = m === volIn ? vb * 0.6 : vb; }   // from inside: a gentler haze
      light.intensity = 160 * f; light.color.copy(FX.tint).lerp(_white, 0.45); halo.material.color.copy(light.color); halo.material.opacity = Math.min(0.5, f * 0.6); halo.scale.setScalar(8 + 12 * f);
      pool.scale.setScalar(1 + 1.6 * f); pool.material.opacity = 0.45 + 0.55 * f;
      shock.visible = shockT < 1.6; if (shock.visible) { shock.scale.setScalar(3 + shockT * 30); shock.material.opacity = 0.9 * (1 - shockT / 1.6); shock.material.color.copy(FX.tint).lerp(_white, 0.4); }
      pulses.forEach((m, i) => {
        const y = (shockT - i * 0.12) * 56;
        m.visible = y > 0.2 && y < 130;
        if (!m.visible) return;
        m.position.y = y; m.scale.setScalar(1 + y / 90); m.material.opacity = 0.95 * (1 - y / 130); m.material.color.copy(FX.tint).lerp(_white, 0.25);
      });
      chevrons.forEach((c, i) => { const k = ((t * 0.35 + i / 7) % 1); c.position.y = 9.5 - k * 7.5; c.rotation.y = t * 0.4; const f = Math.sin(Math.PI * k); c.scale.setScalar(0.85 * (0.4 + 0.6 * f)); });
      rings.forEach((m, i) => { const k = (t * 0.25 + i / 3) % 1; m.position.y = 0.3 + k * 14; m.material.opacity = 0.55 * (1 - k); });
      const p = motes.geometry.attributes.position; for (let i = 0; i < N; i++) { let y = p.getY(i) + dt * (1.2 + (i % 5) * 0.3); if (y > 40) y = 0; p.setY(i, y); } p.needsUpdate = true;
    } };
  }, { act: "beacon", colliders: () => [], label: "The beacon" }),
  mhGlow: P("Floor lights", (g) => {
    const M = mats();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(L.plazaR, 180).rotateX(-Math.PI / 2), floorGlowMat(0)); disc.position.y = 0.035;
    const B = L.blvd, blvd = new THREE.Mesh(flatPlane(B.x * 2, B.z1 - B.z0), floorGlowMat(1)); blvd.position.set(0, 0.06, (B.z0 + B.z1) / 2);
    const nz0 = L.north.z0, nz1 = L.canyon.z1, north = new THREE.Mesh(flatPlane(L.north.x * 2, nz1 - nz0), floorGlowMat(2)); north.position.set(0, 0.06, (nz0 + nz1) / 2);
    for (const m of [disc, blvd, north]) { m.renderOrder = 2; m.frustumCulled = false; g.add(m); }
    // motes of light hanging in the air over the plaza and down the boulevard, drifting up
    const N = 1100, pos = new Float32Array(N * 3), spd = new Float32Array(N), r = seeded(404);
    for (let i = 0; i < N; i++) {
      if (i < 780) { const a = r() * TAU, d = 10 + Math.sqrt(r()) * 72; pos.set([Math.cos(a) * d, 0.3 + r() * 9, Math.sin(a) * d], i * 3); }
      else pos.set([(r() - 0.5) * 46, 0.3 + r() * 9, lerp(B.z0 + 6, -60, r())], i * 3);
      spd[i] = 0.12 + r() * 0.3;
    }
    const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ map: M.tex.glowDisc, color: 0xd9f6ff, size: 0.32, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    motes.frustumCulled = false; g.add(motes);
    const base = { cyan: M.cyan.color.clone(), led: M.led.color.clone() };
    return { update(t, dt) {
      const U = GLOW_U, f = FX.flare, w = FX.wave;
      U.uTime.value = t; U.uFlare.value = f; U.uWave.value = w < 5 ? 6 + w * 62 : 999; U.uWaveA.value = w < 5 ? Math.pow(1 - w / 5, 1.4) : 0;
      M.line.emissiveIntensity = 0.35 + 3.2 * f + 1.4 * U.uWaveA.value;              // the white inlays themselves flare
      M.cyan.color.copy(base.cyan).multiplyScalar(1 + 1.8 * f); M.led.color.copy(base.led).multiplyScalar(1 + 0.9 * f);
      M.orb.emissiveIntensity = 2.2 + 4 * f;
      motes.material.opacity = 0.42 + 0.5 * f + 0.08 * Math.sin(t * 0.7);
      const p = motes.geometry.attributes.position;
      for (let i = 0; i < N; i++) { let y = p.getY(i) + dt * spd[i] * (1 + f * 4); if (y > 9.5) y = 0.3; p.setY(i, y); }
      p.needsUpdate = true;
    } };
  }, { stay: true, colliders: () => [], info: "Light runs through the floor's white lines. Every time someone arrives, a wave of it rolls out from the beacon." }),
  mhBoard: P("Hall of Fame", (g) => {
    const M = mats(), K = new Kit(), R = 30, W = 18, H = 10.125, y0 = 7.4, th = W / R, half = th / 2;
    const at = (a, r = R) => [Math.sin(a) * r, R - Math.cos(a) * r];            // a point on the screen's curve (it bows towards you)
    const arc = (y, r = R, a = half, n = 48) => { const out = []; for (let i = 0; i <= n; i++) { const [x, z] = at(-a + (2 * a * i) / n, r); out.push(V(x, y, z)); } return out; };
    // the bezel: white rails top and bottom, light strips just outside, side posts
    for (const y of [y0 - 0.3, y0 + H + 0.3]) K.add(tube(arc(y, R + 0.05, half + 0.012), 0.32, 96, 10), M.white);
    for (const y of [y0 + H + 0.78]) K.add(tube(arc(y, R - 0.1, half - 0.01), 0.07, 96, 6), M.cyan);
    for (const s of [1, -1]) {
      const [x, z] = at(s * (half + 0.012), R + 0.05);
      K.box(0.62, y0 + H + 0.55 - 5.0, 0.7, M.white, { x, y: (5.0 + y0 + H + 0.55) / 2, z, ry: s * half });
      // the pylon: a tall tapering white blade, a light seam up its face, a beacon on top
      const px = s * (Math.abs(x) + 2.2), pz = z;
      K.box(4.2, 0.7, 4.2, M.plate, { x: px, y: 0.35, z: pz, uv: 2 });
      K.box(4.4, 0.08, 4.4, M.metal, { x: px, y: 0.72, z: pz });
      K.add(new THREE.CylinderGeometry(0.9, 1.65, 31, 4, 1).rotateY(Math.PI / 4), M.white, { x: px, y: 0.7 + 15.5, z: pz });
      for (const f of [1, -1]) K.box(0.14, 28, 0.14, M.cyan, { x: px, y: 15.5, z: pz + f * 0.96, rx: f * -0.0171 });
      K.box(0.14, 28, 0.14, M.cyan, { x: px - s * 0.96, y: 15.5, z: pz, rz: s * -0.0171 });
      K.add(new THREE.OctahedronGeometry(0.9, 0), M.cyan, { x: px, y: 33.2, z: pz, sy: 1.6 });
      K.cyl(1.1, 0.9, 0.5, M.metal, { x: px, y: 31.45, z: pz }, 4);
      for (const y of [y0 + 1.5, y0 + H / 2, y0 + H - 1.5]) K.box(Math.abs(px - x) - 0.3, 0.32, 0.4, M.metal, { x: (px + x) / 2, y, z: pz });   // brackets to the screen
    }
    // the crest bar over the screen, and the ticker's frame beneath it
    const [ex, ez] = at(half + 0.012, R + 0.05);
    K.box(2 * (Math.abs(ex) + 2.2), 1.1, 1.0, M.white, { y: y0 + H + 2.2, z: ez });
    K.box(2 * (Math.abs(ex) + 2.2) - 0.4, 0.08, 0.08, M.cyan, { y: y0 + H + 1.6, z: ez + 0.52 });
    K.box(2 * (Math.abs(ex) + 2.2) - 0.4, 0.08, 0.08, M.cyan, { y: y0 + H + 1.6, z: ez - 0.52 });
    for (const y of [5.3, 6.8]) K.add(tube(arc(y, R + 0.04, half - 0.03), 0.12, 96, 6), M.metal);
    K.into(g);
    // the screen and the ticker
    const bc = document.createElement("canvas"); bc.width = BW; bc.height = BH;
    const bg = bc.getContext("2d"), btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 8;
    const smat = screenMat(btex), screen = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 72, 1, true, Math.PI - half, th), smat);
    screen.position.set(0, y0 + H / 2, R); g.add(screen);
    const tc = document.createElement("canvas"); tc.width = 2048; tc.height = 160;
    const tg = tc.getContext("2d"), ttex = new THREE.CanvasTexture(tc); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = 8;
    const tW = th - 0.06, tmat = screenMat(ttex, { scan: 0.6, sheen: 0 }), ticker = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.4, 72, 1, true, Math.PI - tW / 2, tW), tmat);
    ticker.position.set(0, 6.05, R); g.add(ticker);
    const crestTex = canvasTex(1024, 192, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0d1b36"); gr.addColorStop(1, "#060c1a"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#ffd76a"; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
      c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffd76a"; c.shadowColor = "#ffb800"; c.shadowBlur = 18;
      c.font = "900 76px Nunito, sans-serif"; c.fillText("TOP LUMEN", w / 2, h / 2 - 22);
      c.shadowBlur = 0; c.font = "800 34px Nunito, sans-serif"; c.fillStyle = "#cfe9ff"; c.fillText("ALL SERVERS  ·  LIVE RANKING", w / 2, h / 2 + 46);
    });
    for (const [z, ry] of [[ez + 0.52, 0], [ez - 0.52, Math.PI]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.69), new THREE.MeshBasicMaterial({ map: crestTex, toneMapped: false })); m.position.set(0, y0 + H + 2.2, z); m.rotation.y = ry; g.add(m); }
    // beams from the pylons' tops, seen from anywhere in the hub
    const beams = [];
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 150, 16, 1, true), skyBeamMat(0x9ff3ff, 0.55)); m.position.set(s * (Math.abs(ex) + 2.2), 34 + 75, ez); g.add(m); beams.push(m); }
    const halos = [1, -1].map((s) => { const h = new THREE.Sprite(M.halo); h.position.set(s * (Math.abs(ex) + 2.2), 33.2, ez); h.scale.setScalar(5); g.add(h); return h; });
    // the ticker: random lines about Socizligin, sliding by
    const T = { pos: 0, next: 0, deck: [], items: [], acc: 0 };
    const tickerDraw = (dt) => {
      T.pos += dt * 230; tg.font = "900 88px Nunito, sans-serif";
      while (T.next < T.pos + tc.width + 50) {
        if (!T.deck.length) T.deck = [...SOCIZ_LINES].sort(() => Math.random() - 0.5);
        const text = T.deck.pop(), w = tg.measureText(text).width; T.items.push({ text, x: T.next, w }); T.next += w + 150;
      }
      T.items = T.items.filter((it) => it.x + it.w + 150 > T.pos);
      const gr = tg.createLinearGradient(0, 0, 0, tc.height); gr.addColorStop(0, "#120d06"); gr.addColorStop(1, "#060402"); tg.fillStyle = gr; tg.fillRect(0, 0, tc.width, tc.height);
      tg.textBaseline = "middle"; tg.textAlign = "left";
      for (const it of T.items) {
        const x = it.x - T.pos;
        tg.fillStyle = "#ffd25a"; tg.shadowColor = "#ff9d1c"; tg.shadowBlur = 14; tg.fillText(it.text, x, tc.height / 2 + 3);
        tg.shadowBlur = 0; tg.fillStyle = "#7fe9ff"; tg.font = "900 64px Nunito, sans-serif"; tg.fillText("✦", x + it.w + 52, tc.height / 2 + 2); tg.font = "900 88px Nunito, sans-serif";
      }
      tg.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < tc.height; y += 4) tg.fillRect(0, y, tc.width, 1);
      ttex.needsUpdate = true;
    };
    // the board itself: pages turn every 12 s; rows slide in, numbers count up when the ranking moves
    let page = 0, pageT = 0, slide = 0, count = 1, ver = -1, acc = 1;
    let from = new Map(); const shown = new Map();
    const val = (row) => { const v = lerp(from.get(row.name) ?? row.vcash * 0.9, row.vcash, ease(count)); shown.set(row.name, v); return v; };
    return { update(t, dt) {
      smat.uniforms.uTime.value = t; tmat.uniforms.uTime.value = t;
      for (const b of beams) b.material.uniforms.uTime.value = t;
      for (const h of halos) h.scale.setScalar(4.5 + Math.sin(t * 2) * 0.5 + FX.flare * 6);
      smat.uniforms.uBright.value = 1 + FX.flare * 0.35;
      pageT += dt; if (pageT > 12) { pageT = 0; page ^= 1; slide = 0; }
      if (boardVersion() !== ver) { ver = boardVersion(); from = new Map(shown); count = 0; }
      slide += dt / 1.5; count = Math.min(1.2, count + dt / 1.3);
      T.acc += dt; if (T.acc > 1 / 30) { tickerDraw(T.acc); T.acc = 0; }
      acc += dt;
      if (acc > (slide < 1.3 || count < 1.05 ? 1 / 24 : 0.2)) { acc = 0; drawBoard(bg, page, slide, t, val); btex.needsUpdate = true; }
    } };
  }, { act: "board", stay: true, colliders: () => [[-13.2, -0.8, -9, 3.4], [9, -0.8, 13.2, 3.4]],
    info: "The Hall of Fame: the players with the most Lumen on every server." }),
  mhHolo: P("Holo ring", (g) => {
    const M = mats(), Rr = 10.6, Y = 53.2, N = 10;
    const cc = document.createElement("canvas"); cc.width = CARD_W * 5; cc.height = CARD_H * 2;
    const cg = cc.getContext("2d"), ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace; ctex.anisotropy = 8;
    drawCards(cg); ctex.needsUpdate = true;
    const mat = cardMat(ctex), parts = [], o = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, sc = i < 3 ? 1.18 : 1, geo = new THREE.PlaneGeometry(4.6 * sc, 6.47 * sc);
      o.position.set(Math.cos(a) * Rr, Y + (i < 3 ? 0.4 : 0), Math.sin(a) * Rr);
      o.lookAt(Math.cos(a) * (Rr + 10), Y - 3, Math.sin(a) * (Rr + 10)); o.updateMatrix();
      geo.applyMatrix4(o.matrix); geo.setAttribute("aCard", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(i), 1));
      parts.push(geo);
    }
    const ring = new THREE.Group(), cards = new THREE.Mesh(mergeGeometries(parts), mat); cards.frustumCulled = false; ring.add(cards); g.add(ring);
    // the projector they hang over: a ring of light with a field rising from it
    const K = new Kit();
    K.add(new THREE.TorusGeometry(Rr, 0.22, 10, 120).rotateX(Math.PI / 2), M.white, { y: Y - 5.6 });
    K.add(new THREE.TorusGeometry(Rr, 0.07, 6, 120).rotateX(Math.PI / 2), M.cyan, { y: Y - 5.3 });
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; K.box(0.16, 0.1, 0.4, M.led, { x: Math.cos(a) * Rr, y: Y - 5.38, z: Math.sin(a) * Rr, ry: -a }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; K.add(tube([V(Math.cos(a) * Rr, Y - 5.6, Math.sin(a) * Rr), V(Math.cos(a) * (L.ringR - 0.5), L.ringY + 0.4, Math.sin(a) * (L.ringR - 0.5))], 0.08, 2, 5), M.metal); }
    K.into(g, { cast: false });
    const fmat = fieldMat(0x7fe9ff), field = new THREE.Mesh(new THREE.CylinderGeometry(Rr, Rr, 11, 120, 1, true), fmat); field.position.y = Y - 5.3 + 5.5; g.add(field);
    // a band of words circling just above, the other way round
    const bmat = screenMat(bannerText("SOCIZLIGIN  ·  TOP LUMEN  ·  ALL SERVERS"), { scan: 0.5, sheen: 0, add: true, rep: [3, 1] });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 10.8, 1.2, 128, 1, true), bmat); band.position.y = Y + 5.9; g.add(band);
    let ver = boardVersion(), wait = 0;
    return { update(t, dt) {
      ring.rotation.y = t * 0.06; band.rotation.y = -t * 0.035;
      cards.position.y = Math.sin(t * 0.8) * 0.25;
      mat.uniforms.uTime.value = t; mat.uniforms.uBoost.value = 1 + FX.flare * 0.8; fmat.uniforms.uTime.value = t; fmat.uniforms.uBoost.value = 1 + FX.flare * 2; bmat.uniforms.uTime.value = t;
      wait -= dt; if (boardVersion() !== ver && wait <= 0) { ver = boardVersion(); wait = 2; drawCards(cg); ctex.needsUpdate = true; }
    } };
  }, { act: "board", stay: true, colliders: () => [], info: "The top ten, spinning in light over the beacon." }),
  mhBridge: P("Skybridge", (g) => {
    const M = mats(), K = new Kit(), B = L.bridge, R = L.ramp, zc = (B.z0 + B.z1) / 2, w = B.z1 - B.z0;
    K.add(flatPlane(B.x * 2, w), M.planks, { y: B.y, z: zc, uv: 4, uvRot: true });
    K.box(B.x * 2, 0.9, w, M.darkTimber, { y: B.y - 0.47, z: zc });
    for (const s of [1, -1]) {
      K.box(B.x * 2, 0.35, 0.4, M.white, { y: B.y - 0.2, z: zc + s * (w / 2 + 0.15) });              // fascia
      K.box(B.x * 2 - 12, 0.08, 0.08, M.metal, { y: B.y + 1.05, z: zc + s * (w / 2 - 0.1) });
      K.add(new THREE.PlaneGeometry(B.x * 2 - 12, 0.9), M.railGlass, { y: B.y + 0.55, z: zc + s * (w / 2 - 0.1) });
      for (let x = -B.x + 6; x <= B.x - 6; x += 2.5) K.box(0.07, 1.1, 0.07, M.metal, { x, y: B.y + 0.55, z: zc + s * (w / 2 - 0.1) });
      for (const px of [27, 40]) for (const pz of [-1, 1]) { const z = zc + pz * (w / 2 - 2.2); K.cyl(0.55, 0.7, B.y - 0.9, M.white, { x: s * px, y: (B.y - 0.9) / 2, z }, 24); K.cyl(0.85, 0.85, 0.25, M.darkMetal, { x: s * px, y: 0.12, z }, 24); K.box(0.3, 5.2, 0.3, M.metal, { x: s * px, y: B.y - 3.2, z: z - pz * 1.6, rx: pz * 0.5 }); }
      // the ramp down to the wing: a sloped deck on legs
      const rl = R.foot - R.top, slope = Math.atan2(B.y, rl), rx = s * (R.x0 + R.x1) / 2, rw = R.x1 - R.x0;
      const ramp = new THREE.PlaneGeometry(rw, Math.hypot(rl, B.y)).rotateX(-Math.PI / 2);
      K.add(ramp, M.planks, { x: rx, y: B.y / 2 + 0.02, z: (R.top + R.foot) / 2, rx: slope, uv: 4, uvRot: false });   // same tilt as its timber bed, so the boards never cut through it
      K.add(new THREE.BoxGeometry(rw, 0.6, Math.hypot(rl, B.y)), M.darkTimber, { x: rx, y: B.y / 2 - 0.35, z: (R.top + R.foot) / 2, rx: slope });
      for (let k = 1; k < 5; k++) { const z = lerp(R.top, R.foot, k / 5), y = B.y * (R.foot - z) / rl; K.box(0.5, y - 0.6, 0.5, M.white, { x: rx, y: (y - 0.6) / 2, z }); }
      for (const ex of [R.x0 + 0.15, R.x1 - 0.15]) railSeg(K, M, [s * ex, B.y, R.top], [s * ex, 0, R.foot]);   // glass railings down both sides of the ramp
      // the bridge's own ends: railed all round except where the ramp leaves it
      railSeg(K, M, [s * (B.x - 0.15), B.y, B.z0 + 0.15], [s * (B.x - 0.15), B.y, B.z1 - 0.15]);
      railSeg(K, M, [s * (B.x - 6), B.y, B.z0 + 0.15], [s * (B.x - 0.15), B.y, B.z0 + 0.15]);
    }
    K.into(g);
  }, { flat: true, walk: true, colliders: () => {
    const out = []; for (const s of [1, -1]) { const zc = (L.bridge.z0 + L.bridge.z1) / 2, hw = (L.bridge.z1 - L.bridge.z0) / 2 - 2.2; for (const px of [27, 40]) for (const pz of [-1, 1]) out.push([s * px - 0.75, zc + pz * hw - 0.75, s * px + 0.75, zc + pz * hw + 0.75]); for (let k = 1; k < 5; k++) { const z = lerp(L.ramp.top, L.ramp.foot, k / 5); if (L.bridge.y * (L.ramp.foot - z) / (L.ramp.foot - L.ramp.top) > 1.6) out.push([s * 47 - 0.3, z - 0.3, s * 47 + 0.3, z + 0.3]); } }
    return out; } }),
  mhPortal: P("Portal", (g, s) => {
    const M = mats(), K = new Kit(), y = 3.05, col = PORTAL_COLOR[s.to] || "#7fe9ff", C = new THREE.Color(col);
    const name = (s.name || PORTAL_LIST.find(([k]) => k === s.to)?.[1] || "Portal").toUpperCase();
    const glowMat = additive2(C.clone().multiplyScalar(1.6)), softMat = additive2(C.clone().multiplyScalar(0.7));
    // the cradle it stands in, and the ring: white, with light just inside and outside
    K.box(2.6, 0.32, 1.3, M.darkMetal, { y: 0.16 }); K.box(2.7, 0.06, 1.4, M.white, { y: 0.35 });
    for (const sx of [1, -1]) { K.box(0.3, 1.25, 1.0, M.white, { x: sx * 1.42, y: 0.92, rz: sx * 0.42 }); K.box(0.06, 1.0, 1.04, glowMat, { x: sx * 1.52, y: 0.95, rz: sx * 0.42 }); }
    K.add(new THREE.TorusGeometry(2.56, 0.21, 16, 128), M.white, { y });
    K.add(new THREE.TorusGeometry(2.56, 0.215, 4, 128, TAU), M.metal, { y, s: 1, sz: 0.25 });
    K.add(new THREE.TorusGeometry(2.33, 0.05, 8, 128), glowMat, { y });
    K.add(new THREE.TorusGeometry(2.8, 0.03, 6, 128), glowMat, { y });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; K.box(0.08, 0.3, 0.46, M.led, { x: Math.cos(a) * 2.56, y: y + Math.sin(a) * 2.56, rz: a }); }
    K.into(g);
    // the sign floats over the ring on a thread of light, turning slowly so it reads from every side (no post to clip into things)
    const signG = new THREE.Group(); signG.position.y = SIGN_Y; g.add(signG);
    const SK = new Kit();
    SK.box(5.1, 1.2, 0.16, M.darkMetal);
    for (const sy of [1, -1]) SK.add(new THREE.CylinderGeometry(0.045, 0.045, 5.1, 10).rotateZ(Math.PI / 2), glowMat, { y: sy * 0.62 });
    for (const sx of [1, -1]) { SK.cyl(0.09, 0.09, 1.34, M.white, { x: sx * 2.6 }, 16); SK.add(new THREE.SphereGeometry(0.13, 16, 12), M.white, { x: sx * 2.6, y: 0.7 }); SK.add(new THREE.SphereGeometry(0.13, 16, 12), M.white, { x: sx * 2.6, y: -0.7 }); }
    SK.add(new THREE.ConeGeometry(0.16, 0.34, 4).rotateX(Math.PI), glowMat, { y: -0.92 });
    SK.into(signG, { cast: false });
    const signTex = streetSign(s.name || PORTAL_LIST.find(([k]) => k === s.to)?.[1] || "Portal", col);
    for (const ry of [0, Math.PI]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.04), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45, metalness: 0.1, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35 }));
      m.position.z = ry ? -0.085 : 0.085; m.rotation.y = ry; signG.add(m);
    }
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SIGN_Y - 1.1 - (y + 2.8), 8, 1, true), softMat);
    thread.position.y = (SIGN_Y - 1.1 + y + 2.8) / 2; thread.raycast = () => {}; g.add(thread);
    const signHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glowDisc, color: C, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    signHalo.scale.set(7, 2.6, 1); signHalo.raycast = () => {}; signG.add(signHalo);
    // the gateway: a turning surface of light, with sparks spiralling into it
    const vmat = vortexMat(col), disc = new THREE.Mesh(new THREE.CircleGeometry(2.34, 96), vmat); disc.position.y = y; g.add(disc);
    const N = 120, pos = new Float32Array(N * 3), seed = seeded(Math.abs(((s.x || 0) * 13 + (s.z || 0) * 7) | 0) || 5), pa = [], ps = [], pz = [];
    for (let i = 0; i < N; i++) { pa.push(seed() * TAU); ps.push(0.18 + seed() * 0.3); pz.push((seed() - 0.5) * 2); }
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ map: M.tex.glowDisc, color: C.clone().lerp(new THREE.Color(0xffffff), 0.35), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    sparks.frustumCulled = false; g.add(sparks);
    // turning arcs around it
    const arcs = new THREE.Group(); arcs.position.y = y; g.add(arcs);
    const AK = new Kit();
    for (let i = 0; i < 3; i++) { const a0 = (i / 3) * TAU; AK.add(new THREE.TorusGeometry(3.72, 0.07, 6, 48, 1.15), M.white, { rz: a0 }); AK.add(new THREE.TorusGeometry(3.86, 0.035, 6, 32, 0.7), glowMat, { rz: a0 + 0.25 }); }
    AK.into(arcs, { cast: false });
    const arcs2 = new THREE.Group(); arcs2.position.y = y; g.add(arcs2);
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(4.08, 0.025, 4, 48, 2.2), softMat); m.rotation.z = i * Math.PI; arcs2.add(m); }
    // the name, turning round the rim, readable from both sides
    const label = ringText(name), rims = [];
    for (const ry of [0, Math.PI]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(2.86, 3.5, 128), new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false, toneMapped: false, color: C.clone().lerp(new THREE.Color(0xffffff), 0.6) }));
      const pivot = new THREE.Group(); pivot.position.set(0, y, ry ? -0.03 : 0.03); pivot.rotation.y = ry; pivot.add(m); g.add(pivot); rims.push(m);
    }
    // light pooled on the floor in front and behind
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: M.tex.glowDisc, color: C, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    pool.position.y = 0.07; pool.scale.set(1, 1, 0.7); g.add(pool);
    const ringF = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.66, 96).rotateX(-Math.PI / 2), glowMat); ringF.position.y = 0.075; ringF.scale.set(1, 1, 0.55); g.add(ringF);
    const ph = (s.x || 0) * 0.37 + (s.z || 0) * 0.11;
    // walking in: the surface ripples round where you touch it; step right up to it and it takes you, in a flash of its light
    const flashSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glowDisc, color: C.clone().lerp(_white, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    flashSpr.position.y = y; flashSpr.visible = false; flashSpr.raycast = () => {}; g.add(flashSpr);
    const lp = V(), U = vmat.uniforms;
    let armed = 0, fired = 0, rip = 0, burst = 0;
    const travel = (room) => {
      fired = performance.now() + 3000; armed = 0; burst = 1;
      portalFlash(col);
      window.dispatchEvent(new CustomEvent("hubsfx", { detail: "portal_enter" }));
      setTimeout(() => room.onHubAct?.("portal", { spec: s, def: MAIN_CATALOG.mhPortal, group: g, through: true }), 120);
    };
    /** clicked: walk on in (social.js asks this first; false = no one to walk, so it just goes) */
    g.userData.walkThrough = () => {
      const room = HUB_ROOM, c = room?.char;
      if (!c || !room.walkTo || !g.parent) return false;
      g.worldToLocal(lp.copy(c.root.position));
      lp.set(0, 0, (lp.z >= 0 ? 1 : -1) * 0.85); g.localToWorld(lp);
      armed = performance.now() + 6000;
      room.walkTo(lp.x, lp.z);
      room._afterWalk = () => { if (armed > performance.now() && fired < performance.now()) travel(room); };
      return true;
    };
    return { update(t, dt = 1 / 60) {
      const f = FX.flare, room = HUB_ROOM, c = room?.char, now = performance.now();
      let near = 0;
      if (c && g.parent) {
        g.worldToLocal(lp.copy(c.root.position));
        if (Math.abs(lp.z) < 3.6 && Math.abs(lp.x) < 2.8 && Math.abs(lp.y) < 2.5) {
          near = 1 - Math.abs(lp.z) / 3.6;
          U.uRipC.value.set(lp.x / 2.34, (lp.y + 1.1 - y) / 2.34);
          const meant = armed > now || (room._userActive || 0) > now - 15000 || room._keys?.size;   // you walked it in, not an idle wander
          if (Math.abs(lp.z) < 1.25 && Math.abs(lp.x) < 1.7 && meant && fired < now) travel(room);
        }
      }
      rip += (near - rip) * Math.min(1, dt * 5);
      burst = Math.max(0, burst - dt * 1.1);
      U.uRip.value = rip * 1.4 + burst * 1.2; U.uFlash.value = burst * burst;
      flashSpr.visible = burst > 0.01;
      if (flashSpr.visible) { flashSpr.material.opacity = Math.min(1, burst * 1.3); flashSpr.scale.setScalar(4 + 14 * (1 - burst)); }
      vmat.uniforms.uTime.value = t + ph; vmat.uniforms.uBoost.value = 1 + f * 1.2 + near * 0.35 + burst * 1.5;
      for (const [i, m] of rims.entries()) m.rotation.z = (i ? -1 : 1) * t * 0.12;
      signG.rotation.y = t * 0.55 + ph; signG.position.y = SIGN_Y + Math.sin(t * 1.3 + ph) * 0.18;
      arcs.rotation.z = t * 0.35 + ph; arcs2.rotation.z = -t * 0.22 + ph;
      disc.scale.setScalar(1 + Math.sin(t * 2 + ph) * 0.01);
      pool.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.6 + ph) + 0.5 * f;
      const p = sparks.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        const k = (t * ps[i] + pa[i] / TAU) % 1, r = 0.15 + 3.4 * Math.pow(1 - k, 1.3), a = pa[i] + k * 5.5 + t * 0.4;
        p.setXYZ(i, Math.cos(a) * r, y + Math.sin(a) * r, pz[i] * (1 - k) * 0.9);
      }
      p.needsUpdate = true;
    } };
  }, { act: "portal", colliders: () => [[-1.6, -0.7, 1.6, 0.7], [4.3, -0.35, 4.9, 0.35]],
    edit: [{ key: "to", label: "Goes to", options: PORTAL_LIST }, { key: "name", label: "Label", max: 24 }] }),
  mhOrb: P("Glowing orb", (g, s) => {
    const M = mats(), K = new Kit();
    K.add(new THREE.LatheGeometry([V(0.0, 0), V(0.45, 0), V(0.42, 0.08), V(0.2, 0.25), V(0.16, 0.85), V(0.32, 0.98), V(0.0, 1.0)], 24), M.white);
    K.into(g);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), M.orb), shell = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 16), M.orbShell);
    const halo = new THREE.Sprite(M.halo); halo.scale.setScalar(2.6);
    orb.position.y = shell.position.y = halo.position.y = 1.6; g.add(orb, shell, halo);
    return { update(t) { const b = Math.sin(t * 1.4 + (s.x || 0) * 0.3) * 0.08; orb.position.y = shell.position.y = halo.position.y = 1.6 + b; shell.scale.setScalar(1 + Math.sin(t * 2.2 + (s.z || 0)) * 0.06); halo.scale.setScalar(2.4 + Math.sin(t * 2.2 + (s.z || 0)) * 0.25 + FX.flare * 3); } };
  }, { act: "orb", colliders: () => [[-0.45, -0.45, 0.45, 0.45]] }),
  mhSail: P("Canvas sail", (g, s) => {
    const M = mats(), K = new Kit(), H = s.h || 13;
    K.cyl(0.11, 0.16, H, M.timber, { y: H / 2 }, 10); K.add(new THREE.SphereGeometry(0.2, 10, 8), M.metal, { y: H + 0.1 });
    K.cyl(0.05, 0.05, 3.6, M.timber, { x: 1.7, y: H - 0.5, rz: Math.PI / 2 }, 6);
    K.cyl(0.35, 0.45, 0.4, M.darkMetal, { y: 0.2 }, 12);
    K.add(tube([V(0, H, 0), V(3.4, H - 9, 0.6)], 0.025, 2, 4), M.rope);
    const top = V(0, H - 0.35, 0);                                      // rigging: two shrouds down each side to cleats, ratlines across them
    for (const sz of [1, -1]) {
      const f1 = V(-0.3, 0.06, sz * 1.55), f2 = V(-1.15, 0.06, sz * 1.3);
      K.add(tube([top, f1], 0.022, 2, 4), M.rope); K.add(tube([top, f2], 0.022, 2, 4), M.rope);
      for (const f of [f1, f2]) K.box(0.16, 0.1, 0.16, M.darkMetal, { x: f.x, y: 0.05, z: f.z });
      for (let k = 1; k <= 6; k++) { const q = 0.3 + k * 0.095; K.add(tube([top.clone().lerp(f1, q), top.clone().lerp(f2, q)], 0.012, 2, 3), M.rope); }
    }
    K.add(tube([V(0, H + 0.05, 0), V(3.45, H - 0.5, 0)], 0.016, 2, 3), M.rope);   // the lift holding up the yard's end
    K.add(new THREE.TorusGeometry(0.43, 0.035, 6, 28).rotateX(Math.PI / 2), M.cyan, { y: 0.41 });
    K.into(g);
    const sail = new THREE.Mesh(surface(10, 20, (u, v, p) => p.set(0.25 + u * 3.2, H - 0.6 - v * 8.5, Math.sin(Math.PI * u) * 0.55 * (0.4 + v * 0.6))), M.sail);
    sail.castShadow = true; g.add(sail);
    return { update(t) { sail.rotation.y = Math.sin(t * 0.7 + (s.z || 0) * 0.13) * 0.12; sail.scale.z = 1 + Math.sin(t * 1.3 + (s.x || 0)) * 0.25; } };
  }, { info: "Canvas sails on wooden masts, like a harbour in the sky.", colliders: () => [[-0.4, -0.4, 0.4, 0.4]] }),
  mhBlossom: P("Blossom tree", (g, s) => {
    const M = mats(), K = new Kit(), r = seeded((s.n || 1) * 7919), H = 5 + r() * 1.6;
    K.add(new THREE.CylinderGeometry(2.2, 2.25, 0.4, 40, 1, true), M.planks, { y: 0.2 });
    K.add(new THREE.TorusGeometry(2.2, 0.08, 6, 48).rotateX(Math.PI / 2), M.metal, { y: 0.4 });
    K.add(new THREE.CircleGeometry(2.15, 40).rotateX(-Math.PI / 2), M.soil, { y: 0.32 });
    for (let i = 0; i < 18; i++) { const a = r() * TAU, d = 0.6 + r() * 1.4; K.add(new THREE.ConeGeometry(0.12, 0.4, 4), M.grass, { x: Math.cos(a) * d, y: 0.5, z: Math.sin(a) * d }); }
    const lean = V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6), top = V(lean.x, H, lean.z);
    K.add(tube([V(0, 0.3, 0), V(lean.x * 0.3, H * 0.4, lean.z * 0.3), top], 0.3, 16, 10), M.bark);
    const heads = [top];
    for (let b = 0; b < 4; b++) { const a = (b / 4) * TAU + r(), end = V(top.x + Math.cos(a) * 2.4, H + 1 + r() * 1.2, top.z + Math.sin(a) * 2.4); K.add(tube([V(lean.x * 0.6, H * 0.7, lean.z * 0.6), top.clone().lerp(end, 0.5).add(V(0, 0.3, 0)), end], 0.13, 10, 6), M.bark); heads.push(end); }
    for (let i = 0; i < 64; i++) {                                    // the crown: many soft pink clumps in a wide dome
      const a = r() * TAU, d = Math.sqrt(r()) * 3.6, y = H + 0.6 + (1 - d / 3.6) * 2.4 + r() * 1.0;
      K.add(leaf(r, 0.75 + r() * 0.7), M.pinks[i % 4], { x: lean.x + Math.cos(a) * d, y, z: lean.z + Math.sin(a) * d, sy: 0.75 });
    }
    K.into(g);
    const N = 70, pos = new Float32Array(N * 3), spd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(r() - 0.5) * 8, r() * (H + 2), (r() - 0.5) * 8], i * 3); spd[i] = 0.3 + r() * 0.5; }
    const petals = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xf6b9cc, size: 0.12, transparent: true, opacity: 0.95, depthWrite: false }));
    g.add(petals);
    return { update(t, dt) {
      const p = petals.geometry.attributes.position;
      for (let i = 0; i < N; i++) { let y = p.getY(i) - dt * spd[i]; if (y < 0.05) y = H + 1.5; p.setXYZ(i, p.getX(i) + Math.sin(t + i) * dt * 0.3, y, p.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.2); }
      p.needsUpdate = true;
    } };
  }, { act: "blossom", colliders: () => [[-2.3, -2.3, 2.3, 2.3]] }),
  mhBench: P("Bench", (g, s) => {
    // a park bench: cast white end frames with armrests, rounded timber slats, a gently reclined back on dark brackets
    const M = mats(), K = new Kit();
    for (const x of [-1.3, 1.3]) {
      K.box(0.1, 0.4, 0.5, M.white, { x, y: 0.24 });
      K.box(0.16, 0.05, 0.62, M.darkMetal, { x, y: 0.025 });
      K.add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 14).rotateX(Math.PI / 2), M.white, { x, y: 0.7, z: 0.02 });
      K.cyl(0.035, 0.035, 0.26, M.white, { x, y: 0.56, z: 0.24 }, 10);
      K.box(0.07, 0.62, 0.07, M.darkMetal, { x: x * 0.92, y: 0.72, z: -0.29, rx: -0.2 });
    }
    K.box(2.5, 0.05, 0.08, M.darkMetal, { y: 0.41, z: 0.18 }); K.box(2.5, 0.05, 0.08, M.darkMetal, { y: 0.41, z: -0.18 });
    for (let i = 0; i < 6; i++) K.add(new THREE.CylinderGeometry(0.04, 0.04, 2.66, 12).rotateZ(Math.PI / 2), M.timber, { y: 0.47, z: -0.23 + i * 0.092, sy: 0.75 });
    for (let i = 0; i < 3; i++) K.add(new THREE.CylinderGeometry(0.038, 0.038, 2.66, 12).rotateZ(Math.PI / 2), M.timber, { y: 0.66 + i * 0.13, z: -0.3 - i * 0.027, sz: 0.55 });
    // on a slope the whole bench leans with the ground (tx: front-back, tz: end to end), it doesn't grow legs
    const body = new THREE.Group(); body.rotation.set(s?.tx || 0, 0, s?.tz || 0, "YXZ"); K.into(body); g.add(body);
  }, { seat: { clip: "sit", seat: 0.48, at: [0, 0.03] }, colliders: () => [[-1.4, -0.36, 1.4, 0.34]] }),
  mhKiosk: P("Snack kiosk", (g, s) => {
    const M = mats(), K = new Kit();
    K.cyl(1.6, 1.7, 1.1, M.white, { y: 0.55 }, 32); K.cyl(1.7, 1.7, 0.08, M.timber, { y: 1.14 }, 32);
    K.cyl(0.1, 0.1, 2.0, M.metal, { y: 2.1 }, 8);
    K.add(new THREE.ConeGeometry(2.3, 0.9, 12, 1, true), M.sail, { y: 3.3 });
    K.add(new THREE.SphereGeometry(0.3, 12, 8), M.led, { y: 2.5 });
    K.into(g);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: kioskSign(s.name || "Snacks") }));
    sign.position.set(0, 1.45, 1.62); g.add(sign);
  }, { act: "snack", colliders: () => [[-1.7, -1.7, 1.7, 1.7]] }),
  mhLamp: P("Lamp post", (g) => {
    const M = mats(), K = new Kit();
    K.cyl(0.07, 0.11, 5, M.white, { y: 2.5 }, 10); K.cyl(0.3, 0.35, 0.2, M.darkMetal, { y: 0.1 }, 12);
    K.add(new THREE.SphereGeometry(0.32, 16, 12), M.led, { y: 5.15 });
    K.add(new THREE.TorusGeometry(0.42, 0.04, 6, 24).rotateX(Math.PI / 2), M.metal, { y: 4.95 });
    K.into(g);
    const halo = new THREE.Sprite(M.haloWarm); halo.position.y = 5.15; halo.scale.setScalar(2.2); g.add(halo);
    return { update() { halo.scale.setScalar(2.2 + FX.flare * 2.5); } };
  }, { info: "A soft lamp. At dusk they all come on together.", colliders: () => [[-0.25, -0.25, 0.25, 0.25]] }),
  mhPads: P("Floating panels", (g, s) => {
    const M = mats(), pads = [], r = seeded((s.n || 1) * 31);
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.4 + r() * 2, 0.08, 1.4 + r() * 1.2), M.panel); m.position.set((r() - 0.5) * 10, 3 + r() * 9, (r() - 0.5) * 10); m.rotation.set((r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.3); g.add(m); pads.push([m, m.position.y, r() * 6]); }
    return { update(t) { for (const [m, y, ph] of pads) { m.position.y = y + Math.sin(t * 0.6 + ph) * 0.35; m.rotation.y += 0.0015; } } };
  }, { act: "pads", stay: true, colliders: () => [] }),
  mhBalloon: P("Sky balloon", (g, s) => {
    const M = mats(), K = new Kit(), stripes = [0xf2ebe0, 0xe07a5f, 0xf2ebe0, 0x5fa8d3].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    for (let i = 0; i < 12; i++) K.add(new THREE.SphereGeometry(5, 4, 20, (i / 12) * TAU, TAU / 12, 0, Math.PI * 0.82), stripes[i % 4], { sy: 1.15 });
    K.box(1.6, 1.0, 1.6, M.timber, { y: -7.8 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; K.add(tube([V(Math.cos(a) * 0.75, -7.3, Math.sin(a) * 0.75), V(Math.cos(a) * 3, -3.5, Math.sin(a) * 3)], 0.03, 2, 4), M.rope); }
    K.into(g);
    const body = g.children.slice(); const holder = new THREE.Group(); for (const c of body) holder.add(c); g.add(holder);
    const R = s.orbit || 120, hgt = s.alt || 40, ph = s.phase || 0;
    return { update(t) { const a = ph + t * 0.012; holder.position.set(Math.cos(a) * R - (s.x || 0), hgt + Math.sin(t * 0.4 + ph) * 1.5, Math.sin(a) * R - (s.z || 0)); holder.rotation.y = -a; } };
  }, { stay: true, info: "A sky balloon drifting round the hub. Someone's waving from the basket.", colliders: () => [] }),
  mhScope: P("Viewing scope", (g) => {
    const M = mats(), K = new Kit();
    K.cyl(0.05, 0.08, 1.1, M.metal, { y: 0.55 }, 8); K.cyl(0.13, 0.1, 0.7, M.darkMetal, { y: 1.25, z: 0.1, rx: 1.3 }, 12);
    K.into(g);
  }, { act: "view", colliders: () => [[-0.2, -0.2, 0.2, 0.2]] }),
  mhStage: P("Sky stage", (g) => {
    const M = mats(), K = new Kit();
    K.cyl(7, 7.3, 0.6, M.planks, { y: 0.3 }, 48); K.add(new THREE.TorusGeometry(7.05, 0.08, 6, 64).rotateX(Math.PI / 2), M.cyan, { y: 0.62 });
    const arch = []; for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); arch.push(V(Math.cos(a) * 6.6, 0.6 + Math.sin(a) * 7, -3)); }
    K.add(tube(arch, 0.3, 60, 8), M.white);
    for (const x of [-5, 5]) { K.box(1.1, 2.2, 1, M.screenDark, { x, y: 1.7, z: -3.5 }); K.cyl(0.35, 0.35, 0.1, M.metal, { x, y: 2.2, z: -2.98, rx: Math.PI / 2 }, 16); }
    K.into(g);
  }, { act: "dance", seatless: true, colliders: () => [[-7, -7, 7, -5.5]] }),
  mhPhoto: P("Photo spot", (g) => {
    const M = mats(), K = new Kit();
    const ring = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU; ring.push(V(Math.cos(a) * 1.6, 1.8 + Math.sin(a) * 1.6, 0)); }
    K.add(tube(ring, 0.12, 80, 8), M.white); K.add(tube(ring, 0.04, 80, 6), M.cyan, { z: 0.12 });
    K.cyl(0.6, 0.7, 0.2, M.darkMetal, { y: 0.1 }, 24);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; K.add(leaf(seeded(i + 4), 0.28), M.pinks[i % 4], { x: Math.cos(a) * 1.65, y: 1.8 + Math.sin(a) * 1.65, z: 0.15 }); }
    K.into(g);
  }, { act: "photo", colliders: () => [[-1.7, -0.3, -1.4, 0.3], [1.4, -0.3, 1.7, 0.3]] }),
  mhCanyon: P("Blade canyon", (g) => { const up = buildCanyon(g); return { update: up }; }, { stay: true, info: "Tall pale blades, curving over the path like they're leaning in to listen. The spire at the end lights up at night.", colliders: () => [] }),
  mhSkyline: P("Cloud city", (g) => { buildSkyline(g); }, { stay: true, info: "Towers rising out of the cloud sea. Other hubs, other worlds - a long way off.", colliders: () => [] }),
  mhCrown: P("Petal crown", (g) => {
    // giant white petals of sail rising out of the clouds all round the plaza, leaning in; open to the boulevard and the north walk
    const C = canMats(), K = new Kit();
    const mat = (CROWN_MAT ??= Object.assign(membraneMat([8, 22]), { emissiveIntensity: 0.42 }));   // white from every side, not just from under it
    const skip = (a) => { const w = Math.atan2(Math.sin(a), Math.cos(a)); return (w > -2.35 && w < -0.79) || Math.abs(w - Math.PI / 2) < 0.62; };
    for (const [n, W, b0, b1, y0, y1, off] of [[12, 26, 128, 100, -24, 70, 0], [12, 20, 118, 104, -16, 50, 0.5]]) {
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * TAU;
        if (skip(a)) continue;
        const ca = Math.cos(a), sa = Math.sin(a);
        const pt = (u, v, p) => {
          const w = W * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.85)), 0.6), s = (u - 0.5) * w, e = (2 * u - 1) ** 2;   // full in the middle, pointed at the tip
          const r = lerp(b0, b1, Math.pow(v, 1.6)) + 10 * Math.sin(Math.PI * v) - e * w * 0.22;   // cupped: the edges curl in towards the hub
          return p.set(ca * r - sa * s, lerp(y0, y1, v) + e * w * 0.05, sa * r + ca * s);
        };
        K.add(surface(10, 28, pt), mat);
        for (const u of [0, 0.5, 1]) { const pts = []; for (let k = 0; k <= 24; k++) pts.push(pt(u, k / 24, V())); K.add(tube(pts, u === 0.5 ? 0.2 : 0.32, 96, 6), C.line); }
      }
    }
    K.into(g, { cast: false });
  }, { stay: true, info: "Giant petals of sail rising out of the clouds all round the plaza. Their outlines light up whenever someone arrives.", colliders: () => [] }),
  mhAtmos: P("Blossom air", (g) => {
    const r = seeded(77), mats_ = [];
    const spot = (pos, i, y0, y1) => {                                  // over the plaza, or down the boulevard
      if (r() < 0.6) { const a = r() * TAU, d = Math.sqrt(r()) * 80; pos.set([Math.cos(a) * d, y0 + r() * (y1 - y0), Math.sin(a) * d], i * 3); }
      else pos.set([(r() - 0.5) * 50, y0 + r() * (y1 - y0), -50 - r() * 200], i * 3);
    };
    const cloud = (n, kind, y0, y1, s0, s1) => {
      const pos = new Float32Array(n * 3), sz = new Float32Array(n), sd = new Float32Array(n);
      for (let i = 0; i < n; i++) { spot(pos, i, y0, y1); sz[i] = s0 + r() * (s1 - s0); sd[i] = r(); }
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)).setAttribute("aSize", new THREE.BufferAttribute(sz, 1)).setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
      const mat = airMat(kind), pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false; pts.raycast = () => {}; pts.renderOrder = 4;
      pts.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(_dbs); mat.uniforms.uViewH.value = _dbs.y; };
      g.add(pts); mats_.push(mat);
    };
    cloud(2400, 0, 0, 22, 0.16, 0.28);                                  // blossom petals
    cloud(1200, 1, 0.5, 18, 0.05, 0.11);                                // golden dust
    // shafts of sunlight slanting down through the canopy and along the boulevard
    const rays = godRayMat(), shaft = new THREE.CylinderGeometry(1.8, 4.6, 260, 24, 1, true).translate(0, 130, 0), at = [];
    for (let z = -62, i = 0; z >= -240; z -= 22, i++) at.push([(i % 2 ? 1 : -1) * (5 + ((i * 7) % 9)), z]);
    for (const a of [0.5, 2.3, 3.6, 5.6]) at.push([Math.cos(a) * 70, Math.sin(a) * 70]);
    for (const [x, z] of at) { const m = new THREE.Mesh(shaft, rays); m.position.set(x, 0, z); m.rotation.set(-0.12, 0, 0.32); m.raycast = () => {}; m.renderOrder = 4; m.frustumCulled = false; g.add(m); }
    return { update(t) { for (const m of mats_) m.uniforms.uTime.value = t; rays.uniforms.uTime.value = t; rays.uniforms.uBoost.value = 1 + FX.flare * 0.8; } };
  }, { stay: true, info: "Blossom petals and golden dust drifting on the air, and sunlight slanting down through the canopy.", colliders: () => [] }),
  mhDrum: P("Sky scoreboard", (g) => {
    // a drum of screens floating over the east terrace: a marquee round its top, a turbine underneath holding it up, a cage and beacon on top
    const M = mats(), K = new Kit(), R = 10, H = 8.4, y0 = 16, W = (H * 16) / 9, th = W / R;
    const body = new THREE.Group(); g.add(body);
    K.add(new THREE.CylinderGeometry(R - 0.06, R - 0.06, H + 4.2, 72, 1, true), M.screenDark, { y: y0 + H / 2 });
    for (const yy of [y0 - 0.3, y0 + H + 0.3, y0 + H + 2.15, y0 - 2.15]) K.add(new THREE.TorusGeometry(R + 0.05, yy > y0 + H + 1 || yy < y0 - 1 ? 0.18 : 0.26, 10, 96).rotateX(Math.PI / 2), M.white, { y: yy });
    K.add(new THREE.CircleGeometry(R, 72).rotateX(-Math.PI / 2), M.darkMetal, { y: y0 + H + 2.1 });
    // the turbine: a metal nacelle narrowing to an intake, a ring of cyan lights round it, a fan spinning inside
    const nb = y0 - 2.1;
    K.add(new THREE.LatheGeometry([V(4.0, -2.9), V(4.3, -2.6), V(5.0, -2.2), V(R * 0.74, -1.5), V(R * 0.93, -0.7), V(R + 0.05, 0)], 96), M.metal, { y: nb });
    K.add(new THREE.CylinderGeometry(4.0, 4.0, 1.0, 48, 1, true), M.darkMetal, { y: nb - 2.4 });
    K.add(new THREE.CircleGeometry(4.0, 48).rotateX(Math.PI / 2), M.darkMetal, { y: nb - 1.9 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; K.box(0.8, 0.22, 0.3, M.cyan, { x: Math.cos(a) * 8.4, y: nb - 1.08, z: Math.sin(a) * 8.4, ry: Math.PI / 2 - a }); }
    // the cage on top, and its beacon
    const cb = y0 + H + 2.1, ct = cb + 3.2, cr = 6.5;
    for (const yy of [cb + 0.05, ct]) K.add(new THREE.TorusGeometry(cr, 0.1, 8, 72).rotateX(Math.PI / 2), M.white, { y: yy });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, b = ((i + 1) / 12) * TAU;
      K.cyl(0.09, 0.09, 3.2, M.white, { x: Math.cos(a) * cr, y: (cb + ct) / 2, z: Math.sin(a) * cr }, 6);
      K.add(tube([V(Math.cos(a) * cr, cb, Math.sin(a) * cr), V(Math.cos(b) * cr, ct, Math.sin(b) * cr)], 0.05, 2, 4), M.metal);
    }
    K.cyl(0.12, 0.16, 4.6, M.white, { y: cb + 2.3 }, 8);
    K.add(new THREE.SphereGeometry(0.45, 16, 12), M.cyan, { y: cb + 4.8 });
    K.into(body);
    const fan = new THREE.Group(); fan.position.y = nb - 2.3; body.add(fan);
    const FK = new Kit();
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; FK.box(3.4, 0.06, 0.55, M.darkMetal, { x: Math.cos(a) * 2.1, z: Math.sin(a) * 2.1, ry: -a, rx: 0.5, order: "YXZ" }); }
    FK.add(new THREE.ConeGeometry(0.9, 1.4, 24).rotateX(Math.PI), M.metal, { y: -0.3 });
    FK.into(fan, { cast: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.0, 48).rotateX(Math.PI / 2), M.glowDisc); glow.position.y = nb - 2.0; body.add(glow);
    const chase = new THREE.Group(); body.add(chase);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.26, 0.32), M.led); m.position.set(Math.cos(a) * 8.45, nb - 1.06, Math.sin(a) * 8.45); m.rotation.y = Math.PI / 2 - a; chase.add(m); }
    const jmat = fieldMat(0x7fe9ff), jetH = nb - 2.9 - 0.1;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 3.8, jetH, 48, 1, true).rotateX(Math.PI), jmat); jet.position.y = 0.1 + jetH / 2; jet.raycast = () => {}; body.add(jet);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2), M.glowDisc); pool.position.y = 0.08; g.add(pool);
    const beacon = new THREE.Sprite(M.halo); beacon.position.y = cb + 4.8; beacon.scale.setScalar(4); body.add(beacon);
    const sr = seeded(5), stars = [];
    for (let i = 0; i < 9; i++) { const a = sr() * TAU, d = R + 1.5 + sr() * 3, s = new THREE.Sprite(M.haloWarm); s.position.set(Math.cos(a) * d, y0 - 3 + sr() * (H + 9), Math.sin(a) * d); s.raycast = () => {}; body.add(s); stars.push([s, sr() * 6]); }
    // the screens, front and back, and the marquee and the band round it
    const bc = document.createElement("canvas"); bc.width = BW; bc.height = BH;
    const bg = bc.getContext("2d"), btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 8;
    const smat = screenMat(btex);
    for (const a0 of [-th / 2, Math.PI - th / 2]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true, a0, th), smat); m.position.y = y0 + H / 2; body.add(m); }
    const tc = document.createElement("canvas"); tc.width = 2048; tc.height = 160;
    const tg = tc.getContext("2d"), ttex = new THREE.CanvasTexture(tc); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = 8; ttex.wrapS = THREE.RepeatWrapping;
    const tmat = screenMat(ttex, { scan: 0.6, sheen: 0, rep: [4, 1] });
    const marquee = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 1.4, 96, 1, true), tmat); marquee.position.y = y0 + H + 1.25; body.add(marquee);
    const bmat = screenMat(bannerText("HALL OF FAME  ·  TOP LUMEN  ·  ALL SERVERS"), { scan: 0.5, sheen: 0, add: true, rep: [4, 1] });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 1.3, 96, 1, true), bmat); band.position.y = y0 - 1.25; body.add(band);
    const T = { pos: 0, next: 0, deck: [], items: [], acc: 0 };
    const tickerDraw = (dt) => {
      T.pos += dt * 230; tg.font = "900 88px Nunito, sans-serif";
      while (T.next < T.pos + tc.width + 50) {
        if (!T.deck.length) T.deck = [...SOCIZ_LINES].sort(() => Math.random() - 0.5);
        const text = T.deck.pop(), w = tg.measureText(text).width; T.items.push({ text, x: T.next, w }); T.next += w + 150;
      }
      T.items = T.items.filter((it) => it.x + it.w + 150 > T.pos);
      const gr = tg.createLinearGradient(0, 0, 0, tc.height); gr.addColorStop(0, "#120d06"); gr.addColorStop(1, "#060402"); tg.fillStyle = gr; tg.fillRect(0, 0, tc.width, tc.height);
      tg.textBaseline = "middle"; tg.textAlign = "left";
      for (const it of T.items) {
        const x = it.x - T.pos;
        tg.fillStyle = "#ffd25a"; tg.shadowColor = "#ff9d1c"; tg.shadowBlur = 14; tg.fillText(it.text, x, tc.height / 2 + 3);
        tg.shadowBlur = 0; tg.fillStyle = "#7fe9ff"; tg.font = "900 64px Nunito, sans-serif"; tg.fillText("✦", x + it.w + 52, tc.height / 2 + 2); tg.font = "900 88px Nunito, sans-serif";
      }
      tg.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < tc.height; y += 4) tg.fillRect(0, y, tc.width, 1);
      ttex.needsUpdate = true;
    };
    let page = 1, pageT = 6, slide = 0, count = 1, ver = -1, acc = 1;   // half a page out of step with the Hall of Fame
    let from = new Map(); const shown = new Map();
    const val = (row) => { const v = lerp(from.get(row.name) ?? row.vcash * 0.9, row.vcash, ease(count)); shown.set(row.name, v); return v; };
    return { update(t, dt) {
      body.position.y = Math.sin(t * 0.5) * 0.35; body.rotation.y = Math.sin(t * 0.07) * 0.12;
      smat.uniforms.uTime.value = t; tmat.uniforms.uTime.value = t; bmat.uniforms.uTime.value = t; band.rotation.y = -t * 0.04;
      smat.uniforms.uBright.value = 1 + FX.flare * 0.35;
      fan.rotation.y = t * 5; chase.rotation.y = -t * 0.9;
      jmat.uniforms.uTime.value = t; jmat.uniforms.uBoost.value = 1.8 + FX.flare * 2;
      beacon.scale.setScalar(3.6 + Math.sin(t * 2.4) * 0.5 + FX.flare * 5);
      for (const [s, p] of stars) s.scale.setScalar(Math.max(0.05, Math.pow(Math.max(0, Math.sin(t * 1.3 + p)), 6) * 2.6));
      pageT += dt; if (pageT > 12) { pageT = 0; page ^= 1; slide = 0; }
      if (boardVersion() !== ver) { ver = boardVersion(); from = new Map(shown); count = 0; }
      slide += dt / 1.5; count = Math.min(1.2, count + dt / 1.3);
      T.acc += dt; if (T.acc > 1 / 30) { tickerDraw(T.acc); T.acc = 0; }
      acc += dt;
      if (acc > (slide < 1.3 || count < 1.05 ? 1 / 12 : 0.5)) { acc = 0; drawBoard(bg, page, slide, t, val); btex.needsUpdate = true; }
    } };
  }, { act: "board", stay: true, colliders: () => [], info: "The sky scoreboard: the top Lumen on every server, floating over the east terrace." }),
};

// ---------------------------------------------------------------- the hub
const TIPS = [
  "Click anything and it does something - try the blossom trees, the portals, the Hall of Fame.",
  "Hold Shift to run. Space jumps. The skybridge ramps are on the wings either side of the boulevard.",
  "Each portal goes to a different hub. Its name turns round the rim, in that hub's colour.",
  "The terraces east and west are good for sitting and watching the crowd.",
  "Walk north past the beacon and you reach the blade canyon, all the way to the spire.",
  "The beacon is how everyone arrives. Step into it to open the hub list.",
  "Up to a hundred people fit in here and it still feels roomy.",
];
const NAMES_P = ["Aria", "Bo", "Cleo", "Dax", "Eli", "Fen", "Gia", "Hux", "Ivy", "Jae", "Kip", "Luz", "Moe", "Nia", "Oli", "Pip", "Quin", "Rue", "Sol", "Tam", "Uma", "Vic", "Wen", "Xan", "Yui", "Zed",
  "Ash", "Bex", "Cy", "Dot", "Edo", "Fay", "Gus", "Hana", "Ines", "Jo", "Kai", "Lev", "Mira", "Ned", "Oona", "Pax", "Remy", "Suki"];
const COLORS = ["#f27ea6", "#5fb8e8", "#f2c14e", "#7cc576", "#b48ae8", "#ff9f6b", "#6be0c8", "#e86b6b", "#9ec1ff", "#ffd27a"];
/** the colour an arrival paints the canopy: from the name, so the same person always lights it the same way */
function tintFor(name = "") {
  let h = 7; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const c = new THREE.Color(COLORS[h % COLORS.length]), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
  return c.setHSL(hsl.h, 0.9, 0.62, THREE.SRGBColorSpace);
}
const YOU_TINT = 0xffe0a0;                                              // your own arrival lights it gold

// ---------------------------------------------------------------- the opening: deep space
/** deep space for the first arrival: a nebula and stars, an orb of light, the strands of energy pouring into it. Only the intro's camera
 *  sees it (it lives on its own layer), and it is thrown away the moment the hub appears */
const COSMOS = 5;
const NOISE_GLSL = `float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }`;
function domeMat(U) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: { uTime: U.uTime },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; varying vec3 vDir; ${NOISE_GLSL}
float stars(vec3 d, float scale, float thr){
  vec3 g = d * scale, id = floor(g), f = fract(g) - 0.5, o = (vec3(h3(id + 7.1), h3(id + 3.7), h3(id + 1.3)) - 0.5) * 0.5; float r = h3(id);
  return step(thr, r) * smoothstep(0.26, 0.0, length(f - o)) * (0.65 + 0.35 * sin(uTime * (2.0 + r * 4.0) + r * 60.0));
}
void main(){
  vec3 d = normalize(vDir);
  float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.03, 0.0)), n2 = fbm(d * 4.6 - vec3(uTime * 0.02) + n);
  vec3 col = vec3(0.004, 0.003, 0.012);
  col += vec3(0.13, 0.03, 0.2) * smoothstep(0.42, 0.82, n);
  col += vec3(0.01, 0.1, 0.17) * smoothstep(0.48, 0.86, n2);
  col += vec3(0.3, 0.14, 0.04) * pow(smoothstep(0.5, 0.9, n * n2 * 1.7), 2.0);
  float band = exp(-pow(d.y * 2.6 + 0.35 * sin(d.x * 2.7 + d.z * 1.3), 2.0));                  // a river of dust across the sky
  col += vec3(0.12, 0.09, 0.17) * band * smoothstep(0.35, 0.75, n2);
  col += vec3(0.85, 0.92, 1.0) * (stars(d, 160.0, 0.982) + 0.5 * stars(d, 380.0, 0.972) * (0.4 + band));
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}
/** the orb: churning gold-white light with threads of cyan, a cyan rim; from inside it is nothing but white */
function orbMat(U) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, toneMapped: false, uniforms: { uTime: U.uTime },
    vertexShader: "varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW; ${NOISE_GLSL}
void main(){
  if (!gl_FrontFacing) { gl_FragColor = vec4(2.2, 2.05, 1.8, 1.0); return; }
  vec3 V = normalize(cameraPosition - vW), N = normalize(vN), p = normalize(vP);
  float fr = 1.0 - max(dot(N, V), 0.0);
  float sw = fbm(p * 2.6 + vec3(uTime * 0.22, -uTime * 0.17, uTime * 0.09));
  float sw2 = fbm(p * 6.5 + sw * 2.4 - vec3(0.0, uTime * 0.35, 0.0));
  float fil = exp(-pow((sw2 - 0.6) * 24.0, 2.0)) + 0.6 * exp(-pow((sw - 0.58) * 30.0, 2.0));   // thin threads of hot light
  float heat = smoothstep(0.36, 0.64, sw);
  vec3 col = mix(vec3(1.0, 0.24, 0.035), vec3(1.0, 0.6, 0.18), heat) * (0.3 + 0.95 * heat);
  col += vec3(0.65, 0.95, 1.0) * fil * 1.3;
  col = mix(col, vec3(0.42, 0.72, 1.0) * 1.9, pow(fr, 2.4));
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}
/** a strand of energy: brightest by the orb, with pulses of light racing in along it */
function strandMat(U, color, seed) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uTime: U.uTime, uSeed: { value: seed }, uColor: { value: new THREE.Color(color) } },
    vertexShader: "varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vec3 N = normalize(mat3(modelMatrix) * normal); vF = abs(dot(N, normalize(cameraPosition - w.xyz))); gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime, uSeed; uniform vec3 uColor; varying vec2 vUv; varying float vF;
void main(){
  float x = vUv.x;
  float run = pow(fract(x * 1.6 - uTime * 0.55 + uSeed), 14.0) * 2.6 + pow(fract(x * 4.0 - uTime * 1.3 + uSeed * 3.0), 30.0) * 1.2;
  float body = smoothstep(0.0, 0.3, x) * (0.16 + 0.84 * x * x);
  float I = body * (0.35 + run) * (0.25 + 0.75 * pow(vF, 1.5));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(run * 0.35, 0.0, 0.8)) * I, 1.0);
}`,
  });
}
function buildCosmos() {
  const M = mats(), group = new THREE.Group(), U = { uTime: { value: 0 } }, r = seeded(777), own = [];
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 64, 32), domeMat(U)); dome.renderOrder = -10; dome.frustumCulled = false; group.add(dome);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(16, 96, 64), orbMat(U)); group.add(orb);
  const glow = (color, size, opacity, map = M.tex.glowDisc) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    s.scale.setScalar(size); group.add(s); return s;
  };
  glow(0xffe2b8, 46, 0.55); const halos = [glow(0x9fd8ff, 170, 0.22), glow(0xc8a0ff, 420, 0.06)];   // the far halos fade as you close in
  const burstTex = canvasTex(512, 512, (g, w) => {                          // the orb's starburst
    const q = seeded(31); g.translate(w / 2, w / 2); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + q() * 0.2, L = w * (0.26 + q() * 0.24), th = 1.2 + q() * 2.6;
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.save(); g.rotate(a); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -th); g.lineTo(L, 0); g.lineTo(0, th); g.closePath(); g.fill(); g.restore();
    }
  });
  own.push(burstTex);
  const burst = glow(0xfff1dc, 150, 0.32, burstTex);
  // the strands: long spirals of light winding in from deep space to the orb
  const COLS = [0x8fe9ff, 0xc9a2ff, 0xffd59a, 0xff9fd8, 0xbff4ff, 0x9fb8ff];
  for (let i = 0; i < 46; i++) {
    const A = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), u0 = V(r() - 0.5, r() - 0.5, r() - 0.5).cross(A).normalize(), w0 = A.clone().cross(u0);
    const R0 = 150 + r() * 220, tw = (1.4 + r() * 2.2) * (r() < 0.5 ? 1 : -1), lat = (r() - 0.5) * 0.9, ph = r() * TAU, pts = [];
    for (let j = 0; j <= 10; j++) {
      const f = j / 10, rad = 16.4 + (R0 - 16.4) * Math.pow(1 - f, 1.6), a = ph + tw * Math.pow(f, 1.25), la = lat * (1 - f);
      pts.push(u0.clone().multiplyScalar(Math.cos(a) * Math.cos(la) * rad).addScaledVector(w0, Math.sin(a) * Math.cos(la) * rad).addScaledVector(A, Math.sin(la) * rad));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 150, 0.3 + r() * 0.35, 6, false), strandMat(U, COLS[i % COLS.length], r())));
  }
  // a disc of glittering dust turning round it, and three thin rings
  const N = 2400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = r() * TAU, d = 22 + Math.pow(r(), 1.8) * 240, y = (r() - 0.5) * (6 + d * 0.22); pos.set([Math.cos(a) * d, y, Math.sin(a) * d], i * 3); }
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ map: M.tex.glowDisc, color: 0xd8ecff, size: 0.9, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  dust.rotation.x = 0.35; group.add(dust);
  const rings = [[24, 0.09, 0x9fe8ff, 1.2, 0.3], [31, 0.06, 0xffd8a8, -0.9, 0.55], [42, 0.12, 0xc9b5ff, 0.6, -0.4]].map(([R, tube, color, sp, tilt]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 6, 160), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    m.rotation.set(Math.PI / 2 + tilt, tilt * 0.6, 0); group.add(m); return { m, sp };
  });
  group.traverse((o) => { o.layers.set(COSMOS); o.raycast = () => {}; });
  return {
    group,
    update(t, cam) {
      U.uTime.value = t; dome.position.copy(cam.position);
      const near = THREE.MathUtils.smoothstep(cam.position.length(), 40, 160);
      halos[0].material.opacity = 0.22 * near; halos[1].material.opacity = 0.06 * near;
      orb.rotation.y = t * 0.12; dust.rotation.y = t * 0.05; burst.material.rotation = t * 0.04;
      for (const { m, sp } of rings) m.rotation.z = t * sp * 0.3;
    },
    dispose() { group.traverse((o) => { if (!o.isSprite) o.geometry?.dispose(); o.material?.dispose(); }); own.forEach((x) => x.dispose()); },
  };
}
/** a smooth, never-backtracking curve through (x, y) keys (Fritsch-Carlson), ending at rest: when the camera passes each point of its path */
function monoMap(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

let introSeen = false;
try { introSeen = localStorage.getItem("mainHubIntroSeen") === "1"; } catch { /* ignore */ }   // the opening plays once, ever
let HUB_ROOM = null;                                                     // the room while the Main Hub is open (the portals watch your character)
/** play the first-visit opening again next time (for a "replay intro" button, and for testing) */
export const replayMainIntro = () => { introSeen = false; try { localStorage.removeItem("mainHubIntroSeen"); } catch { /* ignore */ } };
export function mainHub() {
  const items = [{ type: "mhDeck", x: 0, z: 0 }, { type: "mhRails", x: 0, z: 0 }, { type: "mhCanopy", x: 0, z: 0 }, { type: "mhVault", x: 0, z: 0 },
    { type: "mhBeacon", x: 0, z: 0 }, { type: "mhGlow", x: 0, z: 0 }, { type: "mhHolo", x: 0, z: 0 }, { type: "mhBoard", x: 0, z: 74, rot: Math.PI }, { type: "mhBridge", x: 0, z: 0 },
    { type: "mhCanyon", x: 0, z: 0 }, { type: "mhSkyline", x: 0, z: 0 }, { type: "mhCrown", x: 0, z: 0 }, { type: "mhAtmos", x: 0, z: 0 },
    { type: "mhDrum", x: 86, z: 0, y: L.terrace.steps * L.terrace.rise, rot: -Math.PI / 2 }];
  // portals down both sides of the boulevard, facing the walkway
  const PORTAL_ROWS = [-84, -148, -180, -212, -236];                     // kept clear of the skybridge overhead, so the floating signs have sky above them
  PORTAL_LIST.forEach(([to, name], i) => { const s = i % 2 ? 1 : -1, z = PORTAL_ROWS[Math.floor(i / 2)] - (s > 0 ? 8 : 0); items.push({ type: "mhPortal", x: s * 17.5, z, rot: s * -Math.PI / 2, to, name, label: `Portal: ${name}` }); });
  // lamps and sails along the boulevard (no orbs: the vault outlines light it)
  for (let z = -70; z >= -244; z -= 16) for (const s of [1, -1]) {
    items.push({ type: "mhSail", x: s * 23.5, z: z - 8, rot: s > 0 ? Math.PI : 0, h: 12 + ((z * 7) % 3) });
    if (!((z / 16) % 2)) items.push({ type: "mhLamp", x: s * 12.6, z: z - 4 });
  }
  for (let z = -78; z >= -238; z -= 32) items.push({ type: "mhBlossom", x: 0, z, n: Math.abs(z) });
  for (let z = -94; z >= -238; z -= 32) for (const s of [1, -1]) items.push({ type: "mhBench", x: s * 9, z, rot: s * -Math.PI / 2 });   // on the wooden lanes, off the light dashes, facing the trees
  // the plaza: orbs on a ring, benches facing the beacon, blossom trees, kiosks, photo spots, the sails round the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + TAU / 24, x = Math.cos(a) * 30, z = Math.sin(a) * 30;
    items.push({ type: "mhOrb", x, z, tip: TIPS[i % TIPS.length] });
    const b = a + TAU / 24; items.push({ type: "mhBench", x: Math.cos(b) * 19, z: Math.sin(b) * 19, rot: Math.atan2(-Math.cos(b), -Math.sin(b)) + Math.PI });
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; if (Math.abs(Math.sin(a) + 1) < 0.25) continue; items.push({ type: "mhBlossom", x: Math.cos(a) * 47, z: Math.sin(a) * 47, n: 300 + i }); }
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, x = Math.cos(a) * 81.5, z = Math.sin(a) * 81.5; if (Math.abs(x) < 28 && z < 0) continue; if (Math.abs(x) < 22 && z > 0) continue; if (Math.abs(z) < 32 && Math.abs(x) > 60) continue; items.push({ type: "mhSail", x, z, rot: -a + Math.PI / 2, h: 11 + (i % 3) * 1.5 }); }
  for (const [x, z, name] of [[26, 45, "Sky Snacks"], [-26, 45, "Cloud Tea"], [45, -26, "Star Pops"], [-45, -26, "Hub Juice"]]) items.push({ type: "mhKiosk", x, z, rot: Math.atan2(-x, -z), name });
  for (const [x, z] of [[22, 66], [-22, 66], [0, -72]]) items.push({ type: "mhPhoto", x, z, rot: Math.atan2(-x, -z) });
  for (const [n, x, z] of [[1, 44, 20], [2, -44, -20], [3, 30, -66], [4, -30, 66]]) items.push({ type: "mhPads", x, z, n });
  // the wings and the bridge: trees, benches, sails; trees and benches up on the bridge too
  for (const s of [1, -1]) {
    for (const z of [-80, -100, -140]) items.push({ type: "mhBlossom", x: s * 36, z, n: 500 + z * s });
    for (const z of [-90, -132]) items.push({ type: "mhBench", x: s * 52, z, rot: s * Math.PI / 2 });
    for (let z = -70; z >= -146; z -= 12) items.push({ type: "mhSail", x: s * 56, z, rot: s > 0 ? Math.PI : 0, h: 12 });
    for (const x of [12, 32]) items.push({ type: "mhBlossom", x: s * x, z: -120, y: L.bridge.y, n: 700 + x * s });
  }
  // terraces: a stage on the west deck, benches and trees on both
  items.push({ type: "mhStage", x: -94, z: 0, y: L.terrace.steps * L.terrace.rise, rot: Math.PI / 2 });
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) for (const z of [-20, -6, 6, 20]) items.push({ type: "mhBench", x: s * (L.terrace.x0 + 2 + i * 4), z, y: (i + 1) * L.terrace.rise, rot: s * -Math.PI / 2 });
    for (const z of [-24, 24]) items.push({ type: "mhBlossom", x: s * 98, z, y: L.terrace.steps * L.terrace.rise, n: 900 + z * s });
  }
  for (const z of [-12, 12]) items.push({ type: "mhOrb", x: 92, z, y: 1.8, tip: TIPS[(z > 0) + 3] });
  // the north walk and the canyon: orbs, lamps, the view at the end; the far viewpoint at the boulevard's end
  for (let z = 78; z <= 250; z += 14) for (const s of [1, -1]) if (z >= 112) items.push({ type: "mhLamp", x: s * 5.2, z });
  for (const x of [-8, 0, 8]) items.push({ type: "mhScope", x, z: -248, rot: Math.PI });
  for (const [ph, alt, orbit] of [[0, 46, 130], [2.4, 58, 170], [4.1, 38, 110]]) items.push({ type: "mhBalloon", x: 0, z: 0, phase: ph, alt, orbit });

  const people = [], r = seeded(99);
  const areas = [
    [20, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, 0], [16, { minX: -18, maxX: 18, minZ: -240, maxZ: -62 }, 0], [7, { minX: -44, maxX: 44, minZ: L.bridge.z0 + 1.5, maxZ: L.bridge.z1 - 1.5 }, L.bridge.y],
    [4, { minX: 84, maxX: 100, minZ: -26, maxZ: 26 }, 1.8], [4, { minX: -100, maxX: -84, minZ: -26, maxZ: 26 }, 1.8], [3, { minX: 28, maxX: 54, minZ: -146, maxZ: -70 }, 0],
    [3, { minX: -54, maxX: -28, minZ: -146, maxZ: -70 }, 0], [3, { minX: -4, maxX: 4, minZ: 80, maxZ: 240 }, 0]];
  let n = 0;
  for (const [count, area, level] of areas) for (let i = 0; i < count; i++, n++) {
    const still = r() < 0.25;
    people.push({ id: `mh-${n}`, name: NAMES_P[n % NAMES_P.length], color: COLORS[n % COLORS.length], x: lerp(area.minX, area.maxX, r()), z: lerp(area.minZ, area.maxZ, r()), area, level, roam: !still, still });
  }

  // arrival. The first time: out in deep space an orb of light drinks in strands of energy; you fall into it, and out of the white
  // the hub appears - down past the spire and between its rings, along the canyon, up over the canopy and straight down the beam.
  // Every time: you form inside the beam in a flash of light, and step out
  let intro = null, arrivals = 9;
  const TC = 2.8;                                                         // seconds of deep space before the world
  const FLY = [[80, 230, 560, 2.8], [42, 134, 404, 3.95], [16, 69, 330, 4.8], [9.2, 67.6, 300, 5.3], [4, 44, 268, 5.8], [0, 22, 200, 6.45],
    [-3, 18, 136, 7.05], [0, 25, 92, 7.55], [0, 50, 56, 8.05], [0, 66, 24, 8.5], [0, 72, 7, 8.85], [0, 64, 0, 9.15], [0, 40, 0, 9.55],
    [0, 20, 0, 9.9], [0, 9, 0, 10.25], [0.6, 5.4, -5.5, 10.75], [1.5, 3.4, -13.5, 11.3]];
  const flyPath = new THREE.CatmullRomCurve3(FLY.map(([x, y, z]) => V(x, y, z)), false, "centripetal");
  const flyU = monoMap(FLY.map((f) => f[3]), FLY.map((_, i) => i / (FLY.length - 1)));
  const LAND = V(1.5, 3.4, -13.5), LAND_AT = V(0, 1.3, -3), LAND_LOOK = LAND_AT.clone().sub(LAND).normalize();
  const sm = THREE.MathUtils.smoothstep, dir = V(), look = V(), spin = V();
  /** golden clouds banked round the first stretch of the fly-in: out to the sides and below, never in the way of the view ahead */
  const goldenClouds = () => {
    const grp = new THREE.Group(), r = seeded(41), mat = new THREE.SpriteMaterial({ map: mats().tex.puff, color: 0xffd79a, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    const tg = V(), side = V(), up = V(), Y = V(0, 1, 0);
    for (let i = 0; i < 90; i++) {
      const u = 0.002 + r() * 0.2, s = 20 + r() * 34, a = r() * TAU, d = 0.62 * s + 8 + r() * 34;
      flyPath.getTangent(u, tg); side.crossVectors(tg, Y).normalize(); up.crossVectors(side, tg).normalize();
      const sp = new THREE.Sprite(mat);
      sp.position.copy(flyPath.getPoint(u)).addScaledVector(side, Math.cos(a) * d).addScaledVector(up, Math.sin(a) * d * 0.75 - 8);
      sp.scale.setScalar(s); sp.raycast = () => {}; grp.add(sp);
    }
    grp.userData.mat = mat;
    return grp;
  };
  const dropClouds = (room) => { const c = intro?.clouds; if (!c) return; intro.clouds = null; room.scene.remove(c); c.userData.mat.dispose(); };
  const overlay = () => {
    const d = document.createElement("div");
    d.className = "mainhub-intro";
    d.innerHTML = `<div class="mh-flash"></div><div class="mh-title"><b>THE MAIN HUB</b><small>Everyone arrives here</small></div><button type="button" class="mh-skip">Skip ▸</button>`;
    document.body.appendChild(d);
    return d;
  };
  /** out of deep space and into the world: the hub's layer back on, the cosmos thrown away */
  const reveal = (room) => {
    const C = intro?.cosmos;
    if (!C) return;
    intro.cosmos = null;
    room.camera.layers.mask = intro.layers;
    if (room.bloom && intro.bloom) Object.assign(room.bloom, intro.bloom);
    room.scene.remove(C.group); C.dispose();
  };
  const finish = (room) => {
    if (!intro) return;
    const c = room.char, ctl = room.controls, cam = room.camera;
    reveal(room);
    if (c) c.root.scale.setScalar(intro.scale);
    BEAM.boost(1);
    ctl.maxDistance = intro.maxDist; ctl.enabled = true;
    if (intro.polar) [ctl.minPolarAngle, ctl.maxPolarAngle] = intro.polar;
    if (intro.fov && cam.fov !== intro.fov) { cam.fov = intro.fov; cam.updateProjectionMatrix(); }
    if (intro.flying && !intro.landed) { cam.position.copy(LAND); ctl.target.copy(LAND_AT); ctl.update(); }
    intro.el?.remove(); window.removeEventListener("keydown", intro.skip, true);
    dropClouds(room);
    intro = null;
  };
  const step = (dt, t, room) => {
    const cam = room.camera, ctl = room.controls;
    arrivals -= dt;                                                    // someone else arrives: the beacon blazes for them too
    if (arrivals <= 0) { arrivals = 14 + Math.random() * 22; if (!intro) { const who = NAMES_P[Math.floor(Math.random() * NAMES_P.length)]; BEAM.flare(0.9, tintFor(who)); try { room.onBeaconArrival?.(who); } catch (e) { console.warn(e); } } }
    if (!intro) { if (cam.position.y < (room.char?.baseY || 0) + 0.35) cam.position.y = (room.char?.baseY || 0) + 0.35; return; }
    room._userActive = performance.now() + 800;
    intro.skipTo && (intro.skipTo += dt); intro.t = Math.max(intro.skipTo, (performance.now() - intro.start) / 1000);
    const T = intro.t, el = intro.el, c = room.char, flashEl = el.querySelector(".mh-flash");
    if (intro.cosmos && T >= TC) reveal(room);
    if (T < intro.fly) {
      if (intro.cosmos) {                                                // deep space: circle the orb, closing in, then fall into it
        const k = T / TC, az = 0.5 + 1.2 * k, elv = 0.34 - 0.24 * k;
        const d = 16 + 190 * Math.pow(1 - k, 1.7) - 20 * sm(k, 0.7, 1);
        dir.set(Math.cos(elv) * Math.sin(az), Math.sin(elv), Math.cos(elv) * Math.cos(az));
        cam.position.copy(dir).multiplyScalar(d); ctl.target.copy(dir).multiplyScalar(-14);
        intro.cosmos.update(t, cam);
        flashEl.style.opacity = String(sm(k, 0.76, 0.97));
        return;
      }
      const u = flyU(T), p = flyPath.getPoint(u);                        // the world: the spire, the canyon, the canopy, the beam
      flyPath.getTangent(Math.min(0.9995, Math.max(0.0005, u)), look);
      const az = Math.PI * (1 - sm(T, 9.15, 10.25));                    // spinning half a turn on the way down the beam
      spin.set(Math.sin(az) * 0.3, -1, Math.cos(az) * 0.3).normalize();
      if (T < 9.15) look.lerp(spin, sm(T, 8.8, 9.15)).normalize();
      else if (T < 10.25) look.copy(spin);
      else look.copy(spin).lerp(LAND_LOOK, sm(T, 10.25, 11.1)).normalize();
      cam.position.copy(p); ctl.target.copy(p).addScaledVector(look, 8);
      const fov = intro.fov + 12 * sm(T, 4.6, 5.5) * (1 - sm(T, 7.3, 8.3)) + 9 * sm(T, 9.05, 9.5) * (1 - sm(T, 9.95, 10.7));
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      flashEl.style.opacity = String(1 - sm(T, TC + 0.05, TC + 0.8));
      el.querySelector(".mh-title").style.opacity = String(sm(T, 3.5, 4.3) * (1 - sm(T, 6.7, 7.5)));
      return;
    }
    if (!intro.landed) {
      intro.landed = true; cam.position.copy(LAND); ctl.target.copy(LAND_AT); dropClouds(room);
      if (intro.fov && cam.fov !== intro.fov) { cam.fov = intro.fov; cam.updateProjectionMatrix(); }
      el.querySelector(".mh-title").style.opacity = "0"; el.querySelector(".mh-skip").hidden = true;
    }
    const m = T - intro.fly;                                            // forming inside the beam: a white flash, then you
    const flash = m < 0.25 ? m / 0.25 : Math.max(0, 1 - (m - 0.25) / 0.9);
    flashEl.style.opacity = String(flash * 0.85);
    if (!intro.flared && m > 0.1) { intro.flared = true; BEAM.flare(1, YOU_TINT); }
    BEAM.boost(1 + 2.2 * Math.max(0, 1 - m / 1.6));
    const g = THREE.MathUtils.clamp((m - 0.15) / 0.7, 0, 1), back = 1 + 2.2 * (g - 1) ** 3 + 1.2 * (g - 1) ** 2;
    if (c) c.root.scale.setScalar(Math.max(0.001, intro.scale * back));
    if (m > 1.0 && !intro.walked) { intro.walked = true; ctl.enabled = true; ctl.maxDistance = intro.maxDist; if (intro.polar) [ctl.minPolarAngle, ctl.maxPolarAngle] = intro.polar; room.walkTo?.(0, -9); }
    if (m > 1.8) finish(room);
  };
  return {
    key: "main", name: "The Main Hub", outdoor: "bare", freeLook: true, camDistance: 24, far: 1800, spawn: [0, 0],
    open: { minX: -110, maxX: 110, minZ: -256, maxZ: 266 },
    layout: { shell: { windowItem: true, window: false, brightness: 1, wallpaper: "none", wall: "#efe6da", floor: "oak", sky: "day", house: { w: 200, d: 20, hub: true } }, items },
    sky: canvasTex(16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); for (const [p, c] of [[0, "#cdb6a0"], [0.38, "#e6d2bd"], [0.5, "#f5e7d6"], [0.56, "#f3e1cc"], [1, "#e2c9b0"]]) gr.addColorStop(p, c); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: null }),
    fog: [0xead6c1, 80, 620],
    light: { hemi: [0xfff1e2, 0xa08670, 1.1], sun: 2.6, exposure: 0.95, bloom: [0.96, 0.22] },
    people, heightAt: mainHeightAt, walkable: mainWalkable,
    enter(room) {
      HUB_ROOM = room;
      const c = room.char, ctl = room.controls, cam = room.camera;
      if (!c) return;
      if (intro) finish(room);                                           // entered again mid-arrival: put the last one right first
      const trueScale = c.root.scale.x > 0.05 ? c.root.scale.x : (c.root.userData.trueScale || 1);   // never remember the shrunken size
      c.root.userData.trueScale = trueScale;
      intro = { t: 0, start: performance.now(), skipTo: 0, flying: !introSeen, scale: trueScale, maxDist: ctl.maxDistance, el: overlay() };
      introSeen = true;
      try { localStorage.setItem("mainHubIntroSeen", "1"); } catch { /* ignore */ }
      intro.skip = () => { if (intro?.flying) intro.skipTo = Math.max(intro.skipTo, (performance.now() - intro.start) / 1000, intro.fly); };
      intro.fly = intro.flying ? FLY[FLY.length - 1][3] : 0;
      intro.el.querySelector(".mh-skip").addEventListener("click", intro.skip);
      if (!intro.flying) intro.el.querySelector(".mh-skip").hidden = true;
      window.addEventListener("keydown", intro.skip, true);
      c.root.scale.setScalar(0.001);
      ctl.enabled = false; ctl.maxDistance = 400;
      if (intro.flying) {
        try { room.renderer?.compile(room.scene, cam); } catch (e) { console.warn(e); }   // every shader built now, so the reveal doesn't stutter
        intro.cosmos = buildCosmos(); room.scene.add(intro.cosmos.group);
        intro.clouds = goldenClouds(); room.scene.add(intro.clouds);
        intro.layers = cam.layers.mask; cam.layers.set(COSMOS);
        const b = room.bloom;
        if (b) { intro.bloom = { threshold: b.threshold, strength: b.strength, radius: b.radius }; Object.assign(b, { threshold: 0.88, strength: 0.45, radius: 0.45 }); }
        intro.polar = [ctl.minPolarAngle, ctl.maxPolarAngle]; ctl.minPolarAngle = 0.02; ctl.maxPolarAngle = Math.PI - 0.02;   // free to look straight down the beam
        intro.fov = cam.fov;
      }
      intro.start = performance.now();
    },
    leave(room) { finish(room); HUB_ROOM = null; },
    /** a real person stepping in (from the network): the beacon lights up for them */
    arrive(name, room) { BEAM.flare(1, tintFor(name)); room?.onBeaconArrival?.(name); },
    tick(dt, t, room) { HUB_ROOM = room; step(dt, t, room); BEACON_CAM.update?.(room.camera); },   // the lens flare follows wherever the camera ended up
  };
}
export { Kit, canvasTex, mats as mainMats, FX as MAIN_FX };
