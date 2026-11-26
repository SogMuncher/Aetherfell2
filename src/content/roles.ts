import type { RoleDef, RoleId } from '../types';

/**
 * Villager jobs: what they add to a greeting, what they keep on the rack, the trouble they ask
 * help with and how they trade. Which roles a village has comes from its site entry.
 */
export const ROLES: Record<RoleId, RoleDef> = {
  elder: {
    greeting: ' I keep watch over this village.',
    stock: [],
    dress: { features: ['robe', 'beard'], without: ['hat'], colors: { hair: ['#d8d0c0', '#a8a4a0'], tunic: ['#5a4a6e', '#3e4a5e'] } },
    quest: {
      kind: 'cull',
      target: 'wolf',
      count: 3,
      reward: 40,
      title: 'Wolves trouble {place}',
      offer: 'You look troubled.',
      ask: "Wolves have been taking our goats at night. Kill {count} of them and I'll pay {reward} silver.",
      turnIn: 'The wolves are dealt with.',
      thanks: 'You have our thanks. Here, as promised.',
    },
  },
  smith: {
    greeting: ' Mind the forge.',
    dress: { features: ['apron'], without: ['robe'], colors: { apron: ['#4a3a2a', '#3a3230'], tunic: ['#5a5048', '#46403a'], sleeve: ['#c89070', '#a87050'] } },
    quest: {
      kind: 'fetch',
      item: 'wolfPelt',
      count: 2,
      reward: 30,
      title: 'Leather for the bellows of {place}',
      offer: 'Your bellows look tired.',
      ask: 'My bellows are cracked through. Bring me {count} {plural} to patch them and I will pay {reward} silver.',
      turnIn: 'Here are your pelts.',
      thanks: 'Good thick hide. The forge will roar again.',
    },
    stock: [
      { id: 'gear:sword:iron:fine', count: 1 },
      { id: 'gear:axe:iron:common', count: 1 },
      { id: 'gear:spear:bronze:common', count: 1 },
      { id: 'burlapGlider', count: 1 },
      { id: 'glider', count: 1 },
      { id: 'silkGlider', count: 1 },
    ],
    trade: {
      label: 'Sharpen my blade (5c)',
      mend: { price: 5, done: 'There. Edge like new.', broke: 'Five silver, friend. No coin, no edge.' },
      sellStock: { empty: 'Rack is bare, I am afraid.', broke: 'Come back with more silver and we will talk.' },
    },
  },
  trader: {
    greeting: ' Looking to buy?',
    quest: {
      kind: 'explore',
      site: 'stones',
      what: 'a ring of standing stones',
      reward: 20,
      title: 'The stones the old songs speak of',
      offer: 'Heard any old songs?',
      ask: 'The old songs speak of standing stones out in the wilds. Find {what} and tell me of it, and {reward} silver is yours.',
      turnIn: 'I found the stones.',
      thanks: 'So the songs were true! Here, as promised.',
    },
    dress: { features: ['hat'], colors: { tunic: ['#8c2e3e', '#2e6e6e', '#8c6e2e'], hat: ['#4a2e5a', '#2e3e6e'] } },
    stock: [
      { id: 'healingDraught', count: 4 },
      { id: 'oilFlask', count: 5 },
      { id: 'bread', count: 6 },
      { id: 'antidote', count: 2 },
      { id: 'frostFlask', count: 1 },
    ],
    trade: {
      label: 'Trade: buy a draught (12c), sell pelts',
      barter: {
        buys: ['wolfPelt', 'venison'],
        sells: 'healingDraught',
        sold: "I'll give you {silver} silver for those. ",
        bought: 'And one draught for you.',
        broke: 'You cannot afford a draught.',
      },
    },
  },
  farmer: { greeting: '', stock: [], dress: { colors: { tunic: ['#6e7a3c', '#7a6040', '#8c7850'], hat: ['#c8a85a'] } } },
  brewer: {
    greeting: ' Cold out there? Have a cup.',
    dress: { features: ['apron'], colors: { apron: ['#d8ccb0'] } },
    stock: [
      { id: 'spicedCider', count: 6 },
      { id: 'antidote', count: 2 },
    ],
    quest: {
      kind: 'cull',
      target: 'bogToad',
      count: 4,
      reward: 25,
      title: 'Toads in the cider barrels of {place}',
      offer: 'Something wrong with the cider?',
      ask: 'Toads from the fen keep getting into my barrels. Thin out {count} of them and {reward} silver is yours.',
      turnIn: 'Your toad trouble is over.',
      thanks: 'Ha! Drinks are on me. And the silver, of course.',
    },
    trade: {
      label: 'Buy a spiced cider (4c)',
      sellStock: { empty: 'Barrels are dry, come back tomorrow.', broke: 'Four silver a cup, friend.' },
    },
  },
};

export const VILLAGER_NAMES: readonly string[] = ['Aldric', 'Brenna', 'Cedric', 'Dagny', 'Edda', 'Fenwick', 'Gwen', 'Hobb', 'Isolde', 'Jory', 'Kestrel', 'Linnet', 'Marrow', 'Nell', 'Osric', 'Piety', 'Rook', 'Sabine', 'Tamsin', 'Wendel'];
