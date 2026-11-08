// evolve.js - a dinosaur becoming its next form, as a scene of its own. The world falls away behind streaming light; the dinosaur rises off
// the ground and glows brighter and brighter until it's a pure white silhouette; the light breaks open in a burst of white beams; its outline
// flickers back and forth between what it was and what it's becoming, faster and faster, growing as it goes; a last flash, and the new form
// is there in its own colours against a bright burst of rays.
// It plays through G.show (the world waits, like the showcase) and resolves when it's over. Space, Enter, E or a click moves on at the end;
// Escape skips it.
import * as THREE from "three";
import { duckMusic, evoSound } from "./audio.js";

// the light behind it, in three moods: rose while it glows, amber while it changes shape, a bright sky burst when it's done
const MOODS = { rose: [0xc8366c, 0xff86b0, 0xffe0ee], amber: [0x8a3f16, 0xd8843a, 0xffd59a], sky: [0x2f86c8, 0x96d2f4, 0xffffff] };
const FACE = 0.55;                                  // turned a little toward you, so you see its face and its side
// the timeline, in seconds
const T = { glow: 0.9, white: 3.4, beams: 4.4, morph: 6.0, morphEnd: 8.6, reveal: 9.2, settle: 9.6, done: 11.2, auto: 14 };

const smooth = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** the backdrop: one quad over the whole screen, behind everything. Streaks of light rushing upward with soft lights drifting in them,
 *  or (rays = 1) a burst of rays out of the middle */
function backdrop() {
  const m = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uT: { value: 0 }, uRays: { value: 0 }, uAsp: { value: 1 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uT, uRays, uAsp; uniform vec3 uA, uB, uC;
      float h1(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv, p = (uv - 0.5) * vec2(uAsp, 1.0);
        // streaks: tall bands of colour sliding up, two speeds over each other
        float s = n2(vec2(uv.x * 16.0, uv.y * 1.1 - uT * 1.5)) * 0.6 + n2(vec2(uv.x * 43.0, uv.y * 2.4 - uT * 2.7)) * 0.4;
        vec3 col = mix(uA, uB, smoothstep(0.22, 0.7, s));
        col = mix(col, uC, smoothstep(0.7, 0.96, s) * 0.85);
        // soft round lights drifting up through it, a little out of focus
        for (int k = 0; k < 2; k++) {
          float sc = k == 0 ? 5.0 : 9.0;
          vec2 g = vec2(uv.x * sc * uAsp, uv.y * sc * 0.75 - uT * (0.18 + float(k) * 0.12)), id = floor(g), f = fract(g) - 0.5, o = vec2(h2(id + 3.1), h2(id + 7.7)) - 0.5;
          float on = step(0.58, h2(id + float(k) * 13.0)), d = length(f - o * 0.6);
          col = mix(col, uC, on * smoothstep(0.26, 0.12, d) * (k == 0 ? 0.4 : 0.3));
        }
        col += uC * 0.12 * smoothstep(0.85, 0.0, length(p));
        // the burst: rays out of a white middle, streaming outward
        float a = atan(p.y, p.x), r = length(p), lane = floor(a * 38.0 / 6.2832);
        float ray = n1(a * 11.0 + 31.0) * 0.55 + n1(a * 27.0 - 4.0) * 0.45;
        float dash = smoothstep(0.35, 0.0, abs(fract(r * 1.6 - uT * 1.4 + h1(lane)) - 0.5)) * step(0.5, h1(lane + 9.0));
        vec3 burst = mix(uC, uB, smoothstep(0.42, 0.62, ray) * smoothstep(0.08, 0.5, r));
        burst = mix(burst, uA, smoothstep(0.62, 0.85, ray) * smoothstep(0.2, 0.8, r));
        burst = mix(burst, uC, dash * 0.6 * smoothstep(0.1, 0.4, r));
        burst = mix(burst, vec3(1.0), smoothstep(0.42, 0.0, r) * 0.85);
        gl_FragColor = vec4(mix(col, burst, uRays), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false; q.renderOrder = -100;
  return q;
}

/** a soft round spot of light, for the glow behind it and the motes */
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a white skin over every part of a body: the same shapes, bending with the same bones, drawn over the top. Its opacity takes the body
 *  from its own colours (0) to a pure white silhouette (1) and back */
function shellOf(holder) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xfffbfd, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const parts = [], shells = [];
  holder.traverse((o) => { if (o.isMesh && !o.userData.shell) parts.push(o); });
  for (const o of parts) {
    const m = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
    if (o.isSkinnedMesh) { m.bind(o.skeleton, o.bindMatrix); m.bindMode = o.bindMode; }
    if (o.morphTargetInfluences) { m.morphTargetInfluences = o.morphTargetInfluences; m.morphTargetDictionary = o.morphTargetDictionary; }
    m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
    m.userData.shell = true; m.frustumCulled = false; m.renderOrder = 10; m.castShadow = false;
    o.parent.add(m); shells.push([m, o]);
  }
  return {
    mat,
    /** k: how white. Fully white, it's one flat shape, so it's drawn over every part of itself (an eye or a strap can't peek through) */
    set: (k) => { mat.opacity = k; mat.visible = k > 0.002; mat.depthTest = k < 0.97; },
    /** keep each white part where its part is: jaws, straps and reins move on their own */
    sync: () => { for (const [m, o] of shells) { m.visible = o.visible; m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale); } },
    remove: () => { for (const [m] of shells) m.parent?.remove(m); mat.dispose(); },
  };
}

/** the flash: white beams shooting out from the middle, a ragged burst of white that swallows the screen, and the streaks of colour left
 *  in it as it goes. Drawn on a flat canvas over the game */
function flashLayer() {
  const cv = document.createElement("canvas"), g = cv.getContext("2d");
  cv.className = "evo-flash";
  document.body.append(cv);
  const fit = () => { cv.width = Math.ceil(innerWidth / 2); cv.height = Math.ceil(innerHeight / 2); };
  fit();
  let seed = 1;
  const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
  let beams = [], rim = [], lines = [];
  const L = {
    el: cv,
    /** new beams for a new flash */
    reseed(n = 1) {
      seed = n * 7919;
      beams = [...Array(20)].map((_, i) => ({ a: (i / 20) * Math.PI * 2 + rnd() * 0.3, w: 0.025 + rnd() * 0.05, late: rnd() * 0.25, fast: 0.8 + rnd() * 0.7 }));
      rim = [...Array(56)].map(() => 0.7 + rnd() * 0.55);
      lines = [...Array(30)].map(() => ({ a: rnd() * Math.PI * 2, from: 0.12 + rnd() * 0.3, to: 0.55 + rnd() * 0.5, w: 1.5 + rnd() * 4 }));
    },
    /** beams: how far out (0-1+); burst: the ragged white disc (0-1 of the way to covering the screen); white: the whole screen; streaks: the
     *  colour streaks left in the white, in `tint` */
    draw({ beams: b = 0, burst = 0, white = 0, streaks = 0, tint = "255,130,170", fade = 1 }) {
      if (cv.width !== Math.ceil(innerWidth / 2)) fit();
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) * 0.62;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, Math.min(1, fade));
      if (b > 0) {
        g.fillStyle = "rgba(255,255,255,0.95)";
        for (const B of beams) {
          const k = ease((b - B.late) * B.fast);
          if (k <= 0) continue;
          const len = R * 1.3 * k, w = B.w * (1 - k * 0.4);
          g.beginPath(); g.moveTo(cx + Math.cos(B.a + Math.PI / 2) * 3, cy + Math.sin(B.a + Math.PI / 2) * 3);
          g.lineTo(cx + Math.cos(B.a - w) * len, cy + Math.sin(B.a - w) * len); g.lineTo(cx + Math.cos(B.a + w) * len, cy + Math.sin(B.a + w) * len); g.closePath(); g.fill();
        }
      }
      if (burst > 0) {
        g.fillStyle = "#fff";
        g.beginPath();
        rim.forEach((k, i) => { const a = (i / rim.length) * Math.PI * 2, r = R * 1.25 * ease(burst) * (burst > 0.92 ? 1.4 : k); i ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      if (white > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(1, white)})`; g.fillRect(0, 0, W, H); }
      if (streaks > 0) {
        g.lineCap = "round";
        for (const S of lines) {
          g.strokeStyle = `rgba(${tint},${0.85 * streaks})`; g.lineWidth = S.w;
          g.beginPath(); g.moveTo(cx + Math.cos(S.a) * R * S.from, cy + Math.sin(S.a) * R * S.from); g.lineTo(cx + Math.cos(S.a) * R * S.to, cy + Math.sin(S.a) * R * S.to); g.stroke();
        }
      }
    },
    clear() { g.clearRect(0, 0, cv.width, cv.height); },
  };
  L.reseed();
  return L;
}

/** motes of light: drifting up round it while it glows, then flung out all at once when it's done */
function motes(tex) {
  const N = 140, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ map: tex, size: 0.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, opacity: 0, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 20;
  let R = 2, H = 3, burst = false;
  const place = (i, y) => { const a = Math.random() * 6.3, r = R * (0.5 + Math.random() * 0.7); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r; vel[i * 3] = 0; vel[i * 3 + 1] = (0.4 + Math.random() * 0.8) * H * 0.3; vel[i * 3 + 2] = 0; };
  return {
    pts, mat,
    fit(r, h) { R = r; H = h; mat.size = Math.max(0.12, h * 0.05); burst = false; for (let i = 0; i < N; i++) place(i, Math.random() * H * 1.4); geo.attributes.position.needsUpdate = true; },
    /** everything out at once, from the middle of the body */
    fling(cy) { burst = true; for (let i = 0; i < N; i++) { const a = Math.random() * 6.3, e = (Math.random() - 0.5) * 2.2, v = H * (0.6 + Math.random() * 1.2); pos[i * 3] = 0; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = 0; vel[i * 3] = Math.cos(a) * v; vel[i * 3 + 1] = e * v * 0.6; vel[i * 3 + 2] = Math.sin(a) * v; } },
    tick(dt) {
      for (let i = 0; i < N; i++) {
        if (burst) { const k = Math.exp(-2.4 * dt); vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - 0.6 * dt; vel[i * 3 + 2] *= k; }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (!burst && pos[i * 3 + 1] > H * 1.5) place(i, -H * 0.1);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** play the scene. from / to: the old body and the new one (dinomodel bodies, already built). name: what it's called; form: what it becomes.
 *  Resolves true when it's over (the old body is discarded, the new one is left loose, reset, for the caller to put in the world) */
export function playEvolution(G, { from, to, name, form }) {
  return new Promise((resolve) => {
    if (G.show) { resolve(false); return; }
    const cam = G.camera, I = G.input;
    const keep = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, cinema: G.cinema, paused: G.paused };
    const scene = new THREE.Scene(), back = backdrop(), tex = glowTex();
    scene.add(back);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8d0, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4e8, 2.4); sun.position.set(4, 9, 10); scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-6, 4, -8); scene.add(rim);

    // both bodies on the stage, standing at its middle, turned a little toward you. The old one's measured before its shell goes on
    const box = new THREE.Box3(), size = new THREE.Vector3();
    const stand = (c) => {
      scene.add(c.holder);
      c.holder.position.set(0, 0, 0); c.holder.rotation.set(0, FACE, 0); c.holder.scale.setScalar(1); c.holder.visible = true;
      c.holder.updateMatrixWorld(true);
      box.setFromObject(c.holder).getSize(size);
      return { h: Math.max(0.5, size.y), long: Math.max(size.x, size.z, 0.5), y0: box.min.y };
    };
    const A = stand(from), B = stand(to);
    const shA = shellOf(from.holder), shB = shellOf(to.holder);
    shB.set(1); to.holder.visible = false;
    // how far back the camera stands to fit a body, and a halo of light behind it
    const view = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), fitOf = (m) => Math.max((m.h * 1.2) / (0.7 * view), (m.long * 0.85) / (0.8 * view * cam.aspect)) + 0.5;
    const fitA = fitOf(A), fitB = fitOf(B);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffd2e4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
    halo.renderOrder = 5; scene.add(halo);
    const M = motes(tex); M.fit(A.long * 0.5, A.h); scene.add(M.pts);

    const fx = flashLayer();
    const card = document.createElement("div");
    card.className = "evo-card"; card.hidden = true;
    document.body.append(card);
    const say = (text, sub = "") => { card.hidden = false; card.innerHTML = ""; const b = document.createElement("b"); b.textContent = text; card.append(b); if (sub) { const s = document.createElement("span"); s.textContent = sub; card.append(s); } card.classList.remove("in"); void card.offsetWidth; card.classList.add("in"); };

    // the moments the shape flips between old and new: slow at first, faster and faster, and always ending on the new one
    const flips = [];
    for (let at = T.morph + 0.15, gap = 0.5; at < T.morphEnd - 0.04; gap = Math.max(0.055, gap * 0.8)) { flips.push(at); at += gap; }
    if (flips.length % 2 === 0) flips.push(T.morphEnd);
    let flipAt = 0, showing = 0, pop = 0;

    const mood = (m) => { const u = back.material.uniforms; u.uA.value.setHex(MOODS[m][0]); u.uB.value.setHex(MOODS[m][1]); u.uC.value.setHex(MOODS[m][2]); };
    mood("rose");
    const fired = new Set(), once = (k, t0, t, fn) => { if (t >= t0 && !fired.has(k)) { fired.add(k); fn(); } };

    G.paused = true; G.cinema = true;
    document.body.classList.add("evo-on");           // the game's own screen (its bar, the prompt over whoever you're near, labels, notes) steps aside
    duckMusic(true);
    let t = 0, out = -1, ended = false;
    const look = new THREE.Vector3(), aim = new THREE.Vector3();

    const close = () => {
      if (ended) return;
      ended = true;
      G.show = null;
      shA.remove(); shB.remove();
      scene.remove(from.holder); scene.remove(to.holder);
      to.holder.position.set(0, 0, 0); to.holder.rotation.set(0, 0, 0); to.holder.scale.setScalar(1); to.holder.visible = true; to.lookAt = null;
      back.geometry.dispose(); back.material.dispose(); halo.material.dispose(); M.pts.geometry.dispose(); M.mat.dispose(); tex.dispose();
      cam.position.copy(keep.pos); cam.quaternion.copy(keep.quat); cam.fov = keep.fov; cam.updateProjectionMatrix();
      G.paused = keep.paused; G.cinema = keep.cinema;
      document.body.classList.remove("evo-on");
      duckMusic(false);
      card.remove();
      // back into the world out of white
      fx.draw({ white: 1 }); fx.el.style.transition = "opacity .55s ease"; requestAnimationFrame(() => { fx.el.style.opacity = "0"; }); setTimeout(() => fx.el.remove(), 700);
      resolve(true);
    };

    G.show = {
      scene, shadows: false,
      tick(dt) {
        dt = Math.min(dt, 0.05);
        t += dt;
        const skip = I.pressed.has("Escape"), next = I.click || ["Space", "Enter", "KeyE"].some((k) => I.pressed.has(k));
        // Escape before the reveal goes straight to the new form (it's worth seeing); Escape after it leaves
        if (skip && out < 0 && t < T.reveal) { t = T.reveal + 0.6; for (const k of ["rise", "beams"]) fired.add(k); flipAt = flips.length; showing = 1; }
        else if (out < 0 && ((t > T.done && next) || t > T.auto || (skip && t > T.reveal + 0.5))) out = 0;
        // ---- the light behind ----
        const u = back.material.uniforms;
        u.uT.value = t; u.uAsp.value = cam.aspect;
        mood(t < T.beams + 0.8 ? "rose" : t < T.reveal ? "amber" : "sky");
        u.uRays.value = t < T.reveal ? 0 : 1;
        // ---- the bodies ----
        const before = t < T.morph, cur = showing ? to : from, M0 = showing ? B : A;
        const lift = (t < T.reveal ? ease((t - 0.3) / 1.8) : 1 - smooth((t - T.settle) / 1.3)) * Math.max(A.h, B.h * 0.6) * 0.16 + Math.sin(t * 2.2) * 0.04 * M0.h * (t < T.settle + 1 ? 1 : 0.3);
        // white, all over: rising while it glows, a pulse while it's pure light, and falling away to its new colours at the end
        const white = t < T.reveal ? smooth((t - T.glow) / (T.white - T.glow)) : 1 - smooth((t - T.reveal - 0.05) / 1.1);
        shA.set(t < T.reveal ? white : 1); shB.set(t < T.reveal ? 1 : white);
        // shape flips, each one with a little pop of growth
        while (flipAt < flips.length && t >= flips[flipAt]) { showing = flipAt % 2 === 0 ? 1 : 0; pop = 1; evoSound.pulse(flipAt); flipAt++; }
        from.holder.visible = !showing; to.holder.visible = !!showing;
        pop = Math.max(0, pop - dt * 9);
        const throb = t > T.white && t < T.reveal ? Math.sin(t * 9) * 0.018 : 0;
        cur.holder.scale.set(1 - pop * 0.07 + throb, 1 + pop * 0.12 + throb, 1 - pop * 0.07 + throb);
        cur.holder.position.y = lift - M0.y0;
        cur.holder.rotation.y = FACE + Math.sin(t * 0.6) * 0.06;
        cur.lookAt = cam.position;
        cur.move?.(dt, t, false, false);
        cur.reinsTo?.(null);
        (showing ? shB : shA).sync();
        if (showing && !before && t >= T.reveal) once("roar", T.reveal + 0.35, t, () => { to.react?.("roar"); G.sfx?.("roar"); });
        // ---- the glow round it and the motes ----
        const mid = lift + M0.h * 0.5;
        halo.position.set(0, mid, -M0.long * 0.15);
        halo.scale.setScalar(Math.max(M0.h, M0.long * 0.7) * (1.8 + throb * 4));
        halo.material.opacity = t < T.reveal ? white * 0.32 : 0.32 * (1 - smooth((t - T.reveal) / 1.4));
        M.mat.opacity = t < T.reveal ? 0.25 + white * 0.65 : 1 - smooth((t - T.reveal - 0.6) / 1.6);
        once("fling", T.reveal, t, () => { M.fit(B.long * 0.5, B.h); M.fling(B.h * 0.5 + lift); });
        M.pts.position.y = t < T.reveal ? lift * 0.5 : 0;
        M.tick(dt);
        // ---- the camera: close on the old form, then (under the white) far enough back for the new one; drifting slowly round ----
        const grown = t >= T.morph - 0.25, dist = grown ? fitB : fitA;              // the screen's white when it draws back
        const cy = (grown ? B.h : A.h) * 0.5 + lift * 0.8;
        const shake = (t > T.beams && t < T.beams + 0.5) || (t > T.reveal && t < T.reveal + 0.3) ? 0.04 * dist * 0.05 : 0;
        const ang = Math.sin(t * 0.22) * 0.18;
        aim.set(Math.sin(ang) * dist, cy + dist * 0.08, Math.cos(ang) * dist);
        cam.position.copy(aim).add(look.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
        cam.lookAt(0, cy, 0);
        // ---- what it says ----
        once("say1", 0.6, t, () => say(`${name} is glowing...`));
        once("hide1", T.beams - 0.3, t, () => { card.hidden = true; });
        once("say2", T.reveal + 0.9, t, () => say(`${name} became ${/^[aeiou]/i.test(form) ? "an" : "a"} ${form}!`, ""));
        once("hint", T.done, t, () => { const s = document.createElement("span"); s.className = "evo-next"; s.textContent = "Click or press Space"; card.append(s); });
        // ---- sound ----
        once("rise", 0.3, t, () => evoSound.rise(T.beams - 0.4));
        once("beams", T.beams, t, () => { evoSound.flash(); fx.reseed(1); });
        once("flash2", T.reveal - 0.12, t, () => { evoSound.reveal(); fx.reseed(2); });
        // ---- the flash over everything ----
        if (out >= 0) {
          out += dt;
          fx.draw({ white: out / 0.35 });
          if (out >= 0.38) close();
          return;
        }
        if (t < 0.55) fx.draw({ white: 1 - t / 0.55 });                                     // in from the world, out of white
        else if (t >= T.beams && t < T.morph + 0.6) {
          const b = (t - T.beams) / (T.morph - T.beams);                                     // 0..1 over the burst
          const fade = 1 - smooth((t - T.morph) / 0.6);
          fx.draw({ beams: b * 1.6, burst: smooth((b - 0.12) / 0.6), white: smooth((b - 0.55) / 0.3) * fade, streaks: smooth((b - 0.45) / 0.3) * fade, tint: t < T.morph ? "226,92,140" : "220,128,60", fade });
        } else if (t >= T.reveal - 0.12 && t < T.reveal + 0.8) {
          const r = t - (T.reveal - 0.12);
          fx.draw({ white: r < 0.14 ? r / 0.14 : 1 - smooth((r - 0.2) / 0.7), streaks: r < 0.5 ? 1 - r * 2 : 0, tint: "120,190,240" });
        } else fx.clear();
      },
    };
  });
}
