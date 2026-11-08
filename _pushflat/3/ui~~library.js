// library.js - the model and voice "shop" inside the character editor: everything you've saved, with Use / Listen / Animate, importing, and Delete permanently.
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
const btn = (text, cls, fn) => { const b = el("button", { type: "button", className: cls, textContent: text }); b.addEventListener("click", fn); return b; };

/**
 * a = { api, toast, models(), deleteModel(name) -> Promise, useModel(name), animate(name), importModel(folder) -> Promise,
 *       voices() -> Promise<[{name,...}]>, deleteVoice(name) -> Promise, useVoice(name), hearVoice(name), importVoice() -> Promise }
 */
export function initLibrary(a) {
  let kind = "models", query = "";
  const list = el("div", { className: "lib-list" });
  const title = el("h2");
  const search = el("input", { type: "search", placeholder: "Search…", ariaLabel: "Search your library" });
  const imports = el("div", { className: "row lib-imports" });
  const close = btn("×", "close", () => { box.hidden = true; });
  close.setAttribute("aria-label", "Close");
  const box = el("div", { className: "lib-dialog", role: "dialog", hidden: true },
    el("div", { className: "lib-card" }, el("header", {}, title, close), imports, search, list));
  box.addEventListener("click", (e) => { if (e.target === box) box.hidden = true; });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); box.hidden = true; } });
  document.body.append(box);
  search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); render(); });

  /** Deleting takes two clicks on the row itself, so a slip can't lose anything. */
  function deleteButton(name, run) {
    const b = btn("🗑 Delete permanently", "danger", async () => {
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Really delete? It can't be undone"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "🗑 Delete permanently"; } }, 4000); return; }
      b.disabled = true;
      await run(name);
      a.toast(`Deleted ${name} for good.`);
      render();
    });
    return b;
  }

  async function render() {
    const voices = kind === "voices";
    const names = voices ? (await a.voices()).map((v) => v.name) : a.models();
    title.textContent = `${voices ? "Voice clones" : "3D models"} (${names.length})`;
    const shown = names.filter((n) => n.toLowerCase().includes(query));
    list.replaceChildren(...shown.map((name) => el("div", { className: "lib-row" },
      el("span", { className: "lib-name", textContent: name, title: name }),
      el("div", { className: "lib-acts" },
        btn("Use", "primary", () => { (voices ? a.useVoice : a.useModel)(name); box.hidden = true; }),
        voices ? btn("Listen", "ghost", () => a.hearVoice(name)) : /\.glb$/i.test(name) ? btn("Animate", "ghost", () => { box.hidden = true; a.animate(name); }) : null,
        deleteButton(name, voices ? a.deleteVoice : a.deleteModel)))));
    if (!shown.length) list.append(el("p", { className: "note", textContent: names.length ? "Nothing matches that." : `Nothing here yet. Import ${voices ? "a voice" : "a model"} to start.` }));
  }

  function open(which) {
    kind = which; query = ""; search.value = "";
    imports.replaceChildren(...(which === "voices"
      ? [btn("＋ Import a voice (.pth + .index)…", "ghost", () => a.importVoice().then(render))]
      : [btn("＋ Import a model…", "ghost", () => a.importModel(false).then(render)), btn("＋ Import a folder…", "ghost", () => a.importModel(true).then(render))]));
    box.hidden = false;
    render();
    search.focus();
  }
  return { open };
}
