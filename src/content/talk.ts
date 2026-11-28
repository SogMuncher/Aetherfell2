// The words of conversation: topic labels and answer templates for asking townsfolk about places and people.
import type { TalkDef } from '../types';

export const TALK: TalkDef = {
  ask: { where: 'Where is...', places: 'A place in town', people: 'Someone in town', about: 'Tell me about...', self: 'Yourself', rumour: 'News and rumours', back: 'Something else.', farewell: 'Farewell.' },
  prompt: 'What do you want to know?',
  place: ['The {what}? Go {dir}, {dist}.', 'Head {dir}, {dist}. You cannot miss the {what}.', 'The {what} lies {dir} of here, {dist}.'],
  person: ['{name} the {role}? At this hour, {at}. That is {dir}, {dist}.', '{name}? Try {dir}, {dist}. Usually {at} about now.'],
  self: 'Me? Just a {role}. Nothing worth a song.',
  me: 'You are talking to them.',
  dist: [[6, 'just over there'], [20, 'a stone’s throw away'], [60, 'a short walk'], [200, 'a fair walk'], [800, 'a long walk'], [1500, 'half a day’s travel'], [Infinity, 'many days’ travel']],
  at: { home: 'at home', square: 'about the square', edge: 'out past the houses', building: 'at the {what}' },
  refuseBelow: -0.2,
  refuse: ['Find it yourself.', 'I have nothing to say to your sort.', 'Ask someone else.'],
  party: {
    hire: 'Come with us. ({fee} silver)',
    joined: 'For {fee} silver? Lead on, I am with you.',
    broke: 'Come back when you have {fee} silver.',
    gear: 'Let me see your gear.',
    dismiss: 'We part ways here.',
    left: 'As you like. I will find my own way home.',
  },
};
