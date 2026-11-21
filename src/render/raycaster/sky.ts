import { pack, rhash, vnoise } from '../color';
import type { CloudLayerDef, WeatherState } from '../../types';
import { CONTENT, cloudDensity3, layerCover, layerDensity } from '../../content';
import type { Env } from '../lighting';
import type { Viewport } from '../viewport';
import type { Projection } from './camera';

/** Cloud layers sorted high to low (lower ones are drawn over higher ones). */
const LAYERS: readonly CloudLayerDef[] = [...CONTENT.sky.layers].sort((a, b) => b.height - a.height);
const cover = new Float32Array(LAYERS.length);
/**
 * Thick clouds are marched at half the screen's resolution (every second pixel across and down) and
 * each result serves a 2×2 block: they are soft, and it quarters the cost. Per layer and screen row:
 * the colour, and how much of the sky behind it the cloud hides, from the even column before.
 */
let cacheCols = 0;
let cacheR = new Float32Array(0);
let cacheG = new Float32Array(0);
let cacheB = new Float32Array(0);
let cacheA = new Float32Array(0);

/**
 * Sky: gradient from horizon to zenith, sun glow and disc, moon, stars that stay fixed as you turn,
 * the cloud layers of content/sky.ts lit by the hour, and aurora curtains on clear nights.
 * Everything here comes from the sky data. Only fills the rows the terrain left open in each column.
 */
export function drawSky(vp: Viewport, p: Projection, env: Env, colTop: Int32Array, time: number, weather: WeatherState): void {
  const SKY = CONTENT.sky;
  const { W, F, HOR } = p;
  const px = vp.pixels;
  const depth = vp.depth;
  if (!env.open) {
    // Rock overhead: above the land there is only the dark.
    const dark = pack(env.horizon[0], env.horizon[1], env.horizon[2]);
    for (let i = 0; i < W; i++) {
      const top = Math.min(p.H, Math.max(0, colTop[i] ?? 0));
      for (let j = 0; j < top; j++) {
        const o = j * W + i;
        px[o] = dark;
        depth[o] = 1e9;
      }
    }
    return;
  }
  const [zr, zg, zb] = env.zenith;
  const [hr, hg, hb] = env.horizon;
  const yaw = p.cam.yaw;
  const sunAz = env.sunAz;
  const sunEl = env.sunEl;
  const moonAz = sunAz + Math.PI;
  const moonEl = -sunEl;
  const cloudLit = 0.3 + env.day * 0.7;
  const litR = (0.86 + env.dusk * 0.12) * cloudLit;
  const litG = (0.86 - env.dusk * 0.16) * cloudLit;
  const litB = (0.89 - env.dusk * 0.27) * cloudLit;
  if (cacheCols !== p.H * LAYERS.length) {
    cacheCols = p.H * LAYERS.length;
    cacheR = new Float32Array(cacheCols);
    cacheG = new Float32Array(cacheCols);
    cacheB = new Float32Array(cacheCols);
    cacheA = new Float32Array(cacheCols);
  }
  let anyCloud = false;
  for (let li = 0; li < LAYERS.length; li++) {
    const l = LAYERS[li];
    cover[li] = l && p.cam.z < l.height + (l.thickness ?? 0) ? layerCover(l, weather) : 0;
    if ((cover[li] ?? 0) > 0) anyCloud = true;
  }
  const range = SKY.cloudRange;
  const sunSize = SKY.sun.size;
  const moonSize = SKY.moon.size;
  const starCut = 1 - SKY.stars.density;
  const flash = env.flash * 120;
  for (let i = 0; i < W; i++) {
    const sx = (i + 0.5 - W * 0.5 - p.cam.shakeX) / F;
    const az = yaw + Math.atan(sx);
    const dxs = Math.cos(az);
    const dys = Math.sin(az);
    let dAzS = az - sunAz;
    dAzS = Math.atan2(Math.sin(dAzS), Math.cos(dAzS));
    let dAzM = az - moonAz;
    dAzM = Math.atan2(Math.sin(dAzM), Math.cos(dAzM));
    const sunGlowAz = Math.max(0, Math.cos(dAzS));
    const yEnd = Math.min(colTop[i] ?? 0, p.H);
    const dl = Math.sqrt(1 + sx * sx);
    for (let y = 0; y < yEnd; y++) {
      const e = (HOR - y) / F / dl;
      const el = Math.atan(e);
      const t = e <= 0 ? 0 : Math.pow(Math.min(1, e * 1.7), 0.6);
      let r = hr + (zr - hr) * t;
      let g = hg + (zg - hg) * t;
      let b = hb + (zb - hb) * t;
      if (e < 0) {
        const d = Math.min(1, -e * 3);
        r *= 1 - d * 0.25;
        g *= 1 - d * 0.22;
        b *= 1 - d * 0.18;
      }
      // Sun: wide warm glow near the horizon, tight bright disc.
      if (sunEl > -0.25) {
        const ang = Math.hypot(dAzS * Math.cos(el), el - sunEl);
        const glow = Math.pow(sunGlowAz, 8) * Math.max(0, 1 - Math.abs(el - sunEl) * 1.5) * (0.4 + env.dusk);
        r += glow * SKY.sun.glow[0];
        g += glow * SKY.sun.glow[1];
        b += glow * SKY.sun.glow[2];
        if (ang < sunSize) {
          const k = 1 - ang / sunSize;
          r += SKY.sun.disc[0] * k;
          g += SKY.sun.disc[1] * k;
          b += SKY.sun.disc[2] * k;
        }
      }
      if (moonEl > -0.05) {
        const ang = Math.hypot(dAzM * Math.cos(el), el - moonEl);
        if (ang < moonSize) {
          const crater = vnoise(dAzM * 300, el * 300, 3) * 40;
          r = SKY.moon.colour[0] - crater;
          g = SKY.moon.colour[1] - crater;
          b = SKY.moon.colour[2] - crater;
        } else if (ang < moonSize * 4) {
          const k = (1 - ang / (moonSize * 4)) * 0.25 * env.night;
          r += SKY.moon.halo[0] * k;
          g += SKY.moon.halo[1] * k;
          b += SKY.moon.halo[2] * k;
        }
      }
      if (env.stars > 0 && e > 0) {
        const hs = rhash(Math.floor(az * 260), Math.floor(el * 260), 77);
        if (hs > starCut) {
          const tw = 0.6 + 0.4 * Math.sin(time * 3 + hs * 1000);
          const s = ((hs - starCut) / (1 - starCut)) * 255 * env.stars * tw;
          r += s;
          g += s;
          b += s * 1.1;
        }
      }
      if (env.aurora > 0 && e > 0.08 && e < 1.1) {
        const band = Math.sin(az * 3 + Math.sin(az * 7 + time * 0.3) * 1.5 + time * 0.1) * 0.5 + 0.5;
        const curtain = vnoise(az * 18 + time * 0.4, el * 2, 5);
        const fade = Math.sin(((e - 0.08) / 1.02) * Math.PI);
        const a = env.aurora * Math.pow(band, 3) * curtain * fade;
        r += a * SKY.aurora.colour[0] + a * (1 - e) * SKY.aurora.edge[0];
        g += a * SKY.aurora.colour[1] + a * (1 - e) * SKY.aurora.edge[1];
        b += a * SKY.aurora.colour[2] + a * (1 - e) * SKY.aurora.edge[2];
      }
      // Cloud layers: the ray from the eye meets each layer's height; nearer (lower) layers cover farther ones.
      if (anyCloud) {
        for (let li = 0; li < LAYERS.length; li++) {
          const cv = cover[li] ?? 0;
          const l = LAYERS[li];
          if (cv <= 0 || !l) continue;
          if ((l.thickness ?? 0) > 0) {
            // A slab of cloud: marched through, lit from its base up.
            const ci = li * p.H + y;
            if ((i & 1) === 0 && (y & 1) === 0) {
              if (!slab(l, weather, cv, p.cam.x, p.cam.y, p.cam.z, dxs, dys, e, range, env.rain, sunAz, az, cloudLit, litR, litG, litB, hr, hg, hb)) slabA = 0;
              cacheR[ci] = slabR;
              cacheG[ci] = slabG;
              cacheB[ci] = slabB;
              cacheA[ci] = slabA;
            } else if ((y & 1) === 1 && (i & 1) === 0) {
              // Odd row of an even column: the row above already worked it out.
              const up = ci - 1;
              cacheR[ci] = cacheR[up] ?? 0;
              cacheG[ci] = cacheG[up] ?? 0;
              cacheB[ci] = cacheB[up] ?? 0;
              cacheA[ci] = cacheA[up] ?? 0;
            }
            // Odd columns read what the even column to their left stored for this row.
            const a = cacheA[ci] ?? 0;
            if (a > 0) {
              r += ((cacheR[ci] ?? 0) - r) * a;
              g += ((cacheG[ci] ?? 0) - g) * a;
              b += ((cacheB[ci] ?? 0) - b) * a;
            }
            continue;
          }
          if (e <= 0.01) continue;
          const tt = (l.height - p.cam.z) / e;
          if (tt > range) continue;
          const d = layerDensity(l, weather, cv, p.cam.x + dxs * tt, p.cam.y + dys * tt);
          if (d <= 0) continue;
          const far = tt / range;
          const a = d * l.opacity * Math.min(1, e * 10) * (1 - far * far);
          if (a <= 0) continue;
          const shade = 1 - l.belly * d * (0.55 + env.rain * 0.45);
          let cr = l.tint[0] * litR * shade;
          let cg = l.tint[1] * litG * shade;
          let cb = l.tint[2] * litB * shade;
          // Far clouds sink into the haze at the horizon.
          const haze = Math.min(1, far * 1.5);
          cr += (hr - cr) * haze;
          cg += (hg - cg) * haze;
          cb += (hb - cb) * haze;
          r += (cr - r) * a;
          g += (cg - g) * a;
          b += (cb - b) * a;
        }
      }
      const o = y * W + i;
      px[o] = pack(r + flash, g + flash, b + flash * 1.1);
      depth[o] = 1e9;
    }
  }
}

// Result of the last slab() call.
let slabR = 0;
let slabG = 0;
let slabB = 0;
let slabA = 0;

/**
 * Marches a ray from the eye through one thick cloud layer (a slab from `height` to `height + thickness`),
 * sampling the cloud's density in a few steps, lighting each sample from the flat dark base up to the
 * bright top and soaking the colour into the haze with distance. Returns false when the ray sees no
 * cloud. Result in slabR/G/B (colour of what it saw) and slabA (how much of the sky behind it hides).
 * `e` is the ray's rise per metre run; `(dxs, dys)` its horizontal direction.
 */
function slab(l: CloudLayerDef, w: WeatherState, cv: number, cx: number, cy: number, cz: number, dxs: number, dys: number, e: number, range: number, rain: number, sunAz: number, az: number, lit: number, litR: number, litG: number, litB: number, hr: number, hg: number, hb: number): boolean {
  const th = l.thickness ?? 0;
  const zb = l.height;
  const zt = l.height + th;
  let s0: number;
  let s1: number;
  if (e > 0.0004) {
    s0 = Math.max(0, (zb - cz) / e);
    s1 = (zt - cz) / e;
  } else if (e < -0.0004) {
    s0 = Math.max(0, (zt - cz) / e);
    s1 = (zb - cz) / e;
  } else if (cz >= zb && cz <= zt) {
    s0 = 0;
    s1 = range;
  } else return false;
  if (s1 <= s0 || s0 >= range) return false;
  if (s1 > range) s1 = range;
  // Most of the sky is clear: look at the column at the near, middle and far ends first.
  const mid = (s0 + s1) * 0.5;
  if (layerDensity(l, w, cv, cx + dxs * mid, cy + dys * mid) <= 0) {
    // A long slanting path can still clip a cloud at either end; a short one cannot.
    if (s1 - s0 < l.scale * 0.6) return false;
    if (layerDensity(l, w, cv, cx + dxs * s0, cy + dys * s0) <= 0 && layerDensity(l, w, cv, cx + dxs * s1, cy + dys * s1) <= 0) return false;
  }
  const path = (s1 - s0) * Math.sqrt(1 + e * e);
  const steps = Math.max(3, Math.min(7, Math.ceil((s1 - s0) / (l.scale * 0.5))));
  const ds = (s1 - s0) / steps;
  const len = path / steps;
  // How much cloud blocks the light per metre: a dense core is nearly opaque across its thickness.
  const kappa = (l.opacity * 3.2) / Math.max(60, th);
  let trans = 1;
  let ar = 0;
  let ag = 0;
  let ab = 0;
  // Sunlit side: clouds glow brighter looking toward the sun and thin edges let light through.
  const toSun = Math.max(0, Math.cos(az - sunAz));
  const silver = Math.pow(toSun, 6);
  for (let k = 0; k < steps; k++) {
    const s = s0 + ds * (k + 0.5);
    const z = cz + e * s;
    const hf = (z - zb) / th;
    if (hf < 0 || hf > 1) continue;
    const dens = cloudDensity3(l, w, cv, cx + dxs * s, cy + dys * s, hf);
    if (dens <= 0) continue;
    const a = 1 - Math.exp(-kappa * dens * len);
    if (a < 0.002) continue;
    // Brightness: dark flat base (heavier in storms), bright top; thin edges are lit through; the sun side glows.
    const up = hf * hf * (3 - 2 * hf);
    const dark = l.belly * (0.55 + rain * 0.45);
    const shade = (1 - dark * (1 - up) * (0.5 + 0.5 * dens)) * (1 + 0.25 * silver * (1 - dens * 0.6));
    const far = s / range;
    const haze = Math.min(1, far * 1.5);
    let cr = l.tint[0] * litR * shade;
    let cg = l.tint[1] * litG * shade;
    let cb = l.tint[2] * litB * shade;
    cr += (hr - cr) * haze;
    cg += (hg - cg) * haze;
    cb += (hb - cb) * haze;
    const wgt = trans * a;
    ar += cr * wgt;
    ag += cg * wgt;
    ab += cb * wgt;
    trans *= 1 - a;
    if (trans < 0.03) break;
  }
  const alpha = 1 - trans;
  if (alpha < 0.01) return false;
  // Inside the cloud the whole view is cloud-coloured fog; looking along the layer fades with the haze.
  slabA = alpha;
  void lit;
  slabR = ar / alpha;
  slabG = ag / alpha;
  slabB = ab / alpha;
  return true;
}
