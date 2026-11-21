/**
 * A steady beat that keeps going when the page is in the background. Browsers stop drawing
 * (requestAnimationFrame) in hidden tabs and slow plain timers to about once a second, which used to
 * freeze the host's world for everyone. A tiny worker's timer is not slowed like that, so it wakes the
 * page every few milliseconds and the simulation keeps its 20 steps a second. Drawing stays on
 * requestAnimationFrame. Falls back to a plain timer where workers are not allowed.
 */
export function startTicker(beat: () => void, everyMs = 15): () => void {
  try {
    const src = `let t=setInterval(()=>postMessage(0),${everyMs});onmessage=()=>{clearInterval(t);close()}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = () => beat();
    return () => w.postMessage(0);
  } catch {
    const t = setInterval(beat, everyMs);
    return () => clearInterval(t);
  }
}
