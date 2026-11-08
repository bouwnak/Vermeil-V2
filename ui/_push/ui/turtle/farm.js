// farm.js - soil and crops. Plots are one small record each in a map, drawn as instances, so a huge farm costs little: nothing runs per plot each
// frame, and crops only grow when the day turns. A crop goes seed, sprout, young, mature, then ripe with a bubble over it.
import * as THREE from "three";
import { CATALOG, CROPS, ISLANDS, TOOL_UP, WEED, YOUNG } from "./data.js";
import { forest, loadModel } from "./assets.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CELL = 2, MAX = 2400, FLAT = 0.2;                     // FLAT: how much the ground may rise across a plot
export const keyOf = (x, z) => `${Math.round(x / CELL)},${Math.round(z / CELL)}`;
export const spotOf = (k) => k.split(",").map((n) => Number(n) * CELL);
const STAGE_HEIGHT = [0, 0.32, 0.6, 0.9];
/** 0 seed, 1 sprout, 2 young, 3 mature, 4 ripe */
export const stageOf = (p) => { const c = CROPS[p.crop]; return p.age >= c.days ? 4 : Math.min(3, Math.floor(p.age / c.days * 4)); };
export const ripe = (p) => !!p.crop && p.age >= CROPS[p.crop].days;

function bubbleTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const halo = g.createRadialGradient(64, 64, 30, 64, 64, 64); halo.addColorStop(0, "rgba(255,230,140,0.55)"); halo.addColorStop(1, "rgba(255,230,140,0)");
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#fffaf0"; g.strokeStyle = "#e8b04a"; g.lineWidth = 7;
  g.beginPath(); g.arc(64, 62, 40, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(54, 98); g.lineTo(64, 112); g.lineTo(74, 98); g.closePath(); g.fillStyle = "#e8b04a"; g.fill();      // the little tail pointing down at the crop
  // a four-pointed sparkle, the "ready!" sign
  const star = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 - Math.PI / 2, d = k % 2 ? r * 0.32 : r; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill(); };
  star(64, 62, 27, "#f2a93b"); star(64, 62, 15, "#ffd76a"); star(86, 40, 8, "#f6c25a");
  return new THREE.CanvasTexture(c);
}

/** a bed of soil: soft bevelled edges and, when it's only been hoed, three furrows across it. Ridges catch the light, furrows sit in
 *  shadow, and every crumb is a slightly different brown. Planted beds are a neat mound with a rim instead */
function bedGeometry(furrowed) {
  const W = CELL * 0.94, n = 14, g = new THREE.PlaneGeometry(W, W, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), e = Math.max(Math.abs(x), Math.abs(z)) / (W / 2), rim = Math.min(1, Math.max(0, (e - 0.72) / 0.28));
    const fall = 1 - rim * rim * (3 - 2 * rim);
    const ridge = 0.5 + 0.5 * Math.cos(z / W * Math.PI * 2 * 3), dome = 1 - (x * x + z * z) / (W * W / 4) * 0.5;
    const crumb = Math.sin(x * 41.3 + z * 17.1) * 43758.5453 % 1;
    p.setY(i, fall * (furrowed ? 0.1 + ridge * 0.09 : 0.12 + dome * 0.08) + Math.abs(crumb) * 0.012 - 0.02);
    const light = (furrowed ? 0.78 + ridge * 0.32 : 0.92 + dome * 0.14) * (0.94 + Math.abs(crumb) * 0.1) * (0.85 + fall * 0.15);
    col.push(light, light, light);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** the soft square that shows which plot you're about to work */
function markerTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 9; g.lineCap = "round";
  const r = 22, a = 12, b = 116;
  for (const [x, y, dx, dy] of [[a, a, 1, 1], [b, a, -1, 1], [a, b, 1, -1], [b, b, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * (r + 10)); g.lineTo(x, y + dy * 6); g.quadraticCurveTo(x, y, x + dx * 6, y); g.lineTo(x + dx * (r + 10), y); g.stroke(); }
  const fill = g.createRadialGradient(64, 64, 10, 64, 64, 64); fill.addColorStop(0, "rgba(255,255,255,0.22)"); fill.addColorStop(1, "rgba(255,255,255,0.05)");
  g.fillStyle = fill; g.fillRect(a, a, b - a, b - a);
  return new THREE.CanvasTexture(c);
}

export function makeFarm(G) {
  const earth = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.97 });
  const instanced = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); m.count = 0; m.receiveShadow = true; m.frustumCulled = false; return m; };
  const soil = instanced(bedGeometry(true), earth()), bed = instanced(bedGeometry(false), earth());
  // watered earth glistens: a thin, glossy, darker skin over the wet beds
  const sheen = new THREE.InstancedMesh(bedGeometry(false), new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.32, depthWrite: false }), MAX);
  sheen.count = 0; sheen.frustumCulled = false;
  // seeds: three little seeds pressed into the mound
  const seedGeo = mergeGeometries([-0.32, 0, 0.32].map((x, i) => new THREE.SphereGeometry(0.075, 6, 4).scale(1, 0.7, 1.25).translate(x, 0, (i - 1) * 0.08)));
  const seed = new THREE.InstancedMesh(seedGeo, new THREE.MeshStandardMaterial({ color: 0xe8cf8e, flatShading: true, roughness: 0.6 }), MAX);
  seed.count = 0; seed.frustumCulled = false;
  const crops = new THREE.Group(), marker = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 1.02, CELL * 1.02).rotateX(-Math.PI / 2).translate(0, 0.26, 0), new THREE.MeshBasicMaterial({ map: markerTexture(), transparent: true, depthWrite: false, color: 0xfff4c8 }));
  marker.visible = false; marker.renderOrder = 2;
  const bubbleGeo = new THREE.BufferGeometry(), bubbles = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({ map: bubbleTexture(), size: 1.8, transparent: true, alphaTest: 0.05, sizeAttenuation: true, depthWrite: false }));
  bubbleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); bubbleGeo.setDrawRange(0, 0); bubbles.frustumCulled = false;
  G.scene.add(soil, bed, sheen, seed, crops, marker, bubbles);
  const F = { soil, bed, sheen, crops, marker, bubbles, dirty: true, drawing: false };
  const home = () => G.world.lands.home, land = () => home().land;
  const groundY = (x, z) => land().ground(x, z);
  F.target = () => { const p = G.player; return { x: Math.round((p.pos.x + p.front.x * 1.7) / CELL) * CELL, z: Math.round((p.pos.z + p.front.z * 1.7) / CELL) * CELL }; };
  F.flat = (x, z) => land().rough(x, z, CELL * 0.5) <= FLAT;
  F.inGreenhouse = (x, z) => (G.s.placed || []).some((p) => { const c = CATALOG[p.type]; return c?.greenhouse && Math.abs(x - p.x) < c.greenhouse && Math.abs(z - p.z) < c.greenhouse; });
  /** can a plot go here? Only level ground: no slopes, no roads, nothing standing on it */
  F.why = (x, z) => {
    if (G.player.ground?.on !== "home") return "You can only farm on your own turtle";
    return F.whyAt(x, z);
  };
  /** the ground itself, wherever the farmer happens to be (a visitor's digging comes through here) */
  F.whyAt = (x, z) => {
    if (groundY(x, z) < 3.4) return "Too sandy to farm here";
    if (!F.flat(x, z)) return "Crops need flat ground";
    if (land().onRoad(x, z)) return "That's the road";
    if (G.nearSolid?.(x, z, 0.7)) return "Something's in the way";
    return null;
  };
  F.canTill = (x, z) => !F.why(x, z);

  async function drawCrops() {
    if (F.drawing) return;
    F.drawing = true; F.dirty = false;
    const groups = {}, m = new THREE.Matrix4(), B = bubbleGeo.attributes.position;
    let seeds = 0, ripeN = 0;
    const tops = [];                                          // [badge, the ripe plant it floats over]
    for (const [k, p] of Object.entries(G.s.plots)) {
      const [x, z] = spotOf(k), y = groundY(x, z) + 0.13, at = { x, z, y, ry: (x * 7 + z * 3) % 6 };
      const put = (path, size, dy = 0, wide = CELL * 0.9) => { const sp = { ...at, y: at.y + dy }; (groups[path + size + wide] ||= { path, size, wide, spots: [] }).spots.push(sp); return sp; };      // wide: it never spills past its plot
      if (p.weed) put(WEED, 0.5);
      if (!p.crop) continue;
      const c = CROPS[p.crop], stage = stageOf(p);
      const full = c.ripeSize * (c.tree ? 1.1 : 1.5), cut = p.cut && c.cut, roomy = c.tree ? CELL * 2.2 : CELL * 0.9;
      if (stage === 0 && !c.tree) seed.setMatrixAt(seeds++, m.makeRotationY(at.ry).setPosition(x, y + 0.06, z));
      else if (cut && stage < 4) put(c.cut, full * 0.8, 0, roomy);                       // picked: it stays standing and fruits again
      else if (stage < 4) put(c.grow[Math.max(0, stage - (c.tree ? 0 : 1))], full * [0.4, 0.5, 0.72, 0.92][stage], 0, roomy);
      else if (c.tree) { put(c.grow[3], Math.min(1, full * 1.2), 0, roomy); put(c.ripe, Math.min(0.55, c.ripeSize * 0.5), Math.min(1, full * 1.2) * 0.55, CELL * 0.4); }
      else {      // ripe: the grown plant, standing a little taller, with a piece of what it gives resting at its foot
        tops.push([ripeN, put(c.grow[3], full, 0, roomy)]);
        const side = ((x * 13 + z * 7) % 2 ? 1 : -1) * 0.5;
        (groups[c.ripe + "foot"] ||= { path: c.ripe, size: Math.min(0.42, c.ripeSize * 0.4), wide: CELL * 0.3, spots: [] }).spots.push({ ...at, x: x + side, z: z + 0.5, y: at.y - 0.02 });
      }
      if (c.fruit && stage === 4) put(c.fruit, 0.5, 3);
      if (stage === 4) { B.setXYZ(ripeN++, x, y + (c.tree ? Math.min(4.5, full) : Math.min(1.6, full * 0.75)) + 0.55, z); }
    }
    seed.count = seeds; seed.instanceMatrix.needsUpdate = true;
    bubbleGeo.setDrawRange(0, ripeN); B.needsUpdate = true;
    const made = new THREE.Group();
    await Promise.all(Object.values(groups).map(async (g) => {
      const mo = await loadModel(g.path);
      if (!mo) return;
      const box = new THREE.Box3().setFromObject(mo.scene).getSize(new THREE.Vector3()), h = box.y || 1, w = Math.max(box.x, box.z) || 1;
      for (const sp of g.spots) { sp.s = Math.min(g.size / h, g.wide / w); sp.top = sp.y + h * sp.s; }
      return forest(g.path, made, g.spots);
    }));
    for (const [i, sp] of tops) if (sp.top) B.setY(i, sp.top + 0.55);
    B.needsUpdate = true;
    crops.clear();
    crops.add(made);
    F.drawing = false;
  }

  // dry hoed earth is a warm light brown, fed earth richer, watered earth dark and glossy
  const EARTH = { dry: 0xb07a48, fed: 0x93613a, wet: 0x6a4329, wetFed: 0x573620 };
  F.draw = () => {
    const m = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
    let ns = 0, nb = 0, nw = 0;
    for (const [k, p] of Object.entries(G.s.plots)) {
      if (ns + nb >= MAX) break;
      const [x, z] = spotOf(k);
      at.set(x, groundY(x, z) + 0.02, z);
      m.compose(at, q, one);
      col.set(p.wet ? (p.fert ? EARTH.wetFed : EARTH.wet) : p.fert ? EARTH.fed : EARTH.dry);
      if (p.crop) { bed.setMatrixAt(nb, m); bed.setColorAt(nb++, col); } else { soil.setMatrixAt(ns, m); soil.setColorAt(ns++, col); }
      if (p.wet) { m.compose(at.setY(at.y + 0.012), q, one); sheen.setMatrixAt(nw++, m); }
    }
    soil.count = ns; bed.count = nb; sheen.count = nw;
    for (const o of [soil, bed, sheen]) { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
    F.dirty = true;
  };

  /** the plots a tool of this tier reaches, around the one in front of you */
  F.reach = (tool) => {
    const t = F.target(), area = TOOL_UP[tool]?.area?.[G.s.tools?.[tool] || 0] || 1, out = [];
    const w = Math.round(Math.sqrt(area)), o = Math.floor(w / 2);
    if (area === 3) { const side = Math.abs(G.player.front.x) > Math.abs(G.player.front.z) ? [0, 1] : [1, 0]; for (const i of [-1, 0, 1]) out.push({ x: t.x + i * side[0] * CELL, z: t.z + i * side[1] * CELL }); return out; }
    if (area === 5) { for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.push({ x: t.x + a * CELL, z: t.z + b * CELL }); return out; }
    for (let a = -o; a <= o; a++) for (let b = -o; b <= o; b++) out.push({ x: t.x + a * CELL, z: t.z + b * CELL });
    return out;
  };

  F.tick = (t) => {
    if (F.dirty && !F.drawing) drawCrops();
    bubbles.position.y = Math.sin(t * 2.4) * 0.12; bubbles.material.size = 1.8 + Math.sin(t * 4.8) * 0.09;
    const held = G.tool?.id, show = ["hoe", "can", "seeds"].includes(held) && !G.paused && !G.player?.riding && G.player?.ground?.on === "home";
    marker.visible = !!show;
    if (marker.visible) { const c = F.target(); marker.position.set(c.x, groundY(c.x, c.z) + 0.02, c.z); marker.material.color.set(G.s.plots[keyOf(c.x, c.z)] || F.canTill(c.x, c.z) ? 0xfff6d6 : 0xff8a6a); marker.material.opacity = 0.75 + Math.sin(t * 5) * 0.2; }
  };

  /** the turn of the day: what got water grows, weeds come up, and water dries */
  F.newDay = (rain, season) => {
    let grown = 0;
    for (const [k, p] of Object.entries(G.s.plots)) {
      const [x, z] = spotOf(k), under = F.inGreenhouse(x, z);
      if (p.crop) {
        const c = CROPS[p.crop];
        if ((p.wet || rain || under) && !p.weed) { p.age++; grown++; p.care = (p.care || 0) + 1; }
        if (!under && !c.seasons.includes(season) && p.age < c.days) { p.crop = null; p.age = 0; }     // out of season: it wilts, the plot stays
        if (!p.weed && Math.random() < 0.04) p.weed = true;
      } else if (!p.wet && Math.random() < 0.12) delete G.s.plots[k];                                   // left empty and dry: grass takes it back
      p.wet = !!rain || under;
    }
    const spray = rain ? [] : G.water ? G.water.sprinklers() : (G.s.placed || []).filter((p) => CATALOG[p.type]?.sprinkle);      // each draws its water from the tower's barrel
    for (const sp of spray) { const r = CATALOG[sp.type].sprinkle; for (const [k, p] of Object.entries(G.s.plots)) { const [x, z] = spotOf(k); if (Math.abs(x - sp.x) <= r && Math.abs(z - sp.z) <= r) p.wet = true; } }
    F.draw();
    return grown;
  };
  return F;
}
export { ISLANDS };
