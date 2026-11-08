"""Run by find_duplicates.py inside Blender (no window): opens each model and writes down what it really looks like.
Size doesn't count (a model and its scaled copy are the same model); shape and colour do."""
import hashlib
import json
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
ASSETS, OUT, ME, ALL = argv[0], argv[1], int(argv[2]), int(argv[3])
GRID = 256                                        # positions are compared on a grid this fine, relative to the model's size


def material_colour(mat):
    """the material's flat colour, or None when a picture decides the colour"""
    if not mat: return (0.8, 0.8, 0.8)
    tree = mat.node_tree if getattr(mat, "use_nodes", False) else None
    if tree:
        for n in tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                socket = n.inputs["Base Color"]
                if socket.is_linked: return None
                return tuple(socket.default_value[:3])
    return tuple(mat.diffuse_color[:3])


def material_image(mat):
    """the picture that gives the colour. A picture only counts as loaded once it has been read, so has_data can't be asked first."""
    tree = mat.node_tree if mat and getattr(mat, "use_nodes", False) else None
    if not tree: return None
    for n in tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            todo, seen = [n.inputs["Base Color"]], set()
            while todo:
                for link in todo.pop().links:
                    up = link.from_node
                    if up.name in seen: continue
                    seen.add(up.name)
                    if up.type == "TEX_IMAGE" and up.image and up.image.size[0]: return up.image
                    todo += list(up.inputs)
    for n in tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.size[0]: return n.image
    return None


PIXELS = {}


def pixels_of(img):
    got = PIXELS.get(img.name)
    if got is None:
        w, h = img.size
        px = np.empty(w * h * img.channels, dtype=np.float32)   # each picture is read once, and not into a Python list: some are 4096 wide
        img.pixels.foreach_get(px)
        got = PIXELS[img.name] = (w, h, img.channels, px)
    return got


def scan(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    PIXELS.clear()
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    pts, tris, colour_sum, colour_n = set(), 0, [0.0, 0.0, 0.0], 0
    uv_sum, uv_n, biggest = [0.0, 0.0], 0, {}
    raw = []
    meshes = 0
    surf_area, surf_centre, surf_normal, vertex_colour = 0.0, np.zeros(3), np.zeros(3), []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.data.vertices: continue
        meshes += 1
        m = o.data                                # the rest pose: an animated copy of the same model counts as the same shape
        world = o.matrix_world if not o.find_armature() else None
        for v in m.vertices:
            p = (world @ v.co) if world else v.co
            raw.append((p.x, p.y, p.z))
        m.calc_loop_triangles()
        tris += len(m.loop_triangles)
        # the faces, not only the corners: an inner and an outer corner piece can share every point
        co = np.empty(len(m.vertices) * 3, dtype=np.float64)
        m.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        if world:
            mw = np.array(world)
            co = co @ mw[:3, :3].T + mw[:3, 3]
        idx = np.empty(len(m.loop_triangles) * 3, dtype=np.int64)
        m.loop_triangles.foreach_get("vertices", idx)
        corners = co[idx.reshape(-1, 3)]
        cross = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0]) * 0.5
        areas = np.linalg.norm(cross, axis=1)
        surf_area += float(areas.sum())
        surf_centre += (corners.mean(axis=1) * areas[:, None]).sum(axis=0)
        surf_normal += cross.sum(axis=0)
        if m.color_attributes:
            ca = m.color_attributes[0]
            vc = np.empty(len(ca.data) * 4, dtype=np.float32)
            ca.data.foreach_get("color", vc)
            if len(vc): vertex_colour.append([float(x) for x in vc.reshape(-1, 4)[:, :3].mean(axis=0)])
        uv = m.uv_layers.active.data if m.uv_layers.active else None
        step = max(1, len(m.loop_triangles) // 400)  # a sample is enough to tell colours apart
        for ti in range(0, len(m.loop_triangles), step):   # Blender's collections can't be sliced with a step
            t = m.loop_triangles[ti]
            mat = m.materials[t.material_index] if t.material_index < len(m.materials) else None
            col = material_colour(mat)
            if col is None:
                img = material_image(mat)
                if img: biggest[img.name] = biggest.get(img.name, 0) + 1
                if img and uv:
                    w, h, ch, px = pixels_of(img)
                    u = sum(uv[l].uv[0] for l in t.loops) / 3   # the middle of the triangle: its corners can sit on the edge of an atlas square
                    v = sum(uv[l].uv[1] for l in t.loops) / 3
                    uv_sum[0] += u % 1; uv_sum[1] += v % 1; uv_n += 1
                    i = (int((v % 1) * h) % h) * w + (int((u % 1) * w) % w)
                    k = i * ch
                    col = [float(c) for c in px[k:k + 3]] if k + 3 <= len(px) else (0.5, 0.5, 0.5)
                else:
                    col = (0.5, 0.5, 0.5)
            colour_sum[0] += col[0]; colour_sum[1] += col[1]; colour_sum[2] += col[2]
            colour_n += 1
    if not raw: return {"empty": True}
    lo = [min(p[i] for p in raw) for i in range(3)]
    hi = [max(p[i] for p in raw) for i in range(3)]
    size = max(hi[i] - lo[i] for i in range(3)) or 1.0
    for p in raw:
        pts.add(tuple(int(round((p[i] - lo[i]) / size * GRID)) for i in range(3)))
    tex = None
    if biggest:                                   # a small copy of the main picture, so two models with different pictures stay different
        w, h, ch, px = pixels_of(bpy.data.images[max(biggest, key=biggest.get)])
        tex = []
        for gy in range(8):
            for gx in range(8):
                k = (int((gy + 0.5) / 8 * h) * w + int((gx + 0.5) / 8 * w)) * ch
                tex += [round(float(c), 2) for c in px[k:k + 3]]
    uniq = sorted(pts)
    n = len(uniq)
    mean = [sum(p[i] for p in uniq) / n for i in range(3)]
    spread = [sum((p[i] - mean[i]) ** 2 for p in uniq) / n for i in range(3)]
    return {
        "tris": tris, "points": n, "meshes": meshes,
        "shape": hashlib.md5(json.dumps(uniq, separators=(",", ":")).encode()).hexdigest()[:16],
        "aspect": [round((hi[i] - lo[i]) / size, 3) for i in range(3)],
        "mean": [round(x, 1) for x in mean], "spread": [round(x, 0) for x in spread],
        "colour": [round(c / max(colour_n, 1), 3) for c in colour_sum],
        "size": [round(hi[i] - lo[i], 4) for i in range(3)],
        "uv": [round(c / uv_n, 3) for c in uv_sum] if uv_n else None, "tex": tex,
        "surf": [round(surf_area / size ** 2, 3)] + [round(float(c), 3) for c in (surf_centre / max(surf_area, 1e-9) - np.array(lo)) / size]
                + [round(float(c), 3) for c in surf_normal / max(surf_area, 1e-9)],
        "vc": [round(sum(c[i] for c in vertex_colour) / len(vertex_colour), 3) for i in range(3)] if vertex_colour else None,
    }


def main():
    files = []
    for d, dirs, names in os.walk(ASSETS):
        dirs.sort()
        files += [os.path.join(d, n) for n in sorted(names) if n.lower().endswith((".glb", ".gltf"))]
    done = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for line in f:
                try: r = json.loads(line)
                except ValueError: continue
                if "file" in r and "error" not in r: done[r["file"]] = True   # one that failed is tried again
    with open(OUT, "a", encoding="utf-8") as log:
        for i, p in enumerate(files):
            if i % ALL != ME: continue
            rel = os.path.relpath(p, ASSETS).replace("\\", "/")
            if rel in done: continue
            try:
                row = scan(p)
            except Exception as e:
                row = {"error": str(e)[:200].replace("\n", " ")}
            row["file"] = rel
            log.write(json.dumps(row) + "\n")
            log.flush()


main()
