import type { BodyRegionId, Entity, ItemId, PlayerData, SimContext, SimSystem, SkillId, ThrowAim, WearRequest } from '../../types';
import { addItem, countItem, removeItem } from '../../types';
import { itemDef, pluralName, skillXp, thingDef } from '../../content';

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
    addItem(pl.player.inventory, it.item.id, it.item.count);
    it.dead = true;
    ctx.emit({ type: 'pickup', player: pl.id, item: it.item.id, count: it.item.count });
  }

  for (const id of Object.values(state.players)) {
    const e = state.entities.get(id);
    const p = e?.player;
    if (!e || !p) continue;
    learnRunes(ctx, e, p);
    if (p.input.useItem) useItem(ctx, e, p, p.input.useItem);
    if (p.input.dropItem && removeItem(p.inventory, p.input.dropItem, 1)) {
      const z = e.z + 1;
      ctx.spawn('looseItem', e.pos.x + Math.cos(e.angle) * 0.8, e.pos.y + Math.sin(e.angle) * 0.8, {
        z,
        prevZ: z,
        vel: { x: Math.cos(e.angle) * 2, y: Math.sin(e.angle) * 2 },
        vz: 1.5,
        item: { id: p.input.dropItem, count: 1 },
      });
    }
    if (p.input.throwItem) throwFromBag(ctx, e, p, p.input.throwItem);
    if (p.input.pickUp !== null) pickFromView(ctx, e, p, p.input.pickUp);
    if (p.input.wear) changeClothes(ctx, e, p, p.input.wear);
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
        const inv = state.entities.get(id)?.player?.inventory;
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
 * (it flies and bursts), or wield it (swap weapons). Gliders and keys work just by being carried.
 */
function useItem(ctx: SimContext, e: Entity, p: PlayerData, wanted: ItemId): void {
  // '@throwable' means "whatever I can throw".
  const id = wanted === '@throwable' ? (p.inventory.find((s) => itemDef(ctx.content, s.id)?.thrown)?.id ?? '') : wanted;
  const def = itemDef(ctx.content, id);
  if (!def || !p.inventory.some((s) => s.id === id)) return;
  // Armour is worn, not used up.
  if (def.armour) {
    putOn(ctx, e, p, id);
    return;
  }
  const a = e.actor;
  if (def.weapon && a) {
    removeItem(p.inventory, id, 1);
    if (a.weapon) addItem(p.inventory, a.weapon, 1);
    a.weapon = id;
    a.wear = def.weapon.durability;
    ctx.emit({ type: 'equip', entity: e.id, item: id });
    ctx.emit({ type: 'notice', player: e.id, text: `You wield the ${def.name.toLowerCase()}.` });
    return;
  }
  if (def.thrown) {
    if (p.holding !== null) return;
    removeItem(p.inventory, id, 1);
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
    removeItem(p.inventory, id, 1);
    ctx.state.queues.effects.push({ target: { kind: 'entity', id: e.id }, effects: def.use, source: e.id, from: null });
    ctx.emit({ type: 'notice', player: e.id, text: `Used ${def.name.toLowerCase()}.` });
    return;
  }
  if (def.glide) ctx.emit({ type: 'notice', player: e.id, text: 'Jump, then hold Space in the air to open the glider. Fires below lift you.' });
  else if (def.category === 'key') ctx.emit({ type: 'notice', player: e.id, text: 'Keys work by themselves: open the lock it fits with E.' });
  else ctx.emit({ type: 'notice', player: e.id, text: `You can't use the ${def.name.toLowerCase()} like that.` });
}

/** Below this much of the screen height, letting go is a gentle drop instead of a throw. */
const DROP_BELOW = 0.15;

/**
 * An item dragged out of the bag and let go over the view. The cursor point is the direction:
 * left or right of centre turns the throw that way, higher up the screen throws harder and further,
 * and near the bottom you simply set it down in front of you. Any item can be thrown; things with
 * a `thrown` burst still burst where they land.
 */
function throwFromBag(ctx: SimContext, e: Entity, p: PlayerData, aim: ThrowAim): void {
  const def = itemDef(ctx.content, aim.item);
  if (!def || p.downed > 0 || !removeItem(p.inventory, aim.item, 1)) return;
  const yaw = Number.isFinite(aim.yaw) ? aim.yaw : e.angle;
  const lift = Math.max(-1.2, Math.min(1.2, Number.isFinite(aim.lift) ? aim.lift : 0));
  const power = Math.max(0, Math.min(1, Number.isFinite(aim.power) ? aim.power : 0));
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  if (power < DROP_BELOW) {
    const z = e.z + 0.9;
    ctx.spawn('looseItem', e.pos.x + cos * 0.7, e.pos.y + sin * 0.7, {
      z,
      prevZ: z,
      vel: { x: cos * 1.2, y: sin * 1.2 },
      vz: 0.6,
      item: { id: aim.item, count: 1 },
    });
    return;
  }
  // Light things fly further; anything made to be thrown flies at its own speed.
  const full = (def.thrown?.speed ?? Math.max(5, 13 - def.weight * 1.2)) * (1 + p.stats.might * 0.03);
  const t = (power - DROP_BELOW) / (1 - DROP_BELOW);
  const sp = 2.5 + (full - 2.5) * t;
  const z = e.z + 1.4;
  const it = ctx.spawn('looseItem', e.pos.x + cos * 0.5, e.pos.y + sin * 0.5, {
    z,
    prevZ: z,
    vel: { x: cos * Math.cos(lift) * sp + e.vel.x, y: sin * Math.cos(lift) * sp + e.vel.y },
    vz: 1 + Math.sin(lift) * sp,
    item: { id: aim.item, count: 1 },
    thrownBy: e.id,
  });
  ctx.emit({ type: 'thrown', entity: it.id, x: it.pos.x, y: it.pos.y });
}

/**
 * A loose item dragged from the view into the open bag. It is picked up only if it is still lying
 * there, within reach (rules.pickReach) and not behind a wall, closed door, tree or hillside.
 */
function pickFromView(ctx: SimContext, e: Entity, p: PlayerData, id: number): ItemId | null {
  const it = ctx.state.entities.get(id);
  if (!it?.item || it.dead || it.heldBy !== null || p.downed > 0) return null;
  const eyeZ = e.z + 1.5;
  const dx = it.pos.x - e.pos.x;
  const dy = it.pos.y - e.pos.y;
  const dz = it.z + 0.1 - eyeZ;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > ctx.content.rules.pickReach) {
    ctx.emit({ type: 'notice', player: e.id, text: 'That is too far away to reach.' });
    return null;
  }
  const { tiles } = ctx;
  const ix = Math.floor(it.pos.x);
  const iy = Math.floor(it.pos.y);
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.25);
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    const x = e.pos.x + dx * k;
    const y = e.pos.y + dy * k;
    if (Math.floor(x) === ix && Math.floor(y) === iy) continue;
    const z = eyeZ + dz * k;
    const g = tiles.ground(x, y);
    if (z < g - 0.05 || (tiles.blocked(x, y) && z < g + tiles.info(x, y).height)) {
      ctx.emit({ type: 'notice', player: e.id, text: 'You cannot reach it from here.' });
      return null;
    }
  }
  addItem(p.inventory, it.item.id, it.item.count);
  it.dead = true;
  ctx.emit({ type: 'pickup', player: e.id, item: it.item.id, count: it.item.count });
  return it.item.id;
}

/** Putting armour on, taking it off, or putting on what lies in the world: one rule for every body that wears things. */
function changeClothes(ctx: SimContext, e: Entity, p: PlayerData, req: WearRequest): void {
  if (p.downed > 0) return;
  if (req.do === 'wear') putOn(ctx, e, p, req.item);
  else if (req.do === 'remove') takeOff(ctx, e, p, req.region);
  else {
    const id = pickFromView(ctx, e, p, req.entity);
    if (id && itemDef(ctx.content, id)?.armour) putOn(ctx, e, p, id);
  }
}

/** Puts a piece from the pack on the part of the body it belongs to; what was there goes into the pack. */
function putOn(ctx: SimContext, e: Entity, p: PlayerData, id: ItemId): void {
  const def = itemDef(ctx.content, id);
  const armour = def?.armour;
  if (!def || !armour) return;
  if (!thingDef(ctx.content, e.def).wears?.includes(armour.region)) {
    ctx.emit({ type: 'notice', player: e.id, text: `You cannot wear the ${def.name.toLowerCase()}.` });
    return;
  }
  if (!removeItem(p.inventory, id, 1)) return;
  const worn = (e.worn ??= {});
  const old = worn[armour.region];
  if (old) addItem(p.inventory, old, 1);
  worn[armour.region] = id;
  ctx.emit({ type: 'armour', entity: e.id, region: armour.region, item: id });
  ctx.emit({ type: 'notice', player: e.id, text: `You put on the ${def.name.toLowerCase()}.` });
}

function takeOff(ctx: SimContext, e: Entity, p: PlayerData, region: BodyRegionId): void {
  const id = e.worn?.[region];
  if (!e.worn || !id) return;
  delete e.worn[region];
  addItem(p.inventory, id, 1);
  ctx.emit({ type: 'armour', entity: e.id, region, item: null });
  ctx.emit({ type: 'notice', player: e.id, text: `You take off the ${(itemDef(ctx.content, id)?.name ?? 'armour').toLowerCase()}.` });
}

/** Rune stones in the satchel teach their rune; the stone crumbles the first time. */
function learnRunes(ctx: SimContext, e: Entity, p: PlayerData): void {
  for (const s of [...p.inventory]) {
    const rune = itemDef(ctx.content, s.id)?.teaches;
    if (!rune || p.runes.includes(rune)) continue;
    p.runes.push(rune);
    removeItem(p.inventory, s.id, 1);
    const name = ctx.content.runes[rune]?.name ?? rune;
    ctx.emit({ type: 'runeLearned', player: e.id, rune });
    ctx.state.journal.push({ tick: ctx.state.tick, day: ctx.state.weather.day, text: `${p.name} learned the ${name} rune.` });
  }
}
