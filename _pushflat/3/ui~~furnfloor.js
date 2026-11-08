// furnfloor.js - Settings > Test > Furniture test floor: a small sample of the main room's furniture, walls and floors stood out in labelled rows
// (like the Turtle Island test floor), so anything off is easy to spot. It's a window of its own: your room isn't touched. Drag to look, wheel to zoom, WASD to move, Esc to leave.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CATALOG, CozyRoom, UNIQUE_WALLS, WALLPAPERS, WALL_RELIEF, floorTexture, wallBumpTexture, wallpaperTexture } from "./cozyroom.js";
import { PACK_NAMES } from "./packfurniture.js";
import { makePackBar, prettyPack } from "./packbar.js";

const PER_ROW = 6;                     // a small sample: this many of each kind of furniture
const PACK_ROW = 12;                   // with one pack picked, everything it has: this many to a row
const BUILT_IN = "built-in";           // the dropdown's name for the room's own hand-made furniture

const label = (text, w = 2.6) => {
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

/** One piece of furniture, built the way the room builds it. */
function buildPiece(type) {
  const def = CATALOG[type];
  const spec = { type, x: 0, z: 0, rot: 0, y: def.defaultY ?? 0 };
  const ctx = { spec, name: "Vermeil", _itemId: 0, _room: { onGLBLoaded() {}, onChange() {}, items: new Map(), skyMat: new THREE.MeshBasicMaterial({ color: 0x8cc0f0 }) } };
  return def.build(ctx).group;
}

/** A piece of wall with a floor tile in front, the way that pair looks in a room. */
function wallSample(wall, floor) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  if (wall !== "none") {
    mat.map = wallpaperTexture(wall);
    if (WALL_RELIEF[wall]) { mat.bumpMap = wallBumpTexture(wall); mat.bumpScale = WALL_RELIEF[wall] * 30; }
    if (wall === "neongrid") { mat.emissive.set(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.7; }
  } else mat.color.set(0x8a7f92);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), mat);
  panel.position.set(0, 1.1, -1);
  const tile = floorSample(floor, 2.4, 2);
  g.add(panel, tile);
  return g;
}
function floorSample(style, w = 2.4, d = 2.4) {
  const t = floorTexture(style);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 3.3, d / 2.8);
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  tile.rotation.x = -Math.PI / 2; tile.position.y = 0.01;
  return tile;
}

/** rows = [[title, [[name, make()], ...]], ...]: each thing gets its own width and a label over it. */
function layOut(scene, rows) {
  let z = 0;
  for (const [title, list] of rows) {
    const head = label(title, 6); head.position.set(-5, 2, z); scene.add(head);
    let x = 0, deep = 2.5;
    for (const [name, make] of list) {
      let obj = null;
      try { obj = make(); } catch (e) { console.warn("[test floor]", name, e); }
      if (!obj) { const bad = label(`${name}: couldn't build`); bad.position.set(x + 1, 1.2, z); scene.add(bad); x += 3; continue; }
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj), empty = b.isEmpty();
      const w = empty ? 2 : Math.max(b.max.x - b.min.x, 1.6), c = empty ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
      obj.position.x += x + w / 2 - c.x; obj.position.z += z - c.z;
      const tag = label(name); tag.position.set(x + w / 2, (empty ? 1 : b.max.y) + 0.4, z); scene.add(tag);
      x += w + 1.2;
      if (!empty) deep = Math.max(deep, b.max.z - b.min.z);
    }
    z -= deep + 3;                     // rows run away from the camera, so walls and furniture show their fronts
  }
  return -z;
}

let open = false;
/** categories = [[key, title], ...]; categoryOf(type, def) = the editor's own sorting, so it shows what the catalog shows. */
export function openFurnitureFloor({ categories, categoryOf, room, pack = "" }) {
  if (open) return;
  open = true;
  const wrap = document.createElement("div"); wrap.className = "test-floor";
  const canvas = document.createElement("canvas");
  const leave = Object.assign(document.createElement("button"), { type: "button", className: "test-floor-exit", textContent: "Leave the floor (Esc)" });
  const help = Object.assign(document.createElement("p"), { className: "test-floor-help", textContent: "Drag to look, wheel to zoom, WASD to move" });
  const count = {};
  for (const def of Object.values(CATALOG)) if (!def.hubOnly) { const k = def.pack || BUILT_IN; count[k] = (count[k] || 0) + 1; }
  const bar = makePackBar({
    packs: Object.entries(count).map(([key, n]) => ({ key, label: key === BUILT_IN ? "Vermeil's own furniture" : PACK_NAMES[key] || prettyPack(key), count: n })),
    allLabel: "A sample of every asset pack", value: pack, onPick: (key) => show(key),
  });
  Object.assign(bar.style, { position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)", zIndex: 2 });
  wrap.append(canvas, leave, help, bar);
  document.body.append(wrap);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe9e4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8a8, 2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2); sun.position.set(20, 40, 30); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xf1ede2 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(300, 600, 0xcfc8b6, 0xdfd9c8); grid.position.y = 0.002; scene.add(grid);

  const floors = CozyRoom.floorStyles();
  const walls = [...UNIQUE_WALLS, "none", "stripes", "brick", "panels"];
  const world = new THREE.Group(); scene.add(world);
  let depth = 0;
  const freeAll = (root) => root.traverse((o) => { if (o !== root) { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); } } });
  /** Lay the floor out again for one pack ("" = the small sample of everything, with the walls and floors). */
  function show(key) {
    freeAll(world);
    world.clear();
    const rows = key ? [] : [
      ["Walls + floors", walls.map((k, i) => [WALLPAPERS[k], () => wallSample(k, floors[i % floors.length])])],
      ["Floors", floors.map((f) => [f, () => floorSample(f)])],
    ];
    const inPack = (def) => !key || (key === BUILT_IN ? !def.pack : def.pack === key);
    for (const [cat, title] of categories) {
      let types = Object.entries(CATALOG).filter(([type, def]) => !def.hubOnly && inPack(def) && categoryOf(type, def) === cat);
      if (!key) {                          // the sample shows some of the room's own, and some from the packs
        const own = types.filter(([, def]) => !def.pack), packs = types.filter(([, def]) => def.pack);
        types = [...own.slice(0, PER_ROW), ...packs.slice(0, PER_ROW)];
      }
      const size = key ? PACK_ROW : PER_ROW * 2;
      for (let i = 0; i < types.length; i += size) {
        const part = types.slice(i, i + size), n = 1 + i / size;
        rows.push([n > 1 ? `${title} ${n}` : title, part.map(([type, def]) => [def.label, () => buildPiece(type)])]);
      }
    }
    depth = layOut(world, rows);
  }
  show(pack);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
  camera.position.set(7, 5, 9);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(7, 0.8, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.54;
  controls.update();

  const fit = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / Math.max(innerHeight, 1);
    camera.updateProjectionMatrix();
  };
  fit();
  addEventListener("resize", fit);

  const keys = new Set();
  const down = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    keys.add(e.key.toLowerCase());
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  document.addEventListener("keydown", down, true);
  document.addEventListener("keyup", up, true);

  const clock = new THREE.Clock(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const mx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), mz = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    if (mx || mz) {
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      side.crossVectors(fwd, camera.up).normalize();
      const step = side.multiplyScalar(mx).addScaledVector(fwd, mz).setLength(dt * 9);
      camera.position.add(step); controls.target.add(step);
      controls.target.z = Math.max(-depth - 6, Math.min(6, controls.target.z));
    }
    controls.update();
    renderer.render(scene, camera);
  });
  const hadFront = room.gameInFront;
  room.gameInFront = true;                                // your room needn't be drawn behind this

  function close() {
    open = false;
    room.gameInFront = hadFront;
    renderer.setAnimationLoop(null);
    removeEventListener("resize", fit);
    document.removeEventListener("keydown", down, true);
    document.removeEventListener("keyup", up, true);
    controls.dispose();
    scene.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); } });
    renderer.dispose();
    wrap.remove();
  }
  leave.addEventListener("click", close);
}
