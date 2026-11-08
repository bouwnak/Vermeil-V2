// hubdecor.js - dresses the official hubs with the general asset pack, so none of them looks plain.
// Every hub is built by hubs.js as before, then dressHub() adds the pack's pieces around what's already there:
//  - the same hub always comes out the same (seeded), so two players in one hub see one hub
//  - pieces are picked by name from whatever is installed: without the pack a hub is just plainer, nothing breaks
//  - nothing goes where it would block the way: after each solid piece, everything you could reach before must still be reachable
import { CATALOG } from "./cozyroom.js";

const MAX_PIECE_TRIS = 20000;              // one piece heavier than this isn't worth it as background
const MAX_HUB_TRIS = 900000;               // a whole hub's decor has to stay cheap to draw (the hubs are big now)
const STEP = 0.25;                         // metres: the grid used to check you can still walk everywhere
const BODY = 0.32;                         // how much room a walker needs around things (same as room.js)
const REACH = 1.2;                         // close enough to use a seat or talk to someone

// how much floor the hub's own pieces take: [wide, deep]. The rest are about 0.6 x 0.6
const HUB_SIZE = {
  hubLongTable: [1.1, 4.2], hubBookcase: [2, 0.42], hubColumn: [0.5, 0.5], hubCabinet: [0.8, 0.7], hubStall: [3, 3], hubPavilion: [7.5, 5.5],
  hubDisplayWall: [4.4, 0.3], hubCafeTable: [0.9, 0.9], hubRoundTable: [1.1, 1.1], hubCafeSofa: [2, 0.9], hubArmchair: [0.9, 0.9], hubBench: [1.7, 0.6],
  hubPlanter: [2, 0.6], hubTree: [0.7, 0.7], hubBollard: [0.3, 0.3], hubLantern: [0.4, 0.4], hubLounger: [0.7, 1.7], hubModSofa: [2.4, 0.9], hubLowTable: [1.2, 0.7],
  hubHourglass: [0.5, 0.5], hubDune: [5, 3], hubGalleryBench: [1.8, 0.5], hubPlinth: [0.62, 0.62], hubStudyDesk: [1.6, 0.8], hubLightChair: [0.5, 0.5], hubCafeChair: [0.5, 0.5], hubStool: [0.4, 0.4],
  hubStudyDoor: [1.2, 0.3], hubCounter: [6, 0.75], stGacha: [1.5, 1.5], stBlossom: [2.2, 2.2],
};
// how far a tree's crown spreads (radius, m): two crowns never grow into each other
const CROWN = { bcPalm: 3, mhBlossom: 3.4, hubTree: 1.8, stBlossom: 1.6, pkBlossom: 3 };
const NOT_IN_THE_WAY = new Set(["hubGround", "hubLawn", "hubSea", "hubDeck", "hubRug", "hubBeam", "hubSlats", "hubPendant", "hubNeon", "hubBanner", "hubClerestory", "hubRail", "hubPainting", "hubChalkboard", "hubJarShelf", "stHall", "stWallBanner", "stAisleBanner", "bcSand", "bcSea", "bcSun", "bcIsland", "bcBoat", "bcBuoys", "bcLightCanopy", "bcShells", "bcTowel"]);
const NEVER = /fucked|burn_victim|ripoff|gundam|pokecat|mickey|skull|bone|coffin|grave|ribcage|blood|zombie|corpse/i;

function seededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h |= 0; h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Everything in the pack that may be used as hub decor: [type, def]. */
let packPieces = null;
function pieces() {
  packPieces ??= Object.entries(CATALOG).filter(([, def]) => def.pack && def.size && (def.tris || 0) <= MAX_PIECE_TRIS && !NEVER.test(def.file));
  return packPieces;
}
/** The pieces whose file matches: pick("park_set/Tree", /Maple/) */
const pick = (...names) => {
  const rx = names.map((n) => (n instanceof RegExp ? n : new RegExp(n, "i")));
  return pieces().filter(([, def]) => rx.some((r) => r.test(def.file)));
};

/** a piece's own collider rectangles [x0, z0, x1, z1] (its local floor), turned and moved to where it stands: {x, z, w, d} boxes */
function colliderBoxes(it, def) {
  const r = it.rot || 0, c = Math.cos(r), s = Math.sin(r);
  return (def.colliders(it) || []).map(([x0, z0, x1, z1]) => {
    const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => [it.x + x * c + z * s, it.z - x * s + z * c]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const ax = Math.min(...xs), bx = Math.max(...xs), az = Math.min(...zs), bz = Math.max(...zs);
    return { x: (ax + bx) / 2, z: (az + bz) / 2, w: bx - ax, d: bz - az };
  });
}

class Dresser {
  constructor(hub, seed) {
    this.hub = hub;
    this.items = hub.layout.items;
    this.rand = seededRandom(seed);
    const { w, d } = hub.layout.shell.house;
    this.b = { x0: -w / 2, x1: w / 2, z0: -4, z1: d - 4 };
    this.nx = Math.round((this.b.x1 - this.b.x0) / STEP);
    this.nz = Math.round((this.b.z1 - this.b.z0) / STEP);
    this.boxes = [];                       // what the walk check goes round
    this.taken = [];                       // the floor already used, solid or not
    this.keepOut = [];                     // [x, z, r]: no decor here
    this.targets = [];                     // what must stay reachable
    this.crowns = [];                      // [x, z, r]: tree crowns already standing
    this.tris = 0;
    this.added = 0;
    for (const it of this.items) {
      if (it.wall || NOT_IN_THE_WAY.has(it.type)) continue;
      const def = CATALOG[it.type];
      if (!def) continue;
      if (CROWN[it.type]) this.crowns.push([it.x, it.z, CROWN[it.type]]);
      const own = def.colliders && !HUB_SIZE[it.type] ? colliderBoxes(it, def).filter((b) => b.w < 40 && b.d < 40) : [];
      if (own.length) {                                          // a piece that says exactly what floor it takes (walls, exhibits, palms, towers)
        for (const box of own) { this.taken.push(box); if ((it.y || 0) <= 1) this.boxes.push(box); }
        if (it.chat || it.act || def.act || def.seat) this.targets.push([it.x, it.z]);
        continue;
      }
      if (def.flat) continue;
      const [sw, sd] = it.type === "hubCounter" ? [it.w || 6, 0.75] : HUB_SIZE[it.type] || [0.6, 0.6];
      const turned = Math.abs(Math.sin(it.rot || 0)) > 0.7;
      const box = { x: it.x, z: it.z, w: turned ? sd : sw, d: turned ? sw : sd };
      this.taken.push(box);
      if ((it.y || 0) <= 1) this.boxes.push(box);
      if (it.chat || it.act || def.seat) this.targets.push([it.x, it.z]);
    }
    for (const p of hub.people || []) { this.targets.push([p.x, p.z]); this.keepOut.push([p.x, p.z, 0.8]); }
    this.spawn = hub.spawn;
    this.keepOut.push([hub.spawn[0], hub.spawn[1], 1.2]);
    const seen = this._reachable(this.boxes);
    this.targets = this.targets.filter((t) => this._near(t, seen));   // only what you could already get to has to stay that way
  }

  _near(t, seen) {
    const n = Math.ceil(REACH / STEP), row = this.nz + 1;
    const cx = Math.round((t[0] - this.b.x0) / STEP), cz = Math.round((t[1] - this.b.z0) / STEP);
    for (let i = Math.max(0, cx - n); i <= Math.min(this.nx, cx + n); i++) for (let j = Math.max(0, cz - n); j <= Math.min(this.nz, cz + n); j++) if (seen[i * row + j]) return true;
    return false;
  }
  /** Every grid cell you can walk to from where you arrive. */
  _reachable(boxes) {
    const nx = this.nx, nz = this.nz, row = nz + 1;
    const blocked = new Uint8Array((nx + 1) * row);
    for (const b of boxes) {
      const x0 = Math.max(0, Math.floor((b.x - b.w / 2 - BODY - this.b.x0) / STEP)), x1 = Math.min(nx, Math.ceil((b.x + b.w / 2 + BODY - this.b.x0) / STEP));
      const z0 = Math.max(0, Math.floor((b.z - b.d / 2 - BODY - this.b.z0) / STEP)), z1 = Math.min(nz, Math.ceil((b.z + b.d / 2 + BODY - this.b.z0) / STEP));
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) blocked[i * row + j] = 1;
    }
    const seen = new Uint8Array((nx + 1) * row);
    const si = Math.round((this.spawn[0] - this.b.x0) / STEP), sj = Math.round((this.spawn[1] - this.b.z0) / STEP);
    const queue = [si * row + sj];
    seen[queue[0]] = 1;
    while (queue.length) {
      const k = queue.pop(), i = Math.floor(k / row), j = k - i * row;
      if (i < nx && !blocked[k + row] && !seen[k + row]) { seen[k + row] = 1; queue.push(k + row); }
      if (i > 0 && !blocked[k - row] && !seen[k - row]) { seen[k - row] = 1; queue.push(k - row); }
      if (j < nz && !blocked[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; queue.push(k + 1); }
      if (j > 0 && !blocked[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; queue.push(k - 1); }
    }
    return seen;
  }
  _stillFine(box) {
    const seen = this._reachable([...this.boxes, box]);
    return this.targets.every((t) => this._near(t, seen));
  }
  _free(x, z, w, d, gap) {
    if (this.keepOut.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r + Math.max(w, d) / 2)) return false;
    return !this.taken.some((o) => Math.abs(x - o.x) < (w + o.w) / 2 + gap && Math.abs(z - o.z) < (d + o.d) / 2 + gap);
  }
  /** Try to stand one piece here. opts: rot, y, walk (can be walked through), trunk (only this thick at the bottom), free (ignore what's there), gap */
  put(entry, x, z, opts = {}) {
    if (!entry) return false;
    const [type, def] = entry;
    if (this.tris + (def.tris || 0) > MAX_HUB_TRIS) return false;
    const rot = opts.rot ?? 0, turned = Math.abs(Math.sin(rot)) > 0.7;
    const [sw, , sd] = def.size;
    const w = turned ? sd : sw, d = turned ? sw : sd;
    const inside = opts.outside || (x - w / 2 >= this.b.x0 && x + w / 2 <= this.b.x1 && z - d / 2 >= this.b.z0 && z + d / 2 <= this.b.z1);
    if (!inside) return false;
    const footW = opts.trunk ? opts.trunk : w, footD = opts.trunk ? opts.trunk : d;
    if (!opts.free && !this._free(x, z, footW, footD, opts.gap ?? 0.12)) return false;
    const tall = def.size[1] > 2.2 && !opts.y, crown = tall ? Math.max(sw, sd) * 0.42 : 0;
    if (tall && !opts.free && this.crowns.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < (r + crown) * 0.8)) return false;   // crowns stay apart
    const box = { x, z, w: footW, d: footD };
    const solid = !opts.walk && !opts.outside;
    if (solid && !this._stillFine(box)) return false;
    if (solid) this.boxes.push(box);
    if (!opts.free) this.taken.push(box);
    if (tall) this.crowns.push([x, z, crown]);
    const spec = { type, x, z, rot, fixed: true };
    if (opts.y) spec.y = opts.y;
    if (opts.walk) spec.walk = true;
    if (opts.trunk) spec.trunk = opts.trunk;
    this.items.push(spec);
    this.tris += def.tris || 0;
    this.added++;
    return true;
  }
  one(pool) { return pool.length ? pool[Math.floor(this.rand() * pool.length)] : null; }
  /** Up to count pieces from the pool, anywhere in the rectangle [x0, z0, x1, z1]. */
  scatter(pool, count, [x0, z0, x1, z1], opts = {}) {
    if (!pool.length) return 0;
    let done = 0;
    for (let n = 0; n < count; n++) {
      const entry = this.one(pool);
      for (let tries = 0; tries < 14; tries++) {
        const x = x0 + this.rand() * (x1 - x0), z = z0 + this.rand() * (z1 - z0);
        const rot = opts.rot ?? (opts.quarter ? Math.floor(this.rand() * 4) * (Math.PI / 2) : this.rand() * Math.PI * 2);
        if (this.put(entry, x, z, { ...opts, rot })) { done++; break; }
      }
    }
    return done;
  }
  /** One piece at each spot [x, z, rot?], going round the pool. */
  at(pool, spots, opts = {}) {
    if (!pool.length) return;
    const start = Math.floor(this.rand() * pool.length);
    spots.forEach(([x, z, rot], i) => this.put(pool[(start + i) % pool.length], x, z, { ...opts, rot: rot ?? opts.rot }));
  }
  /** Small things on a table top at height y: [x0, z0, x1, z1] is the part of the top to use. */
  onTop(pool, count, [x0, z0, x1, z1], y) {
    if (!pool.length) return;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const x = x0 + (x1 - x0) * (x1 - x0 >= z1 - z0 ? t : 0.5) + (this.rand() - 0.5) * 0.08;
      const z = z0 + (z1 - z0) * (x1 - x0 >= z1 - z0 ? 0.5 : t) + (this.rand() - 0.5) * 0.08;
      this.put(this.one(pool), x, z, { y, walk: true, free: true, rot: this.rand() * Math.PI * 2 });
    }
  }
  /** Things hung on a wall ("back": along x; "left"/"right": along z). */
  onWall(pool, wall, spots, y) {
    if (!pool.length) return;
    const start = Math.floor(this.rand() * pool.length);
    spots.forEach((u, i) => {
      const [type, def] = pool[(start + i) % pool.length];
      if (def.mount !== "wall") return;
      this.items.push({ type, wall, u, y: y ?? def.defaultY ?? 1.5, fixed: true });
      this.tris += def.tris || 0;
      this.added++;
    });
  }
  /** Hanging from the ceiling, above everyone's heads. */
  hang(pool, spots, y = 2.45) {
    if (!pool.length) return;
    const start = Math.floor(this.rand() * pool.length);
    // a high hall: each light hangs from the real ceiling, not floating at a low-room height
    const ceil = this.hub.layout.shell.house.h || 0;
    spots.forEach(([x, z], i) => {
      const piece = pool[(start + i) % pool.length], tall = piece[1].size?.[1] || 0.6;
      this.put(piece, x, z, { y: ceil > 3.4 ? Math.max(y, ceil - tall - 0.02) : y, free: true, walk: true });
    });
  }
  /** Scenery beyond where you can walk, so an outdoor hub doesn't end at a bare edge. */
  around(pool, count, near, far, opts = {}) {
    if (!pool.length) return;
    const { x0, x1, z0, z1 } = this.b, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.outer ??= [];                                                  // [x, z, r]: what already stands out there, so nothing grows into anything
    for (let i = 0; i < count; i++) {
      const entry = this.one(pool), [sw, sh, sd] = entry[1].size, r = Math.max(sw, sd) * (sh > 2.2 ? 0.42 : 0.5);
      for (let tries = 0; tries < 8; tries++) {
        const a = (opts.from ?? 0) + this.rand() * (opts.span ?? Math.PI * 2), dist = near + this.rand() * (far - near);
        const dx = Math.sin(a), dz = Math.cos(a);
        const edge = Math.min(Math.abs(dx) > 1e-3 ? (x1 - cx) / Math.abs(dx) : 1e9, Math.abs(dz) > 1e-3 ? (z1 - cz) / Math.abs(dz) : 1e9);
        const x = cx + dx * (edge + dist), z = cz + dz * (edge + dist);
        if ([...this.outer, ...this.crowns].some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < (r + or) * 0.85)) continue;
        if (this.put(entry, x, z, { outside: true, free: true, rot: this.rand() * Math.PI * 2 })) { this.outer.push([x, z, r]); break; }
      }
    }
  }
}

// ---------- the pools, by what things are ----------
const TREES = () => pick(/ultimate_stylized_nature\/(Maple|Birch)Tree/, /pretty_park_set\/Tree/, /CommonTree_\d/, /low_poly_outdoor.*\/Tree/);
const BIG_TREES = () => pick(/ultimate_nature_pack\/(CommonTree|BirchTree|PineTree)_\d/, /ultimate_stylized_nature\/(Maple|Birch)Tree/);
const PALMS = () => pick(/ultimate_nature_pack\/PalmTree/, /pirate_kit\/.*PalmTree/);
const BUSHES = () => pick(/pretty_park_set\/Bush/, /ultimate_stylized_nature\/Bush/, /Bush_with_Flowers/);
const FLOWERS = () => pick(/Flower_Group/, /pretty_park_set\/(Flower|Grass)_/, /FlowerBed\d/, /\/Flowers\.glb/, /SakuraFlower/);
const HEDGES = () => pick(/Hedge_Straight/, /minor_skilled.*\/Hedge/);
const STATUES = () => pick(/low_poly_outdoor.*\/Statue\d?/, /Fox_Statue/);
const LAMPPOSTS = () => pick(/Street_Lantern/, /Garden_Lamp/, /made\/LampPost/);
const POTTED = () => pick(/house_plants_set/);
const BIG_POTTED = () => pick(/house_plants_set\/.*(Large|Big|Monstera|Yucca)/, /house_plants_set\/House/);
const SMALL_POTTED = () => pick(/house_plants_set\/.*(succulent|aeonium|cact|small)/);
const BAKED = () => pick(/baked_goods/);
const DRINKS = () => pick(/(Soda_Glass|Mug|Cup|Utensils_Cup|Glass)\b/);
const FOOD = () => pick(/junk_food_pack/, /ultimate_food_pack/);
const BOOKS = () => pick(/fantasy_props_megakit\/Book/, /Book_Stack/, /Notebook/, /office_pack\/Magazine/, /furniture_kit\/Books/, /household_props_001\/Books/);
const ART = () => pick(/Wall_Art/, /Painting/, /Blank_Picture/);
const RUGS = () => pick(/furniture_kit\/Rug_(Rectangle|Rounded|Square)/, /office_pack\/Rug/, /Carpet_\d/, /Carpet_Round/, /Wool_Carpet/);
const FLOOR_LAMPS = () => pick(/Light_Floor\d/, /Floor_Lamp/);
const TABLE_LAMPS = () => pick(/Desk_?lamp/i, /Light_Desk/, /Bedside_Lamp/, /Lamp_With_Shade/);
const CHANDELIERS = () => pick(/Chandelier/, /Ceiling_Lamp(_\d)?\.glb/);
const BINS = () => pick(/Trashcan/, /Trash_Bin/);
const CRATES = () => pick(/fantasy_props_megakit\/(Barrel|Crate_Wooden|FarmCrate)/, /medieval_village_pack\/(Barrel|Crate)/);
const CRYSTALS = () => pick(/crystal_pack/);
const SPEAKERS = () => pick(/concert_pack\/speaker/, /Bass_Speakers/);
const SPOTLIGHTS = () => pick(/concert_pack\/(Spot_Light|Spotlight|spotlight)/);
const TOYS = () => pick(/Rubber_Duck/, /Doll/, /Piggy_Bank/, /Present/, /Desk_Toy/, /Dice_D/, /Trophy/);
const SIGNS = () => pick(/signs_pack\/(Sign|Wooden_Sign)/, /made\/SignPost/);
const ROCKS = () => pick(/pretty_park_set\/Rock/, /low_poly_outdoor.*\/Rock\d/, /medieval_village_pack\/Rock_\d/);
const CORAL = () => pick(/coral_reef_kit/);

// ---------- each hub ----------
// Positions come from the hub's own spots (hubs.js), so the decor follows the layout whatever its size.
const DRESS = {
  park(z) {
    // the park is drawn in parkhub.js; here the pack's trees, bushes, flowers and rocks go on the spots it picked, at the height of the ground there
    const { trees, bushes, flowers, rocks, heightAt } = z.hub.spots, R = () => z.rand() * Math.PI * 2;
    // each on its own patch: not on a planter, a seat or a path piece, not on top of the one before, and tree crowns kept apart
    const placed = [];
    const on = (pool, list, o = {}) => { if (pool.length) for (const [x, t] of list) {
      const e = z.one(pool), [sw, sh, sd] = e[1].size, tall = sh > 2.2, r = Math.max(sw, sd) * (tall ? 0.42 : 0.5);
      if (placed.some(([px, pz, pr]) => Math.hypot(x - px, t - pz) < (r + pr) * 0.85)) continue;
      if (tall && z.crowns.some(([cx, cz, cr]) => Math.hypot(x - cx, t - cz) < (r + cr) * 0.8)) continue;
      if (z.taken.some((b) => Math.abs(x - b.x) < b.w / 2 + r * 0.6 && Math.abs(t - b.z) < b.d / 2 + r * 0.6)) continue;
      if (z.put(e, x, t, { outside: true, free: true, rot: R(), y: heightAt(x, t) - 0.02 || 0.001, ...o })) { placed.push([x, t, r]); if (tall) z.crowns.push([x, t, r]); }
    } };
    const big = BIG_TREES(), small = TREES();
    on(big.length ? big : small, trees.filter((_, i) => i % 3 === 0), { trunk: 0.6 });
    on(small.length ? small : big, trees.filter((_, i) => i % 3 !== 0), { trunk: 0.5 });
    on(BUSHES(), bushes, { walk: true });
    on(FLOWERS(), flowers, { walk: true });
    on(ROCKS(), rocks);
  },
  cafe(z) {
    const { tables, lounges, W } = z.hub.spots, half = W / 2;
    z.onTop(BAKED(), 14, [-13.5, -2.85, -0.5, -2.85], 1.1);
    z.onTop(BAKED(), 10, [4.4, -2.85, 11.6, -2.85], 1.1);
    z.onTop(pick(/Coffee_Machine/, /coffee/i), 2, [-4, -2.8, -2, -2.8], 1.1);
    for (const [x, tz] of tables) {
      z.onTop(DRINKS(), 2, [x - 0.26, tz - 0.2, x + 0.26, tz - 0.2], 0.76);
      z.onTop(BAKED().concat(FOOD()), 1, [x, tz + 0.18, x, tz + 0.18], 0.76);
    }
    for (const [x, tz] of lounges) z.onTop(BOOKS().concat(DRINKS()), 3, [x - 0.3, tz - 0.2, x + 0.3, tz + 0.2], 0.5);
    z.onWall(ART(), "left", [1, 7.5, 14.5, 21.5]);
    z.onWall(ART(), "right", [7.5, 14.5, 21.5]);
    z.onWall(pick(/wall_shelf_kitchen/, /shelf_small_bottles/i), "back", [1.5, 15.5, -16], 1.6);
    z.onWall(pick(/Analog_clock/), "back", [2.8], 2.3);
    z.at(BIG_POTTED(), [[-half + 0.7, 1], [half - 0.7, 7.5], [-half + 0.7, 15.5], [half - 0.7, 15.5], [-6.6, 22.6], [6.6, 22.6], [-half + 0.7, 22.6], [half - 0.7, 22.6]]);
    z.scatter(POTTED(), 12, [-half + 0.5, 21, half - 0.5, 23.4], {});
    z.at(FLOOR_LAMPS(), lounges.map(([x, tz]) => [x + 2.4, tz - 1.2]));
    z.at(pick(/Vending/, /Water_Cooler/), [[half - 0.6, -0.4, -Math.PI / 2], [half - 0.6, 0.8, -Math.PI / 2]]);
    z.at(CRATES(), [[13.4, -3.3], [14.6, -3.3], [-half + 0.6, -3.3]]);
    z.at(BINS(), [[3.2, -0.6], [-half + 0.6, 9.2], [half - 0.6, 11.6], [-3.4, 23.2], [3.4, 23.2]]);
    z.hang(CHANDELIERS(), [[0, 2], [0, 6.8], [0, 11.6], [0, 16.4], [0, 21]]);
  },
  library(z) {
    const { tables, stacks, desks } = z.hub.spots;
    for (const [x, tz] of tables) z.onTop(BOOKS(), 7, [x, tz - 1.9, x, tz + 1.9], 0.76);
    for (const [x, tz] of desks) { z.onTop(TABLE_LAMPS(), 1, [x - 0.5, tz, x - 0.5, tz], 0.76); z.onTop(BOOKS(), 2, [x, tz, x + 0.5, tz], 0.76); }
    for (let tz = -1; tz < 34; tz += 6) z.at(POTTED(), [[-3, tz + 0.8], [-3, tz - 0.8]]);
    for (const [x, tz] of [[-12, 37.2], [-6, 37.2]]) { z.at(pick(/End_Table/, /Side_Table/, /Nightstand/), [[x, tz - 1.2]]); z.at(FLOOR_LAMPS(), [[x + 1.9, tz + 1.2]]); }
    z.at(FLOOR_LAMPS(), [[4.4, 6.6], [4.4, 18.6], [4.4, 30.6], [-1.4, -2.6], [1.4, -2.6]]);
    z.at(pick(/household_props_001\/Globe/), [[-1.6, 34]]);
    z.at(pick(/household_props_001\/Telescope/), [[-14.6, 38.6]]);
    z.at(pick(/Grandfathers_Clock/), [[-15.2, -3.4], [0, -3.4], [15, -3.4], [-10, -3.4], [10, -3.4]]);
    z.at(BIG_POTTED(), [[-15.2, 5], [-15.2, 11], [-15.2, 17], [-15.2, 23], [-15.2, 29], [-15.2, 35], [3.6, 39], [15, 39.2], [-1.8, 39.2]]);
    z.scatter(pick(/Cardboard_Box/, /Book_Stack/, /BookGroup/, /FarmCrate_Empty/), 14, [4.4, -1.5, 14.6, 30], {});
    z.at(pick(/Book_Stack/, /BookGroup/), stacks.map(([x, tz]) => [x, tz + 0.75]));
    z.at(BINS(), [[-1.4, 39.2], [1.4, 39.3], [4.4, 1]]);
    z.hang(CHANDELIERS(), tables.map(([x, tz]) => [x, tz]), 2.5);
    z.hang(CHANDELIERS(), [[1, 4], [1, 12], [1, 20], [1, 28], [1, 36]], 2.5);
  },
  study(z) {
    z.onTop(TABLE_LAMPS(), 1, [-1.2, -2.5, -1.2, -2.5], 0.76);
    z.onTop(BOOKS(), 2, [-0.5, -2.5, 0, -2.5], 0.76);
    z.onTop(DRINKS(), 1, [-0.1, -2.15, -0.1, -2.15], 0.76);
    z.onWall(ART(), "left", [0, 2]);
    z.onWall(pick(/Whiteboard/, /Wall_Corkboard/, /Message_board/), "left", [-2.2], 1.3);
    z.onWall(pick(/Analog_clock/, /LowPoly_Calendar/), "back", [-2.2, 0.4], 2);
    z.at(BIG_POTTED(), [[2.5, 2.5]]);
    z.at(SMALL_POTTED(), [[-2.6, 2.6]]);
    z.at(FLOOR_LAMPS(), [[-2.6, -1.8]]);
    z.at(pick(/Armchair/), [[-1.8, 1.6, 1.57]]);
    z.at(BINS(), [[1.2, -3.5]]);
    z.scatter(pick(/Book_Stack/, /BookGroup/, /Cardboard_Box_Open/), 3, [1.4, 1, 2.8, 2.8], {});
  },
  museum(z) {
    // the wings are full of exhibits already: plants by the doors and in the corners, a few bins, and statues at the Red Room's edges
    z.at(BIG_POTTED(), [[-23.2, 29.0], [23.2, 29.0], [-23.2, 35.2], [23.2, 35.2], [-3.4, -3.3], [3.4, -3.3], [-3.4, 27.3], [3.4, 27.3], [-5.0, 34.9], [5.0, 34.9], [-23.2, 13.2], [23.2, -3.2]]);
    z.at(BINS(), [[-10, 35.4], [10, 35.4], [-3.5, 13.4]]);
    z.at(STATUES(), [[10.2, 13.3, Math.PI], [17.8, 13.3, Math.PI]]);
    z.at(pick(/Horse_Statue/, /Statue_Knight/), [[4.9, -3.1, 0]]);
  },
  arcade(z) {
    const { W, D } = z.hub.spots, half = W / 2, front = D - 4;
    z.at(SPEAKERS(), [[-half + 0.8, front - 0.8], [half - 0.8, front - 0.8], [-3.6, 4.4], [3.6, 4.4], [-3.6, 11.6], [3.6, 11.6]]);
    z.hang(SPOTLIGHTS(), [[-12, 0.5], [-6, 0.5], [0, 0.5], [6, 0.5], [12, 0.5], [-8, 8.4], [0, 8.4], [8, 8.4], [-8, 15], [8, 15]], 2.5);
    z.at(pick(/Vending/), [[-half + 2, front - 0.6], [-half + 3, front - 0.6], [half - 2, front - 0.6], [half - 3, front - 0.6]]);
    z.put(pick(/Table_tennis_table/i)[0], -9, 16.6, { rot: Math.PI / 2 });
    z.put(pick(/Table_tennis_table/i)[0], 9, 16.6, { rot: Math.PI / 2 });
    z.at(pick(/Drum_Set/), [[0, 14.4]]);
    z.at(pick(/interior_props_pack\/Guitar/, /interior_props_pack\/Bass$/, /concert_pack\/Mic/), [[-1.6, 14], [1.6, 14], [0, 13.2]]);
    z.at(pick(/furniture_kit\/.*(Bean|Couch_Small|Sofa_Small)/, /Loveseat/i), [[-7, 19, Math.PI], [7, 19, Math.PI], [-12.4, 19.2, Math.PI], [12.4, 19.2, Math.PI]]);
    z.scatter(TOYS(), 24, [-half + 1, -2.6, half - 1, front - 0.5], { walk: true });
    z.scatter(pick(/interior_props_pack\/(Basket|Volleyball|Football)/), 8, [-half + 1, 0, half - 1, front - 0.5], { walk: true });
    z.onWall(pick(/Dartboard/), "left", [18], 1.7);
    z.onWall(pick(/Dartboard/), "right", [18], 1.7);
    z.at(TOYS(), [[-2.2, 8], [2.2, 8]], { y: 0.56, walk: true, free: true });
    z.at(pick(/cyberpunk_game_kit_quaterniu\/TV_/), [[-half + 0.7, front - 2.2, Math.PI / 2], [half - 0.7, front - 2.2, -Math.PI / 2]]);
    z.at(BINS(), [[-3.6, front - 0.4], [3.6, front - 0.4], [-half + 0.6, -0.8]]);
  },
  beach(z) {
    const { x0, x1, z1 } = z.b, { lounges, loungers } = z.hub.spots;
    const palms = []; for (let x = -28; x <= 28; x += 4.6) palms.push([x, z1 - 1.2]);
    for (let t = 8; t < 34; t += 5.2) palms.push([x0 + 1.2, t], [x1 - 1.2, t]);
    z.at(PALMS(), palms, { trunk: 0.5 });
    z.scatter(CORAL(), 5, [x0, -3.2, -3, -1.8], { walk: true });
    z.scatter(CORAL(), 5, [3, -3.2, x1, -1.8], { walk: true });
    z.scatter(ROCKS(), 8, [x0, -3.2, x1, -0.6], {});
    for (const [x, t] of loungers.filter((_, i) => i % 2 === 0)) z.put(pick(/low_poly_outdoor.*\/Parasol/)[0], x + 1.7, t, { trunk: 0.2 });
    z.at(pick(/Bonfire_Lit/, /Campfire_Stones/), [[-16, 7.6], [16, 7.6], [0, 8.2]]);
    z.at(pick(/Chiminea/, /Grill/, /Barbecue/), [[-19, 27.4], [-17.6, 27.4], [19, 27.4], [17.6, 27.4]]);
    z.at(pick(/FlowerBed\d/), [[-23.4, 14], [23.4, 14], [-23.4, 28], [23.4, 28], [-12, 32.6], [12, 32.6]], { walk: true });
    z.at(pick(/Bamboo/, /Japanese_Sedge/), [[-24, 10], [24, 10], [-24, 32], [24, 32]]);
    z.at(POTTED(), [[-8, 17.5], [8, 17.5], [-8, 24.5], [8, 24.5], [0, 17.5], [0, 24.5]]);
    for (const [x, t] of lounges) z.onTop(DRINKS().concat(FOOD()), 3, [x - 0.4, t, x + 0.4, t], 0.36);
    z.scatter(pick(/Volleyball_Ball/, /Basket_Ball/, /Football/, /Rubber_Duck/), 8, [x0 + 1, -0.8, x1 - 1, 8], { walk: true });
    z.at(CRATES(), [[-24.6, 17.6], [24.6, 17.6], [-24.6, 24.4]]);
    z.at(BINS(), [[-4, 10.6], [4, 10.6], [-16, 31.6], [16, 31.6], [-1.6, -2.4]]);
    z.scatter(pick(/pretty_park_set\/Grass_/, /Japanese_Sedge/), 24, [x0, -0.4, x1, 9.6], { walk: true });
    z.around(PALMS(), 40, 1, 18, { from: -Math.PI / 2, span: Math.PI });   // both ends and the land behind (the sea stays open)
    z.around(ROCKS(), 12, 0.5, 8, { from: -Math.PI / 2, span: Math.PI });
    z.around(BUSHES(), 16, 0.5, 8, { from: -Math.PI / 2, span: Math.PI });
  },
  stalls(z) {
    // the hall draws its own lanterns, banners and crossings (stallhall.js): the pack adds plants in the corners, crates along the walls and carts by the door
    const { x0, x1, z0, z1 } = z.b, { crossings } = z.hub.spots;
    z.at(BIG_POTTED(), [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]]);
    for (let x = x0 + 2; x < x1 - 1; x += 5.2) z.scatter(CRATES().concat(pick(/Cardboard_Box/, /Package_/)), 1, [x, z0 + 0.3, x + 1.6, z0 + 0.7], { quarter: true });
    for (let t = z0 + 2; t < z1 - 1; t += 6.4) {
      z.scatter(CRATES().concat(POTTED()), 1, [x0 + 0.3, t, x0 + 0.7, t + 1.4], { quarter: true });
      z.scatter(CRATES().concat(POTTED()), 1, [x1 - 0.7, t, x1 - 0.3, t + 1.4], { quarter: true });
    }
    z.at(pick(/Market_Stall/, /MarketStand_\d/, /Stall_Cart_Empty/), [[x0 + 3, z1 - 1.4], [x1 - 3, z1 - 1.4], [x0 + 8, z1 - 1.4], [x1 - 8, z1 - 1.4]]);
    z.at(BINS(), crossings.filter(([, t]) => t > z1 - 2).map(([x, t]) => [x + 1.1, t]));
  },
};
const ringOfSpots = (n, r, cx, cz, off = 0) => Array.from({ length: n }, (_, i) => { const a = off + (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; });

/** Adds the pack's decor to a freshly built hub, and hands it back. */
export function dressHub(hub, arg) {
  if (!hub?.layout || !pieces().length) return hub;   // pack not installed: the hub as it is
  try {
    DRESS[hub.key]?.(new Dresser(hub, `${hub.key}:${arg && typeof arg !== "object" ? arg : ""}`));
  } catch (e) {
    console.warn("[hub decor]", hub.key, e);          // a plain hub is better than no hub
  }
  return hub;
}
