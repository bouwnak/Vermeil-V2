// shops.js - the walk-in shops: a tavern where folk stand at the bar with a drink, a plant shop full of pots, a bakery, a tea house.
// Each is a real little building on its own lot on a town street (towns.js finds the lot): you walk in through the open door, no
// loading, no teleport. Inside: a counter with its keeper behind it, shelves and tables of things, and a few regulars who live
// there as much as anyone does. Who they are, what they say and what's on the menu is in shopdata.js.
//
// The building is drawn here from simple shapes so the door and the inside are exactly where we want them: a floor, a low wall
// skirt, upper walls in four pieces, a gable roof, glowing windows and a painted sign. When you go in, the roof and whichever
// upper walls stand between you and the camera are hidden, so you can see in like a doll's house. One warm light follows you
// to the shop you're at (one light for all of them, so the game doesn't slow down).
import * as THREE from "three";
import { character, prop } from "./assets.js";
import { SHOP_KIT as K, townModel } from "./wilddata.js";
import { SHOP_KINDS, TOWN_SHOPS, shopKey } from "./shopdata.js";

/** how big a shop is: W across its front, D deep, walls H high. SHOP_R is its footprint radius for laying out the town */
export const SHOP_W = 10, SHOP_D = 8, SHOP_H = 4.2, SHOP_R = 6.4;
const HW = SHOP_W / 2, HD = SHOP_D / 2, SKIRT = 1.2, DOOR = 1.15, T = 0.3;

/** each town builds its shops in its own colours */
const LOOK = {
  willowmere: { wall: 0xf1e4c8, timber: 0x6b4a2e, roof: 0x9c4a32, floor: 0x9a7552, rug: 0x8a3b3b },
  dune: { wall: 0xe2bf86, timber: 0x8a5a32, roof: 0xc0763a, floor: 0xb08a5a, rug: 0xb5562e },
  frost: { wall: 0xdde6ee, timber: 0x4d5b6b, roof: 0x3f5f7f, floor: 0x8f7458, rug: 0x3c6a8f },
  mire: { wall: 0x9a9670, timber: 0x4a3a28, roof: 0x55703c, floor: 0x6f5a40, rug: 0x5f7a3a },
  palm: { wall: 0xf6f1e6, timber: 0x3e8fb0, roof: 0x2f9fa8, floor: 0xc2a27a, rug: 0xe07a5f },
  ember: { wall: 0x7a6660, timber: 0x2f2522, roof: 0xa83a22, floor: 0x5e4636, rug: 0x9a3a1e },
};
/** Willowmere's people wear the same outfits as the player */
const OUTFITS = [...["Farmer", "Worker", "Casual_2", "Casual_Hoodie", "Adventurer", "Beach", "Suit"].map((n) => `ultimate_modular_men/${n}.gltf`), ...["Medieval", "Worker", "Casual", "Adventurer", "Formal", "Suit"].map((n) => `ultimate_modular_women/${n}.gltf`)];

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
const strHash = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100003, 7);

/** the sign over the door, painted on a little canvas */
function signTexture(text, col) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 112;
  const g = c.getContext("2d");
  g.fillStyle = "#" + new THREE.Color(col).multiplyScalar(0.75).getHexString(); g.fillRect(0, 0, 512, 112);
  g.strokeStyle = "#f3d9a4"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 96);
  g.fillStyle = "#fff4d8"; g.textAlign = "center"; g.textBaseline = "middle";
  let size = 54; do { g.font = `bold ${size}px Georgia, serif`; size -= 2; } while (g.measureText(text).width > 470 && size > 20);
  g.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** build one shop on its lot (lot.kit[0] is "shop:<its number in the town's list>"). Registers it in L.shops */
export async function buildShop(L, lot, addSolidFn) {
  const id = L.cfg.id, n = +lot.kit[0].split(":")[1], def = TOWN_SHOPS[id]?.[n];
  if (!def) return null;
  const look = LOOK[id] || LOOK.willowmere, land = L.land, ry = lot.ry, cs = Math.cos(ry), sn = Math.sin(ry);
  const y0 = lot.ter ? lot.ter.h : land.ground(lot.x, lot.z);
  const g = new THREE.Group(); g.position.set(lot.x, y0, lot.z); g.rotation.y = ry; L.group.add(g);
  const toLand = (x, z) => [lot.x + x * cs + z * sn, lot.z - x * sn + z * cs];
  const solid = (x, z, r) => { const [a, b] = toLand(x, z); addSolidFn(L, { x: a, z: b, r }); };
  const jobs = [];
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...o });
  const M = { wall: mat(look.wall), timber: mat(look.timber), roof: mat(look.roof, { side: THREE.DoubleSide }), floor: mat(look.floor), rug: mat(look.rug), wood: mat(0x7a5232), top: mat(0x5a3a22),
    glass: mat(0xffe2a0, { emissive: 0xffb050, emissiveIntensity: 0.75, roughness: 0.4 }), cloth: mat(0xd9c6a0) };
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, w, h, d, x, y, z, m, rx = 0, ryy = 0) => { const b = new THREE.Mesh(geo, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.rotation.set(rx, ryy, 0); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
  const put = (parent, kit, x, y, z, r = 0) => jobs.push(prop(kit[0], parent, { x, y, z, height: kit[1], ry: r }));

  // ---- the shell: floor, a low skirt of wall, the upper walls (front with its door and windows, back, sides) and the roof ----
  box(g, SHOP_W, 0.26, SHOP_D, 0, -0.11, 0, M.floor);
  // a stone footing under it all and a broad step at the door, reaching down into the ground so a shop on a slope never stands on air
  const stone = mat(look.stone ?? 0x9a9184);
  box(g, SHOP_W + 0.24, 1.8, SHOP_D + 0.24, 0, -1.14, 0, stone);
  box(g, DOOR * 2 + 0.9, 1.6, 0.9, 0, -0.93, HD + 0.45, stone);
  for (let x = -HW + 0.9; x < HW; x += 1.6) box(g, 0.04, 0.02, SHOP_D - 0.4, x, 0.025, 0, M.timber);          // the boards
  box(g, 3.2, 0.02, 2, 0, 0.04, 1.6, M.rug);
  const low = new THREE.Group(), up = { front: new THREE.Group(), back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() }, roof = new THREE.Group();
  g.add(low, roof, ...Object.values(up));
  const uh = SHOP_H - SKIRT, uy = SKIRT + uh / 2;
  // front: either side of the door, and over it
  const side = HW - DOOR, sx = DOOR + side / 2;
  for (const s of [-1, 1]) { box(low, side, SKIRT, T, s * sx, SKIRT / 2, HD - T / 2, M.wall); box(up.front, side, uh, T, s * sx, uy, HD - T / 2, M.wall); }
  box(up.front, DOOR * 2, SHOP_H - 2.75, T, 0, (SHOP_H + 2.75) / 2, HD - T / 2, M.wall);
  for (const s of [-1, 1]) box(up.front, 0.22, 2.85, T + 0.12, s * (DOOR + 0.05), 1.42, HD - T / 2, M.timber);               // the door frame
  box(up.front, DOOR * 2 + 0.5, 0.24, T + 0.12, 0, 2.86, HD - T / 2, M.timber);
  // back and sides
  box(low, SHOP_W, SKIRT, T, 0, SKIRT / 2, -HD + T / 2, M.wall); box(up.back, SHOP_W, uh, T, 0, uy, -HD + T / 2, M.wall);
  for (const [s, grp] of [[-1, up.left], [1, up.right]]) { box(low, T, SKIRT, SHOP_D - T * 2, s * (HW - T / 2), SKIRT / 2, 0, M.wall); box(grp, T, uh, SHOP_D - T * 2, s * (HW - T / 2), uy, 0, M.wall); }
  // the timber frame: corner posts, a rail where the skirt ends, a beam along the top
  for (const [x, z, grp] of [[-HW, HD, up.front], [HW, HD, up.front], [-HW, -HD, up.back], [HW, -HD, up.back]]) box(grp, 0.36, SHOP_H, 0.36, x - Math.sign(x) * 0.12, SHOP_H / 2, z - Math.sign(z) * 0.12, M.timber);
  for (const s of [-1, 1]) box(low, side + 0.05, 0.14, 0.08, s * (DOOR + (side + 0.05) / 2), SKIRT, HD + 0.02, M.timber);     // the front rail stops at the door frame
  box(low, SHOP_W + 0.1, 0.14, 0.08, 0, SKIRT, -HD - 0.02, M.timber);
  for (const s of [-1, 1]) box(low, 0.08, 0.14, SHOP_D, s * (HW + 0.02), SKIRT, 0, M.timber);
  box(up.front, SHOP_W + 0.2, 0.26, 0.4, 0, SHOP_H - 0.13, HD - 0.15, M.timber); box(up.back, SHOP_W + 0.2, 0.26, 0.4, 0, SHOP_H - 0.13, -HD + 0.15, M.timber);
  // glowing windows: two in front, one each side
  const win = (grp, x, z, alongX) => {
    box(grp, alongX ? 1.5 : T + 0.06, 1.1, alongX ? T + 0.06 : 1.5, x, 2.05, z, M.glass);
    for (const d of [-0.8, 0.8]) box(grp, alongX ? 0.12 : T + 0.14, 1.34, alongX ? T + 0.14 : 0.12, x + (alongX ? d : 0), 2.05, z + (alongX ? 0 : d), M.timber);
    for (const h of [1.44, 2.66]) box(grp, alongX ? 1.72 : T + 0.14, 0.12, alongX ? T + 0.14 : 1.72, x, h, z, M.timber);
    box(grp, alongX ? 0.08 : T + 0.1, 1.1, alongX ? T + 0.1 : 0.08, x, 2.05, z, M.timber);
  };
  win(up.front, -3.1, HD - T / 2, true); win(up.front, 3.1, HD - T / 2, true);
  win(up.left, -HW + T / 2, 0.6, false); win(up.right, HW - T / 2, 0.6, false);
  // the gable roof, its ridge running along the front
  const rise = 2.3, half = HD + 0.7, slab = Math.hypot(half, rise), pitch = Math.atan2(rise, half);
  for (const s of [-1, 1]) box(roof, SHOP_W + 1, 0.2, slab, 0, SHOP_H + rise / 2 + 0.05, s * half / 2, M.roof, s * pitch);
  box(roof, SHOP_W + 1.1, 0.28, 0.32, 0, SHOP_H + rise + 0.1, 0, M.timber);
  const tri = new THREE.Shape([new THREE.Vector2(-HD, 0), new THREE.Vector2(HD, 0), new THREE.Vector2(0, rise)]), gable = new THREE.ShapeGeometry(tri);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(gable, mat(look.wall, { side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.position.set(s * (HW - 0.05), SHOP_H, 0); m.castShadow = true; roof.add(m); }
  // the sign over the door, and a lantern either side of it
  box(up.front, 3.7, 0.86, 0.12, 0, 3.42, HD + 0.06, M.timber);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.74), new THREE.MeshStandardMaterial({ map: signTexture(def.title, look.timber), roughness: 0.8, emissive: 0x332211, emissiveIntensity: 0.3 }));
  sign.position.set(0, 3.42, HD + 0.13); up.front.add(sign);
  for (const s of [-1, 1]) put(up.front, K.lantern, s * 1.75, 2.15, HD + 0.08, 0);

  // ---- walls are solid, except the doorway ----
  for (let x = -HW + 0.3; x <= HW - 0.3; x += 0.55) { if (Math.abs(x) > DOOR + 0.25) solid(x, HD - 0.15, 0.36); solid(x, -HD + 0.15, 0.36); }
  for (let z = -HD + 0.3; z <= HD - 0.3; z += 0.55) { solid(-HW + 0.15, z, 0.36); solid(HW - 0.15, z, 0.36); }

  // ---- inside: a counter, and what this kind of shop has ----
  const spots = { keeper: null, guests: [] };
  const counter = (x0, x1, z, items = []) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    box(g, w, 1.0, 0.66, cx, 0.5, z, M.wood); box(g, w + 0.16, 0.08, 0.8, cx, 1.04, z, M.top);
    box(g, w, 0.12, 0.1, cx, 0.95, z + 0.36, M.timber);
    for (let x = x0 + 0.3; x <= x1 - 0.3 + 1e-6; x += 0.5) solid(x, z, 0.42);
    items.forEach(([kit, x, dz = 0, r = 0]) => put(g, kit, x, 1.08, z + dz, r));
  };
  /** a set of shelves against a wall: w wide, facing the room; each shelf's things spread along it */
  const shelves = (x, z, r, w, fill) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = r; g.add(s);
    for (const e of [-1, 1]) box(s, 0.08, 2.1, 0.44, e * w / 2, 1.05, 0, M.wood);
    box(s, w, 2.1, 0.04, 0, 1.05, -0.2, M.top);
    const levels = [0.06, 0.62, 1.18, 1.74];
    levels.forEach((h, li) => { box(s, w, 0.05, 0.44, 0, h, 0, M.wood); if (li) { const k = Math.max(2, Math.round(w / 0.42)); for (let i = 0; i < k; i++) { const kit = fill(li, i); if (kit) put(s, kit, -w / 2 + (i + 0.5) * w / k, h + 0.03, 0.02, (hash(i, li) - 0.5) * 0.6); } } });
    box(s, w + 0.1, 0.06, 0.48, 0, 2.12, 0, M.top);
    for (let u = -w / 2 + 0.25; u <= w / 2 - 0.25 + 1e-6; u += 0.45) { const [a, b] = [x + u * Math.cos(r), z - u * Math.sin(r)]; solid(a, b, 0.32); }
  };
  /** a little round table, with what's on it */
  const table = (x, z, items = [], hi = false) => {
    const h = hi ? 1.02 : 0.74, top = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 14), M.top); top.position.set(x, h, z); top.castShadow = top.receiveShadow = true; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 8), M.wood); leg.position.set(x, h / 2, z); g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.05, 10), M.wood); foot.position.set(x, 0.03, z); g.add(foot);
    items.forEach(([kit, dx, dz]) => put(g, kit, x + dx, h + 0.03, z + dz, hash(dx, dz) * 6));
    solid(x, z, 0.62);
  };
  const guest = (x, z, h) => spots.guests.push([x, z, h]);
  const pick = (list, i) => list[Math.floor(hash(i, n + 3) * list.length) % list.length];

  if (def.kind === "tavern") {
    counter(-4.3, 0.6, -1.7, [[K.mug, -3.6], [K.bottle, -2.4, -0.12], [K.mug, -1.0], [K.chalice, 0.1, 0.1], [K.candles, -1.9, -0.18]]);
    shelves(-3.3, -3.62, 0, 1.9, (li, i) => (li === 2 ? K.mug : (i + li) % 3 ? K.bottle : K.bottles));
    shelves(-1.2, -3.62, 0, 1.9, (li, i) => (li === 1 ? K.mug : (i * 2 + li) % 3 ? K.bottle : K.bottles));
    put(g, K.keg, 1.7, 0, -3.25, 0); solid(1.7, -3.25, 0.8);
    put(g, K.barrel, 4.2, 0, -3.3, 0); put(g, K.barrel, 4.2, 0, -2.25, 0.6); solid(4.2, -3.3, 0.55); solid(4.2, -2.25, 0.55);
    for (const x of [-3.9, -2.65, -1.4]) put(g, K.stool, x, 0, -0.95, hash(x, 1) * 6);
    // barrels for standing at with a drink, candles on them
    for (const [x, z] of [[2.6, 0.7], [-2.9, 2.2]]) { put(g, K.barrel, x, 0, z, hash(x, z) * 6); put(g, K.mug, x + 0.18, 1.07, z - 0.1, 1); put(g, K.mug, x - 0.2, 1.07, z + 0.12, 3); put(g, K.candle, x, 1.07, z + 0.2, 0); solid(x, z, 0.55); }
    put(g, K.bench, 4.25, 0, 2.2, -Math.PI / 2); solid(4.3, 2.2, 0.5); solid(4.3, 1.4, 0.4); solid(4.3, 3.0, 0.4);
    put(up.left, K.lantern, -HW + T + 0.02, 2.5, -1.8, Math.PI / 2); put(up.right, K.lantern, HW - T - 0.02, 2.5, -1.8, -Math.PI / 2);
    spots.keeper = [-1.9, -2.65, 0];
    guest(-3.25, -0.55, Math.PI); guest(2.6, 1.55, Math.PI); guest(-2.9, 1.35, 0); guest(1.75, 0.7, Math.PI / 2); guest(-0.6, -0.55, Math.PI);
  } else if (def.kind === "florist") {
    counter(1.3, 4.4, -1.6, [[K.can, 3.8, -0.1, 2.2], [pick(K.plantsSmall, 1), 1.7], [K.trowel, 2.6, 0.1, 1]]);
    shelves(-3.0, -3.62, 0, 3.2, (li, i) => pick(K.plantsSmall, li * 7 + i));
    shelves(-HW + 0.48, 0.5, Math.PI / 2, 3, (li, i) => pick(K.plantsSmall, li * 5 + i + 30));
    // a display table of little plants in the middle of the room
    box(g, 2.4, 0.72, 1.1, -1.2, 0.36, 1.0, M.wood); box(g, 2.5, 0.06, 1.2, -1.2, 0.75, 1.0, M.top);
    for (let i = 0; i < 8; i++) put(g, pick(K.plantsSmall, i + 60), -2.1 + (i % 4) * 0.6, 0.79, 0.72 + Math.floor(i / 4) * 0.56, hash(i, 2) * 6);
    for (const x of [-2.2, -1.2, -0.2]) solid(x, 1.0, 0.6);
    for (const [k, x, z] of [[0, 0.6, -3.25], [1, -4.2, 3.15], [2, 4.2, 3.15], [3, 4.3, 0.9], [4, -4.25, -2.3]]) { put(g, K.plantsBig[k % K.plantsBig.length], x, 0, z, hash(x, z) * 6); solid(x, z, 0.55); }
    put(g, K.pots, 4.3, 0, 2.05, 0); solid(4.3, 2.05, 0.35);
    spots.keeper = [2.85, -2.6, 0];
    guest(-1.2, 2.0, Math.PI); guest(-3.6, 0.6, -Math.PI / 2); guest(0.3, 0.2, -Math.PI / 2);
  } else if (def.kind === "bakery") {
    counter(-3.8, 1.0, -1.6, [...[...Array(8)].map((_, i) => [pick(K.bakes, i), -3.4 + i * 0.6, (i % 2 ? 0.12 : -0.12), hash(i, 5) * 6])]);
    shelves(-2.6, -3.62, 0, 2.6, (li, i) => pick(K.loaves, li * 3 + i));
    shelves(0.6, -3.62, 0, 1.6, (li, i) => (li === 3 ? pick(K.bakes, i + 20) : pick(K.loaves, li + i * 2)));
    put(g, K.apples, 4.2, 0, -3.3, 0); put(g, K.crate, 3.1, 0, -3.35, 0.3); solid(4.2, -3.3, 0.5); solid(3.1, -3.35, 0.5);
    for (const [x, z] of [[2.9, 0.3], [2.9, 2.55]]) { table(x, z, [[K.slice, 0.15, 0.1], [K.mug, -0.2, -0.15], [pick(K.bakes, x * 3 + z), 0.1, -0.25]]); put(g, K.stool, x + 0.85, 0, z, 0); }
    put(g, K.stool, 2.05, 0, 2.55, 0);
    spots.keeper = [-1.4, -2.6, 0];
    guest(-2.7, -0.6, Math.PI); guest(2.05, 0.3, Math.PI / 2); guest(-0.2, -0.6, Math.PI);
  } else {                                                    // the tea house
    counter(1.2, 4.4, -1.6, [[K.pot, 1.8], [K.jar, 2.6, -0.1], [K.jar, 3.1, 0.1], [K.mug, 3.8]]);
    put(g, K.cauldron, 3.9, 0, -3.2, 0); solid(3.9, -3.2, 0.5);
    shelves(-2.8, -3.62, 0, 3.4, (li, i) => [K.jar, K.vase, K.pot, K.mug][(li + i) % 4]);
    for (const [x, z] of [[-2.7, 0.4], [-2.7, 2.65], [1.6, 1.9]]) { table(x, z, [[K.pot, 0, 0], [K.mug, 0.3, 0.15], [K.mug, -0.28, -0.12]]); put(g, K.stool, x + 0.85, 0, z, 0); }
    put(up.left, K.lantern, -HW + T + 0.02, 2.5, 1.5, Math.PI / 2); put(up.right, K.lantern, HW - T - 0.02, 2.5, 1.5, -Math.PI / 2);
    spots.keeper = [2.6, -2.6, 0];
    guest(-3.55, 0.4, Math.PI / 2); guest(-1.85, 2.65, -Math.PI / 2); guest(0.75, 1.9, Math.PI / 2);
  }
  await Promise.all(jobs);
  const shop = { def, key: shopKey(id, n), L, lot, group: g, roof, up, spots, look, inv: new THREE.Matrix4() };
  (L.shops ||= []).push(shop);
  return shop;
}

/** the keeper and the regulars of every shop on this turtle, as people you can talk to (creatures.js adds them to G.people) */
export async function shopPeople(G, L) {
  const id = L.cfg.id, out = [];
  for (const sh of L.shops || []) {
    const d = sh.def, who = [[d.keeper, sh.spots.keeper, true], ...d.regulars.map((r, i) => [r, sh.spots.guests[i], false])];
    for (let e = 0; e < (d.extras || 0); e++) who.push([null, sh.spots.guests[d.regulars.length + e], false]);
    await Promise.all(who.map(async ([n, spot, keeper], j) => {
      if (!spot) return;
      const seed = strHash(`${id}${d.title}${j}`), path = townModel(id, seed) || OUTFITS[seed % OUTFITS.length];
      const c = await character(path, 1.72);
      if (!c) return;
      const [lx, lz, lh] = spot, ry = sh.lot.ry, cs = Math.cos(ry), sn = Math.sin(ry);
      const x = sh.lot.x + lx * cs + lz * sn, z = sh.lot.z - lx * sn + lz * cs, y = sh.group.position.y + 0.02;
      const p = { id: `shop:${sh.key}:${j}`, data: n ? { name: n.name, role: n.role, talk: n.talk, shop: keeper ? sh.key : null } : { name: "", role: "", talk: [] }, quiet: !n, keeper, char: c, L, pos: new THREE.Vector3(x, y, z), heading: ry + lh, line: 0, sip: 3 + hash(seed, j) * 8 };
      L.group.add(c.holder); c.holder.position.copy(p.pos); c.holder.rotation.y = p.heading;
      // a drink in the hand of anyone at the bar or the tea tables
      if (!keeper && (d.kind === "tavern" || d.kind === "teahouse")) holdCup(c);
      p.here = () => true;
      p.world = () => { const [a, b] = L.world(p.pos.x, p.pos.z); return new THREE.Vector3(a, p.pos.y + L.group.position.y, b); };
      p.tick = (dt, near) => {
        if (!near) return;
        c.mixer.update(dt);
        const talking = G.talkingTo === p;
        let h = ry + lh;
        if (talking) { const P = G.player.pos, w = p.world(); h = Math.atan2(P.x - w.x, P.z - w.z) - L.group.rotation.y; }
        p.heading += Math.atan2(Math.sin(h - p.heading), Math.cos(h - p.heading)) * Math.min(1, dt * 6);
        c.holder.rotation.y = p.heading;
        c.play(talking ? "act" : "idle");
        // now and then, a sip (or, behind the counter, a wipe of the bar)
        if (!talking && (p.sip -= dt) < 0) { p.sip = 6 + Math.random() * 9; c.once?.("use"); }
      };
      out.push(p);
    }));
  }
  return out;
}

/** put a cup in a character's right hand, if it has one we can find */
function holdCup(c) {
  // a hand bone if there is one, else the wrist; on the right: "RightHand", "Hand.R", "hand_r", "WristR"...
  const right = (n) => /right/i.test(n) || /(^|[._:\s-])r([._\s-]|$)|_r$|\.r$|^r_/i.test(n) || /[a-z]R$/.test(n);
  const bones = []; c.root.traverse((o) => { if (/hand|fist|wrist/i.test(o.name) && !/thumb|index|middle|ring|pinky|finger/i.test(o.name) && right(o.name)) bones.push(o); });
  const hand = bones.find((o) => /hand|fist/i.test(o.name)) || bones[0];
  if (!hand) return;
  c.root.updateMatrixWorld(true);
  const s = hand.getWorldScale(new THREE.Vector3()).x || 1;
  prop(K.mug[0], hand, { height: K.mug[1] }).then((m) => { if (!m) return; m.scale.divideScalar(s); m.position.set(0, 0.07 / s, 0.04 / s); });
}

/** each frame: the warm light goes to the shop you're at, and the roof and the walls in the camera's way lift off while you're inside */
export function makeShops(G) {
  const light = new THREE.PointLight(0xffc27a, 0, 15, 1.4), v = new THREE.Vector3(), c = new THREE.Vector3();
  G.scene.add(light);
  let inside = null;
  return {
    get inside() { return inside; },
    tick() {
      const P = G.player.pos, cam = G.camera.position;
      let best = null, bd = 18; inside = null;
      for (const L of G.world.list) {
        if (!L.shops?.length || L.dist(P.x, P.z) > L.cfg.a + 40) continue;
        for (const sh of L.shops) {
          sh.inv.copy(sh.group.matrixWorld).invert();
          v.copy(P).applyMatrix4(sh.inv);
          const d = Math.hypot(v.x, v.z), inRoom = Math.abs(v.x) < HW - 0.05 && Math.abs(v.z) < HD - 0.05 && v.y > -1.5 && v.y < SHOP_H;
          if (d < bd) { bd = d; best = sh; }
          if (inRoom) {
            inside = sh;
            c.copy(cam).applyMatrix4(sh.inv);
            sh.roof.visible = false;
            sh.up.front.visible = c.z < HD - 0.4; sh.up.back.visible = c.z > -HD + 0.4; sh.up.right.visible = c.x < HW - 0.4; sh.up.left.visible = c.x > -HW + 0.4;
            sh.open = true;
          } else if (sh.open) { sh.open = false; sh.roof.visible = true; for (const w of Object.values(sh.up)) w.visible = true; }
        }
      }
      if (best) { light.position.set(0, 3.1, -0.4).applyMatrix4(best.group.matrixWorld); light.intensity = Math.max(0, 1 - bd / 18) * 22; } else light.intensity = 0;
    },
  };
}

export { SHOP_KINDS };
