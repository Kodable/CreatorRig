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

The index page lists every scenario and variant. Set the **device tag** first (`chromebook`, `ipad`, `iphone`, `mac-chrome`, `mac-safari`, `capacitor-ipad`, ...), then tap a variant. After the warm-up and the measured window the report box appears with buttons: **Copy JSON** puts the report on the clipboard, **Send to rig server** posts it to `results/` when the page came from the Mac's dev server (see *Collecting device reports*), **Download** saves `scenario-count-adapter-device.json`, and **Share** (iOS) hands the file to the share sheet. Then `npm run results` prints the tables.

Devices on the same network open `http://<your-mac-ip>:5173/`. For Safari on iOS some scenarios (PWA install, Universal Links) need HTTPS: use the deployed URL.

## Collecting device reports

The dev server and the preview server accept reports at `POST /report` and write them to `results/` (`scripts/collector.ts`).

```bash
npm run rig                      # serves on http://<mac-ip>:5173 (the terminal prints the network URL)
ipconfig getifaddr en0           # the Mac's LAN address, if you need it
```

On the device, open `http://<mac-ip>:5173/`, set the device tag, and leave **Send reports to this server** ticked (the box appears only when a collector answers). Every finished run then posts itself; the report view also has a **Send to rig server** button for a manual send. The file lands as `results/scenario-count-adapter-device.json` and the terminal prints the name. `GET /report` lists the saved files. The deployed HTTPS page cannot post to a LAN server, so use the Mac's URL for collection and the deployed URL only when a scenario needs HTTPS.

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
| `send` | (off) | `1` posts the finished report to `/report` on the page's own server |

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

`p50`, `p95` and `max` are frame intervals in ms. `dropped` counts frames over 33.4 ms (missed 30 fps). `slow` counts frames over 16.8 ms (missed 60 fps). `pass` is `null` when the scenario has no automatic rule, for example a determinism hash a human compares across devices. A scenario with fixed work (a step count) can report itself `busy`; the measured window then runs past `duration` until the work is done, at most 120 s more, and `notes` records the extension.

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

**Parity notes learned from the scenarios (CW-01.3)**: a `distance` spring defined by hertz produces different forces per engine (Box2D scales it by the constraint's effective mass, the Rapier adapter by the bodies' reduced mass), so scenarios that must match across engines drive motion with gravity and mass, not springs or motors. Box2D joints are soft: under heavy load a wheel joint opened 0.28 m at 4 sub-steps and 0.12 m at 8; `?substeps=8` is the knob. The Box2D port collapses unit-box towers of 40 or more; Rapier stands 40 with 0.6 m sway. Neither engine let a 6 cm ball at 90 m/s tunnel through a 1 cm wall, with or without the bullet flag.

Both adapters pass the same conformance suite (`src/physics/conformance.test.ts`): settle, contact events, 10-box stack, revolute hold, motor spin, raycast, chain support, spring stretch and breakable joint, weld, body order, stable hash.

## Scenarios

| Id | Task | What it measures | Pass rule |
| --- | --- | --- | --- |
| `baseline` | CW-01.1 | Renderer floor: N moving sprites, no physics | p95 frame under 33.4 ms |
| `physics-smoke` | CW-01.2 | Adapters load in the browser; hash at step 120 | p95 under 33.4 ms |
| `bodies` | CW-01.3 | N bodies rain into a bowl; physics ms per frame; hash at step 300 | p95 under 33.4 ms |
| `stack` | CW-01.3 | Tower of N unit boxes at rest; drift of the top box | drift under 0.5 m, no topple, p95 under 33.4 ms |
| `joints` | CW-01.3 | 100 motor carts in an arena plus a bridge of breakable spring rods | wheel anchor gap under 0.1 m, p95 under 33.4 ms |
| `ccd` | CW-01.3 | 6 cm ball at 90 m/s fired N times at a 1 cm wall (`bullet=0` variant) | zero tunnels |
| `catapult` | CW-01.3 | Counterweight trebuchet into a box stack; limits, gravity, contacts | ball flies right, contacts fire, p95 under 33.4 ms |
| `particles` | CW-01.5 | N live additive particles over the 200-body bowl; `emitters=5` splits the count | p95 under 33.4 ms with the emitters at target; largest passing count ÷ 4 = per-effect cap |
| `determinism` | CW-01.4 | Seeded coaster scene: 200 bodies, 30 joints, one motor, 3,000 fixed steps, run twice; hash of every transform | the two runs agree (`stable`); humans compare `hash` across devices |

Every physics scenario reports `physicsMsP50/P95/Max` (simulation time per frame), `subSteps` and, where meaningful, a `hash` taken at a fixed step for cross-device comparison.

### Particles (CW-01.5)

`particles` layers Phaser particle emitters (one 16 px soft disc texture, additive blending, gravity, scale and alpha fades) over the 200-body `bodies` scene on the `box2d` adapter. Each emitter flows every update and is hard-capped with `maxAliveParticles`, and the flow is sized to fill the cap at 30 fps, so the live count equals the target on any device that keeps up. Variants: 1,000, 5,000 and 20,000 from one emitter, and `5x500` (2,500 over 5 emitters). `extra.particlesAliveMax` must reach the target for the run to count. `npm run results` prints a third table: per device, the largest single-emitter count that held 30 fps and that number divided by 4, the proposed per-effect cap.

### Determinism (CW-01.4)

`determinism` decides the engine. It builds one seeded scene: a 10-car train (20 wheel hinges, 9 couplers) rolls off a tilted plateau into a valley and over the hills, 168 loose bodies rain in one every 12 steps, and a motorized paddle above the pile flings the ones that hit it. The scene steps 3,000 fixed steps as fast as the frame budget allows: the wall clock decides only how many steps a frame takes, never the step size, so the result does not depend on the device's frame rate. At steps 300, 1,000 and 3,000 it records the hash, then destroys the world, builds it again and repeats.

- The hash box shows the run-1 hash in large text, then `✓` when run 2 matched or `✗` and the second hash when it did not.
- `extra.stable` is the same-browser check (`pass`). `extra.checkpoints` places a divergence in time when two devices differ.
- Run the `200` variant on every device with the same `?seed=` and `?substeps=`, paste the reports into `results/`, then `npm run results` prints a second table: one row per scenario, params and adapter, the hash per device, and whether they agree.
- The run needs about 6,000 steps of physics time. The scenario reports itself busy until both runs reach step 3,000, and the measured window extends past `duration` until then (cap 120 s), so a slow device needs no hand-tuned duration. The report notes the extension. `stepsDone` must read `[3000, 3000]`.

## Bench (headless, desktop)

```bash
npm run bench              # builds, then runs every matrix entry in Chromium and WebKit
npm run results            # prints results/*.json as a Markdown table
```

Headless numbers are for harness checks and regressions. They are not device numbers. Shorten runs with `RIG_DURATION=3 RIG_WARMUP=1 npm run bench`; a variant with its own `duration` (determinism) keeps it. `npx playwright test -g determinism` runs one scenario.

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
