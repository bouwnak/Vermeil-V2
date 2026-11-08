// explore.js - the far turtles. No towns and no people: what the Shellwrights left behind (a city, caves, a flower ring, nests above the clouds)
// and the verse of the Waking Song each one keeps. A verse can only be reached with the right dinosaur: one that sniffs out the door under
// Pillarback's plaza, smashes Hollowshell's rockfall, lifts you into Fernhold's canopy, flies to Mistcrown's peak, dives Lagoonback's lagoon,
// slashes Thornwild's thorn wall, or digs through Glassflat's salt (VERSES in data.js).
import * as THREE from "three";
import { COMPANION, VERSES, versesOf } from "./data.js";
import { forest, prop, loadModel } from "./assets.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RUIN_PARTS } from "./wilddata.js";
import { madeProp } from "./made.js";
import { addSolid, clearAt, dropSolid } from "./world.js";
import { wetness } from "./waters.js";
import { popup } from "./ui.js";
import { CAVE_THEMES } from "./cave.js";

const MEGA = "stylized_nature_megakit/", GROWN = "conv_ultimate_nature_pack/";
const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...more });
const STONE = mat(0xcfc4a8), DARK = mat(0x2a2620), WATER = mat(0x5fd8d0, { transparent: true, opacity: 0.82, roughness: 0.2 });
const GLOW = (c) => mat(c, { emissive: c, emissiveIntensity: 0.9 });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
/** a little hash: the same layout every time a turtle is built */
const pick = (i, seed) => { const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return h - Math.floor(h); };

export function makeExplore(G) {
  const E = {}, s = G.s;
  s.verses ||= {};
  const at = (L, x, z) => L.land.ground(x, z);
  const put = (L, o, x, z, ry = 0, dy = 0) => { o.position.set(x, at(L, x, z) + dy, z); o.rotation.y = ry; L.group.add(o); return o; };
  const ring = (n, r, cx = 0, cz = 0) => [...Array(n)].map((_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, a]; });
  const spots = (L, list, s0 = 1) => list.map(([x, z, k = 1], i) => ({ x, y: at(L, x, z) - 0.05, z, ry: pick(i, x + z) * 6.3, s: s0 * k }));

  /** the stretches of a line that are on dry land (above the sea's edge), each long enough to be worth paving */
  const dryRuns = (L, line, lo = 4.4) => { const out = []; let run = []; for (const p of line) { if (at(L, p[0], p[1]) >= lo) run.push(p); else { if (run.length > 4) out.push(run); run = []; } } if (run.length > 4) out.push(run); return out; };
  /** old flagstones laid along a line: a strip that lies on the ground as drawn all the way (so it climbs a slope with it instead of stepping
   *  over it), each stone its own shade of the city's pale stone, the edges broken where the grass has crept in */
  const pave = (L, line, half) => {
    const pos = [], col = [], c = new THREE.Color(), base = new THREE.Color(0xb3a993), ACROSS = [-1, -0.5, 0, 0.5, 1], n = line.length, row = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = line[i], [px, pz] = line[Math.max(0, i - 1)], [qx, qz] = line[Math.min(n - 1, i + 1)], l = Math.hypot(qx - px, qz - pz) || 1, dx = (qx - px) / l, dz = (qz - pz) / l;
      const ends = Math.min(1, Math.min(i, n - 1 - i) / 3);
      row.push(ACROSS.map((k) => { const w = half * (0.35 + 0.65 * ends) * (Math.abs(k) === 1 ? 0.92 + pick(i, k + 4) * 0.16 : 1), vx = x - dz * w * k, vz = z + dx * w * k; return [vx, at(L, vx, vz) + 0.07, vz]; }));
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < ACROSS.length - 1; k++) {
      const A = row[i][k], B = row[i][k + 1], C = row[i + 1][k], D = row[i + 1][k + 1], stone = Math.floor(i / 1.5) * 7 + k;
      const edge = k === 0 || k === ACROSS.length - 2;
      if (edge && pick(stone, 31) < 0.12) continue;                                   // a stone gone from the edge
      c.copy(base).offsetHSL(0, (pick(stone, 9) - 0.5) * 0.04, (pick(stone, 17) - 0.5) * 0.18 - (edge ? 0.05 : 0));
      for (const v of [A, B, C, B, D, C]) { pos.push(...v); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true;
    return m;
  };
  /** a pack model brought to a height, its feet on the ground: spots [{x, z, ry, h}] */
  const sized = async (L, path, list) => {
    const g = await loadModel(path);
    if (!g || !list.length) return [];
    const box = new THREE.Box3().setFromObject(g.scene), h = Math.max(box.max.y - box.min.y, 1e-3);
    return forest(path, L.group, list.map((p) => { const k = p.h / h; return { x: p.x, z: p.z, ry: p.ry || 0, s: k, y: at(L, p.x, p.z) - box.min.y * k - 0.05 }; }));
  };
  /** the rest of the Shellwrights' city round the old plaza: a ring avenue of columns, eight streets out through districts of roofless houses
   *  (trees grown up inside some), a stepped temple, an aqueduct striding over the roofs, and the broken city wall. All of it overgrown */
  async function greatCity(L) {
    const sq = Math.max(0.82, L.cfg.b / L.cfg.a), RING = 74, OUT = Math.min(140, L.cfg.b * 0.55), WALL = OUT + 8, jobs = [];
    const pt = (t, r) => [Math.cos(t) * r, Math.sin(t) * r * sq];
    const built = new Set(), cell = (x, z) => `${Math.round(x / 3)},${Math.round(z / 3)}`, mark = (x, z, r = 2) => { for (let a = -r; a <= r; a += 3) for (let b = -r; b <= r; b += 3) built.add(cell(x + a, z + b)); };
    L.avoidAt = (x, z) => built.has(cell(x, z));                 // nothing grows on the paving or in the houses but what's put there
    const flatEnough = (x, z, r) => { const ys = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([a, b]) => at(L, x + a, z + b)); return Math.min(...ys) > 4.6 && Math.max(...ys) - Math.min(...ys) < r * 0.45; };
    const STREETS = [...Array(8)].map((_, i) => i / 8 * Math.PI * 2), TEMPLE = Math.PI * 1.5, AQUA = Math.PI * 1.5 + Math.PI / 8 * 3;
    const off = (t, s) => Math.abs(Math.atan2(Math.sin(t - s), Math.cos(t - s)));
    const nearStreet = (t, r, w = 9) => STREETS.some((s) => off(t, s) * r < w);
    const parts = { stone: [], pale: [], dark: [] }, Q = new THREE.Quaternion(), E3 = new THREE.Euler(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
    const add = (key, geo, x, y, z, ry = 0, rx = 0) => { geo.applyMatrix4(new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E3.set(rx, ry, 0)), ONE)); parts[key].push(geo.index ? geo.toNonIndexed() : geo); };
    const paving = [], cols = [], stumps = [], trees = [], bush = [], fern = [], grass = [], rubble = [], vines = [];
    // the ring avenue, paved, a column every few steps on each side
    { const line = []; for (let t = 0; t <= Math.PI * 2 + 0.01; t += 1.2 / RING) { const [x, z] = pt(t, RING); line.push([x, z]); if (at(L, x, z) >= 4.4) mark(x, z, 3); } paving.push(line); }
    for (let t = 0; t < Math.PI * 2; t += 9.5 / RING) { if (nearStreet(t, RING, 7)) continue; for (const side of [-6, 6]) { const [x, z] = pt(t, RING + side); if (at(L, x, z) < 4.6) continue; (pick(t * 10, side) < 0.3 ? stumps : cols).push({ x, z, ry: pick(t, side) * 6 }); } }
    // the eight streets, out to the gates, wandering a little as old streets do
    for (const s0 of STREETS) { const line = []; for (let r = 62; r <= WALL + 2; r += 1.2) { const [x0, z0] = pt(s0, r), w = Math.sin(r * 0.055 + s0 * 5) * 2.2, x = x0 - Math.sin(s0) * w, z = z0 + Math.cos(s0) * w; line.push([x, z]); if (at(L, x, z) >= 4.4) mark(x, z, 3); } paving.push(line); }
    // houses in their districts
    let houses = 0;
    for (let r = RING + 16; r < OUT - 4; r += 15) for (let t = 0; t < Math.PI * 2; t += 15 / r) {
      const jt = t + (pick(r, t * 7) - 0.5) * 0.04, rr = r + (pick(t, r) - 0.5) * 3, [x, z] = pt(jt, rr);
      if (nearStreet(jt, rr) || (off(jt, TEMPLE) * rr < 26 && rr > 96) || off(jt, AQUA) * rr < 5) continue;
      if (pick(x, z) < 0.1 || !flatEnough(x, z, 6)) continue;
      const w = 7 + pick(x, 1) * 4, d = 6 + pick(z, 2) * 3, ry = -jt + Math.PI / 2, y = Math.min(at(L, x - 3, z - 3), at(L, x + 3, z + 3), at(L, x, z)) - 0.3, key = ["stone", "pale", "dark"][houses++ % 3], ruin = pick(x, z + 1);
      const c = Math.cos(ry), sn = Math.sin(ry), toW = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      const walls = [[0, -d / 2, w, 0.7, 0], [0, d / 2, w, 0.7, 0], [-w / 2, 0, d, 0.7, 1], [w / 2, 0, d, 0.7, 1]];
      walls.forEach(([lx, lz, len, th, side], wi) => {
        const pieces = wi === 1 ? [[-len / 2, -0.9], [0.9, len / 2]] : [[-len / 2, len / 2]];          // the front wall has its doorway
        for (const [a, b] of pieces) {
          let u = a;
          while (u < b - 0.2) {                                    // a wall in blocks of different height: broken down here and there
            const seg = Math.min(b - u, 1.6 + pick(u + wi, x) * 1.6), h = (ruin < 0.35 ? 1 : 2.2) + pick(u * 3 + wi, z) * (ruin < 0.35 ? 1.6 : 3.2), m = u + seg / 2;
            const [wx, wz] = toW(lx + (side ? 0 : m), lz + (side ? m : 0));
            add(key, new THREE.BoxGeometry(side ? th : seg, h, side ? seg : th), wx, y + h / 2, wz, ry);
            if (h > 3.2 && pick(u, wi) < 0.5) add(key, new THREE.BoxGeometry(side ? th + 0.25 : seg, 0.3, side ? seg : th + 0.25), wx, y + h + 0.15, wz, ry);          // a cornice still on top
            u += seg;
          }
        }
      });
      add(key === "dark" ? "stone" : "dark", new THREE.BoxGeometry(w, 0.25, d), x, y + 0.2, z, ry);       // the old floor
      for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [-w / 2, 0], [w / 2, 0]]) { const [sx, sz] = toW(cx, cz); addSolid(L, { x: sx, z: sz, r: 1 }); }
      mark(x, z, Math.max(w, d) / 2 + 1);
      const inside = pick(x + 3, z);
      if (inside < 0.3) trees.push({ x, z, ry: pick(x, 4) * 6, s: 1.5 + pick(z, 4) }); else if (inside < 0.6) bush.push({ x, z, ry: inside * 9, s: 1.4 + inside });
      for (let g = 0; g < 4; g++) { const [gx, gz] = toW((pick(g, x) - 0.5) * (w - 1.5), (pick(g, z) - 0.5) * (d - 1.5)); (g % 2 ? grass : fern).push({ x: gx, z: gz, ry: g * 1.7, s: 1 + pick(g, 9) }); }
      for (let g = 0; g < 3; g++) { const [gx, gz] = toW((g - 1) * w * 0.55, d / 2 + 1.2 + pick(g, x)); rubble.push({ x: gx, z: gz, ry: g * 2, h: 0.5 + pick(g, z) * 0.6 }); }
      if (pick(x, 11) < 0.4) { const [vx, vz] = toW(w / 2 + 0.6, 0); vines.push({ x: vx, z: vz, ry: ry + Math.PI / 2, s: 1.4 + pick(z, 11) }); }
    }
    // the temple: four great steps up to a shrine of columns, its lamp still lit
    {
      const [tx, tz] = pt(TEMPLE, 116), y = at(L, tx, tz) - 0.4;
      if (y > 4) {
        [26, 20, 14.5, 9].forEach((w, i) => add(i % 2 ? "pale" : "stone", new THREE.BoxGeometry(w, 1.8, w), tx, y + 0.9 + i * 1.8, tz));
        const top = y + 7.2;
        for (const [cx, cz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4], [0, -3.4], [0, 3.4]]) add("pale", new THREE.CylinderGeometry(0.55, 0.65, 5, 8), tx + cx, top + 2.5, tz + cz);
        add("stone", new THREE.BoxGeometry(9.6, 0.7, 9.6), tx, top + 5.35, tz); add("stone", new THREE.ConeGeometry(6.6, 2.2, 4), tx, top + 6.8, tz, Math.PI / 4);
        for (let i = 0; i < 4; i++) add("dark", new THREE.BoxGeometry(6, 0.45 * (4 - i), 1.4), tx, y + 0.225 * (4 - i), tz + 13.7 + i * 1.4);          // steps up the front
        addSolid(L, { x: tx, z: tz, r: 13 }); mark(tx, tz, 16);
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), GLOW(0xffc870)); fl.position.set(tx, top + 1, tz); L.group.add(fl);
        const lamp = new THREE.PointLight(0xffc870, 6, 18, 1.4); lamp.position.set(tx, top + 1.6, tz); L.group.add(lamp);
        for (const cx of [-15, 15]) { const p = madeProp("statue"); p.scale.setScalar(1.8); put(L, p, tx + cx, tz + 15, 0); addSolid(L, { x: tx + cx, z: tz + 15, r: 1.4 }); }
      }
    }
    // the aqueduct: piers in a long line from the city wall in toward the plaza, the channel carried over them, fallen in places
    {
      const ax = Math.cos(AQUA), az = Math.sin(AQUA) * sq, al = Math.hypot(ax, az), dx = ax / al, dz = az / al, ry = Math.atan2(dx, dz);
      for (let r = 66; r < WALL; r += 7.5 / al) {
        const [x, z] = pt(AQUA, r), y = at(L, x, z);
        if (y < 4.6) continue;
        const top = Math.max(y, 6) + 9;
        add("pale", new THREE.BoxGeometry(1.8, top - y + 0.6, 1.8), x, (top + y) / 2 - 0.3, z, ry);       // a pier
        if (pick(r, 3) > 0.18) { add("pale", new THREE.BoxGeometry(2.4, 1.2, 7.6), x + dx * 3.75, top + 0.6, z + dz * 3.75, ry); add("stone", new THREE.BoxGeometry(2.7, 0.35, 7.6), x + dx * 3.75, top + 1.35, z + dz * 3.75, ry); }
        addSolid(L, { x, z, r: 1.3 }); mark(x, z, 2);
      }
    }
    // the city wall, fallen in long stretches, a squat tower either side of each street's gate
    for (let t = 0; t < Math.PI * 2; t += 5 / WALL) {
      const [x, z] = pt(t, WALL), y = at(L, x, z);
      if (y < 4.6) continue;
      const gate = STREETS.map((s) => off(t, s) * WALL).reduce((a, b) => Math.min(a, b), 1e9);
      if (gate < 4.5) continue;                                                                // the gateway itself
      if (gate < 9.5) { add("dark", new THREE.CylinderGeometry(2.4, 2.8, 7 + pick(t, 9) * 3, 8), x, y + 3.5, z); addSolid(L, { x, z, r: 2.6 }); mark(x, z, 3); continue; }
      if (pick(Math.floor(t * 6), 13) < 0.3) { if (pick(t, 23) < 0.5) rubble.push({ x, z, ry: t, h: 0.9 }); continue; }          // a fallen stretch
      const h = 3 + pick(t, 21) * 3, ry = -t + Math.PI / 2;
      add("stone", new THREE.BoxGeometry(5.2, h, 1.4), x, y + h / 2 - 0.3, z, ry);
      if (pick(t, 22) < 0.6) for (const o of [-1.7, 0, 1.7]) add("stone", new THREE.BoxGeometry(0.9, 0.8, 1.5), x + Math.cos(ry) * o, y + h + 0.1, z - Math.sin(ry) * o, ry);
      addSolid(L, { x, z, r: 2 }); mark(x, z, 2);
    }
    // fallen columns lying in the grass
    for (let i = 0; i < 24; i++) { const t = pick(i, 71) * 6.3, r = RING + 8 + pick(i, 72) * (OUT - RING - 8), [x, z] = pt(t, r), y = at(L, x, z); if (y < 4.6 || L.avoidAt(x, z)) continue; add("pale", new THREE.CylinderGeometry(0.6, 0.6, 4 + pick(i, 74) * 4, 8), x, y + 0.45, z, pick(i, 73) * 6.3, Math.PI / 2); addSolid(L, { x, z, r: 1.2 }); mark(x, z, 2); }

    const M = { stone: STONE, pale: mat(0xdcd3bb), dark: mat(0xa89c84) };
    for (const [key, list] of Object.entries(parts)) for (let i = 0; i < list.length; i += 800) {
      const g = mergeGeometries(list.slice(i, i + 800)); if (!g) continue;
      const m = new THREE.Mesh(g, M[key]); m.castShadow = m.receiveShadow = true; L.group.add(m);
    }
    for (const c of cols) addSolid(L, { x: c.x, z: c.z, r: 1 });
    for (const line of paving) for (const run of dryRuns(L, line)) L.group.add(pave(L, run, 3.4));
    jobs.push(sized(L, RUIN_PARTS.column, cols.map((c) => ({ ...c, h: 7 }))), sized(L, RUIN_PARTS.broken, stumps.filter((_, i) => i % 2).map((c) => ({ ...c, h: 3 }))), sized(L, RUIN_PARTS.broken2, stumps.filter((_, i) => !(i % 2)).map((c) => ({ ...c, h: 2.4 }))));
    jobs.push(sized(L, RUIN_PARTS.rocks, rubble.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, h: p.h * 1.6 }))));
    RUIN_PARTS.rock.forEach((path, i) => jobs.push(sized(L, path, rubble.filter((_, j) => j % 3 && j % 5 === i))));
    const grow = (path, list) => jobs.push(forest(path, L.group, list.map((p) => ({ ...p, y: at(L, p.x, p.z) - 0.1 }))));
    grow(`${MEGA}CommonTree_3.gltf`, trees.filter((_, i) => i % 3 === 0)); grow(`${MEGA}CommonTree_5.gltf`, trees.filter((_, i) => i % 3 === 1)); grow(`${MEGA}CommonTree_1.gltf`, trees.filter((_, i) => i % 3 === 2));          // (the kit's twisted trees are autumn red: wrong here)
    for (const tr of trees) addSolid(L, { x: tr.x, z: tr.z, r: 0.8 });
    grow(`${MEGA}Bush_Common.gltf`, bush.filter((_, i) => i % 2)); grow(`${MEGA}Bush_Common_Flowers.gltf`, bush.filter((_, i) => !(i % 2)));
    grow(`${MEGA}Fern_1.gltf`, fern); grow(`${MEGA}Grass_Wispy_Tall.gltf`, grass); grow(`${MEGA}Plant_7.gltf`, vines);
    await Promise.all(jobs);
  }

  // ---------------- what each kind of far turtle is ----------------
  const BUILD = {
    /** Pillarback: an empty Shellwright city. A plaza ringed with pillars, straight streets lined with columns, roofless houses in blocks */
    async city(L) {
      L.keep = [[0, 0, 64]];
      for (const [x, z, a] of ring(10, 14)) { put(L, madeProp("pillar"), x, z, -a); addSolid(L, { x, z, r: 1.1 }); }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 22; k <= 54; k += 8) for (const side of [-1, 1]) { const x = dx * k + dz * side * 6, z = dz * k + dx * side * 6; if (pick(k, dx + dz * 3 + side) < 0.2) continue; const p = put(L, madeProp("pillar"), x, z); if (pick(k, side) < 0.3) { p.scale.y = 0.4 + pick(k, 7) * 0.4; } addSolid(L, { x, z, r: 1.1 }); }       // some have fallen to stumps
        const ax = dx * 58, az = dz * 58; put(L, madeProp("arch"), ax, az, dx ? Math.PI / 2 : 0); addSolid(L, { x: ax + dz * 4, z: az + dx * 4, r: 1.4 }); addSolid(L, { x: ax - dz * 4, z: az - dx * 4, r: 1.4 });
      }
      // houses: four low walls each, some broken down, in the blocks between the streets
      for (const [bx, bz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let i = 0; i < 4; i++) {
        const x = bx * (20 + (i % 2) * 16), z = bz * (20 + Math.floor(i / 2) * 16), w = 7 + pick(i, bx) * 3, d = 6 + pick(i, bz) * 3, g = new THREE.Group();
        for (const [px, pz, sx, sz] of [[0, -d / 2, w, 0.6], [0, d / 2, w * (pick(i, 3) < 0.4 ? 0.5 : 1), 0.6], [-w / 2, 0, 0.6, d], [w / 2, 0, 0.6, d * (pick(i, 5) < 0.4 ? 0.4 : 1)]]) {
          const h = 1.2 + pick(px + pz, i) * 2.6; g.add(mesh(new THREE.BoxGeometry(sx, h, sz), STONE, px - (sx < w && sz === 0.6 && px === 0 ? w * 0.25 : 0), h / 2, pz));
        }
        put(L, g, x, z, pick(i, 9) * 0.2);
        addSolid(L, { x, z, r: Math.min(w, d) * 0.45 });
      }
      for (const [x, z] of [[8, 30], [-30, -8], [30, -30]]) put(L, madeProp("statue"), x, z, pick(x, z) * 6);
      // two paved streets crossing at the plaza
      // the four streets: flagstones lying on the ground as it is, from the plaza's edge out past the arches
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const line = []; for (let k = 14; k <= 60; k += 1.2) { const w = Math.sin(k * 0.09 + dx * 2 + dz * 3) * 0.7; line.push([dx * k + dz * w, dz * k + dx * w]); } for (const run of dryRuns(L, line, -1)) L.group.add(pave(L, run, 3.6)); }
      await greatCity(L);
    },
    /** Hollowshell: cave mouths at the feet of its mountains, dark inside, crystals glowing in the rock */
    async caves(L) {
      E.caveMouth(L, -10, 27.2, 0, 0, "v3");                                // the Deep Hall: in the foot of the cliff, right behind its verse stone and its rockfall
      for (let i = 1; i <= 4; i++) { const m = mouthSpot(L, i); if (m) E.caveMouth(L, m[0], m[1], m[2], i); }      // the rest wherever the hills make a good place for one
      // stalagmites and crystal clusters out in the open too
      for (let i = 0; i < 60; i++) { const a = pick(i, 1) * 6.3, d = (30 + pick(i, 2) * 80) * (L.cfg.grow || 1), x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8; if (at(L, x, z) < 4) continue; const c = mesh(new THREE.ConeGeometry(0.5 + pick(i, 3) * 0.6, 2 + pick(i, 4) * 3, 6), i % 3 ? mat(0x8a8478) : GLOW(0x7fe8ff)); put(L, c, x, z, 0, 1 + pick(i, 4) * 1.4); }
    },
    /** Fernhold: ferns as tall as houses, broad-leaved giants, and a platform high in the canopy */
    async forest(L) {
      L.keep = [[10, -10, 8]];
      const big = [...Array(70)].map((_, i) => { const a = pick(i, 11) * 6.3, d = 14 + pick(i, 12) * 140; return [Math.cos(a) * d, Math.sin(a) * d * 0.76, 0.8 + pick(i, 13) * 0.6]; }).filter(([x, z]) => at(L, x, z) > 4);
      await Promise.all([forest(`${MEGA}Fern_1.gltf`, L.group, spots(L, big, 7)), forest(`${MEGA}Plant_1_Big.gltf`, L.group, spots(L, big.filter((_, i) => i % 3 === 0).map(([x, z, k]) => [x + 4, z - 3, k]), 3.2)), forest(`${MEGA}Plant_7_Big.gltf`, L.group, spots(L, big.filter((_, i) => i % 4 === 1).map(([x, z, k]) => [x - 3, z + 4, k]), 3))]);
      for (const [x, z] of big.filter((_, i) => i % 5 === 0)) addSolid(L, { x, z, r: 1 });
      // the canopy platform: a great trunk, a deck at the top, the verse stone up on it
      const [vx, vz] = [10, -10], g = new THREE.Group(), bark = mat(0x6a4a2a), leaf = mat(0x3f9a46);
      g.add(mesh(new THREE.CylinderGeometry(1.4, 2.2, 9, 8), bark, 0, 4.5, 0), mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 9), mat(0x8a6a3a), 0, 9, 0));
      for (let i = 0; i < 6; i++) { const l = mesh(new THREE.IcosahedronGeometry(3.4, 0), leaf, Math.cos(i) * 4, 11 + (i % 2), Math.sin(i) * 4); l.scale.y = 0.5; g.add(l); }
      put(L, g, vx + 3, vz); addSolid(L, { x: vx + 3, z: vz, r: 2.2 });
    },
    /** Bloomdrift: nothing but flowers, grass and birch, and a ring of flowers around a stone */
    async meadow(L) {
      L.keep = [[-10, 30, 7]];
      const field = [...Array(220)].map((_, i) => { const a = pick(i, 21) * 6.3, d = 8 + pick(i, 22) * 110; return [Math.cos(a) * d, Math.sin(a) * d * 0.78, 0.9 + pick(i, 23) * 0.6]; }).filter(([x, z]) => at(L, x, z) > 4);
      await Promise.all([forest(`${MEGA}Flower_3_Group.gltf`, L.group, spots(L, field.filter((_, i) => i % 2), 1.4)), forest(`${MEGA}Flower_4_Group.gltf`, L.group, spots(L, field.filter((_, i) => !(i % 2)), 1.4)),
        forest(`${MEGA}Flower_4_Group.gltf`, L.group, spots(L, ring(18, 5.5, -10, 30).map(([x, z]) => [x, z, 1.2]), 1.6)), forest(`${GROWN}Flowers.glb`, L.group, spots(L, field.map(([x, z]) => [x + 2, z + 2, 1]), 1.2))]);
      for (const [x, z] of [[-30, -20], [20, 40], [50, 10]]) put(L, madeProp("cairn"), x, z);
    },
    /** Mistcrown: stick nests with eggs on the high slopes, and a little shrine on top */
    async peaks(L) {
      const twig = mat(0x8a6a44), egg = mat(0xf4ecd8);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * 6.3, x = 10 + Math.cos(a) * (22 + pick(i, 1) * 14), z = -10 + Math.sin(a) * (22 + pick(i, 2) * 14), g = new THREE.Group();
        for (let k = 0; k < 10; k++) { const t = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 4), twig, Math.cos(k) * 0.9, 0.3, Math.sin(k) * 0.9); t.rotation.set(Math.PI / 2, 0, k * 0.63); g.add(t); }
        for (let k = 0; k < 2 + (i % 2); k++) { const e = mesh(new THREE.SphereGeometry(0.28, 7, 5), egg, (k - 1) * 0.36, 0.4, 0); e.scale.y = 1.3; g.add(e); }
        put(L, g, x, z);
      }
      const shrine = new THREE.Group(); for (const [x, z, a] of ring(4, 3)) { const p = madeProp("pillar"); p.scale.setScalar(0.5); p.position.set(x, 0, z); p.rotation.y = a; shrine.add(p); }
      put(L, shrine, 10, -10, 0, -0.2);
    },
    /** Lagoonback: a clear lagoon in its shell, coral growing in it, the verse stone on its floor */
    async lagoon(L) {
      L.keep = [[-30, -50, 9]];
      const [x, z] = [-30, -50], y = at(L, x, z), pool = mesh(new THREE.CircleGeometry(8, 12), WATER); pool.rotation.x = -Math.PI / 2; pool.position.set(x, y + 0.25, z); pool.castShadow = false; L.group.add(pool);
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.3, r = 2 + pick(i, 1) * 5, c = mesh(i % 3 ? new THREE.ConeGeometry(0.3, 1 + pick(i, 2), 5) : new THREE.IcosahedronGeometry(0.5, 0), mat([0xff8aa0, 0xffb060, 0xb88aff, 0x6ae0c0][i % 4])); c.position.set(x + Math.cos(a) * r, y - 0.2, z + Math.sin(a) * r); L.group.add(c); }
      for (const [rx, rz] of ring(12, 8.6, x, z)) prop(`${GROWN}Rock_${Math.floor(pick(rx, rz) * 5) + 1}.glb`, L.group, { x: rx, y: at(L, rx, rz) - 0.2, z: rz, scale: 0.7 });
    },
    /** Thornwild: a jungle; at its heart, a wall of thorns grown round the verse stone */
    async jungle(L) {
      L.keep = [[0, 20, 8]];
      const vine = mat(0x2f6a34), thorn = mat(0x8a5a3a);
      const wall = new THREE.Group();
      for (const [x, z] of ring(22, 5.4)) { const b = mesh(new THREE.IcosahedronGeometry(1.3 + pick(x, z) * 0.6, 0), vine, x, 1.1, z); b.scale.y = 1.4; wall.add(b); for (let k = 0; k < 4; k++) { const t = mesh(new THREE.ConeGeometry(0.1, 0.7, 4), thorn, x + Math.cos(k * 1.6) * 1.2, 1.2 + (k % 2) * 0.6, z + Math.sin(k * 1.6) * 1.2); t.rotation.set(Math.cos(k), 0, Math.sin(k) + 1.5); wall.add(t); } }
      put(L, wall, 0, 20);
      E.blockers.v7 = { L, o: wall, solids: ring(10, 5.4, 0, 20).map(([x, z]) => addSolid(L, { x, z, r: 1.4 })) };
      const ferns = [...Array(80)].map((_, i) => { const a = pick(i, 31) * 6.3, d = 12 + pick(i, 32) * 120; return [Math.cos(a) * d, Math.sin(a) * d * 0.77, 0.8 + pick(i, 33) * 0.5]; }).filter(([x, z]) => at(L, x, z) > 4);
      await Promise.all([forest(`${MEGA}Fern_1.gltf`, L.group, spots(L, ferns, 3)), forest(`${MEGA}Plant_7_Big.gltf`, L.group, spots(L, ferns.filter((_, i) => i % 3 === 0), 2))]);
    },
    /** Glassflat: white crust in plates, crystal clusters standing out of it, and a salt mound over the verse */
    async saltflat(L) {
      L.keep = [[0, 10, 5]];
      const crust = mat(0xf8f6f0), glass = mat(0xd8f4ff, { transparent: true, opacity: 0.8, roughness: 0.1 });
      for (let i = 0; i < 70; i++) { const a = pick(i, 41) * 6.3, d = pick(i, 42) * 70, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.75, p = mesh(new THREE.CylinderGeometry(2 + pick(i, 43) * 2, 2.2 + pick(i, 43) * 2, 0.16, 6), crust); put(L, p, x, z, pick(i, 44), 0.04); }
      for (let i = 0; i < 18; i++) { const a = pick(i, 51) * 6.3, d = 20 + pick(i, 52) * 90, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.75, g = new THREE.Group(); for (let k = 0; k < 5; k++) { const c = mesh(new THREE.ConeGeometry(0.4, 2 + pick(k, i) * 2.4, 5), glass, (pick(k, 1) - 0.5) * 1.6, 1, (pick(k, 2) - 0.5) * 1.6); c.rotation.set((pick(k, 3) - 0.5) * 0.7, 0, (pick(k, 4) - 0.5) * 0.7); g.add(c); } put(L, g, x, z); addSolid(L, { x, z, r: 1.2 }); }
      const mound = mesh(new THREE.SphereGeometry(2.6, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), crust); put(L, mound, 0, 10, 0, -0.2);
      E.blockers.v8 = { L, o: mound, solids: [] };
    },
  };

  // ---------------- cave mouths: press E and you go down into the dark (cave.js) ----------------
  /** a mouth in the rock at x,z, opening toward ry. needs: a verse that must be read before the way is clear */
  E.caveMouth = (L, x, z, ry, i, needs = null) => {
    // every mouth is its own: a seeded roll per island and spot picks the kind of doorway, its width and height, how mossy,
    // how many teeth and crystals. Every piece then sits on the ground under it, so it grows out of the hillside it's set in
    const seed = x * 1.37 + z * 0.71 + i * 17.3 + [...L.cfg.id].reduce((h, ch) => h + ch.charCodeAt(0), 0), R = (k) => pick(k + 101, seed);
    const T = CAVE_THEMES[L.cfg.id] || CAVE_THEMES.hollow, g = new THREE.Group(), base = new THREE.Color(T.rock), snowy = L.cfg.id === "mist" || L.cfg.biome === "snow";
    const KINDS = ["arch", "cleft", "overhang", "shellwright", "mine"], kind = KINDS[Math.floor(R(1) * (T.catacomb ? 4 : 5)) % 5];
    // the opening: half-width and height, so the dark backdrop always fills exactly the hole the rocks leave
    const hw = { arch: 3.1, cleft: 2, overhang: 4.4, shellwright: 2.6, mine: 2.3 }[kind] + R(2) * 0.6, hh = { arch: 3.3, cleft: 4.8, overhang: 2.6, shellwright: 3.6, mine: 3.1 }[kind] + R(3) * 0.6;
    const S = 1.35 + R(4) * 0.45;
    const tone = (k, l = 0) => mat(base.clone().offsetHSL((R(k + 40) - 0.5) * 0.03, -0.02, (R(k) - 0.5) * 0.1 + l));
    const rock = [tone(5, 0.06), tone(6, 0.02), tone(7, -0.03)], moss = mat(snowy ? 0xf2f6fa : 0x5f7f45), mossy = mat(snowy ? 0xdfe8f0 : 0x4f6e3c), mossAmt = 0.25 + R(8) * 0.6;
    const lump = (r, m, lx, ly, lz, sx = 1, sy = 1, sz = 1, k = 0, detail = 1) => { const o = mesh(new THREE.DodecahedronGeometry(r, detail), m, lx, ly, lz); o.scale.set(sx, sy, sz); o.rotation.set(R(k + 3) * 2, R(k + 4) * 6, R(k + 5) * 2); o.userData.hug = true; g.add(o); return o; };
    // the dark inside: a hollow going back into the rock, black at the back so it reads as deep
    const hollow = mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x0b0a0c, { side: THREE.BackSide }), 0, -0.4, -2.6); hollow.scale.set(hw + 0.6, hh + 0.4, 5.6); g.add(hollow);
    const black = mesh(new THREE.CircleGeometry(1, 20, 0, Math.PI), mat(0x030304, { side: THREE.DoubleSide }), 0, -0.35, -0.9); black.scale.set(hw + 1, hh + 0.9, 1); black.castShadow = false; g.add(black);
    // the frame of rock round the opening: boulders, bigger at the feet, each set outside the hole by its own size
    const n = 10 + Math.floor(R(9) * 6), point = kind === "cleft" ? 0.55 : 1;
    for (let k = 0; k < n; k++) {
      const a = k / (n - 1) * Math.PI, foot = 1 - Math.sin(a), r = (kind === "overhang" ? 1.4 : 1.1) + foot * 0.9 + R(k + 10) * 0.6;
      const lx = Math.cos(a) * (hw + r * 0.95), ly = Math.pow(Math.sin(a), point) * (hh + r * 0.8) - 0.2;
      lump(r, R(k + 30) < mossAmt * 0.5 ? mossy : rock[k % 3], lx, ly, -0.6 + R(k + 20) * 0.6, 1.1, kind === "cleft" ? 1.35 : 1, 1.3, k);
    }
    if (kind === "overhang") {                      // a great flat ledge of rock across the top, the opening low and wide under it
      lump(3.2, rock[1], 0, hh + 1.6, -1.2, (hw + 3) / 3.2, 0.42, 1.25, 50, 0);
      if (R(51) < 0.6) for (let k = 0; k < 3; k++) { const c = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2 + R(k + 52) * 1.6, 3), mat(snowy ? 0xcfe8ff : 0x4f8a3e), (k - 1) * hw * 0.55, hh + 0.1, -0.2); c.userData.hug = true; g.add(c); }       // roots or icicles hanging off the lip
    }
    if (kind === "cleft") {                          // two leaning slabs meeting over a tall crack
      for (const side of [-1, 1]) { const sl = lump(2.2, rock[side > 0 ? 0 : 2], side * (hw + 1.4), hh * 0.55, -0.9, 0.7, hh * 0.42, 1.2, 60 + side, 0); sl.rotation.set(0, R(61) * 0.4, side * -0.22); }
    }
    if (kind === "shellwright") {                    // the Shellwrights dressed this one: a stone doorframe, a lintel carved with a spiral, two braziers
      const dressed = mat(0xc9bfa8), dark = mat(0x8a8068);
      for (const side of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.9, hh + 0.6, 0.9), dressed, side * (hw + 0.2), (hh + 0.6) / 2 - 0.3, -0.3); p.userData.hug = true; g.add(p); }
      const lintel = mesh(new THREE.BoxGeometry(hw * 2 + 2.2, 0.9, 1.1), dressed, 0, hh + 0.6, -0.3); lintel.userData.hug = true; g.add(lintel);
      const spiral = mesh(new THREE.TorusGeometry(0.32, 0.07, 5, 14, Math.PI * 3.2), dark, 0, hh + 0.6, 0.27); spiral.userData.hug = true; g.add(spiral);
      for (const side of [-1, 1]) {
        const bx = side * (hw + 1.9), bowl = mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), dark, bx, 1.45, 0.9), leg = mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.2, 6), dark, bx, 0.6, 0.9);
        const flame = mesh(new THREE.IcosahedronGeometry(0.34, 0), GLOW(T.glow[0]), bx, 1.95, 0.9); flame.castShadow = false;
        for (const o of [bowl, leg, flame]) { o.userData.hug = true; g.add(o); }
        const l = new THREE.PointLight(T.glow[0], 1.6, 6, 1.8); l.position.set(bx, 2.6, 1.1); g.add(l);
      }
    }
    if (kind === "mine") {                           // a miners' adit: timber posts and a beam, braces, a lantern on a hook, sleepers running in
      const wood = mat(0x7a5634), dark = mat(0x5a3e24);
      for (const side of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.45, hh + 0.4, 0.45), wood, side * (hw - 0.1), (hh + 0.4) / 2 - 0.3, 0.1); p.rotation.z = side * 0.06; p.userData.hug = true; g.add(p); const br = mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), dark, side * (hw - 0.7), hh - 0.5, 0.1); br.rotation.z = side * -0.75; br.userData.hug = true; g.add(br); }
      const beam = mesh(new THREE.BoxGeometry(hw * 2 + 1, 0.5, 0.55), wood, 0, hh, 0.1); beam.userData.hug = true; g.add(beam);
      const lan = mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), mat(0xffd890, { emissive: 0xffc060, emissiveIntensity: 1.4 }), hw * 0.55, hh - 0.75, 0.35); lan.castShadow = false; lan.userData.hug = true; g.add(lan);
      const ll = new THREE.PointLight(0xffc070, 1.4, 6, 1.8); ll.position.set(hw * 0.55, hh - 0.9, 0.8); g.add(ll);
      for (let k = 0; k < 6; k++) { const sl = mesh(new THREE.BoxGeometry(2.2, 0.12, 0.34), dark, 0, -0.25, 1.6 - k * 1.1); sl.userData.hug = true; g.add(sl); }
    }
    // the hill heaped behind and over it, settling down to the ground at the sides
    const heap = 12 + Math.floor(R(70) * 8), spread = 7 + R(71) * 3.5, tall = hh + 2.6 + R(72) * 2;
    for (let k = 0; k < heap; k++) { const side = (R(k + 80) - 0.5) * 2, back = 1.5 + R(k + 110) * 6, up = Math.max(0.2, (1 - Math.abs(side)) * tall - back * 0.25 + R(k + 140) * 1.5);
      lump(2.3 + R(k + 170) * 2, R(k + 200) < mossAmt * 0.4 ? mossy : rock[(k + 1) % 3], side * spread, up, -back - 1.5, 1.4, 0.75, 1.3, k + 20); }
    // moss (or snow) caps on top
    const caps = 2 + Math.floor(mossAmt * 7);
    for (let k = 0; k < caps; k++) { const m = mesh(new THREE.SphereGeometry(1.3 + R(k + 230) * 0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), moss, (R(k + 260) - 0.5) * hw * 2.6, tall - 0.4 + R(k + 290) * 1.2 - Math.abs(R(k + 260) - 0.5) * 3, -2 - R(k + 320) * 2.5); m.scale.y = 0.42; m.userData.hug = true; g.add(m); }
    // glow from inside: crystals in the dark, and teeth hanging in the mouth (not under a dressed lintel or a mine beam)
    const cry = 3 + Math.floor(R(11) * 6);
    for (let k = 0; k < cry; k++) { const c = mesh(new THREE.ConeGeometry(0.22 + R(k + 350) * 0.14, 0.9 + R(k + 380) * 1.6, 5), GLOW(T.glow[k % T.glow.length]), (R(k + 410) - 0.5) * hw * 1.6, 0.2, -3 - R(k + 440) * 1.6); c.rotation.z = (R(k + 470) - 0.5) * 0.7; c.userData.hug = true; g.add(c); }
    if (kind !== "shellwright" && kind !== "mine") { const teeth = 2 + Math.floor(R(12) * 5); for (let k = 0; k < teeth; k++) { const st = mesh(new THREE.ConeGeometry(0.2 + R(k + 500) * 0.12, 0.8 + R(k + 530) * 1.1, 5), snowy ? mat(0xdff4ff, { transparent: true, opacity: 0.85 }) : rock[0], (k / Math.max(1, teeth - 1) - 0.5) * hw * 1.2, hh + 0.3, -1); st.rotation.x = Math.PI; st.userData.hug = true; g.add(st); } }
    const glow = new THREE.PointLight(T.glow[Math.floor(R(13) * T.glow.length)], 2.2, 7, 1.8); glow.position.set(0, Math.min(2.2, hh * 0.6), -3.4); g.add(glow);
    g.scale.setScalar(S);
    put(L, g, x, z, ry, 0);
    // fit every piece to the slope under it, so nothing floats on the downhill side or vanishes on the uphill side
    const c = Math.cos(ry), sn = Math.sin(ry), y0 = at(L, x, z);
    for (const o of g.children) if (o.userData.hug) { const lx = o.position.x * S, lz = o.position.z * S, px = x + lx * c + lz * sn, pz = z - lx * sn + lz * c; o.position.y += (Math.min(at(L, px, pz), y0 + 6) - y0) / S - 0.15; }
    // a dark floor going back into the hill: the ground rises behind the doorway, so without it the slope shows through the dark
    { const deep = 5, front = 0.9, back = (Math.min(at(L, x - sn * (deep - front) * S, z - c * (deep - front) * S), y0 + 6) - y0) / S + 0.3, len = Math.hypot(deep, back);
      const fl = mesh(new THREE.PlaneGeometry(hw * 2 + 1, len).rotateX(-Math.PI / 2), mat(0x060507, { roughness: 1 }), 0, back / 2 + 0.12, front - deep / 2);
      fl.rotation.x = Math.atan2(back, deep); fl.castShadow = false; g.add(fl); }
    // keep the doorway clear: trees and bushes (scattered after this, world.js) stay out of the mouth and the path in front of it
    (L.keep ||= []).push([x, z, 7], [x + sn * 8, z + c * 8, 7]);
    // fallen stones, ferns and grass round the feet, and a worn path leading in that wanders a little
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx, ring = [], ferns = [], path = [], wid = spread * S * 0.9;
    for (let k = 0; k < 6 + Math.floor(R(14) * 6); k++) { const sd = (R(k + 560) - 0.5) * wid * 2, fw = 2 + R(k + 590) * 7; if (Math.abs(sd) < hw * S && fw < 9) continue; ring.push({ x: x + rx * sd + fx * fw, z: z + rz * sd + fz * fw, ry: R(k + 620) * 6, s: 0.5 + R(k + 650) * 1 }); }
    for (let k = 0; k < 12; k++) { const sd = (R(k + 680) - 0.5) * wid * 1.7, fw = Math.abs(sd) < hw * S + 2 ? 2.5 + R(k + 710) * 4 : -2 + R(k + 710) * 6; if (Math.abs(sd) < hw * S && fw < 9) continue; ferns.push({ x: x + rx * sd + fx * fw, z: z + rz * sd + fz * fw, ry: R(k + 740) * 6, s: 0.9 + R(k + 770) * 0.9 }); }
    const bend = (R(15) - 0.5) * 2.4;
    for (let k = 0; k < 6; k++) { const fw = 3.5 + k * 2.1, sd = Math.sin(k * 0.9 + R(16) * 3) * 0.6 + bend * k / 5; path.push({ x: x + rx * sd + fx * fw, z: z + rz * sd + fz * fw, ry: R(k + 800) * 6, s: 1 + R(k + 830) * 0.3 }); }
    for (const l of [ring, ferns, path]) for (const p of l) p.y = at(L, p.x, p.z) - 0.05;
    forest(`${MEGA}Rock_Medium_${1 + Math.floor(R(17) * 3)}.gltf`, L.group, ring).catch(() => {});
    if (!snowy) { forest(`${MEGA}Fern_1.gltf`, L.group, ferns.slice(0, 7)).catch(() => {}); forest(`${MEGA}Grass_Wispy_Tall.gltf`, L.group, ferns.slice(7)).catch(() => {}); }
    forest(`${MEGA}RockPath_Round_Small_${1 + Math.floor(R(18) * 3)}.gltf`, L.group, path).catch(() => {});
    for (const side of [-1, 1]) addSolid(L, { x: x + fz * side * (hw + 4.2) * S * 0.8 - fx * 1.5, z: z - fx * side * (hw + 4.2) * S * 0.8 - fz * 1.5, r: 2.6 });
    addSolid(L, { x: x - fx * 5, z: z - fz * 5, r: 4 });
    for (const p of ring) if (p.s > 1.1) addSolid(L, { x: p.x, z: p.z, r: p.s * 0.8 });
    addSolid(L, { x: x + fx * 1.5, z: z + fz * 1.5, r: 0, use: () => (needs && !s.verses[needs] ? null : ["Go into the cave", () => G.cave?.enter(L, x, z, ry, i)]) });
    return kind;
  };
  /** a mouth where a cave would really be: at the foot of a rise, the hill climbing steeply behind it, level ground in front to walk up on,
   *  well away from towns, water, roads, other mouths and anything kept clear. salt picks a different spot among the good ones */
  const mouthSpot = (L, salt = 0, loose = false) => {
    const { a, b } = L.cfg, keep = L.keep || [], ok = (x, z) => keep.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) > r + 14);
    const q = L.cfg.quarter, town = (x, z) => q && Math.hypot(x - q.cx, z - q.cz) < (q.extent ?? q.ring) + 20;
    let best = null;
    for (let i = 0; i < 420; i++) {
      const t = pick(i + salt * 977, 61) * 6.3, r = 0.25 + pick(i + salt * 977, 62) * 0.55, x = Math.cos(t) * a * r, z = Math.sin(t) * b * r, y = at(L, x, z);
      if (y < 5 || !ok(x, z) || town(x, z) || L.land.onRoad?.(x, z)) continue;
      const gx = at(L, x + 3, z) - at(L, x - 3, z), gz = at(L, x, z + 3) - at(L, x, z - 3), slope = Math.hypot(gx, gz) / 6;
      if ((!loose && slope < 0.18) || slope > 1.1) continue;                           // on a real hillside, not the flat and not a sheer drop
      const ry = Math.atan2(-gx, -gz), fx = Math.sin(ry), fz = Math.cos(ry), ahead = at(L, x + fx * 8, z + fz * 8);
      if (ahead < 4 || y - ahead > 4.5 || ahead > y + 0.5) continue;      // somewhere you can walk up to, from below
      const behind = at(L, x - fx * 10, z - fz * 10) - y, sideL = at(L, x + fz * 9, z - fx * 9) - y, sideR = at(L, x - fz * 9, z + fx * 9) - y;
      if (behind < (loose ? 0.5 : 2.5)) continue;                                        // a cave goes INTO a hill: there must be one behind it
      if (L.cfg.waters && (wetness(L.cfg.waters, x, z) < 0.98 || wetness(L.cfg.waters, x + fx * 8, z + fz * 8) < 0.98)) continue;      // not in a river or a pond
      const crowded = !clearAt(L, x, z, 9) || !clearAt(L, x + fx * 9, z + fz * 9, 5);
      const level = Math.abs(at(L, x + fx * 5, z + fz * 5) - ahead) < 2.2 ? 1 : 0;                       // a little apron of level ground in front
      const tucked = Math.abs(sideL - sideR) < 3 ? 1 : 0;                                              // the hill wraps round both sides, not a lone bump
      const score = Math.min(behind, 9) * 0.5 + level * 1.5 + tucked + slope - (crowded ? 10 : 0) + pick(i + salt * 31, 63) * (salt ? 2.5 : 0.6);
      if (!best || score > best[3]) best = [x, z, ry, score];
    }
    return best || (loose ? null : mouthSpot(L, salt, true));             // a turtle with no proper hillside still gets its mouth, in the best rise it has
  };

  // ---------------- the verse stones ----------------
  E.blockers = {};
  const verseStone = (L, v) => {
    const raised = v.land === "fernwood" ? 9.2 : 0, sunk = !s.verses[v.id] && ["pillar", "reef", "salt"].includes(v.land);
    const o = madeProp("tablet"); o.scale.setScalar(1.5);
    o.position.set(v.x + (raised ? 3 : 0), at(L, v.x, v.z) + raised + (sunk ? -3.6 : 0) - (v.land === "reef" ? 0.8 : 0), v.z); o.rotation.y = 0.5; L.group.add(o);
    // a soft glow while it's still unread
    const halo = mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshBasicMaterial({ color: 0x9ff3e6, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.06, 0); halo.rotation.x = -Math.PI / 2; halo.castShadow = false; o.add(halo); halo.visible = !s.verses[v.id];
    if (v.land === "hollow" && !s.verses[v.id]) {                // a rockfall in front of its cave
      const pile = new THREE.Group(); for (let i = 0; i < 7; i++) pile.add(mesh(new THREE.DodecahedronGeometry(0.9 + pick(i, 9) * 0.7, 0), mat(0x7a7468), (i - 3) * 0.9, 0.6 + (i % 2) * 0.9, 0));
      put(L, pile, v.x, v.z + 3); E.blockers.v3 = { L, o: pile, solids: [addSolid(L, { x: v.x, z: v.z + 3, r: 2.4 })] };
    }
    if (s.verses[v.id]) for (const b of [E.blockers[v.id]]) if (b) { b.L.group.remove(b.o); b.solids.forEach(dropSolid); }
    const rec = addSolid(L, { x: v.x, z: v.z + (v.land === "hollow" ? 5 : 0), r: 0 });
    rec.use = () => (s.verses[v.id] ? null : [v.needs ? `The stone ${v.where}` : "Read the verse stone", () => E.read(v, o, halo)]);
  };
  E.read = (v, o, halo) => {
    const P = G.player;
    if (v.needs && !v.needs.some((n) => G.canReach(n))) return G.talk.say(COMPANION.name, [v.hint]);
    s.verses[v.id] = true;
    const b = E.blockers[v.id];
    if (b) { b.L.group.remove(b.o); b.solids.forEach(dropSolid); G.vfx.burst(v.land === "thorn" ? "leaf" : v.land === "salt" ? "dust" : "stone", P.pos.x, P.pos.y + 1, P.pos.z, 3); G.sfx(v.land === "thorn" ? "rustle" : "stonebreak"); }
    if (o.position.y < at(G.world.lands[v.land], v.x, v.z) - 1) { const from = o.position.y, to = from + 3.6; let k = 0; const up = setInterval(() => { k = Math.min(1, k + 0.05); o.position.y = from + (to - from) * k; if (k >= 1) clearInterval(up); }, 40); }      // a sunk stone rises out of the ground
    halo.visible = false;
    P.riding?.char.react?.("roar"); P.riding?.say?.("happy");
    G.sfx("rare"); G.vfx.burst("glow", P.pos.x, P.pos.y + 1.5, P.pos.z, 2);
    popup(`Verse ${versesOf(s)} of ${VERSES.length} of the Waking Song`, "good");
    G.talk.say(COMPANION.name, [`"${v.text.replace(" / ", " ")}"`, ...(versesOf(s) === 1 ? ["A verse... carved by the Shellwrights, I think. It sounds like a lullaby. Old Moss would want to hear this."] : versesOf(s) >= VERSES.length ? ["That's all eight. We have the whole song. Let's take it to Old Moss."] : [`${VERSES.length - versesOf(s)} still out there.`])]);
  };

  E.build = async (L) => {
    const f = BUILD[L.cfg.feature];
    try { if (f) await f(L); } catch (e) { console.warn("[turtle] explore", L.cfg.id, e); }
    try { if (f && L.cfg.feature !== "caves") { const m = mouthSpot(L); if (m) E.caveMouth(L, m[0], m[1], m[2], 0); } } catch (e) { console.warn("[turtle] cave mouth", L.cfg.id, e); }
    for (const v of VERSES) if (v.land === L.cfg.id) verseStone(L, v);
  };
  return E;
}
