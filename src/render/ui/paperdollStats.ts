import type { DamageKind, Entity } from '../../types';
import { DAMAGE_KINDS } from '../../types';
import { CONTENT, gearCondition, gearEffect, itemDef, skillXp, stackWeight, thingDef, weaponStats, wornWeight } from '../../content';

/** The side of the "you" window: health, protection, stats, what is in your hands, skills, afflictions. */

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

export function dollStats(e: Entity): string {
  const p = e.player;
  if (!p) return '';
  const def = thingDef(CONTENT, e.def);
  const worn = e.worn ?? {};
  const bar = (cls: string, v: number, max: number, label: string): string => `<div class="doll-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%"></i><span>${label} ${Math.ceil(v)} / ${Math.round(max)}</span></div>`;
  // Protection: what each body part turns off a blow, and the kinds of harm that worn pieces change.
  const base = def.health?.armor ?? 0;
  const parts: string[] = [];
  const harm: Partial<Record<DamageKind, number>> = {};
  for (const [region, rd] of Object.entries(CONTENT.gear.regions)) {
    if (!def.wears?.includes(region)) continue;
    const id = worn[region];
    const item = id ? itemDef(CONTENT, id) : undefined;
    const a = item?.armour;
    const val = base + (item && a ? a.armor * gearEffect(CONTENT.gear, item) : 0);
    parts.push(`<div class="${a ? '' : 'dim'}">${esc(rd.name)} <b>${val.toFixed(1)}</b> ${item && a ? `· ${esc(item.name)} <small class="dim">(${gearCondition(item)})</small>` : '· nothing worn'}</div>`);
    if (a) for (const k of DAMAGE_KINDS) if (a.resist[k] !== undefined) harm[k] = (harm[k] ?? 1) * (a.resist[k] ?? 1);
  }
  const kinds = Object.entries(harm).filter(([, v]) => Math.abs((v ?? 1) - 1) > 0.01).map(([k, v]) => `${k} ${(v ?? 1) < 1 ? '−' : '+'}${Math.round(Math.abs(1 - (v ?? 1)) * 100)}%`);
  const wpn = e.actor ? weaponStats(CONTENT, def, e.actor.weapon) : null;
  const held = e.actor?.weapon ? itemDef(CONTENT, e.actor.weapon) : undefined;
  const hand = wpn ? `In hands: ${esc(wpn.name)} · ${wpn.damage} ${wpn.kind}${held ? ` · ${held.wear}/${held.durability} blows left` : ''}` : 'In hands: nothing (bare fists)';
  const skills = Object.entries(p.skills)
    .map(([k, s]) => `<div class="doll-skill"><span>${esc(k)} ${s.level}</span><i><b style="width:${Math.min(100, (100 * s.xp) / skillXp(s.level))}%"></b></i></div>`)
    .join('');
  const afflictions = Object.entries(e.status)
    .filter(([, t]) => t > 0)
    .map(([id, t]) => `<span class="doll-status">${esc(CONTENT.statuses[id]?.name ?? id)} <small>${Math.ceil(t / 20)}s</small></span>`)
    .join('');
  const load = stackWeight(p.inventory) + wornWeight(CONTENT, e.worn);
  const limit = 30 + p.stats.might * 4;
  return `<div class="doll-name">${esc(p.name)}</div>
    ${bar('hp', e.hp, e.maxHp, 'Health')}${bar('st', p.stamina, p.maxStamina, 'Stamina')}${bar('mp', p.mana, p.maxMana, 'Aether')}
    <h3>Protection</h3><div class="doll-parts">${parts.join('')}</div>
    ${kinds.length ? `<div class="dim">Harm taken: ${esc(kinds.join(', '))}</div>` : ''}
    <h3>Stats</h3><div>Might ${p.stats.might} · Grace ${p.stats.grace} · Will ${p.stats.will}</div>
    <div class="dim">${esc(hand)}</div>
    <div class="${load > limit ? 'heavy' : 'dim'}">Load ${load.toFixed(1)} / ${limit} kg</div>
    <h3>Skills</h3>${skills}
    <h3>Afflictions</h3><div>${afflictions || '<span class="dim">none</span>'}</div>`;
}
