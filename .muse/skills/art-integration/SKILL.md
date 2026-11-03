---
name: art-integration
description: Make each Nom Nom Go! screen match its approved storyboard, work as intended and look polished in the live game on any landscape screen. Screen-by-screen loop, layout tables in game code, Playwright captures at 2x. Use for integrating, placing, fixing or reviewing artwork in the running game. Asset creation and cut-outs hand off to art-production.
---

# Art integration — Nom Nom Go!

**The only thing that matters is what the live game looks like.** Work one
screen at a time, and within it one element at a time. Make the change the
user asked for, show it, then stop.

Every asset change (generate, re-cut, revise, import) goes through
`.muse/skills/art-production/SKILL.md`.

**Keep this file current.** Whenever the process changes, update this file
in the same piece of work. The Claude Code pointer only redirects here.

## Sources of truth

- **Storyboards** (`generated_images/approved/*.png`) are **targets
  only**: composition, cast, scale and colours. Never cut pieces out of
  them.
- **Screen register**: `tools/art/screens.json` (master, capture recipe,
  checklist).
- **Placement is game code**: each screen has a layout table of stage
  numbers in `game/src/App.tsx`, e.g. `TITLE_LAYOUT`. It is not the art
  manifest. Edit a number and save; the dev server updates instantly.
- **Living plan and gap log**: `working/art-integration-plan.md`.

## Layout model

- The game has a fixed 1600×900 **stage** (the 16:9 safe area), scaled to
  fit the viewport. All gameplay and controls live inside it. Units in
  layout tables are stage units: bigger `left` is further right, bigger
  `top` is further down.
- **Backgrounds** are one whole 2400×1600 (3:2) image drawn by
  `<Backdrop id>` into the bleed box (stage `left −200, top −216.7`,
  2000×1333). The stage shows the middle 80%, and the rest fills screens
  from iPad 4:3 to ~2.2:1 phones with real scenery: no bars, no seams.
- Make a background as a single whole image: generated wide, or supplied
  by the user and imported (art-production). Muse Image cannot extend an
  existing image's edges, and stitched extensions leave seams.
- Pieces are separately made transparent sprites drawn in their layout box
  (`TitleArt` in `App.tsx`):
  - standing characters sit on the box bottom;
  - `clip` hides everything below the box bottom (the chef behind the
    window counter);
  - `mirror` flips a sprite horizontally.
- Pieces that must sit *in* the background (the chef in the truck window)
  are positioned against that background. If the background changes,
  re-measure them (a feature match between old and new plate) and update
  their numbers.
- **Logos and text are native text**, not images: crisp at any DPR, with
  nothing to cut out. The title logo is Fredoka Bold, self-hosted and
  subset (`game/public/fonts/`), in the storyboard's word colours with a
  dark outline, each letter bobbing in a wave.
- **Simple shapes are native too**: tiles, progress dots and arrows are
  CSS/SVG (crisp, nothing to cut, easy to animate). An arrow that grows is
  one outlined SVG path whose shaft lengthens, so the head never distorts.
- **Screen-specific art ids.** When a screen needs its own look of an
  existing piece (the tutorial's lettuce, bell, glove), give it its own id
  (`tut.*`) so the gameplay screens' art is untouched.
- **Motion:** characters `sway` and the Go image `pulse`; animate inner
  images, never the button's hit box. Everything stops under
  `prefers-reduced-motion`. A piece clipped with `clip` (the chef) stays
  static, because movement would show its cut edge.

## Tutorial (T1–T3)

- Three steps before Level 1, in the `Tour` component with
  `TUTORIAL_LAYOUT`. The Go button (same spot every step) is the only
  control: no skip, no back.
- The storyboards are ~4:3, so they are fitted to the stage height and
  centred; the bleed plate `env.tutorial` fills the sides.
- T1: tiles start empty; lettuce then tomato pop in, each with the order
  voice (gibberish, then Dad's `ing.<item>` clip). T2: the arrow stretches
  while the glove drags a lettuce to the patty, on a loop. T3: the burger
  pops in and the bell shimmies (`.ring`), tinkling on each shimmy:
  `playSfx('tinkle')` fires on the CSS animation's start and iteration
  events, so sound and motion stay locked.
- Under reduced motion each step shows its finished frame
  (`useReducedMotion`).
- `?tour=1` forces the tour, even in test mode; capture recipes are
  `tour1`–`tour3`.

## Definition of done (per screen)

1. **Looks like its storyboard**: composition, cast, scale, colours and
   control shapes. No CSS defaults showing.
2. **Works**: that screen's e2e flows pass, `data-testid`s are unchanged,
   the call corner (stage top-right 320×360) has no controls, and touch
   targets are at least 44 px on iPhone.
3. **Looks good everywhere**: no bars, seams, fringes, chewed outlines or
   clipping at 16:9, iPad 4:3, iPhone ~2.17:1 and desktop ~1.85:1.
4. **User sign-off** on the live game. Spark is advisory only.

## Per-screen loop

1. **Capture**: `python3 tools/art/screen.py capture --screen S1`. It
   needs the dev server on :5173, captures at device scale 2 with reduced
   motion, and writes to `generated_images/screen-qa/S1/r<n>/`.
2. **Inspect yourself at full size**: crop every piece's edges, and check
   all viewports.
   - `screen.py qa --screen S1` adds automated checks (bars, call corner,
     touch targets) and Spark's opinion.
   - To check motion, take two frames ~0.5 s apart without reduced motion.
3. **Agree the change with the user**, make it, show it, stop.
4. **Gates** in `game/`: `npm run typecheck`, `npm test`, `npm run lint`,
   and the affected e2e tests (`npx playwright test -g ...`). Run the full
   e2e and `npm run build` before a commit.
5. **Commit** one commit per screen, only after user sign-off.

## Rules

- Never start from a cut-out. Find the pristine raw generation, cut it
  properly (art-production), then place it.
- **No storyboard, no build.** A screen without one first gets a
  storyboard the user approves.
- Art never blocks gameplay: every image keeps an emoji or CSS fallback.
- Never hand-place files in `game/public/art/`. `sync_game_art.py` is the
  only way art enters the game. While another screen's finals are still
  pending, run it with `--allow-missing`. Then diff both game manifests by
  id: only your screen's ids may change. Restore anything else, such as
  another screen's re-encoded plate.

## Abandoned (do not revive)

- **Cutting cast, logo or buttons out of storyboards**: ragged edges and
  scenery fragments.
- **Stitched or outpainted background extensions**: seams and folded
  ground lines.
- **Placement boxes in the art manifest** (`place` / `placement` /
  `masterBox` for the title): layout lives in `App.tsx` tables.
