// world.js - the place: every turtle and what grows on it, the ocean, and the clock, seasons and weather over all of it.
// A turtle is one entry of ISLANDS. Far ones are only land and shell until you come close; then their trees, town and people arrive.
import * as THREE from "three";
import { ISLANDS, TURTLE_LOOKS, SEASONS, DAYS_IN_SEASON, BRIDGE, WEATHER, FISH_PACK, A, CATALOG, LAYOUT, NPCS } from "./data.js";
import { spotOf } from "./farm.js";
import { makeBoat, madeProp } from "./made.js";
import { Land, makeTurtle, makeOcean, makeFoam, fbm } from "./terrain.js";
import { prop, forest, loadModel } from "./assets.js";
import { MORE_FLORA } from "./wilddata.js";
import { planTown, dressTown, lightRoads } from "./towns.js";
import { drawWaters, planWaters, wetAt } from "./waters.js";
import { HOUSE_FX, HOUSE_LOOK, houseBatch, restyle } from "./houses.js";

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed & 0xfffffff) / 0xfffffff; };
export const SHORE = 0.4;                                    // below this you're in the water
export const DOCK = { x: [-192, -140], z: [-3.2, 3.2], y: 2.3 };
const GROWN = "conv_ultimate_nature_pack/", MEGA = "stylized_nature_megakit/", SIMPLE = "conv_simple_nature_pack/";
const HOURS = [[0, 0x1b2c58], [5, 0x24406f], [6.5, 0xffc9a3], [9, 0x8fdcff], [16, 0x8fdcff], [18.5, 0xffb37a], [20, 0x35487f], [24, 0x1b2c58]];
function skyAt(h, out) {
  let i = 0;
  while (i < HOURS.length - 2 && h >= HOURS[i + 1][0]) i++;
  const [a, ca] = HOURS[i], [b, cb] = HOURS[i + 1];
  return out.set(ca).lerp(new THREE.Color(cb), (h - a) / (b - a));
}

// ---------------- who's where: solids and things you can gather live in a coarse grid on their turtle ----------------
const CELL = 16, cellKey = (x, z) => (Math.floor(x / CELL) + 512) * 4096 + Math.floor(z / CELL) + 512;
export function addSolid(L, rec) { rec.L = L; const k = cellKey(rec.x, rec.z); if (!L.cells.has(k)) L.cells.set(k, []); L.cells.get(k).push(rec); return rec; }
export function dropSolid(rec) { const list = rec.L?.cells.get(cellKey(rec.x, rec.z)); if (list) { const i = list.indexOf(rec); if (i >= 0) list.splice(i, 1); } }
function* around(L, x, z) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const c = L.cells.get((a + 512) * 4096 + b + 512); if (c) yield* c; }
}
/** the lands you could be on: every turtle, or only the cave you've gone down into (cave.js) */
const lands = (G) => (G.world.cave?.on ? [G.world.cave.L()].filter(Boolean) : G.world.list);
/** the nearest thing around a world point that passes the test */
export function nearest(G, x, z, radius, test) {
  let best = null, bd = radius;
  for (const L of lands(G)) {
    if (!L.close(x, z)) continue;
    const [lx, lz] = L.local(x, z);
    for (const r of around(L, lx, lz)) { if (r.off || !test(r)) continue; const d = Math.hypot(r.x - lx, r.z - lz) - (r.r || 0); if (d < bd) { bd = d; best = r; } }
  }
  return best;
}
/** the same on a land's own ground, for those who live there. p is in the land's coordinates */
export function pushLocal(L, p, radius = 0.45) {
  for (const s of around(L, p.x, p.z)) {
    if (!s.r || s.off) continue;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), need = s.r + radius;
    if (d < need && d > 1e-4) { p.x += dx / d * (need - d); p.z += dz / d * (need - d); }
  }
}
export const clearAt = (L, x, z, pad = 0.6) => { for (const s of around(L, x, z)) if (s.r && !s.off && Math.hypot(x - s.x, z - s.z) < s.r + pad) return false; return true; };
/** the nearest place you can stand and reach the sea from here, or null: [x, z, which way the water lies] */
export function shoreNear(G, x, z, reach = 130) {
  let best = null, bd = 1e9;
  for (let a = 0; a < 6.28; a += 0.52) {
    const cx = Math.sin(a), cz = Math.cos(a);
    let last = groundAt(G, x, z).y;
    for (let d = 4; d < reach && d < bd; d += 3) {             // only a way that can be walked: a cliff ends the search this way
      const g = groundAt(G, x + cx * d, z + cz * d);
      if (g.on === "sea") { if (d - 3 < bd) { bd = d - 3; best = [x + cx * (d - 3.4), z + cz * (d - 3.4), a]; } break; }
      if (Math.abs(g.y - last) > 3) break;
      last = g.y;
    }
  }
  return best;
}

/** keep something out of trees, houses and rocks */
export function pushOut(G, p, radius = 0.5) {
  for (const L of lands(G)) {
    if (!L.close(p.x, p.z)) continue;
    let [x, z] = L.local(p.x, p.z), moved = false;
    for (const s of around(L, x, z)) {
      if (!s.r || s.off) continue;
      const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), need = s.r + radius;
      if (d < need && d > 1e-4) { x += dx / d * (need - d); z += dz / d * (need - d); moved = true; }
    }
    if (moved) { const [wx, wz] = L.world(x, z); p.x = wx; p.z = wz; }
  }
}

/** ground under a point, in world space -> { y, on, land }: `on` is a turtle's id, bridge, dock or sea */
export function groundAt(G, x, z) {
  const W = G.world;
  if (W.cave?.on) return W.cave.ground(x, z);
  let y = -14, on = "sea", land = null;
  for (const L of W.list) {
    if (!L.close(x, z)) continue;
    const [lx, lz] = L.local(x, z), h = L.land.ground(lx, lz);
    if (h > y) { y = h; if (h >= SHORE) { on = L.cfg.id; land = L; } else { on = "sea"; land = null; } }
  }
  if (x > DOCK.x[0] && x < DOCK.x[1] && z > DOCK.z[0] && z < DOCK.z[1] && y < DOCK.y) { y = DOCK.y; on = "dock"; land = W.lands.home; }
  const b = W.bridge;
  if (b?.open >= 1 && Math.abs(x - b.x) < b.half && z >= b.z0 - 0.5 && z <= b.z1 + 0.5) { y = Math.max(y, b.y + 0.12); on = "bridge"; land = W.lands.home; }
  return { y, on, land };
}
export const wet = (G, x, z) => groundAt(G, x, z).on === "sea";

// ---------------- what grows ----------------
function scatter(L, avoid, count, make, { low = 4.2, rough = 1.5 } = {}) {
  const { a, b } = L.cfg, land = L.land, out = [];
  for (let i = 0, n = 0; i < count * 6 && n < count; i++) {
    const t = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.96, x = Math.cos(t) * a * r, z = Math.sin(t) * b * r;
    if (avoid(x, z) || land.onRoad(x, z)) continue;
    const y = land.ground(x, z);
    if (y < low || land.rough(x, z, 1.6) > rough) continue;                     // never on a cliff, a road or the beach
    const m = make(x, y, z);
    if (m) { out.push(m); n++; }
  }
  return out;
}
const hide = (rec, gone) => {
  if (!rec.insts) return;
  const m = new THREE.Matrix4();
  for (const inst of rec.insts) {
    if (gone) { if (!rec.keep) rec.keep = []; inst.getMatrixAt(rec.i, m); rec.keep.push(m.clone()); inst.setMatrixAt(rec.i, m.makeScale(0, 0, 0)); }
    else if (rec.keep?.length) inst.setMatrixAt(rec.i, rec.keep[rec.insts.indexOf(inst)]);
    inst.instanceMatrix.needsUpdate = true;
  }
  if (!gone) rec.keep = null;
};
/** a tree, rock or plant is gone or back. s.cut remembers which day it went */
export function setGone(G, rec, gone) { rec.off = gone; hide(rec, gone); if (gone) (G.s.cut ||= {})[rec.key] = G.s.day; else delete G.s.cut?.[rec.key]; }
export function regrow(G) { for (const L of G.world.list) for (const list of L.cells.values()) for (const r of list) if (r.off && r.key && G.s.day - (G.s.cut?.[r.key] ?? 0) >= (r.back || 6)) setGone(G, r, false); }

const NODE_MODEL = { stone: `${GROWN}Rock_1.glb`, ore: `${GROWN}Rock_Moss_3.glb`, sandstone: `${GROWN}Rock_3.glb`, crystal: `${MEGA}Pebble_Square_2.gltf`, cinder: `${GROWN}Rock_4.glb`, relic: `${MEGA}Pebble_Square_4.gltf`, berry: `${GROWN}BushBerries_1.glb`, herb: `${MEGA}Fern_1.gltf`, wildcap: `${MEGA}Mushroom_Common.gltf`, fiber: `${MEGA}Grass_Wispy_Tall.gltf`, pearl: `${MEGA}Pebble_Round_2.gltf` };
const HARD = new Set(["stone", "ore", "sandstone", "crystal", "cinder", "relic"]);
function gather(G, L, jobs, parent, avoid, item, count, place = {}) {
  const spots = scatter(L, avoid, count, (x, y, z) => ({ x, y: y - 0.04, z, ry: rnd() * 6.3, s: place.s || (HARD.has(item) ? 1.1 : 1.1) }), { low: 3.6, ...place });
  for (const sp of spots) { sp.rec = addSolid(L, { x: sp.x, z: sp.z, r: HARD.has(item) ? 0.9 : 0, node: HARD.has(item) ? "rock" : "forage", item, key: `${L.cfg.id}:${item}:${sp.x | 0}:${sp.z | 0}`, back: 5 }); }
  jobs.push(forest(NODE_MODEL[item], parent, spots).then((insts) => spots.forEach((sp, i) => { sp.rec.insts = sp.insts; sp.rec.i = sp.slot; if (G.s.day - (G.s.cut?.[sp.rec.key] ?? -99) < 5) { sp.rec.off = true; hide(sp.rec, true); } })));
}

/** what the wild leaves on open farmland, to be cleared for room and for what it gives: stumps and fallen logs for the axe, stones for the pick, weeds to pull.
 *  Always in the same places, and some of it comes back every week or two, the way a field fills in if it's left */
const DEBRIS = [["tree", `${GROWN}CommonTree_1.glb`, "tree", "wood", 10, 0.85, 0.6, 16], ["tree2", `${GROWN}CommonTree_2.glb`, "tree", "wood", 8, 0.8, 0.6, 16], ["birch", `${GROWN}BirchTree_1.glb`, "tree", "wood", 6, 0.75, 0.55, 16],
  ["stump", `${GROWN}TreeStump.glb`, "tree", "wood", 18, 0.9, 0.55, 12], ["log", `${GROWN}WoodLog.glb`, "tree", "wood", 16, 0.75, 0.6, 10], ["stone", `${MEGA}Rock_Medium_1.gltf`, "rock", "stone", 14, 0.5, 0.55, 8],
  ["stone2", `${MEGA}Rock_Medium_2.gltf`, "rock", "stone", 12, 0.55, 0.55, 8], ["pebble", `${GROWN}Rock_6.glb`, "rock", "stone", 12, 0.6, 0.5, 6], ["weed", `${GROWN}Grass.glb`, "forage", "fiber", 40, 1.5, 0, 4], ["bush", `${GROWN}Bush_1.glb`, "forage", "berry", 10, 0.9, 0, 6]];
/** the same model for the season: trees turn and snow settles on them */
const inSeason = (model, season) => /CommonTree|BirchTree/.test(model) ? model.replace(/(Tree)_/, ["$1_", "$1_", "$1_Autumn_", "$1_Snow_"][season]) : season === 3 && /TreeStump|WoodLog|Bush_/.test(model) ? model.replace(/(_\d)?\.glb$/, (m) => (/Bush/.test(model) ? `_Snow${m}` : `_Snow.glb`)) : model;
function debris(G, L, jobs, parent, season) {
  const cfg = L.cfg, land = L.land, fields = (cfg.clear || []).map((i) => cfg.flats[i]).filter((f) => !f.pier), s = G.s;
  const taken = [...Object.keys(s.plots || {}).map((k) => [...spotOf(k), 1.6]), ...(s.placed || LAYOUT.map(([type, x, z]) => ({ type, x, z }))).map((p) => [p.x, p.z, (CATALOG[p.type]?.r || 1) + 1.8]), [18, 2, 7]];
  let n = 0;
  const pick = (i) => { const h = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return h - Math.floor(h); };       // the same spots every time: what you've cleared stays cleared
  for (const [kind, model, node, item, count, size, r, back] of DEBRIS) {
    const spots = [];
    for (let i = 0; i < count * 8 && spots.length < count; i++, n++) {
      const f = fields[Math.floor(pick(n * 3) * fields.length)], a = pick(n * 3 + 1) * 6.3, d = Math.sqrt(pick(n * 3 + 2)) * f.r * 0.9, x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      if (land.onRoad(x, z) || land.rough(x, z, 1.2) > 0.6 || land.ground(x, z) < 4 || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr)) continue;
      taken.push([x, z, 1.4]);
      const sp = { x, y: land.ground(x, z) - 0.05, z, ry: pick(n * 7) * 6.3, s: size * (0.8 + pick(n * 5) * 0.4) };
      sp.rec = addSolid(L, { x, z, r, node, item, key: `home:${kind}${spots.length}`, back: back + Math.floor(pick(n * 11) * 6), debris: true });
      spots.push(sp);
    }
    jobs.push(forest(inSeason(model, season), parent, spots).then(() => spots.forEach((sp) => { sp.rec.insts = sp.insts; sp.rec.i = sp.slot; if (G.s.day - (G.s.cut?.[sp.rec.key] ?? -99) < sp.rec.back) { sp.rec.off = true; hide(sp.rec, true); } })));
  }
}

async function plant(G, L, avoid, season) {
  // how full a turtle is grows with how much ground it has: the big far turtles get as much per square metre as the small ones, and every turtle
  // is planted thick, the way a wild place is: woods with paths through them, not trees dotted over a lawn
  const cfg = L.cfg, area = Math.max(1, (cfg.a * cfg.b) / (150 * 112)), thick = cfg.id === "home" ? 1.35 : 1.8;
  const parent = new THREE.Group(), density = (cfg.density || 1) * area, jobs = [], sfx = cfg.id === "home" || cfg.id === "willowmere" ? ["", "", "_Autumn", "_Snow"][season] : "";
  L.group.add(parent);
  for (const [path, kinds, count, size, solid] of cfg.flora(sfx)) {
    const mega = path.startsWith(MEGA);
    for (let k = 1; k <= kinds; k++) {
      const spots = scatter(L, (x, z) => avoid(x, z) || (cfg.id === "home" && /Pine/.test(path) ? L.land.ground(x, z) < 12 : false), count * density * thick / kinds,
        (x, y, z) => ({ x, y: y - 0.2, z, ry: rnd() * 6.3, s: size * (0.8 + rnd() * 0.6) }));
      for (const sp of spots) sp.rec = addSolid(L, { x: sp.x, z: sp.z, r: solid, node: "tree", key: `${cfg.id}:t${sp.x | 0}:${sp.z | 0}`, back: 7 });
      jobs.push(forest(`${path}${k}.${mega || path.includes("stylized_nature") ? "gltf" : "glb"}`, parent, spots).then((insts) => spots.forEach((sp, i) => { sp.rec.insts = sp.insts; sp.rec.i = sp.slot; if (G.s.day - (G.s.cut?.[sp.rec.key] ?? -99) < 7) { sp.rec.off = true; hide(sp.rec, true); } })));
    }
  }
  const stones = cfg.stones || `${GROWN}Rock${season === 3 ? "_Snow" : ""}_`;
  for (let k = 1; k <= 5; k++) {
    const spots = scatter(L, avoid, 16 * density, (x, y, z) => ({ x, y: y - 0.1, z, ry: rnd() * 6.3, s: 0.8 + rnd() * 0.8 }));
    for (const sp of spots) sp.rec = addSolid(L, { x: sp.x, z: sp.z, r: 0.9, node: "rock", item: "stone", key: `${cfg.id}:r${sp.x | 0}:${sp.z | 0}`, back: 5 });
    jobs.push(forest(`${stones}${k}.glb`, parent, spots).then((insts) => spots.forEach((sp, i) => { sp.rec.insts = sp.insts; sp.rec.i = sp.slot; if (G.s.day - (G.s.cut?.[sp.rec.key] ?? -99) < 5) { sp.rec.off = true; hide(sp.rec, true); } })));
  }
  // the small things on the ground cast no shadow of their own: there are thousands of them
  const low = (insts) => { for (const i of insts) i.castShadow = false; return insts; };
  const free = (name, count, s = 1) => jobs.push(forest(name, parent, scatter(L, avoid, count * density, (x, y, z) => ({ x, y: y - 0.04, z, ry: rnd() * 6.3, s: s * (0.7 + rnd() * 0.6) }))).then(low));
  if (cfg.biome !== "Desert" && cfg.biome !== "Volcanic") {
    if (season !== 3 || sfx === "") for (const [n, c] of [["Fern_1", 60], ["Flower_3_Group", 40], ["Flower_4_Group", 40], ["Clover_1", 60], ["Grass_Wispy_Tall", 90], ["Mushroom_Common", 24]]) free(`${MEGA}${n}.gltf`, c);
    if (season !== 3 || sfx === "") { for (const n of ["Grass", "Grass_2", "Grass_Short"]) free(`${GROWN}${n}.glb`, 90, 1.1); free(`${GROWN}Flowers.glb`, 70, 1.1); for (const k of [1, 2, 3, 4, 5]) free(`${GROWN}Plant_${k}.glb`, 14, 1.1); }
    for (const k of [1, 2]) free(`${GROWN}Bush${season === 3 && sfx ? "_Snow" : ""}_${k}.glb`, 50, 1.2);
    for (const k of [1, 2, 3]) free(`${SIMPLE}Bush${k}.glb`, 12, 0.8);
  }
  if (cfg.flower) free(`${MEGA}${cfg.flower}.gltf`, 50, 1.4);
  // what else this biome can grow from the general asset pack. Its own run of random numbers, so everything already growing stays exactly where it was (a tree you felled stays felled).
  // Not under snow: these have no winter look
  if (sfx !== "_Snow") {
    const keepSeed = seed;
    seed = cfg.seed * 7919 + 13;
    for (const [path, count, height, solid, low = 4.2] of MORE_FLORA[cfg.biome] || []) {
      const spots = scatter(L, avoid, Math.round(count * Math.max(area * 1.6, 0.7)), (x, y, z) => ({ x, y, z, ry: rnd() * 6.3, s: 0.8 + rnd() * 0.5 }), { low });
      if (solid) for (const sp of spots) sp.rec = addSolid(L, { x: sp.x, z: sp.z, r: solid, node: "tree", key: `${cfg.id}:m${sp.x | 0}:${sp.z | 0}`, back: 7 });
      // the model's own size decides its scale, and its feet go on the ground wherever the pack put its middle
      jobs.push(loadModel(path).then((g) => {
        if (!g) return [];
        const box = new THREE.Box3().setFromObject(g.scene), k = height / Math.max(box.max.y - box.min.y, 1e-3);
        for (const sp of spots) { sp.s *= k; sp.y -= box.min.y * sp.s + 0.05; }
        return forest(path, parent, spots);
      }).then(() => { if (solid) for (const sp of spots) { if (!sp.insts) continue; sp.rec.insts = sp.insts; sp.rec.i = sp.slot; if (G.s.day - (G.s.cut?.[sp.rec.key] ?? -99) < 7) { sp.rec.off = true; hide(sp.rec, true); } } }));
    }
    seed = keepSeed;
  }
  // the trails' edges: pebbles, tufts of grass and a few flowers along both sides, the way a path wears into a wood. Own seed, as above
  if (sfx !== "_Snow" || !/home|willowmere/.test(cfg.id)) {
    const keepSeed = seed;
    seed = cfg.seed * 104729 + 7;
    const edge = { pebble: [], grass: [], flower: [], rock: [] }, kinds = Object.keys(edge), lush = !/Desert|Volcanic|Salt|Frozen/.test(cfg.biome);
    for (const { pts, w } of L.land.trails().lines) for (let i = 1; i < pts.length; i++) for (const side of [-1, 1]) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az) || 1, u = rnd(), d = w * (1.05 + rnd() * 0.9);
      const x = ax + (bx - ax) * u - (bz - az) / len * side * d, z = az + (bz - az) * u + (bx - ax) / len * side * d;
      if (avoid(x, z) || L.land.onTrail(x, z) || L.land.ground(x, z) < 3.6) continue;
      const kind = lush ? kinds[Math.floor(rnd() * 3.4) % 4] : rnd() < 0.6 ? "pebble" : "rock";
      edge[kind].push({ x, y: L.land.ground(x, z) - 0.05, z, ry: rnd() * 6.3, s: kind === "rock" ? 0.35 + rnd() * 0.3 : 0.8 + rnd() * 0.6 });
    }
    const pick = (list, names) => names.map((n, k) => [n, list.filter((_, i) => i % names.length === k)]);
    for (const [n, list] of [...pick(edge.pebble, ["Pebble_Round_1", "Pebble_Round_3", "Pebble_Square_2", "Pebble_Round_5"]), ...pick(edge.grass, lush ? ["Grass_Wispy_Short", "Grass_Common_Short", "Clover_2"] : []),
      ...pick(edge.flower, lush ? ["Flower_3_Single", "Flower_4_Single", "Flower_3_Group"] : []), ...pick(edge.rock, ["Rock_Medium_1", "Rock_Medium_3"])]) if (list.length) jobs.push(forest(`${MEGA}${n}.gltf`, parent, list).then(low));
    seed = keepSeed;
  }
  for (const [item, count] of cfg.nodes || []) gather(G, L, jobs, parent, avoid, item, count);
  if (cfg.id === "home") {
    for (const [item, count] of [["berry", 26], ["fiber", 60], ["wildcap", 12]]) gather(G, L, jobs, parent, avoid, item, count);
    gather(G, L, jobs, parent, (x, z) => Math.hypot(x - 92, z + 46) > 20, "ore", 10);
    debris(G, L, jobs, parent, season);
  }
  await Promise.all(jobs);
}

/** the pier off your tail shore: the fish pack's dock, three lengths of it, deck at DOCK.y */
async function buildDock(parent) {
  const len = (DOCK.x[1] - DOCK.x[0]) / 3;
  const parts = await Promise.all([0, 1, 2].map(() => prop(`${FISH_PACK}Dock_Long_NoRope.glb`, parent, { ry: Math.PI / 2 })));
  parts.forEach((o, i) => {
    if (!o) return;
    const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), s = len / size.x;
    o.scale.setScalar(s);
    o.position.set(0, 0, 0);
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    // the deck is where a ray coming down its middle first lands
    const hit = new THREE.Raycaster(new THREE.Vector3(c.x, b.max.y + 5, c.z), new THREE.Vector3(0, -1, 0)).intersectObject(o, true)[0];
    o.position.set(DOCK.x[1] - len * (i + 0.5) - c.x, DOCK.y - (hit?.point.y ?? b.max.y), -c.z);
  });
}

function pond(L, x, z, r, y) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 9), new THREE.MeshStandardMaterial({ color: 0x62d8d0, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.08, z); L.group.add(m);
  const jobs = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.3; jobs.push(prop(`${GROWN}Rock_${i % 5 + 1}.glb`, L.group, { x: x + Math.cos(a) * (r + 0.2), y: y - 0.1, z: z + Math.sin(a) * (r + 0.2), scale: 0.55 + (i % 3) * 0.14, ry: a })); }
  for (let i = 0; i < 4; i++) jobs.push(prop(`${GROWN}Lilypad.glb`, L.group, { x: x + Math.cos(i * 2) * r * 0.5, y: y + 0.1, z: z + Math.sin(i * 2) * r * 0.5, scale: 1.2, ry: i }));
  addSolid(L, { x, z, r: r + 0.2, pond: true });
  return Promise.all(jobs);
}


/** come close, and a turtle fills in */
export async function detail(G, L) {
  if (L.detail) return L.detailed;
  L.detail = true;
  const cfg = L.cfg, season = G.world.season;
  L.detailed = (async () => {
    const town = cfg.flats[0], keep = cfg.clear ? cfg.clear.map((i) => cfg.flats[i]) : cfg.houses ? [town] : [];         // farmland, the plateau and town squares stay open
    const avoid = (x, z) => keep.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 1.02) || (cfg.ruins && Math.hypot(x, z - 20) < 30) || (L.keep || []).some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr) || !!L.avoidAt?.(x, z) || wetAt(L, x, z);
    if (cfg.feature) await G.explore?.build(L);              // a far turtle's own place: the city, the caves, the giant ferns... (explore.js)
    if (cfg.houses) {
      // every town but Willowmere builds its old houses its own way too (houses.js); the rest of the kit gets the town's colours
      const own = cfg.quarter && HOUSE_LOOK[cfg.id] && cfg.id !== "willowmere" ? houseBatch(L) : null;
      await Promise.all(cfg.houses.map(async ([path, x, z, h, ry], i) => {
        const [wx, wz] = [town.x + x, town.z + z];
        addSolid(L, { x: wx, z: wz, r: h < 3 ? 1.3 : h * 0.56 });
        if (own && /House_\d\.glb$/.test(path)) {
          const g = (a, b) => L.land.ground(a, b), k = 3.2, y = Math.min(g(wx, wz), g(wx + k, wz), g(wx - k, wz), g(wx, wz + k), g(wx, wz - k));
          own.house({ x: wx, z: wz, h: y - 0.04, ry, kit: [path, h, 4.6] }, 100 + i);
          return;
        }
        restyle(await prop(path, L.group, { x: wx, y: L.land.ground(wx, wz) - 0.1, z: wz, height: h, ry }), cfg.id);     // the town's own plaster and roofs, and windows that light at dusk
      }));
      if (own) for (const f of own.finish(L.group)) HOUSE_FX.push(f);
    }
    if (cfg.ruins) {                                        // what's left of the Shellwrights
      const ring = [...Array(10)].map((_, i) => [Math.cos(i / 10 * 6.3) * 30, 20 + Math.sin(i / 10 * 6.3) * 30, i % 3 ? "pillar" : "arch", i / 10 * 6.3]);
      for (const [x, z, kind, a] of ring) { const o = madeProp(kind); o.position.set(x, L.land.ground(x, z) - 0.1, z); o.rotation.y = -a + Math.PI / 2; L.group.add(o); addSolid(L, { x, z, r: kind === "arch" ? 1.5 : 1.2 }); }
    }
    if (cfg.quarter) await dressTown(L, addSolid); else if (cfg.id === "home") await lightRoads(L, addSolid);
    await drawWaters(G, L);
    await plant(G, L, avoid, season);
    G.onDetail?.(L);
    G.landFilled?.(L);
  })().catch((e) => console.warn("[turtle] detail", cfg.id, e));
  return L.detailed;
}

function makeLand(G, id, cfg, season) {
  cfg.id = id;
  planWaters(cfg, new Land(cfg));                              // rivers, falls and ponds, worked out before the land is shaped round them
  const land = new Land(cfg), group = new THREE.Group(), body = makeTurtle(cfg, land), reach = Math.pow(cfg.a * 1.3, 2), L = { land, group, body, cfg, cells: new Map(), detail: false };
  const winter = season === 3 && (id === "home" || id === "willowmere");
  group.add(land.mesh(id === "home" ? 3.2 : id === "willowmere" ? 3.6 : cfg.waters ? 3.8 : 5, winter), land.roadsMesh(winter), makeFoam(cfg, land), body.group);
  for (const c of group.children) c.userData.always = true;
  group.children[0].userData.landSurface = group.children[1].userData.landSurface = true;
  L.local = (x, z) => { const dx = x - group.position.x, dz = z - group.position.z, a = group.rotation.y; if (!a) return [dx, dz]; const c = Math.cos(a), s = Math.sin(a); return [dx * c - dz * s, dx * s + dz * c]; };
  L.world = (x, z) => { const a = group.rotation.y; if (!a) return [x + group.position.x, z + group.position.z]; const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s + group.position.x, -x * s + z * c + group.position.z]; };
  L.close = (x, z) => group.visible && (x - group.position.x) ** 2 + (z - group.position.z) ** 2 < reach;
  L.dist = (x, z) => Math.hypot(x - group.position.x, z - group.position.z);
  G.scene.add(group);
  G.landMade?.(L);
  return L;
}

/** after the story: one little drifting island a week, never quite the same */
function driftCfg(week) {
  const s = (n) => (fbm(week * 3.1 + n, n * 1.7) * 2) % 1, pal = [[0xf1d596, 0xcdb0e8], [0xeaf2f6, 0x8fe0c8], [0xfff0c8, 0xf0a0a8], [0xdfe8ee, 0x9fc0f0]][week % 4];
  return { name: ["Lantern Drift", "Pearl Drift", "Whisper Isle", "Mooncrumb", "Little Stray"][week % 5], biome: "Drifting", look: TURTLE_LOOKS.drift, a: 100, b: 80, seed: 70 + week, deep: 24, route: { r: 3000, key: `drift${week}c`, speed: 0.0012, phase: s(1) * 6.3 }, palette: { sand: pal[0], low: pal[1], mid: pal[1], high: 0xb7b3a3, snow: 0xffffff }, peaks: [[8, 4, 12, 14]], flats: [],
    flora: () => [[`${GROWN}Willow_`, 3, 14, 1.2, 0.6]], density: 1, nodes: [[["pearl", "relic", "crystal", "cinder"][week % 4], 8], ["berry", 6]], places: {} };
}

/** the shores of your turtle and of Willowmere, found from the land itself now that both are so much bigger: where your pier, the drawbridge, the boat
 *  dock and the long straight roads down to them go. Run once before the land is made; W.layout keeps the answer for the bridge, the boat and Pip */
function fitShores(W) {
  const home = ISLANDS.home, town = ISLANDS.willowmere;
  home.roads = home.roads.filter((r) => !r.fit); town.roads = town.roads.filter((r) => !r.fit);
  const bare = (cfg) => new Land({ ...cfg, flats: cfg.flats.filter((f) => !f.pier) });
  const edge = (land, x, z, dx, dz) => { for (let i = 0; i < 1600 && land.height(x, z) > 0.42; i++) { x += dx; z += dz; } return [x, z]; };
  const H = bare(home), T = bare(town);
  // your pier, off the south shore, at the end of the road down from the farmhouse
  const [, hz] = edge(H, 36, 60, 0, 0.5);
  Object.assign(home.flats.find((f) => f.pier), { x: 36, z: hz - 2 });
  home.roads.push({ from: [36, 30, 13], to: [36, hz - 6, 6], w: 4.5, fit: true });
  // Willowmere's pier, off its north shore, straight down its main street
  const [, tz] = edge(T, 0, -40, 0, -0.5);
  Object.assign(town.flats.find((f) => f.pier), { x: 0, z: tz + 2 });
  town.roads.push({ from: [0, -28, 9.8], to: [0, tz + 6, 6], w: 4.5, fit: true });
  // the drawbridge: a leaf on the end of each pier, 27 m of water between them for the two leaves to close over
  const homeZ = hz + 4, townZ = tz - 5;
  town.dock.off = [36, homeZ + 27 - townZ];
  // the boat dock off the west shore, at the end of the road out of the farm's west gate
  const [wx] = edge(H, -90, 0, -0.5, 0);
  DOCK.x[0] = wx - 46; DOCK.x[1] = wx + 6;
  home.roads.push({ from: [-84, 8, 9.8], to: [wx + 28, 3, 3.6], w: 4.5, fit: true }, { from: [wx + 28, 3, 3.6], to: [wx + 4, 0, 2.4], w: 3.2, fit: true });
  NPCS.drift.places.dock = [wx + 10, 10];
  W.layout = { x: 36, homeZ, townZ, boat: [wx - 28, 7.6], dockEnd: wx };
}

export async function buildWorld(G) {
  const { scene, s: save } = G;
  const season = Math.floor((save.day - 1) / DAYS_IN_SEASON) % 4;
  G.world = { season, lands: {}, list: [], bridge: { open: 0 } };
  const W = G.world;
  for (const cfg of Object.values(ISLANDS)) planTown(cfg);         // every town's new quarter and ring street, before the land is shaped round them
  fitShores(W);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6), hemi = new THREE.HemisphereLight(0xffffff, 0xc8d8c0, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 420 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target, hemi);
  W.sun = sun; W.hemi = hemi;
  scene.fog = new THREE.Fog(0x8fdcff, 300, 1250);
  scene.background = new THREE.Color(0x8fdcff);
  W.ocean = makeOcean();
  scene.add(W.ocean);

  const cfgs = { ...ISLANDS };
  if (save.flags.after) cfgs.drift = driftCfg(Math.floor(save.day / 7));
  for (const [id, cfg] of Object.entries(cfgs)) { const L = W.lands[id] = makeLand(G, id, cfg, season); W.list.push(L); if (cfg.hidden && !save.flags[cfg.reveal || "chart"] && !save.seenIsles?.[id]) L.group.visible = false; }

  await buildDock(W.lands.home.group);
  await pond(W.lands.home, -74, -8, 8, W.lands.home.land.ground(-74, -8));
  await Promise.all([detail(G, W.lands.home), detail(G, W.lands.willowmere)]);

  // life on the water
  W.boats = [];
  for (let i = 0; i < 6; i++) { const b = new THREE.Group(); scene.add(b); b.add(makeBoat(0.7 + rnd() * 0.5)); b.userData = { r: 240 + i * 90 + rnd() * 30, a: rnd() * 6.3, v: 0.012 + rnd() * 0.02 }; W.boats.push(b); }
  W.clouds = [];                                              // no clouds in the sky: a clear blue sky looks better than lumps of white
  const birds = new Float32Array(90);
  for (let i = 0; i < 90; i++) birds[i] = (rnd() - 0.5) * (i % 3 === 1 ? 20 : 160) + (i % 3 === 1 ? 62 : 0);
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(birds, 3));
  W.birds = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x4a5560, size: 1.3 })); scene.add(W.birds);
  const drops = new Float32Array(2400);
  for (let i = 0; i < 2400; i++) drops[i] = (rnd() - 0.5) * 80;
  const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  W.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xbfe0ff, size: 0.22, transparent: true, opacity: 0.8 })); W.rain.visible = false; scene.add(W.rain);
}

export const clockText = (m) => { const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60 / 10) * 10; return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
export const seasonOf = (day) => ({ index: Math.floor((day - 1) / DAYS_IN_SEASON) % 4, name: SEASONS[Math.floor((day - 1) / DAYS_IN_SEASON) % 4], day: (day - 1) % DAYS_IN_SEASON + 1 });
export function pickWeather(day, season) {
  const r = fbm(day * 7.3, 2.1) * 2 - 0.35, u = fbm(day * 3.9, 8.7) * 2 - 0.5;
  if (season === 3) return u > 0.9 ? "aurora" : r > 0.7 ? "snow" : r > 0.48 ? "cloudy" : u > 0.65 ? "fog" : "sunny";
  if (season === 1 && u > 0.72) return "heat";
  if (season === 2 && u > 0.72) return "fog";
  if (u < -0.1 && r < 0.5) return "wind";
  return r > 0.8 ? "storm" : r > 0.68 ? "rain" : r > 0.52 ? "cloudy" : "sunny";
}
export const isWet = (w) => !!WEATHER[w]?.wet;

/** one frame of the living world */
/** which turtles to draw, by the render setting: null for all of them. The one you're standing on always; at sea, the nearest.
 *  Your turtle and Willowmere count as one while the drawbridge joins them */
function turtlesShown(G, focus) {
  const mode = G.s.opts?.render || "all", W = G.world;
  if (mode === "all") return null;
  const on = G.player?.ground?.on, edge = (L) => L.dist(focus.x, focus.z) - L.cfg.a;
  const order = W.list.filter((L) => L.group.visible).sort((p, q) => edge(p) - edge(q));
  const here = W.lands[on === "bridge" ? "home" : on] || order[0], set = new Set([here]);
  if (mode === "near") { const next = order.find((L) => !set.has(L)); if (next) set.add(next); }
  const pair = [W.lands.home, W.lands.willowmere];
  if ((W.townHere || 0) > 0.01 && pair.some((L) => set.has(L))) for (const L of pair) set.add(L);
  return set;
}

export function tickWorld(G, dt, t) {
  const W = G.world, s = G.s, hour = s.minute / 60, P = G.player, focus = P?.pos || new THREE.Vector3();
  const sky = skyAt(hour % 24, new THREE.Color()), We = WEATHER[s.weather] || WEATHER.sunny, wetDay = !!We.wet, dull = We.dull;
  sky.lerp(new THREE.Color(0x8f9aa8), Math.max(0, 1 - dull));
  if (s.weather === "heat") sky.lerp(new THREE.Color(0xffe0a8), 0.3);
  const dark = hour < 5 || hour > 20;
  if (s.weather === "aurora" && dark) sky.lerp(new THREE.Color(0x3fd0a8), 0.32 + Math.sin(t * 0.4) * 0.1);
  G.scene.background.copy(sky);
  G.scene.fog.color.copy(sky);
  G.scene.fog.near = We.fog ? 60 : 300; G.scene.fog.far = We.fog ? 420 : 1250;
  const day = smooth(5.5, 8, hour) * (1 - smooth(17.5, 20, hour));
  W.sun.intensity = (0.2 + day * 1.5) * dull;
  W.hemi.intensity = (0.7 + day * 1.5) * (0.45 + dull * 0.55);          // a rainy or stormy day is a darker day
  W.sun.color.set(day > 0.7 ? 0xfff0d8 : 0xffb080);
  // night vision (test tools): the dark lifted, the haze pushed far back, and the picture tinted green like a pair of goggles
  const nv = !!G.cheat?.nightVision;
  if (nv) { W.hemi.intensity = Math.max(W.hemi.intensity, 2.3); W.sun.intensity = Math.max(W.sun.intensity, 0.9); G.scene.fog.near *= 2.5; G.scene.fog.far *= 3; }
  if (nv !== W.nv) { W.nv = nv; G.renderer.domElement.style.filter = nv ? "brightness(1.15) contrast(1.1) sepia(0.35) hue-rotate(55deg) saturate(1.4)" : ""; }
  const ang = (hour - 6) / 12 * Math.PI;
  W.sun.target.position.copy(focus);
  W.sun.position.set(focus.x - Math.cos(ang) * 150, focus.y + 40 + Math.max(0.15, Math.sin(ang)) * 170, focus.z + 70);
  W.ocean.userData.tick(t);
  W.ocean.position.set(Math.round(focus.x / 24) * 24, -0.2, Math.round(focus.z / 24) * 24);
  W.lands.home.body.group.position.y = Math.sin(t * 0.5) * 0.12;
  const mood = { asleep: hour > 21.5 || hour < 5.5, rain: wetDay, moored: true };
  W.lands.home.body.update(t, mood);
  // Willowmere comes in the morning, moors for the day, and drifts off at night, unless you're still over there
  const town = W.lands.willowmere, off = town.cfg.dock.off, on = P?.ground?.on === "willowmere";
  const here = smooth(BRIDGE.arrive - 2, BRIDGE.open - 0.4, hour) * (1 - (on ? 0 : smooth(BRIDGE.close + 0.6, BRIDGE.close + 3, hour)));
  const k = on ? W.townK ?? 1 - here : 1 - here;
  W.townK = k;
  town.group.position.set(off[0] + k * 60, Math.sin(t * 0.4 + 2) * 0.1, off[1] + k * 110);
  town.body.update(t, { ...mood, moored: k < 0.01 });
  W.townHere = here;
  // a turtle a long way off is its land and shell: what stands on it comes back as you get near.
  // and the render setting (Settings, "Draw turtles"): every turtle, only the one you're on and the nearest, or only the one you're on
  if ((W.farIn = (W.farIn || 0) - dt) <= 0) {
    W.farIn = 0.5;
    const shown = turtlesShown(G, focus);
    for (const L of W.list) {
      if (!L.group.visible && L.cfg.hidden && s.flags[L.cfg.reveal || "chart"]) { L.group.visible = true; G.revealed?.(L); }       // the story has put it on your map
      const far = L.dist(focus.x, focus.z) > L.cfg.a + 300, off = !!shown && !shown.has(L);
      if (far !== L.far || off !== L.off) { L.far = far; L.off = off; for (const c of L.group.children) c.visible = !off && (c.userData.always || !far); }
    }
  }
  // the rest go their own way, and wait for you once you've tied up alongside
  for (const L of W.list) {
    const f = L.cfg.route;
    if (!f) continue;
    if (!L.group.visible) continue;
    const held = L.dist(focus.x, focus.z) < L.cfg.a + 120;
    const key = f.key || L.cfg.id;
    if (!(s.turtles ||= {})[key]) s.turtles[key] = f.phase;
    if (!held) s.turtles[key] += f.speed * dt;
    const a = s.turtles[key];
    L.group.position.set(Math.cos(a) * f.r, 0, Math.sin(a) * f.r);
    L.group.rotation.y = -a;
    if (L.dist(focus.x, focus.z) < 900) L.body.update(t, { ...mood, moored: held });
    if (!L.detail && L.dist(focus.x, focus.z) < L.cfg.a + 340) detail(G, L);
  }
  for (const b2 of W.boats) { const u = b2.userData; u.a += u.v * dt; b2.position.set(Math.cos(u.a) * u.r, 0.2 + Math.sin(t + u.a) * 0.25, Math.sin(u.a) * u.r); b2.rotation.y = -u.a; }
  for (const c of W.clouds) { c.position.x += dt * (s.weather === "wind" || s.weather === "storm" ? 5 : 1.6); if (c.position.x > 800) c.position.x = -800; }
  W.birds.position.set(focus.x + Math.sin(t * 0.05) * 70, 0, focus.z + Math.cos(t * 0.05) * 70);
  W.rain.visible = false;                                    // rain, snow, storm and wind are drawn by weather.js now
}

export { A, loadModel };
