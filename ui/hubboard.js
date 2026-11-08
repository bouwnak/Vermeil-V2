// hubboard.js - the Lumen leaderboard shown round the hubs: the big board in the Main Hub, the holo cards spinning in the canopy's
// crown and the hologram over Central Park's fountain all read from here, so they always agree.
// Rows come from setBoardRows() when the network has the real ranking across every server; until then a sample ranking that
// moves on its own (people earn a little Lumen every few seconds, ranks swap) so the displays have something live to show.

const SERVERS = ["Aurora", "Nimbus", "Solstice", "Driftwood", "Lumen Bay", "Harbor", "Cinder", "Meadow"];
const SAMPLE = [
  ["Nova", 98420], ["Pixelfox", 91310], ["Mossy", 84775], ["Kite", 77260], ["Orbit", 70815], ["Juno", 64190], ["Lumen", 58840], ["Wren", 52115],
  ["Echo", 47380], ["Skye", 42960], ["Bramble", 38220], ["Tidal", 34870], ["Quill", 31045], ["Ember", 27710], ["Marlo", 24390], ["Saffi", 21980],
  ["Rook", 19105], ["Indi", 16720], ["Pebble", 14390], ["Halo", 12210],
];
const HUES = [48, 200, 330, 150, 270, 20, 180, 300, 95, 230, 10, 165, 285, 60, 210, 345, 120, 250, 30, 190];

/** one player on the board: name, vcash, server, hue (their colour), and the rank they had before (for the up/down arrows) */
let rows = SAMPLE.map(([name, vcash], i) => ({ name, vcash, server: SERVERS[(i * 3) % SERVERS.length], hue: HUES[i % HUES.length], prev: i }));
let live = false, version = 1;
const listeners = new Set();
const sortRows = () => { rows.sort((a, b) => b.vcash - a.vcash); };
const changed = () => { version++; for (const f of listeners) try { f(rows); } catch (e) { console.warn("[board]", e); } };

/** the ranking, best first (don't change it: use setBoardRows) */
export const boardRows = () => rows;
export const boardVersion = () => version;
export const boardIsLive = () => live;
export const onBoard = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** the real ranking from the network: [{ name, vcash, server?, hue? }] */
export function setBoardRows(list) {
  if (!Array.isArray(list) || !list.length) return;
  const before = new Map(rows.map((r, i) => [r.name, i]));
  rows = list.map((r, i) => ({ name: String(r.name || "Player").slice(0, 16), vcash: Math.max(0, Math.round(+r.vcash || 0)), server: r.server || "", hue: r.hue ?? HUES[i % HUES.length], prev: before.get(r.name) ?? i }));
  sortRows(); live = true; changed();
}

/** you: your own Lumen goes on the sample board too, so you can see where you'd stand */
export function setMyVcash(name, vcash) {
  if (live || !Number.isFinite(+vcash)) return;
  let me = rows.find((r) => r.me);
  if (!me) { me = { name: name || "You", vcash: 0, server: "This PC", hue: 160, prev: rows.length, me: true }; rows.push(me); }
  me.name = name || me.name; me.vcash = Math.round(+vcash);
  sortRows(); changed();
}

// the sample board lives a little: every few seconds somebody earns some Lumen, and now and then someone climbs a place
setInterval(() => {
  if (live || typeof document !== "undefined" && document.hidden) return;
  rows.forEach((r, i) => { r.prev = i; });
  for (let k = 0; k < 3; k++) {
    const i = Math.floor(Math.random() ** 1.6 * rows.length), r = rows[i];
    if (!r || r.me) continue;
    const next = rows[i - 1], gap = next ? next.vcash - r.vcash : 0;
    r.vcash += Math.random() < 0.18 && next ? gap + 40 + Math.floor(Math.random() * 300) : 15 + Math.floor(Math.random() * 180);
  }
  sortRows(); changed();
}, 7000);

export const fmtV = (n) => Math.round(n).toLocaleString("en-US");
export const MEDALS = [["#ffd76a", "#b8860b", "GOLD"], ["#e9eef5", "#8a95a5", "SILVER"], ["#f0a46a", "#9a5427", "BRONZE"]];

/** lines for the ticker under the big board */
export const SOCIZ_LINES = [
  "WELCOME TO SOCIZLIGIN",
  "SOCIZLIGIN: EVERY WORLD, ONE DOORWAY",
  "MET SOMEONE NEW TODAY? THAT'S THE SOCIZLIGIN WAY",
  "SOCIZLIGIN NEVER SLEEPS: THE BEACON IS ALWAYS ON",
  "RENT A STALL, BUILD A WORLD, MAKE IT YOURS",
  "SOCIZLIGIN TIP: CLICK ANYTHING - IT ALL DOES SOMETHING",
  "TOP LUMEN ACROSS EVERY SOCIZLIGIN SERVER, LIVE",
  "SAY HELLO TO THE PERSON NEXT TO YOU",
  "SOCIZLIGIN: WHERE THE CLOUD CITY MEETS",
  "THE CAFE IS OPEN. THE ARCADE IS LOUD. THE BEACH IS AT SUNSET",
  "EVERY ARRIVAL LIGHTS THE BEACON",
  "SOCIZLIGIN LOVES YOU BACK",
  "EARN LUMEN, CLIMB THE BOARD, GET YOUR NAME IN LIGHTS",
  "PORTALS ON THE BOULEVARD GO EVERYWHERE",
];

// ---------------------------------------------------------------- drawing helpers, shared by every display
/** a friendly drawn avatar for a player (nobody real): a round head with a fringe in their colour, on shoulders */
export function drawAvatar(g, cx, cy, R, row, { ring = null, glow = 0 } = {}) {
  const h = row.hue ?? 200;
  g.save();
  if (glow) { g.shadowColor = ring || `hsl(${h},90%,60%)`; g.shadowBlur = glow; }
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
  const bg = g.createLinearGradient(cx, cy - R, cx, cy + R); bg.addColorStop(0, `hsl(${h},70%,32%)`); bg.addColorStop(1, `hsl(${(h + 40) % 360},70%,16%)`);
  g.fillStyle = bg; g.fill(); g.shadowBlur = 0;
  g.clip();
  g.fillStyle = `hsl(${h},35%,88%)`; g.beginPath(); g.ellipse(cx, cy + R * 0.95, R * 0.78, R * 0.55, 0, Math.PI, 0); g.fill();        // shoulders
  g.beginPath(); g.arc(cx, cy - R * 0.08, R * 0.38, 0, Math.PI * 2); g.fill();                                                       // head
  g.fillStyle = `hsl(${h},80%,62%)`; g.beginPath(); g.arc(cx, cy - R * 0.2, R * 0.4, Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(cx + R * 0.1, cy - R * 0.2, cx - R * 0.38, cy - R * 0.12); g.fill();   // fringe
  g.fillStyle = `hsl(${h},40%,22%)`; for (const dx of [-0.13, 0.13]) { g.beginPath(); g.arc(cx + dx * R, cy - R * 0.04, R * 0.045, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = `hsl(${h},40%,22%)`; g.lineWidth = Math.max(1, R * 0.04); g.beginPath(); g.arc(cx, cy + R * 0.04, R * 0.12, 0.25, Math.PI - 0.25); g.stroke();
  g.restore();
  if (ring) { g.save(); g.lineWidth = Math.max(2, R * 0.09); g.strokeStyle = ring; g.shadowColor = ring; g.shadowBlur = R * 0.4; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.restore(); }
}
/** a little cut gem (the Lumen mark) */
export function drawGem(g, x, y, s, col = "#7ff3ff") {
  g.save(); g.translate(x, y); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = s * 0.6;
  g.beginPath(); g.moveTo(-s * 0.5, -s * 0.15); g.lineTo(-s * 0.25, -s * 0.45); g.lineTo(s * 0.25, -s * 0.45); g.lineTo(s * 0.5, -s * 0.15); g.lineTo(0, s * 0.5); g.closePath(); g.fill();
  g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.moveTo(-s * 0.25, -s * 0.45); g.lineTo(0, -s * 0.15); g.lineTo(-s * 0.5, -s * 0.15); g.closePath(); g.fill();
  g.restore();
}
/** a small crown, for number one */
export function drawCrown(g, x, y, s, col = "#ffd76a") {
  g.save(); g.translate(x, y); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = s * 0.5;
  g.beginPath(); g.moveTo(-s, s * 0.45); g.lineTo(-s, -s * 0.2); g.lineTo(-s * 0.5, s * 0.1); g.lineTo(0, -s * 0.55); g.lineTo(s * 0.5, s * 0.1); g.lineTo(s, -s * 0.2); g.lineTo(s, s * 0.45); g.closePath(); g.fill();
  g.shadowBlur = 0; g.fillStyle = "#fff8"; for (const dx of [-1, 0, 1]) { g.beginPath(); g.arc(dx * s * (dx ? 1 : 0), dx ? -s * 0.28 : -s * 0.62, s * 0.11, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
export const fitText = (g, text, maxW, px, weight = 800, family = "Nunito, sans-serif") => {
  let size = px; g.font = `${weight} ${size}px ${family}`;
  while (g.measureText(text).width > maxW && size > 10) { size -= 2; g.font = `${weight} ${size}px ${family}`; }
  return size;
};
