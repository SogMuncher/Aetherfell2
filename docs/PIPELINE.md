# Pipeline (CI does the heavy checks)
- **Pull request** -> `check` workflow runs `scripts/check.mjs all` (tsc + every `*Smoke.ts`, all failures listed)
  and `codemap.mjs --check` (CODE-MAP up to date). Green tick = safe to merge.
- **Merge to main** -> `build` workflow makes `play.html` and publishes it two ways:
  - branch `build` (one commit, only `play.html`): download it from
    github.com/SogMuncher/Aetherfell2/raw/build/play.html
  - Actions run page -> Artifacts -> `play.html` (kept 30 days).
- `play.html` is not in `main` (git-ignored). Never commit it from a PR.
- Local one-liners: `npm run check <area|script|all>` (tsc + checks, failures only, refreshes CODE-MAP),
  `npm run check:sim` (every check, no tsc), `npm run build` (typecheck + play.html). New `*Smoke.ts` files join `all`
  by themselves; add them to an area in `scripts/check.mjs`. Cloud sessions run `npm ci` at start (`.claude/settings.json`).
- Threads: work on a branch, run tsc + the check for your area only, open a PR, let CI run the full check.
  Don't rebuild play.html yourself.
- Merging: on a green PR press "Enable auto-merge" (squash); it merges itself when `check` passes.
- One-time repo settings (Sock): Settings -> Actions -> allow actions; Settings -> General -> allow auto-merge;
  Settings -> Rules -> require status check `check` on main.
