// coop.js - player 2 on Turtle Island (skills/netplay.py carries it). The host's game is the real one: a visitor walks around a copy of the farm, and
// what they do to the crops is asked of the host, who applies it and sends the farm back. A visitor's own save is never touched.
import * as THREE from "three";
import { character } from "./assets.js";
import { COMPANION, ITEMS, modelOf } from "./data.js";
import { keyOf, ripe } from "./farm.js";
import { groundAt, isWet, seasonOf } from "./world.js";
import { popup } from "./ui.js";

const WORK_TOOLS = ["hand", "hoe", "can", "seeds"];
const PERMS = { roam: "Roam only", help: "Help with the farm" };
const LOST = 18e3;
const cleanCode = (t) => String(t || "").toUpperCase().replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ2-9]/g, "").slice(0, 6);

/** to the main room, with a word about why */
function leaveTo(text, mock) {
  try { if (text) sessionStorage.setItem("net.msg", text); } catch { /* fine */ }
  location.href = `../index.html${mock ? `?mock&me=${mock}` : ""}`;
  return new Promise(() => {});
}

/** a visitor, before the world is built: ask to come in, and wait for a copy of the host's farm */
export async function joinFarm(api, hostCode, mine, say) {
  const mock = api.net_mock_code;
  const st = await api.net_enable(true);
  if (st?.error) return leaveTo(st.error, mock);
  await api.net_visit(hostCode);
  say("Looking for your host…");
  await api.net_send(hostCode, { kind: "join", place: "farm" });
  const end = Date.now() + 50e3;
  while (Date.now() < end) {
    const r = await api.net_poll(["farm.", "kick", "send_fail"]);
    for (const m of r?.msgs || []) {
      if (m.kind === "farm.welcome" && m.state && typeof m.state === "object") {
        const s = m.state, at = Array.isArray(m.at) ? m.at : s.pos;
        return {
          guest: { host: hostCode, hostName: m.name, perm: PERMS[m.perm] ? m.perm : "roam", at: Date.now() },
          state: { ...s, name: mine?.name || st.name || "Visitor", body: mine?.body || "male", skin: mine?.skin || "Farmer", helper: "follow", opts: mine?.opts || {},
                   pos: [at[0] + 2, at[1] + 2], dinos: (s.dinos || []).map((d) => ({ ...d, jobs: {}, stay: true })) },
        };
      }
      if (m.kind === "farm.no" || m.kind === "kick") { await api.net_visit(null); return leaveTo(String(m.why || "They can't have visitors right now.").slice(0, 120), mock); }
      if (m.kind === "send_fail" && m.about === "join") { await api.net_visit(null); return leaveTo("Couldn't reach them. They may be offline, or their network doesn't allow direct connections.", mock); }
    }
    await new Promise((d) => setTimeout(d, 200));
  }
  await api.net_visit(null);
  return leaveTo("No answer. They may be offline, or they've left their farm.", mock);
}

function nameTag(text) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = 320; c.height = 72;
  g.font = "800 34px Nunito, sans-serif";
  const w = Math.min(310, g.measureText(text).width + 34);
  g.fillStyle = "rgba(20,30,20,.8)"; g.beginPath(); g.roundRect((320 - w) / 2, 8, w, 54, 26); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 160, 36);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
  s.scale.set(2.3, 0.52, 1); s.renderOrder = 5;
  return s;
}

export function makeCoop(G, api) {
  const $ = (id) => document.getElementById(id);
  const people = new Map();                 // everyone else on the island: their farmer and their companion
  const guests = {};                        // host: who's visiting, and what they may do
  let st = null, sentPlots = "", sentInv = "", timer = null, syncIn = 0, invites = [], fresh = 0;
  const C = { active: false, people };
  const mock = api?.net_mock_code;
  const send = (to, msg, loose) => api?.net_send(to, msg, !!loose);
  const me = () => st?.code;
  const mine = () => {
    const P = G.player, v = G.companion;
    return { x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), h: +P.heading.toFixed(2), m: P.movingNow ? 1 : 0, body: G.s.body, skin: G.s.skin, who: G.s.name || st?.name, cn: COMPANION.name,
             cx: v ? +v.pos.x.toFixed(2) : null, cz: v ? +v.pos.z.toFixed(2) : null, ch: v ? +v.heading.toFixed(2) : 0, cv: v?.char.holder.visible ? 1 : 0 };
  };

  // ---------- other people, seen on the island ----------
  async function makePerson(id, d) {
    const P = { id, goal: d, busy: true };
    people.set(id, P);
    const you = await character(modelOf(d.body, /^\w+$/.test(d.skin) ? d.skin : "Farmer"), 1.75), pal = await character(COMPANION.model, 1.6);
    if (!people.has(id)) return;
    P.you = you; P.pal = pal; P.busy = false;
    if (you) { const t = nameTag(String(d.who || "Player").slice(0, 24)); t.position.y = 2.3; you.holder.add(t); G.scene.add(you.holder); you.holder.position.set(d.x, groundAt(G, d.x, d.z).y, d.z); }
    if (pal) { const t = nameTag(String(d.cn || "Companion").slice(0, 24)); t.position.y = 2.1; t.scale.multiplyScalar(0.8); pal.holder.add(t); G.scene.add(pal.holder); pal.holder.visible = false; }
  }
  function removePerson(id) {
    const P = people.get(id);
    people.delete(id);
    if (P?.you) G.scene.remove(P.you.holder);
    if (P?.pal) G.scene.remove(P.pal.holder);
  }
  function seen(id, d) {
    if (!Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
    const P = people.get(id);
    if (P) P.goal = d; else makePerson(id, d);
  }
  C.tick = (dt) => {
    const k = Math.min(1, dt * 8);
    for (const P of people.values()) {
      const d = P.goal;
      if (P.you) {
        const h = P.you.holder, y = groundAt(G, d.x, d.z).y;
        h.position.x += (d.x - h.position.x) * k; h.position.z += (d.z - h.position.z) * k; h.position.y += (y - h.position.y) * k;
        h.rotation.y = d.h || 0;
        P.you.play(d.m ? "walk" : "idle"); P.you.mixer.update(dt);
      }
      if (P.pal) {
        const h = P.pal.holder, on = d.cv && Number.isFinite(d.cx);
        h.visible = !!on;
        if (on) {
          const moving = Math.hypot(d.cx - h.position.x, d.cz - h.position.z) > 0.15;
          h.position.x += (d.cx - h.position.x) * k; h.position.z += (d.cz - h.position.z) * k; h.position.y = groundAt(G, h.position.x, h.position.z).y;
          h.rotation.y = d.ch || 0;
          P.pal.play(moving ? "walk" : "idle"); P.pal.mixer.update(dt);
        }
      }
    }
  };

  // ---------- host ----------
  const defaultPerm = () => (PERMS[G.s.opts?.coopPerm] ? G.s.opts.coopPerm : "roam");
  function arrive(m) {
    if (m.byCode) { send(m.from, { kind: "welcome", place: "farm" }); return; }       // they typed my code: "I'm on my farm, come there"
    const P = G.player, had = guests[m.from];
    guests[m.from] = { name: m.name, perm: had?.perm || defaultPerm(), at: Date.now(), pos: null };
    send(m.from, { kind: "farm.welcome", state: G.s, perm: guests[m.from].perm, at: [P.pos.x, P.pos.z] });
    popup(`${m.name} is here with their companion`, "good");
    renderPanel();
  }
  function goneGuest(code, text) {
    if (!guests[code]) return;
    delete guests[code];
    removePerson(code);
    if (text) popup(text);
    renderPanel();
  }
  C.setPerm = (code, perm) => {
    if (!guests[code] || !PERMS[perm]) return;
    guests[code].perm = perm;
    send(code, { kind: "farm.perm", perm });
    renderPanel();
  };
  /** what a visitor asked to do: it has to be allowed, close to them, and something the rules allow */
  function act(m) {
    const g = guests[m.from];
    if (!g || g.perm !== "help" || !WORK_TOOLS.includes(m.tool) || !Array.isArray(m.cells) || !g.pos) return;
    const s = G.s, F = G.farm;
    for (const c of m.cells.slice(0, 25)) {
      const x = Number(c?.x), z = Number(c?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - g.pos.x, z - g.pos.z) > 9) continue;
      const k = keyOf(x, z), plot = s.plots[k];
      if (m.tool === "hoe") { if (plot) plot.weed = false; else if (!F.whyAt(x, z)) s.plots[k] = { crop: null, age: 0, wet: isWet(s.weather) }; }
      else if (m.tool === "can") { if (plot) plot.wet = true; }
      else if (m.tool === "seeds") { if (plot && !plot.crop && ITEMS[m.seed]?.seed && s.inv[m.seed] > 0) G.plant(k, plot, m.seed, true); }
      else if (plot && ripe(plot)) G.reap(k, plot, true);
    }
    F.draw();
    syncIn = 0;                              // show it to them now
  }
  function pushSync() {
    const codes = Object.keys(guests);
    if (!codes.length) return;
    const s = G.s, plots = JSON.stringify(s.plots), inv = JSON.stringify(s.inv), msg = { kind: "farm.sync", minute: s.minute, day: s.day, weather: s.weather };
    if (plots !== sentPlots) { msg.plots = s.plots; sentPlots = plots; }
    if (inv !== sentInv) { msg.inv = s.inv; sentInv = inv; }
    for (const c of codes) send(c, msg);
  }

  // ---------- a visitor ----------
  /** the tool in your hand, on someone else's farm */
  C.tool = (forced) => {
    const g = G.guest, P = G.player, id = forced || G.tool.id, F = G.farm;
    if (P.riding || P.sailing || P.busy) return;
    if (g.perm !== "help") { popup(`${g.hostName} has you on roam only`); return; }
    if (!WORK_TOOLS.includes(id)) { popup("Only the host can use that here"); return; }
    const t = F.target(), cells = id === "hand" || id === "seeds" ? [t] : F.reach(id);
    const seed = id === "seeds" ? G.seedChoice() : null;
    if (id === "seeds" && !seed) { popup("The farm has no seeds left"); return; }
    if (id === "hoe") P.act("swing"); else P.act("use", null, 0.34, id === "can" ? "pour" : "kneel");
    send(g.host, { kind: "farm.act", tool: id, cells: cells.map((c) => ({ x: c.x, z: c.z })), seed });
  };
  function applySync(m) {
    const s = G.s, before = seasonOf(s.day).index;
    if (Number.isFinite(m.minute)) s.minute = m.minute;
    if (typeof m.weather === "string") s.weather = m.weather;
    if (m.inv && typeof m.inv === "object") s.inv = m.inv;
    if (m.plots && typeof m.plots === "object") { s.plots = m.plots; G.farm.draw(); }
    if (Number.isFinite(m.day) && m.day !== s.day) {
      s.day = m.day;
      if (seasonOf(s.day).index !== before) location.reload();        // the whole world changes colour: come back in to the new season
    }
  }
  C.leave = async () => {
    if (!G.guest) return;
    await send(G.guest.host, { kind: "leave" });
    await api.net_visit(null);
  };
  async function endVisit(text) {
    await api.net_visit(null);
    G.guest = null;
    leaveTo(text, mock);
  }

  // ---------- messages ----------
  function handle(m) {
    if (G.guest && m.from === G.guest.host) G.guest.at = Date.now();
    if (guests[m.from]) guests[m.from].at = Date.now();
    switch (m.kind) {
      case "join": arrive(m); break;
      case "leave": goneGuest(m.from, `${m.name} went home`); break;
      case "farm.pos":
        if (guests[m.from] && !m.id && Number.isFinite(m.x) && Number.isFinite(m.z)) guests[m.from].pos = { x: m.x, z: m.z };
        seen(m.id || m.from, m);
        break;
      case "farm.act": act(m); break;
      case "farm.sync": if (G.guest) applySync(m); break;
      case "farm.perm":
        if (G.guest && PERMS[m.perm]) { G.guest.perm = m.perm; popup(m.perm === "help" ? `${G.guest.hostName} lets you help with the farm` : `${G.guest.hostName} set you to roam only`); renderPanel(); }
        break;
      case "kick": if (G.guest) endVisit(String(m.why || "The host asked you to leave.").slice(0, 120)); break;
      case "invite": invites.push(m); showInvite(); break;
      case "invite_no": popup(`${m.name} can't come right now`); break;
      case "send_fail": if (m.about === "invite") popup("Couldn't reach them right now"); break;
    }
  }
  function beat() {
    const d = mine();
    if (G.guest) {
      send(G.guest.host, { kind: "farm.pos", ...d }, true);
      if (Date.now() - G.guest.at > LOST) endVisit("The connection to the host was lost.");
    } else {
      const codes = Object.keys(guests);
      for (const to of codes) {
        send(to, { kind: "farm.pos", id: st.code, ...d }, true);
        for (const c of codes) { const P = c !== to && people.get(c); if (P?.goal) send(to, { kind: "farm.pos", ...P.goal, id: c }, true); }
      }
      for (const c of codes) if (Date.now() - guests[c].at > LOST) { api.net_kick(c, "The connection was lost."); goneGuest(c, `${guests[c]?.name || "Your visitor"} lost their connection`); }
      if ((syncIn -= 1) <= 0) { syncIn = 7; pushSync(); }
    }
  }
  async function pollOnce() {
    const r = await api.net_poll(["farm.", "join", "leave", "kick", "invite", "send_fail"]);
    for (const m of r?.msgs || []) { try { handle(m); } catch (e) { console.warn("[coop]", e); } }
  }
  function run() {
    if (timer) return;
    C.active = true;
    timer = setInterval(() => { pollOnce().catch((e) => console.warn("[coop]", e)); if (!G.paused || G.guest || Object.keys(guests).length) beat(); }, 200);
  }
  async function turnOn() {
    st = await api.net_enable(true);
    if (st?.error) { popup(st.error); return false; }
    if (!G.guest) await api.net_place("farm");
    run();
    renderPanel();
    return true;
  }

  // ---------- invites arriving while you farm ----------
  function showInvite() {
    const box = $("coopInvite"), m = invites[0];
    box.hidden = !m;
    if (!m) return;
    box.replaceChildren();
    const text = document.createElement("p");
    text.textContent = `${m.name} invited you to their ${m.place === "farm" ? "farm" : "room"}.`;
    const yes = button("Accept", async () => {
      invites = [];
      await C.leave();
      await G.save?.();
      location.href = m.place === "farm" ? `index.html?guest=${m.from}${mock ? `&mocknet=${mock}` : ""}` : `../index.html?visit=${m.from}${mock ? `&mock&me=${mock}` : ""}`;
    });
    const no = button("Decline", () => { send(m.from, { kind: "invite_no" }); invites.shift(); showInvite(); }, "ghost");
    box.append(text, yes, no);
  }

  // ---------- the panel ----------
  function button(label, fn, cls = "") { const b = document.createElement("button"); b.type = "button"; b.className = `cozy small ${cls}`; b.textContent = label; b.onclick = fn; return b; }
  function line(tag, text, cls) { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; }
  function permSelect(value, change) {
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "What they can do");
    for (const [k, label] of Object.entries(PERMS)) { const o = document.createElement("option"); o.value = k; o.textContent = label; o.selected = k === value; sel.append(o); }
    sel.onchange = () => change(sel.value);
    return sel;
  }
  async function renderPanel() {
    const box = $("coopPanel");
    if (!box || box.hidden) return;
    const stamp = ++fresh, title = line("h3", G.guest ? `Visiting ${G.guest.hostName}` : "Play together");
    const close = button("×", () => { box.hidden = true; }, "ghost coop-close");
    const parts = [close, title];
    if (G.guest) {
      parts.push(line("p", G.guest.perm === "help" ? "You can help with the farm: till, water, plant and harvest. What you grow goes to the host's farm." : "You can walk around. The host can let you help with the farm."));
      parts.push(line("p", "Your own farm isn't touched while you're here.", "coop-note"));
      parts.push(button("Go home", async () => { await C.leave(); leaveTo("", mock); }));
    } else if (!st?.running) {
      parts.push(line("p", "Invite someone to your farm as player 2, on any network. Their companion comes with them."));
      parts.push(line("p", "PCs connect directly, with no server in between. Your internet address (IP) can be seen on the public lookup network and by the people you connect with. Windows may ask to allow Vermeil through its firewall: choose Allow.", "coop-note"));
      parts.push(button("Turn on visits", turnOn));
    } else {
      const code = document.createElement("div"); code.className = "coop-code"; code.append(line("small", "My code"), line("b", st.code));
      parts.push(code);
      const form = document.createElement("form"); form.className = "coop-row";
      const input = document.createElement("input"); input.maxLength = 6; input.placeholder = "Their code"; input.setAttribute("aria-label", "Their 6-character code"); input.oninput = () => { input.value = cleanCode(input.value); };
      form.append(input, button("Invite", () => form.requestSubmit()));
      form.onsubmit = (e) => { e.preventDefault(); if (input.value.length === 6) { send(input.value, { kind: "invite", place: "farm" }); popup("Invite sent"); input.value = ""; } };
      parts.push(form);
      const saved = await api.social_load?.().catch?.(() => null);
      if (stamp !== fresh) return;
      const friends = (saved?.friends || []).filter((f) => f.code && !f.pending);
      if (friends.length) {
        parts.push(line("h4", "Friends"));
        for (const f of friends) { const r = document.createElement("div"); r.className = "coop-row"; r.append(line("span", f.name), button("Invite", () => { send(f.code, { kind: "invite", place: "farm" }); popup(`Invite sent to ${f.name}`); })); parts.push(r); }
      }
      parts.push(line("h4", "New visitors can"));
      parts.push(permSelect(defaultPerm(), (v) => { (G.s.opts ||= {}).coopPerm = v; }));
      const here = Object.entries(guests);
      parts.push(line("h4", here.length ? "On your farm" : "Nobody's visiting yet"));
      for (const [c, g] of here) {
        const r = document.createElement("div"); r.className = "coop-person";
        r.append(line("b", g.name), permSelect(g.perm, (v) => C.setPerm(c, v)),
          button("Kick", () => { api.net_kick(c); goneGuest(c, `${g.name} had to leave`); }, "ghost"),
          button("Ban 1 day", () => { api.net_ban(c, g.name); goneGuest(c, `${g.name} is banned for one day`); }, "ghost"));
        parts.push(r);
      }
    }
    box.replaceChildren(...parts);
  }
  C.toggle = () => { const box = $("coopPanel"); box.hidden = !box.hidden; renderPanel(); };

  C.start = async () => {
    const b = $("coopBtn");
    if (!api?.net_status) { if (b) b.hidden = true; return; }
    st = await api.net_status();
    if (G.guest) { document.body.classList.add("coop-guest"); await turnOn(); popup(`You're on ${G.guest.hostName}'s farm`, "good"); }
    else if (st?.enabled) await turnOn();
  };
  return C;
}
