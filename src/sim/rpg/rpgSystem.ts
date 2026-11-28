import type { Entity, ItemId, PlayerData, SimContext, SimSystem, SkillId } from '../../types';
import { bagOf, addItem, countItem, removeItem } from '../../types';
import { itemDef, pluralName, skillXp, thingDef } from '../../content';
import { changeClothes, followerNear, hold, putOn } from './gearHandling';
import { pickFromView, throwFromBag, throwHeld } from './throwing';
import { heave, lift } from './carrying';

/**
 * Progression: skills that grow by doing (blade, evocation, athletics, speech), picking things up,
 * using and dropping items, and keeping the shared party quest log up to date.
 */
export const rpgSystem: SimSystem = (ctx: SimContext) => {
  const { state } = ctx;

  // Pick up loose items.
  for (const u of state.queues.use) {
    if (u.entity === null) continue;
    const it = state.entities.get(u.entity);
    const pl = state.entities.get(u.player);
    if (!it?.item || it.dead || !pl?.player) continue;
    addItem(bagOf(pl), it.item.id, it.item.count);
    it.dead = true;
    ctx.emit({ type: 'pickup', player: pl.id, item: it.item.id, count: it.item.count });
  }

  // Everyone lifts and heaves big things the same way (players' keys and creatures' brains ask alike).
  for (const e of state.entities.values()) {
    const a = e.actor;
    if (!a || e.dead) continue;
    if (a.holding !== null && ctx.state.entities.get(a.holding)?.dead !== false) a.holding = null;
    if (a.wantHeave) heave(ctx, e, a.wantHeave);
    else if (a.wantLift != null) lift(ctx, e, a.wantLift);
    a.wantHeave = null;
    a.wantLift = null;
  }

  // Creatures pick up and throw with the same hands players use (their brain asks via wantPick / wantThrow).
  for (const e of state.entities.values()) {
    const a = e.actor;
    if (!a || e.player || e.dead) continue;
    const pick = a.wantPick ?? null;
    if (pick !== null) pickFromView(ctx, e, pick);
    if (a.wantThrow) throwFromBag(ctx, e, a.wantThrow);
    a.wantPick = null;
    a.wantThrow = null;
  }

  for (const id of Object.values(state.players)) {
    const e = state.entities.get(id);
    const p = e?.player;
    if (!e || !p) continue;
    learnRunes(ctx, e, p);
    if (p.input.useItem) useItem(ctx, e, p, p.input.useItem);
    if (p.input.dropItem && removeItem(bagOf(e), p.input.dropItem, 1)) {
      const z = e.z + 1;
      ctx.spawn('looseItem', e.pos.x + Math.cos(e.angle) * 0.8, e.pos.y + Math.sin(e.angle) * 0.8, {
        z,
        prevZ: z,
        vel: { x: Math.cos(e.angle) * 2, y: Math.sin(e.angle) * 2 },
        vz: 1.5,
        item: { id: p.input.dropItem, count: 1 },
      });
    }
    if (p.input.throwItem) throwFromBag(ctx, e, p.input.throwItem);
    if (p.input.throwHeld) throwHeld(ctx, e, p);
    if (p.input.pickUp !== null) pickFromView(ctx, e, p.input.pickUp);
    if (p.input.wear) changeClothes(ctx, e, p, p.input.wear);
    if (p.input.stow) stow(ctx, e, p.input.stow);
    // Skill growth from what the player has been doing.
    const moved = Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y);
    if (p.input.sprint && moved > 0.1) p.skills.athletics.xp += 0.05;
    if (p.input.cast) p.skills.evocation.xp += 2;
    for (const sk of Object.keys(p.skills) as SkillId[]) {
      const s = p.skills[sk];
      if (s.xp >= skillXp(s.level)) {
        s.xp -= skillXp(s.level);
        s.level++;
        const grow = ctx.content.rules.skills[sk];
        p.maxStamina += grow.maxStamina ?? 0;
        p.maxMana += grow.maxMana ?? 0;
        e.maxHp += grow.maxHp ?? 0;
        ctx.emit({ type: 'skillUp', player: e.id, skill: sk, level: s.level });
      }
    }
  }

  if (state.tick % 20 === 0) questProgress(ctx);

  // Kills feed skills and quests.
  for (const k of state.queues.kills) {
    const killer = state.entities.get(k.killer);
    const victim = thingDef(ctx.content, k.def);
    if (killer?.player && victim.actor) killer.player.skills.blade.xp += Math.max(3, Math.round((victim.health?.hp ?? 10) / 3));
    // Quests are the travellers' business: only a traveller's kill counts.
    if (!killer?.player) continue;
    for (const q of state.quests) {
      if (q.state !== 'active' || q.kind !== 'cull' || q.targetKind !== k.def) continue;
      if (q.progress >= q.needed) continue;
      q.progress++;
      if (q.progress >= q.needed) {
        const text = `Quest: enough ${pluralName(thingDef(ctx.content, q.targetKind))} are dead. Return to ${q.giverName}.`;
        state.journal.push({ tick: state.tick, day: state.weather.day, text });
        ctx.emit({ type: 'journal', text });
      }
    }
  }
};

/**
 * Fetch and explore jobs: a fetch counts the most any traveller carries (it is handed over when
 * reporting back); an explore job is done once a place of its kind is found after it was taken on.
 */
function questProgress(ctx: SimContext): void {
  const { state } = ctx;
  for (const q of state.quests) {
    if (q.state !== 'active') continue;
    const before = q.progress;
    if (q.kind === 'fetch') {
      let most = 0;
      for (const id of Object.values(state.players)) {
        const inv = state.entities.get(id)?.actor?.inventory;
        if (inv) most = Math.max(most, countItem(inv, q.targetKind));
      }
      q.progress = Math.min(q.needed, most);
    } else if (q.kind === 'explore' && q.progress < q.needed) {
      const since = q.since ?? 0;
      const found = state.locations.find((l) => l.kind === q.targetKind && l.discovered && (l.discoveredAt ?? -1) >= since);
      if (found) q.progress = q.needed;
    }
    if (before < q.needed && q.progress >= q.needed) {
      const text = q.kind === 'fetch' ? `Quest: you have what ${q.giverName} asked for. Bring it back.` : `Quest: you found ${q.what ?? 'the place'}. Return to ${q.giverName}.`;
      state.journal.push({ tick: state.tick, day: state.weather.day, text });
      ctx.emit({ type: 'journal', text });
    }
  }
}

/**
 * Using an item does whatever its definition says: drink or eat it (effects on you), throw it
 * (it flies and bursts), wear it (armour, a glider on the back) or wield it (swap weapons). Keys work just by being carried.
 */
function useItem(ctx: SimContext, e: Entity, p: PlayerData, wanted: ItemId): void {
  // '@throwable' means "whatever I can throw".
  const id = wanted === '@throwable' ? (bagOf(e).find((s) => itemDef(ctx.content, s.id)?.thrown)?.id ?? '') : wanted;
  const def = itemDef(ctx.content, id);
  if (!def || !bagOf(e).some((s) => s.id === id)) return;
  // Armour is worn, not used up; weapons go into the hands (anything else can be put there on the paperdoll).
  if (def.armour) {
    putOn(ctx, e, id);
    if (def.glide && Object.values(e.worn ?? {}).includes(id)) ctx.emit({ type: 'notice', player: e.id, text: 'Jump, then hold Space in the air to open the glider. Fires below lift you.' });
    return;
  }
  if (def.weapon) {
    hold(ctx, e, id);
    return;
  }
  if (def.thrown) {
    if (e.actor?.holding != null) return;
    removeItem(bagOf(e), id, 1);
    const pitch = p.input.pitch * 0.9;
    const sp = def.thrown.speed * (1 + p.stats.might * 0.03);
    const cos = Math.cos(e.angle);
    const sin = Math.sin(e.angle);
    const z = e.z + 1.4;
    const it = ctx.spawn('looseItem', e.pos.x + cos * 0.5, e.pos.y + sin * 0.5, {
      z,
      prevZ: z,
      vel: { x: cos * sp * Math.cos(pitch) + e.vel.x, y: sin * sp * Math.cos(pitch) + e.vel.y },
      vz: 2.5 + Math.sin(pitch) * sp,
      item: { id, count: 1 },
      thrownBy: e.id,
    });
    ctx.emit({ type: 'thrown', entity: it.id, x: it.pos.x, y: it.pos.y });
    return;
  }
  if (def.use) {
    removeItem(bagOf(e), id, 1);
    ctx.state.queues.effects.push({ target: { kind: 'entity', id: e.id }, effects: def.use, source: e.id, from: null });
    ctx.emit({ type: 'notice', player: e.id, text: `Used ${def.name.toLowerCase()}.` });
    return;
  }
  if (def.calls) {
    ctx.state.queues.calls.push({ thing: def.calls, x: e.pos.x, y: e.pos.y, by: e.id });
    ctx.emit({ type: 'call', entity: e.id, x: e.pos.x, y: e.pos.y });
    ctx.emit({ type: 'notice', player: e.id, text: `You blow the ${def.name.toLowerCase()}.` });
    return;
  }
  if (def.category === 'key') ctx.emit({ type: 'notice', player: e.id, text: 'Keys work by themselves: open the lock it fits with E.' });
  else ctx.emit({ type: 'notice', player: e.id, text: `You can't use the ${def.name.toLowerCase()} like that.` });
}

/** Rune stones in the satchel teach their rune; the stone crumbles the first time. */
function learnRunes(ctx: SimContext, e: Entity, p: PlayerData): void {
  for (const s of [...bagOf(e)]) {
    const rune = itemDef(ctx.content, s.id)?.teaches;
    if (!rune || p.runes.includes(rune)) continue;
    p.runes.push(rune);
    removeItem(bagOf(e), s.id, 1);
    const name = ctx.content.runes[rune]?.name ?? rune;
    ctx.emit({ type: 'runeLearned', player: e.id, rune });
    ctx.state.journal.push({ tick: ctx.state.tick, day: ctx.state.weather.day, text: `${p.name} learned the ${name} rune.` });
  }
}

/** Moves one stack between the bag and a store within reach (a ship's hold, or a party member's bag): in while there is room, or back out. */
function stow(ctx: SimContext, e: Entity, s: { entity: number; item: ItemId; put: boolean }): void {
  const mate = followerNear(ctx, e, s.entity);
  const t = mate ?? ctx.state.entities.get(s.entity);
  const room = t && !mate ? thingDef(ctx.content, t.def).store : undefined;
  const kept = mate ? bagOf(mate) : t?.stored;
  if (!t || !kept || (!mate && !room) || t.dead || Math.hypot(t.pos.x - e.pos.x, t.pos.y - e.pos.y) > 3.5 || Math.abs(t.z - e.z) > 2.5) return;
  const from = s.put ? bagOf(e) : kept;
  const to = s.put ? kept : bagOf(e);
  const n = countItem(from, s.item);
  if (n === 0) return;
  if (room && s.put && !to.some((x) => x.id === s.item) && to.length >= room.slots) {
    ctx.emit({ type: 'notice', player: e.id, text: 'The hold is full.' });
    return;
  }
  removeItem(from, s.item, n);
  addItem(to, s.item, n);
}
