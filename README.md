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

On the device, open `http://<mac-ip>:5173/`, set the device tag, and leave **Send reports to this server** ticked (the box appears only when a collector answers). Every finished run then posts itself; the report view also has a **Send to rig server** button for a manual send. The file lands as `results/scenario-count-adapter-device.json` and the terminal prints the name. A rerun from the same device overwrites the file, except that a run with fewer than 30 frames (a hidden tab) is refused, so a throttled rerun cannot replace a good report. `GET /report` lists the saved files. The deployed HTTPS page cannot post to a LAN server, so use the Mac's URL for collection and the deployed URL only when a scenario needs HTTPS.

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
| `ccd` | CW-01.3 | 6 cm ball at 90 m/s fired N times at a 1 cm wall (`bullet=0` variant; `resume=1` starts each launch with a fake 2,000 ms frame through the clamped accumulator) | zero tunnels |
| `catapult` | CW-01.3 | Counterweight trebuchet into a box stack; limits, gravity, contacts | ball flies right, contacts fire, p95 under 33.4 ms |
| `particles` | CW-01.5 | N live additive particles over the 200-body bowl; `emitters=5` splits the count | p95 under 33.4 ms with the emitters at target; largest passing count ÷ 4 = per-effect cap |
| `sprites` | CW-01.6 | N images from the real Creator item atlas (one 2048 page); draw calls per frame | p95 under 33.4 ms |
| `spine` | CW-01.6 | N Floof skeletons (Spine 4.2 export) looping idle animations; draw calls per frame | p95 under 33.4 ms; humans check the art |
| `textures` | CW-01.6 | Backdrop and atlas raw vs KTX (ASTC, ETC2, S3TC); GPU bytes per texture | compressed textures render; `null` until the KTX files exist |
| `overlay` | CW-01.7 | React rail, 20-input panel, object list and DOM gizmo over 60 sprites; drag, resize, rotate, pan, zoom, pinch | drag frames p95 under 20 ms with at most 1 % over 33.4 ms, pointer-to-frame latency p95 under 50 ms, gizmo drift p95 under 2 px |
| `soak` | CW-01.8 | 200 bodies + 1,000 particles + 10 skeletons left running; heap samples; reload or memory-kill detection | heap peak under 200 MB where exposed; no death of the previous run |
| `audio` | CW-01.8 | Web Audio beep on first tap; resume after background; resume after an interruption | beep on first tap, and after each resume |
| `fonts` | CW-01.8 | Text created before and after `fonts.ready` with the Kodable font | font loads; `extra.ruleNeeded` says whether text must wait for the font |
| `pwa` | CW-01.8 | Display mode, service worker state, cache entries | standalone and controlled by the service worker when launched from the icon |
| `purchase` | CW-01.9 | One sandbox consumable through StoreKit 2 (`@capgo/native-purchases`), shell only | transaction id returned |
| `textinput` | CW-01.9 | DOM input over the canvas with the keyboard in resize mode none and a JS shift | keyboard height arrives, canvas keeps its size, tap outside dismisses |
| `jettison` | CW-01.9 | Allocate until iOS kills the content process; recover from an IndexedDB envelope after the reload | `recovered=true` with the budget in MB |
| `determinism` | CW-01.4 | Seeded coaster scene: 200 bodies, 30 joints, one motor, 3,000 fixed steps, run twice; hash of every transform | the two runs agree (`stable`); humans compare `hash` across devices |

Every physics scenario reports `physicsMsP50/P95/Max` (simulation time per frame), `subSteps` and, where meaningful, a `hash` taken at a fixed step for cross-device comparison.

### Particles (CW-01.5)

`particles` layers Phaser particle emitters (one 16 px soft disc texture, additive blending, gravity, scale and alpha fades) over the 200-body `bodies` scene on the `box2d` adapter. Each emitter flows every update and is hard-capped with `maxAliveParticles`, and the flow is sized to fill the cap at 30 fps, so the live count equals the target on any device that keeps up. Variants: 1,000, 5,000 and 20,000 from one emitter, and `5x500` (2,500 over 5 emitters). `extra.particlesAliveMax` must reach the target for the run to count. `npm run results` prints a third table: per device, the largest single-emitter count that held 30 fps and that number divided by 4, the proposed per-effect cap.

### Sprites, Spine and textures (CW-01.6)

**Assets** live in `public/`: `atlas/creator-items.{png,json}` is the Creator object-browser art (the color layers of the props in `K3Unity/Assets/K3/Art/Objects/Browser/Items`, without the white `_shade` masks, scaled to 148 px and packed by `scripts/pack-atlas.mjs` into one 2048 page in Phaser JSON-hash format), `spine/floofs/` is the Floof family exported from Spine 4.2.43 (6 skeletons, one 2-page atlas, premultiplied alpha), and `textures/backdrop.png` is a real 2048 x 1536 course backdrop.

```bash
node scripts/pack-atlas.mjs <folder-of-pngs> public/atlas/creator-items 2048   # re-pack the atlas
```

- `sprites`: images from the atlas, moving and rotating. `extra.drawCallsP50` counts WebGL draw calls per frame (the rig wraps `drawElements` and `drawArrays`, since Phaser 4's WebGL renderer has no counter). One texture batches into 1 draw call.
- `spine`: skeletons in a grid, cycling the 6 Floofs, each looping its idle animation, through `@esotericsoftware/spine-phaser-v4` **4.2.120**. The runtime's major.minor must match the export (4.2.43); the 4.3 line of the plugin does not load 4.2 data. The plugin installs at run time inside the scenario, so other scenarios do not carry the Spine runtime. Headless: about 4.6 draw calls per skeleton.
- `textures`: loads the backdrop and the atlas raw, and compressed through `load.texture` when the KTX files exist next to the PNGs. It probes the files with HEAD first, lets Phaser pick the first format the GPU supports, and draws raw and compressed side by side. `extra.textures[]` gives raw bytes (width x height x 4) and the KTX payload per texture; `extra.gpuSupports` says which formats the device offers. Pass is `null` until the KTX files exist, then `true` when every compressed texture rendered.

**KTX files** come from one command on the Mac, no other install (PVRTexTool has no macOS build any more):

```bash
npm run ktx     # ASTC 6x6 via astcenc, ETC2 RGBA8 via EtcTool (both from @gpu-tex-enc), S3TC BC3 via dxt-js + a KTX 1 header
```

It writes 3 KTX files next to each PNG in `public/textures/` and `public/atlas/` (committed, so the deployed page has them). The `textures` variants `astc`, `etc2` and `s3tc` force one format through `?format=`, so each file can be checked on a device that supports several; `auto` lets Phaser pick. Headless: 28 MB raw becomes 3.3 MB as ASTC 6x6 or 7.3 MB as ETC2 or S3TC. Phaser reads the KTX 1 container. ASTC serves the iPad, ETC2 the Chromebook, S3TC desktop GPUs.

### Editor overlay (CW-01.7)

`overlay` decides whether React and Phaser fight. React 19 owns the editor state in a small external store (`src/scenarios/overlay/store.ts`): 60 objects with 20 properties each, the selection and the camera. The UI (`overlay/ui.tsx`) is a rail, a properties panel with 20 live-bound inputs, an object list, and a DOM gizmo with 8 resize handles and a rotate handle. Phaser draws the 60 atlas sprites and applies store changes synchronously in a store listener. Pointer input lands on one root element over the canvas: drag moves, handles resize and rotate, empty space or shift-drag pans, wheel zooms about the cursor, two pointers pinch and pan.

- `robot` variants drive the same handlers with synthetic pointer, wheel, input and click events on a 12 s cycle: drag along an ellipse, resize from a handle, pan while zooming, type into `x` and `rotation`, select rows from the list. `manual` leaves it to fingers on a device; the report needs 30 drag frames and 10 pointer moves for a verdict.
- Metrics: `dragFrames` (frame intervals while a pointer is down), `latencyMs` (earliest unrendered pointer event to Phaser's `postrender`), `typingLatencyMs`, `driftPx` (gizmo center through `camera.getWorldPoint` against the sprite, per frame), `reactCommits` and `reactCommitMs` (React's profiling build), `storeNotifies`, `longTasks`.
- The gizmo renders into a layer the scene keeps exactly over the canvas (`.ov-canvas-layer`, from the canvas's offset box each frame), so its pixels are canvas pixels: iPad Safari moved the canvas under a page-positioned gizmo by a constant 6 to 77 px per run. React's `createRoot` empties its container, so that layer is a sibling of the React container inside the input shell.
- Real input on devices lands between frames and delays the frame callback by 1 to 2 ms at p95 without dropping frames (p50 16.7 ms, no frame over 33.4 ms), while the robot's in-frame events show a clean 16.7 ms; the pass rule is therefore p95 under 20 ms and at most 1 % dropped, and `dragDropped` and `dragSlow` are reported.
- `flushSync` is the finding. Input-driven store changes from native handlers or from Phaser's loop are rendered by React one frame after Phaser applies them: the gizmo lags the sprite by 3 px at 120 Hz and 6 px at 60 Hz, and a camera jump flashes the gizmo a full screen away for one frame. Wrapping those changes in `flushSync` (the default; `flush=0` shows the lag) brings drift to 0.01 px at a commit cost under 0.1 ms. `gizmo=imperative` moves the gizmo element directly during a drag and tells React on release; it is the fallback if flushSync ever costs too much on a device.

### Capacitor shell (CW-01.9)

`ios/` is a Capacitor 8 app (Swift Package Manager) that bundles `dist/`; `capacitor.config.ts` sets the id `com.surfscore.kodable.creatorrig` (the rig's own, never the production Creator id), the keyboard in resize mode `none`, no content inset and no scrolling. Inside the shell every scenario reports `device=capacitor-ipad` or `capacitor-iphone`.

```bash
npm run build && npx cap sync ios     # copy dist/ and plugins into the app
npx cap open ios                      # Xcode: select the team, run on a device
```

- **Native tweaks**: `AppDelegate.swift` sets the `AVAudioSession` playback category, so sound plays with the ring/silent switch off (check with `audio · tap` in the shell). `RigViewController.swift` defers the bottom-edge gesture and hides the home indicator. `Info.plist` locks landscape, requires full screen and hides the status bar. `App.entitlements` holds the Associated Domains entry; replace `HOST` with the domain that serves `public/.well-known/apple-app-site-association` at its root (see below). `main.ts` reports a lost WebGL context as an error instead of a blank canvas.
- **Universal Link and Heroku host**: `main.ts` listens for `appUrlOpen` and navigates to the scenario named in the link's query, for example `https://HOST/creator-rig/?scenario=bodies&adapter=box2d&count=200`. iOS reads the AASA from the domain root, so the Pages host (`kodable.github.io/CreatorRig/`) cannot serve it. The repo deploys to Heroku as a static host that can later carry the Creator product under its own domain: `Procfile` runs `scripts/serve.mjs`, `heroku-postbuild` builds `dist/`, the server serves it from the root with the AASA as `application/json` and treats `/creator-rig/*` as the app. The app is `kodable-creator-rig` in the Heroku team `kodable`, host `kodable-creator-rig-03d05ef5fa9b.herokuapp.com` (deploy with `git push heroku main`); that host is in `App.entitlements`.
- **Purchase**: `@capgo/native-purchases` (StoreKit 2, no account). App Store Connect needs an app record for the bundle id with one consumable `com.surfscore.kodable.creatorrig.coin`, and a sandbox tester signed in on the device. The report carries the transaction id and receipt sizes; the console prints `RIG_RECEIPT`.
- `textinput`, `jettison` and the other shell checks are scenarios (see the table). `scripts/capacitor-wizard.sh` walks a human through the Apple side.

### Memory, load, audio, fonts, PWA (CW-01.8)

- `soak` composes the `bodies` scene (200, Box2D), 5 particle emitters (1,000 live) and 10 Floof skeletons. It samples `performance.memory` every `sampleEvery` seconds where the browser exposes it (Chromium; Safari does not, so on the iPad or iPhone read Safari Web Inspector > Timelines > Memory from the Mac). A flag in `sessionStorage` is set at start and cleared at the end, so a rerun in the same tab reports whether the previous run died (reload or memory kill). `1min` is the harness check; `10min` is the device run.
- **Load time**: `npm run load` opens the deployed rig in a fresh Chromium context per target under the Chrome DevTools "Slow 4G" numbers (1.6 Mbps down, 750 kbps up, 150 ms RTT), cache disabled, and reports transferred bytes, requests and the time to the scenario's first frame (the rig sets `performance.mark('rig:first-frame')` on the first update). The cold visit adds `sw=0`, which skips the service worker: otherwise the worker claims the page mid-load and fetches later chunks itself, unthrottled and uncounted. A warm visit in the same context then measures the worker-served load. `--url http://localhost:4173/` measures a local preview; `--profile none` removes the throttle. Results land in `results/load-*.json`.
- `audio` creates the AudioContext on the first tap and plays a 250 ms beep on every tap. It resumes the context and beeps again when the tab returns to the foreground and after an interruption (a call, Siri, a timer; iOS reports it as `interrupted` or as `suspended` while visible). "Played" means the context is running, the oscillator's `ended` fired and the audio clock advanced. **Device finding**: after an interruption iOS Safari reports `running` again but the clock stays frozen and nothing plays; `resume()` does not help. The rig detects the frozen clock and tries, once per tap, resume, a silent media-element unlock and a recreated context; on the iPad none works and the page's audio is dead until reload, while the iPhone recovers by itself. The rig then shows an optional restore button. Product rule: never force a reload; keep the child's work saved and the game running without sound, and let the child choose to restore sound. The report carries the on-screen log.
- `fonts` requests the Kodable font through the FontFace API, creates one text object at once and one after `document.fonts.ready`, and compares widths. `fallbackBaked` says the first text rendered with the fallback font; `staysBakedUntilSetText` says Phaser kept those glyphs until `setText()`. Together they confirm the runtime rule: await `fonts.ready` before the first text object.
- **PWA**: `public/manifest.webmanifest` (standalone, landscape, icons 192 and 512 from the Creator icon), `public/sw.js` (app shell cached on install; hashed build assets cache-first; everything else network-first with cache fallback), registered from `main.ts` in production builds only. The `pwa` scenario reports display mode, service worker state, scope and cached entries; pass is `null` in a tab and `true` when launched from the Home Screen icon with the worker in control.

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
