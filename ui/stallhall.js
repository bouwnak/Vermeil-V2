// stallhall.js - the Community Stalls hall, drawn here (no model files).
// Every stall is a little market booth: a plank deck, panelled walls with an anime poster, a striped awning with a scalloped
// valance and a string of bulbs, a counter with a cloth skirt, and a sign board that reads the right way from both sides.
// The hall round them: a tiled floor with runners down every hallway and a medallion at each crossing, wood wainscot,
// skylights, triangle trusses over the hallways with festoon bulbs, bunting and paper lanterns, tall anime banners on the
// walls, and gacha corners and blossom planters at the crossings.
// All the anime art is original and painted on canvas here: no existing characters.
import * as THREE from "three";
import { Kit, canvasTex } from "./mainhub.js";

const TAU = Math.PI * 2, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function seeded(seed) { let h = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
const P = (label, make, extra = {}) => ({ label, mount: "floor", hubOnly: true, category: "hub", ...extra,
  build(ctx) { const group = new THREE.Group(); const ex = make(group, ctx.spec, ctx) || {}; return { group, ...ex }; } });
const pick = (arr, n) => arr[((Math.round(n) % arr.length) + arr.length) % arr.length];
/** decoration overhead or on the walls: clicks go through it to the floor */
const passThrough = (g) => { g.traverse((o) => { if (o.isMesh) o.raycast = () => {}; }); return g; };

// ---------------------------------------------------------------- colour
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const dk = (a, t = 0.35) => mix(a, "#1a1020", t);
const lt = (a, t = 0.4) => mix(a, "#ffffff", t);
const okHex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);

// ---------------------------------------------------------------- the anime art (original characters, drawn from shapes)
const HAIR = ["#ff7eb6", "#7ec8ff", "#ffd36e", "#b18cff", "#6be0c0", "#ff9a6b", "#f3eefc", "#3b3550", "#e8505b", "#58c98d", "#9fb4ff", "#ffb3c7"];
const EYES = ["#3fa9f5", "#e84393", "#8e44ad", "#27ae60", "#f39c12", "#e74c3c", "#16a085", "#5f7cff"];
const SKIN = ["#ffe8db", "#ffdcc6", "#f6cdb0", "#e9b996", "#ffe1d0"];
const OUTFIT = ["#2d3a6b", "#e8505b", "#1f8a70", "#5b3e96", "#26262e", "#f4f1ea", "#ff8fab", "#2f6fb0"];
const BGS = [["#ff9ac1", "#7b5cff"], ["#7ee0ff", "#3b6cff"], ["#ffd36e", "#ff6b8b"], ["#a0f0c8", "#2fa3a0"], ["#c6a6ff", "#ff7eb6"], ["#ffb37e", "#d6456b"], ["#8fd3ff", "#b48aff"], ["#ffe08a", "#58c98d"]];
const WORD_A = ["STAR", "NEON", "SAKURA", "MOON", "SKY", "CRYSTAL", "SOLAR", "PIXEL", "MAGIC", "COMET", "RAIN", "AURORA"];
const WORD_B = ["BLOSSOM", "DRIFT", "RONIN", "ARCADIA", "MELODY", "GUARDIANS", "IDOL", "QUEST", "PARADE", "HEARTS", "RUNNERS", "CAFE"];
const KANA = ["ほしぞら", "さくら", "ゆめのまち", "ひかり", "そらいろ", "つきよ", "にじいろ", "きらきら", "はなび", "なつまつり"];

function star(g, x, y, r, n = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}
function sparkle(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
}
function petal(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath(); g.moveTo(0, -r); g.bezierCurveTo(r * 0.9, -r * 0.6, r * 0.7, r * 0.6, 0, r); g.bezierCurveTo(-r * 0.7, r * 0.6, -r * 0.9, -r * 0.6, -r * 0.15, -r * 0.8); g.lineTo(0, -r * 0.6); g.closePath(); g.fill();
  g.restore();
}

/** the look of one character: everything picked from the seed */
function characterOf(seed) {
  const r = seeded(seed * 7919 + 17);
  const p = (a) => a[Math.floor(r() * a.length)];
  return {
    hair: p(HAIR), eye: p(EYES), skin: p(SKIN), outfit: p(OUTFIT), accent: p(["#ff4f8b", "#ffd23f", "#38d6ff", "#7cf29a", "#b48aff", "#ff8a3d"]),
    style: p(["long", "twin", "short", "pony", "long", "twin"]), acc: p(["cat", "ribbon", "phones", "clip", "none", "horns", "cat", "ribbon"]),
    mouth: p(["smile", "open", "cat", "smile", "open"]), wear: p(["sailor", "jacket", "sailor", "hoodie"]), ahoge: r() < 0.6, wink: r() < 0.18,
    bg: p(BGS), title: `${p(WORD_A)} ${p(WORD_B)}`, kana: p(KANA), r,
  };
}

/** a character, head centred on cx, cy, head radius R; the body runs down to `bottom` */
function drawCharacter(g, cx, cy, R, o, bottom) {
  const { hair, eye, skin, outfit, accent } = o, hairD = dk(hair, 0.32), line = dk(hair, 0.62), skinL = dk(skin, 0.42);
  g.lineJoin = "round"; g.lineCap = "round";
  const path = (pts, close = true) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * R, cy + y * R) : g.moveTo(cx + x * R, cy + y * R))); if (close) g.closePath(); };
  const fillStroke = (fill, stroke = line, w = 0.03) => { g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = w * R; g.stroke(); };

  // tails and the hair that hangs behind
  if (o.style === "twin") for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + s * 0.8 * R, cy - 0.7 * R);
    g.bezierCurveTo(cx + s * 2.0 * R, cy - 0.6 * R, cx + s * 2.05 * R, cy + 1.5 * R, cx + s * 1.45 * R, cy + 2.7 * R);
    g.bezierCurveTo(cx + s * 1.5 * R, cy + 1.7 * R, cx + s * 1.1 * R, cy + 0.6 * R, cx + s * 0.78 * R, cy - 0.05 * R);
    g.closePath(); fillStroke(hair);
    g.strokeStyle = hairD; g.lineWidth = 0.025 * R;
    for (const k of [0.35, 0.6]) { g.beginPath(); g.moveTo(cx + s * (0.95 + k * 0.4) * R, cy - 0.4 * R); g.quadraticCurveTo(cx + s * (1.5 + k * 0.3) * R, cy + 0.9 * R, cx + s * (1.35 + k * 0.12) * R, cy + 2.2 * R); g.stroke(); }
  }
  if (o.style === "pony") {
    g.beginPath(); g.moveTo(cx + 0.5 * R, cy - 0.95 * R);
    g.bezierCurveTo(cx + 2.0 * R, cy - 1.3 * R, cx + 1.9 * R, cy + 0.6 * R, cx + 1.25 * R, cy + 1.9 * R);
    g.bezierCurveTo(cx + 1.35 * R, cy + 0.6 * R, cx + 1.05 * R, cy - 0.3 * R, cx + 0.6 * R, cy - 0.55 * R);
    g.closePath(); fillStroke(hair);
  }
  const backLen = o.style === "long" ? 2.1 : o.style === "short" ? 0.75 : 1.0;
  g.beginPath(); g.moveTo(cx - 1.12 * R, cy - 0.1 * R); g.arc(cx, cy - 0.1 * R, 1.12 * R, Math.PI, 0);
  g.lineTo(cx + 1.18 * R, cy + backLen * R);
  for (let i = 1; i <= 8; i++) { const x = 1.18 - (2.36 * i) / 8; g.lineTo(cx + (x + 2.36 / 16) * R, cy + (backLen + (i % 2 ? 0.18 : 0.05)) * R); g.lineTo(cx + x * R, cy + backLen * R); }
  g.closePath(); fillStroke(hairD);

  // the body: shoulders, neck, collar
  const sy = cy + 1.32 * R;
  g.beginPath(); g.moveTo(cx - 1.75 * R, bottom); g.lineTo(cx - 1.6 * R, sy + 0.55 * R); g.quadraticCurveTo(cx - 1.45 * R, sy + 0.02 * R, cx - 0.55 * R, sy - 0.06 * R);
  g.lineTo(cx + 0.55 * R, sy - 0.06 * R); g.quadraticCurveTo(cx + 1.45 * R, sy + 0.02 * R, cx + 1.6 * R, sy + 0.55 * R); g.lineTo(cx + 1.75 * R, bottom); g.closePath();
  fillStroke(outfit, dk(outfit, 0.55));
  g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(cx - 1.8 * R, sy + 0.9 * R, 3.6 * R, bottom - sy);
  path([[-0.22, 0.7], [0.22, 0.7], [0.24, 1.42], [-0.24, 1.42]]); fillStroke(skin, skinL, 0.02);
  g.fillStyle = "rgba(150,70,70,.22)"; g.beginPath(); g.ellipse(cx, cy + 0.9 * R, 0.24 * R, 0.12 * R, 0, 0, TAU); g.fill();
  if (o.wear === "sailor") {
    path([[-0.62, 1.24], [0, 2.0], [0.62, 1.24], [1.25, 1.36], [0.0, 2.35], [-1.25, 1.36]]); fillStroke("#f6f3ee", "#9b97a6", 0.02);
    g.strokeStyle = accent; g.lineWidth = 0.05 * R; path([[-1.1, 1.42], [0, 2.22], [1.1, 1.42]], false); g.stroke();
    g.fillStyle = accent; path([[0, 1.95], [-0.36, 1.8], [-0.3, 2.25]]); g.fill(); path([[0, 1.95], [0.36, 1.8], [0.3, 2.25]]); g.fill();
    g.beginPath(); g.arc(cx, cy + 1.97 * R, 0.08 * R, 0, TAU); g.fill();
  } else if (o.wear === "jacket") {
    path([[-0.3, 1.26], [0, 1.75], [0.3, 1.26], [0.25, 1.24]]); fillStroke("#f6f3ee", "#9b97a6", 0.02);
    g.strokeStyle = dk(outfit, 0.6); g.lineWidth = 0.035 * R; path([[-0.55, 1.26], [-0.12, 2.3]], false); g.stroke(); path([[0.55, 1.26], [0.12, 2.3]], false); g.stroke();
    g.fillStyle = accent; star(g, cx - 0.9 * R, cy + 1.85 * R, 0.13 * R); g.fill();
  } else {
    g.fillStyle = dk(outfit, 0.18); g.beginPath(); g.ellipse(cx, sy + 0.02 * R, 0.85 * R, 0.22 * R, 0, 0, TAU); g.fill();
    g.strokeStyle = "#f6f3ee"; g.lineWidth = 0.03 * R; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 0.25 * R, sy + 0.1 * R); g.lineTo(cx + s * 0.3 * R, sy + 0.7 * R); g.stroke(); }
    g.fillStyle = accent; g.font = `900 ${0.42 * R}px system-ui, sans-serif`; g.textAlign = "center"; g.fillText("★", cx, sy + 1.05 * R);
  }

  // ears that come up through the hair go behind its front
  if (o.acc === "cat") for (const s of [-1, 1]) {
    path([[s * 0.98, -0.6], [s * 0.92, -1.72], [s * 0.3, -1.05]]); fillStroke(hair);
    path([[s * 0.86, -0.82], [s * 0.86, -1.48], [s * 0.48, -1.06]]); g.fillStyle = "#ffb6cf"; g.fill();
  }
  if (o.acc === "horns") for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + s * 0.55 * R, cy - 0.95 * R); g.quadraticCurveTo(cx + s * 0.85 * R, cy - 1.45 * R, cx + s * 0.62 * R, cy - 1.75 * R);
    g.quadraticCurveTo(cx + s * 0.6 * R, cy - 1.35 * R, cx + s * 0.3 * R, cy - 1.05 * R); g.closePath(); fillStroke("#3a2f45", "#1d1626");
  }

  // the face
  g.beginPath(); g.moveTo(cx - R, cy - 0.1 * R); g.arc(cx, cy - 0.1 * R, R, Math.PI, 0);
  g.bezierCurveTo(cx + R, cy + 0.45 * R, cx + 0.52 * R, cy + 0.86 * R, cx, cy + 0.98 * R);
  g.bezierCurveTo(cx - 0.52 * R, cy + 0.86 * R, cx - R, cy + 0.45 * R, cx - R, cy - 0.1 * R);
  fillStroke(skin, skinL, 0.025);
  // eyes: big, with a gradient iris, a dark pupil, two lights and a heavy upper lash
  for (const s of [-1, 1]) {
    const ex = cx + s * 0.41 * R, ey = cy + 0.27 * R, ew = 0.37 * R, eh = 0.46 * R;
    if (o.wink && s === 1) {
      g.strokeStyle = "#2a1a2e"; g.lineWidth = 0.06 * R; g.beginPath(); g.moveTo(ex - ew * 0.55, ey); g.quadraticCurveTo(ex, ey + eh * 0.35, ex + ew * 0.6, ey - eh * 0.05); g.stroke();
      continue;
    }
    g.save();
    g.beginPath(); g.ellipse(ex, ey, ew / 2, eh / 2, 0, 0, TAU); g.fillStyle = "#ffffff"; g.fill(); g.clip();
    const ig = g.createLinearGradient(0, ey - eh / 2, 0, ey + eh / 2);
    ig.addColorStop(0, dk(eye, 0.65)); ig.addColorStop(0.5, eye); ig.addColorStop(1, lt(eye, 0.6));
    g.fillStyle = ig; g.beginPath(); g.ellipse(ex + s * 0.015 * R, ey + 0.04 * R, ew * 0.43, eh * 0.47, 0, 0, TAU); g.fill();
    g.strokeStyle = dk(eye, 0.7); g.lineWidth = 0.02 * R; g.stroke();
    g.fillStyle = dk(eye, 0.78); g.beginPath(); g.ellipse(ex + s * 0.015 * R, ey + 0.03 * R, ew * 0.19, eh * 0.23, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(ex, ey + eh * 0.28, ew * 0.3, eh * 0.1, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(70,30,70,.28)"; g.fillRect(ex - ew, ey - eh / 2, ew * 2, eh * 0.2);
    g.restore();
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(ex - 0.07 * R, ey - 0.07 * R, 0.075 * R, 0, TAU); g.fill();
    g.beginPath(); g.arc(ex + 0.075 * R, ey + 0.1 * R, 0.035 * R, 0, TAU); g.fill();
    g.strokeStyle = "#2a1a2e"; g.lineWidth = 0.07 * R;
    g.beginPath(); g.moveTo(ex - s * ew * 0.58, ey - eh * 0.2); g.quadraticCurveTo(ex - s * ew * 0.05, ey - eh * 0.68, ex + s * ew * 0.62, ey - eh * 0.3); g.stroke();
    g.lineWidth = 0.04 * R; g.beginPath(); g.moveTo(ex + s * ew * 0.6, ey - eh * 0.3); g.lineTo(ex + s * ew * 0.82, ey - eh * 0.42); g.stroke();
    g.lineWidth = 0.022 * R; g.beginPath(); g.moveTo(ex - ew * 0.22, ey + eh * 0.52); g.lineTo(ex + ew * 0.24, ey + eh * 0.5); g.stroke();
  }
  // blush, nose, mouth
  for (const s of [-1, 1]) {
    g.fillStyle = "rgba(255,105,140,.38)"; g.beginPath(); g.ellipse(cx + s * 0.56 * R, cy + 0.56 * R, 0.17 * R, 0.075 * R, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 0.018 * R;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx + (s * 0.56 + k * 0.07 - 0.02) * R, cy + 0.6 * R); g.lineTo(cx + (s * 0.56 + k * 0.07 + 0.03) * R, cy + 0.52 * R); g.stroke(); }
  }
  g.strokeStyle = skinL; g.lineWidth = 0.02 * R; g.beginPath(); g.moveTo(cx + 0.02 * R, cy + 0.5 * R); g.lineTo(cx - 0.01 * R, cy + 0.54 * R); g.stroke();
  g.strokeStyle = "#7a2c3c"; g.lineWidth = 0.028 * R;
  if (o.mouth === "open") {
    g.beginPath(); g.moveTo(cx - 0.11 * R, cy + 0.66 * R); g.quadraticCurveTo(cx, cy + 0.86 * R, cx + 0.11 * R, cy + 0.66 * R); g.closePath();
    g.fillStyle = "#a8344a"; g.fill(); g.stroke();
    g.fillStyle = "#ff8fa3"; g.beginPath(); g.ellipse(cx, cy + 0.76 * R, 0.06 * R, 0.035 * R, 0, 0, TAU); g.fill();
  } else if (o.mouth === "cat") {
    g.beginPath(); g.arc(cx - 0.055 * R, cy + 0.66 * R, 0.055 * R, 0.1 * Math.PI, 0.95 * Math.PI); g.stroke();
    g.beginPath(); g.arc(cx + 0.055 * R, cy + 0.66 * R, 0.055 * R, 0.05 * Math.PI, 0.9 * Math.PI); g.stroke();
  } else { g.beginPath(); g.arc(cx, cy + 0.6 * R, 0.1 * R, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke(); }

  // the fringe and the side locks, then a shine band across the top
  const r = o.r, tip = () => (r() - 0.5) * 0.1;
  const fringe = [[1.13, -0.12], [1.1, 0.35], [0.98, 1.0], [0.84, 0.38], [0.72, -0.08], [0.58, 0.08 + tip()], [0.42, -0.22], [0.25, 0.04 + tip()], [0.1, -0.26],
    [-0.06, 0.06 + tip()], [-0.24, -0.24], [-0.42, 0.08 + tip()], [-0.6, -0.12], [-0.74, 0.12], [-0.84, 0.38], [-0.98, 1.0], [-1.1, 0.35], [-1.13, -0.12]];
  g.beginPath(); g.moveTo(cx - 1.13 * R, cy - 0.12 * R); g.arc(cx, cy - 0.12 * R, 1.13 * R, Math.PI, 0);
  for (const [x, y] of fringe) g.lineTo(cx + x * R, cy + y * R);
  g.closePath(); fillStroke(hair);
  g.strokeStyle = hairD; g.lineWidth = 0.022 * R;
  for (const [x0, x1] of [[0.5, 0.58], [0.15, 0.25], [-0.2, -0.06], [-0.5, -0.42], [0.85, 0.95], [-0.85, -0.95]]) { g.beginPath(); g.moveTo(cx + x0 * 0.8 * R, cy - 0.75 * R); g.quadraticCurveTo(cx + x0 * R, cy - 0.3 * R, cx + x1 * R, cy - 0.02 * R); g.stroke(); }
  g.save(); g.setLineDash([0.16 * R, 0.07 * R]); g.strokeStyle = "rgba(255,255,255,.42)"; g.lineWidth = 0.1 * R;
  g.beginPath(); g.arc(cx, cy - 0.12 * R, 0.82 * R, Math.PI + 0.55, TAU - 0.55); g.stroke(); g.restore();
  if (o.ahoge) { g.beginPath(); g.moveTo(cx + 0.05 * R, cy - 1.18 * R); g.bezierCurveTo(cx + 0.2 * R, cy - 1.75 * R, cx + 0.6 * R, cy - 1.8 * R, cx + 0.55 * R, cy - 1.55 * R); g.bezierCurveTo(cx + 0.45 * R, cy - 1.65 * R, cx + 0.3 * R, cy - 1.55 * R, cx + 0.22 * R, cy - 1.16 * R); g.closePath(); fillStroke(hair); }

  // what they wear in their hair
  if (o.acc === "ribbon") {
    const bx = cx + 0.72 * R, by = cy - 0.92 * R;
    path([[0.72, -0.92], [1.12, -1.25], [1.15, -0.72]]); fillStroke(accent, dk(accent, 0.5));
    path([[0.72, -0.92], [0.32, -1.25], [0.32, -0.74]]); fillStroke(accent, dk(accent, 0.5));
    g.beginPath(); g.arc(bx, by, 0.09 * R, 0, TAU); fillStroke(lt(accent, 0.2), dk(accent, 0.5));
  } else if (o.acc === "phones") {
    g.strokeStyle = "#2b2733"; g.lineWidth = 0.13 * R; g.beginPath(); g.arc(cx, cy - 0.05 * R, 1.2 * R, Math.PI + 0.2, TAU - 0.2); g.stroke();
    for (const s of [-1, 1]) {
      g.fillStyle = "#2b2733"; g.beginPath(); g.ellipse(cx + s * 1.1 * R, cy + 0.08 * R, 0.2 * R, 0.32 * R, 0, 0, TAU); g.fill();
      g.fillStyle = accent; g.beginPath(); g.ellipse(cx + s * 1.13 * R, cy + 0.08 * R, 0.12 * R, 0.22 * R, 0, 0, TAU); g.fill();
    }
  } else if (o.acc === "clip") {
    g.fillStyle = "#ffd23f"; g.strokeStyle = "#b8860b"; g.lineWidth = 0.02 * R; star(g, cx - 0.62 * R, cy - 0.48 * R, 0.16 * R); g.fill(); g.stroke();
    g.fillStyle = accent; star(g, cx - 0.38 * R, cy - 0.66 * R, 0.08 * R); g.fill();
  }
}

/** a whole picture: background, the character, the title. Tall (banner) or poster shaped. */
function paintArt(g, W, H, seed, { banner = false } = {}) {
  const o = characterOf(seed), r = seeded(seed * 31 + 5);
  const [b1, b2] = o.bg;
  const bg = g.createLinearGradient(0, 0, W * 0.4, H); bg.addColorStop(0, b1); bg.addColorStop(1, b2); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * (banner ? 0.36 : 0.37), R = W * (banner ? 0.19 : 0.2);
  g.save(); g.translate(cx, cy);                                            // speed lines out of the middle
  for (let i = 0; i < 60; i++) { g.rotate(TAU / 60); g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.beginPath(); g.moveTo(0, -R * 1.8); g.lineTo(-R * 0.06, -H); g.lineTo(R * 0.06, -H); g.fill(); }
  g.restore();
  g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.arc(cx, cy - R * 0.2, R * 1.95, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = R * 0.04; g.beginPath(); g.arc(cx, cy - R * 0.2, R * 2.15, 0, TAU); g.stroke();
  for (let y = 0; y < H; y += 12) for (let x = 0; x < W; x += 12) {          // halftone dots, thicker towards one corner
    const d = Math.hypot(x - W, y - H * 0.15) / W, s = Math.max(0, 1 - d) * 4.2;
    if (s > 0.3) { g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.arc(x + ((y / 12) % 2) * 6, y, s, 0, TAU); g.fill(); }
  }
  g.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 16; i++) sparkle(g, r() * W, r() * H * 0.75, 3 + r() * R * 0.12);
  g.fillStyle = "rgba(255,200,220,.85)";
  for (let i = 0; i < 22; i++) petal(g, r() * W, r() * H * 0.85, 4 + r() * R * 0.07, r() * TAU);
  const bandTop = H * (banner ? 0.78 : 0.8);
  drawCharacter(g, cx, cy, R, o, bandTop + 4);
  // the title band
  const band = g.createLinearGradient(0, bandTop, 0, H); band.addColorStop(0, "rgba(20,10,40,.86)"); band.addColorStop(1, "rgba(10,5,25,.96)");
  g.fillStyle = band; g.fillRect(0, bandTop, W, H - bandTop);
  g.fillStyle = o.accent; g.fillRect(0, bandTop, W, Math.max(3, H * 0.006));
  g.textAlign = "center"; g.textBaseline = "middle";
  let fs = (H - bandTop) * 0.36; g.font = `900 ${fs}px "Arial Black", Impact, system-ui, sans-serif`;
  const tw = g.measureText(o.title).width; if (tw > W * 0.9) { fs *= (W * 0.9) / tw; g.font = `900 ${fs}px "Arial Black", Impact, system-ui, sans-serif`; }
  const ty = bandTop + (H - bandTop) * 0.4;
  g.lineWidth = fs * 0.22; g.strokeStyle = o.accent; g.strokeText(o.title, cx, ty);
  g.fillStyle = "#ffffff"; g.fillText(o.title, cx, ty);
  g.font = `700 ${(H - bandTop) * 0.17}px "Yu Gothic", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
  g.fillStyle = lt(o.accent, 0.3); g.fillText(`${o.kana}  ·  EP ${1 + Math.floor(r() * 12)}`, cx, bandTop + (H - bandTop) * 0.76);
  if (banner) {                                                               // a header strip with little stars
    g.fillStyle = "rgba(20,10,40,.55)"; g.fillRect(0, 0, W, H * 0.07);
    g.font = `800 ${H * 0.032}px system-ui, sans-serif`; g.fillStyle = "#ffffff"; g.fillText(`★  ${o.kana}  ★`, cx, H * 0.037);
  }
  g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = Math.max(4, W * 0.014); g.strokeRect(g.lineWidth / 2 + W * 0.02, g.lineWidth / 2 + W * 0.02, W - g.lineWidth - W * 0.04, H - g.lineWidth - W * 0.04);
}

// ---------------------------------------------------------------- textures and materials
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const glowMat = (color, k = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.6 });
const shared = (m) => { m.userData.shared = true; return m; };
const PLANKS = () => canvasTex(512, 512, (g, w, h) => {
  const r = seeded(77);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(${26 + r() * 8},${34 + r() * 10}%,${50 + r() * 9}%)`; g.fillRect(0, i * 64, w, 64);
    for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? "70,40,20" : "255,240,220"},${0.06 + r() * 0.08})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = i * 64 + r() * 64; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 6 - 3, w * 0.7, y + r() * 6 - 3, w, y + r() * 4 - 2); g.stroke(); }
    g.fillStyle = "rgba(50,28,14,.7)"; g.fillRect(0, i * 64, w, 3); g.fillRect(r() * w, i * 64, 3, 64);
  }
});
const SLATS = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#efe4d2"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 25.6) { g.fillStyle = "rgba(120,90,60,.28)"; g.fillRect(0, y, w, 4); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(0, y + 4, w, 2); }
});
const BOARDS = () => canvasTex(512, 256, (g, w, h) => {                    // the wainscot: tall boards
  const r = seeded(15);
  for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(28,${30 + r() * 8}%,${34 + r() * 7}%)`; g.fillRect(x, 0, 32, h); g.fillStyle = "rgba(30,15,5,.55)"; g.fillRect(x, 0, 2, h); }
  g.fillStyle = "rgba(255,230,200,.08)"; g.fillRect(0, 0, w, h * 0.1);
}, { repeat: [1, 1] });
function stripeTex(col) {
  return canvasTex(256, 128, (g, w, h) => {
    const n = 8; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? "#fbf5ea" : col; g.fillRect((i * w) / n, 0, w / n, h); }
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, "rgba(0,0,0,.12)"); sh.addColorStop(0.5, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.1)"); g.fillStyle = sh; g.fillRect(0, 0, w, h);
  });
}

let SM = null;
function sm() {
  if (SM) return SM;
  SM = {
    deck: std(0xffffff, { map: PLANKS(), roughness: 0.7 }), wood: std(0xb98a5e, { roughness: 0.7 }), dark: std(0x3b2a20, { roughness: 0.8 }),
    panel: std(0xffffff, { map: SLATS(), roughness: 0.85 }), top: std(0xe9d6b6, { roughness: 0.45 }), metal: std(0x2c2c33, { roughness: 0.4, metalness: 0.6 }),
    white: std(0xfaf5ec, { roughness: 0.9, side: THREE.DoubleSide }), cable: std(0x1d1b1f, { roughness: 0.9 }), bulb: new THREE.MeshBasicMaterial({ color: 0xffdf9e }),
    gold: std(0xd9a441, { roughness: 0.35, metalness: 0.7 }), boards: std(0xffffff, { map: BOARDS(), roughness: 0.75 }), steel: std(0x4a4d57, { roughness: 0.45, metalness: 0.55 }),
    sky: new THREE.MeshBasicMaterial({ color: 0xfff7e8 }), glass: new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    soil: std(0x3d2a1e, { roughness: 1 }), bark: std(0x5a3d2b, { roughness: 0.9, flatShading: true }),
    leaf: ["#ffc2d6", "#ffadc8", "#ffd6e4", "#f79ab8"].map((c) => std(new THREE.Color(c), { roughness: 0.8, flatShading: true })),
    goods: ["#e8505b", "#f2c94c", "#56ccf2", "#6fcf97", "#bb6bd9", "#f2994a", "#ffffff"].map((c) => std(new THREE.Color(c), { roughness: 0.6 })),
    lantern: ["#ff8fab", "#ffb35c", "#fff1c9", "#ff6b6b"].map((c) => glowMat(new THREE.Color(c), 1.15)),
  };
  for (const m of Object.values(SM).flat()) if (m?.isMaterial) shared(m);
  // small details don't cast shadows: 80 stalls x a dozen tiny meshes would double the draw calls for no visible gain
  for (const m of [SM.white, SM.cable, SM.bulb, SM.gold, SM.top, SM.sky, SM.glass, ...SM.goods, ...SM.lantern]) m.userData.noShadow = true;
  return SM;
}
const COLS = new Map();                                                      // per stall colour: solid, awning, lantern
function cm(col) {
  if (!COLS.has(col)) {
    const c = new THREE.Color(col);
    COLS.set(col, {
      solid: shared(std(c, { roughness: 0.6 })),
      deep: shared(std(new THREE.Color(dk(col, 0.3)), { roughness: 0.7 })),
      cloth: shared(std(new THREE.Color(lt(col, 0.1)), { roughness: 0.95, side: THREE.DoubleSide })),
      awning: shared(std(0xffffff, { map: stripeTex(col), roughness: 0.9, side: THREE.DoubleSide })),
      carpet: shared(std(new THREE.Color(lt(col, 0.55)), { roughness: 1 })),
    });
    const C = COLS.get(col); for (const m of [C.deep, C.cloth, C.carpet]) m.userData.noShadow = true;
  }
  return COLS.get(col);
}
const POSTERS = new Map();                                                   // a few posters, shared by every stall
function posterMat(n) {
  const k = ((n % 16) + 16) % 16;
  if (!POSTERS.has(k)) { const pm = shared(std(0xffffff, { map: canvasTex(384, 576, (g, w, h) => paintArt(g, w, h, 300 + k)), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08 })); pm.userData.noShadow = true; POSTERS.set(k, pm); }
  return POSTERS.get(k);
}

/** a sign that reads right from both sides: two one-sided planes back to back */
function twoSided(K, geoW, geoH, mat, o) {
  K.add(new THREE.PlaneGeometry(geoW, geoH), mat, { ...o, z: (o.z || 0) + (o.gap || 0.02), ry: o.ry || 0 });
  K.add(new THREE.PlaneGeometry(geoW, geoH), mat, { ...o, z: (o.z || 0) - (o.gap || 0.02), ry: (o.ry || 0) + Math.PI });
}
function signTex(text, sub, col, dark) {
  return canvasTex(768, 160, (g, w, h) => {
    const bg = dark ? "#2e2733" : col;
    g.fillStyle = dk(bg, 0.35); g.beginPath(); g.roundRect(0, 0, w, h, 26); g.fill();
    g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 20); g.fill();
    const gl = g.createLinearGradient(0, 8, 0, h * 0.5); gl.addColorStop(0, "rgba(255,255,255,.28)"); gl.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gl; g.fillRect(14, 12, w - 28, h * 0.4);
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.roundRect(20, 20, w - 40, h - 40, 14); g.stroke(); g.setLineDash([]);
    g.fillStyle = dark ? "#ffd23f" : "#ffffff"; star(g, 58, h / 2, 20); g.fill(); star(g, w - 58, h / 2, 20); g.fill();
    g.textAlign = "center"; g.textBaseline = "middle";
    let fs = sub ? 62 : 70; g.font = `900 ${fs}px system-ui, "Segoe UI", sans-serif`;
    const tw = g.measureText(text).width, room = w - 190; if (tw > room) { fs *= room / tw; g.font = `900 ${fs}px system-ui, "Segoe UI", sans-serif`; }
    g.lineWidth = fs * 0.16; g.strokeStyle = dk(bg, 0.5); g.strokeText(text, w / 2, sub ? h * 0.42 : h / 2);
    g.fillStyle = "#ffffff"; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = `800 30px system-ui, sans-serif`; g.fillStyle = dark ? "#ffd23f" : lt(col, 0.75); g.fillText(sub, w / 2, h * 0.78); }
  });
}

// ---------------------------------------------------------------- shapes
/** a rod from a to b */
function rod(K, a, b, r, mat, n = 5) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const geo = new THREE.CylinderGeometry(r, r, len, n, 1, true);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return K.add(geo, mat);
}
/** a hanging string between a and b, sagging by sag: n + 1 points */
const sagLine = (a, b, sag, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector3().lerpVectors(a, b, t).add(V(0, -sag * 4 * t * (1 - t), 0)); });
function cable(K, pts, r, mat) { for (let i = 0; i < pts.length - 1; i++) rod(K, pts[i], pts[i + 1], r, mat, 4); }
const LANTERN = (() => { const pts = [[0.02, -0.3], [0.16, -0.26], [0.25, -0.14], [0.28, 0], [0.25, 0.14], [0.16, 0.26], [0.02, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)); return () => new THREE.LatheGeometry(pts, 14); })();
function paperLantern(K, M, x, y, z, s, mat) {
  K.add(LANTERN(), mat, { x, y, z, s });
  for (const dy of [-0.3, 0.3]) K.cyl(0.09 * s, 0.09 * s, 0.05 * s, M.dark, { x, y: y + dy * s, z }, 10);
  for (let i = 0; i < 4; i++) K.add(new THREE.TorusGeometry(0.27, 0.006, 3, 18), M.dark, { x, y: y + (i - 1.5) * 0.11 * s, z, rx: Math.PI / 2, s: s * Math.cos((i - 1.5) * 0.36) });
}
function blobGeo(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = Math.sin(x * 9.1 + seed) * Math.cos(z * 7.3 - seed) * Math.sin(y * 5.7 + seed * 2); const k = 1 + 0.18 * s; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- the catalog
const STALL_PALETTE = ["#e8798f", "#f29e4c", "#e9b93a", "#5fbf8a", "#4fb0e0", "#8f7cf0", "#e57fc6", "#43a7a0", "#f0705a", "#7c9cf2"];
export const STALL_CATALOG = {
  hubStall: P("Stall", (g, s) => {
    const M = sm(), K = new Kit(), rented = !!s.name, idx = s.idx || 0;
    const col = rented ? okHex(s.color, "#e8798f") : pick(STALL_PALETTE, idx), C = cm(col), sx = s.side === "r" ? 1 : -1;
    // the deck, its rim and (rented) a rug
    K.box(2.96, 0.1, 2.96, M.deck, { y: 0.05 });
    for (const [w, d, x, z] of [[3, 0.06, 0, 1.47], [3, 0.06, 0, -1.47], [0.06, 3, 1.47, 0], [0.06, 3, -1.47, 0]]) K.box(w, 0.13, d, M.dark, { x, y: 0.065, z });
    if (rented) K.box(2.3, 0.012, 1.7, C.carpet, { y: 0.106, z: -0.3 });
    // the back wall and the side wall it shares with the next stall (each draws its own half, so nothing flickers)
    K.box(2.96, 2.75, 0.08, M.panel, { y: 1.475, z: -1.46 });
    K.box(3.0, 0.14, 0.1, C.solid, { y: 2.9, z: -1.45 });
    K.box(0.08, 2.75, 2.96, M.panel, { x: sx * 1.46, y: 1.475 });
    K.box(0.1, 0.14, 3.0, C.solid, { x: sx * 1.45, y: 2.9 });
    for (const [w, d, x, z] of [[2.96, 0.03, 0, -1.41], [0.03, 2.96, sx * 1.41, 0]]) K.box(w, 0.1, d, M.wood, { x, y: 0.62, z });   // a chair rail
    // a poster on the back wall, in a frame, with bunting along the top
    K.box(1.1, 1.58, 0.04, M.dark, { y: 1.98, z: -1.4 });
    K.add(new THREE.PlaneGeometry(0.98, 1.47), posterMat(idx * 5 + (rented ? 3 : 0)), { y: 1.98, z: -1.377 });
    for (let i = 0; i < 9; i++) {
      const x = -1.36 + i * 0.34, tri = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.2, 0], 3));
      tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2)); tri.computeVertexNormals();
      K.add(tri, i % 2 ? M.white : C.cloth, { x, y: 2.78, z: -1.39 });
    }
    // shelves on the side wall with jars and boxes
    for (const y of [1.25, 1.75]) {
      K.box(0.26, 0.04, 1.7, M.wood, { x: sx * 1.28, y, z: -0.45 });
      for (let k = 0; k < 6; k++) {
        const z = -1.18 + k * 0.29, m = M.goods[(idx * 3 + (y > 1.5 ? 2 : 0)) % M.goods.length];
        if ((k + idx) % 3 === 0) K.cyl(0.07, 0.07, 0.17, m, { x: sx * 1.28, y: y + 0.105, z }, 10);
        else K.box(0.16, 0.12 + ((k * 7 + idx) % 3) * 0.04, 0.16, m, { x: sx * 1.28, y: y + 0.08 + ((k * 7 + idx) % 3) * 0.02, z });
      }
    }
    // posts, the awning, its scalloped valance, the bulbs along the front
    for (const [x, z] of [[1.4, 1.4], [-1.4, 1.4], [-sx * 1.4, -1.4]]) K.box(0.09, 2.8, 0.09, M.dark, { x, y: 1.5, z });
    const yb = 2.98, yf = 2.6, zb = -1.46, zf = 1.62, len = Math.hypot(zf - zb, yb - yf), tilt = Math.atan2(yb - yf, zf - zb);
    const aw = new THREE.PlaneGeometry(3.08, len, 1, 6).rotateX(-Math.PI / 2), ap = aw.attributes.position;
    for (let i = 0; i < ap.count; i++) { const t = (ap.getZ(i) + len / 2) / len; ap.setY(i, ap.getY(i) - Math.sin(t * Math.PI) * 0.06); }
    aw.computeVertexNormals();
    K.add(aw, C.awning, { y: (yb + yf) / 2, z: (zb + zf) / 2, rx: tilt });
    K.box(3.1, 0.14, 0.03, C.awning, { y: yf - 0.06, z: zf + 0.01 });
    for (let i = 0; i < 7; i++) K.add(new THREE.CircleGeometry(0.22, 12, Math.PI, Math.PI), i % 2 ? M.white : C.cloth, { x: -1.32 + i * 0.44, y: yf - 0.13, z: zf + 0.015 });
    const bulbs = sagLine(V(-1.42, 2.3, 1.5), V(1.42, 2.3, 1.5), 0.12, 10);
    cable(K, bulbs, 0.007, M.cable);
    for (const p of bulbs.slice(1, -1)) K.add(new THREE.IcosahedronGeometry(0.035, 1), M.bulb, { x: p.x, y: p.y - 0.045, z: p.z });
    // the counter: wood body, cloth skirt in the stall's colour, a worn top, a bell
    K.box(2.3, 0.82, 0.5, M.wood, { y: 0.51, z: 1.05 });
    K.box(2.34, 0.58, 0.02, rented ? C.solid : C.deep, { y: 0.52, z: 1.31 });
    for (let i = 0; i < 6; i++) K.add(new THREE.CircleGeometry(0.2, 10, Math.PI, Math.PI), i % 2 ? C.cloth : M.white, { x: -0.97 + i * 0.39, y: 0.81, z: 1.322 });
    K.box(2.46, 0.05, 0.64, M.top, { y: 0.945, z: 1.05 });
    K.cyl(0.07, 0.09, 0.06, M.gold, { x: 0.95, y: 1.0, z: 1.12 }, 12);
    K.add(new THREE.SphereGeometry(0.06, 10, 6, 0, TAU, 0, Math.PI / 2), M.gold, { x: 0.95, y: 1.03, z: 1.12 });
    // the sign board on top: a frame, and the name on both faces
    K.box(2.56, 0.6, 0.07, M.dark, { y: 3.02, z: 1.5 });
    for (const x of [-1.05, 1.05]) K.box(0.05, 0.3, 0.05, M.dark, { x, y: 2.62, z: 1.5 });
    const sign = std(0xffffff, { map: rented ? signTex(s.name, s.tagline || "", col, false) : signTex(`STALL ${idx + 1}`, "FOR RENT · make it yours", col, true), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.25 });
    sign.emissiveMap = sign.map; sign.userData.noShadow = true;
    twoSided(K, 2.44, 0.5, sign, { y: 3.02, z: 1.5, gap: 0.04 });
    K.into(g);
  }, { act: "stall", colliders: () => [[-1.5, -1.5, 1.5, 1.5]] }),

  /** the hall itself: floor, wainscot, skylights, trusses, festoon bulbs, bunting and lanterns */
  stHall: P("Hall", (g, s) => {
    const M = sm(), K = new Kit(), { W, D, back, size, hall, cols, rows, ceil } = s, step = size * 2 + hall;
    const xAisles = Array.from({ length: rows + 1 }, (_, r) => back + hall / 2 + r * step);
    const zAisles = Array.from({ length: cols + 1 }, (_, c) => -W / 2 + hall / 2 + c * step);
    // the floor
    const fw = 2048, fh = Math.round((2048 * D) / W), k = fw / W, X = (x) => (x + W / 2) * k, Z = (z) => (z - back) * k;
    const floorTex = canvasTex(fw, fh, (g2) => {
      const r = seeded(4);
      g2.fillStyle = "#d3c6b4"; g2.fillRect(0, 0, fw, fh);
      for (let i = 0; i < 26000; i++) { const l = 175 + r() * 60; g2.fillStyle = `rgba(${l},${l - 10},${l - 24},.35)`; g2.fillRect(r() * fw, r() * fh, 2, 2); }
      g2.strokeStyle = "rgba(95,70,48,.16)"; g2.lineWidth = 1.5;
      for (let x = 0; x <= W; x += 1) { g2.beginPath(); g2.moveTo(x * k, 0); g2.lineTo(x * k, fh); g2.stroke(); }
      for (let z = 0; z <= D; z += 1) { g2.beginPath(); g2.moveTo(0, z * k); g2.lineTo(fw, z * k); g2.stroke(); }
      const runner = (x0, z0, x1, z1) => {
        g2.fillStyle = "#ece0cc"; g2.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
        g2.fillStyle = "#b06f55";
        if (x1 - x0 > z1 - z0) { g2.fillRect(X(x0), Z(z0), (x1 - x0) * k, 0.09 * k); g2.fillRect(X(x0), Z(z1) - 0.09 * k, (x1 - x0) * k, 0.09 * k); }
        else { g2.fillRect(X(x0), Z(z0), 0.09 * k, (z1 - z0) * k); g2.fillRect(X(x1) - 0.09 * k, Z(z0), 0.09 * k, (z1 - z0) * k); }
      };
      for (const z of xAisles) runner(-W / 2 + 0.6, z - 0.95, W / 2 - 0.6, z + 0.95);
      for (const x of zAisles) runner(x - 0.95, back + 0.6, x + 0.95, back + D - 0.6);
      for (const z of xAisles) for (const x of zAisles) {
        const cx = X(x), cz = Z(z);
        for (const [rr, c] of [[1.75, "#b06f55"], [1.62, "#ece0cc"], [1.35, "#4e9c94"], [1.22, "#f3e9d8"], [0.55, "#e58fa8"]]) { g2.fillStyle = c; g2.beginPath(); g2.arc(cx, cz, rr * k, 0, TAU); g2.fill(); }
        g2.fillStyle = "#e58fa8"; star(g2, cx, cz, 1.1 * k, 8, 0.55); g2.fill();
        g2.fillStyle = "#fff6ea"; star(g2, cx, cz, 0.42 * k, 8, 0.5); g2.fill();
      }
    }, {});
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat);
    floor.position.set(0, 0.012, back + D / 2); floor.receiveShadow = true; floor.userData.floor = true; g.add(floor);
    // wainscot round the three walls
    K.box(W - 0.1, 1.3, 0.05, M.boards, { y: 0.65, z: back + 0.03 });
    for (const sxw of [-1, 1]) K.box(0.05, 1.3, D - 0.1, M.boards, { x: sxw * (W / 2 - 0.03), y: 0.65, z: back + D / 2 });
    K.box(W - 0.1, 0.08, 0.1, M.dark, { y: 1.33, z: back + 0.05 });
    for (const sxw of [-1, 1]) K.box(0.1, 0.08, D - 0.1, M.dark, { x: sxw * (W / 2 - 0.05), y: 1.33, z: back + D / 2 });
    // skylights over each long hallway
    for (const z of xAisles) {
      K.add(new THREE.PlaneGeometry(W - 6, 2.4).rotateX(Math.PI / 2), M.sky, { y: ceil - 0.015, z });
      for (let x = -W / 2 + 3; x <= W / 2 - 3 + 0.01; x += 2.55) K.box(0.08, 0.06, 2.5, M.steel, { x, y: ceil - 0.04, z });
      for (const dz of [-1.22, 1.22]) K.box(W - 6, 0.06, 0.08, M.steel, { y: ceil - 0.04, z: z + dz });
    }
    // trusses: triangles all the way along each long hallway, hung from the roof
    const ty = ceil - 0.95;
    for (const z of xAisles) {
      const a = (x) => V(x, ty - 0.2, z - 0.28), b = (x) => V(x, ty - 0.2, z + 0.28), c = (x) => V(x, ty + 0.26, z);
      const x0 = -W / 2 + 0.2, x1 = W / 2 - 0.2;
      for (const f of [a, b, c]) rod(K, f(x0), f(x1), 0.04, M.steel, 6);
      for (let x = x0, i = 0; x < x1 - 0.01; x += 0.6, i++) {
        const xn = Math.min(x1, x + 0.6);
        rod(K, a(x), c(xn), 0.016, M.steel); rod(K, b(x), c(xn), 0.016, M.steel); rod(K, a(x), b(xn), 0.016, M.steel);
        if (i % 10 === 0) { rod(K, a(x), b(x), 0.02, M.steel); rod(K, c(x), V(x, ceil, z), 0.012, M.steel, 4); }
      }
    }
    // festoon bulbs down every cross hallway, two strings crossing between the trusses
    const bulbGeo = () => new THREE.IcosahedronGeometry(0.06, 0);
    for (const x of zAisles) for (let i = 0; i < xAisles.length - 1; i++) {
      const z0 = xAisles[i] + 0.4, z1 = xAisles[i + 1] - 0.4;
      for (const [xa, xb] of [[x - 0.9, x + 0.9], [x + 0.9, x - 0.9]]) {
        const pts = sagLine(V(xa, ty - 0.22, z0), V(xb, ty - 0.22, z1), 0.85, 22);
        cable(K, pts, 0.008, M.cable);
        for (const p of pts.slice(1, -1)) K.add(bulbGeo(), M.bulb, { x: p.x, y: p.y - 0.07, z: p.z });
      }
    }
    // paper lanterns, three at every crossing, at different heights
    for (const z of xAisles) for (const [j, x] of zAisles.entries()) {
      [[-0.55, 0.0, 1.0], [0.5, 0.3, 0.8], [0.0, -0.55, 0.9]].forEach(([dx, dz, sc], q) => {
        const y = ty - 1.1 - q * 0.45;
        rod(K, V(x + dx, y + 0.3 * sc, z + dz), V(x + dx, ty - 0.2, z + dz), 0.006, M.cable, 3);
        paperLantern(K, M, x + dx, y, z + dz, sc, pick(M.lantern, j + q + Math.round(z)));
      });
    }
    const deco = new THREE.Group(); K.into(deco); passThrough(deco); g.add(deco);
    // bunting along both sides of each long hallway (vertex colours: one mesh for all the flags)
    const pos = [], colr = [], cc = ["#ff7eb6", "#ffd23f", "#38d6ff", "#7cf29a", "#b48aff", "#ff8a3d", "#ffffff"].map((c) => new THREE.Color(c));
    let n = 0;
    for (const z of xAisles) for (const dz of [-1.5, 1.5]) {
      const y0 = ty - 0.6;
      for (let x = -W / 2 + 0.6; x < W / 2 - 0.6; x += 0.42, n++) {
        const t = ((x + W / 2) % 4) / 4, y = y0 - Math.sin(t * Math.PI) * 0.35, c = cc[n % cc.length];
        pos.push(x - 0.15, y, z + dz, x + 0.15, y, z + dz, x, y - 0.38, z + dz);
        for (let q = 0; q < 3; q++) colr.push(c.r, c.g, c.b);
      }
      const ln = []; for (let x = -W / 2 + 0.6; x < W / 2 - 0.6; x += 0.5) { const t = ((x + W / 2) % 4) / 4; ln.push(V(x, y0 - Math.sin(t * Math.PI) * 0.35, z + dz)); }
      const K2 = new Kit(); cable(K2, ln, 0.005, M.cable); const lg = new THREE.Group(); K2.into(lg, { cast: false }); passThrough(lg); g.add(lg);
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); bg.computeVertexNormals();
    const flags = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
    flags.raycast = () => {}; g.add(flags);
  }, { flat: true }),

  /** a tall banner on a wall: a rod, the art, a weighted hem with tassels */
  stWallBanner: P("Wall banner", (g, s) => {
    const M = sm(), K = new Kit(), w = s.w || 2.6, h = s.h || 4.4, y0 = s.y0 ?? 1.5, top = y0 + h;
    const art = std(0xffffff, { map: canvasTex(448, Math.round((448 * h) / w), (c, cw, ch) => paintArt(c, cw, ch, s.n || 1, { banner: true })), roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.12 });
    art.emissiveMap = art.map;
    const cloth = new THREE.PlaneGeometry(w, h, 1, 12), p = cloth.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.05 + Math.sin(((p.getY(i) + h / 2) / h) * Math.PI * 3) * 0.025);
    cloth.computeVertexNormals();
    K.add(cloth, art, { y: y0 + h / 2, z: 0.06 });
    K.cyl(0.035, 0.035, w + 0.3, M.dark, { y: top + 0.04, z: 0.08, rz: Math.PI / 2 }, 10);
    K.cyl(0.03, 0.03, w + 0.1, M.dark, { y: y0 - 0.02, z: 0.08, rz: Math.PI / 2 }, 10);
    for (const sx of [-1, 1]) {
      K.add(new THREE.SphereGeometry(0.06, 12, 8), M.gold, { x: sx * (w / 2 + 0.17), y: top + 0.04, z: 0.08 });
      K.cyl(0.025, 0.07, 0.24, M.gold, { x: sx * (w / 2 - 0.05), y: y0 - 0.17, z: 0.1 }, 8);
      rod(K, V(sx * (w / 2 + 0.1), top + 0.06, 0.08), V(0, top + 0.6, 0.03), 0.008, M.cable, 4);
    }
    K.cyl(0.05, 0.05, 0.05, M.gold, { y: top + 0.62, z: 0.03, rx: Math.PI / 2 }, 10);
    K.into(g); passThrough(g);
  }, { flat: true }),

  /** a banner across a hallway: the words read right from both sides */
  stAisleBanner: P("Hall banner", (g, s) => {
    const M = sm(), K = new Kit(), w = 6.2, h = 0.95;
    const map = canvasTex(1280, 196, (c, cw, ch) => {
      const gr = c.createLinearGradient(0, 0, cw, 0); gr.addColorStop(0, "#5a3f96"); gr.addColorStop(0.5, "#8a4fb8"); gr.addColorStop(1, "#d0508a"); c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
      c.fillStyle = "rgba(255,255,255,.12)"; for (let x = -ch; x < cw; x += 40) { c.beginPath(); c.moveTo(x, ch); c.lineTo(x + ch, 0); c.lineTo(x + ch + 16, 0); c.lineTo(x + 16, ch); c.fill(); }
      c.strokeStyle = "#ffd23f"; c.lineWidth = 6; c.strokeRect(10, 10, cw - 20, ch - 20);
      c.fillStyle = "#ffd23f"; star(c, 70, ch / 2, 34); c.fill(); star(c, cw - 70, ch / 2, 34); c.fill();
      c.textAlign = "center"; c.textBaseline = "middle"; c.font = `900 96px system-ui, "Segoe UI", sans-serif`;
      c.lineWidth = 14; c.strokeStyle = "#2a1748"; c.strokeText(s.text || "Community Stalls", cw / 2, ch / 2 + 4); c.fillStyle = "#ffffff"; c.fillText(s.text || "Community Stalls", cw / 2, ch / 2 + 4);
    });
    const m = std(0xffffff, { map, roughness: 0.85, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.18 });
    twoSided(K, w, h, m, { gap: 0.012 });
    K.cyl(0.03, 0.03, w + 0.2, M.dark, { y: h / 2 + 0.03, rz: Math.PI / 2 }, 8);
    K.cyl(0.025, 0.025, w + 0.1, M.dark, { y: -h / 2 - 0.02, rz: Math.PI / 2 }, 8);
    for (const sx of [-1, 1]) rod(K, V(sx * (w / 2 - 0.1), h / 2 + 0.03, 0), V(sx * (w / 2 - 0.4), h / 2 + (s.wire || 0.8), 0), 0.008, M.cable, 4);
    K.into(g); passThrough(g);
  }, { flat: true }),

  /** three capsule-toy machines back to back */
  stGacha: P("Capsule machines", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded((s.n || 1) * 97);
    const body = [cm("#ff6f9c"), cm("#4fb0e0"), cm("#f2c94c"), cm("#7c6cf0"), cm("#5fbf8a")];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + (s.n || 0), cx = Math.sin(a) * 0.42, cz = Math.cos(a) * 0.42, C = body[(i + (s.n || 0)) % body.length];
      const o = (x, y, z) => ({ x: cx + Math.sin(a) * z + Math.cos(a) * x, y, z: cz + Math.cos(a) * z - Math.sin(a) * x, ry: a });
      K.box(0.5, 0.62, 0.46, C.solid, o(0, 0.31, 0));
      K.box(0.52, 0.06, 0.48, M.metal, o(0, 0.64, 0));
      K.box(0.4, 0.4, 0.02, M.white, o(0, 0.36, 0.235));
      K.cyl(0.075, 0.075, 0.05, M.white, { ...o(0, 0.42, 0.26), rx: Math.PI / 2 }, 14);
      K.box(0.13, 0.025, 0.02, M.metal, o(0, 0.42, 0.29));
      K.box(0.16, 0.12, 0.06, M.metal, o(0, 0.16, 0.24));
      K.cyl(0.24, 0.24, 0.05, M.metal, o(0, 0.69, 0), 20);
      K.add(new THREE.SphereGeometry(0.235, 18, 12), M.glass, o(0, 0.92, 0));
      K.cyl(0.11, 0.24, 0.07, C.solid, o(0, 1.17, 0), 20);
      for (let k = 0; k < 14; k++) {
        const ca = r() * TAU, cr = r() * 0.15, cy = 0.76 + r() * 0.2;
        K.add(new THREE.SphereGeometry(0.055, 10, 6), M.goods[(k + i) % M.goods.length], o(Math.cos(ca) * cr, cy, Math.sin(ca) * cr));
      }
    }
    K.into(g);
  }, { colliders: () => [[-0.75, -0.75, 0.75, 0.75]], info: "Capsule toys: turn the knob and see what you get." }),

  /** a round planter with a little blossom tree, and a ledge to sit on */
  stBlossom: P("Blossom planter", (g, s) => {
    const M = sm(), K = new Kit(), r = seeded((s.n || 1) * 131);
    K.cyl(0.95, 1.0, 0.46, M.boards, { y: 0.23 }, 12);
    K.cyl(1.08, 1.08, 0.06, M.wood, { y: 0.49 }, 12);
    K.cyl(0.82, 0.82, 0.05, M.soil, { y: 0.5 }, 12);
    const trunk = new THREE.CatmullRomCurve3([V(0, 0.5, 0), V(0.08, 1.3, 0.04), V(-0.05, 2.0, 0.1), V(0.05, 2.5, 0)]);
    K.add(new THREE.TubeGeometry(trunk, 10, 0.09, 7, false), M.bark);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + r(), y = 1.6 + r() * 0.6;
      rod(K, V(0, y, 0), V(Math.cos(a) * 0.7, y + 0.5, Math.sin(a) * 0.7), 0.035, M.bark, 5);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.5, d = i ? 0.55 + r() * 0.3 : 0, y = i ? 2.25 + r() * 0.6 : 2.85;
      K.add(blobGeo(0.42 + r() * 0.2, i * 3.1), M.leaf[i % M.leaf.length], { x: Math.cos(a) * d, y, z: Math.sin(a) * d });
    }
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 0.2 + r() * 0.6; K.add(new THREE.CircleGeometry(0.04, 5).rotateX(-Math.PI / 2), M.leaf[i % 4], { x: Math.cos(a) * d, y: 0.53, z: Math.sin(a) * d }); }
    K.into(g);
  }, { colliders: () => [[-1.08, -1.08, 1.08, 1.08]], info: "A little blossom tree. Its ledge is a good place to wait for a friend." }),
};
