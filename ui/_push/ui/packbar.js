// packbar.js - the dropdown the test features share: which asset packs this game is using, and what to show on the grid.
// makePackBar({ packs: [{ key, label, count }], allLabel, onPick }) -> a <select>. onPick(key) gets "" for everything.
export function prettyPack(folder) {
  return folder.replace(/^(conv|pack)_/, "").replace(/_+$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function makePackBar({ packs, allLabel = "All asset packs", value = "", onPick }) {
  const select = document.createElement("select");
  select.className = "pack-bar";
  select.title = "The asset packs this is using";
  Object.assign(select.style, { maxWidth: "min(340px, 100%)", padding: "6px 10px", borderRadius: "8px", font: "inherit", cursor: "pointer", background: "#fffaf0", color: "#3a2a18" });
  const total = packs.reduce((n, p) => n + (p.count || 0), 0);
  const all = new Option(`${allLabel} (${packs.length} packs${total ? `, ${total} models` : ""})`, "");
  select.add(all);
  for (const p of [...packs].sort((a, b) => a.label.localeCompare(b.label))) {
    select.add(new Option(p.count ? `${p.label} (${p.count})` : p.label, p.key));
  }
  select.value = value;
  select.addEventListener("change", () => onPick?.(select.value));
  select.addEventListener("keydown", (e) => e.stopPropagation());   // arrow keys pick in the list, they don't walk the camera
  return select;
}
