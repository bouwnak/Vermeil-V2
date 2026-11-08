// life.js - everything that makes the world busy: wild herds on every turtle, birds and pterosaurs crossing the sea and settling in trees, and crowds in the towns.
import * as THREE from "three";
import { DINOS, HERDS, ISLANDS, SKINS, modelOf, rollLook } from "./data.js";
import { makeDinoBody } from "./dinomodel.js";
import { makeLofted } from "./made.js";
import { character, lookAt } from "./assets.js";
const here = new THREE.Vector3(), here2 = new THREE.Vector3();
import { townModel } from "./wilddata.js";
import { clearAt, groundAt, nearest, pushLocal, shoreNear } from "./world.js";

const OUTFITS = [...SKINS.male.map(([s]) => ["male", s]), ...SKINS.female.map(([s]) => ["female", s])].filter(([, s]) => !/Swat|Spacesuit|SciFi|Soldier|King/.test(s));
/** a sea creature keeps to the water and the beach: never up onto the grass */
export const SAND = 3.6;
export const seaKind = (data) => data.shape?.kind === "plesio";
export const sandy = (g) => g.on === "sea" || g.y < SAND;
/** somewhere a sea creature can go from here: along the beach or out into the water */
export function seaSpot(G, x, z, reach = 24) {
  for (let i = 0; i < 12; i++) { const a = Math.random() * 6.3, r = 6 + Math.random() * reach, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (sandy(groundAt(G, px, pz))) return [px, pz]; }
  return null;
}
/** a random number that's the same for one day and one name: today's herd looks the same whoever loads it */
export const dayRnd = (day, name) => { let h = 2166136261; for (const ch of `${day}:${name}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
const turn = (o, want, dt, rate = 6) => { let a = want - o.heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; o.heading += a * Math.min(1, dt * rate); };

export function makeLife(G) {
  const L = { herd: [], flyers: [], folk: [] };
  /** wild herds arrive with their turtle; any of them can be tamed once its kind is unlocked */
  L.herdOf = async (land) => {
    for (const [species, count, x, z, spread] of HERDS[land.cfg.id] || []) for (let i = 0; i < count; i++) {
      const data = DINOS[species], stage = i === 0 && count > 1 ? 2 : i % 2, look = rollLook(species, dayRnd(G.s.day, `${land.cfg.id}${species}${i}${x === HERDS[land.cfg.id]?.[0]?.[2] ? "" : `@${x | 0}`}`)), c = await makeDinoBody(data, stage, data.sizes[stage], look);
      const a = i * 2.4, lx = x + Math.cos(a) * spread * 0.5, lz = z + Math.sin(a) * spread * 0.5, [wx, wz] = land.world(lx, lz);
      const w = { species, stage, land, data, look, char: c, pos: new THREE.Vector3(wx, 0, wz), heading: a, wander: Math.random() * 6, home: [x, z], spread, goal: null, trust: 0, sea: seaKind(data), slot: `${land.cfg.id}${species}${i}${x === HERDS[land.cfg.id]?.[0]?.[2] ? "" : `@${x | 0}`}` };
      if (w.sea && !sandy(groundAt(G, wx, wz))) { const s = shoreNear(G, wx, wz, 260); if (s) { w.pos.x = s[0] + Math.sin(s[2]) * 4; w.pos.z = s[1] + Math.cos(s[2]) * 4; } }     // it lives where the land meets the sea
      w.pos.y = sandy(groundAt(G, w.pos.x, w.pos.z)) && groundAt(G, w.pos.x, w.pos.z).on === "sea" ? 0 : groundAt(G, w.pos.x, w.pos.z).y;
      G.scene.add(c.holder);
      L.herd.push(w);
    }
  };
  /** a new morning, a new herd: each wild one is born again with a fresh look (the same all day, whoever looks), so a rare one can turn up any day */
  L.respawn = async () => {
    for (const w of L.herd) {
      const look = rollLook(w.species, dayRnd(G.s.day, w.slot || w.species)), c = await makeDinoBody(w.data, w.stage, w.data.sizes[w.stage], look);
      G.scene.remove(w.char.holder); w.char = c; w.look = look; w.trust = 0; G.scene.add(c.holder);
    }
  };
  // ---------------- things in the air ----------------
  const makeBird = (color) => {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide }), body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.46, 4), mat);
    body.rotation.x = Math.PI / 2; g.add(body);
    const wings = [-1, 1].map((s) => { const p = new THREE.Group(), w = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(s * 0.56, 0, -0.06), new THREE.Vector3(0, 0, -0.14)]), mat); w.geometry.computeVertexNormals(); p.add(w); g.add(p); return { p, s }; });
    return { holder: g, move(dt, t, flying, speed) { for (const w of wings) w.p.rotation.z = flying ? w.s * Math.sin(t * speed) * 0.8 : -w.s * 1.3; } };
  };
  const pickRest = (f) => {
    const land = G.world.list[Math.floor(Math.random() * G.world.list.length)];
    if (!land.group.visible) return null;
    const [wx, wz] = land.world((Math.random() - 0.5) * land.cfg.a * 1.4, (Math.random() - 0.5) * land.cfg.b * 1.4);
    const tree = f.big ? null : nearest(G, wx, wz, 30, (r) => r.node === "tree" && !r.off && !r.debris);     // a real tree: never a stump or a log on the ground
    if (tree) { const [x, z] = tree.L.world(tree.x, tree.z); return { x, z, y: groundAt(G, x, z).y + 4.6 + Math.random() * 1.5, tree }; }
    const g = groundAt(G, wx, wz);
    return g.on === "sea" ? null : { x: wx, z: wz, y: g.y + (f.big ? 0.1 : 0.05) };
  };
  L.start = async () => {
    const colors = [0xffffff, 0x4a5560, 0xe0a24a, 0xd8634a, 0x6fa6d8];
    for (let i = 0; i < 26; i++) { const c = makeBird(colors[i % colors.length]); G.scene.add(c.holder); L.flyers.push({ c, pos: new THREE.Vector3(Math.cos(i) * 150, 30 + i, Math.sin(i) * 120), heading: i, state: "fly", at: null, wait: 0, speed: 14 + i % 8, big: false }); }
    for (let i = 0; i < 9; i++) { const stage = 1 + i % 2, spec = DINOS.feather, c = makeLofted(spec, stage, spec.sizes[stage]); G.scene.add(c.holder); L.flyers.push({ c, pos: new THREE.Vector3(Math.cos(i * 2) * 260, 60 + i * 4, Math.sin(i * 2) * 260), heading: i, state: "fly", at: null, wait: 0, speed: 18 + i, big: true }); }
  };
  // ---------------- people ----------------
  /** somewhere a townsperson might go, by the time of day: errands at doors and stalls in the morning, the well and the square at noon and in
   *  the evening, a stroll round the ring street in the afternoon. Local to their turtle. Anywhere it can't stand, a plain open spot instead */
  const open = (land, f, x, z) => { for (let k = 0; k < 10; k++) { const a = Math.random() * 6.3, r = k * 0.6, x2 = x + Math.cos(a) * r, z2 = z + Math.sin(a) * r; if (clearAt(land, x2, z2, 0.7)) return [x2, z2]; } return null; };
  const haunt = (land, f, i) => {
    const hour = (G.s.minute / 60) % 24, q = land.cfg.quarter, cx = q?.cx ?? f.x, cz = q?.cz ?? f.z, roll = Math.random();
    const places = Object.values(land.cfg.places || {}).map(([x, z]) => [cx + x, cz + z]), stalls = (land.cfg.stalls || []).map(([x, z]) => [cx + x, cz + z]);
    const gather = [...(land.gather || []).map(([x, z, r]) => { const a = Math.random() * 6.3; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; }), ...places.slice(0, 2)];
    let to = null;
    if ((hour >= 11 && hour < 14) || (hour >= 17 && hour < 21)) to = roll < 0.6 && gather.length ? gather[Math.floor(Math.random() * gather.length)] : null;
    else if (hour >= 6 && hour < 11) to = roll < 0.5 && stalls.length ? stalls[Math.floor(Math.random() * stalls.length)] : roll < 0.8 && land.doors?.length ? land.doors[Math.floor(Math.random() * land.doors.length)] : null;
    else if (hour >= 14 && hour < 17 && q && roll < 0.6) { if (q.walk?.length) to = [...q.walk[Math.floor(Math.random() * q.walk.length)]]; else { const a = Math.random() * 6.3; to = [cx + Math.cos(a) * (q.ring + 0.6), cz + Math.sin(a) * (q.ring + 0.6)]; } }
    const hit = to && open(land, f, to[0], to[1]);
    if (hit) return hit;
    for (let k = 0; k < 12; k++) { const a = Math.random() * 6.3, r = 6 + Math.random() * (q ? q.ring + 6 : f.r * 0.62), x2 = cx + Math.cos(a) * r, z2 = cz + Math.sin(a) * r; if (clearAt(land, x2, z2, 0.9)) return [x2, z2]; }
    return [f.x + 7, f.z + 7];
  };
  /** a little picture over someone's head while they chat, hum or work: one sprite per emoji, shared */
  const bubbles = {};
  const bubble = (e) => {
    if (!bubbles[e]) { const cv = document.createElement("canvas"); cv.width = cv.height = 96; const x = cv.getContext("2d"); x.fillStyle = "rgba(255,250,238,0.94)"; x.beginPath(); x.arc(48, 44, 38, 0, 7); x.fill(); x.beginPath(); x.moveTo(36, 76); x.lineTo(48, 94); x.lineTo(56, 76); x.fill(); x.font = "44px serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(e, 48, 46); bubbles[e] = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, transparent: true }); }
    const sp = new THREE.Sprite(bubbles[e]); sp.scale.setScalar(0.75); sp.renderOrder = 5; return sp;
  };
  const CHAT = ["💬", "😊", "🌾", "☕", "🐢", "🎵", "😂", "🌸", "🍞", "🦕"];
  L.folkOf = async (land) => {
    const cfg = land.cfg, n = cfg.id === "willowmere" ? 30 : cfg.folk || 0, f = cfg.flats?.[0];
    if (!n || !f) return;
    await Promise.all([...Array(n)].map(async (_, i) => {
      const [body, skin] = OUTFITS[(i * 7 + cfg.seed) % OUTFITS.length], c = await character(townModel(cfg.id, i * 5 + cfg.seed) || modelOf(body, skin), 1.62 + (i % 4) * 0.05);      // everyone in a town wears that town's look
      if (!c) return;
      // no two people move quite alike: their own pace of breathing and fidgeting, and never in step with the next one
      for (const k of ["idle", "walk"]) if (c.actions[k]) c.actions[k].jitter = true;
      if (c.actions.idle) c.actions.idle.timeScale = 0.85 + ((i * 37 + cfg.seed) % 10) * 0.03;
      const spot = () => haunt(land, f, i), [x, z] = spot();
      const p = { char: c, land, pos: new THREE.Vector3(x, land.land.ground(x, z), z), heading: i, goal: spot(), wait: Math.random() * 5, spot, me: i, door: land.doors?.length ? land.doors[(i * 7 + cfg.seed) % land.doors.length] : [f.x, f.z] };
      land.group.add(c.holder); c.holder.position.copy(p.pos);
      L.folk.push(p);
    }));
  };
  const step = (o, tx, tz, speed, dt, stop = 0.5) => { const dx = tx - o.pos.x, dz = tz - o.pos.z, d = Math.hypot(dx, dz); if (d <= stop) return false; const v = Math.min(speed * dt, d); o.pos.x += dx / d * v; o.pos.z += dz / d * v; turn(o, Math.atan2(dx, dz), dt); return true; };

  /** across the drawbridge: to its near end, over, and on to somewhere open on the other turtle. -> the stops, in the world */
  const crossing = (w) => {
    const B = G.world.bridge, W = G.world, home = W.lands.home, town = W.lands.willowmere, toTown = w.land === home, there = toTown ? town : home;
    const near = toTown ? B.z0 : B.z1, far = toTown ? B.z1 : B.z0, out = toTown ? 1 : -1;
    const f = there.cfg.flats[0], a = Math.random() * 6.3, r = Math.random() * f.r * 0.6, [x, z] = there.world(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r);
    return { to: there, stops: [[B.x, near - out * 6], [B.x, near + out * 1], [B.x, far - out * 1], [B.x, far + out * 7], [x, z]] };
  };
  L.tick = (dt, t) => {
    const P = G.player.pos, frameDt = dt, W = G.world, B = W.bridge, town = W.lands.willowmere;
    // what stands on Willowmere goes where Willowmere goes: when it drifts in or out, its herds go with it
    const tp = town.group.position, moved = L.townAt ? [tp.x - L.townAt.x, tp.z - L.townAt.z] : [0, 0];
    L.townAt = tp.clone();
    const hour = G.s.minute / 60, bridgeUp = B?.open >= 1 && W.townK < 0.01;
    for (const w of L.herd) {
      dt = frameDt;
      if (w.land === town && !w.trip) { w.pos.x += moved[0]; w.pos.z += moved[1]; }
      // now and then, while the bridge is down, one wanders over to the other turtle, and back before it lifts
      if (bridgeUp && !w.sea && !w.trip && (w.land === town || w.land === W.lands.home) && t > (w.wander || 0) && (w.away ? hour > 18 || Math.random() < 0.02 : hour < 17 && Math.random() < 0.006)) {
        const c = crossing(w); w.trip = c.stops; w.tripTo = c.to; w.away = !w.away; w.goal = null; w.then = false;
      }
      if (w.trip && !bridgeUp && w.trip.length > 3) { w.trip = null; w.away = !w.away; }       // the bridge lifted before it set off: it stays where it is
      const near = w.land.dist(P.x, P.z) < w.land.cfg.a + 180, close = near && w.pos.distanceTo(P) < 130;
      w.char.holder.visible = near;
      if (!close) continue;
      const dist = w.pos.distanceTo(P);
      w.char.lookAt = dist < 10 ? P : null;
      w.due = (w.due || 0) + dt;                             // far ones are moved in larger, rarer steps: nobody can see their feet from there
      if (dist > 50 && (w.tock = ((w.tock || 0) + 1) % 3)) continue;
      dt = w.due; w.due = 0;
      if (w.drinking > t) { w.char.move(dt, t, false, false, ""); continue; }
      if (w.goal && w.then && !w.goal.moved && Math.hypot(w.pos.x - w.goal[0], w.pos.z - w.goal[1]) < 1.2) { w.then = false; w.goal = null; w.drinking = t + 5; w.char.drink?.(5); continue; }
      if (w.trip) {                                           // on its way over: one stop after the next, then it lives over there for a while
        w.goal = w.trip[0];
        if (Math.hypot(w.pos.x - w.goal[0], w.pos.z - w.goal[1]) < 1.5) { w.trip.shift(); if (!w.trip.length) { w.trip = null; w.goal = null; w.land = w.tripTo; w.home = w.land.local(w.pos.x, w.pos.z); w.spread = 14; w.wander = t + 2; } }
      } else if (t > w.wander) {
        w.wander = t + 3 + Math.random() * 8;
        const sea = !w.sea && Math.random() < 0.14 ? shoreNear(G, w.pos.x, w.pos.z, 50) : null;
        if (w.sea) { w.goal = Math.random() < 0.7 ? seaSpot(G, w.pos.x, w.pos.z) : null; if (!w.goal && Math.random() < 0.3) w.char.react?.("play"); }
        else if (sea) { w.goal = sea; w.then = true; w.wander = t + 20; }
        else {
        const r = Math.random() < 0.65, [gx, gz] = w.land.world(w.home[0] + (Math.random() - 0.5) * w.spread * 2, w.home[1] + (Math.random() - 0.5) * w.spread * 2);
        w.goal = r ? [gx, gz] : null;
        if (!r && Math.random() < 0.3) w.char.react?.(Math.random() < 0.5 ? "roar" : "play");
        }
      }
      const fx = w.pos.x, fz = w.pos.z, moving = w.goal ? step(w, w.goal[0], w.goal[1], 1.8 + w.stage * 0.6, dt, 0.9) : false;
      const g = groundAt(G, w.pos.x, w.pos.z), rise = moving ? (g.y - w.pos.y) / Math.max(1e-3, Math.hypot(w.pos.x - fx, w.pos.z - fz)) : 0;
      if (w.trip) { if (g.on === "sea") { w.pos.x = fx; w.pos.z = fz; w.trip = null; w.away = !w.away; } }          // the way over is the bridge: it never wades in
      else if (w.sea ? !sandy(g) : g.on === "sea" || rise > 1.2) { w.pos.x = fx; w.pos.z = fz; w.goal = null; }
      const gy = (q) => (q.on === "sea" ? 0 : q.y);           // at sea, on the surface
      if (!moving && !w.goal) w.pos.y += (gy(groundAt(G, w.pos.x, w.pos.z)) - w.pos.y) * Math.min(1, dt * 6); else w.pos.y = gy(g);
      w.char.move(dt, t, moving, false, g.on === "sea" ? "swim" : "");
      if (/Legendary|Mythic/.test(w.look?.tier) && Math.random() < dt * 1.5) G.vfx.burst(w.look.tier === "Mythic" ? "glow" : "gold", w.pos.x, w.pos.y + w.char.top * 0.7, w.pos.z, 0.12);      // you can tell a rare one from across a field
      w.char.holder.position.copy(w.pos); w.char.holder.rotation.y = w.heading;
    }
    dt = frameDt;
    // shoppers: while your goods are out in the daytime, people nearby walk over and buy
    if ((L.shopIn = (L.shopIn || 8) - dt) <= 0) {
      L.shopIn = 10 + Math.random() * 14;
      const stall = G.craft.openStall?.(), h = G.s.minute / 60;
      if (stall && h > 7 && h < 19) {
        const near = L.folk.filter((p) => p.land === stall.L && !p.errand).sort((a, b) => Math.hypot(a.pos.x - stall.x, a.pos.z - stall.z) - Math.hypot(b.pos.x - stall.x, b.pos.z - stall.z))[Math.floor(Math.random() * 4)];
        if (near) { near.errand = stall; near.wait = 0; near.goal = [stall.x + Math.sin(stall.ry) * 3, stall.z + Math.cos(stall.ry) * 3]; }
      }
    }
    for (const f of L.flyers) {
      if (f.state === "rest") {
        f.wait -= dt;
        if (f.big) f.c.move(dt, t, false, false, ""); else f.c.move(dt, t, false, 0);
        if (f.wait <= 0 || f.at?.tree?.off) { f.state = "fly"; f.at = null; }          // the tree it sat in came down: off it goes
      } else {
        if (!f.at) { f.at = pickRest(f); f.far = Math.random() < 0.6; }
        if (f.at) {
          const dx = f.at.x - f.pos.x, dz = f.at.z - f.pos.z, d = Math.hypot(dx, dz), cruise = Math.max(f.at.y + 8, 42 + (f.big ? 14 : 0));
          const wantY = d < 40 ? f.at.y + (d / 40) * (cruise - f.at.y) : cruise;
          f.pos.y += (wantY - f.pos.y) * Math.min(1, dt * 1.4);
          turn(f, Math.atan2(dx, dz), dt, 2.2);
          f.pos.x += Math.sin(f.heading) * f.speed * dt; f.pos.z += Math.cos(f.heading) * f.speed * dt;
          if (d < 2.5) { f.pos.y = f.at.y; f.state = "rest"; f.wait = 8 + Math.random() * 24; }
        }
        if (f.big) f.c.move(dt, t, true, true, "fly"); else f.c.move(dt, t, true, 13);
      }
      f.c.holder.position.copy(f.pos); f.c.holder.rotation.y = f.heading;
    }
    for (const p of L.folk) {
      const near = p.land.dist(P.x, P.z) < p.land.cfg.a + 70;
      p.char.holder.visible = p.land.group.visible && near;
      if (!near) continue;
      p.due = (p.due || 0) + dt;
      if (p.pos.distanceTo(P) > 60 && (p.tock = ((p.tock || 0) + 1) % 4)) continue;
      dt = p.due; p.due = 0;
      p.char.O.undo();
      p.char.mixer.update(dt);
      p.wait -= dt;
      const was = [p.pos.x, p.pos.z], moving = p.wait <= 0 && step(p, p.goal[0], p.goal[1], p.errand ? 2.6 : 1.9, dt);
      if (moving) {                                          // round what's in the way, not through it; if it can't be got round, somewhere else will do
        pushLocal(p.land, p.pos, 0.45);
        p.held = Math.hypot(p.pos.x - was[0], p.pos.z - was[1]) < dt * 0.5 ? (p.held || 0) + dt : 0;
        if (p.held > 2) { p.held = 0; if (p.errand) p.errand = null; p.goal = p.spot(); }
      }
      const hr = (G.s.minute / 60) % 24, night = (hr >= 22 || hr < 5.5) && p.me % 5 !== 0;      // a few night owls stay out under the lamps
      if (night && !p.errand && !p.inside) { if (!p.homeward) { p.homeward = true; p.goal = p.door; p.wait = Math.random() * 20; } }
      else if (!night && (p.inside || p.homeward)) { p.inside = p.homeward = false; p.char.holder.visible = true; p.goal = p.spot(); p.wait = Math.random() * 30; }
      if (p.inside) { p.char.holder.visible = false; dt = frameDt; continue; }
      if (p.wait <= 0 && !moving) {
        if (p.homeward) { p.inside = true; dt = frameDt; continue; }                                  // in through the door, till morning
        if (p.errand) { G.craft.buyAt(p.errand); p.errand = null; p.wait = 2; p.goal = p.spot(); p.say = 1.6; p.mood = "🧺"; }
        else {
          // somebody close by and standing about: stop and talk a while, facing each other
          const pal = L.folk.find((o) => o !== p && o.land === p.land && !o.inside && o.wait > 1 && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 3.2);
          if (pal) { p.wait = 6 + Math.random() * 10; pal.wait = Math.max(pal.wait, p.wait); p.face = pal; pal.face = p; p.say = 2.5; p.mood = CHAT[Math.floor(Math.random() * CHAT.length)]; if (Math.random() < 0.6) setTimeout(() => p.char.once?.("wave"), 500); }
          else { p.wait = 2 + Math.random() * 8; p.face = null; if (Math.random() < 0.15) { p.say = 2; p.mood = hr > 18 ? "🌙" : "🎵"; } }
          p.goal = p.spot();
        }
      }
      if (p.face && !moving) { const o = p.face; turn(p, Math.atan2(o.pos.x - p.pos.x, o.pos.z - p.pos.z), dt); if (o.wait <= 0) p.face = null; }
      if (p.say > 0) {
        p.say -= dt;
        if (!p.bub || p.bubOf !== p.mood) { if (p.bub) p.char.holder.remove(p.bub); p.bub = bubble(p.mood); p.bubOf = p.mood; p.bub.position.y = 2.35; p.char.holder.add(p.bub); }
        p.bub.position.y = 2.35 + Math.sin(t * 3 + p.me) * 0.05;
      } else if (p.bub) { p.char.holder.remove(p.bub); p.bub = null; }
      p.pos.y = p.land.land.ground(p.pos.x, p.pos.z);
      p.char.play(moving ? "walk" : "idle");
      if (p.char.actions.walk) p.char.actions.walk.timeScale = (p.errand ? 2.6 : 1.9) / 3.1 * (0.92 + (p.me % 5) * 0.04);     // feet keep pace with the ground: an errand is a brisker step
      p.char.holder.position.copy(p.pos); p.char.holder.rotation.y = p.heading;
      // heads turn: to whoever they're talking to, or to you as you come by
      let eye = null;
      if (p.face) eye = p.face.char.holder.position;
      else if (p.pos.distanceTo(p.land.group.worldToLocal(here.copy(P))) < 6) eye = here;
      if (eye || Math.abs(p.char.look) > 0.005) { p.char.root.updateWorldMatrix(true, true); lookAt(p.char, p.heading, eye && here2.copy(eye).setY(eye.y + 1.5), dt, 1); }
      dt = frameDt;
    }
  };
  return L;
}
export { ISLANDS };
