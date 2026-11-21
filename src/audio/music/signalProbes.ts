import { CONTENT, rainAt, sunHeight } from '../../content';
import { type SignalName, type SignalProbe, isSignal } from './signals';
import { TILES } from '../../content/tiles';
import { unpackKey, unpackSpot } from '../../types';


/** How fast each signal follows its target, in seconds (rise, fall). Danger arrives fast and leaves slowly. */
export const SMOOTH: Partial<Record<SignalName, [number, number]>> = {
  danger: [0.4, 7],
  combat: [0.15, 9],
  threat: [1.5, 6],
  hurt: [0.3, 4],
  downed: [0.2, 3],
  wonder: [0.3, 3],
  triumph: [0.3, 3],
  speed: [1.2, 2.5],
  soaring: [1.5, 3],
  depth: [1.5, 3],
  ruin: [2, 4],
};
export const DEFAULT_SMOOTH: [number, number] = [4, 5];

/** Impulses decay towards zero with this half-life in seconds. */
export const IMPULSE_DECAY: Partial<Record<SignalName, number>> = { combat: 5, wonder: 18, triumph: 10, danger: 4 };

export const clamp01 = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0);

export function clampNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0;
}

// ---------------------------------------------------------------------------------------------
// Probes. Each is independent; add a new one to PROBES to teach music about a new system.
// ---------------------------------------------------------------------------------------------

export const skyProbe: SignalProbe = ({ state, me }, o) => {
  const w = state.weather;
  const t = w.time;
  // Night is full between ~21:00 and ~04:00, ramping through the twilight.
  const sun = sunHeight(CONTENT.rules.day, t);
  o.night = clamp01(0.5 - sun * 2.2);
  o.dusk = clamp01(1 - Math.abs(sun) * 5) * (1 - w.cloud * 0.5);
  o.aurora = clampNum(w.aurora) * o.night;
  const rain = rainAt(CONTENT.sky, w, me.pos.x, me.pos.y);
  o.rain = clampNum(rain);
  const wind = Math.hypot(w.wind.x, w.wind.y);
  o.wind = clamp01(wind / 12);
  o.storm = clamp01(rain * 0.7 + o.wind * 0.5 - 0.25 + w.cloud * 0.2);
};

export const RAYS = 16;
export const surroundingsProbe: SignalProbe = ({ state, tiles, me }, o) => {
  let trees = 0;
  let water = 0;
  let snow = 0;
  let sand = 0;
  let built = 0;
  let samples = 0;
  for (let a = 0; a < 12; a++) {
    const ang = a * ((Math.PI * 2) / 12);
    for (const r of [3, 8, 16, 28]) {
      const x = me.pos.x + Math.cos(ang) * r;
      const y = me.pos.y + Math.sin(ang) * r;
      const info = TILES[tiles.kind(x, y)];
      samples++;
      if (!info) continue;
      trees += info.leafy ?? 0;
      if (info.liquid || info.floor === 'ice' || tiles.ground(x, y) < 0) water++;
      if (info.floor === 'snow' || info.floor === 'ice') snow++;
      if (info.floor === 'sand') sand++;
      if (info.floor === 'flagstone' || info.floor === 'ruin' || info.wall === 'ruin') built++;
    }
  }
  o.forest = clamp01((trees / samples) * 3.2);
  o.water = clamp01((water / samples) * 2.5);
  o.snow = clamp01((snow / samples) * 1.6);
  o.sand = clamp01((sand / samples) * 2);

  // Enclosure: how many directions are walled in within a few metres. Works for ruins today and
  // any roofed interior or dungeon tomorrow.
  let walled = 0;
  for (let i = 0; i < RAYS; i++) {
    const ang = (i / RAYS) * Math.PI * 2;
    for (let r = 1; r <= 7; r += 1.5) {
      const x = me.pos.x + Math.cos(ang) * r;
      const y = me.pos.y + Math.sin(ang) * r;
      const info = TILES[tiles.kind(x, y)];
      if (info && info.shape === 'block' && info.height >= 2.5) {
        walled++;
        break;
      }
    }
  }
  const enclosure = walled / RAYS;

  // Altitude above the land around you, and how open the view is.
  const ground = tiles.ground(me.pos.x, me.pos.y);
  o.altitude = clamp01(Math.max(me.z, ground) / 170);
  const aboveGround = Math.max(0, me.z - ground);
  o.soaring = clamp01(aboveGround / 25);
  let lower = 0;
  for (let a = 0; a < 8; a++) {
    const ang = a * (Math.PI / 4);
    const g = tiles.ground(me.pos.x + Math.cos(ang) * 40, me.pos.y + Math.sin(ang) * 40);
    if (g < me.z - 6) lower++;
  }
  o.vista = clamp01((lower / 8) * (0.35 + o.altitude * 1.6 + o.soaring * 0.6) * (1 - o.forest * 0.6));

  // Fire warmth.
  let fire = 0;
  for (const k of state.burning) {
    const p = unpackKey(k);
    const d = Math.hypot(p.x - me.pos.x, p.y - me.pos.y);
    if (d < 20) fire += 1 / (1 + d * 0.5);
  }
  for (const k of state.volume.burningCells) {
    const p = unpackSpot(k);
    const d = Math.hypot(p.x - me.pos.x, p.y - me.pos.y);
    if (d < 20) fire += 1 / (1 + d * 0.5);
  }
  o.warmth = clamp01(fire * 0.35);

  o.depth = clamp01(o.depth + enclosure * 0.9 + (built / samples) * 0.6);
};

export const placesProbe: SignalProbe = ({ state, me }, o) => {
  // A whole realm can have a mood too (content/realms.ts): the underworld is deep, murky and old.
  const realm = CONTENT.realms[state.realm];
  if (realm?.mood) for (const [name, w] of Object.entries(realm.mood)) if (isSignal(name)) o[name] = Math.max(o[name], w);
  if (realm && !realm.sky) o.depth = 1;
  for (const loc of state.locations) {
    const d = Math.hypot(loc.pos.x - me.pos.x, loc.pos.y - me.pos.y);
    const near = clamp01(1 - (d - loc.radius) / 40);
    if (near <= 0) continue;
    // Sites are data, and each says how it feels (content/sites.ts `mood`): villages are lived-in,
    // ruins old and dark. A new kind of place gets its music by naming signals there.
    const mood = CONTENT.sites[loc.kind]?.mood;
    if (!mood) continue;
    for (const [name, w] of Object.entries(mood)) {
      if (isSignal(name)) o[name] = Math.max(o[name], near * w);
    }
  }
};

export const creaturesProbe: SignalProbe = ({ state, me }, o) => {
  const mine = state.factions[me.faction] ?? {};
  let danger = 0;
  let threat = 0;
  let friends = 0;
  let people = 0;
  for (const e of state.entities.values()) {
    if (e.id === me.id || e.dead) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y);
    if (d > 70) continue;
    if (e.player) {
      if (d < 40) friends++;
      continue;
    }
    if (!e.actor) continue;
    const theirs = state.factions[e.faction]?.[me.faction] ?? mine[e.faction] ?? 0;
    if (theirs < -0.25) {
      const aware = e.ai !== undefined && (e.ai.target === me.id || e.ai.mode === 'chase' || e.ai.mode === 'attack');
      const w = 1 / (1 + d / 12);
      if (aware && d < 40) danger += w * 1.4;
      else threat += w;
    } else if (e.npc && d < 30) people++;
  }
  o.danger = clamp01(danger * 0.8);
  o.threat = clamp01(threat * 0.7);
  o.company = clamp01(friends / 3);
  o.settlement = Math.max(o.settlement, clamp01(people / 3));
};

export const playerProbe: SignalProbe = ({ me }, o) => {
  o.hurt = me.maxHp > 0 ? clamp01(1 - me.hp / me.maxHp) : 0;
  const p = me.player;
  if (p) {
    o.downed = p.downed > 0 ? 1 : 0;
    if (p.gliding) o.soaring = Math.max(o.soaring, 0.7);
  }
  o.speed = clamp01(Math.hypot(me.vel.x, me.vel.y) / 7);
};

/** Mood that grows out of other moods — read after the probes. */
export const feelingsProbe: SignalProbe = (_v, o) => {
  const lonelyNight = o.night * (1 - o.company * 0.6) * (1 - o.warmth);
  o.dread = clamp01(o.ruin * 0.55 + o.depth * 0.6 + lonelyNight * o.threat * 0.8 + o.storm * o.night * 0.25);
};

export const PROBES: readonly { name: string; probe: SignalProbe }[] = [
  { name: 'sky', probe: skyProbe },
  { name: 'surroundings', probe: surroundingsProbe },
  { name: 'places', probe: placesProbe },
  { name: 'creatures', probe: creaturesProbe },
  { name: 'player', probe: playerProbe },
  { name: 'feelings', probe: feelingsProbe },
];
