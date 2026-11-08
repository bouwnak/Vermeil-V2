// waters.js - fresh water on the turtles: a river or two that rises by each turtle's hill and runs downhill to the sea, waterfalls where it drops
// over one of the land's cliffs (a plunge pool and mist at the foot), and ponds and lakes in the hollows. Emberback's run with lava instead.
// planWaters() works it out on paper from the turtle's own shape before the land is made (the same every time, from the turtle's seed), and the
// land carves the beds and banks into itself (terrain.js calls carve()). drawWaters() puts the water, the stones and the reeds in when you come close.
import * as THREE from "three";
import { forest, prop } from "./assets.js";
import { addSolid } from "./world.js";
import { CARVINGS, GATES, SECRETS, VERSES } from "./data.js";

const GROWN = "conv_ultimate_nature_pack/", MEGA = "stylized_nature_megakit/";
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const rng = (seed) => { let s = Math.floor(seed * 7919 + 104729) % 2147483647 || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const segAt = (x, z, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, u = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1))); return [Math.hypot(x - ax - vx * u, z - az - vz * u), u]; };

/** what the water looks like on each kind of turtle. lava: it glows and you can't drink it or fish in it */
const LOOK = {
  Frozen: { deep: 0x3f8fc0, shallow: 0x9fe0f2, foam: 0xffffff },
  Swamp: { deep: 0x3d5a3a, shallow: 0x7fa070, foam: 0xd8e8c8 },
  Volcanic: { deep: 0xd2400e, shallow: 0xffb020, foam: 0xfff0a0, lava: true },
  Desert: { deep: 0x1aa4b0, shallow: 0x7fe6d8, foam: 0xffffff },
  Tropical: { deep: 0x1fb5c4, shallow: 0x8ff4e4, foam: 0xffffff },
  default: { deep: 0x3aa6cf, shallow: 0x9ae6ef, foam: 0xffffff },
};
export const waterLook = (cfg) => LOOK[cfg.biome] || LOOK.default;

/** where water mustn't go on this turtle: the town and its quarter, the farm fields, roads, the story's places, a far turtle's own city */
function dryZones(cfg) {
  const z = [], id = cfg.id;
  for (const f of cfg.flats || []) if (!f.pier) z.push([f.x, f.z, f.r * 1.25]);
  const q = cfg.quarter; if (q) { z.push([q.cx, q.cz, q.ring + 34]); for (const zz of q.zones || []) z.push(zz); }
  if (cfg.hill) z.push([cfg.hill[0], cfg.hill[1], 12]);
  if (cfg.carving) z.push([cfg.carving[0], cfg.carving[1], 12]);
  if (cfg.ruins) z.push([0, 20, 40]);
  if (cfg.feature === "city") z.push([0, 0, 72]);
  if (cfg.feature) z.push([0, 0, 22]);
  for (const s of [...VERSES, ...GATES, ...SECRETS, ...CARVINGS]) if (s.land === id) z.push([s.x, s.z, 14]);
  return z;
}

/** lay out the turtle's water. Sets cfg.waters = { rivers: [{ pts: [[x, z, level]], w, falls: [i...] }], ponds: [{ x, z, r, y }] }. Run once, before its land is made */
export function planWaters(cfg, land) {
  if (cfg.waters !== undefined) return;
  cfg.waters = null;
  if (cfg.id === "home" || cfg.noWater || !cfg.palette) return;
  const { a, b, seed = 1 } = cfg, R = rng(seed * 13 + 5), dry = dryZones(cfg), rivers = [], ponds = [];
  const h = (x, z) => land.height(x, z);
  const isDry = (x, z, pad = 0) => dry.some(([dx, dz, r]) => Math.hypot(x - dx, z - dz) < r + pad) || (cfg.roads || []).some((r) => segAt(x, z, r.from[0], r.from[1], r.to[0], r.to[1])[0] < r.w + 5 + pad);
  const wetNear = (x, z, pad) => rivers.some((rv) => rv.pts.some(([px, pz]) => Math.hypot(x - px, z - pz) < rv.w + pad)) || ponds.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);

  // ---- rivers: from a spring high on a hill, always downhill, round what's in the way, to the sea (or a lake where it can't go on) ----
  const want = cfg.feature === "saltflat" ? 0 : cfg.biome === "Desert" ? 0 : a > 150 ? 2 : 1 + (seed % 2);
  const tops = [...(cfg.peaks || [])].sort((p, q) => q[2] - p[2]);
  for (let n = 0, tries = 0; n < want && tries < 10; tries++) {
    const pk = tops[tries % Math.max(1, tops.length)] || [0, 0, 10, 20];
    let best = null;
    for (let k = 0; k < 24; k++) {
      const ang = R() * 6.3, d = pk[3] * (0.45 + R() * 0.5), x = pk[0] + Math.cos(ang) * d, z = pk[1] + Math.sin(ang) * d, y = h(x, z);
      if (y < 9 || isDry(x, z, 6) || wetNear(x, z, 30) || Math.hypot(x / a, z / b) > 0.7) continue;
      if (!best || y > best[2]) best = [x, z, y, ang];
    }
    if (!best) continue;
    let [x, z, , heading] = best;
    const raw = [[x, z]];
    let end = "lake";
    for (let s = 0; s < 160; s++) {
      const y0 = h(x, z);
      let pick = null;
      for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.4, -1.4]) {
        const nx = x + Math.cos(heading + turn) * 3, nz = z + Math.sin(heading + turn) * 3, ny = h(nx, nz);
        if (ny > y0 + 0.15 || isDry(nx, nz, 2)) continue;
        if (raw.slice(0, -4).some(([px, pz]) => Math.hypot(nx - px, nz - pz) < 5)) continue;          // never back over itself
        const score = ny + Math.abs(turn) * 0.9 + (R() - 0.5) * 0.4;
        if (!pick || score < pick[3]) pick = [nx, nz, turn, score, ny];
      }
      if (!pick) break;
      x = pick[0]; z = pick[1]; heading += pick[2];
      raw.push([x, z]);
      if (pick[4] < 0.2) { end = "sea"; break; }
    }
    if (raw.length < 14) continue;
    // rounded off (Chaikin), so it bends instead of zig-zagging
    let pts = raw;
    for (let it = 0; it < 2; it++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [p, q] = [pts[i], pts[i + 1]]; o.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; }
    // the water's level only ever goes down; where it drops a long way at once, that's a waterfall
    let lvl = h(pts[0][0], pts[0][1]) - 0.5;
    const out = [], falls = [];
    for (let i = 0; i < pts.length; i++) {
      const [px, pz] = pts[i], g = h(px, pz) - 0.45, next = Math.min(lvl, g);
      if (i && lvl - next > 1.5) falls.push(i);
      lvl = next; out.push([px, pz, end === "sea" && i === pts.length - 1 ? Math.min(lvl, -0.2) : lvl]);
    }
    const w = 3.6 + R() * 1.4 + (a > 150 ? 1 : 0);
    // a run of steps close together is one waterfall: its pool and mist go at the foot of the last step
    const drops = falls.filter((i, k) => falls[k + 1] === undefined || falls[k + 1] - i > 6).filter((i) => out[Math.max(0, i - 6)][2] - out[i][2] > 2.4);
    rivers.push({ pts: out, w, falls, drops, end });
    // a lake where a river ends inland (a waterfall gets no pool of its own: on a slope one only ever looked tilted)
    if (end === "lake") { const [px, pz, py] = out[out.length - 1]; ponds.push({ x: px, z: pz, r: 7 + R() * 5, y: py, lake: true }); }
    n++;
  }
  // ---- ponds: a few in the open, low hollows and level ground, never on the town or the fields ----
  const nPonds = cfg.biome === "Desert" ? 2 : cfg.biome === "Swamp" ? 5 : 3;
  for (let k = 0, got = 0; k < 90 && got < nPonds; k++) {
    const ang = R() * 6.3, rr = 0.2 + R() * 0.55, x = Math.cos(ang) * a * rr, z = Math.sin(ang) * b * rr, r = 4 + R() * 4.5, y = h(x, z);
    if (y < 4.4 || isDry(x, z, r + 4) || wetNear(x, z, r + 14)) continue;
    let lo = 1e9, hi = -1e9;
    for (let s = 0; s < 8; s++) { const q = h(x + Math.cos(s * 0.8) * r * 1.4, z + Math.sin(s * 0.8) * r * 1.4); lo = Math.min(lo, q); hi = Math.max(hi, q); }
    if (hi - lo > 2.2) continue;                                      // level ground only: on a slope its water would hang in the air
    ponds.push({ x, z, r, y: Math.min(y, lo) - 0.35, oasis: cfg.biome === "Desert" });
    got++;
  }
  cfg.waters = rivers.length || ponds.length ? { rivers, ponds } : null;
}

/** the land with the water's beds cut into it. y: the height without them */
export function carve(W, x, z, y) {
  const y0 = y;
  for (const rv of W.rivers) {
    if (!rv.box) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [px, pz] of rv.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); } rv.box = [x0 - 12, x1 + 12, z0 - 12, z1 + 12]; }
    const [x0, x1, z0, z1] = rv.box;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    let bd = 1e9, lv = 0;
    for (let i = 0; i < rv.pts.length - 1; i++) {
      const [ax, az, al] = rv.pts[i], [bx, bz, bl] = rv.pts[i + 1];
      if (Math.abs(x - ax) > rv.w * 3 + 4 && Math.abs(x - bx) > rv.w * 3 + 4) continue;
      const [d, u] = segAt(x, z, ax, az, bx, bz);
      if (d < bd) { bd = d; lv = lerp(al, bl, u); }
    }
    const w = rv.w;
    if (bd > w * 2.4) continue;
    const bed = bd < w * 0.8 ? lv - 1.2 : bd < w ? lerp(lv - 1.2, lv + 0.4, (bd - w * 0.8) / (w * 0.2)) : lv + 0.4;     // a flat bed, steep little banks
    y = lerp(bed, y, smooth(w * 1.1, w * 2.4, bd));
  }
  // ponds last: a plunge pool keeps its basin even where the river below it cuts deeper down a steep slope
  for (const p of W.ponds) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r * 1.8) continue;
    const bed = d < p.r * 0.85 ? p.y - (p.lake ? 2.2 : 1.4) * (1 - (d / p.r) ** 2 * 0.5) - 0.15 : d < p.r ? p.y - 0.4 : p.y + 0.4;
    const cut = y;                                          // the ground as the river left it
    y = lerp(bed, y, smooth(p.r * 0.95, p.r * 1.8, d));
    if (d > p.r * 0.85 && cut < y0 - 0.3) y = Math.min(y, cut);      // the river's way out goes through the rim
  }
  return y;
}

/** how near the water a point is: 0 in it, 1 well clear. For the ground's colour (wet pebbly banks) and to keep things off the water */
export function wetness(W, x, z) {
  let k = 1;
  for (const p of W.ponds) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 1.7) k = Math.min(k, smooth(p.r * 0.9, p.r * 1.7, d)); }
  for (const rv of W.rivers) {
    const [x0, x1, z0, z1] = rv.box || [-1e9, 1e9, -1e9, 1e9];
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    for (let i = 0; i < rv.pts.length - 1; i++) { const [d] = segAt(x, z, rv.pts[i][0], rv.pts[i][1], rv.pts[i + 1][0], rv.pts[i + 1][1]); if (d < rv.w * 2.2) k = Math.min(k, smooth(rv.w * 0.9, rv.w * 2.2, d)); }
  }
  return k;
}

// ---------------- what you see ----------------
/** ripples drawn once and shared: soft light streaks that the water's flow slides along */
let RIPPLE = null;
function ripple() {
  if (RIPPLE) return RIPPLE;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"); x.fillStyle = "#e4e4e4"; x.fillRect(0, 0, 128, 128);
  const r = rng(3);
  for (let i = 0; i < 70; i++) { const px = r() * 128, py = r() * 128, l = 8 + r() * 26; x.strokeStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + 3, py + l * 0.3, px - 3, py + l * 0.6, px, py + l); x.stroke(); }
  RIPPLE = new THREE.CanvasTexture(c); RIPPLE.wrapS = RIPPLE.wrapT = THREE.RepeatWrapping; RIPPLE.colorSpace = THREE.SRGBColorSpace;
  return RIPPLE;
}
const flowing = [];
/** the water's material: its colour times the moving ripples, a little sheen; lava glows on its own */
function waterMat(look, still) {
  const map = ripple().clone(); map.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map, roughness: look.lava ? 0.8 : 0.12, metalness: look.lava ? 0 : 0.1, transparent: !look.lava, opacity: 0.88, flatShading: false, emissive: look.lava ? 0xff5a10 : 0x000000, emissiveIntensity: look.lava ? 0.9 : 0, emissiveMap: look.lava ? map : null, depthWrite: !!look.lava, side: THREE.DoubleSide });
  flowing.push({ map, speed: still ? 0.012 : look.lava ? 0.05 : 0.22, still });
  return m;
}
/** move every river's ripples along. Called each frame from main's loop through G.waters.tick */
export function tickWaters(dt, t) { for (const f of flowing) { if (f.still) { f.map.offset.x = Math.sin(t * 0.21) * 0.08; f.map.offset.y = Math.cos(t * 0.17) * 0.08; } else f.map.offset.y -= f.speed * dt; } }

/** the river's drawn surface down its middle: at its planned level, never under the ground as drawn (the ground is a coarse mesh, so on a
 *  steep stretch it can stand above the plan), and only ever downhill. Kept on the river as rv.top, for the cascades' rocks and spray */
function surface(rv, land) {
  if (rv.top) return rv.top;
  let last = 1e9;
  return (rv.top = rv.pts.map(([x, z, y]) => (last = Math.min(last, Math.max(y + 0.12, land ? land.ground(x, z) + 0.18 : y + 0.12)))));
}
/** how steeply the surface drops at point i, metres down per metre along */
const steep = (rv, i) => { const a = Math.max(0, i - 1), b = Math.min(rv.pts.length - 1, i + 1), d = Math.hypot(rv.pts[b][0] - rv.pts[a][0], rv.pts[b][1] - rv.pts[a][1]) || 1; return (rv.top[a] - rv.top[b]) / d; };
/** a river's surface: one strip down its middle, deep colour in the channel and pale at the edges, white foam where it tumbles downhill.
 *  Every point lies on the ground as drawn or on the water's own level, whichever is lower, so it never hangs in the air as a sheet */
function riverMesh(rv, look, land) {
  const pos = [], col = [], uv = [], idx = [], deep = new THREE.Color(look.deep), shallow = new THREE.Color(look.shallow), foam = new THREE.Color(look.foam), c = new THREE.Color();
  const ACROSS = [-1, -0.7, -0.35, 0, 0.35, 0.7, 1], top = surface(rv, land);
  let along = 0;
  for (let i = 0; i < rv.pts.length; i++) {
    const [x, z] = rv.pts[i], y = top[i], p = rv.pts[Math.max(0, i - 1)], n = rv.pts[Math.min(rv.pts.length - 1, i + 1)];
    let dx = n[0] - p[0], dz = n[1] - p[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    if (i) along += Math.hypot(x - rv.pts[i - 1][0], z - rv.pts[i - 1][1]) + Math.abs(y - top[i - 1]);
    const mouth = i > rv.pts.length - 6 && rv.end === "sea" ? 1 + (i - rv.pts.length + 6) * 0.25 : 1, w = rv.w * 1.08 * mouth;
    // white water: from a gentle run (none) to a cascade (all foam), a little either side of the steep bit
    const white = smooth(0.12, 0.45, Math.max(steep(rv, i), steep(rv, Math.max(0, i - 2)) * 0.8, steep(rv, Math.min(rv.pts.length - 1, i + 2)) * 0.8));
    for (const k of ACROSS) {
      const vx = x - dz * w * k, vz = z + dx * w * k, g = land ? land.ground(vx, vz) : y - 1;
      pos.push(vx, Math.min(y, Math.max(g + 0.1, y - 3)), vz);
      c.copy(shallow).lerp(deep, (1 - Math.abs(k)) * (1 - white * 0.5)).lerp(foam, white * (Math.abs(k) > 0.8 ? 0.45 : (i + k * 3) % 2 ? 0.32 : 0.18));
      col.push(c.r, c.g, c.b); uv.push((k + 1) * 0.5 * (w / 4), along / 8);
    }
  }
  const n = ACROSS.length;
  for (let i = 0; i < rv.pts.length - 1; i++) for (let k = 0; k < n - 1; k++) { const A = i * n + k, B = A + 1, C = A + n, D = C + 1; idx.push(A, C, B, B, C, D); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, waterMat(look, false)); m.receiveShadow = true; m.renderOrder = 2;
  return m;
}
/** a pond's surface: a wobbly round, deep in the middle. Its edge drapes onto the ground wherever the ground drops below the water (a
 *  plunge pool on a slope spills over its low side into the river), so it never hangs in the air as a flat slab */
function pondMesh(p, look, land) {
  const N = 22, top = p.y + 0.1, pos = [p.x, top, p.z], col = [], uv = [0.5, 0.5], idx = [], deep = new THREE.Color(look.deep), shallow = new THREE.Color(look.shallow), mid = deep.clone().lerp(shallow, 0.5), r = rng(p.x * 3 + p.z);
  const lay = (x, z) => Math.min(top, land ? land.ground(x, z) + 0.08 : top);
  col.push(deep.r, deep.g, deep.b);
  for (const [ring, c] of [[0.55, mid], [1, shallow]]) for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, rr = p.r * ring * (ring < 1 ? 1 : 0.97 + r() * 0.08), x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
    pos.push(x, lay(x, z), z); col.push(c.r, c.g, c.b); uv.push(0.5 + Math.cos(a) * rr / 8, 0.5 + Math.sin(a) * rr / 8);
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a0 = 1 + i, a1 = 1 + j, b0 = 1 + N + i, b1 = 1 + N + j;
    idx.push(0, a1, a0, a0, a1, b1, a0, b1, b0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, waterMat(look, true)); m.receiveShadow = true; m.renderOrder = 2;
  return m;
}
/** mist and spray at the foot of a waterfall: soft white puffs that rise, swell and fade, over and over */
let PUFF = null;
function mist(group, x, y, z, w, look) {
  if (!PUFF) { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); PUFF = new THREE.CanvasTexture(c); }
  const puffs = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF, color: look.lava ? 0xffa060 : 0xffffff, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.userData.k = i / 9; s.userData.ox = (Math.random() - 0.5) * w * 1.6; s.userData.oz = (Math.random() - 0.5) * w * 1.6;
    group.add(s); puffs.push(s);
  }
  MISTS.push({ puffs, x, y, z, w });
}
const MISTS = [];
export function tickMists(dt) {
  for (const m of MISTS) for (const s of m.puffs) {
    s.userData.k = (s.userData.k + dt * 0.35) % 1; const k = s.userData.k;
    s.position.set(m.x + s.userData.ox * (0.5 + k * 0.6), m.y + 0.2 + k * 1.6, m.z + s.userData.oz * (0.5 + k * 0.6));
    s.scale.setScalar(0.8 + k * m.w * 0.7); s.material.opacity = Math.sin(k * Math.PI) * 0.3;
  }
}

/** come close: the water itself, with stones, reeds and lily pads round it. Spots you can drink, fill a can and fish at are marked `pond` */
export async function drawWaters(G, L) {
  const W = L.cfg.waters;
  if (!W || L.watered) return;
  L.watered = true;
  const look = waterLook(L.cfg), g = new THREE.Group(), land = L.land, jobs = [];
  g.name = "waters"; L.group.add(g);
  const mark = (x, z) => { if (!look.lava) addSolid(L, { x, z, r: 0, pond: true }); else addSolid(L, { x, z, r: 0, lava: true }); };
  const rocks = [], reeds = [], pads = [], pebbles = [];
  const R = rng(L.cfg.seed * 7 + 3);
  for (const rv of W.rivers) {
    g.add(riverMesh(rv, look, land));
    rv.pts.forEach(([x, z], i) => {
      if (i % 2 === 0) mark(x, z);
      if (i % 3) return;
      const p = rv.pts[Math.min(rv.pts.length - 1, i + 1)], dx = p[0] - x, dz = p[1] - z, l = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1]) {
        const off = rv.w * (1.15 + R() * 0.5), bx = x - dz / l * off * side, bz = z + dx / l * off * side, by = land.ground(bx, bz);
        const roll = R();
        if (roll < 0.35) rocks.push({ x: bx, y: by - 0.15, z: bz, s: 0.5 + R() * 0.7, ry: R() * 6 });
        else if (roll < 0.75 && !look.lava) reeds.push({ x: bx, y: by - 0.05, z: bz, s: 0.8 + R() * 0.6, ry: R() * 6 });
        else pebbles.push({ x: bx, y: by - 0.05, z: bz, s: 0.6 + R() * 0.6, ry: R() * 6 });
      }
    });
    // where it tumbles: big boulders on both banks and a few in the stream for the water to break over, spray where it lands
    const top = surface(rv, land);
    let foot = -1;
    for (let i = 1; i < rv.pts.length - 1; i++) {
      const st = steep(rv, i);
      if (st < 0.3) { if (foot > 0 && i - foot < 3) { const [x, z] = rv.pts[i]; mist(g, x, top[i] - 0.1, z, rv.w * 0.8, look); foot = -9; } continue; }
      foot = i;
      if (i % 2) continue;
      const [x, z] = rv.pts[i], p = rv.pts[i + 1], dx = p[0] - x, dz = p[1] - z, l = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1]) { const off = rv.w * (1.05 + R() * 0.3), bx = x - dz / l * off * side, bz = z + dx / l * off * side; rocks.push({ x: bx, y: Math.min(land.ground(bx, bz), top[i]) - 0.4, z: bz, s: 2.2 + R() * 1.6, ry: R() * 6 }); }
      if (R() < 0.45) { const off = (R() - 0.5) * rv.w, bx = x - dz / l * off, bz = z + dx / l * off; rocks.push({ x: bx, y: top[i] - 0.6, z: bz, s: 1 + R() * 0.7, ry: R() * 6 }); }
    }
  }
  for (const p of W.ponds) {
    g.add(pondMesh(p, look, land));
    for (let k = 0; k < Math.max(3, p.r * 1.2); k++) { const a = R() * 6.3, d = Math.sqrt(R()) * p.r * 0.85; mark(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d); }
    mark(p.x, p.z);
    const ring = Math.round(p.r * 2.2);
    for (let k = 0; k < ring; k++) {
      const a = k / ring * 6.3 + R() * 0.2, d = p.r * (1.02 + R() * 0.35), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = land.ground(x, z), roll = R();
      if (roll < 0.4) rocks.push({ x, y: y - 0.15, z, s: 0.45 + R() * 0.6, ry: a });
      else if (roll < 0.85 && !look.lava) reeds.push({ x, y: y - 0.05, z, s: 0.8 + R() * 0.7, ry: a });
      else pebbles.push({ x, y: y - 0.05, z, s: 0.6 + R() * 0.5, ry: a });
    }
    if (!look.lava && L.cfg.biome !== "Frozen") for (let k = 0; k < Math.round(p.r * 0.7); k++) { const a = R() * 6.3, d = (0.3 + R() * 0.55) * p.r; pads.push({ x: p.x + Math.cos(a) * d, y: p.y + 0.04, z: p.z + Math.sin(a) * d, s: 0.9 + R() * 0.6, ry: a }); }
  }
  const put = (path, list, size) => list.length && jobs.push(forest(path, g, list.map((o) => ({ x: o.x, y: o.y, z: o.z, ry: o.ry, s: o.s * size }))));
  const rockKinds = [1, 2, 3, 4, 5, 6, 7].map((i) => `${GROWN}Rock_${i}.glb`);
  rockKinds.forEach((path, i) => put(path, rocks.filter((_, k) => k % rockKinds.length === i), 0.9));
  put(`${MEGA}Grass_Wispy_Tall.gltf`, reeds.filter((_, k) => k % 2), 1.3);
  put(`${MEGA}Grass_Common_Tall.gltf`, reeds.filter((_, k) => !(k % 2)), 1.2);
  [1, 2, 3].forEach((i) => put(`${MEGA}Pebble_Round_${i}.gltf`, pebbles.filter((_, k) => k % 3 === i - 1), 1));
  put(`${GROWN}Lilypad.glb`, pads, 1.1);
  await Promise.all(jobs).catch((e) => console.warn("[turtle] waters", L.cfg.id, e));
}

/** what's in the way of building, planting, or putting down a house: anywhere at the water or on its banks */
export const wetAt = (L, x, z, pad = 0) => { const W = L.cfg.waters; return !!W && wetness(W, x, z) < 0.55 - pad * 0.02; };
