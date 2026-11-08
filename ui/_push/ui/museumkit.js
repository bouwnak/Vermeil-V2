// museumkit.js - what every Museum piece is built with: small geometry helpers (rods, nested frames, bent boxes, lathes), the shared materials,
// a few textures that aren't pictures (gravel, sand, gold foil, moon dust), velvet ropes on brass posts, ferns, and the low daises the big
// skeletons stand on. The pieces themselves are in museumbones.js, museumexhibits.js and museumhub.js.
import * as THREE from "three";
import { canvasTex } from "./mainhub.js";
import { seeded, plaqueTex, skylightTex } from "./museumart.js";

export const TAU = Math.PI * 2;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export { seeded };

/** a catalog entry: hubOnly floor pieces, built into a group */
export const P = (label, make, extra = {}) => ({ label, mount: "floor", hubOnly: true, category: "hub", ...extra,
  build(ctx) { const group = new THREE.Group(); const ex = make(group, ctx.spec, ctx) || {}; return { group, walkable: !!(extra.flat && extra.walk), ...ex }; } });
export const noRay = () => {};
export const passThrough = (g) => { g.traverse((o) => { if (o.isMesh) o.raycast = noRay; }); return g; };
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
export const glowMat = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.6 });
export const shared = (m, noShadow = false) => { m.userData.shared = true; if (noShadow) m.userData.noShadow = true; return m; };

// ---------------------------------------------------------------- the clock and everything that moves
export const LIVE = { walls: [], ceil: null, swing: [], spin: [], pend: [] };

// ---------------------------------------------------------------- geometry
const mtx = (p) => new THREE.Matrix4().compose(V(p.x || 0, p.y || 0, p.z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0, p.order || "XYZ")),
  V(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1));
/** a moved, turned, scaled place inside a Kit (or inside another frame): everything added here is put there */
export function frame(K, o = {}) {
  const B = mtx(o);
  const F = {
    add(geo, mat, p) { if (p) geo.applyMatrix4(mtx(p)); geo.applyMatrix4(B); return K.add(geo, mat); },
    box(w, h, d, mat, p) { return F.add(new THREE.BoxGeometry(w, h, d), mat, p); },
    cyl(r0, r1, h, mat, p, n = 12, open = false) { return F.add(new THREE.CylinderGeometry(r0, r1, h, n, 1, open), mat, p); },
    ball(r, mat, p, d = 1) { return F.add(new THREE.IcosahedronGeometry(r, d), mat, p); },
    sub(p) { return frame(F, p); },
  };
  return F;
}
/** triangles from a flat list of positions, with the uv every Kit part needs */
export function triGeo(pos) {
  const g = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals(); return g;
}
/** a tapered rod from a to b (r0 at a, r1 at b) */
export function rod(K, a, b, r0, mat, n = 6, r1 = r0) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  if (len < 1e-5) return null;
  const geo = new THREE.CylinderGeometry(r1, r0, len, n, 1, false);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return K.add(geo, mat);
}
export const sagLine = (a, b, sag, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0)); });
/** bend every vertex with fn(v) */
export function shaped(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
}
/** a plane whose texture repeats by size: u0, v0 where it starts, uw, vh how many tiles across and up */
export function quad(w, h, u0 = 0, v0 = 0, uw = 1, vh = 1) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * uw, v0 + uv.getY(i) * vh);
  return g;
}
/** turned shape: pts [[radius, y], ...] bottom to top */
export const lathe = (pts, n = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), n);
/** a curve through points, as a tube */
export const tube = (pts, r, seg = 12, rad = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false);
/** the wavy, slightly lumpy ball rocks are made of */
export function blob(r, seed, detail = 2, k = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, q = seeded(seed);
  const a = q() * 9, b = q() * 9, c = q() * 9;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = Math.sin(x * 2.1 / r + a) * Math.cos(z * 1.7 / r - b) + 0.5 * Math.sin(y * 3.3 / r + c); const f = 1 + k * s; p.setXYZ(i, x * f, y * f, z * f); }
  g.computeVertexNormals(); return g;
}
/** piecewise-linear lookup: keys [[t, value], ...] sorted by t */
export function curveOf(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a] = keys[i - 1], [t1, b] = keys[i]; return lerp(a, b, (t - t0) / (t1 - t0)); }
    return keys[keys.length - 1][1];
  };
}

// ---------------------------------------------------------------- textures that aren't pictures
const T = {};
const once = (k, make) => (T[k] ??= make());
export const gravelTex = () => once("gravel", () => canvasTex(256, 256, (g, w, h) => {
  const r = seeded(41); g.fillStyle = "#6d675c"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { const s = 2 + r() * 6; g.fillStyle = `hsl(${30 + r() * 20},${6 + r() * 10}%,${30 + r() * 38}%)`; g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.6 + r() * 0.4), r() * 3, 0, TAU); g.fill(); }
}, { repeat: [3, 3] }));
export const sandTex = () => once("sand", () => canvasTex(256, 256, (g, w, h) => {
  const r = seeded(43); g.fillStyle = "#c9ab78"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,240,210,.18)" : "rgba(90,60,30,.14)"; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  g.strokeStyle = "rgba(110,80,40,.12)"; g.lineWidth = 2; for (let y = 8; y < h; y += 14) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 3); g.stroke(); }
}, { repeat: [2, 2] }));
export const foilTex = () => once("foil", () => canvasTex(256, 256, (g, w, h) => {
  const r = seeded(47); g.fillStyle = "#c9962e"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, s = 8 + r() * 26; g.fillStyle = r() < 0.5 ? `rgba(255,226,140,${0.2 + r() * 0.4})` : `rgba(90,50,10,${0.15 + r() * 0.3})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + (r() - 0.5) * s); g.lineTo(x + (r() - 0.5) * s, y + s); g.fill(); }
}, { repeat: [2, 1] }));
export const moonTex = () => once("moon", () => canvasTex(512, 512, (g, w, h) => {
  const r = seeded(53); g.fillStyle = "#8e8c88"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.12)"; g.fillRect(r() * w, r() * h, 2, 2); }
  for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, s = 6 + r() * 30; g.strokeStyle = "rgba(60,58,55,.5)"; g.lineWidth = 3; g.beginPath(); g.arc(x, y, s, 0, TAU); g.stroke(); g.fillStyle = "rgba(40,40,40,.18)"; g.beginPath(); g.arc(x + 2, y + 2, s * 0.8, 0, TAU); g.fill(); }
  g.fillStyle = "rgba(50,48,46,.7)";                                         // boot prints
  for (let i = 0; i < 14; i++) { const x = 140 + i * 18, y = 300 + Math.sin(i) * 20 + (i % 2) * 14; g.save(); g.translate(x, y); g.rotate(0.3); g.fillRect(-4, -9, 8, 18); for (let k = -8; k < 9; k += 4) g.fillRect(-5, k, 10, 1.5); g.restore(); }
}));
export const keyTex = () => once("key", () => canvasTex(512, 64, (g, w, h) => {        // a meander frieze, 2 m a repeat
  g.fillStyle = "#e6dccb"; g.fillRect(0, 0, w, h); g.strokeStyle = "#b8935a"; g.lineWidth = 6; g.lineCap = "square";
  g.beginPath(); g.moveTo(0, 6); g.lineTo(w, 6); g.moveTo(0, h - 6); g.lineTo(w, h - 6); g.stroke();
  for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 6, h - 14); g.lineTo(x + 6, 14); g.lineTo(x + 46, 14); g.lineTo(x + 46, 40); g.lineTo(x + 24, 40); g.lineTo(x + 24, 28); g.stroke(); g.beginPath(); g.moveTo(x + 34, h - 14); g.lineTo(x + 60, h - 14); g.stroke(); }
}));

// ---------------------------------------------------------------- the shared materials
let _M = null;
export function MM() {
  if (_M) return _M;
  const s = (c, o) => shared(std(c, o)), DS = THREE.DoubleSide;
  _M = {
    bone: s("#e0d2b3", { roughness: 0.85 }), boneDark: s("#b39f78", { roughness: 0.9 }), tooth: s("#f2ead6", { roughness: 0.45 }), claw: s("#5e4e3a", { roughness: 0.6 }),
    horn: s("#c9b58c", { roughness: 0.8 }), crest: s("#cdb68c", { roughness: 0.85, side: DS }), socket: s("#2a221a", { roughness: 1 }),
    steel: s("#2a2d33", { roughness: 0.4, metalness: 0.75 }), brass: s("#c8a046", { roughness: 0.32, metalness: 0.85 }), gold: s("#e2b84a", { roughness: 0.22, metalness: 0.95 }),
    frameGold: s("#b5862c", { roughness: 0.38, metalness: 0.8 }), silver: s("#c9ccd2", { roughness: 0.25, metalness: 0.95 }),
    ebony: s("#1c1610", { roughness: 0.45 }), black: s("#151515", { roughness: 0.6 }), white: s("#f3efe6", { roughness: 0.6 }), cream: s("#efe5cf"), paper: s("#efe3c4", { roughness: 0.95 }),
    plinth: s("#34322f", { roughness: 0.65 }), plinthLight: s("#5b5750", { roughness: 0.8 }), stone: s("#7d7a72", { roughness: 0.95 }), basalt: s("#57534d", { roughness: 0.95 }),
    sandstone: s("#c4ab82", { roughness: 0.95 }), limestone: s("#d9d0bd", { roughness: 0.9 }), marble: s("#ece6da", { roughness: 0.28 }), marbleDark: s("#26302c", { roughness: 0.3 }),
    rope: s("#8c1526", { roughness: 0.95 }), velvet: s("#6e1420", { roughness: 1 }), velvetBlue: s("#1c2c5a", { roughness: 1 }), felt: s("#2d4a32", { roughness: 1 }),
    wood: s("#6e4527", { roughness: 0.7 }), darkWood: s("#3b2415", { roughness: 0.55 }), lightWood: s("#b88a58", { roughness: 0.7 }), oak: s("#8b6236", { roughness: 0.75 }), raw: s("#9c7a52", { roughness: 0.95 }),
    glass: shared(new THREE.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.15, roughness: 0.04, metalness: 0.2, depthWrite: false }), true),
    snowGlass: shared(new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }), true),
    fern: s("#3f6d2c", { side: DS, roughness: 0.8 }), fern2: s("#2b5222", { side: DS, roughness: 0.8 }), moss: s("#4c6a34", { roughness: 1 }),
    membrane: shared(std("#c69c72", { transparent: true, opacity: 0.55, side: DS, depthWrite: false, roughness: 0.9 }), true),
    wire: s("#1d1d1d", { roughness: 0.4, metalness: 0.6 }), iron: s("#34312d", { roughness: 0.55, metalness: 0.6 }), rail: s("#6b6e73", { roughness: 0.3, metalness: 0.9 }),
    terracotta: s("#b4623a", { roughness: 0.9 }), terraDark: s("#7a3a1e", { roughness: 0.9 }), clay: s("#a8825a", { roughness: 0.95 }),
    bronze: s("#8a6a36", { roughness: 0.38, metalness: 0.75 }), verdigris: s("#4f8a76", { roughness: 0.7, metalness: 0.3 }), jade: s("#3e8b6c", { roughness: 0.22 }),
    ruby: s("#c01a30", { roughness: 0.1, metalness: 0.2 }), lapis: s("#22408c", { roughness: 0.2 }),
    red: s("#a43226"), blue: s("#1f4b8a"), green: s("#24513a"), mustard: s("#d2a13a"), pink: s("#e58fb4"), teal: s("#2b8a8a"), purple: s("#6a4a9a"), orange: s("#e07a3a"),
    canvas: s("#efe6cf", { side: DS, roughness: 0.95 }), sail: s("#f3ead2", { side: DS, roughness: 0.95 }), engine: s("#244a36", { roughness: 0.4, metalness: 0.35 }), engineRed: s("#8a1e1e", { roughness: 0.4, metalness: 0.3 }),
    whiteMetal: s("#d8d8d4", { roughness: 0.45, metalness: 0.4 }), darkGlass: s("#141c26", { roughness: 0.1, metalness: 0.5 }),
    lamp: shared(glowMat("#fff0cf", 2.4), true), lampSoft: shared(glowMat("#ffe6b8", 1.1), true), lampBlue: shared(glowMat("#cfe8ff", 1.6), true), ember: shared(glowMat("#ff8a3a", 1.4), true),
    ceilBeam: s("#f1ebdf", { roughness: 0.8 }), ceilPanel: s("#e7dfcf", { roughness: 0.9 }), ceilTrim: s("#d8cdb8", { roughness: 0.8 }), rosette: s("#c9a24a", { roughness: 0.4, metalness: 0.6 }),
    gravel: shared(std("#ffffff", { map: gravelTex(), roughness: 1 })), sand: shared(std("#ffffff", { map: sandTex(), roughness: 1 })),
    foil: shared(std("#ffffff", { map: foilTex(), roughness: 0.3, metalness: 0.9 })), moon: shared(std("#ffffff", { map: moonTex(), roughness: 1 })),
    key: shared(std("#ffffff", { map: keyTex(), roughness: 0.8 }), true),
    skylight: shared(new THREE.MeshBasicMaterial({ map: skylightTex(), color: 0xf4f9ff }), true),
  };
  return _M;
}
/** textured materials made once and kept (shared: never thrown away when you leave) */
const SH = new Map();
export const sharedMat = (k, make) => { if (!SH.has(k)) SH.set(k, shared(make())); return SH.get(k); };
/** where builders get their materials from: SHARED normally; a wall that fades gets its own copies */
// M.name gives a material, M.tex(key, make) a textured one made once. Walls that fade when the camera is behind them get their own
// copies (ownMaterials), so fading one wall leaves the rest alone. Copies stay marked shared: their pictures are cached and must survive.
const proxy = (m, tex, all) => new Proxy({}, { get: (_, n) => {
  if (typeof n !== "string") return undefined;
  if (n === "tex") return tex; if (n === "all") return all;
  if (!MM()[n]) throw new Error("[museum] no material called " + n);
  return m(n);
} });
export const SHARED_M = proxy((n) => MM()[n], sharedMat, () => []);
export function ownMaterials() {
  const local = new Map();
  const got = (k, make) => { if (!local.has(k)) { const m = make(); m.userData.shared = true; local.set(k, m); } return local.get(k); };
  return proxy((n) => got("m:" + n, () => MM()[n].clone()), got, () => [...local.values()]);
}
export const signMat = (map, k = 0.35) => { const m = std("#ffffff", { map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: k, roughness: 0.6 }); m.userData.noShadow = true; return m; };

// ---------------------------------------------------------------- velvet ropes, ferns, daises
/** brass posts with red rope sagging between them along a closed or open line of points */
export function ropeLine(F, M, pts, closed = false, step = 2.2) {
  const corners = closed ? [...pts, pts[0]] : pts, posts = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = V(corners[i][0], 0, corners[i][1]), b = V(corners[i + 1][0], 0, corners[i + 1][1]), n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let k = 0; k < n; k++) posts.push(new THREE.Vector3().lerpVectors(a, b, k / n));
  }
  if (!closed) posts.push(V(pts[pts.length - 1][0], 0, pts[pts.length - 1][1]));
  for (const p of posts) {
    F.cyl(0.13, 0.15, 0.04, M.brass, { x: p.x, y: 0.02, z: p.z }, 16);
    F.cyl(0.022, 0.028, 0.9, M.brass, { x: p.x, y: 0.47, z: p.z }, 8);
    F.ball(0.045, M.brass, { x: p.x, y: 0.94, z: p.z }, 1);
    F.add(new THREE.TorusGeometry(0.035, 0.008, 4, 10), M.brass, { x: p.x, y: 0.86, z: p.z, rx: Math.PI / 2 });
  }
  const ring = closed ? [...posts, posts[0]] : posts;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i].clone().setY(0.86), b = ring[i + 1].clone().setY(0.86), line = sagLine(a, b, 0.11, 8);
    F.add(tube(line, 0.022, 10, 5), M.rope);
  }
}
/** a clump of fern fronds, each a stem with little leaves both sides */
export function fern(F, M, x, y, z, s = 1, seed = 1) {
  const r = seeded(seed), pos = [], pos2 = [];
  const n = 7 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + r() * 0.5, L = s * (0.45 + r() * 0.25), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
    const at = (u) => V(x, y, z).addScaledVector(dir, u * L).add(V(0, Math.sin(u * Math.PI * 0.85) * 0.32 * s - u * u * 0.1 * s, 0));
    const out = k % 2 ? pos : pos2;
    for (let i = 0; i < 9; i++) {
      const u0 = i / 9, u1 = (i + 1) / 9, p0 = at(u0), p1 = at(u1), lw = 0.09 * s * (1 - u0 * 0.8);
      for (const sd of [-1, 1]) { const tip = p0.clone().lerp(p1, 0.5).addScaledVector(side, sd * lw).add(V(0, -0.02 * s, 0)); out.push(p0.x, p0.y, p0.z, tip.x, tip.y, tip.z, p1.x, p1.y, p1.z); }
    }
  }
  F.add(triGeo(pos), M.fern); F.add(triGeo(pos2), M.fern2);
}
/** a low stone dais with gravel on top, a brass edge, an angled plaque at the front and ropes round it. Returns the top's height. */
export function dais(F, M, w, d, plaque, o = {}) {
  const out = o.out ?? 0.45;
  F.box(w, 0.28, d, M.plinth, { y: 0.14 });
  F.box(w + 0.08, 0.05, d + 0.08, M.plinthLight, { y: 0.025 });
  F.box(w - 0.1, 0.06, d - 0.1, M.gravel, { y: 0.31 });
  for (const [x, z, sw, sd] of [[0, d / 2, w, 0.03], [0, -d / 2, w, 0.03], [w / 2, 0, 0.03, d], [-w / 2, 0, 0.03, d]]) F.box(sw + 0.02, 0.04, sd + 0.02, M.brass, { x, y: 0.3, z });
  for (const [x, z] of [[-w / 2 + 0.45, -d / 2 + 0.45], [w / 2 - 0.45, -d / 2 + 0.45], [-w / 2 + 0.45, d / 2 - 0.45], [w / 2 - 0.45, d / 2 - 0.45]]) fern(F, M, x, 0.34, z, 0.9, Math.round(x * 13 + z * 7));
  for (const [x, z, s] of o.rocks || []) F.add(blob(s, Math.round(x * 31 + z), 1, 0.3), M.stone, { x, y: 0.34, z, sy: 0.6 });
  if (plaque) {
    const pm = sharedMat("plaque:" + plaque[0], () => std("#ffffff", { map: plaqueTex(...plaque), roughness: 0.5, metalness: 0.2 }));
    const sd = o.side ?? 1, PF = sd < 0 ? F.sub({ ry: Math.PI }) : F, px = (o.plaqueX ?? 0) * sd;
    PF.box(0.16, 0.42, 0.16, M.plinthLight, { x: px, y: 0.21, z: d / 2 + 0.14 });
    PF.box(0.98, 0.5, 0.12, M.plinthLight, { x: px, y: 0.5, z: d / 2 + 0.04, rx: -0.55 });
    PF.add(new THREE.PlaneGeometry(0.9, 0.56), pm, { x: px, y: 0.52, z: d / 2 + 0.105, rx: -0.55 });
  }
  if (o.ropes !== false) ropeLine(F, M, [[-w / 2 - out, -d / 2 - out], [w / 2 + out, -d / 2 - out], [w / 2 + out, d / 2 + out], [-w / 2 - out, d / 2 + out]], true);
  return 0.34;
}
/** small brass picture-lamp: an arm out from the wall and a hood, lit underneath. x, y, z where the hood is, facing +z */
export function pictureLamp(F, M, x, y, z, w = 0.5) {
  rod(F, V(x, y - 0.12, 0.01), V(x, y, z), 0.012, M.brass, 5);
  F.cyl(0.035, 0.045, w, M.brass, { x, y, z, rz: Math.PI / 2 }, 10);
  F.box(w * 0.92, 0.012, 0.03, M.lamp, { x, y: y - 0.04, z });
}
