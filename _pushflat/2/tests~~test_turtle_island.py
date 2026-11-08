"""Turtle Island: its save can't be lost, and its data files agree with each other and with the asset packs."""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "skills"))
import folders  # noqa: E402,F401
import turtlesave  # noqa: E402

UI = os.path.join(ROOT, "ui")
with open(os.path.join(UI, "turtle", "data.js"), encoding="utf-8") as f:
    DATA = f.read()


class Save(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        p = os.path.join(self.dir, "t.json")
        for name, value in (("FILE", p), ("BACKUP", p + ".bak")):
            patch = mock.patch.object(turtlesave, name, value)
            patch.start()
            self.addCleanup(patch.stop)

    def test_saved_comes_back(self):
        self.assertTrue(turtlesave.save({"version": 1, "money": 5})["ok"])
        self.assertEqual(turtlesave.load()["money"], 5)

    def test_nothing_saved_yet(self):
        self.assertIsNone(turtlesave.load())

    def test_a_damaged_save_falls_back_to_the_last_good_one(self):
        turtlesave.save({"version": 1, "money": 1})
        turtlesave.save({"version": 1, "money": 2})
        with open(turtlesave.FILE, "w", encoding="utf-8") as f:
            f.write("{broken")
        self.assertEqual(turtlesave.load()["money"], 1)

    def test_a_damaged_file_never_replaces_the_backup(self):
        turtlesave.save({"version": 1, "money": 1})
        turtlesave.save({"version": 1, "money": 2})
        with open(turtlesave.FILE, "w", encoding="utf-8") as f:
            f.write("{broken")
        turtlesave.save({"version": 1, "money": 3})
        with open(turtlesave.BACKUP, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["money"], 1)

    def test_a_bad_state_is_refused(self):
        self.assertIn("error", turtlesave.save({"money": 1}))
        self.assertIn("error", turtlesave.save("nope"))

    def test_no_temporary_files_left(self):
        turtlesave.save({"version": 1})
        self.assertEqual([f for f in os.listdir(self.dir) if f.endswith(".tmp")], [])


class Content(unittest.TestCase):
    def test_every_model_the_game_names_exists(self):
        assets = os.path.join(UI, "general_asset_pack")
        named = re.findall(r'"([\w ]+/[\w ]+\.(?:glb|gltf))"', DATA)
        self.assertGreater(len(named), 2)
        for rel in named:
            self.assertTrue(os.path.exists(os.path.join(assets, rel)), rel)

    def test_every_crop_model_exists(self):
        crops = re.findall(r'stages\("(\w+)"\)', DATA)
        self.assertGreater(len(crops), 12)
        for name in crops:
            for tail in ("_1", "_2", "_3", "_4", "_Crop"):
                self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", "conv_nature_crops_pack", f"{name}{tail}.glb")), name + tail)

    def test_only_the_chosen_packs_are_used(self):
        allowed = {"conv_ultimate_nature_pack", "conv_farm_buildings", "conv_farm_animals", "conv_simple_nature_pack", "ultimate_modular_men", "ultimate_modular_women",
                   "stylized_nature_megakit", "conv_textured_stylized_trees", "conv_ultimate_food_pack", "conv_cute_fish_pack", "conv_nature_crops_pack",
                   "pack_animals", "conv_animated_fish_pack"}     # the newer fish
        packs = set(os.listdir(os.path.join(UI, "general_asset_pack")))
        folder = os.path.join(UI, "turtle")
        for name in os.listdir(folder):
            if name.endswith(".js") and name != "wilddata.js":      # wilddata.js is the one place for the rest of the general asset pack (test_general_asset_pack.py checks it)
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    used = set(re.findall(r"(\w+)/", f.read())) & packs
                self.assertEqual(used - allowed, set(), name)

    def test_every_fish_and_rod_exists(self):
        pack = os.path.join(UI, "general_asset_pack", "conv_cute_fish_pack")
        fish = re.findall(r'\["\w+", "[^"]+", "(\w+)", \d', DATA)
        self.assertGreater(len(fish), 30)
        for model in fish + [f"FishingRod_Lvl{i}" for i in range(1, 6)] + [f"Lure_{i}" for i in range(1, 6)] + ["Dock_Long_NoRope", "Boat"]:
            self.assertTrue(os.path.exists(os.path.join(pack, f"{model}.glb")), model)

    def test_every_outfit_exists(self):
        men = re.search(r"male: \[(.*?)\],\n", DATA, re.S).group(1)
        women = re.search(r"female: \[(.*?)\],\n", DATA, re.S).group(1)
        for folder, text in (("ultimate_modular_men", men), ("ultimate_modular_women", women)):
            for skin in re.findall(r'\["(\w+)", "', text):
                self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", folder, f"{skin}.gltf")), skin)

    def test_every_placeable_exists(self):
        names = dict(GROWN="conv_ultimate_nature_pack", B="conv_farm_buildings", MEGA="stylized_nature_megakit", FOOD="conv_ultimate_food_pack")
        found = re.findall(r"model: `\$\{(GROWN|B|MEGA|FOOD)\}([\w.]+)`", DATA)
        self.assertGreater(len(found), 25)
        for pack, name in found:
            self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", names[pack], name)), name)
        packs = {"P1": "lowpoly_farm_01", "V": "farm_vehicles"}
        block = re.findall(r"\.\.\.pack\((P1|V), \[(.*?)\]\),\n", DATA, re.S)
        self.assertEqual(len(block), 2)
        for root, body in block:
            files = re.findall(r'\["\w+", "[^"]+", "\w+", "(\w+)", ', body)
            self.assertGreater(len(files), 15)
            for name in files:
                self.assertTrue(os.path.exists(os.path.join(UI, "games", "asset_packs", packs[root], f"{name}.gltf")), name)

    def test_every_rigged_dinosaur_has_its_jaw(self):
        folder = os.path.join(UI, "games", "asset_packs", "dinosaurs")
        for base in set(re.findall(r'"(Parasaurolophus|Triceratops|Velociraptor|Trex|Stegosaurus|Apatosaurus)"', DATA)):
            with open(os.path.join(folder, f"{base}.glb"), "rb") as f:
                self.assertIn(b'"Jaw"', f.read(60000), base)

    def _kinds_and_turtles(self):
        kinds = set(re.findall(r"^  (\w+): \{[^\n]*forms: \[", DATA, re.M))
        isles = re.search(r"export const ISLANDS = \{(.*?)\n\};", DATA, re.S).group(1)
        turtles = set(re.findall(r'^  (\w+): \{ name: "', isles, re.M))
        return kinds, turtles

    def test_every_dinosaur_lives_on_a_real_turtle(self):
        kinds, turtles = self._kinds_and_turtles()
        self.assertEqual(len(kinds), 30)
        homes = dict(re.findall(r'^  (\w+): \{[^\n]*home: "(\w+)"', DATA, re.M))
        homes.update(re.findall(r'\["(\w+)", "(\w+)", \["\w+", \d\]\]', DATA))       # the first ten's homes, set in a loop
        for kind in kinds:
            self.assertIn(homes.get(kind), turtles, kind)

    def test_rare_finds_and_verses_point_at_real_things(self):
        kinds, turtles = self._kinds_and_turtles()
        finds = re.search(r"export const RARE_FINDS = \{(.*?)\n\};", DATA, re.S).group(1)
        for land, item, by in re.findall(r'(\w+): \{ item: "(\w+)", by: "(\w+)" \}', finds):
            self.assertIn(land, turtles)
            self.assertIn(by, kinds)
        self.assertEqual(len(re.findall(r'item: "\w+", by:', finds)), len(turtles))     # every turtle hides one
        verses = re.findall(r'\{ id: "v\d", land: "(\w+)"', DATA)
        self.assertEqual(len(verses), 8)
        for land in verses:
            self.assertIn(land, turtles)

    def test_every_line_has_three_forms(self):
        self.assertEqual(len(re.findall(r"forms: \[", DATA)), 30)       # the first ten, and twenty from the far turtles
        for forms in re.findall(r"forms: \[(.*?)\]", DATA):
            self.assertEqual(forms.count('"') // 2, 3)
        for sizes in re.findall(r"sizes: \[(.*?)\]", DATA):
            values = [float(v) for v in sizes.split(",")]
            self.assertEqual(values, sorted(values))         # each form is bigger than the last

    def test_the_extracted_packs_are_all_there(self):
        for pack, least in (("lowpoly_farm_01", 170), ("lowpoly_farm_02", 230), ("farm_vehicles", 28), ("garden_tools", 15)):
            folder = os.path.join(UI, "games", "asset_packs", pack)
            self.assertGreaterEqual(len([f for f in os.listdir(folder) if f.endswith(".gltf")]), least, pack)

    def test_it_sits_between_adventure_and_retro(self):
        with open(os.path.join(UI, "games", "index.html"), encoding="utf-8") as f:
            page = f.read()
        self.assertLess(page.index('id="cardAdventure"'), page.index('id="cardTurtle"'))
        self.assertLess(page.index('id="cardTurtle"'), page.index('id="cardRetro"'))


def _turtle(name):
    with open(os.path.join(UI, "turtle", name), encoding="utf-8") as f:
        return f.read()


class FarTurtles(unittest.TestCase):
    """the explorer turtles: caves you can go down into, lights to see by, the ancient city, trails"""

    def test_every_far_turtle_has_a_cave_and_its_finds_are_real(self):
        cave = _turtle("cave.js")
        themes = re.search(r"export const CAVE_THEMES = \{(.*?)\n\};", cave, re.S).group(1)
        found = dict((land, (loot, prize)) for land, loot, prize in re.findall(r'^  (\w+): \{[^\n]*loot: "(\w+)", prize: "(\w+)"', themes, re.M))
        featured = re.findall(r'^  (\w+): \{ name: "[^"]+"[^\n]*feature: "\w+"', DATA, re.M)
        self.assertEqual(len(featured), 8)
        items = set(re.findall(r"\b(\w+): [\[{]", DATA))         # materials, rare finds, crops: anything named as an item
        for land in featured:
            self.assertIn(land, found, land)
            for item in found[land]:
                self.assertIn(item, items, f"{land}: {item}")

    def test_lights_can_be_made_at_the_bench(self):
        cave = _turtle("cave.js")
        for light in re.findall(r'\{ id: "(\w+)", color:', cave):
            self.assertRegex(DATA, rf'\["{light}", \d+, \{{[^}}]+\}}', light)
            self.assertRegex(DATA, rf'{light}: \["[^"]+", "[^"]+", \d+\]', light)

    def test_the_cave_is_wired_in(self):
        main, world, explore = _turtle("main.js"), _turtle("world.js"), _turtle("explore.js")
        self.assertIn("G.cave = makeCave(G)", main)
        self.assertIn("G.cave?.tick(dt, t)", main)
        self.assertIn("if (W.cave?.on) return W.cave.ground(x, z);", world)
        self.assertIn("for (const L of lands(G))", world)
        self.assertIn('"Go into the cave"', explore)
        self.assertIn("mouthSpot(L)", explore)

    def test_cave_and_city_models_exist(self):
        packs = dict(GROWN="conv_ultimate_nature_pack", MEGA="stylized_nature_megakit")
        for name in ("cave.js", "explore.js"):
            for pack, file in re.findall(r"`\$\{(GROWN|MEGA)\}([\w.]+\.(?:glb|gltf))`", _turtle(name)):
                self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", packs[pack], file)), file)
        wild = _turtle("wilddata.js")
        for path in re.findall(r'(?:DUN\}|")([\w/]+\.glb)', re.search(r"export const RUIN_PARTS = .*?\n.*?\n", wild, re.S).group(0)):
            full = path if "/" in path else "conv_modular_dungeon_pack/" + path
            self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", full)), full)
        for path in re.findall(r'"([\w/]+\.glb)"', re.search(r"export const LIGHT_PARTS = \{.*?\};", wild).group(0)):
            self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", path)), path)

    def test_the_ancient_city_is_built(self):
        explore = _turtle("explore.js")
        self.assertIn("await greatCity(L);", explore)
        self.assertIn("L.avoidAt = ", explore)
        self.assertIn("!!L.avoidAt?.(x, z)", _turtle("world.js"))
        # the kit's twisted trees are autumn red, wrong for a city in the green
        pillar = re.search(r"^  pillar: \{.*?\n.*?\n", DATA, re.M | re.S).group(0)
        self.assertNotIn("TwistedTree", pillar)
        self.assertNotIn("TwistedTree", re.search(r'"Ancient city": \[\.\.\..*', _turtle("wilddata.js")).group(0))

    def test_paths_run_through_the_turtles(self):
        terrain = _turtle("terrain.js")
        self.assertIn("onTrail(x, z", terrain)
        self.assertIn("this.onTrail(x, z)", terrain)                 # a trail counts as a road: nothing is planted on it

    def test_the_turtles_are_the_chibi_model(self):
        self.assertIn('export { makeTurtle } from "./turtlemodel.js"', _turtle("terrain.js"))
        self.assertIn("export function makeTurtle", _turtle("turtlemodel.js"))


class TownsAndStory(unittest.TestCase):
    """the bigger turtles: towns laid out in rings with lamps, the story from Tarn's farm through every town turtle"""

    def test_every_town_kit_model_exists(self):
        wild = _turtle("wilddata.js")
        consts = dict(re.findall(r'(\w+) = "([\w/]+/)"', re.search(r"^const MV = .*$", wild, re.M).group(0)))
        kit = re.search(r"export const TOWN_KIT = \{.*?\n\};", wild, re.S).group(0)
        paths = re.findall(r"`\$\{(\w+)\}([\w.]+)`", kit)
        self.assertGreater(len(paths), 20)
        for c, file in paths:
            self.assertTrue(os.path.exists(os.path.join(UI, "general_asset_pack", consts[c] + file)), consts[c] + file)

    def test_towns_are_planned_and_dressed(self):
        world, towns = _turtle("world.js"), _turtle("towns.js")
        self.assertIn("planTown(cfg)", world)
        self.assertIn("await dressTown(L, addSolid)", world)
        self.assertIn("await lightRoads(L, addSolid)", world)
        self.assertIn('from "./wilddata.js"', towns)
        self.assertNotRegex(towns, r'"\w+_pack/')                  # pack paths stay in wilddata.js

    def test_every_carving_is_on_a_real_turtle(self):
        lands = set(re.findall(r"^  (\w+): \{ name: ", DATA, re.M))
        carvings = re.findall(r'\{ id: "(c\d)", land: "(\w+)"', DATA)
        self.assertEqual([c for c, _ in carvings], ["c1", "c2", "c3", "c4", "c5", "c6", "c7"])
        for cid, land in carvings:
            self.assertIn(land, lands, cid)

    def test_the_story_runs_through_every_arc_in_order(self):
        arcs = re.search(r"export const ARCS = \[(.*?)\];", DATA).group(1)
        self.assertEqual(len(re.findall(r'"[^"]+"', arcs)), 12)
        story = re.search(r"export const STORY = \[(.*?)\n\];", DATA, re.S).group(1)
        steps = re.findall(r'\{ id: "(\w+)", arc: (\d+)', story)
        ids = [i for i, _ in steps]
        self.assertEqual(len(ids), len(set(ids)))
        order = [int(a) for _, a in steps]
        self.assertEqual(order, sorted(order))                      # never jumps back an arc
        self.assertEqual(set(order), set(range(12)))

    def test_husband_and_wife(self):
        self.assertIn("Your turtle is Tarn", DATA)
        self.assertIn("Willowmere rides on Oma, his wife", DATA)

    def test_night_vision_and_render_setting(self):
        world, ui = _turtle("world.js"), _turtle("ui.js")
        self.assertIn('toggleBtn("🌙 Night vision", "nightVision")', ui)
        self.assertIn("G.cheat?.nightVision", world)
        self.assertIn('"Draw turtles"', ui)
        self.assertIn("function turtlesShown(G, focus)", world)


def _pack_file(rel):
    """an asset pack file, wherever its pack lives"""
    return any(os.path.exists(os.path.join(UI, base, rel)) for base in ("general_asset_pack", os.path.join("games", "asset_packs")))


class LivelierTurtles(unittest.TestCase):
    """one look per town, ponds and rivers, a living ecosystem, five cave maps, and a part in the story for every dinosaur"""

    def test_every_town_has_its_own_folk_and_they_exist(self):
        wild = _turtle("wilddata.js")
        consts = dict(re.findall(r'(\w+) = "([\w/]+/)"', wild))
        folk = re.search(r"export const TOWN_FOLK = \{(.*?)\n\};", wild, re.S).group(1)
        towns = re.findall(r"^  (\w+): ", folk, re.M)
        self.assertEqual(sorted(towns), ["dune", "ember", "frost", "mire", "palm"])
        self.assertIn("townModel(", _turtle("life.js") + _turtle("biomes.js") + _turtle("creatures.js"))
        for line in folk.splitlines():
            for names, c, ext in re.findall(r"\[([^\]]+)\]\.map\(\(n\) => `\$\{(\w+)\}\$\{n\}(\.\w+)`\)", line):
                for n in re.findall(r'"([^"]+)"', names):
                    self.assertTrue(_pack_file(consts[c] + n + ext), consts[c] + n + ext)

    def test_pond_fish_exist(self):
        wild = _turtle("wilddata.js")
        fish = re.findall(r"`\$\{PONDF\}([\w.]+)`", wild)
        self.assertEqual(len(fish), 5)
        for f in fish:
            self.assertTrue(_pack_file("conv_cute_fish_pack/" + f), f)

    def test_rivers_ponds_and_waterfalls(self):
        waters = _turtle("waters.js")
        for name in ("planWaters", "carve", "wetness", "drawWaters", "tickWaters", "tickMists"):
            self.assertRegex(waters, r"export (async )?function " + name)
        self.assertIn("drops", waters)                                # where a river falls far enough to be a waterfall
        self.assertIn("wetness", _turtle("explore.js"))                # cave mouths stay out of rivers and ponds
        self.assertIn("setWater(", _turtle("main.js"))                 # and you can hear the water as you walk up to it

    def test_animals_live_an_ecosystem(self):
        wild = _turtle("wildlife.js")
        for state in ('"graze"', '"drink"', '"sleep"', '"flee"', '"hunt"'):
            self.assertIn(state, wild)
        self.assertIn("const fireflies = ", wild)
        self.assertIn("POND_FISH", wild)

    def test_five_cave_maps(self):
        cave = _turtle("cave.js")
        maps = re.findall(r'\{ id: "(\w+)", name: "', re.search(r"export const CAVE_MAPS = \[(.*?)\n\];", cave, re.S).group(1))
        self.assertEqual(maps, ["warren", "descent", "cathedral", "gorge", "honeycomb"])

    def test_the_turtles_have_flippers(self):
        self.assertIn("flippers", _turtle("turtlemodel.js"))

    def test_every_dinosaur_has_a_part_in_the_story(self):
        dinos = re.search(r"export const DINOS = \{(.*?)\n\};", DATA, re.S).group(1)
        kinds = re.findall(r"^  (\w+): \{", dinos, re.M)
        roles = re.search(r"export const DINO_ROLES = \{(.*?)\n\};", DATA, re.S).group(1)
        self.assertEqual(sorted(re.findall(r"^  (\w+): \"", roles, re.M)), sorted(kinds))
        chorus = [int(n) for n in re.findall(r"\{ n: (\d+), gives", DATA)]
        self.assertEqual(chorus, sorted(chorus))
        self.assertEqual(chorus[-1], len(kinds))                      # the last reward is for every kind
        self.assertIn("D.chorus(w.species)", _turtle("dinos.js"))


if __name__ == "__main__":
    unittest.main()
