// photo.js - Media's photo editor: miniPaint (MIT licence, ui/vendor/minipaint) in a frame, plus a bar that opens a
// picture and saves the result into "My creations". It runs entirely on this PC and shows no ads.
import { el, toast, busy } from "./util.js";

export function initPhoto(api, { onSaved } = {}) {
  let frame = null, ready = null, stem = "photo";
  const name = el("input", { type: "text", placeholder: "Name of the picture", "aria-label": "Name of the picture", value: stem, style: "max-width:220px" });
  const file = el("input", { type: "file", accept: "image/*", hidden: true, "aria-label": "Choose a picture" });
  const save = el("button", { class: "primary small" }, "💾 Save to my creations");
  const host = el("div", {});
  const node = el("div", {},
    el("div", { class: "photo-bar" },
      el("button", { class: "ghost small", onclick: () => file.click() }, "📂 Open a picture"), file, name, save,
      el("span", { class: "note" }, "Layers, effects, filters and tools are in the menus inside. It runs on this PC, with no ads.")),
    host);

  function load() {
    if (frame) return ready;
    frame = el("iframe", { class: "photo-frame", src: "vendor/minipaint/index.html", title: "Photo editor" });
    host.append(frame);
    ready = new Promise((resolve, reject) => {
      const started = Date.now();
      const look = () => {
        let w = null;
        try { w = frame.contentWindow; } catch { /* not there yet */ }
        if (w?.Layers) return resolve(w);
        if (Date.now() - started > 30000) return reject(new Error("The photo editor didn't start."));
        setTimeout(look, 100);
      };
      look();
    });
    return ready;
  }

  // put a picture (a data: or http: address) into the editor as a new layer
  async function open(src, title) {
    const w = await load();
    if (title) { stem = title.replace(/\.[^.]+$/, ""); name.value = stem; }
    await new Promise((resolve, reject) => {
      const img = new w.Image();
      img.onload = () => {
        Promise.resolve(w.Layers.insert({ name: title || "Picture", type: "image", data: img, width: img.naturalWidth, height: img.naturalHeight,
          width_original: img.naturalWidth, height_original: img.naturalHeight })).then(resolve, reject);
      };
      img.onerror = () => reject(new Error("That picture couldn't be opened."));
      img.src = src;
    });
  }

  file.addEventListener("change", () => {
    const f = file.files?.[0]; file.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => open(String(r.result), f.name).catch((e) => toast(e.message, 5000));
    r.onerror = () => toast("That picture couldn't be read.", 5000);
    r.readAsDataURL(f);
  });

  save.addEventListener("click", async () => {
    busy(save, true, "Saving…");
    try {
      const w = await load();
      const size = w.Layers.get_dimensions();
      const c = w.document.createElement("canvas");
      c.width = size.width; c.height = size.height;
      w.Layers.convert_layers_to_canvas(c.getContext("2d"));
      const r = await api.photo_save(name.value.trim() || "photo", c.toDataURL("image/png"));
      if (r.error) throw new Error(r.error);
      toast(`Saved ${r.name} to your creations.`, 3500);
      onSaved?.(r);
    } catch (e) { toast(e.message || "Couldn't save the picture.", 5000); }
    busy(save, false);
  });

  return { node, load, open };
}
