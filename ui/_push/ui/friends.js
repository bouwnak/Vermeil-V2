// friends.js - real people on other PCs (skills/netplay.py): the Friends button, codes, invites, visiting a room, and kicking or banning someone from yours.
import { el } from "./social.js";

const CODE_CHARS = /[^ABCDEFGHJKMNPQRSTUVWXYZ2-9]/g;
const INVITE_MINUTES = 10, LOST_SECONDS = 18;
const TEST_BAN = "TESTFR";                 // the test friend's ban sits with the real ones, so all of it can be tried on one PC
const FARM = (code) => `turtle/index.html?guest=${code}`;
const colorOf = (code) => { let h = 0; for (const c of String(code)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 75% 62%)`; };
const cleanCode = (t) => String(t || "").toUpperCase().replace(CODE_CHARS, "").slice(0, 6);
const untilText = (t) => { const m = Math.max(1, Math.round((t - Date.now() / 1000) / 60)); return m >= 60 ? `${Math.round(m / 60)} h left` : `${m} min left`; };

export function initFriends({ api, room, toast, social }) {
  const $ = (id) => document.getElementById(id);
  const { hooks, choices, notify, say, save, dialog } = social, db = () => social.data();
  let st = null, online = {}, guests = {}, visit = null, hostAt = 0, seenAt = {}, sentLayout = "", layoutIn = 0, posTimer = null, polling = false, listEl = null;
  const myPos = () => { const p = room.char?.root.position; return p ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2) } : { x: 0, z: 0 }; };
  const on = () => !!st?.running;
  const friendOf = (code) => db().friends.find((f) => f.code === code);
  const addPerson = (code, name) => room.roamers.add({ id: code, name, color: colorOf(code), still: true, x: 0.4, z: 2.4 });

  async function refresh() {
    st = await api.net_status?.().catch?.(() => null);
    online = st?.online || {};
    return st;
  }
  async function turnOn() {
    const r = await api.net_enable(true);
    if (r?.error) { toast(r.error, 5000); return false; }
    st = r;
    await api.net_place("room");
    watchFriends();
    startPolling();
    return true;
  }
  /** before anything that needs the connection */
  async function need() {
    if (on()) return true;
    return turnOn();
  }
  const watchFriends = () => api.net_watch?.(db().friends.filter((f) => f.code).map((f) => f.code));

  // ---------- friends ----------
  function addFriend(code) {
    code = cleanCode(code);
    if (code.length !== 6) { toast("A code has 6 letters and numbers."); return; }
    if (code === st?.code) { toast("That's your own code."); return; }
    if (friendOf(code)) { toast("You're already friends."); return; }
    db().friends.push({ id: code, code, name: `Friend ${code}`, color: colorOf(code), status: "Friend request sent", pending: true, askedAt: Date.now() });
    save(); watchFriends();
    api.net_send(code, { kind: "friend_req" });
    toast("Friend request sent. They'll see it when they're online.", 3000);
    renderList();
  }
  function befriend(code, name) {
    const f = friendOf(code);
    if (f) Object.assign(f, { name, pending: false, status: "" });
    else db().friends.push({ id: code, code, name, color: colorOf(code), status: "" });
    save(); watchFriends(); renderList(); social.renderMessages();
  }
  function removeFriend(f) {
    db().friends = db().friends.filter((x) => x !== f);
    save(); watchFriends(); renderList(); social.renderMessages();
  }
  choices.friendReq = ({ code, name }, yes) => {
    if (yes) { befriend(code, name); api.net_send(code, { kind: "friend_ok" }); toast(`${name} is in your friends now.`, 2500); }
    else api.net_send(code, { kind: "friend_no" });
  };

  // ---------- invites ----------
  hooks.invite = async (f) => {
    if (!await need()) return;
    say(f.id, "me", "✉ Come and join me in my room!"); social.renderMessages();
    api.net_send(f.code, { kind: "invite", place: "room" });
    toast(`Invite sent to ${f.name}.`, 2000);
  };
  choices.invite = ({ code, name, place, t }, yes) => {
    if (Date.now() - t > INVITE_MINUTES * 60e3) { toast("That invite has run out. Ask for a new one."); return; }
    if (yes) join(code, place, name);
    else api.net_send(code, { kind: "invite_no" });
  };

  // ---------- visiting someone ----------
  /** go to them: by an invite, or by typing their code. They're found wherever they are; the farm is its own page */
  async function join(code, place, name) {
    code = cleanCode(code);
    if (code.length !== 6) { toast("A code has 6 letters and numbers."); return; }
    if (code === st?.code) { toast("That's your own code."); return; }
    if (!await need()) return;
    if (place === "farm") { goFarm(code); return; }
    visit = { code, name: name || `Host ${code}`, waiting: true, asked: Date.now() };
    await api.net_visit(code);
    api.net_send(code, { kind: "join", place: place || null, byCode: !place });
    toast(`Looking for ${name || code}…`, 4000);
    startPolling();
  }
  async function goFarm(code) {
    try { await api.save_room(room.layout()); } catch { /* it saves on its own too */ }
    location.href = FARM(code) + (api.net_mock_code ? `&mocknet=${api.net_mock_code}` : "");
  }
  function arrive(m) {
    visit = { code: m.from, name: m.name, place: "room" };
    hostAt = Date.now();
    social.go({ key: "netvisit", name: `${m.name}'s room`, layout: m.layout, spawn: [0.4, 2.4], fog: [0x150e1c, 12, 26], people: [] });
    addPerson(m.from, m.name);
    room.roamers.place(m.from, m.x, m.z);
    syncPeople(m.people);
    toast(`You're in ${m.name}'s room.`, 3000);
    renderList();
    startPos();
  }
  function syncPeople(list) {
    if (!visit || !Array.isArray(list)) return;
    const ids = new Set([visit.code, ...list.map((p) => p.id)]);
    for (const id of room.roamers.people.keys()) if (!ids.has(id) && id !== room.friendId) room.roamers.remove(id);
    for (const p of list) if (p.id !== st?.code && !room.roamers.people.has(p.id)) addPerson(p.id, String(p.name || "Player").slice(0, 24));
  }
  /** the visit is over, whoever ended it */
  function endVisit(why, tell = false) {
    if (!visit) return;
    const code = visit.code, was = visit;
    visit = null;
    if (tell) api.net_send(code, { kind: "leave" });
    api.net_visit(null);
    if (!was.waiting && room.hub?.key === "netvisit") room.leaveHub();
    if (why) toast(why, 4000);
    renderList();
  }
  hooks.hubChanged = (hub) => {
    if (visit && !visit.waiting && hub?.key !== "netvisit") endVisit("", true);       // you went home, or on to a hub
    if (hub) for (const code of Object.keys(guests)) { api.net_kick(code, "The host went out."); goneGuest(code); }   // your room is only there to visit while you're in it
  };

  // ---------- people visiting me ----------
  function welcome(m) {
    seenAt[m.from] = Date.now();
    guests[m.from] = { name: m.name };
    if (!room.hub) addPerson(m.from, m.name);
    const mine = myPos();
    sentLayout = JSON.stringify(room.layout());
    api.net_send(m.from, { kind: "welcome", layout: room.layout(), people: peopleList(m.from), x: mine.x, z: mine.z });
    tellPeople();
    notify(`${m.name} joined your room.`);
    renderList();
    startPos();
  }
  const peopleList = (except) => Object.entries(guests).filter(([c]) => c !== except).map(([id, g]) => ({ id, name: g.name }));
  const tellPeople = () => { for (const c of Object.keys(guests)) api.net_send(c, { kind: "people", list: peopleList(c) }); };
  function goneGuest(code, text) {
    if (!guests[code]) return;
    delete guests[code]; delete seenAt[code];
    room.roamers.remove(code);
    tellPeople(); renderList();
    if (text) toast(text, 3000);
  }
  function kick(code) {
    const name = guests[code]?.name || "They";
    api.net_kick(code);
    goneGuest(code, `${name} had to leave.`);
  }
  function ban(code, name) {
    api.net_ban(code, name).then(refresh).then(renderList);
    if (guests[code]) goneGuest(code, `${name} is banned for one day.`);
    else toast(`${name} is banned for one day.`, 3000);
  }
  hooks.kick = kick;
  hooks.isHere = (id) => !!guests[id];
  hooks.visitor = (id) => { const g = guests[id]; if (g) return { id, code: id, name: g.name, color: colorOf(id) }; if (visit?.code === id) return { id, code: id, name: visit.name, color: colorOf(id) }; const R = room.roamers.people.get(id); return visit && R ? { id, code: id, name: R.name, color: colorOf(id) } : null; };
  hooks.dm = (f, text) => { api.net_send(f.code, { kind: "dm", text }); };

  /** clicked someone: what you can do depends on whose room it is */
  hooks.person = (id) => {
    const test = social.TEST_FRIEND;
    if (id === test.id && room.friendId === id && !visit) {
      const close = dialog(test.name,
        el("button", { type: "button", class: "primary", textContent: "💬 Talk", on: { click: () => { close(); room.walkToPerson(id, () => social.openThread(id)); } } }),
        el("button", { type: "button", class: "ghost", textContent: "👢 Kick from my room", on: { click: () => { close(); social.sendHome(test); } } }),
        el("button", { type: "button", class: "danger", textContent: "⛔ Ban for 1 day", on: { click: () => { close(); social.sendHome(test); ban(TEST_BAN, test.name); } } }));
      return true;
    }
    const guest = guests[id], there = visit && !visit.waiting && room.roamers.people.has(id);
    if (!guest && !there) return false;
    const name = guest?.name || room.roamers.people.get(id).name;
    const close = dialog(name,
      el("button", { type: "button", class: "primary", textContent: "💬 Talk", on: { click: () => { close(); room.walkToPerson(id, () => social.openThread(id)); } } }),
      friendOf(id) ? null : el("button", { type: "button", class: "ghost", textContent: "➕ Add friend", on: { click: () => { close(); addFriend(id); } } }),
      guest ? el("button", { type: "button", class: "ghost", textContent: "👢 Kick from my room", on: { click: () => { close(); kick(id); } } }) : null,
      guest ? el("button", { type: "button", class: "danger", textContent: "⛔ Ban for 1 day", on: { click: () => { close(); ban(id, name); } } }) : null);
    return true;
  };
  hooks.testBanned = () => !!st?.bans?.[TEST_BAN];

  // ---------- what comes in ----------
  function handle(m) {
    const who = m.name || "Someone";
    if (m.from === visit?.code) hostAt = Date.now();
    if (guests[m.from]) seenAt[m.from] = Date.now();
    switch (m.kind) {
      case "friend_req":
        if (friendOf(m.from)) { befriend(m.from, who); api.net_send(m.from, { kind: "friend_ok" }); break; }
        if (!db().notes.some((n) => n.act?.choice === "friendReq" && n.act.code === m.from)) notify(`${who} (${m.from}) wants to be friends.`, { choice: "friendReq", code: m.from, name: who });
        break;
      case "friend_ok": befriend(m.from, who); notify(`${who} accepted your friend request.`); break;
      case "friend_no": { const f = friendOf(m.from); if (f?.pending) removeFriend(f); toast(`${who} declined your friend request.`, 3000); break; }
      case "dm":
        if (!social.friend(m.from)) break;       // only friends and people in the room with you
        say(m.from, m.from, String(m.text || "").slice(0, 2000));
        if ($("msgPop").hidden) notify(`${who} sent you a message.`, { thread: m.from });
        social.renderMessages();
        break;
      case "invite":
        notify(`${who} invited you to their ${m.place === "farm" ? "farm on Turtle Island" : "room"}.`, { choice: "invite", code: m.from, name: who, place: m.place === "farm" ? "farm" : "room", t: Date.now() });
        break;
      case "invite_no": toast(`${who} can't come right now.`, 3000); break;
      case "join": welcome(m); break;
      case "leave": goneGuest(m.from, `${who} went home.`); break;
      case "welcome":
        if (m.place === "farm") { visit = null; api.net_visit(null); goFarm(m.from); break; }
        if (visit?.code === m.from) arrive(m);
        break;
      case "join_no": endVisit(String(m.why || "They can't have visitors right now.").slice(0, 120)); break;
      case "kick": endVisit(String(m.why || "The host asked you to leave.").slice(0, 120)); break;
      case "pos":
        room.roamers.place(m.id && visit ? m.id : m.from, m.x, m.z);
        break;
      case "people": syncPeople(m.list); break;
      case "layout":
        if (visit && room.hub?.key === "netvisit" && m.layout && typeof m.layout === "object") room.loadLayout(m.layout);
        break;
      case "send_fail":
        if (m.about === "join") endVisit("Couldn't reach them. They may be offline, or their network doesn't allow direct connections.");
        else if (m.about === "invite" || m.about === "dm") toast("Couldn't reach them right now.", 3000);
        break;
    }
  }
  function retryRequests() {
    for (const f of db().friends) if (f.pending && online[f.code] && Date.now() - (f.askedAt || 0) > 60e3) { f.askedAt = Date.now(); api.net_send(f.code, { kind: "friend_req" }); }
  }
  async function pollOnce() {
    const r = await api.net_poll(null, ["farm."]);
    if (!r) return;
    const was = JSON.stringify(online);
    online = r.online || {};
    for (const m of r.msgs || []) { try { handle(m); } catch (e) { console.warn("[friends]", e); } }
    retryRequests();
    if (was !== JSON.stringify(online)) renderList();
    // someone gone quiet: the connection dropped, or the app closed
    if (visit && !visit.waiting && Date.now() - hostAt > LOST_SECONDS * 1000) endVisit("The connection to the host was lost.");
    if (visit?.waiting && Date.now() - visit.asked > 50e3) endVisit("No answer. They may be offline.");
    for (const c of Object.keys(guests)) if (Date.now() - (seenAt[c] || 0) > LOST_SECONDS * 1000) { api.net_kick(c, "The connection was lost."); goneGuest(c, `${guests[c].name} lost their connection.`); }
  }
  function startPolling() {
    if (polling) return;
    polling = true;
    const go = async () => {
      try { await pollOnce(); } catch (e) { console.warn("[friends]", e); }
      setTimeout(go, visit || Object.keys(guests).length ? 120 : 1200);
    };
    go();
  }
  /** where everyone is, a few times a second, whether or not they've moved: it's also how each side knows the other is still there */
  function startPos() {
    if (posTimer) return;
    posTimer = setInterval(() => {
      const codes = Object.keys(guests), me = myPos();
      if (visit && !visit.waiting) { api.net_send(visit.code, { kind: "pos", ...me }, true); return; }
      if (!codes.length) { clearInterval(posTimer); posTimer = null; return; }
      for (const to of codes) {
        api.net_send(to, { kind: "pos", id: st.code, ...me }, true);
        for (const c of codes) { const P = c !== to && room.roamers.people.get(c); if (P) api.net_send(to, { kind: "pos", id: c, x: +P.group.position.x.toFixed(2), z: +P.group.position.z.toFixed(2) }, true); }
      }
      if ((layoutIn -= 1) <= 0) {               // you rearranged the room while they're in it
        layoutIn = 25;
        const now = JSON.stringify(room.layout());
        if (now !== sentLayout) { sentLayout = now; for (const to of codes) api.net_send(to, { kind: "layout", layout: room.layout() }); }
      }
    }, 200);
  }

  // ---------- the Friends button ----------
  function renderList() {
    if (!listEl || $("friendsPop").hidden) return;
    const rows = db().friends.filter((f) => f.code).map((f) => {
      const here = !!online[f.code];
      return el("li", {},
        el("i", { class: `dot ${here ? "on" : ""}`, style: `background:${f.color}`, title: here ? "Online" : "Offline" }),
        el("span", {}, el("b", {}, f.name), el("small", {}, `${f.code} · ${f.pending ? "request sent" : here ? "online" : "offline"}`)),
        el("button", { type: "button", class: "ghost small", title: "Message", textContent: "💬", on: { click: () => social.openThread(f.id) } }),
        f.pending ? null : el("button", { type: "button", class: "primary small", textContent: "Invite", on: { click: () => hooks.invite(f) } }),
        el("button", { type: "button", class: "ghost small", title: "Remove friend", "aria-label": `Remove ${f.name}`, textContent: "🗑", on: { click: () => removeFriend(f) } }));
    });
    const here = Object.entries(guests).map(([c, g]) => el("li", {},
      el("i", { class: "dot on", style: `background:${colorOf(c)}` }), el("span", {}, el("b", {}, g.name), el("small", {}, `${c} · in your room`)),
      el("button", { type: "button", class: "ghost small", textContent: "Kick", on: { click: () => kick(c) } }),
      el("button", { type: "button", class: "danger small", textContent: "Ban 1 day", on: { click: () => ban(c, g.name) } })));
    const bans = Object.entries(st?.bans || {}).map(([c, b]) => el("li", {},
      el("span", {}, el("b", {}, b.name), el("small", {}, `banned · ${untilText(b.until)}`)),
      el("button", { type: "button", class: "ghost small", textContent: "Lift ban", on: { click: async () => { await api.net_unban(c); await refresh(); renderList(); } } })));
    listEl.replaceChildren(...[
      here.length ? el("div", {}, el("h4", {}, "In your room"), el("ul", { class: "fr-list" }, ...here)) : null,
      el("h4", {}, "Friends"),
      rows.length ? el("ul", { class: "fr-list" }, ...rows) : el("p", { class: "note" }, "No friends yet. Add someone with their code."),
      bans.length ? el("div", {}, el("h4", {}, "Banned"), el("ul", { class: "fr-list" }, ...bans)) : null,
    ].filter(Boolean));
  }
  /** nobody else needed: what an invite looks like, with the test friend as the host */
  const tryInvite = () => el("button", { type: "button", class: "ghost small", textContent: "Try an invite", on: { click: () => { $("friendsPop").hidden = true; notify(`${social.TEST_FRIEND.name} invited you to their room.`, { choice: "testInvite" }); } } });
  choices.testInvite = (_, yes) => {
    if (!yes) { toast("You declined. The host would be told.", 2500); return; }
    social.go({ key: "visit", name: `${social.TEST_FRIEND.name}'s room`, layout: room.layout(), spawn: [0.4, 2.4], fog: [0x150e1c, 12, 26], people: [{ id: "owner-test", name: social.TEST_FRIEND.name, color: social.TEST_FRIEND.color, x: -1, z: 1 }] });
  };
  function renderOff(pop, close) {
    pop.replaceChildren(el("header", {}, el("b", {}, "Friends"), close),
      el("p", {}, "Play with people on other PCs, on any network. You get a 6-character code to share."),
      el("p", { class: "note" }, "PCs connect directly, with no server in between. To find each other they use a public lookup network, so your internet address (IP) can be seen there and by the people you connect with. Windows may ask to allow Vermeil through its firewall: choose Allow."),
      el("button", { type: "button", class: "primary", textContent: "Turn on friends and visits", on: { click: async () => { if (await turnOn()) renderPop(); } } }),
      tryInvite());
  }
  function renderPop() {
    const pop = $("friendsPop"), close = el("button", { type: "button", class: "close", "aria-label": "Close", textContent: "×", on: { click: () => { pop.hidden = true; } } });
    if (!on()) { renderOff(pop, close); return; }
    const code = el("input", { type: "text", maxLength: 6, placeholder: "Their code", "aria-label": "Their 6-character code", on: { input: (e) => { e.target.value = cleanCode(e.target.value); } } });
    const name = el("input", { type: "text", maxLength: 24, value: st.name, "aria-label": "My name", on: { change: async (e) => { st.name = await api.net_set_name(e.target.value); } } });
    const addr = el("input", { type: "text", placeholder: "Address (e.g. 100.64.0.2:47630)", "aria-label": "Direct address" });
    const netState = el("small", {}, st.internet ? (st.searching ? "Connected to the lookup network: anyone with your code can find you." : "Reaching the lookup network…") : "Internet is off: only this network can find you.");
    listEl = el("div", { class: "fr-body" });
    pop.replaceChildren(...[
      el("header", {}, el("b", {}, "Friends"), close),
      el("div", { class: "fr-me" },
        el("span", {}, el("small", {}, "My code"), el("b", { class: "fr-code", textContent: st.code })),
        el("button", { type: "button", class: "ghost small", textContent: "Copy", on: { click: async () => { try { await navigator.clipboard.writeText(st.code); toast("Code copied.", 1500); } catch { toast(`Your code is ${st.code}`, 3000); } } } }),
        el("label", {}, el("small", {}, "My name"), name)),
      el("form", { class: "fr-add", on: { submit: (e) => { e.preventDefault(); addFriend(code.value); code.value = ""; } } }, code,
        el("button", { type: "submit", class: "primary small", textContent: "Add friend" }),
        el("button", { type: "button", class: "ghost small", textContent: "Join them", on: { click: () => { join(code.value); pop.hidden = true; } } })),
      listEl,
      visit && !visit.waiting ? el("button", { type: "button", class: "ghost", textContent: `🏠 Leave ${visit.name}'s room`, on: { click: () => endVisit("", true) } }) : null,
      el("details", { class: "fr-net" }, el("summary", {}, "Connection"), netState,
        el("label", { class: "inline" }, el("input", { type: "checkbox", checked: st.internet, on: { change: async (e) => { st = await api.net_internet(e.target.checked); renderPop(); } } }), " Connect over the internet"),
        el("small", {}, "Can't reach someone? Some mobile and carrier networks block direct connections. If you have a forwarded port or Tailscale, enter their code above and their address here:"),
        el("div", { class: "fr-add" }, addr, el("button", { type: "button", class: "ghost small", textContent: "Use", on: { click: async () => { toast(await api.net_add_route(code.value, addr.value) ? "Trying that address." : "Enter their code above and an address like 100.64.0.2:47630.", 3000); } } })),
        tryInvite(),
        el("button", { type: "button", class: "ghost small", textContent: "Turn off friends and visits", on: { click: async () => { st = await api.net_enable(false); renderPop(); } } })),
    ].filter(Boolean));
    renderList();
  }
  $("friendsBtn").addEventListener("click", async () => {
    const pop = $("friendsPop");
    pop.hidden = !pop.hidden;
    if (!pop.hidden) { $("notifPop").hidden = true; await refresh(); renderPop(); }
  });

  // ---------- start ----------
  hooks.ready = async () => {
    await refresh();
    if (st?.enabled) { await turnOn(); await refresh(); }
    const params = new URLSearchParams(location.search), going = cleanCode(params.get("visit"));
    let told = null;
    try { told = sessionStorage.getItem("net.msg"); sessionStorage.removeItem("net.msg"); } catch { /* fine */ }
    if (told) toast(told, 5000);
    if (going.length === 6) join(going, "room");
    setInterval(async () => { if (on()) { await refresh(); renderList(); } }, 15000);
  };
  return { join, addFriend };
}
