// beachhub.js - the Beach Resort's own pieces: a living sea (waves, foam that laps the sand, a gold path under the sun), the sand that
// slopes down under it, the low sun, an island with a lighthouse, sailboats and a buoy line that bob on the swell, two thatched beach bars,
// a lifeguard tower, palms, a canopy of string lights over the deck, surfboards, towels and umbrellas, sandcastles, and shells on the sand.
// Everything is procedural (lots of small triangles: thatch fringe, palm leaflets, starfish), all in local space; hubs.js places it.
import * as THREE from "three";
import { Kit, canvasTex } from "./mainhub.js";

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function seeded(seed) { let h = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
const P = (label, make, extra = {}) => ({ label, mount: "floor", hubOnly: true, category: "hub", ...extra,
  build(ctx) { const group = new THREE.Group(); const ex = make(group, ctx.spec, ctx) || {}; return { group, walkable: !!(extra.flat && extra.walk), ...ex }; } });
const passThrough = (g) => { g.traverse((o) => { if (o.isMesh) o.raycast = () => {}; }); return g; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const glowMat = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.6 });
const shared = (m, noShadow = false) => { m.userData.shared = true; if (noShadow) m.userData.noShadow = true; return m; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** triangles from a flat list of positions, with the uv every Kit part needs (merging wants the same attributes everywhere) */
function triGeo(pos) {
  const g = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals(); return g;
}
function rod(K, a, b, r0, mat, n = 6, r1 = r0) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, n, 1, false);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return K.add(geo, mat);
}
const sagLine = (a, b, sag, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0)); });
function blob(r, seed, detail = 2, k = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, q = seeded(seed);
  const a = q() * 9, b = q() * 9, c = q() * 9;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = Math.sin(x * 2.1 / r + a) * Math.cos(z * 1.7 / r - b) + 0.5 * Math.sin(y * 3.3 / r + c); const f = 1 + k * s; p.setXYZ(i, x * f, y * f, z * f); }
  g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- the ground: sand that runs down under the sea
/** height of the sand (and the seabed): flat above the tide line, then shelving away */
export function sandY(z) {
  if (z >= -3) return -0.03;
  if (z >= -8) return -0.03 + (z + 3) * 0.1;
  return Math.max(-3, -0.53 + (z + 8) * 0.045);
}
const WATER = -0.1;                                                        // the sea's resting level: the tide line sits at z = -3.7

// ---------------------------------------------------------------- live things: the sea's clock, bobbing boats, the lighthouse beam
const LIVE = { time: { value: 0 }, bob: [], spin: [] };
export function resetBeach() { LIVE.bob.length = 0; LIVE.spin.length = 0; }
export function beachTick(dt, t) {
  LIVE.time.value = t;
  for (const b of LIVE.bob) {
    b.o.position.y = b.y + Math.sin(t * b.f + b.p) * b.a;
    b.o.rotation.x = Math.sin(t * b.f * 0.8 + b.p + 1) * b.r; b.o.rotation.z = Math.sin(t * b.f * 0.63 + b.p) * b.r * 1.4;
  }
  for (const s of LIVE.spin) s.o.rotation.y = t * s.w;
}

// ---------------------------------------------------------------- the sea
const SEA_VS = /* glsl */`
uniform float uTime;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDepth;
#include <fog_pars_vertex>
float sandY(float z) {
  if (z >= -3.0) return -0.03;
  if (z >= -8.0) return -0.03 + (z + 3.0) * 0.1;
  return max(-3.0, -0.53 + (z + 8.0) * 0.045);
}
// one wave: height and its slope
void wave(vec2 p, vec2 d, float L, float A, float sp, inout float h, inout vec2 g, inout float crest) {
  d = normalize(d); float k = 6.2831853 / L, w = sqrt(9.8 * k) * sp;
  float f = k * dot(d, p) - w * uTime, e = (sin(f) + 1.0) * 0.5;
  h += A * (2.0 * e * e - 1.0);                      // sharper crests, wider troughs
  g += d * (2.0 * A * e * cos(f) * k);
  crest = max(crest, e * e * step(0.02, A));
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz; float dist = -3.7 - p.y;          // metres out from the tide line
  float near = 0.3 + 0.7 * smoothstep(-1.0, 22.0, dist), swell = smoothstep(18.0, 110.0, dist), calm = 1.0 - smoothstep(0.0, 9.0, dist);
  float h = 0.0, cr = 0.0; vec2 g = vec2(0.0);
  wave(p, vec2(0.12, 1.0), 13.0, 0.055 * near, 1.0, h, g, cr);
  wave(p, vec2(-0.35, 1.0), 8.5, 0.035 * near, 1.0, h, g, cr);
  wave(p, vec2(0.6, 1.0), 5.2, 0.022 * near, 1.0, h, g, cr);
  wave(p, vec2(-0.85, 0.55), 3.1, 0.012 * near, 1.0, h, g, cr);
  wave(p, vec2(0.04, 1.0), 36.0, 0.42 * swell, 0.8, h, g, cr);
  wave(p, vec2(0.5, 1.0), 21.0, 0.2 * swell, 0.9, h, g, cr);
  // the wash: the water's edge runs up the sand and back
  h += calm * (0.05 * sin(uTime * 0.62 + p.x * 0.045) + 0.022 * sin(uTime * 1.07 - p.x * 0.13 + 1.7));
  wp.y = ${WATER.toFixed(3)} + h;
  vW = wp.xyz; vN = normalize(vec3(-g.x, 1.0, -g.y)); vCrest = cr * smoothstep(4.0, 30.0, dist); vDepth = wp.y - sandY(p.y);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SEA_FS = /* glsl */`
uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uHorizon, uSun, uFoam, uSunDir;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDepth;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vW.xz;
  float n1 = noise(q * 0.8 + vec2(uTime * 0.25, uTime * 0.45)), n2 = noise(q * 2.4 - vec2(uTime * 0.35, -uTime * 0.55)), n3 = noise(q * 6.0 + uTime * 0.7);
  vec3 N = normalize(vN + vec3((n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.14 + (n3 - 0.5) * 0.06, 0.0, (n2 - 0.5) * 0.22 - (n1 - 0.5) * 0.1));
  vec3 Vd = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(N, Vd), 0.0), 3.0);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 1.6, vDepth));
  vec3 R = reflect(-Vd, N);
  vec3 sky = mix(uHorizon, uSky, clamp(R.y * 2.2, 0.0, 1.0));
  vec3 col = mix(water, sky, 0.12 + 0.72 * fres);
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSun * (pow(sd, 600.0) * 7.0 + pow(sd, 60.0) * 0.5 + pow(sd, 8.0) * 0.08);
  // foam: a frothy edge where the water runs thin, streaks behind it, and the odd white cap out at sea
  float edge = 1.0 - smoothstep(0.0, 0.05 + 0.06 * n1, vDepth);
  float lace = smoothstep(0.5, 0.85, noise(q * vec2(1.7, 3.4) + vec2(n2 * 1.5, uTime * 0.6))) * (1.0 - smoothstep(0.04, 0.32, vDepth));
  float caps = smoothstep(0.62, 0.95, vCrest) * smoothstep(0.42, 0.78, noise(q * 1.1 + vec2(uTime * 0.15, 0.0)));
  float foam = clamp(edge + lace * 0.75 + caps * 0.7, 0.0, 1.0);
  col = mix(col, uFoam, foam);
  float alpha = mix(0.42, 0.95, smoothstep(0.0, 0.55, vDepth));
  alpha = max(alpha, foam * 0.95) * smoothstep(-0.01, 0.018, vDepth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function seaMaterial() {
  const C = (h) => new THREE.Color(h);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDeep: { value: C("#1d4e72") }, uShallow: { value: C("#47b3a8") }, uSky: { value: C("#8e7aa8") }, uHorizon: { value: C("#ffc98a") },
      uSun: { value: C("#ffd9a0") }, uFoam: { value: C("#fff6ea") }, uSunDir: { value: V(0, 0.07, -1).normalize() },
    }]),
    vertexShader: SEA_VS, fragmentShader: SEA_FS, fog: true, transparent: true,
  });
  m.uniforms.uTime = LIVE.time;                                             // the clock everyone shares
  return m;
}
/** a grid that is fine by the shore and coarse out at sea */
function seaGrid() {
  const xs = [], zs = [], M = 220, N = 150;
  for (let j = 0; j <= M; j++) { const u = (j / M) * 2 - 1; xs.push(Math.sign(u) * 520 * Math.abs(u) ** 1.5); }
  for (let i = 0; i <= N; i++) zs.push(-1.5 - 470 * (i / N) ** 1.8);
  const pos = [], idx = [];
  for (const z of zs) for (const x of xs) pos.push(x, 0, z);
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(V(0, 0, -200), 700);
  return g;
}

// ---------------------------------------------------------------- textures
let TEX = null;
function tex() {
  if (TEX) return TEX;
  TEX = {
    sand: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#f4ead8"; g.fillRect(0, 0, w, h);
      const r = seeded(4);
      for (let i = 0; i < 30000; i++) { const v = 200 + r() * 55; g.fillStyle = `rgba(${v},${v - 18},${v - 46},${0.25 + r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      g.strokeStyle = "rgba(150,120,80,.10)"; g.lineWidth = 3;                       // wind ripples
      for (let y = 0; y < h; y += 22) { g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 5); g.stroke(); }
    }, { repeat: [1, 1] }),
    thatch: canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#b08a4c"; g.fillRect(0, 0, w, h);
      const r = seeded(9);
      for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h, l = 18 + r() * 40; g.strokeStyle = `hsla(${36 + r() * 10},${40 + r() * 20}%,${38 + r() * 30}%,.8)`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + l); g.stroke(); }
      for (let y = 0; y < h; y += 42) { g.fillStyle = "rgba(60,40,15,.35)"; g.fillRect(0, y, w, 4); }
    }),
    bamboo: canvasTex(256, 256, (g, w, h) => {
      for (let x = 0; x < w; x += 32) {
        const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, "#8a6a32"); gr.addColorStop(0.35, "#d8b66a"); gr.addColorStop(0.7, "#c49a4e"); gr.addColorStop(1, "#6e5228");
        g.fillStyle = gr; g.fillRect(x, 0, 32, h);
        for (let y = (x * 7) % 64; y < h; y += 64) { g.fillStyle = "rgba(70,45,15,.7)"; g.fillRect(x + 2, y, 28, 4); g.fillStyle = "rgba(255,240,200,.35)"; g.fillRect(x + 2, y + 4, 28, 2); }
      }
    }),
    weave: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#9c7a44"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const o = ((x + y) / 16) % 2; g.fillStyle = o ? "#c9a462" : "#b38c4f"; g.fillRect(x + 1, y + 1, o ? 14 : 6, o ? 6 : 14); }
    }),
    planks: canvasTex(256, 256, (g, w, h) => {
      const r = seeded(31);
      for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${24 + r() * 10}%,${40 + r() * 10}%)`; g.fillRect(0, (i * h) / 8, w, h / 8); g.fillStyle = "rgba(30,15,5,.6)"; g.fillRect(0, (i * h) / 8, w, 2); }
    }),
  };
  return TEX;
}
function stripes(cols, n = 8, vertical = true) {
  return canvasTex(256, 256, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; if (vertical) g.fillRect((i * w) / n, 0, w / n + 1, h); else g.fillRect(0, (i * h) / n, w, h / n + 1); } });
}
function signTex(text, sub, bg, fg) {
  return canvasTex(768, 220, (g, w, h) => {
    g.fillStyle = "#4a3018"; g.beginPath(); g.roundRect(0, 0, w, h, 60); g.fill();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
    g.fillStyle = gr; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 52); g.fill();
    g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 4; g.setLineDash([14, 10]); g.beginPath(); g.roundRect(26, 26, w - 52, h - 52, 40); g.stroke(); g.setLineDash([]);
    // a little sun and waves either side
    for (const x of [86, w - 86]) {
      g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(x, h * 0.46, 28, Math.PI, 0); g.fill();
      g.strokeStyle = "#ffffff"; g.lineWidth = 6; g.beginPath(); for (let k = -40; k <= 40; k += 4) g.lineTo(x + k, h * 0.58 + Math.sin(k * 0.2) * 5); g.stroke();
    }
    g.textAlign = "center"; g.textBaseline = "middle";
    let fs = 84; g.font = `900 ${fs}px system-ui, "Segoe UI", sans-serif`;
    const tw = g.measureText(text).width, room = w - 240; if (tw > room) { fs *= room / tw; g.font = `900 ${fs}px system-ui, "Segoe UI", sans-serif`; }
    g.lineWidth = fs * 0.18; g.strokeStyle = "rgba(60,25,10,.75)"; g.strokeText(text, w / 2, h * 0.42);
    g.fillStyle = fg; g.fillText(text, w / 2, h * 0.42);
    g.font = `800 34px system-ui, sans-serif`; g.fillStyle = "#fff6e0"; g.fillText(sub, w / 2, h * 0.76);
  });
}
function radial(inner, outer) {
  return canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}

// ---------------------------------------------------------------- shared materials
let SM = null;
function sm() {
  if (SM) return SM;
  const T = tex();
  SM = {
    sand: shared(std(0xe8d3a8, { roughness: 1, flatShading: true })),
    wetSand: shared(std(0xb59869, { roughness: 0.6, flatShading: true })),
    rock: shared(std(0x7d7268, { roughness: 0.95, flatShading: true })), rockDark: shared(std(0x5a514b, { roughness: 0.95, flatShading: true })),
    grass: shared(std(0x6f8f45, { roughness: 1, flatShading: true })), jungle: shared(std(0x3f6b34, { roughness: 1, flatShading: true })),
    bark: shared(std(0x8a6a48, { roughness: 1, flatShading: true })), barkRing: shared(std(0x6a4e33, { roughness: 1, flatShading: true })),
    frond: shared(std(0x4f8f3a, { roughness: 0.85, side: THREE.DoubleSide, flatShading: true })), frond2: shared(std(0x6aa848, { roughness: 0.85, side: THREE.DoubleSide, flatShading: true })),
    coconut: shared(std(0x5a3d22, { roughness: 0.8 })),
    thatch: shared(std(0xffffff, { map: T.thatch, roughness: 1, side: THREE.DoubleSide })), fringe: shared(std(0xc29a55, { roughness: 1, side: THREE.DoubleSide, flatShading: true })),
    bamboo: shared(std(0xffffff, { map: T.bamboo, roughness: 0.7 })), weave: shared(std(0xffffff, { map: T.weave, roughness: 0.9 })),
    planks: shared(std(0xffffff, { map: T.planks, roughness: 0.8 })), wood: shared(std(0x9b6f45, { roughness: 0.7 })), dark: shared(std(0x3b2a1e, { roughness: 0.8 })),
    top: shared(std(0x7a4a2a, { roughness: 0.35 })), white: shared(std(0xf7f3ea, { roughness: 0.6 })), red: shared(std(0xd9443c, { roughness: 0.55 })),
    yellow: shared(std(0xf2c230, { roughness: 0.55 })), navy: shared(std(0x253a5e, { roughness: 0.6 })), rope: shared(std(0xcdb487, { roughness: 1 }), true),
    metal: shared(std(0x9aa3ad, { roughness: 0.35, metalness: 0.7 }), true),
    bulb: shared(new THREE.MeshBasicMaterial({ color: 0xffe2a6 }), true), bulbPink: shared(new THREE.MeshBasicMaterial({ color: 0xff9fc0 }), true), bulbBlue: shared(new THREE.MeshBasicMaterial({ color: 0x9fe0ff }), true),
    flame: shared(new THREE.MeshBasicMaterial({ color: 0xffb347 }), true), flameCore: shared(new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), true),
    lamp: shared(glowMat(0xfff0c4, 3), true),
    bottles: ["#2e8b57", "#c0392b", "#f39c12", "#8e44ad", "#16a085", "#d35400", "#2980b9"].map((c) => shared(std(new THREE.Color(c), { roughness: 0.15, emissive: new THREE.Color(c), emissiveIntensity: 0.35 }), true)),
    shells: ["#f6d7c3", "#f3b6a4", "#fff3e3", "#e9c4a0"].map((c) => shared(std(new THREE.Color(c), { roughness: 0.5, flatShading: true }), true)),
    star: shared(std(0xe8743b, { roughness: 0.8, flatShading: true }), true), pebble: shared(std(0x9b928a, { roughness: 0.9, flatShading: true }), true),
    boards: ["#ff6f61", "#ffd23f", "#4fc3f7", "#7ed957", "#c084fc", "#ff9fc0"].map((c) => shared(std(new THREE.Color(c), { roughness: 0.35 }))),
    sail: shared(std(0xfff8ee, { roughness: 0.9, side: THREE.DoubleSide })), sailStripe: shared(std(0xff8a65, { roughness: 0.9, side: THREE.DoubleSide })),
    hull: shared(std(0xf4f1ea, { roughness: 0.5 })), hullBlue: shared(std(0x2f5d8a, { roughness: 0.5 })), deck: shared(std(0xc89b66, { roughness: 0.8 })),
  };
  return SM;
}
const STRIPED = new Map();
function stripedMat(cols) {
  const k = cols.join();
  if (!STRIPED.has(k)) STRIPED.set(k, shared(std(0xffffff, { map: stripes(cols, 8), roughness: 0.9, side: THREE.DoubleSide })));
  return STRIPED.get(k);
}

// ---------------------------------------------------------------- shapes
/** a palm: a curving ringed trunk, a crown of drooping fronds made of leaflet triangles, coconuts */
function frondGeo(len, seed) {
  const r = seeded(seed), pos = [], n = 14, droop = 0.55 + r() * 0.25;
  const sp = Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return V(0, t * len * 0.28 - t * t * len * droop, t * len); });
  for (let i = 0; i < n; i++) {
    const a = sp[i], b = sp[i + 1], t = i / n, w = len * 0.3 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1 - t * 0.35);
    for (const sd of [-1, 1]) { const tip = V(sd * w, a.y - w * 0.45, a.z + w * 0.5); pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z); }
  }
  return triGeo(pos);
}
function palm(K, M, x, z, h, seed, lean = [0, 0]) {
  const r = seeded(seed), n = 10, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(V(x + lean[0] * t * t, h * t, z + lean[1] * t * t)); }
  for (let i = 0; i < n; i++) {
    const r0 = 0.2 - (i / n) * 0.08, r1 = 0.2 - ((i + 1) / n) * 0.08;
    rod(K, pts[i], pts[i + 1], r0, M.bark, 7, r1);
    rod(K, pts[i + 1].clone().add(V(0, -0.06, 0)), pts[i + 1].clone().add(V(0, 0.04, 0)), r1 * 1.18, M.barkRing, 7);
  }
  const top = pts[n];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU + r() * 0.3, len = 2.1 + r() * 0.9;
    K.add(frondGeo(len, seed * 13 + k), k % 3 ? M.frond : M.frond2, { x: top.x, y: top.y, z: top.z, ry: a, rx: -0.15 - r() * 0.45, order: "YXZ" });
  }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; K.add(new THREE.SphereGeometry(0.13, 8, 6), M.coconut, { x: top.x + Math.sin(a) * 0.18, y: top.y - 0.18, z: top.z + Math.cos(a) * 0.18 }); }
  return top;
}
/** a thatched pyramid roof with a fringe of hanging straw triangles */
function thatchRoof(K, M, w, d, y, peak, seed) {
  const geo = new THREE.ConeGeometry(1, peak, 4, 3, true).rotateY(Math.PI / 4);
  K.add(geo, M.thatch, { y: y + peak / 2, sx: w / Math.SQRT2, sz: d / Math.SQRT2 });
  K.add(new THREE.ConeGeometry(0.22, 0.6, 6), M.fringe, { y: y + peak + 0.15 });
  const r = seeded(seed), pos = [];
  const edges = [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.11), nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1.6) / n, l = 0.32 + r() * 0.3, out = 0.05 + r() * 0.08;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * Math.min(1, t1), bz = z0 + (z1 - z0) * Math.min(1, t1);
      const mx = (ax + bx) / 2 + nx * out, mz = (az + bz) / 2 + nz * out;
      pos.push(ax, y + 0.02, az, bx, y + 0.02, bz, mx, y - l, mz);
    }
  }
  K.add(triGeo(pos), M.fringe);
}
/** a two-faced sign so it never reads backwards */
function twoSided(K, w, h, mat, o) {
  K.add(new THREE.PlaneGeometry(w, h), mat, { ...o, z: (o.z || 0) + (o.gap || 0.03) });
  K.add(new THREE.PlaneGeometry(w, h), mat, { ...o, z: (o.z || 0) - (o.gap || 0.03), ry: Math.PI });
}
function bulbString(K, M, a, b, sag, step, mats) {
  const n = Math.max(2, Math.round(a.distanceTo(b) / step)), pts = sagLine(a, b, sag, n);
  for (let i = 0; i < pts.length - 1; i++) rod(K, pts[i], pts[i + 1], 0.009, M.dark, 4);
  pts.slice(1, -1).forEach((p, i) => K.add(new THREE.IcosahedronGeometry(0.06, 1), mats[i % mats.length], { x: p.x, y: p.y - 0.08, z: p.z }));
}
function torch(K, M, x, z, h = 1.9) {
  K.cyl(0.035, 0.05, h, M.bamboo, { x, y: h / 2, z }, 8);
  K.cyl(0.1, 0.06, 0.22, M.weave, { x, y: h + 0.05, z }, 8);
  K.add(new THREE.ConeGeometry(0.09, 0.32, 7), M.flame, { x, y: h + 0.32, z });
  K.add(new THREE.ConeGeometry(0.05, 0.2, 6), M.flameCore, { x, y: h + 0.28, z });
}

// ---------------------------------------------------------------- the catalog
export const BEACH_CATALOG = {
  /** the sand, wet by the water and running down under it */
  bcSand: P("Sand", (g) => {
    const T = tex(), zs = [];
    for (let z = -80; z < -10; z += 4) zs.push(z);
    for (let z = -10; z < 3; z += 0.25) zs.push(z);
    for (let z = 3; z < 40; z += 3) zs.push(z);
    for (let z = 40; z <= 460; z += 30) zs.push(z);
    const xs = [-470, -160, -60, -30, 0, 30, 60, 160, 470], pos = [], col = [], uv = [], idx = [];
    const dry = new THREE.Color("#ead6ae"), wet = new THREE.Color("#b49563"), bed = new THREE.Color("#8f8a6c"), deep = new THREE.Color("#4f6a6a"), c = new THREE.Color();
    for (const z of zs) for (const x of xs) {
      pos.push(x, sandY(z), z); uv.push(x / 3, z / 3);
      if (z > -2.2) c.copy(dry).lerp(wet, 1 - smooth(-2.2, 0.6, z));
      else if (z > -4.4) c.copy(wet);
      else c.copy(wet).lerp(bed, smooth(-4.4, -9, z)).lerp(deep, smooth(-9, -40, z));
      col.push(c.r, c.g, c.b);
    }
    const M = xs.length;
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j, b = a + 1, cc = a + M, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.sand, vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true; mesh.userData.floor = true; g.add(mesh);
  }, { flat: true, walk: true }),

  /** the sea itself: a shader that moves (waves, foam, the sun's path on the water) */
  bcSea: P("Sea", (g) => {
    const m = new THREE.Mesh(seaGrid(), seaMaterial());
    m.frustumCulled = false; m.renderOrder = 2; g.add(m);
  }, { flat: true, info: "The sea, going gold. The waves come in all evening." }),

  /** the low sun, sitting on the horizon, with a glow round it */
  bcSun: P("Sun", (g) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(34, 48), new THREE.MeshBasicMaterial({ color: 0xffe3a6, fog: false }));
    disc.position.set(0, 22, -820); g.add(disc);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: radial("rgba(255,214,150,.75)", "rgba(255,170,120,0)"), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.position.set(0, 24, -815); g.add(halo);
    passThrough(g);
  }, { flat: true }),

  /** an island out at sea: rocks, jungle, palms and a lighthouse whose beam sweeps round */
  bcIsland: P("Island", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded(s.n || 3);
    K.add(blob(1, 11, 3, 0.18), M.rock, { y: -2.2, sx: 34, sy: 10, sz: 20 });
    K.add(blob(1, 12, 3, 0.2), M.rockDark, { x: 18, y: -1.5, sx: 14, sy: 7, sz: 11 });
    K.add(blob(1, 13, 3, 0.2), M.jungle, { x: -4, y: 2.6, sx: 26, sy: 6.5, sz: 15 });
    K.add(blob(1, 14, 2, 0.25), M.grass, { x: 9, y: 4.6, sx: 12, sy: 5, sz: 9 });
    K.add(new THREE.CircleGeometry(1, 40), M.sand, { y: 0.05, rx: -Math.PI / 2, sx: 40, sy: 24 });
    for (let i = 0; i < 9; i++) { const a = r() * TAU, rr = 18 + r() * 12; K.add(blob(1, 20 + i, 1, 0.3), M.rockDark, { x: Math.cos(a) * rr * 1.2, y: 0, z: Math.sin(a) * rr * 0.75, s: 1.2 + r() * 2.5 }); }
    for (let i = 0; i < 9; i++) { const a = -0.4 - r() * 2.4, rr = 14 + r() * 12; const x = Math.cos(a) * rr * 1.25, z = -Math.sin(a) * rr * 0.62; palm(K, M, x, z, 9 + r() * 5, 300 + i, [(r() - 0.5) * 3, 1 + r() * 2]); }
    // the lighthouse on the high ground
    const lx = 10, ly = 8.5, lz = -2;
    for (let i = 0; i < 6; i++) { const r0 = 2.2 - i * 0.22, r1 = 2.2 - (i + 1) * 0.22; K.cyl(r1, r0, 2.4, i % 2 ? M.red : M.white, { x: lx, y: ly + i * 2.4 + 1.2, z: lz }, 20); }
    const ty = ly + 14.4;
    K.cyl(1.9, 1.9, 0.3, M.dark, { x: lx, y: ty + 0.15, z: lz }, 20);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; K.box(0.08, 0.9, 0.08, M.dark, { x: lx + Math.cos(a) * 1.8, y: ty + 0.75, z: lz + Math.sin(a) * 1.8 }); }
    K.add(new THREE.TorusGeometry(1.8, 0.06, 4, 32), M.dark, { x: lx, y: ty + 1.2, z: lz, rx: Math.PI / 2 });
    K.cyl(1.05, 1.05, 2, M.lamp, { x: lx, y: ty + 1.3, z: lz }, 16);
    K.add(new THREE.ConeGeometry(1.5, 1.6, 16), M.red, { x: lx, y: ty + 3.1, z: lz });
    K.into(g);
    // the beam: two long soft cones that turn
    const beam = new THREE.Group(); beam.position.set(lx, ty + 1.3, lz);
    const bm = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (const sd of [1, -1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(5, 70, 20, 1, true).translate(0, -35, 0).rotateZ(sd * Math.PI / 2), bm); beam.add(c); }
    g.add(beam); LIVE.spin.push({ o: beam, w: 0.6 });
    passThrough(g);
  }, { flat: true, info: "Gull Island. The lighthouse still turns every night." }),

  /** a little sailboat, rocking on the swell */
  bcBoat: P("Sailboat", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded(s.n || 1), inner = new THREE.Group();
    const hull = new THREE.SphereGeometry(1, 20, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
    K.add(hull, M.hull, { sx: 0.9, sy: 0.75, sz: 3.2 });
    K.add(new THREE.TorusGeometry(1, 0.06, 4, 28), s.n % 2 ? M.hullBlue : M.red, { y: -0.02, rx: Math.PI / 2, sx: 0.9, sy: 3.2 });
    K.add(new THREE.CircleGeometry(1, 28), M.deck, { y: 0.01, rx: -Math.PI / 2, sx: 0.86, sy: 3.1 });
    K.box(0.9, 0.35, 1.1, M.white, { y: 0.18, z: 0.5 });
    K.cyl(0.05, 0.06, 7.5, M.wood, { y: 3.75, z: -0.4 }, 8);
    K.cyl(0.04, 0.04, 2.6, M.wood, { y: 1.1, z: 0.9, rx: Math.PI / 2 }, 6);
    // sails: fans of triangles with a little belly in them
    const sail = (pts, mat, belly) => {
      const [a, b, c] = pts, pos = [], n = 6;
      const at = (u, v) => { const p = new THREE.Vector3().copy(a).addScaledVector(V().subVectors(b, a), u).addScaledVector(V().subVectors(c, a), v); p.x += belly * Math.sin(Math.PI * Math.min(1, u + v)) * (1 - Math.abs(u - v)); return p; };
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
        const p0 = at(i / n, j / n), p1 = at((i + 1) / n, j / n), p2 = at(i / n, (j + 1) / n); pos.push(...p0.toArray(), ...p1.toArray(), ...p2.toArray());
        if (j < n - i - 1) { const p3 = at((i + 1) / n, (j + 1) / n); pos.push(...p1.toArray(), ...p3.toArray(), ...p2.toArray()); }
      }
      K.add(triGeo(pos), mat);
    };
    sail([V(0, 1.2, -0.35), V(0, 7.3, -0.35), V(0, 1.2, 2.2)], M.sail, 0.35);
    sail([V(0, 1.1, -0.5), V(0, 6.6, -0.45), V(0, 0.6, -3.0)], s.n % 2 ? M.sailStripe : M.sail, 0.28);
    K.add(new THREE.PlaneGeometry(0.5, 0.3), M.red, { x: 0.25, y: 7.55, z: -0.4 });
    K.into(inner); g.add(inner);
    LIVE.bob.push({ o: inner, y: WATER - 0.05, a: 0.18 + r() * 0.1, f: 0.7 + r() * 0.3, p: r() * 6, r: 0.04 });
    passThrough(g);
  }, { flat: true, info: "Someone's out for the last of the light." }),

  /** a line of buoys and rope marking where it's safe to swim, from the pier out and back to the sand */
  bcBuoys: P("Buoy line", (g, s) => {
    const M = sm(), pts = s.pts || [[-1.9, -14], [-16, -14], [-16, -4.5]];
    pts.forEach(([x, z], i) => {
      if (!i) return;
      const [x0, z0] = pts[i - 1], len = Math.hypot(x - x0, z - z0), n = Math.round(len / 1.6);
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n, bx = x0 + (x - x0) * t, bz = z0 + (z - z0) * t, K = new Kit(), o = new THREE.Group();
        K.add(new THREE.SphereGeometry(0.2, 10, 8), k % 2 ? M.white : M.red, { y: 0.02 });
        K.cyl(0.03, 0.03, 0.22, M.dark, { y: 0.26 }, 6);
        K.into(o); o.position.set(bx, 0, bz); g.add(o);
        LIVE.bob.push({ o, y: WATER, a: 0.06, f: 1.1, p: bx * 0.3 + bz * 0.21, r: 0.12 });
      }
      const K = new Kit(); rod(K, V(x0, WATER + 0.02, z0), V(x, WATER + 0.02, z), 0.012, M.rope, 4); K.into(g);
    });
    passThrough(g);
  }, { flat: true, info: "Swim inside the buoys." }),

  /** a thatched beach bar: bamboo posts and counter, bottles on a woven back wall, string lights, torches */
  bcTikiBar: P("Beach bar", (g, s) => {
    const M = sm(), K = new Kit();
    K.box(6, 0.12, 4.3, M.planks, { y: 0.06, z: -0.15 });
    for (const [x, z] of [[-2.75, -2.1], [2.75, -2.1], [-2.75, 1.75], [2.75, 1.75]]) {
      K.cyl(0.11, 0.13, 3.1, M.bamboo, { x, y: 1.55, z }, 10);
      for (let y = 0.4; y < 3; y += 0.45) K.add(new THREE.TorusGeometry(0.125, 0.02, 4, 10), M.barkRing, { x, y, z, rx: Math.PI / 2 });
    }
    thatchRoof(K, M, 7.4, 5.8, 3.05, 1.9, (s.n || 1) * 17);
    K.box(6.6, 0.1, 0.1, M.dark, { y: 3.0, z: 1.78 }); K.box(6.6, 0.1, 0.1, M.dark, { y: 3.0, z: -2.12 });
    // back wall, woven, with shelves of bottles
    K.box(5.4, 2.6, 0.08, M.weave, { y: 1.4, z: -2.08 });
    for (const y of [1.2, 1.75, 2.3]) {
      K.box(3.6, 0.05, 0.3, M.wood, { y, z: -1.9 });
      for (let i = 0; i < 12; i++) {
        const x = -1.65 + i * 0.3, b = M.bottles[(i * 3 + Math.round(y * 10) + (s.n || 0)) % M.bottles.length], tall = 0.22 + ((i * 7 + Math.round(y * 3)) % 3) * 0.05;
        K.cyl(0.055, 0.055, tall, b, { x, y: y + 0.025 + tall / 2, z: -1.9 }, 8);
        K.cyl(0.018, 0.03, 0.09, b, { x, y: y + 0.025 + tall + 0.045, z: -1.9 }, 6);
      }
    }
    // the counter: bamboo front, a thick top, and sides that turn back
    K.box(4.6, 1.05, 0.12, M.bamboo, { y: 0.6, z: 1.2 });
    for (const sx of [-1, 1]) K.box(0.12, 1.05, 1.0, M.bamboo, { x: sx * 2.3, y: 0.6, z: 0.7 });
    K.box(4.9, 0.09, 0.75, M.top, { y: 1.16, z: 1.1 });
    for (const sx of [-1, 1]) K.box(0.6, 0.09, 1.2, M.top, { x: sx * 2.3, y: 1.16, z: 0.6 });
    K.box(4.5, 0.06, 0.18, M.dark, { y: 0.22, z: 1.34 });                                   // a foot rail
    // things on the counter: coconut cups, a pineapple, a tip jar
    for (const x of [-1.6, -0.6, 0.8]) { K.add(new THREE.SphereGeometry(0.1, 10, 6, 0, TAU, 0, Math.PI / 2), M.coconut, { x, y: 1.2, z: 1.15, rx: Math.PI }); K.cyl(0.004, 0.004, 0.25, M.red, { x: x + 0.03, y: 1.3, z: 1.15, rz: 0.3 }, 4); }
    K.add(new THREE.SphereGeometry(0.11, 10, 8), M.yellow, { x: 1.6, y: 1.32, z: 1.05, sy: 1.4 });
    for (let k = 0; k < 7; k++) K.add(new THREE.ConeGeometry(0.03, 0.22, 4), M.frond, { x: 1.6 + Math.sin(k) * 0.03, y: 1.56, z: 1.05 + Math.cos(k) * 0.03, rz: Math.sin(k * 2) * 0.4, rx: Math.cos(k * 2) * 0.4 });
    // the sign, on two posts above the counter
    for (const x of [-1.3, 1.3]) K.box(0.06, 0.6, 0.06, M.dark, { x, y: 2.75, z: 1.75 });
    const sign = new THREE.MeshStandardMaterial({ map: signTex(s.name || "SUNSET BAR", s.sub || "cold drinks · warm nights", s.bg || ["#ff8a5b", "#e8505b"], s.fg || "#fff4d6"), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.2 });
    sign.emissiveMap = sign.map; sign.userData.noShadow = true;
    twoSided(K, 3.1, 0.89, sign, { y: 2.4, z: 1.78, gap: 0.03 });
    // string lights along the front, glass float lamps under the roof, torches at the corners
    bulbString(K, M, V(-2.75, 2.95, 1.86), V(2.75, 2.95, 1.86), 0.3, 0.42, [M.bulb, M.bulbPink, M.bulb, M.bulbBlue]);
    for (const [x, z] of [[-1.2, -0.4], [1.2, -0.4], [0, 0.6]]) {
      K.cyl(0.006, 0.006, 0.8, M.rope, { x, y: 3.3, z }, 4);
      K.add(new THREE.SphereGeometry(0.16, 12, 8), M.lamp, { x, y: 2.75, z });
      K.add(new THREE.TorusGeometry(0.165, 0.008, 3, 16), M.rope, { x, y: 2.75, z }); K.add(new THREE.TorusGeometry(0.165, 0.008, 3, 16), M.rope, { x, y: 2.75, z, ry: Math.PI / 2 });
    }
    torch(K, M, -3.2, 2.1); torch(K, M, 3.2, 2.1);
    K.into(g);
    const l = new THREE.PointLight(0xffc98a, 10, 9, 1.8); l.position.set(0, 2.5, 0); g.add(l);
  }, { act: "order", info: "The beach bar. Cold drinks, warm nights.", colliders: () => [[-3.05, -2.3, 3.05, 1.42], [-3.35, 1.95, -3.05, 2.25], [3.05, 1.95, 3.35, 2.25]] }),

  /** a red and white lifeguard tower with a flag, a ramp, a lifebuoy and a rescue board */
  bcLifeguard: P("Lifeguard tower", (g) => {
    const M = sm(), K = new Kit(), top = 2.3;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(K, V(x * 1.05, 0, z * 1.05), V(x * 0.8, top, z * 0.8), 0.07, M.white, 8);
    for (const sx of [-1, 1]) { rod(K, V(sx * 1.0, 0.2, -0.95), V(sx * 0.85, top - 0.2, 0.85), 0.03, M.white, 5); rod(K, V(sx * 1.0, 0.2, 0.95), V(sx * 0.85, top - 0.2, -0.85), 0.03, M.white, 5); }
    K.box(2.1, 0.12, 2.1, M.planks, { y: top });
    // the cabin: low red walls with a window strip, a gable roof of triangles
    K.box(2.0, 1.0, 0.08, M.red, { y: top + 0.55, z: -0.98 });
    for (const sx of [-1, 1]) K.box(0.08, 1.0, 2.0, M.red, { x: sx * 0.98, y: top + 0.55, z: 0 });
    K.box(2.0, 0.5, 0.08, M.red, { y: top + 0.3, z: 0.98 });
    for (const [x, z] of [[-0.98, -0.98], [0.98, -0.98], [-0.98, 0.98], [0.98, 0.98]]) K.box(0.1, 1.9, 0.1, M.white, { x, y: top + 0.95, z });
    const ry = top + 1.9;
    for (const sx of [-1, 1]) K.box(1.25, 0.06, 2.5, M.white, { x: sx * 0.55, y: ry + 0.32, z: 0, rz: -sx * 0.52 });
    for (const sz of [-1, 1]) K.add(triGeo([-1.1, ry, sz * 1.0, 1.1, ry, sz * 1.0, 0, ry + 0.65, sz * 1.0]), M.red);
    // the sign and the flag
    const plate = new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (c, w, h) => { c.fillStyle = "#d9443c"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "900 78px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("LIFEGUARD", w / 2, h / 2 + 4); c.fillStyle = "#fff"; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8); }), roughness: 0.6 });
    plate.userData.noShadow = true;
    twoSided(K, 1.8, 0.45, plate, { y: top + 0.3, z: 1.0, gap: 0.03 });
    K.cyl(0.03, 0.03, 2.4, M.metal, { x: 1.1, y: ry + 0.6, z: -1.1 }, 6);
    K.add(new THREE.PlaneGeometry(0.9, 0.55), M.yellow, { x: 1.55, y: ry + 1.5, z: -1.1 }); K.add(new THREE.PlaneGeometry(0.9, 0.275), M.red, { x: 1.55, y: ry + 1.36, z: -1.1 + 0.002 });
    K.add(new THREE.PlaneGeometry(0.9, 0.275), M.red, { x: 1.55, y: ry + 1.36, z: -1.1 - 0.002, ry: Math.PI }); K.add(new THREE.PlaneGeometry(0.9, 0.55), M.yellow, { x: 1.55, y: ry + 1.5, z: -1.1 - 0.001, ry: Math.PI });
    // the ramp down the back, with slats
    const rl = Math.hypot(2.6, top), ra = Math.atan2(top, 2.6);
    K.box(0.8, 0.06, rl, M.planks, { y: top / 2, z: -1.05 - 1.3, rx: -ra });
    for (let i = 1; i < 8; i++) { const t = i / 8; K.box(0.8, 0.04, 0.05, M.dark, { y: top * (1 - t) + 0.04, z: -1.05 - 2.6 * t }); }
    // a lifebuoy on the side, a rescue board leaning on a leg, binoculars on the rail
    for (let k = 0; k < 8; k++) K.add(new THREE.TorusGeometry(0.32, 0.08, 6, 8, TAU / 8), k % 2 ? M.white : M.red, { x: 1.03, y: top + 0.55, z: 0.1, ry: Math.PI / 2, rz: (k / 8) * TAU });
    K.add(new THREE.SphereGeometry(1, 16, 8), M.red, { x: -1.25, y: 1.15, z: 1.15, sx: 0.28, sy: 1.2, sz: 0.05, rx: 0.25 });
    K.add(new THREE.SphereGeometry(1, 16, 8), M.white, { x: -1.25, y: 1.15, z: 1.18, sx: 0.08, sy: 1.1, sz: 0.04, rx: 0.25 });
    K.cyl(0.05, 0.05, 0.14, M.dark, { x: -0.3, y: top + 1.1, z: 1.0, rx: Math.PI / 2 }, 8); K.cyl(0.05, 0.05, 0.14, M.dark, { x: -0.18, y: top + 1.1, z: 1.0, rx: Math.PI / 2 }, 8);
    K.into(g);
  }, { info: "The lifeguard's off duty. The flag says the water's calm.", colliders: () => [[-1.15, -3.7, 1.15, 1.15]] }),

  /** a palm of our own (the pack has some too) */
  bcPalm: P("Palm", (g, s) => {
    const M = sm(), K = new Kit();
    palm(K, M, 0, 0, s.h || 7, (s.n || 1) * 7 + 1, s.lean || [0, 1.6]);
    for (let i = 0; i < 6; i++) K.add(blob(0.18, 50 + i, 0, 0.3), M.pebble, { x: Math.cos(i) * 0.5, y: 0, z: Math.sin(i) * 0.5, sy: 0.5 });
    K.into(g);
  }, { trunk: 0.5, info: "A palm, leaning out to sea like they all do.", colliders: () => [[-0.3, -0.3, 0.3, 0.3]] }),

  /** a canopy of string lights over the deck, criss-crossing between tall posts */
  bcLightCanopy: P("String lights", (g, s) => {
    const M = sm(), K = new Kit(), xs = s.xs || [-16, -8, 0, 8, 16], z0 = s.z0 ?? 10.7, z1 = s.z1 ?? 31.3, h = 4.6;
    for (const x of xs) for (const z of [z0, z1]) {
      K.cyl(0.08, 0.1, h, M.wood, { x, y: h / 2, z }, 8);
      K.box(0.5, 0.06, 0.06, M.dark, { x, y: h - 0.15, z });
      K.cyl(0.14, 0.16, 0.14, M.dark, { x, y: 0.07, z }, 10);
      K.add(new THREE.SphereGeometry(0.11, 10, 8), M.lamp, { x, y: h + 0.1, z });
    }
    const mats = [M.bulb, M.bulb, M.bulbPink, M.bulb, M.bulbBlue];
    xs.forEach((x, i) => {
      bulbString(K, M, V(x, h - 0.2, z0), V(x, h - 0.2, z1), 1.0, 1.0, mats);
      if (i < xs.length - 1) { bulbString(K, M, V(x, h - 0.2, z0), V(xs[i + 1], h - 0.2, z1), 1.15, 1.05, mats); bulbString(K, M, V(xs[i + 1], h - 0.2, z0), V(x, h - 0.2, z1), 1.15, 1.05, mats); }
    });
    bulbString(K, M, V(xs[0], h - 0.2, z0), V(xs[xs.length - 1], h - 0.2, z0), 0.6, 0.9, mats);
    bulbString(K, M, V(xs[0], h - 0.2, z1), V(xs[xs.length - 1], h - 0.2, z1), 0.6, 0.9, mats);
    K.into(g);
    g.traverse((o) => { if (o.isMesh && o.material !== M.wood && o.material !== M.dark) o.raycast = () => {}; });
  }, { flat: true, colliders: (s) => { const xs = s.xs || [-16, -8, 0, 8, 16]; return xs.flatMap((x) => [s.z0 ?? 10.7, s.z1 ?? 31.3].map((z) => [x - 0.18, z - 0.18, x + 0.18, z + 0.18])); } }),

  /** an A-frame rack of surfboards */
  bcSurfRack: P("Surfboards", (g, s) => {
    const M = sm(), K = new Kit();
    for (const sx of [-1, 1]) { rod(K, V(sx * 1.4, 0, -0.5), V(sx * 1.4, 1.6, 0), 0.05, M.wood, 6); rod(K, V(sx * 1.4, 0, 0.5), V(sx * 1.4, 1.6, 0), 0.05, M.wood, 6); }
    K.box(2.9, 0.07, 0.07, M.wood, { y: 1.55 }); K.box(2.9, 0.06, 0.06, M.wood, { y: 0.35, z: -0.4 }); K.box(2.9, 0.06, 0.06, M.wood, { y: 0.35, z: 0.4 });
    for (let i = 0; i < 6; i++) {
      const x = -1.15 + i * 0.46, sd = i % 2 ? 1 : -1, m = M.boards[(i + (s.n || 0)) % M.boards.length];
      K.add(new THREE.SphereGeometry(1, 16, 10), m, { x, y: 1.0, z: sd * 0.32, sx: 0.26, sy: 1.0, sz: 0.035, rx: sd * 0.32 });
      K.add(new THREE.BoxGeometry(0.03, 1.7, 0.012), M.white, { x, y: 1.0, z: sd * 0.32 + sd * 0.036 * Math.cos(0.32), rx: sd * 0.32 });
    }
    K.into(g);
  }, { info: "Boards for anyone. Bring them back.", colliders: () => [[-1.5, -0.6, 1.5, 0.6]] }),

  /** a beach umbrella: striped canopy with a scalloped edge */
  bcUmbrella: P("Umbrella", (g, s) => {
    const M = sm(), K = new Kit(), cols = s.cols || ["#ff6f61", "#fff4e6"], m = stripedMat(cols), tilt = s.tilt ?? 0.18;
    const top = V(Math.sin(tilt) * 2.3, Math.cos(tilt) * 2.3, 0);
    rod(K, V(0, 0, 0), top, 0.025, M.white, 6);
    K.add(new THREE.ConeGeometry(1.25, 0.55, 16, 1, true), m, { x: top.x, y: top.y - 0.12, rz: -tilt });
    const pos = [];
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU, am = (a0 + a1) / 2;
      pos.push(Math.cos(a0) * 1.25, 0, Math.sin(a0) * 1.25, Math.cos(am) * 1.27, -0.14, Math.sin(am) * 1.27, Math.cos(a1) * 1.25, 0, Math.sin(a1) * 1.25);
    }
    K.add(triGeo(pos), stripedMat([cols[0]]), { x: top.x, y: top.y - 0.395, rz: -tilt });
    K.add(new THREE.SphereGeometry(0.05, 8, 6), M.white, { x: top.x, y: top.y + 0.17 });
    K.into(g);
  }, { colliders: () => [[-0.12, -0.12, 0.12, 0.12]] }),

  /** a towel on the sand with a bag and flip-flops */
  bcTowel: P("Beach towel", (g, s) => {
    const M = sm(), K = new Kit(), m = stripedMat(s.cols || ["#4fc3f7", "#fff4e6", "#ffd23f"]);
    const tw = new THREE.PlaneGeometry(0.95, 1.9, 4, 8), tp = tw.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setZ(i, Math.sin(tp.getX(i) * 7 + tp.getY(i) * 3) * 0.008);
    tw.computeVertexNormals();
    K.add(tw, m, { y: 0.012, rx: -Math.PI / 2 });
    K.add(new THREE.SphereGeometry(0.22, 10, 8), M.boards[(s.n || 0) % M.boards.length], { x: 0.75, y: 0.15, z: -0.6, sy: 0.75, sz: 0.6 });
    for (const dx of [-0.08, 0.08]) K.add(new THREE.SphereGeometry(1, 10, 6), M.boards[((s.n || 0) + 2) % M.boards.length], { x: 0.7 + dx, y: 0.015, z: 0.75, sx: 0.06, sy: 0.012, sz: 0.13 });
    K.into(g);
  }, { flat: true, walk: true, info: "Someone's towel. They'll be back." }),

  /** a sandcastle: walls, towers with battlements, a keep, a moat and a flag */
  bcSandcastle: P("Sandcastle", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded(s.n || 1);
    K.add(new THREE.RingGeometry(0.85, 1.15, 28), M.wetSand, { y: 0.01, rx: -Math.PI / 2 });
    K.add(new THREE.SphereGeometry(0.85, 16, 6, 0, TAU, 0, Math.PI / 2), M.sand, { sy: 0.22 });
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      K.cyl(0.16, 0.19, 0.5, M.sand, { x, y: 0.4, z }, 10);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; K.box(0.06, 0.07, 0.06, M.sand, { x: x + Math.cos(a) * 0.13, y: 0.68, z: z + Math.sin(a) * 0.13, ry: -a }); }
    }
    for (const [x, z, w, d] of [[0, -0.5, 0.8, 0.1], [0, 0.5, 0.8, 0.1], [-0.5, 0, 0.1, 0.8], [0.5, 0, 0.1, 0.8]]) K.box(w, 0.26, d, M.sand, { x, y: 0.3, z });
    K.cyl(0.22, 0.26, 0.6, M.sand, { y: 0.5 }, 10);
    K.add(new THREE.ConeGeometry(0.25, 0.35, 10), M.sand, { y: 0.97 });
    K.cyl(0.006, 0.006, 0.35, M.wood, { y: 1.3 }, 4);
    K.add(triGeo([0, 1.45, 0, 0.18, 1.39, 0, 0, 1.33, 0]), M.red);
    K.add(triGeo([0, 1.45, 0, 0, 1.33, 0, 0.18, 1.39, 0]), M.red);
    K.add(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 10, 1, true), M.boards[Math.floor(r() * 6)], { x: 1.0, y: 0.1, z: 0.6, rz: 1.3 });
    K.into(g);
  }, { info: "Someone spent all afternoon on this.", colliders: () => [[-0.8, -0.8, 0.8, 0.8]] }),

  /** shells, starfish and pebbles, all over the sand */
  bcShells: P("Shells", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded(s.n || 5), [x0, z0, x1, z1] = s.area || [-28, -3.3, 28, 10], n = s.count || 160;
    const starGeo = () => { const pos = [], R = 0.11, ri = 0.045; for (let i = 0; i < 5; i++) { const a0 = (i / 5) * TAU, a1 = a0 + TAU / 10, a2 = a0 - TAU / 10;
      pos.push(0, 0.02, 0, Math.cos(a1) * ri, 0.008, Math.sin(a1) * ri, Math.cos(a0) * R, 0, Math.sin(a0) * R, 0, 0.02, 0, Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a2) * ri, 0.008, Math.sin(a2) * ri); }
      return triGeo(pos); };
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), y = sandY(z) + 0.005, k = r(), ry = r() * TAU;
      if (Math.abs(x) < 2.2 && z < -2) continue;                                               // not under the pier
      if (k < 0.18) K.add(starGeo(), M.star, { x, y, z, ry, s: 0.8 + r() * 0.6 });
      else if (k < 0.6) K.add(new THREE.ConeGeometry(0.06, 0.025, 9, 1), M.shells[Math.floor(r() * 4)], { x, y: y + 0.01, z, ry, sz: 1.2 });
      else if (k < 0.8) K.add(new THREE.ConeGeometry(0.025, 0.09, 7), M.shells[Math.floor(r() * 4)], { x, y: y + 0.02, z, rz: Math.PI / 2, ry, order: "YXZ" });
      else K.add(blob(0.05 + r() * 0.05, i, 0, 0.3), M.pebble, { x, y, z, sy: 0.45 });
    }
    K.into(g, { cast: false });
  }, { flat: true, walk: true }),
};
