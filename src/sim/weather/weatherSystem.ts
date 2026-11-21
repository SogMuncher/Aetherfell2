import type { Entity, SimContext, SimSystem } from '../../types';
import { TICK_RATE } from '../../types';
import { nightFalls, rainAt, sunHeight } from '../../content';

/** One in-game day lasts this many real seconds. */

/** Sun and moon, drifting wind, rain fronts that soak the land, thunder, and auroras on clear nights. */
export const weatherSystem: SimSystem = (ctx: SimContext) => {
  const { state, rng } = ctx;
  const w = state.weather;
  const before = w.time;
  const day = ctx.content.rules.day;
  w.time += 1 / (day.minutes * 60 * TICK_RATE);
  if (w.time >= 1) {
    w.time -= 1;
    w.day++;
  }
  // Nightfall: will tonight have an aurora?
  if (nightFalls(day, before, w.time)) w.aurora = w.cloud < 0.45 && rng.chance(0.5) ? rng.range(0.4, 1) : 0;

  if (--w.nextShift <= 0) {
    w.nextShift = Math.round(rng.range(90, 300) * TICK_RATE);
    const storm = rng.chance(0.28);
    w.rainTarget = storm ? rng.range(0.4, 1) : 0;
    const a = rng.range(0, Math.PI * 2);
    const sp = storm ? rng.range(4, 11) : rng.range(0.5, 6);
    w.windTarget = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
    ctx.emit({ type: 'weatherShift', rain: w.rainTarget, wind: sp });
  }
  // The wind carries the clouds; everyone's sky is drawn from how far they have come.
  const drift = w.drift ?? { x: 0, y: 0 };
  drift.x += w.wind.x * ctx.dt;
  drift.y += w.wind.y * ctx.dt;
  w.drift = drift;
  const k = 0.0015;
  w.rain += (w.rainTarget - w.rain) * k;
  w.wind.x += (w.windTarget.x - w.wind.x) * k * 2;
  w.wind.y += (w.windTarget.y - w.wind.y) * k * 2;
  const cloudTarget = Math.min(1, w.rainTarget * 1.2 + 0.15);
  w.cloud += (cloudTarget - w.cloud) * k;
  if (w.rain > 0.15) w.wetness = Math.min(1, w.wetness + w.rain * 0.0009);
  else {
    const sun = Math.max(0, sunHeight(day, w.time));
    w.wetness = Math.max(0, w.wetness - 0.00008 - sun * 0.00025);
  }

  if (w.rain > 0.7 && rng.chance(0.0025)) {
    const players = Object.values(state.players).map((id) => state.entities.get(id)).filter((e): e is Entity => !!e);
    const p = players.length ? rng.pick(players) : null;
    // Thunder rolls only where a storm cell is overhead or close by.
    const stormy = p ? Math.max(rainAt(ctx.content.sky, w, p.pos.x, p.pos.y), rainAt(ctx.content.sky, w, p.pos.x + 1500, p.pos.y), rainAt(ctx.content.sky, w, p.pos.x - 1500, p.pos.y), rainAt(ctx.content.sky, w, p.pos.x, p.pos.y + 1500), rainAt(ctx.content.sky, w, p.pos.x, p.pos.y - 1500)) : 0;
    if (p && stormy > 0.3) ctx.emit({ type: 'thunder', x: p.pos.x + rng.range(-300, 300), y: p.pos.y + rng.range(-300, 300) });
  }
};
