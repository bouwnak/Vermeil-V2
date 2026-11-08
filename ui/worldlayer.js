// worldlayer.js - what you've changed in one world: terraforming, placed models and shapes, and moved or removed originals. Works without the editor open, so a saved world comes back when you visit it.
// host = { scope, base, zone(id) -> { id, sculpt, group, toLocal(x, z), y() }, addSolid(rec, node, zone) -> handle, dropSolid(handle), existing: { apply(key, change), restore(key), pose(key) } }
import * as THREE from "three";
import { makeModel } from "./worldlibrary.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MATERIALS, stairCount, shapeEdge, TUNNEL_LEAD } from "./worldsculpt.js";

export const store = {
  api: () => window.pywebview?.api || null,
  async load(scope) { const a = this.api(); if (a?.world_edit_load) return a.world_edit_load(scope); try { return JSON.parse(localStorage.getItem(`world_edit.${scope}`) || "null"); } catch { return null; } },
  async save(scope, data) { const a = this.api(); if (a?.world_edit_save) return a.world_edit_save(scope, data); try { localStorage.setItem(`world_edit.${scope}`, JSON.stringify(data)); return { ok: true }; } catch (e) { return { error: e.message }; } },
  async clear(scope) { const a = this.api(); if (a?.world_edit_clear) return a.world_edit_clear(scope); try { localStorage.removeItem(`world_edit.${scope}`); } catch { /* nothing kept */ } return { ok: true }; },
};

// ---------------- platforms: shapes and what they're covered in ----------------
export const SHAPES = { box: "Block", cylinder: "Round", ramp: "Ramp", stairs: "Stairs", sphere: "Sphere" };
/** the inside of a tunnel: its walls and its far end, facing in, darker the deeper it goes. Along +z from its mouth */
export function tunnelGeometry(rec) {
  const r = Math.max(0.2, rec.r || 1), len = Math.max(0.5, rec.len || 6), n = rec.shape === "circle" || !rec.shape ? 40 : 80, z0 = -r * TUNNEL_LEAD;
  const ring = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, e = shapeEdge(rec.shape || "circle", a) * r; ring.push([Math.cos(a) * e, Math.sin(a) * e]); }
  const pos = [], col = [], c = new THREE.Color(), mouth = new THREE.Color(0x7a5636), deep = new THREE.Color(0x231a12), steps = Math.max(2, Math.ceil((len - z0) / Math.max(0.5, r)));
  const shade = (z) => c.copy(mouth).lerp(deep, Math.min(1, Math.max(0, z / len)) ** 0.8);
  const put = (p, z) => { pos.push(p[0], p[1], z); shade(z); col.push(c.r, c.g, c.b); };
  for (let s = 0; s < steps; s++) {
    const za = z0 + ((len - z0) * s) / steps, zb = z0 + ((len - z0) * (s + 1)) / steps;
    for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; put(a, za); put(b, za); put(b, zb); put(a, za); put(b, zb); put(a, zb); }
  }
  for (let i = 0; i < n; i++) { put([0, 0], len); put(ring[(i + 1) % n], len); put(ring[i], len); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** the tunnel's walls aren't drawn where they stick out above the ground: hTex holds the ground's height over its patch */
function tunnelMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vZoneP; uniform mat4 uToZone;").replace("#include <project_vertex>", "#include <project_vertex>\nvZoneP = (uToZone * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vZoneP; uniform sampler2D uHTex; uniform vec4 uHBox;")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nvec2 hUV = (vZoneP.xz - uHBox.xy) * uHBox.zw; if (hUV.x >= 0.0 && hUV.y >= 0.0 && hUV.x <= 1.0 && hUV.y <= 1.0 && vZoneP.y > texture2D(uHTex, hUV).r + 0.03) discard;");
  };
  m.customProgramCacheKey = () => "worldlayer-tunnel";
  return m;
}
function tunnelMesh(rec) {
  const U = { uToZone: { value: new THREE.Matrix4() }, uHTex: { value: null }, uHBox: { value: new THREE.Vector4() } };
  const m = new THREE.Mesh(tunnelGeometry(rec), tunnelMaterial(U));
  m.receiveShadow = true; m.userData.tunnel = U;
  return m;
}
/** the ground's height over a tunnel's patch, for hiding what sticks out of the hill */
function tunnelHeights(sculpt, t, U) {
  const box = new THREE.Box3(), q = new THREE.Vector3(), r = t.r * 1.6;
  for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-t.r * TUNNEL_LEAD, t.len]) box.expandByPoint(q.set(x, y, z).applyMatrix4(t.m));
  const sx = Math.max(0.5, box.max.x - box.min.x), sz = Math.max(0.5, box.max.z - box.min.z), W = Math.min(256, Math.max(8, Math.ceil(sx / 0.2))), D = Math.min(256, Math.max(8, Math.ceil(sz / 0.2)));
  const data = new Float32Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) data[i + j * W] = sculpt.surface(box.min.x + ((i + 0.5) / W) * sx, box.min.z + ((j + 0.5) / D) * sz);
  U.uHTex.value?.dispose();
  const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  U.uHTex.value = tex; U.uHBox.value.set(box.min.x, box.min.z, 1 / sx, 1 / sz);
}
/** textures drawn here in code, so they cost no files. Each tile is 2 m across */
export const SURFACES = {
  brick: { label: "Brick wall", base: "#9a4b35" }, stonewall: { label: "Stone wall", base: "#8d8a83" }, planks: { label: "Wood planks", base: "#9a6a3f" },
  tiles: { label: "Floor tiles", base: "#d9d2c4" }, cobble: { label: "Cobblestone", base: "#7d7a74" }, metal: { label: "Metal plate", base: "#9aa1a8" },
  concrete: { label: "Concrete", base: "#a9a7a1" }, marble: { label: "Marble", base: "#ece8e1" }, grassy: { label: "Grass", base: "#5f9442" },
  roof: { label: "Roof tiles", base: "#8a3b2c" }, hedge: { label: "Hedge", base: "#3f6e30" }, glass: { label: "Glass", base: "#bfe3f2" },
};
const texCache = new Map();
const rand = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function drawSurface(id) {
  const S = SURFACES[id], cv = document.createElement("canvas"), x = cv.getContext("2d"), r = rand(id.length * 977 + id.charCodeAt(0) * 31 + 13), W = 256;
  cv.width = cv.height = W;
  x.fillStyle = S.base; x.fillRect(0, 0, W, W);
  const speck = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * a})` : `rgba(0,0,0,${r() * a})`; x.fillRect(r() * W, r() * W, 2 + r() * 3, 2 + r() * 3); } };
  const shade = (v) => (v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`);
  if (id === "brick" || id === "stonewall") {
    const rows = id === "brick" ? 8 : 5, h = W / rows, w = id === "brick" ? W / 4 : W / 3;
    x.fillStyle = id === "brick" ? "#cfc2b0" : "#5d5a55"; x.fillRect(0, 0, W, W);
    for (let j = 0; j < rows; j++) for (let i = -1; i < W / w + 1; i++) {
      const ox = (j % 2) * w / 2 + i * w;
      x.fillStyle = S.base; x.fillRect(ox + 3, j * h + 3, w - 6, h - 6);
      x.fillStyle = shade((r() - 0.5) * 0.25); x.fillRect(ox + 3, j * h + 3, w - 6, h - 6);
    }
    speck(500, 0.15);
  } else if (id === "planks") {
    const n = 6, h = W / n;
    for (let j = 0; j < n; j++) {
      x.fillStyle = shade((r() - 0.5) * 0.22); x.fillRect(0, j * h, W, h);
      for (let k = 0; k < 9; k++) { x.strokeStyle = `rgba(60,30,10,${0.08 + r() * 0.12})`; x.beginPath(); const y = j * h + r() * h; x.moveTo(0, y); x.bezierCurveTo(W / 3, y + (r() - 0.5) * 8, W * 2 / 3, y + (r() - 0.5) * 8, W, y); x.stroke(); }
      x.fillStyle = "rgba(40,20,5,.55)"; x.fillRect(0, j * h, W, 2); x.fillRect(((j * 3) % 4) * W / 4, j * h, 2, h);
    }
  } else if (id === "tiles" || id === "roof") {
    const n = id === "tiles" ? 4 : 8, w = W / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      x.fillStyle = shade((r() - 0.5) * 0.12); x.fillRect(i * w, j * w, w, w);
      if (id === "tiles") { x.fillStyle = "rgba(90,80,70,.5)"; x.fillRect(i * w, j * w, w, 2); x.fillRect(i * w, j * w, 2, w); }
      else { x.strokeStyle = "rgba(40,10,5,.6)"; x.lineWidth = 3; x.beginPath(); x.arc(i * w + w / 2 + (j % 2) * w / 2, j * w + w, w / 2, Math.PI, 0); x.stroke(); }
    }
  } else if (id === "cobble") {
    x.fillStyle = "#4e4b46"; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 70; i++) { x.fillStyle = `hsl(30,4%,${38 + r() * 22}%)`; x.beginPath(); x.ellipse(r() * W, r() * W, 10 + r() * 12, 8 + r() * 10, r() * 3, 0, Math.PI * 2); x.fill(); }
  } else if (id === "metal") {
    for (let i = 0; i < W; i += 2) { x.fillStyle = `rgba(255,255,255,${r() * 0.06})`; x.fillRect(0, i, W, 1); }
    x.fillStyle = "rgba(40,45,50,.6)"; x.fillRect(0, 0, W, 3); x.fillRect(0, 0, 3, W);
    for (const [a, b] of [[12, 12], [W - 12, 12], [12, W - 12], [W - 12, W - 12]]) { x.fillStyle = "#6c7279"; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }
  } else if (id === "marble") {
    for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(120,115,110,${0.1 + r() * 0.2})`; x.lineWidth = 1 + r() * 2; x.beginPath(); let px = r() * W, py = 0; x.moveTo(px, py); while (py < W) { px += (r() - 0.5) * 40; py += 20 + r() * 30; x.lineTo(px, py); } x.stroke(); }
  } else if (id === "grassy" || id === "hedge") {
    for (let i = 0; i < 2600; i++) { x.fillStyle = `hsl(${95 + r() * 25},${40 + r() * 20}%,${(id === "hedge" ? 18 : 28) + r() * 20}%)`; x.fillRect(r() * W, r() * W, 2, 3 + r() * 5); }
  } else if (id === "glass") {
    x.fillStyle = "rgba(255,255,255,.35)"; x.fillRect(0, 0, W, 4); x.fillRect(0, 0, 4, W);
    x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = 6; x.beginPath(); x.moveTo(40, 200); x.lineTo(200, 40); x.stroke();
  } else speck(1400, 0.18);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
export function surfaceTexture(id) { if (!texCache.has(id)) texCache.set(id, drawSurface(id)); return texCache.get(id); }
/** a little picture of a surface for its button */
export function surfaceSwatch(id) { return surfaceTexture(id).image.toDataURL("image/png"); }

/** texture coordinates in metres, from whichever way each face looks: a 6 m wall shows its bricks at the same size as a 1 m one */
function worldUV(geo, tile = 2) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
function rampGeometry(w, h, d) {
  const X = w / 2, Y = h / 2, Z = d / 2;
  const a = [-X, -Y, -Z], b = [X, -Y, -Z], c = [X, -Y, Z], e = [-X, -Y, Z], f = [X, Y, Z], g = [-X, Y, Z];
  // bottom, back wall, the slope, then the two side triangles; each wound to face outwards
  const tri = [a, b, c, a, c, e, e, c, f, e, f, g, a, g, f, a, f, b, b, f, c, a, e, g].flat();
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  return geo;
}
function stairsGeometry(rec) {
  const n = stairCount(rec), step = rec.h / n, deep = rec.d / n, parts = [];
  for (let i = 0; i < n; i++) {        // each step reaches down to the floor, so the stairs are solid
    const tall = step * (i + 1), g = new THREE.BoxGeometry(rec.w, tall, deep);
    g.translate(0, -rec.h / 2 + tall / 2, -rec.d / 2 + deep * (i + 0.5));
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}
export function shapeGeometry(rec) {
  if (rec.kind === "sphere") return new THREE.SphereGeometry(rec.r, 28, 18);
  if (rec.kind === "cylinder") { const g = new THREE.CylinderGeometry(0.5, 0.5, rec.h, 40); g.scale(rec.w, 1, rec.d); return g; }
  if (rec.kind === "ramp") return rampGeometry(rec.w, rec.h, rec.d);
  if (rec.kind === "stairs") return stairsGeometry(rec);
  return new THREE.BoxGeometry(rec.w, rec.h, rec.d);
}
export function shapeMaterial(mat) {
  if (SURFACES[mat]) return new THREE.MeshStandardMaterial({ map: surfaceTexture(mat), roughness: mat === "metal" ? 0.45 : mat === "glass" ? 0.1 : 0.9, metalness: mat === "metal" ? 0.35 : 0, transparent: mat === "glass", opacity: mat === "glass" ? 0.45 : 1, side: THREE.DoubleSide });
  return new THREE.MeshStandardMaterial({ color: MATERIALS[mat]?.color ?? 0x8e8c86, roughness: 0.95, side: THREE.DoubleSide });
}
export function shapeMesh(rec) {
  if (rec.kind === "tunnel") return tunnelMesh(rec);
  const m = new THREE.Mesh(worldUV(shapeGeometry(rec)), shapeMaterial(rec.mat));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export class WorldLayer {
  constructor(host) { this.host = host; this.objects = new Map(); this.changed = new Map(); this.nextId = 1; this.data = null; }

  pose(node, rec) { node.position.set(rec.x, rec.y, rec.z); node.rotation.set(rec.rx || 0, rec.ry || 0, rec.rz || 0, rec.kind === "tunnel" ? "YXZ" : "XYZ"); if (rec.s) node.scale.setScalar(rec.s); node.updateMatrixWorld(true); }

  /** animate the placed pieces that move (copies of a hub's portals, trees, screens) */
  tick(t, dt) { for (const e of this.objects.values()) { const f = e.node.userData.tick; if (f) try { f(t, dt); } catch { e.node.userData.tick = null; } } }

  /** put one placed model or shape in the world. rec = { id?, zone, x, y, z, rx, ry, rz, s, src } or { kind, w, h, d, r, mat, ... } */
  async add(rec) {
    const zone = this.host.zone(rec.zone);
    if (!zone) return null;
    rec.id ??= this.nextId;
    this.nextId = Math.max(this.nextId, rec.id + 1);
    let node;
    if (rec.kind) { node = new THREE.Group(); node.add(shapeMesh(rec)); }
    else { try { node = await makeModel(rec.src, this.host.base); } catch (e) { console.warn("[world editor] model", rec.src, e?.message); return null; } }
    node.userData.worldId = rec.id;
    node.traverse((o) => { o.userData.worldId = rec.id; });
    this.pose(node, rec);
    zone.group.add(node);
    const entry = { rec, node, zone };
    this.objects.set(rec.id, entry);
    this._solid(entry);
    return entry;
  }
  _solid(entry) {
    const { rec, node, zone } = entry;
    if (entry.solid) { this.host.dropSolid(entry.solid); entry.solid = null; }
    const list = zone.sculpt.shapes, at = list.indexOf(rec);
    if (rec.kind === "tunnel") {                                     // it cuts the ground, and hides what of it sticks out of the ground
      node.updateMatrix();
      const t = zone.sculpt.setTunnel(rec, node.matrix), U = node.children[0]?.userData.tunnel;
      if (U) { U.uToZone.value.copy(node.matrix); tunnelHeights(zone.sculpt, t, U); }
      return;
    }
    if (rec.kind) { if (at < 0) list.push(rec); return; }          // you can stand on a shape
    entry.solid = this.host.addSolid(rec, node, zone);
  }
  remove(id) {
    const e = this.objects.get(id);
    if (!e) return;
    if (e.solid) this.host.dropSolid(e.solid);
    const list = e.zone.sculpt.shapes, at = list.indexOf(e.rec);
    if (at >= 0) list.splice(at, 1);
    if (e.rec.kind === "tunnel") e.zone.sculpt.dropTunnel(e.rec);
    e.zone.group.remove(e.node);
    if (e.rec.kind) e.node.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); o.userData.tunnel?.uHTex.value?.dispose(); } });
    this.objects.delete(id);
  }
  /** the placed thing has a new position, turn, size or look */
  set(id, values) {
    const e = this.objects.get(id);
    if (!e) return;
    Object.assign(e.rec, values);
    if (e.rec.kind && ["w", "h", "d", "r", "mat", "kind", "len", "shape"].some((k) => k in values)) { const m = e.node.children[0]; m.geometry.dispose(); m.material.dispose(); m.userData.tunnel?.uHTex.value?.dispose(); const n = shapeMesh(e.rec); m.userData.tunnel = n.userData.tunnel; m.geometry = n.geometry; m.material = n.material; m.userData.worldId = id; }
    this.pose(e.node, e.rec);
    this._solid(e);
  }

  dump() {
    const zones = {};
    for (const z of this.host.zones()) { const d = z.sculpt.dump(); if (d) zones[z.id] = d; }
    return { version: 1, zones, objects: [...this.objects.values()].map((e) => { const { lifted, ...rec } = e.rec; return rec; }), changed: [...this.changed] };
  }
  /** wipe everything changed, back to the world as it was made */
  wipe() {
    for (const id of [...this.objects.keys()]) this.remove(id);
    for (const z of this.host.zones()) z.sculpt.clear();
    for (const key of [...this.changed.keys()]) { this.host.existing?.restore(key); this.changed.delete(key); }
  }
  /** a saved world comes back */
  async apply(data) {
    if (!data?.version) return;
    for (const [id, d] of Object.entries(data.zones || {})) this.host.zone(id)?.sculpt.load(d);
    await Promise.all((data.objects || []).map((r) => this.add({ ...r })));
    for (const [key, change] of data.changed || []) { if (this.host.existing?.apply(key, change)) this.changed.set(key, change); }
  }
}
