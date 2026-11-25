// The line under the crosshair: what pressing E (or F, or jumping) would do with what you are looking at
import type { Entity, SimState } from '../../types';
import { CONTENT, itemDef, thingDef } from '../../content';
import { esc } from './bagParts';

export function promptText(state: SimState, e: Entity): string {
  const p = e.player;
  if (!p) return '';
  if (p.holding !== null) {
    const h = state.entities.get(p.holding);
    return `Carrying ${esc(h ? thingName(h) : 'something')} — <kbd>F</kbd> throw (look up to throw far)`;
  }
  if (p.station != null) {
    const at = state.entities.get(p.station);
    const st = at ? thingDef(CONTENT, at.def).station : undefined;
    return st ? `${st.axis === 'strafe' ? '<kbd>A</kbd>/<kbd>D</kbd>' : '<kbd>W</kbd>/<kbd>S</kbd>'} work the ${esc(at ? thingName(at) : '')} (it eases back if you let go) — <kbd>E</kbd> step away, it stays set` : '';
  }
  let best: Entity | null = null;
  let bd = 2.8;
  for (const o of state.entities.values()) {
    if (o === e || o.dead) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > bd || Math.abs(o.z - e.z) > 2) continue;
    let da = Math.atan2(dy, dx) - e.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.75 && d > 0.8) continue;
    if (thingDef(CONTENT, o.def).body.ghost) continue;
    best = o;
    bd = d;
  }
  let text = '';
  if (best) {
    const d = thingDef(CONTENT, best.def);
    const name = esc(thingName(best));
    if (d.station) text = `<kbd>E</kbd> ${esc(d.station.text)}`;
    else if (d.store) text = `<kbd>E</kbd> Open the ${name}`;
    else if (d.onJump) text = `Jump from the ${name} to be flung out and up`;
    else if (d.use) text = best.cooldown > 0 ? `A ${name}` : `<kbd>E</kbd> Use ${name}`;
    else if (d.talk) text = `<kbd>E</kbd> Talk to ${esc(best.npc?.name ?? name)}`;
    else if (d.container) {
      const lock = d.container.lock && best.container?.locked ? ` (locked — needs a ${esc(CONTENT.items[d.container.lock]?.name.toLowerCase() ?? 'key')})` : '';
      text = best.container?.opened ? `Empty ${name}` : `<kbd>E</kbd> Open ${name}${lock}`;
    } else if (best.item) text = `<kbd>E</kbd> Take ${name}${best.item.count > 1 ? ` ×${best.item.count}` : ''}`;
    else if ((best.player?.downed ?? 0) > 0) text = `<kbd>E</kbd> Revive ${esc(best.player?.name ?? '')}`;
    else if (d.carry && d.body.mass <= 60) text = `<kbd>F</kbd> Grab ${name}`;
    else if (d.contact) text = `A ${name}. Something heavy stepping on it would set it off.`;
  }
  return text;
}

export function thingName(e: Entity): string {
  if (e.item) return itemDef(CONTENT, e.item.id)?.name ?? 'item';
  return thingDef(CONTENT, e.def).name;
}
