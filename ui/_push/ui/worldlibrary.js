// worldlibrary.js - every model in the app, for the world editor: the general asset pack, the games' packs, your imported models, and the ones built in code
// (room and hub furniture, the farm's machines, boats, chickens and dinosaurs). Also makes them, and draws their little previews one at a time.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader(), kept = new Map();
const looks = (scene) => scene.traverse((o) => {
  if (o.isMesh) o.castShadow = o.receiveShadow = true;
  for (const m of [].concat(o.material || [])) if (m.metalness > 0.6 && !m.metalnessMap) m.metalness = 0.15;      // a metal look is black with no reflections to show
});
function gltf(url, base) {
  const full = base + url;
  if (!kept.has(full)) kept.set(full, loader.loadAsync(encodeURI(full)).then((g) => { looks(g.scene); return g; }).catch((e) => { kept.delete(full); throw e; }));
  return kept.get(full);
}

const MADE = ["greenhouse", "sprinkler", "trough", "pen", "bin", "stall", "workbench", "keg", "jars", "mill", "oven", "smoker", "cellar", "waterbarrel", "pot", "bench", "lamp", "sign", "statue", "fountain", "crate", "pillar", "arch", "tablet", "cairn", "board", "logjam", "wind"];
const pretty = (t) => t.replace(/\.\w+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_+/g, " ").trim();
const NO_PIECE = new Set(["hubGround", "hubSea"]);       // the ground itself and a whole sea: not something to place

async function pieces() {
  const [{ CATALOG }, { HUB_CATALOG }] = await Promise.all([import("./cozyroom.js"), import("./hubs.js")]);
  const out = [];
  for (const [type, def] of Object.entries({ ...CATALOG, ...HUB_CATALOG })) {
    if (def.pack || NO_PIECE.has(type) || !def.build) continue;                  // the pack's own pieces are already in the catalog
    out.push({ src: `piece:${type}`, name: def.label || pretty(type), pack: def.hubOnly ? "built_hub_furniture" : "built_room_furniture" });
  }
  return out;
}
async function farmModels() {
  const { DINOS } = await import("./turtle/data.js"), out = MADE.map((k) => ({ src: `made:${k}`, name: pretty(k), pack: "built_farm_machines" }));
  out.push({ src: "made:@boat", name: "Boat", pack: "built_farm_machines" }, { src: "made:@chicken", name: "Chicken", pack: "built_farm_machines" });
  for (const [k, D] of Object.entries(DINOS)) D.forms.forEach((f, st) => out.push({ src: `dino:${k}:${st}`, name: f, pack: "built_dinosaurs" }));
  return out;
}

// ---------------- categories: what a model is, from its role in the catalog, its pack and its name ----------------
export const CATEGORIES = [
  ["plants", "🌿 Plants & trees"], ["rocks", "🪨 Rocks & stones"], ["buildings", "🏠 Buildings & walls"], ["platforms", "🟫 Platforms, paths & stairs"],
  ["furniture", "🛋 Furniture & room pieces"], ["lights", "💡 Lights"], ["characters", "🧍 Characters & creatures"], ["vehicles", "🚗 Vehicles & machines"],
  ["food", "🍎 Food"], ["items", "⚔ Weapons & items"], ["water", "💧 Water"], ["adventure", "🌀 Adventure (made here)"], ["other", "📦 Everything else"],
];
const ROLE = { tree: "plants", flower: "plants", grass: "plants", bush: "plants", rock: "rocks", building: "buildings", wall: "buildings", roof: "buildings", ruin: "buildings",
  bridge: "platforms", platform: "platforms", path: "platforms", stairs: "platforms", light: "lights", character: "characters", creature: "characters", monster: "characters",
  character_part: "characters", vehicle: "vehicles", food: "food", weapon: "items", item: "items", dice: "items", card: "items", water: "water", portal: "adventure" };
const WORDS = [
  ["plants", /tree|bush|grass|flower|plant|fern|mushroom|shroom|leaf|leaves|cactus|vine|ivy|hedge|shrub|reed|lily|tulip|rose|daisy|palm|pine|birch|oak|willow|bamboo|crop|wheat|corn|sapling|stump|log\b|branch|clover|weed/],
  ["rocks", /rock|stone|boulder|pebble|cliff|crystal|ore\b|gem|mineral|cave/],
  ["furniture", /chair|table|bed\b|sofa|couch|shelf|shelves|desk|cabinet|drawer|wardrobe|dresser|bench|stool|rug|carpet|curtain|cushion|pillow|sink|toilet|bath|shower|fridge|oven|stove|counter|tv\b|television|computer|monitor|piano|clock|mirror|vase|frame|bookcase|kitchen|furniture|nightstand|armchair|ottoman/],
  ["lights", /lamp|lantern|torch|candle|light|chandelier/],
  ["buildings", /wall|floor|door|window|roof|house|tower|fence|gate|column|pillar|arch|building|castle|hut|shop|barn|church|temple|ruin|chimney|balcony|corner|tile/],
  ["platforms", /platform|stair|step|ramp|bridge|path|road|ladder|plank|block|cube/],
  ["vehicles", /car\b|truck|boat|ship|train|wagon|cart|plane|rocket|bike|bus\b|tank|vehicle|machine|mill|tractor|spaceship|robot/],
  ["characters", /character|man\b|woman|girl|boy|knight|wizard|zombie|skeleton|monster|animal|cat\b|dog\b|horse|cow|pig|sheep|chicken|bird|fish|dino|dragon|alien|goblin|orc|avatar|npc|person|people/],
  ["food", /food|bread|cake|apple|banana|pizza|burger|sushi|cheese|fruit|meat|egg|pie|cookie|donut|carrot|tomato|drink|cup|bottle|soup|rice/],
  ["items", /sword|axe|bow\b|gun|pistol|rifle|shield|helmet|armor|staff|wand|potion|key\b|coin|chest|book|bag|weapon|dagger|spear|hammer|tool/],
  ["water", /water|pond|lake|river|well\b|fountain|wave/],
];
/** which category a model goes in */
export function categoryOf(m) {
  if (m.pack === "made") return "adventure";
  if (m.pack === "built_room_furniture" || m.pack === "built_hub_furniture") return "furniture";
  if (m.pack === "built_farm_machines") return /chicken/i.test(m.name) ? "characters" : "vehicles";
  if (m.pack === "built_dinosaurs") return "characters";
  if (ROLE[m.role]) return ROLE[m.role];
  const n = `${m.name} ${m.pack}`.toLowerCase().replace(/_/g, " ");
  const name = m.name.toLowerCase();
  for (const [c, re] of WORDS) if (re.test(name)) return c;
  if (/plant|nature|tree|forest/.test(n)) return "plants";
  if (/interior|furniture|kitchen|office|household/.test(n)) return "furniture";
  if (/avatar|character|monster|animal|fish/.test(n)) return "characters";
  if (/food|cooking|baked|sushi/.test(n)) return "food";
  if (/gun|weapon|rpg items/.test(n)) return "items";
  if (/building|village|city|dungeon|house/.test(n)) return "buildings";
  return "other";
}
/** ready-made sets for the scatter brush: which models count. Floor tiles and blocks with grass on them aren't plants */
const NOT_PLANT = /floor|tile|slice|block|wall|roof|path|road|platform|cube|ground|terrain|texture|card/i;
const plant = (test) => (m) => !NOT_PLANT.test(m.name) && test(m);
export const SCATTER_SETS = [
  ["Grass", plant((m) => m.role === "grass" || /\bgrass/i.test(m.name))], ["Flowers", plant((m) => m.role === "flower" || /flower|tulip|rose|daisy|lily/i.test(m.name))],
  ["Bushes", plant((m) => m.role === "bush" || /bush|shrub|hedge/i.test(m.name))], ["Trees", plant((m) => m.role === "tree" || (/tree|pine|birch|oak|palm/i.test(m.name) && m.cat === "plants"))],
  ["Mushrooms", plant((m) => /mushroom|shroom/i.test(m.name))], ["Rocks", (m) => m.cat === "rocks" && !/floor|tile|wall|path/i.test(m.name)], ["Plants", plant((m) => m.cat === "plants")],
];

/** the adventure's portal: its stone ring, and the swirl turning inside */
async function makePortal(base) {
  const g = new THREE.Group();
  try { g.add(cloneRig((await gltf("general_asset_pack/made/Portal_Base.glb", base)).scene)); } catch { /* the swirl alone, then */ }
  const t = { value: 0 }, swirl = new THREE.Mesh(new THREE.CircleGeometry(1.15, 72), new THREE.ShaderMaterial({
    uniforms: { uTime: t }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float n(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(n(i), n(i + vec2(1, 0)), f.x), mix(n(i + vec2(0, 1)), n(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec2 c = vUv - .5; float r = length(c) * 2.; float a = atan(c.y, c.x); float sw = a + r * 6. - uTime * 2.4;
        float bands = noise(vec2(sw * 2., r * 8. - uTime)) * .6 + noise(vec2(sw * 5., r * 20. + uTime * 1.5)) * .4;
        float ring = smoothstep(.2, .6, r) * (1. - smoothstep(.85, 1., r)); float streak = pow(max(0., sin(sw * 3. + bands * 4.)), 6.);
        vec3 col = mix(vec3(.25, .75, 1.), vec3(.95, 1., 1.), bands + streak * .8); float core = 1. - smoothstep(0., .45, r);
        gl_FragColor = vec4(mix(col * (1. + streak * 1.5), vec3(.02, .03, .06), core), max(ring * (.55 + .45 * bands) + streak * ring, core * .9)); }`,
  }));
  swirl.onBeforeRender = () => { t.value = performance.now() / 1000; };
  const box = new THREE.Box3().setFromObject(g), tall = box.isEmpty() ? 2.6 : box.max.y;
  swirl.position.y = tall * 0.55; swirl.scale.setScalar(Math.max(0.6, tall * 0.36));
  g.add(swirl);
  return g;
}

/** the whole list: [{ src, name, pack, role, cat }]. base: "" from ui/index.html, "../" from a page one folder down. api may list what's on disk */
export async function listModels(base, api) {
  const out = [];
  try {
    const c = await (await fetch(`${base}general_asset_pack/catalog.json`)).json();
    for (const m of c.models || []) out.push({ src: m.url, name: pretty(m.name || m.id), pack: m.pack || "other", role: m.role || "" });
  } catch (e) { console.warn("[world editor] catalog", e); }
  try { for (const f of (await api?.world_model_files?.()) || []) out.push({ src: f.url, name: pretty(f.url.split("/").pop()), pack: f.pack }); } catch (e) { console.warn("[world editor] files", e); }
  out.push({ src: "fx:portal", name: "Portal (glowing)", pack: "made", role: "portal" });       // the adventure's portal, with its swirl
  for (const get of [pieces, farmModels]) { try { out.push(...await get()); } catch (e) { console.warn("[world editor] built models", e); } }
  const seen = new Set();
  return out.filter((m) => !seen.has(m.src) && seen.add(m.src)).map((m) => ({ ...m, cat: categoryOf(m) }));
}

/** one copy of a model, standing on y = 0 and centred. src: a file, piece:type, made:kind or dino:kind:stage */
export async function makeModel(src, base) {
  let o;
  let tick = null;
  if (src.startsWith("piece:")) {
    // piece:type, or piece:type#{settings} for a copy of one of a hub's own pieces (its tree number, a portal's destination...)
    const [type, extra] = src.slice(6).split("#"), [{ CATALOG }, { HUB_CATALOG }] = await Promise.all([import("./cozyroom.js"), import("./hubs.js")]), def = CATALOG[type] || HUB_CATALOG[type];
    let more = {}; try { more = extra ? JSON.parse(decodeURIComponent(extra)) : {}; } catch { /* plain piece */ }
    if (!def) throw new Error(`no piece ${type}`);
    let loaded; const arrived = new Promise((ok) => { loaded = ok; });
    const built = def.build({ spec: { ...more, type, x: 0, z: 0, rot: 0, y: 0 }, name: "Vermeil", _itemId: 0, _room: { onGLBLoaded() { loaded(); }, onChange() {}, items: new Map(), skyMat: new THREE.MeshBasicMaterial({ color: 0x8cc0f0 }) } });
    o = built.group; if (typeof built.update === "function") tick = built.update.bind(built);   // a copy keeps moving like the original
    if (o.userData.isGLB) await Promise.race([arrived, new Promise((ok) => setTimeout(ok, 15000))]);   // its file comes later: wait for it, or the picture is empty
  } else if (src.startsWith("made:")) {
    const M = await import("./turtle/made.js"), k = src.slice(5);
    o = k === "@boat" ? M.makeBoat(1) : k === "@chicken" ? M.makeChicken() : M.madeProp(k);
  } else if (src.startsWith("dino:")) {
    const [, k, st] = src.split(":"), [{ DINOS }, { makeDinoBody }] = await Promise.all([import("./turtle/data.js"), import("./turtle/dinomodel.js")]), D = DINOS[k];
    const b = await makeDinoBody(D, +st, D.sizes[+st]);
    o = b.holder || b.group || b;
  } else if (src === "fx:portal") o = await makePortal(base);
  else o = cloneRig((await gltf(src, base)).scene);
  o.traverse((m) => { if (m.isMesh) { m.frustumCulled = !m.isSkinnedMesh; m.castShadow = m.receiveShadow = true; } });
  const holder = new THREE.Group();
  holder.add(o); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  if (!box.isEmpty()) { const c = box.getCenter(new THREE.Vector3()); o.position.x -= c.x; o.position.z -= c.z; o.position.y -= box.min.y; }
  holder.userData.box = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  if (tick) holder.userData.tick = tick;
  return holder;
}

/** how much to scale a model the first time it's placed: the packs were made at very different sizes */
export function firstScale(size) { const m = Math.max(size.x, size.y, size.z, 1e-3); return m > 12 ? 12 / m : m < 0.2 ? 0.5 / m : 1; }

/** previews: one small renderer, one model at a time. A preview is remembered until the editor closes */
export function makePreviews(base, px = 112) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.01, 2000), done = new Map();
  r.setPixelRatio(1); r.setSize(px, px); r.setClearColor(0x000000, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a90, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 4, 3); scene.add(sun);
  let queue = Promise.resolve();
  const draw = async (src) => {
    const m = await makeModel(src, base);
    scene.add(m); m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getBoundingSphere(new THREE.Sphere()).radius || 1, d = s / Math.sin(16 * Math.PI / 180);
    cam.position.set(c.x + d * 0.6, c.y + d * 0.42, c.z + d * 0.68); cam.lookAt(c); cam.near = d / 100; cam.far = d * 4; cam.updateProjectionMatrix();
    r.render(scene, cam);
    const url = r.domElement.toDataURL("image/png");
    scene.remove(m);
    r.renderLists.dispose();
    return url;
  };
  return {
    /** the picture for a model. wanted() false: the page has moved on, so don't spend time on it */
    get(src, wanted = () => true) {
      if (done.has(src)) return Promise.resolve(done.get(src));
      const job = queue.then(async () => {
        if (done.has(src)) return done.get(src);
        if (!wanted()) return undefined;
        let url = null;
        try { url = await Promise.race([draw(src), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 25000))]); } catch (e) { console.warn("[world editor] preview", src, e?.message); }
        done.set(src, url);
        return url;
      });
      queue = job.catch(() => {});
      return job;
    },
    dispose() { r.dispose(); r.forceContextLoss?.(); },
  };
}
