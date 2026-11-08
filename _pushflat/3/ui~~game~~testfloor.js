// testfloor.js - Settings > Test mode > Model grid: the models this adventure uses stood out in labelled rows, like the test floors of the main room and the farm.
// A window of its own, over the game: the adventure isn't touched and its loaded models aren't either. Drag to look, wheel to zoom, WASD to move, Esc to leave.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makePackBar, prettyPack } from "../packbar.js";

const ROW = 12, CELL = 4.5, SIDE = 3;   // to a row, metres between them, and how long a model's longest side is shown
const SAMPLE = 8;                        // with every pack showing: this many of each

const label = (text, w = 3) => {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = 512; c.height = 96;
  g.fillStyle = "rgba(90,55,25,.92)"; g.fillRect(0, 0, 512, 96);
  g.fillStyle = "#fff4d4"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 40px Nunito, sans-serif";
  g.fillText(text.length > 24 ? `${text.slice(0, 23)}…` : text, 256, 50);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
  s.scale.set(w, w * 0.1875, 1);
  return s;
};

/** the rows for what's picked: by role inside one pack, or the first few of each pack */
export function rowsOf(models, pack) {
  const rows = [], chunk = (title, list) => { for (let i = 0; i < list.length; i += ROW) rows.push([i ? `${title} ${i / ROW + 1}` : title, list.slice(i, i + ROW)]); };
  if (pack) {
    const roles = new Map();
    for (const m of models.filter((x) => x.pack === pack)) (roles.get(m.role || "other") || roles.set(m.role || "other", []).get(m.role || "other")).push(m);
    for (const [role, list] of [...roles].sort()) chunk(`${prettyPack(pack)}: ${role}`, list);
  } else {
    const packs = new Map();
    for (const m of models) (packs.get(m.pack) || packs.set(m.pack, []).get(m.pack)).push(m);
    for (const [k, list] of [...packs].sort()) rows.push([`${prettyPack(k)} (${list.length})`, list.slice(0, SAMPLE)]);
  }
  return rows;
}

export function packList(models) {
  const n = new Map();
  for (const m of models) n.set(m.pack, (n.get(m.pack) || 0) + 1);
  return [...n].map(([key, count]) => ({ key, label: prettyPack(key), count }));
}

/** models: the catalog entries to show */
export function openTestFloor(models, pack = "") {
  document.getElementById("modelGrid")?.remove();
  const box = document.createElement("div");
  box.id = "modelGrid";
  box.style.cssText = "position:fixed;inset:0;z-index:9000;background:#dfe9e4";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block";
  const bar = makePackBar({ packs: packList(models), allLabel: "All the packs this adventure uses", value: pack, onPick: (k) => { close(); openTestFloor(models, k); } });
  bar.style.cssText += ";position:absolute;top:12px;left:12px";
  const leave = document.createElement("button");
  leave.type = "button"; leave.className = "small"; leave.textContent = "Leave the grid (Esc)";
  leave.style.cssText = "position:absolute;top:12px;right:12px";
  const note = document.createElement("div");
  note.style.cssText = "position:absolute;left:12px;bottom:12px;padding:6px 10px;border-radius:8px;background:rgba(90,55,25,.9);color:#fff4d4;font:600 14px sans-serif";
  box.append(canvas, bar, leave, note);
  document.body.append(box);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe9e4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8a8, 2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(30, 60, 30); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0xf1ede2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor);
  scene.add(new THREE.GridHelper(2000, 500, 0xcfc8b6, 0xdfd9c8));
  const cam = new THREE.PerspectiveCamera(55, 1, 0.05, 900);
  cam.position.set(CELL * 3, 8, -12);
  const orbit = new OrbitControls(cam, canvas);
  orbit.target.set(CELL * 3, 1, 4); orbit.update();

  // the plan first: every slot is known before anything loads, then the nearest to the camera loads next
  const slots = [];
  rowsOf(models, pack).forEach(([title, list], r) => {
    const z = r * (CELL + 2), head = label(title, 8);
    head.position.set(-6, 2, z); scene.add(head);
    list.forEach((m, i) => slots.push({ m, x: i * CELL, z }));
  });
  const loader = new GLTFLoader(), mixers = [];
  let open = true, busy = 0, done = 0;
  const place = (slot, g) => {
    const root = g.scene;
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; for (const m of [].concat(o.material)) if (m.metalness > 0.6 && !m.metalnessMap) m.metalness = 0.15; } });
    root.updateMatrixWorld(true);
    let b = new THREE.Box3().setFromObject(root);
    const size = b.getSize(new THREE.Vector3()), k = SIDE / Math.max(size.x, size.y, size.z, 1e-3);
    root.scale.multiplyScalar(k);
    root.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(root);
    root.position.x += slot.x - (b.min.x + b.max.x) / 2; root.position.y -= b.min.y; root.position.z += slot.z - (b.min.z + b.max.z) / 2;
    scene.add(root);
    if (g.animations?.length) {
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(g.animations.find((c) => /idle/i.test(c.name)) || g.animations[0]).play();
      mixers.push(mixer);
    }
    const tag = label(slot.m.name, 3); tag.position.set(slot.x, b.max.y - b.min.y + 0.45, slot.z); scene.add(tag);
  };
  const pump = () => {
    while (open && busy < 3 && slots.length) {
      slots.sort((a, b) => Math.hypot(b.x - cam.position.x, b.z - cam.position.z) - Math.hypot(a.x - cam.position.x, a.z - cam.position.z));
      const slot = slots.pop();
      busy++;
      loader.loadAsync(encodeURI(`../${slot.m.url}`)).then((g) => { if (open) place(slot, g); else g.scene.traverse(free); }, (e) => {
        console.warn("[model grid]", slot.m.id, e?.message);
        if (open) { const bad = label(`${slot.m.name}: couldn't load`); bad.position.set(slot.x, 1.2, slot.z); scene.add(bad); }
      }).finally(() => { busy--; done++; note.textContent = slots.length || busy ? `Setting out: ${done} of ${done + slots.length + busy}` : `${done} models`; pump(); });
    }
  };

  const keys = new Set(), clock = new THREE.Clock(), forward = new THREE.Vector3(), across = new THREE.Vector3();
  const onKey = (e) => {
    if (e.target === bar) return;
    e.stopPropagation();
    if (e.type === "keydown" && e.key === "Escape") { close(); return; }
    if (e.type === "keydown") keys.add(e.code); else keys.delete(e.code);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  const fit = () => { const w = box.clientWidth || 800, h = box.clientHeight || 600; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  window.addEventListener("resize", fit);
  fit();
  const frame = () => {
    if (!open) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1), speed = (keys.has("ShiftLeft") ? 28 : 12) * dt;
    cam.getWorldDirection(forward).setY(0).normalize(); across.crossVectors(forward, cam.up);
    const move = new THREE.Vector3();
    if (keys.has("KeyW")) move.add(forward); if (keys.has("KeyS")) move.sub(forward);
    if (keys.has("KeyD")) move.add(across); if (keys.has("KeyA")) move.sub(across);
    if (move.lengthSq()) { move.normalize().multiplyScalar(speed); cam.position.add(move); orbit.target.add(move); }
    orbit.update();
    for (const m of mixers) m.update(dt);
    renderer.render(scene, cam);
  };
  const free = (o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose?.(); }
  };
  function close() {
    if (!open) return;
    open = false;
    window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true); window.removeEventListener("resize", fit);
    orbit.dispose();
    scene.traverse(free);
    renderer.dispose();
    renderer.forceContextLoss?.();
    box.remove();
  }
  leave.addEventListener("click", close);
  pump();
  frame();
  return { close, scene, renderer, cam, orbit, get left() { return slots.length + busy; } };
}
