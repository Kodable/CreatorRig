# Bruno's Theme Park

A local, playable proof of concept of a Kodable Creator course on Phaser 4. Bruno builds a theme park for fuzzes, and you build attractions for them. Run `npm run dev` and open http://localhost:5173/ to see the park map. Six playable activities: Fuzz Rollercoaster, Floof Goldberg Machines, Structural Stability, Catapults, Vehicle Obstacle Course, Bridge Builder. The "🎡 Park" button returns to the map. URL routing: `?activity=vehicle` opens an activity; `?activity=vehicle&level=shape` opens a specific level; `?activity=bridge` or `?activity=bridge&level=triangle` work too.

**Playtest**: This is the `theme-park-playtest` branch of Kodable/CreatorRig (worktree CreatorRig-playtest), deployed by hand from Heroku to kodable-creator-rig (creatorplaytest.kodable.com).

Requires Node 22. Run `npm install` (if plain `npm install` fails with an arborist `edgesOut` error on npm 10.9, use `npm install --legacy-peer-deps`).

Scripts: `dev`, `build`, `preview`, `typecheck`, `test`.

## Bruno's dialog (2026-10-12)

Bruno no longer sits in the top bar: the top bar keeps the level picker (‹ label ›) and the 🎡 Park button at the top right, and Bruno talks through one shared dialog (`src/ui/brunoDialog.ts`, styles at the end of `src/style.css`) on all three park courses (and every other kit course).

- **Lesson intro, every level load** (first load, the picker, Next level, Park → course; not Stop/Reset/replay), inside the game frame only (Gao, later the same day: "i want him and the darken to be on the visual game frame only"): the world panel (x 32..992, y 78..700, 12 px corners) dims to 55% black over 250 ms; the HUD outside it keeps full brightness (only DOM over the panel, the kit's drawer and the meters panel, dims with it). Bruno slides in from the panel's left edge with `Back.easeOut` (550 ms, starting half way into the dim), Spine scale 0.24 (about 190 px tall), feet at x 112, 4 px above the panel bottom, hard hat on, and waves once. Then a plain navy rounded box with a soft drop shadow rises inside the panel right of him (x 220..980, bottom at y 688, 200 ms) with the level title as a small orange label, and his line types in word by word (22 px; each word 90 ms after the previous, popping in over 150 ms; the whole line is laid out first, so the box never grows while typing). A tap on the panel (or Space/Enter) shows the whole line at once while typing; once the bouncing ▼ shows, a tap closes it: the box fades (150 ms), Bruno slides out (`Quad.easeIn`, 300 ms) while the dim fades (250 ms, from half way). Only then do the goals panel's pop-and-glide intro (`src/ui/goalsIntro.ts`) and, on long rover levels, the camera pan run. While the dialog is up a see-through catcher over the panel takes every tap on the game (so the closing tap never places a coaster point, selects a part or fires), the bottom bar shows at 60% and takes no taps, and the goals panel, scrollbar, coach hand, win banner and skin tray are hidden. The picker and Park stay live: a level change replaces the dialog (Bruno slides in again for the new level), Park leaves cleanly. Under prefers-reduced-motion the dim, Bruno and the full line appear at once and a tap closes it.
- **How the frame clip works**: `BrunoStage` (`src/ui/brunoStage.ts`) puts the dim (a rounded rect) and Bruno on each scene's WORLD camera, whose viewport is the panel, so nothing can draw outside it; since that camera zooms and pans (ride camera, focus, follow, intro pan), `sync()` runs every frame after the camera moved and pins them to fixed stage spots in the panel.
- **Hints** (catapult and rover: the level's `hints` ladder): the 💡 Hint pill sits at the left end of the bottom bar (hidden on a level with no hints, disabled during a run). A tap plays the same dialog with the next hint, labelled "Hint 2 of 3", cycling; no goals intro follows. The coaster has no hint ladder and no Hint button.
- **Quick lines** (the play line, pass/fail/done lines, refused/locked feedback, the rover coach's prompts; Gao: "let's try making the dialog box smaller and at the top"): a small navy box in the top row, from x 32 to 14 px short of the level picker, centred on y 36 (46 px tall for one line, 16 px bold text, two lines at most: a 100-character line fits in two at the narrowest, the rover's chapter picker), with a 36 px Bruno face at its left (`public/ui/bruno_face.png`: his head and hard hat cut from the Spine rig by rendering him on black and on white and solving for alpha). The words type in the same way, and a line animates only when its text changes. Play/pass/fail lines hide after 3 s + 0.25 s per word (a tap on the box hides it early); coach prompts stay while their step is active. Green text after a pass, pink after a fail. Quick lines wait while a dialog is open.
- **Code**: `BrunoDialog` (the DOM box, catcher, typing, quick lines) lives in each HUD as `hud.brunoDialog`; `BrunoStage` lives in each scene behind `showBrunoStage()` / `hideBrunoStage()`; `BrunoDialogRunner` sequences the two, and the controllers (`BuilderApp`, `src/app.ts`) run it on level load and on Hint, then start the goals intro and the intro pan.

## Fuzz Rollercoaster

Tap empty space on the track to insert a point. Tap the sky to append at the end. Drag a point to move it. Tap a point to delete it. The first point is the station. Press Play to send the fuzz rolling; it sticks to the rail up to 0.5 g of pull-away when upside down. Use Stop, Undo, and Clear to edit; Next level to advance after passing.

Two tools in the bottom bar: **Point** and **Loop**. A loop is a fixed piece (a point of kind `loop` expanded into a 4 m radius circle by `expandTrackPoints` before the spline is built). Locked points (placed by a level) show a padlock and cannot move or delete; Clear keeps them.

**Editor rules, locks and tutorial hands (2026-10-15).** A level may restrict the editor (`Level.tools`, `canAdd`, `stationVertical`, `newTool`; the pure helpers in `src/core/editRules.ts`, used by `CoasterScene` and the HUD; a level that sets none of them is the open editor). `tools` picks the tool buttons (default Point and Loop; `[]` hides the group, a lone button gets both pill ends). `canAdd: false` means a tap on the track or the sky adds nothing and a tap on a point deletes nothing, and Clear resets to the preset (elsewhere Clear keeps the locked points; Clear and a tap that changed nothing push no undo step). `stationVertical` lets the station slide only up and down; a point flagged `vertical` (`TrackPoint.vertical`, the air time lesson's hilltop) does the same wherever it sits, and keeps the flag through drags, Undo and Clear. The Loop button is hidden before the loop lesson; on the loop lesson (`newTool: 'loop'`) it shows with a NEW pill until the child picks it.

The tutorial hand is the builder kit's 3-frame glove (`public/ui/hand_01..03.png`, fingertip anchor 108/310, 2/360, only the finger bends). A level lists its steps in `Level.coach` (`src/core/coach.ts`: `nextCoachStep` shows the first step not done; a step's action done early skips it). The hand appears only after Bruno's intro and the goals intro, never in play mode, hides while a finger is on the track, and each step is done for good on that level load (a fresh load starts over).
- Level 1 (`drop`): `drag-station` (in the scene, on the world camera: the glove presses on the station handle, frames 1-2-3 over 0.25 s, slides straight up 140 px over 0.9 s ease in-out carrying a faint ghost handle, holds, releases 3-2-1, fades, pauses 0.6 s, repeats; a faint dotted arrow shows the way up; done once a drag of the station is let go or the drop goal is met), then `skin` (taps the fuzz button until the skin tray opens), then `play` (taps Play until it is pressed).
- Air time lesson (`hang`): `drag-top` (the same stroke on the vertical-only hilltop, rising 80 px = 5 m, from 5 m into the middle of the floaty band; done once the hilltop has been dragged).
- Level 2 (`complete`): `add-point` (taps the empty sky at `coachSpot` (40, 5) m, two thirds of the way to the flag, until a point is added).
- Loop lesson: `loop-tool` (taps the Loop button 3 times, or until the child picks Loop).
Taps: one per 1.1 s (finger out, bend, pressed, back, rest). The bar-button hands are the glove flipped upside down, pointing down at the button's top-right from above (the bar sits on the stage's bottom edge, where the upright glove was cut off).

**Theme-park backdrop, fuzz skins, ride camera (2026-10-12).** The scene is Bruno's theme park instead of a plain blue gradient: layers composed with Pillow from the Kodable Marketing Library (`GSA` = `Game Specific Assets`) into `public/bg/coaster/` at 2x stage px, back to front: `sky.jpg` (the cloud puffs of `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Sky/sky1_bg.png` over a deep-to-pale gradient), drifting `cloud1-3.png` (`GSA/Basics/Misc art/ws2020_cloud01-03.png`, lightened), `far.png` (two hazy hill ranges drawn as smooth silhouettes, with a tree line from `GSA/Basics/Area Specific/Fuzztopia/fuzztopia/decoration_tree01/02.png` and `decoration_bush02.png`), a turning ferris wheel drawn in the scene (the library has none), `mid.png` (a row of Fuzztopia trees, `GSA/Basics/Area Specific/Fuzztopia/fuzztopia/decoration_tree01/02.png`, softened 22% toward the horizon colour so the track stays the boldest thing on screen; the blimp, hot-air balloon and fairground props were removed the same day at Gao's request: too busy) and `ground.png` (a grass strip from `GSA/Basics/Environments/Maze Backgrounds/background_grass_HighDef.png`). The catapult reuses these layers, with its own 4x copies `catapult-far.png`, `catapult-mid.png` (trees re-placed) and a still `wheel.png` (see Catapults). The compose script is not in the repo; the layers are plain PNG/JPG and can be redrawn by hand. The clouds and the wheel move once a frame by hand (no tweens).

The child picks the fuzz that rides: a round button with the fuzz's face sits right of Point/Loop in edit mode; a tap opens a "Who rides?" tray of 8 faces above it (Blue, Princess, Cole, Prism, Spike, Gracie, Violet, Checkers: `src/game/skins.ts`); a tap swaps the fuzz and both the button and the fuzz waiting in the station pop. The pick holds for the session and in localStorage (`themePark.coaster.fuzzSkin`; every access is guarded, so the default Blue shows without storage). The pictures are the Fuzz Family PNGs (`GSA/Basics/Characters/Fuzz Family/<Name>/`, normal and excited poses) normalised into `public/skins/coaster/<id>.png` and `<id>-excited.png` (body centred on a 288 px canvas, body = canvas / 1.6, ground shadow cut out). The fuzz waits in the station with its normal face and rides with its excited face while faster than 7 m/s or airborne (back to normal under 4.5 m/s). Skins are cosmetic: the sim rides a point on the rail, so every level solution is untouched. The drawn fuzz is a little bigger (14 px rolling radius, was 11).

In play mode the camera zooms in and follows the fuzz (`src/game/rideCamera.ts`, the builder kit's frame maths from `src/kit/camera.ts`): zoom 2 (30 x 19.4 m on screen), an exponential follow (0.12 of the way per 60 Hz frame for the centre, 0.06 for the zoom, frame-rate independent) aimed up to 5 m ahead along the fuzz's velocity (0.3 s of travel), clamped so the view never leaves the world panel. When the run ends the camera holds on the fuzz for 1.1 s (the confetti burst over the flag on a pass, or the tumble), then glides back out to the full level view; Stop and a new level glide out at once, and edit mode always rests exactly on the full view. The scene has two cameras like the kit: the world camera is clipped to the panel (x 32..992, y 78..700; the rounded corners are caps on the UI camera), the world camera also carries Bruno's dialog stage (the dim and Bruno, pinned in the frame). While the camera moves, the backdrop layers lag it by their depth (parallax; the ground-standing layers only sideways).

Layout (2026-10-07, the rover's treatment): no dash. The goals float in a translucent panel over the scene's top-left and the meters (with the intense-o-meter gauge) over its top-right while the fuzz rides and after; the world is 38.25 m tall (`WORLD_H`, panel from stage y 78 to the ground at 690) and the extra height is sky. At every level start the goals panel pops up big in the middle and glides to its corner (`playGoalsIntro` in `src/ui/goalsIntro.ts`, shared with the builder kit's HUD). The bar: Point/Loop on the left, Play / Stop / Next level centred (`.bar-centre`, the same rules as the kit's bar), Undo and Clear on the right.

### 12 Levels

**Air time made visible (2026-10-15).** On levels with an air time goal (`hang`, `thrill`; `airGoal` in `src/core/airPreview.ts`), edit mode shows where the fuzz will float before the ride: `previewAir` runs the same deterministic sim on the edited track (fixed steps, capped at 40 s of sim time, usually well under 1 ms to a few ms) and returns the airborne stretches of rail, which the scene paints as a light-blue glow along the rail (the rail itself repainted light blue with a blue edge and a shine line, over a soft white halo) with an "Air time: 0.3 s" pill under the longest stretch (blue, green once it meets the goal). The App reruns it 100 ms after a track change (later changes ride along, so a drag updates about ten times a second); the preview's air time is the ride's (`airPreview.test.ts`). During the ride (every level), when the fuzz is airborne (seat g under 0.3) it eases up off the rail (12 to 24 stage px, eased in over about 70 ms and down over about 150 ms), leaves a soft shadow on the rail, keeps its excited face and trails little sparkles; on levels with an air time goal a counter over it counts the ride's air time in tenths ("0.4 s"), stays 0.7 s after a float and fades, and the moment the goal is met the number pops in gold with a burst of sparkles, then counts on in green. All cosmetic: the sim and the metrics never see it.

Most levels lock the station (and, where the start matters, a second lead-in point) and end at a locked finish flag with a "Track reaches the flag" goal; a level with a flag passes only when the fuzz actually reaches the end (`src/app.ts`). Each level's solution track is proven in `src/core/levels.test.ts` (it still passes when any one point moves 1 m; it keeps the preset's locked points and uses only the level's tools).

- `drop`: Vertical drop — drag the station up: at least 15 m down to the flag. No tool buttons, nothing to add or delete, the end locked on the flag, the station slides only up and down; tutorial hand: drag up, fuzz button, Play.
- `complete`: Complete the track — pre-placed locked points; bring the rail to the finish flag. Point only; tutorial hand taps a sky spot.
- `speed`: Speed — reach 18 m/s and the high flag (a straight slope is too slow). Point only.
- `length`: Length — 80 m of track to the flag. Point only; station at 26 m (20 m before 2026-10-15: from 26 m one tall up-and-down hill already reaches 80 m, from 20 m it took three hills squeezed under the station).
- `hang`: Air time (2026-10-15, was "Hang time": Gao, "kids won't understand hang time") — a drag-the-top lesson like level 1: a locked station (2, 18), the hill's locked feet (18, 4) and (42, 4), the hilltop (30, y) that only slides up and down, and a locked end on the flag (56, 3); no tool buttons, nothing to add. Goal: half a second of air time (0.5 s). The hilltop starts at 5 m (about 0.3 s of air); from about 6 m to 16 m the fuzz floats 0.5 s to 1.6 s over the crest (the tests check 6.5 to 15.5 m); from about 17 m it cannot get over and rocks in the valley (stuck). Tutorial hand: drag the hilltop up.
- `loop`: Loops — ride through a loop to the flag (a loop left high falls off). The Loop button first shows here (NEW pill, tutorial hand).
- `intense`: Intense-o-meter — 15 m/s under 4 g to a high flag (one round dip).
- `double`: Double loop — two loops, reach the flag (challenge).
- `thrill`: Thrill ride — locked lead-in, 1 s of air time from a hump, under 4 g, reach the flag (challenge). Shows the air preview too.
- `express`: Fuzz express — 20 m/s on 100 m of track, reach the end (challenge).
- `grand`: Grand finale — a loop under 7 g from a locked 28 m station (challenge).
- `free`: Free play — all meters on.

### Meters

**Drop**: max fall from station to track low point.  
**Speed**: current speed (play mode) or max speed (edit mode); also shown in km/h.  
**Length**: total track length.  
**Air time** (the `hangTime` metric; kids see "air time" everywhere since 2026-10-15): seconds with seat g under 0.3 (weightless).  
**Loops**: number built (edit) or completed/total during ride (play).  
**Bruno** (Spine) slides in to give each level's lesson intro (see Bruno's dialog above); his run lines show in the quick box with his face. The rider is the blue fuzz image in `public/blueFuzz_idle.png`.  
**Intense-o-meter**: current g in play mode or max g overall; green < 2g, orange 2–4g, pink > 4g.

## Floof Goldberg Machines

A chain-reaction course where you place and tune parts, press Play, and a fuzz must reach the gate. Tap a palette chip to add a part in the middle of the scene, drag it to move, tap to select and change its properties with chips. A delete badge on the selected part's box, plus Undo and Clear, let you edit freely. Locked parts placed by the level cannot move or delete (Clear keeps them); they carry no padlock mark. The Hint button (bottom bar, left end) cycles through three escalating hints, each played in Bruno's dialog.

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

Goldberg, Structures, Catapults, the Vehicle course and Bridge Builder share one kit. `BuilderScene` (panel, Bruno's dialog stage, gestures, rendering by role). `BuilderHud` (Bruno's dialog box, picker, goals, meters, palette, property panel, drawer with parts shelf, Hint button). `BuilderApp` (mode machine, undo, selection, rebuild on every edit, optional overlap resolve and settled write-back). `bootBuilderActivity` boots a course.

A course supplies a `CourseSpec` (see `src/kit/types.ts`): catalog, levels, `createSim`, metrics, HUD spec, role renderers, world size. To add a course: write `core/{types,catalog,build,sim,levels}.ts`, a `spec.ts`, and an `index.ts` that calls `bootBuilderActivity`. Add it to the registry. A level with `budget` (coins) enforces it via `CourseSpec.partCost` (cost of each part placed), refusing adds/changes that would exceed the total, and the HUD shows the pill "coins used / budget".

**Parts shelf**: With `drawer` on, palette kinds that have `partInfo[kind].image` appear as big picture buttons on a **parts shelf** in the right-hand drawer (grouped by `partInfo[kind].group` in first-seen order), each with its coin cost badge; a tap adds the part, and unaffordable kinds dim; the selected part's property rows sit in a panel pinned at the bottom of the drawer so the shelf never moves, and an option that costs extra (a spring mount) shows a "+N 🪙" badge. The drawer opens when the child taps the base (shelf only) or a part (its rows in the pinned panel, the shelf above), with the coin pill in the drawer header; it hides until then. The bottom bar then shows only kinds without an image (typically none if every palette kind has an image). Every drawer course opens it only while a part is selected.

Multi-shot courses let the child tune between runs (`tuneBetweenRuns`). The world persists between shots (`canReplay`, `updatePart`), with Reset to restore the start. Lock properties per part (`lockedProps`, shown disabled) or restrict drag to a region (`region`).

**Big buttons, coach, win banner**: `TapWidget.style 'big'` draws a chunky pill; `CourseSpec.idleWidgets` shows controls while nothing is selected (a BUILD pill with `action: 'select'` opens a part's drawer, a DRIVE pill starts the run); `hud.playInBar: false` hides the bottom-bar Play; `hud.winBanner` shows "Level complete!" with confetti, the outcome line, Next level and Try again. `CourseSpec.coach` returns the one next tap per frame (`CoachStep` with a `CoachTarget`: widget, part, shelf kind, drawer option or bar button); the HUD/scene draw a bouncing hand there and show the text as Bruno's quick line in the top row. `dragSnap` places the drag ghost where the part will land. `partInfo.blurb` one-liners show in a shelf unlock callout (for `introduces` entries `part:<kind>`) and as tooltips. `hud.metersOverlay` moves the meters out of the dash into a small translucent panel over the world panel's top-right corner, shown in play and done mode only; the goals column then fills the dash while its right column is empty. `hud.goalsOverlay` drops the dash altogether: the goals (and, once the run ends, the result card) sit in a twin panel over the top-left corner in every mode, and the meters take their overlay too; meant for a course whose parts have no stat bars (the rover and the catapult; the coaster's own HUD does the same). The world panel is `worldH * ppm` px tall with its bottom fixed at stage y 690 (`src/kit/view.ts` `panelTopY`): 480 px under the dash by default, taller to take the dash's room under `goalsOverlay` (rover and catapult: 19.125 m at ppm 32 = 612 px, top at y 78); the drawer, win banner and overlays follow it through the `--panel-top` CSS variable.

**Wide worlds**: `WorldSpec.worldW` may exceed the 960/ppm view (30 m at ppm 32): the panel keeps its 960 px, the camera (follow, focus) clamps to the world (`src/kit/camera.ts` `viewWidth`, `scrollToCx`), edit mode shows a slim scrollbar along the panel's bottom edge (`HudState.scroll`, `scrollTo`; shortened while the drawer is open), and `CourseSpec.intro` pans the camera between two frames on level load (a tap skips). Single-screen courses are unchanged.

**Concept gates**: A level's `introduces` list names the property codes (concept ids) that level teaches; a concept is known from that level onward (`src/kit/concepts.ts` `knownConcepts`). The kit hides drawer rows, prop chips, and in-scene widgets whose code is not yet known (keeps those props at the default), refuses `setProp` for unknown codes, and marks the rows a level introduces with a NEW badge (`HudState.introduced`). An entry of the form `code:value` (for example `fuzz:Donut`) gates one option: that option is hidden and refused until the level that introduces it, and gets its own NEW badge. Courses without `introduces` show everything.

**Tactile variables layer**: A course declares interactive controls on selected parts via `focusFrame` (camera tweens to a part for tuning), `follow` (camera soft-follows a body by role during play), and `widgets` (the only in-scene control for tuning is the green PULL ring that starts the run; other controls are in the property drawer). Machine properties live in a drawer that slides in from the right edge of the world panel—big picture buttons from `PropertyOption.image` appear one row per property, and `PropertyOption.label` names them. Parts are drawn with their own pictures (`RenderItem.textureKey` from `CourseSpec.textures`, SVGs loaded through the image loader). The camera focuses at zoom 3.2 with the machine in the left two thirds. The level auto-selects the machine. The `resultCard` shows the end-of-run outcome; `stats` renders 0–1 bars in the prop panel (Speed, Grip, etc.). `WorldSpec.sky` sets the gradient and stars. Overlay items include a `label` (live readout pill). `RoleRenderer.tint` colorizes a texture, and `PropertyDescriptor.default` names a default option value. The scene uses two cameras: the world camera (clipped to the panel) and a UI camera (corner caps). Bruno's dialog stage rides the world camera. The widget kinds (tap, dial, rack, lever, cycle, pull) remain in the kit for courses that want them.

**Widget design rules**: Focus zoom 3.2, minimum touch size 64 px, text 16/18/24 px only, no widget text below zoom 2, locked controls and drawer rows shown grey with no padlock (dropped 2026-10-01 as too distracting; Bruno's quick line says the part is bolted down on a tap), the green pull ring is the only green control on screen, the selection box stays hidden while widgets show, and the level auto-selects the machine when it is the only part with controls.

The physics adapter now has prismatic joints, collision groups, and a motor factor.

**Looks and chapters** (2026-10-09): `WorldSpec.looks` names several skies (each a `sky` gradient and/or `backgrounds` picture layers; a field a look omits falls back to the world's own), and `Level.look` picks one per level: the scene preloads every look's pictures (keyed by URL, `src/kit/looks.ts` `lookImageUrls`) and redraws the sky and backgrounds on each level load (`BuilderScene.setLook`, a no-op when nothing changes). `Level.chapter` groups levels: the level picker then reads "Mars · 3 of 9" (position and count within the chapter, `src/kit/chapters.ts` `levelPickerLabel`) instead of "Level N of M". Courses that set neither are unchanged.

**Ground layer**: `WorldSpec.groundDepth` (in meters) shows that much ground below world y = 0 (drawing only; physics/levels stay unchanged); camera frames may centre lower via `focusFrame`. `WorldSpec.groundBand: false` disables the kit's own ground stripe, letting a course draw terrain below y = 0 (dips, pits). When true (the default), the kit draws a coloured band at y = 0; when false, the course owns the ground visuals all the way down to `groundDepth`.

Three editor tool kinds coordinate placed parts. **Move** (the default) taps to select and drags to reposition. **Place** taps empty space to add a part there. **Link** (Road, Wood, Steel, Cable tools) drags from anywhere to anywhere with a live rubber band; each end that is not an existing point becomes a new joint. A course can set a `grid`: the scene draws it and every placed part, dragged part and link end snaps to it. The scene hit-tests parts via `hitSegment` (a thick segment between two points) or bounds. The `canAdd` hook enforces rules (length caps, budgets); `normalizeParts` derives fields (a rod's midpoint) and cleans up broken references.

A dial widget can set `radiusM` (world-meter radius to ride a machine part at any zoom), hide its track arc with `track: 'none'` (the part is the track), show the value in the knob with `readout: 'knob'`, and commit live while dragging with `live: true`.

## How the coaster works

Rail-locked sim in pure TypeScript (`src/core`), no physics engine. Fixed step 1/60 s with 4 sub-steps. Cart state is (s, v) along a centripetal Catmull-Rom curve resampled every 0.1 m. Seat g = side × (v² kappa / g + tangent.x). Outcomes: reachedEnd, rolledBack, stuck, fell (fell = seat g below -STICK, default -0.5 g, while inverted). Goals are data in `src/core/levels.ts`.

File layout: `src/core` (pure math and data, unit-tested with Vitest), `src/game` (Phaser scene and view constants), `src/ui` (HTML HUD), `src/app.ts` (controller). Tests: run `npx vitest run` (1266 tests in 54 files).

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

Tap the catapult to zoom in for tuning. The drawer shows Power (1–4 rubber bands), Angle (15–75°), Fuzz (Flower, Donut, Fur, Helmet, Metal in weight order), and Arm (short/long). The Donut fuzz splits into three at the top of its arc (same speed, turned ±14 degrees); the other four never split. Angle is set by dragging the wood angle arm's blue pad (1.5 m) on the machine itself: drag the knob, it snaps to 15/30/45/60/75°, and the stop bar and bands move with it (one undo per drag, live commit). The red tie-down string ties the arm's underside (near the cup) to a ground peg. The only in-scene control is the lever knob. **FIRE** is the bottom bar's yellow button (2026-10-15; it was a green in-scene button by the string): `hud.lines.launch` and `playAgain` both read `▶ FIRE`, and one tap fires one shot: in edit mode it starts the first shot, and between shots on a multi-shot level (done mode while `canReplay`) it reads FIRE again and fires the next shot into the same world. The string's SNIP! burst still plays at its old spot (`fireSpot`). Reset (pink) rebuilds the level with the full shot budget; Next level shows after a pass. **Coach** (`coach.ts`, `CourseSpec.coach`, like the rover's): on the five intro levels Bruno's quick line and the glove walk the new thing, starting once his intro closes: power: tap the catapult, then a power option (the glove on the next one up: Medium), then FIRE (sideways glove on the bar), then Next level after the pass; angle: tap the catapult, drag the lever knob, FIRE; weight: tap the catapult, a heavier fuzz (Fur), FIRE; arm: tap the catapult, the Long arm, FIRE; move: drag the catapult toward the wall, FIRE. A step advances on the action (`CoachContext.changed`, which the kit fills with every prop code the child sets and `move` after a drag) and the level goes quiet once the new control was used and a shot has gone; a fresh load starts over. Nothing on the Donut level or the challenges. **Shot preview** (`core/preview.ts`): a dotted arc of where the fuzz will fly (white dots with a soft dark rim, 0.45 m apart, screen-sized) from the release point to the first collider it would touch (a ray cast in the sim's own world, the catapult's bodies ignored; the ground, a shelf, a wall, a can or block). It shows after each change that moves the shot (power, every notch of a lever drag, fuzz, arm, a drag of the catapult: `updatePart`) once per level load after Bruno's intro (`CourseSim.showPreview`) and again between shots; it stays at full strength until FIRE (no fade since 2026-10-15) and never shows during a shot. Cosmetic only (the old `showPreview` level flag is gone). Power is shown as 1–4 red strength bands with hooks on the machine. The fuzz sits in the arm's cup, drawn under the cup cover. The machine shows 1.5 m of ground and focuses at zoom 3.6 with the catapult mid-screen left of the drawer. Like the rover, the catapult uses `hud.goalsOverlay` (no dash) and a 612 px scene (`WORLD_H` 19.125 m at ppm 32, top at y 78), the extra height all sky, with the focus and follow frames raised so the machine and the ground stay where they were on screen. A level may set a `line` (world y); the metric "Above the line" counts cans/blocks still above it, and a goal `aboveLine == 0` passes however the tower comes down. During flight, the camera follows the first target hit (an invisible 'impact' item) and then the fuzz, with a live distance readout. The payoff: a dust puff where a block lands (> 2 m/s, once per block per shot), and a CRASH! burst when one shot knocks down 3 targets. Blocks have a `domino` size (0.4 x 2 m). The result card lists the controls set and the outcome, showing only the property codes known at that level. Each level has a shot budget; the world persists between shots. After a shot with shots remaining, the arm reloads and the string re-ties. A bullseye-only level (nothing to knock down) never ends as "cleared"; a miss leaves the remaining shots. Targets: cans, block towers, a bullseye. Every can is drawn as the rover's can of beans (2026-10-15): `public/parts/catapult/can-beans.png` is `public/parts/rover/real/weight-beans.png` (267 x 324) centred on a transparent 267 x 534 canvas, stretched to the can's unchanged 0.4 x 0.8 m box at scale 534 / 324, so the beans draw 0.8 m tall at their own aspect (0.66 m wide, a little wider than the collider) centred on it; the can's `color` prop is now only the fill fallback. **Backdrop** (2026-10-15): the coaster's theme park (`COASTER_BACKDROP` in `spec.ts`), laid out in world metres with the coaster's stage-px sizes and heights over the ground line (both panels are 960 px wide; 32 px = 1 m), back to front: `sky.jpg` over the visible sky (y 0 to 17.625 m), the three clouds still at the coaster's start positions (x 8.4 / 21.5 / 25.9 m, y 12.2 / 16.1 / 8.4 m), `catapult-far.png` (the coaster's hills and tree line, x 0..30 m, y -0.31..9.06 m), `wheel.png` (a still picture of the coaster's code-drawn ferris wheel, same colours and haze, hub at x 10 m, 3.25 m up, 70% opaque: it stands between the catapult and the near targets and shows only its left rim in the 3.6x build view) and `catapult-mid.png` (three of the coaster's trees, at x 1, 23.6 and 29.3 m, hazed 30%; y -0.31..6.88 m). The three catapult files are 4x stage px (the coaster's are 2x) so the 3.6x build view and the 1.6x follow camera stay sharp; the kit sky is sky.jpg's top and bottom colours and the ground band's grass is the coaster's grass green over the old earth brown. Metrics: knocked down, hits, shots used, max range.

### 15 Levels

Six intro levels (one new mechanic each: power, angle, weight, arm, moving the catapult, fuzz choice) unlock the mechanics, then a challenge run followed by four lenient stack levels where top pieces sit half off an edge and the line asks only for those to come down, passing many settings.

- `power`: Fling it — angle locked, 3 shots. Introduces power.
- `angle`: Over the wall — power locked, 3 shots. Introduces angle.
- `weight`: Heavy hitter — power and angle locked, 2 shots. Introduces fuzz.
- `arm`: Long arm — power and angle locked, 2 shots. Introduces arm.
- `move`: Roll closer — power locked, 3 shots. (Dragging the catapult; no new code.)
- `donut`: Three at once — Donut locked, knock down 2 of 3 cans on shelves, 1 shot. Introduces fuzz choice (Donut).
- `both`: Bullseye — 3 shots.
- `tower`: Timber! — 2 shots.
- `line`: Bring it down — 3 wood blocks + a 2×1 plank, line 1.5, 3 shots.
- `chain`: Chain reaction — five dominoes, line 1.2, 2 shots.
- `pyramid`: Pyramid hats — wood pyramid, 3-2-1 with two blocks balanced on peak, line 3.5, 3 shots.
- `towers`: Twin towers — two tower posts with plank and balanced end blocks, line 4.5, 3 shots.
- `wall`: Wobbly wall — brick base row, wood plank, two planks half off its ends, line 2.5, 3 shots.
- `dominoes`: Domino drop — three dominoes leading into a tower, line 3.5, 3 shots.
- `free`: Free play — unlimited shots.

## Vehicle Obstacle Course (Planet Rover)

The child builds a rover for Kevin and drives it on three planets: a locked glass-dome base with Kevin inside, and parts (wheels, propulsion, weights) added via a parts shelf in the right-hand drawer. Tap the dome (or the big blue **BUILD** button) to open the drawer with the parts shelf (grouped by Wheels, Power, Weights: big picture buttons, each with its coin cost; a tap adds the part); tap a part to see its Mount row (suction cup or spring, labelled "Spring (bouncy, +1 coin)") pinned below the shelf. Unaffordable parts dim. The child drags parts anywhere around the rim and snaps them to 5-degree angles (live preview). The in-scene control is the big blue BUILD button (opens the drawer); the bottom bar's centred **DRIVE** button launches the run. The course draws its own 1.5 m of ground (`groundBand: false`): an under-layer that fills the full depth (and the panel's bottom margin), a 0.3 m crust that follows the surface (including below y = 0 on a jump's lower landing), and a dark chasm in each gap. The world is 90 m wide with a 30 m view; short levels fit the view, and long challenges scroll the camera with an intro pan (from the finish back to the start over 2.8 s; a tap skips). Focus is at zoom 2.8. Each level defines its planet, a coin budget, a palette (wheels: Round, Square, Star; propulsion: Fan, Stove, Jet; weights: Feather, Beans, Melon), its terrain (hills, slopes, stairs, gaps, rocks) and ground, and a finish beacon. Outcomes: finished, fell, stuck, timeout (no `flipped`: a rover on its roof keeps driving if wheels touch ground). Metrics: reached the finish, time, flips (full turns), distance, upside down (meters driven on the roof). A "Level complete!" win banner shows on pass with confetti, the outcome line, "Next level" and "Try again" buttons.

**Planets** (`core/planets.ts`, 2026-10-09; the course was the Marstopia Rover before): each level names one. The planet sets the gravity, the ground wherever the level says nothing else, the sky (`WorldSpec.looks`, one per planet) and the HUD chapter ("Mars · 3 of 9" in the level picker).
- **Flooftopia** (Earth for the floofs): gravity 10 (the course's old value, so the intros keep their physics), grass ground (green turf with tufts over brown soil), a bright blue sky with clouds and far green hills.
- **Mars**: gravity 3.7, rock ground (the old rust crust), a dusty butterscotch sky with the little moons Phobos and Deimos and hazy mesas.
- **Europa**: gravity 1.3, ice ground (pale blue-white with a glossy line and cracks over deep blue), a black starry sky with Jupiter low on the horizon behind ice ridges.
The wheel motors' torque cap scales with gravity (4 N.m on Flooftopia, 1.48 on Mars, 0.52 on Europa): at full torque a light Mars rover reared up and flipped at every start. So the wheels pull the same for the rover's weight everywhere, and what changes on a planet is what gravity changes: jumps fly farther (the same ramp: 3.6 m on Flooftopia, 5.1 m on Mars; with a jet 4.9 vs 12.8 m), bumps throw higher, and fans, stoves and jets (which do not scale) push a lighter rover harder.

**Surfaces** (`core/surfaces.ts`): a level's `surfaces` ranges (`sand(a, b)`, `ice(a, b)`, `rock(a, b)`, `grass(a, b)`; later ranges paint over earlier ones) change the ground along x; the terrain gets one collider per run with that ground's friction, and every fixed step each wheel takes the grip of the ground under its contact point (`PhysicsWorld.setFriction`). Grip below is the combined friction (Rapier averages wheel and ground).
- Grass, rock: the old physics (ground 0.8, wheels 1, grip 0.9).
- Sand ("Sand is soft: round and square wheels sink and slow down; star wheels paddle through. Heavy rovers sink more."): round/square grip 0.495, star 0.9; each wheel in sand is held back by its share of the rover's weight x (crr + perSpeed x speed), crr round 0.22, square 0.3, star 0.07, perSpeed 0.3 / 0.3 / 0.03. Measured on flat Mars ground (two wheels): round 6.0 m/s on rock, 0.9 in sand; square 1.9 / 0.2; star 1.9 / 1.9. A 15 degree sand slope stops round wheels (stars climb); with a fan, a melon rover crosses sand at 1.0 m/s, a feather one at 1.9. Sunk wheels are drawn sunk behind a sand berm and kick up sand puffs.
- Ice ("Ice is slippery: round and square wheels spin and slide; star wheels' points bite into the ice. Fans, stoves and jets push no matter what is under you."): ground friction 0; round grip 0.06, square 0.07, star 0.5. On flat Europa ice two round wheels creep 1.2 m in 6 s, two stars drive 6.9 m (on Mars ice: round 1.0 m/s, star 2.2 m/s at seconds 4-8). Wheels spinning on ice spray chips.
- Rocks standing in sand: `rocks: [rockAt(x, 'small' | 'medium' | 'big')]` in a level raises a hard lump into the terrain (`withRocks`), makes it rock ground and draws it with a rock picture standing in the sand.

Wheels (Round "Fast and smooth on flat ground." 2 coins, Square "Cheap and bumpy. Slow!" 1, Star "Climbs almost anything. Grips sand and ice!" 3) are motors (6 m/s) that keep driving in any orientation: a wheel on the ground spins the normal way; a wheel more than 20 deg above the dome's centre spins the other way, so a rover on its roof still goes forward. Propulsion (Fan "A gentle push. Stick it on the back." 2, Stove "Puffs of push! Stick it on the back." 3, Jet "A huge push. Watch out, it can lift you!" 5) pushes the dome away from themselves. Weights (Feather "Almost no weight." 1, Beans "Adds some weight to hold you down." 2, Melon "Heavy! Great for ramming." 3) sit on a plate. Every part mounts with a suction cup (rigid, free) or spring (soft, labelled "Spring (bouncy, +1 coin)", +1 coin); springs are a vertical prismatic suspension (2.5 Hz, damping tuned per part type, ±0.15 m travel). A level's coin budget is shown in the drawer header "🪙 used / total" and refused adds show "Not enough coins for that part!". The palette is the concept gate per level, and mount unlocks mid-course. Tap tutorials (coach) guide the five Flooftopia levels (wheels: build, add one Round wheel, add another, watch DRIVE, next; shape: try the Star wheel; mount: tap a wheel and pick Spring; weight: add a Melon on front; power: add a Fan on back).

### Levels

One file per planet under `core/levels/` (`flooftopia.ts`, `mars.ts`, `europa.ts`, built with `shared.ts`'s `level()`; `core/levels.ts` joins them), each with its own test file (`levels/*.test.ts`; `levels/prove.ts` proves every solution by simulation).

Flooftopia (the intros, the 2026-10-02 levels unchanged in physics, one new mechanic each):
- `wheels`: Grassy hill — budget 4. Introduces wheels.
- `shape`: Stone steps — budget 6. Introduces star wheels.
- `mount`: Bumpy road — budget 6. Introduces the spring mount.
- `weight`: Boulder push — budget 7. Introduces weights.
- `power`: Big hill — budget 8. Introduces propulsion.

Mars (g 3.7: jumps fly about 40% farther and bumps throw the rover high, so springs and "not too fast" matter; every challenge retuned on 2026-10-09):
- `jump`: Crevasse jump — budget 9. Welcome to Mars: an 8 m crevasse plain wheels cannot clear; land on the wheels.
- `rubble`: Rubble field — budget 10, stay right side up, under 12 s.
- `race`: Flat plain race — budget 9, under 4 s.
- `sand`: Soft sand — budget 9. Meets sand: a 15° sand rise; round and square wheels get stuck, stars or a pusher climb.
- `dunes`: Dune dash — budget 12, under 10 s. Sand dunes; stars alone are too slow.
- `rocky`: Rocky sand — budget 9. Meets rocks in sand: stiff wheels stop at a rock, springs pass.
- `rockfield`: Rock garden — budget 12. A big rock and a dune in sand; fast rovers get tossed.
- `flip`: Topsy-turvy — budget 12. Sand at each cliff edge tips the rover onto its roof; needs wheels on top and bottom.
- `canyon`: Canyon climb — budget 12. A 4 m wall at 45°.
- `ridge`: Rocky ridge — budget 14. Uneven ridge; springs help.
- `hops`: Crater hops — budget 15. Gaps of 2.5, 4, 5.5 and 7.5 m.
- `marathon`: Mars marathon — budget 20, under 30 s. Rubble, steps, a jump, then sand with a dune and rocks.
- `free`: Roam Mars — budget 40. Free play, with sand and rocks.

Europa (g 1.3, ice everywhere unless a level lays rock: round and square wheels slip, star wheels bite, pushers push regardless; added 2026-10-09):
- `ice`: Icy hill — budget 8. Meets ice: wheels-only round or square builds spin at the foot of the hill.
- `crack`: Floaty jump — budget 8. An icy ramp and a 6 m crack; only a pusher floats across.
- `frozen`: Frozen rocks — budget 10, stay right side up. Rocks in ice; stars need springs.
- `runway`: Rock runway — budget 8. A rock run-up before a crack: the one Europa level plain round wheels win.
- `trek`: Europa trek — budget 14. Long, scrolling: icy climbs, a rock road, a crack, rocks.

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

Real Kodable art from the Marketing Library (map: `docs/marketing-library.md`), the **Planet Rover** (formerly Marstopia Rover) is `public/parts/rover/real/`: `manifest.json` (trimmed sizes, anchor points), `cockpit.png` (dome base), `kevin.png` (Kevin's portrait), `shadow.png` (ground shadow), `wheel-circle.png` / `wheel-square.png` / `wheel-star1.png` (wheels), `power-fan.png` / `power-stove.png` / `power-jet.png` and `-flip.png` mirrors (propulsion), `fx-thrust.png` / `fx-poof.png` (thrust flame, poof cloud), `weight-feather.png` / `weight-beans.png` / `weight-watermelon.png` (weights), `plate.png` (weight plate), `spring.png` / `suctioncup.png` (mounts). The scale rule lives in `core/art.ts`: dome and Kevin at BASE_PPM (323.5 px / 0.75 m = 431.3 px/m), all other parts at PART_PPM (200.6 px / 0.3 m = 668.7 px/m, the circle wheel's scale).

**Part flight.** Tapping a drawer picture flies a copy of it to the machine (`CourseSpec.partTargets` gives world-meter targets; the kit converts them with `worldToStage`), and the change commits when it lands (520 ms; a fallback timer commits after 920 ms if the animation clock stalls). Two wheels = two copies.

Real Kodable art from the Marketing Library (map: `docs/marketing-library.md`), processed with a scratch Pillow script:
- **Catapult parts** (real exports, square canvases centred on the machine body): `public/parts/catapult/real-base.png` (plank + A-frame + blue hub), `real-arm-Short.png` and `real-arm-Long.png` (blue-striped launch arm with cup), `real-cup.png` (cup front drawn over the fuzz), `real-lever.png` (wood angle arm's blue pad and stick), `real-gear.png` (star gear), `real-hook.png` (band and string hooks), `real-band-3.png` through `real-band-29.png` (eight strength band lengths for scaling).
- **Fuzzes** `public/parts/catapult/fuzz-{Flower,Donut,Fur,Helmet,Metal}.png`: the five fuzzes in weight order, normal face on the arm and in the drawer. Fuzz body centred at 1/1.44 of a square canvas, baked ground shadow cut out, drawn `upright` on the swinging arm. (The old fuzz-Light.png, fuzz-Medium.png, fuzz-Heavy.png, fuzz-Prism.png remain in public/parts/catapult/ but unused by the catapult.)
- **FX** `public/fx/dust.svg` (dust puff where a falling block lands) and `public/fx/crash.svg` (CRASH! burst when one shot knocks down 3 targets).
- **Backdrops** (`WorldSpec.backgrounds`, world-meter picture layers under the ground strip): the catapult uses the coaster's theme-park layers (`public/bg/coaster/`, see Catapults; `public/bg/park.jpg` now only backs the launcher); for the rover one look per planet (2026-10-09, made for it): Flooftopia `flooftopia-clouds.png` and `flooftopia-hills.png` (with the library's Fuzztopia trees), Mars `mars-phobos.png`, `mars-deimos.png` and `mars-far.png`, Europa `europa-stars.png`, `jupiter.png` (the library's solar-system Jupiter) and `europa-far.png`; the ground effects and rocks are `public/parts/rover/fx-sand.png`, `fx-sand-heap.png`, `fx-ice.png` and `rock-1..3.png`. The rover's old night sky (`mars-sky.jpg`, `mars-sky-wide.jpg`) is no longer used; `mars-planet.png` still decorates the launcher card.
- **Rover cargo** `public/parts/rover/cargo-Light.png` (heart balloons) and `cargo-Heavy.png` (boulder); the crate stays an SVG.
- **Hit bursts** `public/fx/pow.png` and `boom.png`: the catapult sim emits a `sprite` overlay (grow, hold, fade over 0.7 s) when the fuzz first touches a can or bullseye (POW) or a block (BOOM).

No can, bullseye or Mars-ground terrain art exists in the library; those stay as SVGs. Bruno stays the Spine animation.

## Adding a part kind

Add the kind to `PartKind` in `core/types.ts`, its descriptors in `catalog.ts` (label, icon, options per property), its bodies and visuals in `build.ts` (the `buildPart` function), and a chip label in `ui/goldbergHud.ts` (Goldberg) or `ui/structuresHud.ts` (Structures). Both courses share the kit.

## Adding an activity

Create `src/activities/<id>/index.ts` exporting an `ActivityDef` object with: `id` (URL slug), `title` (display name), `icon` (emoji), `bruno` (one-line pitch), `status` (`'ready'` or `'planned'`), `plan` (shows on placeholder), and `start(host)` returning a handle with `destroy()` method. Placeholders use `plannedActivity(...)` from `src/activities/planned.ts`. The coaster activity in `src/activities/coaster/index.ts` shows how to boot a Phaser game inside `host.game` and an HTML overlay inside `host.ui`, and how to tear both down.

Add your activity to `ACTIVITIES` in `src/activities/registry.ts`.

## Dev notes

`window.__game` and `window.__app` exist only while the coaster is open. `window.__gapp` is the Goldberg app, `window.__sapp` is the Structures app, `window.__capp` is Catapults, `window.__vapp` is the Vehicle app, `window.__bapp` is Bridge Builder. The HUD is laid out in 1024×768 stage pixels and scaled onto the canvas. The canvas renders at `RENDER_SCALE` (device pixel ratio, capped at 2) times the stage and the camera zooms by the same factor, so stage coordinates stay 1024×768 while the picture is crisp. The builder kit uses two cameras (the world camera is clipped to the panel and zooms/follows; Bruno's dialog stage rides the world camera, pinned in the frame), so map a pointer with `worldCam.getWorldPoint(pointer.x, pointer.y)`, not `pointer.worldX/worldY`. The design lives in the Notion doc "Creator Phaser Architecture". Design rule (2026-09-16 stakeholder huddle): variables are set by hand on the machine before Play; Play is the experiment; the child only watches after the start.

## Playtest deploy

The playtest build lives on the `theme-park-playtest` branch of `Kodable/CreatorRig` (an orphan branch; the rig stays on `main`) and deploys to the Heroku app `kodable-creator-rig` (`git push heroku theme-park-playtest:main`). Heroku runs `heroku-postbuild` (`vite build`) and `node server.mjs` (Procfile), a zero-dependency static server for `dist/`. The park map (`src/launcher.ts`, `PARK_ACTIVITIES` in the registry) shows only the Rollercoaster, Catapults and Planet Rover; the other activities stay reachable by URL (`?activity=bridge`). Hero pictures for the cards are composed PNGs in `public/home/`.
