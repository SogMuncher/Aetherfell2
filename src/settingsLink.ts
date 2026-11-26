// Hands the remembered settings to sound, view and controls (on start and on every change), and sizes the view's pixels.
import type { GameAudio } from './audio';
import type { InputSystem } from './input';
import type { GameUI, Renderer } from './render';
import { AdaptiveRes } from './render/adaptiveRes';
import type { SettingsStore } from './settings';

export class SettingsLink {
  private readonly adaptiveRes = new AdaptiveRes();

  /** `renderer` is asked each time: a new world brings a new renderer. */
  constructor(
    private readonly settings: SettingsStore,
    private readonly audio: GameAudio,
    private readonly input: InputSystem,
    private readonly ui: GameUI,
    private readonly renderer: () => Renderer,
  ) {
    settings.onChange(() => this.apply());
    for (const ev of ['blur', 'focus', 'visibilitychange'] as const) {
      (ev === 'visibilitychange' ? document : window).addEventListener(ev, () => this.apply());
    }
  }

  apply(): void {
    const { settings, audio, input } = this;
    audio.setMix({
      master: settings.num('masterVolume') / 100,
      music: settings.num('musicVolume') / 100,
      effects: settings.num('effectsVolume') / 100,
      ambience: settings.num('ambienceVolume') / 100,
    });
    const mood = settings.str('musicMood');
    audio.setMusicMood(mood === 'follow' ? null : mood);
    this.renderer().options = {
      shake: settings.bool('screenShake'),
      bob: settings.bool('headBob'),
      tilt: settings.bool('strafeTilt'),
      fovDegrees: settings.num('fieldOfView'),
      colourLevels: settings.num('colours') || 24,
      light: {
        scale: settings.num('lightDetail') || 1,
        sun: ['off', 'near', 'full'].indexOf(settings.str('sunShadows')),
        sky: settings.str('skyLight') !== 'flat',
        ao: settings.num('cornerShading'),
        lights: settings.num('lightsPerPixel') || 4,
        lampShadows: settings.bool('lampShadows'),
        reflections: settings.str('reflections') === 'traced' ? 'traced' : settings.str('reflections') === 'screen' ? 'screen' : 'off',
      },
    };
    this.resolution(0);
    input.mouse.sensitivity = 0.0022 * (settings.num('mouseSensitivity') / 100);
    input.mouse.invertY = settings.bool('invertMouse');
    input.turnSpeed = settings.num('turnSpeed') / 100;
    this.ui.setDebug(settings.bool('showFps'));
    audio.setPresent(!settings.bool('muteInBackground') || (document.visibilityState === 'visible' && document.hasFocus()));
  }

  /** Pixel size: the chosen detail, lowered on the fly when frames run slow (setting 'adaptive' = wished fps, 0 = off). */
  resolution(dt: number): void {
    const renderer = this.renderer();
    const maxLines = this.settings.num('resolution') || 200;
    const lines = this.adaptiveRes.update(dt, maxLines, this.settings.num('adaptive'));
    if (renderer.viewport.height !== lines) renderer.viewport.setTargetHeight(lines);
  }
}
