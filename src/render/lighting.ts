import type { Entity, ReadonlyTiles, SimState } from '../types';
import { unpackKey, unpackSpot } from '../types';
import { CONTENT, airMoisture, heldLight, rainAt, sunAngle, thingDef, spellFor } from '../content';

export interface Env {
  /** Direction towards the main light (sun by day, moon by night), z up. */
  lx: number;
  ly: number;
  lz: number;
  /** Direct light colour (0..~1.2). */
  sunR: number;
  sunG: number;
  sunB: number;
  ambR: number;
  ambG: number;
  ambB: number;
  /** Sky colours (0..255). */
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** Fog colour and distance scale. */
  fog: [number, number, number];
  fogDist: number;
  day: number;
  dusk: number;
  night: number;
  sunAz: number;
  sunEl: number;
  stars: number;
  aurora: number;
  cloud: number;
  rain: number;
  time: number;
  flash: number;
  /** Open sky overhead (sun, stars, clouds) or rock (only lamps and fire light the way). */
  open: boolean;
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Sun path, sky and fog colours, and ambient light for the current moment, seen from (x, y). */
export function computeEnv(state: SimState, flash: number, x = 0, y = 0): Env {
  const realm = CONTENT.realms[state.realm];
  if (realm && !realm.sky) {
    // Under the land: no sun, moon, stars or weather; a dim tinted dark and a short sight.
    const [fr, fg, fb] = realm.fog;
    const a = realm.ambient;
    const fogc: [number, number, number] = [fr, fg, fb];
    return {
      lx: 0, ly: 0.3, lz: 0.95, sunR: 0, sunG: 0, sunB: 0,
      ambR: a * (fr / 24 + 0.5), ambG: a * (fg / 24 + 0.5), ambB: a * (fb / 24 + 0.6),
      zenith: fogc, horizon: fogc, fog: fogc, fogDist: realm.fogDist,
      day: 0, dusk: 0, night: 1, sunAz: 0, sunEl: -1, stars: 0, aurora: 0, cloud: 0, rain: 0,
      time: state.weather.time, flash: 0, open: false,
    };
  }
  const w = state.weather;
  const C = CONTENT.sky.colours;
  // Rain is local (only under storm cells): what matters is the rain where you stand.
  const rain = rainAt(CONTENT.sky, w, x, y);
  const a = sunAngle(CONTENT.rules.day, w.time);
  const sunEl = Math.sin(a);
  const sunAz = Math.cos(a) >= 0 ? 0.35 : Math.PI - 0.35;
  const day = clamp01((sunEl + 0.1) / 0.35);
  const dusk = clamp01(1 - Math.abs(sunEl) * 4) * (1 - w.cloud * 0.6);
  const night = 1 - day;
  const overcast = clamp01(w.cloud * 0.6 + rain * 0.5);

  const rgb = (c: readonly [number, number, number]): [number, number, number] => [c[0], c[1], c[2]];
  let zenith = mix3(rgb(C.zenith.night), rgb(C.zenith.day), day);
  let horizon = mix3(rgb(C.horizon.night), rgb(C.horizon.day), day);
  zenith = mix3(zenith, rgb(C.zenith.dusk), dusk * 0.5);
  horizon = mix3(horizon, rgb(C.horizon.dusk), dusk * 0.75);
  const grey: [number, number, number] = [C.overcast[0] * (0.16 + day * 0.84), C.overcast[1] * (0.16 + day * 0.84), C.overcast[2] * (0.18 + day * 0.82)];
  zenith = mix3(zenith, grey, overcast * 0.8);
  horizon = mix3(horizon, grey, overcast * 0.7);

  const useSun = sunEl > -0.05;
  const el = useSun ? Math.max(0.05, sunEl) : Math.max(0.15, -sunEl);
  const lx = Math.cos(useSun ? sunAz : sunAz + Math.PI) * Math.cos(Math.asin(el));
  const ly = 0.3;
  const lz = el;
  const ll = Math.hypot(lx, ly, lz);
  const sunPow = useSun ? clamp01(sunEl * 4 + 0.3) * (1 - overcast * 0.75) : 0.18 * (1 - overcast);
  const warm = dusk;
  const sunR = useSun ? (0.95 + warm * 0.2) * sunPow : 0.32 * sunPow;
  const sunG = useSun ? (0.88 - warm * 0.18) * sunPow : 0.4 * sunPow;
  const sunB = useSun ? (0.78 - warm * 0.4) * sunPow : 0.62 * sunPow;
  const amb = 0.2 + day * 0.27;
  const fl = flash * 0.9;
  const fog = mix3(horizon, [horizon[0] * 0.85 + 20, horizon[1] * 0.85 + 22, horizon[2] * 0.85 + 26], overcast);
  return {
    lx: lx / ll,
    ly: ly / ll,
    lz: lz / ll,
    sunR,
    sunG,
    sunB,
    ambR: amb * (0.85 + night * 0.05) + fl,
    ambG: amb * (0.9 + night * 0.08) + fl,
    ambB: amb * (1.05 + night * 0.5) + fl,
    zenith,
    horizon,
    fog,
    // Ground mist: thick over damp land and after rain, mostly at night and dusk (the same moisture the clouds follow).
    fogDist: 2600 * (1 - rain * 0.72) * (1 - night * 0.45) * (1 - 0.55 * Math.min(1, Math.max(0, (airMoisture(x, y) - 0.45) * 2.5) + state.weather.wetness * 0.5) * (0.3 + 0.7 * Math.max(night, dusk))),
    day,
    dusk,
    night,
    sunAz,
    sunEl,
    stars: clamp01(-sunEl * 5) * (1 - w.cloud),
    aurora: w.aurora * clamp01(-sunEl * 4) * (1 - w.cloud),
    cloud: w.cloud,
    rain,
    time: w.time,
    flash,
    open: true,
  };
}

interface PointLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  shadow: boolean;
}

export const LM_SIZE = 96;

/**
 * A small light grid (1 m cells) centred on the camera. Torches, flames and spells add warm light
 * with smooth falloff; torches also cast shadows by checking line of sight through walls.
 */
export class LightMap {
  readonly r = new Float32Array(LM_SIZE * LM_SIZE);
  readonly g = new Float32Array(LM_SIZE * LM_SIZE);
  readonly b = new Float32Array(LM_SIZE * LM_SIZE);
  ox = 0;
  oy = 0;
  private lights: PointLight[] = [];

  build(state: SimState, tiles: ReadonlyTiles, camX: number, camY: number, time: number, alpha: number): void {
    this.ox = Math.floor(camX) - LM_SIZE / 2;
    this.oy = Math.floor(camY) - LM_SIZE / 2;
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    const lights = this.lights;
    lights.length = 0;
    for (const e of state.entities.values()) {
      const d = thingDef(CONTENT, e.def);
      // A thing's own light, a bolt's, or the light of what an actor holds in its hand.
      const held = e.projectile || d.light ? undefined : heldLight(CONTENT, e);
      const L = e.projectile ? spellFor(CONTENT, e.projectile.spell)?.light : d.light ?? held;
      const burning = (e.status.burning ?? 0) > 0;
      if (!L && !burning) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      if (Math.abs(x - camX) > LM_SIZE / 2 + 10 || Math.abs(y - camY) > LM_SIZE / 2 + 10) continue;
      const fl = L ? 1 - L.flicker * 0.5 + Math.sin(time * 17 + e.id * 3.1) * L.flicker * 0.25 + Math.sin(time * 29 + e.id) * L.flicker * 0.25 : 1;
      if (L) lights.push({ x, y, z: e.z + 1, r: L.r * fl, g: L.g * fl, b: L.b * fl, radius: L.radius, shadow: !!d.body.anchored || !!held });
      else if (burning) lights.push(burnLight(e, x, y, time));
    }
    // Where the sky is rock, every traveller carries a lamp.
    const glow = CONTENT.realms[state.realm]?.glow;
    if (glow) {
      for (const pid of Object.values(state.players)) {
        const e = state.entities.get(pid);
        if (!e) continue;
        const fl = 1 - glow.flicker * 0.5 + Math.sin(time * 15 + e.id * 2.3) * glow.flicker * 0.3 + Math.sin(time * 27 + e.id) * glow.flicker * 0.2;
        lights.push({ x: lerp(e.prev.x, e.pos.x, alpha), y: lerp(e.prev.y, e.pos.y, alpha), z: e.z + 1.4, r: glow.r * fl, g: glow.g * fl, b: glow.b * fl, radius: glow.radius, shadow: true });
      }
    }
    let n = 0;
    for (const key of state.burning) {
      if (n > 400) break;
      const { x, y } = unpackKey(key);
      if (Math.abs(x - camX) > LM_SIZE / 2 + 6 || Math.abs(y - camY) > LM_SIZE / 2 + 6) continue;
      const f = tiles.fire(x, y) / 255;
      const fl = 0.8 + Math.sin(time * 13 + x * 1.7 + y * 2.3) * 0.2;
      lights.push({ x: x + 0.5, y: y + 0.5, z: 1, r: 1.1 * f * fl, g: 0.55 * f * fl, b: 0.18 * f * fl, radius: 4.5, shadow: false });
      n++;
    }
    // Fire in the walls, floors and roofs of the 3D layer lights the room like any other fire.
    for (const key of state.volume.burningCells) {
      if (n > 400) break;
      const { x, y, z } = unpackSpot(key);
      if (Math.abs(x - camX) > LM_SIZE / 2 + 6 || Math.abs(y - camY) > LM_SIZE / 2 + 6) continue;
      const f = state.volume.cellGet('fire', x, y, z) / 255;
      const fl = 0.8 + Math.sin(time * 13 + x * 1.7 + y * 2.3 + z) * 0.2;
      lights.push({ x: x + 0.5, y: y + 0.5, z: z + 1, r: 1.1 * f * fl, g: 0.55 * f * fl, b: 0.18 * f * fl, radius: 4.5, shadow: false });
      n++;
    }
    for (const l of lights) this.splat(l, tiles);
  }

  private splat(l: PointLight, tiles: ReadonlyTiles): void {
    const R = Math.ceil(l.radius);
    const cx = Math.floor(l.x);
    const cy = Math.floor(l.y);
    for (let j = -R; j <= R; j++) {
      const gy = cy + j - this.oy;
      if (gy < 0 || gy >= LM_SIZE) continue;
      for (let i = -R; i <= R; i++) {
        const gx = cx + i - this.ox;
        if (gx < 0 || gx >= LM_SIZE) continue;
        const dx = cx + i + 0.5 - l.x;
        const dy = cy + j + 0.5 - l.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > l.radius) continue;
        if (l.shadow && d > 1.5 && !this.visible(tiles, l.x, l.y, cx + i + 0.5, cy + j + 0.5)) continue;
        const f = 1 - d / l.radius;
        const k = f * f;
        const idx = gy * LM_SIZE + gx;
        this.r[idx] = (this.r[idx] ?? 0) + l.r * k;
        this.g[idx] = (this.g[idx] ?? 0) + l.g * k;
        this.b[idx] = (this.b[idx] ?? 0) + l.b * k;
      }
    }
  }

  private visible(tiles: ReadonlyTiles, x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.5);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (Math.floor(x) === Math.floor(x1) && Math.floor(y) === Math.floor(y1)) return true;
      const inf = tiles.info(x, y);
      if (inf.shape === 'block' || (inf.shape === 'door' && tiles.door(x, y) < 128)) return false;
    }
    return true;
  }

  /** Bilinear light at a world point; writes into out[0..2]. */
  sample(x: number, y: number, out: Float32Array): void {
    const fx = x - this.ox - 0.5;
    const fy = y - this.oy - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= LM_SIZE - 1 || iy >= LM_SIZE - 1) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return;
    }
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * LM_SIZE + ix;
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    const R = this.r;
    const G = this.g;
    const B = this.b;
    out[0] = (R[i] ?? 0) * w00 + (R[i + 1] ?? 0) * w10 + (R[i + LM_SIZE] ?? 0) * w01 + (R[i + LM_SIZE + 1] ?? 0) * w11;
    out[1] = (G[i] ?? 0) * w00 + (G[i + 1] ?? 0) * w10 + (G[i + LM_SIZE] ?? 0) * w01 + (G[i + LM_SIZE + 1] ?? 0) * w11;
    out[2] = (B[i] ?? 0) * w00 + (B[i + 1] ?? 0) * w10 + (B[i + LM_SIZE] ?? 0) * w01 + (B[i + LM_SIZE + 1] ?? 0) * w11;
  }
}

function burnLight(e: Entity, x: number, y: number, time: number): PointLight {
  const fl = 0.85 + Math.sin(time * 15 + e.id) * 0.15;
  return { x, y, z: e.z + 1, r: 1.1 * fl, g: 0.5 * fl, b: 0.15 * fl, radius: 5, shadow: false };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
