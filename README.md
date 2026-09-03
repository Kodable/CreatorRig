# Kodable Creator Rig

A throwaway measurement rig for the Creator web runtime decision. It answers one question per scenario, on real devices, with one JSON report per run. It is not the editor and not a course. Keep it small; delete it when the decisions are made.

Notion: milestone `[CW-01] Stress rig` under the project *Creator Web Rebuild (Phaser + Capacitor)*.

## Run

```bash
nvm use
npm install
npm run rig          # dev server on the LAN, opens the index page
```

The index page lists every scenario and variant. Set the **device tag** first (`chromebook`, `ipad`, `iphone`, `mac-chrome`, `mac-safari`, `capacitor-ipad`, ...), then tap a variant. After the warm-up and the measured window the report box appears. Copy the JSON into `results/` or into the Notion results table.

Devices on the same network open `http://<your-mac-ip>:5173/`. For Safari on iOS some scenarios (PWA install, Universal Links) need HTTPS: use the deployed URL.

## URL parameters

| Param | Default | Meaning |
| --- | --- | --- |
| `scenario` | (index) | Scenario id from `src/scenarios/matrix.ts` |
| `count` | per scenario | Size knob: sprites, bodies, particles, skeletons |
| `adapter` | `none` | Physics adapter id (from CW-01.2) |
| `duration` | `20` | Seconds measured after warm-up |
| `warmup` | `3` | Seconds ignored at the start |
| `device` | UA guess | Device tag written into the report |
| `seed` | `1` | Seed for every random choice |

Unknown parameters pass through to the scenario and into the report.

## Report

Every run writes the same shape to the page, to the console as one `RIG_REPORT {...}` line, and to `window.__rig.report`:

```json
{
  "scenario": "baseline", "adapter": "none", "device": "ipad", "params": { "count": 1000 },
  "durationMs": 20000, "frames": 1199, "fps": 59.9, "p50": 16.7, "p95": 17.2, "max": 41.0,
  "dropped": 1, "slow": 3, "heapMB": null, "pass": true, "notes": [], "extra": { "sprites": 1000 }
}
```

`p50`, `p95` and `max` are frame intervals in ms. `dropped` counts frames over 33.4 ms (missed 30 fps). `slow` counts frames over 16.8 ms (missed 60 fps). `pass` is `null` when the scenario has no automatic rule, for example a determinism hash a human compares across devices.

## Bench (headless, desktop)

```bash
npm run bench              # builds, then runs every matrix entry in Chromium and WebKit
npm run results            # prints results/*.json as a Markdown table
```

Headless numbers are for harness checks and regressions. They are not device numbers. Shorten runs with `RIG_DURATION=3 RIG_WARMUP=1 npm run bench`.

## Tests

```bash
npm test                   # Vitest: percentiles, params, matrix integrity
npm run typecheck
```

## Deploy

Push to `main` deploys `dist/` to GitHub Pages through `.github/workflows/pages.yml`. Enable Pages once in the repository settings (Source: GitHub Actions). `vite.config.ts` uses `base: './'`, so the same `dist/` also works on Netlify, a Heroku static app, or inside a Capacitor shell.

## Adding a scenario

1. Add an entry to `src/scenarios/matrix.ts` (id, title, task, variants, adapters). This file has no browser imports; Vitest and Playwright read it in Node.
2. Add the module to `src/scenarios/registry.ts` as a lazy import.
3. Implement `Scenario.create(scene, params)` and return a handle with `update`, `pass`, `extra`, `notes`, `hash` as needed. Use `makeRandom(params.seed)` for every random choice. Never read `window.location` in a scenario.
4. Physics scenarios call the `PhysicsWorld` interface (CW-01.2), never an engine directly.

## Rules

- Fixed time step for physics (1/60 s, fixed sub-steps). No wall-clock in a simulation.
- One report shape for every scenario.
- The physics interface is the only engine-specific seam.
- No editor, no course logic, no art polish. Real assets only where a test needs them.
- Stay under about 1,000 lines of rig code.
