// wilddata.js - what the general asset pack adds to the turtles: wild animals, sea life, old giants, townsfolk, and more kinds of tree and plant for each biome.
// Just lists, so they're easy to change. Heights are metres; the model's own size doesn't matter, it's brought to this height when it loads.
const W = "pack_animals/", K = "pack_animal_kit/", SEA_PACK = "conv_animated_fish_pack/", D = "conv_dinosaur_animated_pack/";
const USN = "ultimate_stylized_nature/", SPK = "ultimate_space_kit/", HAB = "pack_space_habitat_kit/", CRY = "pack_crystal_pack/", COR = "pack_coral_reef_kit/", HAL = "pack_halloween_bits/", WIT = "pack_witch_cottage_pack/", PIR = "pirate_kit/", CUB = "cube_world/";

// [model, height, how many]. These walk about on the ground, all facing along +z as the packs made them
const rabbit = [`${K}Rabbit.glb`, 0.4, 5], deer = [`${K}Deer.glb`, 1.5, 3], stag = [`${K}Deer_2.glb`, 1.9, 1], fox = [`${K}Fox.glb`, 0.6, 2], duck = [`${K}Duck.glb`, 0.5, 4], frog = [`${K}Frog.glb`, 0.2, 5];
const scorpion = [`${W}Scorpion.glb`, 0.22, 4], crab = [`${W}Crab.glb`, 0.2, 5], turtle = [`${W}Turtle.glb`, 0.45, 3], goat = [`${W}Goat.glb`, 1.1, 4], wolf = [`${W}Wolf.glb`, 0.85, 3], monkey = [`${W}monkey.glb`, 0.7, 4];
export const WILD = {
  Meadow: [rabbit, deer, stag, fox, duck, frog, [`${K}Corgi.glb`, 0.5, 2], [`${K}Beagle.glb`, 0.55, 2], [`${K}Cat.glb`, 0.4, 2], [`${W}Hamster.glb`, 0.16, 3]],
  "Golden plains": [[`${W}Antelope.glb`, 1.5, 4], goat, [`${W}Ostrich.glb`, 2.2, 3], [`${W}Emu.glb`, 1.8, 3], [`${W}Kangaroo.glb`, 1.6, 3], [`${K}Bizon.glb`, 1.7, 3], rabbit],
  Desert: [[`${W}Arabian_wildcat.glb`, 0.45, 3], [`${W}Coyote.glb`, 0.7, 3], scorpion, [`${W}Salamander.glb`, 0.12, 4], [`${W}Rhino.glb`, 1.6, 2], [`${W}Elephant.glb`, 3, 2]],
  Frozen: [[`${K}Penguin.glb`, 0.9, 8], [`${W}Penguin.glb`, 1.1, 3], [`${W}Seal.glb`, 0.8, 4], [`${W}Walrus.glb`, 1.1, 3], wolf, [`${K}Bear.glb`, 1.5, 2]],
  Swamp: [frog, frog, turtle, [`${W}Capybara.glb`, 0.55, 4], [`${W}Raccoon.glb`, 0.4, 3], [`${W}Skunk.glb`, 0.4, 3], [`${W}Salamander.glb`, 0.12, 4], duck],
  Tropical: [monkey, [`${W}Baboon.glb`, 0.8, 3], [`${W}Tiger.glb`, 1.1, 2], [`${W}Koala.glb`, 0.7, 2], crab, turtle, [`${W}Lion.glb`, 1.1, 2]],
  Volcanic: [scorpion, [`${W}Porcupine.glb`, 0.4, 3], [`${W}Badger.glb`, 0.35, 3], [`${W}Salamander.glb`, 0.12, 5]],
  Ancient: [goat, wolf],
  "Wildflower meadow": [rabbit, rabbit, deer, fox, [`${W}Hamster.glb`, 0.16, 5], [`${K}Chick.glb`, 0.16, 5]],
  "Raptor jungle": [[`${W}Tiger.glb`, 1.1, 3], monkey, [`${W}Baboon.glb`, 0.8, 4], frog, turtle],
  "Ancient city": [goat, [`${W}Coyote.glb`, 0.7, 3], [`${K}Cat.glb`, 0.4, 5], wolf],
  Caverns: [[`${W}Badger.glb`, 0.35, 4], [`${W}Porcupine.glb`, 0.4, 3], scorpion, [`${K}Bear.glb`, 1.5, 2]],
  "Dino forest": [[`${K}Bear.glb`, 1.5, 2], stag, deer, fox, [`${K}Bizon.glb`, 1.7, 3], [`${W}Raccoon.glb`, 0.4, 3]],
  "Lagoon and reef": [crab, crab, turtle, turtle, [`${W}Seal.glb`, 0.8, 4], [`${W}Walrus.glb`, 1.1, 2]],
  "Cloud peaks": [goat, goat, wolf, stag],
  "Salt flats": [[`${W}Ostrich.glb`, 2.2, 4], scorpion, [`${W}Coyote.glb`, 0.7, 3]],
};

// [model, height, how many]. These keep to the air, circling over one spot
const butterfly = [`${W}Butterfly.glb`, 0.22, 6], bee = [`${W}Bee.glb`, 0.1, 5], dragonfly = [`${W}Dragonfly.glb`, 0.1, 5], songbird = [`${K}Bird_2.glb`, 0.16, 4], vulture = [`${W}Turkey_vulture.glb`, 0.7, 3];
export const FLYING = {
  Meadow: [butterfly, bee, songbird], "Golden plains": [butterfly, bee, songbird], Desert: [vulture], Swamp: [dragonfly, dragonfly], Tropical: [butterfly, [`${W}Parrot.glb`, 0.4, 4]], Volcanic: [vulture],
  Ancient: [vulture], "Wildflower meadow": [butterfly, butterfly, bee, bee], "Raptor jungle": [[`${W}Parrot.glb`, 0.4, 5], dragonfly], "Ancient city": [[`${W}Bird.glb`, 0.5, 4]], Caverns: [[`${W}Bird.glb`, 0.5, 3]], "Dino forest": [butterfly, songbird, dragonfly], "Lagoon and reef": [butterfly], "Cloud peaks": [vulture], "Salt flats": [vulture],
};

// [model, height, how many, how far under the water]. Every turtle has these swimming round it
const dolphin = [`${SEA_PACK}Dolphin.glb`, 0.75, 2, 0.5], manta = [`${SEA_PACK}Manta ray.glb`, 0.28, 2, 1], shark = [`${SEA_PACK}Shark.glb`, 0.85, 1, 1], whale = [`${SEA_PACK}Whale.glb`, 2.6, 1, 2], tuna = [`${SEA_PACK}Fish1.glb`, 0.4, 3, 0.8], regal = [`${SEA_PACK}Fish2.glb`, 0.6, 3, 0.7], clown = [`${SEA_PACK}Fish3.glb`, 0.45, 3, 0.7], jelly = [`${W}Jellyfish.glb`, 0.9, 3, 0.7], narwhal = [`${W}Narwhal.glb`, 0.6, 1, 0.8], octopus = [`${W}Octopus.glb`, 0.6, 1, 1.1];
export const SEA_LIFE = { default: [dolphin, tuna, jelly, whale], Tropical: [dolphin, manta, regal, clown, jelly, shark], "Lagoon and reef": [dolphin, manta, regal, clown, jelly, octopus, whale], Frozen: [narwhal, whale, tuna], Swamp: [tuna, octopus], Volcanic: [shark, tuna] };

// [model, height, how many]. The old giants: they walk the far turtles as they please, and take no notice of you
const raptor = [`${D}Velociraptor.glb`, 1.15, 3], para = [`${D}Parasaurolophus.glb`, 2.8, 3], stego = [`${D}Stegosaurus.glb`, 2.7, 2], trike = [`${D}Triceratops.glb`, 2.3, 2], rex = [`${D}Trex.glb`, 4.2, 1], long = [`${D}Apatosaurus.glb`, 4.5, 2];
export const GIANTS = { Ancient: [long, stego, para, trike], "Raptor jungle": [raptor, raptor, raptor, rex, para], "Dino forest": [long, long, trike, stego, para, raptor, rex], "Ancient city": [para, trike, stego, long], "Wildflower meadow": [para, para, trike],
  "Salt flats": [long, trike], Caverns: [stego, trike], "Lagoon and reef": [long, para], "Cloud peaks": [para, stego], Tropical: [raptor, para], Swamp: [para, stego], Desert: [trike], Volcanic: [trike, stego] };

/** more faces in the towns' crowds: all of them have idle and walk. One in three of a town's people is one of these */
const UAC = "ultimate_animated_character_/", CUTE = "pack_cutes_part_one/";
export const TOWNSFOLK = [...["Casual_Female", "Casual_Male", "Casual2_Female", "Casual2_Male", "Casual3_Female", "Casual3_Male", "Chef_Female", "Chef_Male", "Cowboy_Female", "Cowboy_Male", "Doctor_Female_Young", "Doctor_Male_Old", "Kimono_Female", "Kimono_Male", "OldClassy_Female", "OldClassy_Male", "Suit_Female", "Worker_Female", "Worker_Male", "Viking_Female"].map((n) => `${UAC}${n}.gltf`),
  ...["Man", "Man_2", "Man_in_Long_Sleeves"].map((n) => `pack_animated_men_pack/${n}.glb`), ...["Female_Alternative", "Female_Casual", "Female_Dress", "Female_TankTop"].map((n) => `conv_animated_women_characters/${n}.glb`),
  ...["Citizen_1", "Citizen_2", "Citizen_3", "Food_Worker", "Generic_Female", "Generic_Male", "Retail_Worker"].map((n) => `${CUTE}${n}.glb`)];

/** [model, height]: the little fish in the turtles' ponds and lakes */
const PONDF = "conv_cute_fish_pack/";
export const POND_FISH = [[`${PONDF}Koi.glb`, 0.4], [`${PONDF}Goldfish.glb`, 0.3], [`${PONDF}BlueGoldfish.glb`, 0.3], [`${PONDF}Tetra.glb`, 0.22], [`${PONDF}Betta.glb`, 0.26]];

/** one look per town: everyone in a town is drawn from the same set of models, so each town has its own people.
 *  Willowmere isn't here: its people wear the same modular outfits as the player */
const CUBE = "cube_world/", RPG = "rpg_characters/", MEN = "pack_animated_men_pack/", WOMEN = "conv_animated_women_characters/";
export const TOWN_FOLK = {
  dune: ["Cowboy_Female", "Cowboy_Male", "Casual_Female", "Casual_Male", "Casual2_Female", "Casual2_Male", "Chef_Female", "Chef_Male", "Worker_Female", "Worker_Male", "OldClassy_Female", "OldClassy_Male", "Kimono_Female", "Kimono_Male"].map((n) => `${UAC}${n}.gltf`),
  frost: ["Character_Female_1", "Character_Female_2", "Character_Male_1", "Character_Male_2"].map((n) => `${CUBE}${n}.gltf`),
  mire: ["Cleric", "Monk", "Ranger", "Rogue", "Wizard", "Warrior"].map((n) => `${RPG}${n}.gltf`),
  palm: ["Citizen_1", "Citizen_2", "Citizen_3", "Food_Worker", "Generic_Female", "Generic_Male", "Retail_Worker"].map((n) => `${CUTE}${n}.glb`),
  ember: [...["Man", "Man_2", "Man_in_Long_Sleeves"].map((n) => `${MEN}${n}.glb`), ...["Female_Alternative", "Female_Casual", "Female_Dress", "Female_TankTop"].map((n) => `${WOMEN}${n}.glb`)],
};
/** the model for a town's i-th person, or null where the town wears the player's own outfits */
export const townModel = (id, i) => { const l = TOWN_FOLK[id]; return l ? l[i % l.length] : null; };

// [model, how many, height, how wide its trunk is (0: walk through it), lowest ground it can grow on]. On top of what each biome already grows
const flowers = [`${USN}Flower_1_Clump.gltf`, `${USN}Flower_2_Clump.gltf`, `${USN}Flower_3_Clump.gltf`, `${USN}Flower_4_Clump.gltf`, `${USN}Flower_5_Clump.gltf`];
const bloom = (n, h = 0.5) => flowers.map((f) => [f, n, h, 0]);
const nDot = (name, list) => list.map((k) => `${name}${k}.gltf`);
// Only trees and plants that belong together: the nature packs, drawn in the same soft low-poly way as everything else on the turtles
const GRW = "conv_ultimate_nature_pack/", MGK = "stylized_nature_megakit/", TRE = "conv_textured_stylized_trees/";
const nGlb = (name, list) => list.map((k) => `${name}${k}.glb`);
export const MORE_FLORA = {
  Meadow: [...nDot(`${USN}MapleTree_`, [1, 2, 3]).map((p) => [p, 7, 8, 0.7]), [`${USN}MapleTree_4.gltf`, 9, 8, 0.8], ...nDot(`${USN}BirchTree_`, [1, 3]).map((p) => [p, 6, 8, 0.5]), [`${USN}Bush_Flowers.gltf`, 24, 1.1, 0], [`${USN}Bush_Small_Flowers.gltf`, 20, 0.9, 0], [`${MGK}Bush_Common_Flowers.gltf`, 18, 1.2, 0], ...bloom(26)],
  "Golden plains": [[`${MGK}CommonTree_2.gltf`, 14, 4.5, 0.5], [`${MGK}CommonTree_4.gltf`, 12, 6, 0.6], [`${USN}BirchTree_2.gltf`, 10, 8, 0.5], [`${USN}Bush_Large_Flowers.gltf`, 16, 1.5, 0], [`${USN}Flower_1_Clump.gltf`, 26, 0.8, 0], [`${USN}Flower_2_Clump.gltf`, 26, 0.9, 0], [`${GRW}Wheat.glb`, 30, 1.1, 0], ...bloom(14)],
  Desert: [...nGlb(`${GRW}Cactus_`, [1, 3, 5]).map((p) => [p, 10, 3, 0.4]), ...nGlb(`${GRW}CactusFlowers_`, [2, 4]).map((p) => [p, 10, 1.6, 0.3]), [`${USN}DeadTree_5.gltf`, 8, 3, 0.4], [`${USN}DeadTree_9.gltf`, 6, 3.5, 0.4], ...nGlb(`${GRW}Rock_`, [2, 5]).map((p) => [p, 10, 1.4, 0.6])],
  Frozen: [...nGlb(`${GRW}PineTree_Snow_`, [2, 4]).map((p) => [p, 12, 7, 0.6]), ...nGlb(`${GRW}BirchTree_Snow_`, [1, 3]).map((p) => [p, 8, 6, 0.5]), ...nGlb(`${GRW}Rock_Snow_`, [1, 4, 6]).map((p) => [p, 8, 1.3, 0.6]), [`${CRY}crystal_23.glb`, 6, 1.6, 0.4], [`${CRY}crystal_28.glb`, 6, 1.2, 0.3]],
  Swamp: [...nGlb(`${GRW}Willow_`, [2, 4]).map((p) => [p, 10, 7, 0.6]), ...nGlb(`${GRW}Willow_Dead_`, [1, 3]).map((p) => [p, 8, 6, 0.5]), ...nDot(`${MGK}TwistedTree_`, [2, 4]).map((p) => [p, 8, 6, 0.5]), [`${WIT}Cattail.glb`, 40, 1.5, 0, 3], [`${MGK}Mushroom_Common.gltf`, 24, 0.7, 0], [`${MGK}Mushroom_Laetiporus.gltf`, 20, 0.5, 0], [`${GRW}WoodLog_Moss.glb`, 10, 0.7, 0.5], [`${GRW}TreeStump_Moss.glb`, 10, 0.8, 0.5]],
  Tropical: [...nDot(`${PIR}Environment_PalmTree_`, [1, 2, 3]).map((p) => [p, 14, 7, 0.5]), ...nGlb(`${GRW}PalmTree_`, [1, 3]).map((p) => [p, 10, 8, 0.5]), [`${USN}Bush_Large.gltf`, 18, 2, 0], [`${USN}Bush_Large_Flowers.gltf`, 22, 1.6, 0], [`${USN}Bush_Flowers.gltf`, 22, 1.1, 0], ...["Set", "Set3", "Set5"].map((k) => [`${COR}Coral_Reef_${k}.glb`, 4, 1, 0, 0.8]), ...bloom(12)],
  Volcanic: [...nGlb(`${GRW}CommonTree_Dead_`, [2, 4]).map((p) => [p, 10, 5, 0.5]), ...nDot(`${USN}DeadTree_`, [2, 6, 8]).map((p) => [p, 6, 4, 0.4]), ...nGlb(`${GRW}Rock_`, [1, 4, 7]).map((p) => [p, 10, 1.8, 0.7]), [`${CRY}Crystal_3.glb`, 6, 2.4, 0.6]],
  Ancient: [...nDot(`${MGK}TwistedTree_`, [1, 3, 5]).map((p) => [p, 8, 9, 0.7]), ...nGlb(`${GRW}Willow_`, [1, 5]).map((p) => [p, 6, 9, 0.7]), [`${USN}Bush_Large.gltf`, 20, 2, 0], [`${GRW}Rock_Moss_2.glb`, 10, 1.6, 0.6], [`${GRW}WoodLog_Moss.glb`, 8, 0.8, 0.5]],
  "Wildflower meadow": [...bloom(40), [`${USN}Bush_Flowers.gltf`, 26, 1.1, 0], [`${USN}Bush_Large_Flowers.gltf`, 18, 1.6, 0], ...nDot(`${USN}BirchTree_`, [4, 5]).map((p) => [p, 8, 7, 0.5]), [`${USN}MapleTree_4.gltf`, 8, 6, 0.6], [`${MGK}Bush_Common_Flowers.gltf`, 24, 1.2, 0]],
  "Raptor jungle": [[`${GRW}CommonTree_3.glb`, 20, 10, 0.9], [`${MGK}Bush_Common.gltf`, 24, 2.2, 0], [`${GRW}Bush_1.glb`, 20, 2.8, 0], [`${USN}Bush_Large.gltf`, 26, 2, 0], [`${WIT}Cattail.glb`, 20, 1.5, 0, 3], [`${MGK}Plant_1_Big.gltf`, 24, 2.4, 0], [`${MGK}Plant_7_Big.gltf`, 24, 2.2, 0]],
  "Ancient city": [...nDot(`${MGK}CommonTree_`, [3, 5]).map((p) => [p, 5, 7, 0.6]), ...nDot(`${MGK}CommonTree_`, [1, 2, 4]).map((p) => [p, 5, 7, 0.6]), ...nDot(`${MGK}Pine_`, [3, 4]).map((p) => [p, 5, 8, 0.5]), [`${USN}DeadTree_1.gltf`, 4, 6, 0.5], [`${USN}Bush.gltf`, 20, 1.2, 0], [`${USN}Bush_Large.gltf`, 14, 1.8, 0], [`${GRW}Rock_Moss_4.glb`, 10, 1.2, 0.5]],
  Caverns: [...nGlb(`${GRW}Rock_Moss_`, [1, 3, 5, 7]).map((p) => [p, 8, 2.4, 0.8]), [`${CRY}crystal_28.glb`, 14, 1.6, 0.4], [`${CRY}crystal_23.glb`, 14, 2, 0.5], [`${MGK}Mushroom_Laetiporus.gltf`, 20, 0.8, 0], [`${MGK}Mushroom_Common.gltf`, 20, 0.5, 0], [`${GRW}TreeStump_Moss.glb`, 8, 0.8, 0.5]],
  "Dino forest": [[`${USN}MapleTree_2.gltf`, 22, 12, 1], [`${GRW}CommonTree_5.glb`, 22, 11, 1], [`${USN}MapleTree_5.gltf`, 14, 10, 0.8], [`${USN}Bush_Large.gltf`, 26, 2, 0], [`${GRW}Bush_2.glb`, 24, 2.2, 0], [`${GRW}WoodLog_Moss.glb`, 12, 0.9, 0.6]],
  "Lagoon and reef": [...nDot(`${PIR}Environment_PalmTree_`, [1, 2, 3]).map((p) => [p, 10, 7, 0.5]), ...["Set", "Set2", "Set3", "Set4", "Set5", "Set6"].map((k) => [`${COR}Coral_Reef_${k}.glb`, 5, 1.1, 0, 0.8]), [`${USN}Bush_Flowers.gltf`, 18, 1.1, 0], [`${USN}Bush_Large_Flowers.gltf`, 12, 2, 0]],
  "Cloud peaks": [...nGlb(`${GRW}PineTree_`, [1, 3, 5]).map((p) => [p, 10, 8, 0.6]), ...nDot(`${MGK}Pine_`, [2, 4]).map((p) => [p, 8, 7, 0.6]), [`${CRY}crystal_9.glb`, 4, 2, 0.5], [`${GRW}Rock_Moss_6.glb`, 10, 1.6, 0.6]],
  "Salt flats": [...nGlb(`${GRW}Cactus_`, [2, 4]).map((p) => [p, 8, 2, 0.3]), [`${CRY}crystal_23.glb`, 12, 2.2, 0.5], [`${CRY}Crystal_3.glb`, 8, 3, 0.6], [`${USN}DeadTree_3.gltf`, 6, 4, 0.5], [`${GRW}Rock_3.glb`, 10, 1.2, 0.5]],
};

// the Shellwrights' stonework from the dungeon kit, for Pillarback's streets and the catacombs under the far turtles; and the lights you carry into the dark
const DUN = "conv_modular_dungeon_pack/";
export const RUIN_PARTS = { column: `${DUN}Column.glb`, broken: `${DUN}Column_Broken.glb`, broken2: `${DUN}Column_Broken2.glb`, wall: `${DUN}ModularStoneWall.glb`, stairs: `${DUN}Stairs.glb`, rocks: `${DUN}WallRocks.glb`,
  bones: `${DUN}Bones.glb`, bones2: `${DUN}Bones2.glb`, chest: `${DUN}Chest_gold.glb`, candles: `${DUN}Candelabrum_tall.glb`, wallTorch: `${DUN}Torch_wall.glb`, barrel: `${DUN}Barrel.glb`, rock: [1, 2, 3, 4, 5].map((k) => `${DUN}Rock${k}.glb`) };
export const LIGHT_PARTS = { torch: "conv_survival_pack/WoodenTorch_Fire.glb", flashlight: "conv_ultimate_gun_pack/Flashlight.glb" };

/** every model named here, without repeats: for the test floor and the dropdown of packs */
export const uniqueModels = (table) => [...new Map(Object.values(table).flat().map((e) => [e[0], e])).values()];
export const WILD_PATHS = () => [...new Set([...uniqueModels(WILD), ...uniqueModels(FLYING), ...uniqueModels(SEA_LIFE), ...uniqueModels(GIANTS)].map((e) => e[0]).concat(TOWNSFOLK, ...Object.values(TOWN_FOLK), POND_FISH.map((f) => f[0])))];
export const FLORA_PATHS = () => [...new Set(uniqueModels(MORE_FLORA).map((e) => e[0]))];

// ---------------- the towns' new quarters (towns.js): the medieval village kit, lamp posts and the things people leave outside their doors ----------------
// [model, height in metres, how much room it takes (radius)]
const MV = "conv_medieval_village_pack/", MADE = "made/", FPK = "fantasy_props_megakit/", NAT = "conv_ultimate_nature_pack/";
export const TOWN_KIT = {
  houses: [[`${MV}House_1.glb`, 8.6, 4.6], [`${MV}House_2.glb`, 8.6, 4.6], [`${MV}House_3.glb`, 8.6, 4.6], [`${MV}House_4.glb`, 8.6, 4.6]],
  landmarks: [[`${MV}Inn.glb`, 10.5, 7], [`${MV}Bell_Tower.glb`, 16, 4.6], [`${MV}Blacksmith.glb`, 8, 6.2], [`${MV}Stable.glb`, 6.5, 6.6], [`${MV}Mill.glb`, 13, 6.4], [`${MV}Gazebo.glb`, 5, 4]],
  lamp: [`${MADE}LampPost.glb`, 3.8], sign: [`${MADE}SignPost.glb`, 2.6],
  stands: [[`${MV}MarketStand_1.glb`, 3.2, 2.2], [`${MV}MarketStand_2.glb`, 3.2, 2.2]],
  props: [[`${MV}Barrel.glb`, 1.15, 0.6], [`${MV}Crate.glb`, 0.95, 0.65], [`${MV}Bench_1.glb`, 0.95, 1.2], [`${MV}Cart.glb`, 1.9, 1.7], [`${MV}Hay.glb`, 1.1, 1], [`${MV}Bags.glb`, 0.8, 0.7], [`${FPK}Barrel_Apples.gltf`, 1.2, 0.6]],
  flowers: ["stylized_nature_megakit/Flower_3_Group.gltf", "stylized_nature_megakit/Flower_4_Group.gltf"],
  well: [`${MV}Well.glb`, 3.2, 1.8], fence: [`${MV}Fence.glb`, 1.1, 1.2],
  trees: { default: [`${NAT}CommonTree_1.glb`, `${NAT}CommonTree_2.glb`, `${NAT}BirchTree_1.glb`, `${NAT}Bush_1.glb`], snow: [`${NAT}CommonTree_Snow_1.glb`, `${NAT}PineTree_Snow_1.glb`, `${NAT}Bush_Snow_1.glb`], dry: [`${NAT}PalmTree_1.glb`, `${NAT}Bush_1.glb`], dead: [`${NAT}CommonTree_Dead_1.glb`, `${NAT}BirchTree_Dead_1.glb`] },
};

/** what the walk-in shops (shops.js) are furnished with: [model, height in metres] */
const HP = "pack_house_plants_set/", BG = "pack_baked_goods/";
export const SHOP_KIT = {
  mug: [`${FPK}Mug.gltf`, 0.16], bottle: [`${FPK}Bottle_1.gltf`, 0.34], bottles: [`${FPK}SmallBottles_1.gltf`, 0.24], chalice: [`${FPK}Chalice.gltf`, 0.22],
  stool: [`${FPK}Stool.gltf`, 0.62], chair: [`${FPK}Chair_1.gltf`, 1], bench: [`${FPK}Bench.gltf`, 0.5], barrel: [`${FPK}Barrel.gltf`, 1.05], keg: [`${FPK}Barrel_Holder.gltf`, 1.3],
  lantern: [`${FPK}Lantern_Wall.gltf`, 0.6], candles: [`${FPK}CandleStick_Triple.gltf`, 0.4], candle: [`${FPK}Candle_1.gltf`, 0.2],
  cauldron: [`${FPK}Cauldron.gltf`, 0.6], pot: [`${FPK}Pot_1.gltf`, 0.32], vase: [`${FPK}Vase_2.gltf`, 0.36], jar: [`${FPK}Vase_4.gltf`, 0.3], crate: [`${FPK}Crate_Wooden.gltf`, 0.7],
  apples: [`${FPK}FarmCrate_Apple.gltf`, 0.5], carrots: [`${FPK}FarmCrate_Carrot.gltf`, 0.5], banner: [`${FPK}Banner_1.gltf`, 2],
  plantsBig: [[`${HP}Large_Monstera_Plant.glb`, 1.7], [`${HP}Large_Yucca.glb`, 1.9], [`${HP}sansevieria_plant_large.glb`, 1.1], [`${HP}ZZ_Plant_Pot.glb`, 1], [`${HP}pothos_plant_large_potted.glb`, 1]],
  plantsSmall: [[`${HP}Cactus_Pot.glb`, 0.36], [`${HP}Small_Cacti_Pot.glb`, 0.28], [`${HP}Green_Succulent.glb`, 0.11], [`${HP}Pink_Succulent.glb`, 0.11], [`${HP}monstera_plant_small_potted.glb`, 0.42],
    [`${HP}pothos_plant_small_potted.glb`, 0.36], [`${HP}Small_ZZ_Plant.glb`, 0.4], [`${HP}sansevieria_plant_small_potted.glb`, 0.4], [`${HP}succulent_plant_pot_small.glb`, 0.16]],
  pots: [`${HP}Pots_Stacked.glb`, 0.5], can: [`${HP}Watering_Can.glb`, 0.3], trowel: [`${HP}Hand_Shovel.glb`, 0.08],
  bakes: [[`${BG}Bread.glb`, 0.16], [`${BG}Croissant.glb`, 0.1], [`${BG}Cinnamon_Roll.glb`, 0.08], [`${BG}Cupcake.glb`, 0.13], [`${BG}Donut_Pink.glb`, 0.06], [`${BG}Muffin.glb`, 0.12],
    [`${BG}Pie_Apple.glb`, 0.09], [`${BG}Cake_Strawberry.glb`, 0.22], [`${BG}Cake_Chocolate.glb`, 0.22], [`${BG}Donut_Chocolate.glb`, 0.06], [`${BG}Waffle_Stacked.glb`, 0.12]],
  loaves: [[`${BG}Baguette.glb`, 0.1], [`${BG}Bread.glb`, 0.16], [`${BG}Bread_Roll.glb`, 0.08]],
  slice: [`${BG}Cake_Strawberry_Slic.glb`, 0.1],
};
