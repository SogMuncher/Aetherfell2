// Generic mood -> music dials: every signal may nudge tempo, energy and brightness (data, read by the conductor).
import type { MoodSignals, SignalName } from './signals';

export interface Modulator {
  /** Tempo change at full signal (0.1 = 10 % faster). */
  tempo?: number;
  /** Added to the style's energy (more layers join). */
  energy?: number;
  /** Brightness change (-0.5 = half the treble, muffled). */
  tone?: number;
}

export const MODULATORS: Partial<Record<SignalName, Modulator>> = {
  speed: { tempo: 0.12, energy: 0.15 },
  soaring: { tempo: 0.05, energy: 0.1, tone: 0.2 },
  danger: { tempo: 0.05 },
  storm: { energy: 0.1 },
  company: { energy: 0.08 },
  night: { tempo: -0.08, tone: -0.25 },
  dusk: { tone: -0.1 },
  depth: { tone: -0.2 },
  hurt: { tempo: 0.06, tone: -0.55 },
  downed: { tempo: -0.15, tone: -0.3 },
  warmth: { tempo: -0.04 },
};

export interface Dials {
  tempo: number;
  energy: number;
  tone: number;
}

export function dials(s: MoodSignals): Dials {
  let tempo = 1;
  let energy = 0;
  let tone = 1;
  for (const [name, m] of Object.entries(MODULATORS) as [SignalName, Modulator][]) {
    const v = s[name];
    if (!(v > 0)) continue;
    tempo += (m.tempo ?? 0) * v;
    energy += (m.energy ?? 0) * v;
    tone *= Math.max(0.1, 1 + (m.tone ?? 0) * v);
  }
  return {
    tempo: Math.max(0.8, Math.min(1.3, tempo)),
    energy: Math.max(-0.3, Math.min(0.3, energy)),
    tone: Math.max(0.25, Math.min(1.4, tone)),
  };
}
