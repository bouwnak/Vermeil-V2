// houses.js - every town builds its houses its own way, from its own stuff:
//   Willowmere   half-timbered cottages, cream plaster between dark beams, tile or thatch roofs, shutters and window boxes of flowers
//   Sunback      flat-roofed adobe, a parapet round the roof, beam ends poking out of the wall, a striped awning over the door
//   Hoarshell    grey stone with lighter corner stones, steep slate roofs under snow, icicles along the eaves, a woodpile by the wall
//   Mirewalk     plank huts up on stilts over the wet, a deck and a ladder, deep thatch
//   Coralcrest   whitewashed walls with a blue band, blue doors and shutters, low tiled roofs, a balcony upstairs
//   Emberback    black basalt laid in courses, steep red roofs, iron-barred windows that glow from the forges inside
// Each house is a few dozen boxes and wedges; all of a town's houses are merged into one mesh per colour, so a whole town of them costs
// about a dozen draw calls. Chimneys smoke (and on Emberback spark); windows light up at dusk (made.js nightGlow).
// restyle() gives the village-kit houses (House_1-4, the Inn...) their town's plaster and roof colours, and lit windows too.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { emitter, lampLight, nightGlow } from "./made.js";

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

/** each town's way of building, and its colours */
export const HOUSE_LOOK = {
  willowmere: { style: "timber", wall: 0xf3e6c9, wall2: 0xe6d3ad, trim: 0x5a3c24, roofs: [0xa24c33, 0x8e4a38, 0xc4a052], pitch: 0.8, shutters: [0x4f7a48, 0x8a3b3b, 0x3f6a8a], stone: 0x9a9184, door: 0x6a3f24, flowers: [0xe8556d, 0xf4c542, 0xffffff, 0xb36ad9], smoke: 0.8 },
  dune: { style: "adobe", wall: 0xe6c28c, wall2: 0xd8aa70, trim: 0x86552e, roofs: [0xd8aa70], pitch: 0, shutters: [0x2f7fa0, 0x3a9a8a, 0xb5562e], stone: 0xc9a06a, door: 0x7a4a28, flowers: [0xe8556d, 0xff9a3a],
    awnings: [[0xd8553a, 0xf3e3c3], [0x2f7fa0, 0xf3e3c3], [0xe0a030, 0xf6ead0], [0x3a9a6a, 0xf6ead0]], smoke: 0.15 },
  frost: { style: "stone", wall: 0x96a2ae, wall2: 0xc9d3dd, trim: 0x46525f, roofs: [0x3f5f7f, 0x4a5568, 0x5e4848], pitch: 1.05, shutters: [0x2f5f8f, 0x8a3b3b, 0x3a6a5a], stone: 0x7a8592, door: 0x4a3426, snow: true, smoke: 1 },
  mire: { style: "stilt", wall: 0x7d654a, wall2: 0x6a5440, trim: 0x3f3024, roofs: [0xb59a5c, 0xa48c52, 0x8f8a4f], pitch: 0.85, shutters: [0x55703c, 0x6f5a40], stone: 0x5f5a4a, door: 0x3f3024, smoke: 0.7 },
  palm: { style: "white", wall: 0xfaf7f0, wall2: 0xefe9dd, trim: 0x2f7fb0, roofs: [0x2f9fa8, 0x3a7fc0, 0xd2774a], pitch: 0.42, shutters: [0x2f7fb0, 0x2f9fa8, 0xe8a83a], stone: 0xd8ccb4, door: 0x2f6f9a, flowers: [0xe8556d, 0xff7ab0, 0xffffff, 0xf4c542], smoke: 0.2 },
  ember: { style: "basalt", wall: 0x4e4442, wall2: 0x6e605a, trim: 0x231b1a, roofs: [0xa83a22, 0x8a2e1e, 0x73302a], pitch: 0.95, shutters: [0x2a201e], stone: 0x3a3234, door: 0x2a201e, hot: true, smoke: 1 },
};
export const lookOf = (id) => HOUSE_LOOK[id] || HOUSE_LOOK.willowmere;

// ---- the unit shapes every part is cut from: positions and normals only, not indexed, so they all merge together ----
const bare = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute("uv"); n.computeVertexNormals(); return n; };
const UNIT = {
  box: bare(new THREE.BoxGeometry(1, 1, 1)),
  cyl: bare(new THREE.CylinderGeometry(0.5, 0.5, 1, 7)),
  cone: bare(new THREE.ConeGeometry(0.5, 1, 6)),
  blob: bare(new THREE.IcosahedronGeometry(0.5, 0)),
  // a wedge: a triangle across z (base from -0.5 to 0.5 at y 0, its peak at y 1), run along x from -0.5 to 0.5. The gable ends of a roof
  wedge: (() => {
    const A = [-0.5, 0, 0.5], B = [-0.5, 0, -0.5], C = [-0.5, 1, 0], D = [0.5, 0, 0.5], E = [0.5, 0, -0.5], F = [0.5, 1, 0];
    const tris = [[A, C, B], [D, E, F], [A, D, F], [A, F, C], [B, C, F], [B, F, E], [A, B, E], [A, E, D]];
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3)); g.computeVertexNormals(); return g;
  })(),
};

/** a town's worth of houses, built up part by part and merged at the end. -> { house(lot), finish(parent) } */
export function houseBatch(L) {
  const id = L.cfg.id, look = lookOf(id), parts = new Map(), mats = new Map(), lanterns = [], fx = [];
  const M = new THREE.Matrix4(), part = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const mat = (key) => {
    if (mats.has(key)) return mats.get(key);
    let m;
    if (key === "glass") m = nightGlow(new THREE.MeshStandardMaterial({ color: look.hot ? 0x4a2a1a : 0x2c3846, emissive: look.hot ? 0xff7a2a : 0xffb760, roughness: 0.35, flatShading: true }), look.hot ? 0.45 : 0.04, look.hot ? 1.4 : 1.15);
    else m = new THREE.MeshStandardMaterial({ color: key, flatShading: true, roughness: 0.88, side: THREE.DoubleSide });
    mats.set(key, m); return m;
  };
  const add = (shape, color, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) => {
    e.set(rx, ry, rz, "YXZ"); q.setFromEuler(e); part.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    const g = UNIT[shape].clone().applyMatrix4(part.premultiply(M));
    const key = color; if (!parts.has(key)) parts.set(key, []); parts.get(key).push(g);
  };
  const box = (c, w, h, d, x, y, z, ry, rx, rz) => add("box", c, w, h, d, x, y, z, ry, rx, rz);

  /** a face of the house: where it is and which way it looks. u along it, out from it */
  const FACES = { front: [0, 0, 1, 0], right: [1, 0, 0, Math.PI / 2], back: [0, 0, -1, Math.PI], left: [-1, 0, 0, -Math.PI / 2] };
  const onFace = (f, W, D, u, y, out) => { const [nx, , nz, ry] = FACES[f], half = nx ? W / 2 : D / 2, tx = Math.cos(ry), tz = -Math.sin(ry); return [nx * (half + out) + tx * u, y, nz * (half + out) + tz * u, ry]; };
  const onF = (f, W, D, u, y, out, c, w, h, d) => { const [x, yy, z, ry] = onFace(f, W, D, u, y, out); box(c, w, h, d, x, yy, z, ry); };

  /** a window: frame, glass, glazing bars, sill; shutters and a box of flowers if the town has them */
  const windowAt = (f, W, D, u, y, o) => {
    const w = o.small ? 0.62 : 0.82, h = o.small ? 0.7 : 0.98;
    onF(f, W, D, u, y, 0.02, look.trim, w + 0.2, h + 0.2, 0.06);
    onF(f, W, D, u, y, 0.05, "glass", w, h, 0.04);
    onF(f, W, D, u, y, 0.08, look.trim, 0.05, h, 0.03); onF(f, W, D, u, y + h * 0.08, 0.08, look.trim, w, 0.05, 0.03);
    onF(f, W, D, u, y - h / 2 - 0.12, 0.1, o.sill ?? look.stone, w + 0.34, 0.09, 0.22);
    if (o.bars) for (const k of [-1, 0, 1]) onF(f, W, D, u + k * w * 0.3, y, 0.11, 0x1a1414, 0.04, h + 0.1, 0.04);
    if (o.shutter != null) for (const sd of [-1, 1]) { onF(f, W, D, u + sd * (w / 2 + 0.26), y, 0.06, o.shutter, 0.42, h + 0.12, 0.05); onF(f, W, D, u + sd * (w / 2 + 0.26), y, 0.09, look.trim, 0.3, 0.05, 0.03); }
    if (o.flowers) {
      onF(f, W, D, u, y - h / 2 - 0.3, 0.2, look.trim, w + 0.16, 0.22, 0.26);
      for (let k = 0; k < 4; k++) { const [x, yy, z] = onFace(f, W, D, u + (k - 1.5) * w * 0.27, y - h / 2 - 0.14, 0.22 + (k % 2) * 0.04); add("blob", k % 2 ? 0x4f8a3a : o.flowers[(k + o.seed) % o.flowers.length], 0.26, 0.22, 0.26, x, yy, z, k); }
    }
  };
  /** a door: frame, the door, a knob, a stone step, sometimes a little hood over it */
  const doorAt = (f, W, D, u, y0, o = {}) => {
    const dh = 2.05, dw = 1.05;
    onF(f, W, D, u, y0 + dh / 2 + 0.06, 0.03, look.trim, dw + 0.26, dh + 0.2, 0.08);
    onF(f, W, D, u, y0 + dh / 2, 0.07, o.color ?? look.door, dw, dh, 0.06);
    if (o.bands) for (const k of [0.3, 0.75]) onF(f, W, D, u, y0 + dh * k, 0.1, 0x1a1414, dw, 0.07, 0.03);
    const [kx, ky, kz] = onFace(f, W, D, u + dw * 0.32, y0 + dh * 0.48, 0.12); add("blob", 0xd8b04a, 0.09, 0.09, 0.09, kx, ky, kz);
    if (!o.noStep) onF(f, W, D, u, y0 - 0.11, 0.38, look.stone, dw + 0.6, 0.22, 0.75);
    if (o.hood) { const [hx, hy, hz, ry] = onFace(f, W, D, u, y0 + dh + 0.36, 0.42); box(o.hood, dw + 0.8, 0.1, 0.95, hx, hy, hz, ry, 0.32); for (const sd of [-1, 1]) onF(f, W, D, u + sd * (dw / 2 + 0.25), y0 + dh + 0.12, 0.2, look.trim, 0.08, 0.36, 0.36); }
  };
  /** a pitched roof over a W x D box whose walls stop at y: two slabs, gable ends in `gable`, a ridge, the eaves out past the walls */
  const pitched = (W, D, y, pitch, color, gable, o = {}) => {
    const th = o.thick ?? 0.2, oh = o.over ?? 0.42, ohx = o.overX ?? 0.32, a = Math.atan(pitch), rise = D / 2 * pitch, len = (D / 2 + oh) / Math.cos(a);
    add("wedge", gable, W, rise, D, 0, y, 0);
    for (const sd of [1, -1]) {
      const cz = sd * (len / 2) * Math.cos(a), cy = y + rise - (len / 2) * Math.sin(a), nz = sd * Math.sin(a), ny = Math.cos(a);
      box(color, W + ohx * 2, th, len, 0, cy + ny * th / 2, cz + nz * th / 2, 0, sd * a);
      if (o.snow) box(0xf4f8fb, W + ohx * 2 - 0.1, 0.12, len * 0.86, 0, cy + ny * (th + 0.05) + Math.sin(a) * len * 0.07, cz + nz * (th + 0.05) - sd * Math.cos(a) * len * 0.07, 0, sd * a);
    }
    if (o.ridge !== false) add(o.thatch ? "cyl" : "box", o.ridgeColor ?? look.trim, o.thatch ? W + ohx * 2 + 0.1 : W + ohx * 2 + 0.06, o.thatch ? 0.5 : 0.16, o.thatch ? 0.5 : 0.3, 0, y + rise + th * 0.9, 0, 0, 0, o.thatch ? Math.PI / 2 : 0);
    if (o.icicles) for (const sd of [1, -1]) for (let k = 0; k < 7; k++) { const x = -W / 2 + (k + 0.5) * W / 7, len2 = 0.22 + hash(k, sd) * 0.35; add("cone", 0xe6f2fa, 0.09, len2, 0.09, x, y - (oh * pitch) - len2 / 2 + 0.02, sd * (D / 2 + oh - 0.05), 0, Math.PI); }
    return y + rise;
  };
  /** a chimney at (x, z) from inside the roof up past the ridge; smoke (and sparks) from its top */
  const chimney = (x, z, top, c, house) => {
    box(c, 0.72, top - house.y + 0.4, 0.72, x, (top + house.y) / 2 + 0.2, z);
    box(look.trim, 0.9, 0.16, 0.9, x, top + 0.48, z);
    if (look.snow) box(0xf4f8fb, 0.8, 0.12, 0.8, x, top + 0.6, z);
    house.smoke = [x, top + 0.7, z];
  };

  return {
    /** one house on a lot: { x, z, h (ground level), ry, kit: ["home:<size>"...] or a village-kit house's footprint } */
    house(lot, i) {
      const seed = (L.cfg.seed || 1) * 13 + i * 7.3, H = (k) => hash(seed, k * 3.7), r = lot.kit[2];
      const small = r < 3.9, big = r > 4.5;
      let W = small ? 5.4 : big ? 7 : 6.4, D = small ? 4.6 : big ? 6 : 5.4;
      const floors = small ? 1 : big ? 2 : H(1) < 0.55 ? 2 : 1, fh = 2.75, mirror = H(2) < 0.5 ? 1 : -1;
      const roof = look.roofs[Math.floor(H(3) * look.roofs.length)], shutter = look.shutters[Math.floor(H(4) * look.shutters.length)];
      M.compose(v.set(lot.x, lot.h, lot.z), q.setFromEuler(e.set(0, lot.ry, 0)), s.set(1, 1, 1));
      const st = look.style, house = { y: 0, smoke: null };
      let y0 = 0.22;                                           // the ground floor stands a step up on its footing
      if (st === "stilt") {
        y0 = 1.35;
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) add("cyl", look.trim, 0.26, y0 + 1.6, 0.26, px * (W / 2 - 0.2), y0 / 2 - 0.8, pz * (D / 2 - 0.2));
        box(look.wall2, W + 0.6, 0.2, D + 2.4, 0, y0 - 0.1, 0.9);                                   // the floor, carried out in front as a deck
        for (let k = -2; k <= 2; k++) add("cyl", look.trim, 0.2, y0 + 1.4, 0.2, k * (W / 4.4), y0 / 2 - 0.7, D / 2 + 2);
        for (const sd of [-1, 1]) { box(look.trim, 0.12, 0.9, 0.12, sd * (W / 2 + 0.2), y0 + 0.45, D / 2 + 2); box(look.trim, 0.08, 0.08, 2.3, sd * (W / 2 + 0.2), y0 + 0.86, D / 2 + 0.9); }
        for (let k = 0; k < 4; k++) box(look.wall2, 1.3, 0.12, 0.42, 0, y0 - 0.3 - k * 0.34, D / 2 + 2.35 + k * 0.4);      // the steps down
      } else box(look.stone, W + 0.34, 1.8, D + 0.34, 0, y0 - 0.9, 0);                              // a footing, down into the ground
      const wallH = floors * fh;
      house.y = y0 + wallH;
      // ---- the walls ----
      if (st === "timber") {
        box(floors > 1 ? look.wall2 : look.wall, W, fh, D, 0, y0 + fh / 2, 0);
        if (floors > 1) box(look.wall, W + 0.3, fh, D + 0.3, 0, y0 + fh * 1.5, 0);                  // the upper floor jutting out over the lower
        const ww = floors > 1 ? W + 0.3 : W, dd = floors > 1 ? D + 0.3 : D, yt = floors > 1 ? y0 + fh : y0;
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(look.trim, 0.22, wallH, 0.22, cx * (W / 2), y0 + wallH / 2, cz * (D / 2));
        for (const f of ["front", "back", "left", "right"]) {
          const span = f === "front" || f === "back" ? ww : dd;
          onF(f, ww, dd, 0, yt + 0.1, 0.02, look.trim, span, 0.18, 0.06); onF(f, ww, dd, 0, yt + fh - 0.08, 0.02, look.trim, span, 0.16, 0.06);
          for (let u = -span / 2 + 0.1; u <= span / 2; u += span / 4) onF(f, ww, dd, u, yt + fh / 2, 0.02, look.trim, 0.14, fh, 0.05);
          if (f === "left" || f === "right") for (const sd of [-1, 1]) { const [bx, by, bz, ry] = onFace(f, ww, dd, sd * span * 0.3, yt + fh / 2, 0.03); box(look.trim, 0.12, Math.hypot(span / 4, fh) * 0.95, 0.05, bx, by, bz, ry, 0, sd * Math.atan2(span / 4, fh)); }
        }
      } else if (st === "stone" || st === "basalt") {
        box(look.wall, W, wallH, D, 0, y0 + wallH / 2, 0);
        if (st === "stone") for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < wallH / 0.5 - 0.5; k++) box(look.wall2, k % 2 ? 0.62 : 0.4, 0.42, k % 2 ? 0.4 : 0.62, cx * (W / 2 - 0.12), y0 + 0.25 + k * 0.5, cz * (D / 2 - 0.12));
        else {
          for (let yy = y0 + 0.7; yy < y0 + wallH - 0.2; yy += 0.75) for (const f of ["front", "back", "left", "right"]) onF(f, W, D, 0, yy, 0.01, look.wall2, (f === "front" || f === "back" ? W : D) + 0.02, 0.07, 0.04);
          for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(look.stone, 0.7, 1.2, 0.7, cx * (W / 2), y0 + 0.4, cz * (D / 2)); box(look.stone, 0.5, wallH, 0.5, cx * (W / 2), y0 + wallH / 2, cz * (D / 2)); }
        }
      } else if (st === "stilt") {
        box(look.wall, W, wallH, D, 0, y0 + wallH / 2, 0);
        for (let yy = y0 + 0.4; yy < y0 + wallH; yy += 0.45) for (const f of ["front", "back", "left", "right"]) onF(f, W, D, 0, yy, 0.01, look.wall2, (f === "front" || f === "back" ? W : D), 0.06, 0.04);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(look.trim, 0.2, wallH + 0.1, 0.2, cx * (W / 2), y0 + wallH / 2, cz * (D / 2));
      } else {                                                 // adobe and whitewash: plain walls, a coloured band at the foot
        box(look.wall, W, wallH, D, 0, y0 + wallH / 2, 0);
        if (st === "white") for (const f of ["front", "back", "left", "right"]) onF(f, W, D, 0, y0 + 0.2, 0.01, look.trim, (f === "front" || f === "back" ? W : D) + 0.04, 0.4, 0.04);
        if (st === "adobe") for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(look.wall2, 0.36, wallH + 0.1, 0.36, cx * (W / 2 - 0.05), y0 + wallH / 2, cz * (D / 2 - 0.05));
      }
      // ---- the door and windows: front, back and the sides ----
      const du = (W > 6 ? 0.9 : 0.6) * mirror * (H(5) < 0.5 ? 1 : 0), wo = { shutter: st === "adobe" && H(6) < 0.5 ? null : shutter, flowers: look.flowers && !look.snow && st !== "basalt" && H(7) < 0.8 ? look.flowers : null, seed: i, bars: st === "basalt", small: st === "adobe" || st === "basalt" };
      doorAt("front", W, D, du, y0, { bands: st === "basalt" || st === "stone", hood: st === "timber" || st === "white" ? roof : null, noStep: st === "stilt", color: st === "white" ? shutter : look.door });
      for (let fl = 0; fl < floors; fl++) {
        const wy = y0 + fl * fh + 1.45, us = fl === 0 ? [du - mirror * (W * 0.3 + 0.35)] : W > 6 ? [-W * 0.3, 0, W * 0.3] : [-W * 0.25, W * 0.25];
        if (fl === 0 && W > 6) us.push(du + mirror * (W * 0.26 + 0.2));
        for (const u of us) if (Math.abs(u) < W / 2 - 0.6) windowAt("front", st === "timber" && fl ? W + 0.3 : W, st === "timber" && fl ? D + 0.3 : D, u, wy, wo);
        for (const f of ["left", "right"]) if (H(10 + fl + (f === "left" ? 4 : 0)) < 0.75) windowAt(f, st === "timber" && fl ? W + 0.3 : W, st === "timber" && fl ? D + 0.3 : D, 0, wy, { ...wo, flowers: null });
        windowAt("back", W, D, (H(20 + fl) - 0.5) * W * 0.4, wy, { ...wo, flowers: null, shutter: null });
      }
      // ---- the roof ----
      let top = house.y;
      const gable = st === "timber" ? look.wall : st === "stilt" ? look.wall2 : look.wall, wR = st === "timber" && floors > 1 ? W + 0.3 : W, dR = st === "timber" && floors > 1 ? D + 0.3 : D;
      if (st === "adobe" || (st === "white" && H(8) < 0.3)) {
        const yT = house.y;
        box(look.wall2, W + 0.1, 0.16, D + 0.1, 0, yT + 0.05, 0);
        for (const f of ["front", "back", "left", "right"]) onF(f, W, D, 0, yT + 0.32, -0.12, st === "white" ? look.trim : look.wall, (f === "front" || f === "back" ? W : D) + 0.02, 0.55, 0.24);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(st === "white" ? look.trim : look.wall2, 0.5, 0.85, 0.5, cx * (W / 2 - 0.13), yT + 0.45, cz * (D / 2 - 0.13));
        if (st === "adobe") {
          for (let k = 0; k < 5; k++) add("cyl", look.trim, 0.16, 0.7, 0.16, -W / 2 + (k + 0.5) * W / 5, yT - 0.35, D / 2 + 0.25, 0, Math.PI / 2);     // the roof beams' ends
          if (floors > 1 || H(9) < 0.4) {                                                          // a room on the roof, set back, with its own parapet
            const w2 = W * 0.48, d2 = D * 0.55, x2 = -mirror * W * 0.22, z2 = -D * 0.18;
            box(look.wall, w2, 2.3, d2, x2, yT + 1.15, z2); box(look.wall2, w2 + 0.2, 0.3, d2 + 0.2, x2, yT + 2.4, z2);
            const [wx, wy, wz] = [x2, yT + 1.25, z2 + d2 / 2 + 0.04]; box(look.trim, 0.7, 0.85, 0.06, wx, wy, wz); box("glass", 0.5, 0.65, 0.05, wx, wy, wz + 0.03);
            top = yT + 2.6;
          }
          for (let k = 0; k < 3; k++) add("cyl", k % 2 ? 0xb5562e : 0xc8743e, 0.42, 0.5, 0.42, mirror * (W / 2 - 0.7 - k * 0.55), yT + 0.38, D / 2 - 0.6, 0);         // clay pots
          // the striped awning over the door, on two poles
          const [c1, c2] = look.awnings[Math.floor(H(11) * look.awnings.length)], aw = 2.2, ad = 1.5;
          for (let k = 0; k < 6; k++) box(k % 2 ? c2 : c1, aw / 6 + 0.01, 0.05, ad, du - aw / 2 + (k + 0.5) * aw / 6, y0 + 2.55, D / 2 + ad / 2 + 0.05, 0, 0.3);
          for (const sd of [-1, 1]) add("cyl", look.trim, 0.08, 2.4, 0.08, du + sd * aw / 2, y0 + 1.2 - 0.1, D / 2 + ad - 0.05);
        }
        house.flat = true;
      } else {
        const pitch = look.pitch * (0.92 + H(12) * 0.16);
        top = pitched(wR, dR, house.y, pitch, roof, gable, { thick: st === "stilt" ? 0.45 : 0.2, over: st === "stilt" ? 0.75 : 0.42, overX: st === "stilt" ? 0.5 : 0.32, snow: look.snow, icicles: look.snow, thatch: st === "stilt" || (st === "timber" && roof === 0xc4a052), ridgeColor: st === "stilt" ? 0x8a7642 : look.trim });
        if (st === "white" && floors > 1) {                                                        // a balcony off the upper floor
          const by = y0 + fh + 0.05;
          box(look.wall2, W * 0.5, 0.14, 0.95, 0, by, D / 2 + 0.47);
          for (let k = 0; k <= 6; k++) box(0xffffff, 0.06, 0.85, 0.06, -W * 0.24 + k * W * 0.08, by + 0.45, D / 2 + 0.9);
          box(shutter, W * 0.5 + 0.06, 0.08, 0.1, 0, by + 0.9, D / 2 + 0.9);
        }
      }
      // ---- the chimney ----
      if (!house.flat && H(13) < look.smoke + 0.15) chimney(mirror * (wR / 2 - 0.75), -dR * 0.22, top + 0.3, st === "stilt" ? 0x8a6a4a : look.stone, house);
      else if (st === "adobe" && H(13) < 0.35) { add("cyl", look.wall2, 0.5, 1.1, 0.5, mirror * (W / 2 - 0.6), house.y + 0.6, -D / 2 + 0.6); house.smoke = [mirror * (W / 2 - 0.6), house.y + 1.2, -D / 2 + 0.6]; }
      // ---- by the walls: a woodpile in the cold, potted plants in the warm ----
      if (st === "stone" || (st === "timber" && H(14) < 0.4)) {
        const sx = -mirror * (W / 2 + 0.45);
        for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) add("cyl", k % 2 ? 0x7a5232 : 0x8a6240, 0.3, 1.3, 0.3, sx, y0 - 0.05 + row * 0.27, -D * 0.25 + (k + row * 0.5) * 0.3 - 0.4, 0, Math.PI / 2);
        if (look.snow) box(0xf4f8fb, 0.45, 0.08, 1.4, sx, y0 + 0.75, -D * 0.25 - 0.05);
      }
      if (st === "white" || st === "adobe" || st === "timber") for (const sd of [-1, 1]) if (H(15 + sd) < 0.6) {
        const px = du + sd * 1.05, pz = D / 2 + 0.55;
        add("cyl", st === "timber" ? 0x8a5a3a : 0xc8743e, 0.42, 0.45, 0.42, px, y0 - 0.02, pz, 0);
        add("blob", st === "adobe" ? 0x5f8a4a : 0x4f9a4a, 0.6, 0.62, 0.6, px, y0 + 0.5, pz);
        if (look.flowers) add("blob", look.flowers[(i + sd + 2) % look.flowers.length], 0.22, 0.2, 0.22, px + 0.1, y0 + 0.78, pz + 0.12);
      }
      // a lantern by the door on most houses; it lights with the street lamps
      if (H(17) < 0.7) { const [lx, ly, lz] = onFace("front", W, D, du + 0.95 * (du >= 0 ? -1 : 1), y0 + 2.15, 0.2); lanterns.push(new THREE.Vector3(lx, ly, lz).applyMatrix4(M)); onF("front", W, D, du + 0.95 * (du >= 0 ? -1 : 1), y0 + 2.42, 0.1, 0x1a1414, 0.08, 0.08, 0.3); }
      if (house.smoke) fx.push({ at: new THREE.Vector3(...house.smoke).applyMatrix4(M), hot: !!look.hot, flat: !!house.flat });
      return { W, D, top };
    },
    /** merge it all and put it in the turtle's group. -> the smoke and spark emitters, for tickHouses */
    finish(parent) {
      for (const [key, geos] of parts) {
        if (!geos.length) continue;
        const g = mergeGeometries(geos, false); for (const x of geos) x.dispose();
        if (!g) continue;
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat(key)); m.castShadow = true; m.receiveShadow = true; parent.add(m);
      }
      parts.clear();
      for (const p of lanterns) { const glow = lampLight(0.17, 0); glow.position.copy(p); parent.add(glow); }
      const out = [];
      for (const f of fx) {
        const g = new THREE.Group(); g.position.copy(f.at); parent.add(g);
        const smoke = emitter(g, [0, 0, 0], { n: 22, colors: f.hot ? [0x5a5254, 0x6a6264, 0x48403f] : [0xe8e4dc, 0xd0ccc4, 0xbab6ae], up: 0.75, spread: 0.12, life: 4.2, size: 0.42, grow: 3.6, drift: 0.45 });
        const sparks = f.hot ? emitter(g, [0, 0, 0], { n: 10, colors: [0xffc060, 0xff7a2a], up: 1.6, spread: 0.2, life: 1.1, size: 0.07, grow: 0.3, drift: 0.5, glow: true }) : null;
        out.push({ L, g, smoke, sparks, rate: f.flat ? 0.5 : 1 });
      }
      return out;
    },
  };
}

// ---- the village-kit houses, in their town's colours ----
const restyled = new Map();
/** the kit's grey stone, in each warm town's own stone instead: [dark, light] */
const STONE = { palm: [0xcbbd9f, 0xeee6d6], dune: [0xb48c5c, 0xdcbf92], mire: [0x6a6250, 0x8a8068] };
/** give a loaded village-kit model its town's plaster and roof, and windows that light up at night */
export function restyle(o, id) {
  if (!o) return o;
  const look = lookOf(id), keepColours = id === "willowmere" || !HOUSE_LOOK[id];
  o.traverse((m) => {
    if (!m.isMesh) return;
    const swap = (src) => {
      const name = src.name || "", key = id + "|" + src.uuid;
      if (restyled.has(key)) return restyled.get(key);
      let out = src;
      if (/^Windows/.test(name)) { out = src.clone(); out.color.set(look.hot ? 0x4a2a1a : 0x2c3846); out.emissive = new THREE.Color(look.hot ? 0xff7a2a : 0xffb760); nightGlow(out, look.hot ? 0.45 : 0.04, look.hot ? 1.4 : 1.15); }
      else if (!keepColours && /^(Plaster|Beige)/.test(name)) { out = src.clone(); out.color.set(look.wall); }
      else if (!keepColours && /^RoofTiles/.test(name)) { out = src.clone(); out.color.set(look.roofs[0]); }
      else if (!keepColours && look.hot && /^Stone_Light/.test(name)) { out = src.clone(); out.color.set(look.wall2); }
      else if (!keepColours && look.hot && /^(White|LightRed)$/.test(name)) { out = src.clone(); out.color.set(name === "White" ? look.wall2 : look.roofs[0]); }      // a farm silo's candy stripes, in the town's basalt and roof red
      else if (!keepColours && STONE[id] && /^Stone_(Dark|Light)/.test(name)) { out = src.clone(); out.color.set(STONE[id][/Dark/.test(name) ? 0 : 1]); }
      restyled.set(key, out); return out;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
  return o;
}

// ---- the chimneys and fountains, kept going while you're near ----
export const HOUSE_FX = [];
export const TOWN_FOUNTAINS = [];
let fountainIn = 0;
export function tickHouses(G, dt) {
  WIND.value += dt;
  const P = G.player?.pos;
  if (!P) return;
  for (const f of HOUSE_FX) {
    if (!f.L.group.visible) continue;
    const near = f.L.dist ? f.L.dist(P.x, P.z) < f.L.cfg.a + 120 : true;
    if (!near) continue;
    f.smoke.tick(dt, f.rate);
    f.sparks?.tick(dt, 0.7);
  }
  if ((fountainIn -= dt) < 0) {
    fountainIn = 0.16;
    for (const f of TOWN_FOUNTAINS) { if (!f.L.group.visible || (f.L.dist && f.L.dist(P.x, P.z) > f.L.cfg.a + 60)) continue; const [x, z] = f.L.world(f.x, f.z); G.vfx?.burst("water", x, f.y + f.h, z, 0.45); }
  }
}
/** the wind's clock, for the bunting and anything else that flaps */
export const WIND = { value: 0 };
