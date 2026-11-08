// vfx.js - every burst in the game, built in layers the way a real game's effects are:
//   particles   soft dots, puffs that swell as they drift, sparks that streak and shrink, leaves and petals that tumble and flutter down,
//               hearts and stars. Two pools: the glowing kinds add their light (sparks, gold, magic), the rest are plain paint
//   debris      real little 3D chips of wood, stone and soil that spin, bounce off the ground and settle before they fade
//   shockwaves  a ring rushing out over the ground from a hit, a splash or a burst of magic
//   flashes     a soft bloom of light at the heart of a bright burst
// Every call site just asks for burst(kind, x, y, z, scale); what a kind is made of is all decided here.
import * as THREE from "three";

// colour(s), how many, how fast outward, how fast up, gravity, size, life
const KINDS = {
  soil: [[0x7a5230, 0x9a6d3d, 0x5e3f24], 12, 1.6, 2.6, 9, 0.2, 0.55], dust: [[0xe6d9b8, 0xcfbf98], 10, 1.4, 1.2, 1, 0.34, 0.8], water: [[0x8fdcff, 0xd8f5ff], 14, 1.2, 2.6, 12, 0.14, 0.6], splash: [[0xffffff, 0x9be8e0, 0xd8f7ff], 26, 2.6, 5.2, 14, 0.22, 0.8],
  leaf: [[0x8fd16b, 0xc3d36a, 0x6fb84f], 14, 2, 2.6, 5, 0.26, 1.4], wood: [[0xb88a54, 0x8a6236], 12, 2.6, 3.4, 12, 0.2, 0.7], stone: [[0xb7b3a3, 0x8a8a84], 14, 3, 3.6, 13, 0.24, 0.7], spark: [[0xfff2a8, 0xffd25e, 0xffa040], 20, 2.4, 2.8, 4, 0.2, 0.8],
  gold: [[0xffe27a, 0xffffff, 0xffc84a], 34, 2.6, 4, 3, 0.26, 1.2], heart: [[0xff4f7b, 0xff7a9a], 6, 0.8, 2.0, -0.4, 0.42, 1.3], cloud: [[0xf4f1ea, 0xe2ddd2, 0xffffff], 16, 1.6, 0.9, -0.3, 1.1, 1.1], smoke: [[0xd8d4cc, 0xb0aca4], 12, 0.7, 1.5, -0.6, 0.8, 1.6], zzz: [[0xdfe7ff, 0xffffff], 2, 0.2, 0.9, -0.3, 0.3, 1.6],
  sparkle: [[0xfff6c8, 0xffe08a, 0xffffff], 14, 1.2, 2.2, 0.6, 0.3, 1.1], petal: [[0xffb7d0, 0xfff0f5, 0xffd6a8], 12, 1.6, 1.6, 0.8, 0.28, 2],
  harvest: [[0xffe27a, 0xfff6c8, 0xa8e07a], 22, 1.8, 3.4, 4, 0.28, 1.1], ripple: [[0xe9fbff, 0xbfeef6], 10, 2.2, 0.6, 2, 0.16, 0.6], ember: [[0xffb050, 0xff7a3a, 0xffe08a], 10, 0.6, 1.8, -0.5, 0.18, 1.4],
  wake: [[0xffffff, 0xcff5ee], 4, 0.7, 0.8, 4, 0.34, 0.8],
  chain: [[0xc5763a, 0x8d8d90], 6, 1.2, 2, 9, 0.14, 0.5], glow: [[0x7fe0d0, 0xe9e2ff, 0xffffff], 60, 3.4, 6, 1, 0.34, 1.6],
};
// how each kind moves and looks. shape: 0 dot, 1 heart, 2 star, 3 leaf, 4 puff. drag slows it in the air, grow swells (or shrinks) it over
// its life, sway makes it flutter side to side as it falls, add: it glows (added light, not paint)
const FEEL = {
  soil: { drag: 0.6 }, dust: { shape: 4, drag: 2.4, grow: 1.4 }, water: { drag: 0.3, grow: -0.3 }, splash: { drag: 0.5, grow: -0.2 },
  leaf: { shape: 3, drag: 2.4, sway: 1.6 }, petal: { shape: 3, drag: 2.6, sway: 1.9 }, wood: { drag: 0.4 }, stone: { drag: 0.4 },
  spark: { shape: 2, add: 1, drag: 1.2, grow: -0.8 }, gold: { shape: 2, add: 1, drag: 1.4, grow: -0.4 }, sparkle: { shape: 2, add: 1, drag: 1.6, grow: -0.2 }, harvest: { shape: 2, add: 1, drag: 1.4, grow: -0.3 },
  glow: { add: 1, drag: 1.8, grow: -0.5 }, ember: { add: 1, drag: 0.8, sway: 0.6, grow: -0.6 },
  heart: { shape: 1, drag: 1, sway: 0.5 }, cloud: { shape: 4, drag: 2.2, grow: 1 }, smoke: { shape: 4, drag: 1.6, grow: 1.8 }, zzz: { drag: 0.5 },
  ripple: { drag: 3 }, wake: { shape: 4, drag: 2.5, grow: 0.8 }, chain: { drag: 0.4 },
};
// the layers a bigger burst gets on top of its particles: chips of debris, a shockwave over the ground, a flash of light
const EXTRA = {
  soil: { chips: [0x6a4528, 0x8a5a32, 0x4f3420], n: 5, chip: 0.11, ring: 0x9a7a52, ringR: 1.4 },
  wood: { chips: [0xc89a64, 0x8a6236, 0xe0c08a], n: 7, chip: 0.13, ring: 0xe0c89a, ringR: 1.8 },
  stone: { chips: [0xa8a498, 0x8a8a84, 0xc8c4b8], n: 8, chip: 0.14, ring: 0xd8d2c4, ringR: 2, flash: 0xfff4d8, flashR: 0.9 },
  chain: { chips: [0xc5763a, 0x8d8d90], n: 3, chip: 0.08 },
  splash: { ring: 0xffffff, ringR: 2.6, ring2: true },
  ripple: { ring: 0xe9fbff, ringR: 1.6 },
  dust: { ring: 0xeee2c4, ringR: 1.3 },
  gold: { ring: 0xffe27a, ringR: 2.4, flash: 0xffe9a0, flashR: 2.2, add: 1 },
  harvest: { ring: 0xfff0a0, ringR: 2, flash: 0xfff6c8, flashR: 1.8, add: 1 },
  glow: { ring: 0x9ff0e0, ringR: 3.4, ring2: true, flash: 0xc8fff4, flashR: 3, add: 1 },
  sparkle: { flash: 0xfff6c8, flashR: 1.3 },
  spark: { flash: 0xffd25e, flashR: 1.1 },
  heart: { flash: 0xff9ab4, flashR: 1.2 },
};

const N = 1600;
/** one pool of particles drawn as one: soft paint, or added light */
function pool(G, additive) {
  const fade = new Float32Array(N), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), shape = new Float32Array(N), rot = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), full = new Float32Array(N), grav = new Float32Array(N), base = new Float32Array(N), drag = new Float32Array(N), grow = new Float32Array(N), sway = new Float32Array(N), phase = new Float32Array(N), spin = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  for (const [name, arr, n] of [["position", pos, 3], ["color", col, 3], ["size", size, 1], ["shape", shape, 1], ["fade", fade, 1], ["rot", rot, 1]]) g.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float size; attribute float shape; attribute float fade; attribute float rot; attribute vec3 color; varying vec3 c; varying float h; varying float f; varying float r;
      void main(){ c = color; h = shape; f = fade; r = rot; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 720.0 / max(1.0, -p.z); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `varying vec3 c; varying float h; varying float f; varying float r;
      void main(){
        vec2 u = gl_PointCoord - 0.5; float a = smoothstep(0.0, 0.25, f);
        float cr = cos(r), sr = sin(r); vec2 ru = vec2(u.x * cr - u.y * sr, u.x * sr + u.y * cr);
        if (h > 0.5 && h < 1.5) { vec2 q = vec2(ru.x * 2.7, (0.12 - ru.y) * 2.7); float k = q.x * q.x + q.y * q.y - 1.0; if (k * k * k - q.x * q.x * q.y * q.y * q.y > 0.0) discard; gl_FragColor = vec4(c * (1.0 - ru.y * 0.4), a); return; }
        if (h > 1.5 && h < 2.5) { vec2 q = abs(ru) * 2.0; float s = sqrt(q.x) + sqrt(q.y); float core = exp(-dot(u, u) * 40.0); if (s > 0.95 && core < 0.05) discard; float k = max(1.0 - smoothstep(0.0, 0.95, s), core); gl_FragColor = vec4(mix(c, vec3(1.0), core * 0.8) * k, a * k); return; }
        if (h > 2.5 && h < 3.5) { vec2 q = ru * vec2(2.2, 4.6); float e = dot(q, q); if (e > 1.0) discard; float vein = smoothstep(0.06, 0.0, abs(ru.y)) * 0.25; gl_FragColor = vec4(c * (0.82 + 0.25 * (1.0 - e)) - vein, a * 0.97); return; }
        if (h > 3.5) { float d = dot(u, u) * 4.0; if (d > 1.0) discard; float soft = exp(-d * 2.6); gl_FragColor = vec4(c * (0.86 + 0.18 * (1.0 - d)), a * soft * 0.85); return; }
        float d = dot(u, u); if (d > 0.25) discard;
        ${additive ? "float k = exp(-d * 14.0); gl_FragColor = vec4(c * k * 1.4, a * k);" : "gl_FragColor = vec4(c * (1.05 - d), a * (1.0 - d * 2.0));"}
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.renderOrder = additive ? 3 : 2;
  G.scene.add(pts);
  let at = 0, live = 0, t = 0;
  const cc = new THREE.Color();
  return {
    spawn(kind, K, F, x, y, z, scale) {
      const [cols, n, out, up, gr, sz, lf] = K;
      for (let i = 0; i < n * scale; i++) {
        const k = at; at = (at + 1) % N;
        const a = Math.random() * 6.3, o = out * (0.3 + Math.random()) * Math.min(1.4, 0.6 + scale * 0.4);
        pos[k * 3] = x + Math.cos(a) * 0.08; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z + Math.sin(a) * 0.08;
        vel[k * 3] = Math.cos(a) * o; vel[k * 3 + 1] = up * (0.4 + Math.random()); vel[k * 3 + 2] = Math.sin(a) * o;
        cc.set(cols[i % cols.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08); col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
        life[k] = full[k] = lf * (0.7 + Math.random() * 0.6); base[k] = size[k] = sz * (0.7 + Math.random() * 0.6) * Math.min(1.5, Math.max(0.6, scale));
        grav[k] = gr; drag[k] = F.drag ?? 0.4; grow[k] = F.grow ?? 0; sway[k] = F.sway ?? 0; phase[k] = Math.random() * 6.3; spin[k] = (Math.random() - 0.5) * (F.sway ? 6 : 1.5);
        shape[k] = F.shape ?? 0; rot[k] = Math.random() * 6.3; fade[k] = 1;
      }
      live = 1;
      g.attributes.color.needsUpdate = true; g.attributes.shape.needsUpdate = true;
    },
    tick(dt) {
      if (!live) return;
      t += dt;
      let any = 0;
      for (let k = 0; k < N; k++) {
        if (life[k] <= 0) continue;
        any = 1;
        life[k] -= dt;
        if (life[k] <= 0) { size[k] = 0; continue; }
        const f = life[k] / full[k], keep = Math.exp(-drag[k] * dt);
        fade[k] = f;
        vel[k * 3] *= keep; vel[k * 3 + 2] *= keep; vel[k * 3 + 1] = vel[k * 3 + 1] * (sway[k] ? keep : 1) - grav[k] * dt;
        if (sway[k]) {                                  // a leaf seesaws as it falls, and never falls fast
          const s = Math.sin(t * 3.1 + phase[k]) * sway[k];
          pos[k * 3] += s * Math.cos(phase[k]) * dt; pos[k * 3 + 2] += s * Math.sin(phase[k]) * dt;
          if (vel[k * 3 + 1] < -1.1) vel[k * 3 + 1] = -1.1;
          rot[k] = Math.sin(t * 2.3 + phase[k]) * 1.2 + phase[k];
        } else rot[k] += spin[k] * dt;
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        const age = 1 - f;
        size[k] = base[k] * Math.max(0.05, grow[k] >= 0 ? 1 + grow[k] * age : 1 + grow[k] * age * age) * (0.55 + 0.45 * Math.min(1, f * 3));
      }
      live = any;
      for (const n of ["position", "size", "fade", "rot"]) g.attributes[n].needsUpdate = true;
    },
  };
}

/** a soft round glow, painted once: flashes and the shockwaves' glow */
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.7)"); gr.addColorStop(0.6, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
/** a ring that's bright at its leading edge and fades in behind it, like a wave going out */
let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.55, "rgba(255,255,255,0.05)"); gr.addColorStop(0.82, "rgba(255,255,255,0.55)"); gr.addColorStop(0.93, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  ringTex = new THREE.CanvasTexture(c); ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

export function makeVfx(G) {
  const soft = pool(G, false), glow = pool(G, true);

  // ---- shockwaves: flat rings over the ground ----
  const RINGS = 28, rings = [], ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (let i = 0; i < RINGS; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const mesh = new THREE.Mesh(ringGeo, mat); mesh.visible = false; mesh.renderOrder = 4; G.scene.add(mesh);
    rings.push({ mesh, life: 0, full: 1, r: 1, a: 1 });
  }
  let ringAt = 0;
  const ring = (x, y, z, color, r, life, add, a = add ? 0.45 : 0.6) => {
    const R = rings[ringAt]; ringAt = (ringAt + 1) % RINGS;
    R.mesh.position.set(x, y + 0.06, z); R.mesh.material.color.setHex(color); R.mesh.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    R.mesh.visible = true; R.mesh.scale.setScalar(0.01); R.life = R.full = life; R.r = r; R.a = a;
  };

  // ---- flashes: a soft bloom of light that pops and fades ----
  const FLASHES = 16, flashes = [];
  for (let i = 0; i < FLASHES; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    s.visible = false; s.renderOrder = 5; G.scene.add(s); flashes.push({ s, life: 0, full: 1, r: 1 });
  }
  let flashAt = 0;
  const flash = (x, y, z, color, r) => { const F = flashes[flashAt]; flashAt = (flashAt + 1) % FLASHES; F.s.position.set(x, y + 0.3, z); F.s.material.color.setHex(color); F.s.visible = true; F.life = F.full = 0.32; F.r = r; };

  // ---- debris: little chips that tumble, bounce and settle ----
  const CHIPS = 180, chipGeo = new THREE.TetrahedronGeometry(1, 0), chipMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
  const chipMesh = new THREE.InstancedMesh(chipGeo, chipMat, CHIPS);
  chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chipMesh.frustumCulled = false; chipMesh.castShadow = true; chipMesh.count = CHIPS;
  chipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHIPS * 3), 3);
  G.scene.add(chipMesh);
  const chips = [...Array(CHIPS)].map(() => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), floor: 0, s: 0.1, rest: false }));
  const M4 = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), dq = new THREE.Quaternion(), SV = new THREE.Vector3(), cc = new THREE.Color(), E = new THREE.Euler();
  for (let i = 0; i < CHIPS; i++) chipMesh.setMatrixAt(i, ZERO);
  let chipAt = 0, chipsLive = 0;
  const chipBurst = (x, y, z, X, scale) => {
    const n = Math.round(X.n * Math.min(1.6, scale));
    for (let i = 0; i < n; i++) {
      const C = chips[chipAt], idx = chipAt; chipAt = (chipAt + 1) % CHIPS;
      const a = Math.random() * 6.3, o = 1.4 + Math.random() * 2.4;
      C.p.set(x, y + 0.15, z); C.v.set(Math.cos(a) * o, 3 + Math.random() * 3.5, Math.sin(a) * o); C.floor = y;
      C.q.setFromEuler(E.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)); C.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
      C.s = X.chip * (0.6 + Math.random() * 0.8) * Math.min(1.4, Math.max(0.7, scale)); C.life = 1.6 + Math.random() * 0.6; C.rest = false;
      cc.setHex(X.chips[i % X.chips.length]); chipMesh.setColorAt(idx, cc);
    }
    chipMesh.instanceColor.needsUpdate = true; chipsLive = 1;
  };

  const last = {};
  const V = {
    burst(kind, x, y, z, scale = 1) {
      const K = KINDS[kind];
      if (!K) return;
      const F = FEEL[kind] || {};
      (F.add ? glow : soft).spawn(kind, K, F, x, y, z, scale);
      // the layers on top, for a burst that's big enough to deserve them (not every footstep), and not twice in the same instant
      const X = EXTRA[kind];
      if (!X || scale < 0.5) return;
      const now = performance.now();
      if (now - (last[kind] || 0) < 60) return;
      last[kind] = now;
      if (X.chips) chipBurst(x, y, z, X, scale);
      if (X.ring) { ring(x, y, z, X.ring, X.ringR * Math.min(1.8, scale), 0.55, X.add); if (X.ring2) ring(x, y, z, X.ring, X.ringR * 0.6 * Math.min(1.8, scale), 0.8, X.add, 0.35); }
      if (X.flash) flash(x, y, z, X.flash, X.flashR * Math.min(1.8, scale));
    },
    /** an icon rising from a spot in the world: what you just got */
    item(text, x, y, z) {
      const p = new THREE.Vector3(x, y, z).project(G.camera);
      if (p.z > 1) return;
      const e = document.createElement("div");
      e.className = "float"; e.textContent = text;
      e.style.left = `${(p.x + 1) / 2 * innerWidth}px`; e.style.top = `${(1 - p.y) / 2 * innerHeight}px`;
      document.body.append(e);
      setTimeout(() => e.remove(), 1300);
    },
    tick(dt) {
      soft.tick(dt); glow.tick(dt);
      for (const R of rings) {
        if (R.life <= 0) continue;
        R.life -= dt;
        if (R.life <= 0) { R.mesh.visible = false; continue; }
        const u = 1 - R.life / R.full, ease = 1 - (1 - u) ** 3;
        R.mesh.scale.setScalar(Math.max(0.01, R.r * 2 * ease)); R.mesh.material.opacity = R.a * (1 - u) ** 1.5;
      }
      for (const F of flashes) {
        if (F.life <= 0) continue;
        F.life -= dt;
        if (F.life <= 0) { F.s.visible = false; continue; }
        const u = 1 - F.life / F.full;
        F.s.scale.setScalar(F.r * (0.5 + 0.9 * Math.sqrt(u))); F.s.material.opacity = (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85) * 0.9;
      }
      if (chipsLive) {
        let any = 0;
        for (let i = 0; i < CHIPS; i++) {
          const C = chips[i];
          if (C.life <= 0) continue;
          any = 1; C.life -= dt;
          if (C.life <= 0) { chipMesh.setMatrixAt(i, ZERO); continue; }
          if (!C.rest) {
            C.v.y -= 16 * dt; C.p.addScaledVector(C.v, dt);
            dq.setFromEuler(E.set(C.w.x * dt, C.w.y * dt, C.w.z * dt)); C.q.multiply(dq);
            if (C.p.y < C.floor + C.s * 0.5) {                 // a bounce, each one smaller, till it lies still
              C.p.y = C.floor + C.s * 0.5; C.v.y *= -0.38; C.v.x *= 0.55; C.v.z *= 0.55; C.w.multiplyScalar(0.5);
              if (Math.abs(C.v.y) < 0.6) C.rest = true;
            }
          }
          const s = C.s * Math.min(1, C.life / 0.4);
          chipMesh.setMatrixAt(i, M4.compose(C.p, C.q, SV.set(s, s * 0.7, s)));
        }
        chipMesh.instanceMatrix.needsUpdate = true; chipsLive = any;
      }
    },
  };
  return V;
}
