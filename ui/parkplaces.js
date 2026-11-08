// parkplaces.js - the places in Central Park where people stop and talk, and everything that fills the land between them.
// The tea hill's nine stone-walled tiers and the pavilion on top, the amphitheatre, the wish tree, the picnic hill, the cafe
// terrace, the wisteria pergola, the hammock grove, the holo-fire circle, the zen garden, the glasshouse, four quiet circles,
// gates on the ring walk, woods all round the edge, groves, meadows of flowers and butterflies.
// All drawn here (no model files), merged per material like the rest of the park. parkhub.js keeps the land itself.
import * as THREE from "three";
import { Kit, canvasTex } from "./mainhub.js";
import { PK, parkHeightAt, parkWalkable } from "./parkhub.js";

const { CX, CZ, TEA, PLACES, CIRCLES, PERGOLA, PATHS, RING_R, EDGE_R, DIRS, AVENUE_END, POND, LOOK, PLAZA, STREAM } = PK;
const { seeded, smooth, lerp, faceTo, P, floorOf, PARK_U, NOISE, rockGeo, ribbon, segDist, onPath, inPlace, clearOfStream, pmats } = PK;
const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = (lx, lz) => [lx + CX, lz + CZ];
/** ground height (relative to the item) at a point given in the item's own frame (it is never turned) */
const groundOf = (s) => (x, z) => parkHeightAt(s.x + x, s.z + z) - (s.y || 0);
const pick = (arr, n) => arr[((Math.round(n) % arr.length) + arr.length) % arr.length];
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const hash = (x, y, z) => { const s = Math.sin(Math.round(x * 991) * 0.1271 + Math.round(y * 991) * 0.3117 + Math.round(z * 991) * 0.0747) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- shapes
/** a lumpy blob: corners pushed in and out by where they are, so faces that share a corner stay joined */
function blob(r, detail = 1, lump = 0.22, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (hash(x + seed, y - seed, z) - 0.5) * 2 * lump; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
}
const tube = (pts, r, seg = 0, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg || Math.max(8, pts.length * 8), r, rs, false);
/** a tube that thins from r0 to r1 */
function taper(pts, r0, r1, seg = 16, rs = 10) {
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, seg, 1, rs, false), p = g.attributes.position, c = V();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c); const r = lerp(r0, r1, i / seg);
    for (let j = 0; j <= rs; j++) { const k = i * (rs + 1) + j; p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r); }
  }
  g.computeVertexNormals(); return g;
}
/** a flat sector of a ring; angles like the park's (x = r sin a, z = r cos a) */
const sector = (r0, r1, a0, len, n = 48) => new THREE.RingGeometry(r0, r1, n, 1, a0 - Math.PI / 2, len).rotateX(-Math.PI / 2);
/** an open wall on a circle, seen from outside; inward() turns it to face the middle */
const arcWall = (r, h, a0, len, n = 48) => new THREE.CylinderGeometry(r, r, h, n, 1, true, a0, len);
function inward(g) {
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
/** a disc laid on the ground (follows it), lifted lift */
function groundDisc(r, gy, lift = 0.04, seg = 48, rings = 6, x0 = 0, z0 = 0) {
  const g = new THREE.RingGeometry(0.001, r, seg, rings).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, gy(p.getX(i) + x0, p.getZ(i) + z0) + lift);
  g.translate(x0, 0, z0); g.computeVertexNormals(); return g;
}
/** sway weight in uv.y (0 where it hangs from / stands on, 1 at the free end), for the sway shaders */
function swayUV(g, y0, y1) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = 0.5; uv[i * 2 + 1] = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g;
}
/** offsets a [[x, z]] line sideways by d */
function offsetLine(pts, d) {
  return pts.map(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)], tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1;
    return [x - (tz / tl) * d, z + (tx / tl) * d];
  });
}
/** many copies of one shape, each with its own place and colour */
class Inst {
  constructor(geo, mat, cast = false) { this.geo = geo; this.mat = mat; this.cast = cast; this.m = []; this.c = []; }
  put(x, y, z, s = 1, ry = 0, color = null, sy = s, rx = 0, rz = 0) {
    this.m.push(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V(s, sy, s)));
    if (color != null) this.c.push(color instanceof THREE.Color ? color : new THREE.Color(color));
  }
  into(g) {
    const n = this.m.length; if (!n) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.m.forEach((m, i) => im.setMatrixAt(i, m));
    if (this.c.length === n) this.c.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = this.cast; im.receiveShadow = true; im.computeBoundingSphere?.(); g.add(im); return im;
  }
}
const merge = (list) => { const k = new Kit(); const tmp = new THREE.Group(); const m = new THREE.MeshBasicMaterial(); for (const g of list) k.add(g, m); k.into(tmp); const geo = tmp.children[0].geometry; return geo; };

// ---------------------------------------------------------------- pictures
const gingham = (c) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = "#fbf7f0"; g.fillRect(0, 0, w, w);
  g.fillStyle = c; g.globalAlpha = 0.5; for (let i = 0; i < 8; i++) { g.fillRect(i * 32, 0, 16, w); g.fillRect(0, i * 32, w, 16); }
  g.globalAlpha = 0.5; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(i * 32, j * 32, 16, 16);
  g.globalAlpha = 1; g.fillStyle = "rgba(255,255,255,.08)"; for (let i = 0; i < 3000; i++) g.fillRect(Math.random() * w, Math.random() * w, 1, 1);
}, { repeat: [3, 3] });
const stripes = (a, b, n = 16) => canvasTex(512, 64, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); } });
const wicker = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = "#a9773f"; g.fillRect(0, 0, w, w);
  for (let y = 0; y < w; y += 16) for (let x = 0; x < w; x += 16) { const o = ((x + y) / 16) % 2; g.fillStyle = o ? "#d9a764" : "#c58f4e"; g.fillRect(x + 1, y + 2 + o * 2, 14, 10); g.fillStyle = "rgba(60,35,10,.35)"; g.fillRect(x, y + 13, 16, 2); }
}, { repeat: [4, 1] });
const radial = () => canvasTex(256, 256, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, { srgb: false });
/** stone setts in rings, for the paved circles */
const setts = () => canvasTex(1024, 1024, (g, w) => {
  const c = w / 2, r = seeded(12);
  g.fillStyle = "#e9e3d7"; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "110,96,80" : "255,255,255"},${0.03 + r() * 0.04})`; g.fillRect(r() * w, r() * w, 2, 2); }
  g.strokeStyle = "rgba(128,114,98,.4)"; g.lineWidth = 2.5;
  for (let rr = 40; rr < c; rr += 34) { g.beginPath(); g.arc(c, c, rr, 0, TAU); g.stroke(); const n = Math.round(rr / 9); for (let i = 0; i < n; i++) { const a = ((i + (rr / 34) % 2 * 0.5) / n) * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.lineTo(c + Math.cos(a) * (rr + 34), c + Math.sin(a) * (rr + 34)); g.stroke(); } }
  g.fillStyle = "rgba(170,140,100,.3)"; g.beginPath(); g.arc(c, c, 200, 0, TAU); g.arc(c, c, 176, 0, TAU, true); g.fill();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60); g.lineTo(c + Math.cos(a + 0.12) * 170, c + Math.sin(a + 0.12) * 170); g.lineTo(c + Math.cos(a) * 196, c + Math.sin(a) * 196); g.lineTo(c + Math.cos(a - 0.12) * 170, c + Math.sin(a - 0.12) * 170); g.closePath(); g.fill(); }
});
/** raked gravel: ripples round each stone, straight furrows everywhere else. rocks: [[x, z, r]] in metres from the middle, R the disc's radius */
const zenTex = (rocks, R) => canvasTex(1024, 1024, (g, w) => {
  const k = w / (2 * R), X = (x) => (x / R + 1) * w / 2, Y = (z) => (z / R + 1) * w / 2;
  g.fillStyle = "#e4ded2"; g.fillRect(0, 0, w, w);
  const r = seeded(3); for (let i = 0; i < 40000; i++) { const l = 190 + r() * 60; g.fillStyle = `rgba(${l},${l - 6},${l - 16},.5)`; g.fillRect(r() * w, r() * w, 2, 2); }
  const groove = (draw) => { g.lineWidth = 5; g.strokeStyle = "rgba(120,108,92,.42)"; draw(0); g.lineWidth = 3; g.strokeStyle = "rgba(255,252,246,.55)"; draw(3); };
  g.save(); g.beginPath(); g.rect(0, 0, w, w); for (const [x, z, rr] of rocks) g.arc(X(x), Y(z), (rr + 1.9) * k, 0, TAU); g.clip("evenodd");
  groove((o) => { for (let y = 8; y < w; y += 22) { g.beginPath(); g.moveTo(0, y + o); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + o + Math.sin(x * 0.004) * 6); g.stroke(); } });
  g.restore();
  for (const [x, z, rr] of rocks) groove((o) => { for (let d = rr + 0.25; d < rr + 1.95; d += 0.3) { g.beginPath(); g.arc(X(x), Y(z), d * k + o * 0.5, 0, TAU); g.stroke(); } });
}, { repeat: null });
/** the stage banners: original abstract emblems (no characters, no words) */
const stageBanner = (hue) => canvasTex(256, 768, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${hue},70%,22%)`); gr.addColorStop(0.6, `hsl(${(hue + 40) % 360},75%,46%)`); gr.addColorStop(1, `hsl(${(hue + 70) % 360},85%,62%)`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w / 2, 250, 30 + i * 16, 0, TAU); g.stroke(); }
  const star = (cx, cy, R, r2) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? r2 : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  g.fillStyle = "#fff6e0"; g.shadowColor = "#fff"; g.shadowBlur = 24; star(w / 2, 250, 92, 22); g.shadowBlur = 0;
  g.fillStyle = "rgba(255,255,255,.85)"; star(60, 470, 22, 6); star(196, 540, 16, 4); star(80, 640, 12, 3);
  g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 30, w, 6);
  for (let x = 8; x < w; x += 24) { g.beginPath(); g.moveTo(x, h - 24); g.lineTo(x + 12, h); g.lineTo(x + 24, h - 24); g.fill(); }
}, { repeat: null });
const gateSign = (text) => canvasTex(1024, 192, (g, w, h) => {
  g.fillStyle = "#fbf8f1"; const rr = 60; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, rr); g.fill();
  g.strokeStyle = "#7fd7c4"; g.lineWidth = 8; g.beginPath(); g.roundRect(20, 20, w - 40, h - 40, rr - 14); g.stroke();
  g.fillStyle = "#3d6b4a"; g.font = "900 92px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 6);
  for (const s of [-1, 1]) { const cx = w / 2 + s * (g.measureText(text).width / 2 + 60); g.fillStyle = "#79b85a"; g.beginPath(); g.ellipse(cx, h / 2, 22, 40, s * 0.6, 0, TAU); g.fill(); }
}, { repeat: null });

// ---------------------------------------------------------------- materials
let XM = null;
function swayMat(base, amp, speed, key) {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = PARK_U.uTime;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 sph = instanceMatrix[3].xz;
#else
  vec2 sph = (modelMatrix * vec4(position, 1.0)).xz;
#endif
  float swp = sph.x * 0.37 + sph.y * 0.29, sww = uv.y;
  transformed.x += sin(uTime * ${speed.toFixed(2)} + swp) * ${amp.toFixed(3)} * sww;
  transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + swp * 1.3) * ${(amp * 0.7).toFixed(3)} * sww;`);
  };
  base.customProgramCacheKey = () => `sway-${key}`;
  return base;
}
function xm() {
  if (XM) return XM;
  const T = pmats(), M = T.M, std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...o });
  const glass = std({ color: 0xe6f7f6, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  glass.userData.noShadow = true;
  XM = {
    T, M, glass,
    hedge: std({ color: 0x46723a, roughness: 0.95, flatShading: true }), hedge2: std({ color: 0x5a8b40, roughness: 0.95, flatShading: true }),
    leaf: swayMat(std({ color: 0xffffff, roughness: 0.9, flatShading: true }), 0.12, 0.9, "crown"),
    bush: std({ color: 0xffffff, roughness: 0.95, flatShading: true }),
    bark: M.bark, birch: std({ color: 0xeae6dc, roughness: 0.8 }),
    gold: std({ color: 0xd8b260, metalness: 0.75, roughness: 0.32 }),
    roof: std({ color: 0xf6f3ec, roughness: 0.6, side: THREE.DoubleSide }),
    lantern: std({ color: 0xfff3dc, emissive: 0xffb760, emissiveIntensity: 1.7, roughness: 0.6 }),
    lanternCyan: std({ color: 0xeafcff, emissive: 0x6fe3ff, emissiveIntensity: 1.6, roughness: 0.6 }),
    bulb: basic(0xffe2a8), wire: std({ color: 0x3b3f45, roughness: 0.6 }),
    gingham: [gingham("#d8504c"), gingham("#4f8fd1"), gingham("#e2a93b"), gingham("#5ea86a")].map((map) => std({ map, roughness: 0.95, side: THREE.DoubleSide })),
    wicker: std({ map: wicker(), roughness: 0.9 }),
    parasol: [["#fbf6ee", "#ef8aa8"], ["#fbf6ee", "#58bfd6"], ["#fbf6ee", "#f0bf45"], ["#fbf6ee", "#86c46c"]].map(([a, b]) => std({ map: stripes(a, b), roughness: 0.85, side: THREE.DoubleSide })),
    canvasStripe: std({ map: stripes("#f6efe2", "#e7835f", 10), roughness: 0.9, side: THREE.DoubleSide }),
    fabric: [0xf2a7b8, 0x8fc9e6, 0xf3cf6e, 0xa7d68a, 0xc3a6ea, 0xf6f0e4].map((color) => std({ color, roughness: 0.95 })),
    fruit: [0xd94a3a, 0x8cc04a, 0xf2b33a, 0x7a3f8f].map((color) => std({ color, roughness: 0.45 })),
    bread: std({ color: 0xd9a35a, roughness: 0.8 }), porcelain: std({ color: 0xfbfaf6, roughness: 0.25 }),
    wisteria: [0xc9b2f0, 0xa98be0, 0xe3d6fa].map((color, i) => swayMat(std({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.8, flatShading: true }), 0.22, 1.1 + i * 0.13, `wis${i}`)),
    vine: std({ color: 0x5f8f45, roughness: 0.9, flatShading: true }),
    bamboo: std({ color: 0x95b85c, roughness: 0.5 }), bambooNode: std({ color: 0x6f8f3e, roughness: 0.6 }),
    bambooLeaf: swayMat(std({ color: 0x6e9e45, roughness: 0.8, side: THREE.DoubleSide }), 0.25, 1.4, "bamboo"),
    tropic: swayMat(std({ color: 0x2f8a54, roughness: 0.7, side: THREE.DoubleSide }), 0.08, 1.2, "tropic"),
    maple: swayMat(std({ color: 0xd8513a, roughness: 0.85, flatShading: true }), 0.1, 1.0, "maple"),
    bloom: [0xff7a59, 0xf04f9a, 0xffc93c, 0xffffff, 0xb57bff].map((color) => std({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.6 })),
    soil: M.soil, sand: std({ color: 0xe9e2d4, roughness: 1 }), darkStone: std({ color: 0x77736c, roughness: 0.9, flatShading: true }),
    moss: std({ color: 0x6f8f46, roughness: 1, flatShading: true }),
    sett: std({ map: setts(), roughness: 0.8 }),
    pool: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    pool2: T.pool,
    lightPool: new THREE.MeshBasicMaterial({ map: radial(), color: 0x3fd6ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6 }),
    tag: swayMat(basic(0xffffff, { side: THREE.DoubleSide }), 0.06, 2.1, "tag"),
    fly: null,
    holoFire: new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false, uniforms: { uTime: PARK_U.uTime },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime; varying vec2 vUv;
${NOISE}
void main(){ float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y;
  float n = noise(vec2(vUv.x * 5.0, y * 4.0 - uTime * 2.4)) * 0.6 + noise(vec2(vUv.x * 11.0 + 3.0, y * 9.0 - uTime * 4.1)) * 0.4;
  float wid = (1.0 - y) * (0.7 + 0.55 * n);
  float f = (1.0 - smoothstep(wid - 0.28, wid, x)) * (1.0 - smoothstep(0.62, 1.0, y + n * 0.25));
  float core = (1.0 - smoothstep(wid * 0.2, wid * 0.55, x)) * (1.0 - smoothstep(0.1, 0.55, y));
  vec3 c = mix(vec3(0.18, 0.75, 1.0), vec3(0.75, 0.98, 1.0), core) + vec3(1.0, 0.78, 0.35) * smoothstep(0.45, 0.9, y) * 0.35;
  float scan = 0.78 + 0.22 * sin(y * 90.0 - uTime * 7.0);
  gl_FragColor = vec4(c * scan * 1.5, f); }`,
    }),
    screen: new THREE.ShaderMaterial({
      uniforms: { uTime: PARK_U.uTime }, toneMapped: false, fog: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime; varying vec2 vUv;
void main(){ vec2 p = vUv; float i = floor(p.x * 28.0), fx = fract(p.x * 28.0);
  float h = 0.18 + 0.6 * (0.5 + 0.5 * sin(uTime * 2.3 + i * 0.9)) * (0.6 + 0.4 * sin(uTime * 1.1 + i * 0.37));
  float bar = step(0.18, fx) * step(fx, 0.82) * step(p.y, h) * step(0.06, p.y);
  vec3 c = mix(vec3(0.2, 0.85, 1.0), vec3(1.0, 0.45, 0.8), clamp(p.y / max(h, 0.01), 0.0, 1.0)) * bar;
  float ring = 0.5 + 0.5 * sin(length((p - vec2(0.5, 0.66)) * vec2(2.0, 1.0)) * 34.0 - uTime * 2.6);
  c += vec3(0.35, 0.25, 0.85) * ring * 0.16 + vec3(0.02, 0.03, 0.08);
  float e = smoothstep(0.0, 0.015, p.x) * smoothstep(0.0, 0.015, 1.0 - p.x) * smoothstep(0.0, 0.03, p.y) * smoothstep(0.0, 0.03, 1.0 - p.y);
  gl_FragColor = vec4(c * (0.85 + 0.15 * sin(p.y * 320.0)) * e * 1.3, 1.0);
  #include <colorspace_fragment>
}`,
    }),
  };
  XM.pool = T.pool;
  const fly = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
  fly.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = PARK_U.uTime;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  float fa = sin(uTime * 17.0 + instanceMatrix[3].y * 23.0) * 1.05;
  transformed = vec3(transformed.x * cos(fa), transformed.y + abs(transformed.x) * sin(fa), transformed.z);`);
  };
  fly.customProgramCacheKey = () => "butterfly";
  XM.fly = fly;
  for (const m of Object.values(XM)) { if (m?.isMaterial) m.userData.shared = true; if (Array.isArray(m)) for (const k of m) if (k?.isMaterial) k.userData.shared = true; }
  return XM;
}

// ---------------------------------------------------------------- little things used everywhere
/** a paper lantern hanging at x, y (its top), z; returns where its light is */
function lantern(K, X, x, y, z, s = 1, mat = X.lantern) {
  K.cyl(0.006, 0.006, 0.3 * s, X.wire, { x, y: y - 0.15 * s, z }, 4);
  K.cyl(0.07 * s, 0.1 * s, 0.05 * s, X.T.darkMetal, { x, y: y - 0.32 * s, z }, 10);
  K.add(new THREE.SphereGeometry(0.2 * s, 14, 10), mat, { x, y: y - 0.56 * s, z, sy: 1.3 });
  for (let i = 0; i < 3; i++) K.add(new THREE.TorusGeometry(0.2 * s * Math.sin((i + 1) * 0.785), 0.006, 4, 18).rotateX(Math.PI / 2), X.T.darkMetal, { x, y: y - 0.56 * s + (i - 1) * 0.15 * s, z });
  K.cyl(0.1 * s, 0.07 * s, 0.05 * s, X.T.darkMetal, { x, y: y - 0.84 * s, z }, 10);
  return V(x, y - 0.56 * s, z);
}
function halo(g, p, s = 1.6, mat) { const h = new THREE.Sprite(mat); h.position.copy(p); h.scale.setScalar(s); g.add(h); return h; }
/** a string of bulbs sagging from a to b */
function bulbs(K, X, a, b, sag = 0.6, n = 12) {
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t), 0))); }
  K.add(tube(pts, 0.012, 24, 4), X.wire);
  for (let i = 1; i < n; i++) { const t = i / n, p = a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t) - 0.06, 0)); K.add(new THREE.SphereGeometry(0.055, 8, 6), X.bulb, { x: p.x, y: p.y, z: p.z }); }
}
/** a lantern post (a shepherd's hook) with its lantern */
function hookPost(K, X, x, y, z, a, mat) {
  K.cyl(0.05, 0.07, 2.4, X.T.darkMetal, { x, y: y + 1.2, z }, 8);
  const s = Math.sin(a), c = Math.cos(a);
  K.add(tube([V(x, y + 2.35, z), V(x + s * 0.15, y + 2.62, z + c * 0.15), V(x + s * 0.42, y + 2.6, z + c * 0.42), V(x + s * 0.55, y + 2.4, z + c * 0.55)], 0.035, 16, 6), X.T.darkMetal);
  return lantern(K, X, x + s * 0.55, y + 2.4, z + c * 0.55, 0.85, mat);
}
/** a leafy tree drawn whole (for the few that are part of a place) */
function bigTree(K, X, x, y, z, H, R, seed, mats) {
  const r = seeded(seed);
  K.add(taper([V(x, y - 0.2, z), V(x + 0.2, y + H * 0.35, z - 0.1), V(x - 0.1, y + H * 0.7, z + 0.15)], 0.45 * R / 4, 0.25 * R / 4, 12, 10), X.bark);
  for (let b = 0; b < 5; b++) { const a = (b / 5) * TAU + r(), e = V(x + Math.cos(a) * R * 0.6, y + H * (0.8 + r() * 0.2), z + Math.sin(a) * R * 0.6); K.add(taper([V(x, y + H * 0.55, z), V(x + Math.cos(a) * R * 0.3, y + H * 0.72, z + Math.sin(a) * R * 0.3), e], 0.16 * R / 4, 0.06, 10, 6), X.bark); }
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R, yy = y + H * 0.75 + (1 - d / R) * H * 0.45 + r() * 0.8;
    K.add(blob(0.9 + r() * 0.8, 1, 0.25, i + seed), mats[i % mats.length], { x: x + Math.cos(a) * d, y: yy, z: z + Math.sin(a) * d, sy: 0.8, ry: r() * TAU });
  }
}
/** a small flower bed: a ring of blooms round a few leaves */
function flowerClump(K, X, x, y, z, r, n = 9) {
  const rr = seeded(Math.round(x * 31 + z * 17));
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, d = Math.sqrt(rr()) * 0.5, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    K.add(blob(0.16 + rr() * 0.08, 0, 0.2, i), X.vine, { x: px, y: y + 0.1, z: pz, sy: 0.7 });
    K.add(blob(0.07 + rr() * 0.05, 0, 0.15, i + 9), pick(X.bloom, i + Math.round(x)), { x: px + 0.05, y: y + 0.26, z: pz });
  }
}

// ---------------------------------------------------------------- the pieces
export const PLACES_CATALOG = {
  /** the walks between the places, and the ring walk round the park, gravel edged in light */
  pkPaths: P("Park walks", (g) => {
    const T = pmats(), K = new Kit();
    const inWater = (x, z) => { const s = PK.nearStream(x, z); return (s && s.d < STREAM.hw[s.i] + 1.2) || PK.onAnyDeck(x, z); };
    for (const [pts, w] of PATHS) {
      K.add(ribbon(pts, w, 0.055, 0.6, inWater), T.path);
      for (const sd of [-1, 1]) K.add(ribbon(offsetLine(pts, sd * w / 2), 0.12, 0.075, 0.6, inWater), T.edge);
    }
    const ring = []; for (let i = 0; i <= 200; i++) { const a = (i / 200) * TAU; ring.push([Math.sin(a) * RING_R, Math.cos(a) * RING_R]); }
    K.add(ribbon(ring, 3.8, 0.055, 0.8), T.path);
    for (const rr of [RING_R - 1.9, RING_R + 1.9]) { const L = ring.map(([x, z]) => [x * rr / RING_R, z * rr / RING_R]); K.add(ribbon(L, 0.12, 0.075, 0.8), T.edge); }
    K.into(g, { cast: false }); floorOf(g);
  }, { flat: true, walk: true, stay: true, colliders: () => [], info: "Gravel walks between the places, and the long ring walk round the whole park." }),

  /** the tea hill: nine stone-walled tiers of tea, flowers along every lip, the white pavilion on top */
  pkTea: P("Tea terraces", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(61);
    const teaPaths = [PATHS[0], PATHS[1]].map(([pts, w]) => [pts.map(([x, z]) => [x - TEA.x, z - TEA.z]), w]);
    const onTeaPath = (x, z, pad = 0) => teaPaths.some(([L, w]) => L.some((p, i) => i && segDist(x, z, L[i - 1], p) < w / 2 + pad));
    const radii = []; for (let j = 0; j < 9; j++) radii.push(PK.teaR((j + 0.965) * TEA.step));
    const flowers = new Inst(blob(0.09, 0, 0.2, 2), X.bloom[3]), cols = [0xff8fb0, 0xffd45c, 0xffffff, 0xc39bff, 0xff7a59];
    radii.forEach((R, j) => {
      const n = Math.max(24, Math.round((TAU * R) / 0.5)), lo = [], hi = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; lo.push(gy(Math.sin(a) * (R + 0.55), Math.cos(a) * (R + 0.55))); hi.push(gy(Math.sin(a) * (R - 0.55), Math.cos(a) * (R - 0.55))); }
      // the wall: one strip per run between path gaps, a white coping on top
      let run = null; const flush = () => { if (run && run.length > 1) wallRun(run); run = null; };
      const wallRun = (ids) => {
        const pos = [], uv = [], idx = [], cp = [], cidx = [];
        ids.forEach((i, k) => {
          const a = (i / n) * TAU, sx = Math.sin(a), cz = Math.cos(a), top = hi[i] + 0.12, bot = lo[i] - 0.3, al = (a * R) / 2;
          pos.push(sx * R, bot, cz * R, sx * R, top, cz * R); uv.push(al, bot / 2, al, top / 2);
          cp.push(sx * (R + 0.05), top, cz * (R + 0.05), sx * (R - 0.42), top, cz * (R - 0.42));
          if (k) { const b = (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); cidx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        });
        for (const [P2, I, m] of [[pos, idx, T.stone], [cp, cidx, T.white]]) {
          const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(P2, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(m === T.stone ? uv : new Array(P2.length / 3 * 2).fill(0), 2)); geo.setIndex(I); geo.computeVertexNormals(); K.add(geo, m);
        }
      };
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, x = Math.sin(a) * R, z = Math.cos(a) * R;
        if (onTeaPath(x, z, 0.2)) { flush(); continue; }
        (run ??= []).push(i);
      }
      flush();
      // steps where a path climbs the riser
      for (const [L, w] of teaPaths) for (let i = 1; i < L.length; i++) {
        const [ax, az] = L[i - 1], [bx, bz] = L[i], da = Math.hypot(ax, az), db = Math.hypot(bx, bz);
        if ((da - R) * (db - R) > 0) continue;
        const t = (da - R) / (da - db), px = lerp(ax, bx, t), pz = lerp(az, bz, t), a = Math.atan2(px, pz), yl = gy(Math.sin(a) * (R + 0.7), Math.cos(a) * (R + 0.7)), yh = gy(Math.sin(a) * (R - 0.6), Math.cos(a) * (R - 0.6));
        for (let k = 0; k < 2; k++) { const h = lerp(yl, yh, (k + 1) / 3) - yl, d = R + 0.55 - k * 0.38; K.box(w + 0.4, h + 0.25, 0.4, T.stone, { x: Math.sin(a) * d, z: Math.cos(a) * d, y: yl + (h - 0.25) / 2, ry: a, uv: 1 }); }
        for (const sd of [-1, 1]) { const cx = Math.sin(a) * R + Math.cos(a) * sd * (w / 2 + 0.35), cz2 = Math.cos(a) * R - Math.sin(a) * sd * (w / 2 + 0.35); K.box(0.5, yh - yl + 0.7, 1.3, T.white, { x: cx, z: cz2, y: (yl + yh) / 2 + 0.1, ry: a }); K.add(new THREE.SphereGeometry(0.16, 12, 8), X.lantern, { x: cx, y: yh + 0.62, z: cz2 }); }
      }
      // flowers along the lip of the tier below the wall, and the tea hedges on the tier above it
      const fr = R + 0.85;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.02, x = Math.sin(a) * fr, z = Math.cos(a) * fr; if (onTeaPath(x, z, 0.4) || j === 0) continue; flowers.put(x, gy(x, z) + 0.22 + r() * 0.06, z, 0.8 + r() * 0.6, r() * 3, cols[(i + j) % cols.length]); }
      const inner = j < 8 ? radii[j + 1] : 4.9, hr = inner + 0.85;
      if (R - inner > 1.9 && j < 8) {
        const m = Math.round((TAU * hr) / 0.55), mat = j % 2 ? X.hedge : X.hedge2;
        for (let i = 0; i < m; i++) { const a = (i / m) * TAU, x = Math.sin(a) * hr, z = Math.cos(a) * hr; if (onTeaPath(x, z, 0.5)) continue; K.add(blob(0.44 + r() * 0.1, 1, 0.18, i * 7 + j), mat, { x, y: gy(x, z) + 0.32, z, sy: 0.78, ry: r() * TAU }); }
      }
    });
    // round the foot of the hill: low tea bushes in rows
    for (let ring2 = 0; ring2 < 2; ring2++) { const hr = radii[0] + 1.8 + ring2 * 1.6, m = Math.round((TAU * hr) / 0.6); for (let i = 0; i < m; i++) { const a = (i / m) * TAU, x = Math.sin(a) * hr, z = Math.cos(a) * hr; if (onTeaPath(x, z, 0.6) || !parkWalkable(s.x + x, s.z + z) || onPath(x + TEA.x, z + TEA.z)) continue; K.add(blob(0.4, 1, 0.2, i + 99 * ring2), X.hedge2, { x, y: gy(x, z) + 0.26, z, sy: 0.7 }); } }
    flowers.into(g);
    // the pavilion: octagonal, eight white columns, a sweeping roof with gold ridges and a finial, lanterns at every corner
    const F = PK.gazY() + 0.32 - s.y, R8 = 4.0, colA = (k) => (k / 8) * TAU;
    K.cyl(4.42, 4.55, 0.55, T.white, { y: F - 0.275 }, 8); K.cyl(5.05, 5.15, 0.2, T.stone, { y: F - 0.42 }, 8);
    K.add(new THREE.CircleGeometry(4.3, 8).rotateX(-Math.PI / 2).rotateY(0), X.M.planks, { y: F + 0.005, uv: 1.6 });
    K.add(new THREE.TorusGeometry(4.46, 0.03, 4, 8).rotateX(Math.PI / 2), T.goldGlow, { y: F - 0.02 });
    for (let k = 0; k < 8; k++) {
      const a = colA(k), x = Math.sin(a) * R8, z = Math.cos(a) * R8;
      K.cyl(0.13, 0.15, 3.0, T.white, { x, z, y: F + 1.5 }, 14); K.box(0.42, 0.14, 0.42, X.gold, { x, z, y: F + 0.07, ry: a }); K.box(0.4, 0.12, 0.4, X.gold, { x, z, y: F + 2.95, ry: a });
    }
    K.add(arcWall(4.15, 0.3, 0, TAU, 8), T.white, { y: F + 3.12 }); K.add(inward(arcWall(4.13, 0.3, 0, TAU, 8)), T.white, { y: F + 3.12 });
    K.add(arcWall(4.17, 0.04, 0, TAU, 8), T.goldGlow, { y: F + 2.96 });
    const prof = [[5.85, 3.62], [5.55, 3.45], [5.0, 3.5], [4.2, 3.72], [3.3, 4.15], [2.4, 4.75], [1.5, 5.45], [0.75, 6.05], [0.3, 6.4], [0.001, 6.5]].map(([x, y]) => new THREE.Vector2(x, y + F));
    K.add(new THREE.LatheGeometry(prof, 8), X.roof);
    K.add(new THREE.RingGeometry(0.3, 5.5, 8).rotateX(Math.PI / 2), T.timber, { y: F + 3.43 });
    for (let k = 0; k < 8; k++) { const a = colA(k), pts = prof.slice(0, -1).map((v) => V(Math.sin(a) * v.x * 1.005, v.y + 0.05, Math.cos(a) * v.x * 1.005)); K.add(tube(pts, 0.06, 30, 6), X.gold); K.add(new THREE.SphereGeometry(0.11, 10, 8), X.gold, { x: Math.sin(a) * 5.9, y: F + 3.7, z: Math.cos(a) * 5.9 }); }
    K.add(new THREE.SphereGeometry(0.3, 16, 12), X.gold, { y: F + 6.7 }); K.add(new THREE.ConeGeometry(0.13, 1.1, 12), X.gold, { y: F + 7.4 }); K.add(new THREE.TorusGeometry(0.22, 0.03, 6, 20).rotateX(Math.PI / 2), X.gold, { y: F + 6.95 });
    const glows = [];
    for (let k = 0; k < 8; k++) { const a = colA(k), p = lantern(K, X, Math.sin(a) * 5.2, F + 3.42, Math.cos(a) * 5.2, 1); glows.push(p); }
    // the low railing on six sides (two open to the paths) and the tea table
    const openSides = teaPaths.map(([L]) => { const [x, z] = L === teaPaths[0][0] ? L[L.length - 1] : L[0]; return Math.atan2(x, z); });
    const colliders = [];
    for (let k = 0; k < 8; k++) {
      const a0 = colA(k), a1 = colA(k + 1), mid = (a0 + a1) / 2;
      if (openSides.some((o) => Math.abs(angDiff(mid, o)) < 0.45)) continue;
      const p0 = V(Math.sin(a0) * R8, 0, Math.cos(a0) * R8), p1 = V(Math.sin(a1) * R8, 0, Math.cos(a1) * R8), len = p0.distanceTo(p1), ry = Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2;
      const m = p0.clone().lerp(p1, 0.5);
      K.box(len - 0.3, 0.08, 0.12, T.white, { x: m.x, z: m.z, y: F + 0.9, ry }); K.box(len - 0.3, 0.06, 0.1, T.white, { x: m.x, z: m.z, y: F + 0.15, ry });   // the rails run along the side, post to post
      for (let b = 1; b < 9; b++) { const q = p0.clone().lerp(p1, b / 9); K.cyl(0.03, 0.03, 0.72, T.white, { x: q.x, z: q.z, y: F + 0.52 }, 6); }
      for (let b = 0; b < 4; b++) { const q = p0.clone().lerp(p1, (b + 0.5) / 4); colliders.push([q.x - 0.35, q.z - 0.35, q.x + 0.35, q.z + 0.35]); }
    }
    for (let k = 0; k < 8; k++) { const a = colA(k), x = Math.sin(a) * R8, z = Math.cos(a) * R8; colliders.push([x - 0.25, z - 0.25, x + 0.25, z + 0.25]); }
    K.cyl(0.75, 0.75, 0.06, T.timber, { y: F + 0.38 }, 32); K.cyl(0.12, 0.2, 0.36, T.timber, { y: F + 0.18 }, 12);
    K.add(new THREE.LatheGeometry([[0.001, 0], [0.12, 0.01], [0.16, 0.08], [0.15, 0.15], [0.09, 0.2], [0.05, 0.22], [0.001, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)), 18), X.porcelain, { y: F + 0.41 });
    K.add(tube([V(0.14, F + 0.5, 0), V(0.25, F + 0.56, 0), V(0.3, F + 0.62, 0)], 0.018, 8, 6), X.porcelain); K.add(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), X.porcelain, { x: -0.16, y: F + 0.52, ry: Math.PI / 2, rz: -Math.PI / 2 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; K.cyl(0.04, 0.03, 0.06, X.porcelain, { x: Math.sin(a) * 0.48, z: Math.cos(a) * 0.48, y: F + 0.44 }, 12); }
    colliders.push([-0.8, -0.8, 0.8, 0.8]);
    K.into(g);
    for (const p of glows) halo(g, p, 1.5, X.M.haloWarm);
    const coll = colliders;
    g.userData.colliders = coll;
    return {};
  }, { stay: true, colliders: (s) => TEA_COLLIDERS, info: "The tea hill: nine stone-walled tiers of tea bushes, flowers along every lip, and a pavilion on top where the pot is always warm." }),

  /** the amphitheatre: a lit stage under a light arch, five rows of stone seats rising away from it, a holo screen, banners */
  pkAmphi: P("Amphitheatre", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), A = PLACES.amphi, f = A.face, sp = A.span, a0 = f - sp, len = sp * 2;
    const dir = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
    K.cyl(4.6, 4.75, 0.6, T.white, { y: 0.3 }, 64);
    K.add(new THREE.CircleGeometry(4.56, 64).rotateX(-Math.PI / 2), X.M.planks, { y: 0.605, uv: 2 });
    K.add(new THREE.TorusGeometry(4.62, 0.035, 6, 96).rotateX(Math.PI / 2), T.cyanGlow, { y: 0.6 });
    K.add(new THREE.TorusGeometry(4.7, 0.02, 6, 96).rotateX(Math.PI / 2), T.goldGlow, { y: 0.12 });
    { const [x, z] = dir(f, 5.0); K.box(3.4, 0.3, 0.7, T.white, { x, z, y: 0.15, ry: f }); }
    for (let k = 0; k < 5; k++) {
      const r0 = 7 + 1.4 * k, r1 = r0 + 1.4, h = (k + 1) * 0.42;
      K.add(sector(r0, r1, a0, len, 64), T.stone, { y: h, uv: 2 });
      K.add(inward(arcWall(r0, 0.42, a0, len, 64)), T.stone, { y: h - 0.21 });
      K.add(sector(r0 + 0.08, r0 + 0.62, a0 + 0.01, len - 0.02, 64), T.timber, { y: h + 0.045 });
      K.add(inward(arcWall(r0 + 0.08, 0.045, a0 + 0.01, len - 0.02, 64)), T.timber, { y: h + 0.022 });
      K.add(inward(arcWall(r0 - 0.005, 0.035, a0, len, 64)), T.cyanGlow, { y: h - 0.035 });
      for (const e of [-1, 1]) { const a = f + e * (sp + 0.015), [x, z] = dir(a, r0 + 0.7); K.box(0.3, h + 1.0, 1.42, T.white, { x, z, y: (h + 1.0) / 2, ry: a }); }
    }
    // back wall, its light line and lanterns, the banners along it
    K.add(arcWall(14.45, 4.2, a0 - 0.02, len + 0.04, 64), T.white, { y: 2.1 }); K.add(inward(arcWall(14.05, 4.2, a0 - 0.02, len + 0.04, 64)), T.white, { y: 2.1 });
    K.add(sector(14.0, 14.5, a0 - 0.02, len + 0.04, 64), T.white, { y: 4.2 });
    K.add(inward(arcWall(14.03, 0.06, a0, len, 64)), T.cyanGlow, { y: 3.85 });
    const banners = [];
    for (let i = 0; i < 7; i++) {
      const a = a0 + (len * (i + 0.5)) / 7, [x, z] = dir(a, 14.25);
      K.cyl(0.05, 0.05, 3.2, T.metal, { x, z, y: 4.2 + 1.6 }, 8); K.add(new THREE.SphereGeometry(0.09, 10, 8), X.gold, { x, z, y: 7.45 });
      const [bx, bz] = dir(a, 13.95); banners.push([bx, bz, a + Math.PI, 200 + i * 23]);
      const [lx, lz] = dir(a + len / 14, 13.6); if (i < 6) K.add(new THREE.SphereGeometry(0.13, 12, 8), X.lantern, { x: lx, z: lz, y: 3.4 });
    }
    for (const e of [-1, 1]) { const a = f + e * (sp + 0.015), [x, z] = dir(a, 11.9); K.box(0.3, 4.2, 4.6, T.white, { x, z, y: 2.1, ry: a }); }
    // the arch behind the stage and its screen
    const back = f + Math.PI, [ax, az] = dir(back, 2.2);
    K.add(new THREE.TorusGeometry(3.9, 0.24, 12, 64, Math.PI), T.white, { x: ax, z: az, y: 0.6, ry: f });
    K.add(new THREE.TorusGeometry(3.6, 0.05, 6, 64, Math.PI), T.cyanGlow, { x: ax + Math.sin(f) * 0.12, z: az + Math.cos(f) * 0.12, y: 0.6, ry: f });
    K.add(new THREE.TorusGeometry(4.2, 0.03, 6, 64, Math.PI), T.goldGlow, { x: ax, z: az, y: 0.6, ry: f });
    for (const e of [-1, 1]) {
      const lx = ax + Math.cos(f) * e * 5.0, lz = az - Math.sin(f) * e * 5.0;
      K.box(1.1, 2.6, 0.9, T.darkMetal, { x: lx, z: lz, y: 1.3, ry: f }); for (const yy of [1.2, 2.1]) K.add(new THREE.TorusGeometry(0.3, 0.035, 6, 20), T.cyanGlow, { x: lx + Math.sin(f) * 0.46, z: lz + Math.cos(f) * 0.46, y: yy, ry: f });
    }
    K.into(g);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), X.screen); screen.position.set(ax + Math.sin(f) * 0.05, 0.6 + 1.6, az + Math.cos(f) * 0.05); screen.rotation.y = f; g.add(screen);
    const back2 = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.7), T.darkMetal); back2.position.set(ax - Math.sin(f) * 0.03, 2.2, az - Math.cos(f) * 0.03); back2.rotation.y = f + Math.PI; g.add(back2);
    for (const [x, z, ry, hue] of banners) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2), new THREE.MeshStandardMaterial({ map: stageBanner(hue), side: THREE.DoubleSide, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.12, emissiveMap: null })); m.position.set(x, 5.65, z); m.rotation.y = ry; g.add(m); }
  }, { stay: true, colliders: () => { const A = PLACES.amphi, f = A.face, b = f + Math.PI, ax = Math.sin(b) * 2.2, az = Math.cos(b) * 2.2, out = []; for (const e of [-1, 1]) { const x = ax + Math.cos(f) * e * 3.9, z = az - Math.sin(f) * e * 3.9, x2 = ax + Math.cos(f) * e * 5.0, z2 = az - Math.sin(f) * e * 5.0; out.push([x - 0.3, z - 0.3, x + 0.3, z + 0.3], [x2 - 0.6, z2 - 0.6, x2 + 0.6, z2 + 0.6]); } return out; },
    info: "The amphitheatre: a stage under an arch of light, and five rows of stone seats. Sit anywhere, someone's always about to play." }),

  /** the wish tree: a giant blossom with hundreds of glowing wishes tied to it */
  pkWish: P("Wish tree", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(808);
    K.add(groundDisc(8.6, gy, 0.035, 64, 6), X.sett);
    K.add(new THREE.RingGeometry(8.45, 8.6, 96).rotateX(-Math.PI / 2), T.edge, { y: 0.05 });
    K.add(new THREE.RingGeometry(3.7, 3.85, 96).rotateX(-Math.PI / 2), T.goldGlow, { y: 0.05 });
    K.add(arcWall(2.7, 0.55, 0, TAU, 48), T.white, { y: 0.275 }); K.add(sector(2.3, 2.75, 0, TAU, 48), T.white, { y: 0.55 });
    K.add(new THREE.CircleGeometry(2.35, 40).rotateX(-Math.PI / 2), X.soil, { y: 0.45 }); K.add(new THREE.TorusGeometry(2.72, 0.025, 4, 64).rotateX(Math.PI / 2), T.cyanGlow, { y: 0.4 });
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 0.9 + r() * 1.2; K.add(blob(0.15 + r() * 0.1, 0, 0.2, i), X.vine, { x: Math.sin(a) * d, z: Math.cos(a) * d, y: 0.5, sy: 0.7 }); }
    // the trunk, twisting, its branches, the crown
    K.add(taper([V(0, 0.3, 0), V(0.3, 2, -0.2), V(-0.2, 3.6, 0.25), V(0.1, 5.2, 0)], 0.85, 0.45, 20, 14), X.bark);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; K.add(taper([V(Math.sin(a) * 0.4, 0.9, Math.cos(a) * 0.4), V(Math.sin(a) * 0.95, 0.45, Math.cos(a) * 0.95), V(Math.sin(a) * 1.5, 0.42, Math.cos(a) * 1.5)], 0.3, 0.08, 8, 8), X.bark); }
    const ends = [], tags = [];
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * TAU + r() * 0.4, d = 4.6 + r() * 1.8, e = V(Math.sin(a) * d, 7.4 + r() * 1.4, Math.cos(a) * d), m = V(Math.sin(a) * d * 0.45, 6.2 + r() * 0.6, Math.cos(a) * d * 0.45);
      K.add(taper([V(0, 4.6, 0), m, e], 0.36, 0.1, 14, 8), X.bark); ends.push(e);
      for (let c = 0; c < 2; c++) { const a2 = a + (c ? 0.5 : -0.5), e2 = V(m.x + Math.sin(a2) * 2.6, m.y + 1.6 + r(), m.z + Math.cos(a2) * 2.6); K.add(taper([m, m.clone().lerp(e2, 0.5).add(V(0, 0.3, 0)), e2], 0.16, 0.05, 8, 6), X.bark); ends.push(e2); }
    }
    for (let i = 0; i < 150; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 7.2, y = 7.2 + (1 - d / 7.2) * 2.8 + r() * 1.2;
      K.add(blob(0.8 + r() * 0.9, 1, 0.25, i), X.M.pinks[i % 4], { x: Math.sin(a) * d, y, z: Math.cos(a) * d, sy: 0.75, ry: r() * TAU });
    }
    const lights = [];
    for (let i = 0; i < 14; i++) { const e = ends[(i * 3) % ends.length], d = 0.6 + r() * 0.3, p = V(e.x * d, e.y - 0.8 - r() * 0.6, e.z * d); lights.push(lantern(K, X, p.x, p.y, p.z, 0.9)); }
    K.into(g);
    for (const p of lights) halo(g, p, 1.4, X.M.haloWarm);
    // the wishes: paper tags on strings, swaying, glowing
    const tagGeo = (() => { const str = new THREE.BoxGeometry(0.008, 0.42, 0.008).translate(0, -0.21, 0), card = new THREE.PlaneGeometry(0.13, 0.3).translate(0, -0.58, 0); return swayUV(merge([str, card]), 0, -0.73); })();
    const tp = tagGeo.attributes.uv; for (let i = 0; i < tp.count; i++) tp.setY(i, Math.min(1, Math.max(0, -tagGeo.attributes.position.getY(i) / 0.73)));
    const TI = new Inst(tagGeo, X.tag), tc = [0xfff2d6, 0xffb3cf, 0x9fe8ff, 0xffd77a, 0xd7c2ff];
    for (let i = 0; i < 220; i++) { const a = r() * TAU, d = 2 + Math.sqrt(r()) * 5.2, y = 7.1 + (1 - d / 7.2) * 1.8 - r() * 0.6; TI.put(Math.sin(a) * d, y, Math.cos(a) * d, 1, r() * TAU, tc[i % tc.length]); }
    TI.into(g);
    const N = 90, pos = new Float32Array(N * 3), spd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(r() - 0.5) * 16, r() * 10, (r() - 0.5) * 16], i * 3); spd[i] = 0.25 + r() * 0.45; }
    const petals = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xf8bfd2, size: 0.13, transparent: true, opacity: 0.95, depthWrite: false }));
    petals.frustumCulled = false; g.add(petals);
    return { update(t, dt = 0.016) {
      const p = petals.geometry.attributes.position;
      for (let i = 0; i < N; i++) { let y = p.getY(i) - dt * spd[i]; if (y < 0.1) y = 10; p.setXYZ(i, p.getX(i) + Math.sin(t + i) * dt * 0.35, y, p.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.25); }
      p.needsUpdate = true;
    } };
  }, { stay: true, colliders: () => [[-2.8, -2.8, 2.8, 2.8]], info: "The wish tree. Everyone who's stopped here has tied a wish to it. They glow when the wind takes them." }),

  /** the picnic hill: gingham blankets, wicker baskets, striped parasols, a shade tree, kites, lights strung between posts */
  pkPicnic: P("Picnic hill", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(64), coll = [];
    bigTree(K, X, -3, gy(-3, 2.5), 2.5, 6.5, 5.2, 5, [X.hedge2, X.hedge, X.M.grass || X.hedge2]);
    coll.push([-3.6, 1.9, -2.4, 3.1]);
    for (const [i, [bx, bz, rot]] of PICNIC_SPOTS.entries()) {
      const geo = new THREE.PlaneGeometry(2.4, 2.0, 12, 10).rotateX(-Math.PI / 2), p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const lx = p.getX(k), lz = p.getZ(k), wx = bx + lx * Math.cos(rot) + lz * Math.sin(rot), wz = bz - lx * Math.sin(rot) + lz * Math.cos(rot), edge = Math.max(Math.abs(lx) / 1.2, Math.abs(lz) / 1.0); p.setY(k, gy(wx, wz) + 0.04 + Math.sin(lx * 5 + lz * 3 + i) * 0.012 - smooth(0.85, 1, edge) * 0.025); }
      geo.computeVertexNormals();
      K.add(geo, pick(X.gingham, i), { x: bx, z: bz, ry: rot });
      const y = gy(bx, bz) + 0.05, c = Math.cos(rot), sn = Math.sin(rot), L = (lx, lz) => [bx + lx * c + lz * sn, bz - lx * sn + lz * c];
      { const [x, z] = L(0.75, -0.55); K.cyl(0.28, 0.24, 0.3, X.wicker, { x, z, y: y + 0.15 }, 18); K.cyl(0.29, 0.29, 0.04, X.wicker, { x, z, y: y + 0.31 }, 18); K.add(new THREE.TorusGeometry(0.2, 0.02, 6, 16, Math.PI), X.wicker, { x, z, y: y + 0.32, ry: rot }); }
      for (const [lx, lz] of [[-0.4, 0.2], [0.2, 0.35], [-0.1, -0.3]]) { const [x, z] = L(lx, lz); K.cyl(0.14, 0.12, 0.02, X.porcelain, { x, z, y: y + 0.01 }, 18); K.add(new THREE.SphereGeometry(0.045, 10, 8), X.fruit[(i + Math.round(lx * 10)) & 3], { x: x + 0.03, z, y: y + 0.06 }); }
      { const [x, z] = L(0.1, -0.05); K.add(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), X.bread, { x, z, y: y + 0.06, rz: Math.PI / 2, ry: rot + 0.5 }); }
      { const [x, z] = L(-0.7, -0.5); K.cyl(0.05, 0.05, 0.26, X.glass, { x, z, y: y + 0.13 }, 10); K.cyl(0.02, 0.03, 0.08, T.timber, { x, z, y: y + 0.3 }, 8); }
      if (i % 2 === 0) {                                               // a parasol over every other blanket
        const [x, z] = L(-1.1, 0.95), py = gy(x, z);
        K.cyl(0.03, 0.03, 2.4, T.metal, { x, z, y: py + 1.2, rz: 0.08 }, 8); K.add(new THREE.ConeGeometry(1.55, 0.5, 16, 1, true), pick(X.parasol, i), { x: x + 0.1, z, y: py + 2.35 });
        K.add(new THREE.SphereGeometry(0.06, 8, 6), X.gold, { x: x + 0.1, z, y: py + 2.62 }); coll.push([x - 0.15, z - 0.15, x + 0.15, z + 0.15]);
      }
    }
    // the lights: posts round the edge, bulbs strung between them
    const posts = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3, x = Math.sin(a) * 12, z = Math.cos(a) * 12; if (onPath(x + PLACES.picnic.x, z + PLACES.picnic.z)) continue; const y = gy(x, z); K.cyl(0.06, 0.08, 3.2, T.timber, { x, z, y: y + 1.6 }, 8); K.add(new THREE.SphereGeometry(0.1, 10, 8), X.gold, { x, z, y: y + 3.25 }); posts.push(V(x, y + 3.1, z)); coll.push([x - 0.15, z - 0.15, x + 0.15, z + 0.15]); }
    for (let i = 0; i < posts.length; i++) bulbs(K, X, posts[i], posts[(i + 1) % posts.length], 0.7, 14);
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 9 + r() * 3.5, x = Math.sin(a) * d, z = Math.cos(a) * d; if (onPath(x + PLACES.picnic.x, z + PLACES.picnic.z)) continue; flowerClump(K, X, x, gy(x, z), z, 0.5, 6); }
    K.into(g);
    for (const p of posts) halo(g, p, 1.2, X.M.haloWarm);
    // two kites up on the breeze
    const kites = [0, 1].map((k) => {
      const grp = new THREE.Group(), KK = new Kit(), sh = new THREE.Shape([new THREE.Vector2(0, 0.7), new THREE.Vector2(0.45, 0), new THREE.Vector2(0, -0.6), new THREE.Vector2(-0.45, 0)]);
      KK.add(new THREE.ShapeGeometry(sh), k ? X.parasol[1] : X.parasol[0]); KK.add(tube([V(0, -0.6, 0), V(0.2, -1.4, 0), V(-0.15, -2.3, 0), V(0.1, -3.2, 0)], 0.012, 20, 4), X.wire);
      for (let b = 0; b < 4; b++) KK.add(new THREE.ConeGeometry(0.08, 0.16, 4).rotateZ(Math.PI / 2), pick(X.fabric, b + k), { x: [0.2, -0.15, 0.1, 0][b] * 0.8, y: -1 - b * 0.6 });
      KK.into(grp, { cast: false }); g.add(grp);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); line.frustumCulled = false; g.add(line);
      return { grp, line, base: V(k ? 4 : -6, gy(k ? 4 : -6, k ? -5 : 6) + 1, k ? -5 : 6), ph: k * 2.1 };
    });
    g.userData.colliders = coll;
    return { update(t) {
      for (const k of kites) {
        const x = k.base.x + Math.sin(t * 0.21 + k.ph) * 4, z = k.base.z + 10 + Math.cos(t * 0.17 + k.ph) * 3, y = k.base.y + 13 + Math.sin(t * 0.5 + k.ph) * 1.5;
        k.grp.position.set(x, y, z); k.grp.rotation.set(Math.sin(t * 0.9 + k.ph) * 0.2, Math.sin(t * 0.3) * 0.3, Math.sin(t * 1.3 + k.ph) * 0.25);
        const a = k.line.geometry.attributes.position; a.setXYZ(0, k.base.x, k.base.y, k.base.z); a.setXYZ(1, x, y - 0.6, z); a.needsUpdate = true;
      }
    } };
  }, { stay: true, colliders: () => PICNIC_COLLIDERS, info: "The picnic hill. Bring something to share, there's always a blanket free." }),

  /** the cafe terrace: a plank deck under strings of lights from a mast, planters all round */
  pkTerrace: P("Cafe terrace", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), r = seeded(46), coll = [];
    K.add(new THREE.CircleGeometry(7.2, 64).rotateX(-Math.PI / 2), X.M.planks, { y: 0.07, uv: 2.4 });
    K.add(arcWall(7.2, 0.22, 0, TAU, 64), T.timber, { y: -0.03 }); K.add(new THREE.TorusGeometry(7.2, 0.03, 4, 96).rotateX(Math.PI / 2), T.edge, { y: 0.09 });
    const gaps = [Math.PI, -0.34];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + TAU / 24; if (gaps.some((o) => Math.abs(angDiff(a, o)) < 0.35)) continue;
      const x = Math.sin(a) * 6.6, z = Math.cos(a) * 6.6;
      K.box(2.6, 0.55, 0.6, T.white, { x, z, y: 0.35, ry: a + Math.PI / 2 }); K.box(2.5, 0.05, 0.5, X.soil, { x, z, y: 0.63, ry: a + Math.PI / 2 });
      for (let k = -2; k <= 2; k++) { const px = x + Math.cos(a) * k * 0.5, pz = z - Math.sin(a) * k * 0.5; K.add(blob(0.2 + r() * 0.08, 1, 0.2, i * 5 + k), X.vine, { x: px, z: pz, y: 0.82, sy: 0.8 }); K.add(blob(0.08, 0, 0.1, i + k), pick(X.bloom, i + k + 5), { x: px + 0.08, z: pz, y: 1.0 }); }
      coll.push([x - 0.9, z - 0.9, x + 0.9, z + 0.9].map((v, k) => k % 2 ? (k === 1 ? z - 0.6 : z + 0.6) : (k === 0 ? x - 0.6 : x + 0.6)));
    }
    K.cyl(0.09, 0.12, 4.8, T.white, { y: 2.4 }, 12); K.add(new THREE.SphereGeometry(0.16, 12, 10), X.gold, { y: 4.9 }); coll.push([-0.2, -0.2, 0.2, 0.2]);
    const top = V(0, 4.7, 0), posts = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; if (gaps.some((o) => Math.abs(angDiff(a, o)) < 0.3)) continue; const x = Math.sin(a) * 7.0, z = Math.cos(a) * 7.0; K.cyl(0.05, 0.07, 3.0, T.timber, { x, z, y: 1.5 }, 8); posts.push(V(x, 2.95, z)); coll.push([x - 0.12, z - 0.12, x + 0.12, z + 0.12]); }
    for (const p of posts) bulbs(K, X, top, p, 0.5, 12);
    for (let i = 0; i < posts.length; i++) bulbs(K, X, posts[i], posts[(i + 1) % posts.length], 0.35, 8);
    K.into(g);
    halo(g, top, 1.6, X.M.haloWarm);
    g.userData.colliders = coll;
  }, { flat: true, walk: true, stay: true, colliders: () => TERRACE_COLLIDERS, info: "The cafe terrace. Grab something from the kiosk and find a table under the lights." }),

  /** a round cafe table, a parasol through it when spec.parasol */
  pkTable: P("Table", (g, s) => {
    const X = xm(), T = X.T, K = new Kit();
    K.cyl(0.5, 0.5, 0.04, T.white, { y: 0.74 }, 28); K.add(new THREE.TorusGeometry(0.5, 0.02, 4, 28).rotateX(Math.PI / 2), X.gold, { y: 0.74 });
    K.cyl(0.04, 0.05, 0.72, T.metal, { y: 0.36 }, 8); K.cyl(0.26, 0.3, 0.04, T.metal, { y: 0.02 }, 16);
    K.add(new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.04, 0.12], [0.012, 0.18], [0.001, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 12), X.glass, { y: 0.76 });
    K.add(new THREE.SphereGeometry(0.04, 8, 6), pick(X.bloom, s.n || 0), { y: 0.92 });
    if (s.parasol) { K.cyl(0.025, 0.025, 2.4, T.metal, { y: 1.2 }, 8); K.add(new THREE.ConeGeometry(1.5, 0.45, 16, 1, true), pick(X.parasol, s.n || 0), { y: 2.3 }); K.add(new THREE.SphereGeometry(0.05, 8, 6), X.gold, { y: 2.55 }); }
    K.into(g);
  }, { colliders: () => [[-0.5, -0.5, 0.5, 0.5]], info: "A little round table." }),

  /** a cafe chair (sit on it) */
  pkChair: P("Chair", (g) => {
    const X = xm(), T = X.T, K = new Kit();
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) K.cyl(0.018, 0.018, 0.44, T.metal, { x, z, y: 0.22 }, 6);
    K.box(0.46, 0.04, 0.46, T.timber, { y: 0.45 });
    K.add(new THREE.TorusGeometry(0.22, 0.02, 6, 16, Math.PI), T.metal, { y: 0.6, z: -0.22 }); for (let k = 0; k < 3; k++) K.box(0.4, 0.04, 0.02, T.timber, { y: 0.56 + k * 0.08, z: -0.22 });
    K.into(g);
  }, { seat: { clip: "sit", seat: 0.47, at: [0, 0.04] }, colliders: () => [[-0.22, -0.22, 0.22, 0.22]] }),

  /** a floor cushion (sit on it) */
  pkCushion: P("Cushion", (g, s) => {
    const X = xm(), K = new Kit();
    K.add(new THREE.SphereGeometry(0.34, 18, 10), pick(X.fabric, s.n || 0), { y: 0.08, sy: 0.26 });
    K.add(new THREE.SphereGeometry(0.05, 8, 6), X.gold, { y: 0.17 });
    K.into(g);
  }, { seat: { clip: "sit", seat: 0.16, at: [0, 0] }, colliders: () => [] }),

  /** a log to sit on by the fire */
  pkLog: P("Log seat", (g, s) => {
    const X = xm(), T = X.T, K = new Kit();
    K.cyl(0.24, 0.26, 1.7, X.bark, { y: 0.24, rz: Math.PI / 2 }, 14);
    for (const x of [-0.86, 0.86]) K.add(new THREE.CircleGeometry(0.24, 14).rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2), T.timber, { x, y: 0.24 });
    K.box(1.5, 0.03, 0.3, T.timber, { y: 0.47 });
    K.into(g);
  }, { seat: { clip: "sit", seat: 0.48, at: [0, 0.04] }, colliders: () => [] }),

  /** a hammock slung between two posts, swinging a little (lie in it) */
  pkHammock: P("Hammock", (g, s) => {
    const X = xm(), T = X.T, K = new Kit();
    for (const x of [-1.9, 1.9]) { K.cyl(0.09, 0.11, 2.1, T.timber, { x, y: 1.05 }, 10); K.add(new THREE.SphereGeometry(0.1, 10, 8), X.gold, { x, y: 2.12 }); }
    K.into(g);
    const sling = new THREE.Group(); sling.position.y = 1.7; g.add(sling);
    const SK = new Kit(), sag = (u) => -0.95 * Math.sin(Math.PI * u);
    const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(u); }
    const geo = new THREE.PlaneGeometry(1, 1, 20, 8), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) + 0.5, v = p.getY(i); const x = -1.55 + u * 3.1, w = 0.42 + 0.3 * Math.sin(Math.PI * u); p.setXYZ(i, x, sag(u) + Math.abs(v) * Math.abs(v) * 0.5 * Math.sin(Math.PI * u), v * w * 2); }
    geo.computeVertexNormals(); SK.add(geo, X.canvasStripe);
    for (const sx of [-1, 1]) for (const v of [-0.3, 0, 0.3]) SK.add(tube([V(sx * 1.9, 0.15, 0), V(sx * 1.55, 0, v)], 0.008, 2, 3), X.wire);
    SK.add(new THREE.SphereGeometry(0.25, 12, 8), pick(X.fabric, s.n || 0), { x: -1.0, y: sag(0.18) + 0.12, sy: 0.4 });
    SK.into(sling);
    const ph = (s.n || 0) * 1.7;
    return { update(t) { sling.rotation.x = Math.sin(t * 0.9 + ph) * 0.05; } };
  }, { seat: { clip: "lounge", seat: 0.82, at: [0, 0] }, colliders: () => [[-2.0, -0.12, -1.8, 0.12], [1.8, -0.12, 2.0, 0.12]] }),

  /** the hammock grove's middle: a deck round a mast of fairy lights */
  pkHammockGrove: P("Hammock grove", (g, s) => {
    const X = xm(), T = X.T, K = new Kit();
    K.cyl(3.2, 3.3, 0.24, T.timber, { y: 0.12 }, 6); K.add(new THREE.CircleGeometry(3.15, 6).rotateX(-Math.PI / 2), X.M.planks, { y: 0.245, uv: 2 });
    K.add(new THREE.TorusGeometry(3.25, 0.025, 4, 6).rotateX(Math.PI / 2), T.edge, { y: 0.25 });
    K.cyl(0.08, 0.1, 5.4, T.white, { y: 2.7 }, 10); K.add(new THREE.SphereGeometry(0.16, 12, 10), X.gold, { y: 5.45 });
    const top = V(0, 5.3, 0);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, e = V(Math.sin(a) * 3.0, 0.4, Math.cos(a) * 3.0); bulbs(K, X, top, e, 0.25, 12); K.cyl(0.03, 0.03, 0.3, X.gold, { x: e.x, z: e.z, y: 0.4 }, 6); }
    K.cyl(0.55, 0.55, 0.05, T.timber, { y: 0.62 }, 20); K.cyl(0.08, 0.12, 0.36, T.timber, { y: 0.43 }, 8);
    const p = lantern(K, X, 0.2, 1.3, 0, 0.7);
    K.into(g);
    halo(g, top, 1.8, X.M.haloWarm); halo(g, p, 1.0, X.M.haloWarm);
  }, { stay: true, colliders: () => [[-0.6, -0.6, 0.6, 0.6]], info: "The hammock grove. Lie back, watch the lights, and let the afternoon go by." }),

  /** the fire circle: flagstones, a ring of stones round a fire of cyan light, embers rising, lanterns on hooks */
  pkFire: P("Fire circle", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(78);
    K.add(groundDisc(7.2, gy, 0.035, 64, 6), X.sett);
    K.add(new THREE.RingGeometry(7.05, 7.2, 96).rotateX(-Math.PI / 2), T.edge, { y: 0.06 });
    K.add(new THREE.CircleGeometry(1.25, 32).rotateX(-Math.PI / 2), T.bed, { y: 0.06 });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, x = Math.sin(a) * 1.35, z = Math.cos(a) * 1.35; K.add(rockGeo(r, 0.34 + r() * 0.1), i % 3 ? T.rock : X.darkStone, { x, z, y: 0.16, ry: r() * TAU }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.cyl(0.08, 0.08, 0.9, X.bark, { x: Math.sin(a) * 0.45, z: Math.cos(a) * 0.45, y: 0.25, rx: Math.cos(a) * 1.1, rz: -Math.sin(a) * 1.1 }, 8); }
    const glows = [], coll = [[-1.6, -1.6, 1.6, 1.6]];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.2; if (Math.abs(angDiff(a, FIRE_PATH)) < 0.4) continue; const x = Math.sin(a) * 6.5, z = Math.cos(a) * 6.5; glows.push(hookPost(K, X, x, gy(x, z), z, a + Math.PI, X.lanternCyan)); coll.push([x - 0.12, z - 0.12, x + 0.12, z + 0.12]); }
    { const a = FIRE_PATH + 1.4, x = Math.sin(a) * 5.6, z = Math.cos(a) * 5.6; for (let k = 0; k < 6; k++) K.cyl(0.13, 0.13, 1.1, X.bark, { x: x + (k % 3 - 1) * 0.27, z, y: gy(x, z) + 0.13 + Math.floor(k / 3) * 0.24, rx: Math.PI / 2, ry: a }, 10); }
    K.into(g);
    for (const p of glows) halo(g, p, 1.3, X.T.softCyan.isSpriteMaterial ? X.T.softCyan : X.M.halo);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2), X.lightPool); pool.position.y = 0.09; pool.renderOrder = 2; g.add(pool);
    const flames = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9 - i * 0.15, 2.5 - i * 0.2), X.holoFire); m.position.y = 0.2 + (2.5 - i * 0.2) / 2; m.rotation.y = (i / 4) * Math.PI; m.renderOrder = 3; g.add(m); flames.push(m); }
    const NE = 90, ep = new Float32Array(NE * 3), ed = []; for (let i = 0; i < NE; i++) ed.push([r() * TAU, r(), 0.4 + r() * 0.6, r() * 0.6]);
    const embers = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(ep, 3)), new THREE.PointsMaterial({ map: X.M.tex.glowDisc, color: 0x9ff0ff, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    embers.frustumCulled = false; g.add(embers);
    return { update(t) {
      X.lightPool.opacity = 0.3 + 0.06 * Math.sin(t * 9) * Math.sin(t * 5.3) + 0.04 * Math.sin(t * 2.1);
      for (const [i, m] of flames.entries()) m.scale.y = 1 + 0.08 * Math.sin(t * 6 + i * 1.7);
      const p = embers.geometry.attributes.position;
      for (let i = 0; i < NE; i++) { const [a, ph, sp, d] = ed[i], k = (t * sp * 0.4 + ph) % 1, aa = a + k * 4; p.setXYZ(i, Math.sin(aa) * (d + k * 0.6), 0.4 + k * 4.5, Math.cos(aa) * (d + k * 0.6)); }
      p.needsUpdate = true;
    } };
  }, { stay: true, colliders: () => FIRE_COLLIDERS, info: "The fire circle. The flames are only light, but it's warm here anyway. Pull up a log." }),

  /** the zen garden: raked gravel round mossy stones, a stone lantern, a water basin, bamboo, a deck to sit and look from */
  pkZen: P("Zen garden", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(84), R = 7.2;
    const rocks = [[-2.6, 1.4, 1.1], [-1.3, 2.6, 0.55], [3.0, -1.6, 0.85], [1.6, 3.9, 0.5], [-3.4, -2.8, 0.6]];
    const gravel = new THREE.MeshStandardMaterial({ map: zenTex(rocks, R), roughness: 1 });
    K.add(new THREE.CircleGeometry(R, 96).rotateX(-Math.PI / 2), gravel, { y: 0.06 });
    K.add(arcWall(R + 0.3, 0.3, 0, TAU, 96), T.stone, { y: 0.06 }); K.add(sector(R, R + 0.32, 0, TAU, 96), T.white, { y: 0.21 }); K.add(inward(arcWall(R, 0.16, 0, TAU, 96)), T.stone, { y: 0.13 });
    for (const [x, z, rr] of rocks) {
      K.add(new THREE.CircleGeometry(rr + 0.35, 24).rotateX(-Math.PI / 2), X.moss, { x, z, y: 0.075 });
      K.add(rockGeo(r, rr), r() < 0.5 ? T.rock : X.darkStone, { x, z, y: rr * 0.32, ry: r() * TAU, sy: 1.5 });
      for (let k = 0; k < 4; k++) { const a = r() * TAU; K.add(blob(0.14 + r() * 0.1, 0, 0.3, k), X.moss, { x: x + Math.sin(a) * (rr + 0.15), z: z + Math.cos(a) * (rr + 0.15), y: 0.1, sy: 0.5 }); }
    }
    // the viewing deck on the path side
    const dA = Math.PI, dS = 0.8;
    K.add(sector(R + 0.35, R + 2.4, dA - dS, dS * 2, 32), X.M.planks, { y: 0.2, uv: 2 }); K.add(arcWall(R + 2.4, 0.2, dA - dS, dS * 2, 32), T.timber, { y: 0.1 });
    for (let k = 0; k <= 6; k++) { const a = dA - dS + (k / 6) * dS * 2; K.cyl(0.06, 0.06, 0.22, T.timber, { x: Math.sin(a) * (R + 2.3), z: Math.cos(a) * (R + 2.3), y: 0.08 }, 6); }
    // the stone lantern
    const lx = Math.sin(0.9) * 8.4, lz = Math.cos(0.9) * 8.4, ly = gy(lx, lz);
    K.cyl(0.5, 0.55, 0.25, T.stone, { x: lx, z: lz, y: ly + 0.12 }, 6); K.cyl(0.16, 0.2, 0.9, T.stone, { x: lx, z: lz, y: ly + 0.7 }, 8); K.cyl(0.45, 0.4, 0.16, T.stone, { x: lx, z: lz, y: ly + 1.23 }, 6);
    K.box(0.5, 0.42, 0.5, X.lantern, { x: lx, z: lz, y: ly + 1.52 }); for (const [dx, dz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) K.box(0.08, 0.44, 0.08, T.stone, { x: lx + dx, z: lz + dz, y: ly + 1.52 });
    K.add(new THREE.ConeGeometry(0.78, 0.42, 6), T.stone, { x: lx, z: lz, y: ly + 1.95 }); K.add(blob(0.13, 0, 0.1), T.stone, { x: lx, z: lz, y: ly + 2.22 });
    // the water basin with its bamboo spout
    const bx = Math.sin(-2.3) * 8.6, bz = Math.cos(-2.3) * 8.6, by = gy(bx, bz);
    K.add(new THREE.LatheGeometry([[0.001, 0], [0.55, 0], [0.62, 0.2], [0.6, 0.48], [0.45, 0.5], [0.42, 0.3], [0.001, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 20), X.darkStone, { x: bx, z: bz, y: by });
    K.add(new THREE.CircleGeometry(0.43, 20).rotateX(-Math.PI / 2), X.pool, { x: bx, z: bz, y: by + 0.44 });
    K.cyl(0.05, 0.05, 1.0, X.bamboo, { x: bx + 0.75, z: bz, y: by + 0.5 }, 8); K.cyl(0.04, 0.04, 0.8, X.bamboo, { x: bx + 0.4, z: bz, y: by + 0.92, rz: Math.PI / 2 - 0.15 }, 8);
    K.cyl(0.015, 0.015, 0.5, T.timber, { x: bx - 0.1, z: bz + 0.2, y: by + 0.55, rz: 1.1 }, 4); K.cyl(0.05, 0.05, 0.07, T.timber, { x: bx + 0.12, z: bz + 0.2, y: by + 0.66 }, 8);
    for (let k = 0; k < 5; k++) { const a = r() * TAU; K.add(rockGeo(r, 0.18 + r() * 0.12), T.rock, { x: bx + Math.sin(a) * 0.85, z: bz + Math.cos(a) * 0.85, y: by + 0.06 }); }
    // the bamboo grove behind
    const leaf = swayUV(new THREE.PlaneGeometry(0.09, 0.5).translate(0, 0.25, 0), 0, 0.5);
    for (let i = 0; i < 46; i++) {
      const a = -0.5 + r() * 2.1, d = 8.8 + r() * 2.6, x = Math.sin(a) * d, z = Math.cos(a) * d, y = gy(x, z), H = 5 + r() * 3.5, lean = (r() - 0.5) * 0.12;
      if (Math.hypot(x - lx, z - lz) < 1.3) continue;
      K.cyl(0.05, 0.065, H, X.bamboo, { x, z, y: y + H / 2, rx: lean, rz: lean * 0.6 }, 8);
      for (let n = 1; n < H / 0.55; n++) K.add(new THREE.TorusGeometry(0.062, 0.012, 4, 10).rotateX(Math.PI / 2), X.bambooNode, { x: x + Math.sin(lean * 0.6) * -n * 0.55 * 0, z: z + n * 0.55 * Math.sin(lean), y: y + n * 0.55, rx: lean });
      for (let k = 0; k < 14; k++) { const la = r() * TAU, lh = H * (0.55 + r() * 0.45); K.add(leaf.clone(), X.bambooLeaf, { x: x + Math.sin(la) * 0.12, z: z + lh * Math.sin(lean) + Math.cos(la) * 0.12, y: y + lh, rx: 1.0 + r() * 0.5, ry: la, order: "YXZ" }); }
    }
    // a red maple to one side
    { const mx = Math.sin(2.2) * 9.4, mz = Math.cos(2.2) * 9.4, my = gy(mx, mz); K.add(taper([V(mx, my, mz), V(mx + 0.4, my + 1.6, mz), V(mx + 0.2, my + 2.8, mz + 0.3)], 0.2, 0.1, 10, 8), X.bark); for (let i = 0; i < 30; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 2.3; K.add(blob(0.5 + r() * 0.4, 1, 0.25, i), X.maple, { x: mx + 0.2 + Math.sin(a) * d, y: my + 3 + (1 - d / 2.3) * 0.9 + r() * 0.5, z: mz + 0.3 + Math.cos(a) * d, sy: 0.7 }); } }
    K.into(g);
    halo(g, V(lx, ly + 1.52, lz), 1.4, X.M.haloWarm);
  }, { stay: true, colliders: () => ZEN_COLLIDERS, info: "The zen garden. Someone rakes the gravel every morning. Sit on the deck and just look for a while." }),

  /** the glasshouse: a dome of glass on white ribs, tropical beds inside round a little fountain */
  pkDome: P("Glasshouse", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), D = PLACES.dome, R = D.wall, H = 0.9, r = seeded(28);
    const door = D.door, dw = 0.3, doorTheta = Math.acos(2.8 / (R * H));
    K.add(new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2), X.sett, { y: 0.05 });
    K.add(arcWall(R + 0.12, 0.35, door + dw, TAU - dw * 2, 64), T.white, { y: 0.17 }); K.add(sector(R - 0.12, R + 0.14, door + dw, TAU - dw * 2, 64), T.white, { y: 0.35 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU; if (Math.abs(angDiff(a, door)) < dw + 0.02) continue;
      const pts = []; for (let k = 0; k <= 16; k++) { const th = (k / 16) * (Math.PI / 2); pts.push(V(Math.sin(a) * R * Math.sin(th + 0.0001) * 1.002, R * H * Math.cos(th), Math.cos(a) * R * Math.sin(th) * 1.002)); }
      K.add(tube(pts.reverse(), 0.07, 32, 6), T.white);
    }
    for (const th of [0.42, 0.78, 1.1, 1.35]) { const rr = R * Math.sin(th) * 1.003, y = R * H * Math.cos(th); const geo = new THREE.TorusGeometry(rr, 0.055, 6, 96, th > doorTheta ? TAU - dw * 2 : TAU).rotateX(Math.PI / 2); if (th > doorTheta) geo.rotateY(door - dw - Math.PI / 2); K.add(geo, T.white, { y }); }
    K.add(new THREE.TorusGeometry(0.6, 0.08, 8, 24).rotateX(Math.PI / 2), X.gold, { y: R * H - 0.05 }); K.add(new THREE.SphereGeometry(0.25, 12, 8), X.gold, { y: R * H + 0.2 });
    // the door: an arch round the gap
    { const pts = []; for (let k = 0; k <= 12; k++) { const a = door - dw + (k / 12) * dw * 2, y = k === 0 || k === 12 ? 0 : 2.8 + Math.sin((k / 12) * Math.PI) * 0.35; pts.push(V(Math.sin(a) * R, Math.min(y, 3.15), Math.cos(a) * R)); } K.add(tube(pts, 0.09, 40, 6), T.white); }
    // the beds inside: a ring of planters with tropical leaves and bright flowers, a fountain in the middle
    const leaf = (() => { const geo = new THREE.PlaneGeometry(0.5, 1.1, 1, 6).translate(0, 0.55, 0), p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, y / 1.1 + 0.08))); p.setZ(i, -0.25 * (y / 1.1) * (y / 1.1)); } geo.computeVertexNormals(); return swayUV(geo, 0, 1.1); })();
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + 0.25, len = 0.75; if (Math.abs(angDiff(a0 + len / 2, door)) < 0.6) continue;
      K.add(arcWall(5.6, 0.5, a0, len, 16), T.white, { y: 0.3 }); K.add(inward(arcWall(4.2, 0.5, a0, len, 16)), T.white, { y: 0.3 });
      K.add(sector(4.2, 5.6, a0, len, 16), X.soil, { y: 0.5 });
      for (let k = 0; k < 9; k++) {
        const a = a0 + r() * len, d = 4.4 + r() * 1.0, x = Math.sin(a) * d, z = Math.cos(a) * d;
        for (let l = 0; l < 5; l++) K.add(leaf.clone(), X.tropic, { x, z, y: 0.5, ry: r() * TAU, rx: -0.3 - r() * 0.5, s: 0.7 + r() * 0.8, order: "YXZ" });
        if (k % 3 === 0) K.add(blob(0.12, 0, 0.2, k), pick(X.bloom, i + k), { x: x + 0.2, z, y: 1.05 + r() * 0.4 });
      }
      const ta = a0 + len / 2, tx = Math.sin(ta) * 4.9, tz = Math.cos(ta) * 4.9;   // a little palm in each bed
      K.add(taper([V(tx, 0.5, tz), V(tx + 0.2, 2.4, tz), V(tx + 0.1, 3.9, tz + 0.15)], 0.13, 0.08, 10, 8), X.bark);
      for (let l = 0; l < 8; l++) K.add(leaf.clone(), X.tropic, { x: tx + 0.1, z: tz + 0.15, y: 3.9, ry: (l / 8) * TAU, rx: -1.1, s: 1.6, order: "YXZ" });
    }
    K.add(new THREE.LatheGeometry([[0.001, 0], [1.3, 0], [1.5, 0.5], [1.45, 0.58], [1.2, 0.5], [0.001, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 32), T.white);
    K.add(new THREE.CircleGeometry(1.25, 32).rotateX(-Math.PI / 2), X.pool, { y: 0.48 });
    K.cyl(0.12, 0.16, 1.1, T.white, { y: 0.9 }, 12);
    K.add(new THREE.LatheGeometry([[0.001, 0], [0.55, 0.05], [0.62, 0.22], [0.5, 0.2], [0.001, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 24), T.white, { y: 1.4 });
    K.add(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), X.pool, { y: 1.6 });
    K.into(g);
    // the glass: the top all round, the lower band with a gap for the door
    const phi0 = door + Math.PI / 2 + dw;   // SphereGeometry: x = -r cos(phi) sin(theta), z = r sin(phi) sin(theta)
    for (const [t0, tl, p0, pl] of [[0, doorTheta, 0, TAU], [doorTheta, Math.PI / 2 - doorTheta, phi0 + 0, TAU - dw * 2]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 16, p0, pl, t0, tl).scale(1, H, 1), X.glass); m.renderOrder = 4; g.add(m);
    }
    const mist = []; for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(X.M.puff.clone()); sp.material.opacity = 0.12; sp.material.userData.shared = false; sp.position.set(Math.sin(i) * 3, 1.2 + (i % 3) * 0.6, Math.cos(i) * 3); sp.scale.setScalar(3); g.add(sp); mist.push(sp); }
    return { update(t) { for (const [i, sp] of mist.entries()) { sp.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.4 + i); sp.position.y = 1.4 + Math.sin(t * 0.2 + i) * 0.4; } } };
  }, { stay: true, colliders: () => [[-1.5, -1.5, 1.5, 1.5]], info: "The glasshouse. Warm and green inside, whatever the weather does out here." }),

  /** a quiet circle: paved, and in the middle a blossom (kind 0), a globe of light (1), a sundial (2) or a fountain bowl (3) */
  pkCircle: P("Quiet circle", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), kind = s.kind || 0, r = seeded(90 + kind);
    K.add(new THREE.CircleGeometry(5.9, 64).rotateX(-Math.PI / 2), X.sett, { y: 0.045 });
    K.add(new THREE.RingGeometry(5.75, 5.9, 96).rotateX(-Math.PI / 2), T.edge, { y: 0.055 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, x = Math.sin(a) * 6.5, z = Math.cos(a) * 6.5; if (onPath(x + (s.x - CX), z + (s.z - CZ))) continue; flowerClump(K, X, x, 0, z, 0.5, 7); }
    let spin = null, drops = null;
    if (kind === 1) {
      K.add(new THREE.LatheGeometry([[0.001, 0], [0.75, 0], [0.75, 0.15], [0.42, 0.3], [0.3, 1.0], [0.5, 1.15], [0.001, 1.15]].map(([x, y]) => new THREE.Vector2(x, y)), 32), T.white);
      K.add(new THREE.TorusGeometry(0.5, 0.025, 6, 32).rotateX(Math.PI / 2), T.cyanGlow, { y: 1.16 });
      K.into(g);
      spin = new THREE.Group(); spin.position.y = 2.6; g.add(spin);
      const SK = new Kit();
      for (let i = 1; i < 8; i++) { const th = (i / 8) * Math.PI; SK.add(new THREE.TorusGeometry(1.3 * Math.sin(th), 0.012, 4, 64).rotateX(Math.PI / 2), T.cyanGlow, { y: 1.3 * Math.cos(th) }); }
      for (let i = 0; i < 8; i++) SK.add(new THREE.TorusGeometry(1.3, 0.012, 4, 64), T.cyanGlow, { ry: (i / 8) * Math.PI });
      for (let i = 0; i < 40; i++) { const th = Math.acos(2 * r() - 1), ph = r() * TAU; SK.add(new THREE.OctahedronGeometry(0.035), T.goldGlow, { x: 1.3 * Math.sin(th) * Math.cos(ph), y: 1.3 * Math.cos(th), z: 1.3 * Math.sin(th) * Math.sin(ph) }); }
      SK.add(new THREE.TorusGeometry(1.75, 0.02, 4, 80), T.goldGlow, { rx: 1.2 });
      SK.add(new THREE.SphereGeometry(0.9, 24, 16), T.softCyan);
      SK.into(spin, { cast: false });
    } else if (kind === 2) {
      K.cyl(2.2, 2.35, 0.55, T.stone, { y: 0.275 }, 48); K.add(new THREE.CircleGeometry(2.15, 48).rotateX(-Math.PI / 2), T.white, { y: 0.555 });
      K.add(new THREE.TorusGeometry(2.0, 0.02, 4, 64).rotateX(Math.PI / 2), X.gold, { y: 0.56 }); K.add(new THREE.TorusGeometry(1.2, 0.015, 4, 64).rotateX(Math.PI / 2), X.gold, { y: 0.56 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; K.box(0.06, 0.02, i % 3 ? 0.3 : 0.55, X.gold, { x: Math.sin(a) * 1.65, z: Math.cos(a) * 1.65, y: 0.57, ry: a }); }
      const sh = new THREE.Shape([new THREE.Vector2(-1.4, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(-1.4, 1.5)]);
      K.add(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateY(Math.PI / 2), X.gold, { y: 0.56 });
      K.into(g);
    } else if (kind === 3) {
      const bowl = (r0, h) => new THREE.LatheGeometry([[0.001, 0], [r0 * 0.9, 0], [r0, h], [r0 * 0.93, h * 1.08], [r0 * 0.85, h * 0.6], [0.001, h * 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
      K.add(bowl(2.3, 0.55), T.white); K.add(new THREE.CircleGeometry(2.1, 40).rotateX(-Math.PI / 2), X.pool, { y: 0.5 });
      K.cyl(0.18, 0.24, 1.3, T.white, { y: 1.0 }, 16); K.add(bowl(1.15, 0.3), T.white, { y: 1.5 }); K.add(new THREE.CircleGeometry(1.05, 32).rotateX(-Math.PI / 2), X.pool, { y: 1.76 });
      K.cyl(0.1, 0.14, 0.8, T.white, { y: 2.1 }, 12); K.add(bowl(0.55, 0.18), T.white, { y: 2.45 }); K.add(new THREE.SphereGeometry(0.14, 12, 10), X.gold, { y: 2.75 });
      K.add(new THREE.TorusGeometry(2.32, 0.025, 4, 64).rotateX(Math.PI / 2), T.cyanGlow, { y: 0.58 });
      K.into(g);
      const N = 160, pos = new Float32Array(N * 3); drops = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ map: X.M.tex.glowDisc, color: 0xd8f6ff, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      drops.frustumCulled = false; g.add(drops);
    } else K.into(g);
    return { update(t) {
      if (spin) { spin.rotation.y = t * 0.25; spin.position.y = 2.6 + Math.sin(t * 0.8) * 0.08; }
      if (drops) { const p = drops.geometry.attributes.position, n = p.count; for (let i = 0; i < n; i++) { const a = (i / n) * TAU * 8 % TAU, tier = i % 2, k = (t * 0.9 + i * 0.137) % 1, r0 = tier ? 1.12 : 0.54, y0 = tier ? 1.78 : 2.6; p.setXYZ(i, Math.sin(a) * (r0 + k * 0.25), y0 - k * k * (tier ? 1.25 : 0.85), Math.cos(a) * (r0 + k * 0.25)); } p.needsUpdate = true; }
    } };
  }, { stay: true, colliders: (s) => (s.kind === 0 ? [] : s.kind === 3 ? [[-2.3, -2.3, 2.3, 2.3]] : s.kind === 2 ? [[-2.3, -2.3, 2.3, 2.3]] : [[-0.8, -0.8, 0.8, 0.8]]),
    info: "A quiet circle off the walk. Benches all round, and something nice to look at in the middle." }),

  /** a gateway on the ring walk: white pylons, a sweep of light over the way, the park's name (small ones for the side paths) */
  pkGate: P("Park gate", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), half = s.small ? 2.0 : 3.6, H = s.small ? 3.4 : 5.4;
    const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), gy = (x, z) => parkHeightAt(s.x + x * c + z * sn, s.z - x * sn + z * c) - (s.y || 0);   // the ground under a point of the gate, turned with it
    const low = (x, r) => Math.min(gy(x - r, -r), gy(x + r, -r), gy(x - r, r), gy(x + r, r), gy(x, 0));
    for (const sd of [-1, 1]) {
      const x = sd * half, pw = s.small ? 0.45 : 0.8, b = Math.min(0, low(x, pw / 2)) - 0.15, bp = low(x + sd * 0.4, 0.7) - 0.05;   // each pillar reaches all the way down to its ground
      K.box(pw, H - b, pw, T.white, { x, y: (H + b) / 2 }); K.box(0.06, H - 0.8, 0.82, T.cyanGlow, { x: x - sd * (s.small ? 0.23 : 0.41), y: H / 2 });
      K.box(pw + 0.2, 0.18, pw + 0.2, T.white, { x, y: b + 0.09 });
      K.box(1.4, 0.8, 1.4, T.white, { x: x + sd * 0.4, y: bp + 0.1 }); K.box(1.3, 0.05, 1.3, X.soil, { x: x + sd * 0.4, y: bp + 0.52 }); flowerClump(K, X, x + sd * 0.4, bp + 0.45, 0, 0.5, 8);
      for (let k = 0; k < 9; k++) { const t = k / 8; K.add(blob(0.16, 0, 0.3, k * sd), X.vine, { x: x + Math.sin(k * 2.1) * 0.3, y: 0.6 + t * (H - 1), z: Math.cos(k * 2.1) * 0.3 }); }
    }
    const arch = []; for (let k = 0; k <= 20; k++) { const u = k / 20; arch.push(V(lerp(-half, half, u), H + Math.sin(Math.PI * u) * (s.small ? 0.5 : 1.0), 0)); }
    K.add(tube(arch, s.small ? 0.1 : 0.16, 40, 8), T.white); K.add(tube(arch.map((p) => p.clone().add(V(0, -0.22, 0))), 0.04, 40, 6), T.cyanGlow);
    K.into(g);
    const tex = gateSign(s.small ? "PARK" : "CENTRAL PARK"), sw = s.small ? 2.2 : 4.2, sh = sw * 192 / 1024;
    for (const face of [0, Math.PI]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 })); m.position.set(0, H - (s.small ? 0.45 : 0.7), face ? -0.03 : 0.03); m.rotation.y = face; g.add(m); }
    for (const z of [-0.035, 0.035]) { const back = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.1, sh + 0.08), T.white); back.position.set(0, H - (s.small ? 0.45 : 0.7), z * 0.5); g.add(back); }
  }, { stay: true, colliders: (s) => { const h = s.small ? 2.0 : 3.6, w = s.small ? 0.3 : 0.5; return [[-h - w - 0.4, -w - 0.3, -h + w, w + 0.3], [h - w, -w - 0.3, h + w + 0.4, w + 0.3]]; }, info: "A gate on the ring walk." }),

  /** a nook by the walk: a little paved spot with a lantern and a planter, two benches face each other on it */
  pkNook: P("Nook", (g, s) => {
    const X = xm(), T = X.T, K = new Kit(), gy = groundOf(s), r = seeded(s.n || 1);
    K.add(groundDisc(2.9, gy, 0.04, 40, 4), X.sett);
    K.add(new THREE.RingGeometry(2.8, 2.9, 64).rotateX(-Math.PI / 2), T.edge, { y: gy(0, 0) + 0.06 });
    const [qx, qz] = s.post || [0, -2.4], p = hookPost(K, X, qx, gy(qx, qz), qz, Math.atan2(-qx, -qz), X.lantern);
    K.cyl(0.4, 0.45, 0.45, T.white, { x: 0, z: 0, y: gy(0, 0) + 0.25 }, 20); flowerClump(K, X, 0, gy(0, 0) + 0.45, 0, 0.4, 7);
    K.into(g); halo(g, p, 1.2, X.M.haloWarm);
  }, { stay: true, colliders: (s) => { const [qx, qz] = s.post || [0, -2.4]; return [[-0.45, -0.45, 0.45, 0.45], [qx - 0.12, qz - 0.12, qx + 0.12, qz + 0.12]]; }, info: "A quiet spot to sit and talk." }),

  /** the woods all round the edge, groves inside, bushes along the walks, meadows of flowers, butterflies */
  pkWoods: P("Woods", (g) => {
    const X = xm(), L = woodsLayout(), r = seeded(1234);
    // tree shapes: a round leafy one, a tall pointed one, a slim pale one
    const crownA = swayUV(merge([blob(1.6, 1, 0.22, 1).translate(0, 4.0, 0), blob(1.25, 1, 0.22, 2).translate(0.9, 3.5, 0.3), blob(1.15, 1, 0.22, 3).translate(-0.8, 3.6, -0.4), blob(1.0, 1, 0.22, 4).translate(0.1, 5.0, -0.2)]), 2.4, 5.8);
    const crownB = swayUV(merge([new THREE.ConeGeometry(1.7, 2.4, 9).translate(0, 2.6, 0), new THREE.ConeGeometry(1.35, 2.0, 9).translate(0, 3.8, 0), new THREE.ConeGeometry(0.95, 1.7, 9).translate(0, 4.9, 0), new THREE.ConeGeometry(0.55, 1.2, 9).translate(0, 5.8, 0)]), 1.6, 6.4);
    const crownC = swayUV(merge([blob(1.0, 1, 0.25, 5).translate(0, 5.0, 0).scale(1, 1.4, 1), blob(0.85, 1, 0.25, 6).translate(0.5, 4.0, 0.2).scale(1, 1.3, 1)]), 3.6, 7.6);
    const trunkA = new THREE.CylinderGeometry(0.16, 0.28, 3.2, 7).translate(0, 1.6, 0), trunkC = new THREE.CylinderGeometry(0.09, 0.13, 5.0, 6).translate(0, 2.5, 0);
    const green = [0x5d8f3e, 0x6b9c45, 0x4f7f38, 0x7aa64e, 0x87ad55, 0x5a8a4a], warm = [0xd9a441, 0xe58a5a, 0xf2b6c8, 0xc96f4a], pine = [0x3f6e46, 0x4a7a4c, 0x365f40];
    const sets = { A: [new Inst(trunkA, X.bark, true), new Inst(crownA, X.leaf, true)], B: [new Inst(trunkA, X.bark, true), new Inst(crownB, X.leaf, true)], C: [new Inst(trunkC, X.birch, true), new Inst(crownC, X.leaf, true)] };
    for (const [x, z, kind, s2, ry] of L.trees) {
      const y = parkHeightAt(x + CX, z + CZ) - 0.1, [tr, cr] = sets[kind];
      const col = kind === "B" ? pine[Math.floor(r() * 3)] : r() < 0.14 ? warm[Math.floor(r() * 4)] : green[Math.floor(r() * 6)];
      tr.put(x, y, z, s2, ry); cr.put(x, y, z, s2, ry, new THREE.Color(col).multiplyScalar(0.9 + r() * 0.2));
    }
    // every plant can be picked on its own in the world editor: a trunk and its crown move together (hubedit.js reads userData.editable)
    const editable = (a, b, label) => { if (a) a.userData.editable = { label, partners: b ? [b] : [] }; if (b) b.userData.editable = { label, partners: a ? [a] : [] }; };
    for (const [k, [tr, cr]] of Object.entries(sets)) editable(tr.into(g), cr.into(g), { A: "Tree", B: "Pine tree", C: "Birch tree" }[k]);
    // bushes
    const bushGeo = merge([blob(0.7, 1, 0.25, 7).translate(0, 0.45, 0), blob(0.55, 1, 0.25, 8).translate(0.55, 0.35, 0.2), blob(0.5, 1, 0.25, 9).translate(-0.5, 0.33, -0.15)]);
    const BI = new Inst(bushGeo, X.bush, true), bcol = [0x4e7d3a, 0x5f8f43, 0x6e9a49, 0x47763d];
    for (const [x, z, s2] of L.bushes) BI.put(x, parkHeightAt(x + CX, z + CZ) - 0.08, z, s2, r() * TAU, bcol[Math.floor(r() * 4)], s2 * 0.85);
    editable(BI.into(g), null, "Bush");
    // flowers: heads and stems
    const head = merge([...[0, 1, 2, 3, 4].map((k) => new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.4, 1).translate(Math.sin(k * 1.257) * 0.055, 0, Math.cos(k * 1.257) * 0.055)), new THREE.SphereGeometry(0.03, 6, 4).translate(0, 0.01, 0)]).translate(0, 0.42, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.42, 3).translate(0, 0.21, 0);
    const heads = new Inst(head, X.bush), stems = new Inst(stem, X.vine), fc = [0xff8fb0, 0xffd45c, 0xffffff, 0xc39bff, 0xff7a59, 0x8fd3ff, 0xfff0a0];
    for (const [x, z, c] of L.flowers) { const y = parkHeightAt(x + CX, z + CZ) - 0.02, s2 = 0.8 + r() * 0.7, ry = r() * TAU, tilt = (r() - 0.5) * 0.3; heads.put(x, y, z, s2, ry, fc[c], s2, tilt); stems.put(x, y, z, s2, ry, null, s2, tilt); }
    const hm = heads.into(g); editable(hm, stems.into(g), "Flowers"); if (hm) hm.material = Object.assign(X.bush.clone(), { emissive: new THREE.Color(0x222222) });
    // rocks
    const RI = new Inst(rockGeo(seeded(5), 0.6), X.T.rock, true); for (const [x, z, s2] of L.rocks) RI.put(x, parkHeightAt(x + CX, z + CZ) - 0.05, z, s2, r() * TAU, null, s2 * 0.8); editable(RI.into(g), null, "Rock");
    // butterflies over the flowers
    const wing = new THREE.BufferGeometry(); wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.06, 0.16, 0, 0.12, 0.13, 0, -0.06, 0, 0, 0.06, 0.13, 0, -0.06, 0, 0, -0.05, 0, 0, 0.06, -0.13, 0, -0.06, -0.16, 0, 0.12, 0, 0, 0.06, 0, 0, -0.05, -0.13, 0, -0.06], 3)); wing.computeVertexNormals();
    const NB = 48, flies = new THREE.InstancedMesh(wing, X.fly, NB), fd = [], bc = [0xffd45c, 0xff9ec4, 0x9fe0ff, 0xffffff, 0xffa55c, 0xc9a8ff];
    for (let i = 0; i < NB; i++) { const [x, z] = L.flowers[Math.floor(r() * L.flowers.length)] || [0, 40]; fd.push([x, z, 1 + r() * 3, r() * TAU, 0.3 + r() * 0.5, parkHeightAt(x + CX, z + CZ)]); flies.setColorAt(i, new THREE.Color(bc[i % bc.length])); }
    flies.frustumCulled = false; g.add(flies);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), e = new THREE.Euler();
    return { update(t) {
      for (let i = 0; i < NB; i++) {
        const [x, z, rr, ph, sp, y0] = fd[i], a = t * sp + ph, px = x + Math.sin(a) * rr + Math.sin(a * 2.3) * 0.6, pz = z + Math.cos(a * 0.8) * rr, py = y0 + 0.9 + Math.sin(a * 3.1) * 0.35;
        e.set(0, Math.atan2(Math.cos(a) * rr, -Math.sin(a * 0.8) * rr * 0.8), 0); q.setFromEuler(e); m4.compose(V(px, py, pz), q, sc); flies.setMatrixAt(i, m4);
      }
      flies.instanceMatrix.needsUpdate = true;
    } };
  }, { flat: true, walk: true, stay: true, colliders: () => [], info: "Trees all round the edge of the park, and meadows full of flowers." }),
};

// ---------------------------------------------------------------- where everything goes (park-local metres)
const PICNIC_SPOTS = [[3.5, -3.5, 0.3], [6.5, 2, -0.4], [2.5, 6.5, 0.9], [-4.5, -4.5, -0.8], [-7.5, 0.5, 1.2], [0.5, -8, 0.1], [7.5, -6.5, 0.6]];
const FIRE_PATH = Math.atan2(-79.4 - PLACES.fire.x, -26.6 - PLACES.fire.z);   // where the walk comes in
let TEA_COLLIDERS = [], PICNIC_COLLIDERS = [], TERRACE_COLLIDERS = [], FIRE_COLLIDERS = [], ZEN_COLLIDERS = [];
{ // colliders that need the layout: worked out once
  const R8 = 4.0; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, x = Math.sin(a) * R8, z = Math.cos(a) * R8; TEA_COLLIDERS.push([x - 0.25, z - 0.25, x + 0.25, z + 0.25]); }
  TEA_COLLIDERS.push([-0.8, -0.8, 0.8, 0.8]);
  PICNIC_COLLIDERS.push([-3.6, 1.9, -2.4, 3.1]);
  TERRACE_COLLIDERS.push([-0.2, -0.2, 0.2, 0.2]);
  FIRE_COLLIDERS.push([-1.6, -1.6, 1.6, 1.6]);
  { const lx = Math.sin(0.9) * 8.4, lz = Math.cos(0.9) * 8.4, bx = Math.sin(-2.3) * 8.6, bz = Math.cos(-2.3) * 8.6; ZEN_COLLIDERS.push([lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5], [bx - 0.65, bz - 0.65, bx + 0.65, bz + 0.65]); }
}

/** the trees, bushes, flowers and rocks that fill the land, worked out once (park-local metres) */
let WL = null;
function woodsLayout() {
  if (WL) return WL;
  const r = seeded(2024), trees = [], bushes = [], flowers = [], rocks = [];
  const grid = new Map(), key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const near = (x, z, d) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [px, pz] of grid.get(`${Math.floor(x / 4) + i},${Math.floor(z / 4) + j}`) || []) if (Math.hypot(px - x, pz - z) < d) return true; return false; };
  const mark = (x, z) => { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]); };
  const kindOf = () => { const u = r(); return u < 0.55 ? "A" : u < 0.85 ? "B" : "C"; };
  // the rim: beyond the edge, thick woods to look at (never walked)
  for (let rr = EDGE_R + 1.5; rr < 128; rr += 4.2) {
    const n = Math.round((TAU * rr) / 4.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.04, d = rr + (r() - 0.5) * 2.5, x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > 126) continue;
      trees.push([x, z, kindOf(), 1.0 + r() * 0.6, r() * TAU]); mark(x, z);
    }
  }
  // inside: groves where a slow noise says so, never on a walk, in a place, in the water or on the tea hill
  const freeIn = (x, z, pad) => {
    const d = Math.hypot(x, z);
    if (d < PLAZA + 13 || d > RING_R - 3.2) return false;
    if (inPlace(x, z, pad + 2) || onPath(x, z) || Math.hypot(x - TEA.x, z - TEA.z) < PK.teaR(TEA.step * 0.9) + 1.2 + pad) return false;
    if (!clearOfStream(x, z, pad + 2.5) || Math.hypot(x - POND.x, z - POND.z) < POND.r + 2.5 + pad || Math.hypot(x - LOOK.x, z - LOOK.z) < LOOK.r + 2 + pad) return false;
    if (segDist(x, z, ...PERGOLA) < 3.4 + pad) return false;
    for (const [L, w] of PATHS) for (let i = 1; i < L.length; i++) if (segDist(x, z, L[i - 1], L[i]) < w / 2 + 1.2 + pad) return false;
    return parkWalkable(x + CX, z + CZ);
  };
  const grove = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.045 + 1.7) * Math.sin(z * 0.052 - 0.4) + 0.25 * Math.sin(x * 0.11 + z * 0.09);
  for (let n = 0; n < 9000 && trees.length < 1200; n++) {
    const x = (r() - 0.5) * 2 * RING_R, z = (r() - 0.5) * 2 * RING_R;
    if (r() > grove(x, z) * 1.1 || !freeIn(x, z, 1.2) || near(x, z, 5.2)) continue;
    trees.push([x, z, kindOf(), 0.85 + r() * 0.5, r() * TAU]); mark(x, z);
  }
  // inner ring: trees just inside the ring walk, all round
  for (let i = 0; i < 90; i++) { const a = (i / 90) * TAU + r() * 0.03, d = RING_R - 6 - r() * 2.5, x = Math.sin(a) * d, z = Math.cos(a) * d; if (!freeIn(x, z, 0.5) || near(x, z, 4.5)) continue; trees.push([x, z, kindOf(), 0.9 + r() * 0.4, r() * TAU]); mark(x, z); }
  // bushes along the walks and round the places
  for (const [L, w] of PATHS) for (let i = 1; i < L.length; i++) {
    const [ax, az] = L[i - 1], [bx, bz] = L[i], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let d = 1.5; d < len; d += 3.2 + r() * 2) for (const sd of [-1, 1]) { if (r() < 0.35) continue; const x = ax + (bx - ax) * d / len + nx * sd * (w / 2 + 1.7), z = az + (bz - az) * d / len + nz * sd * (w / 2 + 1.7); if (freeBush(x, z)) bushes.push([x, z, 0.7 + r() * 0.5]); }
  }
  for (const p of [...Object.values(PLACES), ...CIRCLES]) { const n = Math.round(p.r * 1.6); for (let i = 0; i < n; i++) { const a = r() * TAU, d = p.r + 1.6 + r() * 1.6, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d; if (freeBush(x, z)) bushes.push([x, z, 0.8 + r() * 0.5]); } }
  for (let i = 0; i < 160; i++) { const a = (i / 160) * TAU, d = RING_R + 4.5 + r() * 1.5, x = Math.sin(a) * d, z = Math.cos(a) * d; bushes.push([x, z, 0.9 + r() * 0.6]); }
  function freeBush(x, z) { return Math.hypot(x, z) > PLAZA + 9 && !onPath(x, z) && !inPlace(x, z, 0.6) && clearOfStream(x, z, 1.5) && Math.hypot(x - POND.x, z - POND.z) > POND.r + 1.5 && parkWalkable(x + CX, z + CZ) && !near(x, z, 1.2) && Math.hypot(x - TEA.x, z - TEA.z) > PK.teaR(TEA.step * 0.9) + 1; }
  // flower meadows: patches where the trees aren't
  for (let n = 0; n < 4000 && flowers.length < 7000; n++) {
    const x = (r() - 0.5) * 2 * RING_R, z = (r() - 0.5) * 2 * RING_R;
    if (grove(x, z) > 0.55 || !freeIn(x, z, -1.2)) continue;
    const c = Math.floor(r() * 7), m = 18 + Math.floor(r() * 30);
    for (let k = 0; k < m; k++) { const a = r() * TAU, d = Math.sqrt(r()) * 2.6, fx = x + Math.sin(a) * d, fz = z + Math.cos(a) * d; if (onPath(fx, fz) || inPlace(fx, fz, 0.3) || !clearOfStream(fx, fz, 0.6)) continue; flowers.push([fx, fz, r() < 0.75 ? c : Math.floor(r() * 7)]); }
  }
  for (let n = 0; n < 600 && rocks.length < 90; n++) { const x = (r() - 0.5) * 2 * RING_R, z = (r() - 0.5) * 2 * RING_R; if (!freeIn(x, z, 0) || near(x, z, 2)) continue; rocks.push([x, z, 0.5 + r() * 1.1]); mark(x, z); }
  WL = { trees, bushes, flowers, rocks, near };
  return WL;
}

/** puts all of the above into the park, and its people at the places */
export function furnishPark(hub) {
  if (!hub) return hub;
  const items = hub.layout.items, spots = hub.spots;
  const at = (type, lx, lz, o = {}) => { const [x, z] = W(lx, lz); const it = { type, x, z, y: parkHeightAt(x, z), ...o }; items.push(it); return it; };
  const seatAt = (type, lx, lz, rot, o = {}) => { at(type, lx, lz, { rot, ...o }); spots.benches?.push(W(lx, lz)); };
  const A = PLACES;
  at("pkPaths", 0, 0, { y: 0 }); at("pkWoods", 0, 0, { y: 0 });
  at("pkTea", TEA.x, TEA.z, { y: 0 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3, x = TEA.x + Math.sin(a) * 1.45, z = TEA.z + Math.cos(a) * 1.45; seatAt("pkCushion", x, z, faceTo(x, z, TEA.x, TEA.z), { y: PK.gazY() + 0.32, n: k }); }
  at("pkAmphi", A.amphi.x, A.amphi.z, { y: PK.padY(A.amphi) });
  for (let k = 0; k < 12; k++) { const row = k % 2 ? 1 : 3, a = A.amphi.face - A.amphi.span * 0.85 + (Math.floor(k / 2) / 5) * A.amphi.span * 1.7, d = 7 + 1.4 * row + 0.35, x = A.amphi.x + Math.sin(a) * d, z = A.amphi.z + Math.cos(a) * d; seatAt("pkCushion", x, z, faceTo(x, z, A.amphi.x, A.amphi.z), { y: PK.padY(A.amphi) + (row + 1) * 0.42, n: k }); }
  at("pkWish", A.wish.x, A.wish.z, { y: PK.padY(A.wish) });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + TAU / 16; if (Math.abs(angDiff(a, -Math.PI / 2)) < 0.5 || Math.abs(angDiff(a, Math.PI / 2 + 0.16)) < 0.5) continue; const x = A.wish.x + Math.sin(a) * 6.3, z = A.wish.z + Math.cos(a) * 6.3; seatAt("mhBench", x, z, faceTo(x, z, A.wish.x, A.wish.z), { y: PK.padY(A.wish) }); }
  at("pkPicnic", A.picnic.x, A.picnic.z, { y: PK.padY(A.picnic) });
  for (const [i, [bx, bz, rot]] of PICNIC_SPOTS.entries()) for (const sd of [-1, 1]) { const lx = sd * 0.55, lz = 0.55 * sd, x = A.picnic.x + bx + lx * Math.cos(rot) + lz * Math.sin(rot), z = A.picnic.z + bz - lx * Math.sin(rot) + lz * Math.cos(rot); seatAt("pkCushion", x, z, faceTo(x, z, A.picnic.x + bx, A.picnic.z + bz), { y: parkHeightAt(...W(x, z)) + 0.04, n: i * 2 + sd }); }
  at("pkTerrace", A.cafe.x, A.cafe.z, { y: PK.padY(A.cafe) });
  for (const [k, a] of [0.5, 2.1, -1.9, 3.9, -0.6].entries()) {
    const d = k === 4 ? 1.9 : 3.9, tx = A.cafe.x + Math.sin(a) * d, tz = A.cafe.z + Math.cos(a) * d;
    at("pkTable", tx, tz, { y: PK.padY(A.cafe) + 0.07, parasol: true, n: k });
    for (let c = 0; c < 3; c++) { const ca = (c / 3) * TAU + a, x = tx + Math.sin(ca) * 0.95, z = tz + Math.cos(ca) * 0.95; seatAt("pkChair", x, z, faceTo(x, z, tx, tz), { y: PK.padY(A.cafe) + 0.07 }); }
  }
  // the pergola: its arches and wisteria, benches along it
  const [pa, pb] = PERGOLA, pm = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  at("pkPergola", pm[0], pm[1], { y: 0 });
  { const dx = pb[0] - pa[0], dz = pb[1] - pa[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L; for (let d = 3.6; d < L - 2; d += 7.2) for (const sd of [-1, 1]) { const x = pa[0] + ux * d + uz * sd * 2.9, z = pa[1] + uz * d - ux * sd * 2.9; seatAt("mhBench", x, z, Math.atan2(-uz * sd, ux * sd)); } }
  at("pkHammockGrove", A.hammock.x, A.hammock.z, { y: PK.padY(A.hammock) });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.5, x = A.hammock.x + Math.sin(a) * 6.3, z = A.hammock.z + Math.cos(a) * 6.3; if (onPath(x, z)) continue; seatAt("pkHammock", x, z, a + Math.PI / 2, { y: PK.padY(A.hammock), n: k }); }
  at("pkFire", A.fire.x, A.fire.z, { y: PK.padY(A.fire) });
  for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.65 + FIRE_PATH; if (Math.abs(angDiff(a, FIRE_PATH)) < 0.5) continue; const x = A.fire.x + Math.sin(a) * 3.6, z = A.fire.z + Math.cos(a) * 3.6; seatAt("pkLog", x, z, faceTo(x, z, A.fire.x, A.fire.z), { y: PK.padY(A.fire) }); }
  at("pkZen", A.zen.x, A.zen.z, { y: PK.padY(A.zen) });
  for (let k = 0; k < 5; k++) { const a = Math.PI - 0.6 + (k / 4) * 1.2, x = A.zen.x + Math.sin(a) * 8.3, z = A.zen.z + Math.cos(a) * 8.3; if (Math.abs(angDiff(a, Math.PI)) < 0.12) continue; seatAt("pkCushion", x, z, faceTo(x, z, A.zen.x, A.zen.z), { y: PK.padY(A.zen) + 0.2, n: k + 3 }); }
  at("pkDome", A.dome.x, A.dome.z, { y: PK.padY(A.dome) });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4, x = A.dome.x + Math.sin(a) * 2.9, z = A.dome.z + Math.cos(a) * 2.9; seatAt("mhBench", x, z, faceTo(x, z, A.dome.x, A.dome.z), { y: PK.padY(A.dome) + 0.05 }); }
  // the quiet circles: a centrepiece and benches round it, gaps where the walk comes in
  for (const c of CIRCLES) {
    at("pkCircle", c.x, c.z, { y: PK.padY(c), kind: c.kind });
    if (c.kind === 0) at("mhBlossom", c.x, c.z, { y: PK.padY(c), n: 77 });
    const ins = []; for (const [L] of PATHS) for (const [px, pz] of [L[0], L[L.length - 1]]) if (Math.hypot(px - c.x, pz - c.z) < c.r + 3) ins.push(Math.atan2(px - c.x, pz - c.z));
    const inA = ins[0] ?? 0;
    for (let k = 0; k < 6; k++) { const a = inA + (k / 6) * TAU + TAU / 12, x = c.x + Math.sin(a) * 4.3, z = c.z + Math.cos(a) * 4.3; if (ins.some((o) => Math.abs(angDiff(a, o)) < 0.6)) continue; seatAt("mhBench", x, z, faceTo(x, z, c.x, c.z), { y: PK.padY(c) }); }
  }
  // gates on the ring, lamps and benches all the way round it
  DIRS.forEach((a) => at("pkGate", Math.sin(a) * (RING_R - 4.4), Math.cos(a) * (RING_R - 4.4), { rot: a }));
  const sideEnds = [[-39.4, 94.1], [82, -61.5], [-55, -86.6]];
  for (const [L] of PATHS) { const [ex, ez] = L[L.length - 1], [px, pz] = L[L.length - 2]; if (Math.abs(Math.hypot(ex, ez) - RING_R) > 2) continue; const a = Math.atan2(ex - px, ez - pz); at("pkGate", ex - Math.sin(a) * 3.8, ez - Math.cos(a) * 3.8, { rot: a, small: true }); }
  const joins = [...DIRS, ...sideEnds.map(([x, z]) => Math.atan2(x, z))];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + 0.03; if (joins.some((j) => Math.abs(angDiff(a, j)) < 0.09)) continue;
    if (i % 2 === 0) at("mhLamp", Math.sin(a) * (RING_R - 2.7), Math.cos(a) * (RING_R - 2.7));
    else { const x = Math.sin(a) * (RING_R + 2.7), z = Math.cos(a) * (RING_R + 2.7); seatAt("mhBench", x, z, faceTo(x, z, 0, 0)); }
  }
  // lamps along the side walks
  for (const [L] of PATHS) for (let i = 1; i < L.length; i++) { const [ax, az] = L[i - 1], [bx, bz] = L[i], len = Math.hypot(bx - ax, bz - az); if (len < 9) continue; const x = (ax + bx) / 2 - ((bz - az) / len) * 2.4, z = (az + bz) / 2 + ((bx - ax) / len) * 2.4; if (!inPlace(x, z, 1) && parkWalkable(...W(x, z))) at("mhLamp", x, z); }
  // nooks by the walks: two benches facing each other with a lantern between
  const WLay = woodsLayout(), nr = seeded(31337); let nooks = 0;
  for (let n = 0; n < 400 && nooks < 16; n++) {
    const [L, w] = PATHS[Math.floor(nr() * PATHS.length)], i = 1 + Math.floor(nr() * (L.length - 1)), [ax, az] = L[i - 1], [bx, bz] = L[i], t = 0.2 + nr() * 0.6, len = Math.hypot(bx - ax, bz - az) || 1, sd = nr() < 0.5 ? -1 : 1;
    const x = lerp(ax, bx, t) - ((bz - az) / len) * sd * (w / 2 + 3.4), z = lerp(az, bz, t) + ((bx - ax) / len) * sd * (w / 2 + 3.4);
    if (inPlace(x, z, 3) || onPath(x, z) || !parkWalkable(...W(x, z)) || !clearOfStream(x, z, 3) || WLay.near(x, z, 4.6) || Math.hypot(x - TEA.x, z - TEA.z) < 30) continue;
    if (items.some((it) => it.type === "pkNook" && Math.hypot(it.x - CX - x, it.z - CZ - z) < 14)) continue;
    { const hs = []; for (let k = 0; k < 8; k++) hs.push(parkHeightAt(...W(x + Math.sin(k * 0.785) * 3, z + Math.cos(k * 0.785) * 3))); if (Math.max(...hs) - Math.min(...hs) > 0.45) continue; }   // no nooks on steep slopes: they can't sit right there
    if (items.some((it) => /^(mhKiosk|mhLamp|mhPhoto|mhBlossom|mhScope|pkGate)$/.test(it.type) && Math.hypot(it.x - CX - x, it.z - CZ - z) < (it.type === "mhLamp" ? 3.8 : 6))) continue;   // a nook gets its own patch of ground
    const ry = Math.atan2(bx - ax, bz - az);
    at("pkNook", x, z, { n: n + 1, post: [-((bz - az) / len) * sd * 2.4, ((bx - ax) / len) * sd * 2.4] });
    for (const s2 of [-1, 1]) { const ox = x + Math.sin(ry) * s2 * 1.5, oz = z + Math.cos(ry) * s2 * 1.5; seatAt("mhBench", ox, oz, ry + (s2 > 0 ? Math.PI : 0)); }
    nooks++;
  }
  // the pack's trees keep clear of ours
  spots.trees = spots.trees.filter(([x, z]) => !WLay.near(x - CX, z - CZ, 4.5));
  spots.bushes = spots.bushes.filter(([x, z]) => !WLay.near(x - CX, z - CZ, 2));
  // benches lie on the slope: tilted along their length and front to back to match the ground under them
  for (const it of items) if (it.type === "mhBench") {
    const c = Math.cos(it.rot || 0), s = Math.sin(it.rot || 0), h = (bx, bz) => parkHeightAt(it.x + bx * c + bz * s, it.z - bx * s + bz * c);
    if (Math.abs((it.y || 0) - h(0, 0)) > 0.15) continue;                 // set on a floor of its own (a deck, the dome): stays level there
    const L = h(-1.3, 0), R = h(1.3, 0), Fr = h(0, 0.35), Bk = h(0, -0.35);
    it.tz = Math.atan2(R - L, 2.6); it.tx = -Math.atan2(Fr - Bk, 0.7);
    it.y = (L + R + Fr + Bk) / 4 - 0.02;
  }
  for (let i = items.length - 1; i >= 0; i--) if (items[i].type === "mhBench" && (Math.abs(items[i].tz) > 0.3 || Math.abs(items[i].tx) > 0.3)) items.splice(i, 1);   // too steep for a bench: none
  { const kept = []; for (let i = 0; i < items.length; i++) { const it = items[i]; if (it.type !== "mhBench") continue; if (kept.some((o) => Math.hypot(o.x - it.x, o.z - it.z) < 2)) { items.splice(i--, 1); continue; } kept.push(it); } }   // two benches never in one spot
  // nothing from the pack lands on a seat, a nook, a kiosk or a lamp
  const keep = items.filter((it) => /^(mhBench|pkNook|mhKiosk|mhLamp|mhPhoto|mhScope|pkCushion)$/.test(it.type)).map((it) => [it.x, it.z, it.type === "pkNook" ? 3.8 : 2.2]);
  const clear = ([x, z]) => keep.every(([kx, kz, d]) => Math.hypot(x - kx, z - kz) > d);
  for (const k of ["trees", "small", "bushes", "flowers", "rocks"]) if (spots[k]) spots[k] = spots[k].filter(clear);
  spots.places = { ...PLACES };
  // people: a few at every place, more out walking the ring
  const pr = seeded(99), NAMES2 = ["Aya", "Bo", "Cleo", "Dev", "Emi", "Finn", "Gia", "Hiro", "Iris", "Jon", "Kira", "Lev", "Mei", "Nico", "Oona", "Pax", "Quinn", "Rio", "Suki", "Taj", "Uma", "Vic", "Wren", "Yuki", "Zoe"];
  const TONES2 = ["#f27ea6", "#5fb8e8", "#f2c14e", "#7cc576", "#b48ae8", "#6fc3b2", "#e58fb4", "#7fa8e0"];
  let pn = 0;
  const person = (lx, lz, still, area) => { const [x, z] = W(lx, lz); if (!parkWalkable(x, z)) return; hub.people.push({ id: `park-p${pn}`, name: NAMES2[pn % NAMES2.length], color: TONES2[pn % TONES2.length], x, z, area, roam: !still, still }); pn++; };
  for (const p of [...Object.values(PLACES), ...CIRCLES]) {
    const area = { minX: p.x + CX - p.r - 2, maxX: p.x + CX + p.r + 2, minZ: p.z + CZ - p.r - 2, maxZ: p.z + CZ + p.r + 2 };
    for (let i = 0; i < (p.r > 8 ? 4 : 2); i++) { const a = pr() * TAU, d = p.r * (0.55 + pr() * 0.35); person(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, i % 2 === 0, area); }
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, x = Math.sin(a) * RING_R, z = Math.cos(a) * RING_R, area = { minX: x + CX - 18, maxX: x + CX + 18, minZ: z + CZ - 18, maxZ: z + CZ + 18 }; person(x, z, false, area); }
  return hub;
}

// the pergola is its own piece below, so the catalog above stays in reading order
PLACES_CATALOG.pkPergola = P("Wisteria pergola", (g, s) => {
  const X = xm(), T = X.T, K = new Kit(), [pa, pb] = PERGOLA, mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
  const dx = pb[0] - pa[0], dz = pb[1] - pa[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux, r = seeded(7);
  const gy = (x, z) => parkHeightAt(x + mx + CX, z + mz + CZ) - (s.y || 0), HALF = 1.95, Hp = 2.7;
  const at = (d, lat) => [pa[0] - mx + ux * d + nx * lat, pa[1] - mz + uz * d + nz * lat];
  const n = Math.floor(L / 2.4), tops = [];
  const cone = swayUV(new THREE.ConeGeometry(0.17, 1, 8).rotateX(Math.PI).translate(0, -0.5, 0), 0, -1);
  { const uv = cone.attributes.uv, p = cone.attributes.position; for (let i = 0; i < p.count; i++) uv.setY(i, Math.min(1, -p.getY(i))); }
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * L, [cx, cz] = at(d, 0), y = gy(cx, cz), arch = [];
    for (const sd of [-1, 1]) { const [x, z] = at(d, sd * HALF); K.cyl(0.08, 0.1, Hp, T.white, { x, z, y: y + Hp / 2 }, 10); K.box(0.3, 0.12, 0.3, X.gold, { x, z, y: y + 0.06 }); }
    for (let i = 0; i <= 14; i++) { const u = i / 14, [x, z] = at(d, lerp(-HALF, HALF, u)); arch.push(V(x, y + Hp + Math.sin(Math.PI * u) * 0.75, z)); }
    K.add(tube(arch, 0.08, 28, 6), T.white);
    tops.push(y);
    if (k % 2 === 0) { const p = lantern(K, X, cx, y + Hp + 0.7, cz, 0.85); tops.glows = (tops.glows || []).concat([p]); }
  }
  // the lattice along the top, leaves on it, wisteria hanging from it
  for (const lat of [-1.6, -0.9, -0.3, 0.3, 0.9, 1.6]) {
    const pts = []; for (let k = 0; k <= n; k++) { const d = (k / n) * L, [x, z] = at(d, lat), u = (lat + HALF) / (2 * HALF); pts.push(V(x, tops[k] + Hp + Math.sin(Math.PI * u) * 0.75 + 0.06, z)); }
    K.add(tube(pts, 0.035, n * 4, 4), T.timber);
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < 9; j++) {
    const d = ((k + r()) / n) * L, lat = (r() - 0.5) * 3.4, [x, z] = at(d, lat), u = (lat + HALF) / (2 * HALF), y = lerp(tops[k], tops[k + 1], (d / L) * n - k) + Hp + Math.sin(Math.PI * u) * 0.75;
    K.add(blob(0.3 + r() * 0.2, 1, 0.3, k * 9 + j), X.vine, { x, z, y: y + 0.12, sy: 0.6 });
    if (j < 7) K.add(cone.clone(), pick(X.wisteria, j), { x, z, y, sy: 0.55 + r() * 0.65, ry: r() * TAU });
  }
  const glows = tops.glows || [];
  K.into(g);
  for (const p of glows) halo(g, p, 1.2, X.M.haloWarm);
}, { stay: true, colliders: () => PERGOLA_COLLIDERS, info: "The wisteria pergola: arches of white and lilac all the way down the walk." });
const PERGOLA_COLLIDERS = (() => {
  const [pa, pb] = PERGOLA, mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dz = pb[1] - pa[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, n = Math.floor(L / 2.4), out = [];
  for (let k = 0; k <= n; k++) for (const sd of [-1, 1]) { const d = (k / n) * L, x = pa[0] - mx + ux * d + uz * sd * 1.95, z = pa[1] - mz + uz * d - ux * sd * 1.95; out.push([x - 0.15, z - 0.15, x + 0.15, z + 0.15]); }
  return out;
})();
