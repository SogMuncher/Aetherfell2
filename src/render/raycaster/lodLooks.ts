import type { BiomeId, RGB } from '../../types';
import { CONTENT } from '../../content';
import { TILES } from '../../content/tiles';
import { surfaceTexture } from '../materials';


/** How a biome looks from far away, worked out once from its data. */
export interface BiomeLook {
  far: RGB;
  tree: RGB;
  canopy: number;
  bareSlopes: boolean;
  water: boolean;
}

export function key(level: number, bx: number, by: number): number {
  return (level * 65536 + (bx + 32768)) * 65536 + (by + 32768);
}

export function unpackRGB(c: number): RGB {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
}

/** Far colour of every tile code: its own `far`, else the average of its floor surface. */
export let farTable: Float32Array | null = null;
export function farColours(): Float32Array {
  if (farTable) return farTable;
  const t = new Float32Array(256 * 3).fill(100);
  for (const info of Object.values(TILES)) {
    const c = info.far ?? unpackRGB(surfaceTexture(info.floor).avg);
    t[info.code * 3] = c[0];
    t[info.code * 3 + 1] = c[1];
    t[info.code * 3 + 2] = c[2];
  }
  farTable = t;
  return t;
}

export const looks = new Map<BiomeId, BiomeLook>();
export function biomeLook(id: BiomeId): BiomeLook {
  const hit = looks.get(id);
  if (hit) return hit;
  const def = CONTENT.biomes[id];
  const groundCode = def ? (CONTENT.tileIds[def.ground] ?? 0) : 0;
  const far = farColours();
  const tileRGB = (code: number): RGB => [far[code * 3] ?? 100, far[code * 3 + 1] ?? 100, far[code * 3 + 2] ?? 100];
  const treeCode = def?.trees ? (CONTENT.tileIds[def.trees.tile] ?? 0) : -1;
  const look: BiomeLook = {
    far: def?.far ?? tileRGB(groundCode),
    tree: treeCode >= 0 ? tileRGB(treeCode) : [40, 74, 34],
    canopy: def?.canopy ?? 60,
    bareSlopes: def?.bareSlopes ?? true,
    water: TILES[groundCode]?.liquid ?? false,
  };
  looks.set(id, look);
  return look;
}
