import type { Pt, SiteLayout } from './sites';

/**
 * Says which street ends of a walled place roads really use (set by roads.ts, which knows the land). A gate opens in
 * the wall only where a road runs out of it; null = not known (every dry gate opens).
 * Lives in its own file with no imports of substance: sites.ts and roads.ts import each other through other files, and a
 * variable inside sites.ts is not ready yet when roads.ts registers its rule (the bundled game died at start-up).
 */
export type GateRule = (seed: number, site: SiteLayout) => Pt[] | null;
export const gateRule: { current: GateRule | null } = { current: null };
export function setGateRule(f: GateRule): void {
  gateRule.current = f;
}
