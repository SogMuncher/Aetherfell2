// Checks every art recipe (creatures, trees, props): known colour slots, parents and features, sane gait
import { colourProblem } from './palettes';
import type { ArtDef, ArtId, ArtPart, PaletteDef, PaletteId } from '../types';

/** Problems in the art table, for validateContent(). `extraFeatures` are ones a role's dress may give. */
export function artProblems(art: Readonly<Record<ArtId, ArtDef>>, extraFeatures: readonly string[], palettes?: Readonly<Record<PaletteId, PaletteDef>>): string[] {
  const out: string[] = [];
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const [id, d] of Object.entries(art)) {
    const w = `art '${id}'`;
    const features = new Set([...extraFeatures, ...Object.keys(d.features ?? {})]);
    for (const [slot, list] of Object.entries(d.colors)) {
      if (!list.length) out.push(`${w}: colour slot '${slot}' has no choices`);
      for (const c of list) {
        const why = colourProblem(c, palettes);
        if (why) out.push(`${w}: in '${slot}', ${why}`);
      }
    }
    if (!d.parts.length) out.push(`${w}: has no parts`);
    const ids = new Set<string>();
    const all: ArtPart[] = [];
    const walk = (p: ArtPart): void => {
      all.push(p);
      if (p.id) ids.add(p.id);
      for (const c of p.children ?? []) walk(c);
    };
    for (const p of d.parts) walk(p);
    for (const p of all) {
      if (p.parent && !ids.has(p.parent)) out.push(`${w}: unknown parent part '${p.parent}'`);
      if ((p.id || p.parent || p.pivot || p.stride || p.mirror) && !p.at) out.push(`${w}: a joint part needs a fixed spot (at)`);
      if (!hex.test(p.color) && !(p.color in d.colors)) out.push(`${w}: unknown colour slot '${p.color}'`);
      const f = p.feature?.replace(/^!/, '');
      if (f && !features.has(f)) out.push(`${w}: unknown feature '${f}'`);
    }
    if (d.gait && !(d.gait.stride > 0)) out.push(`${w}: gait stride must be above 0`);
  }
  return out;
}
