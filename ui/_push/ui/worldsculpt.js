// worldsculpt.js - terraforming: a sparse height map laid over a world's own ground. Only the squares you've touched exist, so an untouched world costs nothing.
// Every brush changes this one surface, which is why whatever you add joins the ground and can be walked on. The world's own ground is cut away under touched squares,
// so digging really goes down. It is a height map: a sphere comes out as a dome on the ground. Tunnels (holes at an angle) are the one exception: they are
// pieces placed like platforms, and the ground's drawing is cut away inside them, so they can go into a slope sideways.
import * as THREE from "three";

export const MATERIALS = {
  grass: { label: "Grass", color: 0x6fa84a }, dirt: { label: "Dirt", color: 0x7a5636 }, sand: { label: "Sand", color: 0xe2cd8e }, stone: { label: "Stone", color: 0x8e8c86 },
  gravel: { label: "Gravel", color: 0xa59c8e }, clay: { label: "Clay", color: 0xb5694a }, snow: { label: "Snow", color: 0xf1f4f6 }, dark: { label: "Dark rock", color: 0x45424a },
};
export const MAT_IDS = Object.keys(MATERIALS);
const matIndex = (name) => Math.max(0, MAT_IDS.indexOf(name)) + 1;
/** a hole all the way through: nothing is drawn there, and the world's own ground is cut away too */
export const HOLE = 255, HOLE_DROP = 60;
export const HOLE_SHAPES = { circle: "Circle", square: "Square", diamond: "Diamond", triangle: "Triangle", star: "Star" };
/** is (u, v) inside the shape? u and v go from -1 to 1 across it */
export function inShape(shape, u, v) {
  if (shape === "square") return Math.abs(u) <= 1 && Math.abs(v) <= 1;
  if (shape === "diamond") return Math.abs(u) + Math.abs(v) <= 1;
  if (shape === "triangle") return v >= -0.5 && v <= 1 && Math.abs(u) <= (1 - v) * 0.5774;
  const r = Math.hypot(u, v);
  if (shape === "star") return r <= 0.5 + 0.5 * Math.max(0, Math.cos(5 * (Math.atan2(v, u) - Math.PI / 2))) ** 1.6;
  return r <= 1;
}
/** how far out the shape's edge is at this angle, for drawing it (every shape here is whole as seen from its middle) */
export function shapeEdge(shape, a) {
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (inShape(shape, Math.cos(a) * m, Math.sin(a) * m)) lo = m; else hi = m; }
  return lo;
}

/** tunnels: up to this many per part of the world cut the ground */
export const TUNNEL_MAX = 12;
const SHAPE_NO = { circle: 0, square: 1, diamond: 2, triangle: 3, star: 4 };
const GLSL_SHAPE = `bool weInShape(float s, vec2 p) {
  if (s < 0.5) return length(p) <= 1.0;
  if (s < 1.5) return max(abs(p.x), abs(p.y)) <= 1.0;
  if (s < 2.5) return abs(p.x) + abs(p.y) <= 1.0;
  if (s < 3.5) return p.y >= -0.5 && p.y <= 1.0 && abs(p.x) <= (1.0 - p.y) * 0.5774;
  return length(p) <= 0.5 + 0.5 * pow(max(0.0, cos(5.0 * (atan(p.y, p.x) - 1.5707963))), 1.6);
}`;
/** how far behind its mouth a tunnel still cuts, so a slope opens up cleanly around the entrance (in widths) */
export const TUNNEL_LEAD = 3;
/** is a point (in the tunnel's own frame: across in x and y, along +z) inside the tunnel? */
export function inTunnel(t, q, grow = 1) { return q.z >= -t.r * TUNNEL_LEAD && q.z <= t.len && inShape(t.shape, q.x / (t.r * grow), q.y / (t.r * grow)); }

const OFF = 16384, ROW = 32768, N = 32;
const K = (i, j) => (i + OFF) * ROW + (j + OFF), KI = (k) => Math.floor(k / ROW) - OFF, KJ = (k) => k % ROW - OFF;
const speck = (i, j) => { const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); };

const bytes = (typed) => { const u = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unbytes = (b64, Type) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Type(u.buffer); };

export class Sculpt {
  /** base(x, z): the world's own ground. baseColour(x, z, h, slope) -> THREE.Color. group: what the mesh hangs on. bounds: {x0, z0, x1, z1}. cut(): the meshes to cut holes in */
  constructor({ base, baseColour, group, bounds, cell = 0.5, cut = () => [] }) {
    Object.assign(this, { base, baseColour, group, cell, cut });
    this.h = new Map(); this.m = new Map(); this.chunks = new Map(); this.dirty = new Set(); this.shapes = []; this.log = null;
    const a = (v) => Math.floor(v / cell) * cell;
    this.box = { x0: a(bounds.x0), z0: a(bounds.z0) }; this.w = Math.min(2048, Math.ceil((bounds.x1 - this.box.x0) / cell)); this.d = Math.min(2048, Math.ceil((bounds.z1 - this.box.z0) / cell));
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    this.cutDone = [];
    this.tunnels = []; this.tun = new Map(); this.forced = new Map();
    this.tunU = { uTun: { value: Array.from({ length: TUNNEL_MAX }, () => new THREE.Matrix4()) }, uTunP: { value: Array.from({ length: TUNNEL_MAX }, () => new THREE.Vector4(0, 1, 0, 0)) }, uTunN: { value: 0 } };
    this.mat.onBeforeCompile = (s) => {                     // the ground isn't drawn inside a tunnel
      Object.assign(s.uniforms, this.tunU);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSculptP;").replace("#include <project_vertex>", "#include <project_vertex>\nvSculptP = transformed;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vSculptP; uniform mat4 uTun[${TUNNEL_MAX}]; uniform vec4 uTunP[${TUNNEL_MAX}]; uniform int uTunN;\n${GLSL_SHAPE}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\nfor (int i = 0; i < ${TUNNEL_MAX}; i++) { if (i >= uTunN) break; vec3 q = (uTun[i] * vec4(vSculptP, 1.0)).xyz; vec4 P = uTunP[i]; if (q.z >= -P.y * ${TUNNEL_LEAD}.0 && q.z <= P.z && weInShape(P.x, q.xy / P.y)) discard; }`);
    };
    this.mat.customProgramCacheKey = () => "worldsculpt-tunnels";
  }

  get empty() { return !this.h.size && !this.m.size; }
  _hv(i, j) { const v = this.h.get(K(i, j)); return v !== undefined ? v : this.base(i * this.cell, j * this.cell); }

  /** the surface here, or null where nothing has been changed */
  gridAt(x, z) {
    const c = this.cell, fi = x / c, fj = z / c, i = Math.floor(fi), j = Math.floor(fj), H = this.h;
    if (!H.has(K(i, j)) && !H.has(K(i + 1, j)) && !H.has(K(i, j + 1)) && !H.has(K(i + 1, j + 1))) return null;
    const u = fi - i, v = fj - j;
    if (u + v <= 1) { const a = this._hv(i, j); return a + (this._hv(i + 1, j) - a) * u + (this._hv(i, j + 1) - a) * v; }
    const d = this._hv(i + 1, j + 1); return d + (this._hv(i, j + 1) - d) * (1 - u) + (this._hv(i + 1, j) - d) * (1 - v);
  }
  /** the top of a placed shape (platform, round, ramp, stairs, sphere) here, or null. One being dragged (lifted) doesn't count */
  _shapeTop(x, z) {
    let top = null;
    for (const s of this.shapes) {
      if (s.lifted) continue;
      const t = shapeTopAt(s, x, z);
      if (t !== null && (top === null || t > top)) top = t;
    }
    return top;
  }
  /** what you stand on here, or null where this world's own ground still decides */
  at(x, z, near = null) {
    const tf = this.tunnels.length ? this.tunnelFloor(x, z, near) : null;
    if (tf !== null) return tf;
    const g = this.gridAt(x, z);
    if (!this.shapes.length) return g;
    const t = this._shapeTop(x, z);
    return t === null ? g : Math.max(g ?? this.base(x, z), t);
  }
  /** always a height */
  surface(x, z) { return this.gridAt(x, z) ?? this.base(x, z); }

  // ---------------- tunnels ----------------
  /** a tunnel was placed, moved, turned or resized. rec = { shape, r, len }, matrix = its frame in this sculpt's space */
  setTunnel(rec, matrix) {
    const old = this.tun.get(rec); if (old) this._force(old.cells, -1);
    const inv = matrix.clone().invert(), t = { shape: rec.shape || "circle", r: Math.max(0.2, rec.r || 1), len: Math.max(0.5, rec.len || 6), m: matrix.clone(), inv };
    t.cells = this._tunnelCells(t);
    this.tun.set(rec, t);
    if (!this.tunnels.includes(rec)) this.tunnels.push(rec);
    this._force(t.cells, 1);
    this._tunnelUniforms();
    this.flush();
    return t;
  }
  dropTunnel(rec) {
    const at = this.tunnels.indexOf(rec);
    if (at < 0) return;
    this.tunnels.splice(at, 1);
    const t = this.tun.get(rec); if (t) this._force(t.cells, -1);
    this.tun.delete(rec);
    this._tunnelUniforms();
    this.flush();
  }
  _tunnelUniforms() {
    const U = this.tunU, list = this.tunnels.slice(0, TUNNEL_MAX);
    list.forEach((rec, i) => { const t = this.tun.get(rec); U.uTun.value[i].copy(t.inv); U.uTunP.value[i].set(SHAPE_NO[t.shape] ?? 0, t.r, t.len, 0); });
    U.uTunN.value = list.length;
  }
  /** the squares where a tunnel meets the ground: they are drawn by this sculpt, so its cut shows (and the world's own ground there is hidden) */
  _tunnelCells(t) {
    const c = this.cell, r = t.r * 1.6, out = [], q = new THREE.Vector3(), box = new THREE.Box3();
    for (const x of [-r, r]) for (const y of [-r, r]) for (const z of [-t.r * TUNNEL_LEAD, t.len]) box.expandByPoint(q.set(x, y, z).applyMatrix4(t.m));
    const ox = Math.round(this.box.x0 / c), oz = Math.round(this.box.z0 / c);
    const i0 = Math.max(ox + 1, Math.floor(box.min.x / c)), i1 = Math.min(ox + this.w - 2, Math.ceil(box.max.x / c)), j0 = Math.max(oz + 1, Math.floor(box.min.z / c)), j1 = Math.min(oz + this.d - 2, Math.ceil(box.max.z / c));
    if ((i1 - i0) * (j1 - j0) > 400000) return out;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const y = this._hv(i, j);
      if (inTunnel(t, q.set(i * c, y, j * c).applyMatrix4(t.inv), 1.6)) out.push(K(i, j));
    }
    return out;
  }
  _force(cells, by) {
    for (const k of cells) {
      const n = (this.forced.get(k) || 0) + by;
      if (n > 0) this.forced.set(k, n); else this.forced.delete(k);
      const i = KI(k), j = KJ(k);
      for (const a of [i - 1, i]) for (const b of [j - 1, j]) this.dirty.add(`${Math.floor(a / N)},${Math.floor(b / N)}`);
    }
  }
  /** the floor of a tunnel under this spot, or null. near: the height you're at now (inside a tunnel you walk on its floor, not the hill above) */
  tunnelFloor(x, z, near = null) {
    if (!this.tunnels.length) return null;
    const ground = this.surface(x, z), q = new THREE.Vector3();
    let best = null;
    for (const rec of this.tunnels) {
      const t = this.tun.get(rec); if (!t || rec.lifted) continue;          // one being dragged isn't the ground it slides on
      const inside = (y) => inTunnel(t, q.set(x, y, z).applyMatrix4(t.inv));
      for (const start of near === null ? [ground - 0.01] : [near + 0.5, ground - 0.01]) {
        if (!inside(start)) continue;
        let y = start, step = Math.max(0.05, t.r / 8), n = 0;
        while (inside(y - step) && n++ < 2000) y -= step;
        let lo = y - step, hi = y;
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; }
        if (hi < ground && (best === null || hi > best)) best = hi;          // only where it's really under the ground
        break;
      }
    }
    return best;
  }
  /** the height here before this stroke began, so a held brush doesn't climb on its own work */
  beforeAt(x, z) { const c = this.cell, k = K(Math.round(x / c), Math.round(z / c)); if (this.log?.has(k)) { const v = this.log.get(k)[0]; return v !== undefined ? v : this.base(x, z); } return this.surface(x, z); }

  _touch(k, h, m) {
    if (this.log && !this.log.has(k)) this.log.set(k, [this.h.get(k), this.m.get(k)]);
    if (h === undefined) this.h.delete(k); else this.h.set(k, h);
    if (m === undefined) this.m.delete(k); else this.m.set(k, m);
    const i = KI(k), j = KJ(k);
    for (const a of [i - 1, i]) for (const b of [j - 1, j]) this.dirty.add(`${Math.floor(a / N)},${Math.floor(b / N)}`);
  }
  _each(x, z, r, fn) {
    const c = this.cell, ox = Math.round(this.box.x0 / c), oz = Math.round(this.box.z0 / c);
    const i0 = Math.max(ox + 1, Math.floor((x - r) / c)), i1 = Math.min(ox + this.w - 2, Math.ceil((x + r) / c)), j0 = Math.max(oz + 1, Math.floor((z - r) / c)), j1 = Math.min(oz + this.d - 2, Math.ceil((z + r) / c));      // stays inside the map of what's been touched
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const d = Math.hypot(i * c - x, j * c - z); if (d <= r) fn(i, j, d); }
  }
  /** pencil: a sphere of a material, centred on the point. Whatever sticks up above the ground becomes ground */
  addSphere(x, y, z, r, mat) { const id = matIndex(mat); this._each(x, z, r, (i, j, d) => { const top = y + Math.sqrt(r * r - d * d); if (top > this._hv(i, j)) this._touch(K(i, j), top, id); }); }
  /** eraser: a sphere taken out */
  carveSphere(x, y, z, r) { this._each(x, z, r, (i, j, d) => { const low = y - Math.sqrt(r * r - d * d), k = K(i, j); if (low < this._hv(i, j)) this._touch(k, low, this.m.get(k) ?? matIndex("dirt")); }); }
  /** flatten: everything under the brush comes to one height */
  flatten(x, z, r, to, mat = null) { const id = mat ? matIndex(mat) : null; this._each(x, z, r, (i, j, d) => { const k = K(i, j), blend = d < r * 0.7 ? 1 : 1 - (d - r * 0.7) / (r * 0.3), now = this._hv(i, j); if (Math.abs(now - to) > 1e-3) this._touch(k, now + (to - now) * blend, id ?? this.m.get(k)); }); }
  smooth(x, z, r) { const next = []; this._each(x, z, r, (i, j) => { next.push([i, j, (this._hv(i - 1, j) + this._hv(i + 1, j) + this._hv(i, j - 1) + this._hv(i, j + 1) + this._hv(i, j) * 2) / 6]); }); for (const [i, j, v] of next) this._touch(K(i, j), v, this.m.get(K(i, j))); }
  paint(x, z, r, mat) { const id = matIndex(mat); this._each(x, z, r, (i, j) => { const k = K(i, j); if (this.m.get(k) !== id) this._touch(k, this.h.get(k), id); }); }
  /** a hole in a shape: dug `depth` metres down with straight sides, or (through) all the way, so there's nothing there at all. turn: the shape's angle */
  hole(x, z, r, shape, depth, through, turn = 0) {
    const c = Math.cos(turn), n = Math.sin(turn);
    this._each(x, z, r * 1.5, (i, j) => {
      const dx = i * this.cell - x, dz = j * this.cell - z, u = (dx * c + dz * n) / r, v = (-dx * n + dz * c) / r;
      if (!inShape(shape, u, v)) return;
      const k = K(i, j), now = this._hv(i, j), id = this.m.get(k);
      if (id === HOLE) return;
      const base = this.log?.has(k) ? (this.log.get(k)[0] ?? this.base(i * this.cell, j * this.cell)) : now;
      if (through) this._touch(k, base - HOLE_DROP, HOLE);
      else { const low = base - depth; if (low < now) this._touch(k, low, id ?? matIndex("dirt")); }
    });
  }
  /** back to the world's own ground under the brush */
  restore(x, z, r) { this._each(x, z, r, (i, j) => { const k = K(i, j); if (this.h.has(k) || this.m.has(k)) this._touch(k, undefined, undefined); }); }

  begin() { this.log = new Map(); }
  end() { const before = this.log; this.log = null; if (!before?.size) return null; const after = new Map(); for (const k of before.keys()) after.set(k, [this.h.get(k), this.m.get(k)]); return { before, after }; }
  put(changes) { for (const [k, [h, m]] of changes) this._touch(k, h, m); this.flush(); }

  _mask() {
    if (this.maskTex) return;
    this.maskData = new Uint8Array(this.w * this.d);
    this.maskTex = new THREE.DataTexture(this.maskData, this.w, this.d, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = this.maskTex.minFilter = THREE.NearestFilter;
    this.uniforms = { uHoleMap: { value: this.maskTex }, uHoleBox: { value: new THREE.Vector4(this.box.x0, this.box.z0, 1 / (this.w * this.cell), 1 / (this.d * this.cell)) } };
    this.group.updateWorldMatrix(true, false);
    const toSculpt = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    for (const mesh of this.cut()) {
      if (!mesh?.material || Array.isArray(mesh.material)) continue;
      mesh.updateWorldMatrix(true, false);
      const orig = mesh.material, m = orig.clone(), U = { ...this.uniforms, uHoleLocal: { value: toSculpt.clone().multiply(mesh.matrixWorld) } };
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, U);
        s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vHoleXZ; uniform mat4 uHoleLocal;").replace("#include <project_vertex>", "#include <project_vertex>\nvHoleXZ = (uHoleLocal * vec4(transformed, 1.0)).xz;");
        s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vHoleXZ; uniform sampler2D uHoleMap; uniform vec4 uHoleBox;").replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (texture2D(uHoleMap, (vHoleXZ - uHoleBox.xy) * uHoleBox.zw).r > 0.5) discard;");
      };
      m.customProgramCacheKey = () => "worldsculpt-hole";
      mesh.material = m;
      this.cutDone.push([mesh, orig, m]);
    }
  }
  /** redraw whatever changed */
  flush() {
    if (!this.dirty.size) return;
    this._mask();
    const c = this.cell, H = this.h, M = this.m, col = new THREE.Color();
    for (const name of this.dirty) {
      const [cx, cz] = name.split(",").map(Number), pos = [], rgb = [];
      const vertex = (i, j) => {
        const h = this._hv(i, j), id = M.get(K(i, j));
        pos.push(i * c, h, j * c);
        if (id && id !== HOLE) { col.setHex(MATERIALS[MAT_IDS[id - 1]].color); const n = 0.92 + speck(i, j) * 0.16; rgb.push(col.r * n, col.g * n, col.b * n); }
        else { const sl = Math.abs(this._hv(i + 1, j) - this._hv(i - 1, j)) / (2 * c), o = this.baseColour(i * c, j * c, h, sl); rgb.push(o.r, o.g, o.b); }
      };
      const open = (i, j) => M.get(K(i, j)) !== HOLE;
      const F = this.forced, has = (k) => H.has(k) || M.has(k) || F.has(k);
      for (let i = cx * N; i < (cx + 1) * N; i++) for (let j = cz * N; j < (cz + 1) * N; j++) {
        const on = has(K(i, j)) || has(K(i + 1, j)) || has(K(i, j + 1)) || has(K(i + 1, j + 1));
        const tx = Math.round((i * c - this.box.x0) / c), tz = Math.round((j * c - this.box.z0) / c);
        if (tx >= 0 && tz >= 0 && tx < this.w && tz < this.d) this.maskData[tx + tz * this.w] = on ? 255 : 0;
        if (!on) continue;
        if (open(i, j) && open(i, j + 1) && open(i + 1, j)) { vertex(i, j); vertex(i, j + 1); vertex(i + 1, j); }          // a hole has no ground drawn
        if (open(i + 1, j) && open(i, j + 1) && open(i + 1, j + 1)) { vertex(i + 1, j); vertex(i, j + 1); vertex(i + 1, j + 1); }
      }
      let mesh = this.chunks.get(name);
      if (!pos.length) { if (mesh) { this.group.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(name); } continue; }
      if (!mesh) { mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = true; mesh.userData.always = true; mesh.userData.sculpt = true; this.group.add(mesh); this.chunks.set(name, mesh); }
      mesh.geometry.dispose(); mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      mesh.geometry.computeVertexNormals();
    }
    this.maskTex.needsUpdate = true;
    this.dirty.clear();
  }

  clear() { for (const k of [...this.h.keys(), ...this.m.keys()]) this._touch(k, undefined, undefined); this.flush(); }
  dump() {
    if (this.empty) return null;
    return { cell: this.cell, hk: bytes(Int32Array.from(this.h.keys())), hv: bytes(Float32Array.from(this.h.values())), mk: bytes(Int32Array.from(this.m.keys())), mv: bytes(Uint8Array.from(this.m.values())) };
  }
  load(d) {
    if (!d || d.cell !== this.cell) return;
    const hk = unbytes(d.hk, Int32Array), hv = unbytes(d.hv, Float32Array), mk = unbytes(d.mk, Int32Array), mv = unbytes(d.mv, Uint8Array);
    for (let i = 0; i < hk.length; i++) { this.h.set(hk[i], hv[i]); this.dirty.add(`${Math.floor(KI(hk[i]) / N)},${Math.floor(KJ(hk[i]) / N)}`); for (const a of [-1, 0]) for (const b of [-1, 0]) this.dirty.add(`${Math.floor((KI(hk[i]) + a) / N)},${Math.floor((KJ(hk[i]) + b) / N)}`); }
    for (let i = 0; i < mk.length; i++) { this.m.set(mk[i], mv[i]); for (const a of [-1, 0]) for (const b of [-1, 0]) this.dirty.add(`${Math.floor((KI(mk[i]) + a) / N)},${Math.floor((KJ(mk[i]) + b) / N)}`); }
    this.flush();
  }
  dispose() {
    for (const m of this.chunks.values()) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    for (const [mesh, orig, m] of this.cutDone) { mesh.material = orig; m.dispose(); }
    this.cutDone = [];
    this.maskTex?.dispose(); this.mat.dispose();
  }
}

/** the walkable top of one placed shape at (x, z), or null when (x, z) isn't over it */
export function shapeTopAt(s, x, z) {
  const dx = x - s.x, dz = z - s.z;
  if (s.kind === "sphere") { const q = s.r * s.r - dx * dx - dz * dz; return q > 0 ? s.y + Math.sqrt(q) : null; }
  const c = Math.cos(s.ry || 0), n = Math.sin(s.ry || 0), a = dx * c - dz * n, b = dx * n + dz * c;
  if (s.kind === "cylinder") return Math.hypot(a / (s.w / 2), b / (s.d / 2)) <= 1 ? s.y + s.h / 2 : null;
  if (Math.abs(a) > s.w / 2 || Math.abs(b) > s.d / 2) return null;
  const along = Math.min(1, Math.max(0, b / s.d + 0.5)), low = s.y - s.h / 2;      // ramps and stairs rise towards their back (+z)
  if (s.kind === "ramp") return low + s.h * along;
  if (s.kind === "stairs") { const steps = stairCount(s); return low + s.h * Math.min(steps, Math.floor(along * steps) + 1) / steps; }
  return s.y + s.h / 2;
}
export const stairCount = (s) => Math.max(2, Math.min(40, Math.round(s.h / 0.22)));
