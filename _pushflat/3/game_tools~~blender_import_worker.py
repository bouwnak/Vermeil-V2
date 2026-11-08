"""Run by import_packs.py inside Blender (no window): converts its share of the jobs to .glb. Finished files are skipped, so it can be run again."""
import hashlib
import json
import os
import re
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
JOBS, ASSETS, ME, ALL = argv[0], argv[1], int(argv[2]), int(argv[3])
REDO = set(json.load(open(argv[4], encoding="utf-8"))) if len(argv) > 4 else None   # convert these again, even though they exist
LOG = os.path.join(os.path.dirname(JOBS), f"import_log_{ME}.txt")


def stack_names(src):
    """the FBX's real clip names. Blender's importer cuts names over 63 letters down to a hash, so the name of the clip
    is lost unless it's read from the file: {what Blender calls it: the whole name}"""
    if not src.lower().endswith(".fbx"): return {}
    with open(src, "rb") as f: data = f.read()
    out = {}
    for m in re.finditer(rb"([\x20-\x7e]{1,250})\x00\x01AnimStack", data):
        name = m.group(1)
        short = name[:55].decode("utf-8", "replace") + "_" + hashlib.sha1(name).hexdigest()[:7] if len(name) > 63 else name.decode("utf-8", "replace")
        out[short] = name.decode("utf-8", "replace")
    return out


def clip_name(action, stacks, used):
    """'CharacterArmature|CharacterArmature|Run' -> 'Run', and never the same name twice in one model"""
    whole = next((full for short, full in stacks.items() if action.endswith(short)), action)
    # some packs repeat it and cut it short: 'CharacterArmature|Death|CharacterArmature|Dea'. The first real word is the whole one
    parts = [p.strip() for p in whole.split("|") if p.strip() and "armature" not in p.lower()]
    base = parts[0] if parts else "Clip"
    name, n = base, 2
    while name in used:
        name, n = f"{base}_{n}", n + 1
    used.add(name)
    return name


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def convert(job):
    src, dst = job["src"], os.path.join(ASSETS, job["out"].replace("/", os.sep))
    clear()
    if src.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=src, use_anim=True, automatic_bone_orientation=True, ignore_leaf_bones=True)
    else:
        bpy.ops.wm.obj_import(filepath=src)
    objs = list(bpy.context.scene.objects)
    if not any(o.type == "MESH" for o in objs): return "error: no mesh"
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    if arm:                                       # every animation becomes a named clip
        ad = arm.animation_data_create()
        stacks, used = stack_names(src), set()
        for action in list(bpy.data.actions):
            track = ad.nla_tracks.new()
            track.name = clip_name(action.name, stacks, used)   # the exporter names each clip after its track: long names would merge into one
            track.strips.new(action.name, int(action.frame_range[0]), action)
        ad.action = None
    for mat in bpy.data.materials:                # FBX 'transparency' imports as alpha 0: invisible in the game, so make it solid
        if not (mat.use_nodes and mat.node_tree): continue
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED" and not n.inputs["Alpha"].is_linked: n.inputs["Alpha"].default_value = 1.0
        try: mat.blend_method = "OPAQUE"
        except Exception: pass
    for img in bpy.data.images:                   # huge pictures aren't needed on low-poly models
        if img.has_data and max(img.size) > 1024:
            k = 1024 / max(img.size)
            img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=not arm, export_animations=bool(arm),
                              export_animation_mode="NLA_TRACKS" if arm else "ACTIONS", export_yup=True, export_image_format="AUTO")
    return "ok"


def main():
    jobs = json.load(open(JOBS, encoding="utf-8"))["jobs"]
    with open(LOG, "a", encoding="utf-8") as log:
        for i, job in enumerate(jobs):
            if i % ALL != ME: continue
            if REDO is not None:
                if job["out"] not in REDO: continue
            elif os.path.exists(os.path.join(ASSETS, job["out"].replace("/", os.sep))): continue
            try:
                result = convert(job)
            except Exception as e:
                result = "error: " + str(e)[:300].replace("\n", " ")
            log.write(f"{job['out']}\t{result}\n")
            log.flush()


main()
