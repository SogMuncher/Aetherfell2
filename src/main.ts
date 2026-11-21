/**
 * Aetherfell 2 — the single place where everything is wired together:
 *   input → sim (or a replica of the host's sim when you are a guest) → net / audio / render.
 */
import { InputSystem } from './input';
import { CONTENT, itemDef } from './content';
import { applySharedLog } from './net/messages';
import { GuestView } from './net/prediction';
import type { UiAction } from './input';
import { Simulation, createState, loadFromBrowser, saveToBrowser } from './sim';
import { NetSession } from './net';
import { GameAudio } from './audio';
import { Renderer, GameUI } from './render';
import { AdaptiveRes } from './render/adaptiveRes';
import type { MenuAction } from './render';
import { SettingsStore } from './settings';
import type { BodyRegionId, CheatValue, Command, EntitySnapshot, ItemId, RuneId, SimEvent, ThrowAim } from './types';
import { startTicker } from './clock';
import { TICK_DT } from './types';

const TICK_MS = TICK_DT * 1000;
const SNAP_MS = TICK_MS * 2;

const canvas = document.getElementById('screen');
const uiRoot = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) throw new Error('missing #screen or #ui');

const input = new InputSystem(canvas, CONTENT.rules.quickUse);
const audio = new GameAudio();
const net = new NetSession();
const settings = new SettingsStore();

/** The world we draw. Solo/host: the real sim. Guest: a replica updated from the host. */
let sim = new Simulation(createState(Math.floor(Math.random() * 1e9)));
let renderer = new Renderer(canvas, sim.sampler, sim.tiles);
let localPlayerId = 'local';
let running = false;
let guestSnapAt = 0;
net.timeout = CONTENT.rules.coop.timeout;
/** When the world was last saved by itself (ms). */
let autosavedAt = performance.now();

const ui = new GameUI(
  uiRoot,
  {
    use: (id: ItemId) => input.queueUse(id),
    drop: (id: ItemId) => input.queueDrop(id),
    throwItem: (aim: ThrowAim) => input.queueThrow(aim),
    pickUp: (entity: number) => input.queuePickUp(entity),
    wear: (id: ItemId) => input.queueWear(id),
    wearFrom: (entity: number) => input.queueWearFrom(entity),
    remove: (region: BodyRegionId) => input.queueRemove(region),
    choose: (i: number) => input.queueChoice(i),
    prepare: (runes: readonly RuneId[]) => {
      input.queuePrepare(runes);
      ui.toggle('escape');
      void canvas?.requestPointerLock();
    },
    menu: (a: MenuAction, name: string, code: string) => startGame(a, name, code),
    cheat: (id: string, value: CheatValue) => requestCheat(id, value),
  },
  () => sim.terrain,
  hasSave(),
  settings,
);
input.mouse.wantsLock = () => running && !ui.blocking;
/** Escape while the mouse is captured frees it in the browser: treat that as "open the settings". */
let unlockedAt = -1e9;
input.mouse.onUnlock = () => {
  if (!running || ui.blocking) return;
  unlockedAt = performance.now();
  ui.toggle('settings');
};

function hasSave(): boolean {
  try {
    return localStorage.getItem('aetherfell2.save') !== null;
  } catch {
    return false;
  }
}

function replaceSim(next: Simulation): void {
  sim = next;
  renderer.dispose();
  renderer = new Renderer(canvas as HTMLCanvasElement, sim.sampler, sim.tiles);
  applySettings();
}

/** Hands the remembered settings to sound, view and controls (on start and on every change). */
const adaptiveRes = new AdaptiveRes();
function applySettings(): void {
  audio.setMix({
    master: settings.num('masterVolume') / 100,
    music: settings.num('musicVolume') / 100,
    effects: settings.num('effectsVolume') / 100,
    ambience: settings.num('ambienceVolume') / 100,
  });
  const mood = settings.str('musicMood');
  audio.setMusicMood(mood === 'follow' ? null : mood);
  renderer.options = {
    shake: settings.bool('screenShake'),
    bob: settings.bool('headBob'),
    fovDegrees: settings.num('fieldOfView'),
    colourLevels: settings.num('colours') || 24,
    gpu: settings.str('renderer') === 'gpu',
  };
  renderer.terrain.setMaxDistance(settings.num('renderDistance') * 1000);
  applyResolution(0);
  input.mouse.sensitivity = 0.0022 * (settings.num('mouseSensitivity') / 100);
  input.mouse.invertY = settings.bool('invertMouse');
  input.turnSpeed = settings.num('turnSpeed') / 100;
  ui.setDebug(settings.bool('showFps'));
  audio.setPresent(!settings.bool('muteInBackground') || (document.visibilityState === 'visible' && document.hasFocus()));
}
settings.onChange(() => applySettings());
applySettings();
for (const ev of ['blur', 'focus', 'visibilitychange'] as const) {
  (ev === 'visibilitychange' ? document : window).addEventListener(ev, () => applySettings());
}

/**
 * Debug cheats from the settings menu. They are commands like everything else: solo and host
 * run them in their own sim; a guest asks the host, whose settings decide.
 */
function requestCheat(cheat: string, value: CheatValue): void {
  if (!running) return;
  if (net.status.role === 'guest') {
    ui.line(net.sendCheat(cheat, value) ? 'Asked the host. If nothing happens, they have not allowed cheats for friends.' : 'Not connected to the host.');
    return;
  }
  sim.enqueue({ type: 'cheat', playerId: localPlayerId, cheat, value });
}

/** Host: a friend asked for a cheat. */
function guestCheat(c: Extract<Command, { type: 'cheat' }>): void {
  if (settings.bool('allowGuestCheats')) sim.enqueue(c);
}

function localEntityId(): number | null {
  return sim.state.players[localPlayerId] ?? null;
}

function startGame(action: MenuAction, name: string, code: string): void {
  audio.start();
  if (action === 'join') {
    if (!code) return;
    net.join(code, name, {
      welcome: (playerId, save) => {
        const s = Simulation.fromSave(save);
        if (!s) return;
        localPlayerId = playerId;
        view.reset();
        replaceSim(s);
        running = true;
      },
      shared: (log) => applySharedLog(sim.state, log),
      snapshot: (snap) => applySnapshot(snap),
      events: (events) => {
        for (const e of events) {
          if (e.type === 'realmChanged') sim.followRealm(e.realm);
          else if (e.type === 'tileChanged') sim.tiles.setCell(e.x, e.y, e.cell);
          else if (e.type === 'volumeChanged') sim.state.volume.importBrick(e.brick);
        }
        react(events);
      },
    });
    ui.closeMenu();
    void canvas?.requestPointerLock();
    return;
  }
  if (action === 'continue') {
    const s = loadFromBrowser((seed, cx, cy, realm) => Simulation.regenChunk(seed, cx, cy, realm), () => Simulation.newVolume());
    if (s) {
      replaceSim(new Simulation(s));
      sim.parkPlayers();
    }
  }
  localPlayerId = 'local';
  autosavedAt = performance.now();
  sim.enqueue({ type: 'join', playerId: 'local', name });
  if (action === 'host') net.startHost((c) => sim.enqueue(c), () => sim.save(), guestCheat);
  running = true;
  ui.closeMenu();
  void canvas?.requestPointerLock();
}

/** Guest: adopt the host's entities (and replay our own unanswered inputs on top). */
function applySnapshot(snap: EntitySnapshot): void {
  if (view.adopt(sim, localPlayerId, snap)) guestSnapAt = performance.now();
}

function react(events: SimEvent[]): void {
  const me = localEntityId();
  for (const e of events) {
    renderer.onEvent(e, sim.state, me);
    audio.onEvent(e, sim.state, me);
    ui.onEvent(e, me, sim.state);
  }
}

function handleUi(actions: UiAction[]): void {
  for (const a of actions) {
    if (a === 'save') {
      if (net.status.role === 'guest') ui.line('Only the host can save the world.');
      else ui.line(saveToBrowser(sim.state) ? 'World saved.' : 'Could not save.');
    } else if (a === 'load') {
      if (net.status.role !== 'solo') {
        ui.line('Loading is only possible in solo play.');
        continue;
      }
      const s = loadFromBrowser((seed, cx, cy, realm) => Simulation.regenChunk(seed, cx, cy, realm), () => Simulation.newVolume());
      if (s) {
        replaceSim(new Simulation(s));
        sim.parkPlayers();
        sim.enqueue({ type: 'join', playerId: localPlayerId, name: 'Wanderer' });
        ui.line('World loaded.');
      } else ui.line('No save found.');
    } else if (a === 'host') {
      // reserved
    } else if (a === 'debug') {
      // F3 and the Video setting are the same switch.
      settings.set('showFps', !settings.bool('showFps'));
    } else if (a === 'escape' && performance.now() - unlockedAt < 400) {
      // This Escape already freed the mouse and opened the settings (see below).
    } else {
      ui.toggle(a);
      if (ui.blocking) input.mouse.release();
    }
  }
}

/** Solo or host: save now and then, as the settings ask (never as a guest: the world is the host's). */
function autosave(now: number): void {
  if (!running || net.status.role === 'guest') return;
  const minutes = Number(settings.str('autosave')) || 0;
  if (minutes <= 0 || now - autosavedAt < minutes * 60_000) return;
  autosavedAt = now;
  if (saveToBrowser(sim.state)) ui.line('World saved.');
  else ui.line('Could not save the world (browser storage may be full).');
}
// Closing or hiding the game saves too, so a closed tab never loses the session.
window.addEventListener('pagehide', () => {
  if (running && net.status.role !== 'guest' && (Number(settings.str('autosave')) || 0) > 0) saveToBrowser(sim.state);
});

let last = performance.now();
let acc = 0;
let fps = 60;
/** The world's own clock: when it last advanced (ms), and when the latest tick ran (for smooth drawing). */
let clockAt = performance.now();
let tickedAt = performance.now();
/** Guest: our own foreseen movement over the host's updates. */
const view = new GuestView();

/**
 * Advances the world in fixed 50 ms ticks by the real clock. Called by the background-proof ticker
 * and at the start of every drawn frame, so it neither waits for drawing nor stops in a hidden tab.
 * Solo/host: run the real sim. Guest: send the input and move ourselves straight away (predict).
 */
function stepWorld(): void {
  const now = performance.now();
  const dtMs = Math.min(250, now - clockAt);
  clockAt = now;
  if (!running) return;
  acc += dtMs;
  let steps = 0;
  while (acc >= TICK_MS && steps < 5) {
    acc -= TICK_MS;
    steps++;
    tickedAt = now;
    const snap = input.snapshot(ui.blocking && !input.dialogueOpen);
    if (net.status.role === 'guest') {
      net.sendInput(snap);
      view.tick(sim, localPlayerId, snap);
    } else {
      sim.enqueue({ type: 'input', playerId: localPlayerId, input: snap });
      const events = sim.step();
      net.broadcast(sim.state, events);
      react(events);
    }
  }
  if (acc > TICK_MS * 5) acc = 0;
}
startTicker(stepWorld);
/** Guest: when we last forgot far-away land (ms). */
let trimmedAt = 0;

/** Pixel size: the chosen detail, lowered on the fly when frames run slow (setting 'adaptive' = wished fps, 0 = off). */
function applyResolution(dt: number): void {
  const maxLines = settings.num('resolution') || 200;
  const lines = adaptiveRes.update(dt, maxLines, settings.num('adaptive'));
  if (renderer.viewport.height !== lines) renderer.viewport.setTargetHeight(lines);
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) applyResolution(dt);
  fps = fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
  input.dialogueOpen = (() => {
    const id = localEntityId();
    return id !== null && (sim.state.entities.get(id)?.player?.dialogue ?? null) !== null;
  })();
  const uiActions = input.poll();
  if (running) handleUi(uiActions);

  stepWorld();
  if (running) {
    autosave(now);
    if (net.status.role === 'guest' && now - trimmedAt > 5000) {
      trimmedAt = now;
      const id = localEntityId();
      const self = id !== null ? sim.state.entities.get(id) : undefined;
      if (self) sim.trimAround(self.pos.x, self.pos.y);
    }
  }

  const me = localEntityId();
  const meEntity = me !== null ? (sim.state.entities.get(me) ?? null) : null;
  const guest = net.status.role === 'guest';
  const sinceTick = Math.min(1, Math.max(0, (now - tickedAt) / TICK_MS));
  const alpha = guest ? Math.min(1, (now - guestSnapAt) / SNAP_MS) : sinceTick;
  const menuYaw = now * 0.00004;
  renderer.render({ state: sim.state, tiles: sim.tiles, localId: me, alpha, selfAlpha: sinceTick, yaw: running ? input.mouse.yaw : menuYaw, pitch: running ? input.mouse.pitch : -0.05, dt });
  audio.update(sim.state, sim.tiles, meEntity, dt);
  const st = renderer.stats;
  ui.update({
    state: sim.state,
    local: meEntity,
    net: net.status,
    proj: renderer.lastProjection,
    quick: input.quick.slots,
    fps,
    debug: meEntity
      ? `pos ${meEntity.pos.x.toFixed(1)}, ${meEntity.pos.y.toFixed(1)}  z ${meEntity.z.toFixed(1)}\ntick ${sim.state.tick}  entities ${sim.state.entities.size}\nchunks ${sim.state.chunks.size}  lod blocks ${renderer.terrain.lod.size}\nburning ${sim.state.burning.size}  wet ${sim.state.weather.wetness.toFixed(2)}\nframe ${st.totalMs.toFixed(1)}ms  gpu ${st.gpuMs.toFixed(1)}  terrain ${st.terrainMs.toFixed(1)}  sprites ${st.spritesMs.toFixed(1)}`
      : '',
  });
  requestAnimationFrame(frame);
}

input.pickedItem = () => ui.pickedItem();
input.onQuickSet = (key, id) => ui.line(`Key ${key}: ${itemDef(CONTENT, id)?.name ?? id}`);

// Expose a tiny handle for debugging in the console (read-only use).
(window as unknown as { aetherfell: { sim: () => Simulation; input: InputSystem } }).aetherfell = { sim: () => sim, input };

requestAnimationFrame(frame);
