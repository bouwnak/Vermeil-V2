"""Picks the furniture and decor out of the general asset pack, and works out how big each piece really is.

  python game_tools/build_pack_furniture.py   -> ui/general_asset_pack/furniture.json (read by ui/packfurniture.js)

Needs the catalog (build_game_assets.py catalog) and the Blender scan (scan_models.py). Models come in any size, so every piece
gets a target from what it is: a chair 0.95 m tall, a bed 2 m long. The scale is target / measured size. Run this again after the pack changes.
"""
import json
import os
import re
import sys
from collections import Counter

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(PROJECT, "ui", "general_asset_pack")
SCAN = os.path.join(PROJECT, "data", "game", "model_scan.jsonl")
OUT = os.path.join(ASSETS, "furniture.json")

MAX_TRIS = 60000                                  # one piece heavier than this would slow a whole room down
MAX_HEIGHT = 2.6                                  # the room's ceiling
MAX_LENGTH = 3.2
# the longest side a piece of each kind may have, whatever its proportions: a stove modelled long and flat mustn't come out 3 m long
LONGEST = {"tables": 2.6, "seating": 2.7, "beds": 2.4, "shelves": 2.4, "kitchen": 2.2, "bathroom": 1.9, "decor": 2.2, "tech": 2.6, "gym": 2.8,
           "lights": 1.5, "plants": 1.6, "food": .5, "walls": 1.6, "outdoor": 3.2}
SMALL = .5                                        # a piece aimed at under this many metres stays small in every direction
# in these packs a "pot" is a cooking pot and a "ball" is a rice ball: the pack decides the kind of thing
FOLDER_DECIDES = {"pack_cooking_assets": "kitchen", "pack_charming_kitchen_set": "kitchen", "pack_food_kit": "food", "conv_ultimate_food_pack": "food",
                  "conv_junk_food_pack": "food", "pack_baked_goods": "food", "pack_makeup_assets": "decor"}
CEILING = 2.62

# never furniture, whatever pack it's in
NOT_FURNITURE = re.compile(
    r"\b(wall (plain|tiles?|modular)|plain wall|normal wall|red wood wall|shoji|flooring|tile|tiles|cobble|doorway|door frame|stairs?|"
    r"(?<!light )floor(?! lamp)|^door\b|\bdoor$|\b(double|single|wood|metal) door$|"
    r"window|windows|blinds|roof|leaf|leaves|branch|saucer|gun|rifle|pistol|revolver|shotgun|sniper|smg|ammo|grenade|bazooka|sword|axe|dagger|machete|"
    r"katana|spear|cutlass|blood|zombie|skeleton|character|characters|rabbit|panda|vehicle|car|truck|building|(?<!bird )house(?! ?plant)|damaged|broken|dead|"
    r"vent|outlet|switch|manhole|cctv|gundam|pokecat|mickey|ripoff|smoke|path|archway|cinder|crane|forklift|scaffolding|"
    r"burn victim|fucked|alien guy|baby|"
    r"counter o|side a|side b|gyoza|mouse trap)\b")

# (what the name says, category, measure "h"eight or "l"ength, metres, options)
RULES = [
    (r"oven (glove|mitt)|grater|champagne|dutch oven|paper ?towel|toaster oven|measuring", "kitchen", "h", .28, {}),
    (r"\bbunk", "beds", "h", 1.7, {}),
    (r"cabinet bed|night ?stand|end table", "shelves", "h", .55, {}),
    (r"\bbed\b|sleepbed", "beds", "l", 2.0, {}),
    (r"cabinet television", "tech", "h", .55, {}),
    (r"couch l\b", "seating", "l", 2.6, {"seat": "lounge"}),
    (r"loveseat|sofa individual|couch small|sofa small", "seating", "l", 1.3, {"seat": "lounge"}),
    (r"\bsofa|\bcouch|\blounge(?! design chair)", "seating", "l", 2.0, {"seat": "lounge"}),
    (r"armchair|arm chair|rocking", "seating", "h", .95, {"seat": "lounge1"}),
    (r"office chair|executive chair|chair desk", "seating", "h", 1.1, {"seat": "sit"}),
    (r"(bar|kitchen) stool", "seating", "h", .8, {"seat": "sit"}),
    (r"\bstool", "seating", "h", .5, {"seat": "sit"}),
    (r"\bchair", "seating", "h", .95, {"seat": "sit"}),
    (r"\bbench", "seating", "l", 1.5, {"seat": "sit"}),
    (r"coffee table|coffe table", "tables", "h", .45, {}),
    (r"table (fork|knife|spoon|plate)", "kitchen", "h", .1, {}),
    (r"side table|small table|table round small", "tables", "h", .6, {}),
    (r"table tennis paddle", "gym", "l", .26, {}),
    (r"table tennis", "gym", "l", 2.7, {}),
    (r"\btable\b", "tables", "h", .76, {}),
    (r"desk lamp|desk lamp|light desk", "lights", "h", .45, {}),
    (r"desk fan", "tech", "h", .35, {}),
    (r"desk toy", "decor", "h", .12, {}),
    (r"\bdesk", "tables", "h", .76, {}),
    (r"workbench", "tables", "h", .9, {}),
    (r"book ?(case|shelf)|medium book shelf|large book shelf|bookcase", "shelves", "h", 1.9, {}),
    (r"short ?closet", "shelves", "h", 1.3, {}),
    (r"wardrobe|closet", "shelves", "h", 2.0, {}),
    (r"dresser|\bdrawers?\b", "shelves", "h", 1.0, {}),
    (r"file cabinet|locker", "shelves", "h", 1.3, {}),
    (r"floating shelf|wall shelf|shelf small bottles", "shelves", "l", .8, {"mount": "wall", "y": 1.5}),
    (r"\bshel(f|ves)", "shelves", "h", 1.7, {}),
    (r"fridge small|can fridge", "kitchen", "h", .9, {}),
    (r"fridge|refrigerator|refrigirator", "kitchen", "h", 1.8, {}),
    (r"dish ?washer|washing machine|washer|dryer\b", "bathroom", "h", .9, {}),
    (r"induction|cooktop|hot ?plate", "kitchen", "l", .6, {}),
    (r"\boven\b|\bstove", "kitchen", "h", .9, {}),
    (r"\bhood\b", "kitchen", "l", .7, {"mount": "wall", "y": 1.8}),
    (r"upper|wall cabinet", "kitchen", "l", .6, {"mount": "wall", "y": 1.6}),
    (r"counter|base cabinet|kitchen (cabinet|\d drawers)|kitchen bar", "kitchen", "h", .9, {}),
    (r"bathroom (sink|cabinet)", "bathroom", "h", .85, {}),
    (r"\bsink\b", "kitchen", "h", .9, {}),
    (r"microwave", "kitchen", "l", .5, {}),
    (r"coffee machine|coffee maker", "kitchen", "h", .35, {}),
    (r"toaster|blender|air fryer|food processor|rice cooker", "kitchen", "h", .3, {}),
    (r"kettle", "kitchen", "h", .22, {}),
    (r"bathtub", "bathroom", "l", 1.7, {}),
    (r"toilet paper|tissue", "bathroom", "h", .12, {}),
    (r"toilet", "bathroom", "h", .8, {}),
    (r"shower", "bathroom", "h", 2.1, {}),
    (r"towel", "bathroom", "h", .5, {}),
    (r"hair dryer", "bathroom", "h", .2, {}),
    (r"bathroom mirror|\bmirror\b", "bathroom", "h", 1.0, {"mount": "wall", "y": 1.2, "mirror": 1}),
    (r"chandelier", "lights", "l", .9, {"hang": 1}),
    (r"ceiling (fan|lamp|light)|light ceiling|pendant|hanging lantern", "lights", "l", .6, {"hang": 1}),
    (r"floor lamp|light floor|lamp round floor|lamp square floor", "lights", "h", 1.7, {}),
    (r"street lantern|street lamp|garden lamp|lamp post|lamppost|post lantern", "outdoor", "h", 2.4, {}),
    (r"wall lantern|lantern wall|wall light|torch wall", "lights", "h", .4, {"mount": "wall", "y": 1.6}),
    (r"\blamp|light stand|bedside|light (small|cube|icosahedron)", "lights", "h", .5, {}),
    (r"candelabrum tall|candlestick stand", "lights", "h", 1.5, {}),
    (r"candle", "lights", "h", .25, {}),
    (r"lantern", "lights", "h", .35, {}),
    (r"torch", "lights", "h", 1.2, {}),
    (r"spot ?light", "lights", "h", .6, {}),
    (r"\btv\b|television", "tech", "l", 1.2, {}),
    (r"dual monitors|monitor|computer screen", "tech", "l", .55, {}),
    (r"computer keyboard|keyboard", "tech", "l", .45, {}),
    (r"computer|macbook|laptop(?! bag)", "tech", "l", .4, {}),
    (r"\bmouse(pad)?\b", "tech", "l", .12, {}),
    (r"printer", "tech", "h", .4, {}),
    (r"copier", "tech", "h", 1.2, {}),
    (r"speaker|\bbass speakers", "tech", "h", 1.0, {}),
    (r"radio|phone|headphones", "tech", "h", .15, {}),
    (r"large (monstera|yucca)", "plants", "h", 1.4, {}),
    (r"potted|house ?plant|monstera|yucca|sansevieria|zz plant|plant", "plants", "h", .9, {}),
    (r"cactus|cacti", "plants", "h", .6, {}),
    (r"bonsai", "plants", "h", .5, {}),
    (r"succulent|aeonium|air plant|venus", "plants", "h", .2, {}),
    (r"pothos", "plants", "h", .4, {}),
    (r"flower ?bed", "outdoor", "l", 1.6, {}),
    (r"flower ?pot|hanging flower|\bpots?\b", "plants", "h", .35, {}),
    (r"\bvase", "decor", "h", .4, {}),
    (r"\b(rug|carpet)", "decor", "l", 2.2, {"flat": 1}),
    (r"gymmat", "gym", "l", 1.8, {"flat": 1}),
    (r"curtain", "decor", "h", 2.1, {"mount": "wall", "y": .3}),
    (r"painting|wall art|picture frame|polaroid", "walls", "l", .8, {"mount": "wall", "y": 1.5}),
    (r"wall clock|analog clock", "walls", "l", .35, {"mount": "wall", "y": 1.9}),
    (r"grandfather", "decor", "h", 2.0, {}),
    (r"alarm clock", "decor", "h", .12, {}),
    (r"corkboard|whiteboard|message board|dry erase", "walls", "l", 1.2, {"mount": "wall", "y": 1.1}),
    (r"dartboard", "walls", "l", .45, {"mount": "wall", "y": 1.7}),
    (r"calend[ae]r", "walls", "l", .35, {"mount": "wall", "y": 1.5}),
    (r"fire exit", "walls", "l", .4, {"mount": "wall", "y": 2.0}),
    (r"horse statue|fox statue|statue", "decor", "h", 1.6, {}),
    (r"fountain", "outdoor", "l", 1.8, {}),
    (r"globe", "decor", "h", .4, {}),
    (r"telescope", "decor", "h", 1.3, {}),
    (r"trophy", "decor", "h", .35, {}),
    (r"book ?stand", "decor", "h", .3, {}),
    (r"book ?(stack|group)|\bbooks\b|binder|magazine|notebook|spellbook", "decor", "l", .3, {}),
    (r"\bbook\b", "decor", "l", .22, {}),
    (r"cardboard|\bbox\b|package", "decor", "l", .5, {}),
    (r"crate", "decor", "l", .7, {}),
    (r"barrel", "decor", "h", 1.0, {}),
    (r"\bchest", "decor", "l", .8, {}),
    (r"trash|\bbins?\b|dumpster", "decor", "h", .6, {}),
    (r"fire ?place", "decor", "l", 1.6, {}),
    (r"coat rack", "decor", "h", 1.8, {}),
    (r"guitar|\bbass\b|\blute\b", "decor", "h", 1.1, {}),
    (r"drum", "decor", "h", 1.1, {}),
    (r"flute", "decor", "l", .6, {}),
    (r"punching bag", "gym", "h", 1.7, {}),
    (r"treadmill", "gym", "h", 1.4, {}),
    (r"barbell", "gym", "l", 1.3, {}),
    (r"dumb ?b?ell", "gym", "l", .35, {}),
    (r"boxing|protein", "gym", "h", .3, {}),
    (r"\bball\b|football", "gym", "l", .24, {}),
    (r"baseball bat", "gym", "l", .9, {}),
    (r"pedestal|pillar", "decor", "h", 1.0, {}),
    (r"\b(plate|bowl|pan)\b", "kitchen", "l", .26, {}),
    (r"\b(mug|cup|glass|goblet|chalice|flute|pot)\b", "kitchen", "h", .12, {}),
    (r"gazebo", "outdoor", "l", 4.0, {"hub": 1}),
    (r"parasol", "outdoor", "h", 2.4, {}),
    (r"hedge", "outdoor", "l", 2.0, {"hub": 1}),
    (r"palm ?tree|\btree\b", "outdoor", "h", 5.0, {"hub": 1}),
    (r"\bbush", "outdoor", "h", .9, {}),
    (r"\bwell\b", "outdoor", "h", 1.8, {}),
    (r"\bflowers?\b", "outdoor", "h", .5, {}),
    (r"\bgrass\b", "outdoor", "h", .4, {}),
    (r"\bfern", "plants", "h", .6, {}),
    (r"\brock", "outdoor", "h", .6, {}),
    (r"market ?(stand|stall)|stall (empty|cart)", "outdoor", "l", 2.6, {"hub": 1}),
    (r"torii", "outdoor", "h", 3.5, {"hub": 1}),
    (r"grill|barbecue", "outdoor", "h", 1.0, {}),
    (r"bird ?house", "outdoor", "h", .5, {}),
    (r"chiminea", "outdoor", "h", 1.0, {}),
    (r"bonfire|campfire", "outdoor", "l", 1.0, {}),
    (r"\btent\b", "outdoor", "l", 3.0, {"hub": 1}),
    (r"\bhay\b", "outdoor", "l", 1.0, {}),
    (r"\bcart\b", "outdoor", "l", 2.0, {}),
    (r"fire hydrant", "outdoor", "h", .8, {}),
    (r"mailbox", "outdoor", "h", 1.2, {}),
    (r"vending", "kitchen", "h", 1.9, {}),
    (r"water cooler", "kitchen", "h", 1.4, {}),
    (r"sign", "decor", "h", 1.2, {}),
    (r"banner", "decor", "h", 1.6, {}),
    (r"cauldron|caldron", "decor", "h", .7, {}),
    (r"anvil", "decor", "h", .7, {}),
    (r"throne", "seating", "h", 1.6, {"seat": "sit"}),
    (r"altar|brazier|obelisk|gravestone|coffin|sarcophagus|weapon rack|tavern", "decor", "h", 1.3, {}),
    (r"treasure", "decor", "l", 1.0, {}),
    (r"skull|bone|ribcage|grave|pumpkin|jackolantern|shrine|plaque|crypt", "decor", "h", .5, {}),
    (r"dice", "decor", "h", .1, {}),
    (r"food ", "food", "h", .12, {}),
    (r"decoration", "decor", "h", .6, {}),
    (r"(fire extinguisher)", "decor", "h", .55, {}),
    (r"briefcase|laptop bag", "decor", "h", .35, {}),
    (r"stapler|pens?\b|pencil|eraser|glue|scissors|\bbrush", "decor", "h", .12, {}),
    (r"cushions?", "decor", "l", .45, {}),
]
RULES = [(re.compile(r), c, m, v, o) for r, c, m, v, o in RULES]

# packs where everything can stand in a room. Anything no rule above knows gets this.
FOLDER_DEFAULT = {
    "pack_makeup_assets": ("decor", "l", .12),
    "pack_baked_goods": ("food", "l", .16),
    "conv_junk_food_pack": ("food", "l", .16),
    "conv_ultimate_food_pack": ("food", "l", .16),
    "pack_food_kit": ("food", "l", .16),
    "pack_cooking_assets": ("kitchen", "l", .25),
    "pack_charming_kitchen_set": ("kitchen", "l", .25),
    "pack_christmas_kit": ("decor", "h", .4),
    "pack_halloween_bits": ("decor", "h", .5),
    "pack_crystal_pack": ("decor", "h", .5),
    "pack_coral_reef_kit": ("outdoor", "h", .8),
    "pack_signs_pack": ("decor", "h", 1.2),
    "pack_household_props_001": ("decor", "h", .35),
    "pack_ultimate_interior_props_pack": ("decor", "h", .35),
    "pack_house_plants_set": ("plants", "h", .5),
    "pack_low_poly_outdoor_decorations": ("outdoor", "h", 1.0),
    "pack_pretty_park_set": ("outdoor", "h", 1.0),
    "pack_concert_pack": ("tech", "h", 1.0),
}
# where a rule has to recognise the name: these packs are full of other things as well
RULES_ONLY = {
    "conv_furniture_pack", "conv_furniture_pack_2017", "conv_ultimate_house_interior_pack", "pack_furniture_kit", "pack_office_pack",
    "pack_witch_cottage_pack", "pack_modular_sushi_restaurant_kit", "sushi_restaurant_kit", "pack_modular_dungeons_pack", "conv_modular_dungeon_pack",
    "pack_medieval_village_pack", "conv_medieval_village_pack", "fantasy_props_megakit", "sci_fi_essentials_kit", "made", "pack_stylized_kit",
    "pack_minor_skilled_good_dino_deeds", "cyberpunk_game_kit_quaterniu", "ultimate_stylized_nature",
    "conv_ultimate_nature_pack", "pirate_kit",
}
# where only part of the name range is furniture at all
ONLY_NAMED = {
    "conv_ultimate_nature_pack": re.compile(r"^(PalmTree|CommonTree_\d|BirchTree_\d|Willow_\d|PineTree_\d|Flowers|Plant_)"),
    "pirate_kit": re.compile(r"PalmTree"),
    "sci_fi_essentials_kit": re.compile(r"^Prop_(Chair|Desk|Locker|Mug|Shelves|Crate|Barrel|Chest)"),
    "cyberpunk_game_kit_quaterniu": re.compile(r"^(TV|Computer|Sign|Light)"),
    "ultimate_stylized_nature": re.compile(r"^(Bush|Maple|Birch)"),
    "pack_minor_skilled_good_dino_deeds": re.compile(r"Bench|Fountain|Hedge|Planter|Plant_Big|Fern|Light_Stand|Flower_Group|Bush|Fish_Bowl|Eight_Vases|Sandbox|Market_Stalls|Fox_Statue|Common"),
    "sushi_restaurant_kit": re.compile(r"^(Environment|Decoration|Food)"),
    "pack_modular_sushi_restaurant_kit": re.compile(r"Bench|Cabinet|Chair|Counter|Fridge|Oven|Sofa|Stool|Table|Torii|Bowl|Plate|Pan|Pot|Bottle|Ramen|Udon|Salmon|Sushi|Nigiri|Dango|Onigiri"),
}
FOLDERS = set(FOLDER_DEFAULT) | RULES_ONLY
# these load with no visible shape in the browser (checked piece by piece in the preview)
SHOWS_NOTHING = {"pack_office_pack/Briefcase.glb", "pack_office_pack/Laptop_bag.glb", "pack_office_pack/Pens.glb", "pack_office_pack/Stapler.glb"}

def pretty(name):
    name = re.sub(r"_[A-Za-z0-9-]*\d[A-Za-z0-9-]*[A-Z][A-Za-z0-9-]*$|_[A-Za-z0-9-]*[A-Z][A-Za-z0-9-]*\d[A-Za-z0-9-]*$", "", name) if len(name) > 12 else name   # random ids some downloads carry
    name = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name.replace("_", " "))
    name = re.sub(r"^(Environment|Decoration|Prop|Props|Food) ", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:1].upper() + name[1:]


def folder_label(folder):
    return pretty(re.sub(r"^(conv|pack)_", "", folder)).title()


def classify(folder, name):
    """(category, measure, metres, options), or None if this isn't furniture or decor"""
    only = ONLY_NAMED.get(folder)
    if only and not only.search(name): return None
    text = re.sub(r"\s+", " ", re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name.replace("_", " "))).lower()
    text = re.sub(r"\b(prop|props|environment|decoration)\b ?", "", text).strip() or text
    if NOT_FURNITURE.search(text): return None
    for rx, cat, measure, metres, options in RULES:
        if rx.search(text): return cat, measure, metres, options
    if folder in FOLDER_DEFAULT:
        return (*FOLDER_DEFAULT[folder], {})
    return None


def seat_of(kind, w, h):
    seat = round(min(.6, h * .52), 2)
    if kind == "sit": return {"clip": "sit", "seat": seat, "at": [0, .02]}
    if kind == "lounge1": return {"clip": "lounge", "seat": round(min(.6, h * .48), 2), "at": [0, .08]}
    return {"clip": "lounge", "seat": seat, "at": [round(w * .22, 2), .12]}


def main():
    with open(os.path.join(ASSETS, "catalog.json"), encoding="utf-8") as f:
        models = json.load(f)["models"]
    scan = {}
    with open(SCAN, encoding="utf-8") as f:
        for line in f:
            try: r = json.loads(line)
            except ValueError: continue
            if "tris" in r: scan[r["file"]] = r
    items, skipped = [], Counter()
    for m in models:
        file = m["url"].split("general_asset_pack/", 1)[1]
        folder = file.split("/")[0]
        if folder not in FOLDERS or m.get("skinned"): continue
        r = scan.get(file)
        if not r: skipped["not scanned"] += 1; continue
        if r["tris"] > MAX_TRIS: skipped["too heavy"] += 1; continue
        if file in SHOWS_NOTHING: skipped["shows nothing"] += 1; continue
        got = classify(folder, m["name"])
        if not got: skipped["not furniture"] += 1; continue
        cat, measure, metres, opts = got
        cat = FOLDER_DECIDES.get(folder, cat)
        w0, d0, h0 = r["size"]                    # Blender's axes: the third one is up
        long0 = max(w0, d0)
        if min(long0, h0) <= 1e-5 and not opts.get("flat"): skipped["no size"] += 1; continue
        base = h0 if measure == "h" else long0
        if base <= 1e-5: skipped["no size"] += 1; continue
        s = metres / base
        hub = bool(opts.get("hub"))
        if not hub:                               # a tall thin model measured by length, or a wide one by height, can still come out huge
            if not opts.get("hang") and h0 * s > MAX_HEIGHT: s = (MAX_HEIGHT - .2) / h0
            longest = min(MAX_LENGTH, LONGEST.get(cat, MAX_LENGTH))
            if metres <= SMALL: longest = min(longest, metres * 2.5)
            if long0 * s > longest: s = longest / long0
            if metres <= SMALL and h0 * s > metres * 2.5: s = metres * 2.5 / h0
            if cat == "food": s = min(s, LONGEST["food"] / max(long0, h0))   # however it's modelled, a vegetable fits on a plate
        w, h, d = w0 * s, h0 * s, d0 * s
        mount = opts.get("mount", "floor")
        turn = None
        if mount == "wall":                       # a picture modelled lying down, or facing sideways, has to stand with its back on the wall
            if h0 < .25 * long0 and h0 < d0:
                turn, h, d = "up", d, h
            elif w0 < .35 * d0:
                turn, w, d = "side", d, w
        y = opts.get("y", 0)
        if opts.get("hang"): y = round(max(1.7, CEILING - h), 2)
        item = {"k": f"gp_{m['id']}", "l": pretty(m["name"]), "u": file, "c": cat, "m": mount, "s": round(s, 5),
                "b": [round(w, 3), round(h, 3), round(d, 3)], "y": y, "p": folder, "t": r["tris"]}
        if hub: item["hub"] = 1
        if opts.get("flat"): item["flat"] = 1
        if opts.get("mirror"): item["mirror"] = 1
        if turn: item["turn"] = turn
        if opts.get("seat"): item["seat"] = seat_of(opts["seat"], w, h)
        items.append(item)
    seen = Counter(i["l"] for i in items)
    used = Counter()
    for i in items:                               # the catalog shows names: two "Chair"s say which pack each is from
        if seen[i["l"]] > 1:
            i["l"] = f"{i['l']} ({folder_label(i['p'])})"
            used[i["l"]] += 1
            if used[i["l"]] > 1: i["l"] += f" {used[i['l']]}"
    items.sort(key=lambda i: i["k"])
    packs = {i["p"]: folder_label(i["p"]) for i in items}
    with open(OUT, "w", encoding="utf-8") as f:
        # small things are scaled up to a size you can see and click in the room (a 16 cm burger is lost in a 10 m room)
        floor = {"food": 0.32, "kitchen": 0.34, "decor": 0.32, "tech": 0.3, "bathroom": 0.32, "gym": 0.42, "lights": 0.34, "plants": 0.5,
                 "walls": 0.45, "outdoor": 0.45, "seating": 0.5, "tables": 0.5, "shelves": 0.5, "beds": 1.8}
        for it in items:
            m, lo = max(it["b"]), floor.get(it["c"])
            if lo and 0 < m < lo:
                it["b"] = [round(v * lo / m, 3) for v in it["b"]]
        json.dump({"packs": packs, "items": items}, f, separators=(",", ":"))
    print(len(items), "pieces,", dict(skipped))
    print(dict(Counter(i["c"] for i in items)))
    print(dict(Counter(i["p"] for i in items)))


if __name__ == "__main__":
    sys.exit(main())
