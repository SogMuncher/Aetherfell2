/**
 * The light and air of the moment: sun path, sky colours, the light on clouds, and the fog, which is the sky at the
 * horizon (or the cloud you stand in) so far land always fades into the sky behind it. Every drawer reads this one Env.
 */
import type { SimState } from '../types';
import { CONTENT, airMoisture, cloudDensity3, layerCover, rainAt, sunAngle } from '../content';

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
  /** Fog colour and distance scale. The fog IS the sky at the horizon (or the cloud you stand in), so far land fades into the sky. */
  fog: [number, number, number];
  fogDist: number;
  /** Light falling on clouds (0..~1 per channel): the same light that greys an overcast sky. */
  cloudLit: [number, number, number];
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

/** Sun path, sky and fog colours, and ambient light for the current moment, seen from (x, y, z). */
export function computeEnv(state: SimState, flash: number, x = 0, y = 0, z = 0): Env {
  const realm = CONTENT.realms[state.realm];
  if (realm && !realm.sky) {
    // Under the land: no sun, moon, stars or weather; a dim tinted dark and a short sight.
    const [fr, fg, fb] = realm.fog;
    const a = realm.ambient;
    const fogc: [number, number, number] = [fr, fg, fb];
    return {
      lx: 0, ly: 0.3, lz: 0.95, sunR: 0, sunG: 0, sunB: 0,
      ambR: a * (fr / 24 + 0.5), ambG: a * (fg / 24 + 0.5), ambB: a * (fb / 24 + 0.6),
      zenith: fogc, horizon: fogc, fog: fogc, fogDist: realm.fogDist, cloudLit: [0, 0, 0],
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
  // One light for the cloud deck: what greys an overcast sky also lights each cloud.
  const light = 0.16 + day * 0.84;
  const cloudLit: [number, number, number] = [(0.86 + dusk * 0.12) * light, (0.86 - dusk * 0.16) * light, (0.89 - dusk * 0.27) * light];
  const grey: [number, number, number] = [C.overcast[0] * cloudLit[0] / 0.86, C.overcast[1] * cloudLit[1] / 0.86, C.overcast[2] * cloudLit[2] / 0.89];
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
  // Ground mist: thick over damp land and after rain, mostly at night and dusk (the same moisture the clouds follow).
  let fogDist = 2600 * (1 - rain * 0.72) * (1 - night * 0.45) * (1 - 0.55 * Math.min(1, Math.max(0, (airMoisture(x, y) - 0.45) * 2.5) + state.weather.wetness * 0.5) * (0.3 + 0.7 * Math.max(night, dusk)));
  let fog = horizon;
  // Standing in a cloud (a high peak in low cloud): the sight shortens to what the cloud lets through, in the cloud's colour.
  for (const l of CONTENT.sky.layers) {
    const th = l.thickness ?? 0;
    if (th <= 0 || z < l.height || z > l.height + th) continue;
    const hf = (z - l.height) / th;
    const d = cloudDensity3(l, w, layerCover(l, w), x, y, hf) * l.opacity;
    if (d <= 0.01) continue;
    fogDist = Math.min(fogDist, Math.max(60, th) / (3.2 * d));
    const shade = 1 - l.belly * (0.55 + rain * 0.45) * (1 - hf) * 0.75;
    const c: [number, number, number] = [l.tint[0] * cloudLit[0] * shade, l.tint[1] * cloudLit[1] * shade, l.tint[2] * cloudLit[2] * shade];
    fog = mix3(fog, c, Math.min(1, d * 1.5));
  }
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
    fogDist,
    cloudLit,
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
