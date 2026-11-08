// hubedit.js - the world editor in a hub: every hub keeps its own edits, which come back each time you walk in. Someone's visited room isn't yours to edit.
import * as THREE from "three";
import { Sculpt } from "./worldsculpt.js";
import { WorldLayer, store } from "./worldlayer.js";

/** the layer for a hub you've just entered: empty and cheap until there's something in it */
export function hubEntered(room, hub) {
  if (!hub || hub.key === "visit") return null;
  const cozy = room.cozy, group = new THREE.Group();
  room.scene.add(group);
  const house = cozy.house.walkBounds(!!cozy.shellHidden), pad = 8;
  const bounds = hub.open ? { x0: hub.open.minX, z0: hub.open.minZ, x1: hub.open.maxX, z1: hub.open.maxZ } : { x0: house.minX - pad, z0: house.minZ - pad, x1: house.maxX + pad, z1: house.maxZ + pad };
  const flatOnes = () => { const out = cozy.floor ? [cozy.floor] : []; for (const it of cozy.items.values()) if (it.def.flat) it.group.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
  const ground = [...cozy.items.values()].find((i) => i.spec.type === "hubGround");
  const colour = new THREE.Color(ground?.spec.tone ?? 0x8c8378);
  const sculpt = new Sculpt({ base: () => 0, baseColour: () => colour, group, bounds, cell: hub.open ? 0.4 : 0.25, cut: flatOnes });
  const zone = { id: "main", sculpt, group, toLocal: (x, z) => [x, z], toWorld: (x, z) => [x, z] };
  const inside = (x, z) => x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;

  // what the hub came with: told apart by kind and order, so the same piece is found again on the next visit
  const items = new Map(), first = new Map(), seen = new Map();
  for (const it of cozy.items.values()) { const n = seen.get(it.spec.type) || 0; seen.set(it.spec.type, n + 1); const k = `${it.spec.type}#${n}`; items.set(k, it); first.set(k, { ...it.spec }); }
  const fixed = (it) => it.def.flat || it.def.mount === "wall" || it.spec.type === "hubGround" || it.spec.type === "hubSea";
  const keyOf = (it) => { for (const [k, v] of items) if (v === it) return k; return null; };
  const editKeys = (it) => (it.def.edit || []).map((f) => f.key);
  const poseItem = (it, c) => {
    const keys = editKeys(it);
    if (keys.some((f) => f in c && c[f] !== it.spec[f])) {            // its settings changed (a portal's destination or label): build it again with them
      const k = keyOf(it), spec = { ...it.spec }; for (const f of keys) if (f in c) spec[f] = c[f];
      cozy.removeItem(it.id); it = cozy.addItem(spec); if (k) items.set(k, it);
    }
    Object.assign(it.spec, { x: c.x, y: c.y, z: c.z, rot: c.ry });
    it.group.position.set(c.x, c.y, c.z); it.group.rotation.set(c.rx || 0, c.ry || 0, c.rz || 0); it.group.scale.setScalar(c.s || 1);
    room._keyBoxes = null;
  };
  // ---- single plants inside a piece drawn as many copies at once (the park's woods): "key|mesh|copy" ----
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const origOf = new Map(), proxies = new Map(), plantsIn = new Map();
  const editMeshes = (it) => { const out = []; it.group.traverse((o) => { if (o.isInstancedMesh && o.userData.editable) out.push(o); }); return out; };
  const subOf = (key) => {
    const [k, mi, id] = String(key).split("|"); if (id == null) return null;
    const it = items.get(k), mesh = it && editMeshes(it)[+mi];
    return mesh && +id < mesh.count ? { k, it, mesh, id: +id, all: [mesh, ...(mesh.userData.editable.partners || [])] } : null;
  };
  const worldOf = (S) => { S.mesh.getMatrixAt(S.id, _m); S.it.group.updateMatrixWorld(true); return _m.premultiply(S.it.group.matrixWorld); };
  const setWorld = (S, world) => {
    const local = world.clone().premultiply(new THREE.Matrix4().copy(S.it.group.matrixWorld).invert());
    for (const m of S.all) { m.setMatrixAt(S.id, local); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.computeBoundingBox?.(); }
  };
  const proxyOf = (key, S) => {
    let p = proxies.get(key);
    if (!p) { S.mesh.geometry.computeBoundingBox(); const b = S.mesh.geometry.boundingBox, sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const box = new THREE.Mesh(new THREE.BoxGeometry(sz.x, sz.y, sz.z).translate(c.x, c.y, c.z), new THREE.MeshBasicMaterial({ visible: false })); p = new THREE.Group(); p.add(box); room.scene.add(p); proxies.set(key, p); }
    worldOf(S).decompose(p.position, p.quaternion, p.scale); p.updateMatrixWorld(true);
    return p;
  };
  const subPose = (S) => { worldOf(S).decompose(_p, _q, _s); _e.setFromQuaternion(_q, "XYZ"); return { x: _p.x, y: _p.y, z: _p.z, rx: _e.x, ry: _e.y, rz: _e.z, s: _s.x }; };
  const subApply = (key, S, c) => {
    if (!origOf.has(key)) { S.mesh.getMatrixAt(S.id, _m); origOf.set(key, _m.clone()); }
    if (c.removed) { const w = worldOf(S).clone(); w.decompose(_p, _q, _s); setWorld(S, new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(1e-4, 1e-4, 1e-4))); return true; }
    worldOf(S).decompose(_p, _q, _s); const ratio = _s.x ? _s.y / _s.x : 1, k = c.s ?? _s.x;
    setWorld(S, new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rx || 0, c.ry || 0, c.rz || 0, "XYZ")), new THREE.Vector3(k, k * ratio, k)));
    proxyOf(key, S); room._keyBoxes = null; return true;
  };
  const existing = {
    pick(ray) {
      const list = []; for (const it of items.values()) { if (!fixed(it)) list.push(it.group); else list.push(...(plantsIn.get(it) ?? plantsIn.set(it, editMeshes(it)).get(it))); }   // ground pieces: only their single plants
      const hit = list.length ? ray.intersectObjects(list, true)[0] : null;
      if (!hit) return null;
      if (hit.object.isInstancedMesh && hit.object.userData.editable && hit.instanceId != null) {   // one plant out of the woods
        let owner = hit.object; while (owner && owner.userData.itemId == null) owner = owner.parent;
        const it = owner && cozy.items.get(owner.userData.itemId), k = it && keyOf(it);
        if (k) { const key = `${k}|${editMeshes(it).indexOf(hit.object)}|${hit.instanceId}`, S = subOf(key); if (S) return { key, node: proxyOf(key, S), zone, movable: true, distance: hit.distance, label: hit.object.userData.editable.label }; }
      }
      const it = cozy.items.get(hit.object.userData.itemId), k = it && keyOf(it);
      return k ? { key: k, node: it.group, zone, movable: true, distance: hit.distance, label: it.def.label } : null;
    },
    pose(k) { const S = subOf(k); if (S) return subPose(S); const it = items.get(k), g = it.group, out = { x: g.position.x, y: g.position.y, z: g.position.z, rx: g.rotation.x, ry: g.rotation.y, rz: g.rotation.z, s: g.scale.x }; for (const f of editKeys(it)) out[f] = it.spec[f]; return out; },
    /** the settings this piece has besides where it is (a portal: where it goes, what it says) */
    fields: (k) => { if (subOf(k)) return null; const it = items.get(k); return it?.def.edit?.length ? it.def.edit.map((f) => ({ ...f, value: it.spec[f.key] ?? "" })) : null; },
    node: (k) => { const S = subOf(k); return S ? proxyOf(k, S) : items.get(k)?.group; },
    /** what to rebuild a copy from: its kind and settings (not where it stands) */
    spec: (k) => { if (subOf(k)) return null; const it = items.get(k); if (!it) return null; const { x, y, z, rot, id, ...rest } = it.spec; return rest; },
    apply(k, c) {
      const S = subOf(k); if (S) return subApply(k, S, c);
      if (!first.has(k)) return false;
      let it = items.get(k);
      if (c.removed) { if (it) { cozy.removeItem(it.id); items.delete(k); room._keyBoxes = null; } return true; }
      if (!it) { it = cozy.addItem(first.get(k)); items.set(k, it); }
      poseItem(it, c);
      return true;
    },
    restore(k) {
      const S = subOf(k);
      if (S) { const o = origOf.get(k); if (o) for (const m of S.all) { m.setMatrixAt(S.id, o); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } proxyOf(k, S); room._keyBoxes = null; return; }
      const was = first.get(k);
      if (!was) return;
      let it = items.get(k);
      if (!it) { it = cozy.addItem(was); items.set(k, it); }
      else { it.group.scale.setScalar(1); Object.assign(it.spec, was); cozy.place(it); }
      room._keyBoxes = null;
    },
  };
  const solids = [];
  const host = {
    title: hub.name, scope: `hub:${hub.key}`.toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 40), base: "", zone: () => zone, zones: () => [zone], existing,
    addSolid(rec, node) { const b = new THREE.Box3().setFromObject(node); if (b.isEmpty() || b.max.y - b.min.y < 0.08) return null; solids.push(b); room._keyBoxes = null; return b; },
    dropSolid(b) { const i = solids.indexOf(b); if (i >= 0) solids.splice(i, 1); room._keyBoxes = null; },
  };
  const layer = new WorldLayer(host);
  Object.assign(layer, {
    zoneRef: zone, inside, heightAt: (x, z, near = null) => Math.max(sculpt.at(x, z, near) ?? 0, hub.heightAt?.(x, z, near) ?? 0), solids: () => solids,
    dispose() { for (const id of [...layer.objects.keys()]) layer.remove(id); sculpt.dispose(); room.scene.remove(group); for (const p of proxies.values()) room.scene.remove(p); },
  });
  store.load(host.scope).then(async (data) => { if (data && room._worldLayer === layer) await layer.apply(data); }).catch((e) => console.warn("[world editor] load", e));
  return layer;
}

/** open the editor on the hub you're standing in */
export async function openHubEditor(room, api) {
  const layer = room._worldLayer;
  if (!layer || room.worldEdit) return null;
  const { openWorldEditor } = await import("./worldedit.js");
  const cam = room.camera, ctl = room.controls, fog = room.scene.fog, keep = { pos: cam.position.clone(), target: ctl.target.clone(), far: cam.far, fogFar: fog?.far };
  const host = {
    ...layer.host, camera: cam, dom: room.renderer.domElement, scene: room.scene, layer, heightAt: (x, z) => (layer.inside(x, z) ? layer.heightAt(x, z) : null), zoneAt: (x, z) => (layer.inside(x, z) ? layer.zoneRef : null),
    speed: room.hub?.open ? 14 : 6, reach: 500, api,
    onOpen(editor) { room._worldEditor = editor; },
    enter(tick) {
      room._keys?.clear();
      room.walkTarget = null; room._path = [];
      room.worldEdit = tick;
      ctl.enabled = false; cam.far = 2000; cam.updateProjectionMatrix();
      if (fog) fog.far = Math.max(fog.far, 500);
      document.body.classList.add("world-editing");
    },
    leave() {
      room.worldEdit = null; room._worldEditor = null;
      cam.far = keep.far; cam.position.copy(keep.pos); cam.updateProjectionMatrix();
      if (fog) fog.far = keep.fogFar;
      ctl.target.copy(keep.target); ctl.enabled = true; ctl.update();
      room._keyBoxes = null;
      document.body.classList.remove("world-editing");
    },
  };
  return openWorldEditor(host);
}
