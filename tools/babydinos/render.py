"""render.py - draws a model the way the sheets are drawn (flat colour, soft light, dark ink outline), in numpy,
and lays it under the reference sheet with each one's outline traced over the other, so the two can be compared."""
import math
import os
import numpy as np
from PIL import Image
from scipy import ndimage

import sheet


def camera(yaw, pitch=0.0):
    t, p = math.radians(yaw), math.radians(pitch)
    d = np.array([math.sin(t) * math.cos(p), math.sin(p), math.cos(t) * math.cos(p)])
    r = np.array([math.cos(t), 0.0, -math.sin(t)])
    u = np.cross(d, r)
    return d, r, u


def raster(verts, tris, attrs, view, W, H):
    """z-buffered triangles. view = dict(yaw, pitch, s, cx, gy). attrs: (N, k) per-vertex values, interpolated.
    Returns (depth, attr image, triangle id)."""
    d, r, u = camera(view["yaw"], view.get("pitch", 0.0))
    s = view["s"]
    sx = view["cx"] + s * (verts @ r)
    sy = view["gy"] - s * (verts @ u)
    z = verts @ d
    A, B, C = tris[:, 0], tris[:, 1], tris[:, 2]
    x0, y0, x1, y1, x2, y2 = sx[A], sy[A], sx[B], sy[B], sx[C], sy[C]
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    keep = np.abs(area) > 1e-9
    zbuf = np.full(H * W, -np.inf)
    out = np.zeros((H * W, attrs.shape[1]))
    tid = np.full(H * W, -1)
    bx0 = np.floor(np.minimum(np.minimum(x0, x1), x2)).astype(int)
    by0 = np.floor(np.minimum(np.minimum(y0, y1), y2)).astype(int)
    bw = np.ceil(np.maximum(np.maximum(x0, x1), x2)).astype(int) - bx0 + 1
    bh = np.ceil(np.maximum(np.maximum(y0, y1), y2)).astype(int) - by0 + 1
    size = np.maximum(bw, bh)
    cand_pix, cand_z, cand_t, cand_w = [], [], [], []
    for lo, hi in ((0, 4), (4, 8), (8, 16), (16, 48), (48, 400)):
        sel = np.nonzero(keep & (size > lo) & (size <= hi))[0]
        if not len(sel):
            continue
        g = np.arange(hi)
        gx, gy = np.meshgrid(g, g, indexing="xy")
        gx, gy = gx.ravel(), gy.ravel()
        for chunk in np.array_split(sel, max(1, len(sel) * hi * hi // 4_000_000 + 1)):
            px = bx0[chunk, None] + gx[None]
            py = by0[chunk, None] + gy[None]
            cxp, cyp = px + 0.5, py + 0.5
            ar = area[chunk, None]
            w0 = ((x1[chunk, None] - cxp) * (y2[chunk, None] - cyp) - (x2[chunk, None] - cxp) * (y1[chunk, None] - cyp)) / ar
            w1 = ((x2[chunk, None] - cxp) * (y0[chunk, None] - cyp) - (x0[chunk, None] - cxp) * (y2[chunk, None] - cyp)) / ar
            w2 = 1 - w0 - w1
            ins = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6) & (px >= 0) & (px < W) & (py >= 0) & (py < H)
            if not ins.any():
                continue
            ti = np.broadcast_to(chunk[:, None], px.shape)[ins]
            W0, W1, W2 = w0[ins], w1[ins], w2[ins]
            cand_pix.append(py[ins] * W + px[ins])
            cand_z.append(W0 * z[A[ti]] + W1 * z[B[ti]] + W2 * z[C[ti]])
            cand_t.append(ti)
            cand_w.append(np.stack([W0, W1, W2], 1))
    if not cand_pix:
        return zbuf.reshape(H, W), out.reshape(H, W, -1), tid.reshape(H, W)
    pix = np.concatenate(cand_pix)
    zz = np.concatenate(cand_z)
    tt = np.concatenate(cand_t)
    ww = np.concatenate(cand_w)
    order = np.argsort(zz, kind="stable")              # far first, so the nearest is written last
    pix, zz, tt, ww = pix[order], zz[order], tt[order], ww[order]
    zbuf[pix] = zz
    tid[pix] = tt
    # the winner at each pixel is the last write; read back which candidate that was
    win = np.zeros(H * W, dtype=np.int64) - 1
    win[pix] = np.arange(len(pix))
    got = win >= 0
    wi = win[got]
    t = tt[wi]
    bw_ = ww[wi]
    out[got] = bw_[:, 0:1] * attrs[A[t]] + bw_[:, 1:2] * attrs[B[t]] + bw_[:, 2:3] * attrs[C[t]]
    return zbuf.reshape(H, W), out.reshape(H, W, -1), tid.reshape(H, W)


INK = np.array([0.16, 0.12, 0.11])


def shade(verts, tris, normals, colors, view, W, H, bg, ink_w=2, region=None):
    """flat paint with a soft key light and an inked outline (outer edge and folds)"""
    region = np.zeros(len(verts)) if region is None else region
    attrs = np.concatenate([colors, normals, region[:, None]], 1)
    zb, im, tid = raster(verts, tris, attrs, view, W, H)
    have = np.isfinite(zb)
    col = im[..., :3]
    n = im[..., 3:6]
    n = n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-9)
    d, r, u = camera(view["yaw"], view.get("pitch", 0.0))
    key = -0.55 * r + 0.65 * u + 0.52 * d
    key /= np.linalg.norm(key)
    lam = (n @ key)
    light = 0.80 + 0.26 * np.clip(lam * 1.6, -1, 1)              # soft, wide falloff as in the sheets
    rim = np.clip(1 - (n @ d), 0, 1) ** 3 * 0.10
    img = np.clip(col * light[..., None] + rim[..., None], 0, 1)
    # ink: where depth jumps (outer edge, overlapping parts) or the painted region changes
    zf = np.where(have, zb, -50.0)
    jump = np.zeros_like(have)
    s = view["s"]
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = zf
        b = np.roll(np.roll(zf, -dy, 0), -dx, 1)
        dz = np.abs(a - b) * s                               # in pixels
        jump |= dz > 6.0
    rg = im[..., 6]
    rgj = np.zeros_like(have)
    for dy, dx in ((0, 1), (1, 0)):
        rgj |= (np.abs(rg - np.roll(np.roll(rg, -dy, 0), -dx, 1)) > 0.5) & have & np.roll(np.roll(have, -dy, 0), -dx, 1)
    line = ndimage.binary_dilation(jump & (have | np.roll(have, 1, 0) | np.roll(have, 1, 1)), iterations=max(ink_w - 1, 0)) | rgj
    out = np.where(have[..., None], img, bg / 255.0)
    out = np.where(line[..., None] & ndimage.binary_dilation(have, iterations=ink_w)[..., None], INK, out)
    return (out * 255).astype(np.uint8), have


def contour(m, width=1):
    return m & ~ndimage.binary_erosion(m, iterations=width)


def compare(key, verts, tris, normals, colors, views, out_path, region=None, crop=None, zoom=1):
    ref = sheet.load(key).astype(np.uint8)
    H, W = ref.shape[:2]
    bg = sheet.background(ref)
    canvas = np.zeros((H, W, 3), np.uint8) + bg.astype(np.uint8)
    mine = np.zeros((H, W), bool)
    for v in views:
        img, have = shade(verts, tris, normals, colors, v, W, H, bg, region=region)
        canvas = np.where(have[..., None] | (np.abs(img.astype(int) - bg).sum(2) > 30)[..., None], img, canvas)
        mine |= have
    rmask = sheet.mask(sheet.load(key), 0, W, 95, 670)
    top = ref.copy()
    top[contour(mine)] = (30, 90, 255)
    bot = canvas.copy()
    bot[contour(rmask, 2)] = (255, 40, 40)
    if crop:
        x0, y0, x1, y1 = crop
        top, bot = top[y0:y1, x0:x1], bot[y0:y1, x0:x1]
    full = np.concatenate([top, bot], 0)
    im = Image.fromarray(full)
    if zoom != 1:
        im = im.resize((int(im.width * zoom), int(im.height * zoom)), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path)
    return out_path
