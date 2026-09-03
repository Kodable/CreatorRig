# Kodable Creator Rig

A throwaway measurement rig for the Creator web runtime decision. It answers one question per scenario, on real devices, with one JSON report per run. It is not the editor and not a course. Keep it small; delete it when the decisions are made.

Notion: milestone `[CW-01] Stress rig` under the project *Creator Web Rebuild (Phaser + Capacitor)*.
Deployed: https://kodable.github.io/CreatorRig/ (GitHub Pages, on every push to `main`).

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
| `adapter` | `none` | Physics adapter: `box2d` or `rapier` |
| `duration` | `20` | Seconds measured after warm-up |
| `warmup` | `3` | Seconds ignored at the start |
| `device` | UA guess | Device tag written into the report |
| `seed` | `1` | Seed for every random choice |

Unknown parameters pass through to the scenario and into the report.

## Report

Every run writes the same shape to the page, to the console as one `RIG_REPORT {...}` line, and to `window.__rig.report`:

```json
{
  "scenario": "physics-smoke", "adapter": "box2d", "device": "ipad", "params": { "count": 100 },
  "durationMs": 20000, "frames": 1199, "fps": 59.9, "p50": 16.7, "p95": 17.2, "max": 41.0,
  "dropped": 1, "slow": 3, "heapMB": null, "pass": true, "notes": [],
  "extra": { "bodies": 100, "steps": 1380, "contacts": 412, "hashStep": 120, "hash": "9c1e4b2a" }
}
```

`p50`, `p95` and `max` are frame intervals in ms. `dropped` counts frames over 33.4 ms (missed 30 fps). `slow` counts frames over 16.8 ms (missed 60 fps). `pass` is `null` when the scenario has no automatic rule, for example a determinism hash a human compares across devices.

## Physics interface (CW-01.2)

`src/physics/types.ts` is the one engine-specific seam. Scenarios call `PhysicsWorld` and never import an engine.

- **Units**: meters, radians, y up, gravity `(0, -10)` by default. Rendering to pixels (y down) is the scenario's job.
- **Fixed step**: `step(FIXED_DT, FIXED_SUBSTEPS)` = 1/60 s with 4 sub-steps. Never pass a wall-clock delta; scenarios use an accumulator.
- **Bodies**: static, kinematic, dynamic; `bullet` turns on continuous collision.
- **Shapes**: circle, box, convex polygon, chain. Chains are solid on the **left** of the walking direction: a ground listed left to right is solid from above, a counter-clockwise loop is solid inside.
- **Joints**: `revolute` (motor, limits), `wheel` (revolute with a motor; suspension is not in v1), `distance` (rigid or spring), `weld`. Any joint takes `breakDistance`: the interface layer measures the anchor separation after every step and destroys the joint when it exceeds the value, so breaking behaves the same on every engine.
- **Events**: `step()` returns contact begin/end events by body id and the joints broken that step.
- **Queries**: `castRay(origin, translation)` returns the closest hit. It reflects the world after the last `step()`.
- **Hash**: `hash()` is FNV-1a over every live body's position and angle quantized to 4 decimals, in creation order. Equal hashes on two devices after the same number of fixed steps mean identical simulations. Compare hashes only at the same step count.

### Adapters

| Adapter | Package | Chunk (raw / gzip) | Notes |
| --- | --- | --- | --- |
| `box2d` | `phaser-box2d` 1.1.0 (Box2D v3 port, MIT) | 184 KB / 50 KB | Plain JavaScript. Two port quirks are worked around: `b2CreateWorldArray()` must run once, and `b2World_CastRayClosest` never sets its filter, so the adapter uses `b2World_CastRay` with a closest-hit callback. Chains need at least 4 points and are solid on the right, so the adapter reverses and subdivides. |
| `rapier` | `@dimforge/rapier2d-deterministic-compat` 0.20.0 (Apache-2.0) | 2,155 KB / 814 KB | wasm inlined as base64 by the compat build; the plain wasm package with a Vite wasm plugin would be smaller. Cross-platform deterministic by construction. No rigid distance joint: a rigid `distance` becomes a stiff spring (30 Hz, damping 1). `wheel` motor max torque is applied only if the build exposes `configureMotorMaxForce`. |

Both adapters pass the same conformance suite (`src/physics/conformance.test.ts`): settle, contact events, 10-box stack, revolute hold, motor spin, raycast, chain support, spring stretch and breakable joint, weld, body order, stable hash.

## Bench (headless, desktop)

```bash
npm run bench              # builds, then runs every matrix entry in Chromium and WebKit
npm run results            # prints results/*.json as a Markdown table
```

Headless numbers are for harness checks and regressions. They are not device numbers. Shorten runs with `RIG_DURATION=3 RIG_WARMUP=1 npm run bench`.

## Tests

```bash
npm test                   # Vitest: percentiles, params, matrix integrity, physics conformance
npm run typecheck
```

## Deploy

Push to `main` deploys `dist/` to GitHub Pages through `.github/workflows/pages.yml`. `vite.config.ts` uses `base: './'`, so the same `dist/` also works on Netlify, a Heroku static app, or inside a Capacitor shell.

## Adding a scenario

1. Add an entry to `src/scenarios/matrix.ts` (id, title, task, variants, adapters). This file has no browser imports; Vitest and Playwright read it in Node.
2. Add the module to `src/scenarios/registry.ts` as a lazy import.
3. Implement `Scenario.create(scene, params)` and return a handle with `update`, `pass`, `extra`, `notes`, `hash` as needed. Use `makeRandom(params.seed)` for every random choice. Never read `window.location` in a scenario.
4. Physics scenarios call `createWorld(params.adapter)` from `src/physics` and step with the fixed step, never an engine directly.

## Rules

- Fixed time step for physics (1/60 s, fixed sub-steps). No wall-clock in a simulation.
- One report shape for every scenario.
- The physics interface is the only engine-specific seam.
- No editor, no course logic, no art polish. Real assets only where a test needs them.
- Stay under about 1,000 lines of rig code (physics adapters excluded).
