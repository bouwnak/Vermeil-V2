// museumbones.js - The Dinosaur Hall: four skeletons on gravel daises (a long-necked sauropod, a tyrant, a three-horn and a pack of
// raptors on a rock), two pterosaurs hung from the ceiling, a dig pit for children, fossil slabs and the long painted mural.
// Every skeleton is built bone by bone on its steel armature: vertebrae down a curve, ribs as bent tubes, limbs as waisted rods,
// toes and claws, skulls bent out of boxes with dark openings, teeth one by one.
import * as THREE from "three";
import { Kit } from "./mainhub.js";
import { muralTex, fossilTex, labelTex, signTex } from "./museumart.js";
import { V, P, frame, rod, tube, shaped, blob, MM, sharedMat, std, dais, LIVE, triGeo, lerp, smooth, pictureLamp, signMat } from "./museumkit.js";

const v3 = (a) => (a.isVector3 ? a.clone() : V(a[0], a[1], a[2] || 0));
const pos = (p) => ({ x: p.x, y: p.y, z: p.z });
const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const rect = (w, d, out = 0.55) => () => [[-w / 2 - out, -d / 2 - out, w / 2 + out, d / 2 + out]];
function tAtX(c, x) { let best = 0, bd = Infinity; for (let i = 0; i <= 240; i++) { const t = i / 240, d = Math.abs(c.getPointAt(t).x - x); if (d < bd) { bd = d; best = t; } } return best; }

// ---------------------------------------------------------------- bones
/** a long bone from a to b: thick at both ends, waisted in the middle, with knuckles */
function bone(F, M, a, b, r0, r1 = r0 * 0.85, mat = M.bone) {
  const A = v3(a), B = v3(b), mid = A.clone().lerp(B, 0.5), w = Math.min(r0, r1) * 0.68;
  rod(F, A, mid, r0, mat, 8, w); rod(F, mid, B, w, mat, 8, r1);
  F.ball(r0 * 1.1, mat, pos(A), 1); F.ball(r1 * 1.1, mat, pos(B), 1);
}
const limb = (F, M, pts, rs, mat) => { const Q = pts.map(v3); for (let i = 0; i < Q.length - 1; i++) bone(F, M, Q[i], Q[i + 1], rs[i], rs[i + 1] ?? rs[i] * 0.8, mat); return Q; };
/** n toes fanning out from base, pointing along yaw (0 = +x), each three joints down to the ground and a claw */
function toes(F, M, base, yaw, n, len, r, spread, o = {}) {
  const B = v3(base), g = o.ground ?? r, segs = o.segs ?? 3;
  for (let k = 0; k < n; k++) {
    const a = yaw + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0), dir = V(Math.cos(a), 0, -Math.sin(a)), L = len * (o.lens ? o.lens[k] : 1);
    let p = B.clone();
    for (let s = 0; s < segs; s++) {
      const q = p.clone().addScaledVector(dir, (L / segs) * (1 - s * 0.12)); q.y = lerp(B.y, g, (s + 1) / segs);
      rod(F, p, q, r * (1 - s * 0.14), M.bone, 6, r * (0.86 - s * 0.14)); F.ball(r * (1 - s * 0.12), M.bone, pos(q), 0);
      p = q;
    }
    const tip = p.clone().addScaledVector(dir, L * (o.claw ?? 0.3)); tip.y = Math.max(0.004, p.y - r * 0.8);
    rod(F, p, tip, r * 0.85, M.claw, 6, 0.003);
  }
}
/** a flat bony plate (hip blades, shoulder blades), its top edge curved */
function plate(F, M, x, y, z, L, H, T, tilt = 0, mat = M.bone) {
  F.add(shaped(new THREE.BoxGeometry(L, H, T, 6, 3, 1), (v) => { const u = (v.x / L) * 2; v.y -= u * u * H * (v.y > 0 ? 0.28 : 0.06); }), mat, { x, y, z, rz: tilt });
}
/** vertebrae down a curve: a centrum each, a neural spine up, side processes, chevrons under the tail; a steel rod threads them */
function column(F, M, pts, n, size, o = {}) {
  const c = new THREE.CatmullRomCurve3(pts.map(v3), false, "centripetal"), seg = c.getLength() / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = c.getPointAt(t), tg = c.getTangentAt(t), [r, sh, sw] = size(t);
    const half = tg.clone().multiplyScalar(seg * 0.34), up = V(0, 1, 0).addScaledVector(tg, -tg.y).normalize();
    rod(F, p.clone().sub(half), p.clone().add(half), r, M.bone, 8, r * 0.9);
    F.cyl(r * 1.08, r * 1.08, seg * 0.08, M.boneDark, { ...pos(p.clone().add(half)), rz: Math.atan2(-tg.x, tg.y) }, 8);
    if (sh > 0.01) rod(F, p.clone().addScaledVector(up, r * 0.5), p.clone().addScaledVector(up, r + sh).addScaledVector(tg, -sh * 0.3), r * 0.42, M.bone, 4, r * 0.16);
    if (sw > 0.01) { const side = new THREE.Vector3().crossVectors(tg, up).normalize(); for (const k of [-1, 1]) rod(F, p.clone().addScaledVector(up, r * 0.3), p.clone().addScaledVector(side, k * (r + sw)).addScaledVector(up, r * 0.4), r * 0.28, M.boneDark, 4, r * 0.12); }
    const ch = o.chevron ? o.chevron(t) : 0;
    if (ch > 0.01) rod(F, p.clone().addScaledVector(up, -r * 0.6), p.clone().addScaledVector(up, -r - ch).addScaledVector(tg, -ch * 0.45), r * 0.3, M.boneDark, 4, r * 0.1);
  }
  F.add(tube(c.getPoints(n * 2), o.core ?? 0.02, n * 2, 4), M.steel);
  return c;
}
/** ribs hung from the spine between x0 and x1, sweeping back and down; shape(u) = [depth, half-width] */
function ribcage(F, M, c, x0, x1, n, shape, r) {
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = lerp(x0, x1, u), p = c.getPointAt(tAtX(c, x)), [d, w] = shape(u);
    for (const k of [-1, 1]) F.add(tube([p.clone().add(V(0, -0.02, k * w * 0.12)), p.clone().add(V(-d * 0.04, -d * 0.12, k * w * 0.8)), p.clone().add(V(-d * 0.12, -d * 0.5, k * w)),
      p.clone().add(V(-d * 0.2, -d * 0.86, k * w * 0.62)), p.clone().add(V(-d * 0.22, -d, k * w * 0.3))], r, 12, 5), M.bone);
  }
}
/** steel posts up from the floor to the spine, with a foot plate and a cradle */
function armature(F, M, c, xs, r = 0.03) {
  for (const x of xs) {
    const y = c.getPointAt(tAtX(c, x)).y - 0.06;
    rod(F, V(x, 0, 0), V(x, y, 0), r, M.steel, 8); F.box(0.34, 0.03, 0.34, M.steel, { x, y: 0.015 });
    rod(F, V(x - 0.1, y, -0.12), V(x + 0.1, y, 0.12), r * 0.6, M.steel, 5); rod(F, V(x - 0.1, y, 0.12), V(x + 0.1, y, -0.12), r * 0.6, M.steel, 5);
  }
}
/** dark openings on both sides of a skull, sitting on its surface: list of [u, yn, r, sx, sy] */
function holes(F, M, L, top, half, list) {
  for (const [u, yn, r, sx = 1.2, sy = 1] of list) for (const k of [-1, 1]) F.ball(r, M.socket, { x: u * L, y: top(u, yn), z: k * (half(u, yn) + 0.004), sx, sy, sz: 0.22 }, 1);
}
/** a box bent into a skull: top(u, yn) is the height at u (0 back .. 1 snout) for yn (0 bottom .. 1 top); half(u, yn) the half-width */
const skullGeo = (L, H, W, top, half) => shaped(new THREE.BoxGeometry(L, H, W, 10, 4, 4), (v) => { const u = Math.min(1, Math.max(0, v.x / L + 0.5)), yn = Math.min(1, Math.max(0, (v.y + H / 2) / H)), zn = v.z / (W / 2); v.set(u * L, top(u, yn), zn * half(u, yn)); });
/** the lower jaw on its hinge, top edge at y 0 */
function jaw(F, M, L, H, W, open, taper = 0.45) {
  const J = F.sub({ x: 0.04 * L, y: -H * 0.45, rz: -open }), jL = L * 0.9, jH = H * 0.3, jhalf = (u) => (W / 2) * 0.86 * (1 - 0.4 * u);
  J.add(shaped(new THREE.BoxGeometry(jL, jH, W, 8, 2, 3), (v) => { const u = v.x / jL + 0.5, yn = (v.y + jH / 2) / jH, zn = v.z / (W / 2); v.set(u * jL, -(1 - yn) * jH * (1 - taper * u), zn * jhalf(u)); }), M.boneDark);
  return { J, jL, jhalf };
}

// ---------------------------------------------------------------- skulls
function theroSkull(F, M, o) {
  const { L, H, W, open = 0.22, teeth = 13, brow = true } = o;
  const top = (u, yn) => -H / 2 + yn * H * (1 - 0.5 * u) + Math.sin(u * Math.PI) * 0.05 * H * yn;
  const half = (u, yn) => (W / 2) * (1 - 0.42 * u * u - 0.12 * u) * (1 - 0.28 * yn * yn);
  F.add(skullGeo(L, H, W, top, half), M.bone);
  holes(F, M, L, top, half, [[0.2, 0.7, H * 0.12, 1, 1.1], [0.47, 0.5, H * 0.16, 1.7, 1], [0.88, 0.62, H * 0.06, 1.4, 0.8], [0.07, 0.45, H * 0.11, 0.9, 1.5]]);
  if (brow) for (const k of [-1, 1]) F.ball(H * 0.08, M.boneDark, { x: 0.2 * L, y: top(0.2, 1) - H * 0.02, z: k * half(0.2, 0.9) * 0.8, sx: 1.6, sy: 0.7 }, 1);
  for (let i = 0; i < teeth; i++) {
    const u = 0.32 + (i / (teeth - 1)) * 0.64, len = H * (0.17 - 0.07 * u), z = half(u, 0) * 0.86;
    for (const k of [-1, 1]) rod(F, V(u * L, -H / 2 + 0.01, k * z), V(u * L + len * 0.15, -H / 2 - len, k * z * 0.97), H * 0.03, M.tooth, 5, 0.002);
  }
  const { J, jL, jhalf } = jaw(F, M, L, H, W, open);
  for (let i = 0; i < teeth - 2; i++) {
    const u = 0.3 + (i / (teeth - 3)) * 0.64, len = H * (0.12 - 0.05 * u), z = jhalf(u) * 0.8;
    for (const k of [-1, 1]) rod(J, V(u * jL, -0.01, k * z), V(u * jL - len * 0.1, len, k * z), H * 0.026, M.tooth, 5, 0.002);
  }
}
function sauroSkull(F, M) {
  const L = 0.86, H = 0.36, W = 0.34;
  const top = (u, yn) => -H / 2 + yn * H * (1 - 0.3 * u) + yn * 0.2 * bell(u, 0.36, 0.14);
  const half = (u, yn) => (W / 2) * (1 - 0.3 * u) * (1 - 0.3 * yn * yn);
  F.add(skullGeo(L, H, W, top, half), M.bone);
  holes(F, M, L, top, half, [[0.25, 0.66, H * 0.16, 1, 1.1], [0.56, 0.45, H * 0.1, 1.5, 0.8]]);
  F.ball(H * 0.16, M.socket, { x: 0.36 * L, y: top(0.36, 1) + 0.004, sx: 1.4, sy: 0.25, sz: 1.1 }, 1);
  for (let i = 0; i < 7; i++) { const u = 0.62 + i * 0.055, z = half(u, 0) * 0.82; for (const k of [-1, 1]) rod(F, V(u * L, -H / 2 + 0.01, k * z), V(u * L + 0.01, -H / 2 - H * 0.14, k * z), H * 0.03, M.tooth, 5, 0.006); }
  const { J, jL, jhalf } = jaw(F, M, L, H * 0.85, W, 0.1, 0.25);
  for (let i = 0; i < 6; i++) { const u = 0.64 + i * 0.06, z = jhalf(u) * 0.8; for (const k of [-1, 1]) rod(J, V(u * jL, 0, k * z), V(u * jL, H * 0.11, k * z), H * 0.026, M.tooth, 5, 0.006); }
}
function ceraSkull(F, M) {
  const L = 1.12, H = 0.56, W = 0.56;
  const top = (u, yn) => -H / 2 + yn * H * (1 - 0.5 * u);
  const half = (u, yn) => (W / 2) * (1 - 0.5 * u ** 1.4) * (1 - 0.2 * yn * yn);
  F.add(skullGeo(L, H, W, top, half), M.bone);
  holes(F, M, L, top, half, [[0.32, 0.72, H * 0.1, 1, 1.1], [0.62, 0.45, H * 0.07, 1.4, 0.8]]);
  rod(F, V(L * 0.96, -H * 0.05, 0), V(L * 1.16, -H * 0.38, 0), H * 0.16, M.horn, 8, 0.008);                   // beak
  rod(F, V(L * 0.78, top(0.78, 1) - 0.02, 0), V(L * 0.88, top(0.78, 1) + 0.24, 0), 0.06, M.horn, 8, 0.004);      // nose horn
  const by = top(0.3, 1);
  for (const k of [-1, 1]) {                                                                                       // brow horns
    const a = V(L * 0.3, by - 0.03, k * W * 0.24), b = V(L * 0.58, by + 0.3, k * W * 0.32), c = V(L * 0.98, by + 0.52, k * W * 0.36);
    rod(F, a, b, 0.075, M.horn, 8, 0.05); rod(F, b, c, 0.05, M.horn, 8, 0.004); F.ball(0.08, M.bone, pos(a), 1);
  }
  const { J, jL } = jaw(F, M, L, H, W, 0.06);
  rod(J, V(jL * 0.96, -0.02, 0), V(jL * 1.12, 0.06, 0), H * 0.1, M.horn, 7, 0.006);
  // the frill: a fan rising behind the skull and leaning back, its edge scalloped with little bony points and two openings
  const FR = F.sub({ x: L * 0.04, y: H * 0.22, rz: 0.75 }).sub({ ry: Math.PI / 2 });
  const edge = [], tri = [];
  for (let i = 0; i <= 26; i++) { const a = -1.8 + (i / 26) * 3.6, R = 0.92 * (1 - 0.12 * (Math.abs(a) / 1.8)); edge.push(V(R * Math.sin(a), 0.08 + R * Math.cos(a) * 0.9, 0)); }
  const c0 = V(0, -0.1, 0);
  for (let i = 0; i < edge.length - 1; i++) tri.push(c0.x, c0.y, c0.z, edge[i].x, edge[i].y, 0, edge[i + 1].x, edge[i + 1].y, 0);
  FR.add(triGeo(tri), M.crest);
  FR.add(tube(edge, 0.035, 40, 5), M.bone);
  for (let i = 1; i < edge.length - 1; i += 2) { const out = edge[i].clone().sub(c0).normalize(); rod(FR, edge[i], edge[i].clone().addScaledVector(out, 0.09), 0.035, M.bone, 5, 0.004); }
  for (const k of [-1, 1]) for (const z of [0.012, -0.012]) FR.ball(0.16, M.socket, { x: k * 0.34, y: 0.5, z, sx: 0.8, sy: 1.2, sz: 0.15 }, 1);
}

// ---------------------------------------------------------------- whole animals (frame: head toward +x, the floor at y 0)
function theropod(F, M, o = {}) {
  const raptor = !!o.raptor, st = o.stride ?? 1;
  const spine = raptor
    ? [[-4.6, 2.35], [-3.4, 2.55], [-2.2, 2.75], [-1.0, 2.95], [0, 3.0], [1.0, 2.9], [1.85, 2.72], [2.35, 2.95], [2.65, 3.4], [2.85, 3.6]]
    : [[-4.4, 1.5], [-3.4, 2.05], [-2.2, 2.55], [-1.0, 2.9], [0, 3.0], [1.0, 2.92], [1.9, 2.7], [2.45, 2.78], [2.8, 3.06], [3.05, 3.26]];
  const c = column(F, M, spine, raptor ? 40 : 36,
    (t) => [0.05 + 0.11 * smooth(0, 0.45, t) - 0.03 * smooth(0.75, 1, t), (raptor ? 0.6 : 1) * (0.05 + 0.3 * bell(t, 0.52, 0.2)), t > 0.3 && t < 0.75 ? 0.14 : 0.05],
    { chevron: (t) => (t < 0.44 ? 0.05 + 0.32 * (t / 0.44) : 0), core: 0.022 });
  const ribShape = (u) => [1.0 + 0.3 * Math.sin(u * Math.PI) - 0.15 * u, 0.5 + 0.08 * Math.sin(u * Math.PI)];
  ribcage(F, M, c, -0.05, 1.85, 10, ribShape, 0.032);
  for (let i = 0; i < 9; i++) {                                                                                    // belly ribs
    const u = (i + 0.5) / 9, x = lerp(0.1, 1.7, u), p = c.getPointAt(tAtX(c, x)), [d] = ribShape(u), yb = p.y - d + 0.02, x2 = x - d * 0.22;
    for (const k of [-1, 1]) rod(F, V(x2, yb, k * 0.16), V(x2 + 0.12, yb - 0.04, 0), 0.014, M.boneDark, 4);
  }
  const py = c.getPointAt(tAtX(c, -0.3)).y;
  for (const k of [-1, 1]) {                                                                                       // hips
    plate(F, M, -0.3, py - 0.2, k * 0.16, 1.4, 0.5, 0.05);
    bone(F, M, [-0.1, py - 0.45, k * 0.14], [0.55, 1.4, k * 0.06], 0.06, 0.05);
    bone(F, M, [-0.5, py - 0.45, k * 0.14], [-1.1, 1.85, k * 0.05], 0.05, 0.035);
  }
  F.ball(0.1, M.bone, { x: 0.55, y: 1.36, z: 0, sx: 2.6, sy: 0.6, sz: 1.2 }, 1);
  for (const k of [1, -1]) {                                                                                       // legs: one forward, one pushing off
    const f = k === 1 ? st : -st, hip = [-0.25, 2.55, k * 0.36], knee = [0.22 + 0.2 * f, 1.5, k * 0.46], ankle = [-0.3 + 0.28 * f, 0.65, k * 0.42], ball = [-0.05 + 0.35 * f, 0.1, k * 0.42];
    limb(F, M, [hip, knee, ankle, ball], [0.12, 0.095, 0.075, 0.06]);
    bone(F, M, [knee[0] - 0.05, knee[1] - 0.05, k * 0.53], [ankle[0], ankle[1] + 0.05, k * 0.5], 0.03, 0.025);
    toes(F, M, ball, 0, 3, 0.5, 0.045, 0.75, { ground: 0.035, lens: [0.85, 1, 0.85] });
    if (raptor) F.add(tube([V(ball[0] + 0.04, 0.12, ball[2] - k * 0.07), V(ball[0] + 0.14, 0.26, ball[2] - k * 0.07), V(ball[0] + 0.27, 0.27, ball[2] - k * 0.07), V(ball[0] + 0.34, 0.14, ball[2] - k * 0.07)], 0.03, 10, 5), M.claw);
    else toes(F, M, [ball[0] - 0.05, 0.22, k * 0.36], Math.PI, 1, 0.16, 0.03, 0, { ground: 0.12, segs: 2 });
  }
  for (const k of [-1, 1]) {                                                                                       // shoulders and arms
    const sh = [1.82, 2.28, k * 0.34];
    bone(F, M, sh, [1.45, 2.8, k * 0.37], 0.07, 0.04);
    if (raptor) { const w = limb(F, M, [sh, [1.95, 1.75, k * 0.42], [2.45, 1.6, k * 0.4]], [0.05, 0.04, 0.03]); toes(F, M, w[2], 0.2, 3, 0.5, 0.03, 0.5, { ground: 1.25, claw: 0.45 }); }
    else { const w = limb(F, M, [sh, [2.1, 1.98, k * 0.4], [2.36, 2.04, k * 0.37]], [0.05, 0.04, 0.03]); toes(F, M, w[2], -0.2, 2, 0.16, 0.02, 0.4, { ground: 1.92, segs: 2 }); }
  }
  const end = c.getPointAt(1), H = raptor ? 0.42 : 0.74;
  theroSkull(F.sub({ x: end.x - 0.05, y: end.y + H * 0.12, rz: raptor ? -0.2 : -0.14 }), M, raptor ? { L: 1.25, H, W: 0.34, open: 0.35, teeth: 16, brow: false } : { L: 1.5, H, W: 0.52, open: 0.26, teeth: 13 });
  armature(F, M, c, o.arm ?? [-0.45, 1.25, -2.6], raptor ? 0.05 : 0.03);
}
function sauropod(F, M) {
  const c = column(F, M, [[-6.3, 1.0], [-5.2, 1.7], [-3.9, 2.55], [-2.6, 3.15], [-1.4, 3.45], [-0.2, 3.6], [0.9, 3.75], [1.7, 4.08], [2.4, 4.62], [3.1, 5.3], [3.8, 5.88], [4.45, 6.28], [4.95, 6.42]], 50,
    (t) => [0.06 + 0.13 * smooth(0, 0.38, t) - 0.07 * smooth(0.55, 1, t), 0.05 + 0.36 * bell(t, 0.42, 0.16) + 0.09 * smooth(0.55, 0.62, t) * (1 - smooth(0.9, 1, t)), t > 0.58 ? 0.16 : t > 0.25 ? 0.2 : 0.06],
    { chevron: (t) => (t < 0.3 ? 0.04 + 0.34 * (t / 0.3) : 0), core: 0.03 });
  ribcage(F, M, c, -1.25, 0.95, 11, (u) => [1.5 + 0.3 * Math.sin(u * Math.PI), 0.88 + 0.14 * Math.sin(u * Math.PI)], 0.05);
  const py = c.getPointAt(tAtX(c, -1.45)).y;
  for (const k of [-1, 1]) {
    plate(F, M, -1.45, py - 0.25, k * 0.3, 1.8, 0.75, 0.07);
    bone(F, M, [-1.2, py - 0.6, k * 0.25], [-0.75, 2.15, k * 0.12], 0.09, 0.07);
    bone(F, M, [-1.7, py - 0.6, k * 0.25], [-2.25, 2.3, k * 0.1], 0.08, 0.05);
  }
  for (const k of [1, -1]) {
    const f = k, pad = [-1.3 + 0.12 * f, 0.14, k * 0.62];
    limb(F, M, [[-1.45, 3.0, k * 0.6], [-1.25 + 0.12 * f, 1.75, k * 0.64], [-1.45 + 0.1 * f, 0.55, k * 0.62], pad], [0.2, 0.16, 0.12, 0.1]);
    bone(F, M, [-1.32 + 0.12 * f, 1.7, k * 0.74], [-1.5 + 0.1 * f, 0.62, k * 0.72], 0.06, 0.05);
    toes(F, M, pad, 0, 4, 0.32, 0.06, 1.0, { ground: 0.05, segs: 2, claw: 0.25 });
    const g = -f, hand = V(1.04 - 0.08 * g, 0.1, k * 0.64), wrist = [1.02 - 0.08 * g, 0.62, k * 0.64];
    limb(F, M, [[1.0, 3.25, k * 0.66], [0.9 - 0.1 * g, 2.0, k * 0.68], wrist, hand], [0.18, 0.14, 0.11, 0.1]);
    bone(F, M, [0.9 - 0.1 * g, 1.95, k * 0.76], [wrist[0], 0.66, k * 0.72], 0.07, 0.06);
    for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; rod(F, V(hand.x + Math.cos(a) * 0.09, 0.42, hand.z + Math.sin(a) * 0.09), V(hand.x + Math.cos(a) * 0.12, 0.05, hand.z + Math.sin(a) * 0.12), 0.035, M.bone, 6, 0.04); }
    rod(F, V(hand.x + 0.1, 0.12, hand.z - k * 0.08), V(hand.x + 0.26, 0.04, hand.z - k * 0.1), 0.04, M.claw, 6, 0.003);
    bone(F, M, [1.0, 3.3, k * 0.66], [0.35, 3.9, k * 0.6], 0.12, 0.07);
  }
  const end = c.getPointAt(1);
  sauroSkull(F.sub({ x: end.x - 0.04, y: end.y + 0.03, rz: -0.55 }), M);
  armature(F, M, c, [-1.45, 0.85, -3.9, 2.8], 0.04);
}
function ceratops(F, M) {
  const c = column(F, M, [[-2.6, 0.75], [-1.85, 1.18], [-1.1, 1.55], [-0.35, 1.78], [0.4, 1.76], [1.0, 1.6], [1.4, 1.44], [1.62, 1.38]], 30,
    (t) => [0.035 + 0.07 * smooth(0, 0.4, t) - 0.015 * smooth(0.8, 1, t), 0.04 + 0.2 * bell(t, 0.5, 0.2), t > 0.35 && t < 0.8 ? 0.1 : 0.04],
    { chevron: (t) => (t < 0.4 ? 0.03 + 0.15 * (t / 0.4) : 0), core: 0.014 });
  ribcage(F, M, c, -0.4, 1.1, 9, (u) => [0.82 + 0.22 * Math.sin(u * Math.PI), 0.56 + 0.1 * Math.sin(u * Math.PI)], 0.03);
  const py = c.getPointAt(tAtX(c, -0.4)).y;
  for (const k of [-1, 1]) {
    plate(F, M, -0.4, py - 0.14, k * 0.24, 1.2, 0.36, 0.05);
    const f = k;
    limb(F, M, [[-0.42, 1.45, k * 0.42], [-0.1 + 0.08 * f, 0.86, k * 0.46], [-0.38 + 0.08 * f, 0.4, k * 0.44], [-0.22 + 0.08 * f, 0.07, k * 0.44]], [0.1, 0.08, 0.06, 0.05]);
    toes(F, M, [-0.22 + 0.08 * f, 0.07, k * 0.44], 0, 4, 0.26, 0.035, 0.9, { ground: 0.03, segs: 2, claw: 0.2 });
    const g = -f;
    limb(F, M, [[1.05, 1.22, k * 0.46], [0.86 - 0.06 * g, 0.78, k * 0.62], [1.0 - 0.05 * g, 0.36, k * 0.52], [1.08 - 0.05 * g, 0.06, k * 0.5]], [0.085, 0.065, 0.05, 0.045]);
    toes(F, M, [1.08 - 0.05 * g, 0.06, k * 0.5], 0, 5, 0.18, 0.028, 1.2, { ground: 0.025, segs: 2, claw: 0.2 });
    bone(F, M, [1.05, 1.28, k * 0.46], [0.55, 1.65, k * 0.44], 0.07, 0.04);
  }
  const end = c.getPointAt(1);
  ceraSkull(F.sub({ x: end.x - 0.02, y: end.y + 0.02, rz: -0.32 }), M);
  armature(F, M, c, [-0.4, 0.9], 0.025);
}
/** a flying reptile, wings out: bones along the leading edge, the skin a thin brown membrane back to the legs */
function pterosaur(F, M) {
  bone(F, M, [-0.28, -0.02, 0], [0.22, 0.02, 0], 0.08, 0.06);
  for (let i = 0; i < 5; i++) { const x = -0.15 + i * 0.08; for (const k of [-1, 1]) F.add(tube([V(x, 0.04, 0), V(x - 0.02, -0.03, k * 0.075), V(x - 0.04, -0.1, k * 0.03)], 0.012, 6, 4), M.bone); }
  bone(F, M, [0.22, 0.02, 0], [0.5, 0.14, 0], 0.04, 0.035);
  const S = F.sub({ x: 0.5, y: 0.14, rz: -0.12 }), L = 0.85, H = 0.13, W = 0.1;
  const top = (u, yn) => -H / 2 + yn * H * (1 - 0.85 * u), half = (u, yn) => (W / 2) * (1 - 0.8 * u) * (1 - 0.2 * yn);
  S.add(skullGeo(L, H, W, top, half), M.bone);
  holes(S, M, L, top, half, [[0.12, 0.65, H * 0.22], [0.32, 0.5, H * 0.2, 2.2, 0.8]]);
  S.add(triGeo([0.05, H / 2, 0, 0.4, H * 0.3, 0, -0.35, 0.42, 0]), M.crest);
  rod(F, V(-0.28, -0.02, 0), V(-0.5, -0.04, 0), 0.02, M.bone, 5, 0.005);
  for (const k of [-1, 1]) {
    const d = (p) => p.add(V(0, 0.06 * Math.abs(p.z), 0));
    const sh = d(V(0.12, 0.03, k * 0.07)), el = d(V(0.02, 0.06, k * 0.62)), wr = d(V(0.3, 0.08, k * 1.12)), kn = d(V(0.34, 0.08, k * 1.2));
    const f1 = d(V(0.18, 0.1, k * 1.65)), f2 = d(V(-0.05, 0.08, k * 2.1)), tip = d(V(-0.35, 0.02, k * 2.5));
    limb(F, M, [sh, el, wr, kn], [0.04, 0.034, 0.026]); limb(F, M, [kn, f1, f2, tip], [0.022, 0.018, 0.012, 0.006]);
    for (let i = 0; i < 3; i++) rod(F, wr, wr.clone().add(V(0.12, -0.03, k * (0.01 + i * 0.025))), 0.01, M.claw, 4, 0.002);
    const hip = V(-0.24, -0.04, k * 0.06), knee = V(-0.48, -0.08, k * 0.2), foot = V(-0.7, -0.06, k * 0.24);
    limb(F, M, [hip, knee, foot], [0.025, 0.02, 0.015]);
    const lead = [sh, el, wr, kn, f1, f2, tip], trail = [d(V(-0.24, -0.03, k * 0.07)), d(V(-0.62, -0.06, k * 0.24)), d(V(-0.58, -0.03, k * 0.75)), d(V(-0.5, 0, k * 1.25)), d(V(-0.45, 0.02, k * 1.72)), d(V(-0.42, 0.02, k * 2.15)), tip];
    const tri = [];
    for (let i = 0; i < lead.length - 1; i++) { const a = lead[i], b = lead[i + 1], c = trail[i], e = trail[i + 1]; tri.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, e.x, e.y, e.z); }
    F.add(triGeo(tri), M.membrane);
  }
}
/** the children's dig: a sandbox in a timber frame with a skull, ribs and vertebrae half out of the sand, grid strings and tools */
function digPit(F, M) {
  const w = 3.6, d = 2.6, hg = 0.42;
  for (const [x, z, sw, sd] of [[0, d / 2 - 0.07, w, 0.14], [0, -d / 2 + 0.07, w, 0.14], [w / 2 - 0.07, 0, 0.14, d], [-w / 2 + 0.07, 0, 0.14, d]]) {
    F.box(sw, hg, sd, M.raw, { x, y: hg / 2, z }); F.box(sw + 0.04, 0.05, sd + 0.04, M.oak, { x, y: hg + 0.025, z });
  }
  F.box(w - 0.28, 0.3, d - 0.28, M.sand, { y: 0.15 });
  for (const [x, z, s] of [[-1.2, 0.7, 0.45], [1.25, -0.6, 0.5], [0.9, 0.75, 0.32], [-0.5, -0.8, 0.3]]) F.add(blob(s, Math.round(x * 10 + z * 3 + 20), 1, 0.2), M.sand, { x, y: 0.3, z, sy: 0.28 });
  theroSkull(F.sub({ x: -0.9, y: 0.26, z: -0.1, ry: 0.5, rz: 0.12, rx: 0.25, s: 0.42 }), M, { L: 1.5, H: 0.74, W: 0.52, open: 0.12, teeth: 11 });
  for (let i = 0; i < 5; i++) { const x = 0.15 + i * 0.22; F.add(tube([V(x, 0.28, -0.25), V(x - 0.05, 0.5, 0.05), V(x - 0.1, 0.3, 0.38)], 0.025, 10, 5), M.boneDark); }
  bone(F, M, [0.4, 0.31, 0.75], [1.3, 0.3, 0.45], 0.06, 0.055, M.boneDark);
  for (let i = 0; i < 6; i++) F.cyl(0.05, 0.05, 0.12, M.boneDark, { x: -0.2 + i * 0.25, y: 0.3, z: -0.75 + Math.sin(i) * 0.06, rz: Math.PI / 2 }, 8);
  for (let i = 1; i < 6; i++) { const x = -w / 2 + 0.14 + (i * (w - 0.28)) / 6; rod(F, V(x, hg + 0.06, -d / 2 + 0.1), V(x, hg + 0.06, d / 2 - 0.1), 0.004, M.white, 3); }
  for (let i = 1; i < 4; i++) { const z = -d / 2 + 0.14 + (i * (d - 0.28)) / 4; rod(F, V(-w / 2 + 0.1, hg + 0.06, z), V(w / 2 - 0.1, hg + 0.06, z), 0.004, M.white, 3); }
  const brush = (x, z, a) => { const B = F.sub({ x, y: 0.34, z, ry: a }); B.cyl(0.018, 0.018, 0.3, M.lightWood, { x: 0.15, rz: Math.PI / 2 }, 6); B.box(0.1, 0.05, 0.07, M.darkWood, { x: -0.03 }); B.box(0.08, 0.03, 0.065, M.mustard, { x: -0.03, y: -0.035 }); };
  brush(-0.2, 0.55, 0.4); brush(0.75, -0.25, 2.2); brush(-1.4, -0.7, -0.6);
  const T = F.sub({ x: 1.35, y: 0.34, z: 0.25, ry: -0.8 }); T.cyl(0.02, 0.022, 0.14, M.wood, { x: 0.18, rz: Math.PI / 2 }, 6); T.box(0.2, 0.008, 0.11, M.steel, { x: -0.02 });
  F.cyl(0.13, 0.11, 0.22, M.red, { x: 1.4, y: 0.41, z: -0.9 }, 14); F.add(new THREE.TorusGeometry(0.12, 0.008, 4, 14, Math.PI), M.steel, { x: 1.4, y: 0.52, z: -0.9 });
  F.box(0.4, 0.04, 0.3, M.blue, { x: -0.3, y: 0.32, z: 0.95 }); F.box(0.4, 0.04, 0.3, M.blue, { x: 0.45, y: 0.32, z: -0.98 });
  F.cyl(0.03, 0.03, 1.0, M.oak, { x: -w / 2 + 0.07, y: hg + 0.5, z: d / 2 - 0.07 }, 8);
  const sm = sharedMat("sign:dig", () => signMat(signTex("DIG SITE · TRY A BRUSH", "ochre"), 0.25));
  for (const ry of [0, Math.PI]) F.add(new THREE.PlaneGeometry(1.3, 0.23), sm, { x: -w / 2 + 0.07 + 0.66, y: hg + 0.86, z: d / 2 - 0.07 + (ry ? -0.012 : 0.012), ry });
  F.box(1.34, 0.26, 0.018, M.darkWood, { x: -w / 2 + 0.73, y: hg + 0.86, z: d / 2 - 0.07 });
}

// ---------------------------------------------------------------- the catalog
const build = (fn) => (g, spec) => { const K = new Kit(), M = MM(); fn(frame(K), M, spec, g); K.into(g); };
export const DINO_CATALOG = {
  muSauropod: P("Long-neck skeleton", build((F, M) => {
    const top = dais(F, M, 13.2, 3.6, ["BRACHIOSAURUS", "Late Jurassic · 150 million years ago", "Tall as a four-storey house. It ate from treetops nothing else could reach."], { plaqueX: 4.6, rocks: [[-5.2, 1.1, 0.4], [2.6, -1.2, 0.32], [-2.8, -1.25, 0.26]] });
    sauropod(F.sub({ y: top }), M);
  }), { act: "exhibit", info: "The long-neck, looking down at the door. Its head is nearly at the ceiling.", colliders: rect(13.2, 3.6) }),
  muTRex: P("Tyrant skeleton", build((F, M) => {
    const top = dais(F, M, 9.2, 2.8, ["TYRANNOSAURUS", "Late Cretaceous · 68 million years ago", "Teeth like bananas, and arms too short to scratch its own nose."], { side: -1, plaqueX: 1.5, rocks: [[-3.5, 0.6, 0.35], [3.6, -0.7, 0.28]] });
    theropod(F.sub({ y: top, x: -0.5 }), M, {});
  }), { act: "exhibit", info: "Mid-stride, mouth open. It's a cast of the real thing, every bone of it.", colliders: rect(9.2, 2.8) }),
  muTriceratops: P("Three-horn skeleton", build((F, M) => {
    const top = dais(F, M, 6.0, 2.4, ["TRICERATOPS", "Late Cretaceous · 66 million years ago", "Three horns and a bony frill, perhaps as much for showing off as for defence."], { rocks: [[-2.4, -0.7, 0.3]] });
    ceratops(F.sub({ y: top, x: -0.15 }), M);
  }), { act: "exhibit", info: "Head down, horns forward. The frill was probably brightly coloured.", colliders: rect(6.0, 2.4) }),
  muRaptors: P("Raptor pack", build((F, M) => {
    const top = dais(F, M, 2.6, 2.2, ["DEINONYCHUS", "Early Cretaceous · 115 million years ago", "Fast, feathered and clever, with a sickle claw on each foot. They hunted together."], { out: 0.4 });
    F.add(blob(0.75, 7, 2, 0.28), M.basalt, { x: 0.05, y: top + 0.25, z: -0.1, sx: 1.05, sy: 0.62, sz: 0.85 });
    theropod(F.sub({ x: 0.15, y: top + 0.62, z: -0.15, ry: 0.35, s: 0.21 }), M, { raptor: true, arm: [] });
    theropod(F.sub({ x: -0.55, y: top, z: 0.62, ry: -0.6, s: 0.2 }), M, { raptor: true, stride: -1, arm: [-0.3] });
    theropod(F.sub({ x: 0.65, y: top, z: 0.55, ry: 2.5, s: 0.19 }), M, { raptor: true, arm: [-0.3] });
  }), { act: "exhibit", info: "Three raptors on a rock. One is about to jump.", colliders: rect(2.6, 2.2, 0.5) }),
  muDig: P("Dig pit", build((F, M) => digPit(F, M)), { act: "exhibit", info: "The dig pit. Brush the sand away and there's a skull under there.", colliders: () => [[-1.85, -1.35, 1.85, 1.35]] }),
  muPterosaur: P("Pterosaur", (g, spec) => {
    const K = new Kit(), M = MM(), hang = Math.max(0.6, 7.42 - (spec.y ?? 5.6)), s = spec.s ?? 1, bank = spec.bank ?? 0.12;
    const pivot = new THREE.Group(); pivot.position.y = hang; g.add(pivot);
    pterosaur(frame(K, { y: -hang, s, rx: bank }), M);
    const e = new THREE.Euler(bank, 0, 0);
    for (const p of [V(0, 0.06, 0), V(0.3, 0.12, 1.1), V(0.3, 0.12, -1.1), V(-0.2, 0.1, 2.0), V(-0.2, 0.1, -2.0)]) {
      const q = p.multiplyScalar(s).applyEuler(e); rod(K, V(q.x, q.y - hang, q.z), V(q.x, 0, q.z), 0.004, M.wire, 3);
    }
    K.into(pivot);
    LIVE.swing.push({ o: pivot, a: 0.03, w: 0.42 + ((spec.x || 0) % 3) * 0.05, ph: (spec.z || 0) * 0.7 });
  }, { act: "exhibit", defaultY: 5.6, info: "A pterosaur, gliding over everyone's heads. Not a dinosaur, strictly: a cousin.", colliders: () => [] }),
  muMural: P("Mural", build((F, M) => {
    const w = 16, h = 3.4, y0 = 1.15, mm = sharedMat("mural", () => std("#ffffff", { map: muralTex(), roughness: 0.9 }));
    F.add(new THREE.PlaneGeometry(w, h), mm, { y: y0 + h / 2, z: 0.03 });
    for (const [y, hh] of [[y0 - 0.06, 0.12], [y0 + h + 0.06, 0.12]]) F.box(w + 0.24, hh, 0.08, M.darkWood, { y, z: 0.04 });
    for (const x of [-w / 2 - 0.06, w / 2 + 0.06]) F.box(0.12, h + 0.24, 0.08, M.darkWood, { x, y: y0 + h / 2, z: 0.04 });
    F.box(w, 0.04, 0.05, M.brass, { y: y0 - 0.16, z: 0.06 });
    for (let i = 0; i < 6; i++) pictureLamp(F, M, -w / 2 + ((i + 0.5) * w) / 6, y0 + h + 0.28, 0.42, 1.8);
  }), { flat: true, act: "exhibit", info: "The world 150 million years ago: long-necks wading, a volcano smoking in the distance." }),
  muFossilSlab: P("Fossil slab", build((F, M, spec) => {
    const k = (spec.k ?? 0) % 4, W = 1.25, H = 1.05, y = spec.at ?? 1.95, r = (i) => 0.92 + 0.08 * Math.sin(i * 2.7 + k * 5) + 0.05 * Math.sin(i * 7.1 + k);
    const shape = new THREE.Shape(), n = 22;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * (W / 2) * r(i), yy = Math.sin(a) * (H / 2) * r(i + 3); i ? shape.lineTo(x, yy) : shape.moveTo(x, yy); }
    const back = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    F.add(back, M.limestone, { y, z: 0.01 });
    const face = new THREE.ShapeGeometry(shape), uv = face.attributes.uv, p = face.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H + 0.5);
    const fm = sharedMat("fossil:" + k, () => std("#ffffff", { map: fossilTex(k), roughness: 0.9 }));
    F.add(face, fm, { y, z: 0.092 });
    for (const [x, yy] of [[-0.45, 0.36], [0.45, 0.36], [-0.45, -0.36], [0.45, -0.36]]) F.cyl(0.02, 0.02, 0.05, M.brass, { x, y: y + yy, z: 0.09, rx: Math.PI / 2 }, 8);
    const names = [["Ammonite", "Fossil shell · 180 million years"], ["Fossil fish", "Limestone · 50 million years"], ["Sea turtle", "Fossil shell · 75 million years"], ["Fern frond", "Coal shale · 300 million years"]][k];
    const lm = sharedMat("lab:" + names[0], () => std("#ffffff", { map: labelTex(...names), roughness: 0.6 }));
    F.add(new THREE.PlaneGeometry(0.4, 0.2), lm, { y: y - H / 2 - 0.22, z: 0.03 });
  }), { flat: true, act: "exhibit", info: "Pressed in stone a very long time ago." }),
};
