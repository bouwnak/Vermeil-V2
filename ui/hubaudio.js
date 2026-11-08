// hubaudio.js - the sound of the social hubs: each hub has its own music and its own ambience (all made in code by
// game/audio.js, so nothing to download), footsteps that match the ground you're on, and the sounds of portals and
// arrivals. The 🔊 button on the hub bar turns it all on or off (remembered).
import { Audio } from "./game/audio.js";

// hub -> [ambience scene, music theme, options, ground underfoot]
const SCENES = {
  main: ["hub_main", "hub_main", {}, "wood"], park: ["meadow", "hub_park", { water: true }, "grass"], cafe: ["hub_cafe", "hub_cafe", {}, "wood"],
  library: ["hub_library", "hub_library", {}, "wood"], study: ["hub_library", "hub_library", {}, "wood"], museum: ["hub_museum", "hub_museum", {}, "stone"],
  arcade: ["hub_arcade", "hub_arcade", {}, "default"], beach: ["beach", "beach", {}, "sand"], stalls: ["hub_stalls", "hub_stalls", {}, "stone"],
};
const KEY = "hubSound";
let A = null, room = null, hub = null, timer = null, last = null, walked = 0;
let on = true;
try { on = localStorage.getItem(KEY) !== "off"; } catch { /* default on */ }

function audio() {
  if (!A) { A = new Audio(); A.init(); }
  A.resume();
  return A;
}
function start() {
  if (!on || !hub) return;
  const [scene, theme, opts] = SCENES[hub.key] || SCENES.main;
  const a = audio();
  if (!a.ctx) return;
  a.setScene(scene, theme, "day", opts);
}
function stop() { if (A) A.stopScene(); }

/** footsteps: one every ~0.7 m you cover, the sound of the ground under you */
function tick() {
  if (!on || !room || !hub || !A?.ctx) return;
  const c = room.char; if (!c) return;
  const p = c.root.position;
  if (last) {
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    if (d < 5) walked += d;                                          // a jump (a portal, a respawn) isn't a step
    const stride = (c.speed || 0) > 4 ? 0.95 : 0.7;
    if (walked > stride) { walked = 0; A.step(SCENES[hub.key]?.[3] || "default", { vol: 0.9 }); }
  }
  last = { x: p.x, z: p.z };
}

/** room.js calls these when you walk into a hub and when you leave for home */
export function hubEntered(r, h) {
  room = r; hub = h; last = null; walked = 0;
  start();
  clearInterval(timer); timer = setInterval(tick, 90);
  syncButton();
  setTimeout(() => { if (on && A?.ctx && hub === h) A.sfx("arrive"); }, 250);
}
export function hubLeft() {
  hub = null; clearInterval(timer); timer = null;
  stop();
  syncButton();
}
/** a named sound from the hubs (portals, arrivals...) */
export function hubSfx(name) { if (on && hub && A?.ctx) A.sfx(name); }
window.addEventListener("hubsfx", (e) => hubSfx(e.detail));
// browsers only start sound after a click or key: pick the music up then
for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, () => { if (on && hub && (!A?.ctx || A.ctx.state !== "running" || !A.song)) start(); }, { capture: true, passive: true });

// the 🔊 button on the hub bar
function syncButton() {
  const pill = document.getElementById("hubPill"); if (!pill) return;
  let b = document.getElementById("hubSound");
  if (!b) {
    b = Object.assign(document.createElement("button"), { type: "button", id: "hubSound" });
    b.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* not remembered */ }
      if (on) start(); else stop();
      syncButton();
    });
    pill.insertBefore(b, document.getElementById("hubLeave"));
  }
  b.textContent = on ? "🔊" : "🔇";
  b.title = on ? "Hub music and sounds are on. Click to mute." : "Hub music and sounds are off. Click to turn them on.";
  b.setAttribute("aria-label", b.title);
  b.setAttribute("aria-pressed", String(on));
}
