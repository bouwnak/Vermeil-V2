// generator.js - the Media panel. Tabs: Generate (AI pictures and video on BytePlus's free tokens, explainer videos,
// and your creations), Photo (photo.js) and Video (videoedit.js). The name of this file and of the panel id
// ("generator") stay as they were, so the installed plugin keeps working.
import { $, el, toast, busy } from "./util.js";
import { initPhoto } from "./photo.js";
import { initVideoEdit } from "./videoedit.js";

const TABS = [["generate", "✨ Generate"], ["photo", "🖌 Photo editor"], ["video", "🎞 Video editor"]];
const KINDS = [
  ["pictures", "🖼 Pictures", "Describe the picture, e.g. “a cozy cabin in a snowy pine forest at dusk”"],
  ["ai_video", "🎬 AI video", "Describe the video, e.g. “a paper boat sailing down a rainy street, slow camera follow”"],
  ["video", "🎞 Explainer", "Topic, e.g. “How volcanoes work” - or add PDFs to turn them into a narrated video"],
];
const JOB_NAMES = { pictures: "🖼 Pictures", ai_video: "🎬 AI video", video: "🎞 Explainer", presentation: "📊 Slides" };
const THEMES = [["midnight", "Midnight"], ["parchment", "Parchment"], ["ocean", "Ocean"], ["forest", "Forest"], ["clean", "Clean white"]];
const num = (n) => Number(n || 0).toLocaleString("en-US");

export function initGenerator(api) {
  let tab = "generate", kind = "pictures", pdfs = [], tokens = null, engine = null;
  const jobs = new Map();                         // job id -> its card
  const root = $("genBody");

  const photo = initPhoto(api, { onSaved: () => loadRecent() });
  const video = initVideoEdit(api);
  const tabs = el("div", { class: "tabs", role: "tablist" });
  const meters = el("div", { class: "media-tokens" });
  const setup = el("div", {});
  const kinds = el("div", { class: "tabs sub-tabs", role: "tablist" });
  const form = el("div", { class: "gen-form" });
  const live = el("div", { class: "gen-jobs" });
  const gallery = el("div", { class: "gen-gallery" });
  const pages = {
    generate: el("div", {}, setup, meters, kinds, form, live, el("div", { class: "row" }, el("h3", { style: "flex:1" }, "My creations"),
      el("button", { class: "ghost small", onclick: () => api.gen_open() }, "📂 Open folder"), el("button", { class: "ghost small", "aria-label": "Refresh", onclick: () => loadRecent() }, "↻")), gallery),
    photo: photo.node,
    video: video.node,
  };
  root.replaceChildren(tabs, ...Object.values(pages));

  function show(next) {
    tab = next;
    tabs.replaceChildren(...TABS.map(([k, label]) => el("button", { role: "tab", "aria-selected": String(k === tab), onclick: () => show(k) }, label)));
    for (const [k, node] of Object.entries(pages)) node.hidden = k !== tab;
    if (tab === "photo") photo.load().catch((e) => toast(e.message, 5000));
    if (tab === "video") video.load();
  }

  const select = (opts, val) => { const s = el("select", {}, opts.map(([v, l]) => el("option", { value: v }, l))); s.value = val; return s; };

  // ---------------------------------------------------------------- the free tokens
  function drawTokens() {
    const t = tokens;
    if (!t) return;
    meters.replaceChildren(...(t.has_key ? [["AI video (Seedance)", t.video], ["AI pictures (Seedream)", t.image]].map(([label, m]) => {
      const pct = Math.min(100, 100 * m.used / (m.limit || 1));
      return el("div", {}, el("small", {}, m.out ? `${label}: free tokens used up` : `${label}: ${num(m.left)} of ${num(m.limit)} free tokens left`),
        el("div", { class: "progress" }, el("span", { style: `width:${pct}%` })));
    }) : []));
    setup.replaceChildren(...(t.has_key ? [] : [drawSetup(t)]));
  }

  function drawSetup(t) {
    const key = el("input", { type: "password", placeholder: "Paste the API key here", "aria-label": "BytePlus API key", autocomplete: "off" });
    const save = el("button", { class: "primary small" }, "Save key");
    save.onclick = async () => {
      if (!key.value.trim()) return toast("Paste the key first.");
      busy(save, true, "Saving…");
      const r = await api.media_save_key(key.value);
      busy(save, false);
      if (r.error) return toast(r.error, 5000);
      key.value = ""; tokens = r; engine = null;
      drawTokens(); draw();
      toast("Key saved. It stays on this PC.");
    };
    return el("div", { class: "media-setup" },
      el("b", {}, "Turn on AI pictures and video (Seedream and Seedance)"),
      el("ol", {},
        el("li", {}, "Make a free BytePlus account, then open ", el("a", { href: "#", onclick: (e) => { e.preventDefault(); api.browse_inside(t.console, null); } }, "the ModelArk console"), "."),
        el("li", {}, el("b", {}, "Before anything else"), ", open Model activation and turn on ", el("b", {}, "Free Tokens Only"), ". Then BytePlus stops by itself when the free tokens run out."),
        el("li", {}, "Activate a Seedance video model and a Seedream picture model."),
        el("li", {}, "Create an API key under API keys, and paste it below.")),
      el("div", { class: "row" }, key, save),
      el("p", { class: "note" }, "Vermeil counts tokens and refuses anything that wouldn't fit, but it only knows what this PC spent. Only the Free Tokens Only switch truly guarantees no charge. Without a key, the Basic painter still makes pictures."));
  }

  async function loadTokens() {
    try { tokens = await api.media_tokens(); } catch { tokens = null; }
    drawTokens();
    return tokens;
  }

  // ---------------------------------------------------------------- what to make
  function draw() {
    kinds.replaceChildren(...KINDS.map(([k, label]) => el("button", { role: "tab", "aria-selected": String(k === kind), onclick: () => { kind = k; draw(); } }, label)));
    const K = KINDS.find((x) => x[0] === kind);
    const text = el("textarea", { rows: 3, placeholder: K[2], "aria-label": "What to make" });
    const go = el("button", { class: "primary" }, kind === "pictures" ? "✨ Make pictures" : kind === "ai_video" ? "🎬 Make the video" : "🎞 Make the explainer");
    const row = el("div", { class: "row wrap" });
    const note = el("p", { class: "note" });
    let options;
    if (kind === "pictures") {
      const hasKey = !!tokens?.has_key;
      engine = engine || (hasKey ? "seedream" : "basic");
      const eng = select([["seedream", "Seedream (free tokens)"], ["basic", "Basic painter (no key)"]], engine);
      const count = select([["1", "1 picture"], ["2", "2"], ["4", "4"], ["6", "6"]], "1");
      const size = select([["landscape", "Landscape 16:9"], ["portrait", "Portrait 9:16"], ["square", "Square"]], "landscape");
      const style = select([["", "Any style"], ["digital painting, highly detailed", "Digital painting"], ["photorealistic, 35mm photo", "Photo"],
        ["anime style, studio quality", "Anime"], ["watercolor illustration", "Watercolor"], ["low poly 3D render", "Low-poly 3D"], ["pixel art", "Pixel art"]], "");
      const say = () => {
        engine = eng.value;
        note.textContent = engine === "seedream" ? (hasKey ? "Seedream uses your free tokens. It stops before the free tokens run out." : "Seedream needs the API key above.")
          : "The basic painter is free with no key, but slower: one picture about every 45 seconds. Offline it makes a simple painted card.";
      };
      eng.onchange = say; say();
      row.append(eng, count, size, style);
      options = () => ({ prompt: text.value.trim(), count: +count.value, size: size.value, style: style.value, engine: eng.value });
    } else if (kind === "ai_video") {
      const ratio = select([["16:9", "Landscape 16:9"], ["9:16", "Tall 9:16"], ["1:1", "Square"]], "16:9");
      const dur = select([["5", "5 seconds"], ["8", "8 seconds"], ["10", "10 seconds"]], "5");
      const res = select([["480p", "480p (cheapest)"], ["720p", "720p"], ["1080p", "1080p"]], "480p");
      const audio = el("input", { type: "checkbox", checked: true });
      const say = () => {
        const need = tokens?.estimates?.[res.value]?.[dur.value] || 0, left = tokens?.video?.left ?? 0;
        if (!tokens?.has_key) { note.textContent = "AI video needs the API key above."; go.disabled = true; return; }
        go.disabled = need > left;
        note.textContent = need > left ? `This needs about ${num(need)} tokens and only ${num(left)} are left. Pick a shorter or smaller video.`
          : `This uses about ${num(need)} free tokens, so about ${Math.floor(left / (need || 1))} more like it are left. It usually takes a few minutes.`;
      };
      res.onchange = say; dur.onchange = say; say();
      row.append(ratio, dur, res, el("label", { class: "check" }, audio, " sound"));
      options = () => ({ prompt: text.value.trim(), ratio: ratio.value, duration: +dur.value, resolution: res.value, audio: audio.checked });
    } else {
      const scenes = select([["3", "3 scenes (~30 s)"], ["5", "5 scenes"], ["8", "8 scenes (~1.5 min)"]], "5");
      const theme = select(THEMES, "midnight");
      row.append(scenes, theme,
        el("button", { class: "ghost small", onclick: async () => { pdfs = await api.gen_pick_pdfs(); draw(); } }, "📄 Add PDFs…"),
        pdfs.length ? el("button", { class: "ghost small", onclick: () => { pdfs = []; draw(); } }, "Clear") : null,
        el("span", { class: "note" }, pdfs.length ? `${pdfs.length} PDF${pdfs.length > 1 ? "s" : ""}: ${pdfs.map((p) => p.split(/[\\/]/).pop()).join(", ")}` : "No PDFs: it will use the topic."));
      note.textContent = "Each scene gets a picture with a slow zoom, a caption and spoken narration. This uses no tokens and takes a minute or two.";
      options = () => ({ topic: text.value.trim(), pdfs, scenes: +scenes.value, theme: theme.value });
    }
    go.onclick = async () => {
      const t = text.value.trim();
      if (!t && !(kind === "video" && pdfs.length)) return toast("Type what to make first" + (kind === "video" ? ", or add PDFs." : "."));
      const k = kind;
      busy(go, true, "Starting…");
      const r = await api.gen_start(k, options());
      busy(go, false);
      if (r.error) return toast(r.error, 6000);
      addJob(r.job, k, t || pdfs.map((p) => p.split(/[\\/]/).pop()).join(", "));
    };
    text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go.click(); });
    form.replaceChildren(text, row, el("div", { class: "row" }, go), note);
  }

  function addJob(id, k, what) {
    const bar = el("i", { style: "width:2%" });
    const txt = el("span", { class: "note" }, "Starting…");
    const card = el("div", { class: "gen-job" }, el("b", {}, `${JOB_NAMES[k] || "Media"} · ${what.slice(0, 60)}`), el("div", { class: "progress" }, bar), txt);
    live.prepend(card);
    jobs.set(id, { card, bar, txt });
  }

  // ---------------------------------------------------------------- my creations
  async function editPicture(f) {
    const r = await api.gen_full(f.path);
    if (r.error) return toast(r.error, 5000);
    show("photo");
    photo.open(r.data, r.name).catch((e) => toast(e.message, 5000));
  }

  async function toEditor(f) {
    const r = await api.edit_add_creation(f.path);
    if (r.error) return toast(r.error, 5000);
    show("video");
    video.addFile(r);
  }

  function preview(f) {
    const box = el("div", { class: `gen-item ${f.kind}` });
    const thumb = el("div", { class: "thumb" }, f.kind === "pptx" ? "📊" : f.kind === "mp4" ? "🎬" : "🖼");
    box.append(thumb, el("div", { class: "meta" }, el("b", { title: f.name }, f.name), el("small", { class: "note" }, `${f.saved} · ${f.size_kb >= 1024 ? (f.size_kb / 1024).toFixed(1) + " MB" : f.size_kb + " KB"}`)),
      el("div", { class: "row wrap" },
        el("button", { class: "ghost small", onclick: () => api.gen_open(f.path) }, f.kind === "mp4" ? "▶ Play" : "Open"),
        f.kind === "png" ? el("button", { class: "ghost small", onclick: () => editPicture(f) }, "🖌 Edit") : null,
        f.kind !== "pptx" ? el("button", { class: "ghost small", onclick: () => toEditor(f) }, "🎞 To video") : null));
    if (f.kind !== "pptx") api.gen_preview(f.path).then((r) => { if (r.data) thumb.replaceChildren(el("img", { src: r.data, alt: f.name })); });
    return box;
  }

  async function loadRecent() {
    const r = await api.gen_recent();
    gallery.replaceChildren(...(r.files.length ? r.files.slice(0, 24).map(preview) : [el("p", { class: "none" }, "Nothing made yet. Describe what you want above.")]));
  }

  draw();
  show(tab);
  return {
    async load() {
      await loadTokens();
      draw();
      await loadRecent();
      show(tab);
    },
    onEvent(e) {
      if (video.onEvent(e)) { if (e.state === "done") loadRecent(); return; }
      const j = jobs.get(e.job); if (!j) return;
      if (e.progress != null) j.bar.style.width = `${Math.round(e.progress * 100)}%`;
      if (e.text) j.txt.textContent = e.text;
      if (e.state === "done") {
        j.card.classList.add("done");
        const r = e.result || {};
        const files = r.files || (r.file ? [r.file] : []);
        j.txt.textContent = [r.seconds ? `${r.seconds} s video ready` : `${files.length} ready`, r.tokens ? `${num(r.tokens)} free tokens used` : "", r.note || ""].filter(Boolean).join(" · ");
        j.card.append(el("div", { class: "row" }, files.slice(0, 1).map((p) => el("button", { class: "primary small", onclick: () => api.gen_open(p) }, "Open"))));
        toast("Your creation is ready!", 3500);
        loadRecent();
      }
      if (e.state === "error") { j.card.classList.add("error"); toast(e.text, 6000); }
      if (e.state === "done" || e.state === "error") loadTokens().then(() => { if (tab === "generate") draw(); });
    },
  };
}
