"""dinokit.py - the toolkit the baby dinosaurs are built with.

A dinosaur is a list of soft shapes (signed distance fields) blended into each other, the way clay is pressed together.
Every shape says what it is made of (hide, spike, claw, horn...) and which bones carry it. The kit turns the shapes into
one smooth closed skin (surface nets on a grid, then pulled exactly onto the surface), paints it, and works out how
strongly each bone moves each point of it. Coordinates are the game's: x to the animal's left, y up, z forward.
Plain numpy, so it runs in Blender's Python and in ordinary Python alike.
"""
import math
import numpy as np

V = np.asarray


def vec(*a):
    return np.asarray(a if len(a) > 1 else a[0], dtype=np.float64)


def norm(v):
    v = np.asarray(v, dtype=np.float64)
    return v / max(np.linalg.norm(v), 1e-12)


def rot_xyz(rx=0.0, ry=0.0, rz=0.0):
    """rotation matrix (degrees), applied x then y then z"""
    a, b, c = (math.radians(t) for t in (rx, ry, rz))
    X = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Y = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Z = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Z @ Y @ X


def frame(fwd, up=(0, 1, 0)):
    """a rotation whose local z points along fwd and local y as close to up as it can"""
    z = norm(fwd)
    x = np.cross(V(up, dtype=float), z)
    if np.linalg.norm(x) < 1e-6:
        x = np.cross(V((1.0, 0, 0)), z)
    x = norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], 1)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def _len(v):
    return np.sqrt(np.einsum("...i,...i->...", v, v))


# ------------------------------------------------------------------ shapes
class Shape:
    """a distance function and the box it lives in"""
    def __init__(self, fn, lo, hi):
        self.fn, self.lo, self.hi = fn, np.asarray(lo, float), np.asarray(hi, float)

    def __call__(self, P):
        return self.fn(P)


def sphere(c, r):
    c = vec(c)
    return Shape(lambda P: _len(P - c) - r, c - r, c + r)


def ellipsoid(c, r, R=None):
    """r: the three radii (local x, y, z); R: its rotation"""
    c, r = vec(c), vec(r)
    R = np.eye(3) if R is None else np.asarray(R, float)

    def fn(P):
        q = (P - c) @ R
        k0 = _len(q / r)
        k1 = _len(q / (r * r))
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    ext = np.abs(R) @ r
    return Shape(fn, c - ext, c + ext)


def round_cone(a, b, ra, rb):
    """a rounded cone from a (radius ra) to b (radius rb): limbs, necks, tails, horns, spikes"""
    a, b = vec(a), vec(b)
    ba = b - a
    l2 = float(ba @ ba)
    if l2 < 1e-12:
        return sphere(a, max(ra, rb))
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def fn(P):
        pa = P - a
        y = pa @ ba
        z = y - l2
        q = pa * l2 - np.outer(y, ba) if pa.ndim == 2 else pa * l2 - y[..., None] * ba
        x2 = np.einsum("...i,...i->...", q, q)
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1, rr) * rr * rr * x2 if rr != 0 else np.zeros_like(x2)
        out = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - ra
        m1 = np.sign(y) * a2 * y2 < k
        out = np.where(m1, np.sqrt(x2 + y2) * il2 - ra, out)
        m2 = np.sign(z) * a2 * z2 > k
        out = np.where(m2, np.sqrt(x2 + z2) * il2 - rb, out)
        return out
    m = max(ra, rb)
    return Shape(fn, np.minimum(a - ra, b - rb), np.maximum(a + ra, b + rb)) if m else None


def chain(points, radii, k=0.0):
    """round cones end to end through points: a neck, a tail, a leg"""
    parts = [round_cone(points[i], points[i + 1], radii[i], radii[i + 1]) for i in range(len(points) - 1)]
    return union(parts, k)


def union(shapes, k=0.0):
    shapes = [s for s in shapes if s is not None]

    def fn(P):
        d = shapes[0](P)
        for s in shapes[1:]:
            d = smin(d, s(P), k)
        return d
    return Shape(fn, np.min([s.lo for s in shapes], 0), np.max([s.hi for s in shapes], 0))


def rbox(c, half, rad=0.0, R=None):
    c, half = vec(c), vec(half)
    R = np.eye(3) if R is None else np.asarray(R, float)

    def fn(P):
        q = np.abs((P - c) @ R) - (half - rad)
        return _len(np.maximum(q, 0)) + np.minimum(np.max(q, -1), 0) - rad
    ext = np.abs(R) @ half
    return Shape(fn, c - ext, c + ext)


def torus(c, big, small, R=None):
    """a ring lying in its local x-z plane"""
    c = vec(c)
    R = np.eye(3) if R is None else np.asarray(R, float)

    def fn(P):
        q = (P - c) @ R
        return np.sqrt((np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) - big) ** 2 + q[:, 1] ** 2) - small
    ext = np.abs(R) @ vec(big + small, small, big + small)
    return Shape(fn, c - ext, c + ext)


def poly2d(pts):
    """distance to a closed 2-d outline (negative inside), for sails, frills and wing membranes"""
    pts = np.asarray(pts, float)

    def fn(uv):
        d = np.full(len(uv), np.inf)
        s = np.ones(len(uv))
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[i - 1]
            e = b - a
            w = uv - a
            t = np.clip((w @ e) / (e @ e), 0, 1)
            q = w - np.outer(t, e)
            d = np.minimum(d, np.einsum("ij,ij->i", q, q))
            c1 = uv[:, 1] >= a[1]
            c2 = uv[:, 1] < b[1]
            c3 = e[0] * w[:, 1] > e[1] * w[:, 0]
            flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
            s = np.where(flip, -s, s)
        return s * np.sqrt(d)
    return fn


def slab(c, R, outline, thick, round_=0.0):
    """a flat shape: a 2-d outline in the local x-y plane, thick along local z, rounded at the edges"""
    c = vec(c)
    R = np.asarray(R, float)
    f2 = poly2d(outline)
    pts = np.asarray(outline, float)

    def fn(P):
        q = (P - c) @ R
        d2 = f2(q[:, :2])
        w = np.abs(q[:, 2]) - (thick - round_)
        return np.minimum(np.maximum(d2 + round_, w), 0) + _len(np.stack([np.maximum(d2 + round_, 0), np.maximum(w, 0)], 1)) - round_
    lo2, hi2 = pts.min(0), pts.max(0)
    corners = np.array([[x, y, z] for x in (lo2[0], hi2[0]) for y in (lo2[1], hi2[1]) for z in (-thick, thick)])
    w = corners @ R.T + c
    return Shape(fn, w.min(0), w.max(0))


def halfspace(point, normal):
    """everything on the side the normal points away from is solid"""
    p0, n = vec(point), norm(normal)
    return Shape(lambda P: (P - p0) @ n, vec(-9, -9, -9), vec(9, 9, 9))


def intersect(a, b, k=0.0):
    return Shape(lambda P: smax(a(P), b(P), k), np.maximum(a.lo, b.lo), np.minimum(a.hi, b.hi))


def shell(a, t):
    """a skin of thickness t around a shape (for straps that hug the body)"""
    return Shape(lambda P: np.abs(a(P)) - t, a.lo - t, a.hi + t)


def warp(shape, fn_warp, pad=0.1):
    """bend space before measuring: shape(fn_warp(P))"""
    return Shape(lambda P: shape(fn_warp(P)), shape.lo - pad, shape.hi + pad)


def mirror_x(make):
    """make(sign) for the animal's left (+1) and right (-1)"""
    return [make(1.0), make(-1.0)]


# ------------------------------------------------------------------ a model
class Part:
    def __init__(self, name, shape, mat, bones, k, op, weight_group=None):
        self.name, self.shape, self.mat, self.bones, self.k, self.op = name, shape, mat, list(bones), k, op
        self.group = weight_group


class Model:
    """the recipe of one dinosaur"""
    def __init__(self, key, height):
        self.key, self.height = key, height
        self.parts, self.bones, self.anchors, self.painters = [], {}, {}, []
        self.colors = {}
        self.spine = None        # [(point, ventral direction)] from the tail tip to the head: where the belly is
        self.jaw = None          # how the mouth splits the head from the jaw
        self.rigid = []          # extra meshes made separately (crystals and so on)

    # shapes -----------------------------------------------------------
    def add(self, name, shape, mat="hide", bones=(), k=0.04, group=None):
        if shape is not None:
            self.parts.append(Part(name, shape, mat, bones, k, "u", group))
        return shape

    def cut(self, name, shape, k=0.01, mat="mouth", bones=()):
        self.parts.append(Part(name, shape, mat, bones, k, "s"))
        return shape

    def bone(self, name, head, tail, parent=None):
        self.bones[name] = (vec(head), vec(tail), parent)

    def anchor(self, name, pos, fwd=(0, 0, 1), up=(0, 1, 0), scale=1.0, bone=None):
        self.anchors[name] = dict(pos=vec(pos), fwd=norm(fwd), up=norm(up), scale=scale, bone=bone)

    def eye(self, side, pos, fwd, radii, socket=0.02, protrude=0.55, bone="head", at=False):
        """an eye: centred at pos (at=True), or placed where a ray from pos along fwd leaves the head, sunk so
        a little more than half shows"""
        self.eyes = getattr(self, "eyes", [])
        e = dict(side=side, pos=vec(pos), fwd=norm(fwd), radii=vec(radii), socket=socket, protrude=protrude, bone=bone)
        if at:
            e["centre"], e["R"] = vec(pos), frame(norm(fwd), (0, 1, 0))
            self.cut(f"socket{side:+.0f}", ellipsoid(e["centre"], e["radii"] + socket, e["R"]), k=0.015, mat="socket")
        self.eyes.append(e)

    def paint(self, mat, where, soft=0.0, mats=None, parts=None):
        """colour the skin with mat wherever `where` (a Shape or f(P) -> signed value) is below zero"""
        self.painters.append(dict(kind="where", mat=mat, fn=where, soft=soft, mats=mats, parts=parts))

    def band(self, mat, centre, vent, cos, soft=0.06, mats=None, parts=None):
        """colour the side of a body that faces `vent` (the belly side), measured round a centre line"""
        self.painters.append(dict(kind="band", mat=mat, centre=np.asarray(centre, float), vent=np.array([norm(v) for v in vent]),
                                  cos=np.asarray(cos, float), soft=soft, mats=mats, parts=parts))

    def finish(self):
        """settle anything that depends on the finished shape (eye sockets)"""
        for e in getattr(self, "eyes", []):
            if "centre" in e:
                continue
            p, f = e["pos"].copy(), e["fwd"]
            sign = 1.0 if self.field_at(p[None])[0] <= 0 else -1.0     # inside: walk out; outside: walk in
            for _ in range(600):
                q = p + f * 0.005 * sign
                if (self.field_at(q[None])[0] > 0) != (sign < 0):
                    break
                p = q
            R = frame(f, (0, 1, 0))
            c = p - f * e["radii"][2] * (1 - e["protrude"])
            e["centre"], e["R"] = c, R
            self.cut(f"socket{e['side']:+.0f}", ellipsoid(c, e["radii"] + e["socket"], R), k=0.015, mat="socket")

    # the field ---------------------------------------------------------
    def bounds(self):
        lo = np.min([p.shape.lo - p.k for p in self.parts if p.op == "u"], 0)
        hi = np.max([p.shape.hi + p.k for p in self.parts if p.op == "u"], 0)
        return lo, hi

    def field_at(self, P):
        d = np.full(len(P), 1.0)
        for p in self.parts:
            inside = np.all((P >= p.shape.lo - p.k - 1e-6) & (P <= p.shape.hi + p.k + 1e-6), 1)
            if not inside.any():
                continue
            v = p.shape(P[inside])
            d[inside] = smin(d[inside], v, p.k) if p.op == "u" else smax(d[inside], -v, p.k)
        return d

    def grid(self, h):
        lo, hi = self.bounds()
        lo = lo - 3 * h
        hi = hi + 3 * h
        n = np.ceil((hi - lo) / h).astype(int) + 1
        F = np.full(tuple(n), 1.0, dtype=np.float32)
        for p in self.parts:
            a = np.clip(np.floor((p.shape.lo - p.k - lo) / h).astype(int) - 1, 0, n - 1)
            b = np.clip(np.ceil((p.shape.hi + p.k - lo) / h).astype(int) + 2, 0, n)
            if np.any(b <= a):
                continue
            xs = lo[0] + h * np.arange(a[0], b[0])
            ys = lo[1] + h * np.arange(a[1], b[1])
            zs = lo[2] + h * np.arange(a[2], b[2])
            X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
            P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
            sub = F[a[0]:b[0], a[1]:b[1], a[2]:b[2]]
            v = p.shape(P).reshape(sub.shape)
            F[a[0]:b[0], a[1]:b[1], a[2]:b[2]] = smin(sub, v, p.k) if p.op == "u" else smax(sub, -v, p.k)
        return F, lo, h

    def mesh(self, h, refine=3):
        F, lo, h = self.grid(h)
        verts, faces = surface_nets(F, lo, h)
        for _ in range(refine):                           # pull every point exactly onto the surface
            d, g = sample(F, lo, h, verts)
            gl = np.maximum((g * g).sum(1), 1e-12)
            verts = verts - (d / gl)[:, None] * g
        _, g = sample(F, lo, h, verts)
        normals = g / np.maximum(_len(g), 1e-12)[:, None]
        return verts, faces, normals

    # which shape each point belongs to ------------------------------------
    def distances(self, P):
        """distance from each point to every additive shape: (N, parts)"""
        out = np.full((len(P), len(self.parts)), 9.0)
        for i, p in enumerate(self.parts):
            inside = np.all((P >= p.shape.lo - 0.25) & (P <= p.shape.hi + 0.25), 1)
            if inside.any():
                out[inside, i] = p.shape(P[inside])
            if p.op == "s":
                out[:, i] = np.abs(out[:, i])
        return out


# ------------------------------------------------------------------ meshing
def surface_nets(F, lo, h):
    s = F < 0
    nx, ny, nz = F.shape
    cell = np.zeros((nx - 1, ny - 1, nz - 1), dtype=np.uint8)
    bit = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                cell |= s[dx:nx - 1 + dx, dy:ny - 1 + dy, dz:nz - 1 + dz].astype(np.uint8) << bit
                bit += 1
    active = (cell != 0) & (cell != 255)
    idx = np.full(cell.shape, -1, dtype=np.int64)
    n = int(active.sum())
    idx[active] = np.arange(n)
    acc = np.zeros((n, 3))
    cnt = np.zeros(n)
    cs = np.array(cell.shape)
    faces = []
    for axis in range(3):
        sl0 = [slice(None)] * 3
        sl1 = [slice(None)] * 3
        sl0[axis] = slice(0, -1)
        sl1[axis] = slice(1, None)
        e = s[tuple(sl0)] != s[tuple(sl1)]
        I = np.nonzero(e)
        f0 = F[tuple(sl0)][e].astype(np.float64)
        f1 = F[tuple(sl1)][e].astype(np.float64)
        t = f0 / (f0 - f1)
        pos = np.stack(I, 1).astype(np.float64)
        pos[:, axis] += t
        pos = lo + pos * h
        inside_low = s[tuple(sl0)][e]
        o1, o2 = [a for a in range(3) if a != axis]
        corners = []
        for d1 in (0, 1):
            for d2 in (0, 1):
                c = np.stack(I, 1).copy()
                c[:, o1] -= d1
                c[:, o2] -= d2
                corners.append(c)
        for c in corners:
            ok = np.all((c >= 0) & (c < cs), 1)
            ci = idx[c[ok, 0], c[ok, 1], c[ok, 2]]
            good = ci >= 0
            np.add.at(acc, ci[good], pos[ok][good])
            np.add.at(cnt, ci[good], 1)
        # a quad round each crossing edge, from the four cells that share it
        c00, c01, c10, c11 = corners          # (d1,d2) = (0,0),(0,1),(1,0),(1,1)
        ok = np.all([(c >= 0).all(1) & (c < cs).all(1) for c in corners], 0)
        q = np.stack([idx[c[ok, 0], c[ok, 1], c[ok, 2]] for c in (c11, c01, c00, c10)], 1)
        good = (q >= 0).all(1)
        q = q[good]
        flip = inside_low[ok][good]
        q[flip] = q[flip][:, ::-1]
        if axis == 1:                           # keep the winding the same on every axis
            q = q[:, ::-1]
        faces.append(q)
    verts = acc / np.maximum(cnt, 1)[:, None]
    faces = np.concatenate(faces)
    tris = np.concatenate([faces[:, [0, 1, 2]], faces[:, [0, 2, 3]]])
    # outward winding: check against the field's slope and turn round any that face in
    d, g = sample(F, lo, h, verts[tris].mean(1))
    nrm = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
    bad = (nrm * g).sum(1) < 0
    tris[bad] = tris[bad][:, ::-1]
    return verts, tris


def sample(F, lo, h, P):
    """the field and its slope at points, by trilinear interpolation"""
    n = np.array(F.shape)
    q = (P - lo) / h
    i = np.clip(np.floor(q).astype(int), 0, n - 2)
    f = np.clip(q - i, 0, 1)
    c = {}
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                c[dx, dy, dz] = F[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz].astype(np.float64)
    fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
    def lerp(a, b, t):
        return a + (b - a) * t
    x00 = lerp(c[0, 0, 0], c[1, 0, 0], fx); x10 = lerp(c[0, 1, 0], c[1, 1, 0], fx)
    x01 = lerp(c[0, 0, 1], c[1, 0, 1], fx); x11 = lerp(c[0, 1, 1], c[1, 1, 1], fx)
    y0 = lerp(x00, x10, fy); y1 = lerp(x01, x11, fy)
    d = lerp(y0, y1, fz)
    gx = lerp(lerp(c[1, 0, 0] - c[0, 0, 0], c[1, 1, 0] - c[0, 1, 0], fy), lerp(c[1, 0, 1] - c[0, 0, 1], c[1, 1, 1] - c[0, 1, 1], fy), fz)
    gy = lerp(lerp(x10 - x00, x10 - x00, 0), x11 - x01, fz) if False else lerp(x10 - x00, x11 - x01, fz)
    gz = y1 - y0
    return d, np.stack([gx, gy, gz], 1) / h


# ------------------------------------------------------------------ painting helpers
def hexrgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], float) / 255.0


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def nearest_on_polyline(P, pts):
    """closest point on a polyline for each P: (index of segment, t along it, the point, distance along the whole line 0-1)"""
    pts = np.asarray(pts, float)
    best = np.full(len(P), np.inf)
    seg = np.zeros(len(P), int)
    tt = np.zeros(len(P))
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        e = b - a
        t = np.clip(((P - a) @ e) / max(e @ e, 1e-12), 0, 1)
        q = a + t[:, None] * e
        d = _len(P - q)
        m = d < best
        best[m], seg[m], tt[m] = d[m], i, t[m]
    lens = _len(np.diff(pts, axis=0))
    cum = np.concatenate([[0], np.cumsum(lens)])
    along = (cum[seg] + tt * lens[seg]) / cum[-1]
    point = pts[seg] + tt[:, None] * (pts[seg + 1] - pts[seg])
    return seg, tt, point, along


def hash3(P, seed=0):
    """a repeatable random number per point of space (for spots and mottling)"""
    x = np.sin(P @ np.array([127.1, 311.7, 74.7]) + seed * 17.13) * 43758.5453
    return x - np.floor(x)


def value_noise(P, scale, seed=0):
    """smooth 3-d noise, 0-1"""
    q = P * scale
    i = np.floor(q)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * hash3(i + np.array([dx, dy, dz]), seed)
    return out


def worley(P, scale, seed=0):
    """distance to the nearest of a scatter of points (spots), and to the second nearest (cell edges)"""
    q = P * scale
    i = np.floor(q)
    d1 = np.full(len(P), 9.0)
    d2 = np.full(len(P), 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                jitter = np.stack([hash3(c, seed), hash3(c, seed + 1), hash3(c, seed + 2)], 1)
                d = _len(q - (c + jitter))
                d2 = np.where(d < d1, d1, np.minimum(d2, d))
                d1 = np.minimum(d1, d)
    return d1 / scale, d2 / scale


# ------------------------------------------------------------------ more shapes
def flat_cone(a, b, ra, rb, flat):
    """a round cone squashed sideways (along x) to `flat` of its width: spikes, plates, fins"""
    cone = round_cone(a, b, ra, rb)
    sc = np.array([1.0 / flat, 1.0, 1.0])

    def fn(P):
        c = (P - _mid) * sc + _mid
        return cone(c) * flat
    _mid = (vec(a) + vec(b)) * 0.5
    lo, hi = cone.lo.copy(), cone.hi.copy()
    lo[0] = _mid[0] - (_mid[0] - lo[0]) * flat
    hi[0] = _mid[0] + (hi[0] - _mid[0]) * flat
    return Shape(fn, lo, hi)


def mouth_cut(jaw, ymouth, width=0.75, front=3.5):
    """the gap between the lips: a wedge in front of the mouth corners, following the smile curve ymouth(z),
    as wide as the jaw opens at jaw['angle'] degrees round the hinge (so turning the jaw up by that much closes it)"""
    hz, hy = jaw["hinge"][2], jaw["hinge"][1]
    cz = jaw["corner_z"]
    a = math.radians(jaw["angle"])

    def fn(P):
        ym = ymouth(P[:, 2], P[:, 0])
        half = 0.5 * a * np.maximum(P[:, 2] - hz, 0) + 0.006
        d = np.abs(P[:, 1] - ym) - half
        return smax(d, cz - P[:, 2], 0.03)
    return Shape(fn, vec(-width, hy - 0.5, cz - 0.05), vec(width, hy + 0.5, front))


def ground_cut(mat="sole"):
    return rbox((0, -1.0, 0), (9, 1.0, 9))


# ------------------------------------------------------------------ painting the skin
def _membership(D, sigma):
    """how much each vertex belongs to each part, from its distances to them"""
    m = D.min(1, keepdims=True)
    w = np.exp(-(D - m) / sigma)
    w[D - m > 6 * sigma] = 0
    return w / w.sum(1, keepdims=True)


def colorize(model, V, N, h):
    """per-vertex colour, material name and ink region"""
    parts = model.parts
    D = model.distances(V)
    add = np.array([p.op == "u" for p in parts])
    names = [p.name for p in parts]
    mats = sorted(set(p.mat for p in parts) | set(pa["mat"] for pa in model.painters) | {"hide"})
    mi = {m: i for i, m in enumerate(mats)}
    # additive membership (crisp, for the material) and loose membership (for paint limits)
    Da = np.where(add[None], D, 9.0)
    crisp = _membership(Da, 0.008)
    loose = _membership(Da, 0.05)
    W = np.zeros((len(V), len(mats)))
    for j, p in enumerate(parts):
        if p.op == "u":
            W[:, mi[p.mat]] += crisp[:, j]
    # cut surfaces: deep inside the shapes, right on a cut
    fu = np.full(len(V), 1.0)
    for j, p in enumerate(parts):
        if p.op == "u":
            fu = smin(fu, np.where(D[:, j] < 8, D[:, j], 9.0), p.k)
    for j, p in enumerate(parts):
        if p.op == "s" and p.mat:
            on = (D[:, j] < 0.6 * h) & (fu < -0.3 * h)
            W[on] = 0
            W[on, mi[p.mat]] = 1
    model.on_cut = {p.name: (D[:, j] < 0.6 * h) & (fu < -0.3 * h) for j, p in enumerate(parts) if p.op == "s"}
    model.cut_dist = {p.name: D[:, j] for j, p in enumerate(parts) if p.op == "s"}
    for pa in model.painters:
        allowed = np.ones(len(V))
        if pa["mats"]:
            allowed = W[:, [mi[m] for m in pa["mats"] if m in mi]].sum(1)
        if pa["parts"]:
            allowed = allowed * loose[:, [names.index(n) for n in pa["parts"] if n in names]].sum(1)
        if pa["kind"] == "where":
            fn = pa["fn"]
            val = fn(V)
            s = pa["soft"]
            w = 1 - smooth(-s, s, val) if s > 0 else (val < 0).astype(float)
        else:
            seg, t, q, along = nearest_on_polyline(V, pa["centre"])
            vent = pa["vent"][seg] * (1 - t[:, None]) + pa["vent"][seg + 1] * t[:, None]
            vent /= np.maximum(_len(vent), 1e-9)[:, None]
            cth = pa["cos"][seg] * (1 - t) + pa["cos"][seg + 1] * t
            dirn = V - q
            dirn /= np.maximum(_len(dirn), 1e-9)[:, None]
            c = (dirn * vent).sum(1)
            w = smooth(cth - pa["soft"], cth + pa["soft"], c)
        w = np.clip(w * allowed, 0, 1)
        W *= (1 - w)[:, None]
        W[:, mi[pa["mat"]]] += w
    col = np.zeros((len(V), 3))
    for m, i in mi.items():
        col += W[:, i:i + 1] * model.colors.get(m, np.array([1.0, 0, 1]))
    region_of = getattr(model, "ink_groups", {})
    dom = W.argmax(1)
    region = np.array([region_of.get(mats[i], 0) for i in range(len(mats))])[dom].astype(float)
    return col, np.array(mats)[dom], region


def eyeball(e, h, iris=(0x3b2a22, 0x14100e), sclera=0xfbfaf6, gaze=(0, 0, 1), look=0.45):
    """the eye as a little mesh, painted: white, a big dark iris with a soft lighter rim, and two shine spots.
    The iris looks part way (look) from straight out of the eye toward gaze, as the sheets draw it."""
    m = Model("eye", 1)
    m.add("ball", ellipsoid(e["centre"], e["radii"], e["R"]), k=0.0)
    V, F, N = m.mesh(h * 0.35, refine=3)
    g = norm(e["fwd"] * (1 - look) + norm(gaze) * look)
    Rg = frame(g, (0, 1, 0))
    q = (V - e["centre"]) @ Rg / e["radii"]
    q /= np.maximum(_len(q), 1e-9)[:, None]
    ang = np.degrees(np.arccos(np.clip(q[:, 2], -1, 1)))
    col = np.tile(hexrgb(sclera), (len(V), 1))
    iris_c = hexrgb(iris[0]) * (1 - smooth(20, 50, ang))[:, None] + hexrgb(iris[1]) * smooth(20, 50, ang)[:, None]
    lighter = np.clip(q[:, 1] * -1, 0, 1)[:, None] * 0.25          # warmer low in the iris
    iris_c = iris_c + lighter * (hexrgb(0x8a5a3a) - iris_c)
    w = 1 - smooth(54, 58, ang)
    col = col * (1 - w[:, None]) + iris_c * w[:, None]
    for off, r in (((-0.32 * e["side"], 0.38), 0.24), ((0.25 * e["side"], -0.3), 0.11)):
        d = _len(q[:, :2] - np.array(off))
        hl = (1 - smooth(r * 0.85, r, d)) * (q[:, 2] > 0)
        col = col * (1 - hl[:, None]) + hl[:, None]
    return V, F, N, col


def fin(base_a, base_b, tip, thick, bulge=0.25, sweep=0.0, taper=0.75, side=(1, 0, 0)):
    """a fin-shaped spike or plate standing on the line base_a-base_b (base_a at the front), pointing at tip.
    bulge rounds the front edge out, sweep hollows the back edge; it is `thick` through at the base and thins to the tip."""
    a, b, t = vec(base_a), vec(base_b), vec(tip)
    sd = norm(side)
    ex = norm(b - a)                                    # along the base, front to back
    ey = t - (a + b) * 0.5
    ey = norm(ey - sd * (ey @ sd))
    ex = norm(ex - ey * (ex @ ey) - sd * (ex @ sd))
    o = (a + b) * 0.5
    L = np.linalg.norm(b - a) * 0.5
    tl = vec((t - o) @ ex, (t - o) @ ey)
    H = max(tl[1], 1e-3)
    # the outline: front edge bowed out, back edge bowed in, a little root below the base line
    n = 10
    front = [vec(-L, 0) + (tl - vec(-L, 0)) * u + vec(-1, 0.5) * norm(vec(-1, 0.5)) * 0 for u in np.linspace(0, 1, n)]
    pts = []
    for u in np.linspace(0, 1, n):
        p = vec(-L, 0) * (1 - u) + tl * u
        nrm = norm(vec(-(tl[1] - 0), tl[0] + L))        # outward normal of the front edge
        pts.append(p + nrm * bulge * H * 4 * u * (1 - u) * 0.5)
    for u in np.linspace(1, 0, n)[1:]:
        p = vec(L, 0) * (1 - u) + tl * u
        nrm = norm(vec(-(tl[1] - 0), tl[0] - L))
        pts.append(p + nrm * sweep * H * 4 * u * (1 - u) * 0.5)
    pts += [vec(L, -0.35 * L), vec(-L, -0.35 * L)]
    f2 = poly2d(np.array(pts))
    M = np.stack([ex, ey, sd], 1)

    def fn(P):
        q = (P - o) @ M
        d2 = f2(q[:, :2])
        th = thick * (1 - taper * np.clip(q[:, 1] / H, 0, 1))
        w = np.abs(q[:, 2]) - th
        return np.minimum(np.maximum(d2, w), 0) + _len(np.stack([np.maximum(d2, 0), np.maximum(w, 0)], 1))
    allp = np.array(pts)
    corners = np.array([o + ex * x + ey * y + sd * z for x in (allp[:, 0].min(), allp[:, 0].max())
                        for y in (allp[:, 1].min(), allp[:, 1].max()) for z in (-thick, thick)])
    return Shape(fn, corners.min(0), corners.max(0))


def surface_point(model, p, d, step=0.004, limit=3.0):
    """where a ray from p along d crosses the skin (works from inside or outside)"""
    p, d = vec(p).copy(), norm(d)
    inside = model.field_at(p[None])[0] <= 0
    sgn = 1.0 if inside else -1.0
    for _ in range(int(limit / step)):
        q = p + d * step * sgn
        if (model.field_at(q[None])[0] <= 0) != inside:
            return (p + q) * 0.5
        p = q
    return p


def decal(model, mat, p, d, radii, up=(0, 1, 0), soft=0.0, mats=None, parts=None, sink=0.0):
    """paint an oval spot onto the skin where a ray from p along d meets it"""
    s = surface_point(model, p, d) - norm(d) * sink
    R = frame(d, up)
    model.paint(mat, ellipsoid(s, radii, R), soft=soft, mats=mats, parts=parts)
    return s
