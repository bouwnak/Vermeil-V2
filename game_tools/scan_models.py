"""Open every model of the general asset pack in Blender (no window) and write down what it looks like.

  python game_tools/scan_models.py [workers=4]   -> data/game/model_scan.jsonl (safe to stop: run it again to continue)

Then  python game_tools/find_duplicates.py  compares them.
"""
import json
import os
import subprocess
import sys

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_packs import ASSETS, find_blender  # noqa: E402

OUT = os.path.join(PROJECT, "data", "game", "model_scan.jsonl")
WORKER = os.path.join(PROJECT, "game_tools", "blender_scan_worker.py")


def main(workers=4):
    blender = find_blender()
    if not blender: raise SystemExit("Blender not found: set the BLENDER environment variable to blender.exe")
    procs = [subprocess.Popen([blender, "--background", "--factory-startup", "--python", WORKER, "--", ASSETS, f"{OUT}.{i}", str(i), str(workers)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for i in range(workers)]
    for p in procs: p.wait()
    rows = {}                                     # the newest line for a model wins: a retry replaces its earlier failure
    for i in range(workers):
        part = f"{OUT}.{i}"
        if not os.path.exists(part): continue
        with open(part, encoding="utf-8") as f:
            for line in f:
                try: r = json.loads(line)
                except ValueError: continue
                if "file" in r and (r["file"] not in rows or "error" not in r): rows[r["file"]] = line
    with open(OUT, "w", encoding="utf-8") as out:
        out.writelines(rows.values())
    print(len(rows), "models scanned ->", OUT)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)
