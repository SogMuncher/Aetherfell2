import type { MatterAccess, MatterField, SimState, TileInfo, TileKind } from '../../types';
import { GROUND_Z, packKey, spotKey, unpackKey } from '../../types';
import { TILES } from '../../content/tiles';
import type { WorldTiles } from './worldTiles';
import type { VolumeStore } from './volume';

/**
 * The one door to "stuff at a place" (see types/matter.ts). Wraps the tile map and the 3D layer so
 * fire, rain, frost, oil, soot and blows treat a timber wall, a thatched roof and a patch of dry
 * grass by the same rules. Pure plumbing: all numbers live in content (materials, tiles, rules).
 */
export class Matter implements MatterAccess {
  constructor(
    private readonly state: SimState,
    private readonly tiles: WorldTiles,
  ) {}

  /** The 3D layer of the realm the party is in right now. */
  private get vol(): VolumeStore {
    return this.state.volume as VolumeStore;
  }

  info(x: number, y: number, z: number): TileInfo | null {
    if (z === GROUND_Z) return this.tiles.info(x, y);
    if (this.vol.shapeAt(x, y, z) === 0) return null;
    return TILES[this.vol.matAt(x, y, z)] ?? null;
  }

  kind(x: number, y: number, z: number): TileKind | -1 {
    if (z === GROUND_Z) return this.tiles.kind(x, y);
    return this.vol.shapeAt(x, y, z) === 0 ? -1 : this.vol.matAt(x, y, z);
  }

  solid(x: number, y: number, z: number): boolean {
    return z !== GROUND_Z && this.vol.shapeAt(x, y, z) !== 0;
  }

  get(field: MatterField, x: number, y: number, z: number): number {
    if (z === GROUND_Z) {
      switch (field) {
        case 'wet': return this.tiles.wet(x, y);
        case 'fire': return this.tiles.fire(x, y);
        case 'oil': return this.tiles.oil(x, y);
        case 'soot': return this.tiles.soot(x, y);
        case 'fuel': return this.tiles.fuel(x, y);
        case 'wear': return this.state.tileWear.get(packKey(x, y)) ?? 0;
      }
    }
    switch (field) {
      case 'fuel': {
        const inf = this.info(x, y, z);
        return inf ? Math.max(0, inf.fuel - this.vol.cellGet('spent', x, y, z)) : 0;
      }
      case 'wear': return this.vol.cellGet('wear', x, y, z);
      default: return this.vol.cellGet(field, x, y, z);
    }
  }

  set(field: MatterField, x: number, y: number, z: number, v: number): void {
    if (z === GROUND_Z) {
      switch (field) {
        case 'wet':
          this.tiles.setWet(x, y, v);
          if (v > 0) this.state.damp.add(packKey(x, y));
          else this.state.damp.delete(packKey(x, y));
          return;
        case 'fire': this.tiles.setFire(x, y, v); return;
        case 'oil': this.tiles.setOil(x, y, v); return;
        case 'soot': this.tiles.setSoot(x, y, v); return;
        case 'fuel': this.tiles.setFuel(x, y, v); return;
        case 'wear':
          if (v <= 0) this.state.tileWear.delete(packKey(x, y));
          else this.state.tileWear.set(packKey(x, y), v);
          return;
      }
    }
    switch (field) {
      case 'fuel': {
        const inf = this.info(x, y, z);
        if (inf) this.vol.cellSet('spent', x, y, z, inf.fuel - v);
        return;
      }
      case 'wear':
        this.vol.cellSet('wear', x, y, z, v);
        return;
      default:
        this.vol.cellSet(field, x, y, z, v);
    }
  }

  setKind(x: number, y: number, z: number, kind: TileKind): void {
    if (z === GROUND_Z) {
      this.tiles.setKind(x, y, kind);
      return;
    }
    const shape = this.vol.shapeAt(x, y, z);
    if (shape === 0) return;
    const to = TILES[kind];
    if (to && (to.shape === 'block' || to.shape === 'door')) {
      this.vol.set(x, y, z, shape, kind);
      this.set('fuel', x, y, z, to.fuel);
      return;
    }
    // It is gone. What it left behind lies where it stood, if it stood on the ground.
    this.vol.set(x, y, z, 0, 0);
    if (to && z === Math.floor(this.tiles.ground(x + 0.5, y + 0.5)) && !this.tiles.info(x, y).liquid) this.tiles.setKind(x, y, kind);
  }

  exposed(x: number, y: number, z: number): boolean {
    return z === GROUND_Z ? this.vol.openSky(x, y, this.tiles.ground(x + 0.5, y + 0.5)) : this.vol.openSky(x, y, z + 1);
  }

  wetness(x: number, y: number, z: number): number {
    return this.get('wet', x, y, z) + (this.exposed(x, y, z) ? this.state.weather.wetness * 255 : 0);
  }

  forNeighbours(x: number, y: number, z: number, fn: (x: number, y: number, z: number, weight: number) => void): void {
    const vol = this.vol;
    const hasCells = vol.bricks.size > 0;
    if (z === GROUND_Z) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          fn(x + dx, y + dy, GROUND_Z, 1);
        }
      }
      if (hasCells) {
        // Flames lick the walls and floors standing on the ground here and next door.
        const gz = Math.floor(this.tiles.ground(x + 0.5, y + 0.5));
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = 0; dz <= 2; dz++) {
              if (vol.shapeAt(x + dx, y + dy, gz + dz) !== 0) fn(x + dx, y + dy, gz + dz, dz === 2 ? 0.5 : 0.9);
            }
          }
        }
      }
      return;
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (n === 0 || n === 3) continue;
          if (vol.shapeAt(x + dx, y + dy, z + dz) === 0) continue;
          // Fire climbs; it creeps down reluctantly; along an edge it is weaker than across a face.
          const base = dz > 0 ? 1.5 : dz < 0 ? 0.4 : 1;
          fn(x + dx, y + dy, z + dz, n === 1 ? base : base * 0.5);
        }
      }
    }
    // A cell at ground level shares fire with the ground tiles around its foot.
    const gz = Math.floor(this.tiles.ground(x + 0.5, y + 0.5));
    if (z === gz || z === gz - 1) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (z === gz || (dx === 0 && dy === 0)) fn(x + dx, y + dy, GROUND_Z, 0.8);
    }
  }

  cellAt(x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    if (this.vol.bricks.size === 0) return null;
    if (!this.vol.solidBetween(x, y, z - 0.01, z + 0.01)) return null;
    return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
  }

  burning(): number[] {
    const out: number[] = [];
    for (const k of this.state.burning) {
      const t = unpackKey(k);
      out.push(spotKey(t.x, t.y, GROUND_Z));
    }
    for (const k of this.vol.burningCells) out.push(k);
    return out;
  }

  damp(): number[] {
    const out: number[] = [];
    for (const k of this.state.damp) {
      const t = unpackKey(k);
      out.push(spotKey(t.x, t.y, GROUND_Z));
    }
    for (const k of this.vol.dampCells) out.push(k);
    return out;
  }

  worn(): number[] {
    const out: number[] = [];
    for (const k of this.state.tileWear.keys()) {
      const t = unpackKey(k);
      out.push(spotKey(t.x, t.y, GROUND_Z));
    }
    for (const k of this.vol.wornCells) out.push(k);
    return out;
  }

  count(): { burning: number; damp: number } {
    return { burning: this.state.burning.size + this.vol.burningCells.size, damp: this.state.damp.size + this.vol.dampCells.size };
  }
}
