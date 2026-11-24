# UI and input (render/ui, input, settings)

**Purpose:** DOM HUD and windows over the game, and turning devices into an `InputSnapshot`.
**Never:** touch sim state (send `Command`s / input only); store game truth in the UI; hard-code colours (use `content/hud.ts`).

- `ui/ui.ts` `GameUI`: HUD, dialogue, journal, map, runebook. Callbacks go out through `UiCallbacks` to `main.ts`.
- `ui/bag.ts` (+ `bagParts.ts`): draggable bag window; layout saved per screen in localStorage, never in the sim.
- `ui/paperdoll.ts`: C key, armour slots + a hand slot (drop anything on it to hold it); side panel in `paperdollStats.ts`; the figure is your own body sprite in your gear (`paperdollFigure.ts`, same assembler), mouse wheel turns it. G throws the held item (look down: drop). `ui/settingsMenu.ts`: Esc/O, builds itself from
  `settings/settings.ts` data (add a setting = one entry there + where it is used) and the debug cheat tab.
- `ui/style.ts`: HUD colours as CSS variables from `content/hud.ts`.
- `input/`: keyboard, pointer-lock mouse look, quick-use slots -> one `InputSnapshot` per tick; edge presses are latched.
- `settings/`: player settings as data + localStorage store. Settings never reach the sim.

## Add / change
- New window: its own file under `render/ui/`, wired in `ui.ts`; draw from state + content only.
- New key/action: `types/input.ts` field + `input.ts` + the system that reads it.

## Checks
No headless check; verify in a browser (`npm run dev`) or a Playwright screenshot of `play.html`.
