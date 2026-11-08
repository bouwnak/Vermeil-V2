// museumhub.js - the Museum's building and its plan. A lobby at the front; through the arch, the Grand Gallery runs back the length of the
// building with four wings off it, each its own colour: Dinosaurs (ochre) and Historic Art (red) at the back, Artifacts (teal) and
// History (navy) at the front. Wings have 4.6 m walls under one 7.5 m coffered ceiling, so the long-neck's head and the biplane show
// over the tops. Walls between you and the camera fade; outside walls vanish when the camera is outside; the ceiling lifts away when
// the camera goes above it.
import * as THREE from "three";
import { Kit } from "./mainhub.js";
import { PALETTES, wallTex, dadoTex, floorTex, signTex, ART_TITLES } from "./museumart.js";
import { V, P, frame, rod, quad, lathe, SHARED_M, ownMaterials, std, LIVE, passThrough, signMat, noRay, lerp } from "./museumkit.js";
import { DINO_CATALOG } from "./museumbones.js";
import { EXHIBIT_CATALOG, hangPiece, VITRINE_INFOS } from "./museumexhibits.js";

const T = 0.3;                // wall thickness
const H_IN = 4.6, H_OUT = 7.5, CEIL = 7.5;
export const MUSEUM = { x0: -24, x1: 24, z0: -4, z1: 36 };

// ---------------------------------------------------------------- walls
/** spans of a wall that are solid: everything between the open doorways (glass doors count as solid) */
function wallSpans(len, doors, solidGlass) {
  const out = []; let x = -len / 2;
  for (const d of [...doors].sort((a, b) => a.u - b.u)) {
    if (solidGlass && d.kind === "glass") continue;
    if (d.u - d.w / 2 > x) out.push([x, d.u - d.w / 2]);
    x = d.u + d.w / 2;
  }
  if (x < len / 2) out.push([x, len / 2]);
  return out;
}
const doorsOf = (spec) => (spec.doors || []).map(([u, w, h, kind]) => ({ u, w, h: h ?? 3.6, kind }));
const trimMat = (M, pal) => M.tex("trim:" + pal, () => { const c = PALETTES[pal].trim, gold = /^#(d4|c9)/i.test(c); return std(c, { roughness: gold ? 0.35 : 0.6, metalness: gold ? 0.7 : 0 }); });

function buildWall(g, spec) {
  const len = spec.len, h = spec.h ?? (spec.outer ? H_OUT : H_IN), outer = !!spec.outer, doors = doorsOf(spec);
  const M = ownMaterials(), K = new Kit(), F = frame(K);
  const solid = wallSpans(len, doors, false);
  const faces = [[1, spec.pal, spec.clad]];
  if (!outer) faces.push([-1, spec.back || spec.pal, spec.backClad]);
  const reveal = M.tex("reveal", () => std(PALETTES.cream.trim, { roughness: 0.7 }));
  for (const [s, pal, clad] of faces) {
    const Pl = PALETTES[pal], S = s > 0 ? F.sub({ z: T / 2 }) : F.sub({ z: -T / 2, ry: Math.PI });
    const X = (u) => s * u;                                                   // wall position along its length -> this face's x
    const paper = clad ? M.tex("clad", () => std("#ffffff", { map: floorTex("flag"), roughness: 0.95 })) : M.tex("wall:" + pal, () => std("#ffffff", { map: wallTex(pal), roughness: 0.92 }));
    const tile = clad ? 4 : 2, dadoH = clad ? 0 : 0.92, dado = M.tex("dado:" + pal, () => std("#ffffff", { map: dadoTex(pal), roughness: 0.8 }));
    const base = M.tex("base:" + pal, () => std(Pl.base, { roughness: 0.55 })), trim = trimMat(M, pal);
    const strip = (a, b, y0, y1, mat, t, z = 0) => { if (b - a < 0.01 || y1 - y0 < 0.01) return; const w = b - a, x = X((a + b) / 2), u0 = s > 0 ? a / t : -b / t; S.add(quad(w, y1 - y0, u0, y0 / t, w / t, (y1 - y0) / t), mat, { x, y: (y0 + y1) / 2, z }); };
    for (const [a, b] of solid) {
      strip(a, b, 0.14 + dadoH, h, paper, tile);
      if (dadoH) { strip(a, b, 0.14, 0.14 + dadoH, dado, 2, 0.003); S.box(b - a, 0.06, 0.05, trim, { x: X((a + b) / 2), y: 0.14 + dadoH, z: 0.02 }); }
      S.box(b - a, 0.16, 0.03, base, { x: X((a + b) / 2), y: 0.08, z: 0.012 });
    }
    for (const d of doors) {
      const a = d.u - d.w / 2, b = d.u + d.w / 2;
      strip(a, b, d.h, h, paper, tile);                                     // over the doorway
      if (d.kind === "glass") continue;
      for (const x of [a - 0.11, b + 0.11]) S.box(0.22, d.h + 0.2, 0.06, trim, { x: X(x), y: (d.h + 0.2) / 2, z: 0.03 });
      S.box(d.w + 0.44, 0.22, 0.07, trim, { x: X(d.u), y: d.h + 0.11, z: 0.035 });
      S.box(d.w + 0.7, 0.07, 0.14, trim, { x: X(d.u), y: d.h + 0.27, z: 0.06 });
      S.box(0.32, 0.4, 0.09, trim, { x: X(d.u), y: d.h + 0.08, z: 0.05 });
      for (const x of [a - 0.11, b + 0.11]) S.box(0.3, 0.1, 0.09, trim, { x: X(x), y: 0.05, z: 0.045 });
    }
    const top = outer ? H_IN : h;                                               // the picture rail (partitions: their cornice)
    // the picture rail and its key band stop either side of a door sign, so nothing runs across the name
    const gaps = (spec.signs || []).filter(([, , side]) => side === s).map(([u]) => [X(u) - 1.34, X(u) + 1.34]).sort((p, q) => p[0] - q[0]);
    const runs = []; { let x0 = -len / 2; for (const [g0, g1] of gaps) { if (g0 > x0) runs.push([x0, Math.min(g0, len / 2)]); x0 = Math.max(x0, g1); } if (x0 < len / 2) runs.push([x0, len / 2]); }
    for (const [x0, x1] of runs) { const w = x1 - x0; if (w < 0.02) continue; S.box(w, 0.1, 0.07, trim, { x: (x0 + x1) / 2, y: top - 0.2, z: 0.035 }); S.add(quad(w, 0.16, (x0 + len / 2) / 2, 0, w / 2, 1), M.key, { x: (x0 + x1) / 2, y: top - 0.06, z: 0.004 }); }
    S.box(len, 0.1, 0.12, trim, { y: top + 0.06, z: 0.06 });
    if (outer) { S.box(len, 0.22, 0.14, trim, { y: h - 0.11, z: 0.07 }); S.add(quad(len, 0.3, 0, 0, len / 2, 1), M.key, { y: h - 0.38, z: 0.004 }); }
    for (const [u, text, side] of spec.signs || []) {
      if (side !== s) continue;
      const d = doors.find((q) => Math.abs(q.u - u) < 0.01), y = Math.min((d ? d.h : 3.4) + 0.62, top - 0.33);   // on the door's head, clear under the cornice
      const sm = M.tex("sign:" + text + ":" + pal, () => signMat(signTex(text, pal), 0.3));
      S.box(2.5, 0.5, 0.06, trim, { x: X(u), y, z: 0.03 });
      S.add(new THREE.PlaneGeometry(2.36, 0.415), sm, { x: X(u), y, z: 0.062 });
    }
    for (const o of spec.hang || []) if ((o.side ?? 1) === s) hangPiece(S.sub({ x: X(o.u) }), M, o);
  }
  // inside the doorways: the reveals and the soffit; glass doors fill theirs
  for (const d of doors) {
    const a = d.u - d.w / 2, b = d.u + d.w / 2;
    if (d.kind === "glass") {
      const gl = M.glass, br = M.brass, n = Math.max(2, Math.round(d.w / 1.6));
      F.add(new THREE.PlaneGeometry(d.w, d.h), gl, { x: d.u, y: d.h / 2 });
      F.add(new THREE.PlaneGeometry(d.w, d.h), gl, { x: d.u, y: d.h / 2, ry: Math.PI });
      for (let i = 0; i <= n; i++) F.box(0.07, d.h, 0.1, br, { x: a + (i / n) * d.w, y: d.h / 2 });
      F.box(d.w, 0.09, 0.1, br, { x: d.u, y: d.h - 0.045 }); F.box(d.w, 0.12, 0.1, br, { x: d.u, y: 0.06 }); F.box(d.w, 0.05, 0.08, br, { x: d.u, y: d.h * 0.72 });
      for (let i = 0; i < n; i++) { const cx = a + ((i + 0.5) / n) * d.w; for (const z of [-0.07, 0.07]) rod(F, V(cx - 0.25, 1.05, z), V(cx + 0.25, 1.05, z), 0.02, br, 6); }
      const tr = trimMat(M, spec.pal);
      for (const x of [a - 0.14, b + 0.14]) F.box(0.28, d.h + 0.28, T + 0.12, tr, { x, y: (d.h + 0.28) / 2 });
      F.box(d.w + 0.56, 0.3, T + 0.14, tr, { x: d.u, y: d.h + 0.15 });
      continue;
    }
    for (const [x, ry] of [[a, Math.PI / 2], [b, -Math.PI / 2]]) F.add(new THREE.PlaneGeometry(T, d.h), reveal, { x, y: d.h / 2, ry });
    F.add(new THREE.PlaneGeometry(d.w, T), reveal, { x: d.u, y: d.h, rx: Math.PI / 2 });
    F.box(d.w, 0.012, T + 0.04, M.brass, { x: d.u, y: 0.006 });                    // a brass threshold
  }
  // the top of a partition, and its ends where they show
  if (!outer) F.box(len + 0.02, 0.06, T + 0.18, trimMat(M, spec.pal === "cream" ? spec.back || "cream" : spec.pal), { y: h + 0.15 });
  else F.box(len, 0.08, T, M.tex("reveal", () => std(PALETTES.cream.trim)), { y: h + 0.04 });
  // every wall's ends are closed and finished: a capped end, a slim pilaster with a plinth, so no open edge or gap shows
  for (const k of [-1, 1]) {
    const ex = (k * len) / 2, pil = trimMat(M, spec.pal === "cream" ? spec.back || "cream" : spec.pal);
    F.add(new THREE.PlaneGeometry(T, h), reveal, { x: ex, y: h / 2, ry: (k * Math.PI) / 2 });
    F.box(0.1, h + 0.02, T + 0.1, pil, { x: ex - k * 0.04, y: h / 2 });
    F.box(0.16, 0.24, T + 0.16, pil, { x: ex - k * 0.05, y: 0.12 });
  }
  K.into(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow && !outer; o.userData.wallMesh = true; } });
  LIVE.walls.push({ g, mats: M.all(), outer, h, len, alpha: 1, shown: 1 });
  return {};
}

// ---------------------------------------------------------------- floors
const ZONES = [
  [-24, -4, -4, 14, "flag", 4, 0.85], [4, -4, 24, 14, "parquet", 2, 0.58], [-24, 14, -4, 28, "slate", 2.4, 0.5],
  [4, 14, 24, 28, "boards", 2, 0.55], [-4, -4, 4, 28, "marble", 2, 0.5], [-24, 28, 24, 36, "marble", 2, 0.5],
];
function buildFloor(g) {
  const K = new Kit(), F = frame(K), M = SHARED_M;
  for (const [x0, z0, x1, z1, kind, tile, rough] of ZONES) {
    const w = x1 - x0, d = z1 - z0, mat = M.tex("floor:" + kind, () => std("#ffffff", { map: floorTex(kind), roughness: rough }));
    F.add(quad(w, d, x0 / tile, -z1 / tile, w / tile, d / tile), mat, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, rx: -Math.PI / 2 });
  }
  const carpet = M.tex("floor:carpet", () => std("#ffffff", { map: floorTex("carpet"), roughness: 0.95 }));
  for (const [z0, z1] of [[-3, 7.1], [11.9, 28.3]]) F.add(quad(2.4, z1 - z0, 0, 0, 1, (z1 - z0) / 2.4), carpet, { y: 0.004, z: (z0 + z1) / 2, rx: -Math.PI / 2 });
  for (const [z0, z1] of [[-3, 7.1], [11.9, 28.3]]) for (const s of [-1, 1]) F.box(0.04, 0.012, z1 - z0, M.brass, { x: s * 1.22, y: 0.006, z: (z0 + z1) / 2 });
  K.into(g, { cast: false });
  return { walkable: true };
}

// ---------------------------------------------------------------- the coffered ceiling
const SKY = new Set(["-2,-2", "2,-2", "-2,6", "2,6", "-2,14", "2,14", "-2,22", "2,22", "-2,30", "2,30", "-2,34", "2,34",
  "-14,2", "-14,10", "14,2", "14,10", "-14,18", "-14,22", "14,18", "14,22", "-18,6", "-10,6", "18,6", "10,6"]);
function buildCeiling(g) {
  const K = new Kit(), F = frame(K), M = SHARED_M, { x0, x1, z0, z1 } = MUSEUM, w = x1 - x0, d = z1 - z0;
  F.add(new THREE.PlaneGeometry(w, d), M.ceilPanel, { x: 0, y: CEIL, z: (z0 + z1) / 2, rx: Math.PI / 2 });
  const bd = 0.46;
  for (let x = x0; x <= x1 + 0.01; x += 4) F.box(0.42, bd, d, M.ceilBeam, { x, y: CEIL - bd / 2, z: (z0 + z1) / 2 });
  for (let z = z0; z <= z1 + 0.01; z += 4) F.box(w, bd, 0.42, M.ceilBeam, { y: CEIL - bd / 2, z });
  const ros = lathe([[0.001, 0], [0.36, 0], [0.3, -0.05], [0.2, -0.07], [0.14, -0.12], [0.06, -0.14], [0.001, -0.16]], 16);
  for (let cx = x0 + 2; cx < x1; cx += 4) for (let cz = z0 + 2; cz < z1; cz += 4) {
    const sky = SKY.has(`${cx},${cz}`);
    for (const [ox, oz, bw, bdp] of [[0, -1.62, 3.24, 0.12], [0, 1.62, 3.24, 0.12], [-1.62, 0, 0.12, 3.24], [1.62, 0, 0.12, 3.24]]) F.box(bw, 0.14, bdp, M.ceilTrim, { x: cx + ox, y: CEIL - 0.07, z: cz + oz });
    if (sky) {
      F.add(new THREE.PlaneGeometry(2.8, 2.8), M.skylight, { x: cx, y: CEIL - 0.02, z: cz, rx: Math.PI / 2 });
      for (const [ox, oz, bw, bdp] of [[0, -1.42, 2.96, 0.1], [0, 1.42, 2.96, 0.1], [-1.42, 0, 0.1, 2.96], [1.42, 0, 0.1, 2.96]]) F.box(bw, 0.22, bdp, M.brass, { x: cx + ox, y: CEIL - 0.11, z: cz + oz });
    } else F.add(ros.clone(), M.rosette, { x: cx, y: CEIL, z: cz });
  }
  K.into(g, { cast: false });
  passThrough(g);
  LIVE.ceil = g;
  return {};
}

// ---------------------------------------------------------------- the catalog
const wallColliders = (spec) => wallSpans(spec.len, doorsOf(spec), true).map(([a, b]) => [a, -T / 2 - 0.04, b, T / 2 + 0.04]);
const HUB_PIECES = {
  muWall: P("Wall", buildWall, { flat: true, info: "A gallery wall.", colliders: wallColliders }),
  muFloor: P("Gallery floor", (g) => buildFloor(g), { flat: true, walk: true, info: "Flagstones, parquet, slate, boards and marble: a floor for every wing.", colliders: () => [] }),
  muCeiling: P("Coffered ceiling", (g) => buildCeiling(g), { defaultY: 0, flat: true, info: "The coffered ceiling, with skylights.", colliders: () => [] }),
};
export const MUSEUM_CATALOG = { ...DINO_CATALOG, ...EXHIBIT_CATALOG, ...HUB_PIECES };

// ---------------------------------------------------------------- the plan
const Q = Math.PI / 2;
export function museumLayout() {
  const items = [{ type: "muFloor", x: 0, z: 0 }, { type: "muCeiling", x: 0, z: 0 }];
  const wall = (o) => items.push({ type: "muWall", ...o });
  const art = (u, k, o = {}) => ({ kind: "art", u, k, n: 7 + k * 3, w: 2.6, h: 1.8, cy: 2.35, title: ART_TITLES[k % ART_TITLES.length], ...o });
  // outside walls (their faces on the building's edge)
  const ox = 24 + T / 2, oz0 = -4 - T / 2, oz1 = 36 + T / 2;
  wall({ x: -14, z: oz0, len: 20, pal: "ochre", clad: true, outer: true, info: "The Dinosaur Hall's back wall, built of sandstone blocks." });
  wall({ x: 0, z: oz0, len: 8, pal: "cream", outer: true, hang: [art(0, 5, { w: 4.4, h: 2.9, cy: 2.75, title: "The Founders' Picnic", sub: "Oil on canvas · 1888" })], info: "The far end of the Grand Gallery." });
  wall({ x: 14, z: oz0, len: 20, pal: "red", outer: true, hang: [art(-6, 0, { w: 3.0, h: 2.1 }), art(0, 1, { w: 3.6, h: 2.4, cy: 2.5 }), art(6, 2, { w: 3.0, h: 2.1 })], info: "The Red Room: the big pictures." });
  wall({ x: -ox, z: 5, rot: Q, len: 18, pal: "ochre", outer: true, info: "The Dinosaur Hall." });
  wall({ x: -ox, z: 21, rot: Q, len: 14, pal: "teal", outer: true, hang: [{ kind: "plaque", u: 3.6, cy: 2.0, w: 1.3, title: "THE ARTIFACTS WING", sub: "Things people made, used and kept", body: "Every piece here was held by someone. Most of their names are lost; their things are not." }, { kind: "poster", u: -4.2, cy: 2.3, title: "LOST|CITIES", sub: "Finds from the river towns", col: ["#1f5a5c", "#0b2324"], icon: "vase" }], info: "The Artifacts Wing." });
  wall({ x: -ox, z: 32, rot: Q, len: 8, pal: "lobby", outer: true, hang: [{ kind: "poster", u: 0, cy: 2.2, title: "BONES|OF GIANTS", sub: "The Dinosaur Hall · always open", col: ["#c99a5a", "#3a2614"], icon: "bone" }], info: "The lobby." });
  wall({ x: ox, z: 5, rot: -Q, len: 18, pal: "red", outer: true, hang: [art(-5.5, 3, { w: 2.4, h: 3.0, cy: 2.6 }), art(0, 4, { w: 3.4, h: 2.2 }), art(5.5, 6, { w: 2.4, h: 3.0, cy: 2.6 })], info: "The Red Room." });
  wall({ x: ox, z: 21, rot: -Q, len: 14, pal: "navy", outer: true, hang: [{ kind: "poster", u: 1.2, cy: 2.3, title: "TO THE MOON|AND BACK", sub: "The lander, full size", col: ["#1f2d4f", "#05070e"], icon: "star" }, { kind: "poster", u: 4.6, cy: 2.3, title: "THE AGE|OF STEAM", sub: "Little Ember and friends", col: ["#7a1d24", "#1a0a08"], icon: "clock" }], info: "The History Wing." });
  wall({ x: ox, z: 32, rot: -Q, len: 8, pal: "lobby", outer: true, hang: [{ kind: "poster", u: 0, cy: 2.2, title: "PORTRAITS|& LANDSCAPES", sub: "The Red Room · upstairs of nothing", col: ["#7a1d24", "#2a0e10"], icon: "frame" }], info: "The lobby." });
  wall({ x: 0, z: oz1, rot: Math.PI, len: 48, pal: "lobby", outer: true, doors: [[0, 6.4, 4.4, "glass"], [14, 2.8, 3.4, "glass"], [-14, 2.8, 3.4, "glass"]],
    hang: [{ kind: "poster", u: 7.5, cy: 2.3, title: "OPEN|EVERY DAY", sub: "Free for everyone, always", col: ["#2e2a26", "#0e0c0a"], icon: "clock" }, { kind: "poster", u: -7.5, cy: 2.3, title: "THE GRAND|GALLERY", sub: "Four wings, one long hall", col: ["#b5862c", "#3a2614"], icon: "star" }], info: "The front doors." });
  // the gallery's sides: one doorway into each wing
  wall({ x: -4, z: 5, rot: Q, len: 18, pal: "cream", back: "ochre", doors: [[0, 4.4, 3.7]], signs: [[0, "DINOSAURS", 1], [0, "GRAND GALLERY", -1]],
    hang: [{ kind: "poster", u: 5.6, cy: 2.2, title: "BONES|OF GIANTS", sub: "Through here", col: ["#c99a5a", "#3a2614"], icon: "bone" }, { kind: "plaque", u: -5.6, cy: 1.7, title: "THE DINOSAUR HALL", sub: "Five skeletons and a dig", body: "Mind the long-neck: it's looking right at you." }, { kind: "plaque", side: -1, u: -6.6, cy: 1.8, title: "THE DIG", sub: "Have a go", body: "There's a skull under the sand. Brush gently." }], info: "The wall between the Grand Gallery and the dinosaurs." });
  wall({ x: 4, z: 5, rot: -Q, len: 18, pal: "cream", back: "red", doors: [[0, 4.4, 3.7]], signs: [[0, "HISTORIC ART", 1], [0, "GRAND GALLERY", -1]],
    hang: [{ kind: "poster", u: -5.6, cy: 2.2, title: "PORTRAITS|& LANDSCAPES", sub: "The Red Room", col: ["#7a1d24", "#2a0e10"], icon: "frame" }, { kind: "plaque", u: 5.6, cy: 1.7, title: "THE RED ROOM", sub: "Historic art", body: "Four hundred years of painting, hung the old way: close together, in gold." },
      { ...art(5.5, 7, { w: 2.2, h: 2.8, cy: 2.45 }), side: -1 }, { ...art(-5.5, 8, { w: 2.2, h: 2.8, cy: 2.45 }), side: -1 }], info: "The wall between the Grand Gallery and the Red Room." });
  wall({ x: -4, z: 21, rot: Q, len: 14, pal: "cream", back: "teal", doors: [[0, 3.8, 3.6]], signs: [[0, "ARTIFACTS", 1], [0, "GRAND GALLERY", -1]],
    hang: [{ kind: "poster", u: 4.6, cy: 2.2, title: "LOST|CITIES", sub: "The Artifacts Wing", col: ["#1f5a5c", "#0b2324"], icon: "vase" }, { kind: "plaque", side: -1, u: 4.4, cy: 1.7, title: "THE COFFIN", sub: "Cedar and gold leaf", body: "Painted inside and out, so the one inside would never be alone." }], info: "The wall between the Grand Gallery and the Artifacts Wing." });
  wall({ x: 4, z: 21, rot: -Q, len: 14, pal: "cream", back: "navy", doors: [[0, 3.8, 3.6]], signs: [[0, "HISTORY", 1], [0, "GRAND GALLERY", -1]],
    hang: [{ kind: "poster", u: -4.6, cy: 2.2, title: "TO THE MOON|AND BACK", sub: "The History Wing", col: ["#1f2d4f", "#05070e"], icon: "star" }, { kind: "plaque", side: -1, u: -4.4, cy: 1.7, title: "THE HISTORY WING", sub: "How we got here", body: "Sails, steam, wings and rockets: the long way round to now." }], info: "The wall between the Grand Gallery and the History Wing." });
  // between the wings, and between the front wings and the lobby
  wall({ x: -14, z: 14, len: 20, pal: "teal", back: "ochre", doors: [[-7.6, 2.6, 3.3]], signs: [[-7.6, "DINOSAURS", 1], [-7.6, "ARTIFACTS", -1]], info: "Between the dinosaurs and the artifacts." });
  wall({ x: 14, z: 14, len: 20, pal: "navy", back: "red", doors: [[7.6, 2.6, 3.3]], signs: [[7.6, "HISTORIC ART", 1], [7.6, "HISTORY", -1]],
    hang: [{ kind: "timeline", u: -2, cy: 2.55 }, { ...art(-6, 9, { w: 2.6, h: 1.8 }), side: -1 }, { ...art(0, 10, { w: 2.6, h: 1.8 }), side: -1 }], info: "The timeline: everything, in order." });
  wall({ x: -14, z: 28, len: 20, pal: "lobby", back: "teal", doors: [[5, 3.0, 3.4]], signs: [[5, "ARTIFACTS", 1], [5, "LOBBY", -1]],
    hang: [{ kind: "poster", u: -0.6, cy: 2.3, title: "LOST|CITIES", sub: "The Artifacts Wing", col: ["#1f5a5c", "#0b2324"], icon: "vase" }], info: "The Artifacts Wing, from the lobby." });
  wall({ x: 14, z: 28, len: 20, pal: "lobby", back: "navy", doors: [[-5, 3.0, 3.4]], signs: [[-5, "HISTORY", 1], [-5, "LOBBY", -1]],
    hang: [{ kind: "poster", u: -0.4, cy: 2.3, title: "THE AGE|OF STEAM", sub: "The History Wing", col: ["#7a1d24", "#1a0a08"], icon: "clock" }], info: "The History Wing, from the lobby." });
  // a freestanding wall in the Red Room, a painting each side
  wall({ x: 14, z: 5, len: 7, h: 3.6, pal: "red", back: "red", ends: true, hang: [art(0, 11, { w: 2.8, h: 1.9, cy: 2.0 }), { ...art(0, 12, { w: 2.8, h: 1.9, cy: 2.0 }), side: -1 }], info: "A wall all of its own, a painting on each side." });

  // the Dinosaur Hall
  items.push({ type: "muSauropod", x: -14.2, z: 4.6 }, { type: "muTriceratops", x: -17.2, z: -1.0 }, { type: "muTRex", x: -15, z: 10.8 }, { type: "muRaptors", x: -7, z: 11 },
    { type: "muDig", x: -8.6, z: -1.5 }, { type: "muPterosaur", x: -19, z: 7.6, y: 5.9 }, { type: "muPterosaur", x: -9.5, z: 7.8, y: 5.2, s: 0.7, bank: -0.2 },
    { type: "muMural", x: -23.94, z: 5, rot: Q });
  [-22.6, -13.0, -9.4, -5.8].forEach((x, k) => items.push({ type: "muFossilSlab", x, z: -3.92, k }));
  // the Red Room
  items.push({ type: "muEasel", x: 7.6, z: 11.2, rot: 0.6 },
    { type: "hubGalleryBench", x: 14, z: 2.4 }, { type: "hubGalleryBench", x: 14, z: 7.6, rot: Math.PI },
    { type: "hubGalleryBench", x: 8.6, z: 0.4, rot: Math.PI }, { type: "hubGalleryBench", x: 19.4, z: 0.4, rot: Math.PI }, { type: "hubGalleryBench", x: 21.2, z: 6.6, rot: Q },
    { type: "hubPlinth", x: 7.2, z: 1.4, n: 3 }, { type: "hubPlinth", x: 7.2, z: 8.6, n: 4 }, { type: "hubPlinth", x: 21.4, z: 11.8, n: 5 });
  // the Artifacts Wing
  items.push({ type: "muSarcophagus", x: -14, z: 20.8 }, { type: "muStoneHead", x: -21.2, z: 24.6, rot: Q }, { type: "muStele", x: -21.4, z: 18.4, rot: Q },
    { type: "muAmphorae", x: -23.5, z: 21.5, rot: Q },
    { type: "muLongCase", x: -19.5, z: 27.45, rot: Math.PI, k: 0 }, { type: "muLongCase", x: -15, z: 27.45, rot: Math.PI, k: 1 },
    { type: "muLongCase", x: -16.5, z: 14.55, k: 2 }, { type: "muLongCase", x: -11.5, z: 14.55, k: 0 },
    { type: "hubGalleryBench", x: -14, z: 24.4, rot: Math.PI }, { type: "hubGalleryBench", x: -14, z: 17.2 });
  [[-18.2, 17.6], [-9.8, 17.6], [-18.2, 24.0], [-9.8, 24.0], [-6.4, 16.4], [-6.4, 25.4]].forEach(([x, z], k) => items.push({ type: "muVitrine", x, z, k, info: VITRINE_INFOS[k] }));
  // the History Wing
  items.push({ type: "muLander", x: 13, z: 21.4 }, { type: "muBiplane", x: 13.6, z: 20.6, y: 5.4, rot: -0.45 }, { type: "muGlobe", x: 7.4, z: 17.0 },
    { type: "muShip", x: 23.45, z: 18.2, rot: -Q }, { type: "muLoco", x: 18.8, z: 26.9, rot: Math.PI }, { type: "muPress", x: 5.9, z: 27.3, rot: Math.PI },
    { type: "hubGalleryBench", x: 12, z: 16.6, rot: Math.PI }, { type: "hubGalleryBench", x: 17.6, z: 21.4, rot: -Q }, { type: "hubPlinth", x: 21, z: 15.6, n: 7 });
  // the Grand Gallery
  items.push({ type: "muPendulum", x: 0, z: 9.5 }, { type: "muSignpost", x: 2.7, z: 23.75, signs: [["DINOSAURS", 1.764], ["HISTORIC ART", 1.377], ["ARTIFACTS", 2.31], ["HISTORY", 0.833]] },
    { type: "muArchSign", x: 0, z: 28 }, { type: "muColumn", x: -4.75, z: 28.75 }, { type: "muColumn", x: 4.75, z: 28.75 });
  for (const [x, z, rot] of [[-2.95, 0.6, Q], [2.95, 0.6, -Q], [-2.95, 15.6, Q], [2.95, 15.6, -Q], [0, 14.2, Math.PI], [0, 4.8, 0], [-2.95, 25.6, Q], [2.95, 25.6, -Q]]) items.push({ type: "hubGalleryBench", x, z, rot });
  const BAN = [["DINOSAURS", "#8a5a24", "bone"], ["HISTORIC ART", "#7a1d24", "frame"], ["ARTIFACTS", "#1f5a5c", "vase"], ["HISTORY", "#1f2d4f", "clock"]];
  [[-2.6, 0.5, 0], [2.6, 0.5, 1], [-2.6, 17.5, 2], [2.6, 17.5, 3], [-2.6, 24.2, 0], [2.6, 24.2, 1]].forEach(([x, z, k]) => items.push({ type: "muBanner", x, z, y: 4.4, rot: Q, words: BAN[k][0], col: BAN[k][1], icon: BAN[k][2] }));
  // the lobby
  items.push({ type: "muMedallion", x: 0, z: 32.6 }, { type: "muDesk", x: -17, z: 30.9 }, { type: "muShop", x: 17, z: 29.3 }, { type: "muWelcome", x: 3.8, z: 31.0, rot: -0.35 },
    { type: "muColumn", x: -11, z: 32.4 }, { type: "muColumn", x: 11, z: 32.4 },
    { type: "hubGalleryBench", x: -7.5, z: 34.8, rot: Math.PI }, { type: "hubGalleryBench", x: 7.5, z: 34.8, rot: Math.PI },
    { type: "muBanner", x: -7.5, z: 31.4, y: 4.4, words: "WELCOME", col: "#7a1d24", icon: "star" }, { type: "muBanner", x: 7.5, z: 31.4, y: 4.4, words: "WELCOME", col: "#1f2d4f", icon: "star" });
  return {
    items,
    spots: {
      W: 48, D: 40,
      viewers: [[-10.6, 7.9], [-6.2, 3.4], [-20.8, 1.4], [-11.6, 0.9], [-17.2, 13.2], [-14, 23.3], [-9.8, 19.0], [12, 18.2], [15.8, 24.2], [10.4, 25.2], [8.4, 3.8], [21.6, 3.2], [17.4, 10.6], [2.6, 9.5], [-2.6, 11.5]],
      lobby: [-22, 30, 22, 35.4], nave: [-2.2, -2.5, 2.2, 27.4],
    },
  };
}

// ---------------------------------------------------------------- life: swinging, spinning, the pendulum, fading walls, the ceiling
const RAY = THREE.Mesh.prototype.raycast;
function setAlpha(w, a) {
  for (const m of w.mats) {
    const u = m.userData;
    if (u.op0 == null) { u.op0 = m.opacity; u.tr0 = m.transparent; u.dw0 = m.depthWrite; }
    const solid = a > 0.985, tr = solid ? u.tr0 : true;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = solid ? u.op0 : u.op0 * a;
    m.depthWrite = solid ? u.dw0 : false;
  }
  w.g.visible = a > 0.02;
  const pass = a < 0.6;
  if (pass !== w.pass) { w.pass = pass; w.g.traverse((o) => { if (o.isMesh) o.raycast = pass ? noRay : RAY; }); }
}
/** where the line from c to p crosses the segment a-b: its share of the way from c, or -1 */
function crossAt(c, p, a, b) {
  const rx = p.x - c.x, rz = p.z - c.z, sx = b.x - a.x, sz = b.z - a.z, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-6) return -1;
  const qx = a.x - c.x, qz = a.z - c.z, t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 0 && t < 1 && u > -0.02 && u < 1.02 ? t : -1;
}
const _c = new THREE.Vector3(), _p = new THREE.Vector3();
export function museumTick(dt, t, room) {
  for (const s of LIVE.swing) { const b = s.base || [0, 0]; s.o.rotation.z = b[1] + Math.sin(t * s.w + s.ph) * s.a; s.o.rotation.x = b[0] + Math.cos(t * s.w * 0.73 + s.ph) * s.a * 0.6; }
  for (const s of LIVE.spin) s.o.rotation[s.axis || "y"] += s.w * dt;
  for (const p of LIVE.pend) { p.arm.rotation.z = p.A * Math.sin((t * Math.PI * 2) / p.T); p.plane.rotation.y = t * (p.prec || 0.03); }
  const cam = room?.camera;
  if (!cam) return;
  _c.copy(cam.position);
  _p.copy(room.char?.root?.position || room.controls?.target || _c);
  if (LIVE.ceil) LIVE.ceil.visible = _c.y < CEIL - 0.25;
  const k = Math.min(1, dt * 7);
  for (const w of LIVE.walls) {
    if (!w.a) {
      w.g.updateMatrixWorld(true);
      const m = w.g.matrixWorld; w.a = V(-w.len / 2, 0, 0).applyMatrix4(m); w.b = V(w.len / 2, 0, 0).applyMatrix4(m); w.n = V(0, 0, 1).transformDirection(m);
    }
    let want = 1;
    if (w.outer) { if ((_c.x - w.a.x) * w.n.x + (_c.z - w.a.z) * w.n.z < -0.05) want = 0; }
    else {
      const f = crossAt(_c, _p, w.a, w.b);
      if (f >= 0 && lerp(_c.y, _p.y + 1.3, f) < w.h + 0.3) want = 0.16;
    }
    w.alpha += (want - w.alpha) * k;
    if (Math.abs(want - w.alpha) < 0.004) w.alpha = want;
    if (w.alpha !== w.shown) { w.shown = w.alpha; setAlpha(w, w.alpha); }
  }
}
/** before a fresh museum is built: forget the last one's moving parts */
export function resetMuseum() { LIVE.walls.length = 0; LIVE.swing.length = 0; LIVE.spin.length = 0; LIVE.pend.length = 0; LIVE.ceil = null; }
