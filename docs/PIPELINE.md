# Pipeline (CI does the heavy checks)
- **Pull request** -> `check` workflow runs `tsc` + `npm run check:sim`. Green tick = safe to merge.
- **Merge to main** -> `build` workflow makes `play.html` and publishes it two ways:
  - branch `build` (one commit, only `play.html`): download it from
    github.com/SogMuncher/Aetherfell2/raw/build/play.html
  - Actions run page -> Artifacts -> `play.html` (kept 30 days).
- `play.html` is not in `main` (git-ignored). Never commit it from a PR.
- Local one-liners: `npm run build` (typecheck + play.html), `npm run check:data` (fast data checks only),
  `npm run check:sim` (everything).
- Threads: work on a branch, run tsc + the check for your area only, open a PR, let CI run the full check.
  Don't rebuild play.html yourself.
- Merging: on a green PR press "Enable auto-merge" (squash); it merges itself when `check` passes.
- One-time repo settings (Sock): Settings -> Actions -> allow actions; Settings -> General -> allow auto-merge;
  Settings -> Rules -> require status check `check` on main.
