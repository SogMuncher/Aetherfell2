// Airship fittings as art: the wheel, lever and aether tank, each in five pictures that show its state (gauge frames)
import type { ArtDef, ArtId, ArtPart } from '../types';

const COLORS = { wood: ['@plank'], dark: ['#3a2a1c'], brass: ['#b08838', '#c09a48'], glass: ['#a8c8d0'], aether: ['#60e0d0'], empty: ['#24302e'] };
const FRAMES = 5;

function prop(parts: ArtPart[]): ArtDef {
  return { ppm: 20, variants: 1, colors: COLORS, parts };
}

/** The ship's wheel on its post, turned by `turn` degrees (helm hard to one side at the ends). */
function wheel(turn: number): ArtDef {
  const spokes: ArtPart[] = [0, 45, 90, 135].map((a) => ({ shape: 'box', at: [0.05, 1.05, 0], size: [0.02, 0.4, 0.02], roll: a + turn, color: 'wood', surface: 'wood' }));
  return prop([
    { shape: 'box', at: [-0.05, 0.5, 0], size: [0.08, 0.5, 0.08], color: 'dark', surface: 'wood' },
    { shape: 'drum', at: [0.05, 1.05, 0], size: [0.32, 0.025, 0.32], tilt: 90, color: 'wood', surface: 'wood' },
    { shape: 'drum', at: [0.07, 1.05, 0], size: [0.07, 0.04, 0.07], tilt: 90, color: 'brass', surface: 'metal' },
    ...spokes,
    // A brass mark on the top spoke shows how far the wheel is over.
    { shape: 'ball', at: [0.08, 1.05 + Math.cos((turn * Math.PI) / 180) * 0.36, Math.sin((turn * Math.PI) / 180) * 0.36], size: [0.05, 0.05, 0.05], color: 'brass', surface: 'metal' },
  ]);
}

/** A lever on a base, leaning `lean` degrees forward (+) or back (-). */
function lever(lean: number): ArtDef {
  const r = (lean * Math.PI) / 180;
  return prop([
    { shape: 'box', at: [0, 0.2, 0], size: [0.22, 0.2, 0.18], color: 'dark', surface: 'wood' },
    { shape: 'box', at: [0, 0.42, 0], size: [0.16, 0.02, 0.05], color: 'brass', surface: 'metal' },
    { shape: 'box', at: [Math.sin(r) * 0.35, 0.4 + Math.cos(r) * 0.35, 0], size: [0.025, 0.35, 0.025], tilt: -lean, color: 'wood', surface: 'wood' },
    { shape: 'ball', at: [Math.sin(r) * 0.7, 0.4 + Math.cos(r) * 0.7, 0], size: [0.06, 0.06, 0.06], color: 'brass', surface: 'metal' },
  ]);
}

/** A glass tank on brass feet; the glowing aether inside stands `full` (0..1) high. */
function tank(full: number): ArtDef {
  const h = 0.4 * full;
  return prop([
    { shape: 'drum', at: [0, 0.1, 0], size: [0.3, 0.1, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 0.6, 0], size: [0.26, 0.4, 0.26], color: 'glass', surface: 'smooth' },
    { shape: 'drum', at: [0, 0.6, 0], size: [0.24, 0.39, 0.24], color: 'empty', surface: 'smooth' },
    ...(full > 0 ? [{ shape: 'drum', at: [0, 0.21 + h, 0], size: [0.25, h, 0.25], color: 'aether', surface: 'glow' } as ArtPart] : []),
    { shape: 'drum', at: [0, 1.04, 0], size: [0.3, 0.05, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'cone', at: [0, 1.12, 0], size: [0.1, 0.12, 0.1], color: 'brass', surface: 'metal' },
  ]);
}

/** Every picture: `<name><frame>` for frame 0 (the low end) to FRAMES - 1. */
export const SHIP_PROPS: Record<ArtId, ArtDef> = {};
for (let i = 0; i < FRAMES; i++) {
  const t = i / (FRAMES - 1);
  SHIP_PROPS[`shipWheel${i}`] = wheel((t * 2 - 1) * 90);
  SHIP_PROPS[`shipLever${i}`] = lever((t * 2 - 1) * 40);
  SHIP_PROPS[`fuelTank${i}`] = tank(t);
}
SHIP_PROPS.shipWheel = SHIP_PROPS.shipWheel2 as ArtDef;
SHIP_PROPS.shipLever = SHIP_PROPS.shipLever2 as ArtDef;
SHIP_PROPS.fuelTank = SHIP_PROPS.fuelTank0 as ArtDef;
