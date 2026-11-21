import type { Entity, LookDef } from '../../types';
import { CONTENT } from '../../content';
import { rhash } from '../color';
import type { Projection } from '../raycaster/camera';
import { BodyBank, POSE_FRAMES, VIEW_DIRS, individual } from './bodyArt';
import type { Pose } from './bodyArt';
import type { Sprite } from './sprites';

interface Tracked {
  bank: BodyBank;
  /** Its own colours, laid over the shared picture. */
  colours: Uint32Array;
  scale: number;
  /** Distance walked, in strides. */
  phase: number;
  last: number;
}

/**
 * Chooses the sprite for a creature with a look: which individual it is (colours, features, dress
 * from its job), which way it faces relative to the camera, and which moment of which animation.
 * Animation state lives only here (render side) and is read from plain sim facts: speed, a swing
 * in progress, being knocked down.
 */
export class CreatureSprites {
  private banks = new Map<string, BodyBank>();
  private tracked = new Map<number, Tracked>();
  private lastPrune = 0;

  pick(e: Entity, lookId: string, look: LookDef, p: Projection, time: number): { sprite: Sprite; scale: number; colours: Uint32Array } {
    const hand = -p.RY * p.FX + p.RX * p.FY < 0 ? -1 : 1;
    let tr = this.tracked.get(e.id);
    if (!tr || tr.bank.ind.look !== look) {
      const dress = e.npc ? CONTENT.roles[e.npc.role]?.dress : undefined;
      const ind = individual(lookId, look, e.id, dress);
      const key = `${ind.key}|${hand}`;
      let bank = this.banks.get(key);
      if (!bank) {
        // Pictures are shared by every individual with the same features; colours come per individual.
        if (this.banks.size > 400) this.banks.clear();
        bank = new BodyBank(ind, hand);
        this.banks.set(key, bank);
      }
      const vary = look.vary ?? 0;
      tr = { bank, colours: ind.colours, scale: 1 + (rhash(e.id, 3, 55) - 0.5) * 2 * vary, phase: rhash(e.id, 4, 55), last: time };
      this.tracked.set(e.id, tr);
    }
    const dt = Math.min(0.1, Math.max(0, time - tr.last));
    tr.last = time;
    const speed = Math.hypot(e.vel.x, e.vel.y);
    const moving = speed > 0.3;
    tr.phase += (dt * speed) / look.gait.stride;

    let pose: Pose = 'idle';
    let frame = 0;
    const sw = e.actor?.swing;
    if (e.player && e.player.downed > 0) pose = 'down';
    else if (sw) {
      pose = 'attack';
      frame = sw.t < sw.strikeAt ? Math.floor((sw.t / Math.max(1, sw.strikeAt)) * 2) : 2 + Math.floor(((sw.t - sw.strikeAt) / Math.max(1, sw.recover - sw.strikeAt)) * 2);
      frame = Math.min(POSE_FRAMES.attack - 1, Math.max(0, frame));
    } else if (moving) {
      pose = 'walk';
      frame = Math.floor(tr.phase * POSE_FRAMES.walk);
    } else {
      frame = Math.floor((time * 0.7 + rhash(e.id, 5, 55)) * POSE_FRAMES.idle);
    }

    // Which side of it the camera sees.
    const a = moving ? Math.atan2(e.vel.y, e.vel.x) : e.angle;
    const rf = p.RX * Math.cos(a) + p.RY * Math.sin(a);
    const rs = -p.RX * Math.sin(a) + p.RY * Math.cos(a);
    const psi = Math.atan2(rs, rf);
    const dir = Math.round((psi / (Math.PI * 2)) * VIEW_DIRS);

    if (time - this.lastPrune > 5) {
      this.lastPrune = time;
      for (const [id, t] of this.tracked) if (time - t.last > 10) this.tracked.delete(id);
    }
    return { sprite: tr.bank.sprite(pose, frame, dir), scale: tr.scale, colours: tr.colours };
  }
}
