import { type BurstDef, GROUND_Z, type MoteLook, type ParticleKind, type ReadonlyTiles, type SimEvent, type SimState, type SpellLook, unpackKey, unpackSpot } from '../../types';
import { CONTENT, heldLight, spellFor, thingDef } from '../../content';
import type { Env } from '../lighting';
import { KINDS, type KindMote, MAX, type Particle, TAU, fx } from './particleKinds';
import type { Projection } from '../raycaster/camera';
import { TILES } from '../../content/tiles';
import type { Viewport } from '../viewport';
import { pack } from '../color';


export type { ParticleKind };

/**
 * Render-side effects. Purely visual: they read sim state and events and never feed back.
 * Flames and smoke rise from burning tiles, sparks fly from hits, water splashes, and rain falls
 * past the eye slanted by the wind.
 *
 * Spells have no fixed effects here. Each spell carries a `look` blended from its runes
 * (content/spellcraft.ts composeLook), and the emitters below turn that look plus the spell's
 * delivery (bolt, cone, nova, ward) and power into motes. A new rune needs no code here.
 */
export class Particles {
  private list: Particle[] = [];
  private rainSeed = 0;
  private time = 0;

  /** A world mote of one of the fixed kinds. */
  spawn(p: KindMote): void {
    const k = KINDS[p.kind];
    this.push(p.x, p.y, p.z, p.vx, p.vy, p.vz, p.life, p.size, k.grow, p.r, p.g, p.b, p.r * k.fade[0], p.g * k.fade[1], p.b * k.fade[2], p.glow ? 1 : 0, k.soft, k.lift, k.drag, 0, 0);
  }

  private push(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, r: number, g: number, b: number, r2: number, g2: number, b2: number, glow: number, soft: number, lift: number, drag: number, swirl: number, jitter: number): void {
    if (this.list.length >= MAX || life <= 0) return;
    this.list.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, r2, g2, b2, glow, soft, lift, drag, swirl, jitter });
  }

  /** A spell mote in the given look, with a random 0.6–1.2 variation of its life. */
  private mote(m: MoteLook, x: number, y: number, z: number, vx: number, vy: number, vz: number, sizeMul = 1, lifeMul = 1): void {
    this.push(x, y, z, vx, vy, vz, m.life * lifeMul * (0.6 + Math.random() * 0.6), m.size * sizeMul * (0.7 + Math.random() * 0.6), m.grow, m.core.r, m.core.g, m.core.b, m.edge.r, m.edge.g, m.edge.b, m.glow, m.soft, m.lift, m.drag, m.swirl, m.jitter);
  }

  /** A burst from content/effects.ts, with the count, speed and size scaled for this moment. */
  private play(d: BurstDef, x: number, y: number, z: number, countMul = 1, speedMul = 1, sizeMul = 1): void {
    const n = Math.round(d.count * countMul);
    const speed = d.speed * speedMul;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.one(d, x, y, z, Math.cos(a) * s, Math.sin(a) * s, Math.random() * speed, 0.6 + Math.random() * 0.6, sizeMul);
    }
  }

  /** One mote of a content/effects.ts burst, moving as given. */
  private one(d: BurstDef, x: number, y: number, z: number, vx: number, vy: number, vz: number, lifeMul = 1, sizeMul = 1): void {
    const k = d.colourTo === undefined ? 0 : Math.random();
    const to = d.colourTo ?? d.colour;
    const ch = (sh: number): number => ((d.colour >> sh) & 255) * (1 - k) + ((to >> sh) & 255) * k;
    this.spawn({ kind: d.kind, x, y, z, vx, vy, vz, life: d.life * lifeMul, size: d.size * sizeMul, r: ch(16), g: ch(8), b: ch(0), glow: !!d.glow });
  }

  private burst(kind: ParticleKind, x: number, y: number, z: number, n: number, speed: number, r: number, g: number, b: number, glow: boolean, life = 0.6, size = 0.12): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn({ kind, x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: Math.random() * speed, life: life * (0.6 + Math.random() * 0.6), size, r, g, b, glow });
    }
  }

  // ── Spell emitters: all driven by the spell's look and delivery ─────────

  /**
   * Motes thrown out from a point. `upward` in the look decides the bloom: a fountain (flames,
   * splashes), a ball (frost shards) or a flat ring along the ground (dust, wind).
   */
  private bloom(m: MoteLook, x: number, y: number, z: number, count: number, speed: number): void {
    const up = Math.max(-1, Math.min(1, m.upward));
    for (let i = 0; i < count; i++) {
      // Random direction on a sphere, then bent by `upward`.
      const a = Math.random() * TAU;
      let dz = Math.random() * 2 - 1;
      let h = Math.sqrt(1 - dz * dz);
      if (up > 0) {
        dz = dz * (1 - up) + up * (0.5 + Math.random() * 0.5);
        h *= 1 - up * 0.55;
      } else if (up < 0) {
        dz *= 1 + up;
        h = h * (1 + up) - up;
      }
      const s = speed * (0.35 + Math.random() * 0.65);
      this.mote(m, x, y, z, Math.cos(a) * h * s, Math.sin(a) * h * s, dz * s);
    }
  }

  /** Initial speed that carries a mote `dist` metres in `secs` against its own drag. */
  private reach(m: MoteLook, dist: number, secs: number): number {
    const k = m.drag;
    if (k < 0.05) return dist / secs;
    return (dist * k) / (1 - Math.exp(-k * secs));
  }

  /** Where a bolt bursts. Bigger bursts throw more motes further. */
  private spellBurst(look: SpellLook, x: number, y: number, z: number, radius: number): void {
    const m = look.motes;
    const scale = Math.min(2.5, 0.6 + radius * 0.4);
    this.bloom(m, x, y, z, Math.round(m.density * scale), m.spread * (0.6 + radius * 0.3));
    if (look.wake) this.bloom(look.wake, x, y, z, Math.round(look.wake.density * scale), look.wake.spread * (0.6 + radius * 0.3));
    // A brief bright heart where it struck.
    this.mote(m, x, y, z, 0, 0, 0, 2.6, 0.35);
  }

  /** A sweep of motes filling a cone in front of the caster, timed to reach its far edge. */
  private spellCone(look: SpellLook, x: number, y: number, z: number, angle: number, range: number, width: number): void {
    const m = look.motes;
    const half = Math.acos(Math.max(-1, Math.min(1, width)));
    const n = Math.round(m.density * 1.4 * Math.min(2, range / 6));
    const t = m.life * 0.8;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() * 2 - 1) * half;
      const s = this.reach(m, range * (0.5 + Math.random() * 0.5), t);
      this.mote(m, x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, z + (Math.random() - 0.5) * 0.6, Math.cos(a) * s, Math.sin(a) * s, m.upward * 1.5 + (Math.random() - 0.5));
    }
    const w = look.wake;
    if (!w) return;
    // The wake settles along the ground the cone swept.
    const nw = Math.round(w.density * 1.5 * Math.min(2, range / 6));
    for (let i = 0; i < nw; i++) {
      const a = angle + (Math.random() * 2 - 1) * half;
      const d = 1 + Math.random() * range;
      const s = w.spread * 0.4;
      this.mote(w, x + Math.cos(a) * d, y + Math.sin(a) * d, z - 1.2 + Math.random() * 0.3, Math.cos(a) * s, Math.sin(a) * s, w.upward > 0 ? w.upward : 0.1, 1, 0.6 + (d / range) * 0.6);
    }
  }

  /** A ring rolling out around the caster to the nova's edge. */
  private spellNova(look: SpellLook, x: number, y: number, z: number, radius: number): void {
    const m = look.motes;
    const n = Math.round(m.density * 1.6 + radius * 8);
    const t = m.life * 0.7;
    const twist = (look.seed - 0.5) * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.08;
      const s = this.reach(m, radius, t) * (0.85 + Math.random() * 0.3);
      // Each nova has its own little twist so the ring spins one way or the other.
      const tx = -Math.sin(a) * s * twist * 0.25;
      const ty = Math.cos(a) * s * twist * 0.25;
      this.mote(m, x + Math.cos(a) * 0.4, y + Math.sin(a) * 0.4, z + 0.6 + (Math.random() - 0.5) * 0.4, Math.cos(a) * s + tx, Math.sin(a) * s + ty, m.upward * 2);
    }
    const w = look.wake;
    if (!w) return;
    const nw = Math.round(w.density * 2 + radius * 4);
    for (let i = 0; i < nw; i++) {
      const a = Math.random() * TAU;
      const s = this.reach(w, radius * (0.4 + Math.random() * 0.6), w.life);
      this.mote(w, x, y, z + 0.1, Math.cos(a) * s, Math.sin(a) * s, Math.max(0, w.upward));
    }
  }

  /** A shimmer spiralling around and into the caster's body. */
  private spellWard(look: SpellLook, x: number, y: number, z: number): void {
    const m = look.motes;
    const n = Math.round(m.density * 1.2);
    const dir = look.seed < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = 0.9 + Math.random() * 0.3;
      const s = 1.2 + m.spread * 0.3;
      // Tangential plus a pull inwards: they wind around you as they close in.
      const vx = -Math.sin(a) * s * dir - Math.cos(a) * 1.2;
      const vy = Math.cos(a) * s * dir - Math.sin(a) * 1.2;
      this.mote(m, x + Math.cos(a) * r, y + Math.sin(a) * r, z + Math.random() * 1.8, vx, vy, 0.3 + Math.max(0, m.upward) * 0.6, 0.8, 0.8);
    }
  }

  /** A puff at the caster's hand as the spell leaves it. */
  private spellHand(look: SpellLook, x: number, y: number, z: number, angle: number): void {
    const m = look.motes;
    const hx = x + Math.cos(angle) * 0.55;
    const hy = y + Math.sin(angle) * 0.55;
    const n = Math.max(3, Math.round(m.density * 0.2));
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.6;
      const s = 0.5 + Math.random() * 1.5;
      this.mote(m, hx, hy, z + 1.35, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.3) * 1.2, 0.6, 0.4);
    }
  }

  /**
   * A bolt in flight: a bright body, strands twisting around its path (count, speed and turn
   * direction come from the look and its seed), loose motes shed behind and the wake trailing.
   */
  private spellTrail(look: SpellLook, id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, dt: number): void {
    const m = look.motes;
    // The body: a short-lived mote right on the bolt every frame.
    this.mote(m, x, y, z, 0, 0, 0, 2.2, 0.15);
    const sp = Math.hypot(vx, vy, vz) || 1;
    // A frame perpendicular to the flight path for the strands.
    const hl = Math.hypot(vx, vy) || 1;
    const sx = -vy / hl;
    const sy = vx / hl;
    const n = look.strands;
    if (n > 0) {
      const turn = (look.seed < 0.5 ? -1 : 1) * (7 + look.seed * 8 + m.swirl * 4);
      const rad = 0.1 + m.size * 0.6;
      for (let k = 0; k < n; k++) {
        const ph = this.time * turn + (k / n) * TAU + id * 0.7;
        const c = Math.cos(ph) * rad;
        const s = Math.sin(ph) * rad;
        this.mote(m, x + sx * c, y + sy * c, z + s, -vx * 0.05, -vy * 0.05, -vz * 0.05, 0.6, 0.45);
      }
    }
    // Loose motes shed behind, more for dense looks and faster bolts.
    let shed = m.density * dt * (2 + sp * 0.08);
    while (shed > 0) {
      if (shed < 1 && Math.random() > shed) break;
      shed -= 1;
      const j = m.spread * 0.25;
      this.mote(m, x - vx * dt * Math.random(), y - vy * dt * Math.random(), z - vz * dt * Math.random(), -vx * 0.08 + (Math.random() - 0.5) * j, -vy * 0.08 + (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, 0.8, 0.6);
    }
    const w = look.wake;
    if (w && Math.random() < w.density * dt * 1.5) this.mote(w, x, y, z, -vx * 0.03, -vy * 0.03, 0, 0.6, 0.6);
  }

  onEvent(e: SimEvent, state: SimState): void {
    switch (e.type) {
      case 'hit': {
        if (e.parried) this.play(fx('parry'), e.x, e.y, e.z);
        else if (e.blocked) this.play(fx('block'), e.x, e.y, e.z);
        else {
          const t = state.entities.get(e.target);
          const bloody = t ? !!thingDef(CONTENT, t.def).bleeds : false;
          // Heavier, better-aimed blows throw more, and farther.
          const pw = e.power ?? 0;
          const more = 1 + (pw * 14 + Math.min(10, e.damage * 0.4)) / 8;
          if (bloody) this.play(fx('blood'), e.x, e.y, e.z, more, 1 + pw * 0.8);
          else this.play(fx('hitDust'), e.x, e.y, e.z, more, 1 + pw * 0.75);
        }
        break;
      }
      case 'strike': {
        // What flies off comes from what was struck (material data), what the weapon is, and how hard.
        const m = CONTENT.materials[e.material];
        const hard = m?.hardness ?? 0.2;
        const deb = m?.debris;
        const scale = 0.6 + e.power * 1.2;
        if (deb) {
          const r = (deb.colour >> 16) & 255;
          const g = (deb.colour >> 8) & 255;
          const b = deb.colour & 255;
          this.burst(deb.kind, e.x, e.y, e.z, Math.round(deb.amount * scale), 2 + e.power * 2.5, r, g, b, false, 0.7, deb.size);
        }
        if (hard >= CONTENT.rules.combat.surface.spark && e.weapon !== 'blunt') this.play(fx('strikeSpark'), e.x, e.y, e.z, 1 + e.power * 1.5, 1 + e.power * 0.6);
        else if (hard >= 0.5) this.play(fx('strikeDust'), e.x, e.y, e.z, 1 + e.power * 1.6);
        if (e.recoil) this.play(fx('recoil'), e.x, e.y, e.z);
        break;
      }
      case 'tileBroken': {
        const tm = CONTENT.materials[TILES[e.tile]?.material ?? 'wood'];
        const deb = tm?.debris;
        const col = deb?.colour ?? 0x8a6a48;
        this.burst('dust', e.x + 0.5, e.y + 0.5, e.z !== undefined && e.z !== GROUND_Z ? e.z + 0.8 : 0.8, 26, 3.5, (col >> 16) & 255, (col >> 8) & 255, col & 255, false, 1, (deb?.size ?? 0.08) * 1.6);
        this.play(fx('rubbleDust'), e.x + 0.5, e.y + 0.5, e.z !== undefined && e.z !== GROUND_Z ? e.z + 0.5 : 0.3);
        break;
      }
      case 'charge': {
        const c = state.entities.get(e.entity);
        if (!c) break;
        // A caster gathering a spell shows that spell's own motes at its hand; a fighter gleams as the blow peaks.
        const sp = c.ai?.cast ? spellFor(CONTENT, c.ai.cast.spell) : null;
        if (sp) this.spellHand(sp.look, c.pos.x, c.pos.y, c.z, c.angle);
        else if (e.stage === 'full') this.play(fx('chargeGleam'), e.x + Math.cos(c.angle) * 0.6, e.y + Math.sin(c.angle) * 0.6, c.z + 1.2);
        break;
      }
      case 'spellBurst': {
        const d = spellFor(CONTENT, e.spell);
        if (d) this.spellBurst(d.look, e.x, e.y, e.z, d.burst.radius);
        break;
      }
      case 'spellCast': {
        const d = spellFor(CONTENT, e.spell);
        const c = state.entities.get(e.entity);
        if (!d || !c) break;
        const del = d.delivery;
        if (del.type === 'nova') this.spellNova(d.look, c.pos.x, c.pos.y, c.z, del.radius);
        else if (del.type === 'self') this.spellWard(d.look, c.pos.x, c.pos.y, c.z);
        else if (del.type === 'cone') this.spellCone(d.look, c.pos.x, c.pos.y, c.z + 1.3, c.angle, del.range, del.width);
        if (del.type !== 'self') this.spellHand(d.look, c.pos.x, c.pos.y, c.z, c.angle);
        break;
      }
      case 'trapSprung':
        // The floor breathes fire: a ring of flame rolling outwards.
        {
          const d = fx('trapFire');
          const z = state.entities.get(e.entity)?.z ?? 0;
          for (let i = 0; i < d.count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = d.speed * (0.4 + Math.random() * 0.6);
            this.one(d, e.x, e.y, z, Math.cos(a) * sp, Math.sin(a) * sp, 1 + Math.random() * 3);
          }
        }
        break;
      case 'froze':
        if (Math.random() < 0.35) this.play(fx('frostCreep'), e.x + 0.5, e.y + 0.5, 0.1);
        break;
      case 'shatter': {
        const it = state.entities.get(e.entity);
        const tint = it?.item ? (CONTENT.items[it.item.id]?.tint ?? 0xa0a0a0) : 0xa06040;
        this.burst('dust', e.x, e.y, (it?.z ?? 0) + 0.2, 16, 3.5, (tint >> 16) & 255, (tint >> 8) & 255, tint & 255, false, 0.6, 0.06);
        break;
      }
      case 'splash':
        this.play(fx('splash'), e.x, e.y, 0.1, 1 + e.size * 3, 1 + e.size);
        break;
      case 'propBroken':
        this.play(fx('propBroken'), e.x, e.y, 0.6);
        break;
      case 'ignited':
        this.play(fx('ignite'), e.x + 0.5, e.y + 0.5, e.z !== undefined && e.z !== GROUND_Z ? e.z + 0.5 : 0.3);
        break;
      case 'doused':
        this.play(fx('douse'), e.x + 0.5, e.y + 0.5, e.z !== undefined && e.z !== GROUND_Z ? e.z + 0.5 : 0.4);
        break;
      case 'impact':
        this.play(fx('impact'), e.x, e.y, 0.2, 1 + e.strength * 3);
        break;
      case 'death':
        this.play(fx('death'), e.x, e.y, 0.5);
        break;
      default:
        break;
    }
  }

  /** Feed continuous emitters (burning tiles, burning bodies, torches, projectiles, rain splashes). */
  emit(state: SimState, tiles: ReadonlyTiles, camX: number, camY: number, dt: number, env: Env): void {
    const wind = state.weather.wind;
    let n = 0;
    for (const key of state.burning) {
      const { x, y } = unpackKey(key);
      const dx = x - camX;
      const dy = y - camY;
      if (dx * dx + dy * dy > 90 * 90) continue;
      if (++n > 500) break;
      const f = tiles.fire(x, y) / 255;
      const g = tiles.ground(x + 0.5, y + 0.5);
      // Flames climb what is burning: up to 4 m on a tree, 2.5 m on a wall, low on open ground.
      const inf = tiles.info(x, y);
      const tall = inf.shape === 'block' ? 2.5 : Math.min(4, Math.max(0.6, inf.height));
      if (Math.random() < dt * 14 * (0.3 + f)) {
        const d = fx('tileFlame');
        this.one(d, x + Math.random(), y + Math.random(), Math.max(g, 0) + Math.random() * tall * 0.6, wind.x * 0.15, wind.y * 0.15, 1.2 + Math.random() * 1.5 * (0.5 + f), 0.7 + Math.random() * 0.6, 1 + (f * 0.25 + tall * 0.04) / 0.18);
      }
      if (Math.random() < dt * 3) {
        this.one(fx('tileSmoke'), x + Math.random(), y + Math.random(), Math.max(g, 0) + tall + 0.5, wind.x * 0.4, wind.y * 0.4, 1.2, 0.75 + Math.random() * 0.5);
      }
    }
    // Flames in walls, floors and roofs (3D layer cells) rise and smoke just like ground fires.
    for (const key of state.volume.burningCells) {
      const { x, y, z } = unpackSpot(key);
      const dx = x - camX;
      const dy = y - camY;
      if (dx * dx + dy * dy > 90 * 90) continue;
      if (++n > 700) break;
      const f = state.volume.cellGet('fire', x, y, z) / 255;
      if (Math.random() < dt * 14 * (0.3 + f)) {
        this.one(fx('tileFlame'), x + Math.random(), y + Math.random(), z + Math.random() * 0.9, wind.x * 0.15, wind.y * 0.15, 1.2 + Math.random() * 1.5 * (0.5 + f), 0.7 + Math.random() * 0.6, 1 + f * 0.4);
      }
      if (Math.random() < dt * 3) {
        this.one(fx('tileSmoke'), x + Math.random(), y + Math.random(), z + 1.2, wind.x * 0.4, wind.y * 0.4, 1.2, 0.75 + Math.random() * 0.5);
      }
    }
    for (const e of state.entities.values()) {
      const dx = e.pos.x - camX;
      const dy = e.pos.y - camY;
      if (dx * dx + dy * dy > 80 * 80) continue;
      const d = thingDef(CONTENT, e.def);
      // Anything that gives off firelight (torches, campfires) has a flame on top.
      if (d.light && !d.body.ghost && Math.random() < dt * (d.body.radius > 0.3 ? 40 : 20)) {
        const w = d.body.radius > 0.3 ? 0.5 : 0.12;
        // A flame in a wall bracket leans out into the room a little.
        const out = d.mount ? 0.1 : 0;
        this.one(fx('torchFlame'), e.pos.x + Math.cos(e.angle) * out + (Math.random() - 0.5) * w, e.pos.y + Math.sin(e.angle) * out + (Math.random() - 0.5) * w, e.z + d.body.height * (d.body.radius > 0.3 ? 0.3 : 1) + 0.05, wind.x * 0.05, wind.y * 0.05, 0.8 + Math.random() * 0.6, 1, d.body.radius > 0.3 ? 1.7 : 1);
      }
      // A torch in someone's hand burns at the end of their arm (your own is drawn with the view model).
      const held = d.actor ? heldLight(CONTENT, e) : undefined;
      if (held?.flame && dx * dx + dy * dy > 0.5 && Math.random() < dt * 22) {
        const c = Math.cos(e.angle);
        const sn = Math.sin(e.angle);
        this.one(fx('torchFlame'), e.pos.x + c * 0.5 - sn * 0.2 + (Math.random() - 0.5) * 0.1, e.pos.y + sn * 0.5 + c * 0.2 + (Math.random() - 0.5) * 0.1, e.z + d.body.height * 0.75, wind.x * 0.05, wind.y * 0.05, 0.8 + Math.random() * 0.6);
      }
      if ((e.status.burning ?? 0) > 0 && Math.random() < dt * 18) {
        this.one(fx('burningBody'), e.pos.x + (Math.random() - 0.5) * d.body.radius * 2, e.pos.y + (Math.random() - 0.5) * d.body.radius * 2, e.z + Math.random() * d.body.height, 0, 0, 1.5);
      }
      if ((e.status.chilled ?? 0) > 0 && Math.random() < dt * 6) {
        this.one(fx('chilledBody'), e.pos.x + (Math.random() - 0.5) * d.body.radius * 2, e.pos.y + (Math.random() - 0.5) * d.body.radius * 2, e.z + Math.random() * d.body.height, 0, 0, -0.3);
      }
      if (e.projectile) {
        const sd = spellFor(CONTENT, e.projectile.spell);
        if (sd) this.spellTrail(sd.look, e.id, e.pos.x, e.pos.y, e.z, e.vel.x, e.vel.y, e.vz, dt);
      }
      if (d.mote) {
        this.one(fx('ember'), e.pos.x, e.pos.y, e.z, 0, 0, 0);
      }
    }
    // Rain splashes on the ground around the eye.
    if (env.rain > 0.05) {
      const count = env.rain * 60 * dt * 20;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 1 + Math.random() * 14;
        const x = camX + Math.cos(a) * d;
        const y = camY + Math.sin(a) * d;
        const g = Math.max(0, tiles.ground(x, y));
        this.one(fx('rainSplash'), x, y, g + 0.02, 0, 0, 0.6);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      if (p.swirl !== 0) {
        const a = p.swirl * TAU * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const vx = p.vx * c - p.vy * s;
        p.vy = p.vx * s + p.vy * c;
        p.vx = vx;
      }
      if (p.jitter > 0) {
        const j = p.jitter * dt * 20;
        p.vx += (Math.random() - 0.5) * j;
        p.vy += (Math.random() - 0.5) * j;
        p.vz += (Math.random() - 0.5) * j;
      }
      p.vz += p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.grow !== 0) p.size *= Math.exp(p.grow * dt);
      list[w++] = p;
    }
    list.length = w;
  }

  draw(vp: Viewport, proj: Projection, env: Env): void {
    const { W, H, F, HOR, FX, FY, RX, RY } = proj;
    const cx = proj.cam.x;
    const cy = proj.cam.y;
    const cz = proj.cam.z;
    const px = vp.pixels;
    const depth = vp.depth;
    const amb = 0.35 + env.day * 0.65;
    for (const p of this.list) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const fwd = dx * FX + dy * FY;
      if (fwd < 0.2) continue;
      const right = dx * RX + dy * RY;
      const sx = W * 0.5 + (F * right) / fwd + proj.cam.shakeX;
      const sy = HOR - (F * (p.z - cz)) / fwd;
      const s = Math.max(1, (p.size * F) / fwd);
      if (sx + s < 0 || sx - s >= W || sy + s < 0 || sy - s >= H) continue;
      const t = p.life / p.max;
      const x0 = Math.max(0, Math.floor(sx - s / 2));
      const x1 = Math.min(W - 1, Math.floor(sx + s / 2));
      const y0 = Math.max(0, Math.floor(sy - s / 2));
      const y1 = Math.min(H - 1, Math.floor(sy + s / 2));
      const fog = Math.min(0.95, 1 - Math.exp(-fwd / env.fogDist));
      const rad = s / 2;
      const r2 = rad * rad + 0.25;
      // Colour fades from birth to death colour.
      const u = 1 - t;
      const pr = p.r + (p.r2 - p.r) * u;
      const pg = p.g + (p.g2 - p.g) * u;
      const pb = p.b + (p.b2 - p.b) * u;
      // Light it adds (glowing part)…
      const k = t * (1 - fog) * p.glow;
      const ar = pr * k;
      const ag = pg * k;
      const ab = pb * k;
      // …and how much it covers (solid part), lit by the sky and fogged with distance.
      const cover = (1 - p.glow) * (0.85 + (t * 0.5 - 0.85) * p.soft);
      const cr = pr * amb + (env.fog[0] - pr * amb) * fog;
      const cg = pg * amb + (env.fog[1] - pg * amb) * fog;
      const cb = pb * amb + (env.fog[2] - pb * amb) * fog;
      const soft = p.soft;
      for (let y = y0; y <= y1; y++) {
        const ddy = y + 0.5 - sy;
        for (let x = x0; x <= x1; x++) {
          const ddx = x + 0.5 - sx;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > r2) continue;
          const o = y * W + x;
          if ((depth[o] ?? 0) < fwd) continue;
          const fall = 1 - d2 / r2;
          const edge = 1 - soft + soft * fall;
          const c = px[o] ?? 0;
          let R = c & 255;
          let G = (c >>> 8) & 255;
          let B = (c >>> 16) & 255;
          if (cover > 0) {
            const aa = cover * edge;
            R += (cr - R) * aa;
            G += (cg - G) * aa;
            B += (cb - B) * aa;
          }
          if (k > 0) {
            R += ar * fall;
            G += ag * fall;
            B += ab * fall;
          }
          px[o] = pack(R, G, B);
        }
      }
    }
  }

  /** Screen-space rain streaks slanted by wind relative to where you look. */
  drawRain(vp: Viewport, proj: Projection, env: Env, windX: number, windY: number, time: number): void {
    if (env.rain < 0.05) return;
    const W = vp.width;
    const H = vp.height;
    const px = vp.pixels;
    const side = windX * proj.RX + windY * proj.RY;
    const slant = Math.max(-1.5, Math.min(1.5, side * 0.12));
    const n = Math.floor(env.rain * W * 0.9);
    this.rainSeed = (this.rainSeed + 1) % 100000;
    const light = 0.45 + env.day * 0.4;
    for (let i = 0; i < n; i++) {
      const hx = ((i * 7919 + Math.floor(time * 37) * 104729) % (W * 13)) / 13;
      const hy = (((i * 15485863) % H) + time * 420 * (1 + (i % 3) * 0.3)) % H;
      const len = 4 + (i % 4);
      for (let k = 0; k < len; k++) {
        const x = Math.floor(hx + slant * k);
        const y = Math.floor(hy + k);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const o = y * W + x;
        const c = px[o] ?? 0;
        px[o] = pack((c & 255) * 0.75 + 190 * light * 0.25, ((c >>> 8) & 255) * 0.75 + 200 * light * 0.25, ((c >>> 16) & 255) * 0.75 + 225 * light * 0.25);
      }
    }
  }
}
