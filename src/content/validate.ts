import { type Content, type Effect, PARTICLE_KINDS, Tile } from '../types';
import { SWING_DIRS } from '../types/input';
import { colourProblem, paletteProblems } from './palettes';
import { formProblems } from './forms';
import { gearProblems, itemDef } from './gear';
import { lookProblems } from './looks';
import { spellFor, spellKey } from './spellcraft';
import { tileTableProblems } from './tiles';
import { validateShapes } from './shapes';


/**
 * Checks that every reference points at something that exists. Returns a list of problems
 * (empty when all is well) so a typo in content becomes a clear message instead of a silent bug.
 */
export function validateContent(c: Content): string[] {
  const out: string[] = [];
  const need = (ok: boolean, where: string, what: string): void => {
    if (!ok) out.push(`${where}: unknown ${what}`);
  };
  const effects = (list: readonly Effect[], where: string): void => {
    for (const e of list) {
      if (e.type === 'status') need(e.id in c.statuses, where, `status '${e.id}'`);
      if (e.type === 'spawn') need(e.thing in c.things, where, `thing '${e.thing}'`);
    }
  };
  for (const l of c.sky.layers) {
    const w = `cloud layer '${l.name}'`;
    if (!(l.height > 0 && l.scale > 0 && l.softness > 0 && l.speed >= 0)) out.push(`${w}: height, size, softness must be positive`);
    if (l.opacity < 0 || l.opacity > 1 || l.shadow < 0 || l.shadow > 1) out.push(`${w}: opacity and shadow are shares between 0 and 1`);
    if (!(l.detail >= 1 && l.detail <= 6)) out.push(`${w}: detail runs from 1 to 6`);
  }
  out.push(...validateShapes());
  out.push(...gearProblems(c));
  for (const [id, s] of Object.entries(c.structures)) {
    const w = `structure '${id}'`;
    const mats = [...s.materials.wall, ...(s.materials.trim ?? []), ...s.materials.floor, ...s.materials.roof, ...(s.materials.foundation ?? [])];
    for (const m of mats) if (!(m in c.tileIds)) out.push(`${w}: unknown material tile '${m}'`);
    if (s.materials.wall.length === 0 || s.materials.floor.length === 0 || s.materials.roof.length === 0) out.push(`${w}: needs at least one wall, floor and roof material`);
    if (!(s.width[0] >= 3 && s.width[0] <= s.width[1] && s.width[1] <= 30 && s.depth[0] >= 3 && s.depth[0] <= s.depth[1] && s.depth[1] <= 30)) out.push(`${w}: footprint must run from 3 to 30 metres`);
    for (const f of s.furnish ?? []) need(f.thing in c.things, w, `furnishing thing '${f.thing}'`);
    if (s.storeys && !(s.storeys[0] >= 1 && s.storeys[0] <= s.storeys[1] && s.storeys[1] <= 8)) out.push(`${w}: storeys run from 1 to 8`);
  }
  if (c.rules.sites.keep <= c.rules.sites.fill) out.push('rules.sites: keep must be further than fill, or places empty before anyone arrives');
  {
    const d = c.rules.day;
    if (!(d.minutes > 0)) out.push('rules.day: minutes must be above 0');
    if (!(d.nightUntil < d.morningUntil && d.morningUntil < d.afternoonUntil && d.afternoonUntil <= d.nightFrom && d.nightFrom < 1)) {
      out.push('rules.day: hours must run nightUntil < morningUntil < afternoonUntil <= nightFrom < 1');
    }
    for (const q of c.rules.quickUse) if (q !== '' && !q.startsWith('@') && !itemDef(c, q)) out.push(`rules.quickUse: unknown item '${q}'`);
    for (const [id, b] of Object.entries(c.effects)) {
      if (!PARTICLE_KINDS.includes(b.kind)) out.push(`effect '${id}': unknown mote kind '${b.kind}'`);
      if (!(b.count >= 0 && b.life > 0 && b.size > 0)) out.push(`effect '${id}': count, life and size must be positive`);
    }
    for (const [k, v] of Object.entries(c.hud)) if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) out.push(`hud.${k}: '${v}' is not a #colour`);
    for (const [k, f] of Object.entries(c.rules.factions)) if (!c.factions[f]) out.push(`rules.factions.${k}: unknown faction '${f}'`);
  }
  for (const [k, t] of Object.entries(c.tiles)) need(t.material in c.materials, `tile ${k} (${t.name})`, `material '${t.material}'`);
  for (const [id, t] of Object.entries(c.things)) {
    const w = `thing '${id}'`;
    need(t.material in c.materials, w, `material '${t.material}'`);
    if (t.faction) need(t.faction in c.factions, w, `faction '${t.faction}'`);
    if (t.brain) need(t.brain in c.brains, w, `brain '${t.brain}'`);
    if (t.brain && !t.actor) out.push(`${w}: has a brain but no actor`);
    if (t.actor?.weapon.effects) effects(t.actor.weapon.effects, `${w} weapon`);
    if (t.container) {
      need(t.container.loot in c.loot, w, `loot '${t.container.loot}'`);
      if (t.container.lock) need(t.container.lock in c.items, w, `key item '${t.container.lock}'`);
    }
    if (t.onDestroy?.loot) need(t.onDestroy.loot in c.loot, w, `loot '${t.onDestroy.loot}'`);
    if (t.onDestroy?.effects) effects(t.onDestroy.effects, w);
    if (t.onImpact) effects(t.onImpact.effects, w);
    if (t.contact) effects(t.contact.effects, w);
    if (t.mote) effects(t.mote.onLand, w);
  }
  for (const [id, it] of Object.entries(c.items)) {
    if (it.use) effects(it.use, `item '${id}'`);
    if (it.thrown) effects(it.thrown.effects, `item '${id}'`);
    if (it.weapon?.effects) effects(it.weapon.effects, `item '${id}' weapon`);
  }
  for (const [id, b] of Object.entries(c.brains)) {
    const w = `brain '${id}'`;
    if (!b.behaviours.length) out.push(`${w}: has no behaviours`);
    for (const be of b.behaviours) {
      if ((be.do === 'fleeFire' || be.do === 'graze' || be.do === 'lurk' || be.do === 'wander' || be.do === 'routine') && (be.chance < 0 || be.chance > 1)) out.push(`${w}: ${be.do} chance must be 0..1`);
      if (be.do === 'retreat' && (be.below <= 0 || be.below > 1)) out.push(`${w}: retreat below must be above 0 and at most 1`);
      if (be.do === 'avoid' && (be.within <= 0 || be.within > 1)) out.push(`${w}: avoid within must be above 0 and at most 1`);
      if (be.do === 'graze' && be.ticks[0] > be.ticks[1]) out.push(`${w}: graze ticks must be [shortest, longest]`);
    }
  }
  for (const [id, it] of Object.entries(c.items)) if (it.teaches) need(it.teaches in c.runes, `item '${id}'`, `rune '${it.teaches}'`);
  for (const [id, r] of Object.entries(c.runes)) {
    const w = `rune '${id}'`;
    const roles = (r.essence ? 1 : 0) + (r.shape ? 1 : 0) + (r.power ? 1 : 0);
    if (roles !== 1) out.push(`${w}: must be exactly one of essence, shape or power`);
    if (id.includes('+')) out.push(`${w}: ids may not contain '+'`);
    if (r.essence) {
      effects(r.essence.hit, w);
      effects(r.essence.burst.effects, w);
      effects(r.essence.ward, w);
    }
  }
  for (const id of [...c.startingRunes, ...c.runeOrder]) need(id in c.runes, 'rune lists', `rune '${id}'`);
  for (const [id, s] of Object.entries(c.statuses)) {
    for (const o of [...s.cancels, ...s.blockedBy]) need(o in c.statuses, `status '${id}'`, `status '${o}'`);
    for (const ev of s.every) effects(ev.effects, `status '${id}'`);
  }
  for (const [id, f] of Object.entries(c.factions)) for (const o of Object.keys(f.feels)) need(o in c.factions, `faction '${id}'`, `faction '${o}'`);
  for (const [id, l] of Object.entries(c.loot)) for (const e of l.entries) if (!e.gear) need(e.item in c.items, `loot '${id}'`, `item '${e.item}'`);
  for (const h of c.habitats) {
    need(h.thing in c.things, 'habitat', `thing '${h.thing}'`);
    if (h.realm !== undefined) need(h.realm in c.realms, 'habitat', `realm '${h.realm}'`);
  }
  need('overworld' in c.realms, 'realms', "the 'overworld' realm");
  for (const [id, r] of Object.entries(c.realms)) {
    const w = `realm '${id}'`;
    if (r.arrival !== undefined) need(r.arrival.thing in c.things, w, `arrival thing '${r.arrival.thing}'`);
    if (r.wipe !== undefined) need(r.wipe in c.realms, w, `wipe realm '${r.wipe}'`);
    if (r.ceiling !== undefined) need(r.ceiling.tile in c.tileIds, w, `ceiling tile '${r.ceiling.tile}'`);
    for (const sc of r.scatter ?? []) for (const u of sc.under ?? []) need(u in c.sites, w, `scatter site '${u}'`);
  }
  for (const [id, t] of Object.entries(c.things)) if (t.portal !== undefined) need(t.portal.to in c.realms, `thing '${id}'`, `realm '${t.portal.to}'`);
  const tile = (k: number, where: string): void => need(k in c.tiles, where, `tile ${k}`);
  let share = 0;
  for (const [id, s] of Object.entries(c.sites)) {
    share += s.chance;
    const l = s.layout;
    const w = `site '${id}'`;
    if (!(s.chance >= 0 && s.chance <= 1)) out.push(`${w}: chance must be between 0 and 1`);
    if (l.shape === 'village') {
      [l.path, l.ground].forEach((k) => tile(k, w));
      for (const b of [...Object.keys(l.buildings), ...(l.styles ?? []).flatMap((st) => Object.keys(st.buildings ?? {}))]) need(b in c.structures, w, `building '${b}'`);
      if (l.centre !== undefined) need(l.centre in c.tileIds, w, `tile '${l.centre}'`);
    }
    else if (l.shape === 'rings') [l.wall, l.floor, l.scatter.tile].forEach((k) => tile(k, w));
    else if (l.shape === 'circle') [l.stone, l.floor].forEach((k) => tile(k, w));
    else if (l.shape === 'city') {
      [l.tiles.main, l.tiles.street, l.tiles.ground].forEach((k) => tile(k, w));
      for (const id of [l.walls.run, l.walls.tower, l.walls.gate, l.centre.keep, ...l.centre.landmarks.map((m) => m.structure)]) need(id in c.structures, w, `structure '${id}'`);
      for (const d of l.districts) {
        for (const id of [...Object.keys(d.lots), ...Object.keys(d.block?.buildings ?? {})]) need(id in c.structures, `${w} district '${d.name}'`, `structure '${id}'`);
      }
      for (const st of [l.streets, ...(l.streetStyles ?? [])]) if (st.width % 2 === 0 || st.main % 2 === 0) out.push(`${w}: street widths must be odd`);
    } else [l.innerTile, l.floor].forEach((k) => tile(k, w));
    if (s.way) {
      need(s.way.grade in c.world.roads.grades, w, `way grade '${s.way.grade}'`);
      if (!(s.way.links >= 1)) out.push(`${w}: way.links must be at least 1`);
    }
    if (s.under && !(s.under.hall >= 2 && s.under.hall <= 7)) out.push(`${w}: under.hall must be between 2 and 7 (a hall must fit its 16 m square)`);
    for (const r of s.villagers ?? []) need(r in c.roles, w, `role '${r}'`);
    for (const p of s.population) {
      need(p.thing in c.things, `site '${id}'`, `thing '${p.thing}'`);
      if (p.item) need(p.item.id in c.items, `site '${id}'`, `item '${p.item.id}'`);
    }
  }
  if (share <= 0) out.push('sites: no kind of place has a chance above 0');
  for (const [id, r] of Object.entries(c.roles)) {
    const w = `role '${id}'`;
    for (const s of r.stock) need(s.id in c.items, w, `item '${s.id}'`);
    const q = r.quest;
    if (q?.kind === 'cull') need(q.target in c.things, w, `thing '${q.target}'`);
    if (q?.kind === 'fetch') need(q.item in c.items, w, `item '${q.item}'`);
    if (q?.kind === 'explore') need(q.site in c.sites, w, `site '${q.site}'`);
    const b = r.trade?.barter;
    if (b) for (const i of [...b.buys, b.sells]) need(i in c.items, w, `item '${i}'`);
  }
  const ru = c.rules;
  need(ru.currency in c.items, 'rules', `currency item '${ru.currency}'`);
  for (const r of [ru.reactions.heat, ru.reactions.soak, ru.reactions.chill]) {
    need(r.status in c.statuses, 'rules.reactions', `status '${r.status}'`);
    if (r.longerWhile) need(r.longerWhile.status in c.statuses, 'rules.reactions', `status '${r.longerWhile.status}'`);
  }
  for (const s of [ru.combat.parry.status, ru.combat.block.status, ru.combat.heavyHit.status]) need(s in c.statuses, 'rules.combat', `status '${s}'`);
  // Swings: every direction is defined and falls back to directions that exist.
  for (const d of SWING_DIRS) {
    const sw = ru.combat.swings[d];
    if (!sw) {
      out.push(`rules.combat.swings: missing '${d}'`);
      continue;
    }
    for (const f of sw.else) need((SWING_DIRS as readonly string[]).includes(f), `rules.combat.swings.${d}`, `fallback '${f}'`);
    if (sw.windup < 1 || sw.recover < 1) out.push(`rules.combat.swings.${d}: windup and recover must be at least 1 tick`);
  }
  if (ru.combat.charge.full <= ru.combat.charge.tap) out.push('rules.combat.charge: full must be later than tap');
  need(ru.combat.hitstun.status in c.statuses, 'rules.combat.hitstun', `status '${ru.combat.hitstun.status}'`);
  for (const [id, m] of Object.entries(c.materials)) if (m.hardness < 0 || m.hardness > 1) out.push(`material '${id}': hardness must be 0..1`);
  for (const [id, t] of Object.entries(c.things)) {
    const w = `thing '${id}'`;
    for (const d of t.actor?.weapon.swings ?? []) need((SWING_DIRS as readonly string[]).includes(d), w, `swing '${d}'`);
    if (t.brain) {
      for (const b of c.brains[t.brain]?.behaviours ?? []) {
        if (b.do !== 'cast') continue;
        if (!t.actor?.caster) out.push(`${w}: brain '${t.brain}' casts but the thing has no actor.caster`);
        for (const sp of b.spells) if (!spellFor(c, spellKey(sp.runes))) out.push(`${w}: brain '${t.brain}' casts '${spellKey(sp.runes)}' which is not a valid spell`);
      }
    }
  }
  for (const d of SWING_DIRS) {
    need(!!c.viewmodel.wind[d] && !!c.viewmodel.end[d], 'viewmodel', `poses for swing '${d}'`);
  }
  for (const [id, it] of Object.entries(c.items)) if (it.light && !(it.light.radius > 0)) out.push(`item '${id}': a light needs a radius`);
  for (const [id, t] of Object.entries(c.things)) if (t.mount && !(t.mount.height >= 0 && t.mount.flush >= 0 && t.mount.flush <= 0.5)) out.push(`thing '${id}': mount height must be 0 or more and flush between 0 and 0.5`);
  for (const [id, it] of Object.entries(c.items)) for (const d of it.weapon?.swings ?? []) need((SWING_DIRS as readonly string[]).includes(d), `item '${id}' weapon`, `swing '${d}'`);
  need(ru.fire.mote in c.things, 'rules.fire', `thing '${ru.fire.mote}'`);
  for (const s of ru.start.inventory) need(!!itemDef(c, s.id), 'rules.start', `item '${s.id}'`);
  if (ru.start.wield) need(!!c.items[ru.start.wield]?.weapon, 'rules.start', `weapon '${ru.start.wield}'`);
  for (const r of ru.start.prepared) need(r in c.runes, 'rules.start', `rune '${r}'`);
  // Tiles, surfaces, biomes and world generation.
  out.push(...tileTableProblems());
  for (const [name, code] of Object.entries(Tile)) need(code in c.tiles, `types Tile.${name}`, `tile code ${code}`);
  const tileId = (id: string, where: string): void => need(id in c.tileIds, where, `tile '${id}'`);
  for (const [k, t] of Object.entries(c.tiles)) {
    need(t.floor in c.surfaces, `tile ${k} (${t.name})`, `surface '${t.floor}'`);
    if (t.shape !== 'floor' && t.shape !== 'billboard') need(t.wall in c.surfaces, `tile ${k} (${t.name})`, `wall surface '${t.wall}'`);
  }
  for (const [k, s] of Object.entries(c.matterStates)) {
    if (s.cover && 'surface' in s.cover) need(s.cover.surface in c.surfaces, `matter state ${k}`, `surface '${s.cover.surface}'`);
  }
  let fallback = false;
  for (const [id, b] of Object.entries(c.biomes)) {
    const w = `biome '${id}'`;
    tileId(b.ground, w);
    if (b.trees) for (const t of [b.trees.tile, ...(b.trees.mix ?? []).map((m) => m.tile)]) tileId(t, w);
    for (const p of b.patches ?? []) tileId(p.tile, w);
    for (const s of b.scatter ?? []) tileId(s.tile, w);
    const wh = b.when;
    if (wh.above === undefined && wh.below === undefined && wh.wetter === undefined && wh.drier === undefined) fallback = true;
  }
  if (!fallback) out.push('biomes: none has an empty `when`, so some land may match no biome (the last one is used)');
  for (const [g, def] of Object.entries(c.world.roads.grades)) tileId(def.tile, `world.roads grade '${g}'`);
  // Water: every tile it names exists, and the numbers make sense.
  const wt = c.world.water;
  for (const [g, def] of Object.entries(c.world.roads.grades)) for (const t of def.bridge ? [def.bridge.deck, def.bridge.rail, def.bridge.post] : []) tileId(t, `world.roads grade '${g}' bridge`);
  for (const r of wt.shore) tileId(r.tile, 'world.water shore');
  for (const t of [wt.harbour.pier.deck, wt.harbour.pier.rail, wt.harbour.pier.post, wt.harbour.quay]) tileId(t, 'world.water harbour');
  for (const k of wt.harbour.sites) need(k in c.sites, 'world.water harbour', `site '${k}'`);
  need(wt.rivers.width[0] > 0 && wt.rivers.width[0] <= wt.rivers.width[1], 'world.water rivers', 'width range');
  need(wt.lakes.radius[0] > 0 && wt.lakes.radius[0] <= wt.lakes.radius[1], 'world.water lakes', 'radius range');
  need(wt.span >= 6 && wt.lip > 0 && wt.lip < 0.55, 'world.water', 'span and lip (a bank must be a step a body can climb onto a deck)');
  for (const [k, t] of Object.entries(c.tiles)) {
    if (t.freezesInto !== undefined) tile(t.freezesInto, `tile ${k} (${t.name}) freezesInto`);
    if (t.meltsInto !== undefined) tile(t.meltsInto, `tile ${k} (${t.name}) meltsInto`);
  }
  // World objects: every billboard tile grows from a form.
  out.push(...formProblems(c.forms, c.palettes));
  for (const [k, t] of Object.entries(c.tiles)) if (t.shape === 'billboard') need(t.sprite !== null && t.sprite in c.forms, `tile ${k} (${t.name})`, `form '${t.sprite ?? ''}'`);
  // Every thing with a picture is a creature look, a form (prop), or a loose item.
  for (const [k, t] of Object.entries(c.things)) if (t.sprite !== null && t.sprite !== 'item') need(t.sprite in c.looks || t.sprite in c.forms, `thing '${k}'`, `look or form '${t.sprite}'`);
  // Colours: palettes are sound, and jobs dress people only in colours that exist.
  out.push(...paletteProblems(c.palettes));
  for (const [k, r] of Object.entries(c.roles)) for (const [slot, list] of Object.entries(r.dress?.colors ?? {})) for (const col of list) {
    const why = colourProblem(col, c.palettes);
    if (why) out.push(`role '${k}' dress '${slot}': ${why}`);
  }
  const dressed = Object.values(c.roles).flatMap((r) => [...(r.dress?.features ?? []), ...(r.dress?.without ?? [])]);
  out.push(...lookProblems(c.looks, dressed, c.palettes));
  return out;
}
