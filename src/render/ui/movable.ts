// Windows you drag by their title bar: kept on screen, told where they ended up so they can remember it
import type { Spot } from './bagParts';

/** Lets `el` be dragged by `handle`; `at` is where it starts (null = where its style puts it). `moved` hears each drop. */
export function makeMovable(el: HTMLElement, handle: HTMLElement, at: Spot | null, moved: (at: Spot) => void): void {
  let win = at;
  const place = (): void => {
    if (!win) return;
    const w = el.offsetWidth || 320;
    const h = el.offsetHeight || 320;
    el.style.left = `${Math.max(0, Math.min(window.innerWidth - w, win.x))}px`;
    el.style.top = `${Math.max(0, Math.min(window.innerHeight - h, win.y))}px`;
    el.style.right = 'auto';
    el.style.transform = 'none';
  };
  let grab: { id: number; ox: number; oy: number } | null = null;
  handle.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || (ev.target instanceof Element && ev.target.closest('button'))) return;
    const r = el.getBoundingClientRect();
    grab = { id: ev.pointerId, ox: ev.clientX - r.left, oy: ev.clientY - r.top };
    handle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!grab || grab.id !== ev.pointerId) return;
    win = { x: ev.clientX - grab.ox, y: ev.clientY - grab.oy };
    place();
  });
  const end = (ev: PointerEvent): void => {
    if (!grab || grab.id !== ev.pointerId) return;
    grab = null;
    if (win) moved(win);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  window.addEventListener('resize', place);
  place();
}
