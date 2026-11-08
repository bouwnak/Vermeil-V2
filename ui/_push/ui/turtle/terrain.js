// terrain.js - a turtle: the land on its shell, and the animal under it. Any entry of ISLANDS in data.js becomes one.
import * as THREE from "three";
import { carve, wetness } from "./waters.js";

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function value(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), f = x - xi, g = z - zi, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
export const fbm = (x, z) => value(x, z) * 0.55 + value(x * 2.1, z * 2.1) * 0.3 + value(x * 4.3, z * 4.3) * 0.15;
const STEP = 6.5;                                         // the height of one level of land

const segDist = (x, z, r) => {                             // how far a point is from a road, and how far along it
  const [ax, az] = r.from, [bx, bz] = r.to, vx = bx - ax, vz = bz - az, u = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
  return [Math.hypot(x - ax - vx * u, z - az - vz * u), u];
};

export class Land {
  constructor(cfg) { this.cfg = cfg; }

  /** the shape of the land at a point in this turtle's own space; below 0 is under the sea */
  height(x, z) {
    const { a, b, seed, peaks, flats, roads = [] } = this.cfg;
    const wobble = (fbm(x * 0.012 + seed, z * 0.012 - seed) - 0.5) * 0.2;
    const r = Math.hypot(x / a, z / b) + wobble, edge = 1 - r;
    let y = 0;
    if (edge < 0) y = Math.max(-14, edge * 46);
    else {
      const raw = 3.2 + smooth(0.04, 0.62, edge) * (6 + fbm(x * 0.02 + seed, z * 0.02) * 15);
      const q = raw / STEP, f = q - Math.floor(q);
      let land = (Math.floor(q) + smooth(0.38, 0.62, f)) * STEP;    // levels with cliffs between them, not one smooth hill
      for (const [px, pz, h, w] of peaks) land += h * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (w * w)) * (0.8 + fbm(x * 0.05, z * 0.05) * 0.4);
      for (const fl of flats) {
        if (fl.pier) continue;
        const d = Math.hypot(x - fl.x, z - fl.z) + (fbm(x * 0.06 + seed, z * 0.06) - 0.5) * fl.r * 0.16;
        land = fl.wall ? lerp(fl.h, land, smooth(fl.r * 0.97, fl.r * 1.06, d)) : lerp(fl.h, land, smooth(fl.r * 0.78, fl.r * 1.14, d));
      }
      for (const road of roads) {
        const [d, u] = segDist(x, z, road);
        if (d < road.w * 1.5) land = lerp(lerp(road.from[2], road.to[2], u), land, smooth(road.w * 0.75, road.w * 1.5, d));
      }
      y = lerp(edge * 46, land, smooth(0.015, 0.1, edge));
    }
    for (const fl of flats) if (fl.pier) y = lerp(fl.h, y, smooth(fl.r * 0.75, fl.r * 1.05, Math.hypot(x - fl.x, z - fl.z)));     // a headland: reaches past the shore
    for (const road of roads) if (road.pier) { const [d, u] = segDist(x, z, road); if (d < road.w * 1.5) y = lerp(lerp(road.from[2], road.to[2], u), y, smooth(road.w * 0.75, road.w * 1.5, d)); }
    if (this.cfg.waters) y = carve(this.cfg.waters, x, z, y);          // river beds and ponds (waters.js)
    return y;
  }

  /** the ground you actually see: the faceted mesh itself, so nothing floats or sinks into it */
  ground(x, z) {
    if (this.sculpt) { const y = this.sculpt.at(x, z); if (y !== null) return y; }       // terraformed in the world editor
    return this.baseGround(x, z);
  }
  baseGround(x, z) {
    const g = this.grid;
    if (!g) return this.height(x, z);
    const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
    if (i < 1 || j < 1 || i > g.nx - 3 || j > g.nz - 3) return -14;
    const n = g.nx, { jx, jz, hh } = g;
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const A = a + b * n, B = a + 1 + b * n, C = a + 1 + (b + 1) * n, D = a + (b + 1) * n;
      for (const [p, q, r] of [[A, D, B], [B, D, C]]) {
        const d = (jz[q] - jz[r]) * (jx[p] - jx[r]) + (jx[r] - jx[q]) * (jz[p] - jz[r]);
        const u = ((jz[q] - jz[r]) * (x - jx[r]) + (jx[r] - jx[q]) * (z - jz[r])) / d, v = ((jz[r] - jz[p]) * (x - jx[r]) + (jx[p] - jx[r]) * (z - jz[r])) / d;
        if (u >= -1e-4 && v >= -1e-4 && u + v <= 1.0001) return u * hh[p] + v * hh[q] + (1 - u - v) * hh[r];
      }
    }
    return this.height(x, z);
  }

  /** how much the ground rises and falls over a square of half-size d */
  rough(x, z, d = 1) {
    let lo = 1e9, hi = -1e9;
    for (const [p, q] of [[0, 0], [d, d], [-d, d], [d, -d], [-d, -d], [d, 0], [-d, 0], [0, d], [0, -d]]) { const h = this.ground(x + p, z + q); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return hi - lo;
  }

  /** on one of the roads, or one of the trails worn across the turtle? */
  onRoad(x, z) { return (this.cfg.roads || []).some((r) => segDist(x, z, r)[0] < r.w) || this.onTrail(x, z); }
  onTrail(x, z, pad = 0) {
    const grid = this.trailGrid();
    for (const r of grid.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) || []) if (segDist(x, z, r)[0] < r.w + pad) return true;
    return false;
  }
  trailGrid() {
    if (this._grid) return this._grid;
    const grid = this._grid = new Map();
    for (const r of this.trails().segs) {
      const pad = r.w + 2, x0 = Math.floor((Math.min(r.from[0], r.to[0]) - pad) / 8), x1 = Math.floor((Math.max(r.from[0], r.to[0]) + pad) / 8), z0 = Math.floor((Math.min(r.from[1], r.to[1]) - pad) / 8), z1 = Math.floor((Math.max(r.from[1], r.to[1]) + pad) / 8);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; (grid.get(k) || grid.set(k, []).get(k)).push(r); }
    }
    return grid;
  }
  /** footpaths: a few clean dirt trails from the middle of the turtle (or the edge of its town and fields) straight out to its shores, like the
   *  spokes of a wheel. Each heads for its shore in a straight line and only turns where it must to get round a cliff, a pond or a field, then
   *  straightens out again; the line is then pulled taut so it reads as a few long straight runs with gentle bends, never a wiggle. Worked out
   *  from the land itself, so they're the same every time. lines: [[x, z], ...] */
  trails() {
    if (this._trails) return this._trails;
    const cfg = this.cfg, { a, b, seed } = cfg, lines = [], segs = [];
    this._trails = { lines, segs };
    if (cfg.noTrails) return this._trails;
    const keep = (cfg.clear || []).map((i) => cfg.flats[i]).filter((f) => f && !f.pier);
    const inKeep = (x, z) => keep.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 1.05);
    const hub0 = cfg.flats?.[0] && !cfg.flats[0].pier ? cfg.flats[0] : { x: 0, z: 0, r: 8 };
    const roadNear = (x, z) => (cfg.roads || []).some((r) => !r.street && segDist(x, z, r)[0] < r.w + 8);
    const h = (i, j = 0) => hash(i * 3.17 + seed * 0.7, j * 5.3 + seed * 1.3);
    const ok = (x, z, from) => { const y = this.height(x, z); return y > 3.8 && !inKeep(x, z) && Math.abs(y - from) < 2.4 && Math.hypot(x / a, z / b) < 0.88; };
    /** keep only the corners that matter (Ramer-Douglas-Peucker): a path within `tol` of a straight line becomes that line */
    const taut = (pts, tol) => {
      if (pts.length < 3) return pts;
      const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
      let far = 0, at = 0;
      for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], { from: [ax, az], to: [bx, bz] })[0]; if (d > far) { far = d; at = i; } }
      if (far < tol) return [pts[0], pts[pts.length - 1]];
      return [...taut(pts.slice(0, at + 1), tol).slice(0, -1), ...taut(pts.slice(at), tol)];
    };
    const walk = (x, z, ang, steps, w) => {
      const pts = [[x, z]]; let heading = ang;
      for (let s = 0; s < steps; s++) {
        heading += Math.atan2(Math.sin(ang - heading), Math.cos(ang - heading)) * 0.5;      // always straightening back toward the shore it set out for
        const y0 = this.height(x, z);
        let moved = false;
        for (const turn of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2]) {
          const nx = x + Math.cos(heading + turn) * 3, nz = z + Math.sin(heading + turn) * 3;
          if (!ok(nx, nz, y0)) continue;
          heading += turn; x = nx; z = nz; moved = true; break;
        }
        if (!moved) break;
        pts.push([x, z]);
      }
      if (pts.length < 8) return;
      const line = taut(pts, 2.2);
      // a taut line can cut a corner over a cliff: put back the walked points along any straight run that would climb too steeply
      const out = [line[0]];
      for (let i = 1; i < line.length; i++) {
        const [px, pz] = out[out.length - 1], [qx, qz] = line[i], n = Math.ceil(Math.hypot(qx - px, qz - pz) / 3);
        let steep = false;
        for (let k = 1; k <= n && !steep; k++) steep = Math.abs(this.height(px + (qx - px) * k / n, pz + (qz - pz) * k / n) - this.height(px + (qx - px) * (k - 1) / n, pz + (qz - pz) * (k - 1) / n)) > 2.6;
        if (steep) { const i0 = pts.findIndex((p) => p[0] === px && p[1] === pz), i1 = pts.findIndex((p) => p[0] === qx && p[1] === qz); out.push(...pts.slice(i0 + 1, i1 + 1)); } else out.push(line[i]);
      }
      lines.push({ pts: out, w }); for (let i = 1; i < out.length; i++) segs.push({ from: out[i - 1], to: out[i], w });
    };
    // five or six spokes, evenly round, skipping any that would run alongside one of the roads
    const n = a > 200 ? 6 : 5;
    for (let k = 0; k < n; k++) {
      const ang = k / n * Math.PI * 2 + h(0) * 1.2, start = cfg.hubR ? cfg.hubR + 3 : (keep.length ? hub0.r * 1.1 : hub0.r * 0.9) + 6;
      const x = hub0.x + Math.cos(ang) * start, z = hub0.z + Math.sin(ang) * start;
      if (roadNear(x + Math.cos(ang) * 20, z + Math.sin(ang) * 20)) continue;
      walk(x, z, ang, Math.round(a * 1.1 / 3), 1.9);
    }
    return this._trails;
  }

  colour(h, slope, x, z, out, winter) {
    const p = this.cfg.palette, c = new THREE.Color();
    const n = fbm(x * 0.08, z * 0.08);
    if (h < 3.4) c.setHex(p.sand);
    else if (this.cfg.waters && wetness(this.cfg.waters, x, z) < 0.3 && slope < 0.95) c.setHex(p.low).lerp(new THREE.Color(0x8a8270), 0.45).offsetHSL(0, -0.04, (n - 0.5) * 0.1 - 0.04);     // wet pebbly banks
    else if (slope > 0.95) c.setHex(p.high).offsetHSL(0, 0, (n - 0.5) * 0.12);
    else if (h > 34) c.setHex(p.snow);
    else if (winter) c.setHex(p.snow).offsetHSL(0, 0, -n * 0.05);
    else c.setHex(h > 16 ? p.mid : p.low).offsetHSL((n - 0.5) * 0.04, 0, (n - 0.5) * 0.08);
    out.push(c.r, c.g, c.b);
  }

  /** the roads, laid over the ground as one smooth worn strip each instead of painted onto its big facets (which gave them saw-tooth edges):
   *  a soft edge that wanders a little, paler down the middle where feet go. Call after mesh(), so it follows the ground you see */
  roadsMesh(winter = false) {
    const roads = this.cfg.roads || [], pos = [], col = [], idx = [], base = new THREE.Color(winter ? 0xd9d2c4 : this.cfg.palette.path ?? 0xd8b98a), c = new THREE.Color();
    const ACROSS = [-1, -0.6, -0.2, 0.2, 0.6, 1];
    for (const r of roads) {
      const [ax, az] = r.from, [bx, bz] = r.to, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, n = Math.max(2, Math.ceil(len / 1.2)), start = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const u = i / n, cx = ax + (bx - ax) * u, cz = az + (bz - az) * u, ends = Math.min(1, Math.min(u, 1 - u) * len / 2.5);
        const half = r.w * 0.62 * (0.88 + fbm(cx * 0.21 + 7, cz * 0.21) * 0.3) * (0.55 + 0.45 * ends);
        for (const k of ACROSS) {
          const x = cx - dz * half * k, z = cz + dx * half * k, wear = 1 - Math.abs(k);
          pos.push(x, this.ground(x, z) + 0.09, z);
          c.copy(base).offsetHSL(0, 0, (fbm(x * 0.5, z * 0.5) - 0.5) * 0.06 + wear * 0.05 - (1 - wear) * 0.04);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < ACROSS.length - 1; j++) {
        const a = start + i * ACROSS.length + j, b = a + ACROSS.length;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    // the trails: one strip down each whole line, so its bends are smooth, narrowing to nothing at its ends
    const dirt = new THREE.Color(winter ? 0xd9d2c4 : this.cfg.palette.path ?? 0xd8b98a).offsetHSL(0, -0.04, -0.05);
    for (const { pts, w } of this.trails().lines) {
      const fine = [];
      for (let i = 0; i < pts.length - 1; i++) { const m = Math.max(2, Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 1.2)); for (let t = 0; t < m; t++) { const u = t / m; fine.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]); } }
      fine.push(pts[pts.length - 1]);
      for (let pass = 0; pass < 4; pass++) for (let i = 1; i < fine.length - 1; i++) fine[i] = [(fine[i - 1][0] + fine[i][0] * 2 + fine[i + 1][0]) / 4, (fine[i - 1][1] + fine[i][1] * 2 + fine[i + 1][1]) / 4];
      const start = pos.length / 3, n = fine.length;
      for (let i = 0; i < n; i++) {
        const [cx, cz] = fine[i], [px, pz] = fine[Math.max(0, i - 1)], [qx, qz] = fine[Math.min(n - 1, i + 1)], len = Math.hypot(qx - px, qz - pz) || 1, dx = (qx - px) / len, dz = (qz - pz) / len;
        const ends = Math.min(1, Math.min(i, n - 1 - i) / 6), half = w * (0.95 + fbm(cx * 0.3 + 3, cz * 0.3) * 0.12) * (0.25 + 0.75 * ends);
        for (const k of ACROSS) {
          const x = cx - dz * half * k, z = cz + dx * half * k, wear = 1 - Math.abs(k);
          pos.push(x, this.ground(x, z) + 0.08, z);
          c.copy(dirt).offsetHSL(0, 0, (fbm(x * 0.7, z * 0.7) - 0.5) * 0.08 + wear * 0.04 - (1 - wear) * 0.05);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < ACROSS.length - 1; j++) { const a = start + i * ACROSS.length + j, b = a + ACROSS.length; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    return m;
  }

  /** the land as a faceted mesh; its corners are kept, so the ground under your feet is exactly what's drawn */
  mesh(cell = 3, winter = false) {
    const { a, b } = this.cfg, pos = [], col = [], x0 = -a * 1.2, z0 = -b * 1.2, nx = Math.ceil(a * 2.4 / cell) + 2, nz = Math.ceil(b * 2.4 / cell) + 2;
    const jx = new Float32Array(nx * nz), jz = new Float32Array(nx * nz), hh = new Float32Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const p = x0 + i * cell, q = z0 + j * cell, k = i + j * nx;                                     // no visible grid
      jx[k] = p + (hash(p, q) - 0.5) * cell * 0.5; jz[k] = q + (hash(q, p) - 0.5) * cell * 0.5;
      hh[k] = this.height(jx[k], jz[k]);
    }
    this.grid = { x0, z0, cell, nx, nz, jx, jz, hh };
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nz - 1; j++) {
      if (Math.hypot((x0 + (i + 0.5) * cell) / a, (z0 + (j + 0.5) * cell) / b) > 1.22) continue;
      const A = i + j * nx, B = i + 1 + j * nx, C = i + 1 + (j + 1) * nx, D = i + (j + 1) * nx;
      for (const tri of [[A, D, B], [B, D, C]]) {
        const ys = tri.map((k) => hh[k]), top = Math.max(...ys);
        if (top < -3) continue;
        const slope = (top - Math.min(...ys)) / cell, mid = (ys[0] + ys[1] + ys[2]) / 3, face = [];
        this.colour(mid, slope, jx[tri[0]], jz[tri[0]], face, winter);
        tri.forEach((k) => { pos.push(jx[k], hh[k], jz[k]); col.push(...face); });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

function blob(rx, ry, rz, color, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = 1 + (hash(p.getX(i) * 9, p.getY(i) * 9 + p.getZ(i) * 5) - 0.5) * 0.08;
    p.setXYZ(i, p.getX(i) * rx * n, p.getY(i) * ry * n, p.getZ(i) * rz * n);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
  m.castShadow = true;
  return m;
}

/** The animal: it lives under the land, its head at +x. The model is its own file */
export { makeTurtle } from "./turtlemodel.js";

/** The sea: a soft low-poly swell. Slightly see-through, so the great shape of the turtle shows under it. */
export const SEA = { value: 0 };                            // the tide clock, shared by the sea and every shore

export function makeOcean() {
  const g = new THREE.PlaneGeometry(2600, 2600, 110, 110).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x53d6c6, transparent: true, opacity: 0.8, roughness: 0.35, metalness: 0.05, flatShading: true });
  const uniforms = { uT: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = uniforms.uT;
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        transformed.y += sin(wp.x * .035 + uT * .9) * .62 + cos(wp.z * .05 + uT * .7) * .5 + sin((wp.x + wp.z) * .11 + uT * 1.5) * .26 + sin((wp.x - wp.z * .6) * .23 + uT * 2.1) * .1;`);
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  // past the swell, the sea goes on flat to the horizon, so a turtle a long way off sits in water too instead of standing on its shell in the sky
  const far = new THREE.Mesh(new THREE.RingGeometry(1240, 14000, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x53d6c6, transparent: true, opacity: 0.88, roughness: 0.4, flatShading: true }));
  far.position.y = -0.15; m.add(far);
  m.userData.tick = (t) => { uniforms.uT.value = t; SEA.value = t; };
  return m;
}

/** the white collar of foam where the land meets the sea */
export function makeFoam(cfg, land) {
  const { a, b } = cfg, pts = [], outer = [], N = 120;
  for (let i = 0; i <= N; i++) {
    const t = (i % N) / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    let k = 1.3;
    while (k > 0.5 && land.height(c * a * k, s * b * k) < 0.42) k -= 0.004;
    pts.push([c * a * k, s * b * k]);
    const w = 1.012 + hash(i % N, 3) * 0.03;
    outer.push([c * a * k * w, s * b * k * w]);
  }
  const pos = [];
  for (let i = 0; i < N; i++) {
    const [p, q, r, u] = [pts[i], pts[i + 1], outer[i], outer[i + 1]];
    pos.push(p[0], 0.46, p[1], q[0], 0.46, q[1], r[0], 0.46, r[1], q[0], 0.46, q[1], u[0], 0.46, u[1], r[0], 0.46, r[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {                             // the foam runs up the beach and back, in slow sets
    s.uniforms.uT = SEA;
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;").replace("#include <begin_vertex>", `#include <begin_vertex>
      float a = atan(position.z, position.x), wash = sin(uT * .8 + a * 9.) * .5 + sin(uT * 1.3 - a * 17.) * .3;
      transformed.xz *= 1. + wash * .014;
      transformed.y += wash * .1;`);
  };
  return new THREE.Mesh(g, mat);
}
