// Headless checks for gear: generated pieces, the paperdoll requests, protection and wear, weapons, breaking, G throw.
// (Creatures found with gear: outfitSmoke.ts.) Prints PASS/FAIL per check.
import type { Simulation } from '../src/sim';
import { CONTENT, gearItem, handlingOf, itemDef, parseGear, rollGear, thrownDamage, validateContent, weaponStats } from '../src/content';
import { ITEM_FORMS } from '../src/render/entities/itemArt';
import type { MatterAccess } from '../src/types';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { GROUND_Z, HAND_SLOT, SWING_DIRS, Tile, addItem, countItem, emptyInput, shapeByte } from '../src/types';
import type { SimEvent } from '../src/types';
import { check, failures, hit, makeRng, nextSeq, run, spawner, world } from './smokeKit';

// The tables are sound and every id means what it says.
{
  check('content is valid with the armour tables', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));
  const helm = gearItem(CONTENT.gear, 'gear:helm:iron:fine');
  check('an id becomes a named item', helm?.name === 'Fine iron helm' && helm.armour?.region === 'head' && helm.category === 'armour', helm?.name);
  const plain = gearItem(CONTENT.gear, 'gear:cap:linen:common');
  check('ordinary work has no grade in its name', plain?.name === 'Linen cap', plain?.name);
  const crude = gearItem(CONTENT.gear, 'gear:helm:iron:crude');
  const master = gearItem(CONTENT.gear, 'gear:helm:iron:masterwork');
  check('quality changes protection, durability and value', !!crude?.armour && !!master?.armour && master.armour.armor > (helm?.armour?.armor ?? 0) && (helm?.armour?.armor ?? 0) > crude.armour.armor && (master.durability ?? 0) > (crude.durability ?? 0) && master.value > crude.value);
  const steel = gearItem(CONTENT.gear, 'gear:cuirass:steel:common');
  const linen = gearItem(CONTENT.gear, 'gear:tunic:linen:common');
  check('material changes protection and weight', !!steel?.armour && !!linen?.armour && steel.armour.armor > linen.armour.armor * 3 && steel.weight > linen.weight * 3);
  check('wear travels in the id, for gear and any other item alike', itemDef(CONTENT, 'gear:helm:iron:fine@7')?.wear === 7 && itemDef(CONTENT, 'torch@5')?.wear === 5 && itemDef(CONTENT, 'torch')?.wear === itemDef(CONTENT, 'torch')?.durability);
  check('every item has durability', Object.keys(CONTENT.items).every((id) => (itemDef(CONTENT, id)?.durability ?? 0) >= 1));
  check('nonsense ids are refused', gearItem(CONTENT.gear, 'gear:helm:mithril:fine') === null && gearItem(CONTENT.gear, 'gear:spoon:iron:fine') === null && itemDef(CONTENT, 'gear:') === undefined);
  const rng = makeRng(99);
  const rolled = Array.from({ length: 80 }, () => rollGear(CONTENT.gear, rng, {}));
  check('random gear always names real things', rolled.every((id) => id !== null && itemDef(CONTENT, id) !== undefined));
  const kinds = new Set(rolled.map((id) => (id ? CONTENT.gear.forms[parseGear(CONTENT.gear, id)?.form ?? '']?.slot : '')));
  check('random gear covers every body part and the hands', kinds.size === Object.keys(CONTENT.gear.regions).length + 1, [...kinds].join(','));
  const onlyLeather = Array.from({ length: 20 }, () => rollGear(CONTENT.gear, rng, { region: 'torso', materials: ['leather'], qualities: ['fine'] }));
  check('a roll can be steered', onlyLeather.every((id) => id !== null && gearItem(CONTENT.gear, id)?.name.startsWith('Fine leather')));
}

// A traveller begins in plain clothes, and putting armour on and off goes through the one rule.
{
  const { sim, me } = world();
  check('travellers begin dressed', !!me.worn?.torso && !!me.worn?.legs && !me.worn?.head);
  const inv = me.actor?.inventory ?? [];
  addItem(inv, 'gear:helm:steel:common', 1);
  addItem(inv, 'gear:helm:iron:fine', 1);
  run(sim, 2, { wear: { do: 'wear', item: 'gear:helm:steel:common' } });
  check('wearing from the bag moves the piece onto the body', me.worn?.head === 'gear:helm:steel:common' && countItem(inv, 'gear:helm:steel:common') === 0);
  run(sim, 2, { useItem: 'gear:helm:iron:fine' });
  check('double-clicking (using) armour wears it and the old piece goes back in the bag', me.worn?.head === 'gear:helm:iron:fine' && countItem(inv, 'gear:helm:steel:common') === 1);
  run(sim, 2, { wear: { do: 'remove', region: 'head' } });
  check('taking off returns it to the bag', !me.worn?.head && countItem(inv, 'gear:helm:iron:fine') === 1);
  // Armour lying in the world can be put on straight from the ground.
  const item = sim.state.nextEntityId;
  spawner(sim).spawn('looseItem', me.pos.x + 1, me.pos.y, { z: me.z + 0.2, prevZ: me.z + 0.2, item: { id: 'gear:cuirass:iron:common', count: 1 } });
  run(sim, 2, { wear: { do: 'wearFrom', entity: item } });
  check('armour on the ground can be put on', me.worn?.torso === 'gear:cuirass:iron:common' && countItem(inv, 'gear:tunic:wool:common') === 1, JSON.stringify(me.worn));
  const far = sim.state.nextEntityId;
  spawner(sim).spawn('looseItem', me.pos.x + 30, me.pos.y, { z: me.z, prevZ: me.z, item: { id: 'gear:cap:linen:common', count: 1 } });
  run(sim, 2, { wear: { do: 'wearFrom', entity: far } });
  check('armour out of reach is not put on', !me.worn?.head);
  addItem(inv, 'bread', 1);
  const loaves = countItem(inv, 'bread');
  run(sim, 2, { wear: { do: 'wear', item: 'bread' } });
  check('only armour can be worn', countItem(inv, 'bread') === loaves && !Object.values(me.worn ?? {}).includes('bread'));
  // The hands are a slot too: anything can be held there, and taken back.
  run(sim, 2, { wear: { do: 'wear', item: 'bread', slot: HAND_SLOT } });
  check('anything can be taken in hand', me.actor?.weapon === 'bread' && countItem(inv, 'bread') === loaves - 1 && countItem(inv, 'gear:sword:iron:common') === 1);
  check('anything in hand is swung as it is', weaponStats(CONTENT, CONTENT.things['player'] ?? ({} as never), 'bread')?.kind === 'blunt');
  run(sim, 2, { wear: { do: 'remove', region: HAND_SLOT } });
  check('the hands can be emptied into the bag', me.actor?.weapon === null && countItem(inv, 'bread') === loaves);
}

// Protection: armour turns blows, wears with each one and breaks at last; fire goes through cloth.
{
  const { sim, me } = world();
  me.worn = { torso: 'gear:cuirass:steel:common' };
  me.invuln = 0;
  const base = CONTENT.things['player']?.health?.armor ?? 0;
  const armor = gearItem(CONTENT.gear, 'gear:cuirass:steel:common')?.armour?.armor ?? 0;
  // Only the torso is covered, so test with a fixed region by clearing the others: every blow that lands on the torso is turned.
  const naked = world();
  naked.me.worn = {};
  let hurtBare = 0;
  let hurtArmoured = 0;
  const rng = makeRng(5);
  for (let i = 0; i < 40; i++) {
    naked.me.hp = naked.me.maxHp;
    me.hp = me.maxHp;
    naked.me.invuln = 0;
    me.invuln = 0;
    me.worn = { head: 'gear:helm:steel:common', torso: 'gear:cuirass:steel:common', arms: 'gear:bracers:steel:common', legs: 'gear:greaves:steel:common' };
    hit(naked.sim, naked.me, 14);
    hit(sim, me, 14);
    run(naked.sim, 1);
    run(sim, 1);
    hurtBare += naked.me.maxHp - naked.me.hp;
    hurtArmoured += me.maxHp - me.hp;
    rng.next();
  }
  check('armour reduces the harm taken', hurtArmoured < hurtBare * 0.8, `${hurtBare} bare vs ${hurtArmoured} armoured (base ${base}, cuirass ${armor})`);

  // Wear and breaking.
  const w = world();
  w.me.worn = { torso: 'gear:tunic:linen:crude@3' };
  w.me.hp = w.me.maxHp;
  const events: string[] = [];
  for (let i = 0; i < 12 && w.me.worn?.torso; i++) {
    w.me.invuln = 0;
    hit(w.sim, w.me, 5);
    run(w.sim, 1);
    const left = w.me.worn?.torso;
    if (left) events.push(left);
  }
  // Each blow lands on a random part of the body, so the first one may miss the tunic; it wears within a few.
  check('blows wear the piece', events.some((e) => e === 'gear:tunic:linen:crude@2' || e === 'gear:tunic:linen:crude@1'), events.join(' '));
  check('a worn-out piece breaks and falls away', !w.me.worn?.torso);

  // Heat comes through cloth faster than through iron.
  const f = world();
  f.me.worn = { head: 'gear:cap:linen:common', torso: 'gear:tunic:linen:common', arms: 'gear:wraps:linen:common', legs: 'gear:leggings:linen:common' };
  const g = world();
  g.me.worn = { head: 'gear:helm:iron:common', torso: 'gear:cuirass:iron:common', arms: 'gear:bracers:iron:common', legs: 'gear:greaves:iron:common' };
  f.me.invuln = g.me.invuln = 0;
  f.me.hp = g.me.hp = f.me.maxHp;
  hit(f.sim, f.me, 20, 'fire');
  hit(g.sim, g.me, 20, 'fire');
  run(f.sim, 1);
  run(g.sim, 1);
  check('material changes how fire is taken', f.me.maxHp - f.me.hp > g.me.maxHp - g.me.hp, `${f.me.maxHp - f.me.hp} in linen vs ${g.me.maxHp - g.me.hp} in iron`);
}

// Weapons are gear too: material, quality and enchantment change them the same way.
{
  const plain = itemDef(CONTENT, 'gear:sword:iron:common');
  const steel = itemDef(CONTENT, 'gear:sword:steel:fine');
  const ember = itemDef(CONTENT, 'gear:axe:iron:common:embers');
  check('a weapon id becomes a named weapon', plain?.name === 'Iron sword' && plain.category === 'weapon' && !!plain.weapon && !plain.armour, plain?.name);
  check('material and quality make a weapon hit harder and last longer', (steel?.weapon?.damage ?? 0) > (plain?.weapon?.damage ?? 0) && (steel?.durability ?? 0) > (plain?.durability ?? 0));
  check('an enchantment is a data entry: words and effects on every blow', ember?.name === 'Iron axe of embers' && !!ember.weapon?.effects?.some((e) => e.type === 'heat'));
  check('an enchanted garment turns its kind of harm', (itemDef(CONTENT, 'gear:tunic:wool:common:rime')?.armour?.resist.cold ?? 1) < (itemDef(CONTENT, 'gear:tunic:wool:common')?.armour?.resist.cold ?? 1));
  check('unknown enchantments are refused', itemDef(CONTENT, 'gear:sword:iron:common:nonsense') === undefined);
  const parts = Object.values(CONTENT.gear.forms).flatMap((f) => f.parts);
  check('every gear picture is made of known parts', parts.every((p) => ITEM_FORMS.includes(p)), parts.filter((p) => !ITEM_FORMS.includes(p)).join(','));
}

// Anything in the hands wears with each blow and breaks with its own reaction: a flask of oil
// swung at a wall splashes oil there, on the ground and on a cell of the 3D layer alike.
{
  const { sim, me } = world();
  const x = 18000;
  const y = 18000;
  const swingAt = (): boolean => {
    for (let i = 0; i < 80 && me.actor?.weapon; i++) {
      run(sim, 1, { attack: i % 20 < 2, swingDir: 'thrust' });
      if (me.player) me.player.stamina = 100;
    }
    return me.actor?.weapon === null;
  };
  sim.tiles.setKind(x + 2, y, Tile.StoneWall as 0);
  if (me.actor) me.actor.weapon = 'oilFlask';
  me.angle = 0;
  const broke = swingAt();
  const matter = (s2: Simulation): MatterAccess => (s2 as unknown as { ctx: { matter: MatterAccess } }).ctx.matter;
  let oiled = 0;
  for (let j = -2; j <= 2; j++) for (let i = 0; i <= 3; i++) oiled += matter(sim).get('oil', x + i, y + j, GROUND_Z);
  check('a flask swung at a wall breaks in the hand', broke);
  check('its oil splashes the ground where it broke', oiled > 0, `oil ${oiled}`);
  // A wall in the 3D layer: the same rule.
  const b = world();
  const vx = 18000;
  const vy = 18000;
  b.sim.tiles.setKind(vx + 2, vy, Tile.Flagstone as 0);
  const z0 = Math.floor(b.me.z);
  for (let k = 0; k <= 3; k++) b.sim.state.volume.set(vx + 2, vy, z0 + k, shapeByte(shapeId('cube'), 0), tileCode('stoneWall'));
  if (b.me.actor) b.me.actor.weapon = 'oilFlask';
  b.me.angle = 0;
  for (let i = 0; i < 80 && b.me.actor?.weapon; i++) run(b.sim, 1, { attack: i % 20 < 2, swingDir: 'thrust' });
  let cellOil = 0;
  for (let k = 0; k <= 3; k++) cellOil += matter(b.sim).get('oil', vx + 2, vy, z0 + k);
  check('a flask swung at a 3D wall breaks and oils it', b.me.actor?.weapon === null && cellOil > 0, `held ${b.me.actor?.weapon} oil ${cellOil}`);
  // A sword wears blow by blow, and the mark travels in its id.
  const c = world();
  c.sim.tiles.setKind(x + 2, y, Tile.StoneWall as 0);
  if (c.me.actor) c.me.actor.weapon = 'gear:sword:iron:common';
  c.me.angle = 0;
  for (let i = 0; i < 40; i++) run(c.sim, 1, { attack: i % 20 < 2, swingDir: 'thrust' });
  check('a weapon wears with blows (its id carries how worn)', !!c.me.actor?.weapon?.startsWith('gear:sword:iron:common@'), c.me.actor?.weapon ?? 'none');
}

// Handling: every weapon favours some angles (never above full damage), heavy and blunt ones land
// with more hitstop, and some are better thrown. The same on the ground and on a 3D cell.
{
  const hd = (id: string) => {
    const d = itemDef(CONTENT, id);
    return d?.weapon ? handlingOf(CONTENT, d.weapon, d.weight) : null;
  };
  const forms = Object.keys(CONTENT.gear.forms).filter((f) => CONTENT.gear.forms[f]?.weapon);
  const all = forms.map((f) => hd(`gear:${f}:${CONTENT.gear.forms[f]?.families.includes('wood') ? 'oak' : 'iron'}:common`));
  check('no angle ever hits harder than full', all.every((h) => !!h && SWING_DIRS.every((d) => h.angles[d].damage <= 1)));
  const axe = hd('gear:axe:iron:common');
  check('the back of an axe is blunt and weaker than its edge', axe?.angles.right.kind === 'blunt' && axe.angles.right.damage < axe.angles.left.damage);
  const spear = hd('gear:spear:iron:common');
  check('a spear swung sideways is weaker and slower than its thrust', !!spear && spear.angles.left.damage < spear.angles.thrust.damage && spear.angles.left.windup > spear.angles.thrust.windup);
  check('a spear is better thrown than a sword', thrownDamage(CONTENT, 'gear:spear:iron:common') > thrownDamage(CONTENT, 'gear:sword:iron:common'));
  // A real blow: the hammer's hitstop holds longer than the sword's.
  const blow = (weapon: string, onCell: boolean): number => {
    const { sim, me } = world();
    const x = Math.floor(me.pos.x);
    const y = Math.floor(me.pos.y);
    let z = me.z;
    if (onCell) {
      const z0 = Math.floor(me.z) + 1;
      for (let i = -1; i <= 3; i++) for (let j = -1; j <= 1; j++) sim.state.volume.set(x + i, y + j, z0, shapeByte(shapeId('cube'), 0), tileCode('stoneWall'));
      z = me.z = me.prevZ = z0 + 1;
    }
    const foe = spawner(sim).spawn('raider', me.pos.x + 1.3, me.pos.y, { z, prevZ: z });
    if (me.actor) me.actor.weapon = weapon;
    me.angle = 0;
    let hold = 0;
    for (let i = 0; i < 30 && hold === 0; i++) {
      sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(nextSeq(), 0), attack: i < 2, swingDir: 'left' } });
      for (const ev of sim.step() as SimEvent[]) if (ev.type === 'hit' && ev.target === foe.id && !ev.blocked) hold = ev.hold ?? 0;
      // Keep the foe standing still in reach, not fighting back.
      foe.pos.x = foe.prev.x = me.pos.x + 1.3;
      foe.pos.y = foe.prev.y = me.pos.y;
      if (foe.actor) Object.assign(foe.actor, { guard: null, swing: null, charge: null, wantSwing: null });
    }
    return hold;
  };
  for (const onCell of [false, true]) {
    const sword = blow('gear:sword:iron:common', onCell);
    const hammer = blow('gear:hammer:iron:common', onCell);
    check(`a hammer blow holds longer than a sword's${onCell ? ' (3D cell)' : ''}`, hammer > sword && sword > 0, `${hammer} vs ${sword} ticks`);
  }
}

// G: what is in the hands is thrown where you look, or set at your feet when you look down.
{
  const toss = (pitch: number): number => {
    const { sim, me } = world();
    if (me.actor) me.actor.weapon = 'torch';
    me.angle = 0;
    const id = sim.state.nextEntityId;
    run(sim, 1, { throwHeld: true, pitch, yaw: 0 });
    run(sim, 60);
    const it = sim.state.entities.get(id);
    return me.actor?.weapon === null && it?.item ? Math.hypot(it.pos.x - me.pos.x, it.pos.y - me.pos.y) : -1;
  };
  const far = toss(0.1);
  const feet = toss(-0.9);
  check('G throws what is in the hands', far > 4, `${far.toFixed(1)} m`);
  check('G while looking down sets it at your feet', feet >= 0 && feet < 1.5, `${feet.toFixed(2)} m`);
  // A thrown flask breaks where it lands, by the same rule as one broken in the hand.
  const { sim, me } = world();
  for (let j = -3; j <= 3; j++) sim.tiles.setKind(18004, 18000 + j, Tile.StoneWall as 0);
  if (me.actor) me.actor.weapon = 'frostFlask';
  me.angle = 0;
  const id = sim.state.nextEntityId;
  run(sim, 1, { throwHeld: true, pitch: 0.1, yaw: 0 });
  let broke = false;
  for (let i = 0; i < 80 && !broke; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(nextSeq(), 0) });
    broke = sim.step().some((e) => e.type === 'itemBroke' && e.item === 'frostFlask');
  }
  const left = sim.state.entities.get(id);
  check('a thrown flask breaks where it strikes', broke && !left, `left: ${left?.item?.id} z ${left?.z.toFixed(2)} by ${left?.thrownBy}`);
}

if (failures()) throw new Error(`${failures()} gear check(s) failed`);
console.log('all armour checks passed');
