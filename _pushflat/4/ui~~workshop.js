// workshop.js - the Characters Workshop: find 3D models (Sketchfab) and voice clones (voice-models.com), download them straight into your
// library, and look after what you have: every model with a picture of it, Use / Animate / Delete, and every voice with Listen / Use / Delete.
// The Python side is skills/shop.py through app.py's workshop_* calls.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat().filter((k) => k != null && k !== false)); return e; };
const btn = (text, cls, fn, title) => { const b = el("button", { type: "button", className: cls || "", textContent: text }); if (title) b.title = title; b.addEventListener("click", fn); return b; };
const mb = (bytes) => (bytes > 0 ? `${(bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)} MB` : "");
const k = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n || 0));

// ---------- pictures of your own models: one small renderer, each model freed again once it's drawn ----------
const pics = new Map();
let pr = null, queue = Promise.resolve();
function picture(file) {
  if (pics.has(file)) return Promise.resolve(pics.get(file));
  const job = queue.then(async () => {
    if (pics.has(file)) return pics.get(file);
    if (!/\.(glb|vrm|gltf)$/i.test(file)) { pics.set(file, null); return null; }
    pr ||= (() => {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(200, 200); r.setClearColor(0, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.01, 5000);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6a78, 2.4)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
      return { r, scene, cam, loader: new GLTFLoader() };
    })();
    let url = null;
    try {
      const g = await Promise.race([pr.loader.loadAsync(`models/${encodeURIComponent(file)}`), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 30000))]);
      const m = g.scene; pr.scene.add(m); m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), rad = box.getBoundingSphere(new THREE.Sphere()).radius || 1, d = rad / Math.sin(15 * Math.PI / 180);
      pr.cam.position.set(c.x + d * 0.35, c.y + d * 0.18, c.z + d * 0.92); pr.cam.lookAt(c); pr.cam.near = d / 100; pr.cam.far = d * 4; pr.cam.updateProjectionMatrix();
      pr.r.render(pr.scene, pr.cam);
      url = pr.r.domElement.toDataURL("image/webp", 0.85);
      pr.scene.remove(m);
      m.traverse((o) => { o.geometry?.dispose(); for (const mat of [].concat(o.material || [])) { for (const v of Object.values(mat)) if (v?.isTexture) v.dispose(); mat.dispose(); } });
      pr.r.renderLists.dispose();
    } catch (e) { console.warn("[workshop] picture", file, e?.message); }
    pics.set(file, url);
    return url;
  });
  queue = job.catch(() => {});
  return job;
}
const seen = new IntersectionObserver((list) => {
  for (const e of list) {
    if (!e.isIntersecting) continue;
    seen.unobserve(e.target);
    const img = e.target;
    picture(img.dataset.file).then((u) => { if (u) { img.src = u; img.classList.add("ready"); } else img.classList.add("none"); });
  }
}, { rootMargin: "200px" });

/**
 * a = { api, toast, onModel(name), useModel(name), animate(name), deleteModel(name) -> Promise, useVoice(name), hearVoice(name), deleteVoice(name) -> Promise }
 */
export function initWorkshop(a) {
  let tab = "models";
  const S = { models: { q: "", items: [], cursor: null, busy: false, done: false }, voices: { q: "", items: [], page: 1, more: false, busy: false, done: false } };
  const jobs = new Map();                                   // download job -> its progress bar
  const audio = new Audio();

  const tabs = el("div", { className: "ws-tabs", role: "tablist" });
  const body = el("div", { className: "ws-body" });
  const close = btn("×", "close ws-close", () => hide(), "Close");
  close.setAttribute("aria-label", "Close the Workshop");
  const card = el("div", { className: "ws-card" }, el("header", { className: "ws-head" }, el("h2", { textContent: "🛠 Workshop" }), tabs, close), body);
  const box = el("div", { className: "ws-dialog", role: "dialog", ariaLabel: "Workshop", hidden: true }, card);
  box.addEventListener("click", (e) => { if (e.target === box) hide(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); hide(); } });
  document.body.append(box);
  const hide = () => { box.hidden = true; audio.pause(); };

  window.addEventListener("workshop-progress", (ev) => {
    const e = ev.detail, bar = jobs.get(e.job);
    if (!bar || !bar.isConnected) return;
    bar.hidden = false; bar.querySelector("i").style.width = `${Math.round((e.pct || 0) * 100)}%`; bar.querySelector("span").textContent = e.text || "";
  });

  function drawTabs() {
    tabs.replaceChildren(...[["models", "🧍 3D models"], ["voices", "🎙 Voices"], ["mine", "📦 My models & voices"]].map(([key, label]) => {
      const b = btn(label, "ws-tab", () => { tab = key; drawTabs(); draw(); });
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(key === tab));
      return b;
    }));
  }
  const bar = (job) => { const b = el("div", { className: "ws-progress", hidden: true }, el("i"), el("span")); jobs.set(job, b); return b; };
  const searchRow = (kind, placeholder) => {
    const input = el("input", { type: "search", placeholder, value: S[kind].q, ariaLabel: placeholder });
    const go = () => { S[kind] = { ...S[kind], q: input.value.trim(), items: [], cursor: null, page: 1, done: false }; load(kind); };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
    input.addEventListener("keyup", (e) => e.stopPropagation());
    return el("div", { className: "ws-search" }, input, btn("Search", "primary", go));
  };

  // ---------- 3D models ----------
  async function load(kind, more = false) {
    const s = S[kind];
    if (s.busy) return;
    s.busy = true; draw();
    try {
      if (kind === "models") {
        const r = await a.api.workshop_search_models(s.q, more ? s.cursor : null);
        if (r?.error) a.toast(r.error, 5000);
        s.items = more ? [...s.items, ...(r?.results || [])] : r?.results || []; s.cursor = r?.cursor || null;
      } else {
        const page = more ? s.page + 1 : 1, r = await a.api.workshop_search_voices(s.q, page);
        if (r?.error) a.toast(r.error, 5000);
        s.items = more ? [...s.items, ...(r?.results || [])] : r?.results || []; s.page = page; s.more = !!r?.more;
      }
      s.done = true;
    } finally { s.busy = false; if (tab === kind) draw(); }
  }
  async function getModel(m, b) {
    if (!(await tokenReady())) return;
    b.disabled = true; b.textContent = "Getting…";
    const r = await a.api.workshop_get_model(m.uid, m);
    if (r?.need_token) { status.token = false; a.toast(r.error, 6000); draw(); return; }
    if (r?.error) { a.toast(r.error, 6000); b.disabled = false; b.textContent = "⬇ Get"; return; }
    b.textContent = "✓ In your models"; a.onModel?.(r.name, r.models); a.toast(`${r.name} is in your models. ${r.note || ""}`.trim(), 5000);
  }
  let status = { token: null };
  async function tokenReady() { if (status.token === null) status = await a.api.workshop_status(); if (!status.token) { a.toast("Add your free Sketchfab API token first (just above the results).", 5000); draw(); } return status.token; }
  function tokenBox() {
    if (status.token !== false) return null;
    const input = el("input", { type: "password", placeholder: "Paste your Sketchfab API token", autocomplete: "off", ariaLabel: "Sketchfab API token" });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    const save = btn("Save token", "primary", async () => { const r = await a.api.workshop_save_token(input.value); if (r?.error) return a.toast(r.error, 6000); status.token = true; a.toast("Saved. You can download models now.", 3500); draw(); });
    return el("div", { className: "ws-token" }, el("p", {}, "Downloading needs your own free Sketchfab API token: sketchfab.com → Settings → Password & API → API token. It stays on this computer."), el("div", { className: "ws-search" }, input, save));
  }
  function modelsTab() {
    const s = S.models;
    if (!s.done && !s.busy) load("models");
    const grid = el("div", { className: "ws-grid" }, s.items.map((m) => {
      const get = btn("⬇ Get", "primary", () => getModel(m, get));
      const facts = [m.tpose ? "✓ T-pose" : "", m.animated ? "has animations" : "", `${k(m.faces)} faces`, mb(m.size)].filter(Boolean).join(" · ");
      return el("article", { className: "ws-item" },
        el("div", { className: "ws-thumb" }, m.thumb ? el("img", { src: m.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer" }) : null),
        el("h3", { textContent: m.name, title: m.name }),
        el("p", { className: "ws-by", textContent: [m.author && `by ${m.author}`, m.license].filter(Boolean).join(" · ") }),
        el("p", { className: "ws-facts", textContent: facts }),
        bar(`m:${m.uid}`),
        el("div", { className: "ws-btns" }, get, btn("View on Sketchfab", "", () => a.api.open_url(m.url))));
    }));
    return [searchRow("models", "Search models: anime girl, robot, knight, dragon…"),
      el("p", { className: "ws-note", textContent: "Every model here can be downloaded, in any pose. T-pose and A-pose models are marked: they rig and animate best. Each keeps its author's licence, so credit them if you share it." }),
      tokenBox(), s.busy && !s.items.length ? el("p", { className: "ws-empty", textContent: "Looking…" }) : s.done && !s.items.length ? el("p", { className: "ws-empty", textContent: "Nothing downloadable for that. Try other words." }) : grid,
      s.cursor ? btn(s.busy ? "Loading…" : "Show more", "ws-more", () => load("models", true)) : null];
  }

  // ---------- voices ----------
  async function getVoice(v, b) {
    b.disabled = true; b.textContent = "Getting…";
    const r = await a.api.workshop_get_voice(v.url, v.name);
    if (r?.error) { a.toast(r.error, 7000); b.disabled = false; b.textContent = "⬇ Get"; return; }
    b.textContent = "✓ In your voices"; a.toast(`${r.name} is in your voices. Pick it under Voice clone (RVC) in a character.`, 5500);
  }
  function play(v, b) {
    if (!audio.paused && audio.dataset.name === v.name) { audio.pause(); b.textContent = "▶"; return; }
    let i = 0; audio.dataset.name = v.name;
    const tryNext = () => { if (i >= v.samples.length) { a.toast("No sample for that one.", 2500); b.textContent = "▶"; return; } audio.src = v.samples[i++]; audio.play().catch(tryNext); };
    audio.onerror = tryNext; audio.onended = () => { b.textContent = "▶"; };
    for (const o of body.querySelectorAll(".ws-play")) o.textContent = "▶";
    b.textContent = "⏸"; tryNext();
  }
  function voicesTab() {
    const s = S.voices;
    if (!s.done && !s.busy) load("voices");
    const grid = el("div", { className: "ws-grid voices" }, s.items.map((v) => {
      const get = btn("⬇ Get", "primary", () => getVoice(v, get), v.can_get ? "" : `${v.host} can't be downloaded from the app: open the link instead`);
      if (!v.can_get) get.disabled = true;
      const p = v.samples?.length ? btn("▶", "ws-play", () => play(v, p), "Play the site's sample") : null;
      return el("article", { className: "ws-item voice" },
        el("h3", { textContent: v.name, title: v.name }),
        el("p", { className: "ws-by", textContent: [v.size, v.host].filter(Boolean).join(" · ") }),
        bar(`v:${v.url}`),
        el("div", { className: "ws-btns" }, p, get, btn("Link", "", () => a.api.open_url(v.url))));
    }));
    return [searchRow("voices", "Search voices: a character, a singer, an anime…"),
      el("p", { className: "ws-note", textContent: "RVC voice clones from voice-models.com. ▶ plays the site's sample; Get downloads and imports it." }),
      s.busy && !s.items.length ? el("p", { className: "ws-empty", textContent: "Looking…" }) : s.done && !s.items.length ? el("p", { className: "ws-empty", textContent: "No voices for that. Try other words." }) : grid,
      s.more ? btn(s.busy ? "Loading…" : "Show more", "ws-more", () => load("voices", true)) : null];
  }

  // ---------- what you have ----------
  function sure(label, run) {                                // deleting takes two clicks, so a slip can't lose anything
    const b = btn(label, "danger", async () => {
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Really? Click again"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = label; } }, 3500); return; }
      b.disabled = true; await run(); draw();
    });
    return b;
  }
  let mine = null, mineQ = "";
  async function mineTab() {
    mine = await a.api.workshop_library();
    const q = mineQ.toLowerCase();
    const models = (mine.models || []).filter((m) => m.name.toLowerCase().includes(q)), voices = (mine.voices || []).filter((v) => v.name.toLowerCase().includes(q));
    const find = el("input", { type: "search", placeholder: "Find in your models and voices", value: mineQ, ariaLabel: "Find in your models and voices" });
    find.addEventListener("input", () => { mineQ = find.value; clearTimeout(find._t); find._t = setTimeout(draw, 200); });
    find.addEventListener("keydown", (e) => e.stopPropagation());
    const cards = models.map((m) => {
      const img = el("img", { alt: "", className: "ws-pic" }); img.dataset.file = m.name;
      if (pics.has(m.name)) { const u = pics.get(m.name); if (u) { img.src = u; img.classList.add("ready"); } else img.classList.add("none"); } else seen.observe(img);
      return el("article", { className: "ws-item mine" },
        el("div", { className: "ws-thumb model" }, img),
        el("h3", { textContent: m.name.replace(/\.(glb|vrm|fbx|blend)$/i, ""), title: m.name }),
        el("p", { className: "ws-by", textContent: m.author ? `by ${m.author}${m.license ? ` · ${m.license}` : ""}` : "Imported" }),
        el("div", { className: "ws-btns" }, btn("Use", "primary", () => { a.useModel(m.name); hide(); }), btn("🎬 Animate", "", () => { hide(); a.animate(m.name); }, "Rig it and make moves with UniMate"),
          sure("🗑 Delete", async () => { await a.deleteModel(m.name); pics.delete(m.name); a.toast(`Deleted ${m.name}.`); })));
    });
    const rows = voices.map((v) => el("li", { className: "ws-row" },
      el("span", { className: "ws-row-name" }, el("b", { textContent: `🎙 ${v.name}` }), el("small", { textContent: ` · RVC ${v.version || "v2"}${v.has_index ? " + index" : ""}` })),
      el("span", { className: "ws-btns" }, btn("🔊 Listen", "", () => a.hearVoice(v.name)), btn("Use", "primary", () => { a.useVoice(v.name); hide(); }),
        sure("🗑 Delete", async () => { await a.deleteVoice(v.name); a.toast(`Deleted ${v.name}.`); }))));
    return [el("div", { className: "ws-search" }, find),
      el("p", { className: "ws-note", textContent: "Everything you have. Use puts it on the character you're editing (then Save). Animate rigs a model and makes moves with UniMate. Delete removes it for good." }),
      el("h3", { className: "ws-sub", textContent: `3D models (${models.length})` }),
      models.length ? el("div", { className: "ws-grid mine" }, cards) : el("p", { className: "ws-empty", textContent: "No models yet: get some from the 3D models tab." }),
      el("h3", { className: "ws-sub", textContent: `Voices (${voices.length})` }),
      voices.length ? el("ul", { className: "ws-rows" }, rows) : el("p", { className: "ws-empty", textContent: "No voices yet: get some from the Voices tab." })];
  }

  let drawing = 0;
  async function draw() {
    const n = ++drawing, top = body.scrollTop;
    const kids = tab === "models" ? modelsTab() : tab === "voices" ? voicesTab() : await mineTab();
    if (n !== drawing) return;
    body.replaceChildren(...kids.flat().filter(Boolean));
    body.scrollTop = top;
  }
  return {
    async open(which = "models") {
      tab = which; box.hidden = false; drawTabs();
      if (status.token === null) a.api.workshop_status().then((s) => { status = s; if (tab === "models") draw(); }).catch(() => {});
      await draw();
      body.querySelector("input")?.focus();
    },
    refresh() { if (!box.hidden) draw(); },
  };
}
