// museumart.js - the Museum's pictures, all drawn on canvases: made-up old-master paintings (never copies of real ones), the dinosaur mural,
// the history timeline, fossil slabs, door signs, banners and posters, plaques and labels, and the walls and floors of each room.
import { canvasTex } from "./mainhub.js";

const TAU = Math.PI * 2;
export function seeded(seed) { let h = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'system-ui, "Segoe UI", sans-serif';
const CACHE = new Map();
const once = (k, make) => { if (!CACHE.has(k)) CACHE.set(k, make()); return CACHE.get(k); };
/** set a font that fits text into maxW, returns the size used */
function fit(g, text, maxW, size, weight = 700, family = SERIF) {
  let fs = size; g.font = `${weight} ${fs}px ${family}`;
  const w = g.measureText(text).width; if (w > maxW) { fs *= maxW / w; g.font = `${weight} ${fs}px ${family}`; }
  return fs;
}
function spaced(g, px) { try { g.letterSpacing = `${px}px`; } catch { /* older canvases: no spacing */ } }
function soft(g, x, y, rx, ry, col, blur = 14) { g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.restore(); }
function speckle(g, w, h, r, n, cols, s = 2) { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * w, r() * h, s * (0.5 + r()), s * (0.5 + r())); } }
function strokes(g, w, h, r, n, cols, len = 10, wid = 3, y0 = 0, y1 = 1) {
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = (y0 + r() * (y1 - y0)) * h, a = (r() - 0.5) * 0.8;
    g.strokeStyle = cols[Math.floor(r() * cols.length)]; g.lineWidth = wid * (0.5 + r());
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
}
function ridge(g, w, h, base, amp, col, r, rough = 0.5) {
  const f1 = 1 + r() * 2, f2 = 3 + r() * 5, p1 = r() * 6, p2 = r() * 6;
  g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, base - amp * (Math.sin((x / w) * Math.PI * f1 + p1) * 0.6 + Math.sin((x / w) * Math.PI * f2 + p2) * 0.4 * rough + (r() - 0.5) * 0.08 * rough));
  g.lineTo(w, h); g.closePath(); g.fill();
}
function tree(g, x, y, s, r, cols) {
  g.fillStyle = "#3a2a1a"; g.fillRect(x - s * 0.05, y - s * 0.6, s * 0.1, s * 0.6);
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(x + (r() - 0.5) * s * 0.8, y - s * 0.6 - r() * s * 0.7, s * (0.16 + r() * 0.16), 0, TAU); g.fill(); }
}

// ---------------------------------------------------------------- paintings: eight made-up kinds, each new seed a new picture
function pastoral(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, "#5f7fa3"); sky.addColorStop(0.55, "#b9c8c4"); sky.addColorStop(1, "#ecdcb0");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) soft(g, r() * w, h * (0.08 + r() * 0.3), w * (0.08 + r() * 0.14), h * (0.03 + r() * 0.04), "rgba(255,248,230,.75)", 10);
  ridge(g, w, h, h * 0.56, h * 0.05, "#8ea3a0", r, 0.4);
  ridge(g, w, h, h * 0.63, h * 0.05, "#7c9265", r, 0.6);
  ridge(g, w, h, h * 0.72, h * 0.04, "#94924a", r, 0.5);
  g.strokeStyle = "rgba(225,232,226,.85)"; g.lineWidth = w * 0.02; g.beginPath(); g.moveTo(w * 0.35, h * 0.64); g.bezierCurveTo(w * 0.55, h * 0.72, w * 0.25, h * 0.85, w * 0.6, h); g.stroke();
  ridge(g, w, h, h * 0.86, h * 0.03, "#5d5a2c", r, 0.7);
  for (let i = 0; i < 6; i++) tree(g, (0.08 + r() * 0.84) * w, h * (0.66 + r() * 0.2), w * (0.08 + r() * 0.1), r, ["#2f4a2a", "#3e5a33", "#566e3c"]);
  for (let i = 0; i < 9; i++) { g.fillStyle = "#f4efe2"; g.beginPath(); g.ellipse(r() * w, h * (0.78 + r() * 0.15), 5, 3, 0, 0, TAU); g.fill(); }
  strokes(g, w, h, r, 300, ["rgba(255,255,240,.05)", "rgba(40,30,10,.06)"], 12, 3);
}
function seascape(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, "#3d4552"); sky.addColorStop(0.6, "#8b8f86"); sky.addColorStop(1, "#d8c9a0");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) soft(g, r() * w, h * (0.05 + r() * 0.35), w * (0.1 + r() * 0.17), h * (0.05 + r() * 0.05), r() < 0.5 ? "rgba(60,62,70,.7)" : "rgba(220,210,190,.55)", 14);
  g.save(); g.globalAlpha = 0.22; g.fillStyle = "#fff3c8"; g.beginPath(); g.moveTo(w * 0.62, 0); g.lineTo(w * 0.72, 0); g.lineTo(w * 0.9, h * 0.6); g.lineTo(w * 0.55, h * 0.6); g.fill(); g.restore();
  const sea = g.createLinearGradient(0, h * 0.55, 0, h); sea.addColorStop(0, "#4b5e5a"); sea.addColorStop(1, "#1f2c2c");
  g.fillStyle = sea; g.fillRect(0, h * 0.55, w, h * 0.45);
  for (let i = 0; i < 28; i++) { const y = h * (0.58 + r() * 0.4), x = r() * w, L = w * (0.06 + r() * 0.15); g.strokeStyle = "rgba(235,240,230,.6)"; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + L * 0.5, y - 10 - r() * 14, x + L, y); g.stroke(); }
  const sx = w * (0.3 + r() * 0.2), sy = h * 0.62, s = w * 0.0022;
  g.fillStyle = "#2a1d14"; g.beginPath(); g.moveTo(sx - 70 * s, sy); g.lineTo(sx + 80 * s, sy - 4 * s); g.lineTo(sx + 60 * s, sy + 18 * s); g.lineTo(sx - 55 * s, sy + 18 * s); g.fill();
  g.strokeStyle = "#2a1d14"; g.lineWidth = 2; for (const m of [-30, 10, 45]) { g.beginPath(); g.moveTo(sx + m * s, sy); g.lineTo(sx + m * s, sy - 110 * s); g.stroke(); }
  g.fillStyle = "#e9dfc6";
  for (const m of [-30, 10, 45]) for (let k = 0; k < 3; k++) {
    const top = sy - 105 * s + k * 32 * s, x = sx + m * s;
    g.beginPath(); g.moveTo(x - 22 * s, top); g.lineTo(x + 22 * s, top); g.quadraticCurveTo(x + 28 * s, top + 14 * s, x + 20 * s, top + 28 * s); g.lineTo(x - 20 * s, top + 28 * s); g.quadraticCurveTo(x - 14 * s, top + 14 * s, x - 22 * s, top); g.fill();
  }
  strokes(g, w, h, r, 260, ["rgba(255,255,255,.05)", "rgba(0,0,0,.07)"], 14, 3);
}
function stillLife(g, w, h, r) {
  const bg = g.createRadialGradient(w * 0.4, h * 0.35, 10, w * 0.5, h * 0.5, w * 0.8); bg.addColorStop(0, "#5a4630"); bg.addColorStop(1, "#140e08");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = "#4a2e18"; g.fillRect(0, h * 0.66, w, h * 0.34); g.fillStyle = "rgba(255,220,160,.18)"; g.fillRect(0, h * 0.66, w, 4);
  g.fillStyle = "#e8e2d4"; g.beginPath(); g.moveTo(w * 0.12, h * 0.66); g.bezierCurveTo(w * 0.35, h * 0.62, w * 0.5, h * 0.7, w * 0.62, h * 0.66); g.lineTo(w * 0.55, h); g.lineTo(w * 0.2, h); g.fill();
  g.strokeStyle = "rgba(120,110,100,.5)"; g.lineWidth = 3; for (let i = 0; i < 6; i++) { const x = w * (0.2 + i * 0.06); g.beginPath(); g.moveTo(x, h * 0.68); g.quadraticCurveTo(x + 10, h * 0.85, x - 6, h); g.stroke(); }
  const jx = w * 0.62, jy = h * 0.66, js = h / 400, jg = g.createLinearGradient(jx - 50 * js, 0, jx + 50 * js, 0); jg.addColorStop(0, "#3c4148"); jg.addColorStop(0.4, "#a8adb0"); jg.addColorStop(1, "#2a2d31");
  g.fillStyle = jg; g.beginPath(); g.moveTo(jx - 30 * js, jy); g.bezierCurveTo(jx - 60 * js, jy - 60 * js, jx - 30 * js, jy - 120 * js, jx - 22 * js, jy - 150 * js); g.lineTo(jx + 22 * js, jy - 150 * js); g.bezierCurveTo(jx + 30 * js, jy - 120 * js, jx + 60 * js, jy - 60 * js, jx + 30 * js, jy); g.fill();
  const fruit = (x, y, rad, c0, c1) => { const fg = g.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad); fg.addColorStop(0, c0); fg.addColorStop(1, c1); g.fillStyle = fg; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
  for (let i = 0; i < 4; i++) fruit(w * (0.22 + i * 0.07), h * 0.66 - 14 * js + (i % 2) * 6, 22 * js, "#ffe58a", "#b88a10");
  for (let i = 0; i < 3; i++) fruit(w * (0.38 + i * 0.08), h * 0.68 + 10 * js, 26 * js, "#ff8a6a", "#6e1410");
  for (let i = 0; i < 16; i++) fruit(w * 0.8 + (r() - 0.5) * 50 * js, h * 0.64 - r() * 40 * js, 9 * js, "#b48ad0", "#2a1038");
  g.fillStyle = "#2f4a1a"; g.beginPath(); g.ellipse(w * 0.8, h * 0.56, 26 * js, 10 * js, -0.5, 0, TAU); g.fill();
  strokes(g, w, h, r, 200, ["rgba(255,230,180,.05)", "rgba(0,0,0,.08)"], 10, 3);
}
function portrait(g, w, h, r) {
  const bg = g.createRadialGradient(w * 0.55, h * 0.35, 10, w * 0.5, h * 0.5, h * 0.8); bg.addColorStop(0, ["#5e5a3e", "#3e4a5a", "#5a3e3a"][Math.floor(r() * 3)]); bg.addColorStop(1, "#16140c");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const cx = w * 0.5, hy = h * 0.36, hr = Math.min(w, h) * 0.14;
  g.fillStyle = ["#1c1a18", "#2a1a22", "#1a2230"][Math.floor(r() * 3)]; g.beginPath(); g.moveTo(cx - w * 0.42, h); g.bezierCurveTo(cx - w * 0.4, h * 0.62, cx - w * 0.22, h * 0.52, cx, h * 0.52); g.bezierCurveTo(cx + w * 0.22, h * 0.52, cx + w * 0.4, h * 0.62, cx + w * 0.42, h); g.fill();
  g.fillStyle = "#ece6d6"; g.beginPath(); g.ellipse(cx, h * 0.535, hr * 1.35, hr * 0.36, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(150,140,120,.6)"; g.lineWidth = 2; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(cx + i * hr * 0.2, h * 0.535 - hr * 0.3); g.lineTo(cx + i * hr * 0.21, h * 0.535 + hr * 0.3); g.stroke(); }
  g.fillStyle = "#b88a68"; g.fillRect(cx - hr * 0.35, hy + hr * 0.6, hr * 0.7, hr * 0.8);
  const sk = g.createRadialGradient(cx - hr * 0.35, hy - hr * 0.3, hr * 0.1, cx, hy, hr * 1.2); sk.addColorStop(0, "#f0cfae"); sk.addColorStop(1, "#8a5e44");
  g.fillStyle = sk; g.beginPath(); g.ellipse(cx, hy, hr * 0.82, hr, 0, 0, TAU); g.fill();
  g.fillStyle = ["#2a1c12", "#5a3a1a", "#8a7a6a"][Math.floor(r() * 3)];
  g.beginPath(); g.ellipse(cx, hy - hr * 0.55, hr * 0.95, hr * 0.62, 0, Math.PI, TAU); g.fill();
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * hr * 0.8, hy - hr * 0.05, hr * 0.22, hr * 0.62, s * -0.2, 0, TAU); g.fill(); }
  g.fillStyle = "rgba(70,40,25,.5)"; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * hr * 0.32, hy - hr * 0.05, hr * 0.16, hr * 0.07, 0, 0, TAU); g.fill(); }
  g.fillStyle = "rgba(90,50,30,.32)"; g.beginPath(); g.moveTo(cx, hy); g.lineTo(cx + hr * 0.1, hy + hr * 0.35); g.lineTo(cx - hr * 0.05, hy + hr * 0.38); g.fill();
  g.strokeStyle = "rgba(110,50,40,.55)"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - hr * 0.2, hy + hr * 0.58); g.quadraticCurveTo(cx, hy + hr * 0.64, cx + hr * 0.2, hy + hr * 0.58); g.stroke();
  strokes(g, w, h, r, 220, ["rgba(255,240,200,.04)", "rgba(0,0,0,.07)"], 10, 3);
}
function dawn(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, "#3b4a7a"); sky.addColorStop(0.45, "#c98aa0"); sky.addColorStop(0.75, "#f6c27a"); sky.addColorStop(1, "#fbe3b0");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  soft(g, w * 0.62, h * 0.55, w * 0.12, w * 0.12, "rgba(255,240,200,.9)", 20);
  const peaks = (base, amp, col, n) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); g.lineTo(0, base); let x = 0; while (x < w) { const dx = (w / n) * (0.5 + r()); x += dx; g.lineTo(x - dx / 2, base - amp * (0.4 + r() * 0.6)); g.lineTo(x, base - amp * r() * 0.3); } g.lineTo(w, h); g.fill(); };
  peaks(h * 0.62, h * 0.3, "#8f7fa8", 5); peaks(h * 0.68, h * 0.24, "#6b5f88", 6); peaks(h * 0.74, h * 0.16, "#463f62", 7);
  const lake = g.createLinearGradient(0, h * 0.76, 0, h); lake.addColorStop(0, "#e9b88a"); lake.addColorStop(1, "#3a3550");
  g.fillStyle = lake; g.fillRect(0, h * 0.76, w, h * 0.24);
  g.strokeStyle = "rgba(255,240,210,.5)"; g.lineWidth = 2; for (let i = 0; i < 18; i++) { const y = h * (0.78 + r() * 0.2), x = w * 0.62 + (r() - 0.5) * w * 0.24; g.beginPath(); g.moveTo(x - 20, y); g.lineTo(x + 20, y); g.stroke(); }
  g.fillStyle = "#1e1a28"; for (let i = 0; i < 10; i++) { const x = r() * w, y = h * (0.8 + r() * 0.12), s = h * (0.07 + r() * 0.09); g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y); g.lineTo(x - s * 0.25, y); g.fill(); }
  strokes(g, w, h, r, 240, ["rgba(255,240,220,.05)", "rgba(20,10,40,.06)"], 12, 3);
}
function ruins(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, "#7d98b4"); sky.addColorStop(1, "#f0d9a6");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5; i++) soft(g, r() * w, h * (0.1 + r() * 0.25), w * (0.12 + r() * 0.12), h * (0.04 + r() * 0.04), "rgba(255,245,225,.7)", 12);
  ridge(g, w, h, h * 0.7, h * 0.04, "#9a9a6a", r, 0.4);
  const ground = g.createLinearGradient(0, h * 0.72, 0, h); ground.addColorStop(0, "#a8925e"); ground.addColorStop(1, "#5b4a2a");
  g.fillStyle = ground; g.fillRect(0, h * 0.76, w, h * 0.24);
  const ax = w * (0.58 + r() * 0.12), aw = w * 0.24, ah = h * 0.44, ay = h * 0.8;
  g.fillStyle = "#d6c49c"; g.fillRect(ax - aw / 2, ay - ah, aw, ah);
  g.fillStyle = sky; g.beginPath(); g.moveTo(ax - aw * 0.28, ay); g.lineTo(ax - aw * 0.28, ay - ah * 0.55); g.arc(ax, ay - ah * 0.55, aw * 0.28, Math.PI, 0); g.lineTo(ax + aw * 0.28, ay); g.fill();
  g.beginPath(); g.moveTo(ax + aw * 0.1, ay - ah - 1); g.lineTo(ax + aw * 0.5 + 1, ay - ah - 1); g.lineTo(ax + aw * 0.5 + 1, ay - ah * 0.7); g.lineTo(ax + aw * 0.35, ay - ah * 0.82); g.lineTo(ax + aw * 0.25, ay - ah * 0.9); g.fill();
  g.fillStyle = "rgba(90,70,40,.35)"; g.fillRect(ax + aw * 0.3, ay - ah * 0.7, aw * 0.2, ah * 0.7);
  for (let i = 0; i < 5; i++) {
    const x = w * (0.06 + i * 0.09), ch = h * (0.18 + r() * 0.36), cw = w * 0.045;
    g.fillStyle = "#e2d3ae"; g.fillRect(x, ay - ch, cw, ch); g.fillStyle = "rgba(100,80,50,.35)"; for (let k = 0; k < 4; k++) g.fillRect(x + cw * (0.15 + k * 0.22), ay - ch, 1.5, ch);
    g.fillStyle = "#cbb88e"; g.fillRect(x - 4, ay - 8, cw + 8, 8);
  }
  for (let i = 0; i < 3; i++) { const x = w * (0.2 + r() * 0.7), y = ay - h * 0.05; g.strokeStyle = "#3a2a1a"; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y - h * 0.3); g.stroke(); g.fillStyle = "#2f4228"; g.beginPath(); g.ellipse(x + 6, y - h * 0.32, w * 0.1, h * 0.04, 0, 0, TAU); g.fill(); }
  for (let i = 0; i < 4; i++) { const x = r() * w, y = h * (0.86 + r() * 0.08); g.fillStyle = ["#7a2a20", "#2a3a6a", "#e8e0c8"][i % 3]; g.fillRect(x, y - 14, 5, 14); g.fillStyle = "#c69a78"; g.beginPath(); g.arc(x + 2.5, y - 17, 3, 0, TAU); g.fill(); }
  strokes(g, w, h, r, 260, ["rgba(255,250,230,.05)", "rgba(40,25,10,.06)"], 12, 3);
}
function nocturne(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, "#0d1426"); sky.addColorStop(1, "#2c3a5a");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const mx = w * (0.2 + r() * 0.6), my = h * 0.2;
  soft(g, mx, my, w * 0.1, w * 0.1, "rgba(220,230,255,.35)", 20);
  g.fillStyle = "#f4efd8"; g.beginPath(); g.arc(mx, my, w * 0.04, 0, TAU); g.fill();
  speckle(g, w, h * 0.5, r, 60, ["rgba(255,255,255,.7)"], 1.5);
  ridge(g, w, h, h * 0.62, h * 0.05, "#1a2236", r, 0.4);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.05 + i * 0.13 + r() * 0.03), y = h * 0.7, bw = w * (0.08 + r() * 0.04), bh = h * (0.08 + r() * 0.06);
    g.fillStyle = "#2a2a36"; g.fillRect(x, y - bh, bw, bh);
    g.fillStyle = "#1a1a24"; g.beginPath(); g.moveTo(x - 4, y - bh); g.lineTo(x + bw / 2, y - bh - bh * 0.6); g.lineTo(x + bw + 4, y - bh); g.fill();
    g.fillStyle = "#ffcf6a"; for (let k = 0; k < 2; k++) if (r() < 0.75) g.fillRect(x + bw * (0.2 + k * 0.45), y - bh * 0.65, bw * 0.16, bh * 0.22);
  }
  const water = g.createLinearGradient(0, h * 0.72, 0, h); water.addColorStop(0, "#1e2a44"); water.addColorStop(1, "#0a0e18");
  g.fillStyle = water; g.fillRect(0, h * 0.72, w, h * 0.28);
  g.strokeStyle = "rgba(240,235,200,.45)"; g.lineWidth = 2; for (let i = 0; i < 20; i++) { const y = h * (0.75 + r() * 0.22), x = mx + (r() - 0.5) * w * 0.12; g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.stroke(); }
  g.strokeStyle = "rgba(255,200,100,.35)"; for (let i = 0; i < 14; i++) { const y = h * (0.74 + r() * 0.15), x = r() * w; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }
  strokes(g, w, h, r, 200, ["rgba(200,210,255,.04)", "rgba(0,0,0,.08)"], 12, 3);
}
function flowers(g, w, h, r) {
  const bg = g.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.5, h * 0.8); bg.addColorStop(0, "#3a3428"); bg.addColorStop(1, "#0e0c08");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = "#3a2414"; g.fillRect(0, h * 0.8, w, h * 0.2);
  const vx = w * 0.5, vy = h * 0.8, vs = h / 500;
  const vg = g.createLinearGradient(vx - 60 * vs, 0, vx + 60 * vs, 0); vg.addColorStop(0, "#1c2c5a"); vg.addColorStop(0.45, "#6f8fd0"); vg.addColorStop(1, "#14203e");
  g.fillStyle = vg; g.beginPath(); g.moveTo(vx - 35 * vs, vy); g.bezierCurveTo(vx - 80 * vs, vy - 60 * vs, vx - 40 * vs, vy - 130 * vs, vx - 26 * vs, vy - 150 * vs); g.lineTo(vx + 26 * vs, vy - 150 * vs); g.bezierCurveTo(vx + 40 * vs, vy - 130 * vs, vx + 80 * vs, vy - 60 * vs, vx + 35 * vs, vy); g.fill();
  g.strokeStyle = "#3d5a2a"; g.lineWidth = 3; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(vx + (r() - 0.5) * 30 * vs, vy - 150 * vs); g.quadraticCurveTo(vx + (r() - 0.5) * 200 * vs, vy - 260 * vs, vx + (r() - 0.5) * 320 * vs, vy - (200 + r() * 170) * vs); g.stroke(); }
  const cols = ["#f2e6d0", "#e85a4a", "#f2b84a", "#c86aa8", "#ffffff", "#e8869a", "#7a4ac0"];
  for (let i = 0; i < 26; i++) {
    const x = vx + (r() - 0.5) * 320 * vs, y = vy - (190 + r() * 190) * vs, s = (14 + r() * 18) * vs, c = cols[Math.floor(r() * cols.length)];
    g.fillStyle = c; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + r(); g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.5, s * 0.3, a, 0, TAU); g.fill(); }
    g.fillStyle = "#f6d24a"; g.beginPath(); g.arc(x, y, s * 0.22, 0, TAU); g.fill();
  }
  for (let i = 0; i < 3; i++) { g.fillStyle = cols[i + 1]; g.beginPath(); g.ellipse(vx + (i - 1) * 90 * vs, vy + 30 * vs, 12 * vs, 6 * vs, r(), 0, TAU); g.fill(); }
  strokes(g, w, h, r, 200, ["rgba(255,240,210,.05)", "rgba(0,0,0,.08)"], 10, 3);
}
const PAINTERS = [pastoral, seascape, stillLife, portrait, dawn, ruins, nocturne, flowers];
export const ART_TITLES = ["Pastoral with a River", "Squall off the Headland", "Still Life with Lemons", "Portrait of a Stranger", "Dawn over the Range", "Capriccio with Ruins", "Village by Moonlight", "Flowers in a Blue Vase"];
function age(g, w, h, r) {
  g.globalCompositeOperation = "multiply"; g.fillStyle = "rgba(235,205,150,.38)"; g.fillRect(0, 0, w, h); g.globalCompositeOperation = "source-over";
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(20,10,0,.55)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(30,20,10,.16)"; g.lineWidth = 0.7;
  for (let i = 0; i < 80; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
}
/** an old painting: kind 0..7, seed for the details, aspect = width / height */
export function paintingTex(kind, seed, aspect) {
  const k = ((kind % PAINTERS.length) + PAINTERS.length) % PAINTERS.length;
  return once(`p${k}:${seed}:${aspect.toFixed(2)}`, () => {
    const W = aspect >= 1 ? 512 : Math.round(512 * aspect), H = aspect >= 1 ? Math.round(512 / aspect) : 512;
    const t = canvasTex(W, H, (g, w, h) => { const r = seeded(seed * 131 + k); PAINTERS[k](g, w, h, r); age(g, w, h, r); });
    t.wrapS = t.wrapT = 1001;                                                   // ClampToEdge: one picture, no repeats
    return t;
  });
}
/** the little card beside a painting */
export function labelTex(title, sub = "Oil on canvas") {
  return once(`l:${title}:${sub}`, () => canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#f6f1e6"; g.fillRect(0, 0, w, h); g.strokeStyle = "#c9bca0"; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#2a2420"; g.textAlign = "left"; g.textBaseline = "top";
    const words = title.split(" "), lines = []; let line = "";
    g.font = `700 22px ${SERIF}`;
    for (const wd of words) { const t = line ? line + " " + wd : wd; if (g.measureText(t).width > w - 28) { lines.push(line); line = wd; } else line = t; }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, 14, 14 + i * 26));
    g.font = `italic 400 17px ${SERIF}`; g.fillStyle = "#6a5e50"; g.fillText(sub, 14, h - 30);
  }));
}

// ---------------------------------------------------------------- the rooms' walls: one 2 m tile of each paper or paint
export const PALETTES = {
  cream: { wall: "#efe6d4", trim: "#fbf6ea", base: "#6b5a46", core: "#e6dccb", sign: "#3a2f26", ink: "#f3d9a0", dado: "panel", dadoCol: "#d9ccb2" },
  red: { wall: "#7a1d24", trim: "#d4af37", base: "#2a1a12", core: "#e6dccb", sign: "#2a0e10", ink: "#f0cf78", dado: "wood", dadoCol: "#5a3620" },
  teal: { wall: "#1f5a5c", trim: "#c9a24a", base: "#10282a", core: "#e6dccb", sign: "#0e2a2c", ink: "#f0cf78", dado: "wood", dadoCol: "#3e2a1c" },
  navy: { wall: "#1f2d4f", trim: "#c9a24a", base: "#0d1424", core: "#e6dccb", sign: "#0e1630", ink: "#f0cf78", dado: "wood", dadoCol: "#4a3020" },
  ochre: { wall: "#c99a5a", trim: "#efe2c4", base: "#4a3826", core: "#e6dccb", sign: "#3a2614", ink: "#ffe6b0", dado: "stone", dadoCol: "#8a6a44" },
  lobby: { wall: "#f2ede3", trim: "#ffffff", base: "#5a4e40", core: "#e6dccb", sign: "#2e2a26", ink: "#f3d9a0", dado: "marble", dadoCol: "#cfc6b4" },
};
function damask(g, x, y, s, col) {
  g.fillStyle = col; g.beginPath();
  for (const k of [-1, 1]) { g.moveTo(x, y - s); g.bezierCurveTo(x + k * s * 0.6, y - s * 0.6, x + k * s * 0.15, y - s * 0.1, x + k * s * 0.55, y + s * 0.15); g.bezierCurveTo(x + k * s * 0.85, y + s * 0.42, x + k * s * 0.3, y + s * 0.82, x, y + s); }
  g.fill();
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * s * 0.62, y - s * 0.55, s * 0.18, s * 0.08, k * 0.8, 0, TAU); g.fill(); g.beginPath(); g.arc(x + k * s * 0.75, y + s * 0.75, s * 0.07, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(x, y - s * 1.12, s * 0.09, 0, TAU); g.fill();
}
export function wallTex(name) {
  return once("w:" + name, () => canvasTex(512, 512, (g, w, h) => {
    const P = PALETTES[name], r = seeded(name.length * 97 + 5);
    g.fillStyle = P.wall; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 2600, ["rgba(255,255,255,.035)", "rgba(0,0,0,.04)"], 3);
    if (name === "red") { damask(g, 128, 128, 92, "rgba(40,0,6,.32)"); damask(g, 384, 384, 92, "rgba(40,0,6,.32)"); damask(g, 128, 128, 70, "rgba(255,160,140,.07)"); damask(g, 384, 384, 70, "rgba(255,160,140,.07)"); }
    if (name === "teal") { g.fillStyle = "rgba(220,190,110,.35)"; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 3, h); g.fillStyle = "rgba(0,0,0,.08)"; for (let x = 64; x < w; x += 128) g.fillRect(x - 20, 0, 40, h); }
    if (name === "navy") { g.fillStyle = "rgba(220,190,110,.22)"; for (let y = 32; y < h; y += 128) for (let x = 32 + ((y / 128) % 2) * 64; x < w; x += 128) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore(); } }
    if (name === "ochre") { g.strokeStyle = "rgba(90,50,20,.16)"; g.lineWidth = 6; for (let y = 20; y < h; y += 46 + r() * 30) { g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin((x / w) * TAU * 2 + y) * 6); g.stroke(); } }
    if (name === "lobby") { g.strokeStyle = "rgba(120,100,80,.18)"; g.lineWidth = 2; for (let y = 0; y < h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 128) % 2 ? 128 : 0; x < w; x += 256) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 128); g.stroke(); } } }
  }));
}
export function dadoTex(name) {
  return once("d:" + name, () => canvasTex(512, 256, (g, w, h) => {
    const P = PALETTES[name], r = seeded(name.length * 13 + 1);
    g.fillStyle = P.dadoCol; g.fillRect(0, 0, w, h);
    if (P.dado === "wood" || P.dado === "panel") {
      if (P.dado === "wood") { g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 1; for (let i = 0; i < 70; i++) { const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 10, w * 0.6, y + (r() - 0.5) * 10, w, y); g.stroke(); } }
      for (let i = 0; i < 2; i++) {
        const x = i * 256 + 26, y = 30, pw = 204, ph = h - 60;
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 4, y + 4, pw, ph);
        g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x - 3, y - 3, pw, ph);
        g.fillStyle = P.dadoCol; g.fillRect(x, y, pw, ph);
        g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 3; g.strokeRect(x + 16, y + 16, pw - 32, ph - 32);
      }
    } else {
      speckle(g, w, h, r, 1600, ["rgba(255,255,255,.06)", "rgba(0,0,0,.07)"], 3);
      g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 3;
      for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      if (P.dado === "marble") { g.strokeStyle = "rgba(120,110,100,.25)"; g.lineWidth = 1.5; for (let i = 0; i < 10; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } }
    }
  }));
}

// ---------------------------------------------------------------- floors (tile sizes in metres are in museumhub.js)
export function floorTex(kind) {
  return once("f:" + kind, () => canvasTex(512, 512, (g, w, h) => {
    const r = seeded(kind.length * 31 + 7);
    if (kind === "flag") {                                                     // sandstone flags, 4 m
      g.fillStyle = "#6a5a44"; g.fillRect(0, 0, w, h);
      let y = 0;
      while (y < h) { const rh = 80 + Math.floor(r() * 3) * 22; let x = -Math.floor(r() * 60);
        while (x < w) { const rw = 90 + r() * 90; g.fillStyle = `hsl(${32 + r() * 10},${28 + r() * 14}%,${62 + r() * 12}%)`; g.fillRect(x + 3, y + 3, rw - 6, Math.min(rh, h - y) - 6); x += rw; }
        y += rh; }
      speckle(g, w, h, r, 3000, ["rgba(255,255,255,.07)", "rgba(80,50,20,.08)"], 2);
    } else if (kind === "parquet") {                                           // basket-weave oak, 2 m
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x0 = i * 128, y0 = j * 128, flip = (i + j) % 2;
        for (let k = 0; k < 4; k++) {
          g.fillStyle = `hsl(${26 + r() * 8},${42 + r() * 12}%,${34 + r() * 12}%)`;
          if (flip) g.fillRect(x0 + k * 32 + 1, y0 + 1, 30, 126); else g.fillRect(x0 + 1, y0 + k * 32 + 1, 126, 30);
        }
      }
      g.strokeStyle = "rgba(0,0,0,.08)"; g.lineWidth = 1; for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); }
      g.fillStyle = "rgba(255,230,190,.06)"; g.fillRect(0, 0, w, h);
    } else if (kind === "slate") {                                             // slate tiles, 2.4 m
      g.fillStyle = "#1b1f22"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `hsl(${190 + r() * 40},${8 + r() * 8}%,${22 + r() * 9}%)`; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); }
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 2; for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 40, y + (r() - 0.5) * 6); g.stroke(); }
    } else if (kind === "marble") {                                            // cream and green-black marble squares, 2 m
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const dark = (i + j) % 2; g.fillStyle = dark ? "#26302c" : "#ece5d6"; g.fillRect(i * 256, j * 256, 256, 256);
        g.strokeStyle = dark ? "rgba(200,220,210,.18)" : "rgba(120,110,95,.22)"; g.lineWidth = 1.5;
        for (let v = 0; v < 6; v++) { g.beginPath(); let x = i * 256 + r() * 256, y = j * 256 + r() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x = Math.min(i * 256 + 255, Math.max(i * 256, x + (r() - 0.3) * 60)); y = Math.min(j * 256 + 255, Math.max(j * 256, y + (r() - 0.5) * 50)); g.lineTo(x, y); } g.stroke(); }
      }
      g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (const p of [0, 256]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
    } else if (kind === "boards") {                                            // long oak boards, 2 m
      for (let i = 0; i < 8; i++) { let y = -Math.floor(r() * 300);
        while (y < h) { const L = 200 + r() * 220; g.fillStyle = `hsl(${28 + r() * 8},${36 + r() * 12}%,${40 + r() * 12}%)`; g.fillRect(i * 64 + 1, y + 1, 62, L - 2); y += L; } }
      g.strokeStyle = "rgba(0,0,0,.08)"; for (let i = 0; i < 200; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + 30 + r() * 40); g.stroke(); }
    } else if (kind === "carpet") {                                            // the nave's red runner: border down both sides
      g.fillStyle = "#7c1422"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#d4af37"; g.fillRect(18, 0, 14, h); g.fillRect(w - 32, 0, 14, h);
      g.fillStyle = "#4a0a14"; g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
      g.fillStyle = "rgba(212,175,55,.35)"; for (let y = 64; y < h; y += 128) { g.save(); g.translate(w / 2, y); g.rotate(Math.PI / 4); g.fillRect(-26, -26, 52, 52); g.restore(); }
      speckle(g, w, h, r, 2000, ["rgba(255,255,255,.03)", "rgba(0,0,0,.06)"], 2);
    }
  }));
}
export const skylightTex = () => once("sky", () => canvasTex(256, 256, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#e6eef2");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#8a8e8a"; g.lineWidth = 5; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
}));

// ---------------------------------------------------------------- signs, plaques, banners, posters
export function signTex(text, pal = "cream") {
  return once(`s:${text}:${pal}`, () => canvasTex(1024, 180, (g, w, h) => {
    const P = PALETTES[pal];
    g.fillStyle = P.sign; g.fillRect(0, 0, w, h);
    g.strokeStyle = P.ink; g.lineWidth = 4; g.strokeRect(12, 12, w - 24, h - 24); g.lineWidth = 1.5; g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = P.ink; g.textAlign = "center"; g.textBaseline = "middle"; spaced(g, 10);
    fit(g, text, w - 120, 96, 700); g.fillText(text, w / 2, h / 2 + 4); spaced(g, 0);
    for (const x of [48, w - 48]) { g.beginPath(); g.arc(x, h / 2, 9, 0, TAU); g.fill(); }
  }));
}
export function plaqueTex(title, sub, body) {
  return once(`q:${title}`, () => canvasTex(512, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#5a4426"); gr.addColorStop(1, "#2e2212");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a24a"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#f3e2b8"; g.textAlign = "center"; g.textBaseline = "top"; spaced(g, 4);
    fit(g, title, w - 60, 52, 700); g.fillText(title, w / 2, 34); spaced(g, 0);
    g.font = `italic 400 28px ${SERIF}`; g.fillStyle = "#e0c27a"; g.fillText(sub, w / 2, 102);
    g.fillStyle = "#c9a24a"; g.fillRect(w / 2 - 80, 146, 160, 3);
    g.font = `400 24px ${SERIF}`; g.fillStyle = "#f0e6d0";
    const words = body.split(" "), lines = []; let line = "";
    for (const wd of words) { const t = line ? line + " " + wd : wd; if (g.measureText(t).width > w - 80) { lines.push(line); line = wd; } else line = t; }
    lines.push(line); lines.slice(0, 4).forEach((l, i) => g.fillText(l, w / 2, 166 + i * 32));
  }));
}
const ICONS = {
  bone: (g, s) => { g.lineWidth = s * 0.16; g.lineCap = "round"; g.beginPath(); g.moveTo(-s * 0.5, s * 0.3); g.lineTo(s * 0.5, -s * 0.3); g.stroke(); for (const [x, y] of [[-0.5, 0.3], [0.5, -0.3]]) for (const k of [-1, 1]) { g.beginPath(); g.arc((x + k * 0.08) * s, (y + k * 0.1) * s, s * 0.12, 0, TAU); g.fill(); } },
  frame: (g, s) => { g.lineWidth = s * 0.1; g.strokeRect(-s * 0.45, -s * 0.36, s * 0.9, s * 0.72); g.beginPath(); g.moveTo(-s * 0.35, s * 0.25); g.lineTo(-s * 0.05, -s * 0.1); g.lineTo(s * 0.12, s * 0.08); g.lineTo(s * 0.35, -s * 0.18); g.lineTo(s * 0.35, s * 0.25); g.closePath(); g.fill(); },
  vase: (g, s) => { g.beginPath(); g.moveTo(-s * 0.12, -s * 0.45); g.lineTo(s * 0.12, -s * 0.45); g.bezierCurveTo(s * 0.1, -s * 0.2, s * 0.45, -s * 0.1, s * 0.3, s * 0.3); g.lineTo(s * 0.18, s * 0.45); g.lineTo(-s * 0.18, s * 0.45); g.lineTo(-s * 0.3, s * 0.3); g.bezierCurveTo(-s * 0.45, -s * 0.1, -s * 0.1, -s * 0.2, -s * 0.12, -s * 0.45); g.fill(); },
  clock: (g, s) => { g.lineWidth = s * 0.1; g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.28); g.moveTo(0, 0); g.lineTo(s * 0.2, s * 0.08); g.stroke(); },
  star: (g, s) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.2 : s * 0.45; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); },
};
export function bannerTex(words, col, icon = "star") {
  return once(`b:${words}:${col}`, () => canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, 0, w, 22);
    g.strokeStyle = "#e8c66a"; g.lineWidth = 6; g.strokeRect(14, 30, w - 28, h - 50); g.lineWidth = 2; g.strokeRect(24, 40, w - 48, h - 70);
    g.save(); g.translate(w / 2, 130); g.fillStyle = "#e8c66a"; g.strokeStyle = "#e8c66a"; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.lineWidth = 4; g.stroke(); (ICONS[icon] || ICONS.star)(g, 80); g.restore();
    g.fillStyle = "#fff4dc"; g.textAlign = "center"; g.textBaseline = "middle"; spaced(g, 3);
    const lines = words.split(" "); lines.forEach((l, i) => { fit(g, l, w - 70, 44, 700); g.fillText(l, w / 2, 250 + i * 54 - (lines.length - 1) * 10); }); spaced(g, 0);
  }));
}
export function posterTex(title, sub, col, icon) {
  return once(`po:${title}`, () => canvasTex(512, 704, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h * 0.36); g.fillStyle = "rgba(255,240,210,.85)"; g.strokeStyle = "rgba(255,240,210,.85)"; (ICONS[icon] || ICONS.star)(g, 300); g.restore();
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, h * 0.64, w, h * 0.36);
    g.fillStyle = "#fff4dc"; g.textAlign = "center"; g.textBaseline = "middle"; spaced(g, 4);
    const lines = title.split("|"); lines.forEach((l, i) => { fit(g, l, w - 60, 58, 700); g.fillText(l, w / 2, h * 0.72 + i * 62); }); spaced(g, 0);
    g.font = `italic 400 28px ${SERIF}`; g.fillStyle = "#f0d9a0"; g.fillText(sub, w / 2, h * 0.93);
  }));
}

// ---------------------------------------------------------------- the big wall pieces
function longneck(g, x, y, s, col) {
  g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round";
  g.beginPath(); g.ellipse(x, y, 60 * s, 26 * s, 0, 0, TAU); g.fill();
  g.lineWidth = 16 * s; g.beginPath(); g.moveTo(x + 45 * s, y - 10 * s); g.quadraticCurveTo(x + 92 * s, y - 40 * s, x + 105 * s, y - 112 * s); g.stroke();
  g.beginPath(); g.ellipse(x + 112 * s, y - 114 * s, 13 * s, 7 * s, 0.2, 0, TAU); g.fill();
  g.lineWidth = 13 * s; g.beginPath(); g.moveTo(x - 50 * s, y - 5 * s); g.quadraticCurveTo(x - 110 * s, y + 5 * s, x - 170 * s, y + 32 * s); g.stroke();
  for (const lx of [-35, -15, 25, 42]) { g.beginPath(); g.moveTo(x + lx * s, y + 10 * s); g.lineTo(x + lx * s + 2 * s, y + 58 * s); g.stroke(); }
}
function biped(g, x, y, s, col, flip = 1) {
  g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round";
  g.beginPath(); g.ellipse(x, y, 34 * s, 18 * s, -0.15 * flip, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(x + flip * 46 * s, y - 22 * s, 22 * s, 12 * s, 0.1 * flip, 0, TAU); g.fill();
  g.lineWidth = 12 * s; g.beginPath(); g.moveTo(x + flip * 28 * s, y - 8 * s); g.lineTo(x + flip * 40 * s, y - 18 * s); g.stroke();
  g.lineWidth = 10 * s; g.beginPath(); g.moveTo(x - flip * 30 * s, y - 2 * s); g.quadraticCurveTo(x - flip * 70 * s, y - 6 * s, x - flip * 100 * s, y + 4 * s); g.stroke();
  g.lineWidth = 9 * s; for (const k of [-8, 8]) { g.beginPath(); g.moveTo(x + k * s, y + 10 * s); g.lineTo(x + (k + 10 * flip) * s, y + 30 * s); g.lineTo(x + k * s, y + 48 * s); g.stroke(); }
}
export const muralTex = () => once("mural", () => canvasTex(2048, 436, (g, w, h) => {
  const r = seeded(77);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#26445a"); sky.addColorStop(0.5, "#c9824a"); sky.addColorStop(0.8, "#f2c27a"); sky.addColorStop(1, "#e8b070");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  soft(g, w * 0.74, h * 0.18, 160, 60, "rgba(80,70,70,.6)", 24); soft(g, w * 0.78, h * 0.06, 220, 50, "rgba(90,80,80,.45)", 30);
  g.fillStyle = "#4a3a3a"; g.beginPath(); g.moveTo(w * 0.62, h * 0.8); g.lineTo(w * 0.72, h * 0.3); g.lineTo(w * 0.76, h * 0.3); g.lineTo(w * 0.88, h * 0.8); g.fill();
  soft(g, w * 0.74, h * 0.31, 50, 18, "rgba(255,120,40,.9)", 10);
  g.strokeStyle = "rgba(255,110,40,.8)"; g.lineWidth = 6; g.beginPath(); g.moveTo(w * 0.735, h * 0.32); g.quadraticCurveTo(w * 0.72, h * 0.5, w * 0.7, h * 0.72); g.stroke();
  ridge(g, w, h, h * 0.74, h * 0.06, "#6a6a5a", r, 0.4);
  ridge(g, w, h, h * 0.8, h * 0.04, "#4e5a3e", r, 0.6);
  longneck(g, w * 0.36, h * 0.66, 0.9, "rgba(50,52,46,.75)"); longneck(g, w * 0.46, h * 0.69, 0.6, "rgba(60,62,56,.6)"); longneck(g, w * 0.53, h * 0.7, 0.45, "rgba(70,72,66,.5)");
  biped(g, w * 0.9, h * 0.72, 1.1, "rgba(40,36,30,.8)", -1);
  g.strokeStyle = "rgba(40,30,30,.7)"; g.lineWidth = 4; for (let i = 0; i < 7; i++) { const x = w * (0.45 + r() * 0.5), y = h * (0.12 + r() * 0.25), s = 10 + r() * 14; g.beginPath(); g.moveTo(x - s, y - s * 0.3); g.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y - s * 0.3); g.stroke(); }
  g.fillStyle = "#24361e";
  for (let i = 0; i < 22; i++) {
    const x = r() * w, y = h, s = 50 + r() * 80;
    g.fillRect(x - 4, y - s * 0.6, 8, s * 0.6);
    g.strokeStyle = i % 2 ? "#2c4224" : "#1e2e1a"; g.lineWidth = 5;
    for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.32; g.beginPath(); g.moveTo(x, y - s * 0.6); g.quadraticCurveTo(x + Math.cos(a) * s * 0.5, y - s * 0.6 + Math.sin(a) * s * 0.5 - 10, x + Math.cos(a) * s * 0.9, y - s * 0.6 + Math.sin(a) * s * 0.6 + 20); g.stroke(); }
  }
  g.textAlign = "left"; g.textBaseline = "top"; g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 12; spaced(g, 12);
  g.fillStyle = "#fff3dc"; g.font = `700 112px ${SERIF}`; g.fillText("AGE OF DINOSAURS", 70, 50); spaced(g, 4);
  g.font = `italic 400 44px ${SERIF}`; g.fillStyle = "#ffe0b0"; g.fillText("230 – 66 million years ago", 76, 180); spaced(g, 0); g.shadowBlur = 0;
}));
const ERAS = [
  ["STONE AGE", "3 million BCE", (g, s) => { g.beginPath(); g.moveTo(0, -s * 0.5); g.quadraticCurveTo(s * 0.4, 0, 0, s * 0.5); g.quadraticCurveTo(-s * 0.4, 0, 0, -s * 0.5); g.fill(); }],
  ["THE WHEEL", "3500 BCE", (g, s) => { g.lineWidth = s * 0.1; g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.stroke(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42); g.stroke(); } }],
  ["PYRAMIDS", "2600 BCE", (g, s) => { g.beginPath(); g.moveTo(-s * 0.5, s * 0.4); g.lineTo(0, -s * 0.45); g.lineTo(s * 0.5, s * 0.4); g.fill(); }],
  ["CLASSICAL", "500 BCE", (g, s) => { g.fillRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.12); g.fillRect(-s * 0.45, s * 0.33, s * 0.9, s * 0.12); for (let i = 0; i < 4; i++) g.fillRect(-s * 0.38 + i * s * 0.24, -s * 0.33, s * 0.1, s * 0.66); }],
  ["CASTLES", "1100", (g, s) => { g.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.65); for (let i = 0; i < 4; i++) g.fillRect(-s * 0.3 + i * s * 0.17, -s * 0.35, s * 0.1, s * 0.16); }],
  ["VOYAGES", "1500", (g, s) => { g.beginPath(); g.moveTo(-s * 0.5, s * 0.15); g.lineTo(s * 0.5, s * 0.15); g.lineTo(s * 0.35, s * 0.4); g.lineTo(-s * 0.35, s * 0.4); g.fill(); g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(s * 0.35, s * 0.05); g.lineTo(0, s * 0.05); g.fill(); }],
  ["STEAM", "1800", (g, s) => { g.lineWidth = s * 0.12; g.beginPath(); g.arc(0, 0, s * 0.3, 0, TAU); g.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.fillRect(Math.cos(a) * s * 0.4 - s * 0.06, Math.sin(a) * s * 0.4 - s * 0.06, s * 0.12, s * 0.12); } }],
  ["FLIGHT", "1903", (g, s) => { g.beginPath(); g.ellipse(0, 0, s * 0.5, s * 0.08, 0, 0, TAU); g.fill(); g.fillRect(-s * 0.08, -s * 0.4, s * 0.16, s * 0.8); g.fillRect(-s * 0.48, -s * 0.18, s * 0.08, s * 0.36); }],
  ["SPACE", "1969", (g, s) => { g.beginPath(); g.moveTo(0, -s * 0.5); g.quadraticCurveTo(s * 0.2, -s * 0.2, s * 0.15, s * 0.3); g.lineTo(-s * 0.15, s * 0.3); g.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s * 0.5); g.fill(); g.beginPath(); g.moveTo(-s * 0.15, s * 0.1); g.lineTo(-s * 0.3, s * 0.42); g.lineTo(-s * 0.1, s * 0.3); g.fill(); g.beginPath(); g.moveTo(s * 0.15, s * 0.1); g.lineTo(s * 0.3, s * 0.42); g.lineTo(s * 0.1, s * 0.3); g.fill(); }],
];
export const timelineTex = () => once("timeline", () => canvasTex(2048, 420, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#14204a"); gr.addColorStop(1, "#0a1028"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speckle(g, w, h, seeded(5), 300, ["rgba(255,255,255,.25)"], 1.5);
  g.strokeStyle = "#c9a24a"; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#f3e2b8"; spaced(g, 10); g.font = `700 54px ${SERIF}`; g.fillText("A SHORT HISTORY OF EVERYTHING", w / 2, 62); spaced(g, 0);
  const y = h * 0.66; g.fillStyle = "#c9a24a"; g.fillRect(70, y - 3, w - 140, 6);
  ERAS.forEach(([name, when, icon], i) => {
    const x = 140 + (i * (w - 280)) / (ERAS.length - 1);
    g.fillStyle = "#c9a24a"; g.beginPath(); g.arc(x, y, 14, 0, TAU); g.fill(); g.fillStyle = "#0a1028"; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
    g.save(); g.translate(x, y - 108); g.fillStyle = "#f0d9a0"; g.strokeStyle = "#f0d9a0"; icon(g, 92); g.restore();
    g.fillStyle = "#ffffff"; g.font = `700 30px ${SERIF}`; g.fillText(name, x, y + 44);
    g.fillStyle = "#c9b48a"; g.font = `italic 400 26px ${SERIF}`; g.fillText(when, x, y + 80);
  });
}));
export function fossilTex(kind) {
  return once("fos:" + kind, () => canvasTex(512, 512, (g, w, h) => {
    const r = seeded(kind * 17 + 3);
    g.fillStyle = "#b9ad96"; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 4000, ["rgba(255,255,255,.08)", "rgba(60,40,20,.09)"], 3);
    const emboss = (draw) => { g.save(); g.translate(3, 3); g.strokeStyle = g.fillStyle = "rgba(255,250,235,.45)"; draw(); g.restore(); g.save(); g.strokeStyle = g.fillStyle = "rgba(70,55,35,.75)"; draw(); g.restore(); };
    if (kind === 0) emboss(() => { g.lineWidth = 7; g.beginPath(); for (let a = 0; a < TAU * 3.2; a += 0.05) { const rr = 8 + a * 11; g.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); } g.stroke(); g.lineWidth = 3; for (let a = 1; a < TAU * 3.2; a += 0.22) { const r0 = 8 + a * 11, r1 = 8 + (a + TAU) * 11 - 4; if (a + TAU > TAU * 3.2) continue; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0); g.lineTo(w / 2 + Math.cos(a) * (r0 + (r1 - r0) * 0.9), h / 2 + Math.sin(a) * (r0 + (r1 - r0) * 0.9)); g.stroke(); } });
    if (kind === 1) emboss(() => { g.lineWidth = 6; g.beginPath(); g.moveTo(90, 256); g.lineTo(400, 256); g.stroke(); g.lineWidth = 3; for (let x = 120; x < 380; x += 16) { g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x - 10, 200, x - 20, 180 + Math.abs(x - 250) * 0.3); g.moveTo(x, 256); g.quadraticCurveTo(x - 10, 312, x - 20, 332 - Math.abs(x - 250) * 0.3); g.stroke(); } g.beginPath(); g.ellipse(430, 256, 45, 38, 0, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(90, 256); g.lineTo(40, 200); g.lineTo(60, 256); g.lineTo(40, 312); g.closePath(); g.stroke(); });
    if (kind === 2) emboss(() => { g.lineWidth = 5; g.beginPath(); g.ellipse(w / 2, h / 2, 120, 180, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(w / 2, h / 2 - 140, 110, 50, 0, 0, Math.PI, true); g.stroke(); for (let y = -110; y < 170; y += 22) { g.beginPath(); g.moveTo(w / 2 - 110 + Math.abs(y) * 0.15, h / 2 + y); g.lineTo(w / 2 + 110 - Math.abs(y) * 0.15, h / 2 + y); g.stroke(); } g.beginPath(); g.moveTo(w / 2 - 36, h / 2 - 150); g.lineTo(w / 2 - 36, h / 2 + 170); g.moveTo(w / 2 + 36, h / 2 - 150); g.lineTo(w / 2 + 36, h / 2 + 170); g.stroke(); });
    if (kind === 3) emboss(() => { g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, 470); g.quadraticCurveTo(w / 2 + 30, 260, w / 2 - 10, 40); g.stroke(); g.lineWidth = 3; for (let i = 0; i < 18; i++) { const t = i / 18, y = 440 - t * 390, x = w / 2 + 30 * Math.sin(t * 2.5) - 10 * t, L = 150 * (1 - t * 0.7); for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * L * 0.5, y - 10, L * 0.5, 9, k * -0.35, 0, TAU); g.stroke(); } } });
  }));
}
export const roseTex = () => once("rose", () => canvasTex(1024, 1024, (g, w, h) => {
  const c = w / 2, r = seeded(9);
  g.fillStyle = "#ece5d6"; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
  speckle(g, w, h, r, 1500, ["rgba(120,110,95,.08)"], 3);
  g.fillStyle = "#26302c"; g.beginPath(); g.arc(c, c, c - 6, 0, TAU); g.arc(c, c, c - 90, 0, TAU, true); g.fill();
  g.strokeStyle = "#d4af37"; g.lineWidth = 3; g.fillStyle = "#d4af37"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 30px ${SERIF}`;
  for (let d = 0; d < 360; d += 5) { const a = (d / 180) * Math.PI - Math.PI / 2, L = d % 30 ? 18 : 36; g.beginPath(); g.moveTo(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10)); g.lineTo(c + Math.cos(a) * (c - 10 - L), c + Math.sin(a) * (c - 10 - L)); g.stroke(); if (d % 30 === 0) g.fillText(String(d), c + Math.cos(a) * (c - 66), c + Math.sin(a) * (c - 66)); }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2, big = i % 2 === 0, L = big ? (i % 4 === 0 ? c - 110 : c - 200) : c - 280;
    for (const s of [-1, 1]) { g.fillStyle = s > 0 ? "#d4af37" : "#8a6a24"; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.lineTo(c + Math.cos(a + s * 0.2) * L * 0.28, c + Math.sin(a + s * 0.2) * L * 0.28); g.fill(); }
  }
  g.fillStyle = "#26302c"; g.beginPath(); g.arc(c, c, 40, 0, TAU); g.fill(); g.fillStyle = "#d4af37"; g.beginPath(); g.arc(c, c, 18, 0, TAU); g.fill();
}));
export const medallionTex = () => once("medal", () => canvasTex(1024, 1024, (g, w, h) => {
  const c = w / 2, r = seeded(12);
  const ring = (r0, r1, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r0, 0, TAU); g.arc(c, c, r1, 0, TAU, true); g.fill(); };
  ring(c, c - 40, "#26302c"); ring(c - 40, c - 58, "#d4af37"); ring(c - 58, c - 190, "#efe8d8"); ring(c - 190, c - 206, "#7a1d24"); ring(c - 206, 0, "#e6dccb");
  speckle(g, w, h, r, 2500, ["rgba(120,110,95,.08)", "rgba(255,255,255,.1)"], 3);
  g.save(); g.translate(c, c);
  for (let i = 0; i < 8; i++) { g.rotate(TAU / 8); g.fillStyle = i % 2 ? "#26302c" : "#7a1d24"; g.beginPath(); g.moveTo(0, 0); g.lineTo(60, -60); g.lineTo(0, -(c - 220)); g.lineTo(-60, -60); g.fill(); }
  g.restore();
  g.fillStyle = "#d4af37"; g.beginPath(); g.arc(c, c, 54, 0, TAU); g.fill();
  g.fillStyle = "#3a2f26"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 50px ${SERIF}`;
  const text = "· VERMEIL MUSEUM · ART · SCIENCE · HISTORY ", rr = c - 124;
  for (let i = 0; i < text.length; i++) { const a = (i / text.length) * TAU - Math.PI / 2; g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + Math.PI / 2); g.fillText(text[i], 0, 0); g.restore(); }
}));
export const globeTex = () => once("globe", () => canvasTex(1024, 512, (g, w, h) => {
  const r = seeded(21);
  g.fillStyle = "#c8bd92"; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 7; k++) {
    let x = r() * w, y = h * (0.2 + r() * 0.6); g.fillStyle = "#8f6e3e";
    for (let i = 0; i < 70; i++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 24; y = Math.max(40, Math.min(h - 40, y)); for (const ox of [0, w, -w]) { g.beginPath(); g.arc(x + ox, y, 10 + r() * 22, 0, TAU); g.fill(); } }
  }
  g.strokeStyle = "rgba(60,40,20,.35)"; g.lineWidth = 1.5; for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo((i * w) / 12, 0); g.lineTo((i * w) / 12, h); g.stroke(); } for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, (j * h) / 6); g.lineTo(w, (j * h) / 6); g.stroke(); }
  g.fillStyle = "rgba(60,40,20,.6)"; g.font = `italic 400 22px ${SERIF}`; g.fillText("Mare Incognitum", w * 0.6, h * 0.62); g.fillText("Terra Australis", w * 0.2, h * 0.86);
  g.globalCompositeOperation = "multiply"; g.fillStyle = "rgba(230,200,150,.4)"; g.fillRect(0, 0, w, h);
}));
export const coffinTex = () => once("coffin", () => canvasTex(512, 1024, (g, w, h) => {
  const r = seeded(4);
  g.fillStyle = "#c9a040"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#e8c870"; g.fillRect(w * 0.3, 20, w * 0.4, 190);
  for (let x = 0; x < w; x += 18) { g.fillStyle = (x / 18) % 2 ? "#1f4e8c" : "#c9a040"; if (x < w * 0.3 || x > w * 0.7) g.fillRect(x, 0, 18, 260); }
  g.fillStyle = "#2a2014"; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * 34, 100, 22, 9, 0, 0, TAU); g.fill(); }
  g.fillRect(w / 2 - 4, 112, 8, 40); g.fillRect(w / 2 - 22, 170, 44, 6);
  const bands = ["#1f4e8c", "#c9a040", "#a83a2a", "#c9a040", "#2e7a5a", "#c9a040"];
  for (let i = 0; i < 12; i++) { g.fillStyle = bands[i % bands.length]; g.fillRect(0, 270 + i * 16, w, 16); }
  g.fillStyle = "#c9a040"; g.fillRect(0, 470, w, h - 470);
  g.fillStyle = "#1f4e8c";
  for (let col = 0; col < 5; col++) for (let row = 0; row < 16; row++) {
    const x = 50 + col * 100, y = 500 + row * 32, k = Math.floor(r() * 4);
    if (k === 0) { g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); } else if (k === 1) g.fillRect(x - 12, y - 4, 24, 8); else if (k === 2) { g.beginPath(); g.moveTo(x - 10, y + 8); g.lineTo(x, y - 10); g.lineTo(x + 10, y + 8); g.fill(); } else { g.fillRect(x - 3, y - 10, 6, 20); g.fillRect(x - 8, y - 10, 16, 5); }
  }
  g.fillStyle = "#a83a2a"; for (let x = 30; x < w; x += 100) g.fillRect(x, 470, 4, h - 470);
}));
export const glyphTex = (seed, bg = "#b5a88c", ink = "rgba(60,45,30,.8)") => once(`gl:${seed}:${bg}`, () => canvasTex(256, 512, (g, w, h) => {
  const r = seeded(seed);
  g.fillStyle = bg; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 1500, ["rgba(255,255,255,.08)", "rgba(0,0,0,.08)"], 3);
  g.fillStyle = g.strokeStyle = ink; g.lineWidth = 3;
  for (let row = 0; row < 14; row++) for (let col = 0; col < 6; col++) {
    const x = 26 + col * 38, y = 70 + row * 30, k = Math.floor(r() * 6);
    if (k === 0) { g.beginPath(); g.arc(x, y, 8, 0, TAU); g.stroke(); } else if (k === 1) g.fillRect(x - 10, y - 2, 20, 4); else if (k === 2) { g.beginPath(); g.moveTo(x - 9, y + 9); g.lineTo(x, y - 9); g.lineTo(x + 9, y + 9); g.stroke(); }
    else if (k === 3) { g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8); g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8); g.stroke(); } else if (k === 4) g.fillRect(x - 2, y - 10, 4, 20); else { g.beginPath(); g.arc(x, y, 8, Math.PI, 0); g.stroke(); }
  }
}));
export const sketchTex = () => once("sketch", () => canvasTex(256, 320, (g, w, h) => {
  g.fillStyle = "#f2ead8"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#c98a6a"; g.fillRect(0, 0, w * 0.6, h * 0.55); g.fillStyle = "#7a9ab0"; g.fillRect(0, 0, w * 0.6, h * 0.25);
  g.strokeStyle = "rgba(60,50,40,.7)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w * 0.42, h * 0.8); g.bezierCurveTo(w * 0.2, h * 0.6, w * 0.38, h * 0.4, w * 0.44, h * 0.3); g.lineTo(w * 0.56, h * 0.3); g.bezierCurveTo(w * 0.62, h * 0.4, w * 0.8, h * 0.6, w * 0.58, h * 0.8); g.closePath(); g.stroke();
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * (0.3 + i * 0.08), h * 0.22 - (i % 2) * 14, 14, 0, TAU); g.stroke(); }
  g.beginPath(); g.moveTo(0, h * 0.82); g.lineTo(w, h * 0.82); g.stroke();
}));
