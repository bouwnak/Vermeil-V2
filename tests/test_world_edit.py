"""The world editor (ui/worldedit.js and friends): categories, furniture-style placing with arrows and rings, the scatter brush,
platforms with shapes and surfaces, the hole tool, the sidebar stepping aside, sprint and jump in the hubs, the main room's camera
after a resize, and saving edits (skills/worldedits.py)."""
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "ui")
for p in (ROOT, os.path.join(ROOT, "brain"), os.path.join(ROOT, "skills")):
    if p not in sys.path:
        sys.path.insert(0, p)


def read(name):
    with open(os.path.join(UI, name), encoding="utf-8") as f:
        return f.read()


class EditorPanel(unittest.TestCase):
    def setUp(self):
        self.js = read("worldedit.js")

    def test_no_top_bars_any_more(self):
        self.assertNotIn("we-bar", self.js)
        self.assertNotIn("drawBars", self.js)

    def test_assets_box_reaches_up_and_has_categories(self):
        self.assertIn("CATEGORIES", self.js)
        self.assertIn("catSel", self.js)
        self.assertIn("ResizeObserver", self.js)                 # as many rows as fit the taller box
        self.assertIn(".we-assets{border:3px solid #000;background:#050505;flex:1 1 0", self.js)

    def test_placing_like_furniture(self):
        for bit in ("startSlide", "startGizmo", "BoxHelper", "we-float", "dropToGround", "e.shiftKey"):
            self.assertIn(bit, self.js)
        self.assertNotIn("gizmoMode", self.js)                   # arrows and rings show together

    def test_snap_axes_and_turn_axes(self):
        self.assertIn("S.snap[a]", self.js)
        self.assertIn("S.rot.axis", self.js)

    def test_scatter_brush(self):
        for bit in ("SCATTER_SETS", "scatterAt", "S.scatter.count", "S.scatter.radius", '"square"'):
            self.assertIn(bit, self.js)

    def test_platforms_and_holes(self):
        for bit in ("SHAPES", "SURFACES", "surfaceSwatch", "PRESETS", "HOLE_SHAPES", "S.hole.through", "s.hole("):
            self.assertIn(bit, self.js)

    def test_dropdowns_open_on_top_of_everything(self):
        self.assertIn("const dropdown = (label)", self.js)
        self.assertIn(".we-menu{position:fixed", self.js)          # not clipped by the panel's scroll box
        self.assertIn('catSel = dropdown("Which kind of model")', self.js)

    def test_terraform_and_assets_fold(self):
        self.assertIn("vermeil.worldEditFold", self.js)
        self.assertIn('head("Terraform", "terra")', self.js)
        self.assertIn('head("Assets", "assets")', self.js)
        self.assertIn("we-no-assets", self.js)

    def test_ctrl_click_many_and_copy_paste(self):
        for bit in ("toggleSelect(thing)", 'e.code === "KeyC"', 'e.code === "KeyV"', 'e.code === "KeyD"', "CLIP_KEY", "function follow("):
            self.assertIn(bit, self.js)

    def test_axis_buttons_have_their_own_class(self):
        self.assertIn("we-ax-x", self.js)
        self.assertNotIn('"x on"', self.js)

    def test_sideways_tunnels(self):
        for bit in ("S.hole.side", "S.hole.tilt", "S.hole.len", "function digTunnel", 'kind: "tunnel"'):
            self.assertIn(bit, self.js)


class Modules(unittest.TestCase):
    def test_hole_shapes_in_the_sculpt(self):
        js = read("worldsculpt.js")
        for bit in ("export const HOLE = 255", "HOLE_SHAPES", "export function shapeEdge", "  hole(x, z, r, shape, depth, through"):
            self.assertIn(bit, js)

    def test_platform_shapes_and_surfaces(self):
        js = read("worldlayer.js")
        for kind in ("box", "cylinder", "ramp", "stairs", "sphere"):
            self.assertIn(f"{kind}:", js)
        for s in ("brick", "planks", "tiles", "glass"):
            self.assertIn(f"{s}:", js)

    def test_tunnels_cut_the_ground_and_have_a_floor(self):
        js = read("worldsculpt.js")
        for bit in ("export const TUNNEL_MAX = 12", "  setTunnel(rec, matrix)", "  dropTunnel(rec)", "  tunnelFloor(x, z, near", "at(x, z, near = null)"):
            self.assertIn(bit, js)
        layer = read("worldlayer.js")
        self.assertIn("export function tunnelGeometry", layer)
        self.assertIn("sculpt.setTunnel(rec, node.matrix)", layer)

    def test_library_categories_and_portal(self):
        js = read("worldlibrary.js")
        self.assertIn("export function categoryOf", js)
        self.assertIn('src: "fx:portal"', js)
        self.assertIn("NOT_PLANT", js)                            # floor tiles with grass on them aren't scattered as grass


class AroundTheEditor(unittest.TestCase):
    def test_sidebar_hidden_while_editing(self):
        self.assertIn("body.world-editing .sidebar", read("social.css"))

    def test_sprint_and_jump_in_hubs(self):
        js = read("room.js")
        self.assertIn('"ShiftLeft", "ShiftRight"', js)
        self.assertIn("this._wantJump = true", js)
        self.assertIn("this._jump = { v: 4.4, y: 0 }", js)

    def test_room_camera_comes_back_when_lost(self):
        js = read("room.js")
        self.assertIn("_viewLost(pos = this.camera.position", js)
        self.assertIn("this._keepRoomInView(t)", js)
        self.assertIn("size: JSON.stringify(cozy.house.cfg)", js)      # leaving a hub after a resize refits too

    def test_farm_edit_button_is_first_in_test_tools(self):
        js = read(os.path.join("turtle", "ui.js"))
        self.assertIn("test-world", js)
        self.assertLess(js.index("Edit this world"), js.index('toggleBtn("Fly'))

    def test_room_camera_follows_a_resize(self):
        js = read("room.js")
        self.assertIn("this._refitTimer", js)
        self.assertIn("cx = (b.minX + b.maxX) / 2", js)


class Saving(unittest.TestCase):
    def test_save_load_and_revert_keeps_a_backup(self):
        import worldedits
        with tempfile.TemporaryDirectory() as d, mock.patch.object(worldedits, "data_file", lambda n: os.path.join(d, n)):
            data = {"version": 1, "zones": {}, "objects": [{"id": 1, "kind": "box", "w": 2, "h": 1, "d": 2, "mat": "brick", "x": 0, "y": 0.5, "z": 0, "zone": "main"}], "changed": []}
            self.assertTrue(worldedits.save("hub:park", data)["ok"])
            self.assertEqual(worldedits.load("hub:park"), data)
            self.assertTrue(worldedits.clear("hub:park")["ok"])
            self.assertIsNone(worldedits.load("hub:park"))
            self.assertTrue(os.path.exists(os.path.join(d, "world_edit_hub_park.json.reverted")))

    def test_bad_scope_is_refused(self):
        import worldedits
        self.assertIn("error", worldedits.save("../evil", {}))
        self.assertIsNone(worldedits.load("no/slashes"))


if __name__ == "__main__":
    unittest.main()
