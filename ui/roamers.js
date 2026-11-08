// roamers.js - people shown as labelled spheres: your test friend once they accept an invite, and the sample people in the hubs. Click one to talk.
import * as THREE from "three";

const GEO = new THREE.SphereGeometry(0.28, 24, 16);
const nameTag = (text) => {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = 320; c.height = 72;
  g.font = "800 34px Nunito, sans-serif";
  const w = Math.min(310, g.measureText(text).width + 34);
  g.fillStyle = "rgba(10,8,16,.8)"; g.beginPath(); g.roundRect((320 - w) / 2, 8, w, 54, 26); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 160, 36);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, fog: false }));
  s.scale.set(1.15, 0.26, 1); s.position.y = 0.52; s.renderOrder = 5;
  return s;
};

export class Roamers {
  /** bounds() = where they may go: {minX, maxX, minZ, maxZ} */
  constructor(scene, bounds, ground = null) {
    this.scene = scene;
    this.bounds = bounds;
    this.ground = ground;                              // (x, z) -> the height there (platforms, stairs), or null
    this.people = new Map();
  }

  /** person = { id, name, color, x?, z?, still? (stays put) } */
  add(p) {
    this.remove(p.id);
    const b = p.area || this.bounds(), group = new THREE.Group();
    const ball = new THREE.Mesh(GEO, new THREE.MeshStandardMaterial({ color: p.color || "#7fb8ff", roughness: 0.35, emissive: p.color || "#7fb8ff", emissiveIntensity: 0.22 }));
    ball.castShadow = true;
    ball.userData.roamer = { id: p.id, name: p.name };
    group.add(ball, nameTag(p.name));
    group.position.set(p.x ?? THREE.MathUtils.lerp(b.minX, b.maxX, Math.random()), 0.42, p.z ?? THREE.MathUtils.lerp(b.minZ, b.maxZ, Math.random()));
    this.scene.add(group);
    this.people.set(p.id, { ...p, group, ball, target: null, wait: Math.random() * 2, t: Math.random() * 6 });
  }

  remove(id) {
    const P = this.people.get(id);
    if (!P) return;
    this.scene.remove(P.group);
    P.ball.material.dispose();
    for (const o of P.group.children) if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
    this.people.delete(id);
  }

  /** someone on another PC moved */
  place(id, x, z) { const P = this.people.get(id); if (P && Number.isFinite(x) && Number.isFinite(z)) P.goal = [x, z]; }

  /** Only the people you pick stay (your friend, moving between rooms); they come inside the new room. */
  keepOnly(ids) {
    for (const id of [...this.people.keys()]) if (!ids.includes(id)) this.remove(id);
    const b = this.bounds();
    for (const P of this.people.values()) { P.target = null; P.group.position.x = THREE.MathUtils.clamp(P.group.position.x, b.minX, b.maxX); P.group.position.z = THREE.MathUtils.clamp(P.group.position.z, b.minZ, b.maxZ); }
  }

  update(dt) {
    const b = this.bounds();
    for (const P of this.people.values()) {
      P.t += dt;
      const pos = P.group.position;
      pos.y = 0.42 + (this.ground?.(pos.x, pos.z, P.level ?? 0) || 0) + Math.sin(P.t * 2.4) * 0.035;
      if (P.goal) {                                    // someone real, on another PC: glide to where they last said they were
        const k = Math.min(1, dt * 8);
        pos.x += (P.goal[0] - pos.x) * k; pos.z += (P.goal[1] - pos.z) * k;
        continue;
      }
      if (P.still || P.stay) continue;
      if (!P.target) {
        if ((P.wait -= dt) > 0) continue;
        const a = P.area || b;                         // a person can keep to their own corner of a big hub
        P.target = new THREE.Vector3(THREE.MathUtils.lerp(a.minX, a.maxX, Math.random()), 0, THREE.MathUtils.lerp(a.minZ, a.maxZ, Math.random()));
      }
      const dx = P.target.x - pos.x, dz = P.target.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.1) { P.target = null; P.wait = 1 + Math.random() * 4; continue; }
      const step = Math.min(d, dt * 0.95);
      pos.x += (dx / d) * step; pos.z += (dz / d) * step;
    }
  }
}
