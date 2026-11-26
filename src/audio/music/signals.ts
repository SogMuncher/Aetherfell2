import { DEFAULT_SMOOTH, IMPULSE_DECAY, PROBES, SMOOTH, clamp01, clampNum } from './signalProbes';
import type { Entity, ReadonlyTiles, SimEvent, SimState } from '../../types';


export interface MoodSignals {
  /** Hostile creatures that have noticed you, close by. */
  danger: number;
  /** Fighting right now: blows, spells and cries around you. */
  combat: number;
  /** Hostile creatures around that have not noticed you yet. */
  threat: number;
  /** Underground or enclosed (inside ruins, between walls, future dungeons). */
  depth: number;
  /** Creepiness: ruins, darkness, being alone at night with hunters about. */
  dread: number;
  /** 0 full day … 1 deep night. */
  night: number;
  /** Golden hours around sunrise and sunset. */
  dusk: number;
  aurora: number;
  rain: number;
  /** Rain plus wind plus thunder. */
  storm: number;
  wind: number;
  /** 0 sea level … 1 mountain top. */
  altitude: number;
  /** High up with an open view. */
  vista: number;
  forest: number;
  water: number;
  snow: number;
  sand: number;
  /** Near a village or people. */
  settlement: number;
  /** Inside an old ruin. */
  ruin: number;
  /** Near a fen or marsh: damp, murky, croaking. */
  murk: number;
  /** Near a fire or campfire. */
  warmth: number;
  /** Swells after a discovery or a learned rune, then fades. */
  wonder: number;
  /** Swells after winning a fight. */
  triumph: number;
  /** 0 healthy … 1 nearly dead. */
  hurt: number;
  downed: number;
  /** How fast you are moving. */
  speed: number;
  /** Gliding or falling high above the ground. */
  soaring: number;
  /** Aboard a craft (the airship). */
  voyage: number;
  /** Friends close by, 0 alone … 1 the whole party. */
  company: number;
}

export type SignalName = keyof MoodSignals;

export const SIGNAL_NAMES: readonly SignalName[] = [
  'danger', 'combat', 'threat', 'depth', 'dread', 'night', 'dusk', 'aurora', 'rain', 'storm', 'wind',
  'altitude', 'vista', 'forest', 'water', 'snow', 'sand', 'settlement', 'ruin', 'murk', 'warmth', 'wonder',
  'triumph', 'hurt', 'downed', 'speed', 'soaring', 'voyage', 'company',
];

const SIGNAL_SET: ReadonlySet<string> = new Set(SIGNAL_NAMES);
export function isSignal(name: string): name is SignalName {
  return SIGNAL_SET.has(name);
}

export function emptySignals(): MoodSignals {
  const s = {} as Record<SignalName, number>;
  for (const n of SIGNAL_NAMES) s[n] = 0;
  return s;
}

/** What a probe may look at. Everything is read-only. */
export interface GameView {
  readonly state: SimState;
  readonly tiles: ReadonlyTiles;
  readonly me: Entity;
}

/** A probe writes whatever signals it knows about; it never needs to set all of them. */
export type SignalProbe = (view: GameView, out: MoodSignals) => void;

// ---------------------------------------------------------------------------------------------
// Event impulses: a short burst of feeling when something happens. Unknown events do nothing.
// ---------------------------------------------------------------------------------------------

type Impulses = Partial<Record<SignalName, number>>;
type ImpulseRule<K extends SimEvent['type']> = (ev: Extract<SimEvent, { type: K }>, me: number | null, near: (x: number, y: number, r: number) => boolean) => Impulses | null;
type ImpulseTable = { [K in SimEvent['type']]?: ImpulseRule<K> };

export const EVENT_IMPULSES: ImpulseTable = {
  hit: (ev, me, near) => {
    if (ev.target === me) return { combat: 0.55, danger: 0.3 };
    if (ev.source === me) return { combat: 0.45 };
    return near(ev.x, ev.y, 20) ? { combat: 0.2 } : null;
  },
  swing: (ev, me, near) => (ev.entity !== me && near(ev.x, ev.y, 10) ? { combat: 0.12 } : null),
  growl: (ev, _me, near) => (near(ev.x, ev.y, 30) ? { danger: 0.25, threat: 0.3 } : null),
  spellBurst: (ev, _me, near) => (near(ev.x, ev.y, 25) ? { combat: 0.15 } : null),
  trapSprung: (ev, _me, near) => (near(ev.x, ev.y, 20) ? { combat: 0.25, danger: 0.2 } : null),
  death: (ev, _me, near) => (near(ev.x, ev.y, 30) ? { triumph: 0.35 } : null),
  discovered: () => ({ wonder: 1 }),
  runeLearned: (ev, me) => (ev.player === me ? { wonder: 0.7 } : null),
  skillUp: (ev, me) => (ev.player === me ? { wonder: 0.25 } : null),
  thunder: () => ({ storm: 0.4 }),
};

// ---------------------------------------------------------------------------------------------

interface Fed {
  value: number;
  until: number;
}

/**
 * Collects raw signals from probes, events and feeds, and smooths them over time.
 * `current` is what styles read; `extra` holds named signals no probe knows about yet.
 */
export class MoodTracker {
  readonly current: MoodSignals = emptySignals();
  readonly extra = new Map<string, number>();
  private target: MoodSignals = emptySignals();
  private impulses: MoodSignals = emptySignals();
  private fed = new Map<string, Fed>();
  private failures = new Map<string, number>();
  private disabled = new Set<string>();
  private probes: { name: string; probe: SignalProbe }[] = [...PROBES];
  private clock = 0;

  /** Teach music about a new system without touching anything else. */
  addProbe(name: string, probe: SignalProbe): void {
    this.probes = this.probes.filter((p) => p.name !== name);
    this.probes.splice(Math.max(0, this.probes.length - 1), 0, { name, probe });
  }

  /** Push a value from outside (a dungeon system, a cutscene, a debug console) for a while. */
  feed(name: string, value: number, seconds = 2): void {
    this.fed.set(name, { value: clampNum(value), until: this.clock + Math.max(0.1, seconds) });
  }

  /** Run every probe against the current game view. */
  sample(view: GameView): void {
    const raw = emptySignals();
    for (const { name, probe } of this.probes) {
      if (this.disabled.has(name)) continue;
      try {
        probe(view, raw);
      } catch (err) {
        const n = (this.failures.get(name) ?? 0) + 1;
        this.failures.set(name, n);
        if (n >= 5) {
          this.disabled.add(name);
          console.warn(`[music] mood probe "${name}" switched off after repeated errors; music carries on without it.`, err);
        }
      }
    }
    for (const n of SIGNAL_NAMES) raw[n] = clampNum(raw[n]);
    this.target = raw;
  }

  impulse(ev: SimEvent, me: number | null, listener: { x: number; y: number }): void {
    const rule = (EVENT_IMPULSES as Record<string, ImpulseRule<SimEvent['type']> | undefined>)[ev.type];
    if (!rule) return;
    try {
      const near = (x: number, y: number, r: number): boolean => Math.hypot(x - listener.x, y - listener.y) < r;
      const add = rule(ev as never, me, near);
      if (!add) return;
      for (const k of Object.keys(add) as SignalName[]) {
        const v = add[k] ?? 0;
        this.impulses[k] = clamp01(this.impulses[k] + v);
      }
    } catch {
      // A malformed event must never stop the music.
    }
  }

  /** Smooth towards the latest targets. Call every frame. */
  update(dt: number): void {
    this.clock += dt;
    const fedNow = new Map<string, number>();
    for (const [k, f] of this.fed) {
      if (f.until < this.clock) this.fed.delete(k);
      else fedNow.set(k, f.value);
    }
    for (const n of SIGNAL_NAMES) {
      const hl = IMPULSE_DECAY[n] ?? 6;
      this.impulses[n] *= Math.pow(0.5, dt / hl);
      let goal = Math.max(this.target[n], this.impulses[n]);
      const f = fedNow.get(n);
      if (f !== undefined) goal = Math.max(goal, f);
      const [rise, fall] = SMOOTH[n] ?? DEFAULT_SMOOTH;
      const tau = goal > this.current[n] ? rise : fall;
      this.current[n] += (goal - this.current[n]) * (1 - Math.exp(-dt / tau));
    }
    for (const [k, v] of fedNow) {
      if ((SIGNAL_NAMES as readonly string[]).includes(k)) continue;
      const prev = this.extra.get(k) ?? 0;
      this.extra.set(k, prev + (v - prev) * (1 - Math.exp(-dt / 2)));
    }
    for (const [k, v] of this.extra) {
      if (!fedNow.has(k)) {
        const nv = v * Math.exp(-dt / 3);
        if (nv < 0.001) this.extra.delete(k);
        else this.extra.set(k, nv);
      }
    }
  }

  /** Set the smoothed values directly (previews and tests). */
  force(values: Partial<MoodSignals>): void {
    for (const k of Object.keys(values) as SignalName[]) {
      const v = clampNum(values[k]);
      this.current[k] = v;
      this.target[k] = v;
    }
  }
}
