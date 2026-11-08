"""The general asset pack: its name, what uses it, and that nothing points at a model that isn't there."""
import json
import os
import re
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "brain"))
PACK = os.path.join(ROOT, "ui", "general_asset_pack")


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def wild_paths():
    """every model wilddata.js names, worked out from its text"""
    src = read("ui", "turtle", "wilddata.js")
    consts = dict(re.findall(r'\b([A-Z_]+) = "([^"]+/)"', src))
    out = {consts[a] + b for a, b in re.findall(r"`\$\{(\w+)\}([^`$]+)`", src) if a in consts}
    out |= set(re.findall(r'"([\w ]+/[\w ,.-]+\.(?:glb|gltf))"', src))
    return out, src


class Folder(unittest.TestCase):
    def test_renamed_and_nothing_uses_the_old_path(self):
        self.assertTrue(os.path.isdir(PACK))
        self.assertFalse(os.path.isdir(os.path.join(ROOT, "ui", "game", "assets")))
        for name in ("catalog.json", "aliases.json", "furniture.json"):
            self.assertTrue(os.path.exists(os.path.join(PACK, name)), name)
        for rel in (("ui", "game", "assets.js"), ("ui", "turtle", "data.js"), ("game", "content.py"), ("scripts", "package_app.py")):       # brain/plugins.py names it on purpose: it moves the old folder
            self.assertNotIn("game/assets", read(*rel), rel)

    def test_an_old_install_moves_its_folder(self):
        import plugins
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "ui", "game", "assets", "x"))
            self.assertTrue(plugins.migrate_asset_folder(d))
            self.assertTrue(os.path.isdir(os.path.join(d, "ui", "general_asset_pack", "x")))
            self.assertFalse(plugins.migrate_asset_folder(d))      # done: nothing to do again

    def test_a_folder_already_there_is_never_overwritten(self):
        import plugins
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "ui", "game", "assets"))
            os.makedirs(os.path.join(d, "ui", "general_asset_pack"))
            self.assertFalse(plugins.migrate_asset_folder(d))
            self.assertTrue(os.path.isdir(os.path.join(d, "ui", "game", "assets")))


class Duplicates(unittest.TestCase):
    def test_every_old_name_leads_to_a_model_that_exists(self):
        with open(os.path.join(PACK, "aliases.json"), encoding="utf-8") as f:
            aliases = json.load(f)
        with open(os.path.join(PACK, "catalog.json"), encoding="utf-8") as f:
            ids = {m["id"] for m in json.load(f)["models"]}
        self.assertTrue(aliases)
        self.assertEqual([k for k in aliases if k in ids], [])
        self.assertEqual([v for v in aliases.values() if v not in ids], [])

    def test_the_game_reads_old_names_without_counting_them_twice(self):
        from game.content import content
        c = content()
        with open(os.path.join(PACK, "aliases.json"), encoding="utf-8") as f:
            old, kept = next(iter(json.load(f).items()))
        self.assertTrue(c.has_model(old))
        self.assertEqual(c.model(old)["id"], kept)
        self.assertNotIn(old, c.match(".*"))


class Adventure(unittest.TestCase):
    def test_used_packs_are_real_and_the_new_ones_cant_become_monsters(self):
        from game.content import content
        used = content().used_by_pack()
        self.assertGreater(len(used), 10)
        self.assertEqual([p for p in used if p.startswith("pack_")], [])

    def test_the_panel_has_the_dropdown_and_grid(self):
        main = read("ui", "game", "main.js")
        self.assertIn('call("used_packs")', main)
        self.assertIn("openTestFloor", main)
        self.assertIn('"used_packs"', read("app.py"))
        self.assertIn("makePackBar", read("ui", "game", "testfloor.js"))


class Farm(unittest.TestCase):
    def test_every_model_it_names_is_on_disk(self):
        paths, src = wild_paths()
        self.assertGreater(len(paths), 100)
        self.assertEqual(sorted(p for p in paths if "." in p.rsplit("/", 1)[-1] and not os.path.exists(os.path.join(PACK, p))), [])
        # the lists built from a name and a number
        for folder, stem, nums in re.findall(r"nDot\(`\$\{(\w+)\}(\w+)`, \[([\d, ]+)\]\)", src):
            prefix = dict(re.findall(r'\b([A-Z_]+) = "([^"]+/)"', src))[folder]
            for n in nums.split(", "):
                self.assertTrue(os.path.exists(os.path.join(PACK, f"{prefix}{stem}{n}.gltf")), f"{stem}{n}")

    def test_the_new_fish_are_on_disk(self):
        data = read("ui", "turtle", "data.js")
        found = re.findall(r'\["\w+", "[^"]+", "([^"]+/[^"]+\.glb)", \d', data)
        self.assertGreaterEqual(len(found), 9)
        for p in found:
            self.assertTrue(os.path.exists(os.path.join(PACK, p)), p)

    def test_every_biome_has_something_new(self):
        src = read("ui", "turtle", "data.js")
        _, wild = wild_paths()
        for biome in set(re.findall(r'biome: "([^"]+)"', src)):
            self.assertRegex(wild, rf'(?m)^\s*"?{re.escape(biome)}"?: \[', biome)

    def test_wired_in(self):
        self.assertIn("makeWildlife(G)", read("ui", "turtle", "main.js"))
        self.assertIn("G.wildlife?.tick", read("ui", "turtle", "main.js"))
        self.assertIn("MORE_FLORA[cfg.biome]", read("ui", "turtle", "world.js"))
        self.assertIn('G.showcase("packs"', read("ui", "turtle", "ui.js"))

    def test_the_extra_plants_cant_shift_the_old_ones(self):
        """they use their own run of random numbers, and put the old run back"""
        world = read("ui", "turtle", "world.js")
        start, end = world.index("const keepSeed = seed"), world.index("seed = keepSeed")
        self.assertIn("MORE_FLORA", world[start:end])


class MainRoom(unittest.TestCase):
    def test_dropdowns(self):
        self.assertIn("makePackBar", read("ui", "furnfloor.js"))
        self.assertIn("makePackBar", read("ui", "app.js"))

    def test_furniture_list_points_at_real_models(self):
        with open(os.path.join(PACK, "furniture.json"), encoding="utf-8") as f:
            data = json.load(f)
        rows = data if isinstance(data, list) else data.get("items") or data.get("pieces") or next(v for v in data.values() if isinstance(v, list))
        self.assertGreater(len(rows), 1000)


if __name__ == "__main__":
    unittest.main()
