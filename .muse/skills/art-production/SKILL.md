---
name: art-production
description: Produce Nom Nom Go! artwork elements from approved masters with Muse Image, SAM 3.1 cut-outs, and Muse Spark QA. Use for initial artwork creation and for later artwork revisions requested during gameplay integration.
---

# Art production — Nom Nom Go!

Production only. This skill creates artwork elements and stops with a
QA-passed asset pack in `generated_images/production/`. Integrating assets
into gameplay is a separate stage and is never done here.

## Sources of truth

- Approved masters and characters: `generated_images/approved/` (never edit).
- Element list, sizes, prompts: `tools/art/manifest-v2.json`
  (rebuild with `python3 tools/art/build_manifest.py`).
- Game display sizes come from the 1600x900 stage in `game/src/App.tsx`.
- Style: flat sticker illustration, bold dark outlines, flat solid fills,
  subtle grain, saturated palette (coral, teal, mustard), shape-first
  silhouettes. No text, letters, or numbers in any image.
- OG (`og_002.png`, purple one-eyed monster) is style anchor, app-icon
  source, and a full cast member with a 10-pose set.

## Models (Meta API, https://api.meta.ai/v1, key from repo .env MUSE_API_KEY)

- Generate/edit: `muse-image-1.0` via Responses API. Attach approved
  masters as `input_image` references on every call. Turn built-in
  web/image search and shell OFF for original art. `size` sets aspect
  only; always normalise output yourself. Never use `-contributor` variants.
- Cut-out: chroma-key (Pillow/NumPy) on the first attempt; `sam-3.1` via
  Responses streaming (parse with `meta_sam_parser` in `.venv-sam`) on
  retries when the chroma edge fails QA.
- QA: `muse-spark-1.3` vision (never `muse-spark-1.3-contributor`).
  Spark judges each final against its manifest `qa` checklist and returns
  JSON `{pass, issues, scores}`. Deterministic checks (size, alpha,
  padding, spill) run first; Spark is the judgement layer.

## Process

Run everything through the CLI (`python3 tools/art/art.py ...`). Never
hand-generate one-offs outside the ledger.

1. `status` — coverage from `generated_images/production/ledger.json`.
2. `spike` — hero gate: a monster pose, a chef pose, a look-alike
   ingredient pair (tray + dish), an env plate, the app icon. Review the
   contact sheet at game size before any batch.
3. `run --batch env|ingredient|monster|chef|prop` — generate, cut,
   normalise, QA. Up to 3 attempts per asset; QA failures append Spark's
   issues to the retry prompt. Failures after 3 attempts are quarantined
   and never block the queue.
4. `sheet` — contact sheets per category on a checkerboard.
5. Done when coverage is 100%, quarantine is empty or waived, and sheets
   are written. Stop. Do not touch game code.

## Consistency rules

- Frozen style block from the manifest is prepended verbatim to every
  prompt; only the subject changes.
- Characters: the approved master is attached every time; poses chain per
  character. `idle` poses and `chef.hatch` are derived (cut + normalise),
  never regenerated.
- Ingredients: look-alike pairs must differ in shape or texture, never
  colour alone. Check in greyscale.
- Environments: edit the master into a clean plate. Never regenerate a
  scene from text. The top-right call corner (320x360 stage units) stays
  plain scenery.
- Sprites generate on solid magenta `#FF00FF`; character occupies 80% of
  frame with padding on all sides.

## Revisions (for the later integration stage)

`python3 tools/art/art.py revise --id <asset-id> --note "<what to change>" [--ref <screenshot.png>]`

Creates version `v+1` via the image edit path from the current approved
final, keeps every earlier version, records prompt, references, response
id and Spark QA in the ledger. Old versions are never overwritten, so
integration can pin or roll back per asset.
