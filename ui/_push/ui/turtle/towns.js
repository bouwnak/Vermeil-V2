// towns.js - every town grows with its turtle, and every town grows its own way. Round the old middle of each town (its square, its stalls,
// its first houses) the new streets go out the way that town would build them:
//   Willowmere   a village green: winding lanes out into the fields, each ending in a little close, and an upper town on the hill up a stone stair
//   Sunback      a bazaar: one long main street right through, and a walled kasbah up the slope above it
//   Hoarshell    a huddle of cross streets, square to each other against the wind
//   Mirewalk     one long boardwalk winding through the marsh
//   Coralcrest   a harbour crescent looking out to sea, and a terrace up behind it
//   Emberback    terraces stepped up the side of the volcano, a switchback stair from one to the next
// Upper towns stand on levelled terraces held up by stone retaining walls, joined by real stairways with side walls and lamps. Every house is
// of the same village kit, faces its street, has a front yard with a little fence and flowers, and its people's things by the door.
// planTown() lays it out on paper before the land is made (the streets and terraces change the ground); dressTown() puts the models down
// when you come close. Everything is checked against everything else and against the ground, so nothing stands in a wall, a road or the air.
import * as THREE from "three";
import { forest, prop } from "./assets.js";
import { emitter, fillFountain, lampLight } from "./made.js";
import { HOUSE_FX, TOWN_FOUNTAINS, WIND, houseBatch, lookOf, restyle } from "./houses.js";
import { TOWN_KIT } from "./wilddata.js";
import { Land } from "./terrain.js";
import { TOWN_IDS, TOWN_SHOPS } from "./shopdata.js";
import { SHOP_R, buildShop } from "./shops.js";

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const segD = (x, z, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1); return Math.hypot(x - ax - vx * u, z - az - vz * u); };
const polyD = (x, z, pts) => { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, segD(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; };
/** how each town builds (by its name, since planTown runs before the turtles get their ids) */
const STYLE = { Willowmere: "green", Sunback: "bazaar", Hoarshell: "grid", Mirewalk: "boardwalk", Coralcrest: "harbour", Emberback: "terraces" };

/**
 * lay out a town's new streets, terraces, stairs and house lots. Adds them to cfg.roads and cfg.flats (so the land is shaped for them) and
 * leaves cfg.quarter = { cx, cz, ring, y, extent, walk, zones, plan } for dressTown, life.js (where folk stroll) and waters.js (where no river goes).
 * Run once, before makeLand.
 */
export function planTown(cfg) {
  if (!cfg.houses || cfg.quarter) return;
  const f = cfg.flats[0], T = { x: f.x, z: f.z, h: f.h }, seed = cfg.seed || 1, K = TOWN_KIT, H = (i, j = 0) => hash(seed * 3.1 + i * 1.7, j * 7.7 + seed);
  const style = STYLE[cfg.name] || "green";
  // the old middle stays where it is, but its houses are built in the village kit too, so the whole town is of a piece
  let hk = 0;
  cfg.houses = cfg.houses.map(([p, x, z, h, ry]) => { if (!/house_\d+\.gltf$/.test(p)) return [p, x, z, h, ry]; const k = K.houses[(hk++ + seed) % 4]; return [k[0], x, z, k[1], ry]; });
  // what's already standing, and how far the old town reaches
  const taken = [];
  let reach = 0;
  for (const [, x, z, h] of cfg.houses) { const r = Math.max(1.5, h * 0.56); if (Math.hypot(x, z) < 48) reach = Math.max(reach, Math.hypot(x, z) + r); taken.push([T.x + x, T.z + z, r]); }
  for (const [x, z] of cfg.stalls || []) { reach = Math.max(reach, Math.hypot(x, z) + 3); taken.push([T.x + x, T.z + z, 3.4]); }
  for (const [x, z] of Object.values(cfg.places || {})) taken.push([T.x + x, T.z + z, 1.2]);
  const land = new Land(cfg);                                   // the ground as it would be, the old town square levelled
  const oldRoads = [...(cfg.roads || [])].map((r) => [r.from[0], r.from[1], r.to[0], r.to[1], r.w]);
  for (const p of cfg.flats.filter((fl) => fl.pier)) oldRoads.push([T.x, T.z, p.x, p.z, 6]);     // the way down to the pier stays open
  const P = { streets: [], stairs: [], terraces: [], lots: [], closes: [], benches: [], taken };
  cfg.roads ||= [];
  const pol = (a, d, o = T) => [o.x + Math.cos(a) * d, o.z + Math.sin(a) * d];
  const inIsland = (x, z, m = 0) => Math.hypot(x / Math.max(10, cfg.a - m), z / Math.max(10, cfg.b - m)) < 0.8;
  // a spot can be levelled if no hill (or its carving on top) is close enough to be flattened with it
  const levelOK = (x, z, r) => cfg.peaks.every(([px, pz, , w]) => Math.hypot(x - px, z - pz) - w * 0.85 > r * 1.14) && !(cfg.carving && Math.hypot(x - cfg.carving[0], z - cfg.carving[1]) < r * 1.14 + 10);
  // a terrace may be cut into a hill's flank (that's what its walls are for), just not take the top off it
  const cutOK = (x, z, r) => cfg.peaks.every(([px, pz, , w]) => Math.hypot(x - px, z - pz) > w * 0.45 + r) && !(cfg.carving && Math.hypot(x - cfg.carving[0], z - cfg.carving[1]) < r + 12);
  const nearRoad = (x, z, pad) => oldRoads.some(([ax, az, bx, bz, w]) => segD(x, z, ax, az, bx, bz) < w * 0.62 + pad);

  // ---------------- streets on the town's own level ----------------
  /** a street through these points, cut short where it would run off the turtle or into a hill. The ground under it is levelled to the town */
  const street = (pts, w = 4, kind = "street", h = T.h, level = true) => {
    const ok = [];
    for (const [x, z] of pts) { const c = !inIsland(x, z, 7) ? "shore" : !levelOK(x, z, 16) ? "hill" : P.terraces.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 1.12 + w) ? "terrace" : ""; if (c) { (P.cut ||= []).push(kind + ":" + c); break; } ok.push([x, z]); }
    let len = 0; for (let i = 1; i < ok.length; i++) len += Math.hypot(ok[i][0] - ok[i - 1][0], ok[i][1] - ok[i - 1][1]);
    if (ok.length < 2 || len < 12) return null;
    const s = { pts: ok, w, kind, h, len, made: [] };
    P.streets.push(s);
    for (let i = 1; i < ok.length; i++) { const rd = { from: [...ok[i - 1], h], to: [...ok[i], h], w, street: true }; cfg.roads.push(rd); s.made.push(rd); }
    // level the ground along it, wherever it isn't level already, wide enough for the houses either side
    if (level) for (let d = 0; d <= len; d += 18) { const [x, z] = along(s, d); if (Math.abs(land.height(x, z) - h) > 0.6 && levelOK(x, z, 18)) { const fl = { x, z, r: 18, h }; cfg.flats.splice(1, 0, fl); s.made.push(fl); } }
    return s;
  };
  /** take back a street that came out too short to be worth it */
  const unstreet = (s) => { if (!s) return; P.streets.splice(P.streets.indexOf(s), 1); for (const m of s.made) for (const list of [cfg.roads, cfg.flats]) { const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); } };
  /** a lane that climbs with the land instead of cutting it level: each stretch follows the ground, never steeper than a cart can take; it stops at a cliff */
  const climb = (pts, w = 4, kind = "lane") => {
    const ok = [], hs = [];
    for (const [x, z] of pts) {
      if (!inIsland(x, z, 7) || !cutOK(x, z, 4) || P.terraces.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 1.12 + w)) break;
      const nat = land.height(x, z), prev = hs.length ? hs[hs.length - 1] : T.h;
      if (hs.length && Math.abs(nat - prev) > 3.4) break;
      ok.push([x, z]); hs.push(hs.length ? clamp(nat, prev - 2.2, prev + 2.2) : T.h);
    }
    let len = 0; for (let i = 1; i < ok.length; i++) len += Math.hypot(ok[i][0] - ok[i - 1][0], ok[i][1] - ok[i - 1][1]);
    if (ok.length < 2 || len < 12) return null;
    const s = { pts: ok, w, kind, h: T.h, len, made: [] };
    P.streets.push(s);
    for (let i = 1; i < ok.length; i++) { const rd = { from: [...ok[i - 1], hs[i - 1]], to: [...ok[i], hs[i]], w, street: true }; cfg.roads.push(rd); s.made.push(rd); }
    return s;
  };
  /** the point and the way the street runs, d metres along it */
  const along = (s, d) => {
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], l = Math.hypot(bx - ax, bz - az);
      if (d <= l || i === s.pts.length - 1) { const u = clamp(d / (l || 1), 0, 1); return [ax + (bx - ax) * u, az + (bz - az) * u, (bx - ax) / (l || 1), (bz - az) / (l || 1)]; }
      d -= l;
    }
    return [...s.pts[0], 1, 0];
  };
  /** does a footprint fit here: clear of everything standing or planned, on the right level (a terrace's own top, or off every terrace) */
  const why = (P.why = {}), no = (k) => { why[k] = (why[k] || 0) + 1; return false; };      // what stopped lots (for checking a layout)
  const fits = (x, z, r, ter = null) => {
    if (taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr + 1)) return no("taken");
    if (nearRoad(x, z, r + 0.6)) return no("road");
    if (!inIsland(x, z, r + 3)) return no("shore");
    if (P.streets.some((s) => polyD(x, z, s.pts) < s.w * 0.62 + r + 0.5)) return no("street");
    if (P.stairs.some((st) => segD(x, z, st.a[0], st.a[1], st.b[0], st.b[1]) < st.w * 0.62 + r + 1)) return no("stair");
    if (ter) return Math.hypot(x - ter.x, z - ter.z) + r < ter.r * 0.97 || no("terrace edge");
    if (P.terraces.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 1.12 + r)) return no("terrace");
    return true;
  };
  // which of the landmarks this town gets, in a fixed order of its own
  const marks = K.landmarks.filter((m) => !/Gazebo/.test(m[0])).sort((p, q) => hash(seed, p[1]) - hash(seed, q[1]));
  const takeMark = (...wants) => { for (const want of wants) { const i = marks.findIndex((m) => want.test(m[0])); if (i >= 0) return marks.splice(i, 1)[0]; } return null; };
  let nLot = 0;
  // the town's walk-in shops (shopdata.js) take the first lots near the square that are big enough for one; the rest are houses
  const shopQ = (TOWN_SHOPS[TOWN_IDS[cfg.name]] || []).map((_, i) => [`shop:${i}`, 0, SHOP_R]);
  /** house lots down one or both sides of a street, every `gap` metres, each facing the street with a front yard between */
  const lotsAlong = (s, { sides = [-1, 1], gap = 16, from = 7, to = 5, at = null, ter = null, mark = 0, only = null, loose = 0, kits = null } = {}) => {
    if (!s) return;
    const spots = at || []; if (!at) for (let d = from; d < s.len - to; d += gap) spots.push(d);
    for (const d of spots) {
      const [px, pz, dx, dz] = along(s, d);
      for (const side of sides) {
        const ox = -dz * side, oz = dx * side;
        if (only && (ox * (only[0] - px) + oz * (only[1] - pz)) < 0) continue;           // only the side facing that way
        // a loose street (the marsh's) has its houses set back by differing amounts and turned a little, as if each was built when it was needed
        const base = loose ? Math.max(s.h, land.height(px, pz)) : s.h;          // a walk laid on the land as it lies: the houses sit by its own ground there
        const back = loose ? H(Math.round(d * 7), side + 3) * 2.6 * loose : 0, turn = loose ? (H(Math.round(d * 5), side + 9) - 0.5) * 0.36 * loose : 0;
        const where = (k) => { const off = s.w / 2 + 2.4 + k[2] + back, x = px + ox * off, z = pz + oz * off, nat = ter ? ter.h : land.height(x, z); return [x, z, nat, fits(x, z, k[2], ter) && (ter || ((nat <= base + 5 || no("high")) && (cutOK(x, z, k[2] + 3) || no("hill"))))]; };
        // a shop first, while there are shops to place and this is still near the square
        let kit = null, x, z, nat, ok;
        if (shopQ.length && (ter || d < 60 + s.w)) { [x, z, nat, ok] = where(shopQ[0]); if (ok) kit = shopQ.shift(); }
        if (!kit && kits) {                                      // infill: the biggest of these that fits, or nothing
          for (const k of kits) { [x, z, nat, ok] = where(k); if (ok) { kit = k; break; } }
          if (!kit) continue;
        }
        if (!kit) {
          const useMark = mark && marks.length && hash(nLot, seed) < mark;
          kit = (useMark && marks[0][2] < (mark >= 1 ? 7.5 : 6.7) ? marks.shift() : null) || K.houses[(nLot + Math.floor(H(nLot, 2) * 4)) % 4];
          [x, z, nat, ok] = where(kit);
          if (!ok) { if (K.landmarks.includes(kit)) marks.unshift(kit); continue; }
        }
        // the lot's own level: the ground as it lies, eased to within a step or so of the street, so the house sits square and the door is reachable
        const lh = ter ? ter.h : Math.round(clamp(nat, base - 0.3, base + (loose ? 2 : 1.2)) * 4) / 4;
        if (!ter) cfg.flats.push({ x, z, r: kit[2] * 1.25 + 2.5, h: lh });
        taken.push([x, z, kit[2]]); nLot++;
        P.lots.push({ x, z, h: lh, ry: face(x, z, px, pz) + turn, kit, door: [px + ox * (s.w / 2 + 0.9), pz + oz * (s.w / 2 + 0.9)], dir: [dx, dz], out: [ox, oz], street: s, ter });
      }
    }
  };
  /** a house at the very end of a street, closing the view down it */
  const endLot = (s, kit = null, loose = false) => {
    if (!s) return;
    const [px, pz, dx, dz] = along(s, s.len), k = kit || K.houses[(nLot + 1) % 4], off = 2.4 + k[2], x = px + dx * off, z = pz + dz * off;
    const base = loose ? Math.max(s.h, land.height(px, pz)) : s.h, nat = land.height(x, z), lh = Math.round(clamp(nat, base - 0.3, base + (loose ? 2 : 1.2)) * 4) / 4;
    if (!fits(x, z, k[2]) || nat > base + 5 || !cutOK(x, z, k[2] + 3)) return;
    cfg.flats.push({ x, z, r: k[2] * 1.25 + 2.5, h: lh });
    taken.push([x, z, k[2]]); nLot++;
    P.lots.push({ x, z, h: lh, ry: face(x, z, px, pz), kit: k, door: [px + dx * 0.6, pz + dz * 0.6], dir: [-dz, dx], out: [dx, dz], street: s });
  };
  /** a winding lane setting out from the edge of the old town at angle a */
  const lanePts = (a, len, bend, start = reach + 3) => {
    const pts = [pol(a, start)]; let hd = a;
    for (let d = 6; d <= len; d += 6) { hd += bend; const [x, z] = pts[pts.length - 1]; pts.push([x + Math.cos(hd) * 6, z + Math.sin(hd) * 6]); }
    return pts;
  };
  /** the angles round the town already spoken for: the old roads, the pier, stairs */
  const used = [];
  for (const [ax, az, bx, bz] of oldRoads) { const [ex, ez] = Math.hypot(ax - T.x, az - T.z) > Math.hypot(bx - T.x, bz - T.z) ? [ax, az] : [bx, bz]; used.push(Math.atan2(ez - T.z, ex - T.x)); }
  const freeAngle = (a, gap = 0.7) => used.every((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) > gap);

  // ---------------- terraces up the hill, and the stairs up to them ----------------
  /** a walled terrace with its top at about the height the hill has there; stairs climb to it from (ax, az, ah) heading at angle a */
  const terraceUp = (a, ax, az, ah, r, lift = [4.5, 8]) => {
    // try the run of stairs long enough for the climb, never steeper than about 1 in 2
    for (let pass = 0; pass < 2; pass++) {
      const guess = land.height(ax + Math.cos(a) * (14 + r), az + Math.sin(a) * (14 + r)), h = Math.round(clamp(guess, ah + lift[0], ah + lift[1]) * 2) / 2;
      const run = Math.max(10, (h - ah) * 2.2), [bx, bz] = [ax + Math.cos(a) * run, az + Math.sin(a) * run], cx = bx + Math.cos(a) * (r - 3), cz = bz + Math.sin(a) * (r - 3);
      if (!inIsland(cx, cz, r + 4) || !cutOK(cx, cz, r)) return null;
      if (taken.some(([tx, tz, tr]) => Math.hypot(cx - tx, cz - tz) < r * 1.1 + tr) || P.terraces.some((t) => Math.hypot(cx - t.x, cz - t.z) < (r + t.r) * 1.05)) return null;
      if ([0.2, 0.5, 0.8].some((u) => nearRoad(ax + (bx - ax) * u, az + (bz - az) * u, 4)) || nearRoad(cx, cz, r)) return null;
      if (taken.some(([tx, tz, tr]) => segD(tx, tz, ax, az, bx, bz) < tr + 3)) return null;
      if (pass === 0 && Math.abs(land.height(cx, cz) - guess) > 3) continue;
      const t = { x: cx, z: cz, r, h }, st = { a: [ax, az, ah], b: [bx, bz, h], w: 3.6 };
      cfg.flats.push({ x: cx, z: cz, r, h, wall: true });
      cfg.roads.push({ from: st.a, to: st.b, w: st.w, stair: true });
      P.terraces.push(t); P.stairs.push(st);
      return t;
    }
    return null;
  };
  /** the upper town: find the rise just outside the old town nearest to the height wanted, and build a terrace on it */
  const upperTown = (r = 17, lift = [4.5, 8]) => {
    let best = null;
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2;
      if (!freeAngle(a, 0.55)) continue;
      const [ax, az] = pol(a, reach + 4), [cx, cz] = pol(a, reach + 4 + 12 + r), nat = land.height(cx, cz);
      if (!inIsland(cx, cz, r + 4) || !cutOK(cx, cz, r)) continue;
      if (taken.some(([tx, tz, tr]) => segD(tx, tz, ax, az, cx, cz) < tr + 3.5)) continue;
      const score = -Math.abs(nat - (T.h + 6.5)) + H(k, 5) * 0.4;
      if (!best || score > best[1]) best = [a, score];
    }
    if (!best) return null;
    const [ax, az] = pol(best[0], reach + 4), t = terraceUp(best[0], ax, az, T.h, r, lift);
    if (t) { t.a = best[0]; used.push(best[0]); street([pol(best[0], reach - 2), [ax, az]], 4, "street"); }      // a short way from the square to the foot of the stairs
    return t;
  };
  /** the terrace's own street across it, the houses on its uphill side looking out over the town, a bench or two along the parapet */
  const dressTerrace = (t, { middle = null, gaps = [] } = {}) => {
    const a = t.a, px = -Math.sin(a), pz = Math.cos(a), sx = t.x - Math.cos(a) * 4.5, sz = t.z - Math.sin(a) * 4.5, half = t.r * 0.8, lat = Math.max(t.r * 0.56, (middle ? middle[2] : 4.6) + 4.6 + 1.2);
    const s = { pts: [[sx - px * half, sz - pz * half], [sx + px * half, sz + pz * half]], w: 4, kind: "terrace", h: t.h, len: half * 2, ter: t };
    P.streets.push(s);
    for (let i = 1; i < s.pts.length; i++) cfg.roads.push({ from: [...s.pts[i - 1], t.h], to: [...s.pts[i], t.h], w: 4, street: true });
    const spots = [half, half - lat, half + lat].filter((d) => !gaps.some((g) => Math.abs(d - g) < 6));
    for (const d of spots) {
      const isMid = d === half, kit = isMid ? middle : null;
      if (isMid && !kit) continue;
      if (kit) marks.unshift(kit);
      lotsAlong(s, { at: [d], only: [t.x + Math.cos(a) * 30, t.z + Math.sin(a) * 30], ter: t, mark: isMid ? 1 : 0 });
    }
    for (const d of [half - 6, half + 6]) { const [bx, bz] = along(s, d); P.benches.push([bx - Math.cos(a) * (t.r * 0.62), bz - Math.sin(a) * (t.r * 0.62), a + Math.PI / 2 + Math.PI, t]); }
    return s;
  };

  /** n winding lanes out into the country from the edge of town, wherever there's room, each ending in a little close */
  const lanes = (n, len, min = 30) => {
    let made = 0;
    for (const a of [...Array(24)].map((_, k) => k / 24 * Math.PI * 2 + H(1) * 0.3)) {
      if (made >= n || !freeAngle(a, 0.95)) continue;
      const s = street(lanePts(a, len, (H(made, 7) - 0.5) * 0.09), 4, "lane");
      if (!s || s.len < min) { unstreet(s); continue; }
      used.push(a); made++;
      lotsAlong(s, { gap: 15, mark: 0.3 });
      const [ex, ez, dx, dz] = along(s, s.len); P.closes.push({ x: ex + dx * 1.5, z: ez + dz * 1.5, kind: made === 1 ? "well" : "gazebo", h: T.h });
    }
  };

  // ---------------- each town, its own way ----------------
  const span = (a0, a1, r, step = 0.12) => { const pts = []; for (let a = a0; a <= a1 + 1e-6; a += step) pts.push(pol(a, r)); return pts; };
  /** an arc round the square, split into the runs of it a street can take (on the turtle, off the hills, clear of the terraces) */
  const arcRuns = (a0, a1, r, w, step = 0.1) => {
    const runs = []; let cur = [];
    for (let a = a0; a <= a1 + 1e-6; a += step) {
      const [x, z] = pol(a, r), ok = inIsland(x, z, 7) && cutOK(x, z, 6) && !P.terraces.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 1.12 + w);
      if (ok) cur.push([x, z]); else { if (cur.length > 3) runs.push(cur); cur = []; }
    }
    if (cur.length > 3) runs.push(cur);
    return runs;
  };
  if (style === "green") {                         // Willowmere
    const up = upperTown(20);
    if (up) dressTerrace(up, { middle: takeMark(/Bell_Tower/) });
    lanes(3, 54);
  } else if (style === "bazaar") {                 // Sunback: the core street runs along x through the square
    used.push(0, Math.PI);                         // the kasbah doesn't stand across the main street
    const up = upperTown(19, [5, 9]);
    if (up) dressTerrace(up, { middle: takeMark(/Inn/, /Bell_Tower/) });
    const L = cfg.a * 0.62;
    for (const sgn of [-1, 1]) {
      const pts = []; for (let d = 34; d <= L; d += 6) pts.push([T.x + sgn * d, T.z + Math.sin(d / 23) * 2.5]);
      const s = street([[T.x + sgn * 30, T.z], ...pts], 4.6, "main");
      lotsAlong(s, { gap: 13, from: 6, mark: 0.25 });
      endLot(s);
    }
    P.streets.push({ pts: [[T.x - 30, T.z], [T.x + 30, T.z]], w: 4.6, kind: "main", h: T.h, len: 60 });
    cfg.roads.push({ from: [T.x - 30, T.z, T.h], to: [T.x + 30, T.z, T.h], w: 4.6, street: true });
  } else if (style === "grid") {                   // Hoarshell: cross streets, square to each other
    const e = reach + 5, far = reach + 46;
    const lines = [[[T.x - far, T.z - e], [T.x + far, T.z - e]], [[T.x - far, T.z + e], [T.x + far, T.z + e]], [[T.x - e, T.z - far], [T.x - e, T.z + far]], [[T.x + e, T.z - far], [T.x + e, T.z + far]]];
    for (const [p0, p1] of lines) {
      // each line grows out from where it meets the old town both ways, so a hill only cuts its far end short
      for (const [a, b] of [[[(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p0], [[(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1]]) {
        const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6), pts = [...Array(n + 1)].map((_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
        const s = street(pts, 4, "street");
        lotsAlong(s, { gap: 12.5, from: 9, mark: 0.1 });
      }
    }
  } else if (style === "boardwalk") {              // Mirewalk: the lane through the old town, carried on out both ways
    const bend = (z) => Math.sin(z / 11) * 7, mains = [];
    // the marsh town spreads wide over its low ground: level that ground first (as far as the hill allows), so the houses are planned on it
    let room = 1e9;
    for (const [px, pz, , w] of cfg.peaks) room = Math.min(room, (Math.hypot(px - f.x, pz - f.z) - w * 0.9) / 1.14);
    f.r = Math.max(f.r, Math.min(Math.min(cfg.a, cfg.b) * 0.72, room));
    for (const sgn of [-1, 1]) {
      const pts = []; for (let d = 0; d <= 80; d += 4) pts.push([T.x + bend(sgn * d), T.z + sgn * d]);
      const s = street(pts, 3.4, "boardwalk");
      if (!s) continue;
      mains.push(s);
      const [ex, ez, dx, dz] = along(s, s.len); P.closes.push({ x: ex + dx * 2, z: ez + dz * 2, kind: sgn > 0 ? "well" : "gazebo", h: T.h });
    }
    // narrower walks branch off the main one, east and west by turns, and wander out over the marsh; the houses gather along them in ones and twos
    const clearOfOld = (x, z) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + 2.6) && P.streets.every((o) => o.kind !== "boardwalk" || o.pts.length < 2 || polyD(x, z, o.pts) > o.w / 2 + 6);
    let b = 0; const walks = [];
    // a walk sets out wherever there's room for one, at least 24 m from the last on the same side, leaning round whatever's in its way
    const starts = [];
    for (const m of mains) for (let d = 10; d < m.len - 8; d += 6) for (const side of [-1, 1]) {
      if (walks.length >= 9 || starts.some(([mm, ss, dd]) => mm === m && ss === side && Math.abs(dd - d) < 24)) continue;
      const [px, pz, dx, dz] = along(m, d), ox = -dz * side, oz = dx * side;
      let best = null;
      for (const lean of [0, 0.55, -0.55]) {
        const pts = [[px + ox * (m.w / 2), pz + oz * (m.w / 2)]];
        let hd = Math.atan2(oz, ox) + lean + (H(b, 11) - 0.5) * 0.3;
        const len = 34 + H(b, 12) * 18, bend = (H(b, 13) - 0.5) * 0.14;
        for (let t = 5; t <= len; t += 5) {
          hd += bend + Math.sin(t * 0.21 + b) * 0.06;
          const [x0, z0] = pts[pts.length - 1], x = x0 + Math.cos(hd) * 5, z = z0 + Math.sin(hd) * 5;
          if (t > 6 && !clearOfOld(x, z)) break;
          pts.push([x, z]);
        }
        if (!best || pts.length > best.length) best = pts;
      }
      b++;
      if (best.length < 5) continue;
      const w = street(best, 2.8, "boardwalk", T.h, false);          // not levelled: it rides the marsh as it lies
      if (!w || w.len < 18) { unstreet(w); continue; }
      starts.push([m, side, d]); walks.push(w);
    }
    // then the houses: the main walk's first (the shops among them, near the square), then out along the side walks
    mains.forEach((s, i) => { const at = []; for (let d = 20; d < s.len - 5; d += 10 + H(d, i + 4) * 5) at.push(d); lotsAlong(s, { at, mark: 0.25, loose: 1 }); });
    walks.forEach((w, i) => {
      const at = []; for (let t = 5 + H(i, 14) * 3; t < w.len - 3; t += 7 + H(t, i) * 5) at.push(t);
      lotsAlong(w, { at, mark: 0.15, loose: 1.3 });
      if (H(i, 15) < 0.6) endLot(w, null, true);
    });
  } else if (style === "harbour") {                // Coralcrest: a crescent promenade round the seaward side, the houses looking out over it
    const sea = Math.atan2(T.z, T.x), R = reach + 16;
    used.push(sea, sea + 0.6, sea - 0.6, sea + 1.1, sea - 1.1);          // the terrace goes up behind the town, not out over the harbour
    const up = upperTown(18);
    if (up) dressTerrace(up, { middle: takeMark(/Bell_Tower/, /Inn/) });
    let s = null;
    for (const spread of [1.2, 1, 0.8]) { s = street(span(sea - spread, sea + spread, R, 0.1), 4.4, "promenade"); if (s && s.len > 50) break; unstreet(s); s = null; }
    if (s) {
      lotsAlong(s, { gap: 12, from: 5, to: 3, mark: 0.3 });
      for (let d = 8; d < s.len - 4; d += 16) { const [px, pz, dx, dz] = along(s, d); const ox = dz, oz = -dx, o = (ox * (px - T.x) + oz * (pz - T.z)) > 0 ? 1 : -1; P.benches.push([px + ox * o * 3.6, pz + oz * o * 3.6, Math.atan2(ox * o, oz * o), null]); }
    }
    lanes(2, 42, 24);                              // and lanes inland, behind the harbour
    // a second crescent inland, behind the first, for the fisher folk: in runs, wherever the hill and the terrace leave it room
    for (const run of arcRuns(sea + Math.PI - 1.25, sea + Math.PI + 1.25, reach + 24, 4)) { const back = climb(run, 4, "street"); if (back) { const at = []; for (let d = 4; d < back.len - 3; d += 9) at.push(d); lotsAlong(back, { at, mark: 0.2, loose: 0.5 }); } }
  } else if (style === "terraces") {               // Emberback: up the mountain in steps
    const t1 = upperTown(20, [4.5, 6.5]);
    let t2 = null, path = null;
    if (t1) {
      // the second terrace: up again from the far side of the first, turned a little, so the stairs switch back up the slope
      for (const turn of [0.75, -0.75, 0.45, -0.45, 0]) {
        const a2 = t1.a + turn, ax = t1.x + Math.cos(a2) * (t1.r - 2.5), az = t1.z + Math.sin(a2) * (t1.r - 2.5);
        t2 = terraceUp(a2, ax, az, t1.h, 19, [4.5, 7]);
        if (t2) { t2.a = a2; path = [[t1.x - Math.cos(t1.a) * 3, t1.z - Math.sin(t1.a) * 3], [ax, az]]; break; }
      }
      const gapAt = [];
      if (path) {                                  // the way across the first terrace to the second flight
        const s = { pts: path, w: 3.4, kind: "path", h: t1.h, len: Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) };
        P.streets.push(s); cfg.roads.push({ from: [...path[0], t1.h], to: [...path[1], t1.h], w: 3.4, street: true });
        const px = -Math.sin(t1.a), pz = Math.cos(t1.a); gapAt.push(t1.r * 0.8 + ((path[1][0] - path[0][0]) * px + (path[1][1] - path[0][1]) * pz));
      }
      dressTerrace(t1, { middle: takeMark(/Blacksmith/, /Inn/), gaps: gapAt });
      if (t2) dressTerrace(t2, { middle: takeMark(/Bell_Tower/, /Inn/) });
    }
    // and lanes out along the foot of the mountain, the forge folk's houses down them
    let lanes2 = 0;
    for (const a of [...Array(16)].map((_, k) => k / 16 * Math.PI * 2)) { if (!freeAngle(a, 0.9)) continue; const s = street(lanePts(a, 48, 0.03 * (lanes2 ? -1 : 1)), 4, "lane"); if (s && s.len > 24) { lotsAlong(s, { gap: 13.5, mark: 0.3 }); used.push(a); if (++lanes2 >= 2) break; } else unstreet(s); }
  }

  // shops that found no lot of their own take over a house lot instead, set back a little further from the street so the bigger room fits
  for (const l of P.lots) {
    if (!shopQ.length) break;
    if (!K.houses.includes(l.kit)) continue;
    const ti = taken.findIndex((t) => t[0] === l.x && t[1] === l.z), back = SHOP_R - l.kit[2];
    for (const push of [back, back + 1.5, back + 3]) {
      const x = l.x + l.out[0] * push, z = l.z + l.out[1] * push;
      const mine = taken.splice(ti, 1)[0];
      const ok = fits(x, z, SHOP_R, l.ter) && (l.ter || (land.height(x, z) <= l.street.h + 5 && cutOK(x, z, SHOP_R + 3)));
      taken.splice(ti, 0, mine);
      if (!ok) continue;
      const fl = cfg.flats.find((q) => q.x === l.x && q.z === l.z);
      if (fl) Object.assign(fl, { x, z, r: SHOP_R * 1.25 + 2.5 });
      l.x = x; l.z = z; l.kit = shopQ.shift(); taken[ti] = [x, z, SHOP_R];
      break;
    }
  }

  // the town's own ground grows first (so the ring of houses below stands on it, not on the slope it had) to hold what's on its level, as far as its hill allows
  let most = 1e9;
  for (const [px, pz, , w] of cfg.peaks) most = Math.min(most, (Math.hypot(px - f.x, pz - f.z) - w * 0.9) / 1.14);
  f.r = Math.max(f.r, Math.min((reach + 12) / 0.78, most));
  // ---------------- infill: whatever room is still left along every street gets a house or a cottage, and a ring of them closes in the square ----------------
  const HOME = [["home:house", 7, 4.2], ["home:cottage", 5.5, 3.6]];
  for (const s of [...P.streets]) {
    if (s.kind === "path") continue;
    const at = []; for (let d = 4; d < s.len - 3; d += 4.5) at.push(d);
    const t = s.ter;
    lotsAlong(s, { at, ter: t || null, only: t ? [t.x + Math.cos(t.a) * 30, t.z + Math.sin(t.a) * 30] : null, kits: HOME, loose: s.kind === "boardwalk" ? 1 : 0 });
  }
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 40; k++) {
    const kit = HOME[pass === 1 ? 0 : 1], r = kit[2], a = k / 40 * Math.PI * 2 + pass * 0.05, dist = reach + 2.5 + r + pass * 3.5;
    // each town closes its square in its own shape: Hoarshell in a hard square, Sunback in an oval down its main street, Emberback scattered
    // up the slope, Willowmere in a loose uneven ring, the others in a neat round one
    let x, z, ox, oz;
    if (style === "grid") {
      const c = Math.cos(a), sn = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(sn)), side = Math.abs(c) >= Math.abs(sn);
      x = T.x + c / m * dist; z = T.z + sn / m * dist; ox = side ? Math.sign(c) : 0; oz = side ? 0 : Math.sign(sn);
    } else {
      const jit = style === "terraces" ? 4 : style === "green" ? 2.2 : 0.5, dd = dist + (H(k * 3 + pass, 31) - 0.5) * 2 * jit, sx = style === "bazaar" ? 1.3 : 1;
      x = T.x + Math.cos(a) * dd * sx; z = T.z + Math.sin(a) * dd; ox = Math.cos(a); oz = Math.sin(a);
    }
    const nat = land.height(x, z);
    if (!fits(x, z, r) || nat > T.h + 3.5 || nat < T.h - 3 || !cutOK(x, z, r + 3)) continue;
    // its door looks into the square, across a strip of the square's own paving
    const lh = Math.round(clamp(nat, T.h - 0.3, T.h + 0.8) * 4) / 4, sw = 3, back = sw / 2 + 2.4 + r, mx = x - ox * back, mz = z - oz * back;
    const tilt = style === "green" || style === "terraces" ? (H(k, pass + 40) - 0.5) * 0.5 : 0;
    cfg.flats.push({ x, z, r: r * 1.25 + 2.5, h: lh });
    taken.push([x, z, r]); nLot++;
    P.lots.push({ x, z, h: lh, ry: Math.atan2(-ox, -oz) + tilt, kit, door: [mx + ox * (sw / 2 + 0.9), mz + oz * (sw / 2 + 0.9)], dir: [-oz, ox], out: [ox, oz], street: { pts: [[mx, mz]], w: sw, h: T.h, kind: "square", len: 0 } });
  }

  // ---------------- no empty side: wherever a side of town still has next to nothing, a street of the town's own kind goes out into it ----------------
  {
    const bins = 8, count = Array(bins).fill(0), binOf = (x, z) => ((Math.round(Math.atan2(z - T.z, x - T.x) / (Math.PI * 2 / bins)) % bins) + bins) % bins;
    for (const l of P.lots) count[binOf(l.x, l.z)]++;
    for (let b = 0; b < bins; b++) {
      if (count[b] >= 3) continue;
      for (const tw of [0, 0.18, -0.18, 0.34, -0.34]) {
        const a = b * Math.PI * 2 / bins + tw;
        if (!freeAngle(a, 0.42)) continue;
        const bend = (H(b, 21) - 0.5) * (style === "boardwalk" ? 0.3 : style === "grid" ? 0 : 0.1);
        const s = style === "boardwalk" ? street(lanePts(a, 40, bend, reach + 6), 2.8, "boardwalk", T.h, false) : climb(lanePts(a, 44, bend), style === "grid" ? 4.6 : 4, style === "grid" ? "street" : "lane");
        if (!s || s.len < 18) { unstreet(s); continue; }
        used.push(a);
        const at = []; for (let d = 5; d < s.len - 3; d += 4.5) at.push(d);
        const before = P.lots.length;
        lotsAlong(s, { at, kits: HOME, loose: style === "boardwalk" ? 1.2 : 0.5 });
        if (P.lots.length === before) { unstreet(s); used.pop(); continue; }
        if (style === "green" || style === "harbour") { const [ex, ez, dx, dz] = along(s, s.len); P.closes.push({ x: ex + dx * 1.5, z: ez + dz * 1.5, kind: "well", h: T.h }); }
        break;
      }
    }
  }

  // what the rest of the game needs to know
  let extent = reach + 6;
  const zones = [], walk = [];
  for (const l of P.lots) { extent = Math.max(extent, Math.hypot(l.x - T.x, l.z - T.z) + l.kit[2] + 4); zones.push([l.x, l.z, l.kit[2] + 4]); }
  for (const t of P.terraces) { extent = Math.max(extent, Math.hypot(t.x - T.x, t.z - T.z) + t.r + 4); zones.push([t.x, t.z, t.r * 1.2]); }
  for (const s of P.streets) for (let d = 0; d <= s.len; d += 5) { const [x, z] = along(s, d); zones.push([x, z, s.w + 4]); if (s.h === T.h) walk.push([x, z]); extent = Math.max(extent, Math.hypot(x - T.x, z - T.z) + 6); }
  cfg.quarter = { cx: T.x, cz: T.z, ring: Math.round(reach + 6), y: T.h, extent, walk, zones, plan: P, style };
  cfg.hubR = extent;                                            // the footpaths out to the shores start past the edge of town
}

/** load one model at x, z (in the turtle's own space), standing on the lowest point under it so no corner hangs in the air */
async function place(L, path, x, z, height, ry, footprint, y = null) {
  const land = L.land, k = footprint * 0.7;
  const g = y ?? Math.min(land.ground(x, z), land.ground(x + k, z), land.ground(x - k, z), land.ground(x, z + k), land.ground(x, z - k));
  return prop(path, L.group, { x, y: g - 0.04, z, height, ry });
}

/** put the town down on a turtle you've come close to. addSolid: world.js's, so the new things are in your way like everything else */
export async function dressTown(L, addSolid) {
  const q = L.cfg.quarter;
  if (!q?.plan) return;
  const P = q.plan, land = L.land, seed = L.cfg.seed || 1, jobs = [], K = TOWN_KIT;
  const biome = L.cfg.biome || "", trees = /Frozen/.test(biome) ? K.trees.snow : /Desert|Tropical/.test(biome) ? K.trees.dry : /Volcanic/.test(biome) ? K.trees.dead : K.trees.default;
  const snowy = /Frozen/.test(biome), dry = /Desert|Volcanic/.test(biome);
  // what's standing: the old town and everything put down here
  const taken = [];
  for (const [, x, z, h] of L.cfg.houses) taken.push([q.cx + x, q.cz + z, Math.max(1.5, h * 0.56)]);
  for (const [x, z] of L.cfg.stalls || []) taken.push([q.cx + x, q.cz + z, 3.4]);
  for (const [x, z] of Object.values(L.cfg.places || {})) taken.push([q.cx + x, q.cz + z, 1.2]);
  for (const l of P.lots) taken.push([l.x, l.z, l.kit[2] * 0.95]);
  const roads = L.cfg.roads || [];
  const onRoad = (x, z, r) => roads.some((rd) => segD(x, z, rd.from[0], rd.from[1], rd.to[0], rd.to[1]) < rd.w * 0.62 + r + 0.3);
  const clear = (x, z, r, flat = 0.8) => !onRoad(x, z, r) && !land.onTrail(x, z, r + 0.4) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr + 0.5) && land.ground(x, z) > 3.6 && land.rough(x, z, Math.max(0.8, r * 0.8)) < flat;
  const take = (x, z, r, solid = true) => { taken.push([x, z, r]); if (solid) addSolid(L, { x, z, r }); };
  const keep = (L.keep ||= []);                                 // trees and bushes scattered after this stay off the streets, the yards and the terraces
  for (const t of P.terraces) keep.push([t.x, t.z, t.r * 1.15]);
  for (const l of P.lots) keep.push([l.x, l.z, l.kit[2] + 3]);
  for (const s of P.streets) for (let d = 0; d <= s.len; d += 4) { const [x, z] = alongS(s, d); keep.push([x, z, s.w / 2 + 2]); }
  for (const st of P.stairs) for (let u = 0; u <= 1; u += 0.2) keep.push([st.a[0] + (st.b[0] - st.a[0]) * u, st.a[1] + (st.b[1] - st.a[1]) * u, st.w]);
  for (const c of P.closes) keep.push([c.x, c.z, 7]);

  const stoneCol = new THREE.Color(L.cfg.palette?.path ?? 0xcab79a).lerp(new THREE.Color(0xb4aa98), 0.6);
  const stone = new THREE.MeshStandardMaterial({ color: stoneCol, flatShading: true, roughness: 0.92 }), cap = new THREE.MeshStandardMaterial({ color: stoneCol.clone().offsetHSL(0, -0.03, 0.08), flatShading: true, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: stoneCol.clone().offsetHSL(0, 0, -0.12), flatShading: true, roughness: 0.95 });
  const boxes = { stone: [], cap: [], dark: [] };                // every wall block and step, drawn as three instanced meshes
  const block = (kind, x, y, z, sx, sy, sz, ry = 0, rx = 0) => boxes[kind].push([x, y, z, sx, sy, sz, ry, rx]);

  // ---- the retaining walls round each terrace: stone from the low ground up to a parapet, a lighter capping along the top ----
  for (const t of P.terraces) {
    const n = Math.max(24, Math.round(t.r * 2 * Math.PI / 2.2));
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // find the real edge (the ground's edge wanders a little) and the ground just outside it
      let re = t.r * 1.06;
      for (let d = t.r * 0.84; d < t.r * 1.2; d += 0.25) if (Math.abs(land.height(t.x + ca * d, t.z + sa * d) - t.h) > 0.3) { re = d; break; }
      const wx = t.x + ca * (re + 0.35), wz = t.z + sa * (re + 0.35), out = land.ground(t.x + ca * (re + 2), t.z + sa * (re + 2));
      if (P.stairs.some((st) => segD(wx, wz, st.a[0], st.a[1], st.b[0], st.b[1]) < st.w * 0.5 + 0.9)) continue;          // the way in
      if (P.streets.some((s) => s.h !== t.h && polyD(wx, wz, s.pts) < s.w * 0.5)) continue;
      const lo = Math.min(out, t.h) - 0.8, hi = out < t.h - 0.6 ? t.h + 0.75 : Math.min(Math.max(out, t.h) + 0.2, t.h + 7), len = 2 * Math.PI * (re + 0.35) / n + 0.25;
      if (hi - lo < 1.4) continue;
      block("stone", wx, (lo + hi) / 2, wz, len, hi - lo, 1.3, -a + Math.PI / 2);
      block("cap", wx, hi + 0.12, wz, len + 0.1, 0.24, 1.55, -a + Math.PI / 2);
      if (i % 5 === 2 && hi - lo > 3) block("dark", t.x + ca * (re + 1.02), (lo + hi) / 2 - 0.4, t.z + sa * (re + 1.02), 0.5, hi - lo - 1.2, 0.2, -a + Math.PI / 2);      // a buttress now and then
    }
  }
  // ---- the stairs: a step every 30 cm or so up the ramp the land has for them, low walls either side, a lamp at the foot and the top ----
  for (const st of P.stairs) {
    const [ax, az, ah] = st.a, [bx, bz, bh] = st.b, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, rise = bh - ah, n = Math.max(4, Math.ceil(Math.abs(rise) / 0.3));
    const ry = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, top = ah + rise * (i + 1) / n, depth = len / n;
      block(i % 2 ? "stone" : "cap", ax + dx * len * u, top - 0.45, az + dz * len * u, st.w - 0.5, 0.9, depth + 0.04, ry);
    }
    for (const side of [-1, 1]) {
      const ox = dz * side * (st.w / 2 - 0.05), oz = -dx * side * (st.w / 2 - 0.05), pitch = -Math.atan2(rise, len);
      block("stone", (ax + bx) / 2 + ox, (ah + bh) / 2 + 0.25, (az + bz) / 2 + oz, 0.55, 1.4, Math.hypot(len, rise) + 0.4, ry, pitch);
      block("cap", (ax + bx) / 2 + ox, (ah + bh) / 2 + 0.98, (az + bz) / 2 + oz, 0.7, 0.18, Math.hypot(len, rise) + 0.5, ry, pitch);
      for (const [px, pz, ph] of [[ax - dx * 0.4, az - dz * 0.4, ah], [bx + dx * 0.2, bz + dz * 0.2, bh]]) block("dark", px + ox, ph + 0.6, pz + oz, 0.8, 1.2, 0.8, ry);      // newel posts
    }
    for (const [px, pz, ph, s] of [[ax - dx * 1.2, az - dz * 1.2, ah, 1], [bx + dx * 1.6, bz + dz * 1.6, bh, -1]]) lamp(px + dz * s * (st.w / 2 + 1.2), pz - dx * s * (st.w / 2 + 1.2), face(px, pz, px + dx, pz + dz) + Math.PI / 2 * s, ph);
  }
  // ---- the boardwalk: planks across the lane on low posts, the marsh under it ----
  const plank = new THREE.MeshStandardMaterial({ color: 0x8a6a48, flatShading: true, roughness: 0.95 }), planks = [];
  for (const s of P.streets) if (s.kind === "boardwalk") for (let d = 0; d < s.len; d += 0.75) { const [x, z, dx, dz] = alongS(s, d); planks.push([x, z, Math.atan2(dx, dz), (hash(d, 3) - 0.5) * 0.25, s.w + 0.3]); }

  // ---- lamp posts down every street, alternating sides ----
  function lamp(x, z, ry, y = null) {
    if (!clear(x, z, 0.5, 1.6)) return null;
    take(x, z, 0.4);
    jobs.push(place(L, K.lamp[0], x, z, K.lamp[1], ry, 0.4, y).then((o) => { if (o) { const glow = lampLight(0.24, 2.42); glow.position.x = 0.42; o.add(glow); } }));
    return [x, (y ?? land.ground(x, z)) + 3.35, z];
  }
  const lampRows = [];
  for (const s of P.streets) {
    const row = [];
    for (let d = 6, side = 1; d < s.len - 2; d += 14, side = -side) {
      const [x, z, dx, dz] = alongS(s, d), off = s.w / 2 + 1.1, lx = x - dz * side * off, lz = z + dx * side * off;
      const at = lamp(lx, lz, face(lx, lz, x, z) - Math.PI / 2, s.ter ? s.ter.h : null);
      if (at) row.push(at);
    }
    lampRows.push([s, row]);
  }

  // ---- the houses, each facing its street; a little fenced front yard with flowers; their things by the door; a tree out back ----
  const fenceKit = K.fence, flowers = K.flowers || [], homes = houseBatch(L), ownShare = L.cfg.id === "willowmere" ? 0.35 : 1;
  P.lots.forEach((l, i) => {
    const [ox, oz] = l.out, [dx, dz] = l.dir, r = l.kit[2];
    if (!l.ter && (land.ground(l.x, l.z) < 3.6 || land.rough(l.x, l.z, r * 0.6) > 1.6)) return;           // a lot whose ground didn't come out right stays empty (it was planned clear of everything else)
    if (l.kit[0].startsWith("shop:")) { jobs.push(buildShop(L, l, addSolid)); (L.doors ||= []).push(l.door); return; }        // a walk-in shop (shops.js)
    addSolid(L, { x: l.x, z: l.z, r: r * 0.92 });
    const kitHouse = K.houses.some((k) => k[0] === l.kit[0]), own = l.kit[0].startsWith("home:") || (kitHouse && hash(i * 1.3, seed + 7) < ownShare);
    if (own) {                                                 // one of the town's own houses (houses.js), on the lowest ground under it
      const k = r * 0.7, gy = l.ter ? l.ter.h : Math.min(land.ground(l.x, l.z), land.ground(l.x + k, l.z), land.ground(l.x - k, l.z), land.ground(l.x, l.z + k), land.ground(l.x, l.z - k));
      homes.house({ x: l.x, z: l.z, h: gy - 0.04, ry: l.ry, kit: l.kit }, i);
    } else jobs.push(place(L, l.kit[0], l.x, l.z, l.kit[1], l.ry, r, l.ter ? l.ter.h : null).then((o) => restyle(o, L.cfg.id)));
    if (!l.ter || Math.hypot(l.door[0] - l.ter.x, l.door[1] - l.ter.z) < l.ter.r * 0.9) (L.doors ||= []).push(l.door);
    const isHouse = kitHouse || own, stilts = own && lookOf(L.cfg.id).style === "stilt";
    // the front yard: between the street's edge and the house front
    const yard = l.street.w / 2 + 1.2, fy = (yard + l.street.w / 2 + 2.4) / 2;
    if (isHouse && !stilts && hash(i, seed) < 0.75 && !snowy) {
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const t = side * (1.5 + k * 1.15), [sx, sz] = l.street.pts.length ? alongPerp(l, t, yard) : [0, 0];
        if (!clear(sx, sz, 0.35, 0.9)) continue;
        take(sx, sz, 0.3, false);
        jobs.push(place(L, fenceKit[0], sx, sz, fenceKit[1], Math.atan2(dx, dz), 0.4, l.ter ? l.ter.h : null));
      }
      if (flowers.length && !dry) for (const side of [-1, 1]) { const [fx2, fz2] = alongPerp(l, side * 2.9, fy + 0.6); if (clear(fx2, fz2, 0.6, 0.9)) { take(fx2, fz2, 0.5, false); jobs.push(place(L, flowers[(i + (side > 0 ? 1 : 0)) % flowers.length], fx2, fz2, 0.9, hash(i, side) * 6, 0.6, l.ter ? l.ter.h : null)); } }
    }
    // by the door: a barrel, a crate, a bench or a cart, beside the path up to it
    const n = 1 + Math.floor(hash(i, seed + 1) * 2);
    for (let k = 0; k < n; k++) {
      const p = K.props[Math.floor(hash(i * 7 + k, seed) * K.props.length)], side = k ? -1 : 1, [px, pz] = alongPerp(l, side * (r + 0.9), yard + 2.2);
      if (!clear(px, pz, p[2], 0.6)) continue;
      take(px, pz, p[2]);
      jobs.push(place(L, p[0], px, pz, p[1], l.ry + (hash(k, i * 3) - 0.5) * 0.6, p[2], l.ter ? l.ter.h : null));
    }
    // out the back or to the side: a yard tree
    if (!l.ter && hash(i, seed * 2) < 0.6) {
      const side = hash(i, 5) < 0.5 ? -1 : 1, tx = l.x + dx * side * (r + 2.6) + ox * (r * 0.6), tz = l.z + dz * side * (r + 2.6) + oz * (r * 0.6);
      if (clear(tx, tz, 1.4, 0.9)) { take(tx, tz, 1.1); const t = trees[i % trees.length]; jobs.push(place(L, t, tx, tz, (/Bush/.test(t) ? 1.6 : 5.5) + hash(i, 9) * 1.5, hash(i, 4) * 6, 1)); }
    }
  });
  /** a point beside a house's front path: t metres along the street from the door, `out` metres off the street's middle */
  function alongPerp(l, t, out) { const [dx, dz] = l.dir, [ox, oz] = l.out, mx = l.door[0] - ox * (l.street.w / 2 + 0.9), mz = l.door[1] - oz * (l.street.w / 2 + 0.9); return [mx + dx * t + ox * out, mz + dz * t + oz * out]; }

  // ---- benches along the parapets and the promenade, looking out ----
  for (const [x, z, ry, t] of P.benches) { const b = K.props[2]; if (clear(x, z, b[2], 1.2)) { take(x, z, b[2]); jobs.push(place(L, b[0], x, z, b[1], ry, b[2], t ? t.h : null)); } }
  // ---- the closes at the ends of the lanes: a well or a gazebo, a ring of flowers, a bench ----
  for (const c of P.closes) {
    const kit = c.kind === "well" ? K.well : K.landmarks.find((m) => /Gazebo/.test(m[0]));
    if (!kit || !clear(c.x, c.z, kit[2], 1)) continue;
    take(c.x, c.z, kit[2]); jobs.push(place(L, kit[0], c.x, c.z, kit[1], hash(c.x, c.z) * 6, kit[2]));
    if (c.kind === "well") (L.gather ||= []).push([c.x, c.z, kit[2] + 1.6]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3, fx = c.x + Math.cos(a) * (kit[2] + 2.2), fz = c.z + Math.sin(a) * (kit[2] + 2.2); if (k % 3 === 0) { const b = K.props[2]; if (clear(fx, fz, b[2], 0.8)) { take(fx, fz, b[2]); jobs.push(place(L, b[0], fx, fz, b[1], face(fx, fz, c.x, c.z), b[2])); } } else if (flowers.length && !snowy && clear(fx, fz, 0.6, 0.8)) { take(fx, fz, 0.5, false); jobs.push(place(L, flowers[k % flowers.length], fx, fz, 1, k, 0.6)); } }
  }
  // ---- market stands where the lanes and the main street leave the square, a signpost at the foot of every stair ----
  for (const s of P.streets) {
    if (s.kind === "terrace" || s.kind === "path") continue;
    const [x, z, dx, dz] = alongS(s, 3);
    if (Math.hypot(x - q.cx, z - q.cz) > q.ring + 8) continue;
    for (const side of [-1, 1]) { const st = K.stands[side > 0 ? 0 : 1], sx = x + dx * 4 - dz * side * (s.w / 2 + 2.6), sz = z + dz * 4 + dx * side * (s.w / 2 + 2.6); if (clear(sx, sz, st[2], 0.6)) { take(sx, sz, st[2]); jobs.push(place(L, st[0], sx, sz, st[1], face(sx, sz, x + dx * 4, z + dz * 4), st[2])); } }
  }
  for (const st of P.stairs) { const [ax, az] = st.a, dx = st.b[0] - ax, dz = st.b[1] - az, l = Math.hypot(dx, dz), sx = ax - dz / l * (st.w / 2 + 2.2) - dx / l * 2, sz = az + dx / l * (st.w / 2 + 2.2) - dz / l * 2; if (clear(sx, sz, 0.5, 1.2)) { take(sx, sz, 0.4); jobs.push(place(L, K.sign[0], sx, sz, K.sign[1], Math.atan2(dx, dz), 0.5)); } }
  // a well in the middle of town if it has none yet
  if (!(L.gather || []).length) for (let t = 0; t < 10; t++) {
    const a = Math.PI / 2 + t * 0.6, wr = q.ring + 4 + t, wx = q.cx + Math.cos(a) * wr, wz = q.cz + Math.sin(a) * wr;
    if (!clear(wx, wz, K.well[2], 0.5)) continue;
    take(wx, wz, K.well[2]); jobs.push(place(L, K.well[0], wx, wz, K.well[1], a, K.well[2])); (L.gather ||= []).push([wx, wz, K.well[2] + 1.6]); break;
  }

  // ---- the square: cobbled out to the first houses, a kerb round it, a fountain in the middle (a fire on the cold and the burning turtles), benches round it ----
  const tid = L.cfg.id, pathCol = new THREE.Color(L.cfg.palette?.path ?? 0xcab79a).lerp(new THREE.Color(0xb8b0a2), snowy ? 0.2 : 0.35);
  let openR = 1e9;
  for (const [, x, z, h] of L.cfg.houses) if (h > 3) openR = Math.min(openR, Math.hypot(x, z) - Math.max(1.5, h * 0.56));
  const R = clamp(openR + 2.5, 10, 20);
  // the square's own shape: a hard square on the grid town, an oval down the bazaar's main street, round elsewhere
  const rim = (a, rr) => { const c = Math.cos(a), sn = Math.sin(a), k = q.style === "grid" ? 0.92 / Math.max(Math.abs(c), Math.abs(sn)) : 1, sx = q.style === "bazaar" ? 1.25 : 1; return [q.cx + c * rr * k * sx, q.cz + sn * rr * k]; };
  {
    const pos = [], uv = [], idx = [], rings = Math.ceil(R / 1.2), segs = 64, uvAt = (x, z) => uv.push(x / 3.2, z / 3.2);
    pos.push(q.cx, land.ground(q.cx, q.cz) + 0.12, q.cz); uvAt(q.cx, q.cz);
    for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) { const rr = R * i / rings, a = j / segs * Math.PI * 2, [x, z] = rim(a, rr); pos.push(x, land.ground(x, z) + 0.12, z); uvAt(x, z); }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
    for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) { const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs; idx.push(a, b, a + segs, b, b + segs, a + segs); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const paving = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tid === "mire" ? deckBoards() : cobbles(pathCol), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    paving.receiveShadow = true; L.group.add(paving);
    const n = Math.round(R * 2 * Math.PI / 0.9);
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI * 2, [x, z] = rim(a, R + 0.15), [x2, z2] = rim(a + 0.01, R + 0.15), [x0, z0] = rim(a - Math.PI / n, R + 0.15), [x1, z1] = rim(a + Math.PI / n, R + 0.15);
      if (onRoad(x, z, -0.6)) continue;
      block("cap", x, land.ground(x, z) + 0.06, z, Math.hypot(x1 - x0, z1 - z0) + 0.05, 0.22, 0.38, Math.atan2(x2 - x, z2 - z) + Math.PI / 2);
    }
  }
  const warm = tid === "ember" || tid === "frost";
  if (tid !== "willowmere") for (const [ox, oz] of [[0, 0], [0, 4], [4, 0], [-4, 0], [0, -4], [3, 3], [-3, -3], [3, -3], [-3, 3]]) {
    const x = q.cx + ox, z = q.cz + oz;
    if (!clear(x, z, warm ? 1.8 : 3.6, 1.4)) continue;
    if (warm) { take(x, z, 1.3, false); brazier(x, z, 1.6); }
    else {
      take(x, z, 3.4);
      const y = land.ground(x, z);
      jobs.push(prop("../games/asset_packs/town/Fountain.glb", L.group, { x, y: y - 0.05, z, scale: 1.1 }).then((o) => o && fillFountain(o)));
      TOWN_FOUNTAINS.push({ L, x, z, y, h: 3.9 });
    }
    const bk = K.props[2], br = warm ? 3.8 : 6.2;
    for (let b = 0; b < 4; b++) { const a = b / 4 * Math.PI * 2 + Math.PI / 4, bx = x + Math.cos(a) * br, bz = z + Math.sin(a) * br; if (clear(bx, bz, bk[2], 0.8)) { take(bx, bz, bk[2]); jobs.push(place(L, bk[0], bx, bz, bk[1], face(bx, bz, x, z), bk[2])); } }
    (L.gather ||= []).push([x, z, (warm ? 1.3 : 3.4) + 1.8]);
    break;
  }
  /** a fire in an iron bowl on a stone post: flames, sparks, a glow at night */
  function brazier(x, z, sc = 1, y = null) {
    const g = new THREE.Group(); g.position.set(x, y ?? land.ground(x, z), z); L.group.add(g);
    const iron = BRZ.iron ||= new THREE.MeshStandardMaterial({ color: 0x2a2422, flatShading: true, roughness: 0.7 }), coal = BRZ.coal ||= new THREE.MeshStandardMaterial({ color: 0x5a1a0a, emissive: 0xff5a1a, emissiveIntensity: 1.3, flatShading: true });
    const post = new THREE.Mesh(BRZ.post ||= new THREE.CylinderGeometry(0.22, 0.34, 1, 8), stone); post.scale.setScalar(sc); post.position.y = 0.5 * sc;
    const bowl = new THREE.Mesh(BRZ.bowl ||= new THREE.CylinderGeometry(0.62, 0.34, 0.4, 10), iron); bowl.scale.setScalar(sc); bowl.position.y = 1.15 * sc;
    const hot = new THREE.Mesh(BRZ.hot ||= new THREE.IcosahedronGeometry(0.46, 0), coal); hot.scale.set(sc, sc * 0.45, sc); hot.position.y = 1.34 * sc;
    for (const m of [post, bowl]) { m.castShadow = true; g.add(m); }
    g.add(hot);
    g.add(lampLight(0.3 * sc, 1.8 * sc));
    const flame = emitter(g, [0, 1.4 * sc, 0], { n: 34, colors: [0xffe36e, 0xffa23a, 0xff6a2a, 0xffc84a], up: 1.1, spread: 0.2 * sc, life: 0.75, size: 0.3 * sc, grow: 0.3, drift: 0.12, glow: true });
    const sparks = emitter(g, [0, 1.6 * sc, 0], { n: 16, colors: [0xffd060, 0xff8a2a], up: 2.2, spread: 0.3, life: 1.3, size: 0.06, grow: 0.4, drift: 0.7, glow: true });
    HOUSE_FX.push({ L, g, smoke: flame, sparks, rate: 1 });
    addSolid(L, { x, z, r: 0.75 * sc });
  }

  // ---- down the streets: trees between the houses (braziers on the burning turtle), and bunting strung from lamp to lamp ----
  const streetTrees = { willowmere: K.trees.default, dune: K.trees.dry, frost: K.trees.snow, palm: K.trees.dry, mire: K.trees.default }[tid];
  const doors = L.doors || [];
  for (const s of P.streets) {
    if (s.kind === "path") continue;
    for (let d = 10, side = 1, n = 0; d < s.len - 4; d += tid === "ember" ? 24 : 11, side = -side, n++) {
      const [x, z, dx, dz] = alongS(s, d), off = s.w / 2 + 1.9, tx = x - dz * side * off, tz = z + dx * side * off;
      if (doors.some(([ax, az]) => Math.hypot(ax - tx, az - tz) < 2.8)) continue;
      if (tid === "ember") { if (clear(tx, tz, 1, 1)) { take(tx, tz, 0.8, false); brazier(tx, tz, 1, s.ter ? s.ter.h : null); } continue; }
      if (!streetTrees || (tid === "mire" && n % 3) || !clear(tx, tz, 1.2, 0.9)) continue;
      take(tx, tz, 0.8);
      const t = streetTrees[Math.floor(hash(d, s.len) * streetTrees.length)];
      jobs.push(place(L, t, tx, tz, (/Bush/.test(t) ? 1.5 : /Palm/.test(t) ? 6.5 : 4.8) + hash(d, 3) * 1.2, hash(d, 4) * 6, 1, s.ter ? s.ter.h : null));
    }
  }
  const FLAGS = { willowmere: [0xe8556d, 0xf4c542, 0x4f9adf, 0xffffff, 0x6fc36a], dune: [0xd8553a, 0xe0a030, 0x2f7fa0, 0xf3e3c3], frost: [0x2f5f8f, 0xffffff, 0x8a3b3b, 0xf4c542],
    mire: [0x6f8a3a, 0xc9a04a, 0x8a5a3a, 0xe0d6a0], palm: [0x2f9fa8, 0xffffff, 0xe8a83a, 0xff7ab0, 0x3a7fc0], ember: [0xa83a22, 0x231b1a, 0xe0703a, 0xd8b04a] }[tid] || [0xe8556d, 0xf4c542, 0x4f9adf];
  const fp = [], fc = [], ff = [], lp = [], cc = new THREE.Color();
  for (const [s, row] of lampRows) {
    if (s.kind === "path") continue;
    for (let k = 1; k < row.length; k++) {
      const a = row[k - 1], b = row[k], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (len < 5 || len > 20 || hash(k, s.len) > 0.8) continue;
      const sag = len * 0.07, pt = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u], n = Math.floor(len / 0.62);
      for (let j = 0; j < n; j++) {
        lp.push(...pt(j / n), ...pt((j + 1) / n));
        if (j === 0 || j === n - 1) continue;
        const pa = pt((j + 0.1) / n), pb = pt((j + 0.85) / n), pm = pt((j + 0.47) / n);
        fp.push(...pa, ...pb, pm[0], pm[1] - 0.44, pm[2]); ff.push(0, 0, 1);
        cc.setHex(FLAGS[(j + k) % FLAGS.length]); for (let t = 0; t < 3; t++) fc.push(cc.r, cc.g, cc.b);
      }
    }
  }
  if (fp.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(fc, 3)); g.setAttribute("flap", new THREE.Float32BufferAttribute(ff, 1)); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.8 });
    m.onBeforeCompile = (sh) => { sh.uniforms.uWind = WIND; sh.vertexShader = "uniform float uWind; attribute float flap;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.x += sin(uWind * 4.1 + position.x * 0.8 + position.z * 0.3) * 0.16 * flap; transformed.z += cos(uWind * 3.4 + position.z * 0.7) * 0.16 * flap; transformed.y += sin(uWind * 5.0 + position.x) * 0.05 * flap;"); };
    const flags = new THREE.Mesh(g, m); flags.castShadow = true; L.group.add(flags);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    L.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3028 })));
  }
  // ---- the open ground between it all: grass, flowers and ferns where it's green, pebbles and stones where it's dry or cold. Never on a street, a yard or the square ----
  {
    const M = "stylized_nature_megakit/", lush = !dry && !snowy;
    const COVER = lush
      ? [["Grass_Wispy_Short", 0.34, 0.5], ["Grass_Common_Short", 0.3, 0.55], ["Clover_2", 0.12, 0.6], ["Flower_3_Group", 0.06, 0.42], ["Flower_4_Group", 0.06, 0.42], [tid === "mire" ? "Fern_1" : "Flower_3_Single", 0.06, 0.5]]
      : [["Pebble_Round_1", 0.18, 1.1], ["Pebble_Round_3", 0.14, 1.1], ["Pebble_Square_2", 0.12, 1.1], ["Rock_Medium_1", 0.04, 0.3], ["Rock_Medium_3", 0.04, 0.3], ...(snowy ? [] : [["Grass_Wispy_Short", 0.06, 0.45]])];
    const lists = COVER.map(() => []), step = lush ? 1.7 : 2.6, ext = q.extent + 6;
    for (let gx = -ext; gx < ext; gx += step) for (let gz = -ext; gz < ext; gz += step) {
      const x = q.cx + gx + (hash(gx, gz) - 0.5) * step, z = q.cz + gz + (hash(gz, gx + 3) - 0.5) * step, d = Math.hypot(x - q.cx, z - q.cz);
      if (d < R + 0.8 || d > ext || hash(gx * 0.31, gz * 0.17) < (snowy ? 0.85 : dry ? 0.66 : 0.55)) continue;          // patchy, not a carpet
      if (!clear(x, z, 0.25, 1.2) || (tid === "mire" && land.ground(x, z) < 4)) continue;
      let u = hash(x * 0.7, z * 1.3), k = 0;
      while (k < COVER.length - 1 && u > COVER[k][1]) { u -= COVER[k][1]; k++; }
      if (u > COVER[k][1]) continue;
      lists[k].push({ x, y: land.ground(x, z) - 0.04, z, ry: hash(z, x) * 6.3, s: COVER[k][2] * (0.75 + hash(x, z * 2) * 0.6) });
    }
    COVER.forEach(([n], k) => { if (lists[k].length) jobs.push(forest(`${M}${n}.gltf`, L.group, lists[k]).then((insts) => { for (const i of insts) i.castShadow = false; })); });
  }
  for (const f of homes.finish(L.group)) HOUSE_FX.push(f);

  // the stone and the planks, all at once
  const geo = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [kind, mat] of [["stone", stone], ["cap", cap], ["dark", dark]]) {
    const list = boxes[kind]; if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, sx, sy, sz, ry, rx], i) => { e.set(rx, ry, 0); qt.setFromEuler(e); m4.compose(v.set(x, y, z), qt, sc.set(sx, sy, sz)); inst.setMatrixAt(i, m4); });
    inst.castShadow = true; inst.receiveShadow = true; L.group.add(inst);
  }
  if (planks.length) {
    const inst = new THREE.InstancedMesh(geo, plank, planks.length);
    planks.forEach(([x, z, ry, tw, w], i) => { e.set(0, ry + Math.PI / 2, tw * 0.1); qt.setFromEuler(e); m4.compose(v.set(x, land.ground(x, z) + 0.28, z), qt, sc.set(0.62, 0.14, w)); inst.setMatrixAt(i, m4); });
    inst.receiveShadow = true; L.group.add(inst);
    for (const s of P.streets) if (s.kind === "boardwalk") for (let d = 0; d < s.len; d += 3) for (const side of [-1, 1]) { const [x, z, dx, dz] = alongS(s, d); const ox = -dz * side * (s.w / 2 + 0.05), oz = dx * side * (s.w / 2 + 0.05); const p = new THREE.Mesh(geo, plank); p.scale.set(0.2, 0.9, 0.2); p.position.set(x + ox, land.ground(x + ox, z + oz) + 0.1, z + oz); L.group.add(p); }
  }
  await Promise.all(jobs);
}
/** the point and the way the street runs, d metres along it (dressTown's copy: the plan keeps only plain data) */
function alongS(s, d) {
  for (let i = 1; i < s.pts.length; i++) {
    const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], l = Math.hypot(bx - ax, bz - az);
    if (d <= l || i === s.pts.length - 1) { const u = clamp(d / (l || 1), 0, 1); return [ax + (bx - ax) * u, az + (bz - az) * u, (bx - ax) / (l || 1), (bz - az) / (l || 1)]; }
    d -= l;
  }
  return [...s.pts[0], 1, 0];
}

const BRZ = {};
/** cobbles, painted once per colour: rounded stones in staggered rows, a little lighter and darker each, dark mortar between */
let deckTex = null;
/** a swamp town's square is a deck of weathered boards, not stone */
function deckBoards() {
  if (deckTex) return deckTex;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), rows = 8, h = 256 / rows, k = new THREE.Color();
  g.fillStyle = "#2e241a"; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < rows; j++) for (let i = -1, x = -hash(j, 9) * 120; x < 256; i++) {
    const w = 70 + hash(i, j) * 80;
    k.setHex(0x7a5f42).offsetHSL((hash(j, i) - 0.5) * 0.03, (hash(i, j + 3) - 0.5) * 0.1, (hash(i + 7, j) - 0.5) * 0.12);
    g.fillStyle = "#" + k.getHexString(); g.fillRect(x + 1.5, j * h + 1.5, w - 3, h - 3);
    g.fillStyle = "rgba(0,0,0,0.12)"; for (let t = 0; t < 3; t++) g.fillRect(x + 4, j * h + 5 + t * 9 + hash(i, t) * 4, w - 10, 1.2);
    g.fillStyle = "#3a2c1e"; g.fillRect(x + 5, j * h + h / 2 - 1.5, 3, 3); g.fillRect(x + w - 9, j * h + h / 2 - 1.5, 3, 3);
    x += w;
  }
  deckTex = new THREE.CanvasTexture(c); deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping; deckTex.colorSpace = THREE.SRGBColorSpace; deckTex.anisotropy = 8;
  return deckTex;
}
const cobbleCache = new Map();
function cobbles(col) {
  const key = col.getHex();
  if (cobbleCache.has(key)) return cobbleCache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), n = 8, cell = 256 / n, k = new THREE.Color();
  g.fillStyle = "#" + col.clone().multiplyScalar(0.6).getHexString(); g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < n; j++) for (let i = -1; i <= n; i++) {
    const x = i * cell + (j % 2) * cell / 2, y = j * cell, h = hash(i * 1.7 + 3, j * 2.3 + 1), w = cell - 5 - h * 3, r = 7;
    k.copy(col).offsetHSL((h - 0.5) * 0.03, (h - 0.5) * 0.05, (hash(j, i) - 0.5) * 0.14);
    g.fillStyle = "#" + k.getHexString();
    g.beginPath(); g.roundRect(x + 2.5, y + 2.5, w, cell - 5, r); g.fill();
    g.fillStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.roundRect(x + 5, y + 4, w * 0.6, (cell - 5) * 0.35, r); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  cobbleCache.set(key, t); return t;
}

/** lamp posts down your own turtle's long roads too: to the pier and the boat dock */
export async function lightRoads(L, addSolid) {
  const land = L.land, jobs = [], K = TOWN_KIT;
  for (const rd of L.cfg.roads || []) {
    if (!rd.fit) continue;
    const [ax, az] = rd.from, [bx, bz] = rd.to, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let d = 10, side = 1; d < len - 6; d += 18, side = -side) {
      const off = rd.w * 0.62 + 1.4, x = ax + dx * d - dz * side * off, z = az + dz * d + dx * side * off;
      if (land.ground(x, z) < 3 || land.rough(x, z, 0.6) > 0.8 || land.onTrail(x, z, 0.4)) continue;
      addSolid(L, { x, z, r: 0.4 });
      jobs.push(place(L, K.lamp[0], x, z, K.lamp[1], face(x, z, ax + dx * d, az + dz * d) - Math.PI / 2, 0.4).then((o) => { if (o) { const glow = lampLight(0.24, 2.42); glow.position.x = 0.42; o.add(glow); } }));
    }
  }
  await Promise.all(jobs);
}
