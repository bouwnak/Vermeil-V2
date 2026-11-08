// hubfx.js - the life in the air of each hub: drifting light motes, birds wheeling overhead, steam off the cups,
// beams of sunlight, banners and lamps swaying, neon pixels rising in the arcade. Added when you walk in, gone when you leave.
import * as THREE from "three";

const TAU = Math.PI * 2;
let soft = null;
/** a soft round dot, white in the middle */
function dot() {
  if (soft) return soft;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c); soft.colorSpace = THREE.SRGBColorSpace;
  return soft;
}
const rnd = (a, b) => a + Math.random() * (b - a);

/** specks of light drifting slowly through a box of air */
function motes(group, box, n, color, size, { rise = 0.05, sway = 0.25, add = true, opacity = 0.8 } = {}) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([rnd(box.x0, box.x1), rnd(box.y0, box.y1), rnd(box.z0, box.z1)], i * 3); seed[i] = Math.random() * 100; }
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: dot(), color, size, transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, fog: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.raycast = () => {}; pts.renderOrder = 3; group.add(pts);
  return (t, dt) => {
    const p = geo.attributes.position;
    for (let i = 0; i < n; i++) {
      const s = seed[i];
      let x = p.getX(i) + Math.sin(t * 0.3 + s) * sway * dt, y = p.getY(i) + rise * dt * (0.5 + (s % 1)), z = p.getZ(i) + Math.cos(t * 0.27 + s * 1.3) * sway * dt;
      if (y > box.y1) y = box.y0; if (y < box.y0) y = box.y1;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    mat.opacity = opacity * (0.85 + 0.15 * Math.sin(t * 0.8));
  };
}

/** birds wheeling in slow circles high up, wings beating then gliding */
function birds(group, cx, cz, n, { r0 = 20, r1 = 60, y0 = 18, y1 = 34, color = 0x2d2f3a, size = 0.9 } = {}) {
  const wingGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.22, 1, 0.05, -0.05, 0, 0, -0.22, 0, 0, 0.18, 1, 0.05, -0.05], 3));
  wingGeo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  const body = new THREE.SphereGeometry(0.12, 8, 6).scale(1, 0.8, 2.6);
  const list = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(), L = new THREE.Mesh(wingGeo, mat), R = new THREE.Mesh(wingGeo, mat), B = new THREE.Mesh(body, mat);
    R.scale.x = -1; b.add(L, R, B); b.scale.setScalar(size * rnd(0.8, 1.2)); b.traverse((o) => { o.raycast = () => {}; });
    group.add(b);
    list.push({ b, L, R, r: rnd(r0, r1), y: rnd(y0, y1), a: Math.random() * TAU, w: rnd(0.05, 0.11) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 10 });
  }
  return (t, dt) => {
    for (const o of list) {
      o.a += o.w * dt;
      const x = cx + Math.cos(o.a) * o.r, z = cz + Math.sin(o.a) * o.r, y = o.y + Math.sin(t * 0.4 + o.ph) * 1.5;
      o.b.position.set(x, y, z);
      o.b.rotation.set(0, -o.a + (o.w > 0 ? 0 : Math.PI), Math.sign(o.w) * 0.25);
      const beat = (Math.sin(t * 0.5 + o.ph) > 0.2) ? Math.sin(t * 11 + o.ph) * 0.7 : 0.08;   // flap, then glide
      o.L.rotation.z = beat; o.R.rotation.z = -beat;
    }
  };
}

/** steam rising off cups and pots: little puffs that climb, spread and fade */
function steam(group, spots) {
  if (!spots.length) return () => {};
  const mats = [], puffs = [];
  for (const [x, y, z] of spots) for (let k = 0; k < 4; k++) {
    const m = new THREE.SpriteMaterial({ map: dot(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
    const s = new THREE.Sprite(m); s.raycast = () => {}; group.add(s); mats.push(m);
    puffs.push({ s, m, x, y, z, t: k / 4, sp: rnd(0.35, 0.5) });
  }
  return (t, dt) => {
    for (const p of puffs) {
      p.t += dt * p.sp; if (p.t > 1) p.t -= 1;
      const k = p.t;
      p.s.position.set(p.x + Math.sin(t * 1.3 + p.y * 9 + k * 4) * 0.06 * k, p.y + k * 0.55, p.z + Math.cos(t + k * 3) * 0.04 * k);
      p.s.scale.setScalar(0.08 + k * 0.28);
      p.m.opacity = Math.sin(Math.PI * k) * 0.22;
    }
  };
}

/** soft beams of sunlight slanting down from high windows */
function shafts(group, list, color = 0xfff0cf, strength = 0.18) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: strength }, uT: { value: 0 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: "uniform vec3 uColor; uniform float uK, uT; varying vec2 vUv; varying vec3 vN, vV; void main(){ float e = pow(abs(dot(normalize(vN), vV)), 2.0); float fall = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y)); float sh = 0.8 + 0.2 * sin(uT * 0.6 + vUv.x * 12.566); gl_FragColor = vec4(uColor * e * fall * sh * uK, 1.0); }",
  });
  for (const [x, z, h, r, tilt = 0.25, turn = 0] of list) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 24, 1, true).translate(0, h / 2, 0), mat);
    m.position.set(x, 0, z); m.rotation.set(0, turn, tilt); m.raycast = () => {}; m.renderOrder = 4; group.add(m);
  }
  return (t) => { mat.uniforms.uT.value = t; };
}

/** hanging things sway a little, each in its own time */
function sway(room, types, amp = 0.04, speed = 0.9) {
  const list = [];
  for (const it of room.cozy.items.values()) if (types.includes(it.spec.type)) list.push({ g: it.group, base: it.group.rotation.z, bx: it.group.rotation.x, ph: Math.random() * TAU });
  return (t) => { for (const o of list) { o.g.rotation.z = o.base + Math.sin(t * speed + o.ph) * amp; o.g.rotation.x = o.bx + Math.sin(t * speed * 0.8 + o.ph * 1.7) * amp * 0.6; } };
}

const itemsOf = (room, types) => [...room.cozy.items.values()].filter((it) => types.includes(it.spec.type)).map((it) => it.spec);

/** what each hub gets */
const RECIPES = {
  main(g, room) { return [birds(g, 0, -60, 9, { r0: 40, r1: 130, y0: 40, y1: 70, color: 0x5a4a44, size: 1.6 })]; },
  park(g) { return [birds(g, -10, 40, 10, { r0: 25, r1: 90, y0: 22, y1: 38, color: 0x2f3a33 }), motes(g, { x0: -60, x1: 80, y0: 0.4, y1: 4, z0: -40, z1: 110 }, 220, 0xfff1a8, 0.16, { rise: 0.08, sway: 0.4, opacity: 0.55 })]; },
  beach(g) { return [birds(g, 0, 10, 8, { r0: 12, r1: 45, y0: 10, y1: 22, color: 0xf4f1ea, size: 1.3 }), motes(g, { x0: -40, x1: 40, y0: 0.2, y1: 3, z0: -8, z1: 40 }, 260, 0xffe3b0, 0.12, { rise: 0.04, sway: 0.6, opacity: 0.45 })]; },
  cafe(g, room, b, h) {
    const cups = itemsOf(room, ["hubCafeTable", "hubRoundTable"]).slice(0, 14).map((s) => [s.x + 0.12, 0.86, s.z - 0.1]);
    return [steam(g, cups), motes(g, { x0: b.minX, x1: b.maxX, y0: 0.6, y1: h - 0.4, z0: b.minZ, z1: b.maxZ }, 160, 0xffd9a0, 0.06, { rise: 0.02, sway: 0.12, opacity: 0.6 }), sway(room, ["hubPendant"], 0.035)];
  },
  library(g, room, b, h) {
    return [motes(g, { x0: b.minX, x1: b.maxX, y0: 0.5, y1: h - 0.3, z0: b.minZ, z1: b.maxZ }, 260, 0xffe6b0, 0.055, { rise: 0.015, sway: 0.08, opacity: 0.7 }),
      shafts(g, [[-8, 6, h + 1, 1.6, 0.3], [8, 14, h + 1, 1.6, 0.3], [-8, 22, h + 1, 1.6, 0.3], [8, 30, h + 1, 1.6, 0.3]], 0xffe2b0, 0.16), sway(room, ["hubPendant"], 0.03)];
  },
  study(g, room, b, h) { return [motes(g, { x0: b.minX, x1: b.maxX, y0: 0.5, y1: h - 0.3, z0: b.minZ, z1: b.maxZ }, 70, 0xffe6b0, 0.05, { rise: 0.015, sway: 0.08 })]; },
  museum(g, room, b) {
    return [motes(g, { x0: -4, x1: 4, y0: 0.6, y1: 7, z0: -4, z1: 34 }, 240, 0xfff2d6, 0.05, { rise: 0.012, sway: 0.06, opacity: 0.75 }),
      shafts(g, [[-1.6, 2, 9, 1.5, 0.14], [1.6, 10, 9, 1.5, -0.14], [-1.6, 18, 9, 1.5, 0.14], [1.6, 26, 9, 1.5, -0.14]], 0xfff3dc, 0.06)];
  },
  arcade(g, room, b, h) {
    const cols = [0xff4fa3, 0x4fe3ff, 0xb98bff, 0x7dff9a];
    return cols.map((c) => motes(g, { x0: b.minX, x1: b.maxX, y0: 0.2, y1: h - 0.2, z0: b.minZ, z1: b.maxZ }, 60, c, 0.09, { rise: 0.35, sway: 0.15, opacity: 0.85 }));
  },
  stalls(g, room, b, h) {
    const petals = motes(g, { x0: b.minX, x1: b.maxX, y0: 0.3, y1: h - 0.5, z0: b.minZ, z1: b.maxZ }, 280, 0xffb3cf, 0.1, { rise: -0.25, sway: 0.5, add: false, opacity: 0.9 });
    return [petals, sway(room, ["stAisleBanner", "stWallBanner"], 0.02, 0.7)];
  },
};

let live = null;
export function startHubFx(room, hub) {
  stopHubFx(room);
  const make = RECIPES[hub?.key]; if (!make) return;
  const g = new THREE.Group(); g.name = "hubfx"; room.scene.add(g);
  const bb = room.cozy.house.bounds(), h = hub.layout?.shell?.house?.h || room.cozy.house.cfg?.h || 4;
  let ups = [];
  try { ups = make(g, room, bb, h).filter(Boolean); } catch (e) { console.warn("[hub fx]", e); }
  live = { g, ups, hub };
}
export function tickHubFx(dt, t) { if (live) for (const f of live.ups) f(t, Math.min(dt, 0.1)); }
export function stopHubFx(room) {
  if (!live) return;
  room.scene.remove(live.g);
  live.g.traverse((o) => { o.geometry?.dispose?.(); if (o.material && o.material.map !== soft) o.material.dispose?.(); });
  live = null;
}
