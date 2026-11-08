"""Brachipup - the baby sauropod. Fay, the first companion, is one.
Measured off ref/brachipup.webp: side view origin at x=535 px, ground at y=656 px, front view centre x=179, 100 px = 1 unit."""
import numpy as np
from dinokit import *

SZ, SY, FX = 535, 656, 179


def S(px, py, x=0.0):
    """a point read off the side view (and how far to the animal's left)"""
    return vec(x, (SY - py) / 100.0, (SZ - px) / 100.0)


VIEWS = [
    dict(name="front", yaw=0, s=100, cx=179, gy=656),
    dict(name="side", yaw=90, s=100, cx=535, gy=656),
    dict(name="three", yaw=45, pitch=7, s=100, cx=915, gy=644),
    dict(name="back", yaw=180, s=100, cx=1203, gy=656),
]

COLORS = dict(
    hide=0x5f968f, belly=0xf0ddb0, spike=0xe46a30, nail=0x6a6a6c, mouth=0xa8424a, tongue=0xd8707a,
    blush=0xec9a8c, nostril=0x1f3a3a, snout=0x7fb5b0, lip=0x2a2522, sole=0x4f7c7a,
)


def build():
    m = Model("brachipup", 6.0)
    m.colors = {k: hexrgb(v) for k, v in COLORS.items()}

    # ---- head
    m.add("cranium", ellipsoid(S(410, 178), (0.46, 0.45, 0.42)), bones=["head"], k=0.0)
    m.add("brow", ellipsoid(S(366, 150), (0.17, 0.16, 0.22)), bones=["head"], k=0.15)
    m.add("face", round_cone(S(405, 170), S(334, 192), 0.32, 0.15), bones=["head"], k=0.12)
    m.add("muzzle", ellipsoid(S(348, 216), (0.40, 0.29, 0.39)), bones=["head"], k=0.16)
    m.add("cheeks", ellipsoid(S(398, 210), (0.50, 0.28, 0.30)), bones=["head"], k=0.15)

    # ---- neck, a chain from the back of the head down into the chest
    neck = [S(425, 192), S(437, 250), S(435, 300), S(432, 350), S(445, 405), S(470, 450)]
    rad = [0.36, 0.37, 0.36, 0.42, 0.55, 0.62]
    m.add("neck", chain(neck, rad, 0.0), bones=["neck1", "neck2", "neck3"], k=0.14)

    # ---- body: a pear, heavier low down
    m.add("body", ellipsoid(S(520, 462), (0.80, 0.78, 1.25)), bones=["chest", "hips"], k=0.2)
    m.add("chest", ellipsoid(S(425, 462), (0.62, 0.62, 0.50)), bones=["chest"], k=0.2)
    m.add("belly", ellipsoid(S(515, 495), (0.86, 0.52, 1.05)), bones=["chest", "hips"], k=0.2)
    m.add("rump", ellipsoid(S(615, 470), (0.70, 0.66, 0.60)), bones=["hips"], k=0.2)

    # ---- tail, curling a little to its right
    tail = [S(640, 470), S(690, 525, -0.05), S(730, 555, -0.18), S(765, 568, -0.35), S(790, 572, -0.48)]
    m.add("tail", chain(tail, [0.58, 0.45, 0.28, 0.13, 0.04], 0.0), bones=["tail1", "tail2", "tail3", "tail4"], k=0.16)

    # ---- legs: thick columns, flat soles, three toenails each
    def leg(side, front):
        sx = 0.56 * side
        if front:
            pts = [S(448, 470, sx * 0.8), S(441, 560, sx), S(437, 615, sx), S(435, 640, sx)]
            r = [0.38, 0.30, 0.27, 0.27]
            names = [f"arm_{'l' if side > 0 else 'r'}", f"fore_{'l' if side > 0 else 'r'}", f"hand_{'l' if side > 0 else 'r'}"]
            foot = S(432, 643, sx)
        else:
            pts = [S(612, 478, sx * 0.85), S(622, 560, sx), S(612, 615, sx), S(606, 640, sx)]
            r = [0.50, 0.36, 0.28, 0.28]
            names = [f"thigh_{'l' if side > 0 else 'r'}", f"shin_{'l' if side > 0 else 'r'}", f"foot_{'l' if side > 0 else 'r'}"]
            foot = S(602, 643, sx)
        m.add(names[0], chain(pts, r, 0.0), bones=names, k=0.12)
        m.add(names[2] + "_pad", ellipsoid(foot, (0.31, 0.15, 0.33)), bones=[names[2]], k=0.06)
        for i, dx in enumerate((-0.17, 0.0, 0.17)):
            c = foot + vec(dx, 0.05, 0.27 - abs(dx) * 0.35)
            m.add(f"{names[2]}_nail{i}", ellipsoid(c, (0.075, 0.07, 0.07)), mat="nail", bones=[names[2]], k=0.025)
    for side in (1, -1):
        leg(side, True)
        leg(side, False)

    # ---- dorsal spikes: flat triangles from the crown to the tail tip (base, tip, base half-length, in side px)
    spikes = [((390, 142), (404, 108), 16), ((430, 147), (450, 114), 16), ((460, 172), (487, 152), 16), ((473, 207), (500, 196), 15),
              ((475, 242), (501, 248), 15), ((473, 276), (493, 292), 13), ((473, 306), (489, 322), 11), ((474, 336), (486, 346), 9),
              ((495, 372), (510, 362), 9), ((532, 385), (549, 372), 11), ((572, 392), (592, 380), 12), ((612, 407), (636, 400), 15),
              ((643, 423), (668, 427), 15), ((670, 442), (692, 458), 14), ((693, 466), (712, 488), 13), ((713, 492), (728, 512), 12),
              ((731, 514), (741, 532), 10), ((748, 532), (757, 545), 9), ((765, 550), (773, 557), 7)]
    bases = [S(bx, by) for (bx, by), _, _ in spikes]
    for i, ((bx, by), (tx, ty), r) in enumerate(spikes):
        b, t = S(bx, by), S(tx, ty)
        ex = norm(bases[min(i + 1, len(bases) - 1)] - bases[max(i - 1, 0)])
        inward = norm(np.cross(ex, vec(1, 0, 0)))          # toward the body, in the mid plane
        if inward @ (t - b) > 0:
            inward = -inward
        bone = "head" if i < 2 else ("neck%d" % min(3, i - 1) if i < 8 else ("chest" if i < 11 else ("hips" if i < 13 else "tail%d" % min(4, (i - 11) // 2))))
        rr = r / 100.0 * 1.25
        ba, bb = b - ex * rr - inward * 0.09, b + ex * rr - inward * 0.09
        if i >= 13:     # follow the tail's curl
            for q in (ba, bb, t):
                q[0] = np.interp(-q[2], [1.05, 1.55, 1.95, 2.30, 2.53], [0.0, -0.05, -0.18, -0.35, -0.48])
        m.add(f"spike{i}", fin(ba, bb, t, 0.06 * (0.6 + 0.4 * r / 16), bulge=0.3, sweep=0.12, taper=0.8), mat="spike", bones=[bone], k=0.03)

    # ---- the mouth: a thin wedge cut along a smile, opening from a hinge below the eye
    m.jaw = dict(hinge=S(418, 214), corner_z=(SZ - 384) / 100.0, angle=5.0)
    m.jaw["ymouth"] = lambda z, x=0.0: 4.26 + 0.22 * np.clip((2.24 - z) / 0.72, 0, 1) ** 1.7 + 0.03 * np.exp(-(x / 0.045) ** 2) * np.clip((z - 1.9) / 0.3, 0, 1)
    m.cut("mouth", mouth_cut(m.jaw, m.jaw["ymouth"]), k=0.012)

    # ---- eyes sit in shallow sockets (the eyeballs themselves are built separately)
    for side in (1, -1):
        m.eye(side, S(377, 178, 0.22 * side), at=True, fwd=(0.64 * side, 0.05, 0.77), radii=(0.14, 0.195, 0.13), socket=0.03, protrude=0.62)

    # ---- paint
    # cream belly from the chin, down the throat and chest, under the body and along the tail underside
    centre = [S(430, 230), S(437, 300), S(435, 400), S(480, 460), S(520, 470), S(630, 470), S(700, 515), S(790, 572)]
    vent = [(0, -0.5, 1), (0, -0.3, 1), (0, -0.2, 1), (0, -0.6, 1), (0, -1, 0), (0, -1, -0.2), (0, -1, -0.3), (0, -1, -0.2)]
    m.band("belly", centre, vent, [0.6, 0.7, 0.65, 0.45, 0.72, 0.7, 0.5, 0.45], soft=0.06, mats=["hide"],
           parts=["neck", "body", "chest", "belly", "rump", "tail"])
    # the lower face is cream below a line under the nostrils that turns down behind the jaw into the throat
    zs = [(SZ - px) / 100.0 for px in (445, 440, 428, 420, 410, 398, 380, 300)]
    ys = [(SY - py) / 100.0 for py in (2000, 300, 262, 240, 220, 207, 205, 205)]
    m.paint("belly", lambda P: P[:, 1] - np.interp(P[:, 2], zs, ys), soft=0.012, mats=["hide"],
            parts=["cranium", "face", "muzzle", "cheeks", "brow"])
    # the lighter snout patch on top of the muzzle
    m.paint("snout", ellipsoid(S(332, 184), (0.32, 0.12, 0.26)), soft=0.06, mats=["hide"])
    for side in (1, -1):
        decal(m, "blush", S(400, 200), (side, -0.08, 0.12), (0.10, 0.065, 0.06), soft=0.02, mats=["hide"])
        decal(m, "nostril", S(335, 202, 0.14 * side), (0.25 * side, 0.35, 1.0), (0.032, 0.022, 0.03), mats=["hide", "belly", "snout"])
    m.paint("sole", lambda P: P[:, 1] - 0.03, soft=0.02, mats=["hide"])
    return m
