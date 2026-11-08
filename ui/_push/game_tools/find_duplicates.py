"""Finds models of the general asset pack that are the same model twice, after scan_models.py has looked at them all in Blender.

  python game_tools/find_duplicates.py          -> data/game/duplicates.json (nothing is touched: read it first)
  python game_tools/find_duplicates.py apply    -> sends the extra copies to the Windows Recycle Bin and writes
                                                   ui/general_asset_pack/aliases.json (removed model -> the one kept)

Two models are duplicates when they have the same shape and faces (whatever their size) and the same colours.
A very simple shape (a box, a tile) also has to be the same size: two square tiles of different sizes are two pieces, not one.
Same shape in another colour is a variant, and stays. A copy with animations is only removed if the one kept has them too.
A model the code asks for by name is never removed. Run  python game_tools/build_game_assets.py catalog  afterwards.
"""
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(PROJECT, "ui", "general_asset_pack")
SCAN = os.path.join(PROJECT, "data", "game", "model_scan.jsonl")
REPORT = os.path.join(PROJECT, "data", "game", "duplicates.json")
ALIASES = os.path.join(ASSETS, "aliases.json")
CODE_ROOTS = ["ui", "game", "tests", "brain", "skills"]
CODE_EXT = (".js", ".py", ".html", ".json", ".css", ".md")
SKIP_DIRS = {"general_asset_pack", "asset_packs", "vendor", "node_modules", "__pycache__", "models"}
NEVER = ("card_kit",)                             # same card shape, different picture: the pictures are too alike at this scale to compare


def code_words():
    """every word in the code, and the folders of the library a piece of code builds paths into"""
    words, folders = set(), set()
    known = {d for d in os.listdir(ASSETS) if os.path.isdir(os.path.join(ASSETS, d))}
    for root in CODE_ROOTS:
        for d, dirs, files in os.walk(os.path.join(PROJECT, root)):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for fn in files:
                if not fn.endswith(CODE_EXT): continue
                try:
                    with open(os.path.join(d, fn), encoding="utf-8", errors="replace") as f: text = f.read()
                except OSError:
                    continue
                found = set(re.findall(r"[A-Za-z0-9_]+", text))
                words |= found
                folders |= {k for k in known if k in found and re.search(re.escape(k) + r"/", text)}
    return words, folders


def load_scan():
    rows = {}
    with open(SCAN, encoding="utf-8") as f:
        for line in f:
            try: r = json.loads(line)
            except ValueError: continue
            if "tris" in r: rows[r["file"]] = r
    return rows


SIMPLE_SHAPE = 64                                 # triangles: below this, matching proportions can be a coincidence


def same_look(a, b, same_pack=False):
    """same points already known: same faces, and do they also look the same?
    Inside one pack the bar is much higher: an author doesn't ship one model under two names, so a near match is a variant."""
    if a["tris"] != b["tris"]: return False
    if same_pack:
        if a["shape"] != b["shape"] or a["surf"] != b["surf"] or a["size"] != b["size"]: return False
        if max(abs(x - y) for x, y in zip(a["colour"], b["colour"])) > 0.002 or a.get("uv") != b.get("uv") or a.get("tex") != b.get("tex"): return False
    if max(abs(x - y) for x, y in zip(a["surf"], b["surf"])) > 0.01: return False
    if a["tris"] <= SIMPLE_SHAPE and max(abs(x - y) / max(x, y, 1e-6) for x, y in zip(a["size"], b["size"])) > 0.02: return False
    va, vb = a.get("vc"), b.get("vc")
    if (va is None) != (vb is None) or (va and max(abs(x - y) for x, y in zip(va, vb)) > 0.04): return False
    if max(abs(x - y) for x, y in zip(a["colour"], b["colour"])) > 0.04: return False
    if (a.get("uv") is None) != (b.get("uv") is None): return False
    if a.get("uv") and max(abs(x - y) for x, y in zip(a["uv"], b["uv"])) > 0.01: return False
    ta, tb = a.get("tex"), b.get("tex")
    if bool(ta) != bool(tb): return False
    if ta and tb:
        if len(ta) != len(tb): return False
        diffs = [abs(x - y) for x, y in zip(ta, tb)]
        if sum(diffs) / len(diffs) > 0.02 or max(diffs) > 0.08: return False
    return True


def robust_key(r):
    return (r["tris"], r["points"], tuple(r["aspect"]), tuple(r["mean"]), tuple(r["spread"]))


def main(apply=False):
    rows = load_scan()
    with open(os.path.join(ASSETS, "catalog.json"), encoding="utf-8") as f:
        catalog = {m["url"].split("general_asset_pack/", 1)[1]: m for m in json.load(f)["models"]}
    words, folders = code_words()

    def wanted_by_code(file):
        m = catalog.get(file) or {}
        folder, stem = file.split("/")[0], os.path.splitext(os.path.basename(file))[0]
        if m.get("id") in words: return True      # asked for by its id
        if folder in folders: return True         # code builds paths into this folder: `${FOLDER}${name}${k}.glb` can't be followed from here
        return False

    # two ways to be the same shape: exactly the same points, or the same counts and proportions (a re-export moves points by a hair)
    parent = {f: f for f in rows}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for key_of in (lambda r: r["shape"], robust_key):
        seen = {}
        for f, r in rows.items():
            k = key_of(r)
            if k in seen: parent[find(f)] = find(seen[k])
            else: seen[k] = f
    shapes = defaultdict(list)
    for f in rows:
        shapes[find(f)].append(f)

    def anims(f): return set((catalog.get(f) or {}).get("animations") or [])

    def rank(f):                                  # the one to keep comes first
        return (not wanted_by_code(f), -len(anims(f)), f.startswith("pack_"), len(f), f)

    removed, kept_groups, blocked = {}, [], 0
    for files in shapes.values():
        if len(files) < 2: continue
        files.sort(key=rank)
        looks = []                                # within one shape, one list per look
        for f in files:
            for look in looks:
                if all(same_look(rows[x], rows[f], x.split("/")[0] == f.split("/")[0]) for x in look):
                    look.append(f)
                    break
            else:
                looks.append([f])
        for look in looks:
            if len(look) < 2: continue
            keeper, gone = look[0], []
            for f in look[1:]:
                if any(n in f for n in NEVER) or wanted_by_code(f) or not anims(f) <= anims(keeper):
                    blocked += 1
                    continue
                gone.append(f)
                removed[f] = keeper
            if gone: kept_groups.append({"keep": keeper, "remove": gone})

    report = {"models": len(rows), "groups": len(kept_groups), "remove": len(removed), "kept_because_code_or_animations": blocked,
              "by_folder": {}, "list": sorted(kept_groups, key=lambda g: g["keep"])}
    for f in removed:
        report["by_folder"][f.split("/")[0]] = report["by_folder"].get(f.split("/")[0], 0) + 1
    report["by_folder"] = dict(sorted(report["by_folder"].items(), key=lambda kv: -kv[1]))
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    print(f"{report['models']} models, {report['groups']} sets of duplicates, {report['remove']} extra copies, {blocked} copies kept (code or animations need them)")
    print(report["by_folder"])
    if apply: remove(removed, catalog)


def side_files(path):
    """what a .gltf loads from beside itself"""
    try:
        with open(path, encoding="utf-8") as f: g = json.load(f)
    except (OSError, ValueError):
        return set()
    out = set()
    for item in g.get("buffers", []) + g.get("images", []):
        uri = item.get("uri")
        if uri and not uri.startswith("data:"):
            out.add(os.path.normpath(os.path.join(os.path.dirname(path), uri.replace("%20", " "))))
    return out


def remove(removed, catalog):
    gone = [os.path.join(ASSETS, f.replace("/", os.sep)) for f in removed]
    gone_set = set(gone)
    # a picture or .bin goes with its model only if no model that stays uses it
    wanted = set()
    for d, _, names in os.walk(ASSETS):
        for n in names:
            p = os.path.join(d, n)
            if n.lower().endswith(".gltf") and p not in gone_set: wanted |= side_files(p)
    extra = {s for p in gone if p.lower().endswith(".gltf") for s in side_files(p)} - wanted
    targets = [p for p in gone + sorted(extra) if os.path.exists(p)]
    # the aliases are written first: if anything stops halfway, old saves still find a model that exists
    aliases = {}
    try:
        with open(ALIASES, encoding="utf-8") as f: aliases = json.load(f)
    except (OSError, ValueError):
        pass
    for f, keeper in removed.items():
        a, b = (catalog.get(f) or {}).get("id"), (catalog.get(keeper) or {}).get("id")
        if a and b: aliases[a] = b
    with open(ALIASES, "w", encoding="utf-8") as f:
        json.dump(aliases, f, indent=0, sort_keys=True)
    listing = os.path.join(PROJECT, "data", "game", "duplicates_to_remove.txt")
    with open(listing, "w", encoding="utf-8") as f:
        f.write("\n".join(targets))
    script = ("Add-Type -AssemblyName Microsoft.VisualBasic; $n=0; foreach ($p in [IO.File]::ReadAllLines($env:DUP_LIST)) { "
              "if ($p) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin'); $n++ } }; \"$n files sent to the Recycle Bin\"")
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], env={**os.environ, "DUP_LIST": listing}, check=True)


if __name__ == "__main__":
    main(len(sys.argv) > 1 and sys.argv[1] == "apply")
