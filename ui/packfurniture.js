// packfurniture.js - every piece of furniture and decor in the general asset pack, as placeable items for the main room and the hubs.
// The list and each piece's real size come from general_asset_pack/furniture.json (game_tools/build_pack_furniture.py).
// The pack is optional: if it isn't installed the list is empty and the room just has its own furniture.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Mirror } from "./mirror.js";

const base = new URL("./general_asset_pack/", import.meta.url);
const loader = new GLTFLoader();
const models = new Map();
const hitbox = new THREE.MeshBasicMaterial({ visible: false });
const CAST_SHADOW_OVER = 0.3;                     // little things on a table needn't each draw a shadow

function loadModel(file) {
  if (!models.has(file)) {
    models.set(file, new Promise((resolve, reject) => loader.load(new URL(file, base).href, (g) => resolve(g.scene), undefined, reject)));
  }
  return models.get(file);
}

function makeItem(it) {
  const [w, h, d] = it.b, wall = it.m === "wall";
  const def = {
    label: it.l,
    mount: it.m,
    defaultY: it.y || 0,
    isGLB: true,
    category: it.c,
    pack: it.p,
    file: it.u,
    tris: it.t,
    size: it.b,
    info: `${it.l}: about ${Math.max(w, h, d).toFixed(1)} m`,
    build(ctx) {
      const g = new THREE.Group();
      g.userData.isGLB = true;
      const itemId = ctx?._itemId;
      if (itemId != null) g.userData.itemId = itemId;
      // the real model arrives later: until then an invisible box of the right size can already be clicked and measured
      const box = new THREE.Mesh(new THREE.BoxGeometry(w || 0.1, h || 0.02, d || 0.1), hitbox);
      box.position.set(0, h / 2, wall ? d / 2 : 0);
      if (itemId != null) box.userData.itemId = itemId;
      g.add(box);
      loadModel(it.u).then((template) => {
        const clone = new THREE.Group();
        const model = template.clone(true);
        if (it.turn === "up") model.rotation.x = Math.PI / 2;      // modelled lying down: stand it up against the wall
        if (it.turn === "side") model.rotation.y = -Math.PI / 2;   // modelled facing sideways
        clone.add(model);
        const b = new THREE.Box3().setFromObject(clone);
        const c = b.getCenter(new THREE.Vector3()), real = b.getSize(new THREE.Vector3());
        // the list's size wins: the odd model measures differently in the browser than in Blender, and would come out too big without this
        const scale = Math.max(w, h, d) / (Math.max(real.x, real.y, real.z) || 1);
        clone.scale.setScalar(scale);
        clone.position.set(-c.x * scale, -b.min.y * scale, wall ? -b.min.z * scale : -c.z * scale);   // sits on the floor, or with its back flat on the wall
        const shadow = Math.max(w, h, d) > CAST_SHADOW_OVER;
        clone.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = shadow;
          o.receiveShadow = true;
          if (itemId != null) o.userData.itemId = itemId;
          if (o.material) {
            const one = (m) => {
              const n = m.clone();
              if (m.map) n.map = m.map;
              if (wall && d < 0.03) n.side = THREE.DoubleSide;           // a thin picture can face either way in its file
              if (n.metalness > 0.6 && !n.metalnessMap) n.metalness = 0.15;   // full metal needs a reflection to show, and the room has none: it would draw black
              if (n.vertexColors && n.color.r === n.color.g && n.color.g === n.color.b) n.color.set(0xffffff);   // a grey base would darken the model's own colours
              return n;
            };
            o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
            o.userData._origMat = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          }
        });
        if (it.mirror) {                          // the glass part becomes a real mirror that reflects the room
          const glass = [];
          clone.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => /mirror|glass/i.test(m?.name || ""))) glass.push(o); });
          for (const o of glass) {
            const m = new Mirror(o.geometry, { tint: 0xdfe4ea, resolution: 512 });
            m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
            m.position.z += 0.004;
            if (itemId != null) m.userData.itemId = itemId;
            o.parent.add(m); o.parent.remove(o);
          }
        }
        g.remove(box);
        box.geometry.dispose();
        g.add(clone);
        if (ctx?._room && itemId != null) ctx._room.onGLBLoaded?.(itemId);
      }).catch((e) => console.warn("[pack furniture] couldn't load", it.u, e));
      return { group: g };
    },
  };
  if (it.hub) def.hubOnly = true;
  if (it.flat) def.flat = true;
  if (it.seat) def.seat = it.seat;
  return def;
}

async function loadList() {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 8000);   // never let a slow disk hold up the whole app
  try {
    const r = await fetch(new URL("furniture.json", base), { signal: stop.signal });
    return r.ok ? await r.json() : { packs: {}, items: [] };
  } catch {
    return { packs: {}, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

const list = await loadList();

/** type -> item, ready to merge into the room's catalog */
export const PACK_FURNITURE = Object.fromEntries((list.items || []).map((it) => [it.k, makeItem(it)]));
/** pack folder -> its readable name */
export const PACK_NAMES = list.packs || {};
