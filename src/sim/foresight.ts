// A guest's foresight: one tick of its own traveller (and the crafts it may stand on) by the host's rules, touching nothing else
import { CONTENT } from '../content';
import { type Entity, type InputSnapshot, type SimContext, type SimState, emptyQueues } from '../types';
import { SpatialHash, physicsSystem } from './physics';
import { makeEntity } from './templates';
import { makeRng } from './simState';
import { playerSystem } from './player';
import { craftMotion } from './craft';

export function foresee(base: SimContext, state: SimState, playerId: string, input: InputSnapshot): void {
  const real = state;
  const id = real.players[playerId];
  const e = id !== undefined ? real.entities.get(id) : undefined;
  if (!e?.player) return;
  const own = new Map<number, Entity>([[e.id, e]]);
  const held = e.actor?.holding != null ? real.entities.get(e.actor.holding) : undefined;
  if (held) own.set(held.id, held);
  // Crafts and what is fixed aboard them fly on in foresight too, so standing on a deck keeps up with it.
  for (const o of real.entities.values()) if (o.craft || o.ride) own.set(o.id, o);
  const mini: SimState = { ...real, entities: own, players: { [playerId]: e.id }, queues: emptyQueues(), tileChanges: new Set() };
  const query = new SpatialHash();
  const ctx: SimContext = {
    ...base,
    state: mini,
    query,
    rng: makeRng({ ...mini, rng: real.tick }),
    emit: () => {},
    spawn: (thing, x, y, init) => makeEntity(CONTENT, -1, thing, x, y, init),
    dropItems: () => {},
    breakItem: () => {},
  };
  for (const o of own.values()) {
    o.prev.x = o.pos.x;
    o.prev.y = o.pos.y;
    o.prevZ = o.z;
  }
  // Only moving is foreseen. Presses (use, grab, talk…) wait for the host's answer.
  e.player.input = { ...input, interact: false, grab: false, cast: false, prepare: null, useItem: null, dropItem: null, throwItem: null, pickUp: null, wear: null, choice: null, stow: null };
  query.rebuild(own.values());
  playerSystem(ctx);
  physicsSystem(ctx);
  craftMotion(ctx);
  }
