/** Live ground cell state for the GPU terrain: soot, wet, oil and fire per cell (r,g,b,a), uploaded for the finest levels. */
import { CHUNK_SIZE } from '../../types';
import type { ReadonlyTiles } from '../../types';

export interface StateLevel {
  ox: number;
  oy: number;
  cs: number;
  st: Uint8Array;
  stTex: WebGLTexture;
  stDirty: boolean;
}

/** Reads the loaded chunks under a level's cells and uploads them (nothing is sent while the ground is clean and stays clean). */
export function refreshGroundState(gl: WebGL2RenderingContext, tiles: ReadonlyTiles, l: StateLevel, V: number): void {
  let any = false;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = Math.floor(l.ox + i * l.cs);
      const y = Math.floor(l.oy + j * l.cs);
      const ch = tiles.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
      const k = (j * V + i) * 4;
      if (!ch) {
        l.st[k] = l.st[k + 1] = l.st[k + 2] = l.st[k + 3] = 0;
        continue;
      }
      const q = (y - ch.cy * CHUNK_SIZE) * CHUNK_SIZE + (x - ch.cx * CHUNK_SIZE);
      const a = ch.soot[q] ?? 0;
      const b = ch.wet[q] ?? 0;
      const c = ch.oil[q] ?? 0;
      const d = ch.fire[q] ?? 0;
      l.st[k] = a;
      l.st[k + 1] = b;
      l.st[k + 2] = c;
      l.st[k + 3] = d;
      if (a | b | c | d) any = true;
    }
  }
  if (!any && !l.stDirty) return;
  l.stDirty = any;
  gl.bindTexture(gl.TEXTURE_2D, l.stTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, V, V, gl.RGBA, gl.UNSIGNED_BYTE, l.st);
}
