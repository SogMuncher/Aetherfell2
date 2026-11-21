import type { DialogueOption, DialogueView, Entity, Location, Quest, RoleDef, SimContext, SimSystem } from '../../types';
import { addItem, countItem, removeItem } from '../../types';
import { dayPart, fillText, pluralName, rainAt, siteBaseName, weaponStats, thingDef } from '../../content';

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

function direction(from: Entity, to: Location): string {
  const a = Math.atan2(to.pos.y - from.pos.y, to.pos.x - from.pos.x);
  const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return COMPASS[i] ?? 'north';
}

function distanceWords(d: number): string {
  if (d < 150) return 'just a short walk';
  if (d < 400) return 'not far';
  if (d < 800) return 'a fair walk';
  return 'a long road';
}

/**
 * Conversation: greetings that depend on the hour and on what the party has done, rumours that
 * point at real undiscovered places, quests, and simple trade. What each villager says, sells and
 * asks of you comes from their role in content/roles.ts; what they say about a place from its site.
 */

function roleOf(ctx: SimContext, npc: Entity): RoleDef | undefined {
  return npc.npc ? ctx.content.roles[npc.npc.role] : undefined;
}
export const socialSystem: SimSystem = (ctx: SimContext) => {
  const { state } = ctx;

  for (const u of state.queues.use) {
    if (u.entity === null) continue;
    const npc = state.entities.get(u.entity);
    const pl = state.entities.get(u.player);
    if (!npc?.npc || npc.dead || !pl?.player) continue;
    const mood = folkMood(ctx, npc);
    if (mood < -0.5) {
      ctx.emit({ type: 'say', speaker: npc.id, text: 'Keep away from me, murderer!' });
      continue;
    }
    pl.player.dialogue = openDialogue(ctx, npc, pl);
    if (npc.ai) {
      npc.ai.mode = 'idle';
      npc.ai.think = 80;
    }
    npc.angle = Math.atan2(pl.pos.y - npc.pos.y, pl.pos.x - npc.pos.x);
  }

  for (const id of Object.values(state.players)) {
    const pl = state.entities.get(id);
    const p = pl?.player;
    if (!pl || !p?.dialogue) continue;
    const npc = state.entities.get(p.dialogue.speaker);
    if (!npc || npc.dead || Math.hypot(npc.pos.x - pl.pos.x, npc.pos.y - pl.pos.y) > 4.5) {
      p.dialogue = null;
      continue;
    }
    if (npc.ai) npc.ai.think = Math.max(npc.ai.think, 10);
    const c = p.input.choice;
    if (c === null) continue;
    const opt = p.dialogue.options[c];
    if (!opt) continue;
    p.dialogue = choose(ctx, npc, pl, opt);
  }
};

const GREETINGS = {
  night: 'You are up late, stranger.',
  morning: 'Morning to you.',
  afternoon: 'Good day.',
  evening: 'Evening, traveller.',
} as const;

/** How this person's people feel about the party (-1..1). */
function folkMood(ctx: SimContext, npc: Entity): number {
  const f = ctx.content.rules.factions;
  return ctx.state.factions[npc.faction]?.[f.player] ?? ctx.state.factions[f.folk]?.[f.player] ?? 0;
}

function greeting(ctx: SimContext, npc: Entity): string {
  const t = ctx.state.weather.time;
  const n = npc.npc;
  const rain = rainAt(ctx.content.sky, ctx.state.weather, npc.pos.x, npc.pos.y) > 0.3;
  const hour = GREETINGS[dayPart(ctx.content.rules.day, t)];
  const flavour = rain ? ' Foul weather for the road.' : '';
  const mood = folkMood(ctx, npc) > 0.3 ? ' Folk speak well of your party.' : '';
  const role = n ? (ctx.content.roles[n.role]?.greeting ?? '') : '';
  return `${hour}${flavour}${role}${mood}`;
}

/** What a quest asks, in a few words for the journal ("Kill 3 wolves", "Bring 2 wolf pelts"). */
function questGoal(ctx: SimContext, q: Quest): { goal: string; plural: string } {
  if (q.kind === 'cull') {
    const plural = pluralName(thingDef(ctx.content, q.targetKind));
    return { goal: `Kill ${q.needed} ${plural}`, plural };
  }
  if (q.kind === 'fetch') {
    const name = (ctx.content.items[q.targetKind]?.name ?? q.targetKind).toLowerCase();
    const plural = q.needed > 1 && !name.endsWith('s') ? `${name}s` : name;
    return { goal: `Bring ${q.needed} ${plural}`, plural };
  }
  return { goal: `Find ${q.what ?? 'the place'}`, plural: q.what ?? 'the place' };
}

/** Is the job done, as far as this traveller can show? (A fetch needs the goods in their own bag.) */
function questReady(q: Quest, pl: Entity | undefined): boolean {
  if (q.state !== 'active') return false;
  if (q.kind === 'fetch') return !!pl?.player && countItem(pl.player.inventory, q.targetKind) >= q.needed;
  return q.progress >= q.needed;
}

function optionsFor(ctx: SimContext, npc: Entity, pl?: Entity): DialogueOption[] {
  const opts: DialogueOption[] = [{ label: 'Heard any rumours?', action: 'rumour' }];
  const q = npc.npc?.questId != null ? ctx.state.quests.find((x) => x.id === npc.npc?.questId) : undefined;
  const role = roleOf(ctx, npc);
  if (q?.state === 'offered') opts.push({ label: role?.quest?.offer ?? 'Any work for me?', action: 'quest' });
  if (q && questReady(q, pl)) opts.push({ label: role?.quest?.turnIn ?? 'It is done.', action: 'turnIn' });
  if (role?.trade) opts.push({ label: role.trade.label, action: 'trade' });
  opts.push({ label: 'Farewell.', action: 'farewell' });
  return opts;
}

function openDialogue(ctx: SimContext, npc: Entity, pl: Entity): DialogueView {
  return { speaker: npc.id, speakerName: npc.npc?.name ?? 'Villager', text: greeting(ctx, npc), options: optionsFor(ctx, npc, pl) };
}

function choose(ctx: SimContext, npc: Entity, pl: Entity, opt: DialogueOption): DialogueView | null {
  const { state } = ctx;
  const p = pl.player;
  if (!p) return null;
  const coin = ctx.content.rules.currency;
  let text = '';
  switch (opt.action) {
    case 'farewell':
      ctx.emit({ type: 'say', speaker: npc.id, text: 'Safe travels.' });
      return null;
    case 'rumour': {
      const unknown = state.locations.filter((l) => !l.discovered).sort((a, b) => Math.hypot(a.pos.x - npc.pos.x, a.pos.y - npc.pos.y) - Math.hypot(b.pos.x - npc.pos.x, b.pos.y - npc.pos.y));
      const l = unknown[ctx.rng.int(Math.min(2, unknown.length))];
      if (!l) {
        text = 'Nothing new. You seem to know these parts better than me.';
      } else {
        const d = Math.hypot(l.pos.x - npc.pos.x, l.pos.y - npc.pos.y);
        const what = fillText(ctx.content.sites[l.kind]?.rumour ?? 'a place called {name}', { name: l.name, base: siteBaseName(ctx.content, l.kind, l.name) });
        const dist = distanceWords(d);
        text = `They say there's ${what} to the ${direction(npc, l)}. ${dist.charAt(0).toUpperCase()}${dist.slice(1)}.`;
        state.journal.push({ tick: state.tick, day: state.weather.day, text: `Rumour from ${npc.npc?.name ?? 'a villager'}: ${what} lies ${direction(npc, l)}.` });
        p.skills.speech.xp += 3;
      }
      break;
    }
    case 'quest': {
      const q = state.quests.find((x) => x.id === npc.npc?.questId);
      if (q && q.state === 'offered') {
        q.state = 'active';
        q.since = state.tick;
        const { goal, plural } = questGoal(ctx, q);
        text = fillText(roleOf(ctx, npc)?.quest?.ask ?? `${goal} and I will pay {reward} silver.`, { count: q.needed, reward: q.reward, plural, what: q.what ?? '' });
        state.journal.push({ tick: state.tick, day: state.weather.day, text: `Quest accepted: ${q.title}. ${goal}.` });
        ctx.emit({ type: 'journal', text: `Quest accepted: ${q.title}.` });
      }
      break;
    }
    case 'turnIn': {
      const q = state.quests.find((x) => x.id === npc.npc?.questId);
      if (q && questReady(q, pl)) {
        if (q.kind === 'fetch' && !removeItem(p.inventory, q.targetKind, q.needed)) break;
        q.progress = q.needed;
        q.state = 'done';
        addItem(p.inventory, coin, q.reward);
        const fv = state.factions[npc.faction];
        if (fv) fv[pl.faction] = Math.min(1, (fv[pl.faction] ?? 0) + 0.3);
        text = roleOf(ctx, npc)?.quest?.thanks ?? 'You have our thanks.';
        state.journal.push({ tick: state.tick, day: state.weather.day, text: `Quest complete: ${q.title}. Earned ${q.reward} silver.` });
        ctx.emit({ type: 'journal', text: `Quest complete: ${q.title}.` });
        p.skills.speech.xp += 10;
      }
      break;
    }
    case 'trade': {
      const trade = roleOf(ctx, npc)?.trade;
      if (!trade || !npc.npc) break;
      const a = pl.actor;
      const w = a ? weaponStats(ctx.content, thingDef(ctx.content, pl.def), a.weapon) : null;
      if (trade.mend && a?.weapon && w && a.wear < w.durability) {
        if (removeItem(p.inventory, coin, trade.mend.price)) {
          a.wear = w.durability;
          text = trade.mend.done;
        } else text = trade.mend.broke;
        break;
      }
      if (trade.sellStock) {
        // Sell the first thing on the rack you can afford.
        const coins = countItem(p.inventory, coin);
        const stock = npc.npc.stock;
        const offer = stock.find((st) => (ctx.content.items[st.id]?.value ?? 999) <= coins);
        if (offer) {
          const it = ctx.content.items[offer.id];
          removeItem(p.inventory, coin, it?.value ?? 0);
          removeItem(stock, offer.id, 1);
          addItem(p.inventory, offer.id, 1);
          text = `The ${it?.name.toLowerCase() ?? 'goods'}? ${it?.value ?? 0} silver. Use it well.`;
        } else text = stock.length ? trade.sellStock.broke : trade.sellStock.empty;
        break;
      }
      const bt = trade.barter;
      if (!bt) break;
      let sold = 0;
      for (const id of bt.buys) {
        const s = p.inventory.find((x) => x.id === id);
        if (!s) continue;
        const value = (ctx.content.items[id]?.value ?? 1) * s.count;
        sold += value;
        removeItem(p.inventory, id, s.count);
      }
      if (sold > 0) addItem(p.inventory, coin, sold);
      const bought = removeItem(p.inventory, coin, ctx.content.items[bt.sells]?.value ?? 0);
      if (bought) addItem(p.inventory, bt.sells, 1);
      text = `${sold > 0 ? fillText(bt.sold, { silver: sold }) : ''}${bought ? bt.bought : bt.broke}`;
      p.skills.speech.xp += 2;
      break;
    }
  }
  ctx.emit({ type: 'say', speaker: npc.id, text });
  return { speaker: npc.id, speakerName: npc.npc?.name ?? 'Villager', text, options: optionsFor(ctx, npc, pl) };
}
