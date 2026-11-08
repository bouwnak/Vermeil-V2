"""
worldedits.py - what you changed with the world editor (farm world and hubs). One file per world in data/, written to a new file that replaces the old one
in a single step. "Revert to original" doesn't destroy anything: the edits move to a .reverted file beside it, replacing only the last one reverted.
"""
import json
import os
import re
import tempfile

from paths import data_file

MAX_BYTES = 96 * 1024 * 1024
SCOPE = re.compile(r"^[a-z0-9_:-]{1,40}$")


def _path(scope):
    if not isinstance(scope, str) or not SCOPE.match(scope):
        return None
    return data_file("world_edit_" + scope.replace(":", "_") + ".json")


def load(scope):
    """this world's edits, or None"""
    path = _path(scope)
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def save(scope, data):
    path = _path(scope)
    if not path:
        return {"error": "That isn't a world that can be saved."}
    if not isinstance(data, dict):
        return {"error": "There was nothing to save."}
    text = json.dumps(data, separators=(",", ":"))
    if len(text) > MAX_BYTES:
        return {"error": "This world's edits are too big to save. Undo or revert some of them first."}
    folder = os.path.dirname(path)
    tmp = None
    try:
        os.makedirs(folder, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=folder, prefix="world_edit_", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except OSError as e:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)
        return {"error": f"Couldn't save: {e}"}
    return {"ok": True, "bytes": len(text)}


def clear(scope):
    """back to the world as it was made. The edits are kept once, as <file>.reverted"""
    path = _path(scope)
    if not path:
        return {"error": "That isn't a world that can be reverted."}
    try:
        if os.path.exists(path):
            os.replace(path, path + ".reverted")
    except OSError as e:
        return {"error": f"Couldn't revert: {e}"}
    return {"ok": True}


def model_files(ui_dir):
    """every glTF model in the folders the catalog doesn't list: the games' packs and your imported models. [{url, pack}]"""
    out = []
    for root_name, label in ((os.path.join("games", "asset_packs"), "games"), ("models", "models")):
        top = os.path.join(ui_dir, root_name)
        for folder, dirs, files in os.walk(top):
            dirs[:] = sorted(d for d in dirs if not d.startswith("_"))         # _originals and working folders aren't models to place
            rel = os.path.relpath(folder, top)
            first = "" if rel == "." else rel.split(os.sep)[0]
            for name in sorted(files):
                if name.lower().endswith((".glb", ".gltf")):
                    url = os.path.relpath(os.path.join(folder, name), ui_dir).replace(os.sep, "/")
                    out.append({"url": url, "pack": f"{label}_{first}" if first else label})
    return out
