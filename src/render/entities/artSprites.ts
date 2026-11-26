// Picks the picture for any entity drawn from art (creature, person, prop): which individual, pose, frame and side
import type { ArtDef, ArtId, Entity } from '../../types';
import { CONTENT, thingDef } from '../../content';
import { rhash } from '../color';
import { sideFrom, type Projection } from '../raycaster/camera';
import { ArtBank, VIEW_DIRS, artVariants, assemble, poseFrames, variantSeed, type Pose } from './assembler';
import { artColours, artFeatures } from './artGrow';
import { outfitted } from './gearArt';
import { itemCard } from './itemCard';
import type { Sprite } from './sprites';

/**
 * The move a body is in and which of its pictures (assembler MOVE_FRAMES) shows now, from the sim's
 * own timing: winding up while charging (held once wound), the swing up to the tick the blow lands
 * (`strikeAt`), then follow-through and settling until it can act again (`recover`). A throw has no
 * sim timing (the item leaves at once), so it plays from the release for its move's `time`.
 */
export function moveFrame(e: Entity, threwAt: number | undefined, time: number): [Pose, number] | null {
  const a = e.actor;
  const sw = a?.swing;
  if (sw) {
    if (sw.t < sw.strikeAt) return [sw.dir, sw.power > 0 || sw.t >= sw.strikeAt * 0.5 ? 2 : 1];
    const r = (sw.t - sw.strikeAt) / Math.max(1, sw.recover - sw.strikeAt);
    return [sw.dir, r < 0.3 ? 3 : r < 0.65 ? 4 : 5];
  }
  const ch = a?.charge;
  if (ch) return [ch.dir, ch.t < CONTENT.rules.combat.charge.full * 0.4 ? 0 : 1];
  if (threwAt === undefined) return null;
  const u = Number.isNaN(threwAt) ? 0 : (time - threwAt) / (CONTENT.moves.throw.time ?? 0.5);
  if (u >= 1) return null;
  return ['throw', u < 0.15 ? 3 : u < 0.55 ? 4 : 5];
}

interface Tracked {
  def: ArtDef;
  variant: number;
  /** Picture key without handedness (recipe, variant, features). */
  key: string;
  /** Its own colours, laid over the shared picture. */
  colours: Uint32Array;
  scale: number;
  /** Distance walked, in strides. */
  phase: number;
  /** Its own resting angle, for things that do not walk. */
  spin: number;
  last: number;
}

/**
 * Every entity with an art recipe goes through here. Things with a gait face where they go and
 * walk, rest, strike or lie down, read from plain sim facts (speed, a swing in progress, being
 * downed); everything else sits at its own angle. Animation state lives only here (render side).
 */
export class ArtSprites {
  private banks = new Map<string, ArtBank>();
  private tracked = new Map<number, Tracked>();
  private stills = new Map<ArtId, Uint32Array>();
  private lastPrune = 0;
  /** When each thrower let go (NaN until its next picture takes the time). */
  private throws = new Map<number, number>();

  /** Someone let an item go (the 'thrown' event): they play the throw from its release. */
  thrown(id: number): void {
    this.throws.set(id, NaN);
  }

  /** One still picture of a recipe that looks the same from every side (a chain link), in its own colours. */
  still(id: ArtId): { sprite: Sprite; colours: Uint32Array } | null {
    const def = CONTENT.art[id];
    if (!def) return null;
    let bank = this.banks.get(`still|${id}`);
    if (!bank) {
      bank = new ArtBank(assemble(id, def, 0), 1, itemCard);
      this.banks.set(`still|${id}`, bank);
    }
    let colours = this.stills.get(id);
    if (!colours) {
      colours = artColours(def, 7);
      this.stills.set(id, colours);
    }
    return { sprite: bank.sprite('idle', 0, 0), colours };
  }

  /** Its picture seen by camera `p`, or turned to side `p.dir` (a portrait, like the paperdoll's). */
  pick(e: Entity, id: ArtId, bare: ArtDef, p: Projection | { dir: number }, time: number): { sprite: Sprite; scale: number; colours: Uint32Array } {
    const hand = 'dir' in p || -p.RY * p.FX + p.RX * p.FY >= 0 ? 1 : -1;
    // What it wears and holds is drawn on it (gearArt.ts); the individual underneath stays the same.
    const outfit = outfitted(id, bare, e);
    const def = outfit?.def ?? bare;
    const role = e.npc ? CONTENT.roles[e.npc.role]?.dress : undefined;
    const dress = outfit?.hides.length ? { ...role, without: [...(role?.without ?? []), ...outfit.hides] } : role;
    let tr = this.tracked.get(e.id);
    // A chest that opens changes recipe: it takes new colours with it.
    if (!tr || tr.def !== def) {
      const variant = Math.floor(rhash(e.id, 1, 211) * artVariants(def));
      const features = artFeatures(def, variantSeed(id, variant), dress);
      tr = {
        def,
        variant,
        key: `${outfit?.id ?? id}|${variant}|${features.join(',')}`,
        colours: artColours(def, e.id * 31 + 7, dress),
        scale: 1 + (rhash(e.id, 3, 55) - 0.5) * 2 * (def.vary ?? 0),
        phase: rhash(e.id, 4, 55),
        // Fixed things (stations, furniture) face the way they were set; loose ones lie any which way.
        spin: def.gait || thingDef(CONTENT, e.def).body.anchored ? 0 : rhash(e.id, 2, 211) * Math.PI * 2,
        last: time,
      };
      this.tracked.set(e.id, tr);
    }
    const bkey = `${tr.key}|${hand}`;
    let bank = this.banks.get(bkey);
    if (!bank) {
      // Pictures are shared by every individual of the same shape; colours come per individual.
      if (this.banks.size > 800) this.banks.clear();
      bank = new ArtBank(assemble(id, def, tr.variant, dress), hand, itemCard);
      this.banks.set(bkey, bank);
    }
    const dt = Math.min(0.1, Math.max(0, time - tr.last));
    tr.last = time;
    const speed = Math.hypot(e.vel.x, e.vel.y);
    const moving = !!def.gait && speed > 0.3;
    if (def.gait) tr.phase += (dt * speed) / def.gait.stride;

    let pose: Pose = 'idle';
    let frame = 0;
    const act = def.gait ? moveFrame(e, this.throws.get(e.id), time) : null;
    if (e.player && e.player.downed > 0) pose = 'down';
    else if (act) [pose, frame] = act;
    else if (moving) {
      pose = 'walk';
      frame = Math.floor(tr.phase * poseFrames(def, 'walk'));
    } else {
      frame = Math.floor((time * 0.7 + rhash(e.id, 5, 55)) * poseFrames(def, 'idle'));
    }

    // Which side of it the camera sees.
    let dir = 0;
    if ('dir' in p) dir = p.dir;
    else if (bank.nviews > 1) {
      const a = moving ? Math.atan2(e.vel.y, e.vel.x) : e.angle + tr.spin;
      const { rx, ry } = sideFrom(p, e.pos.x, e.pos.y);
      const rf = rx * Math.cos(a) + ry * Math.sin(a);
      const rs = -rx * Math.sin(a) + ry * Math.cos(a);
      dir = Math.round((Math.atan2(rs, rf) / (Math.PI * 2)) * VIEW_DIRS);
    }

    const th = this.throws.get(e.id);
    if (th !== undefined && Number.isNaN(th)) this.throws.set(e.id, time);
    if (time - this.lastPrune > 5) {
      for (const [eid, t] of this.throws) if (time - t > 2) this.throws.delete(eid);
      this.lastPrune = time;
      for (const [eid, t] of this.tracked) if (time - t.last > 10) this.tracked.delete(eid);
    }
    return { sprite: bank.sprite(pose, frame, dir), scale: tr.scale, colours: tr.colours };
  }
}
