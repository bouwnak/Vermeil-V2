// netmock.js - browser previews only: stands in for skills/netplay.py, with two tabs playing the two PCs (same rules, over a BroadcastChannel). The real app never loads it.
const KINDS_GUEST = new Set(["pos", "leave", "farm.pos", "farm.act"]);
const KINDS_HOST = new Set(["welcome", "kick", "pos", "people", "layout", "farm.welcome", "farm.sync", "farm.pos", "farm.perm", "farm.no", "join_no"]);
const BLOCKED = new Set(["join", "invite", "dm", "friend_req"]);
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export function netMock(code) {
  const IDK = `net.me.${code}`, BANK = `net.bans.${code}`;
  const me = read(IDK, { name: code === "HSTAAA" ? "Host" : code === "GSTBBB" ? "Guest" : "Player", enabled: false, internet: true });
  const saveMe = () => localStorage.setItem(IDK, JSON.stringify(me));
  const seen = {}, names = {}, ch = new BroadcastChannel("vermeil-net");
  let inbox = [], guests = {}, host = null, place = "room", running = false;
  const bans = () => { const now = Date.now() / 1000, all = read(BANK, {}); return Object.fromEntries(Object.entries(all).filter(([, b]) => b.until > now)); };
  const post = (to, msg) => ch.postMessage({ to, from: code, name: me.name, msg });
  const beat = () => ch.postMessage({ hello: code, name: me.name });
  const send = (to, msg) => post(to, msg);
  ch.onmessage = ({ data }) => {
    if (data.hello) { if (data.hello !== code && running) { seen[data.hello] = Date.now(); names[data.hello] = data.name; } return; }
    if (data.to !== code || !running) return;
    const { from, name, msg } = data, k = msg.kind;
    seen[from] = Date.now(); names[from] = name;
    if (BLOCKED.has(k) && bans()[from]) { if (k === "join") send(from, { kind: msg.place === "farm" ? "farm.no" : "join_no", why: "You can't join this person's room right now." }); return; }
    if (k === "join") {
      const want = msg.place || place;
      if (want !== place) { send(from, { kind: want === "farm" ? "farm.no" : "join_no", why: "They're not there any more." }); return; }
      guests[from] = { name, place: want }; msg.place = want;
    }
    if (k === "leave") delete guests[from];
    const g = !!guests[from], h = from === host;
    if (KINDS_GUEST.has(k) && KINDS_HOST.has(k)) { if (!g && !h) return; }
    else if (KINDS_GUEST.has(k) && !g && k !== "leave") return;
    else if (KINDS_HOST.has(k) && !h) return;
    if (k.endsWith("pos")) inbox = inbox.filter((m) => !(m.kind === k && m.from === from && m.id === msg.id));
    inbox.push({ ...msg, from, name, t: Date.now() / 1000 });
  };
  setInterval(() => { if (running) beat(); }, 1000);
  const online = () => Object.fromEntries(Object.entries(seen).filter(([, t]) => Date.now() - t < 5000).map(([c]) => [c, names[c]]));
  const status = () => ({ code, name: me.name, enabled: me.enabled, running, internet: me.internet, port: 47630, searching: true, nodes: 40, online: online(), place, host, guests, bans: bans(), maxGuests: 8 });
  return {
    net_mock_code: code,
    net_status: async () => status(),
    net_enable: async (on) => { running = !!on; me.enabled = !!on; saveMe(); if (on) beat(); return status(); },
    net_set_name: async (n) => { me.name = String(n || "Player").slice(0, 24); saveMe(); return me.name; },
    net_internet: async (on) => { me.internet = !!on; saveMe(); return status(); },
    net_watch: async () => true,
    net_connect: async () => true,
    net_add_route: async () => true,
    net_send: async (to, msg) => { if (!running) return { error: "off" }; send(to, msg); return { ok: true }; },
    net_poll: async (only, skip) => {
      const want = (m) => (!only || only.some((x) => m.kind.startsWith(x))) && (!skip || !skip.some((x) => m.kind.startsWith(x)));
      const out = inbox.filter(want); inbox = inbox.filter((m) => !want(m));
      return { msgs: out, online: online(), guests: { ...guests }, host };
    },
    net_place: async (p) => { place = p === "farm" ? "farm" : "room"; for (const [c, g] of Object.entries(guests)) if (g.place !== place) { delete guests[c]; send(c, { kind: "kick", why: "The host went somewhere else." }); } return true; },
    net_visit: async (c) => { host = c || null; return true; },
    net_kick: async (c, why = "The host asked you to leave.") => { delete guests[c]; send(c, { kind: "kick", why }); return { ok: true }; },
    net_ban: async (c, name = "") => { const b = bans(); b[c] = { name: name || c, until: Date.now() / 1000 + 86400 }; localStorage.setItem(BANK, JSON.stringify(b)); if (guests[c]) { delete guests[c]; send(c, { kind: "kick", why: "The host banned you from this room for a day." }); } return { ok: true }; },
    net_unban: async (c) => { const b = bans(); delete b[c]; localStorage.setItem(BANK, JSON.stringify(b)); return { ok: true }; },
  };
}
