// house.js - the size of the main room. There is one room: Edit room > Room size makes it bigger or smaller than the original.
// Saved in the room layout as shell.house = { w, d } (metres). The back wall stays put at z = -4 and the width changes both ways.
const BACK = -4;
export const ROOM_ORIGINAL = { w: 10, d: 8.5 };
export const ROOM_LIMITS = { w: [6, 30], d: [5, 24] };
const MAIN = { minX: -5, maxX: 5, minZ: BACK, maxZ: 4.5, main: true };   // the original room (the gym room is built for this size)

const num = (v, lo, hi, d) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
const step = (v, s) => Math.round(v / s) * s;

/** Any saved (or half-typed) size -> a complete, safe one. No size saved = the original. Extra rooms in old saves are dropped. */
export function normalizeHouse(h) {
  if (h?.hub) return { w: step(num(h.w, 6, 240, 24), 1), d: step(num(h.d, 5, 240, 22), 0.5), h: num(h.h, 2.4, 20, 3.2), hub: true };   // a big public hub, not your room
  return { w: step(num(h?.w, ...ROOM_LIMITS.w, ROOM_ORIGINAL.w), 1),     // whole metres, so both walls stay on the 0.5 m grid
           d: step(num(h?.d, ...ROOM_LIMITS.d, ROOM_ORIGINAL.d), 0.5) };
}

export class House {
  constructor() { this.set(null); }

  set(cfg) { this.cfg = normalizeHouse(cfg); return this.cfg; }

  bounds() {
    const { w, d } = this.cfg;
    return { minX: -w / 2, maxX: w / 2, minZ: BACK, maxZ: BACK + d, main: true };
  }
  /** The room's edges; mainOnly = the original size, whatever the room is now (the gym room). */
  box(mainOnly = false) { return mainOnly ? MAIN : this.bounds(); }

  /** Where it can stand: the room, not too close to the walls. */
  walkBounds(mainOnly = false) {
    const b = this.box(mainOnly);
    return { minX: b.minX + 0.7, maxX: b.maxX - 0.7, minZ: b.minZ + 0.5, maxZ: b.maxZ - 0.7 };
  }

  walkable(x, z, mainOnly = false) {
    const b = this.walkBounds(mainOnly);
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  /** The nearest point inside the room, m away from the walls (for furniture). */
  clampPoint(x, z, m = 0.2, mainOnly = false) {
    const b = this.box(mainOnly);
    return { x: Math.min(b.maxX - m, Math.max(b.minX + m, x)), z: Math.min(b.maxZ - m, Math.max(b.minZ + m, z)) };
  }
}
