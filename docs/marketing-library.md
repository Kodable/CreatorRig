# Kodable Marketing Library — reference

Surveyed 2026-09-22 for Bruno's Theme Park (catapult and rover courses). Re-check counts before
relying on them; the folder is Dropbox-synced and changes.

## 1. Overview
**Root:** `/Users/gao/Documents/Marketing Library`.
**Path prefix used below:** `GSA` = `/Users/gao/Documents/Marketing Library/Game Specific Assets`.

About 1,519 files:
- **Formats:** 1,444 PNG, 26 JPG/JPEG, 4 JFIF, 1 WEBP, 15 GIF, 12 MP4, 7 MOV, 5 SVG, 3 FLA, 1 ZIP.
- **No PSD or AI files.** Near-miss: the extensionless `Photography/Kids Playing Kodable Photos Students/Marketing_RemoteLearning_pic01psd`.
- **Vectors:** only 4 unique SVGs, in `archive/marketing for jon/svgs4jon/` (baby gnome, baby slime, fuzzbuzz body, male gnome); a copy of the fuzzbuzz body sits one level up.
- **Mostly finished exports** for Basics (fuzzes), Creator (floofs), Bug World and Typing, plus photos and video.

**Naming habits**
- Fuzzes: camelCase `<name>Fuzz_<pose>.png` (`blueFuzz_idle.png`, `coleFuzz_excited.png`). Inconsistent: `_norm` vs `_normal`, and reversed `fuzzShaggy_*`.
- Creator coding sprites: `Category_Name.png` (`Collectable_Star.png`, `Obstacle_Balloons.png`, `Character_SportsCar.png`, `Decoration_TrafficCone.png`, `Platform_Stone.png`), often with a `_Sparkles` variant.
- Typing: `typing_course_<grade>_<island>_<item>.png`.
- Event prefixes: `hal_`, `valentine_`, `winter_`, `b2s2023_`, `creator_thnksgvng_`, `phys_paddy_`.
- Engineering buttons: `btn_crs_pcd_*`.
- Photoshop layer-export names: `_0007_rainbow-cat-fuzz.png`, `carebot__0008_Layer-3.png`.
- Names that need quoting in scripts: spaces, colons and `!` (`Basics : Fuzz Specific`, `Heroes : Towers`, `background exporter !!_.png`, `ChallengeComplete!.png`); a space after an underscore (`bugworld_ hero_tower_*`); doubled extensions (`bg_fantasy.png.png`, `creator_thnksgvng_legbeam2_wpin.png.png`); `copy` suffixes.

## 2. Folder tree (file counts, types)
Many folders are empty (marked "empty").
```
Marketing Library/
├── archive/ (10: 5 svg, 3 fla, 1 png, 1 mov) old vector/Flash sources
│   └── marketing for jon/ (9) fuzzbuzz svg/png, gnome & slime .fla; svgs4jon/ (4 svg)
├── Classroom Materials/ (27 png) HOC 2022 Pet Bio Worksheets/ (7), Stickers/ (20: stickers 2023/, stickersForprinter/)
├── Directed Drawing/ (5 png) drawing-lesson sheets (+Archive/)
├── Game Specific Assets/ (1,408: 1,385 png, 14 gif, 5 mp4, 2 mov, 2 jpg)
│   ├── Basics/ (609) the fuzz coding game
│   │   ├── Area Specific/ (203)
│   │   │   ├── Courses Planets and Mazes/ (100) Moongarden props, Asteroid Belt props, old Smeeborg/Aquatopia decor, Planets/ (7 icons)
│   │   │   ├── Fuzztopia/ (20) trees, bushes, mushrooms, slide, tent, Cole drill
│   │   │   ├── Pets/ (83) carebots, compositions, pet props, food/bath icons
│   │   │   └── Challenges, Daily Spinner, Fuzz Builder, Maze Maker, Store, Vortex: empty
│   │   ├── Basics : Fuzz Specific/ (35) fuzz scenes (balloon fuzzes, family, dance, telescope)
│   │   ├── Characters/ (122) Fuzz Family/ (39), Random fuzzes/ (42), Supporting Characters/ (38), Back To School Superhero Fuzzes/ (3)
│   │   ├── Environments/ (34) full backgrounds, paywalls, Maze Backgrounds/ (12), hoc thumbnails/ (8)
│   │   ├── Events/ (119) halloween/ (60), winter/ (19), valentines/ (18), b2s_2023/ (21), spring/ (1)
│   │   ├── Misc art/ (39) iPad mockups, clouds, poof, Difficulty Icons/ (5), vortex/ (4), high res for jon/ (4)
│   │   ├── Props/ (15) grass plot, danger hole, loop arrows, Space Ships/ (7), Misc Animals/ (3)
│   │   ├── Screenshots/ (37) per-area screenshots
│   │   ├── UI assets/ (2) carebot & fuzz-builder UI mockups
│   │   └── Archive/: empty
│   ├── Bug World/ (51: 48 png, 2 mov, 1 mp4) Backgrounds/ (3), Characters/ (38: Heroes : Towers 15, Slimes 19, Rune Function Characters 4), Game Screens/ (2), Props/ (1), Scenes and Moments/ (2), Title Treatments/ (2), Screenshots/ (video)
│   ├── Creator/ (428: 411 png, 13 gif, 4 mp4) Flooftopia creator app
│   │   ├── Characters/ (32) Floofs/ (7 incl. Bruno), Pixel/ (11 png + 4 gif), Bugs/ (1), Bug GIFs/ (9 gif)
│   │   ├── Course Art/ (320) Coding Course Art/ (218: 10 theme sets + ~100 screenshots + 4 mp4), Engineering (15), Math (33), Science (20), Digital Citizenship (15), Particles (6), Challenges (5), Game Sharing (4), QuickShuffle (4)
│   │   ├── Events/ (27) St. Paddy's/ (10), Thanksgiving/ (17) physics-level pieces
│   │   ├── UI Assets/ (18) titles, pills, thumbnails, Subject Icons colored/ (5)
│   │   ├── World Assets/ (19) hub backgrounds, Buildings Final V1/ (12), Scenes and Moments/ (5)
│   │   ├── Archive/_CatBot/ (11) catbot poses
│   │   └── floof_bruno_teacher_chalkboard.png
│   ├── Portfolios/ (29) Sample Badges/ (badge_over/under + Minor/ 27); Major/, Screenshots/: empty
│   ├── Shared/ (1) fuzzes_floofs_checkers_bruno_kevin_violet.png
│   ├── Trading Cards/ (51) Card Assets/{Basics 21, Bugworld 7, Creator 13, Typing 9} (750x1050); Binder/, Screenshots/: empty
│   └── Typing/ (239)
│       ├── Course Islands/ (161) Island Assets by Grade Level/ (117), island backgrounds/ (22), whole islands no ocean/ (16), Grade Icons/ (6)
│       ├── Mini Games/ (46) Splash Dash/ (42), Wipeout/ (3), Home Rowing/ (1); Hooked/: empty
│       ├── Lessons/ (17) Courses/ (12), Interstitial Games/Tiki Jeep/ (5)
│       └── Core Characters/ (3), Typing Scenes and Moments/ (5), course overview images/ (3), Screenshots/ (3), UI Assets/ (1); Customized Keyboards/: empty
├── Photography/ (52 jpg/png/jfif/webp) Kids Playing Kodable Photos Students/ (30), Students Using Kodable/ (22)
└── Video and Animation Assets/ (17: 7 mp4, 4 mov, 4 png, 1 gif, 1 zip) app videos, Marketing Intro/, Website/Carousel Videos/, happyblue.gif
```

## 3. Where to find X
- **Fuzz Family:** `GSA/Basics/Characters/Fuzz Family/<Name>/`, about 570 px wide, alpha. **Every one has a soft grey ground shadow baked in.**
  - Blue: idle, excited, happy_tilted_looking_up.
  - Checkers, Pro: norm, excited. Shadow: normal, excited3. Shaggy: normal, excited, fan. Skillz: normal, excited, full_SkillzFuzz, badgeicon_tower_skillz.
  - Cole, Diamond, Gracie, Princess, Prism, Ruby, Senor, Simon, Snowy, Spike, Violet: normal and excited.
- **Other fuzzes:** costumed `GSA/Basics/Characters/Random fuzzes/with shadows/` and `.../without shadows/`; rocket `GSA/Basics/Characters/Random fuzzes/bluefuzz_in_rocket.png`; superheroes `GSA/Basics/Characters/Back To School Superhero Fuzzes/`; Halloween `GSA/Basics/Events/halloween/Halloween fuzzes/`; Christmas `GSA/Basics/Events/winter/xmas fuzzes/`; scenes `GSA/Basics/Basics : Fuzz Specific/`.
- **Bruno (teal engineer floof, yellow hard hat):**
  - Main pose: `GSA/Creator/Characters/Floofs/engineer bruno floof.png`.
  - Card version: `GSA/Trading Cards/Card Assets/Creator/Card Characters Only/bruno.png`.
  - Teacher: `GSA/Creator/floof_bruno_teacher_chalkboard.png`.
  - Group shot: `GSA/Shared/fuzzes_floofs_checkers_bruno_kevin_violet.png`.
  - Magnet scene: `GSA/Creator/World Assets/Scenes and Moments/creator_bruno_magnet.png`.
  - Typing poses: `GSA/Typing/Course Islands/Island Assets by Grade Level/5th Grade Island Marketing Assets/typing_course_5_3_bruno_on_log.png`, `.../typing_course_5_2_climbing_wall_bruno.png`, `GSA/Typing/Course Islands/Island Assets by Grade Level/3rd Grade Island Marketing Assets/typing_course_3_1_bubble_blower_bruno.png`.
  - Card background: `GSA/Trading Cards/Card Assets/Creator/Card Backgrounds Only/bruno_card_background.png`.
- **Supporting characters:** `GSA/Basics/Characters/Supporting Characters/` (Aliens with `_noShadow` variants, Beach Cleanup Animals, Fuzzbuzz, Cloudhaven Fuzzerflies, Gnomes, Aquatopia Flamingos); floofs `GSA/Creator/Characters/Floofs/`; Pixel `GSA/Creator/Characters/Pixel/`; CatBot `GSA/Creator/Archive/_CatBot/`; slimes and heroes `GSA/Bug World/Characters/`; carebots `GSA/Basics/Area Specific/Pets/Carebots/`; typing racers `GSA/Typing/Mini Games/Splash Dash/Characters/`.
- **Props:** Basics props and 7 space-ship parts `GSA/Basics/Props/`; physics pieces `GSA/Creator/Course Art/Engineering Course Art/`, `GSA/Creator/Events/St. Paddy's/`, `GSA/Creator/Events/Thanksgiving/`; rocks and meteors `GSA/Basics/Area Specific/Courses Planets and Mazes/Asteroid Belt/Props/Old Asteroid Belt Decorations/` and `.../Smeeborg/Archive/old smeeborgmaze decorations/`; island decor `GSA/Typing/Course Islands/Island Assets by Grade Level/`.
- **Environments / backgrounds:**
  - Park: `GSA/Basics/Environments/background exporter !!_.png`.
  - Grass: `GSA/Basics/Environments/Maze Backgrounds/background_grass_HighDef.png`. Dirt: `.../background_dirt_HighDef.png`.
  - Space: `GSA/Basics/Environments/Maze Backgrounds/background_space_HighDef.png`, `background_space02_HighDef.png` (copy of the first in `GSA/Creator/Course Art/Science Course Art/Solar System/`).
  - Dark starfield: `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_bg.png`.
  - Sky: `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Sky/sky1_bg.png`, `sky1_bg2.png`.
  - Other: `GSA/Basics/Environments/` (paywalls, moongarden, winter, beach `2019_hoc_background2.png`), `GSA/Bug World/Backgrounds/`, `GSA/Typing/Course Islands/island backgrounds/`.
- **UI / subject icons** (no generic play, hint or lock buttons exist): `GSA/Creator/UI Assets/` (titles, pills, thumbnails); `GSA/Creator/UI Assets/Subject Icons colored/` (eng, math, science, digcit, gamedes); `GSA/Creator/Course Art/Challenges/` (trophy, banner, credit); `GSA/Basics/Misc art/Difficulty Icons/`; retry arrows `GSA/Basics/Props/loop-landmark.png`; wood plank `GSA/Typing/UI Assets/wood button.png`; keyhole gate `GSA/Creator/Course Art/Coding Course Art/KeyQuest_Backyard/Gate_Garden.png`.
- **Particles / effects** (no confetti): `GSA/Creator/Course Art/Particles/` (Boom, Pow, Pew, Boo, twinkle, GostCircle; 2000x2000); stars `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Space/Collectable_Star*.png`, `GSA/Basics/Events/b2s_2023/b2s2023_star1.png`, `b2s2023_star2.png`, `b2s2023_startrail.png`; puff `GSA/Basics/Misc art/poof.png`; flame `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_shipthrust.png`.
- **Bug World:** `GSA/Bug World/`.
- **Creator world:** `GSA/Creator/World Assets/` (hub `creator_main_game_screen_empty.png` 4122x1540; `Buildings Final V1/`).
- **Creator course art:** `GSA/Creator/Course Art/Coding Course Art/<Theme>/`. Low-poly sprites on **1181x941 transparent canvases with heavy padding: trim before use.**
- **Typing islands:** `GSA/Typing/Course Islands/`. **Trading cards:** `GSA/Trading Cards/Card Assets/`.
- **Photography:** `/Users/gao/Documents/Marketing Library/Photography/`.
- **Video:** `/Users/gao/Documents/Marketing Library/Video and Animation Assets/`, `GSA/Creator/Course Art/Coding Course Art/Creator Screenshots/*.mp4`, `GSA/Bug World/Screenshots/`.

## 4. Format notes
- **Backgrounds:** 3356x1536 (about 2.18:1) or 2048x1536 (4:3); Creator hub 4122x1540 or 3776x1452. Some report alpha but are visually opaque (`background exporter !!_.png`, `background_dirt_HighDef.png`, `marketing_addition_bg.png`).
- **Characters:** fuzzes about 570x590–790; floofs about 500–900 px; trading cards 750x1050.
- **Props and icons:** 100–800 px. Particles 2000x2000. Planets 325–600 px.
- **Alpha:** nearly all character and prop PNGs have alpha.
- **Baked shadows:** Fuzz Family (soft grey ellipse); floofs such as Bruno and Pixel (grey ground ellipse); Random fuzzes and Aliens have separate no-shadow variants; Basics/Typing props (light grey ground shadows); Creator low-poly sprites (often flat grey shadow polygons).
- **White-only PNGs** (look blank on white): `GSA/Creator/Course Art/Particles/Particles_twinkle.png`, `GSA/Creator/UI Assets/ui_dots.png`.
- **How the theme park uses fuzz art:** the catapult's `public/parts/catapult/fuzz-*.png` are the Fuzz Family PNGs normalised (fur body centred, 1/1.44 of a square canvas, ground shadow cut out). Pillow script pattern: measure the widest opaque row below the hat for the body diameter, centre on it, clear pixels below the body outside a slightly larger circle.

## 5. Catapult / rover / Bruno / UI candidates (survey 2026-09-22)
None of these exist in the library: catapult, rubber bands, protractor, cans, bullseye, rover, square/star wheels, springs, beacon, Mars terrain, confetti.

### Bruno
| Path | Size | α | Depicts | Fit |
|---|---|---|---|---|
| `GSA/Creator/Characters/Floofs/engineer bruno floof.png` | 563x776 | yes | standing, wrench and blueprint | direct |
| `GSA/Trading Cards/Card Assets/Creator/Card Characters Only/bruno.png` | 750x1050 | yes | same pose, card canvas | direct (trim) |
| `GSA/Typing/Course Islands/Island Assets by Grade Level/5th Grade Island Marketing Assets/typing_course_5_3_bruno_on_log.png` | 342x327 | yes | pointing, on a log | crop |
| `GSA/Creator/floof_bruno_teacher_chalkboard.png` | 620x536 | yes | grad cap, chalkboard | direct |
| `GSA/Typing/Course Islands/Island Assets by Grade Level/5th Grade Island Marketing Assets/typing_course_5_2_climbing_wall_bruno.png` | 1037x945 | yes | climbing wall | inspiration |
| `GSA/Typing/Course Islands/Island Assets by Grade Level/3rd Grade Island Marketing Assets/typing_course_3_1_bubble_blower_bruno.png` | 588x759 | yes | small Bruno, bubble wand | crop |
| `GSA/Shared/fuzzes_floofs_checkers_bruno_kevin_violet.png` | 1343x630 | yes | group shot | crop |
| `GSA/Creator/World Assets/Scenes and Moments/creator_bruno_magnet.png` | 1000x1000 | no | scene with magnet and ball | inspiration |
| `GSA/Trading Cards/Card Assets/Creator/Card Backgrounds Only/bruno_card_background.png` | 750x1050 | yes | blueprint grid, gears, wood floor | inspiration |

### Catapult
| Piece | Path | Size | α | Fit |
|---|---|---|---|---|
| Frame wood | `GSA/Creator/Course Art/Engineering Course Art/btn_crs_pcd_triangle.png` | 214x213 | yes | crop |
| Lever idea | `GSA/Creator/Course Art/Engineering Course Art/Archive/btn_crs_pcd_fulcrum.png` | 434x187 | yes | inspiration |
| Fling idea | `GSA/Typing/Course Islands/Island Assets by Grade Level/1st Grade Island Marketing Assets/typing_course_1_2_seesaw_sand_shovel_kevin_simon.png` | 916x735 | yes | inspiration |
| Log | `GSA/Typing/Lessons/Interstitial Games/Tiki Jeep/interstitial_log.png` | 231x110 | yes | direct |
| Plank | `GSA/Typing/UI Assets/wood button.png` | 431x270 | yes | direct |
| Brick block / wall | `GSA/Creator/Course Art/Coding Course Art/bugged assets/bugged_wall.png` | 512x389 | yes | edit (bug face baked in) |
| Steel ball | `GSA/Creator/Course Art/Engineering Course Art/marble_metal_dark.png` | 454x454 | yes | direct |
| Shelf | `GSA/Creator/Course Art/Engineering Course Art/btn_crs_pcd_platform.png` | 1737x220 | yes | direct |
| Shelf alt | `GSA/Creator/Events/Thanksgiving/creator_thnksgvng_platform_long.png` | 1146x192 | yes | good |
| Tower | `GSA/Creator/Course Art/Coding Course Art/CaptureFlag_Nature/Platform_Stone.png` | 841x1319 | yes | crop |
| Block stand-in | `GSA/Creator/Course Art/Coding Course Art/RunJump_Winter/Collectable_Giftbox.png` | 1181x941 | yes | inspiration |
| Bullseye on post | `GSA/Creator/Course Art/Coding Course Art/Valentines/valentine_flag1.png` | 297x454 | yes | recolor |
| Ground | `GSA/Basics/Environments/Maze Backgrounds/background_dirt_HighDef.png` | 3356x1536 | yes* | direct |
| Hill | `GSA/Basics/Events/b2s_2023/hill.png` | 1876x535 | yes | direct |
| Park background | `GSA/Basics/Environments/background exporter !!_.png` | 3356x1536 | yes* | direct |
| Sky | `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Sky/sky1_bg.png` | 2048x1536 | no | direct |
| Park props | `GSA/Creator/Course Art/Coding Course Art/RunJump_City/Obstacle_Bench.png` (+`Decoration_Tree.png`, `Decoration_Bush.png`, `Decoration_TrafficCone.png`) | 1181x941 | yes | trim |
| Cloud puff | `GSA/Basics/Misc art/poof.png` | 133x110 | yes | direct |

### Rover (Marstopia)
| Piece | Path | Size | α | Fit |
|---|---|---|---|---|
| Body parts | `GSA/Basics/Props/Space Ships/ship0001.png` … `ship0007.png` | 800x800 | yes | crop |
| Vehicle idea | `GSA/Typing/Lessons/Interstitial Games/Tiki Jeep/interstitial_tikijeep.png` | 624x450 | yes | inspiration |
| Round wheel | `GSA/Creator/Course Art/Coding Course Art/RunJump_City/Character_SportsCar.png` | 1181x941 | yes | crop |
| Star wheel base | `GSA/Basics/Events/b2s_2023/b2s2023_star1.png` | 258x241 | yes | inspiration |
| Engine flame | `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_shipthrust.png` | 273x163 | yes | direct |
| Engine alt | `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_ship.png` | 719x370 | yes | crop |
| Balloons | `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Sky/Obstacle_Balloons.png` | 1181x941 | yes | crop |
| Balloon alt | `GSA/Basics/Events/valentines/valentine_heartballoon.png` | 276x414 | yes | direct |
| Boulder | `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_asteroid.png` | 435x406 | yes | direct |
| Boulder alt | `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Space/asteroid.png` | 390x364 | yes | direct |
| Red boulder | `GSA/Basics/Area Specific/Courses Planets and Mazes/Asteroid Belt/Props/Old Asteroid Belt Decorations/asteroidbelt_meteor01.png` | 222x226 | yes | direct |
| Rubble | `GSA/Basics/Area Specific/Courses Planets and Mazes/Asteroid Belt/Props/Old Asteroid Belt Decorations/asteroidbelt_debris01.png` | 311x282 | yes | direct |
| Rock piles | `GSA/Basics/Area Specific/Courses Planets and Mazes/Smeeborg/Archive/old smeeborgmaze decorations/smeeborg_rock01.png`; `.../theme_smeeborg_rock02.png` | 296x259; 302x236 | yes | direct |
| Gap | `GSA/Basics/Props/danger-hole.png` | 800x800 | yes | edit |
| Finish flag | `GSA/Creator/Course Art/Coding Course Art/CaptureFlag_Nature/Flag_Stick.png` | 1181x941 | yes | trim |
| Terrain | `GSA/Basics/Environments/Maze Backgrounds/background_dirt_HighDef.png` | 3356x1536 | yes* | rust recolor |
| Mars in sky | `GSA/Creator/Course Art/Science Course Art/Solar System/science_solar_system_planet_mars.png` | 590x590 | yes | direct |
| Starry sky | `GSA/Creator/Course Art/Math Course Art/Addition/marketing_addition_bg.png` | 3356x1536 | yes* | direct |
| Space alt | `GSA/Basics/Environments/Maze Backgrounds/background_space_HighDef.png`; `background_space02_HighDef.png` | 3356x1536 | no | direct |
| Locals | `GSA/Basics/Characters/Supporting Characters/Aliens/asteriodia_character_alien01_noShadow.png` | 227x247 | yes | optional |

### UI / celebration
| Path | Size | α | Depicts | Fit |
|---|---|---|---|---|
| `GSA/Creator/Course Art/Particles/Particles_Boom.png` (+`Particles_Pow.png`) | 2000x2000 | yes | comic BOOM burst | trim |
| `GSA/Creator/Course Art/Particles/Particles_twinkle.png` | 2001x2001 | yes | white-only sparkles | verify |
| `GSA/Creator/Course Art/Coding Course Art/HighFlyer_Space/Collectable_Star.png` (+`Collectable_Star_Sparkles.png` 1617x1563) | 1181x941 | yes | low-poly star | direct |
| `GSA/Basics/Events/b2s_2023/b2s2023_startrail.png` | 549x106 | yes | star streak | direct |
| `GSA/Creator/Course Art/Challenges/trophy.png` | 347x347 | yes | trophy in rainbow ring | direct |
| `GSA/Creator/Course Art/Challenges/ChallengeComplete!.png` | 862x538 | yes | complete banner with catbot | inspiration |
| `GSA/Basics/Props/loop-landmark.png` | 800x800 | yes | retry arrows | crop |
| `GSA/Creator/Course Art/Coding Course Art/KeyQuest_Backyard/Gate_Garden.png` | 1181x941 | yes | keyhole gate (lock idea) | inspiration |
| `GSA/Creator/UI Assets/Subject Icons colored/sub_icon_eng.png` | 280x240 | yes | gear engineering icon | direct |
| `GSA/Basics/Characters/Fuzz Family/Blue/blueFuzz_excited.png`, `blueFuzz_happy_tilted_looking_up.png` | 570x593; 336x371 | yes | Blue fuzz poses | direct |

\*Flagged alpha but visually opaque.
