// Airship fittings as art: the wheel, the two levers and the aether tank, each in pictures that show its state (gauge frames)
import type { ArtDef, ArtId, ArtPart } from '../types';

const COLORS = { wood: ['@plank'], dark: ['#3a2a1c'], brass: ['#b08838', '#c09a48'], glass: ['#a8c8d0'], aether: ['#60e0d0'], empty: ['#1c2826'], red: ['#a83828'], iron: ['#4a4e54'] };
/** Pictures per gauge: the station's `gauge` (content/things.ts) must match. */
export const PROP_FRAMES = 9;

function prop(parts: ArtPart[]): ArtDef {
  return { ppm: 30, variants: 1, colors: COLORS, parts };
}

/**
 * A ship's wheel on a pedestal, its face toward the helmsman behind it: a rim of twelve staves, eight spokes that run
 * out past the rim into handles, a brass hub. Turned `turn` degrees (hard over at the ends); the red-tipped handle
 * shows how far.
 */
function wheel(turn: number): ArtDef {
  const R = 0.42;
  const C = [0.1, 1.05] as const;
  const at = (a: number, r: number): [number, number, number] => [C[0], C[1] + Math.cos((a * Math.PI) / 180) * r, -Math.sin((a * Math.PI) / 180) * r];
  const rim: ArtPart[] = Array.from({ length: 12 }, (_, i) => ({ shape: 'box', at: at(i * 30 + 15 + turn, R), size: [0.03, 0.115, 0.035], roll: -(i * 30 + 15 + turn) + 90, color: 'wood', surface: 'wood' }));
  const spokes: ArtPart[] = [0, 45, 90, 135].map((a) => ({ shape: 'box', at: [C[0], C[1], 0], size: [0.022, R + 0.1, 0.022], roll: -(a + turn), color: 'wood', surface: 'wood' }));
  const knobs: ArtPart[] = Array.from({ length: 8 }, (_, i) => ({ shape: 'ball', at: at(i * 45 + turn, R + 0.14), size: [0.04, 0.05, 0.04], color: i === 0 ? 'red' : 'dark', surface: 'wood' }));
  return prop([
    // Pedestal: a stout post on a foot, with a brass collar under the axle.
    { shape: 'box', at: [-0.05, 0.08, 0], size: [0.22, 0.08, 0.22], color: 'dark', surface: 'wood' },
    { shape: 'drum', at: [-0.05, 0.55, 0], size: [0.1, 0.45, 0.1], color: 'wood', surface: 'wood' },
    { shape: 'drum', at: [-0.05, 0.98, 0], size: [0.12, 0.05, 0.12], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0.03, C[1], 0], size: [0.035, 0.09, 0.035], tilt: 90, color: 'iron', surface: 'metal' },
    ...rim,
    ...spokes,
    ...knobs,
    { shape: 'drum', at: [C[0] + 0.02, C[1], 0], size: [0.08, 0.035, 0.08], tilt: 90, color: 'brass', surface: 'metal' },
    { shape: 'ball', at: [C[0] + 0.05, C[1], 0], size: [0.035, 0.035, 0.035], color: 'brass', surface: 'metal' },
  ]);
}

/** A lever in a brass quadrant on a timber block, leaning `lean` degrees forward (+) or back (-); `knob` colours its grip. */
function lever(lean: number, knob: string): ArtDef {
  const r = (lean * Math.PI) / 180;
  const notches: ArtPart[] = [-40, -20, 0, 20, 40].map((a) => ({ shape: 'box', at: [Math.sin((a * Math.PI) / 180) * 0.3, 0.5 + Math.cos((a * Math.PI) / 180) * 0.3, 0.07], size: [0.012, 0.03, 0.012], tilt: -a, color: 'dark', surface: 'metal' }));
  return prop([
    { shape: 'box', at: [0, 0.22, 0], size: [0.26, 0.22, 0.2], color: 'dark', surface: 'wood' },
    { shape: 'box', at: [0, 0.45, 0], size: [0.27, 0.025, 0.21], color: 'wood', surface: 'wood' },
    // The quadrant: a half disc of brass each side of the handle, notched along its edge.
    { shape: 'drum', at: [0, 0.5, 0.06], size: [0.3, 0.012, 0.3], tilt: 90, roll: 90, color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 0.5, -0.06], size: [0.3, 0.012, 0.3], tilt: 90, roll: 90, color: 'brass', surface: 'metal' },
    { shape: 'box', at: [0, 0.4, 0], size: [0.32, 0.1, 0.09], color: 'dark', surface: 'wood' },
    ...notches,
    { shape: 'drum', at: [0, 0.5, 0], size: [0.04, 0.08, 0.04], tilt: 90, roll: 90, color: 'iron', surface: 'metal' },
    { shape: 'box', at: [Math.sin(r) * 0.36, 0.5 + Math.cos(r) * 0.36, 0], size: [0.025, 0.36, 0.025], tilt: lean, color: 'iron', surface: 'metal' },
    { shape: 'drum', at: [Math.sin(r) * 0.76, 0.5 + Math.cos(r) * 0.76, 0], size: [0.035, 0.08, 0.035], tilt: lean, color: knob, surface: 'wood' },
    { shape: 'ball', at: [Math.sin(r) * 0.86, 0.5 + Math.cos(r) * 0.86, 0], size: [0.05, 0.04, 0.05], color: knob, surface: 'metal' },
  ]);
}

/** A glass tank in a brass cage on a brass foot, a valve wheel on top; the glowing aether inside stands `full` (0..1) high. */
function tank(full: number): ArtDef {
  const h = 0.42 * full;
  const straps: ArtPart[] = [0, 90, 180, 270].map((a) => ({ shape: 'box', at: [Math.cos((a * Math.PI) / 180) * 0.27, 0.66, Math.sin((a * Math.PI) / 180) * 0.27], size: [0.025, 0.46, 0.025], color: 'brass', surface: 'metal' }));
  return prop([
    { shape: 'drum', at: [0, 0.07, 0], size: [0.34, 0.07, 0.34], color: 'dark', surface: 'wood' },
    { shape: 'drum', at: [0, 0.17, 0], size: [0.3, 0.05, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 0.65, 0], size: [0.26, 0.44, 0.26], color: 'glass', surface: 'smooth' },
    { shape: 'drum', at: [0, 0.65, 0], size: [0.25, 0.43, 0.25], color: 'empty', surface: 'smooth' },
    ...(full > 0 ? [{ shape: 'drum', at: [0, 0.23 + h, 0], size: [0.255, h, 0.255], color: 'aether', surface: 'glow' } as ArtPart] : []),
    ...straps,
    { shape: 'drum', at: [0, 0.65, 0], size: [0.275, 0.025, 0.275], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 1.11, 0], size: [0.3, 0.04, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'cone', at: [0, 1.15, 0], size: [0.2, 0.12, 0.2], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 1.3, 0], size: [0.03, 0.06, 0.03], color: 'iron', surface: 'metal' },
    { shape: 'drum', at: [0, 1.36, 0], size: [0.1, 0.015, 0.1], color: 'red', surface: 'metal' },
    // A pipe from the top down to the deck, where the aether goes to the ship.
    { shape: 'drum', at: [-0.32, 0.65, 0], size: [0.03, 0.5, 0.03], color: 'brass', surface: 'metal' },
    { shape: 'box', at: [-0.18, 1.14, 0], size: [0.14, 0.025, 0.025], color: 'brass', surface: 'metal' },
  ]);
}

/** Every picture: `<name><frame>` for frame 0 (the low end) to PROP_FRAMES - 1, and the bare name for the middle (or empty tank). */
export const SHIP_PROPS: Record<ArtId, ArtDef> = {};
for (let i = 0; i < PROP_FRAMES; i++) {
  const t = i / (PROP_FRAMES - 1);
  SHIP_PROPS[`shipWheel${i}`] = wheel((t * 2 - 1) * 120);
  SHIP_PROPS[`throttleLever${i}`] = lever((t * 2 - 1) * 40, 'brass');
  SHIP_PROPS[`altitudeLever${i}`] = lever((t * 2 - 1) * 40, 'red');
  SHIP_PROPS[`fuelTank${i}`] = tank(t);
}
const mid = Math.floor(PROP_FRAMES / 2);
SHIP_PROPS.shipWheel = SHIP_PROPS[`shipWheel${mid}`] as ArtDef;
SHIP_PROPS.throttleLever = SHIP_PROPS[`throttleLever${mid}`] as ArtDef;
SHIP_PROPS.altitudeLever = SHIP_PROPS[`altitudeLever${mid}`] as ArtDef;
SHIP_PROPS.fuelTank = SHIP_PROPS.fuelTank0 as ArtDef;
