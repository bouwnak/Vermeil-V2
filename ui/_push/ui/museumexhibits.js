// museumexhibits.js - Everything in the Museum that isn't a dinosaur or a wall: paintings in gold frames (also hung by the walls),
// the painter's easel; the Artifacts wing (a painted coffin under glass, vitrines, long cases, a colossal stone head, a carved stele,
// amphorae); the History wing (timeline, globe, ship in a case, a moon lander on its diorama, a biplane overhead, a printing press, a
// little steam engine); the nave's pendulum, banners and signs; the lobby (columns, desk, shop, floor medallion, welcome board).
import * as THREE from "three";
import { Kit, canvasTex } from "./mainhub.js";
import { paintingTex, ART_TITLES, labelTex, posterTex, plaqueTex, timelineTex, roseTex, medallionTex, globeTex, coffinTex, glyphTex, sketchTex, bannerTex, signTex, PALETTES } from "./museumart.js";
import { V, TAU, P, frame, rod, tube, shaped, blob, lathe, MM, SHARED_M, std, ropeLine, LIVE, triGeo, lerp, curveOf, pictureLamp, signMat, passThrough, seeded, quad } from "./museumkit.js";

const pos = (p) => ({ x: p.x, y: p.y, z: p.z });
const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
/** a grid surface: fn(u, v, out) puts the point for u, v in 0..1; uv(u, v) gives the texture coordinate */
function grid(nu, nv, fn, uvf = (u, v) => [u, v]) {
  const p = [], uv = [], idx = [], q = V();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, q); p.push(q.x, q.y, q.z); uv.push(...uvf(i / nu, j / nv)); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** an open glass box (four sides and a lid) with brass edges, from y0 up h */
function glassCase(F, M, w, d, y0, h) {
  const y = y0 + h / 2;
  for (const [x, z, ry, pw] of [[0, d / 2, 0, w], [0, -d / 2, Math.PI, w], [w / 2, 0, Math.PI / 2, d], [-w / 2, 0, -Math.PI / 2, d]]) F.add(new THREE.PlaneGeometry(pw, h), M.glass, { x, y, z, ry });
  F.add(new THREE.PlaneGeometry(w, d), M.glass, { y: y0 + h, rx: -Math.PI / 2 });
  const c = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (let i = 0; i < 4; i++) {
    const [x, z] = c[i], [x2, z2] = c[(i + 1) % 4];
    rod(F, V(x, y0, z), V(x, y0 + h, z), 0.014, M.brass, 5); rod(F, V(x, y0 + h, z), V(x2, y0 + h, z2), 0.012, M.brass, 5); rod(F, V(x, y0 + 0.01, z), V(x2, y0 + 0.01, z2), 0.012, M.brass, 5);
  }
}
const label = (F, M, title, sub, o) => F.add(new THREE.PlaneGeometry(o.w ?? 0.34, (o.w ?? 0.34) / 2), M.tex("lab:" + title + sub, () => std("#ffffff", { map: labelTex(title, sub), roughness: 0.6 })), o);

// ---------------------------------------------------------------- things that hang on walls (walls hang them too, with their own materials)
/** a painting in an ornate gold frame, with its little card and a brass picture lamp. Faces +z from a wall at z 0. */
export function artPiece(F, M, o) {
  const w = o.w ?? 2.4, h = o.h ?? 1.7, k = o.k ?? 0, n = o.n ?? 1, cy = o.cy ?? 2.4, title = o.title ?? ART_TITLES[k % ART_TITLES.length], asp = w / h;
  const pm = M.tex(`paint:${k}:${n}:${asp.toFixed(2)}`, () => std("#ffffff", { map: paintingTex(k, n, asp), roughness: 0.85 }));
  const fw = 0.12 + 0.035 * Math.min(w, h), d = 0.09, z0 = 0.02;
  F.box(w + fw * 2 + 0.04, h + fw * 2 + 0.04, 0.02, M.darkWood, { y: cy, z: z0 + 0.01 });
  for (const [x, y, bw, bh] of [[0, cy + h / 2 + fw / 2, w + fw * 2, fw], [0, cy - h / 2 - fw / 2, w + fw * 2, fw], [-w / 2 - fw / 2, cy, fw, h], [w / 2 + fw / 2, cy, fw, h]]) F.box(bw, bh, d, M.frameGold, { x, y, z: z0 + d / 2 });
  const loop = (hw, hh, z, r, mat) => { const c = [V(-hw, cy - hh, z), V(hw, cy - hh, z), V(hw, cy + hh, z), V(-hw, cy + hh, z)]; for (let i = 0; i < 4; i++) rod(F, c[i], c[(i + 1) % 4], r, mat, 6); for (const p of c) F.ball(r * 1.3, mat, pos(p), 1); };
  loop(w / 2 + fw, h / 2 + fw, z0 + d, 0.028, M.gold);
  loop(w / 2 + fw * 0.45, h / 2 + fw * 0.45, z0 + d + 0.012, 0.016, M.gold);
  loop(w / 2 + 0.012, h / 2 + 0.012, z0 + d - 0.015, 0.014, M.ebony);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) F.ball(fw * 0.42, M.gold, { x: sx * (w / 2 + fw / 2), y: cy + sy * (h / 2 + fw / 2), z: z0 + d + 0.01, sz: 0.4 }, 1);
  F.ball(fw * 0.55, M.gold, { y: cy + h / 2 + fw * 0.85, z: z0 + d + 0.01, sx: 2.2, sz: 0.4 }, 1);
  for (const s of [-1, 1]) F.add(new THREE.TorusGeometry(fw * 0.28, 0.014, 4, 10, Math.PI * 1.4), M.gold, { x: s * fw * 0.9, y: cy + h / 2 + fw * 0.95, z: z0 + d + 0.01, rz: s > 0 ? -0.3 : Math.PI + 0.3 });
  F.add(new THREE.PlaneGeometry(w, h), pm, { y: cy, z: z0 + d - 0.03 });
  if (o.card !== false) label(F, M, title, o.sub ?? "Oil on canvas", { x: w / 2 + fw + 0.32, y: 1.45, z: 0.012, w: 0.32 });
  pictureLamp(F, M, 0, cy + h / 2 + fw + 0.17, 0.36, Math.min(1.4, w * 0.55));
}
export function posterPiece(F, M, o) {
  const w = o.w ?? 1.2, h = w * (704 / 512), cy = o.cy ?? 2.1;
  const pm = M.tex("poster:" + o.title, () => std("#ffffff", { map: posterTex(o.title, o.sub ?? "", o.col ?? ["#7a1d24", "#2a0e10"], o.icon ?? "star"), roughness: 0.7 }));
  F.box(w + 0.1, h + 0.1, 0.04, M.ebony, { y: cy, z: 0.02 });
  F.add(new THREE.PlaneGeometry(w, h), pm, { y: cy, z: 0.042 });
  F.add(new THREE.PlaneGeometry(w, h), M.glass, { y: cy, z: 0.05 });
}
export function plaquePiece(F, M, o) {
  const w = o.w ?? 1.1, h = w * 0.625, cy = o.cy ?? 1.6;
  const pm = M.tex("plaque:" + o.title, () => std("#ffffff", { map: plaqueTex(o.title, o.sub ?? "", o.body ?? ""), roughness: 0.5, metalness: 0.2 }));
  F.box(w + 0.08, h + 0.08, 0.04, M.darkWood, { y: cy, z: 0.02 });
  F.add(new THREE.PlaneGeometry(w, h), pm, { y: cy, z: 0.042 });
}
export function timelinePiece(F, M, o) {
  const w = o.w ?? 11.8, h = (w * 420) / 2048, cy = o.cy ?? 2.55;
  const tm = M.tex("timeline", () => std("#ffffff", { map: timelineTex(), roughness: 0.7, emissive: "#ffffff", emissiveMap: timelineTex(), emissiveIntensity: 0.12 }));
  F.box(w + 0.16, h + 0.16, 0.05, M.darkWood, { y: cy, z: 0.025 });
  F.add(new THREE.PlaneGeometry(w, h), tm, { y: cy, z: 0.052 });
  F.box(w, 0.04, 0.06, M.brass, { y: cy - h / 2 - 0.16, z: 0.06 });
  for (let i = 0; i < 6; i++) pictureLamp(F, M, -w / 2 + ((i + 0.5) * w) / 6, cy + h / 2 + 0.24, 0.4, 1.4);
}
const HANG = { art: artPiece, poster: posterPiece, plaque: plaquePiece, timeline: timelinePiece };
export const hangPiece = (F, M, o) => (HANG[o.kind || "art"] || artPiece)(F, M, o);

// ---------------------------------------------------------------- the art room
function easel(F, M) {
  rod(F, V(-0.42, 0, 0.3), V(-0.06, 2.0, 0.02), 0.03, M.lightWood, 6); rod(F, V(0.42, 0, 0.3), V(0.06, 2.0, 0.02), 0.03, M.lightWood, 6); rod(F, V(0, 0, -0.55), V(0, 1.9, -0.02), 0.028, M.lightWood, 6);
  F.box(0.95, 0.05, 0.1, M.lightWood, { y: 0.92, z: 0.2 });
  F.box(0.9, 1.15, 0.03, M.canvas, { y: 1.55, z: 0.15, rx: -0.12 });
  F.add(new THREE.PlaneGeometry(0.84, 1.05), M.tex("sketch", () => std("#ffffff", { map: sketchTex(), roughness: 0.95 })), { y: 1.55, z: 0.168, rx: -0.12 });
  const S = F.sub({ x: 0.85, z: 0.55 });
  S.cyl(0.2, 0.2, 0.05, M.lightWood, { y: 0.62 }, 16); for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rod(S, V(Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12), V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), 0.016, M.lightWood, 5); }
  S.cyl(0.17, 0.17, 0.012, M.lightWood, { y: 0.655, x: 0.02, sz: 0.75 }, 18);
  ["red", "blue", "mustard", "green", "white", "pink"].forEach((c, i) => { const a = (i / 6) * TAU; S.ball(0.025, M[c], { x: 0.02 + Math.cos(a) * 0.11, y: 0.665, z: Math.sin(a) * 0.08, sy: 0.4 }, 1); });
  F.cyl(0.05, 0.045, 0.14, M.glass, { x: -0.7, y: 0.07, z: 0.5 }, 10);
  for (let i = 0; i < 5; i++) rod(F, V(-0.7 + (i - 2) * 0.012, 0.03, 0.5), V(-0.7 + (i - 2) * 0.03, 0.34, 0.5 + (i % 2) * 0.02), 0.006, M.lightWood, 4);
  F.add(shaped(new THREE.BoxGeometry(0.6, 0.02, 0.4, 6, 1, 4), (v) => { v.y += Math.sin(v.x * 9) * 0.03 + Math.cos(v.z * 11) * 0.02; }), M.canvas, { x: -0.3, y: 0.03, z: 0.6, ry: 0.4 });
}

// ---------------------------------------------------------------- the artifacts wing
const coffinW = curveOf([[0, 0.17], [0.1, 0.19], [0.55, 0.25], [0.72, 0.3], [0.8, 0.27], [0.86, 0.23], [0.95, 0.2], [1, 0.03]]);
const coffinTop = (u, s) => 0.38 + 0.07 * (1 - s * s) + 0.05 * bell(u, 0.9, 0.07) + 0.03 * bell(u, 0.06, 0.06);
function sarcophagus(F, M) {
  F.box(2.7, 0.75, 1.3, M.plinth, { y: 0.375 }); F.box(2.78, 0.05, 1.38, M.brass, { y: 0.77 }); F.box(2.76, 0.08, 1.36, M.black, { y: 0.04 });
  const C = F.sub({ y: 0.8 }), L = 2.0;
  const lid = M.tex("coffin", () => std("#ffffff", { map: coffinTex(), roughness: 0.45, metalness: 0.25 }));
  C.add(grid(24, 8, (u, v, q) => { const s = v * 2 - 1; q.set((u - 0.5) * L, coffinTop(u, s), s * coffinW(u)); }, (u, v) => [v, u]), lid);
  for (const k of [-1, 1]) C.add(grid(24, 2, (u, v, q) => q.set((u - 0.5) * L, v * coffinTop(u, k), k * coffinW(u)), (u, v) => [u * 4, v]), M.foil);
  C.box(0.05, 0.4, 0.34, M.foil, { x: -L / 2 + 0.01, y: 0.2 });
  C.box(2.2, 0.06, 0.66, M.darkWood, { y: 0.03 });
  for (let i = 0; i < 4; i++) { const x = -1.15 + i * 0.13 + (i > 1 ? 2.05 : 0) - 0.55; C.add(lathe([[0.001, 0], [0.05, 0.01], [0.065, 0.1], [0.05, 0.19], [0.035, 0.2], [0.04, 0.22], [0.001, 0.26]], 12), [M.limestone, M.sandstone, M.limestone, M.clay][i], { x, z: (i % 2 ? 0.45 : -0.45) }); }
  glassCase(F, M, 2.6, 1.2, 0.8, 1.0);
  F.box(2.4, 0.02, 0.04, M.lampSoft, { y: 1.78, z: 0 });
  label(F, M, "Painted coffin", "Cedar, gold leaf · c. 1300 BCE", { y: 0.55, z: 0.652, w: 0.5 });
}
function vitrine(F, M, k) {
  F.box(0.8, 0.95, 0.8, M.darkWood, { y: 0.475 }); F.box(0.84, 0.04, 0.84, M.brass, { y: 0.95 }); F.box(0.84, 0.08, 0.84, M.black, { y: 0.04 });
  for (const [x, z, ry] of [[0, 0.401, 0], [0, -0.401, Math.PI], [0.401, 0, Math.PI / 2], [-0.401, 0, -Math.PI / 2]]) F.box(0.6, 0.6, 0.01, M.wood, { x, y: 0.5, z, ry });
  F.box(0.56, 0.04, 0.56, M.velvetBlue, { y: 0.99 });
  const O = F.sub({ y: 1.01 });
  const names = [["Funerary mask", "Beaten gold · 1400 BCE"], ["Jade vessel", "Carved jade · 200 BCE"], ["Bronze helmet", "Bronze · 600 BCE"], ["Collar of beads", "Gold, carnelian, lapis"], ["Hoard of coins", "Silver and gold · 300 CE"], ["Clay figure", "Fired clay · 3000 BCE"]][k % 6];
  if (k % 6 === 0) {
    rod(O, V(0, 0, 0), V(0, 0.18, 0), 0.02, M.brass, 6);
    O.add(new THREE.SphereGeometry(0.15, 18, 12, -Math.PI / 2, Math.PI), M.gold, { y: 0.32, sz: 0.55, sy: 1.25 });
    for (const s of [-1, 1]) { O.ball(0.025, M.lapis, { x: s * 0.05, y: 0.36, z: 0.075, sy: 0.5 }, 1); O.box(0.06, 0.3, 0.03, M.lapis, { x: s * 0.13, y: 0.26, z: 0.01 }); }
    O.box(0.03, 0.06, 0.03, M.gold, { y: 0.31, z: 0.085 }); O.box(0.05, 0.012, 0.02, M.ruby, { y: 0.26, z: 0.082 });
    for (let i = 0; i < 6; i++) O.box(0.3, 0.014, 0.02, i % 2 ? M.lapis : M.gold, { y: 0.14 + i * 0.016, z: 0.04 });
  } else if (k % 6 === 1) {
    O.add(lathe([[0.001, 0], [0.09, 0.005], [0.12, 0.08], [0.15, 0.2], [0.1, 0.3], [0.07, 0.34], [0.09, 0.36], [0.001, 0.36]], 20), M.jade, { y: 0.02 });
    for (const s of [-1, 1]) O.add(new THREE.TorusGeometry(0.04, 0.012, 6, 12), M.jade, { x: s * 0.15, y: 0.25, ry: Math.PI / 2 });
  } else if (k % 6 === 2) {
    rod(O, V(0, 0, 0), V(0, 0.16, 0), 0.02, M.brass, 6);
    O.add(new THREE.SphereGeometry(0.14, 18, 10, 0, TAU, 0, Math.PI / 2), M.bronze, { y: 0.24 });
    for (const s of [-1, 1]) O.box(0.02, 0.16, 0.1, M.bronze, { x: s * 0.13, y: 0.18, z: 0.03 });
    O.box(0.025, 0.12, 0.02, M.bronze, { y: 0.2, z: 0.14 }); O.box(0.03, 0.08, 0.3, M.verdigris, { y: 0.4 });
  } else if (k % 6 === 3) {
    O.add(new THREE.ConeGeometry(0.14, 0.4, 16), M.velvet, { y: 0.2 });
    for (let i = 0; i < 26; i++) { const a = Math.PI * 0.15 + (i / 25) * Math.PI * 0.7, rr = 0.14; O.ball(0.018, [M.gold, M.ruby, M.gold, M.lapis][i % 4], { x: Math.cos(a) * rr, y: 0.26 - Math.sin(a) * 0.1, z: Math.sin(a) * rr * 0.9 }, 1); }
  } else if (k % 6 === 4) {
    for (let i = 0; i < 18; i++) { const r = seeded(i + 3); O.cyl(0.022, 0.022, 0.006, i % 3 ? M.silver : M.gold, { x: (r() - 0.5) * 0.4, y: 0.006 + (i % 4) * 0.006, z: (r() - 0.5) * 0.36, rx: (r() - 0.5) * 0.3 }, 12); }
    O.add(blob(0.09, 4, 1, 0.2), M.raw, { x: -0.12, y: 0.07, z: -0.1, sy: 0.8 });
  } else {
    O.add(blob(0.08, 8, 1, 0.1), M.clay, { y: 0.12, sy: 1.4 }); O.add(blob(0.05, 9, 1, 0.1), M.clay, { y: 0.26 });
    for (const s of [-1, 1]) rod(O, V(s * 0.05, 0.18, 0), V(s * 0.1, 0.1, 0.03), 0.018, M.clay, 5);
    O.add(blob(0.11, 10, 1, 0.15), M.terraDark, { y: 0.03, sy: 0.3 });
  }
  glassCase(F, M, 0.72, 0.72, 0.97, 0.7);
  label(F, M, names[0], names[1], { y: 0.78, z: 0.412, w: 0.3 });
  return names;
}
function longCase(F, M, k) {
  const w = 2.2, d = 0.7, h = 2.2;
  F.box(w, h, 0.04, M.darkWood, { y: h / 2, z: -d / 2 + 0.02 });
  for (const s of [-1, 1]) F.box(0.06, h, d, M.darkWood, { x: s * (w / 2 - 0.03), y: h / 2 });
  F.box(w, 0.5, d, M.darkWood, { y: 0.25 }); F.box(w + 0.06, 0.1, d + 0.06, M.darkWood, { y: h + 0.05 }); F.box(w + 0.1, 0.04, d + 0.1, M.brass, { y: h - 0.02 });
  F.add(new THREE.PlaneGeometry(w - 0.12, h - 0.55), M.glass, { y: 0.5 + (h - 0.55) / 2, z: d / 2 });
  F.box(w - 0.12, 0.02, 0.03, M.lampSoft, { y: h - 0.08, z: d / 2 - 0.08 });
  const r = seeded(k * 9 + 2);
  for (let s = 0; s < 3; s++) {
    const y = 0.5 + s * 0.55;
    F.box(w - 0.12, 0.025, d - 0.1, s ? M.glass : M.velvet, { y, z: -0.02 });
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + 0.3 + i * 0.4, kind = (i + s + k) % 4, sc = 0.7 + r() * 0.5;
      if (kind === 0) F.add(lathe([[0.001, 0], [0.06, 0.01], [0.09, 0.08], [0.07, 0.16], [0.04, 0.2], [0.05, 0.22], [0.001, 0.22]], 14), [M.terracotta, M.clay, M.terraDark][i % 3], { x, y: y + 0.013, s: sc });
      else if (kind === 1) { for (let j = 0; j < 3; j++) F.add(new THREE.ConeGeometry(0.02, 0.07, 4), M.basalt, { x: x - 0.06 + j * 0.06, y: y + 0.05, rz: Math.PI / 2, rx: j * 0.4 }); }
      else if (kind === 2) { F.cyl(0.03, 0.03, 0.28, M.paper, { x, y: y + 0.045, z: 0.05, rz: Math.PI / 2 }, 10); F.cyl(0.036, 0.036, 0.03, M.wood, { x: x + 0.15, y: y + 0.045, z: 0.05, rz: Math.PI / 2 }, 10); F.cyl(0.036, 0.036, 0.03, M.wood, { x: x - 0.15, y: y + 0.045, z: 0.05, rz: Math.PI / 2 }, 10); }
      else { F.add(blob(0.05 * sc, i + s * 7 + k, 1, 0.25), [M.bronze, M.verdigris, M.jade][i % 3], { x, y: y + 0.06 }); }
    }
  }
  label(F, M, ["Everyday things", "Tools and trade", "Writing"][k % 3], "From the dig at Hollow Hill", { y: 0.3, z: d / 2 + 0.005, w: 0.4 });
}
function stoneHead(F, M) {
  F.box(1.3, 0.4, 1.3, M.plinth, { y: 0.2 }); F.box(1.36, 0.04, 1.36, M.plinthLight, { y: 0.42 });
  const H = F.sub({ y: 1.25 });
  H.add(blob(0.62, 31, 3, 0.06), M.basalt, { sy: 1.2, sz: 0.95 });
  H.add(new THREE.CylinderGeometry(0.66, 0.66, 0.24, 24, 1, true), M.basalt, { y: 0.48 });
  H.add(new THREE.SphereGeometry(0.66, 24, 10, 0, TAU, 0, Math.PI / 2), M.basalt, { y: 0.58, sy: 0.4 });
  H.box(0.5, 0.06, 0.12, M.basalt, { y: 0.28, z: 0.53 });
  for (const s of [-1, 1]) { H.ball(0.08, M.stone, { x: s * 0.19, y: 0.18, z: 0.52, sy: 0.5, sz: 0.4 }, 1); H.ball(0.12, M.basalt, { x: s * 0.6, y: 0.05, z: 0.05, sx: 0.35, sy: 1.1 }, 1); }
  H.add(triGeo([0, 0.2, 0.6, -0.12, -0.12, 0.66, 0, -0.14, 0.76, 0, 0.2, 0.6, 0, -0.14, 0.76, 0.12, -0.12, 0.66, -0.12, -0.12, 0.66, 0.12, -0.12, 0.66, 0, -0.14, 0.76]), M.basalt);
  H.ball(0.14, M.basalt, { y: -0.3, z: 0.52, sy: 0.32, sz: 0.5 }, 1); H.ball(0.12, M.basalt, { y: -0.4, z: 0.5, sy: 0.3, sz: 0.5 }, 1);
  H.box(0.5, 0.5, 0.5, M.basalt, { y: -0.75 });
}
function stele(F, M) {
  F.box(1.0, 0.3, 0.5, M.plinth, { y: 0.15 });
  const w = 0.8, h = 2.1, sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); sh.lineTo(-w / 2, 0);
  F.add(new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false, curveSegments: 12 }), M.sandstone, { y: 0.3, z: -0.11 });
  const gm = M.tex("glyph:3", () => std("#ffffff", { map: glyphTex(3, "#c4ab82"), roughness: 0.95 }));
  for (const [z, ry] of [[0.112, 0], [-0.112, Math.PI]]) {
    const face = new THREE.ShapeGeometry(sh, 12), p = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h);
    F.add(face, gm, { y: 0.3, z, ry });
  }
}
function amphorae(F, M) {
  F.box(1.6, 0.25, 0.7, M.plinth, { y: 0.125 });
  const amph = lathe([[0.001, 0], [0.03, 0.02], [0.13, 0.2], [0.18, 0.45], [0.17, 0.62], [0.11, 0.76], [0.05, 0.82], [0.045, 0.96], [0.065, 0.98], [0.06, 1.0], [0.001, 1.0]].map(([r, y]) => [r * 0.9, y * 0.9]), 18);
  for (const [x, mat] of [[-0.55, M.terracotta], [0, M.clay], [0.55, M.terraDark]]) {
    F.add(amph.clone(), mat, { x, y: 0.28 });
    for (const s of [-1, 1]) F.add(new THREE.TorusGeometry(0.07, 0.016, 6, 10, Math.PI), mat, { x: x + s * 0.08, y: 0.28 + 0.75, rz: s > 0 ? -Math.PI / 2 : Math.PI / 2, s: 1 });
    F.add(new THREE.TorusGeometry(0.12, 0.01, 4, 16), M.iron, { x, y: 0.42, rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; rod(F, V(x + Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12), V(x + Math.cos(a) * 0.16, 0.25, Math.sin(a) * 0.16), 0.008, M.iron, 4); }
  }
  F.add(amph.clone(), M.terracotta, { x: 0.15, y: 0.52, z: 0.48, rz: Math.PI / 2 + 0.15, s: 0.6 });
}

// ---------------------------------------------------------------- the history wing
function globe(F, M, g) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; F.add(tube([V(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), V(Math.cos(a) * 0.32, 0.4, Math.sin(a) * 0.32), V(Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12)], 0.025, 8, 6), M.darkWood); }
  F.cyl(0.14, 0.18, 0.08, M.darkWood, { y: 0.64 }, 16);
  F.add(new THREE.TorusGeometry(0.58, 0.035, 6, 48), M.lightWood, { y: 1.22, rx: Math.PI / 2 });
  for (const s of [-1, 1]) rod(F, V(s * 0.58, 1.22, 0), V(s * 0.3, 0.68, 0), 0.02, M.darkWood, 6);
  const T = new THREE.Group(); T.position.y = 1.22; T.rotation.z = 0.41; g.add(T);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.014, 6, 48, Math.PI * 1.6), M.brass); ring.rotation.z = -Math.PI * 0.3; T.add(ring);
  const spin = new THREE.Group(); T.add(spin);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), SHARED_M.tex("globe", () => std("#ffffff", { map: globeTex(), roughness: 0.5 })));
  ball.castShadow = true; spin.add(ball);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.14, 6), M.brass); T.add(pin);
  LIVE.spin.push({ o: spin, axis: "y", w: 0.18 });
}
function shipCase(F, M) {
  F.box(1.8, 0.95, 0.9, M.darkWood, { y: 0.475 }); F.box(1.86, 0.04, 0.96, M.brass, { y: 0.95 });
  glassCase(F, M, 1.76, 0.86, 0.97, 1.1);
  const S = F.sub({ y: 1.12 }), L = 1.3, H = 0.22, W = 0.3;
  S.add(shaped(new THREE.BoxGeometry(L, H, W, 12, 3, 4), (v) => { const u = v.x / (L / 2), yn = (v.y + H / 2) / H; v.z *= (1 - Math.max(0, u) ** 2 * 0.95 - Math.max(0, -u) ** 4 * 0.4) * (0.35 + 0.65 * yn); v.y += Math.max(0, u) ** 2 * 0.06 * yn; }), M.darkWood);
  S.box(L * 0.92, 0.025, W * 0.06, M.mustard, { y: H * 0.25, z: W * 0.47 }); S.box(L * 0.92, 0.025, W * 0.06, M.mustard, { y: H * 0.25, z: -W * 0.47 });
  S.box(L * 0.85, 0.012, W * 0.82, M.lightWood, { y: H / 2 - 0.005 });
  S.box(0.24, 0.08, 0.26, M.darkWood, { x: -0.5, y: H / 2 + 0.04 });
  for (const [x, hgt, sw] of [[0.35, 0.78, 0.32], [0, 0.95, 0.4], [-0.33, 0.7, 0.3]]) {
    rod(S, V(x, H / 2, 0), V(x, H / 2 + hgt, 0), 0.008, M.darkWood, 5);
    for (const [y, f] of [[0.28, 1], [0.58, 0.75]]) {
      const yy = H / 2 + hgt * y; rod(S, V(x, yy + hgt * 0.22 * f, -sw * f / 2), V(x, yy + hgt * 0.22 * f, sw * f / 2), 0.005, M.darkWood, 4);
      S.add(shaped(new THREE.PlaneGeometry(sw * f, hgt * 0.24 * f, 4, 3), (v) => { v.z += 0.04 * (1 - (v.x / (sw * f / 2)) ** 2); }), M.sail, { x, y: yy + hgt * 0.1 * f, ry: Math.PI / 2 });
    }
    rod(S, V(x, H / 2 + hgt, 0), V(L / 2 + 0.2, H / 2 + 0.05, 0), 0.0025, M.black, 3); rod(S, V(x, H / 2 + hgt, 0), V(-L / 2, H / 2 + 0.02, 0), 0.0025, M.black, 3);
  }
  rod(S, V(L / 2 - 0.05, H / 2 + 0.02, 0), V(L / 2 + 0.25, H / 2 + 0.12, 0), 0.007, M.darkWood, 5);
  for (const x of [-0.35, 0.35]) S.box(0.06, 0.12, 0.26, M.oak, { x, y: -H / 2 - 0.06 + 0.02 });
  label(F, M, "The Gull of Vermeil", "Ship model · 1780", { y: 0.75, z: 0.452, w: 0.36 });
}
function lander(F, M) {
  F.add(new THREE.CylinderGeometry(1.7, 1.78, 0.3, 40), M.plinth, { y: 0.15 });
  F.add(new THREE.CircleGeometry(1.66, 40), M.moon, { y: 0.305, rx: -Math.PI / 2 });
  for (const [x, z, s] of [[1.1, 0.7, 0.16], [-1.2, -0.5, 0.12], [0.4, -1.3, 0.1], [-0.6, 1.2, 0.08]]) F.add(blob(s, Math.round(x * 13 + z * 5 + 40), 1, 0.3), M.stone, { x, y: 0.31, z, sy: 0.6 });
  const L = F.sub({ y: 0.3 });
  L.add(new THREE.CylinderGeometry(0.72, 0.72, 0.55, 8), M.foil, { y: 1.05, ry: Math.PI / 8 });
  L.add(new THREE.CylinderGeometry(0.74, 0.74, 0.04, 8), M.black, { y: 1.34, ry: Math.PI / 8 });
  L.cyl(0.22, 0.32, 0.26, M.darkGlass, { y: 0.66 }, 16, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a), foot = V(c * 1.28, 0.08, s * 1.28);
    rod(L, V(c * 0.66, 1.2, s * 0.66), foot, 0.04, M.gold, 8); rod(L, V(c * 0.6, 0.8, s * 0.6), foot.clone().lerp(V(c * 0.66, 1.2, s * 0.66), 0.35), 0.022, M.silver, 6);
    for (const k of [-1, 1]) rod(L, V(c * 0.6 - s * k * 0.3, 0.85, s * 0.6 + c * k * 0.3), foot.clone().lerp(V(c * 0.66, 1.2, s * 0.66), 0.25), 0.016, M.silver, 6);
    L.cyl(0.2, 0.17, 0.06, M.silver, { x: foot.x, y: 0.03, z: foot.z }, 16);
    if (i === 1) for (let r = 0; r < 6; r++) { const p = V(c * 1.28, 0.08, s * 1.28).lerp(V(c * 0.7, 1.05, s * 0.7), (r + 0.5) / 6); rod(L, p.clone().add(V(-s * 0.12, 0, c * 0.12)), p.clone().add(V(s * 0.12, 0, -c * 0.12)), 0.01, M.silver, 4); }
  }
  const A = L.sub({ y: 1.36 });
  A.add(new THREE.IcosahedronGeometry(0.55, 0), M.whiteMetal, { y: 0.42, sy: 0.75, sx: 1.05 });
  A.box(0.62, 0.5, 0.7, M.whiteMetal, { y: 0.3, x: 0.1 });
  for (const s of [-1, 1]) A.add(new THREE.CircleGeometry(0.13, 3), M.darkGlass, { x: 0.416, y: 0.46, z: s * 0.17, ry: Math.PI / 2, rz: s > 0 ? 0 : Math.PI });
  A.box(0.05, 0.36, 0.3, M.black, { x: 0.42, y: 0.18 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; A.box(0.12, 0.12, 0.12, M.whiteMetal, { x: Math.cos(a) * 0.62, y: 0.55, z: Math.sin(a) * 0.62 }); }
  A.add(lathe([[0.001, 0], [0.18, 0.05], [0.2, 0.07]], 18), M.white, { x: -0.25, y: 0.95, z: 0.3, rz: 0.7 });
  rod(A, V(-0.2, 0.7, 0.25), V(-0.25, 0.95, 0.3), 0.012, M.silver, 4); rod(A, V(0.1, 0.7, -0.2), V(0.1, 1.35, -0.25), 0.006, M.silver, 3);
  const pole = V(-1.0, 0.3, 0.6);
  rod(F, pole, pole.clone().add(V(0, 1.8, 0)), 0.014, M.silver, 6); rod(F, pole.clone().add(V(0, 1.75, 0)), pole.clone().add(V(0.6, 1.75, 0)), 0.01, M.silver, 4);
  F.box(0.6, 0.36, 0.005, M.blue, { x: pole.x + 0.3, y: pole.y + 1.57, z: pole.z });
  F.box(0.2, 0.2, 0.007, M.white, { x: pole.x + 0.3, y: pole.y + 1.57, z: pole.z, rz: Math.PI / 4 });
  ropeLine(F, M, Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * TAU + Math.PI / 8; return [Math.cos(a) * 1.95, Math.sin(a) * 1.95]; }), true, 1.6);
  label(F, M, "Lunar lander", "Full-size replica · 1969", { x: 0, y: 0.18, z: 1.79, w: 0.42 });
}
function biplane(F, M, g, spec) {
  const B = F, L = 3.0;
  B.add(shaped(new THREE.BoxGeometry(L, 0.5, 0.56, 10, 2, 2), (v) => { const u = (v.x + L / 2) / L, k = 0.35 + 0.65 * Math.min(1, u * 1.6); v.y *= k; v.z *= k; v.y += (1 - k) * 0.12; v.x += 0.2; }), M.red);
  B.cyl(0.3, 0.28, 0.22, M.silver, { x: L / 2 + 0.25, rz: Math.PI / 2 }, 18);
  B.cyl(0.08, 0.04, 0.16, M.silver, { x: L / 2 + 0.42, rz: Math.PI / 2 }, 10);
  for (const [y, w] of [[0.62, 4.8], [-0.2, 4.4]]) {
    B.box(0.8, 0.06, w, M.canvas, { x: 0.75, y });
    for (const s of [-1, 1]) B.box(0.7, 0.062, 0.12, M.red, { x: 0.78, y, z: s * (w / 2 - 0.3) });
  }
  for (const s of [-1, 1]) for (const z of [1.1, 2.0]) {
    rod(B, V(0.5, -0.17, s * z), V(0.5, 0.59, s * z), 0.02, M.darkWood, 5); rod(B, V(1.0, -0.17, s * z), V(1.0, 0.59, s * z), 0.02, M.darkWood, 5);
    rod(B, V(0.5, -0.17, s * (z - 0.9)), V(0.5, 0.59, s * z), 0.004, M.wire, 3); rod(B, V(0.5, 0.59, s * (z - 0.9)), V(0.5, -0.17, s * z), 0.004, M.wire, 3);
  }
  for (const s of [-1, 1]) { rod(B, V(0.6, 0.2, s * 0.22), V(0.6, 0.6, s * 0.3), 0.018, M.darkWood, 5); rod(B, V(1.0, 0.2, s * 0.22), V(1.0, 0.6, s * 0.3), 0.018, M.darkWood, 5); }
  B.box(0.5, 0.04, 1.6, M.canvas, { x: -1.15, y: 0.12 }); B.add(triGeo([-0.9, 0.14, 0, -1.4, 0.14, 0, -1.35, 0.7, 0, -0.9, 0.14, 0, -1.35, 0.7, 0, -1.4, 0.14, 0]), M.canvas);
  B.box(0.18, 0.5, 0.03, M.red, { x: -1.42, y: 0.4 });
  B.cyl(0.24, 0.26, 0.1, M.black, { x: 0.2, y: 0.36, rz: 0.15 }, 14);
  for (const s of [-1, 1]) { rod(B, V(0.95, -0.2, s * 0.15), V(0.75, -0.7, s * 0.45), 0.018, M.darkWood, 5); rod(B, V(0.45, -0.2, s * 0.15), V(0.75, -0.7, s * 0.45), 0.018, M.darkWood, 5); B.add(new THREE.TorusGeometry(0.16, 0.05, 8, 16), M.black, { x: 0.75, y: -0.7, z: s * 0.5 }); B.cyl(0.08, 0.08, 0.06, M.silver, { x: 0.75, y: -0.7, z: s * 0.5, rx: Math.PI / 2 }, 10); }
  rod(B, V(0.75, -0.7, -0.5), V(0.75, -0.7, 0.5), 0.015, M.steel, 5);
  rod(B, V(-1.2, -0.05, 0), V(-1.35, -0.25, 0), 0.015, M.darkWood, 4);
  const prop = new THREE.Group(); prop.position.set(L / 2 + 0.52, 0, 0);
  const pk = new Kit(); for (const s of [-1, 1]) pk.add(shaped(new THREE.BoxGeometry(0.04, 0.95, 0.1, 1, 6, 1), (v) => { v.z *= 1 - Math.abs(v.y) * 0.6; v.x += v.y * 0.04; }), M.darkWood, { y: s * 0.475, rx: s * 0.15 });
  pk.into(prop); g.add(prop);
  LIVE.spin.push({ o: prop, axis: "x", w: 2.2 });
  return prop;
}
function press(F, M) {
  for (const s of [-1, 1]) { F.box(0.18, 1.9, 0.22, M.darkWood, { x: s * 0.42, y: 0.95 }); F.box(0.5, 0.1, 0.5, M.darkWood, { x: s * 0.42, y: 0.05 }); }
  F.box(1.06, 0.22, 0.26, M.darkWood, { y: 1.85 }); F.box(0.7, 0.16, 0.26, M.darkWood, { y: 1.45 });
  F.cyl(0.045, 0.045, 0.6, M.iron, { y: 1.15 }, 10); for (let i = 0; i < 8; i++) F.add(new THREE.TorusGeometry(0.05, 0.012, 4, 10), M.iron, { y: 0.92 + i * 0.06, rx: Math.PI / 2 });
  F.box(0.56, 0.08, 0.42, M.oak, { y: 0.85 });
  rod(F, V(0, 1.2, 0), V(0.35, 1.25, 0.65), 0.022, M.iron, 6); F.ball(0.045, M.darkWood, { x: 0.35, y: 1.25, z: 0.65 }, 1);
  F.box(0.9, 0.08, 1.4, M.oak, { y: 0.68, z: 0.2 }); for (const s of [-1, 1]) F.box(0.06, 0.06, 1.5, M.iron, { x: s * 0.36, y: 0.62, z: 0.2 });
  F.box(0.48, 0.06, 0.4, M.black, { y: 0.75, z: 0.55 });
  for (let i = 0; i < 10; i++) F.box(0.44, 0.008, 0.012, M.iron, { y: 0.782, z: 0.38 + i * 0.035 });
  F.box(0.52, 0.02, 0.46, M.paper, { y: 0.9, z: 1.05, rx: -0.9 });
  for (const s of [-1, 1]) F.box(0.08, 0.6, 0.08, M.oak, { x: s * 0.36, y: 0.3, z: 0.8 });
  const T = F.sub({ x: -0.85, z: 0.2 });
  T.box(0.5, 0.04, 0.5, M.oak, { y: 0.72 }); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) T.box(0.04, 0.7, 0.04, M.oak, { x, y: 0.35, z });
  for (let i = 0; i < 6; i++) T.box(0.3, 0.006, 0.42, M.paper, { y: 0.745 + i * 0.006, ry: (i - 3) * 0.04 });
  label(F, M, "Hand press", "Oak and iron · 1620", { y: 1.45, z: 0.135, w: 0.3 });
}
function loco(F, M) {
  F.box(3.4, 0.14, 1.4, M.plinth, { y: 0.07 }); F.box(3.3, 0.06, 1.1, M.gravel, { y: 0.17 });
  for (let i = 0; i < 9; i++) F.box(0.16, 0.06, 1.0, M.darkWood, { x: -1.5 + i * 0.375, y: 0.22 });
  for (const s of [-1, 1]) F.box(3.3, 0.06, 0.05, M.rail, { y: 0.28, z: s * 0.32 });
  const T = F.sub({ y: 0.31 });
  const wheel = (x, r, mat) => { for (const s of [-1, 1]) { T.cyl(r, r, 0.07, mat, { x, y: r, z: s * 0.36, rx: Math.PI / 2 }, 20); T.cyl(r * 0.25, r * 0.25, 0.09, M.steel, { x, y: r, z: s * 0.37, rx: Math.PI / 2 }, 10); } };
  for (const x of [-0.65, -0.05, 0.55]) wheel(x, 0.32, M.engineRed);
  wheel(1.15, 0.18, M.engineRed);
  for (const s of [-1, 1]) T.box(1.2, 0.05, 0.03, M.steel, { x: -0.05, y: 0.32, z: s * 0.42 });
  T.box(2.6, 0.16, 0.8, M.black, { x: 0.15, y: 0.6 });
  T.cyl(0.42, 0.42, 1.6, M.engine, { x: 0.35, y: 1.12, rz: Math.PI / 2 }, 24);
  for (const x of [-0.3, 0.3, 0.9]) T.add(new THREE.TorusGeometry(0.425, 0.02, 4, 24), M.brass, { x, y: 1.12, ry: Math.PI / 2 });
  T.cyl(0.44, 0.44, 0.35, M.black, { x: 1.3, y: 1.12, rz: Math.PI / 2 }, 24);
  T.cyl(0.42, 0.42, 0.03, M.iron, { x: 1.49, y: 1.12, rz: Math.PI / 2 }, 24);
  T.add(lathe([[0.1, 0], [0.12, 0.3], [0.17, 0.55], [0.18, 0.6], [0.001, 0.6]], 14), M.black, { x: 1.3, y: 1.5 });
  T.add(lathe([[0.16, 0], [0.16, 0.12], [0.12, 0.22], [0.001, 0.25]], 14), M.brass, { x: 0.3, y: 1.5 });
  T.add(lathe([[0.12, 0], [0.12, 0.08], [0.08, 0.15], [0.001, 0.17]], 12), M.engine, { x: -0.1, y: 1.52 });
  T.box(0.85, 1.05, 0.95, M.engine, { x: -0.85, y: 1.2 });
  T.add(shaped(new THREE.BoxGeometry(1.05, 0.06, 1.1, 1, 1, 6), (v) => { v.y += 0.08 * (1 - (v.z / 0.55) ** 2); }), M.black, { x: -0.85, y: 1.76 });
  for (const s of [-1, 1]) T.add(new THREE.PlaneGeometry(0.4, 0.35), M.darkGlass, { x: -0.7, y: 1.45, z: s * 0.476, ry: s > 0 ? 0 : Math.PI });
  T.add(new THREE.PlaneGeometry(0.28, 0.28), M.darkGlass, { x: -0.42, y: 1.48, z: 0.25, ry: Math.PI / 2 }); T.add(new THREE.PlaneGeometry(0.28, 0.28), M.darkGlass, { x: -0.42, y: 1.48, z: -0.25, ry: Math.PI / 2 });
  T.cyl(0.1, 0.1, 0.14, M.black, { x: 1.52, y: 1.6, rz: Math.PI / 2 }, 12); T.cyl(0.08, 0.08, 0.01, M.lamp, { x: 1.6, y: 1.6, rz: Math.PI / 2 }, 12);
  T.add(triGeo([1.4, 0.5, -0.4, 1.4, 0.5, 0.4, 1.75, 0.08, 0, 1.4, 0.5, 0.4, 1.4, 0.08, 0.4, 1.75, 0.08, 0, 1.4, 0.5, -0.4, 1.75, 0.08, 0, 1.4, 0.08, -0.4]), M.engineRed);
  T.add(lathe([[0.001, 0], [0.07, 0.01], [0.08, 0.1], [0.04, 0.14]], 10), M.brass, { x: 0.8, y: 1.53 });
  T.cyl(0.015, 0.015, 0.14, M.brass, { x: -0.35, y: 1.6 }, 6);
  for (const s of [-1, 1]) { T.cyl(0.12, 0.12, 0.5, M.black, { x: 1.0, y: 0.6, z: s * 0.42, rz: Math.PI / 2 }, 12); }
  label(F, M, "Little Ember", "Narrow-gauge steam engine · 1891", { x: 0, y: 0.1, z: 0.705, w: 0.4 });
}

// ---------------------------------------------------------------- the nave
function pendulum(F, M, g) {
  F.add(new THREE.CircleGeometry(1.8, 64), M.tex("rose", () => std("#ffffff", { map: roseTex(), roughness: 0.3, transparent: true, alphaTest: 0.5 })), { y: 0.016, rx: -Math.PI / 2 });
  F.add(new THREE.TorusGeometry(1.82, 0.03, 4, 64), M.brass, { y: 0.02, rx: Math.PI / 2 });
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; F.box(0.03, 0.12, 0.012, M.brass, { x: Math.cos(a) * 1.52, y: 0.08, z: Math.sin(a) * 1.52, ry: -a }); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; F.cyl(0.03, 0.04, 0.95, M.brass, { x: Math.cos(a) * 2.05, y: 0.475, z: Math.sin(a) * 2.05 }, 8); }
  F.add(new THREE.TorusGeometry(2.05, 0.035, 6, 72), M.brass, { y: 0.95, rx: Math.PI / 2 });
  F.add(new THREE.TorusGeometry(2.05, 0.02, 4, 72), M.brass, { y: 0.45, rx: Math.PI / 2 });
  const pivot = new THREE.Group(); pivot.position.y = 7.42; g.add(pivot);
  const plane = new THREE.Group(); pivot.add(plane);
  const arm = new THREE.Group(); plane.add(arm);
  const k = new Kit(), A = frame(k), len = 7.42 - 0.32;
  rod(A, V(0, 0, 0), V(0, -len + 0.2, 0), 0.005, M.steel, 4);
  A.add(lathe([[0.001, 0], [0.14, 0.12], [0.2, 0.28], [0.17, 0.38], [0.04, 0.44], [0.001, 0.44]], 24), M.brass, { y: -len - 0.24 });
  A.add(new THREE.ConeGeometry(0.03, 0.12, 10), M.brass, { y: -len - 0.25, rx: Math.PI });
  k.into(arm);
  const dish = new Kit(); dish.cyl(0.3, 0.3, 0.06, M.brass, { y: -0.03 }, 24); dish.into(pivot);
  LIVE.pend.push({ plane, arm, A: 0.12, T: 5.3, prec: 0.035 });
}
function banner(F, M, o) {
  const h = o.h ?? 2.6, w = o.w ?? 1.3;
  const bm = M.tex(`banner:${o.words}:${o.col}`, () => { const m = std("#ffffff", { map: bannerTex(o.words, o.col, o.icon), roughness: 0.9, side: THREE.DoubleSide }); m.userData.noShadow = true; return m; });
  F.add(shaped(new THREE.PlaneGeometry(w, h, 6, 8), (v) => { v.z += Math.sin(v.y * 2.1) * 0.03; }), bm, { y: h / 2 });
  rod(F, V(-w / 2 - 0.12, h + 0.04, 0), V(w / 2 + 0.12, h + 0.04, 0), 0.025, M.brass, 8); for (const s of [-1, 1]) F.ball(0.045, M.brass, { x: s * (w / 2 + 0.14), y: h + 0.04 }, 1);
  rod(F, V(-w / 2, -0.02, 0), V(w / 2, -0.02, 0), 0.018, M.darkWood, 6);
  const top = 7.42 - (o.y ?? 4.4);
  for (const s of [-1, 1]) rod(F, V(s * w * 0.4, h + 0.04, 0), V(s * w * 0.4, top, 0), 0.004, M.wire, 3);
}
function signpost(F, M, signs) {
  F.cyl(0.25, 0.3, 0.08, M.brass, { y: 0.04 }, 16); F.cyl(0.05, 0.06, 2.5, M.ebony, { y: 1.25 }, 10); F.ball(0.08, M.brass, { y: 2.52 }, 1);
  signs.forEach(([text, a], i) => {
    const S = F.sub({ y: 2.15 - i * 0.32, ry: a }), sm = M.tex("sign:" + text, () => signMat(signTex(text, "cream"), 0.25));
    S.box(1.15, 0.22, 0.04, M.ebony, { x: 0.62 });
    S.add(triGeo([1.2, 0.11, 0.021, 1.2, -0.11, 0.021, 1.34, 0, 0.021, 1.2, -0.11, -0.021, 1.2, 0.11, -0.021, 1.34, 0, -0.021]), M.ebony);
    S.add(new THREE.PlaneGeometry(1.1, 0.19), sm, { x: 0.62, z: 0.021 }); S.add(new THREE.PlaneGeometry(1.1, 0.19), sm, { x: 0.62, z: -0.021, ry: Math.PI });
  });
}
function archSign(F, M, text) {
  const w = 8.6, sm = M.tex("sign:" + text + ":lobby", () => signMat(signTex(text, "lobby"), 0.35));
  F.box(w, 1.2, 0.5, M.cream, { y: 5.3 });
  F.box(w + 0.2, 0.14, 0.62, M.white, { y: 5.97 }); F.box(w + 0.2, 0.1, 0.6, M.white, { y: 4.67 });
  for (const [z, ry] of [[0.252, 0], [-0.252, Math.PI]]) F.add(quad(w, 0.16, 0, 0, w / 2, 1), M.key, { y: 5.8, z, ry });
  for (const [z, ry] of [[0.255, 0], [-0.255, Math.PI]]) F.add(new THREE.PlaneGeometry(5.2, 0.9), sm, { y: 5.25, z, ry });
  for (const x of [-3.2, 3.2]) rod(F, V(x, 6.04, 0), V(x, 7.42, 0), 0.02, M.brass, 6);
}

// ---------------------------------------------------------------- the lobby
function column(F, M) {
  F.box(1.0, 0.3, 1.0, M.marble, { y: 0.15 }); F.add(new THREE.TorusGeometry(0.42, 0.06, 8, 32), M.marble, { y: 0.36, rx: Math.PI / 2 });
  const h = 6.2;
  F.add(shaped(new THREE.CylinderGeometry(0.34, 0.38, h, 48, 6, true), (v) => { const a = Math.atan2(v.z, v.x), k = 1 - 0.04 * (0.5 + 0.5 * Math.cos(a * 20)); v.x *= k; v.z *= k; }), M.marble, { y: 0.4 + h / 2 });
  F.add(lathe([[0.34, 0], [0.4, 0.12], [0.5, 0.3], [0.001, 0.3]], 32), M.marble, { y: 0.4 + h });
  F.box(1.0, 0.12, 1.0, M.marble, { y: 0.4 + h + 0.36 });
  for (const s of [-1, 1]) for (const z of [-0.34, 0.34]) F.add(new THREE.TorusGeometry(0.1, 0.035, 6, 14, Math.PI * 1.7), M.marble, { x: s * 0.42, y: 0.4 + h + 0.18, z, rz: s > 0 ? 0 : Math.PI });
  F.box(0.8, 7.5 - (0.4 + h + 0.42), 0.8, M.cream, { y: (7.5 + 0.4 + h + 0.42) / 2 });
  F.add(new THREE.TorusGeometry(0.36, 0.03, 4, 32), M.gold, { y: 2.2, rx: Math.PI / 2 });
}
function desk(F, M) {
  const w = 4.0;
  F.box(w, 1.05, 0.12, M.darkWood, { y: 0.525, z: 0.4 });
  for (let i = 0; i < 5; i++) F.box(0.7, 0.7, 0.02, M.wood, { x: -w / 2 + 0.4 + i * 0.8, y: 0.52, z: 0.47 });
  for (const y of [0.12, 0.95]) F.box(w, 0.03, 0.02, M.brass, { y, z: 0.475 });
  for (const s of [-1, 1]) F.box(0.12, 1.05, 0.9, M.darkWood, { x: s * (w / 2 - 0.06), y: 0.525 });
  F.box(w + 0.12, 0.06, 0.5, M.marble, { y: 1.08, z: 0.3 });
  F.box(w - 0.3, 0.05, 0.6, M.oak, { y: 0.75, z: -0.1 });
  F.box(0.5, 0.32, 0.03, M.black, { x: -0.6, y: 0.97, z: -0.15, rx: -0.15 }); F.box(0.47, 0.28, 0.005, M.lampBlue, { x: -0.6, y: 0.97, z: -0.133, rx: -0.15 }); F.cyl(0.03, 0.08, 0.1, M.black, { x: -0.6, y: 0.8, z: -0.2 }, 8);
  F.cyl(0.05, 0.06, 0.03, M.brass, { x: 0.9, y: 1.125, z: 0.35 }, 12); F.add(new THREE.SphereGeometry(0.05, 12, 6, 0, TAU, 0, Math.PI / 2), M.brass, { x: 0.9, y: 1.14, z: 0.35 });
  for (let i = 0; i < 3; i++) F.box(0.16, 0.22, 0.012, [M.red, M.blue, M.green][i], { x: 1.4 + i * 0.18, y: 1.22, z: 0.38, rx: -0.2 });
  F.box(0.6, 0.04, 0.14, M.brass, { x: 1.58, y: 1.12, z: 0.42 });
  const sm = M.tex("sign:INFORMATION:lobby", () => signMat(signTex("INFORMATION", "lobby"), 0.35));
  F.add(new THREE.PlaneGeometry(1.9, 0.34), sm, { y: 0.78, z: 0.482 });
  F.add(lathe([[0.12, 0], [0.15, 0.25], [0.001, 0.25]], 14), M.terracotta, { x: -1.6, y: 1.11, z: 0.3 });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; F.add(new THREE.ConeGeometry(0.04, 0.4, 4), M.fern, { x: -1.6 + Math.cos(a) * 0.06, y: 1.55, z: 0.3 + Math.sin(a) * 0.06, rz: Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }); }
}
function shop(F, M) {
  const w = 4.8;
  F.box(w, 2.5, 0.4, M.darkWood, { y: 1.25, z: -0.95 });
  for (let s = 0; s < 4; s++) F.box(w - 0.1, 0.04, 0.44, M.oak, { y: 0.4 + s * 0.52, z: -0.75 });
  const r = seeded(77);
  for (let s = 0; s < 4; s++) for (let i = 0; i < 12; i++) {
    const x = -w / 2 + 0.25 + i * 0.37, y = 0.42 + s * 0.52, kind = (i + s * 3) % 5;
    if (kind === 0) for (let b = 0; b < 4; b++) F.box(0.05, 0.26 + r() * 0.06, 0.18, [M.red, M.blue, M.green, M.mustard, M.purple][(b + i) % 5], { x: x - 0.08 + b * 0.055, y: y + 0.14, z: -0.75 });
    else if (kind === 1) { F.cyl(0.05, 0.05, 0.1, [M.white, M.teal, M.orange][i % 3], { x, y: y + 0.05, z: -0.7 }, 12); F.add(new THREE.TorusGeometry(0.03, 0.01, 4, 8), M.white, { x: x + 0.055, y: y + 0.05, z: -0.7 }); }
    else if (kind === 2) { F.cyl(0.07, 0.08, 0.05, M.darkWood, { x, y: y + 0.025, z: -0.72 }, 12); F.ball(0.08, M.snowGlass, { x, y: y + 0.12, z: -0.72 }, 2); F.ball(0.025, M.bone, { x, y: y + 0.09, z: -0.72 }, 1); }
    else if (kind === 3) { const D = F.sub({ x, y: y + 0.03, z: -0.72, s: 0.06, ry: 0.5 }); D.box(2.4, 0.9, 0.8, M.green, { y: 1.6 }); rod(D, V(1.2, 1.8, 0), V(2.3, 3.0, 0), 0.3, M.green, 6, 0.2); rod(D, V(-1.2, 1.6, 0), V(-2.6, 0.8, 0), 0.3, M.green, 6, 0.06); for (const x2 of [-0.8, 0.8]) for (const z of [-0.3, 0.3]) rod(D, V(x2, 1.4, z), V(x2, 0, z), 0.2, M.green, 6); }
    else F.box(0.22, 0.16, 0.02, [M.paper, M.cream][i % 2], { x, y: y + 0.1, z: -0.85, rx: -0.15 });
  }
  F.box(w + 0.2, 0.5, 0.2, M.darkWood, { y: 2.75, z: -0.9 });
  const sm = M.tex("sign:MUSEUM SHOP:lobby", () => signMat(signTex("MUSEUM SHOP", "lobby"), 0.4));
  F.add(new THREE.PlaneGeometry(2.6, 0.46), sm, { y: 2.75, z: -0.795 });
  F.box(2.6, 1.0, 0.6, M.darkWood, { y: 0.5, z: 0.6 }); F.box(2.7, 0.05, 0.7, M.marble, { y: 1.02, z: 0.6 });
  F.box(0.34, 0.16, 0.3, M.black, { x: 0.7, y: 1.12, z: 0.55 }); F.box(0.3, 0.12, 0.012, M.lampBlue, { x: 0.7, y: 1.2, z: 0.4, rx: -0.4 });
  F.box(0.4, 0.5, 0.012, M.paper, { x: -0.5, y: 1.3, z: 0.75, rx: -0.15 });
  for (let i = 0; i < 4; i++) F.box(0.03, 0.6, 0.6, M.oak, { x: -1.6 - i * 0.02, y: 0.3, z: 0.6 });
}
function welcomeBoard(F, M) {
  const tm = M.tex("welcome", () => std("#ffffff", { map: canvasTex(768, 1024, (g, w, h) => {
    const SERIF = "Georgia, 'Times New Roman', serif";
    g.fillStyle = "#2e2a26"; g.fillRect(0, 0, w, h); g.strokeStyle = "#d4af37"; g.lineWidth = 6; g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = "#f3e2b8"; g.textAlign = "center"; g.font = `700 54px ${SERIF}`; g.fillText("WELCOME", w / 2, 100); g.font = `italic 400 32px ${SERIF}`; g.fillText("to the Vermeil Museum", w / 2, 150);
    const ox = 84, oy = 210, sx = 600 / 48, sz = 540 / 40, R = (x0, z0, x1, z1, col, txt) => { g.fillStyle = col; g.fillRect(ox + (x0 + 24) * sx, oy + (z0 + 4) * sz, (x1 - x0) * sx, (z1 - z0) * sz); g.strokeStyle = "#f3e2b8"; g.lineWidth = 2; g.strokeRect(ox + (x0 + 24) * sx, oy + (z0 + 4) * sz, (x1 - x0) * sx, (z1 - z0) * sz); if (txt) { g.fillStyle = "#fff4dc"; g.font = `700 22px ${SERIF}`; g.fillText(txt, ox + ((x0 + x1) / 2 + 24) * sx, oy + ((z0 + z1) / 2 + 4) * sz + 8); } };
    R(-24, -4, -4, 14, PALETTES.ochre.wall, "DINOSAURS"); R(4, -4, 24, 14, PALETTES.red.wall, "HISTORIC ART"); R(-24, 14, -4, 28, PALETTES.teal.wall, "ARTIFACTS"); R(4, 14, 24, 28, PALETTES.navy.wall, "HISTORY");
    R(-4, -4, 4, 28, "#8a7a62", ""); R(-24, 28, 24, 36, "#6a6258", "LOBBY");
    g.save(); g.translate(ox + 24 * sx, oy + 16 * sz); g.rotate(-Math.PI / 2); g.fillStyle = "#fff4dc"; g.font = `700 20px ${SERIF}`; g.fillText("GRAND GALLERY", 0, 7); g.restore();
    g.fillStyle = "#d4af37"; g.beginPath(); g.arc(ox + 24 * sx, oy + 37.5 * sz, 10, 0, TAU); g.fill(); g.font = `italic 400 22px ${SERIF}`; g.fillText("You are here", ox + 24 * sx, oy + 37.5 * sz + 36);
    g.font = `400 24px ${SERIF}`; g.fillStyle = "#e0c27a"; g.fillText("Open every day · Free for everyone", w / 2, h - 60);
  }), roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.12 }));
  if (!tm.emissiveMap) { tm.emissiveMap = tm.map; tm.needsUpdate = true; }
  for (const s of [-1, 1]) rod(F, V(s * 0.5, 0, 0), V(s * 0.42, 2.1, 0), 0.03, M.brass, 8);
  F.box(1.0, 1.36, 0.06, M.ebony, { y: 1.35 });
  F.add(new THREE.PlaneGeometry(0.9, 1.2), tm, { y: 1.35, z: 0.032 });
  F.add(new THREE.PlaneGeometry(0.9, 1.2), tm, { y: 1.35, z: -0.032, ry: Math.PI });
}
function medallion(F, M) {
  F.add(new THREE.CircleGeometry(3.0, 96), M.tex("medal", () => std("#ffffff", { map: medallionTex(), roughness: 0.5, transparent: true, alphaTest: 0.5 })), { y: 0.016, rx: -Math.PI / 2 });
  F.add(new THREE.TorusGeometry(3.0, 0.03, 4, 96), M.brass, { y: 0.02, rx: Math.PI / 2 });
}

// ---------------------------------------------------------------- the catalog
const build = (fn) => (g, spec) => { const K = new Kit(); fn(frame(K), SHARED_M, spec, g); K.into(g); };
const VITRINE_INFO = ["A gold mask, made for a face nobody remembers.", "A jade vessel, cold to look at.", "A bronze helmet, green with age.", "A collar of beads, restrung by the conservators.", "A hoard of coins, found in a field by a farmer.", "One of the oldest things here: a little clay figure."];
export const EXHIBIT_CATALOG = {
  muArt: P("Painting", build((F, M, spec) => artPiece(F, M, spec)), { flat: true, act: "exhibit", info: "A painting in a gold frame. Step back to see it properly." }),
  muEasel: P("Easel", build((F, M) => easel(F, M)), { act: "exhibit", info: "Someone's copying a painting here. They've left their palette.", colliders: () => [[-0.55, -0.6, 1.1, 0.8]] }),
  muSarcophagus: P("Painted coffin", build((F, M) => sarcophagus(F, M)), { act: "exhibit", info: "A painted coffin, three thousand years old. The lid is a face looking up.", colliders: () => [[-1.4, -0.7, 1.4, 0.7]] }),
  muVitrine: P("Display case", (g, spec) => { const K = new Kit(); vitrine(frame(K), SHARED_M, spec.k ?? 0); K.into(g); }, { act: "exhibit", info: "Under the glass: something very old and very small.", colliders: () => [[-0.45, -0.45, 0.45, 0.45]] }),
  muLongCase: P("Wall case", build((F, M, spec) => longCase(F, M, spec.k ?? 0)), { act: "exhibit", info: "Shelves of small things people used every day, long ago.", colliders: () => [[-1.1, -0.4, 1.1, 0.4]] }),
  muStoneHead: P("Colossal head", build((F, M) => stoneHead(F, M)), { act: "exhibit", info: "A head carved from one boulder. Nobody knows whose face it is.", colliders: () => [[-0.7, -0.7, 0.7, 0.7]] }),
  muStele: P("Carved stele", build((F, M) => stele(F, M)), { act: "exhibit", info: "A stone covered in writing. Half of it has never been read.", colliders: () => [[-0.5, -0.25, 0.5, 0.25]] }),
  muAmphorae: P("Amphorae", build((F, M) => amphorae(F, M)), { act: "exhibit", info: "Wine jars from a shipwreck. One still has its stopper.", colliders: () => [[-0.8, -0.35, 0.8, 0.35]] }),
  muGlobe: P("Globe", (g) => { const K = new Kit(); globe(frame(K), SHARED_M, g); K.into(g); }, { act: "exhibit", info: "An old globe. Half the coastlines are guesses.", colliders: () => [[-0.6, -0.6, 0.6, 0.6]] }),
  muShip: P("Ship in a case", build((F, M) => shipCase(F, M)), { act: "exhibit", info: "A ship model, every rope tied by hand.", colliders: () => [[-0.95, -0.5, 0.95, 0.5]] }),
  muLander: P("Moon lander", build((F, M) => lander(F, M)), { act: "exhibit", info: "A full-size moon lander on a patch of moon. Mind the boot prints.", colliders: () => [[-2.0, -2.0, 2.0, 2.0]] }),
  muBiplane: P("Biplane", (g, spec) => {
    const K = new Kit(), M = SHARED_M, hang = 7.42 - (spec.y ?? 5.4), inner = new THREE.Group(); inner.rotation.z = 0.06; inner.rotation.x = 0.08; g.add(inner);
    biplane(frame(K), M, inner, spec);
    for (const [x, z] of [[0.75, 1.6], [0.75, -1.6], [-1.0, 0.5], [-1.0, -0.5]]) rod(K, V(x, 0.6, z), V(x, hang + 0.2, z), 0.004, M.wire, 3);
    K.into(inner); LIVE.swing.push({ o: inner, a: 0.015, w: 0.3, ph: 1, base: [0.08, 0.06] });
  }, { act: "exhibit", defaultY: 5.4, info: "A biplane, hung as if it's still flying. The propeller turns in the draught.", colliders: () => [] }),
  muPress: P("Printing press", build((F, M) => press(F, M)), { act: "exhibit", info: "A hand press. Every letter set backwards, one at a time.", colliders: () => [[-1.15, -0.3, 0.6, 1.0]] }),
  muLoco: P("Steam engine", build((F, M) => loco(F, M)), { act: "exhibit", info: "Little Ember, retired after sixty years on the hill line.", colliders: () => [[-1.7, -0.7, 1.7, 0.7]] }),
  muPendulum: P("Pendulum", (g) => { const K = new Kit(); pendulum(frame(K), SHARED_M, g); K.into(g); }, { act: "exhibit", info: "The pendulum never stops. Its swing slowly turns as the world turns under it.", colliders: () => [[-2.1, -2.1, 2.1, 2.1]] }),
  muBanner: P("Banner", (g, spec) => { const K = new Kit(); banner(frame(K), SHARED_M, spec); K.into(g); passThrough(g); }, { defaultY: 4.4, info: "A long banner, moving a little in the air.", colliders: () => [] }),
  muSignpost: P("Signpost", build((F, M, spec) => signpost(F, M, spec.signs || [["DINOSAURS", Math.PI], ["HISTORIC ART", 0], ["ARTIFACTS", Math.PI * 0.8], ["HISTORY", Math.PI * 0.2]])), { info: "Which way to everything.", colliders: () => [[-0.3, -0.3, 0.3, 0.3]] }),
  muArchSign: P("Gallery sign", build((F, M, spec) => archSign(F, M, spec.text || "THE GRAND GALLERY")), { flat: true, info: "The Grand Gallery: the long hall through the middle of the museum.", colliders: () => [] }),
  muDesk: P("Information desk", build((F, M) => desk(F, M)), { act: "order", info: "The information desk. Maps, tickets (free) and directions.", colliders: () => [[-2.06, -0.5, 2.06, 0.55]] }),
  muShop: P("Museum shop", build((F, M) => shop(F, M)), { act: "order", info: "The gift shop: tiny dinosaurs, snow globes, far too many postcards.", colliders: () => [[-2.5, -1.2, 2.5, -0.7], [-1.35, 0.28, 1.35, 0.95]] }),
  muColumn: P("Column", build((F, M) => column(F, M)), { info: "Marble, fluted, holding the ceiling up the old-fashioned way.", colliders: () => [[-0.5, -0.5, 0.5, 0.5]] }),
  muMedallion: P("Floor medallion", build((F, M) => medallion(F, M)), { flat: true, walk: true, info: "Inlaid marble: the museum's seal, under your feet." }),
  muWelcome: P("Welcome board", build((F, M) => welcomeBoard(F, M)), { info: "A map of the four wings. You are here.", colliders: () => [[-0.55, -0.15, 0.55, 0.15]] }),
};
export const VITRINE_INFOS = VITRINE_INFO;
