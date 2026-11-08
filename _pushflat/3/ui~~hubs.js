// hubs.js - the official rooms from Socialize > Official: Central Park, Cafe, Library (with study rooms), Museum, Arcade, Beach Resort and the Community Stalls.
// Their furniture is hubOnly, so it never shows in Edit room. Every seat has def.seat (room.js sits it on it); everything else has an act or an info line for when it's clicked.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CATALOG } from "./cozyroom.js";
import { OFFICIAL_HUBS } from "./hubinfo.js";
import { dressHub } from "./hubdecor.js";
import { MAIN_CATALOG, mainHub } from "./mainhub.js";
import { PARK_CATALOG, centralPark as parkLand } from "./parkhub.js";
import { PLACES_CATALOG, furnishPark } from "./parkplaces.js";
import { STALL_CATALOG } from "./stallhall.js";
import { BEACH_CATALOG, beachTick, resetBeach } from "./beachhub.js";
import { MUSEUM_CATALOG, museumTick, resetMuseum, museumLayout } from "./museumhub.js";
const parkHub = () => furnishPark(parkLand());

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const glow = (color, i = 1.4) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.5 });
const add = (g, geo, m, x = 0, y = 0, z = 0, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
const bx = (g, w, h, d, m, x = 0, y = 0, z = 0, ry = 0) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y, z, ry);
const cy = (g, r0, r1, h, m, x = 0, y = 0, z = 0, n = 16) => add(g, new THREE.CylinderGeometry(r0, r1, h, n), m, x, y, z);
const flat = (g, geo, m, y = 0.012) => { const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.position.y = y; o.receiveShadow = true; g.add(o); return o; };
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

function canvasMap(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const textMap = (text, bg, fg, w = 512, h = 128, size = 62) => canvasMap(w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  let px = size; do { g.font = `800 ${px}px Nunito, sans-serif`; px -= 2; } while (g.measureText(text).width > w - 24 && px > 16);
  g.fillText(text, w / 2, h / 2 + 3);
});

/** A big painting: flowers or colour fields, different for each number. */
function paintingMap(n) {
  const r = seeded(n * 991 + 7), hues = [8, 28, 48, 150, 200, 280, 330];
  return canvasMap(512, 512, (g, w, h) => {
    const hue = () => hues[Math.floor(r() * hues.length)];
    g.fillStyle = `hsl(${hue()},60%,${70 + r() * 15}%)`; g.fillRect(0, 0, w, h);
    if (n % 2) for (let i = 0; i < 16; i++) {          // flowers
      const x = r() * w, y = r() * h, s = 30 + r() * 60, c = hue();
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; g.fillStyle = `hsl(${c},78%,${50 + r() * 20}%)`; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, s * 0.55, s * 0.32, a, 0, 7); g.fill(); }
      g.fillStyle = "#f6cf4f"; g.beginPath(); g.arc(x, y, s * 0.3, 0, 7); g.fill();
    } else for (let i = 0; i < 22; i++) {              // colour fields
      g.fillStyle = `hsla(${hue()},72%,${38 + r() * 34}%,.82)`; g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 3);
      g.fillRect(-90 - r() * 120, -24 - r() * 70, 180 + r() * 180, 48 + r() * 130); g.restore();
    }
  });
}

/** Hub furniture. seat = how it sits on it (like FURNITURE in room.js), walkable = you can click through it to walk. */
const P = (label, make, extra = {}) => ({ label, mount: "floor", hubOnly: true, category: "hub", ...extra,
  build(ctx) { const group = new THREE.Group(); const ex = make(group, ctx.spec, ctx) || {}; if (extra.bake !== false) bake(group); return { group, walkable: extra.flat && extra.walk, ...ex }; } });

/** One mesh per material instead of one per box: the big hubs have hundreds of chairs, shelves and machines, and each would otherwise be many draws. */
const KEEP = new Set(["position", "normal", "uv"]);
function bake(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.children.length || Array.isArray(o.material) || o.userData.keep) return;
    const k = o.material.uuid + (o.castShadow ? ":s" : "");
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const n of Object.keys(g.attributes)) if (!KEEP.has(n)) g.deleteAttribute(n);
      return g;
    });
    if (geos.some((g) => !g.attributes.uv || !g.attributes.normal)) { geos.forEach((g) => g.dispose()); continue; }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = true;
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
    group.add(m);
  }
}
const stone = mat(0xb9b2a6), dark = mat(0x22201e), wood = mat(0x9a6a3c), lightWood = mat(0xd1ad7c), darkWood = mat(0x4f301c), white = mat(0xf2f0ea);
const leather = mat(0x5a3220, { roughness: 0.5 }), greyCloth = mat(0x8b8d8d, { roughness: 1 }), brass = mat(0xb08a45, { metalness: 0.6, roughness: 0.35 });

function chair(g, m) {
  bx(g, 0.44, 0.05, 0.44, m, 0, 0.45, 0);
  bx(g, 0.44, 0.45, 0.04, m, 0, 0.7, -0.2);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) bx(g, 0.04, 0.44, 0.04, m, x, 0.22, z);
}
function tableTop(g, w, d, h, m) {
  bx(g, w, 0.05, d, m, 0, h, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(g, 0.06, h, 0.06, m, (x * w) / 2.3, h / 2, (z * d) / 2.3);
}
const PASTRY = mat(0xc58c4a); PASTRY.userData.shared = true;
const BOOK_MATS = [0xb8473a, 0x34577d, 0x4d7a56, 0xc99a4b, 0x6d4a7a, 0xd8cfbc, 0x3a3a3f, 0xa8683a].map((c) => { const m = mat(c); m.userData.shared = true; return m; });
const candle = (g, x, y, z) => { cy(g, 0.03, 0.03, 0.1, mat(0xf4ead2), x, y + 0.05, z, 8); cy(g, 0.012, 0.012, 0.03, glow(0xffb45a, 3), x, y + 0.12, z, 6); };

export const HUB_CATALOG = {
  // ground, for the outdoor hubs
  hubGround: P("Ground", (g, s) => {
    const m = flat(g, new THREE.PlaneGeometry(s.size || 400, s.size || 400), mat(s.tone || 0x4f7f2f, { roughness: 1 }), -0.03);
    m.castShadow = false;
  }, { flat: true, walk: true }),
  // ---------- Central Park ----------
  hubLawn: P("Lawn", (g, s) => {
    const R = s.r || 5;
    const grass = canvasMap(512, 512, (c, w, h) => { c.fillStyle = "#4f8a33"; c.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { c.fillStyle = `hsl(${88 + Math.random() * 26},52%,${24 + Math.random() * 20}%)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 6); } });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(3, 3);
    flat(g, new THREE.CircleGeometry(R, 56), mat(0xffffff, { map: grass, roughness: 1 }), 0.02);
    flat(g, new THREE.RingGeometry(R, R + 0.25, 56), stone, 0.03);
    flat(g, new THREE.RingGeometry(R + 0.25, R + 1.15, 56), mat(0x4c8fa6, { roughness: 0.12, metalness: 0.35 }), 0.015);
    flat(g, new THREE.RingGeometry(R + 1.15, R + 1.4, 56), stone, 0.03);
    for (let k = 0; k < 4; k++) {                      // little bridges over the water
      const a = (k * Math.PI) / 2 + Math.PI / 4, m = R + 0.7;
      bx(g, 1.3, 0.05, 1.5, lightWood, Math.sin(a) * m, 0.04, Math.cos(a) * m, a);
    }
  }, { flat: true, walk: true }),
  hubTree: P("Young tree", (g, s) => {
    const r = seeded((s.n || 1) * 311);
    flat(g, new THREE.CircleGeometry(0.9, 24), mat(0xd9c39a, { roughness: 1 }), 0.025);
    flat(g, new THREE.RingGeometry(0.9, 1, 24), stone, 0.03);
    cy(g, 0.07, 0.11, 2.1, mat(0x5e4630), 0, 1.05, 0, 8);
    for (let i = 0; i < 5; i++) add(g, new THREE.IcosahedronGeometry(0.5 + r() * 0.35, 1), mat(new THREE.Color().setHSL(0.27 + r() * 0.06, 0.45, 0.32 + r() * 0.1), { flatShading: true }), (r() - 0.5) * 1, 2.3 + r() * 0.9, (r() - 0.5) * 1);
  }, { info: "A young tree in its sand bed." }),
  hubBench: P("Park bench", (g) => {
    for (const x of [-0.7, 0.7]) bx(g, 0.3, 0.38, 0.5, stone, x, 0.19, 0);
    for (let i = 0; i < 5; i++) bx(g, 1.9, 0.045, 0.08, wood, 0, 0.41, -0.2 + i * 0.1);
  }, { seat: { clip: "sit", seat: 0.43, at: [0, 0.03] } }),
  hubPlanter: P("Planter", (g) => {
    bx(g, 1.5, 0.5, 0.7, mat(0x9d978c), 0, 0.25, 0);
    const blade = mat(0x7d9a4a, { side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) { const c = add(g, new THREE.ConeGeometry(0.03, 0.7 + Math.random() * 0.5, 4), blade, (Math.random() - 0.5) * 1.3, 0.8, (Math.random() - 0.5) * 0.5); c.rotation.z = (Math.random() - 0.5) * 0.4; }
  }, { info: "Tall grasses, swaying a little." }),
  hubBollard: P("Bollard", (g) => { cy(g, 0.07, 0.07, 0.7, dark, 0, 0.35, 0, 10); cy(g, 0.075, 0.075, 0.08, glow(0xffe0a8, 1.2), 0, 0.66, 0, 10); }, { info: "A little light for the evening walk." }),

  // ---------- Cafe ----------
  hubCafeChair: P("Wooden chair", (g) => chair(g, wood), { seat: { clip: "sit", seat: 0.48, at: [0, 0.02] } }),
  hubLightChair: P("Library chair", (g) => chair(g, lightWood), { seat: { clip: "sit", seat: 0.48, at: [0, 0.02] } }),
  hubCafeTable: P("Cafe table", (g) => { tableTop(g, 0.9, 0.9, 0.74, wood); }),
  hubRoundTable: P("Round table", (g) => {
    cy(g, 0.55, 0.55, 0.04, darkWood, 0, 0.46, 0, 24); cy(g, 0.05, 0.08, 0.44, darkWood, 0, 0.22, 0, 10);
    candle(g, -0.15, 0.48, 0.05); candle(g, 0.1, 0.48, -0.12); candle(g, 0.14, 0.48, 0.14);
  }, { info: "A low table with three candles. Good for long talks." }),
  hubArmchair: P("Leather armchair", (g) => {
    bx(g, 0.8, 0.28, 0.75, leather, 0, 0.3, 0); bx(g, 0.8, 0.6, 0.15, leather, 0, 0.6, -0.33);
    for (const x of [-0.36, 0.36]) bx(g, 0.1, 0.42, 0.72, leather, x, 0.42, 0);
  }, { seat: { clip: "sit", seat: 0.45, at: [0, 0.06] } }),
  hubCafeSofa: P("Brown sofa", (g) => {
    const m = mat(0x6d452b, { roughness: 0.9 });
    bx(g, 2, 0.28, 0.8, m, 0, 0.3, 0); bx(g, 2, 0.62, 0.16, m, 0, 0.62, -0.34);
    for (const x of [-0.95, 0.95]) bx(g, 0.14, 0.44, 0.8, m, x, 0.42, 0);
    for (const [x, c] of [[-0.6, 0xc99a4b], [0.6, 0x7f8f6a]]) bx(g, 0.42, 0.38, 0.12, mat(c, { roughness: 1 }), x, 0.62, -0.2).rotation.x = -0.2;
  }, { seat: { clip: "lounge", seat: 0.45, at: [0.45, 0.12] } }),
  hubCounter: P("Counter", (g, s) => {
    const w = s.w || 6;
    bx(g, w, 1.05, 0.65, darkWood, 0, 0.525, 0); bx(g, w + 0.1, 0.05, 0.75, wood, 0, 1.075, 0);
    const m = mat(0xc8ccd0, { metalness: 0.8, roughness: 0.25 });                 // the espresso machine
    bx(g, 0.75, 0.42, 0.42, m, -w / 4, 1.31, 0); bx(g, 0.55, 0.12, 0.3, dark, -w / 4, 1.2, 0.18);
    for (const x of [-0.14, 0.14]) cy(g, 0.03, 0.03, 0.09, dark, -w / 4 + x, 1.16, 0.2, 8);
    for (let i = 0; i < 5; i++) cy(g, 0.05, 0.04, 0.08, white, w / 8 + i * 0.16, 1.14, 0.1, 10);
    cy(g, 0.26, 0.26, 0.08, wood, w / 4 + 0.6, 1.14, 0, 18);                       // a tray of pastries
    for (let i = 0; i < 5; i++) add(g, new THREE.SphereGeometry(0.07, 8, 6), PASTRY, w / 4 + 0.6 + Math.cos(i * 1.26) * 0.15, 1.21, Math.sin(i * 1.26) * 0.15);
  }, { act: "order", info: "The counter. Sol makes a very good flat white." }),
  hubChalkboard: P("Chalkboard menu", (g, s) => {
    const lines = (s.text || "Coffee  Latte  Mocha  Tea").split("  ");
    const map = canvasMap(512, 340, (c, w, h) => {
      c.fillStyle = "#23262a"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#f4eddc"; c.textAlign = "center"; c.font = "800 44px Nunito, sans-serif";
      lines.forEach((t, i) => c.fillText(t, w / 2, 70 + (i * (h - 90)) / lines.length));
    });
    bx(g, 1.5, 1, 0.05, [mat(0x5d3b22), mat(0x5d3b22), mat(0x5d3b22), mat(0x5d3b22), mat(0xffffff, { map }), mat(0x5d3b22)], 0, 2.15, 0);
  }, { info: "Today's menu, in careful chalk handwriting." }),
  hubJarShelf: P("Jar shelf", (g) => {
    for (const y of [1.15, 1.6, 2.05]) {
      bx(g, 2, 0.05, 0.25, wood, 0, y, 0);
      for (let i = 0; i < 7; i++) cy(g, 0.075, 0.075, 0.22, mat(0xd9e6e0, { transparent: true, opacity: 0.55, roughness: 0.2 }), -0.82 + i * 0.27, y + 0.135, 0, 10);
      for (let i = 0; i < 7; i++) cy(g, 0.06, 0.06, 0.13, mat([0x5b3518, 0xbc8a4f, 0x8f4d2c, 0xd9b77e][i % 4]), -0.82 + i * 0.27, y + 0.09, 0, 8);
    }
  }, { info: "Beans, sugar and biscotti in glass jars." }),
  hubBeam: P("Ceiling beam", (g, s) => { bx(g, s.w || 14, 0.2, 0.26, darkWood, 0, 0, 0); }, { defaultY: 3.05, flat: true }),
  hubPendant: P("Rattan lamp", (g, s) => {
    const cord = s.cord ?? 0.9;                                      // up to the ceiling, however high it is
    cy(g, 0.008, 0.008, cord, dark, 0, cord / 2, 0, 5);
    if (cord > 1.2) cy(g, 0.07, 0.05, 0.05, dark, 0, cord - 0.025, 0, 10);
    const shade = mat(0xb08a56, { roughness: 1, wireframe: false });
    add(g, new THREE.SphereGeometry(0.26, 12, 7, 0, 6.3, 0, 1.9), shade, 0, 0, 0);
    add(g, new THREE.SphereGeometry(0.1, 10, 8), glow(0xffd28f, 2.4), 0, -0.05, 0);
    if (s.lit) { const l = new THREE.PointLight(0xffc27e, 7, 7, 1.8); l.position.y = -0.2; g.add(l); }
  }, { defaultY: 2.2, flat: true }),
  hubRug: P("Rug", (g, s) => {
    const map = canvasMap(256, 256, (c, w, h) => {
      c.fillStyle = s.c1 || "#8d3b2f"; c.fillRect(0, 0, w, h); c.strokeStyle = s.c2 || "#d9b77e"; c.lineWidth = 7;
      for (let i = 1; i < 5; i++) c.strokeRect(i * 12, i * 12, w - i * 24, h - i * 24);
    });
    const long = (s.d || 2) / (s.w || 3);
    if (long > 2.5) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, Math.round(long)); }   // a runner: panel after panel, not one stretched rug
    flat(g, new THREE.PlaneGeometry(s.w || 3, s.d || 2), mat(0xffffff, { map, roughness: 1 }), 0.02);
  }, { flat: true, walk: true }),

  // ---------- Library ----------
  hubGlassWall: P("Glass wall", (g, s) => {
    const L = s.len || 24;
    const map = canvasMap(1024, 128, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#bcd7ea"); sky.addColorStop(0.68, "#e8f0ea"); sky.addColorStop(0.7, "#8aa574"); sky.addColorStop(1, "#6d8a5c");
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { c.fillStyle = `hsl(${100 + Math.random() * 30},38%,${28 + Math.random() * 16}%)`; c.beginPath(); c.arc(Math.random() * w, 84 + Math.random() * 10, 10 + Math.random() * 15, 0, 7); c.fill(); }
    });
    const H = s.h || 3.2;
    add(g, new THREE.PlaneGeometry(L, H), new THREE.MeshBasicMaterial({ map, toneMapped: false }), 0, H / 2, -0.02).castShadow = false;
    for (let x = -L / 2; x <= L / 2 + 0.01; x += 2) bx(g, 0.06, H, 0.08, dark, x, H / 2, 0);
    for (let y = 2.6; y < H - 0.3; y += 1.8) bx(g, L, 0.06, 0.08, dark, 0, y, 0);
  }, { info: "The whole wall is glass: you can see the trees." }),
  hubSlats: P("Slat ceiling", (g, s) => {
    const w = s.w || 12, d = s.d || 24;
    for (let x = -w / 2; x < w / 2; x += 0.3) bx(g, 0.14, 0.12, d, lightWood, x + 0.15, 0, 0).castShadow = false;
    for (const x of [-w / 4, w / 4]) bx(g, 0.1, 0.03, d - 2, glow(0xfff4dc, 2), x, -0.07, 0).castShadow = false;
  }, { defaultY: 3.05, flat: true }),
  hubLongTable: P("Long table", (g) => {
    tableTop(g, 1.1, 4.2, 0.74, lightWood);
    for (const z of [-1.4, 0, 1.4]) {                 // mushroom lamps
      cy(g, 0.03, 0.05, 0.26, dark, 0, 0.9, z, 10);
      add(g, new THREE.SphereGeometry(0.14, 14, 8, 0, 6.3, 0, 1.6), glow(0xfff0cf, 1.4), 0, 1.03, z);
    }
  }, { act: "read", info: "A quiet table to read at." }),
  hubBookcase: P("Bookcase", (g, s) => {
    const r = seeded((s.n || 1) * 197), W = 2, T = 2.9;
    bx(g, W, T, 0.08, lightWood, 0, T / 2, -0.17);
    for (const x of [-W / 2, W / 2]) bx(g, 0.06, T, 0.42, lightWood, x, T / 2, 0);
    for (let y = 0.1; y < T - 0.3; y += 0.46) {
      bx(g, W, 0.04, 0.4, lightWood, 0, y, 0);
      for (let x = -W / 2 + 0.08; x < W / 2 - 0.1;) {
        const w = 0.04 + r() * 0.05, h = 0.26 + r() * 0.12;
        bx(g, w, h, 0.26, BOOK_MATS[Math.floor(r() * BOOK_MATS.length)], x + w / 2, y + 0.02 + h / 2, -0.02).castShadow = false;
        x += w + 0.006;
      }
    }
  }, { act: "read", info: "Rows and rows of books." }),
  hubColumn: P("Column", (g, s) => {
    const h = s.h || 3.2, m = mat(0x9f9b94);
    bx(g, 0.5, h, 0.5, m, 0, h / 2, 0);
    if (h > 3.4) { bx(g, 0.66, 0.12, 0.66, m, 0, 0.06, 0); bx(g, 0.7, 0.16, 0.7, m, 0, h - 0.08, 0); bx(g, 0.58, 0.08, 0.58, m, 0, h - 0.2, 0); }
  }, { info: "Smooth concrete." }),
  hubStudyDoor: P("Study room door", (g, s) => {
    bx(g, 1.3, 2.4, 0.1, darkWood, 0, 1.2, 0); bx(g, 1.05, 2.25, 0.06, wood, 0, 1.13, 0.05);
    bx(g, 0.8, 0.6, 0.02, mat(0xbcd7ea, { roughness: 0.15 }), 0, 1.6, 0.09);
    cy(g, 0.03, 0.03, 0.14, brass, 0.38, 1.05, 0.11, 8).rotation.x = Math.PI / 2;
    const map = textMap(`Study room ${s.n || 1}`, "#1c1a18", "#f4eddc");
    add(g, new THREE.PlaneGeometry(1.1, 0.27), new THREE.MeshBasicMaterial({ map }), 0, 2.58, 0.06).castShadow = false;
  }, { act: "studyRoom" }),
  hubStudyDesk: P("Study desk", (g) => {
    tableTop(g, 1.6, 0.8, 0.74, lightWood);
    cy(g, 0.03, 0.05, 0.26, dark, 0.55, 0.9, -0.2, 10);
    add(g, new THREE.SphereGeometry(0.14, 14, 8, 0, 6.3, 0, 1.6), glow(0xfff0cf, 1.4), 0.55, 1.03, -0.2);
    bx(g, 0.4, 0.04, 0.28, mat(0x34577d), -0.25, 0.79, 0.05);
  }, { act: "study" }),

  // ---------- Museum ----------
  hubPainting: P("Painting", (g, s) => {
    const w = s.w || 3, h = s.h || 2.1;
    bx(g, w + 0.08, h + 0.08, 0.16, dark, 0, 0, -0.08);
    add(g, new THREE.PlaneGeometry(w, h), mat(0xffffff, { map: paintingMap(s.n || 1), roughness: 0.9 }), 0, 0, 0.005).castShadow = false;
  }, { defaultY: 1.6, flat: true, act: "exhibit", info: "A big painting. Nobody agrees what it means." }),
  hubDisplayWall: P("Display wall", (g, s) => {
    bx(g, 4.4, 2.8, 0.3, white, 0, 1.4, 0);
    for (const [z, ry, n] of [[0.156, 0, s.n || 5], [-0.156, Math.PI, (s.n || 5) + 1]]) {
      const m = mat(0xffffff, { map: paintingMap(n) });
      add(g, new THREE.PlaneGeometry(2.8, 1.9), m, 0, 1.55, z, ry).castShadow = false;
    }
  }, { act: "exhibit", info: "A freestanding wall, with a painting on each side." }),
  hubPlinth: P("Sculpture", (g, s) => {
    bx(g, 0.62, 1.15, 0.62, white, 0, 0.575, 0);
    const r = seeded((s.n || 1) * 53), m = mat(0xa8743f, { roughness: 0.6 });
    let y = 1.2;
    for (let i = 0; i < 4; i++) { const h = 0.14 + r() * 0.2, q = 0.08 + r() * 0.13; add(g, new THREE.TorusKnotGeometry(q, q * 0.32, 40, 8), m, (r() - 0.5) * 0.1, y + h, 0, r() * 3); y += h * 1.5; }
  }, { act: "exhibit", info: "Carved from a single piece of wood." }),
  hubRail: P("Track lights", (g, s) => {
    const w = s.w || 14;
    bx(g, w, 0.05, 0.05, dark, 0, 0, 0);
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) cy(g, 0.008, 0.008, 0.5, dark, x, 0.25, 0, 5);
    for (let x = -w / 2 + 1; x < w / 2; x += 2) { cy(g, 0.04, 0.05, 0.14, dark, x, -0.1, 0, 8); cy(g, 0.04, 0.04, 0.01, glow(0xfff4e0, 2.6), x, -0.17, 0, 8); }
  }, { defaultY: 2.75, flat: true }),
  hubClerestory: P("High window", (g, s) => {
    const w = s.w || 16;
    add(g, new THREE.PlaneGeometry(w, 0.55), new THREE.MeshBasicMaterial({ color: 0xdfeaf2, toneMapped: false }), 0, 0, 0).castShadow = false;
    for (let x = -w / 2; x <= w / 2; x += 2) bx(g, 0.05, 0.55, 0.04, dark, x, 0, 0.01);
  }, { defaultY: 2.85, flat: true }),
  hubGalleryBench: P("Gallery bench", (g) => {
    bx(g, 1.8, 0.1, 0.5, lightWood, 0, 0.42, 0);
    for (const x of [-0.8, 0.8]) bx(g, 0.08, 0.38, 0.45, dark, x, 0.19, 0);
  }, { seat: { clip: "sit", seat: 0.47, at: [0, 0.03] } }),

  // ---------- Arcade ----------
  hubCabinet: P("Arcade machine", (g, s) => {
    const colors = [0xff3d81, 0x38d6ff, 0xffd23f, 0x9d5cff, 0x4dff9a], c = colors[(s.n || 0) % colors.length];
    const body = mat(0x1a1626);
    bx(g, 0.8, 1.85, 0.75, body, 0, 0.925, 0);
    const screen = bx(g, 0.62, 0.48, 0.02, glow(c, 1.6), 0, 1.3, 0.38); screen.rotation.x = -0.15; screen.castShadow = false;
    bx(g, 0.8, 0.24, 0.8, glow(c, 0.9), 0, 1.97, 0.02);
    bx(g, 0.72, 0.09, 0.3, mat(0x2d2840), 0, 0.98, 0.48);
    cy(g, 0.012, 0.012, 0.1, dark, -0.18, 1.07, 0.48, 6);
    add(g, new THREE.SphereGeometry(0.035, 8, 6), mat(0xff3a3a), -0.18, 1.13, 0.48);
    for (const x of [0.05, 0.17, 0.29]) cy(g, 0.03, 0.03, 0.02, glow(colors[(s.n + 1) % 5 || 0], 0.9), x, 1.03, 0.48, 10);
  }, { act: "games" }),
  hubStool: P("Stool", (g, s) => {
    cy(g, 0.2, 0.2, 0.08, mat(s.tone || 0xff3d81, { roughness: 0.5 }), 0, 0.5, 0, 16);
    cy(g, 0.03, 0.03, 0.46, dark, 0, 0.23, 0, 8); cy(g, 0.16, 0.18, 0.03, dark, 0, 0.015, 0, 14);
  }, { seat: { clip: "sit", seat: 0.54, at: [0, 0] } }),
  hubNeon: P("Neon strip", (g, s) => { bx(g, s.w || 4, 0.05, 0.05, glow(s.tone || 0x38d6ff, 2.8), 0, 0, 0).castShadow = false; }, { defaultY: 2.75, flat: true }),

  // ---------- Beach Resort ----------
  hubSea: P("Sea", (g) => {
    const m = flat(g, new THREE.PlaneGeometry(2400, 1000), new THREE.MeshBasicMaterial({ color: 0x7f93ad }), 0.005); m.position.z = -506;
    const glint = flat(g, new THREE.PlaneGeometry(16, 600), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.3, depthWrite: false }), 0.01); glint.position.z = -310;
  }, { flat: true, info: "The sea, going gold." }),
  hubDeck: P("Wooden deck", (g, s) => {
    const w = s.w || 18, d = s.d || 13;
    const map = canvasMap(512, 512, (c, cw, ch) => {
      for (let i = 0; i < 12; i++) { c.fillStyle = `hsl(32,${14 + Math.random() * 7}%,${44 + Math.random() * 9}%)`; c.fillRect(0, (i * ch) / 12, cw, ch / 12); c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, (i * ch) / 12, cw, 3); }
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(w / 4, d / 3);
    flat(g, new THREE.PlaneGeometry(w, d), mat(0xffffff, { map, roughness: 0.75 }), 0.025);
  }, { flat: true, walk: true }),
  hubPier: P("Pier", (g, s) => {
    const L = s.len || 20, w = s.w || 3.4, pw = s.pw || 8, pd = s.pd || 6;
    const map = canvasMap(256, 512, (c, cw, ch) => {
      for (let i = 0; i < 16; i++) { c.fillStyle = `hsl(30,${16 + Math.random() * 8}%,${40 + Math.random() * 10}%)`; c.fillRect(0, (i * ch) / 16, cw, ch / 16); c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(0, (i * ch) / 16, cw, 3); }
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, L / 4);
    const deckMat = mat(0xffffff, { map, roughness: 0.8 }), post = mat(0x5a4632), rail = mat(0x7a5f43);
    flat(g, new THREE.PlaneGeometry(w, L), deckMat, 0.06).position.z = -L / 2;
    const pm = map.clone(); pm.repeat.set(pw / 3, pd / 4); pm.needsUpdate = true;
    flat(g, new THREE.PlaneGeometry(pw, pd), mat(0xffffff, { map: pm, roughness: 0.8 }), 0.06).position.z = -L - pd / 2;
    bx(g, w, 0.14, L, mat(0x6b5440), 0, -0.03, -L / 2).castShadow = false;
    bx(g, pw, 0.14, pd, mat(0x6b5440), 0, -0.03, -L - pd / 2).castShadow = false;
    const edge = (x0, z0, x1, z1) => {                  // a rail on posts, from one corner to the next
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5)), a = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= n; i++) { const t = i / n; cy(g, 0.07, 0.07, 2.2, post, x0 + (x1 - x0) * t, -0.2, z0 + (z1 - z0) * t, 8); }
      bx(g, 0.07, 0.07, len, rail, (x0 + x1) / 2, 0.9, (z0 + z1) / 2, a);
      bx(g, 0.05, 0.05, len, rail, (x0 + x1) / 2, 0.5, (z0 + z1) / 2, a);
    };
    for (const sx of [-1, 1]) {
      edge(sx * w / 2, -0.6, sx * w / 2, -L);
      edge(sx * w / 2, -L, sx * pw / 2, -L);
      edge(sx * pw / 2, -L, sx * pw / 2, -L - pd);
    }
    edge(-pw / 2, -L - pd, pw / 2, -L - pd);
  }, { flat: true, walk: true, info: "The pier. Walk out to the end and watch the sun go down." }),
  hubDune: P("Dune", (g, s) => {
    const r = seeded((s.n || 1) * 71);
    const d = add(g, new THREE.SphereGeometry(1, 24, 12, 0, 6.3, 0, 1.57), mat(0xd9bd8e, { roughness: 1 }), 0, 0, 0); d.scale.set(3.4, 0.9, 2.2);
    const blade = mat(0x8c9a55, { side: THREE.DoubleSide });
    for (let i = 0; i < 38; i++) { const a = r() * 6.3, q = r() * 0.9; const b = add(g, new THREE.ConeGeometry(0.03, 0.5 + r() * 0.4, 4), blade, Math.cos(a) * q * 3, 0.6 * (1 - q * q * 0.6) + 0.2, Math.sin(a) * q * 2); b.rotation.z = (r() - 0.5) * 0.5; }
  }, { info: "Sand and tough grass." }),
  hubModSofa: P("Outdoor sofa", (g) => {
    bx(g, 2, 0.1, 0.9, dark, 0, 0.14, 0);
    bx(g, 2, 0.5, 0.08, dark, 0, 0.42, -0.42); for (const x of [-0.97, 0.97]) bx(g, 0.07, 0.38, 0.9, dark, x, 0.34, 0);
    bx(g, 1.84, 0.2, 0.76, greyCloth, 0, 0.3, 0.02);
    for (const x of [-0.46, 0.46]) bx(g, 0.86, 0.42, 0.16, greyCloth, x, 0.6, -0.3).rotation.x = -0.14;
  }, { seat: { clip: "lounge", seat: 0.4, at: [0.45, 0.1] } }),
  hubLowTable: P("Low table", (g) => {
    bx(g, 1.2, 0.08, 0.7, dark, 0, 0.32, 0); bx(g, 0.9, 0.28, 0.45, mat(0x33302d), 0, 0.14, 0);
    candle(g, -0.25, 0.36, 0); candle(g, 0.05, 0.36, 0.1); candle(g, 0.28, 0.36, -0.08);
  }, { info: "Candles, somehow never blown out." }),
  hubHourglass: P("Hourglass stool", (g) => {
    const m = mat(0x2d2a28, { roughness: 0.65 });
    cy(g, 0.21, 0.08, 0.23, m, 0, 0.345, 0, 16); cy(g, 0.08, 0.21, 0.23, m, 0, 0.115, 0, 16);
  }, { seat: { clip: "sit", seat: 0.46, at: [0, 0] } }),
  hubLantern: P("Lantern", (g) => {
    const m = mat(0x2d2a28);
    bx(g, 0.3, 0.03, 0.3, m, 0, 0.02, 0); bx(g, 0.34, 0.03, 0.34, m, 0, 0.72, 0);
    for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) bx(g, 0.02, 0.7, 0.02, m, x, 0.37, z);
    cy(g, 0.05, 0.05, 0.22, glow(0xffc47a, 2.6), 0, 0.15, 0, 10).castShadow = false;
  }, { info: "A warm little lantern." }),
  hubLounger: P("Sun lounger", (g) => {
    bx(g, 0.7, 0.05, 1.5, dark, 0, 0.22, 0.2);
    for (const x of [-0.3, 0.3]) for (const z of [-0.45, 0.85]) bx(g, 0.05, 0.2, 0.05, dark, x, 0.1, z);
    bx(g, 0.66, 0.1, 1.45, mat(0xe4dccb, { roughness: 1 }), 0, 0.29, 0.2);
    const back = bx(g, 0.66, 0.1, 0.8, mat(0xe4dccb, { roughness: 1 }), 0, 0.52, -0.82); back.rotation.x = 0.7;
  }, { seat: { clip: "lounge", seat: 0.33, at: [0, 0.2] } }),
  hubPavilion: P("Glass pavilion", (g) => {
    const glass = mat(0xb9cfd6, { transparent: true, opacity: 0.35, roughness: 0.08, metalness: 0.3, side: THREE.DoubleSide });
    bx(g, 7.5, 0.12, 5.5, dark, 0, 3.1, 0.6);                               // the flat roof reaches out over the deck
    bx(g, 5.4, 3, 0.06, glass, 0, 1.55, -1.2).castShadow = false;
    for (const x of [-2.7, 2.7]) bx(g, 0.06, 3, 2.4, glass, x, 1.55, 0).castShadow = false;
    bx(g, 5.4, 3, 0.06, glass, 0, 1.55, 1.2).castShadow = false;
    for (const [x, z] of [[-2.7, -1.2], [2.7, -1.2], [-2.7, 1.2], [2.7, 1.2]]) bx(g, 0.08, 3, 0.08, dark, x, 1.55, z);
    bx(g, 5.4, 0.1, 2.4, mat(0x8b7a68), 0, 0.06, 0);
    bx(g, 2.2, 0.95, 0.5, mat(0xe7dfcf), 0, 0.48, -0.6);                    // the bar inside
    const l = new THREE.PointLight(0xffd3a0, 8, 8, 1.8); l.position.set(0, 2.5, 0); g.add(l);
  }, { act: "order", info: "The bar. Cold drinks and a view." }),

  // ---------- Community Stalls ----------
  // the stalls and their hall are drawn in stallhall.js
};
Object.assign(CATALOG, HUB_CATALOG);

// ---------- what you can put in a stall ----------
// plus goods from the general asset pack, a few of each kind
const PACK_GOODS = [/house_plants_set/, /baked_goods/, /crystal_pack/, /fantasy_props_megakit\/(Barrel_Apples|FarmCrate_|Book_Stack|Vase)/, /household_props_001\/(Globe|Telescope|Trophy|Rubber_Duck|Piggy_Bank|Present|Doll)/, /low_poly_outdoor.*\/Statue/, /christmas_kit\/(Gifts|Stars|Bells)/];
export const STALL_GOODS = [
  ...["plant", "bigPlant", "leafPlant", "floorLamp", "bookshelf", "radio", "beanBag", "chair", "woodChair", "coffeeTable", "basket", "candle", "moonLamp"].filter((t) => CATALOG[t]),
  ...PACK_GOODS.flatMap((rx) => Object.keys(CATALOG).filter((t) => CATALOG[t].pack && rx.test(CATALOG[t].file)).slice(0, 6)),
].map((type) => ({ type, label: CATALOG[type].label }));
const STALL_SLOTS = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.2], [0.8, 0.2]];
export const STALL_SLOT_COUNT = STALL_SLOTS.length;

// ---------- the hubs ----------
// Each one is sized for about a hundred people: a seat or a spot for everyone, wide aisles, and corners of its own.
const faceTo = (x, z, cx, cz) => Math.atan2(cx - x, cz - z);
const ringOf = (n, r, cx, cz, off = 0) => Array.from({ length: n }, (_, i) => { const a = off + (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; });
/** sky stops: [[0..1, colour], ...] top to bottom, as the picture behind an outdoor hub. */
export function skyPicture(stops, sun) {
  const t = canvasMap(16, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); for (const [p, col] of stops) g.addColorStop(p, col); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  if (sun) t.userData = { sun };
  return t;
}
const shell = (o) => ({ windowItem: true, brightness: 1, wallpaper: "none", ...o });
const area = (minX, minZ, maxX, maxZ) => ({ minX, minZ, maxX, maxZ });

// the sample people: the same for everyone in the same hub
const NAMES = ["Mika", "Jun", "Lia", "Kai", "Noor", "Ren", "Ivy", "Theo", "Ana", "Sam", "Inés", "Oli", "Zed", "Pia", "Maya", "Leo", "Rae", "Eda", "Tom", "Aiko", "Bea", "Cyrus", "Dani", "Elio",
  "Fen", "Gus", "Hana", "Ilan", "Jade", "Kofi", "Luz", "Milo", "Nia", "Otto", "Priya", "Quinn", "Rumi", "Sage", "Tavi", "Uma", "Vik", "Wren", "Xia", "Yuki", "Zara", "Bo", "Cleo", "Dev"];
const TONES = ["#f27ea6", "#5fb8e8", "#f2c14e", "#7cc576", "#b48ae8", "#6fc3b2", "#e58fb4", "#7fa8e0", "#e29a7f", "#9dcf80", "#d68fd8", "#74c5d6", "#5effb0", "#ff8fd0", "#f29f7e", "#78c1d8"];
/** groups: [[count, area, share who stand still]]. seats: [[x, z]] where a few sit. */
function crowd(key, groups, seats = [], named = []) {
  const r = seeded([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646 + 1), out = [...named];
  let n = 0;
  const name = () => NAMES[(n * 7 + key.length * 3) % NAMES.length];
  for (const [x, z] of seats) { out.push({ id: `${key}-s${n}`, name: name(), color: TONES[n % TONES.length], x, z, still: true }); n++; }
  for (const [count, a, still = 0.25] of groups) for (let i = 0; i < count; i++, n++) {
    const s = r() < still;
    out.push({ id: `${key}-${n}`, name: name(), color: TONES[n % TONES.length], x: a.minX + r() * (a.maxX - a.minX), z: a.minZ + r() * (a.maxZ - a.minZ), area: a, roam: !s, still: s });
  }
  return out;
}
const everyNth = (list, k, off = 0) => list.filter((_, i) => (i + off) % k === 0);

function centralPark() {
  const cx = 0, cz = 24, W = 64, D = 56;
  const items = [{ type: "hubGround", x: 0, z: 0, tone: 0x5d8a3a, size: 1400 }, { type: "hubLawn", x: cx, z: cz, r: 9 }];
  const benches = [];
  ringOf(16, 14, cx, cz, 0.2).forEach(([x, z], i) => items.push({ type: "hubTree", x, z, n: i + 1 }));
  ringOf(16, 14, cx, cz, 0.2 + Math.PI / 16).forEach(([x, z]) => { items.push({ type: "hubBench", x, z, rot: faceTo(x, z, cx, cz) }); benches.push([x, z]); });
  ringOf(20, 21, cx, cz, 0.08).forEach(([x, z]) => { items.push({ type: "hubBench", x, z, rot: faceTo(x, z, cx, cz) }); benches.push([x, z]); });
  ringOf(28, 17.5, cx, cz).forEach(([x, z]) => items.push({ type: "hubBollard", x, z }));
  // four little gardens in the corners, each a lawn with its own ring of trees and benches
  const gardens = [[-24, 4], [24, 4], [-24, 44], [24, 44]];
  gardens.forEach(([gx, gz], k) => {
    items.push({ type: "hubLawn", x: gx, z: gz, r: 2.6 });
    ringOf(6, 5.6, gx, gz, 0.5).forEach(([x, z], i) => items.push({ type: "hubTree", x, z, n: 40 + k * 6 + i }));
    ringOf(6, 5.6, gx, gz, 0.5 + Math.PI / 6).forEach(([x, z]) => { items.push({ type: "hubBench", x, z, rot: faceTo(x, z, gx, gz) }); benches.push([x, z]); });
  });
  for (const x of [-30.6, 30.6]) for (const z of [14, 24, 34]) items.push({ type: "hubPlanter", x, z, rot: Math.PI / 2 });
  for (const x of [-14, -8, 8, 14]) { items.push({ type: "hubPlanter", x, z: -3.3 }, { type: "hubPlanter", x, z: 51.3 }); }
  const r = seeded(4711);                                            // the open park around the square: yours to walk, and to change with the world editor
  for (let n = 0; n < 90; n++) {
    const a = r() * Math.PI * 2, d = 46 + r() * 115;
    items.push({ type: "hubTree", x: Math.round(Math.cos(a) * d * 10) / 10, z: Math.round((cz + Math.sin(a) * d) * 10) / 10, n: 100 + n, trunk: 0.5 });
  }
  return {
    key: "park", name: "Central Park", outdoor: true, spawn: [0, 49], open: { minX: -190, maxX: 190, minZ: -170, maxZ: 210 },
    layout: { shell: shell({ wall: "#7d9a6a", floor: "hex pavers", sky: "day", house: { w: W, d: D, hub: true } }), items },
    sky: skyPicture([[0, "#6aa7dc"], [0.55, "#bcdcf0"], [0.72, "#e8f0ea"], [1, "#e8f0ea"]]), fog: [0xdce8e4, 120, 420],
    spots: { cx, cz, gardens, benches },
    people: crowd("park", [[10, area(-28, -2, 28, 50)], [8, area(-12, 12, 12, 36), 0.3], [6, area(-60, -40, 60, 90)], [3, area(-28, -2, -18, 10)], [3, area(18, 38, 28, 50)]], everyNth(benches, 6)),
  };
}

// ---------- Café ----------
function lounge(items, x, z, lit) {                  // a rug, a round table, a sofa and two armchairs round it
  items.push({ type: "hubRug", x, z: z - 0.2, w: 4.4, d: 3.4 }, { type: "hubRoundTable", x, z, act: "cafeTable" },
    { type: "hubCafeSofa", x, z: z - 1.3, chat: true }, { type: "hubArmchair", x: x - 1.6, z: z + 0.2, rot: Math.PI / 2, chat: true }, { type: "hubArmchair", x: x + 1.6, z: z + 0.2, rot: -Math.PI / 2, chat: true },
    { type: "hubPendant", x, z, y: 2.15, lit });
}
const CAFE_H = 5.4, LIB_H = 6.6, ARCADE_H = 4.8;     // the big rooms' ceilings: high, so they feel like halls
function cafe() {
  const W = 36, D = 28, items = [], tables = [], lounges = [[-13.5, 18.6], [-5, 18.6], [5, 18.6], [13.5, 18.6], [12.4, 2.4]];
  items.push({ type: "hubCounter", x: -7, z: -2.9, w: 14 }, { type: "hubCounter", x: 8, z: -2.9, w: 8, info: "The bakery counter: the bread is still warm." });
  for (const [x, text] of [[-12, "Espresso  Flat white  Mocha  Tea"], [-7, "Latte  Cortado  Chai  Cocoa"], [-2, "Toast  Croissant  Cake  Soup"], [8, "Sourdough  Buns  Tarts  Cookies"]]) items.push({ type: "hubChalkboard", x, z: -3.85, text });
  for (const x of [-9.5, -4.5, 11]) items.push({ type: "hubJarShelf", x, z: -3.75 });
  for (let x = -13; x <= -1; x += 1.2) items.push({ type: "hubStool", x, z: -1.95, tone: 0x8f5a36 });
  for (let x = 5; x <= 11; x += 1.5) items.push({ type: "hubStool", x, z: -1.95, tone: 0xc99a4b });
  for (const x of [-15.5, -11.9, -8.3, -4.7, 4.7, 8.3, 11.9, 15.5]) for (const z of [3.4, 6.8, 10.2, 13.6]) {
    if (x > 10 && z < 5) continue;                     // the corner by the bakery is a lounge
    tables.push([x, z]);
    items.push({ type: "hubCafeTable", x, z, act: "cafeTable" },
      { type: "hubCafeChair", x: x - 0.8, z, rot: Math.PI / 2, chat: true }, { type: "hubCafeChair", x: x + 0.8, z, rot: -Math.PI / 2, chat: true },
      { type: "hubPendant", x, z, y: 2.15, cord: CAFE_H - 2.15 });
  }
  lounges.forEach(([x, z], i) => lounge(items, x, z, i < 4));
  items.push({ type: "hubPendant", x: -7, z: -2.2, y: 2.3, lit: true, cord: CAFE_H - 2.3 }, { type: "hubPendant", x: 8, z: -2.2, y: 2.3, lit: true, cord: CAFE_H - 2.3 });
  items.push({ type: "hubRug", x: 0, z: 9, w: 2.6, d: 15, c1: "#6d3a2a", c2: "#d9b77e" });
  for (let z = -3; z < D - 4; z += 2.6) items.push({ type: "hubBeam", x: 0, z, w: W, y: CAFE_H - 0.15 });
  for (const x of [-W / 4, W / 4]) items.push({ type: "hubBeam", x, z: (D - 8) / 2, w: D, y: CAFE_H - 0.36, rot: Math.PI / 2 });
  // a warm cove line round the walls, so the tall room glows up top instead of fading to black
  items.push({ type: "hubNeon", x: 0, z: -3.88, w: W - 0.4, tone: 0xffb46a, y: CAFE_H - 0.1 });
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) items.push({ type: "hubNeon", x, z: (D - 8) / 2, w: D - 0.4, tone: 0xffb46a, y: CAFE_H - 0.1, rot: Math.PI / 2 });
  for (const wall of ["left", "right"]) for (const u of [4, 11, 18]) items.push({ type: "bigWindow", wall, u, y: 1.75 }, { type: "bigWindow", wall, u, y: 4.05 });
  for (const [x, z] of [[-17.2, -3.2], [17.2, -3.2], [-17.2, 23.2], [17.2, 23.2], [-2.4, 16.4], [2.4, 16.4], [-2.4, 1.6], [2.4, 1.6]]) items.push({ type: "bigPlant", x, z });
  const chairs = tables.flatMap(([x, z]) => [[x - 0.8, z], [x + 0.8, z]]);
  return {
    key: "cafe", name: "Café", spawn: [0, 22.4],
    layout: { shell: shell({ wall: "#4a2e1d", floor: "walnut", wallpaper: "panels", sky: "golden", brightness: 0.6, house: { w: W, d: D, h: CAFE_H, hub: true } }), items },
    fog: [0x2a1a10, 24, 70], light: { hemi: [0xffdfb8, 0x3c2614, 1.15], sun: 0.5, exposure: 1.05 },
    spots: { tables, lounges, W, D },
    people: crowd("cafe", [[8, area(-3, 0, 3, 22)], [4, area(-16, 15, 16, 22)], [3, area(-14, -1, 2, 1)]], everyNth(chairs, 4, 1), [
      { id: "p-barista", name: "Sol (barista)", color: "#e8a15f", x: -7, z: -3.5, still: true },
      { id: "p-baker", name: "Ada (baker)", color: "#f2c14e", x: 8, z: -3.5, still: true },
    ]),
  };
}

// ---------- Library ----------
function library() {
  const W = 32, D = 44, items = [], tables = [], stacks = [], desks = [];
  items.push({ type: "hubGlassWall", x: -15.8, z: 18, rot: Math.PI / 2, len: D, h: LIB_H }, { type: "hubSlats", x: 0, z: 18, w: W, d: D, y: LIB_H - 0.15 });
  for (let z = -2.4, n = 1; z < D - 5; z += 2.05, n++) items.push({ type: "hubBookcase", x: 15.55, z, rot: -Math.PI / 2, n }, { type: "hubBookcase", x: 15.55, z, y: 3.1, rot: -Math.PI / 2, n: n + 60 });
  items.push({ type: "hubBeam", x: 15.25, z: (D - 10) / 2 + 0.6, w: D - 8, y: 3.0, rot: Math.PI / 2 }, { type: "hubBeam", x: 15.25, z: (D - 10) / 2 + 0.6, w: D - 8, y: 6.02, rot: Math.PI / 2 });
  for (const z of [4, 10, 16, 22, 28]) for (const x of [6, 8.05, 10.1, 12.15]) {   // the stacks: back to back, an aisle between every row
    stacks.push([x, z]);
    items.push({ type: "hubBookcase", x, z, n: Math.round(x * 7 + z) }, { type: "hubBookcase", x, z: z - 0.46, rot: Math.PI, n: Math.round(x * 5 + z * 3) });
  }
  for (const x of [-12, -7]) for (const z of [2, 8, 14, 20, 26, 32]) {
    tables.push([x, z]);
    items.push({ type: "hubLongTable", x, z });
    for (const dz of [-1.4, 0, 1.4]) items.push({ type: "hubLightChair", x: x - 0.85, z: z + dz, rot: Math.PI / 2 }, { type: "hubLightChair", x: x + 0.85, z: z + dz, rot: -Math.PI / 2 });
  }
  for (let z = -1; z < D - 6; z += 6) items.push({ type: "hubColumn", x: -3, z, h: LIB_H });
  [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].forEach((x, i) => items.push({ type: "hubStudyDoor", x, z: -3.82, n: i + 1 }));
  for (const z of [33, 36.6]) for (const x of [5.5, 8.5, 11.5, 14.2]) { desks.push([x, z]); items.push({ type: "hubStudyDesk", x, z }, { type: "hubLightChair", x, z: z + 0.8, rot: Math.PI }); }
  for (const x of [-12, -6]) items.push({ type: "hubRug", x, z: 37.2, w: 4, d: 3, c1: "#49604e", c2: "#d9cfb2" },
    { type: "hubArmchair", x: x - 1.1, z: 37, rot: Math.PI / 2 }, { type: "hubArmchair", x: x + 1.1, z: 37, rot: -Math.PI / 2 }, { type: "hubArmchair", x, z: 38.3, rot: Math.PI });
  // a long reading-room runner down the main aisle, from the doors to the study rooms
  items.push({ type: "hubRug", x: 1, z: 17.5, w: 3.2, d: 36, c1: "#2f4a3c", c2: "#c9a96a" });
  const seats = tables.flatMap(([x, z]) => [[x - 0.85, z - 1.4], [x + 0.85, z + 1.4]]);
  return {
    key: "library", name: "Library", spawn: [0, 38.4],
    layout: { shell: shell({ wall: "#d9d3c7", floor: "herringbone", sky: "day", brightness: 0.3, house: { w: W, d: D, h: LIB_H, hub: true } }), items },
    fog: [0xd9d3c7, 30, 90], light: { hemi: [0xffffff, 0xb7ad9d, 1.8], sun: 0.8, exposure: 1 },
    spots: { tables, stacks, desks, W, D },
    people: crowd("library", [[6, area(-2, 0, 4, 38)], [6, area(5, 1, 14, 30), 0.4], [3, area(4, 31, 15, 39)]], everyNth(seats, 2), [
      { id: "p-librarian", name: "Theo (librarian)", color: "#7fa8e0", x: 0, z: -1.2, still: true },
    ]),
  };
}

function studyRoom(n = 1) {
  return {
    key: "study", name: `Study room ${n}`, parent: "library", spawn: [0, 2],
    layout: { shell: shell({ wall: "#a98a68", floor: "white oak", wallpaper: "slats", sky: "morning", house: { w: 6, d: 7 } }), items: [
      { type: "hubStudyDesk", x: -0.6, z: -2.4 }, { type: "hubLightChair", x: -0.6, z: -1.6, rot: Math.PI },
      { type: "hubBookcase", x: 2.65, z: -1, rot: -Math.PI / 2, n: 8 }, { type: "bigPlant", x: -2.5, z: -3.2 },
      { type: "bigWindow", wall: "back", u: 1.6, y: 1.75 }, { type: "hubRug", x: -0.6, z: -1, w: 2.8, d: 2.4, c1: "#49604e", c2: "#d9cfb2" },
    ] },
    fog: [0x6a5a44, 14, 30], light: { hemi: [0xfff3df, 0x8a7558, 1.4], sun: 0.8, exposure: 1 }, people: [],
  };
}

// ---------- Museum ----------
// The building and its plan live in museumhub.js: a lobby, the Grand Gallery, and four wings (dinosaurs, historic art, artifacts, history).
function museum() {
  resetMuseum();
  const { items, spots } = museumLayout();
  const v = spots.viewers, seats = [[-2.95, 0.6], [2.95, 15.6], [0, 4.8], [14, 2.4], [19.4, 0.4], [-14, 24.4], [12, 16.6], [7.5, 34.8]];
  return {
    key: "museum", name: "Museum", outdoor: "bare", spawn: [0, 33.4], camDistance: 12, far: 400,
    layout: { shell: shell({ wall: "#efe6d4", floor: "gallery concrete", sky: "day", brightness: 0.3, house: { w: 48, d: 40, h: 7.5, hub: true } }), items },
    fog: [0xe9e1d2, 40, 120], light: { hemi: [0xfff4e2, 0xb8a888, 2.0], sun: 0.6, exposure: 1.0 },
    spots,
    tick: (dt, t, room) => museumTick(dt, t, room),
    people: crowd("museum", [[6, area(-2.2, -2.5, 2.2, 27.2), 0.35], [7, area(-21, 30, 21, 35.2), 0.3]], seats, [
      { id: "p-ines", name: "Inés (guide)", color: "#d68fd8", x: 1.7, z: 26.6, still: true },
      { id: "p-rex", name: "Dr. Okafor (fossils)", color: "#c99a5a", x: v[1][0], z: v[1][1], still: true },
      ...v.filter((_, i) => i !== 1 && i % 2 === 0).map(([x, z], i) => ({ id: `museum-v${i}`, name: ["Hana", "Theo", "Priya", "Joaquín", "Mei", "Lars", "Amara", "Ezra"][i % 8], color: ["#8fb8d8", "#d8a48f", "#a8d88f", "#d88fb8", "#d8cf8f", "#8fd8c4", "#b88fd8", "#d8b88f"][i % 8], x, z, still: true })),
    ]),
  };
}

// ---------- Arcade ----------
function arcade() {
  const W = 32, D = 24, items = [];
  let n = 0;
  for (let x = -14.4; x <= 14.41; x += 1.6) items.push({ type: "hubCabinet", x, z: -3.45, n: n++ });
  for (let z = -1.6; z <= 16.9; z += 1.6) items.push({ type: "hubCabinet", x: -15.4, z, rot: Math.PI / 2, n: n++ }, { type: "hubCabinet", x: 15.4, z, rot: -Math.PI / 2, n: n++ });
  for (const z of [5, 11.8]) for (const x of [-11.2, -9.6, -8, -6.4, -4.8, 4.8, 6.4, 8, 9.6, 11.2]) {   // islands, back to back
    items.push({ type: "hubCabinet", x, z, n: n++ }, { type: "hubCabinet", x, z: z - 0.8, rot: Math.PI, n: n++ });
    items.push({ type: "hubStool", x, z: z + 1.1, tone: n % 2 ? 0x38d6ff : 0xff3d81 });
  }
  for (let x = -13.6; x <= 13.61; x += 3.2) items.push({ type: "hubStool", x, z: -2.2, tone: 0xffd23f });
  items.push({ type: "hubRug", x: 0, z: 8, w: 6, d: 9, c1: "#2a1d4e", c2: "#ff3d81" });
  for (const [x, z] of ringOf(8, 2.2, 0, 8)) items.push({ type: "hubStool", x, z, tone: 0xffd23f });
  items.push({ type: "hubRug", x: 0, z: 17.2, w: 12, d: 3.4, c1: "#14233f", c2: "#38d6ff" });
  for (const x of [-5, -3, 3, 5]) items.push({ type: "hubStool", x, z: 17.2, tone: 0x9d5cff });
  items.push({ type: "hubNeon", x: 0, z: -3.9, w: W - 1, tone: 0xff3d81, y: 2.85 }, { type: "hubNeon", x: 0, z: -3.9, w: W - 1, tone: 0x38d6ff, y: ARCADE_H - 0.35 });
  [[1, 0x38d6ff], [8.4, 0xffd23f], [15, 0x9d5cff]].forEach(([z, tone]) => items.push({ type: "hubNeon", x: 0, z, w: W - 2, tone, y: ARCADE_H - 0.25 }));
  return {
    key: "arcade", name: "Arcade", spawn: [0, 18.6],
    layout: { shell: shell({ wall: "#120a20", floor: "dark wood", wallpaper: "neongrid", sky: "night", brightness: 0.6, house: { w: W, d: D, h: ARCADE_H, hub: true } }), items },
    fog: [0x0c0716, 22, 60], light: { hemi: [0x8f7cff, 0x200c30, 1.25], sun: 0.3, exposure: 1.1 },
    spots: { W, D },
    people: crowd("arcade", [[10, area(-14, -2, 14, 18), 0.35], [4, area(-3, 4, 3, 12)]], [[-13.6, -2.2], [0, -2.2], [6.4, 6.1], [-8, 12.9], [2.2, 8]], [
      { id: "p-zed", name: "Zed (high score)", color: "#5effb0", x: 1.6, z: -2.4, still: true },
    ]),
  };
}

// ---------- Beach Resort ----------
const PIER = { x: 0, len: 20, w: 3.4, pw: 8, pd: 6, z: -3 };
function beachWalk(x, z) {
  if (z > -3.5) return true;                                     // the sand
  const dx = Math.abs(x - PIER.x), end = PIER.z - PIER.len;
  if (z > end && dx < PIER.w / 2 - 0.35) return true;            // along the pier
  return z > end - PIER.pd + 0.35 && z <= end + 0.1 && dx < PIER.pw / 2 - 0.35;   // the platform at its end
}
function beach() {
  // the sand runs down under a living sea (beachhub.js); two thatched bars stand where the glass pavilions were
  resetBeach();
  const W = 60, D = 40, items = [], lounges = [], loungers = [];
  items.push({ type: "bcSand", x: 0, z: 0 }, { type: "bcSea", x: 0, z: 0 }, { type: "bcSun", x: 0, z: 0 },
    { type: "hubDeck", x: 0, z: 21, w: 46, d: 20 }, { type: "hubPier", ...PIER });
  // out at sea: the island, a few sailboats, the swimming buoys
  items.push({ type: "bcIsland", x: -92, z: -175, rot: 0.35, n: 3 },
    { type: "bcBoat", x: -42, z: -72, rot: 0.6, n: 1 }, { type: "bcBoat", x: 38, z: -118, rot: -0.9, n: 2 }, { type: "bcBoat", x: -6, z: -165, rot: 1.4, n: 3 },
    { type: "bcBuoys", x: 0, z: 0, pts: [[-1.9, -14], [-16, -14], [-16, -4.6]] }, { type: "bcBuoys", x: 0, z: 0, pts: [[1.9, -14], [16, -14], [16, -4.6]] });
  for (const [x, z, n] of [[-27, 6, 1], [27, 6, 2], [-27, 22, 3], [27, 22, 4], [-20, 34, 5], [20, 34, 6]]) items.push({ type: "hubDune", x, z, n });
  items.push({ type: "bcTikiBar", x: -19, z: 21, rot: Math.PI / 2, n: 1, name: "SUNSET BAR", sub: "cold drinks · warm nights" },
    { type: "bcTikiBar", x: 19, z: 21, rot: -Math.PI / 2, n: 2, name: "SHAVE ICE", sub: "fruit · syrups · sprinkles", bg: ["#4fc3f7", "#7c5cff"], fg: "#fffbe6" });
  for (const sd of [-1, 1]) for (const lx of [-1.6, -0.55, 0.55, 1.6]) items.push({ type: "hubStool", x: sd * 17.1, z: 21 + sd * lx, tone: sd < 0 ? 0xff8a5b : 0x4fc3f7 });
  items.push({ type: "bcLightCanopy", x: 0, z: 0 });
  for (const x of [-12, -4, 4, 12]) for (const z of [14, 21, 28]) {
    lounges.push([x, z]);
    items.push({ type: "hubModSofa", x, z: z - 1.5 }, { type: "hubLowTable", x, z }, { type: "hubModSofa", x, z: z + 1.5, rot: Math.PI },
      { type: "hubHourglass", x: x - 1.7, z }, { type: "hubHourglass", x: x + 1.7, z });
  }
  // the sand: a lifeguard tower, palms leaning out, surfboards, towels and umbrellas, sandcastles, shells everywhere
  const GUARD = [23.5, -0.6];
  items.push({ type: "bcLifeguard", x: GUARD[0], z: GUARD[1], rot: Math.PI }, { type: "bcSurfRack", x: 26, z: 10, n: 1 }, { type: "bcSurfRack", x: -25.5, z: 10.2, rot: 0.2, n: 3 });
  for (const [x, z, h, n, lean] of [[-25.5, -1.4, 7.5, 1, [1.2, -2.4]], [12.2, -1.7, 6.5, 2, [-0.8, -2]], [-9.5, 9.6, 8, 3, [0.6, 1.2]], [21.5, 10, 7, 4, [-1, 1.4]], [-17.5, -1.8, 6, 5, [0.4, -1.8]]])
    items.push({ type: "bcPalm", x, z, h, n, lean });
  const towels = [[-11.5, 8.4, ["#ff6f61", "#fff4e6"]], [-6, 8, ["#4fc3f7", "#fff4e6", "#ffd23f"]], [5.5, 8.6, ["#c084fc", "#fff4e6"]], [10.5, 8.2, ["#7ed957", "#fff4e6", "#ff9fc0"]], [-21.5, 8.8, ["#ffd23f", "#ff6f61"]]];
  towels.forEach(([x, z, cols], i) => { items.push({ type: "bcTowel", x, z, rot: (i % 2 ? 0.2 : -0.15), cols, n: i }); if (i % 2 === 0) items.push({ type: "bcUmbrella", x: x + 1.1, z: z - 0.6, cols: [cols[0], "#fff4e6"], rot: i }); });
  items.push({ type: "bcSandcastle", x: -6, z: -2.4, n: 1 }, { type: "bcSandcastle", x: 8.5, z: -2.2, rot: 0.7, n: 2 }, { type: "bcShells", x: 0, z: 0, n: 5 });
  for (const [z, off] of [[1, 0], [5, 1.7]]) for (let x = -27 + off; x <= 27; x += 3.4) {
    if (Math.abs(x - PIER.x) < 3 || Math.abs(x - GUARD[0]) < 2.8 || Math.abs(x + 25.5) < 1.2 && z < 2 || Math.abs(x - 12.2) < 1 && z < 2) continue;   // the pier, the tower and the palms keep their room
    if (items.some((o) => o.type === "hubDune" && Math.abs(o.x - x) < 3.4 && Math.abs(o.z - z) < 2.6)) continue;              // never half-buried in a dune
    if (items.some((o) => o.type === "bcPalm" && Math.hypot(o.x - x, o.z - z) < 1.6)) continue;                               // nor through a palm's trunk
    loungers.push([x, z]);
    items.push({ type: "hubLounger", x, z, rot: Math.PI });
  }
  const lanterns = [[-23.4, 11.4], [23.4, 11.4], [-23.4, 30.6], [23.4, 30.6], [-1.4, -3.4], [1.4, -3.4], [-3.6, -23.2], [3.6, -23.2], [-3.6, -28.6], [3.6, -28.6]];
  for (const [x, z] of lanterns) items.push({ type: "hubLantern", x, z });
  items.push({ type: "hubBench", x: 0, z: -27.6, rot: Math.PI }, { type: "hubBench", x: -2.4, z: -26.4, rot: Math.PI / 2 + Math.PI }, { type: "hubBench", x: 2.4, z: -26.4, rot: Math.PI / 2 });
  return {
    key: "beach", name: "Beach Resort", outdoor: "bare", spawn: [0, 33], camDistance: 18, far: 1400,
    open: { minX: -29.3, maxX: 29.3, minZ: PIER.z - PIER.len - PIER.pd, maxZ: D - 4.7 }, walkable: beachWalk,
    layout: { shell: shell({ wall: "#c79a6e", floor: "sand", sky: "sunset", house: { w: W, d: D, hub: true } }), items },
    sky: skyPicture([[0, "#42598f"], [0.3, "#9d7fa6"], [0.46, "#ef9d78"], [0.56, "#ffcf8f"], [0.6, "#ffe0ab"], [1, "#e7b68a"]]), fog: [0xf2bf92, 80, 520],
    light: { hemi: [0xffcfa8, 0x8a6a50, 1.5], sun: 2, exposure: 1 },
    spots: { lounges, loungers, W, D },
    tick: (dt, t) => beachTick(dt, t),
    people: crowd("beach", [[10, area(-26, -2, 26, 9)], [8, area(-22, 12, 22, 31), 0.3], [3, area(-1, -22, 1, -4)], [2, area(-3, -28, 3, -23), 0.5]],
      everyNth(loungers, 4).map(([x, z]) => [x, z + 0.2]), [
      { id: "p-maya", name: "Maya", color: "#f29f7e", x: -12, z: 12.8, still: true },
      { id: "p-leo", name: "Leo (shave ice)", color: "#78c1d8", x: 19.9, z: 21.2, still: true },
      { id: "p-sol", name: "Sol (bar)", color: "#ff8a5b", x: -19.9, z: 20.8, still: true },
    ]),
  };
}

/** The hall from your drawing: stalls in blocks of 2 x 2 with a hallway all round every block. stalls = { index: {name, tagline, color, goods:[type,...]} } */
export const STALL_LAYOUT = { size: 3, hall: 4.5, cols: 5, rows: 4, h: 7 };     // hallways 4.5 m wide, a 7 m roof with trusses and skylights
function stallHall(stalls = {}) {
  const { size, hall, cols, rows, h: ceil } = STALL_LAYOUT;
  const W = cols * size * 2 + (cols + 1) * hall, D = rows * size * 2 + (rows + 1) * hall;
  const items = [], back = -4, crossings = [], step = size * 2 + hall;
  items.push({ type: "stHall", x: 0, z: 0, W, D, back, size, hall, cols, rows, ceil });
  let idx = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const bx0 = -W / 2 + hall + c * step, bz0 = back + hall + r * step;
    for (const [ix, iz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = bx0 + size / 2 + ix * size, z = bz0 + size / 2 + iz * size;
      // each stall opens onto the hallway: the back pair looks back, the front pair looks forward, and they share walls in the middle of the block
      const rot = iz ? 0 : Math.PI, side = (ix === 1) === !iz ? "r" : "l";
      const s = stalls[idx] || {};
      items.push({ type: "hubStall", x, z, rot, idx, side, name: s.name || "", tagline: s.tagline || "", color: s.color || "" });
      (s.goods || []).slice(0, STALL_SLOTS.length).forEach((type, k) => {
        if (!type || !CATALOG[type]) return;
        const [lx, lz] = STALL_SLOTS[k], sn = Math.sin(rot), cs = Math.cos(rot);
        items.push({ type, x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, y: 0.1, rot, act: "stall", idx });
      });
      idx++;
    }
  }
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) crossings.push([-W / 2 + hall / 2 + c * step, back + hall / 2 + r * step]);
  // the crossings inside the hall: capsule machines and blossom planters, turn about
  crossings.filter(([x, z]) => Math.abs(x) < W / 2 - hall && z > back + hall && z < back + D - hall)
    .forEach(([x, z], i) => items.push({ type: i % 2 ? "stGacha" : "stBlossom", x, z, n: i + 1 }));
  // anime banners all round the walls (original art)
  const nb = 7;
  for (let i = 0; i < nb; i++) items.push({ type: "stWallBanner", x: -W / 2 + (W * (i + 0.5)) / nb, z: back + 0.04, n: i + 1, w: 2.8, h: 4.6, y0: 1.6 });
  for (let i = 0; i < 5; i++) {
    const z = back + (D * (i + 0.5)) / 5;
    items.push({ type: "stWallBanner", x: -W / 2 + 0.04, z, rot: Math.PI / 2, n: 20 + i, w: 2.8, h: 4.6, y0: 1.6 }, { type: "stWallBanner", x: W / 2 - 0.04, z, rot: -Math.PI / 2, n: 40 + i, w: 2.8, h: 4.6, y0: 1.6 });
  }
  const by = ceil - 2.25;                                                    // hung under the trusses
  [[-W / 3, "Community Stalls"], [0, "Rent a stall, make it yours"], [W / 3, "Browse, chat, trade"]].forEach(([x, text]) => items.push({ type: "stAisleBanner", x, z: back + hall / 2, y: by, text }));
  [[-W / 4, "Welcome to the Stalls"], [W / 4, "Every stall is someone's"]].forEach(([x, text]) => items.push({ type: "stAisleBanner", x, z: back + D - hall / 2, y: by, text }));
  return {
    key: "stalls", name: "Community Stalls", spawn: [0, back + D - hall / 2],
    layout: { shell: shell({ wall: "#d9c8b0", floor: "pale concrete", sky: "day", brightness: 0.3, house: { w: W, d: D, h: ceil, hub: true } }), items },
    fog: [0xd9cbb6, 45, 110], light: { hemi: [0xfff3e2, 0xa89a86, 1.85], sun: 0.45, exposure: 1.02 },
    spots: { crossings, W, D, back, hall, size },
    people: crowd("stalls", [[12, area(-W / 2 + 1, back + 0.6, W / 2 - 1, back + D - 1)], [4, area(-W / 2 + 1, back + D - hall, W / 2 - 1, back + D - 0.8), 0.4]]),
  };
}

export { OFFICIAL_HUBS };                                                 // the list lives in hubinfo.js, so the menu needn't load every hub
Object.assign(CATALOG, MAIN_CATALOG, PARK_CATALOG, PLACES_CATALOG, STALL_CATALOG, BEACH_CATALOG, MUSEUM_CATALOG);
const BUILD = { main: mainHub, park: parkHub, cafe, library, museum, arcade, beach, stalls: stallHall, study: studyRoom };
/** The whole hub, freshly built. arg: the rented stalls for "stalls", the room number for "study". */
export const buildHub = (key, arg) => dressHub(BUILD[key]?.(arg) || null, arg);
