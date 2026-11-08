"""sheet.py - reading the model sheets.

  python sheet.py <key> grid x0 y0 x1 y1 [zoom]   a crop of the sheet with a labelled pixel grid, to read positions from
  python sheet.py <key> rows x0 x1 [step]          the drawn outline's left and right edge on each row of one view
  python sheet.py <key> cols y0 y1 [step]          the top and bottom edge in each column
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def load(key):
    return np.asarray(Image.open(os.path.join(HERE, "ref", key + ".webp")).convert("RGB")).astype(np.int16)


def background(img):
    """the sheet's paper colour, from its border"""
    edge = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3)])
    return np.median(edge, 0)


def mask(img, x0=0, x1=None, y0=60, y1=680):
    """where the drawing is (filled), inside a box"""
    bg = background(img)
    d = np.abs(img - bg).sum(2)
    m = d > 40
    m = ndimage.binary_opening(m, structure=np.ones((4, 1)))        # drop the thin ruled guide lines
    sub = np.zeros_like(m)
    x1 = x1 or img.shape[1]
    sub[y0:y1, x0:x1] = m[y0:y1, x0:x1]
    sub = ndimage.binary_closing(sub, iterations=2)
    sub = ndimage.binary_fill_holes(sub)
    lab, n = ndimage.label(sub)
    if n == 0:
        return sub
    sizes = ndimage.sum(sub, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.nonzero(sizes > 400)[0])
    return keep


def grid(key, x0, y0, x1, y1, zoom=3):
    img = Image.open(os.path.join(HERE, "ref", key + ".webp")).convert("RGB").crop((x0, y0, x1, y1))
    img = img.resize(((x1 - x0) * zoom, (y1 - y0) * zoom), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    step = 10
    for x in range((x0 // step + 1) * step, x1, step):
        major = x % 50 == 0
        d.line([((x - x0) * zoom, 0), ((x - x0) * zoom, img.height)], fill=(255, 0, 0) if major else (255, 160, 160), width=1)
        if major:
            d.text(((x - x0) * zoom + 2, 2), str(x), fill=(200, 0, 0))
    for y in range((y0 // step + 1) * step, y1, step):
        major = y % 50 == 0
        d.line([(0, (y - y0) * zoom), (img.width, (y - y0) * zoom)], fill=(0, 0, 255) if major else (160, 160, 255), width=1)
        if major:
            d.text((2, (y - y0) * zoom + 2), str(y), fill=(0, 0, 200))
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f"grid_{key}_{x0}_{y0}.png")
    img.save(p)
    print(p)


def rows(key, x0, x1, step=10):
    m = mask(load(key), x0, x1)
    for y in range(60, 680, step):
        xs = np.nonzero(m[y])[0]
        if len(xs):
            runs = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
            print(y, " ".join(f"{r[0]}-{r[-1]}" for r in runs))


def cols(key, y0, y1, step=10, x0=0, x1=1376):
    m = mask(load(key), x0, x1, y0, y1)
    for x in range(x0, x1, step):
        ys = np.nonzero(m[:, x])[0]
        if len(ys):
            runs = np.split(ys, np.nonzero(np.diff(ys) > 1)[0] + 1)
            print(x, " ".join(f"{r[0]}-{r[-1]}" for r in runs))


if __name__ == "__main__":
    key, what = sys.argv[1], sys.argv[2]
    a = [int(v) for v in sys.argv[3:]]
    {"grid": grid, "rows": rows, "cols": cols}[what](key, *a)
