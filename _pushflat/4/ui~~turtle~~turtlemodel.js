// turtlemodel.js - the animal itself, made to the reference sheet: a faceted low-poly turtle. A high dark-green dome of big flat facets sitting on a
// thick cream rim band, a cream belly under it, a big rounded-box head in leaf green with a paler jaw and two tall black oval eyes (a white shine in
// each), four sea-turtle flippers (long swept front ones, short round back ones, each with a row of pale scales) growing out from under the shell,
// and a little pointed tail. No mouth line, no cheeks: the eyes do the talking.
// One model for every turtle. An island turtle carries its land where the dome would be (the rim band follows the real shoreline) and swims with its
// head, legs and tail under the water; a turtle with no land on it (Pell) has the dome itself. Colours, age and personality come from cfg.look
// (TURTLE_LOOKS in data.js).
import * as THREE from "three";

export const BASE_LOOK = { shell: 0x3d6a50, plate: 0x4b7a5c, skin: 0x9ccd6c, jaw: 0xb9dc8a, belly: 0xd9cf9c, rim: 0xe6dfb2, toe: 0xf1ead0, eye: 0x1c1a1a, age: "adult", mood: "calm" };

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
const facetMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }

/** every face one flat colour, a touch lighter or darker than its neighbours, the way the reference is painted. pick(x, y, z) chooses the base colour */
function painted(geo, color, jitter = 0.03, pick = null) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, col = [], c = new THREE.Color(), base = new THREE.Color(color);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.copy(pick ? pick(cx, cy, cz, base) : base).offsetHSL(0, 0, (hash(cx * 3.1 + cy * 1.7, cz * 2.7 - cy) - 0.5) * jitter * 2);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** nudge every corner a little, the same amount wherever it's shared, so the facets look cut by hand rather than by a machine */
function rough(geo, amount) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = (hash(x * 9.1 + z * 3.3, y * 7.7 - z) - 0.5) * amount;
    p.setXYZ(i, x * (1 + n), y * (1 + n * 0.6), z * (1 + n));
  }
  return geo;
}
/** a rounded box: a cube cut into a few facets a side and pulled most of the way to a sphere. The reference head is this shape */
function roundBox(rx, ry, rz, seg = 4, round = 0.62) {
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const s = v.clone().normalize().multiplyScalar(Math.sqrt(3) * 0.82);
    v.lerp(s, round);
    p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  return g;
}

/**
 * the head, the legs and the tail, sized for a turtle `u` wide (half its shell's width). The head looks along +x.
 * Returns the pieces and the eyes, so the face can blink, sleep and smile.
 */
function animal(L, u, young, old) {
  const skin = facetMat(), parts = {};
  // ---------------- the head: a big rounded box, leaf green, the jaw underneath paler ----------------
  const hx = u * (young ? 0.5 : 0.44), hy = u * (young ? 0.46 : 0.4), hz = u * (young ? 0.5 : 0.44);
  const head = new THREE.Group();
  const skullGeo = rough(roundBox(hx, hy, hz, 4, 0.6), 0.035);
  { const p = skullGeo.attributes.position;                   // the snout a little flatter and lower than the crown, as in the side view
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (x > 0) p.setY(i, y - x / hx * hy * 0.08 * (y > 0 ? 1 : 0.2)); if (y < 0) p.setY(i, p.getY(i) * 0.92); } }
  skin.side = THREE.DoubleSide;
  const skull = mesh(painted(skullGeo, L.skin, 0.03, (x, y, z, base) => (y < -hy * 0.42 && x > -hx * 0.2 ? new THREE.Color(L.jaw) : base)), skin);
  head.add(skull);
  // the eyes: tall black ovals on the front corners of the face, a round white shine high in each. Each is its own group so it can blink
  const eyeMat = new THREE.MeshStandardMaterial({ color: L.eye, roughness: 0.25, metalness: 0 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lidMat = facetMat(), lineMat = new THREE.MeshStandardMaterial({ color: L.eye, roughness: 0.4 });
  const eh = hy * (young ? 0.4 : 0.35), ew = eh * 0.6, eyes = [], shut = [], happy = [], lids = [];
  for (const side of [-1, 1]) {
    // where the eye sits: on the skull's surface, a little above the middle, turned out to the side
    const yaw = side * (young ? 0.62 : 0.66), pitch = 0.12;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
    // find the real surface of the skull along that direction (it's a rounded box, not a sphere), and its slope there
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), dir.clone().normalize(), 0, u * 4).intersectObject(skull)[0];
    const at = hit ? hit.point.clone().addScaledVector(dir, -ew * 0.12) : new THREE.Vector3(dir.x * hx, dir.y * hy, dir.z * hz);
    const n = hit && hit.face ? hit.face.normal.clone().lerp(dir, 0.5).normalize() : dir.clone();
    const holder = new THREE.Group(); holder.position.copy(at); holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); head.add(holder);
    const e = new THREE.Group(); holder.add(e);
    const ball = mesh(new THREE.SphereGeometry(1, 20, 16), eyeMat, false); ball.scale.set(ew, eh, ew * 0.42); e.add(ball);
    const shine = mesh(new THREE.SphereGeometry(1, 12, 10), white, false); shine.scale.set(ew * 0.3, ew * 0.3, ew * 0.12); shine.position.set(side * ew * 0.18, eh * 0.42, ew * 0.36); e.add(shine);
    eyes.push(e);
    // closed (asleep) and smiling (^): thin dark curves where the eye was
    const curve = (pts, wide, tall) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * wide, y * tall, ew * 0.25))), 20, ew * 0.11, 6, false), lineMat, false);
    const sl = curve([[-1, 0.2], [-0.5, -0.25], [0, -0.38], [0.5, -0.25], [1, 0.2]], ew * 1.05, eh * 0.4); holder.add(sl); shut.push(sl);
    const hp = curve([[-1, -0.4], [-0.5, 0.25], [0, 0.42], [0.5, 0.25], [1, -0.4]], ew * 1.05, eh * 0.45); holder.add(hp); happy.push(hp);
    // a lid of skin over the top of the eye: how far down it comes is the personality (sleepy, grumpy) and age
    const lid = mesh(painted(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), L.skin, 0.02), lidMat, false);
    lid.scale.set(ew * 1.15, eh * 1.3, ew * 0.5); lid.rotation.x = 0; holder.add(lid); lids.push({ lid, side });
  }
  parts.head = head; parts.eyes = eyes; parts.shut = shut; parts.happy = happy; parts.lids = lids; parts.eh = eh;
  parts.hx = hx; parts.hy = hy;

  // ---------------- flippers: flat, faceted paddles, a long swept-back pair in front and a short rounded pair behind. Each is drawn flat (out = x,
  // forward = y), thickened with a soft bevel, then stood the right way round for its side. A row of pale scales runs down the leading edge ----------------
  const flipMat = facetMat(), legs = [];
  const paddle = (len, wid, thick, front, side) => {
    const sh = new THREE.Shape(), w = wid;
    const pts = front
      ? [[0, w * 0.42], [len * 0.3, w * 0.56], [len * 0.62, w * 0.42], [len * 0.9, w * 0.12], [len, -w * 0.1], [len * 0.82, -w * 0.3], [len * 0.45, -w * 0.42], [0, -w * 0.4]]
      : [[0, w * 0.45], [len * 0.45, w * 0.58], [len * 0.85, w * 0.36], [len, 0], [len * 0.86, -w * 0.4], [len * 0.4, -w * 0.55], [0, -w * 0.42]];
    sh.moveTo(pts[0][0], pts[0][1]);
    sh.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.5, bevelSegments: 2, curveSegments: 7 });
    geo.translate(0, 0, -thick / 2);
    // thinner towards the tip, the way a real flipper is
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 - Math.max(0, Math.min(1, p.getX(i) / len)) * 0.6; p.setZ(i, p.getZ(i) * k); }
    // stand it up for its side: out along +z or -z, forward along +x, flat side up (a proper rotation either way, so the faces stay outward)
    const m = side > 0 ? new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1) : new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, -1, 0, -1, 0, 0, 0, 0, 0, 0, 1);
    geo.applyMatrix4(m);
    return rough(geo, 0.02);
  };
  for (const [fx, side] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const front = fx > 0, pivot = new THREE.Group(); pivot.rotation.order = "YXZ";
    const len = u * (front ? 1.2 : 0.66), wid = u * (front ? 0.52 : 0.44), thick = u * 0.06;
    const fin = mesh(painted(paddle(len, wid, thick, front, side), L.skin, 0.035, (x, y, z, base) => {
      // the leading edge a shade darker, a scatter of pale scales along it
      const out = Math.abs(z) / len, lead = x / wid;
      if (lead > 0.22 && hash(Math.floor(out * 9), 3 + side) < 0.55 && out > 0.12 && out < 0.85) return new THREE.Color(L.toe);
      return lead > 0.1 ? base.clone().offsetHSL(0, 0, -0.03) : base;
    }), flipMat);
    pivot.add(fin);
    // the root: a rounded knob of skin where the flipper goes in under the shell, so it never looks stuck on
    const root = mesh(painted(rough(new THREE.SphereGeometry(1, 10, 8), 0.04), L.skin, 0.03), skin);
    root.scale.set(wid * 0.5, thick * 1.4, wid * 0.55); pivot.add(root);
    legs.push({ pivot, side, front, lh: thick * 2, len });
  }
  parts.legs = legs;
  // ---------------- the tail: a short faceted point ----------------
  const tail = new THREE.Group();
  const tip = mesh(painted(rough(new THREE.ConeGeometry(u * 0.13, u * 0.42, 6, 2).rotateZ(Math.PI / 2), 0.04), L.skin, 0.03), skin); tip.position.x = -u * 0.17; tail.add(tip);
  parts.tail = tail;
  // the neck: a short thick join between the shell and the head
  const neck = new THREE.Group(), throat = mesh(painted(rough(new THREE.SphereGeometry(1, 9, 7), 0.04), L.skin, 0.03, (x, y, z, b) => (y < -0.3 ? new THREE.Color(L.jaw) : b)), skin);
  throat.scale.set(u * 0.34, u * 0.3, u * 0.32); neck.add(throat);
  parts.neck = neck;
  return parts;
}

/** the band of cream round the shell's foot: a thick bevelled ring, faceted round its length. outline: [x, z] points round the shell (closed) */
function band(outline, y0, h, out, color, belly, shellColor, deepBelly) {
  // [how far out past the outline, height]: up the outer face with a bevel top and bottom, then in across the top
  const prof = [[-0.02, y0 + h * 0.96], [out * 0.55, y0 + h], [out, y0 + h * 0.78], [out * 1.04, y0 + h * 0.3], [out * 0.8, y0], [out * 0.2, y0 - h * 0.12]];
  const N = outline.length, pos = [], col = [], c = new THREE.Color();
  const ring = (k, d) => { const [x, z] = outline[k % N], r = Math.hypot(x, z) || 1; return [x + x / r * d, z + z / r * d]; };
  const push = (pts, color0) => {
    const base = new THREE.Color(color0);
    for (let t = 0; t < pts.length; t += 9) {
      c.copy(base).offsetHSL(0, 0, (hash(pts[t] * 0.37 + pts[t + 2] * 0.11, pts[t + 1] * 0.7) - 0.5) * 0.05);
      for (let k = 0; k < 9; k++) pos.push(pts[t + k]);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  };
  const quad = (A, B, C, D) => [...A, ...D, ...B, ...B, ...D, ...C];
  const rimPts = [];
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < N; i++) {
    const [d0, y0b] = prof[j], [d1, y1b] = prof[j + 1], a0 = ring(i, d0), b0 = ring(i + 1, d0), a1 = ring(i, d1), b1 = ring(i + 1, d1);
    rimPts.push(...quad([a0[0], y0b, a0[1]], [b0[0], y0b, b0[1]], [b1[0], y1b, b1[1]], [a1[0], y1b, a1[1]]));
  }
  push(rimPts, color);
  // the belly: from under the band, curving in to a flat plate
  const bel = [[out * 0.2, y0 - h * 0.12], [0, y0 - h * 0.55], [-out * 0.9, y0 - deepBelly * 0.8], [-out * 3, y0 - deepBelly]], bp = [];
  for (let j = 0; j < bel.length - 1; j++) for (let i = 0; i < N; i++) {
    const [d0, y0b] = bel[j], [d1, y1b] = bel[j + 1], a0 = ring(i, d0), b0 = ring(i + 1, d0), a1 = ring(i, d1), b1 = ring(i + 1, d1);
    bp.push(...quad([a0[0], y0b, a0[1]], [b0[0], y0b, b0[1]], [b1[0], y1b, b1[1]], [a1[0], y1b, a1[1]]));
  }
  push(bp, belly);
  // and the flat of the belly, a fan to the middle
  const fan = [], last = bel[bel.length - 1];
  for (let i = 0; i < N; i++) { const a = ring(i, last[0]), b = ring(i + 1, last[0]); fan.push(a[0], last[1], a[1], b[0], last[1], b[1], 0, last[1], 0); }
  push(fan, belly);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, side: THREE.DoubleSide }));
}

/** how each personality carries itself: how high it holds its head, how far it looks about, how quick it is, how heavy its lids */
const MOODS = {
  calm: { lift: 0, look: 0.3, pace: 1, lid: 0.08, tilt: 0.04 },
  cheerful: { lift: 0.1, look: 0.4, pace: 1.5, lid: 0, tilt: 0.1, smiles: 2 },
  sleepy: { lift: -0.12, look: 0.15, pace: 0.55, lid: 0.42, tilt: 0.03 },
  grumpy: { lift: -0.04, look: 0.2, pace: 0.8, lid: 0.3, tilt: 0.02, frown: true },
  shy: { lift: -0.1, look: 0.18, pace: 0.8, lid: 0.12, tilt: 0.12 },
  proud: { lift: 0.16, look: 0.22, pace: 0.7, lid: 0.16, tilt: 0.02 },
  curious: { lift: 0.06, look: 0.55, pace: 1.3, lid: 0, tilt: 0.16 },
  gentle: { lift: 0, look: 0.25, pace: 0.75, lid: 0.18, tilt: 0.06, smiles: 1.5 },
};

/**
 * makeTurtle(cfg, land?) -> { group, head, neck, look, setFace, update(t, mood) }. The head looks along +x.
 * cfg: a, b (half length and width of the shell), deep (how far it goes down), look (colours, age "young" | "adult" | "old", mood: a key of MOODS).
 * land: the Land on its back. Without one the turtle has its own dome.
 */
export function makeTurtle(cfg, land = null) {
  const { a, b, deep } = cfg, L = { ...BASE_LOOK, ...(cfg.look || {}) }, g = new THREE.Group();
  const young = L.age === "young", old = L.age === "old", domed = !land, M = MOODS[L.mood] || MOODS.calm;
  if (!L.jaw) L.jaw = new THREE.Color(L.skin).lerp(new THREE.Color(0xfff6d0), 0.3).getHex();
  // ---------------- the outline of the shell: round for a lone turtle, the shoreline itself for one carrying land ----------------
  const N = domed ? 20 : 96, outline = [];
  for (let i = 0; i < N; i++) {
    const t = i / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    let k = 1;
    if (land) { k = 1.3; while (k > 0.5 && land.height(c * a * k, s * b * k) < 0.42) k -= 0.003; k += 0.004; }
    outline.push([c * a * k, s * b * k]);
  }
  // the size everything else is made to: a lone turtle is b wide; an island turtle's animal is sized to its shell, not to the whole coastline
  const u = domed ? b : b * 0.62;
  let rimTop = 0;
  if (domed) {
    // the band: thick and cream, at the dome's foot
    const h = deep * 0.26, y0 = deep * 0.05;
    g.add(band(outline, y0, h, b * 0.1, L.rim, L.belly, L.shell, deep * 0.32));
    rimTop = y0 + h;
    // the dome: a geodesic sphere of big flat facets, cut off flat at the band and lifted a little in the middle. Lighter facets on top, as the light falls
    const geo = rough(new THREE.IcosahedronGeometry(1, 2), 0.06), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = Math.max(0, p.getY(i));
      const squash = y > 0 ? 1 : 1;
      p.setXYZ(i, p.getX(i) * a * 1.0, y * deep * 1.12 * squash + rimTop - deep * 0.02, p.getZ(i) * b * 1.0);
    }
    const top = rimTop + deep * 1.1;
    const dome = mesh(painted(geo, L.shell, 0.035, (x, y, z, base) => {
      const k = (y - rimTop) / (top - rimTop), cell = Math.floor(Math.atan2(z / b, x / a) * 1.6 + 8) + Math.floor(k * 3) * 11;
      const c = base.clone().lerp(new THREE.Color(L.plate), Math.max(0, k - 0.35) * 0.9);
      return hash(cell, 5) < 0.3 ? c.offsetHSL(0, 0, 0.025) : c;
    }), facetMat());
    g.add(dome);
  } else {
    // an island: the band round the beach, the dark shell dropping under the water below it, then the belly
    const h = 1.6 + deep * 0.012;
    rimTop = 1.0;
    g.add(band(outline, rimTop - h, h, Math.max(a, b) * 0.022, L.rim, L.belly, L.shell, deep * 0.9));
    // the shell's wall under the band: dark green, curving under, faceted in plates
    const wall = [], col = [], c = new THREE.Color(), base = new THREE.Color(L.shell), plate = new THREE.Color(L.plate);
    const prof = [[1.02, rimTop - h], [1.05, -deep * 0.18], [1.03, -deep * 0.42], [0.96, -deep * 0.62]];
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < N; i++) {
      const [r0, y0] = prof[j], [r1, y1] = prof[j + 1], [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % N];
      const A = [ax * r0, y0, az * r0], B = [bx * r0, y0, bz * r0], C = [bx * r1, y1, bz * r1], D = [ax * r1, y1, az * r1];
      wall.push(...A, ...D, ...B, ...B, ...D, ...C);
      for (let k = 0; k < 2; k++) { c.copy(hash(Math.floor(i / 6), j) < 0.5 ? base : plate).offsetHSL(0, 0, (hash(i, j * 3 + k) - 0.5) * 0.06); for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    g.add(mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, side: THREE.DoubleSide }), false));
  }
  if (old) {                                                  // an old one: moss and small stones settled along its band
    const moss = new THREE.MeshStandardMaterial({ color: 0x7a9a52, flatShading: true, roughness: 1 });
    for (let i = 0; i < N; i += domed ? 1 : 3) {
      if (hash(i, 7) < 0.55) continue;
      const [x, z] = outline[i], m = mesh(new THREE.IcosahedronGeometry(1, 0), moss);
      const s0 = (domed ? b * 0.05 : Math.max(a, b) * 0.01) * (0.6 + hash(i, 2));
      m.scale.set(s0 * 1.6, s0 * 0.45, s0 * 1.6); m.position.set(x * (domed ? 1.06 : 1.02), rimTop + s0 * 0.1, z * (domed ? 1.06 : 1.02)); g.add(m);
    }
  }

  // ---------------- the animal: head, flippers, tail ----------------
  const P = animal(L, u, young, old), front = outline[0][0];
  // where the animal joins the shell. A lone turtle (Pell) rests on its belly on the ground with its head up over the band. An island turtle swims:
  // everything joins the shell just under the water, and the head is held low, its crown always below the sea
  const join = domed ? deep * 0.02 : -Math.min(deep * 0.3, 6);
  const neck = new THREE.Group(); g.add(neck);
  neck.position.set(front * (domed ? 0.9 : 0.93), domed ? join : -(u * 0.36 + 2), 0);       // an island turtle's neck leaves the shell low, so even its thick root stays under the sea
  const headAt = domed ? new THREE.Vector3(u * 0.62, P.hy * 0.95, 0) : new THREE.Vector3(u * 0.66, -(P.hy * 1.35 + 3) + (u * 0.36 + 2), 0);
  // the neck: a thick tapered column from inside the shell out to the back of the head, so the head is always joined on
  { const len = headAt.length(), col = mesh(painted(rough(new THREE.CylinderGeometry(u * 0.27, u * 0.33, len, 10, 3), 0.03), L.skin, 0.03), P.head.children[0].material);
    col.position.copy(headAt).multiplyScalar(0.5); col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), headAt.clone().normalize()); neck.add(col);
    neck.add(P.neck); P.neck.position.set(0, 0, 0); }
  const head = new THREE.Group(); neck.add(head);
  head.position.copy(headAt);
  head.add(P.head);
  const legs = P.legs;
  for (const f of legs) {
    // front flippers at the shoulders, back ones at the hips, rooted just inside the shell's edge
    const ang = f.front ? f.side * 0.62 : Math.PI - f.side * 0.72, i = Math.round(((ang / (Math.PI * 2)) % 1 + 1) % 1 * N) % N, [sx, sz] = outline[i];
    f.pivot.position.set(sx * (domed ? 0.86 : 0.93), domed ? deep * 0.02 : join - 2.5, sz * (domed ? 0.86 : 0.93));
    f.sweep = -f.side * (f.front ? 0.5 : 1.05);
    f.pivot.rotation.y = f.sweep;
    g.add(f.pivot);
  }
  const tail = P.tail; tail.position.set(outline[N / 2][0] * (domed ? 0.98 : 0.97), domed ? join : join - u * 0.16 - 2, 0); g.add(tail);
  if (domed) { const lift = deep * 0.3; g.children.forEach((c) => { c.position.y += lift; }); }      // resting on its belly, flippers spread on the ground

  // ---------------- how it moves and what its face does ----------------
  const show = (list, on) => list.forEach((o) => { o.visible = on; });
  let face = "", blinkAt = 2 + hash(a, b) * 3, smileAt = 18 + hash(b, a) * 20;
  const lidRest = Math.min(0.6, M.lid + (old ? 0.18 : 0));
  const setFace = (f) => {
    if (f === face) return;
    face = f;
    show(P.eyes, f === "open"); show(P.shut, f === "sleep"); show(P.happy, f === "happy");
    for (const { lid } of P.lids) lid.visible = f === "open";
  };
  setFace("open");
  const pace = M.pace;
  return { group: g, head, neck, look: L, setFace, update(t, mood = {}) {
    const tt = t * pace, swim = Math.sin(tt * 0.32) * (mood.moored ? 0.35 : 1);
    // the flippers: the front pair beat slowly up and down together (a sea turtle's flight), the back pair steer, a little behind
    legs.forEach((f) => {
      const beat = f.front ? Math.sin(tt * 0.32) : Math.sin(tt * 0.32 - 1.2) * 0.4;
      f.pivot.rotation.y = f.sweep + (f.front ? -f.side * Math.cos(tt * 0.32) * 0.18 * (mood.moored ? 0.4 : 1) : 0);
      f.pivot.rotation.x = f.side * ((domed ? 0.05 : 0.1) + beat * (mood.moored ? 0.1 : 0.22));
    });
    neck.rotation.z = (M.lift + Math.sin(tt * 0.13) * 0.05 + (mood.asleep ? -0.2 : mood.rain ? 0.08 : 0)) * (domed ? 1 : 0.3);
    head.rotation.y = mood.asleep ? 0 : Math.sin(tt * 0.07) * M.look;
    head.rotation.x = Math.sin(tt * 0.11 + 1) * M.tilt + (mood.asleep ? -0.05 : 0);
    tail.rotation.y = Math.sin(tt * 0.3) * 0.25;
    // the face: asleep at night, a blink every few seconds, and now and then (often, for a cheerful one) a happy squint
    if (t > smileAt + 2.4) smileAt = t + (20 + hash(t, a) * 30) / (M.smiles || 1);
    if (t > blinkAt + 0.16) blinkAt = t + 2.5 + hash(t, b) * 4;
    setFace(mood.asleep ? "sleep" : mood.happy || (t > smileAt && !M.frown) ? "happy" : "open");
    const blink = face === "open" && t > blinkAt;
    for (const e of P.eyes) e.scale.y = blink ? 0.1 : 1;
    // the lids: how heavy they sit is the personality; a grumpy one's slope in toward the middle
    const drop = blink ? 1 : lidRest + Math.sin(t * 0.2) * 0.02;
    for (const { lid, side } of P.lids) {
      lid.position.y = P.eh * (1.08 - drop * 1.25);
      lid.rotation.z = M.frown ? side * 0.32 : 0;
      lid.visible = face === "open" && drop > 0.2;
    }
  } };
}
