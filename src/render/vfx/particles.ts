import { type BurstDef, GROUND_Z, type MoteLook, type ParticleKind, type ReadonlyTiles, type SimEvent, type SimState, type SpellLook } from '../../types';
import { CONTENT, heldLight, itemDef, spellFor, thingDef } from '../../content';
import type { Env } from '../lighting';
import { emitFire, type FireSink } from './fireEmitter';
import { emitThings, type MoteSink } from './thingEmitters';
import { spellBurst, spellCone, spellHand, spellNova, spellTrail, spellWard, type SpellSink } from './spellEmitters';
import { KINDS, type KindMote, MAX, type Particle, TAU, fx } from './particleKinds';
import { TILES } from '../../content/tiles';


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
export class Particles implements FireSink, MoteSink, SpellSink {
  private list: Particle[] = [];
  /** The live motes (the GPU draws them). */
  get motes(): readonly Particle[] {
    return this.list;
  }
  /** Dead motes wait here to be reused, so a long fire makes no garbage. */
  private pool: Particle[] = [];
  private time = 0;
  get clock(): number {
    return this.time;
  }
  spellTrail(look: SpellLook, id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, dt: number): void {
    spellTrail(this, look, id, x, y, z, vx, vy, vz, dt);
  }

  /** A world mote of one of the fixed kinds. */
  spawn(p: KindMote): void {
    const k = KINDS[p.kind];
    this.push(p.x, p.y, p.z, p.vx, p.vy, p.vz, p.life, p.size, k.grow, p.r, p.g, p.b, p.r * k.fade[0], p.g * k.fade[1], p.b * k.fade[2], p.glow ? 1 : 0, k.soft, k.lift, k.drag, 0, 0);
  }

  private push(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, r: number, g: number, b: number, r2: number, g2: number, b2: number, glow: number, soft: number, lift: number, drag: number, swirl: number, jitter: number): void {
    if (this.list.length >= MAX || life <= 0) return;
    const q = this.pool.pop();
    if (q) {
      Object.assign(q, { x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, r2, g2, b2, glow, soft, lift, drag, swirl, jitter, pal: null });
      this.list.push(q);
    } else this.list.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r, g, b, r2, g2, b2, glow, soft, lift, drag, swirl, jitter, pal: null });
  }

  /** A flame, smoke puff or ember of a blaze: hard pixels stepping through the palette in the fire rules. */
  fire(kind: 'flame' | 'smoke' | 'ember', x: number, y: number, z: number, vx: number, vy: number, vz: number, heat: number, size: number): void {
    const v = CONTENT.rules.fire.vfx;
    const n = this.list.length;
    if (kind === 'flame') this.push(x, y, z, vx, vy, vz, 0.45 + Math.random() * 0.45 + heat * 0.2, size, -0.9, 255, 160, 60, 255, 60, 20, 1, 0, 0, 0, 0, 0.5);
    else if (kind === 'smoke') this.push(x, y, z, vx, vy, vz, 2.5 + Math.random() * 1.5, size, 0.5, 90, 84, 80, 60, 56, 54, 0, 0, 0, 0, 0, 0.2);
    else this.push(x, y, z, vx, vy, vz, 0.9 + Math.random() * 0.8, size, 0, 255, 190, 90, 255, 90, 30, 1, 0, -6, 0, 0, 0);
    const p = this.list[n];
    if (p && this.list.length > n) {
      p.pal = kind === 'smoke' ? v.smoke : kind === 'flame' ? v.palette : null;
    }
  }

  /** A spell mote in the given look, with a random 0.6–1.2 variation of its life. */
  mote(m: MoteLook, x: number, y: number, z: number, vx: number, vy: number, vz: number, sizeMul = 1, lifeMul = 1): void {
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
  one(d: BurstDef, x: number, y: number, z: number, vx: number, vy: number, vz: number, lifeMul = 1, sizeMul = 1): void {
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
          // A brand scatters embers whatever it hits.
          const src = state.entities.get(e.source);
          if (src && heldLight(CONTENT, src)?.flame) { const em = fx('ember').colour; this.burst('spark', e.x, e.y, e.z, Math.round(6 + pw * 8), 2.5, (em >> 16) & 255, (em >> 8) & 255, em & 255, true, 0.7, 0.05); }
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
        if (sp) spellHand(this, sp.look, c.pos.x, c.pos.y, c.z, c.angle);
        else if (e.stage === 'full') this.play(fx('chargeGleam'), e.x + Math.cos(c.angle) * 0.6, e.y + Math.sin(c.angle) * 0.6, c.z + 1.2);
        break;
      }
      case 'spellBurst': {
        const d = spellFor(CONTENT, e.spell);
        if (d) spellBurst(this, d.look, e.x, e.y, e.z, d.burst.radius);
        break;
      }
      case 'spellCast': {
        const d = spellFor(CONTENT, e.spell);
        const c = state.entities.get(e.entity);
        if (!d || !c) break;
        const del = d.delivery;
        if (del.type === 'nova') spellNova(this, d.look, c.pos.x, c.pos.y, c.z, del.radius);
        else if (del.type === 'self') spellWard(this, d.look, c.pos.x, c.pos.y, c.z);
        else if (del.type === 'cone') spellCone(this, d.look, c.pos.x, c.pos.y, c.z + 1.3, c.angle, del.range, del.width);
        if (del.type !== 'self') spellHand(this, d.look, c.pos.x, c.pos.y, c.z, c.angle);
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
        if (Math.random() < 0.35) this.play(fx('frostCreep'), e.x + 0.5, e.y + 0.5, e.z !== undefined && e.z !== GROUND_Z ? e.z + 0.5 : 0.1);
        break;
      case 'shatter': {
        const it = state.entities.get(e.entity);
        const tint = it?.item ? (itemDef(CONTENT, it.item.id)?.tint ?? 0xa0a0a0) : 0xa06040;
        this.burst('dust', e.x, e.y, (it?.z ?? 0) + 0.2, 16, 3.5, (tint >> 16) & 255, (tint >> 8) & 255, tint & 255, false, 0.6, 0.06);
        break;
      }
      case 'itemBroke': {
        const tint = itemDef(CONTENT, e.item)?.tint ?? 0xa0a0a0;
        this.burst('dust', e.x, e.y, e.z + 0.2, 16, 3.5, (tint >> 16) & 255, (tint >> 8) & 255, tint & 255, false, 0.6, 0.06);
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
    emitFire(this, state, tiles, camX, camY, dt);
    emitThings(this, state, camX, camY, dt);
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
      if (p.life <= 0) {
        if (this.pool.length < MAX) this.pool.push(p);
        continue;
      }
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
}
