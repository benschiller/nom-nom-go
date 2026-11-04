---
name: art-production
description: Produce Nom Nom Go! artwork pieces with Muse Image, proper SAM 3.1 cut-outs and QA. Use for creating, re-cutting, revising or importing any game art asset (characters, items, props, backgrounds). Screen layout and integration belong to art-integration.
---

# Art production — Nom Nom Go!

This skill makes asset files and stops with a QA-passed, versioned asset in
`generated_images/production/`. Where pieces go on screen, and getting a
screen to match its storyboard, belongs to `.muse/skills/art-integration/`.

**Keep this file current.** Whenever the process changes, update this file
in the same piece of work. It is the single source of truth; the Claude
Code pointer in `.claude/skills/` only redirects here.

## Scope (v1 hackathon launch)

v1 is **burger only**. Burger ingredients, the six monsters' kitchen window
poses and the kitchen buttons are in the current style and process. Pizza and
sundae items keep their legacy manifest entries (future development, not
dealt in play) and are not regenerated for v1.

## Sources of truth

- Approved storyboards and character sheets: `generated_images/approved/`.
  Never edit them, and never cut pieces out of them (see "Abandoned").
- **Pristine raw generations:** `generated_images/production/source/<id>.v<n>.png`.
  These are Muse Image's untouched output on a flat key colour. Every
  cut-out starts from one of these, never from an existing cut-out.
- Asset list, prompts, sizes: `tools/art/build_manifest.py`, which writes
  `tools/art/manifest-v2.json`. After editing it, diff the manifest: only
  the intended ids may change.
- Ledger (versions, sources, QA): `generated_images/production/ledger.json`.
- Research behind this process:
  `research/reports/Transparent game sprite pipeline.md`.

## Models (Meta API, https://api.meta.ai/v1, key `MUSE_API_KEY` in `.env`)

- **Muse Image** (`muse-image-1.0`, Responses API, `image_generation`
  tool). Turn web/image search and shell off. It has **no transparency**:
  output is always opaque. `size` sets aspect only (1536x1024 gives a
  1920x1280 image), and the largest aspect is 3:2. It **cannot extend an
  existing picture's edges**: asked to outpaint, it re-zooms or redraws
  with drift (tested 2026-11-02, both ways).
- **SAM 3.1** (`sam-3.1`), used exactly as Meta documents
  (dev.meta.ai/docs/sam/overview, /docs/media-segmentation, cookbook
  `07_sam/01_api_basics`):
  - `POST /v1/responses`, `stream: true`, one user message with one
    `input_text` and one `input_image` (data URL).
  - The text is a short noun phrase for **one** concrete object. One
    concept per request; zero matches returns empty output (not an error).
  - Parse with `meta_sam_parser` (`.venv-sam`, pinned 0.1.0), and call
    `parser.finish(CompletedOutcome())`.
  - Keep the default lossless mask encoding (never `one_bit`).
- **Muse Spark** (`muse-spark-1.3`, never `-contributor`): advisory QA
  only. It scores whole downscaled images and has passed visibly broken
  edges and seams. Its pass never replaces looking at the file yourself.

## The cut-out process (`cutter: "sam-soft"`, `soft_cut()` in `tools/art/art.py`)

1. **Generate alone on a flat key colour.** Magenta `#FF00FF` by default;
   **green** (`key: "green"`) for purple or pink subjects. Add "no drop
   shadow, no ground" to the prompt.
2. **SAM decides WHAT the subject is.** `sam_cut.py <img> "<noun>" <out> --coverage`
   returns SAM's soft coverage. The public decoder thresholds coverage at
   129, which lands mid-outline and gave the chewed edges, so the soft
   bytes are read via `_decode_lossless_raster`.
   - Noun choice: keep the manifest's `sam` noun **short**, separate from
     the prompt description. Long descriptions ("half an avocado cut
     lengthwise: pale green flesh, ...") return zero matches. Proven
     phrases: "half avocado", "red tomato", "bowl of salsa", "purple
     monster", "orange monster", "chef", "yellow circle", "red circle",
     "circle" (blue undo button; "blue circle" failed), "food" (the patty
     layer, where "burger patty", "meat" and "hamburger" all failed).
   - Only shapes SAM touches are kept, and a touched shape is kept whole, so a
     noun that matches part of a sticker (the arrow on a button) keeps the
     whole connected subject.
   - Lettering matched "letters" but missed "Go!". Logos are native text
     instead (see art-integration).
   - The cutter falls back to "food", "circle", "sticker", "object" and then
     "cartoon" if the entry's noun matches nothing. Test a noun directly
     with `sam_cut.py <raw> "<noun>" <out> --coverage` before a batch.
3. **The flat key colour decides the EDGE.**
   - Background = key-coloured pixels connected to the border, plus
     enclosed key-coloured holes SAM doesn't claim.
   - Only shapes SAM covers are kept, which drops specks.
   - In a 2 px edge band, alpha is solved from `C = a·F + (1−a)·K` and the
     colour is un-mixed, so there is no key fringe.
   - The colour under transparent pixels is padded with subject colour,
     so there are no halos when scaled.
4. **Export** lossless WebP (`quality=100, method=6`). Pillow's resize
   premultiplies alpha.
   - `trim` exports crop to the subject plus 8 px.
   - `frame` exports keep the whole generation canvas. Use it for every
     pose of one character (the kitchen window poses), so all poses share
     scale and anchor and swapping poses never jumps. A framed pose must not
     touch the top or side edges above the part the counter hides; check
     with the edge test in QA below.
   - `max_side` caps what `sync_game_art.py` ships to the game.

Re-cut an existing pristine raw without regenerating:
`python3 tools/art/art.py recut --id <id> --source generated_images/production/source/<id>.v<n>.png`

## QA (every asset, before it reaches the game)

1. The automated checks (size, alpha coverage, magenta residue) must pass.
   For `frame` poses, also check that no opaque pixels touch the top row or
   the side columns above the hidden bottom band (the counter hides the
   bottom ~12% of a window pose). A touching tuft would show a flat cut.
2. **Look at the final at full size** over a dark and a light
   checkerboard. Check:
   - the outline is even and unbroken all the way round;
   - there is no fringe or halo;
   - there are no specks, and nothing is cropped;
   - the pose and facing are right for its spot on screen.
3. Spark's verdict is recorded but is advisory.
4. The user's sign-off on the live screen is the gate.

## CLI (`python3 tools/art/art.py ...`)

Run it with the pyenv interpreter (`~/.pyenv/shims/python3`): inside the
repo `python3` can resolve to `.venv-sam`, which has no `openai`. The
ledger lock is per process, so generate several ids in parallel from one
process (threads over `art.process`), never several `art.py` processes at
once.

- `status`, `sheet`: ledger coverage and contact sheets.
- `run --batch <cat> [--only <id>]`: generate, cut, normalise and QA new
  assets. Up to 3 attempts; failures are quarantined.
- `rebuild --id <id> [--note "<steer>"]`: re-make from the changed
  manifest spec as `v+1`.
- Many ids at once: `python3 tools/art/rebuild_many.py --workers 6 <id> ...`
  runs `rebuild` for each from ONE process (threads). In zsh, expand a
  variable list with `${=IDS}` or it arrives as one argument. Output is
  buffered: read results from the ledger (`status`, `cut`, `rejected`), not
  the log.
- `revise --id <id> --note "<change>" [--ref <png>]`: edit from the
  current final as `v+1`.
- `recut --id <id> --source <raw>`: re-cut a pristine raw as `v+1`.
- `qa --id <id>`: Spark on one final (advisory).

For `rebuild`, `revise` and `recut`, a new version that fails QA never
replaces the current final. The previous final and ledger record are kept,
and the attempt is logged under `rejected`. Earlier sources stay on disk
as `<id>.v<n>.*`.

## Importing user-supplied art

Put the file in `generated_images/production/import/`, then add it as a
`mode: "derive"` entry with `refs=[<import path>]` and the right `export`
(e.g. `env.title`: 2400x1600, `max_side: 2400`). Then run `rebuild --id <id>`.
Check the final against the import, which should be pixel-identical apart
from WebP rounding.

## Content filter

Muse Image rejects some prompts with `content_policy_violation`. The
grumpy pose was rejected as "grumpy but never scary or mean: ... arms
crossed"; "a bit cross and impatient: frowning eyebrows, a small pout, arms
folded" passed. Avoid words like scary, mean, angry in subject lines (the
negative block already says "Not scary").

## Kitchen assets (burger v1)

- **No kitchen background image.** The kitchen is layers in the game; the
  wall, sky, hills, window frame, counter and panel are native SVG (see
  art-integration). `env.kitchen` was removed from the manifest.
- **Monster window poses** (`monster.<id>.<pose>`, poses tap, happy,
  fidgety, grumpy, gobble, confused): head and upper body over the counter,
  cut flat by the bottom edge, `frame` export, approved character sheet as
  identity reference (OG also gets storyboard crops as pose references).
  Purple OG uses the green key.
- **Burger tray icons** (`item.<id>.tray`): storyboard tile crops in
  `refs/kitchen/item.<id>.tray.png` as exact design references; items
  without a crop (avocado, salsa, crispy onions) use the whole ingredient
  row crop as a style reference. Look-alike pairs differ by silhouette:
  whole tomato / whole pineapple, leaf / halved avocado, squeeze bottle /
  bowl.
- **Burger dish layers** (`item.<id>.dish`, `dish.bunBottom`,
  `dish.bunTop`): one side-view layer each, a thin wide strip, with the
  storyboard's bun-and-patty crop as style reference. The game scales every
  layer to one width and stacks them with overlap.
- **Buttons** (`prop.undo`, `prop.bell`, `prop.trash`): the whole round
  button (circle and icon), from storyboard crops in `refs/kitchen`.
- The Go! wipe, stars, tiles, glow rings, speech bubble and broken-speaker
  sign are native in the game. `ui.goBand`, `env.goWipe` and
  `env.levelTruck` were removed from the manifest; the level transition
  reuses the approved title art (`env.title`, `chef.windowWave`,
  `ui.goButton`).

## Consistency rules

- The frozen style block is prepended to every prompt.
- Storyboard crops used as references live in
  `generated_images/production/refs/<screen>/` (`title`, `kitchen`,
  `tutorial`) and are design or pose references only.
- Characters: attach the approved character sheet every time, and pose
  from the master, never from the previous pose.
  - A storyboard crop may be attached as a **pose reference only**, with
    `ref_notes` saying so.
  - Drop it if it pulls the pose wrong: OG kept going front-facing.
- Ingredients: look-alike pairs must differ in shape or texture, not
  colour alone.
- Backgrounds are generated whole or imported. Never stitch extensions
  onto a plate.

## Abandoned (do not revive)

- **Chroma key first, SAM on retry.** It made magenta fringes, and binary
  SAM masks chewed the outlines. Most item cut-outs from that era are bad;
  re-cut them from their pristine raws with `recut`.
- **Cutting pieces out of storyboards** (`mode: cut`). OG and the others
  are painted over scenery, so there is no clean edge to recover.
- **Stitched bleed plates** (`mode: bleed`), outpainting a border onto a
  plate. They left visible seams and folded ground lines.
- **A baked kitchen background plate** (`env.kitchen`): the kitchen is
  layers; a plate cannot put the counter in front of the monster.
- **Full-body monster poses for the kitchen** (idle, walk, dance, leave and
  the rest, chroma-cut): replaced by the window poses. Dancing and leaving
  are motion on `happy` in the game.
- **Long SAM nouns** (the prompt description as the `sam` field): they match
  nothing.

The `cut` and `bleed` code paths still exist in `art.py` but must not be
used.
