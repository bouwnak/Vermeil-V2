// wildlife.js - the animals that make each turtle feel lived on: walking the land, circling in the air and swimming round the shore.
// What lives where is in wilddata.js. They arrive when you come close to a turtle, so the game starts no slower, and only move while you're near enough to see them.
import * as THREE from "three";
import { character } from "./assets.js";
import { clearAt } from "./world.js";
import { FLYING, GIANTS, POND_FISH, SEA_LIFE, WILD } from "./wilddata.js";

const ARRIVE = 170, MOVE = 200;                              // metres from a turtle's edge
const turnTo = (a, want, dt, rate = 3) => { let d = want - a.heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; a.heading += d * Math.min(1, dt * rate); };

export function makeWildlife(G) {
  const W = { lands: new Map() };
  /** somewhere it can stand: dry, not too steep, nothing solid there, not in a town or on your fields */
  const offLimits = (L) => { const c = L.cfg; return (c.id === "home" ? (c.clear || []).map((i) => c.flats[i]) : c.houses || c.feature ? [c.flats[0]] : []).filter((f) => f && !f.pier); };
  const openGround = (L, x, z, r = 0.8) => { if (L.land.ground(x, z) < 4 || L.land.onRoad(x, z) || L.land.rough(x, z, 1.6) > 1.5) return false; for (const f of offLimits(L)) if (Math.hypot(x - f.x, z - f.z) < f.r * 0.92) return false; return clearAt(L, x, z, r); };
  const spot = (L, near = null, reach = 14, r) => { for (let i = 0; i < 24; i++) {
    const a = Math.random() * 6.3, x = near ? near[0] + Math.cos(a) * Math.random() * reach : Math.cos(a) * L.cfg.a * Math.sqrt(Math.random()) * 0.92, z = near ? near[1] + Math.sin(a) * Math.random() * reach : Math.sin(a) * L.cfg.b * Math.sqrt(Math.random()) * 0.92;
    if (openGround(L, x, z, r)) return [x, z];
  } return null; };

  // ---------------- the ecosystem: who eats what, who drinks where, and what they do with their day ----------------
  const HUNTER = /Wolf|Fox|Coyote|wildcat|Tiger|Lion|Leopard|Panther|Bear|Hyena|Crocodile|Alligator|Velociraptor|Trex|Snake/i;
  const WADER = /Duck|Frog|Turtle|Crab|Flamingo|Heron|Hippo|Crocodile|Alligator|Otter/i;
  const hourNow = () => ((G.s?.minute || 0) / 60) % 24;
  /** where an animal can stand at the water's edge to drink: round each pond, and along both banks of each river. Worked out once a turtle */
  const drinkSpots = (L) => {
    if (L.drinks) return L.drinks;
    const W = L.cfg.waters, out = (L.drinks = []);
    if (!W) return out;
    for (const p of W.ponds) for (let k = 0; k < 8; k++) { const a = k / 8 * 6.3, x = p.x + Math.cos(a) * (p.r + 1.2), z = p.z + Math.sin(a) * (p.r + 1.2); if (L.land.ground(x, z) > 3.8) out.push([x, z, p.x, p.z]); }
    for (const rv of W.rivers) for (let i = 2; i < rv.pts.length - 2; i += 5) {
      const [x, z] = rv.pts[i], [nx, nz] = rv.pts[i + 1], dx = nx - x, dz = nz - z, l = Math.hypot(dx, dz) || 1;
      for (const s of [-1, 1]) { const bx = x - dz / l * (rv.w * 1.35) * s, bz = z + dx / l * (rv.w * 1.35) * s; if (L.land.ground(bx, bz) > 3.8) out.push([bx, bz, x, z]); }
    }
    return out;
  };
  const nearestDrink = (L, x, z, reach = 90) => { let best = null, bd = reach; for (const d of drinkSpots(L)) { const k = Math.hypot(d[0] - x, d[1] - z); if (k < bd) { bd = k; best = d; } } return best; };

  /** one animal that walks. It wanders round its herd's patch, grazes, goes down to the water to drink when it's thirsty, sleeps through the
   *  night, and runs when something hunts it (or you rush at it). A hunter stalks the smaller animals near it now and then and gives up after a dash */
  const walker = (L, c, height, herd = null) => {
    const r = Math.min(1.6, 0.3 + height * 0.3), path = c.path || c.holder?.userData?.path || "", wader = WADER.test(path), hunter = HUNTER.test(path) && height > 0.4;
    const nearWater = wader ? nearestDrink(L, (Math.random() - 0.5) * L.cfg.a, (Math.random() - 0.5) * L.cfg.b, 1e4) : null;
    const home = (herd && spot(L, herd, 10, r)) || (nearWater && spot(L, nearWater, 8, r)) || spot(L, null, 0, r);
    if (!home) return null;
    const a = { kind: "walk", char: c, x: home[0], z: home[1], heading: Math.random() * 6, home, goal: null, wait: Math.random() * 6, step: Math.random() * 6, speed: Math.max(0.35, Math.min(2.4, 0.4 + height * 0.8)), hop: height < 0.7, roam: 10 + height * 8,
      height, hunter, prey: !hunter && height > 0.25 && height < 2.6, thirst: Math.random(), state: "roam", dip: 0, L };
    c.holder.position.set(a.x, L.land.ground(a.x, a.z), a.z); c.holder.rotation.y = a.heading;
    const go = (to, state, wait = 0) => { a.goal = to; a.state = state; a.wait = wait; };
    a.tick = (dt, t, ctx = {}) => {
      if (c.mixer && Object.keys(c.actions).length) c.mixer.update(dt);
      const hr = hourNow(), night = hr >= 21.5 || hr < 5;
      a.thirst += dt / (wader ? 60 : 140);
      // ---- what it wants now ----
      if (a.state === "flee" && (a.wait -= dt) <= 0) { a.state = "roam"; a.goal = null; a.wait = 1 + Math.random() * 3; }
      if (a.state !== "flee" && a.prey) {
        let threat = null;
        if (ctx.you && Math.hypot(ctx.you[0] - a.x, ctx.you[1] - a.z) < (ctx.rushing ? 7 : 3.2)) threat = ctx.you;
        else { const h = (ctx.hunters || []).find((h) => h.state === "hunt" && h.target === a && Math.hypot(h.x - a.x, h.z - a.z) < 14); if (h) threat = [h.x, h.z]; }
        if (threat) {
          const d = Math.hypot(a.x - threat[0], a.z - threat[1]) || 1, away = [a.x + (a.x - threat[0]) / d * 14, a.z + (a.z - threat[1]) / d * 14];
          go(spot(L, away, 5, r) || away, "flee", 3 + Math.random() * 2);
        }
      }
      if (a.state === "roam" || a.state === "graze") {
        if (night && !a.goal) { a.state = "sleep"; a.wait = 1e9; }
        else if (a.thirst > 1 && !a.goal) { const d = nearestDrink(L, a.x, a.z); if (d) go([d[0], d[1]], "drink"); else a.thirst = 0; }
        else if (a.hunter && !a.goal && Math.random() < dt * 0.02) {
          const target = (ctx.prey || []).find((p) => p !== a && p.height < a.height * 1.3 && Math.hypot(p.x - a.x, p.z - a.z) < 26 && p.state !== "sleep");
          if (target) { a.state = "hunt"; a.target = target; a.wait = 6 + Math.random() * 3; }
        }
      }
      if (a.state === "sleep" && !night) { a.state = "roam"; a.wait = Math.random() * 4; }
      if (a.state === "hunt") {
        a.wait -= dt;
        if (a.wait <= 0 || !a.target) { a.state = "roam"; a.target = null; a.goal = null; a.wait = 8 + Math.random() * 10; }
        else a.goal = [a.target.x, a.target.z];
      }
      // ---- moving ----
      let moving = false;
      if (a.state !== "sleep" && a.state !== "drinking" && !a.goal && (a.wait -= dt) <= 0) {
        if (Math.random() < 0.45) { a.state = "graze"; a.wait = 4 + Math.random() * 8; }
        else { a.state = "roam"; a.goal = spot(L, a.home, a.roam, r); if (!a.goal) a.wait = 3; }
      }
      if (a.goal) {
        const dx = a.goal[0] - a.x, dz = a.goal[1] - a.z, d = Math.hypot(dx, dz);
        const pace = a.speed * (a.state === "flee" ? 3.2 : a.state === "hunt" ? 2.8 : 1);
        if (d < 0.5) {
          a.goal = null;
          if (a.state === "drink") { a.state = "drinking"; a.wait = 5 + Math.random() * 5; const w = nearestDrink(L, a.x, a.z, 4); if (w) a.heading = Math.atan2(w[2] - a.x, w[3] - a.z); }
          else if (a.state !== "hunt") { a.state = "roam"; a.wait = 3 + Math.random() * 10; }
        } else {
          const nx = a.x + dx / d * pace * dt, nz = a.z + dz / d * pace * dt;
          if (L.land.ground(nx, nz) < 3.6 || !clearAt(L, nx, nz, r * 0.6)) { a.goal = null; a.wait = 2; if (a.state !== "hunt") a.state = "roam"; }   // the way is blocked: it stops and thinks again
          else { a.x = nx; a.z = nz; moving = true; turnTo(a, Math.atan2(dx, dz), dt, a.state === "flee" ? 7 : 3); }
        }
      }
      if (a.state === "drinking" && (a.wait -= dt) <= 0) { a.thirst = 0; a.state = "roam"; a.wait = 2; }
      // ---- how it looks doing it ----
      const fast = a.state === "flee" || a.state === "hunt";
      a.step += dt * (a.hop ? 11 : 6) * (fast ? 1.8 : 1);
      const legs = !!c.actions.walk, down = a.state === "drinking" || a.state === "graze" ? 1 : 0, asleep = a.state === "sleep" ? 1 : 0;
      a.dip += ((down || asleep) - a.dip) * Math.min(1, dt * 3);
      if (legs) c.play(moving ? (fast && c.actions.run ? "run" : "walk") : "idle");
      const bob = !legs && moving ? (a.hop ? Math.abs(Math.sin(a.step)) * height * 0.35 : Math.abs(Math.sin(a.step)) * 0.04) : 0;
      c.holder.position.set(a.x, L.land.ground(a.x, a.z) + bob - asleep * a.dip * height * 0.12, a.z);
      c.holder.rotation.set(asleep ? 0 : a.dip * 0.28, a.heading, (!legs && moving && !a.hop ? Math.sin(a.step) * 0.035 : 0) + asleep * 0.5 * a.dip);
      c.holder.scale.y = 1 + (asleep ? Math.sin(t * 1.6 + a.step) * 0.015 : 0);
    };
    return a;
  };
  const flyer = (L, c, height) => {
    const home = spot(L, null, 0, 0.1);
    if (!home) return null;
    const a = { kind: "fly", char: c, at: Math.random() * 6.3, r: 3 + Math.random() * 7, v: (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1), up: (height < 0.3 ? 1.2 : 7) + Math.random() * 3 };
    a.tick = (dt, t) => {
      a.at += a.v * dt;
      const x = home[0] + Math.cos(a.at) * a.r, z = home[1] + Math.sin(a.at) * a.r;
      c.holder.position.set(x, L.land.ground(x, z) + a.up + Math.sin(t * 3 + a.at) * 0.3, z);
      c.holder.rotation.y = Math.atan2(-Math.sin(a.at) * a.v, Math.cos(a.at) * a.v);
    };
    return a;
  };
  const swimmer = (L, c, under) => {
    const a = { kind: "swim", char: c, at: Math.random() * 6.3, k: 1.12 + Math.random() * 0.45, v: (0.012 + Math.random() * 0.016) * (Math.random() < 0.5 ? -1 : 1), under, ph: Math.random() * 6.3, jumps: /Dolphin/.test(c.path) };
    const { a: rx, b: rz } = L.cfg;
    a.tick = (dt, t) => {
      if (Object.keys(c.actions).length) c.mixer.update(dt);
      a.at += a.v * dt;
      const x = Math.cos(a.at) * rx * a.k, z = Math.sin(a.at) * rz * a.k, leap = a.jumps ? Math.max(0, Math.sin(t * 0.5 + a.ph) - 0.8) * 16 : 0;
      c.holder.position.set(x, -under + Math.sin(t * 0.7 + a.ph) * 0.12 + leap, z);
      c.holder.rotation.y = Math.atan2(-Math.sin(a.at) * rx * a.v, Math.cos(a.at) * rz * a.v);
    };
    return a;
  };

  /** a fish going round under a pond's surface, now and then darting */
  const pondFish = (L, c, pd) => {
    const a = { kind: "swim", char: c, at: Math.random() * 6.3, k: 0.25 + Math.random() * 0.5, v: (0.3 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.3 };
    a.tick = (dt, t) => {
      if (c.mixer && Object.keys(c.actions).length) c.mixer.update(dt);
      a.at += a.v * dt * (1 + Math.max(0, Math.sin(t * 0.7 + a.ph) - 0.7) * 6);
      const x = pd.x + Math.cos(a.at) * pd.r * a.k, z = pd.z + Math.sin(a.at) * pd.r * a.k;
      c.holder.position.set(x, pd.y - 0.35 + Math.sin(t * 1.3 + a.ph) * 0.06, z);
      c.holder.rotation.y = Math.atan2(-Math.sin(a.at) * a.v, Math.cos(a.at) * a.v);
    };
    return a;
  };
  /** little lights drifting over the water once the sun goes down */
  let FLY = null;
  const fireflies = (L, Wt) => {
    if (!FLY) { const cv = document.createElement("canvas"); cv.width = cv.height = 32; const g = cv.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,210,1)"); gr.addColorStop(0.3, "rgba(220,255,120,0.8)"); gr.addColorStop(1, "rgba(200,255,100,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); FLY = new THREE.CanvasTexture(cv); }
    const where = [...Wt.ponds.map((p) => [p.x, p.z, p.y, p.r]), ...Wt.rivers.flatMap((rv) => rv.pts.filter((_, i) => i % 18 === 9).map(([x, z, y]) => [x, z, y, rv.w * 1.5]))];
    const N = Math.min(400, where.length * 10), pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) { const w = where[i % where.length]; seeds.push([w[0], w[1], w[2], w[3] * (0.4 + Math.random() * 0.9), Math.random() * 6.3, 0.3 + Math.random() * 0.5]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: FLY, size: 0.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = "fireflies"; L.group.add(pts);
    return { pts, tick(t) {
      const hr = hourNow(), dusk = hr > 18.5 || hr < 5 ? 1 : hr > 18 ? (hr - 18) * 2 : 0;
      mat.opacity = dusk * (0.75 + Math.sin(t * 2) * 0.1); pts.visible = dusk > 0.01;
      if (!pts.visible) return;
      seeds.forEach(([x, z, y, r, ph, sp], i) => { const a = ph + t * sp; pos[i * 3] = x + Math.cos(a) * r + Math.sin(t * 1.7 + ph) * 0.6; pos[i * 3 + 1] = y + 0.8 + Math.sin(t * 1.1 + ph * 2) * 0.5; pos[i * 3 + 2] = z + Math.sin(a * 1.3) * r; });
      geo.attributes.position.needsUpdate = true;
    } };
  };

  const arrive = async (L) => {
    const rec = { list: [] }, b = L.cfg.biome;
    W.lands.set(L, rec);
    const add = async (path, height, n, make) => {
      for (let i = 0; i < n; i++) {
        const c = await character(path, height);
        if (!c) return;
        c.path = path;
        c.holder.traverse((o) => { if (o.isMesh) o.castShadow = height > 0.3; });
        const a = make(c);
        if (!a) return;                                       // nowhere on this turtle for it
        L.group.add(c.holder);
        rec.list.push(a);
      }
    };
    const size = Math.min(6, 2.4 * L.cfg.a / 130);         // a bigger turtle has more on it, and every turtle is busy with them
    const n = (k) => Math.max(1, Math.round(k * size));
    // the same kind keep together: every fourth one picks a patch and the next three settle round it
    const herdOf = new Map();
    const inHerd = (p, h) => (c) => { const list = herdOf.get(p) || herdOf.set(p, []).get(p), lead = list.length % 4 === 0 ? null : list[list.length - (list.length % 4)]; const a = walker(L, c, h, lead ? [lead.x, lead.z] : null); if (a) list.push(a); return a; };
    for (const [p, h, k] of WILD[b] || []) await add(p, h, n(k), inHerd(p, h));
    for (const [p, h, k] of GIANTS[b] || []) await add(p, h, Math.max(k, Math.round(k * Math.min(3, L.cfg.a / 120))), inHerd(p, h));        // herds of the old giants on the massive far turtles
    for (const [p, h, k] of FLYING[b] || []) await add(p, h, n(k), (c) => flyer(L, c, h));
    // fireflies over the water at dusk, and fish in the ponds and lakes (not in lava)
    const Wt = L.cfg.waters;
    if (Wt && (Wt.ponds.length || Wt.rivers.length)) rec.glow = fireflies(L, Wt);
    if (Wt && !/Volcanic/i.test(b)) for (const [i, pd] of Wt.ponds.entries()) { const [p, h] = POND_FISH[(i + L.cfg.seed) % POND_FISH.length]; await add(p, h, Math.min(4, 1 + Math.round(pd.r / 3)), (c) => pondFish(L, c, pd)); }
    for (const [p, h, k, under] of SEA_LIFE[b] || SEA_LIFE.default) await add(p, h, k, (c) => swimmer(L, c, under));
  };

  let lookIn = 0, youSpeed = 0, last = null;
  W.tick = (dt, t) => {
    const P = G.player.pos;
    youSpeed = dt > 0 && last ? Math.hypot(P.x - last[0], P.z - last[1]) / dt : 0; last = [P.x, P.z];
    if ((lookIn -= dt) <= 0 && !G.paused) { lookIn = 2; for (const L of G.world.list) if (!W.lands.has(L) && L.detail && L.group.visible && L.dist(P.x, P.z) < L.cfg.a + ARRIVE) arrive(L).catch((e) => console.warn("[wildlife]", L.cfg.id, e)); }
    for (const [L, rec] of W.lands) {
      const near = L.dist(P.x, P.z) < L.cfg.a + MOVE;
      if (rec.near !== near) { rec.near = near; for (const a of rec.list) a.char.holder.visible = near; }
      if (!near) continue;
      // what every animal on this turtle knows this frame: where you are (and whether you're running), who's hunting, who could be hunted
      const ctx = { you: L.local(P.x, P.z), rushing: youSpeed > 6, hunters: rec.list.filter((a) => a.hunter), prey: rec.list.filter((a) => a.prey) };
      for (const a of rec.list) a.tick(dt, t, ctx);
      rec.glow?.tick(t);
    }
  };
  return W;
}
