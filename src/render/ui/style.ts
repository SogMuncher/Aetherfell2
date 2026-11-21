import type { HudTheme } from '../../types';

/** The HUD colours (content/hud.ts) as CSS variables on #ui: hpTop becomes --hp-top. */
export function hudVariables(theme: HudTheme): string {
  const vars = Object.entries(theme).map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${v};`);
  return `#ui { ${vars.join(' ')} }\n`;
}

export const UI_CSS = `
#ui { font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace; color: var(--text); text-shadow: 1px 1px 0 #000; user-select: none; }
#ui .hud-bars { position: absolute; left: 14px; bottom: 14px; width: 220px; }
#ui .quickbar { font-size: 11px; margin-bottom: 4px; display: flex; flex-wrap: wrap; gap: 2px 8px; }
#ui .quickbar kbd { padding: 0 3px; }
#ui .bar { height: 9px; margin-top: 5px; background: #0008; border: 1px solid #000; box-shadow: 0 0 0 1px var(--brass-glow); }
#ui .bar > div { height: 100%; transition: width .12s linear; }
#ui .bar.hp > div { background: linear-gradient(var(--hp-top), var(--hp-bottom)); }
#ui .bar.st > div { background: linear-gradient(var(--st-top), var(--st-bottom)); }
#ui .bar.mp > div { background: linear-gradient(var(--mp-top), var(--mp-bottom)); }
#ui .spellbar { position: absolute; right: 14px; bottom: 14px; min-width: 170px; padding: 6px 10px; text-align: right; background: var(--ink-glass); border: 2px solid var(--edge); pointer-events: auto; }
#ui .spellbar.low { border-color: var(--warn-edge); }
#ui .spellbar.low .cost { color: var(--warn); }
#ui .spellbar .glyphs { font-size: 20px; color: var(--rune); letter-spacing: 4px; }
#ui .spellbar .name { color: var(--bright); }
#ui .spellbar .cost { font-size: 11px; color: var(--aether); }
#ui .spellbar button { font: inherit; font-size: 11px; color: var(--text); background: var(--button); border: 1px solid var(--brass); padding: 1px 6px; margin: 4px 0 0 4px; cursor: pointer; }
#ui .dim { color: var(--dim); }
#ui .book { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 80px); overflow: auto; box-sizing: border-box; }
#ui .book h3 { margin: 10px 0 4px; font-size: 12px; color: var(--brass); text-transform: uppercase; letter-spacing: .08em; }
#ui .book .slots { display: flex; gap: 10px; justify-content: center; margin: 10px 0; }
#ui .book .slot { width: 64px; height: 64px; box-sizing: border-box; border: 2px dashed var(--edge); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 28px; color: var(--rune); }
#ui .book .slot.full { border: 2px solid var(--brass-lit); background: var(--button); margin: 0; padding: 0; font-size: 28px; color: var(--rune); }
#ui .book .slot small, #ui .book .rune small { display: block; font-size: 10px; color: var(--text); }
#ui .book .preview { min-height: 80px; padding: 6px 8px; background: var(--ink); border: 1px solid var(--edge); }
#ui .book .spellname { font: 18px Georgia, serif; color: var(--gold); }
#ui .book .words { font-style: italic; color: var(--rune); margin-bottom: 4px; }
#ui .book .problem { color: var(--warn); }
#ui .book .row { margin: 8px 0; text-align: center; }
#ui .book button[disabled] { opacity: .4; cursor: default; }
#ui .book .grid { display: flex; flex-wrap: wrap; gap: 6px; }
#ui .book .rune { width: 64px; padding: 4px 0; margin: 0; text-align: center; background: var(--ink-glass); border: 2px solid var(--edge); }
#ui .book .rune b { display: block; font-size: 22px; color: var(--rune); font-weight: normal; }
#ui .book .rune.on { border-color: var(--brass-lit); background: var(--button-on); }
#ui .book .rune.unknown { opacity: .45; }
#ui .book .rune.unknown b { color: var(--dim); }
#ui .book .hint { margin-top: 10px; font-size: 11px; color: var(--dim); }
#ui .bag { right: 16px; top: 44px; padding: 8px 12px 10px; max-width: calc(100vw - 32px); box-sizing: border-box; }
#ui .bag .bag-title { display: flex; justify-content: space-between; align-items: center; cursor: move; touch-action: none; }
#ui .bag .bag-title h2 { margin: 0 0 6px; }
#ui .bag .bag-title button { padding: 0 8px; font-size: 16px; line-height: 20px; }
#ui .bag .bag-area { position: relative; background-size: 100% 100%; image-rendering: pixelated; border: 2px solid var(--leather); box-shadow: inset 0 0 18px #000a; }
#ui .bag-item { position: absolute; width: var(--icon, 40px); height: var(--icon, 40px); cursor: grab; touch-action: none; }
#ui .bag-item img { width: var(--icon, 40px); height: var(--icon, 40px); image-rendering: pixelated; display: block; pointer-events: none; filter: drop-shadow(2px 2px 0 #0008); }
#ui .bag-item:hover img { filter: drop-shadow(2px 2px 0 #0008) brightness(1.25); }
#ui .bag-item .n { position: absolute; right: -4px; bottom: -4px; font-size: 11px; color: var(--bright); text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
#ui .bag-item.lifted { opacity: .25; }
#ui .bag-ghost { position: fixed; z-index: 50; pointer-events: none; cursor: grabbing; }
#ui .bag-ghost .tag { position: absolute; left: 50%; top: calc(var(--icon, 40px) + 4px); transform: translateX(-50%); font-size: 11px; color: var(--gold); white-space: nowrap; }
#ui .bag-label { position: absolute; z-index: 5; transform: translate(-50%, -100%); width: 180px; padding: 3px 6px; background: var(--ink-deep); border: 1px solid var(--brass); font-size: 11px; pointer-events: none; }
#ui .bag-label b { display: block; color: var(--gold); font-weight: normal; font-size: 12px; }
#ui .bag .bag-foot { margin-top: 6px; font-size: 11px; }
#ui .bag .bag-foot .heavy { color: var(--warn); }
#ui .bag .hint { margin-top: 4px; font-size: 10px; color: var(--dim); max-width: 292px; }
#ui .doll { left: 16px; top: 44px; width: 430px; padding: 8px 12px 10px; max-width: calc(100vw - 32px); box-sizing: border-box; max-height: calc(100vh - 60px); overflow: auto; }
#ui .doll .doll-title { display: flex; justify-content: space-between; align-items: center; }
#ui .doll .doll-title h2 { margin: 0 0 6px; }
#ui .doll .doll-title button { padding: 0 8px; font-size: 16px; line-height: 20px; }
#ui .doll .doll-body { display: flex; gap: 12px; align-items: flex-start; }
#ui .doll .doll-fig { position: relative; flex: none; background: var(--ink-deep); border: 2px solid var(--leather); box-shadow: inset 0 0 18px #000a; }
#ui .doll .doll-fig canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
#ui .doll .doll-slot { position: absolute; box-sizing: border-box; border: 1px dashed var(--brass-faint); display: flex; align-items: center; justify-content: center; cursor: default; touch-action: none; }
#ui .doll .doll-slot.full { border: 1px solid var(--brass-glow); cursor: grab; }
#ui .doll .doll-slot:hover { border-color: var(--brass-lit); }
#ui .doll .doll-slot.lifted { opacity: .3; }
#ui .doll .doll-slot img { display: none; }
#ui .doll .doll-parts small { font-size: 10px; }
#ui .doll .doll-side { flex: 1; min-width: 0; font-size: 12px; }
#ui .doll .doll-side h3 { margin: 8px 0 3px; font-size: 11px; color: var(--brass); text-transform: uppercase; letter-spacing: .08em; }
#ui .doll .doll-name { font: 16px Georgia, serif; color: var(--gold); margin-bottom: 4px; }
#ui .doll .doll-bar { position: relative; height: 13px; margin: 2px 0; background: var(--ink); border: 1px solid var(--edge); }
#ui .doll .doll-bar i { position: absolute; left: 0; top: 0; bottom: 0; }
#ui .doll .doll-bar.hp i { background: linear-gradient(var(--hp-top), var(--hp-bottom)); }
#ui .doll .doll-bar.st i { background: linear-gradient(var(--st-top), var(--st-bottom)); }
#ui .doll .doll-bar.mp i { background: linear-gradient(var(--mp-top), var(--mp-bottom)); }
#ui .doll .doll-bar span { position: absolute; left: 4px; top: -1px; font-size: 10px; line-height: 14px; color: var(--bright); text-shadow: 1px 1px 0 #000; }
#ui .doll .doll-skill { display: flex; align-items: center; gap: 6px; }
#ui .doll .doll-skill span { width: 90px; flex: none; }
#ui .doll .doll-skill i { flex: 1; height: 5px; background: var(--ink); border: 1px solid var(--edge); }
#ui .doll .doll-skill b { display: block; height: 100%; background: var(--brass); }
#ui .doll .doll-status { display: inline-block; margin: 0 4px 2px 0; padding: 0 5px; background: var(--button); border: 1px solid var(--brass-faint); }
#ui .doll .doll-status small { color: var(--dim); }
#ui .doll .heavy { color: var(--warn); }
#ui .doll .doll-note { margin-top: 6px; min-height: 28px; font-size: 11px; }
#ui .doll .doll-note b { color: var(--gold); font-weight: normal; }
#ui .doll .hint { margin-top: 4px; font-size: 10px; color: var(--dim); }
#ui .compass { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); width: min(420px, 70vw); height: 22px; overflow: hidden; background: var(--ink-soft); border: 1px solid var(--brass-faint); }
#ui .compass span { position: absolute; top: 2px; transform: translateX(-50%); font-size: 12px; white-space: nowrap; }
#ui .compass .cardinal { color: var(--gold); font-weight: bold; }
#ui .compass .loc { color: var(--place); font-size: 10px; top: 4px; }
#ui .compass .friend { color: var(--friend); }
#ui .compass .needle { left: 50%; top: 0; bottom: 0; width: 1px; background: var(--gold); position: absolute; }
#ui .info { position: absolute; left: 14px; top: 10px; font-size: 12px; white-space: pre; opacity: .9; }
#ui .net { position: absolute; right: 14px; top: 10px; font-size: 12px; text-align: right; white-space: pre; }
#ui .prompt { position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; font-size: 14px; }
#ui kbd { border: 1px solid var(--brass); padding: 0 5px; color: var(--gold); background: var(--ink-kbd); font: inherit; }
#ui .cross { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: #fff8; box-shadow: 0 0 2px #000; }
#ui .toast { position: absolute; left: 0; right: 0; top: 20%; text-align: center; font-size: clamp(26px, 5vw, 48px); color: var(--gold); letter-spacing: .04em; opacity: 0; transition: opacity 1s; padding: 0 16px; font-family: Georgia, 'Times New Roman', serif; }
#ui .toast small { display: block; font-size: 13px; letter-spacing: .2em; color: var(--text); text-transform: uppercase; font-family: ui-monospace, monospace; }
#ui .log { position: absolute; left: 14px; bottom: 112px; width: min(440px, 60vw); font-size: 12px; }
#ui .log div { opacity: .95; transition: opacity .6s; }
#ui .panel { position: absolute; background: var(--panel); border: 2px solid var(--brass); box-shadow: 0 0 0 3px var(--ink), 6px 6px 0 3px #0008; padding: 12px 14px; }
#ui .panel h2 { margin: 0 0 8px; font: 22px Georgia, serif; color: var(--gold); }
#ui .panel button { font: inherit; color: var(--text); background: var(--button); border: 1px solid var(--brass); padding: 3px 10px; cursor: pointer; margin: 2px; }
#ui .panel button:hover { background: var(--brass); color: var(--ink); }
#ui .dialogue { left: 50%; bottom: 120px; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); box-sizing: border-box; }
#ui .dialogue .opts button { display: block; width: 100%; text-align: left; }
#ui .side { right: 16px; top: 44px; bottom: 90px; width: min(380px, calc(100vw - 32px)); overflow: auto; box-sizing: border-box; }
#ui .side table { width: 100%; border-collapse: collapse; }
#ui .side td { padding: 2px 4px; border-bottom: 1px solid #ffffff12; }
#ui .map { left: 50%; top: 50%; transform: translate(-50%, -50%); }
#ui .map canvas { display: block; width: min(70vh, 86vw); height: min(70vh, 86vw); image-rendering: pixelated; }
#ui .menu { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 32px)); box-sizing: border-box; text-align: center; }
#ui .menu h1 { font: 52px Georgia, serif; margin: 4px 0 0; color: var(--gold); letter-spacing: .05em; }
#ui .menu .sub { color: var(--dim); margin-bottom: 14px; }
#ui .menu input { font: inherit; background: var(--ink); color: var(--text); border: 1px solid var(--brass); padding: 4px 8px; width: 160px; }
#ui .menu .row { margin: 8px 0; }
#ui .menu .keys { text-align: left; font-size: 12px; color: var(--text-soft); columns: 2; margin-top: 12px; }
#ui .hidden { display: none !important; }
#ui.prestart > :not(.menu):not(style) { display: none !important; }
#ui .debug { position: absolute; left: 14px; top: 60px; font-size: 11px; white-space: pre; background: #0008; padding: 4px 6px; }
#ui .downed { position: absolute; left: 0; right: 0; top: 40%; text-align: center; font: 28px Georgia, serif; color: var(--warn); }
#ui .say { position: absolute; transform: translate(-50%, -100%); background: var(--ink-glass); border: 1px solid var(--brass-faint); padding: 2px 6px; font-size: 12px; white-space: nowrap; }
`;
