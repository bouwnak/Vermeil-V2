// farmedit.js - the world editor on the farm world. Each turtle keeps its own ground and what's been placed on it, so it all drifts along with the turtle.
// Saved edits are read before the world is built, so trees and crops grow on the ground as you left it.
import * as THREE from "three";
import { Sculpt } from "../worldsculpt.js";
import { WorldLayer, store } from "../worldlayer.js";
import { addSolid, dropSolid, detail } from "./world.js";      // what you removed is taken off the map of solids, so nothing regrows it or chops it

const SCOPE = "farm", ZERO = new THREE.Matrix4().makeScale(0, 0, 0), BURIED = 1000;
const tenth = (v) => Math.round(v * 10);

/** read what you saved. Before buildWorld */
export async function loadFarmEdits(G) {
  G.edits = { data: null, zones: new Map(), layer: null };
  if (G.guest) return;                // someone else's farm stays as they made it
  try { G.edits.data = await store.load(SCOPE); } catch (e) { console.warn("[world editor] load", e); }
}

function zoneOf(G, L) {
  const E = G.edits, id = L.cfg.id;
  let z = E.zones.get(id);
  if (z) return z;
  const land = L.land, c = new THREE.Color(), winter = G.world?.season === 3 && (id === "home" || id === "willowmere"), out = [];
  const reach = Math.max(L.cfg.a, L.cfg.b ?? L.cfg.a) * 1.35, cell = Math.max(0.5, reach * 2 / 2040);
  const sculpt = new Sculpt({
    base: (x, y) => land.baseGround(x, y), group: L.group, bounds: { x0: -reach, z0: -reach, x1: reach, z1: reach }, cell,
    baseColour: (x, y, height, slope) => { out.length = 0; land.colour(height, slope, x, y, out, winter); return c.setRGB(out[0], out[1], out[2]); },
    cut: () => L.group.children.filter((m) => m.isMesh && m.userData.landSurface),
  });
  land.sculpt = sculpt;
  z = { id, L, sculpt, group: L.group, toLocal: (x, y) => L.local(x, y), toWorld: (x, y) => L.world(x, y) };
  E.zones.set(id, z);
  return z;
}

/** a turtle's own meshes are made: its saved ground goes on, so what grows on it sits right */
export function landMade(G, L) {
  const d = G.edits?.data?.zones?.[L.cfg.id];
  if (d) zoneOf(G, L).sculpt.load(d);
}

// what the world came with: on the farm it can be removed, and only that. A turtle fills in as you come close, so what you removed goes again each time
function spotKey(L, x, z) { return `${L.cfg.id}|s|${tenth(x)}|${tenth(z)}`; }
function propKey(L, o) { return `${L.cfg.id}|p|${tenth(o.position.x)}|${tenth(o.position.y)}|${tenth(o.position.z)}`; }
const solidsNear = (L, x, z, far = 0.5) => { const out = []; for (const list of L.cells.values()) for (const r of list) if (!r.off && Math.hypot(r.x - x, r.z - z) < far) out.push(r); return out; };

function hideSpot(L, spot) {
  if (spot.editSaved) return;
  spot.editSaved = spot.insts.map((inst) => { const m = new THREE.Matrix4(); inst.getMatrixAt(spot.slot, m); inst.setMatrixAt(spot.slot, ZERO); inst.instanceMatrix.needsUpdate = true; return m; });
  spot.editOff = solidsNear(L, spot.x, spot.z); for (const r of spot.editOff) dropSolid(r);
}
function showSpot(spot) {
  if (!spot.editSaved) return;
  spot.insts.forEach((inst, i) => { inst.setMatrixAt(spot.slot, spot.editSaved[i]); inst.instanceMatrix.needsUpdate = true; });
  for (const r of spot.editOff || []) addSolid(r.L, r);
  spot.editSaved = spot.editOff = null;
}
function hideProp(L, o) {
  if (o.userData.editBuried) return;
  o.userData.editBuried = true; o.userData.editOff = solidsNear(L, o.position.x, o.position.z, 1.2);
  for (const r of o.userData.editOff) dropSolid(r);
  o.position.y -= BURIED;
}
function showProp(o) {
  if (!o.userData.editBuried) return;
  o.userData.editBuried = false; o.position.y += BURIED;
  for (const r of o.userData.editOff || []) addSolid(r.L, r);
  o.userData.editOff = null;
}
/** find what a key names on this turtle */
function find(L, key) {
  const part = key.split("|");
  for (const c of L.group.children) {
    if (part[1] === "s" && c.isInstancedMesh && c.userData.spots) { const s = c.userData.spots.find((p) => tenth(p.x) === +part[2] && tenth(p.z) === +part[3]); if (s) return { spot: s }; }
    if (part[1] === "p" && !c.isInstancedMesh && !c.userData.always && !c.userData.worldId) {
      const y = c.userData.editBuried ? c.position.y + BURIED : c.position.y;
      if (tenth(c.position.x) === +part[2] && tenth(y) === +part[3] && tenth(c.position.z) === +part[4]) return { prop: c };
    }
  }
  return null;
}
const hasBones = (o) => { let yes = false; o.traverse((m) => { if (m.isSkinnedMesh) yes = true; }); return yes; };

function makeLayer(G) {
  const W = G.world, E = G.edits;
  const existing = {
    pick(ray) {
      let best = null;
      for (const L of W.list) {
        if (!L.group.visible || L.far) continue;
        const list = L.group.children.filter((c) => !c.userData.always && !c.userData.worldId && !c.userData.handle && c.visible && !c.userData.editBuried && c.position.y > -BURIED / 2 && (c.isInstancedMesh || !hasBones(c)));
        for (const hit of ray.intersectObjects(list, true)) {
          if (best && hit.distance >= best.distance) break;
          let top = hit.object; while (top.parent && top.parent !== L.group) top = top.parent;
          if (top.parent !== L.group) continue;
          if (top.isInstancedMesh) {
            const s = top.userData.spots?.[hit.instanceId];
            if (!s) continue;
            best = { key: spotKey(L, s.x, s.z), node: top, zone: zoneOf(G, L), movable: false, distance: hit.distance, label: "A plant or rock" };
          } else best = { key: propKey(L, top), node: top, zone: zoneOf(G, L), movable: false, distance: hit.distance, label: "A piece of the world" };
          break;
        }
      }
      return best;
    },
    pose: () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 }),
    node: () => null,
    apply(key, c) {
      if (!c.removed) return false;
      const L = W.lands[key.split("|")[0]];
      if (!L) return false;
      const f = find(L, key);
      if (f?.spot) hideSpot(L, f.spot); else if (f?.prop) hideProp(L, f.prop);
      return true;                    // a turtle that hasn't filled in yet: done when it does (landFilled)
    },
    restore(key) {
      const L = W.lands[key.split("|")[0]], f = L && find(L, key);
      if (f?.spot) showSpot(f.spot); else if (f?.prop) showProp(f.prop);
    },
  };
  E.layer = new WorldLayer({
    scope: SCOPE, base: "../", existing,
    zone: (id) => (W.lands[id] ? zoneOf(G, W.lands[id]) : null), zones: () => [...E.zones.values()],
    addSolid(rec, node, zone) {
      const b = new THREE.Box3().setFromObject(node), s = b.getSize(new THREE.Vector3());
      if (b.isEmpty() || s.y < 0.25) return null;
      return addSolid(zone.L, { x: rec.x, z: rec.z, r: Math.min(8, Math.max(s.x, s.z) / 2), placed: true });
    },
    dropSolid,
  });
  return E.layer;
}

/** after the world is built: what you placed and removed comes back */
export async function restoreFarmEdits(G) {
  if (!G.edits || G.guest) return;
  const layer = makeLayer(G);
  G.landFilled = (L) => { for (const [key, c] of layer.changed) if (key.startsWith(`${L.cfg.id}|`) && c.removed) layer.host.existing.apply(key, c); };
  if (G.edits.data) await layer.apply(G.edits.data).catch((e) => console.warn("[world editor] restore", e));
}

export async function openFarmEditor(G, api) {
  if (G.show || G.guest || !G.edits?.layer) return null;
  const { openWorldEditor } = await import("../worldedit.js");
  const W = G.world, cam = G.camera, hud = document.getElementById("hud"), P = G.player.pos;
  const keep = { pos: cam.position.clone(), q: cam.quaternion.clone(), paused: G.paused, near: cam.near };
  const landAt = (x, z) => { let best = null, top = -Infinity; for (const L of W.list) { if (!L.close(x, z)) continue; const [a, b] = L.local(x, z), y = L.land.ground(a, b); if (y > -13.9 && y > top) { top = y; best = L; } } return best ? [best, top] : null; };
  const host = {
    title: "Farm world", scope: SCOPE, base: "../", camera: cam, dom: G.renderer.domElement, scene: G.scene, layer: G.edits.layer, api, speed: 26, reach: 1400, existing: G.edits.layer.host.existing,
    heightAt: (x, z) => landAt(x, z)?.[1] ?? null,
    zoneAt: (x, z) => { const hit = landAt(x, z); return hit ? zoneOf(G, hit[0]) : null; },
    zones: () => [...G.edits.zones.values()],
    onOpen(editor) { G.worldEditor = editor; },
    onFrame() {
      const p = cam.position;
      W.ocean.position.x = p.x; W.ocean.position.z = p.z;
      W.sun.position.set(p.x + 40, p.y + 90, p.z + 30); W.sun.target.position.set(p.x, 0, p.z); W.sun.target.updateMatrixWorld();
      for (const L of W.list) {                           // a turtle you fly to fills in just as it does when you sail there
        const d = L.dist(p.x, p.z), far = d > L.cfg.a * 1.3 + 500;
        if (far !== L.far) { L.far = far; for (const c of L.group.children) if (!c.userData.always) c.visible = !far; }
        if (!L.detail && !far && L.group.visible && d < L.cfg.a * 1.3 + 320) detail(G, L);
      }
    },
    enter(tick) {
      hud.hidden = true; G.paused = true;
      G.show = { scene: G.scene, tick, shadows: true };
      cam.position.set(P.x, P.y + 14, P.z + 22); cam.lookAt(P.x, P.y, P.z);
    },
    leave() {
      G.show = null; G.worldEditor = null; G.paused = keep.paused; hud.hidden = false;
      cam.position.copy(keep.pos); cam.quaternion.copy(keep.q);
    },
  };
  return openWorldEditor(host);
}
