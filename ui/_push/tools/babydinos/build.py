"""build.py - make one baby dinosaur from its recipe and draw it beside its sheet.

  python build.py brachipup [voxel] [crop x0 y0 x1 y1 zoom]
"""
import importlib
import math
import os
import sys
import time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "species"))
import dinokit as K
import render


def make(key, h=0.022):
    spec = importlib.import_module(key)
    m = spec.build()
    m.ink_groups = getattr(spec, "INK", dict(spike=1, nail=2, mouth=3, tongue=3, socket=4, horn=5, crystal=6, plate=7))
    m.finish()
    m.cut("ground", K.ground_cut(), k=0.0, mat="sole")
    t = time.time()
    V, F, N = m.mesh(h)
    col, mat, region = K.colorize(m, V, N, h)
    # the lips: a dark smile line where the outside skin meets the mouth gap
    if "mouth" in m.cut_dist:
        lip = (m.cut_dist["mouth"] < 0.013) & ~m.on_cut["mouth"]
        col[lip] = m.colors.get("lip", np.array([0.15, 0.12, 0.1]))
    print(f"{key}: {len(V)} verts, {len(F)} tris, {time.time() - t:.1f}s")
    return spec, m, V, F, N, col, region


def close_jaw(m, V, amount=1.0):
    """turn the lower jaw up round its hinge so the lips meet (the rest pose)"""
    if not m.jaw:
        return V
    hz, hy = m.jaw["hinge"][2], m.jaw["hinge"][1]
    a = math.radians(m.jaw["angle"]) * amount
    below = V[:, 1] < m.jaw["ymouth"](V[:, 2], V[:, 0]) if "ymouth" in m.jaw else V[:, 1] < hy
    w = K.smooth(hz - 0.12, hz + 0.08, V[:, 2]) * below * (V[:, 1] > hy - 0.7) * (np.abs(V[:, 0]) < 0.8)
    c, s = math.cos(a), math.sin(a)
    y, z = V[:, 1] - hy, V[:, 2] - hz
    ry, rz = c * y + s * z, -s * y + c * z          # turn the front up
    out = V.copy()
    out[:, 1] = hy + y + (ry - y) * w
    out[:, 2] = hz + z + (rz - z) * w
    return out


def scene(key, h):
    spec, m, V, F, N, col, region = make(key, h)
    V = close_jaw(m, V)
    Vs, Fs, Ns, Cs, Rs = [V], [F], [N], [col], [region]
    off = len(V)
    for e in getattr(m, "eyes", []):
        v, f, n, c = K.eyeball(e, h)
        Vs.append(v); Fs.append(f + off); Ns.append(n); Cs.append(c); Rs.append(np.full(len(v), 9.0))
        off += len(v)
    return spec, m, np.concatenate(Vs), np.concatenate(Fs), np.concatenate(Ns), np.concatenate(Cs), np.concatenate(Rs)


if __name__ == "__main__":
    key = sys.argv[1]
    h = float(sys.argv[2]) if len(sys.argv) > 2 else 0.022
    spec, m, V, F, N, C, R = scene(key, h)
    crop, zoom = None, 1
    if len(sys.argv) > 3:
        crop = [int(v) for v in sys.argv[3:7]]
        zoom = float(sys.argv[7]) if len(sys.argv) > 7 else 1
    t = time.time()
    tag = "" if not crop else "_%d_%d" % tuple(crop[:2])
    p = render.compare(key, V, F, N, C, spec.VIEWS, os.path.join(HERE, "out", f"cmp_{key}{tag}.png"), region=R, crop=crop, zoom=zoom)
    print(p, f"{time.time() - t:.1f}s")
