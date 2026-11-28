// Hiring townsfolk into the party for a fee, seeing to their gear, and letting them go again.
import type { DialogueOption, Entity, SimContext } from '../../types';
import { bagOf, removeItem } from '../../types';
import { fillText, isFollower } from '../../content';

/**
 * Joining the party is only a change of side: a hired hand takes the travellers' faction, and their brain's
 * `follow` behaviour does the rest (goes with them, fights what threatens them). Their bag and body are
 * the same as any creature's, so a traveller can open them like a store and dress them on the paperdoll.
 */
export function partyOptions(ctx: SimContext, npc: Entity, mood: number): DialogueOption[] {
  const words = ctx.content.talk.party;
  if (isFollower(ctx.content, npc)) return [{ label: words.gear, action: 'gear' }, { label: words.dismiss, action: 'dismiss' }];
  if (mood < ctx.content.talk.refuseBelow || !npc.ai) return [];
  return [{ label: fillText(words.hire, { fee: ctx.content.rules.hireFee }), action: 'hire' }];
}

/** Does what a party option asks. Returns what the person says, or null when talk should end (their gear is opened). */
export function partyChoice(ctx: SimContext, npc: Entity, pl: Entity, action: 'hire' | 'dismiss' | 'gear'): string | null {
  const { content, state } = ctx;
  const words = content.talk.party;
  const fee = content.rules.hireFee;
  const name = npc.npc?.name ?? 'A stranger';
  if (action === 'gear') {
    if (!isFollower(content, npc)) return '';
    ctx.emit({ type: 'storeOpened', player: pl.id, entity: npc.id });
    return null;
  }
  if (action === 'dismiss') {
    if (!isFollower(content, npc)) return '';
    npc.faction = content.rules.factions.folk;
    state.journal.push({ tick: state.tick, day: state.weather.day, text: `${name} left the party.` });
    return words.left;
  }
  if (isFollower(content, npc)) return '';
  if (!removeItem(bagOf(pl), content.rules.currency, fee)) return fillText(words.broke, { fee });
  npc.faction = pl.faction;
  if (npc.ai) {
    npc.ai.mode = 'idle';
    npc.ai.think = 0;
    delete npc.ai.path;
    delete npc.ai.aim;
  }
  state.journal.push({ tick: state.tick, day: state.weather.day, text: `${name} joined the party for ${fee} silver.` });
  ctx.emit({ type: 'journal', text: `${name} joined the party.` });
  return fillText(words.joined, { fee });
}
