// videoedit.js - Media's video editor: import, a preview, a timeline (video, text, sound), an inspector and Export.
// The timing here must match timeline() in skills/videoedit.py: that's what makes the preview match the export.
import { el, toast, busy } from "./util.js";

const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RATIOS = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };
const PICTURE_MAX = 600;                           // a picture can stay on screen up to 10 minutes
let nextId = 1;
const newId = () => `i${Date.now().toString(36)}${nextId++}`;

function emptyProject() { return { name: "My video", ratio: "16:9", quality: "1080", clips: [], texts: [], music: [] }; }

export function initVideoEdit(api) {
  let P = emptyProject(), bin = [], total = 0, t = 0, playing = false, lastNow = 0, zoom = 40, selected = null;
  let undo = [], redo = [], snapped = false, saveTimer = 0, exportJob = null, loaded = false;

  // ---------------------------------------------------------------- the page
  const importVideo = el("button", { class: "ghost small", onclick: () => pick("video") }, "📂 Video or picture");
  const importSound = el("button", { class: "ghost small", onclick: () => pick("audio") }, "🎵 Sound");
  const binBox = el("div", { class: "ve-bin" });
  const frame = el("div", { class: "ve-frame" });
  const wrap = el("div", { class: "ve-frame-wrap" }, frame);
  const empty = el("p", { class: "note", style: "position:absolute;inset:0;margin:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;color:#fff" }, "Import a clip, then click it to put it on the timeline.");
  const textLayer = el("div", { style: "position:absolute;inset:0;z-index:5" });
  const playBtn = el("button", { class: "primary small", "aria-label": "Play", onclick: () => togglePlay() }, "▶");
  const timeBox = el("span", { class: "ve-time" }, "0:00.0 / 0:00.0");
  const inspector = el("div", {});
  const exportBox = el("div", { class: "ve-export" });
  const exportBar = el("i", { style: "width:0%" });
  const exportText = el("small", { class: "note" });
  const exportOpen = el("span", {});
  const exportCancel = el("button", { class: "ghost small", onclick: () => exportJob && api.edit_cancel(exportJob) }, "Cancel");
  const exportProgress = el("div", { hidden: true }, el("div", { class: "progress" }, exportBar), el("div", { class: "row" }, exportText, el("span", { style: "flex:1" }), exportOpen, exportCancel));
  const tracks = el("div", { class: "ve-tracks" });
  const scroll = el("div", { class: "ve-scroll" }, tracks);
  const undoBtn = el("button", { class: "ghost small", title: "Undo (Ctrl+Z)", onclick: () => history(undo, redo) }, "↶ Undo");
  const redoBtn = el("button", { class: "ghost small", title: "Redo (Ctrl+Y)", onclick: () => history(redo, undo) }, "↷ Redo");
  const zoomIn = el("input", { type: "range", min: 8, max: 160, value: zoom, "aria-label": "Timeline zoom", style: "width:110px", oninput: (e) => { zoom = +e.target.value; drawTimeline(); } });
  const node = el("div", { class: "ve" },
    el("div", { class: "ve-box" }, el("h4", {}, "Import"), el("div", { class: "row wrap" }, importVideo, importSound), binBox),
    el("div", { class: "ve-box ve-stage" }, wrap,
      el("div", { class: "ve-controls" },
        el("button", { class: "ghost small", "aria-label": "Back to the start", onclick: () => seek(0) }, "⏮"), playBtn, timeBox,
        exportBox),
      exportProgress),
    el("div", { class: "ve-box ve-side" }, inspector),
    el("div", { class: "ve-box ve-tl" },
      el("div", { class: "ve-controls", style: "padding:5px 8px" },
        el("button", { class: "ghost small", title: "Split at the red line (S)", onclick: () => split() }, "✂ Split"),
        el("button", { class: "ghost small", title: "Remove what's selected (Delete)", onclick: () => removeSelected() }, "🗑 Delete"),
        el("button", { class: "ghost small", onclick: () => addText() }, "T Add text"),
        undoBtn, redoBtn, el("span", { style: "flex:1" }), el("small", {}, "Zoom"), zoomIn),
      scroll));
  frame.append(empty, textLayer);

  // ---------------------------------------------------------------- saving and undo
  const plain = () => JSON.stringify(P, (k, v) => (k.startsWith("_") ? undefined : v));
  function snap() { undo.push(plain()); if (undo.length > 100) undo.shift(); redo = []; drawUndo(); scheduleSave(); }
  function snapOnce() { if (!snapped) { snapped = true; snap(); } }
  function endEdit() { snapped = false; scheduleSave(); }
  function drawUndo() { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; }
  function history(from, to) {
    if (!from.length) return;
    to.push(plain());
    P = JSON.parse(from.pop());
    selected = null;
    redrawAll(); scheduleSave();
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.edit_project_save?.({ ...JSON.parse(plain()), bin: bin.map((f) => f.path) }), 800);
  }

  async function restore() {
    let saved = null;
    try { saved = await api.edit_project_load?.(); } catch { /* start empty */ }
    if (saved?.project) {
      const p = saved.project;
      const files = await api.edit_relink([...new Set([...(p.bin || []), ...(p.clips || []).map((c) => c.path), ...(p.music || []).map((m) => m.path)])]);
      const byPath = new Map(files.filter((f) => !f.error).map((f) => [f.path, f]));
      bin = [...byPath.values()];
      const kept = (x) => { const f = byPath.get(x.path); if (f) x.url = f.url; return !!f; };
      const before = (p.clips?.length || 0) + (p.music?.length || 0);
      P = { ...emptyProject(), ...p, clips: (p.clips || []).filter(kept), music: (p.music || []).filter(kept), texts: p.texts || [] };
      delete P.bin;
      if (P.clips.length + P.music.length < before) toast("Some files in your last project have moved or been deleted, so they were left out.", 6000);
    }
    redrawAll();
  }

  // ---------------------------------------------------------------- files
  function drawBin() {
    binBox.replaceChildren(...bin.map((f) => el("button", { class: "ve-file", title: `Add ${f.name} to the timeline`, onclick: () => place(f) },
      f.thumb ? el("img", { src: f.thumb, alt: "" }) : el("div", { style: "display:flex;height:100%;align-items:center;justify-content:center;font-size:22px" }, "🎵"),
      el("span", {}, f.name))));
    if (!bin.length) binBox.append(el("p", { class: "note", style: "grid-column:1/-1" }, "Nothing imported yet."));
  }

  function remember(f) {
    if (!bin.some((x) => x.path === f.path)) bin.push(f);
    drawBin();
  }

  async function pick(kind) {
    const btn = kind === "audio" ? importSound : importVideo;
    busy(btn, true, "Reading…");
    try {
      for (const f of await api.edit_pick(kind)) {
        if (f.error) toast(f.error, 5000); else remember(f);
      }
    } finally { busy(btn, false); }
    scheduleSave();
  }

  function place(f) {
    snap();
    if (f.kind === "audio") {
      const m = { id: newId(), path: f.path, name: f.name, url: f.url, dur: f.duration, in: 0, out: f.duration, start: t, volume: 1, fade_in: 0, fade_out: 0 };
      P.music.push(m);
      selected = { type: "music", id: m.id };
    } else {
      const c = { id: newId(), path: f.path, name: f.name, url: f.url, thumb: f.thumb, kind: f.kind, has_audio: !!f.has_audio, dur: f.kind === "image" ? PICTURE_MAX : f.duration,
        in: 0, out: f.kind === "image" ? 4 : f.duration, speed: 1, volume: 1, mute: false, bright: 0, contrast: 1, sat: 1, trans: "none", trans_dur: 0.5 };
      P.clips.push(c);
      selected = { type: "clip", id: c.id };
    }
    redrawAll();
  }

  function addText() {
    snap();
    const x = { id: newId(), text: "Your text", start: t, dur: 3, x: 0.5, y: 0.85, size: 7, color: "#ffffff" };
    P.texts.push(x);
    selected = { type: "text", id: x.id };
    redrawAll();
  }

  // ---------------------------------------------------------------- timing, same sums as timeline() in videoedit.py
  function layout() {
    let at = 0;
    P.clips.forEach((c, i) => {
      c._len = (c.out - c.in) / c.speed;
      c._overlap = i && c.trans !== "none" ? Math.min(c.trans_dur, c._len / 2, P.clips[i - 1]._len / 2) : 0;
      at -= c._overlap;
      c._start = at;
      at += c._len;
    });
    total = at;
    if (t > total) t = total;
  }

  const clipIndexAt = (when) => {
    let idx = -1;
    P.clips.forEach((c, i) => { if (c._start <= when + 1e-6) idx = i; });
    return idx;
  };

  // ---------------------------------------------------------------- the preview
  function makeLayer() {
    const video = el("video", { playsinline: true, preload: "auto", style: "display:none" });
    const img = el("img", { alt: "", style: "display:none" });
    frame.prepend(video, img);
    return { video, img, clip: null, src: "" };
  }
  const layers = [makeLayer(), makeLayer()];
  const sounds = new Map();                        // music id -> <audio>

  function paint(layer, c, when) {
    layer.clip = c;
    const look = `brightness(${1 + c.bright}) contrast(${c.contrast}) saturate(${c.sat})`;
    if (c.kind === "image") {
      if (layer.src !== c.url) { layer.src = c.url; layer.img.src = c.url; }
      layer.video.pause(); layer.video.style.display = "none";
      layer.img.style.display = ""; layer.img.style.filter = look;
      return layer.img;
    }
    const v = layer.video;
    if (layer.src !== c.url) { layer.src = c.url; v.src = c.url; }
    layer.img.style.display = "none";
    v.style.display = ""; v.style.filter = look;
    v.volume = c.mute ? 0 : clamp(c.volume, 0, 1);
    v.playbackRate = c.speed;
    const at = clamp(c.in + (when - c._start) * c.speed, c.in, c.out);
    if (playing) {
      if (Math.abs(v.currentTime - at) > 0.3) v.currentTime = at;
      if (v.paused && !v.ended) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - at) > 0.02) v.currentTime = at;
    }
    return v;
  }

  function hideLayer(l) {
    l.clip = null; l.video.pause();
    l.video.style.display = "none"; l.img.style.display = "none";
  }

  function resetLook(n, z) { n.style.opacity = ""; n.style.transform = ""; n.style.clipPath = ""; n.style.zIndex = z; }

  function showVideo(when) {
    const i = clipIndexAt(when);
    const c = P.clips[i];
    empty.style.display = P.clips.length ? "none" : "flex";
    if (!c) { layers.forEach(hideLayer); return; }
    const inTrans = c._overlap > 0 && when < c._start + c._overlap;
    const prev = inTrans ? P.clips[i - 1] : null;
    // a clip already on a layer stays there, so it doesn't reload as a transition starts
    const onTop = layers.find((l) => l.clip === c) || layers.find((l) => l.clip !== prev) || layers[0];
    const under = layers.find((l) => l !== onTop);
    const top = paint(onTop, c, when);
    resetLook(top, 2);
    if (!prev) { hideLayer(under); return; }
    const bottom = paint(under, prev, when);
    resetLook(bottom, 1);
    const p = (when - c._start) / c._overlap;
    if (c.trans === "slide") { top.style.transform = `translateX(${(1 - p) * 100}%)`; bottom.style.transform = `translateX(${-p * 100}%)`; }
    else if (c.trans === "wipe") top.style.clipPath = `inset(0 0 0 ${(1 - p) * 100}%)`;
    else top.style.opacity = String(p);
  }

  function showSound(when) {
    for (const [id, a] of sounds) if (!P.music.some((m) => m.id === id)) { a.pause(); sounds.delete(id); }
    for (const m of P.music) {
      let a = sounds.get(m.id);
      if (!a) { a = new Audio(m.url); a.preload = "auto"; sounds.set(m.id, a); }
      const pos = when - m.start, len = m.out - m.in;
      if (!playing || pos < 0 || pos >= len || when >= total) { if (!a.paused) a.pause(); continue; }
      let level = m.volume;
      if (m.fade_in && pos < m.fade_in) level *= pos / m.fade_in;
      if (m.fade_out && pos > len - m.fade_out) level *= (len - pos) / m.fade_out;
      a.volume = clamp(level, 0, 1);
      const at = m.in + pos;
      if (Math.abs(a.currentTime - at) > 0.3) a.currentTime = at;
      if (a.paused) a.play().catch(() => {});
    }
  }

  function drawTexts() {
    const H = frame.clientHeight || 1;
    textLayer.replaceChildren(...P.texts.map((x) => {
      const n = el("div", { class: `ve-text${selected?.id === x.id ? " on" : ""}`, style: `left:${x.x * 100}%;top:${x.y * 100}%;font-size:${H * x.size / 100}px;color:${x.color}` }, x.text);
      n.dataset.id = x.id;
      n.addEventListener("pointerdown", (e) => dragText(e, x));
      return n;
    }));
    showTexts(t);
  }

  function showTexts(when) {
    for (const n of textLayer.children) {
      const x = P.texts.find((y) => y.id === n.dataset.id);
      n.style.display = x && when >= x.start && when <= x.start + x.dur ? "" : "none";
    }
  }

  function dragText(e, x) {
    e.preventDefault(); e.stopPropagation();
    select({ type: "text", id: x.id });
    const box = frame.getBoundingClientRect();
    const move = (m) => {
      snapOnce();
      x.x = clamp((m.clientX - box.left) / box.width, 0, 1);
      x.y = clamp((m.clientY - box.top) / box.height, 0, 1);
      const n = [...textLayer.children].find((c) => c.dataset.id === x.id);
      if (n) { n.style.left = `${x.x * 100}%`; n.style.top = `${x.y * 100}%`; }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); endEdit(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function fitFrame() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const r = RATIOS[P.ratio] || 16 / 9;
    const w = Math.min(W, H * r);
    frame.style.width = `${Math.floor(w)}px`;
    frame.style.height = `${Math.floor(w / r)}px`;
    drawTexts();
  }
  new ResizeObserver(fitFrame).observe(wrap);

  function showAt(when) {
    showVideo(when);
    showSound(when);
    showTexts(when);
    timeBox.textContent = `${fmt(when)} / ${fmt(total)}`;
    const head = tracks.querySelector(".ve-playhead");
    if (head) head.style.left = `${when * zoom}px`;
  }

  function seek(when) {
    t = clamp(when, 0, total);
    lastNow = performance.now();
    showAt(t);
  }

  function step(now) {
    if (!playing) return;
    if (!node.offsetParent) return stop();         // the panel was closed or the tab changed
    t += (now - lastNow) / 1000;
    lastNow = now;
    if (t >= total) { t = total; stop(); return showAt(t); }
    showAt(t);
    requestAnimationFrame(step);
  }

  function stop() {
    playing = false;
    playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play");
    layers.forEach((l) => l.video.pause());
    sounds.forEach((a) => a.pause());
  }

  function togglePlay() {
    if (playing) { stop(); return showAt(t); }
    if (!P.clips.length) return toast("Add a clip to the timeline first.");
    if (t >= total - 0.01) t = 0;
    playing = true;
    playBtn.textContent = "⏸"; playBtn.setAttribute("aria-label", "Pause");
    lastNow = performance.now();
    showAt(t);
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- the timeline
  function itemOf(sel) {
    if (!sel) return null;
    const list = { clip: P.clips, text: P.texts, music: P.music }[sel.type];
    return list?.find((x) => x.id === sel.id) || null;
  }

  function select(sel) {
    selected = sel;
    drawTimeline(); drawInspector(); drawTexts();
  }

  function drawTimeline() {
    layout();
    const end = Math.max(total, ...P.texts.map((x) => x.start + x.dur), ...P.music.map((m) => m.start + m.out - m.in), 0) + 8;
    const width = Math.max(end * zoom, scroll.clientWidth || 0);
    tracks.style.width = `${width}px`;

    const ruler = el("div", { class: "ve-ruler" });
    const every = [1, 2, 5, 10, 30, 60, 120].find((s) => s * zoom >= 60) || 300;
    for (let s = 0; s * zoom < width; s += every) ruler.append(el("i", { style: `left:${s * zoom}px` }, fmt(s).replace(/\.0$/, "")));
    ruler.addEventListener("pointerdown", (e) => scrub(e));

    const row = (label, cls = "") => {
      const r = el("div", { class: `ve-track ${cls}` }, el("small", {}, label));
      r.addEventListener("pointerdown", (e) => { if (e.target === r) { select(null); scrub(e); } });
      return r;
    };
    const vTrack = row("Video"), tTrack = row("Text", "small"), aTrack = row("Sound", "small");

    P.clips.forEach((c) => {
      const n = el("div", { class: `ve-item clip${selected?.id === c.id ? " on" : ""}`, style: `left:${c._start * zoom}px;width:${Math.max(4, c._len * zoom)}px`, title: c.name },
        el("span", {}, c.name), el("div", { class: "ve-trim l" }), el("div", { class: "ve-trim r" }));
      if (c.thumb) n.style.backgroundImage = `url("${c.thumb}")`;
      n.addEventListener("pointerdown", (e) => pressClip(e, c));
      vTrack.append(n);
      if (c._overlap) vTrack.append(el("div", { class: "ve-trans", style: `left:${c._start * zoom}px;width:${c._overlap * zoom}px` }));
    });
    P.texts.forEach((x) => {
      const n = el("div", { class: `ve-item text${selected?.id === x.id ? " on" : ""}`, style: `left:${x.start * zoom}px;width:${Math.max(4, x.dur * zoom)}px` },
        el("span", {}, x.text), el("div", { class: "ve-trim l" }), el("div", { class: "ve-trim r" }));
      n.addEventListener("pointerdown", (e) => pressText(e, x));
      tTrack.append(n);
    });
    P.music.forEach((m) => {
      const n = el("div", { class: `ve-item sound${selected?.id === m.id ? " on" : ""}`, style: `left:${m.start * zoom}px;width:${Math.max(4, (m.out - m.in) * zoom)}px`, title: m.name },
        el("span", {}, m.name), el("div", { class: "ve-trim l" }), el("div", { class: "ve-trim r" }));
      n.addEventListener("pointerdown", (e) => pressMusic(e, m));
      aTrack.append(n);
    });
    tracks.replaceChildren(ruler, vTrack, tTrack, aTrack, el("div", { class: "ve-playhead", style: `left:${t * zoom}px` }));
    timeBox.textContent = `${fmt(t)} / ${fmt(total)}`;
  }

  function scrub(e) {
    e.preventDefault();
    if (playing) stop();
    const at = (x) => seek((x - tracks.getBoundingClientRect().left) / zoom);
    at(e.clientX);
    const move = (m) => at(m.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // the timeline is redrawn while dragging, so a drag listens on the window rather than on the item
  function drag(e, onMove, onEnd) {
    e.preventDefault(); e.stopPropagation();
    if (playing) stop();
    const x0 = e.clientX;
    let moved = false;
    const move = (m) => {
      const dx = m.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; snap(); }
      onMove(dx / zoom, m);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (moved) { onEnd?.(); scheduleSave(); drawInspector(); drawTexts(); showAt(t); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function pressClip(e, c) {
    select({ type: "clip", id: c.id });
    const side = e.target.classList?.contains("l") ? "l" : e.target.classList?.contains("r") ? "r" : null;
    const a = c.in, b = c.out;
    if (side) {
      return drag(e, (d) => {
        if (c.kind === "image") c.out = clamp(b + (side === "r" ? d : -d) * c.speed, 0.2, PICTURE_MAX);
        else if (side === "l") c.in = clamp(a + d * c.speed, 0, b - 0.1);
        else c.out = clamp(b + d * c.speed, a + 0.1, c.dur);
        drawTimeline(); showVideo(t);
      });
    }
    // drag the clip's middle: it moves to wherever it's let go of
    const from = P.clips.indexOf(c), start0 = c._start;
    drag(e, (d) => {
      const item = tracks.querySelector(".ve-item.clip.on");
      if (item) { item.style.transform = `translateX(${d * zoom}px)`; item.style.zIndex = 5; }
      c._dragTo = start0 + d;
    }, () => {
      const mid = c._dragTo + c._len / 2;
      const rest = P.clips.filter((x) => x !== c);
      let to = rest.findIndex((x) => mid < x._start + x._len / 2);
      if (to < 0) to = rest.length;
      rest.splice(to, 0, c);
      P.clips = rest;
      delete c._dragTo;
      if (to === from) undo.pop();
      drawUndo();
      drawTimeline();
    });
  }

  function pressText(e, x) {
    select({ type: "text", id: x.id });
    const side = e.target.classList?.contains("l") ? "l" : e.target.classList?.contains("r") ? "r" : null;
    const s = x.start, l = x.dur;
    drag(e, (d) => {
      if (side === "l") { x.start = clamp(s + d, 0, s + l - 0.1); x.dur = s + l - x.start; }
      else if (side === "r") x.dur = Math.max(0.1, l + d);
      else x.start = Math.max(0, s + d);
      drawTimeline(); showTexts(t);
    });
  }

  function pressMusic(e, m) {
    select({ type: "music", id: m.id });
    const side = e.target.classList?.contains("l") ? "l" : e.target.classList?.contains("r") ? "r" : null;
    const s = m.start, a = m.in, b = m.out;
    drag(e, (d) => {
      if (side === "l") { const nw = clamp(a + d, Math.max(0, a - s), b - 0.1); m.in = nw; m.start = s + (nw - a); }
      else if (side === "r") m.out = clamp(b + d, a + 0.1, m.dur);
      else m.start = Math.max(0, s + d);
      drawTimeline();
    });
  }

  function split() {
    const sel = itemOf(selected);
    if (selected?.type === "music" && sel) {
      const at = t - sel.start;
      if (at <= 0.05 || at >= sel.out - sel.in - 0.05) return toast("Move the red line onto the sound first.");
      snap();
      const b = { ...sel, id: newId(), in: sel.in + at, start: t, fade_in: 0 };
      sel.out = sel.in + at; sel.fade_out = 0;
      P.music.splice(P.music.indexOf(sel) + 1, 0, b);
      return redrawAll();
    }
    if (selected?.type === "text" && sel) {
      const at = t - sel.start;
      if (at <= 0.05 || at >= sel.dur - 0.05) return toast("Move the red line onto the text first.");
      snap();
      P.texts.push({ ...sel, id: newId(), start: t, dur: sel.dur - at });
      sel.dur = at;
      return redrawAll();
    }
    const i = clipIndexAt(t), c = P.clips[i];
    if (!c) return toast("Add a clip to the timeline first.");
    const at = c.in + (t - c._start) * c.speed;
    if (at <= c.in + 0.05 || at >= c.out - 0.05) return toast("Move the red line into the middle of a clip first.");
    snap();
    const b = { ...c, id: newId(), in: at, trans: "none" };
    if (c.kind === "image") { b.in = 0; b.out = c.out - at; c.out = at; } else c.out = at;
    P.clips.splice(i + 1, 0, b);
    selected = { type: "clip", id: b.id };
    redrawAll();
  }

  function removeSelected() {
    const sel = itemOf(selected);
    if (!sel) return toast("Click something on the timeline first.");
    snap();
    if (selected.type === "clip") P.clips = P.clips.filter((x) => x !== sel);
    if (selected.type === "text") P.texts = P.texts.filter((x) => x !== sel);
    if (selected.type === "music") P.music = P.music.filter((x) => x !== sel);
    selected = null;
    redrawAll();
  }

  // ---------------------------------------------------------------- the inspector
  function slider(label, obj, key, min, max, stepBy, show, after) {
    const name = el("span", {}, `${label} ${show(obj[key])}`);
    const input = el("input", { type: "range", min, max, step: stepBy, value: obj[key], "aria-label": label,
      oninput: () => { snapOnce(); obj[key] = +input.value; name.textContent = `${label} ${show(obj[key])}`; after(); },
      onchange: endEdit });
    return el("label", {}, name, input);
  }

  function field(label, control) { return el("label", {}, el("span", {}, label), control); }

  function numberField(label, obj, key, min, after) {
    const input = el("input", { type: "number", min, step: 0.1, value: Number(obj[key]).toFixed(1), "aria-label": label,
      onchange: () => { const v = parseFloat(input.value); if (Number.isNaN(v)) return; snap(); obj[key] = Math.max(min, v); after(); } });
    return field(label, input);
  }

  function chooser(label, options, value, onchange) {
    const s = el("select", { "aria-label": label, onchange: () => onchange(s.value) }, options.map(([v, l]) => el("option", { value: v }, l)));
    s.value = value;
    return field(label, s);
  }

  function drawInspector() {
    const it = itemOf(selected);
    const pct = (v) => `${Math.round(v * 100)}%`;
    const redrawClip = () => { drawTimeline(); showVideo(t); };
    if (!it) {
      inspector.replaceChildren(el("h4", {}, "Edit"), el("p", { class: "note" }, "Click a clip, text or sound on the timeline to change it here."),
        el("p", { class: "note" }, "Keys: Space plays, S splits at the red line, Delete removes, Ctrl+Z undoes."));
    } else if (selected.type === "clip") {
      const index = P.clips.indexOf(it);
      const controls = [el("h4", {}, it.kind === "image" ? "Picture" : "Clip")];
      if (it.kind === "video") controls.push(slider("Speed", it, "speed", 0.25, 4, 0.05, (v) => `${v.toFixed(2)}×`, redrawClip));
      if (it.kind === "video" && it.has_audio) {
        const mute = el("input", { type: "checkbox", checked: it.mute, "aria-label": "Mute", onchange: () => { snap(); it.mute = mute.checked; showVideo(t); } });
        controls.push(slider("Volume", it, "volume", 0, 2, 0.05, pct, () => showVideo(t)), field("Mute", mute));
      }
      controls.push(slider("Bright", it, "bright", -0.5, 0.5, 0.01, (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}`, () => showVideo(t)),
        slider("Contrast", it, "contrast", 0.5, 2, 0.01, pct, () => showVideo(t)),
        slider("Colour", it, "sat", 0, 3, 0.01, pct, () => showVideo(t)));
      if (index > 0) {
        controls.push(chooser("Transition in", [["none", "None (cut)"], ["fade", "Fade"], ["dissolve", "Dissolve"], ["slide", "Slide"], ["wipe", "Wipe"]], it.trans, (v) => { snap(); it.trans = v; redrawAll(); }));
        if (it.trans !== "none") controls.push(slider("Length", it, "trans_dur", 0.1, 3, 0.1, (v) => `${v.toFixed(1)} s`, redrawClip));
      }
      inspector.replaceChildren(...controls);
    } else if (selected.type === "text") {
      const area = el("textarea", { rows: 2, "aria-label": "Text", oninput: () => { snapOnce(); it.text = area.value; drawTimeline(); drawTexts(); }, onchange: endEdit });
      area.value = it.text;
      const color = el("input", { type: "color", value: it.color, "aria-label": "Colour", oninput: () => { snapOnce(); it.color = color.value; drawTexts(); }, onchange: endEdit });
      inspector.replaceChildren(el("h4", {}, "Text"), area,
        slider("Size", it, "size", 2, 25, 0.5, (v) => `${v}%`, drawTexts), field("Colour", color),
        numberField("Starts at", it, "start", 0, redrawAll), numberField("Lasts", it, "dur", 0.1, redrawAll),
        el("p", { class: "note" }, "Drag the text on the picture to move it."));
    } else {
      inspector.replaceChildren(el("h4", {}, "Sound"), el("p", { class: "note", style: "word-break:break-all" }, it.name),
        slider("Volume", it, "volume", 0, 2, 0.05, pct, () => {}),
        numberField("Fade in", it, "fade_in", 0, () => {}), numberField("Fade out", it, "fade_out", 0, () => {}));
    }
  }

  // ---------------------------------------------------------------- export
  function drawExport() {
    const name = el("input", { type: "text", value: P.name, "aria-label": "Video name", title: "Video name", onchange: () => { snap(); P.name = name.value.trim() || "My video"; } });
    const go = el("button", { class: "primary small", onclick: () => doExport(go) }, "⬆ Export");
    const drop = (label, options, value, onchange) => {
      const s = el("select", { "aria-label": label, title: label, onchange: () => onchange(s.value) }, options.map(([v, l]) => el("option", { value: v }, l)));
      s.value = value;
      return s;
    };
    exportBox.replaceChildren(name,
      drop("Shape", [["16:9", "Wide 16:9"], ["9:16", "Tall 9:16"], ["1:1", "Square"]], P.ratio, (v) => { snap(); P.ratio = v; fitFrame(); }),
      drop("Quality", [["1080", "1080p"], ["720", "720p"]], P.quality, (v) => { snap(); P.quality = v; }), go);
  }

  async function doExport(btn) {
    if (exportJob) return toast("An export is already running.");
    busy(btn, true, "Starting…");
    let r;
    try { r = await api.edit_export(JSON.parse(plain())); } catch { r = { error: "The export couldn't start. Try again." }; }
    busy(btn, false);
    if (r.error) return toast(r.error, 6000);
    exportJob = r.job;
    exportProgress.hidden = false; exportCancel.hidden = false;
    exportBar.style.width = "2%"; exportText.textContent = "Starting…"; exportOpen.replaceChildren();
  }

  function onEvent(e) {
    if (!exportJob || e.job !== exportJob) return false;
    if (e.progress != null) exportBar.style.width = `${Math.round(e.progress * 100)}%`;
    if (e.text) exportText.textContent = e.text;
    if (e.state === "done") {
      exportJob = null; exportCancel.hidden = true;
      exportBar.style.width = "100%";
      exportText.textContent = "Saved to your creations.";
      const file = e.result?.file;
      if (file) exportOpen.replaceChildren(el("button", { class: "primary small", onclick: () => api.gen_open(file) }, "▶ Play it"));
      toast("Your video is ready!", 3500);
    }
    if (e.state === "error") {
      exportJob = null; exportCancel.hidden = true;
      exportText.textContent = e.text || "The export stopped.";
      toast(e.text || "The export stopped.", 6000);
    }
    return true;
  }

  // ---------------------------------------------------------------- keys, only while the editor is on screen
  window.addEventListener("keydown", (e) => {
    if (!node.offsetParent) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
    const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (ctrl && key === "z") { e.preventDefault(); history(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); }
    else if (ctrl && key === "y") { e.preventDefault(); history(redo, undo); }
    else if (ctrl) return;
    else if (e.code === "Space") { e.preventDefault(); document.activeElement?.blur?.(); togglePlay(); }
    else if (key === "s") { e.preventDefault(); split(); }
    else if (key === "delete" || key === "backspace") { e.preventDefault(); removeSelected(); }
    else if (key === "arrowleft") { e.preventDefault(); seek(t - 1 / 30); }
    else if (key === "arrowright") { e.preventDefault(); seek(t + 1 / 30); }
  });

  function redrawAll() {
    drawBin(); drawUndo(); drawTimeline(); drawInspector(); drawExport(); fitFrame(); showAt(t);
  }

  redrawAll();
  if (/[?&]mock\b/.test(location.search)) window.__ve = { get project() { return P; }, get total() { return total; }, get t() { return t; }, get job() { return exportJob; }, seek, split, togglePlay, select, layers };

  return {
    node,
    async load() {
      if (!loaded) { loaded = true; await restore(); }
      requestAnimationFrame(() => { fitFrame(); drawTimeline(); showAt(t); });
    },
    addFile(f) { remember(f); place(f); },
    onEvent,
  };
}
