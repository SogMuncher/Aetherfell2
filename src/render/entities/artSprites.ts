// Picks the picture for any entity drawn from art (creature, person, prop): which individual, pose, frame and side
import type { ArtDef, ArtId, Entity } from '../../types';
import { CONTENT } from '../../content';
import { rhash } from '../color';
import { sideFrom, type Projection } from '../raycaster/camera';
import { ArtBank, VIEW_DIRS, artVariants, assemble, poseFrames, variantSeed, type Pose } from './assembler';
import { artColours, artFeatures } from './artGrow';
import { outfitted } from './gearArt';
import type { Sprite } from './sprites';

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
  private lastPrune = 0;

  pick(e: Entity, id: ArtId, bare: ArtDef, p: Projection, time: number): { sprite: Sprite; scale: number; colours: Uint32Array } {
    const hand = -p.RY * p.FX + p.RX * p.FY < 0 ? -1 : 1;
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
        spin: def.gait ? 0 : rhash(e.id, 2, 211) * Math.PI * 2,
        last: time,
      };
      this.tracked.set(e.id, tr);
    }
    const bkey = `${tr.key}|${hand}`;
    let bank = this.banks.get(bkey);
    if (!bank) {
      // Pictures are shared by every individual of the same shape; colours come per individual.
      if (this.banks.size > 800) this.banks.clear();
      bank = new ArtBank(assemble(id, def, tr.variant, dress), hand);
      this.banks.set(bkey, bank);
    }
    const dt = Math.min(0.1, Math.max(0, time - tr.last));
    tr.last = time;
    const speed = Math.hypot(e.vel.x, e.vel.y);
    const moving = !!def.gait && speed > 0.3;
    if (def.gait) tr.phase += (dt * speed) / def.gait.stride;

    let pose: Pose = 'idle';
    let frame = 0;
    const sw = e.actor?.swing;
    if (e.player && e.player.downed > 0) pose = 'down';
    else if (sw && def.gait) {
      pose = 'attack';
      const nf = poseFrames(def, 'attack');
      frame = sw.t < sw.strikeAt ? Math.floor((sw.t / Math.max(1, sw.strikeAt)) * 2) : 2 + Math.floor(((sw.t - sw.strikeAt) / Math.max(1, sw.recover - sw.strikeAt)) * 2);
      frame = Math.min(nf - 1, Math.max(0, frame));
    } else if (moving) {
      pose = 'walk';
      frame = Math.floor(tr.phase * poseFrames(def, 'walk'));
    } else {
      frame = Math.floor((time * 0.7 + rhash(e.id, 5, 55)) * poseFrames(def, 'idle'));
    }

    // Which side of it the camera sees.
    let dir = 0;
    if (bank.nviews > 1) {
      const a = moving ? Math.atan2(e.vel.y, e.vel.x) : e.angle + tr.spin;
      const { rx, ry } = sideFrom(p, e.pos.x, e.pos.y);
      const rf = rx * Math.cos(a) + ry * Math.sin(a);
      const rs = -rx * Math.sin(a) + ry * Math.cos(a);
      dir = Math.round((Math.atan2(rs, rf) / (Math.PI * 2)) * VIEW_DIRS);
    }

    if (time - this.lastPrune > 5) {
      this.lastPrune = time;
      for (const [eid, t] of this.tracked) if (time - t.last > 10) this.tracked.delete(eid);
    }
    return { sprite: bank.sprite(pose, frame, dir), scale: tr.scale, colours: tr.colours };
  }
}
