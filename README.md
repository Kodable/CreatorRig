# Bruno's Theme Park

A local, playable proof of concept of a Kodable Creator course on Phaser 4. Bruno builds a theme park for fuzzes, and you build attractions for them. Run `npm run dev` and open http://localhost:5173/ to see the park map. Six playable activities: Fuzz Rollercoaster, Floof Goldberg Machines, Structural Stability, Catapults, Vehicle Obstacle Course, Bridge Builder. The "🎡 Park" button returns to the map. URL routing: `?activity=vehicle` opens an activity; `?activity=vehicle&level=shape` opens a specific level; `?activity=bridge` or `?activity=bridge&level=triangle` work too.

Requires Node 22. Run `npm install` (if plain `npm install` fails with an arborist `edgesOut` error on npm 10.9, use `npm install --legacy-peer-deps`).

Scripts: `dev`, `build`, `preview`, `typecheck`, `test`.

## Fuzz Rollercoaster

Tap empty space on the track to insert a point. Tap the sky to append at the end. Drag a point to move it. Tap a point to delete it. The first point is the station. Press Play to send the fuzz rolling; it sticks to the rail up to 0.5 g of pull-away when upside down. Use Stop, Undo, and Clear to edit; Next level to advance after passing.

Two tools in the bottom bar: **Point** and **Loop**. A loop is a fixed piece (a point of kind `loop` expanded into a 4 m radius circle by `expandTrackPoints` before the spline is built). Locked points (placed by a level) show a padlock and cannot move or delete; Clear keeps them.

### 8 Levels

- `drop`: Vertical drop — at least 15 m drop.
- `complete`: Complete the track — pre-placed locked points; bring the rail to the finish flag.
- `speed`: Speed — reach 18 m/s.
- `length`: Length — 80 m track, cart reaches end.
- `hang`: Hang time — 1 second with seat g under 0.3.
- `loop`: Loops — build and complete a loop.
- `intense`: Intense-o-meter — 15 m/s under 4 g.
- `free`: Free play — all meters on.

### Meters

**Drop**: max fall from station to track low point.  
**Speed**: current speed (play mode) or max speed (edit mode); also shown in km/h.  
**Length**: total track length.  
**Hang time**: seconds with seat g under 0.3 (weightless).  
**Loops**: number built (edit) or completed/total during ride (play).  
**Bruno** (Spine, drawn by Phaser in the open slot left of the top bar) waves when a level passes. The rider is the blue fuzz image in `public/blueFuzz_idle.png`.  
**Intense-o-meter**: current g in play mode or max g overall; green < 2g, orange 2–4g, pink > 4g.

## Floof Goldberg Machines

A chain-reaction course where you place and tune parts, press Play, and a fuzz must reach the gate. Tap a palette chip to add a part in the middle of the scene, drag it to move, tap to select and change its properties with chips. Remove, Undo, and Clear let you edit freely. Locked parts placed by the level cannot move or delete (Clear keeps them); they carry no padlock mark. The Hint button cycles through three escalating hints shown in Bruno's bubble.

Seven part kinds build the machine: **Fuzz** (the rolling ball, tunable size); **Platform** (a solid surface, length and rotation); **Ramp** (a slope, angle 15–45°, flip direction, size); **Domino run** (a falling chain, 1–6 pieces); **Seesaw** (pivot point and hook options); **Lever** (rotate around a fulcrum to launch); **Gate** (the goal, with openTime 0–8 seconds). A fuzz arriving before the gate opens fails; once open, reaching it passes the level.

Outcomes during a run: **reachedGate** (fuzz passed through the open gate), **tooEarly** (hit the closed door), **settled** (everything at rest before the goal), **timeout** (30 seconds elapsed). The HUD shows meters: Elapsed time, Parts moved (those that left their rest pose), Parts (total placed), and Top speed in m/s.

### 9 Levels

- `angle`: Tilt the ramp
- `flip`: Flip it
- `add-ramp`: Add a ramp
- `dominoes`: Domino run
- `seesaw`: Seesaw
- `lever`: Launch
- `timing`: Wait for the gate
- `chain`: Big chain
- `free`: Free play

## The builder kit (src/kit)

Goldberg, Structures, Catapults, the Vehicle course and Bridge Builder share one kit. `BuilderScene` (panel, Bruno, gestures, rendering by role). `BuilderHud` (bubble, picker, goals, meters, palette, property panel, drawer with parts shelf). `BuilderApp` (mode machine, undo, selection, rebuild on every edit, optional overlap resolve and settled write-back). `bootBuilderActivity` boots a course.

A course supplies a `CourseSpec` (see `src/kit/types.ts`): catalog, levels, `createSim`, metrics, HUD spec, role renderers, world size. To add a course: write `core/{types,catalog,build,sim,levels}.ts`, a `spec.ts`, and an `index.ts` that calls `bootBuilderActivity`. Add it to the registry. A level with `budget` (coins) enforces it via `CourseSpec.partCost` (cost of each part placed), refusing adds/changes that would exceed the total, and the HUD shows the pill "coins used / budget".

**Parts shelf**: With `drawer` on, palette kinds that have `partInfo[kind].image` appear as big picture buttons on a **parts shelf** in the right-hand drawer (grouped by `partInfo[kind].group` in first-seen order), each with its coin cost badge; a tap adds the part, and unaffordable kinds dim; the selected part's property rows sit in a panel pinned at the bottom of the drawer so the shelf never moves, and an option that costs extra (a spring mount) shows a "+N 🪙" badge. The drawer opens when the child taps the base (shelf only) or a part (its rows in the pinned panel, the shelf above), with the coin pill in the drawer header; it hides until then. The bottom bar then shows only kinds without an image (typically none if every palette kind has an image). Every drawer course opens it only while a part is selected.

Multi-shot courses let the child tune between runs (`tuneBetweenRuns`). The world persists between shots (`canReplay`, `updatePart`), with Reset to restore the start. Lock properties per part (`lockedProps`, shown disabled) or restrict drag to a region (`region`).

**Wide worlds**: `WorldSpec.worldW` may exceed the 960/ppm view (30 m at ppm 32): the panel keeps its 960 px, the camera (follow, focus) clamps to the world (`src/kit/camera.ts` `viewWidth`, `scrollToCx`), edit mode shows a slim scrollbar along the panel's bottom edge (`HudState.scroll`, `scrollTo`; shortened while the drawer is open), and `CourseSpec.intro` pans the camera between two frames on level load (a tap skips). Single-screen courses are unchanged.

**Concept gates**: A level's `introduces` list names the property codes (concept ids) that level teaches; a concept is known from that level onward (`src/kit/concepts.ts` `knownConcepts`). The kit hides drawer rows, prop chips, and in-scene widgets whose code is not yet known (keeps those props at the default), refuses `setProp` for unknown codes, and marks the rows a level introduces with a NEW badge (`HudState.introduced`). An entry of the form `code:value` (for example `fuzz:Donut`) gates one option: that option is hidden and refused until the level that introduces it, and gets its own NEW badge. Courses without `introduces` show everything.

**Tactile variables layer**: A course declares interactive controls on selected parts via `focusFrame` (camera tweens to a part for tuning), `follow` (camera soft-follows a body by role during play), and `widgets` (the only in-scene control for tuning is the green PULL ring that starts the run; other controls are in the property drawer). Machine properties live in a drawer that slides in from the right edge of the world panel—big picture buttons from `PropertyOption.image` appear one row per property, and `PropertyOption.label` names them. Parts are drawn with their own pictures (`RenderItem.textureKey` from `CourseSpec.textures`, SVGs loaded through the image loader). The camera focuses at zoom 3.2 with the machine in the left two thirds. The level auto-selects the machine. The `resultCard` shows the end-of-run outcome; `stats` renders 0–1 bars in the prop panel (Speed, Grip, etc.). `WorldSpec.sky` sets the gradient and stars. Overlay items include a `label` (live readout pill). `RoleRenderer.tint` colorizes a texture, and `PropertyDescriptor.default` names a default option value. The scene uses two cameras: the world camera (clipped to the panel) and a UI camera for Bruno. The widget kinds (tap, dial, rack, lever, cycle, pull) remain in the kit for courses that want them.

**Widget design rules**: Focus zoom 3.2, minimum touch size 64 px, text 16/18/24 px only, no widget text below zoom 2, locked controls and drawer rows shown grey with no padlock (dropped 2026-10-01 as too distracting; Bruno's bubble says the part is bolted down on a tap), the green pull ring is the only green control on screen, the selection box stays hidden while widgets show, and the level auto-selects the machine when it is the only part with controls.

The physics adapter now has prismatic joints, collision groups, and a motor factor.

**Ground layer**: `WorldSpec.groundDepth` (in meters) shows that much ground below world y = 0 (drawing only; physics/levels stay unchanged); camera frames may centre lower via `focusFrame`. `WorldSpec.groundBand: false` disables the kit's own ground stripe, letting a course draw terrain below y = 0 (dips, pits). When true (the default), the kit draws a coloured band at y = 0; when false, the course owns the ground visuals all the way down to `groundDepth`.

Three editor tool kinds coordinate placed parts. **Move** (the default) taps to select and drags to reposition. **Place** taps empty space to add a part there. **Link** (Road, Wood, Steel, Cable tools) drags from anywhere to anywhere with a live rubber band; each end that is not an existing point becomes a new joint. A course can set a `grid`: the scene draws it and every placed part, dragged part and link end snaps to it. The scene hit-tests parts via `hitSegment` (a thick segment between two points) or bounds. The `canAdd` hook enforces rules (length caps, budgets); `normalizeParts` derives fields (a rod's midpoint) and cleans up broken references.

A dial widget can set `radiusM` (world-meter radius to ride a machine part at any zoom), hide its track arc with `track: 'none'` (the part is the track), show the value in the knob with `readout: 'knob'`, and commit live while dragging with `live: true`.

## How the coaster works

Rail-locked sim in pure TypeScript (`src/core`), no physics engine. Fixed step 1/60 s with 4 sub-steps. Cart state is (s, v) along a centripetal Catmull-Rom curve resampled every 0.1 m. Seat g = side × (v² kappa / g + tangent.x). Outcomes: reachedEnd, rolledBack, stuck, fell (fell = seat g below -STICK, default -0.5 g, while inverted). Goals are data in `src/core/levels.ts`.

File layout: `src/core` (pure math and data, unit-tested with Vitest), `src/game` (Phaser scene and view constants), `src/ui` (HTML HUD), `src/app.ts` (controller). Tests: run `npx vitest run` (870 tests in 42 files).

## How the Goldberg course works

The engine is Rapier 2D (`@dimforge/rapier2d-deterministic-compat`) wrapped in the engine-agnostic `PhysicsWorld` interface, copied from the stress rig into `src/physics/` (Rapier adapter only). Fixed step 1/60 s with 4 sub-steps. The sim rebuilds the world from the level's placed parts on every edit and runs a 60-tick settle pre-roll with fuzzes held static, so the preview shows the rest pose; Play releases the fuzzes. Fuzzes lose speed gradually (constant rolling resistance `ROLL_DECEL` in sim.ts makes them stop crisply within seconds). Every level has a `solution` part list, and `levels.test.ts` proves each level solvable and each preset failing. File layout: `src/activities/goldberg/{core,game,ui}`, `app.ts`, `index.ts`.

## Structural Stability

Stack blocks and beams (wood, brick, steel), put the fuzz on top, press Play: a test runs. Tests: shaker (ground moves), wind (sideways force), blast (one impulse from a point). Touching parts glue together; glue snaps at a relative speed per material (wood 3, brick 5, steel 9 m/s). Goals: fuzz height, survival time, parts that fell, part count. In edit mode every rebuild runs a settle pre-roll and parts take their rest positions, so a floating block drops.

### 9 Levels

- `stack`: Stack it up — test: none
- `base`: Shake it — test: shake
- `material`: Heavy or light — test: wind
- `beam`: Bridge the gap — test: shake
- `glue`: Snap! — test: blast
- `wind`: Windy day — test: wind
- `blast`: Kaboom — test: blast
- `budget`: Sky high — test: shake
- `free`: Free play — test: shake

## Catapults

Tap the catapult to zoom in for tuning. The drawer shows Power (1–4 rubber bands), Angle (15–75°), Fuzz (Flower, Donut, Fur, Helmet, Metal in weight order), and Arm (short/long). The Donut fuzz splits into three at the top of its arc (same speed, turned ±14 degrees); the other four never split. Angle is set by dragging the wood angle arm's blue pad (1.5 m) on the machine itself: drag the knob, it snaps to 15/30/45/60/75°, and the stop bar and bands move with it (one undo per drag, live commit). The red tie-down string ties the arm's underside (near the cup) to a ground peg. The in-scene controls are the lever knob and the green **FIRE** button next to the string, positioned between the string and the base; tap FIRE to snip it and launch the run. Power is shown as 1–4 red strength bands with hooks on the machine. The fuzz sits in the arm's cup, drawn under the cup cover. The machine shows 1.5 m of ground and focuses at zoom 3.6 with the catapult mid-screen left of the drawer. A level may set a `line` (world y); the metric "Above the line" counts cans/blocks still above it, and a goal `aboveLine == 0` passes however the tower comes down. During flight, the camera follows the first target hit (an invisible 'impact' item) and then the fuzz, with a live distance readout. The payoff: a dust puff where a block lands (> 2 m/s, once per block per shot), and a CRASH! burst when one shot knocks down 3 targets. Blocks have a `domino` size (0.4 x 2 m). The result card lists the controls set and the outcome, showing only the property codes known at that level. Each level has a shot budget; the world persists between shots. After a shot with shots remaining, the arm reloads and the string re-ties. A bullseye-only level (nothing to knock down) never ends as "cleared"; a miss leaves the remaining shots. Targets: cans, block towers, a bullseye. Metrics: knocked down, hits, shots used, max range. No preview arc.

### 16 Levels

Six intro levels (one new mechanic each: power, angle, weight, arm, moving the catapult, fuzz choice) unlock the mechanics, then a challenge run followed by four lenient stack levels where top pieces sit half off an edge and the line asks only for those to come down, passing many settings.

- `power`: Fling it — angle locked, 3 shots. Introduces power.
- `angle`: Over the wall — power locked, 3 shots. Introduces angle.
- `weight`: Heavy hitter — power and angle locked, 2 shots. Introduces fuzz.
- `arm`: Long arm — power and angle locked, 2 shots. Introduces arm.
- `move`: Roll closer — power locked, 3 shots. (Dragging the catapult; no new code.)
- `donut`: Three at once — Donut locked, knock down 2 of 3 cans on shelves, 1 shot. Introduces fuzz choice (Donut).
- `both`: Bullseye — 3 shots.
- `cans`: Three cans — 3 shots.
- `tower`: Timber! — 2 shots.
- `line`: Bring it down — 3 wood blocks + a 2×1 plank, line 1.5, 3 shots.
- `chain`: Chain reaction — five dominoes, line 1.2, 2 shots.
- `pyramid`: Pyramid hats — wood pyramid, 3-2-1 with two blocks balanced on peak, line 3.5, 3 shots.
- `towers`: Twin towers — two tower posts with plank and balanced end blocks, line 4.5, 3 shots.
- `wall`: Wobbly wall — brick base row, wood plank, two planks half off its ends, line 2.5, 3 shots.
- `dominoes`: Domino drop — three dominoes leading into a tower, line 3.5, 3 shots.
- `free`: Free play — unlimited shots.

## Vehicle Obstacle Course (Marstopia Rover)

The child builds a rover on a dark starry sky with rust-coloured terrain: a locked glass-dome base with Kevin inside, and parts (wheels, propulsion, weights) added via a parts shelf in the right-hand drawer. Tap the dome to open the drawer with the parts shelf (grouped by Wheels, Power, Weights: big picture buttons, each with its coin cost; a tap adds the part); tap a part to see its Mount row (suction cup or spring, +1 coin) pinned below the shelf. Unaffordable parts dim. The child drags parts anywhere around the rim and snaps them to 5-degree angles. The only in-scene control is the green **DRIVE** button above the rover to launch the run. The course shows 1.5 m of ground (`groundBand: false` lets the course draw its own ground): a darker under-layer that fills the full depth, a 0.3 m rust crust that follows the surface (including below y = 0 on a jump's lower landing), a dark chasm visual in each gap (crevasse/pit), and the Mars sky picture (mars-sky-wide.jpg, three blended copies) extended down to -1.5 m. The world is 90 m wide with a 30 m view; the first nine levels fit in the view, and five long challenges scroll the camera with an intro pan showing the whole course (from the finish back to the start over 2.8 s; a tap skips). Focus is at zoom 2.8 with the rover and DRIVE button mid-screen. Each level defines a coin budget, a palette (wheels: Round, Square, Star; propulsion: Fan, Stove, Jet; weights: Feather, Beans, Melon), Marstopia's terrain (hills, slopes, stairs, gaps, obstacles), and a finish beacon. Outcomes: finished, fell, stuck, timeout (no `flipped`: a rover on its roof keeps driving if wheels touch ground). Metrics: reached the finish, time, flips (full turns), distance, upside down (meters driven on the roof).

Wheels (Round 2 coins, Square 1, Star 3) are motors (6 m/s, 4 N.m cap) that keep driving in any orientation: a wheel on the ground spins the normal way; a wheel more than 20 deg above the dome's centre spins the other way, so a rover on its roof still goes forward. Propulsion (Fan 2, Stove 3, Jet 5) pushes the dome away from themselves. Weights (Feather 1, Beans 2, Melon 3) sit on a plate. Every part mounts with a suction cup (rigid, free) or spring (soft, +1 coin); springs are a vertical prismatic suspension (2.5 Hz, damping tuned per part type, ±0.15 m travel). A level's coin budget is shown in the drawer header "🪙 used / total" and the bottom bar; unaffordable parts dim; add or prop changes over budget are refused. The palette is the concept gate per level, and mount unlocks mid-course.

### 14 Levels

The first nine unchanged (intro levels with new mechanics, then challenges):
- `wheels`: Dusty hill — budget 4. Introduces wheels.
- `shape`: Rock steps — budget 6. Introduces star wheels.
- `mount`: Bumpy road — budget 6. Introduces the spring mount.
- `weight`: Boulder push — budget 7. Introduces weights.
- `power`: Crater rim — budget 8. Introduces propulsion.
- `jump`: Crevasse jump — budget 9.
- `rubble`: Rubble field — budget 10, under 12 s.
- `race`: Flat plain race — budget 9, under 3.5 s.
- `free`: Roam Marstopia — budget 40. Free play, no goals.

Five long challenges (intro pan, 45 s timeout, 90 m terrain):
- `flip`: Topsy-turvy — budget 12. Two cliffs flip the rover; needs wheels on top and bottom.
- `canyon`: Canyon climb — budget 12. Climb the crevasse walls.
- `ridge`: Rocky ridge — budget 14. Cross the ridge's uneven terrain.
- `hops`: Crater hops — budget 15. Hop the crater rim.
- `marathon`: Marstopia marathon — budget 20, under 18 s. The long way home.

## Bridge Builder

The level places anchor points on two banks (locked). The child draws rods with the Road, Wood, Steel and Cable tools, from a point or from empty space to a point or empty space; a rod's free end gets a joint on the half-meter grid. Drag a joint with the Move tool to reshape the bridge. Tap a rod to change its material or remove it. Press Play: the buggy from the Vehicle course drives across. Rods are springs with colour showing live stress (green to red); they snap at the material's limit. Road rods carry a deck (visible at level load time). Each level has a cost budget; a rod over budget or exceeding its material's length cap is refused. Metrics: crossed, rods broken, cost, max stress.

### 9 Levels

- `span`: Cross the gap — 4 m, Light, budget 10
- `triangle`: Triangles! — 6 m, Light, budget 30
- `material`: Stronger stuff — 6 m, Heavy, budget 45
- `budget`: On a budget — 8 m, Light, budget 40
- `cable`: Hang it — 8 m, Light, budget 32
- `heavy`: Heavy load — 8 m, Heavy, budget 78
- `long`: Long span — 12 m, Medium, budget 130
- `tight`: Tight budget — 8 m, Medium, budget 35
- `free`: Free play — 10 m, Medium, no budget

## Art

Part pictures under `public/parts/{catapult,rover}` are drawn as classroom makerspace objects (warm marker outline `#3b2a1a`): the rover is a tissue-box body, bottle-cap and cardboard wheels, battery-and-motor engines, a popsicle-stick strut / pipe-cleaner coil / pen spring, a juice box, a straw mast with a paper-cup dish and sticky-note panels. Drawer icons are 256×256; scene textures have viewBoxes whose aspect matches the physics box they are stretched to, so change both together.

Real Kodable art from the Marketing Library (map: `docs/marketing-library.md`), the **Marstopia Rover** is `public/parts/rover/real/`: `manifest.json` (trimmed sizes, anchor points), `cockpit.png` (dome base), `kevin.png` (Kevin's portrait), `shadow.png` (ground shadow), `wheel-circle.png` / `wheel-square.png` / `wheel-star1.png` (wheels), `power-fan.png` / `power-stove.png` / `power-jet.png` and `-flip.png` mirrors (propulsion), `fx-thrust.png` / `fx-poof.png` (thrust flame, poof cloud), `weight-feather.png` / `weight-beans.png` / `weight-watermelon.png` (weights), `plate.png` (weight plate), `spring.png` / `suctioncup.png` (mounts). The scale rule lives in `core/art.ts`: dome and Kevin at BASE_PPM (323.5 px / 0.75 m = 431.3 px/m), all other parts at PART_PPM (200.6 px / 0.3 m = 668.7 px/m, the circle wheel's scale).

**Part flight.** Tapping a drawer picture flies a copy of it to the machine (`CourseSpec.partTargets` gives world-meter targets; the kit converts them with `worldToStage`), and the change commits when it lands (520 ms; a fallback timer commits after 920 ms if the animation clock stalls). Two wheels = two copies.

Real Kodable art from the Marketing Library (map: `docs/marketing-library.md`), processed with a scratch Pillow script:
- **Catapult parts** (real exports, square canvases centred on the machine body): `public/parts/catapult/real-base.png` (plank + A-frame + blue hub), `real-arm-Short.png` and `real-arm-Long.png` (blue-striped launch arm with cup), `real-cup.png` (cup front drawn over the fuzz), `real-lever.png` (wood angle arm's blue pad and stick), `real-gear.png` (star gear), `real-hook.png` (band and string hooks), `real-band-3.png` through `real-band-29.png` (eight strength band lengths for scaling).
- **Fuzzes** `public/parts/catapult/fuzz-{Flower,Donut,Fur,Helmet,Metal}.png`: the five fuzzes in weight order, normal face on the arm and in the drawer. Fuzz body centred at 1/1.44 of a square canvas, baked ground shadow cut out, drawn `upright` on the swinging arm. (The old fuzz-Light.png, fuzz-Medium.png, fuzz-Heavy.png, fuzz-Prism.png remain in public/parts/catapult/ but unused by the catapult.)
- **FX** `public/fx/dust.svg` (dust puff where a falling block lands) and `public/fx/crash.svg` (CRASH! burst when one shot knocks down 3 targets).
- **Backdrops** (`WorldSpec.backgrounds`, world-meter picture layers under the ground strip): `public/bg/park.jpg` (park meadow, horizon 5.5 m up) for the catapult; `public/bg/mars-sky.jpg` (starfield) plus `public/bg/mars-planet.png` for the rover, whose ground strip is rust (`WorldSpec.groundStrip`).
- **Rover cargo** `public/parts/rover/cargo-Light.png` (heart balloons) and `cargo-Heavy.png` (boulder); the crate stays an SVG.
- **Hit bursts** `public/fx/pow.png` and `boom.png`: the catapult sim emits a `sprite` overlay (grow, hold, fade over 0.7 s) when the fuzz first touches a can or bullseye (POW) or a block (BOOM).

No can, bullseye or Mars-ground terrain art exists in the library; those stay as SVGs. Bruno stays the Spine animation.

## Adding a part kind

Add the kind to `PartKind` in `core/types.ts`, its descriptors in `catalog.ts` (label, icon, options per property), its bodies and visuals in `build.ts` (the `buildPart` function), and a chip label in `ui/goldbergHud.ts` (Goldberg) or `ui/structuresHud.ts` (Structures). Both courses share the kit.

## Adding an activity

Create `src/activities/<id>/index.ts` exporting an `ActivityDef` object with: `id` (URL slug), `title` (display name), `icon` (emoji), `bruno` (one-line pitch), `status` (`'ready'` or `'planned'`), `plan` (shows on placeholder), and `start(host)` returning a handle with `destroy()` method. Placeholders use `plannedActivity(...)` from `src/activities/planned.ts`. The coaster activity in `src/activities/coaster/index.ts` shows how to boot a Phaser game inside `host.game` and an HTML overlay inside `host.ui`, and how to tear both down.

Add your activity to `ACTIVITIES` in `src/activities/registry.ts`.

## Dev notes

`window.__game` and `window.__app` exist only while the coaster is open. `window.__gapp` is the Goldberg app, `window.__sapp` is the Structures app, `window.__capp` is Catapults, `window.__vapp` is the Vehicle app, `window.__bapp` is Bridge Builder. The HUD is laid out in 1024×768 stage pixels and scaled onto the canvas. The canvas renders at `RENDER_SCALE` (device pixel ratio, capped at 2) times the stage and the camera zooms by the same factor, so stage coordinates stay 1024×768 while the picture is crisp. The builder kit uses two cameras (the world camera is clipped to the panel and zooms/follows; a UI camera holds Bruno), so map a pointer with `worldCam.getWorldPoint(pointer.x, pointer.y)`, not `pointer.worldX/worldY`. The design lives in the Notion doc "Creator Phaser Architecture". Design rule (2026-09-16 stakeholder huddle): variables are set by hand on the machine before Play; Play is the experiment; the child only watches after the start.

## Playtest deploy

The playtest build lives on the `theme-park-playtest` branch of `Kodable/CreatorRig` (an orphan branch; the rig stays on `main`) and deploys to the Heroku app `kodable-creator-rig` (`git push heroku theme-park-playtest:main`). Heroku runs `heroku-postbuild` (`vite build`) and `node server.mjs` (Procfile), a zero-dependency static server for `dist/`. The park map (`src/launcher.ts`, `PARK_ACTIVITIES` in the registry) shows only the Rollercoaster, Catapults and Marstopia Rover; the other activities stay reachable by URL (`?activity=bridge`). Hero pictures for the cards are composed PNGs in `public/home/`.
