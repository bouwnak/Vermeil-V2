"""Bring folders of unzipped model packs (FBX / OBJ) into the general asset pack, as game-ready .glb files.

  python game_tools/import_packs.py plan <folder with one sub-folder per unzipped pack>
      -> data/game/import_jobs.json + ui/general_asset_pack/pack_labels.json (nice names, from the pack's own folder names)
  python game_tools/import_packs.py run  [workers=4]
      -> runs Blender in the background (no window) to convert everything. Safe to stop: run it again to continue.

  python game_tools/import_packs.py redo-rigged [workers=4]
      -> converts every model with bones again, after changing how animations are handled.

Then run  python game_tools/build_game_assets.py catalog  so the games know the new models.
A model that comes as both FBX and OBJ is taken once, from the FBX (that's the one with animations).
"""
import json
import os
import re
import struct
import subprocess
import sys

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(PROJECT, "ui", "general_asset_pack")
JOBS = os.path.join(PROJECT, "data", "game", "import_jobs.json")
LABELS = os.path.join(ASSETS, "pack_labels.json")
WORKER = os.path.join(PROJECT, "game_tools", "blender_import_worker.py")
BLENDERS = [os.environ.get("BLENDER", ""), r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe"]


def find_blender():
    import glob
    import shutil
    found = [b for b in BLENDERS if b and os.path.isfile(b)] + glob.glob(r"C:\Program Files\Blender Foundation\Blender*\blender.exe")
    return found[0] if found else shutil.which("blender")


def tidy_label(folder):
    """'Crystal-5dXobG8vsp' -> 'Crystal'; the part after the dash is a download id, not a name."""
    return re.sub(r"\s+", " ", re.sub(r"-[A-Za-z0-9]{10}$", "", folder)).strip(" -_") or folder


def safe_name(text):
    return re.sub(r"_+", "_", re.sub(r"[^A-Za-z0-9]+", "_", text)).strip("_") or "model"


def plan(root):
    jobs, labels = [], {}
    for pack in sorted(os.listdir(root)):
        pack_dir = os.path.join(root, pack)
        if not os.path.isdir(pack_dir): continue
        used = set()
        for dirpath, dirs, files in os.walk(pack_dir):
            dirs.sort()
            found = {}
            for fn in sorted(files):
                stem, ext = os.path.splitext(fn)
                ext = ext.lower()
                if ext in (".fbx", ".obj") and (stem.lower() not in found or ext == ".fbx"):
                    found[stem.lower()] = fn
            if not found: continue
            rel = os.path.relpath(dirpath, pack_dir)
            label = tidy_label(os.path.basename(dirpath)) if rel != "." else ""
            for fn in found.values():
                stem = os.path.splitext(fn)[0]
                # one model in the folder: the folder's name is the human one (some files are named with random letters)
                name = safe_name(label) if label and len(found) == 1 else safe_name(stem)
                out, n = name, 2
                while out.lower() in used:
                    out, n = f"{name}_{n}", n + 1
                used.add(out.lower())
                target = f"pack_{pack}/{out}.glb"
                jobs.append({"src": os.path.join(dirpath, fn), "out": target})
                labels[target] = label if label and len(found) == 1 else re.sub(r"_+", " ", safe_name(stem)).strip()
    os.makedirs(os.path.dirname(JOBS), exist_ok=True)
    with open(JOBS, "w", encoding="utf-8") as f:
        json.dump({"jobs": jobs}, f, indent=0)
    with open(LABELS, "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=0, sort_keys=True)
    print(len(jobs), "models to convert ->", JOBS)


def rigged_outputs():
    """converted models that have bones: the ones whose animation clips matter"""
    out = []
    for job in json.load(open(JOBS, encoding="utf-8"))["jobs"]:
        path = os.path.join(ASSETS, job["out"].replace("/", os.sep))
        if not os.path.exists(path): continue
        with open(path, "rb") as f:
            f.read(12)
            size = struct.unpack("<I", f.read(4))[0]
            f.read(4)
            if json.loads(f.read(size)).get("skins"): out.append(job["out"])
    return out


def run(workers=4, redo=None):
    blender = find_blender()
    if not blender: raise SystemExit("Blender not found: set the BLENDER environment variable to blender.exe")
    extra = []
    if redo is not None:
        extra = [JOBS + ".redo"]
        with open(extra[0], "w", encoding="utf-8") as f:
            json.dump(redo, f)
    procs = [subprocess.Popen([blender, "--background", "--factory-startup", "--python", WORKER, "--", JOBS, ASSETS, str(i), str(workers)] + extra,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for i in range(workers)]
    for p in procs: p.wait()
    jobs = json.load(open(JOBS, encoding="utf-8"))["jobs"]
    done = sum(os.path.exists(os.path.join(ASSETS, j["out"].replace("/", os.sep))) for j in jobs)
    print(f"{done} of {len(jobs)} converted")


if __name__ == "__main__":
    if sys.argv[1] == "plan": plan(sys.argv[2])
    elif sys.argv[1] == "run": run(int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    elif sys.argv[1] == "redo-rigged": run(int(sys.argv[2]) if len(sys.argv) > 2 else 4, rigged_outputs())
