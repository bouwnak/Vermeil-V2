// cave.js - under the far turtles. Press E at a cave mouth and you go down into it: a dark place of its own, far from the sea, of chambers and
// winding tunnels, lit only by what glows in the rock and by whatever light you brought (a torch, a lantern, a flashlight, made at the workbench).
// The Shellwrights hid their lamps down here when the storms came ("we kept the light in hollow places"), and each cave keeps one of their chests
// in its deepest chamber. A shaft of daylight at the way in takes you back out.
import * as THREE from "three";
import { COMPANION, ITEMS, itemName } from "./data.js";
import { forest, loadModel } from "./assets.js";
import { addSolid } from "./world.js";
import { fbm } from "./terrain.js";
import { popup } from "./ui.js";
import { RUIN_PARTS, LIGHT_PARTS } from "./wilddata.js";

const GROWN = "conv_ultimate_nature_pack/", MEGA = "stylized_nature_megakit/";
const O = { x: 16000, z: 16000 };                             // where the caves are: far past the edge of the world, so nothing outside can be seen
const TOP = 26;                                               // the rock above: walls rise to it and the ceiling comes down to meet them
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const segDist = (x, z, a, b) => { const vx = b.x - a.x, vz = b.z - a.z, u = Math.min(1, Math.max(0, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1))); return Math.hypot(x - a.x - vx * u, z - a.z - vz * u); };
const rng = (seed) => { let s = Math.floor(seed * 9301 + 49297) % 233280 || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const strSeed = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1e6, 17);

/** what each turtle's caves are like: the rock, what glows in it, what can be chipped out, and the Shellwright chest's prize */
export const CAVE_THEMES = {
  hollow: { name: "the Hollowshell caverns", rock: 0x45444c, floor: 0x55514c, glow: [0x7fe8ff, 0xc89aff, 0x9affc8], loot: "crystal", prize: "glowstone", size: 1.3 },
  pillar: { name: "the catacombs under Pillarback", rock: 0x5e564a, floor: 0x7a6e5c, glow: [0xffc870, 0xffe0a0], loot: "relic", prize: "shellcoin", catacomb: true, size: 1.2 },
  mist: { name: "the ice caves of Mistcrown", rock: 0x7d8898, floor: 0xa8b4c4, glow: [0xbff4ff, 0xe8fbff], loot: "crystal", prize: "cloudpearl", size: 1 },
  fernwood: { name: "the root caves of Fernhold", rock: 0x464c3c, floor: 0x4e5a3e, glow: [0x9aff8a, 0xd8ff6a], loot: "wildcap", prize: "amber", mush: true, size: 1.1 },
  thorn: { name: "the burrows under Thornwild", rock: 0x4a4334, floor: 0x5a4e3a, glow: [0xffb050, 0xff8a60], loot: "ore", prize: "thornberry", size: 1 },
  reef: { name: "the sea caves of Lagoonback", rock: 0x3a545a, floor: 0x5a7a74, glow: [0x6af0e0, 0x8ab0ff], loot: "pearl", prize: "coralbloom", pool: true, size: 1 },
  salt: { name: "the salt mine of Glassflat", rock: 0xa8a094, floor: 0xcac2b6, glow: [0xe8f8ff, 0xffd0f0], loot: "crystal", prize: "mirrorcrystal", size: 1.1 },
  bloom: { name: "the grotto of Bloomdrift", rock: 0x58524a, floor: 0x6a6050, glow: [0xff9ad8, 0xffe07a], loot: "herb", prize: "shellclover", mush: true, size: 0.8 },
};
/** the lights you can carry, best first. range is how far it reaches; spot: a beam ahead of you rather than all round */
export const LIGHTS = [
  { id: "flashlight", color: 0xf4f8ff, range: 60, power: 150, spot: true, fill: 0.9 },
  { id: "lantern", color: 0xffe2a8, range: 30, power: 60 },
  { id: "torch", color: 0xffa04a, range: 22, power: 42, flicker: true, burns: true },
];

/** the five ways a cave can be laid out. Which one you get is picked at random each time you go in, so no two trips are the same */
export const CAVE_MAPS = [
  { id: "warren", name: "the Winding Warren", say: "Tunnels everywhere, going down and down. Let's not get lost." },
  { id: "descent", name: "the Spiral Descent", say: "It spirals down... way down. Watch your footing." },
  { id: "cathedral", name: "the Crystal Cathedral", say: "Look at the size of this place! The roof's held up by stone pillars." },
  { id: "gorge", name: "the Sunken Stream", say: "Hear that? Water, running through the rock. Follow it and we'll find the bottom." },
  { id: "honeycomb", name: "the Honeycomb Halls", say: "Little rooms all joined up like a beehive. Something's in the deepest one." },
];

/** the shape of one cave: chambers joined by tunnels, each chamber at its own depth (y), the way in at 0,0 and the deepest chamber last */
function layout(key, size, style = "warren") {
  const R = rng(strSeed(key + style)), rooms = [{ x: 0, z: 0, r: 8, y: 0, entry: true }], tunnels = [];
  const link = (a, b, w = 2.4 + R() * 1.4) => tunnels.push({ a, b, w });
  const free = (x, z, r, pad = 5) => !rooms.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + pad);
  if (style === "descent") {                                  // one long spiral going down, a ledge room at every turn
    let ang = R() * 6.3, rad = 0;
    for (let i = 1; i < Math.round(10 * size); i++) {
      ang += 0.95 + R() * 0.25; rad += 9 + R() * 4;
      const r = 6 + R() * 4, x = Math.cos(ang) * rad, z = Math.sin(ang) * rad, prev = rooms[rooms.length - 1];
      if (!free(x, z, r, 3)) continue;
      const room = { x, z, r, y: prev.y - (3.5 + R() * 2) }; rooms.push(room); link(prev, room, 3 + R());
    }
  } else if (style === "cathedral") {                         // a short way down into one huge pillared hall, side chapels round it
    const ang = R() * 6.3, hall = { x: Math.cos(ang) * 46, z: Math.sin(ang) * 46, r: 26 + R() * 6, y: -9, hall: true };
    const mid = { x: Math.cos(ang) * 20, z: Math.sin(ang) * 20, r: 6, y: -4 };
    rooms.push(mid, hall); link(rooms[0], mid, 3.2); link(mid, hall, 3.6);
    for (let k = 0; k < Math.round(5 * size); k++) {
      const m = Math.max(1, Math.round(5 * size) - 1), a = ang - Math.PI / 2 + k / m * Math.PI + (R() - 0.5) * 0.2;
      const d = hall.r + 14 + R() * 8, r = 6 + R() * 4, x = hall.x + Math.cos(a) * d, z = hall.z + Math.sin(a) * d;
      if (!free(x, z, r, 3)) continue;
      const room = { x, z, r, y: hall.y - 1.5 - R() * 4 }; rooms.push(room); link(hall, room, 2.6 + R());
    }
  } else if (style === "gorge") {                             // a long winding stream bed with pools, dropping slowly
    let ang = R() * 6.3;
    for (let i = 1; i < Math.round(11 * size); i++) {
      for (let tries = 0; tries < 10; tries++) {
        const prev = rooms[rooms.length - 1]; ang += (R() - 0.5) * 1.3;
        const len = 20 + R() * 10, r = 6 + R() * 3.5, x = prev.x + Math.cos(ang) * len, z = prev.z + Math.sin(ang) * len;
        if (!free(x, z, r, 3)) continue;
        const room = { x, z, r, y: prev.y - (1.5 + R() * 2), pool: i % 2 === 0 }; rooms.push(room); link(prev, room, 4 + R() * 1.2);
        break;
      }
    }
  } else if (style === "honeycomb") {                         // small rooms on a hex grid, joined to their neighbours; deeper the further in
    const sp = 22, cells = [];
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) { if (Math.abs(q + r) > 3 || (!q && !r)) continue; const x = sp * (q + r / 2), z = sp * r * 0.866; if (R() < 0.75 * size) cells.push({ x: x + (R() - 0.5) * 4, z: z + (R() - 0.5) * 4, r: 6 + R() * 3, y: -Math.hypot(x, z) * 0.24 - R() * 2 }); }
    const linked = [rooms[0]];
    while (cells.length) {           // grow out from the way in, always joining the nearest room not yet reached
      let best = null, bd = 1e9, from = null;
      for (const c of cells) for (const o of linked) { const d = Math.hypot(c.x - o.x, c.z - o.z); if (d < bd) { bd = d; best = c; from = o; } }
      if (bd > sp * 1.6) break;
      cells.splice(cells.indexOf(best), 1); rooms.push(best); linked.push(best); link(from, best, 2.6 + R() * 0.8);
      if (R() < 0.3) { const other = linked.find((o) => o !== from && o !== best && Math.hypot(o.x - best.x, o.z - best.z) < sp * 1.2); if (other) link(best, other, 2.4); }      // a few loops
    }
  } else {                                                    // the warren: branching chambers, each a little lower
    const n = Math.round((7 + R() * 3) * size);
    let ang = R() * 6.3;
    for (let i = 1; i < n; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const from = i < 4 ? rooms[i - 1] : rooms[Math.floor(R() * rooms.length)];
        ang += (R() - 0.5) * 2.2;
        const len = 26 + R() * 20, r = 7 + R() * 9, x = from.x + Math.cos(ang) * len, z = from.z + Math.sin(ang) * len;
        if (!free(x, z, r)) continue;
        const room = { x, z, r, y: from.y - (1.5 + R() * 3) }; rooms.push(room); link(from, room);
        break;
      }
    }
  }
  let deep = rooms[0];
  for (const r of rooms) if (r.y < deep.y || (r.y === deep.y && Math.hypot(r.x, r.z) > Math.hypot(deep.x, deep.z))) deep = r;
  deep.deep = true; deep.r = Math.max(deep.r, 11);
  return { rooms, tunnels, deep, R };
}

export function makeCave(G) {
  const s = G.s, C = { on: false };
  s.caveTook ||= {}; s.caveChest ||= {};
  let here = null, held = null, light = null, fill = null, prop = null;

  // ---------------- the light you carry ----------------
  const best = () => LIGHTS.find((l) => (s.inv[l.id] || 0) > 0) || null;
  async function carry(kind) {
    if (light) { G.scene.remove(light, light.target, fill, prop); light.dispose?.(); fill?.dispose?.(); }
    light = fill = prop = null; held = kind;
    if (!kind) return;
    if (kind.spot) { light = new THREE.SpotLight(kind.color, kind.power, kind.range, 0.55, 0.75, 1.1); G.scene.add(light.target); }
    else light = new THREE.PointLight(kind.color, kind.power, kind.range, 1.25);
    fill = new THREE.PointLight(kind.color, kind.spot ? 5 : 0, 10, 1.5);
    light.castShadow = false; G.scene.add(light, fill);
    prop = new THREE.Group(); G.scene.add(prop);
    const path = LIGHT_PARTS[kind.id];
    if (path) {
      const g = await loadModel(path);
      if (g && held === kind) { const o = g.scene.clone(true), box = new THREE.Box3().setFromObject(o), k = (kind.id === "torch" ? 0.75 : 0.32) / Math.max(box.max.y - box.min.y, box.max.z - box.min.z, 1e-3); o.scale.setScalar(k); if (kind.spot) o.rotation.y = Math.PI / 2; prop.add(o); }
    } else {                                                    // a little lantern: a frame round a warm glass, on a handle
      const m = (geo, c, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, c); o.position.set(x, y, z); prop.add(o); return o; };
      const iron = new THREE.MeshStandardMaterial({ color: 0x3a3430, flatShading: true }), glow = new THREE.MeshBasicMaterial({ color: 0xffd890 });
      m(new THREE.BoxGeometry(0.16, 0.2, 0.16), glow, 0, 0.12); m(new THREE.CylinderGeometry(0.02, 0.12, 0.08, 6), iron, 0, 0.26); m(new THREE.BoxGeometry(0.2, 0.03, 0.2), iron, 0, 0.01); m(new THREE.TorusGeometry(0.06, 0.01, 4, 8, Math.PI), iron, 0, 0.32);
    }
  }

  // ---------------- building a cave ----------------
  const ground = (x, z) => (here ? here.floor(x - O.x, z - O.z) : 0);
  async function build(key, theme, style = "warren") {
    const T = theme, { rooms, tunnels, deep, R } = layout(key, T.size || 1, style), group = new THREE.Group(), jobs = [], anim = [];
    group.position.set(O.x, 0, O.z);
    // how far inside the open space a point is: below 0 you can stand there
    const dist = (x, z) => {
      let d = 1e9;
      for (const r of rooms) { const a = Math.atan2(z - r.z, x - r.x); d = Math.min(d, Math.hypot(x - r.x, z - r.z) - r.r * (0.85 + fbm(Math.cos(a) * 2 + r.x, Math.sin(a) * 2 + r.z) * 0.35)); }
      for (const t of tunnels) d = Math.min(d, segDist(x, z, t.a, t.b) - t.w * (0.8 + fbm(x * 0.08, z * 0.08) * 0.5));
      return d;
    };
    // how deep the cave floor is here: each chamber has its own depth, a tunnel slopes between its two ends, blended where they meet
    const level = (x, z) => {
      let sw = 0, sy = 0;
      for (const r of rooms) { const d = Math.max(0, Math.hypot(x - r.x, z - r.z) - r.r * 0.7), w = Math.exp(-d * 0.35); sw += w; sy += w * r.y; }
      for (const t of tunnels) { const vx = t.b.x - t.a.x, vz = t.b.z - t.a.z, u = Math.min(1, Math.max(0, ((x - t.a.x) * vx + (z - t.a.z) * vz) / (vx * vx + vz * vz || 1))), d = Math.hypot(x - t.a.x - vx * u, z - t.a.z - vz * u), w = Math.exp(-d * 0.35) * 1.2; sw += w; sy += w * (t.a.y + (t.b.y - t.a.y) * smooth(0.15, 0.85, u)); }
      return sw > 1e-6 ? sy / sw : 0;
    };
    const floor = (x, z) => { const d = dist(x, z), base = (fbm(x * 0.07 + 3, z * 0.07) - 0.5) * 1.8 + level(x, z); return d <= 0 ? base : base + smooth(0, 3.4, d) * TOP + fbm(x * 0.2, z * 0.2) * 2 * smooth(0, 2, d); };
    const roof = (x, z) => { const d = dist(x, z), big = rooms.find((r) => Math.hypot(x - r.x, z - r.z) < r.r), inner = big ? (big.hall ? 12 : 4) : 0; return level(x, z) + TOP + 2 - (1 - smooth(-5, 1.5, d)) * (TOP + 2 - (6.5 + inner + fbm(x * 0.1 + 9, z * 0.1) * 5)); };

    // the rock: one faceted floor and one ceiling over the whole cave, the walls where they bend up to meet
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const r of rooms) { x0 = Math.min(x0, r.x - r.r - 10); x1 = Math.max(x1, r.x + r.r + 10); z0 = Math.min(z0, r.z - r.r - 10); z1 = Math.max(z1, r.z + r.r + 10); }
    const cell = 1.5, nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
    const sheet = (height, under) => {
      const pos = [], col = [], c = new THREE.Color(), D = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell + (Math.sin(i * 7.1 + j * 3.3) * 0.35), z = z0 + j * cell + (Math.cos(i * 2.7 + j * 5.9) * 0.35), y = height(x, z), d = dist(x, z);
        D[i + j * nx] = d; pos.push(x, y, z);
        const n = fbm(x * 0.15, z * 0.15);
        c.setHex(under ? T.rock : d < 0.5 ? T.floor : T.rock).offsetHSL(0, 0, (n - 0.5) * 0.14 - (under ? 0.04 : 0) + (!under && d > 0.5 ? -smooth(0, 6, d) * 0.04 : 0));
        if (!under && d < 0 && n > 0.62 && (T.mush || T.pool)) c.lerp(new THREE.Color(T.mush ? 0x4a6a3a : 0x3a6a6a), 0.35);
        col.push(c.r, c.g, c.b);
      }
      const idx = [];
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = i + j * nx, b = a + 1, cc = a + nx, d = cc + 1;
        if (Math.min(D[a], D[b], D[cc], D[d]) > 5) continue;             // solid rock all through: nothing to draw
        if (under) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: under ? THREE.DoubleSide : THREE.FrontSide }));
      m.receiveShadow = true; group.add(m); return m;
    };
    sheet(floor, false); sheet(roof, true);

    const solids = [], spotsIn = (n, pad, test = () => true) => {
      const out = [];
      for (let i = 0; i < n * 10 && out.length < n; i++) {
        const r = rooms[Math.floor(R() * rooms.length)], a = R() * 6.3, d = Math.sqrt(R()) * r.r, x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
        if (dist(x, z) > -pad || Math.hypot(x, z) < 6 || !test(x, z)) continue;
        out.push([x, z]);
      }
      return out;
    };
    const mat = (c, more = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...more });
    const rockMat = mat(T.rock), glows = T.glow.map((c) => mat(c, { emissive: c, emissiveIntensity: 1.6, roughness: 0.3 }));
    // stalagmites up from the floor and stalactites down from the roof, in a few instanced meshes
    const cone = new THREE.ConeGeometry(1, 1, 6), up = [], down = [];
    for (const [x, z] of spotsIn(Math.round(70 * (T.size || 1)), 1.2)) up.push([x, z, 0.4 + R() * 0.9, 1.2 + R() * 3.6]);
    for (let i = 0; i < 160 * (T.size || 1); i++) { const r = rooms[Math.floor(R() * rooms.length)], a = R() * 6.3, d = Math.sqrt(R()) * r.r * 1.05, x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d; if (dist(x, z) < 1) down.push([x, z, 0.3 + R() * 0.7, 1 + R() * 4]); }
    for (const [list, flip] of [[up, false], [down, true]]) {
      const inst = new THREE.InstancedMesh(cone, rockMat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach(([x, z, w, h], i) => { const y = flip ? roof(x, z) - h / 2 + 0.3 : floor(x, z) + h / 2 - 0.2; q.setFromEuler(new THREE.Euler(flip ? Math.PI : 0, R() * 6, (R() - 0.5) * 0.2)); m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, w)); inst.setMatrixAt(i, m); });
      inst.castShadow = false; inst.receiveShadow = true; group.add(inst);
    }
    for (const [x, z, w] of up) if (w > 0.8) solids.push({ x, z, r: w * 0.8 });
    // boulders and mossy rocks from the nature pack
    const boulders = spotsIn(Math.round(36 * (T.size || 1)), 0.8).map(([x, z]) => ({ x, y: floor(x, z) - 0.3, z, ry: R() * 6.3, s: 0.7 + R() * 1.4 }));
    for (let k = 1; k <= 4; k++) jobs.push(forest(`${GROWN}Rock_Moss_${k}.glb`, group, boulders.filter((_, i) => i % 4 === k - 1)));
    for (const b of boulders) if (b.s > 1.2) solids.push({ x: b.x, z: b.z, r: b.s * 0.7 });
    if (T.mush) jobs.push(forest(`${MEGA}Mushroom_Common.gltf`, group, spotsIn(70, 0.5).map(([x, z]) => ({ x, y: floor(x, z) - 0.05, z, ry: R() * 6, s: 1 + R() * 1.6 }))), forest(`${MEGA}Mushroom_Laetiporus.gltf`, group, spotsIn(30, 0.5).map(([x, z]) => ({ x, y: floor(x, z), z, ry: R() * 6, s: 1.4 + R() }))));
    // a few little glowing caps and specks everywhere, so the dark has points of light in it
    const speck = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), glows[0], 220), m4 = new THREE.Matrix4();
    for (let i = 0; i < 220; i++) { const [x, z] = spotsIn(1, 0.3)[0] || [0, 0], hi = R() < 0.5; m4.makeTranslation(x, hi ? roof(x, z) - 0.2 : floor(x, z) + 0.1, z); speck.setMatrixAt(i, m4); }
    group.add(speck);

    // crystal clusters: they glow, and you can chip a piece off each once a day
    const clusters = spotsIn(Math.round(10 * (T.size || 1)), 1.5);
    clusters.forEach(([x, z], i) => {
      const c = new THREE.Group(), y = floor(x, z), gm = glows[i % glows.length];
      for (let k = 0; k < 7; k++) { const h = 0.9 + R() * 2.4, o = new THREE.Mesh(new THREE.ConeGeometry(0.22 + R() * 0.25, h, 5), gm); o.position.set((R() - 0.5) * 1.4, h / 2 - 0.1, (R() - 0.5) * 1.4); o.rotation.set((R() - 0.5) * 0.8, R() * 6, (R() - 0.5) * 0.8); c.add(o); }
      c.position.set(x, y, z); group.add(c);
      if (i < 4) { const l = new THREE.PointLight(T.glow[i % T.glow.length], 9, 14, 1.4); l.position.set(x, y + 1.6, z); group.add(l); }       // only the first few light the rock round them
      const k = `${key}:${style}:c${i}`;
      solids.push({ x, z, r: 0.9, use: () => (s.caveTook[k] === s.day ? null : [`Chip off ${itemName(T.loot)}`, () => { s.caveTook[k] = s.day; G.add(T.loot, 1 + (R() < 0.3 ? 1 : 0)); G.sfx("stonebreak"); G.vfx.burst("glow", O.x + x, y + 1, O.z + z, 1); popup(`+ ${ITEMS[T.loot].icon} ${itemName(T.loot)}`, "good"); }]) });
    });

    // the catacombs: columns holding up the roof, bones in the niches, candles that still burn
    if (T.catacomb) {
      const cols = [];
      for (const r of rooms) if (!r.entry) for (let k = 0; k < 6; k++) { const a = k / 6 * 6.3, x = r.x + Math.cos(a) * r.r * 0.62, z = r.z + Math.sin(a) * r.r * 0.62; if (dist(x, z) < -1) cols.push([x, z, k % 3 === 2 ? RUIN_PARTS.broken : RUIN_PARTS.column]); }
      for (const [x, z] of cols) solids.push({ x, z, r: 0.9 });
      jobs.push(sized(RUIN_PARTS.column, group, cols.filter((c) => c[2] === RUIN_PARTS.column).map(([x, z]) => ({ x, y: floor(x, z), z, ry: 0 })), (x, z) => roof(x, z) - floor(x, z) + 0.5));
      jobs.push(sized(RUIN_PARTS.broken, group, cols.filter((c) => c[2] === RUIN_PARTS.broken).map(([x, z]) => ({ x, y: floor(x, z), z, ry: R() * 6 })), () => 3));
      jobs.push(sized(RUIN_PARTS.bones, group, spotsIn(14, 0.8).map(([x, z]) => ({ x, y: floor(x, z), z, ry: R() * 6 })), () => 0.6));
      jobs.push(sized(RUIN_PARTS.candles, group, spotsIn(8, 1).map(([x, z]) => ({ x, y: floor(x, z), z, ry: R() * 6 })), () => 2));
    }
    // still pools along the sunken stream, glowing a little from the crystals under them
    for (const r of rooms) if (r.pool) { const p = new THREE.Mesh(new THREE.CircleGeometry(r.r * 0.6, 16), mat(0x3fb8c8, { transparent: true, opacity: 0.78, roughness: 0.1, emissive: 0x0a4a50, emissiveIntensity: 0.8 })); p.rotation.x = -Math.PI / 2; p.position.set(r.x, floor(r.x, r.z) + 0.3, r.z); group.add(p); const l = new THREE.PointLight(0x6ae8e0, 5, 14, 1.5); l.position.set(r.x, floor(r.x, r.z) + 1.2, r.z); group.add(l); }
    // the great hall's pillars: stone columns floor to roof, a crystal ring round each foot
    for (const r of rooms) if (r.hall) {
      const n = 8, geo = new THREE.CylinderGeometry(1.4, 2.2, 1, 7), cols = new THREE.InstancedMesh(geo, rockMat, n), m = new THREE.Matrix4();
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.3 + 0.3, x = r.x + Math.cos(a) * r.r * 0.55, z = r.z + Math.sin(a) * r.r * 0.55, y0 = floor(x, z), y1 = roof(x, z) + 1;
        m.compose(new THREE.Vector3(x, (y0 + y1) / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6, 0)), new THREE.Vector3(1, y1 - y0, 1)); cols.setMatrixAt(k, m);
        solids.push({ x, z, r: 2.2 });
        const gm = glows[k % glows.length]; for (let q = 0; q < 4; q++) { const o = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1 + R() * 1.4, 5), gm); const b = q / 4 * 6.3 + R(); o.position.set(x + Math.cos(b) * 2.4, y0 + 0.4, z + Math.sin(b) * 2.4); o.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6); group.add(o); }
      }
      group.add(cols);
      const l = new THREE.PointLight(T.glow[0], 14, r.r * 1.4, 1.2); l.position.set(r.x, floor(r.x, r.z) + 10, r.z); group.add(l);
    }
    // a still pool in one of the chambers
    if (T.pool) { const r = rooms[Math.min(2, rooms.length - 1)], p = new THREE.Mesh(new THREE.CircleGeometry(r.r * 0.55, 14), mat(0x3fb8c8, { transparent: true, opacity: 0.75, roughness: 0.1, emissive: 0x0a4a50, emissiveIntensity: 0.6 })); p.rotation.x = -Math.PI / 2; p.position.set(r.x, floor(r.x, r.z) + 0.35, r.z); group.add(p); }

    // the deepest chamber: the Shellwrights' lamp, gone cold, and their chest beside it
    {
      const { x, z } = deep, y = floor(x, z), stone = mat(0xb5ad98), lamp = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.2, 8), stone), post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 7), stone);
      base.position.y = 0.6; post.position.y = 2.4; lamp.add(base, post);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.5, 0.6, 9), stone); bowl.position.y = 3.9; lamp.add(bowl);
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(T.glow[0], { emissive: T.glow[0], emissiveIntensity: 2 })); flame.position.y = 4.4; lamp.add(flame);
      const lit = new THREE.PointLight(T.glow[0], 16, 22, 1.3); lit.position.y = 4.8; lamp.add(lit);
      lamp.position.set(x, y, z); group.add(lamp); solids.push({ x, z, r: 1.5 });
      const cx = x + 3.2, cz = z + 1, open = !!s.caveChest[key];
      jobs.push(sized(RUIN_PARTS.chest, group, [{ x: cx, y: floor(cx, cz), z: cz, ry: -0.6 }], () => 1.1));
      solids.push({ x: cx, z: cz, r: 0.9, use: () => (s.caveChest[key] ? null : ["Open the Shellwright chest", () => {
        s.caveChest[key] = true; G.add(T.prize, 1); G.add("relic", 1); s.money += 150; G.sfx("fanfare"); G.vfx.burst("glow", O.x + cx, y + 1.2, O.z + cz, 2);
        popup(`${ITEMS[T.prize].icon} ${itemName(T.prize)}, an Old Relic and 150 shells`, "good");
        G.talk.say(COMPANION.name, ["A Shellwright chest... and their lamp, still burning after all this time.", "'When storms came down we kept the light in hollow places.' They really did."]);
      }]) });
      void open;
    }
    // the way in: a shaft of daylight from a crack in the roof. Stand in it to climb back out
    {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, TOP, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending, fog: false }));
      shaft.position.set(0, TOP / 2, 0); group.add(shaft);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 14), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, floor(0, 0) + 0.08, 0); group.add(pool);
      const day = new THREE.PointLight(0xfff0d0, 22, 18, 1.3); day.position.set(0, 9, 0); group.add(day);
      jobs.push(forest(`${MEGA}Fern_1.gltf`, group, [0, 1, 2, 3, 4, 5].map((i) => { const a = i, x = Math.cos(a) * 3.2, z = Math.sin(a) * 3.2; return { x, y: floor(x, z), z, ry: a, s: 1.2 }; })));
      solids.push({ x: 0, z: 0, r: 1.6, use: () => ["Climb back out", () => C.leave()] });
      // a knotted rope hanging down the shaft, so the way out reads as a way out from across the chamber
      const ropeM = mat(0xb08a52), y0 = floor(0, 0);
      for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, TOP, 5), ropeM); r.position.set(-0.35 + k * 0.7, y0 + TOP / 2, -0.6); group.add(r); }
      for (let k = 0; k < 14; k++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.12), mat(0x8a6a3e)); rung.position.set(0, y0 + 0.5 + k * 0.62, -0.6); rung.rotation.z = (R() - 0.5) * 0.12; group.add(rung); }
      // dust turning slowly in the light
      const n = 90, dp = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { const a = R() * 6.3, d = Math.sqrt(R()) * 2.6; dp.set([Math.cos(a) * d, y0 + R() * 14, Math.sin(a) * d], k * 3); }
      const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff2cc, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      group.add(dust); anim.push((t) => { dust.rotation.y = t * 0.05; dust.position.y = Math.sin(t * 0.3) * 0.4; });
    }
    // glow-worms on the roof: hundreds of tiny lights that breathe, like a night sky under the ground
    {
      const n = Math.round(260 * (T.size || 1)), wp = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { const [x, z] = spotsIn(1, 0.6)[0] || [0, 0]; wp.set([x, roof(x, z) - 0.15, z], k * 3); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.BufferAttribute(wp, 3));
      const wm = new THREE.PointsMaterial({ color: T.glow[T.glow.length - 1], size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      group.add(new THREE.Points(wg, wm)); anim.push((t) => { wm.opacity = 0.55 + Math.sin(t * 0.9) * 0.25 + Math.sin(t * 2.3) * 0.1; });
    }
    // the Shellwrights' wall lamps: old stone posts down the tunnels, each a little light, leading on towards the deepest chamber
    {
      const stone = mat(0xb5ad98), flameM = mat(T.glow[0], { emissive: T.glow[0], emissiveIntensity: 2.2 }), flames = [];
      let lit = 0;
      for (const t of tunnels) {
        const len = Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z); if (len < 14) continue;
        const u = 0.5, vx = (t.b.x - t.a.x) / len, vz = (t.b.z - t.a.z) / len, side = R() < 0.5 ? 1 : -1;
        const x = t.a.x + (t.b.x - t.a.x) * u - vz * side * (t.w * 0.55), z = t.a.z + (t.b.z - t.a.z) * u + vx * side * (t.w * 0.55), y = floor(x, z);
        if (dist(x, z) > 0.6) continue;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 6), stone); post.position.set(x, y + 0.75, z); group.add(post);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.14, 0.24, 7), stone); cup.position.set(x, y + 1.6, z); group.add(cup);
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), flameM); f.position.set(x, y + 1.8, z); group.add(f); flames.push(f);
        if (lit++ < 6) { const l = new THREE.PointLight(T.glow[0], 4, 9, 1.6); l.position.set(x, y + 2.1, z); group.add(l); }
      }
      anim.push((t) => flames.forEach((f, i) => { const k = 1 + Math.sin(t * 6 + i * 1.7) * 0.12; f.scale.set(k, 1 + Math.sin(t * 8 + i) * 0.2, k); }));
    }
    G.scene.add(group);
    await Promise.all(jobs);
    const Lc = { cells: new Map(), group, cfg: { id: "cave", a: 400, b: 400 }, land: { ground: (x, z) => floor(x, z), onRoad: () => false, rough: () => 0 },
      local: (x, z) => [x - O.x, z - O.z], world: (x, z) => [x + O.x, z + O.z], close: () => true, dist: () => 0 };
    for (const r of solids) addSolid(Lc, r);
    return { group, floor, roof, L: Lc, name: T.name, anim, dark: new THREE.Color(T.rock).multiplyScalar(0.07) };
  }
  // a model from a pack brought to a height (which can depend on where it stands), feet on the ground
  async function sized(path, parent, spots, height) {
    const g = await loadModel(path);
    if (!g || !spots.length) return;
    const box = new THREE.Box3().setFromObject(g.scene), h = Math.max(box.max.y - box.min.y, 1e-3);
    for (const sp of spots) { sp.s = height(sp.x, sp.z) / h; sp.y -= box.min.y * sp.s; }
    return forest(path, parent, spots);
  }

  // ---------------- going in and coming out ----------------
  const fade = (on) => { let f = document.getElementById("caveFade"); if (!f) { f = document.createElement("div"); f.id = "caveFade"; f.style.cssText = "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .45s;z-index:40"; document.body.appendChild(f); } f.style.opacity = on ? "1" : "0"; return new Promise((r) => setTimeout(r, 480)); };
  C.enter = async (L, x, z, ry, i) => {
    if (C.on || C.busy) return;
    const T = CAVE_THEMES[L.cfg.id] || CAVE_THEMES.hollow, key = `${L.cfg.id}:${i}`, lamp = best();
    C.busy = true; G.paused = true;
    await fade(true);
    try {
      const map = CAVE_MAPS[Math.floor(Math.random() * CAVE_MAPS.length)];
      here = await build(key, T, map.id); here.map = map;
      here.from = { L, x: x + Math.sin(ry) * 6, z: z + Math.cos(ry) * 6 };
      C.on = true; G.world.cave = C;
      G.world.ocean.visible = false;
      const P = G.player;
      if (P.riding?.vehicle) G.vehicles.exit();
      P.riding = null; P.mode = ""; P.sailing = false;
      P.pos.set(O.x + 1, ground(O.x + 1, O.z + 3.5), O.z + 3.5); P.vy = 0; P.ground = { y: P.pos.y, on: "cave", land: null };
      if (lamp?.burns) G.add(lamp.id, -1);
      await carry(lamp);
      popup(`${T.name[0].toUpperCase()}${T.name.slice(1)}: ${map.name}`, "good");
      G.talk.say(COMPANION.name, [map.say, lamp ? (lamp.burns ? "Good thing we brought a torch. It won't last past this trip, though." : `The ${itemName(lamp.id).toLowerCase()} helps. Stay close.`) : "It's pitch dark in here! We should make a torch at the workbench: wood and fibre. A lantern or a flashlight would be even better.", "If you want out, press R or the button up top. I'll find the rope back up the shaft."]);
    } catch (e) { console.warn("[cave]", e); here = null; C.on = false; }
    G.paused = false; C.busy = false;
    await fade(false);
  };
  C.leave = async () => {
    if (!C.on || C.busy) return;
    C.busy = true; G.paused = true;
    await fade(true);
    const { L, x, z } = here.from, [wx, wz] = L.world(x, z), P = G.player;
    G.scene.remove(here.group);
    here.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.geometry?.dispose(); });
    here = null; C.on = false; G.world.cave = null;
    await carry(null);
    G.world.ocean.visible = true;
    P.pos.set(wx, L.land.ground(x, z), wz); P.vy = 0;
    G.paused = false; C.busy = false;
    await fade(false);
  };
  C.ground = (x, z) => ({ y: ground(x, z), on: "cave", land: null });
  C.L = () => here?.L;

  // a save made down here puts you back at the cave mouth, not lost in the rock
  const save = G.save;
  G.save = async (...a) => {
    if (!C.on) return save(...a);
    const P = G.player, keep = P.pos.clone(), { L, x, z } = here.from, [wx, wz] = L.world(x, z), g = P.ground;
    P.pos.set(wx, L.land.ground(x, z), wz); P.ground = { y: P.pos.y, on: L.cfg.id, land: L };
    try { return await save(...a); } finally { P.pos.copy(keep); P.ground = g; }
  };

  /** every frame, after the world's sky and sun: down here it's dark, whatever the hour */
  C.tick = (dt, t) => {
    if (!C.on || !here) return;
    const W = G.world, P = G.player;
    W.sun.intensity = 0; W.hemi.intensity = 0.035;
    G.scene.background.copy(here.dark); G.scene.fog.color.copy(here.dark);
    for (const f of here.anim) f(t);
    G.scene.fog.near = held ? 6 : 2; G.scene.fog.far = held ? held.range * 1.1 : 14;
    if (W.rain) W.rain.visible = false;
    const cam = G.camera.position, top = here.roof(cam.x - O.x, cam.z - O.z) - 0.7;
    if (cam.y > top) cam.y = top;
    if (light && P) {
      const h = P.heading || 0, fx = Math.sin(h), fz = Math.cos(h), flick = held.flicker ? 0.82 + Math.sin(t * 17) * 0.08 + Math.sin(t * 5.3) * 0.1 : 1;
      const hx = P.pos.x + fx * 0.35 - fz * 0.3, hz = P.pos.z + fz * 0.35 + fx * 0.3, hy = P.pos.y + (held.id === "torch" ? 1.15 : 1.05);
      prop.position.set(hx, hy - (held.id === "torch" ? 0.35 : 0.1), hz); prop.rotation.y = h;
      light.intensity = held.power * flick;
      if (held.spot) { light.position.set(hx, hy, hz); light.target.position.set(P.pos.x + fx * 20, P.pos.y + 0.4, P.pos.z + fz * 20); fill.position.set(P.pos.x, P.pos.y + 2.2, P.pos.z); }
      else { light.position.set(hx, hy + 0.5, hz); }
    }
  };
  return C;
}
