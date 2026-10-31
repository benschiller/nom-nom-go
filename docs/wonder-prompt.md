# Nom Nom Go! build prompt (Muse Wonder in Muse Code)

You are building **Nom Nom Go!**, a complete, deployable web game, in this repository. Read this whole prompt before writing code. Work through the milestones in section 12 in order. After each milestone, run its acceptance checks and do not move on until they pass.

**Pinned objective:** Ship a polished, offline-capable, landscape web game for a 7-year-old who may not read yet. A parent can watch and cheer live from another device ("Dad's Window"). Everything is deployed to AWS. It contains no AI at runtime, no analytics and no personal data about the child.

**Status of this document:** This is the reviewed, definitive build prompt. It supersedes `working/wonder-build-prompt.md` and `working/plan.md` wherever they differ. Decisions already made here are not open for the builder to re-derive; record only genuinely new choices in `docs/decisions.md` (section 14).

**Amendment (2026-10-30) — kitchen HELP supersedes the kitchen ticket.** The kitchen screen no longer shows an order ticket or monitor, and there is no peek. The locked kitchen master (`generated_images/kitchen-master-stars.jpg`) has a tall serving window with the monster behind the build area, a horizontal ingredient bar, undo/bell/trash beneath it (bell biggest), stars lower-right, and a Head Chef HELP button. Tapping HELP replays the call-out (static bursts when the speaker is broken) while tray items grow and highlight in order. HELP consumes the existing memory budget (code keeps the internal names `ticket` for the called sequence and `peek`/`peekBudget` for HELP and its budget), and patience pauses during the replay. Wrong-serve feedback highlights the tray item instead of a ticket icon. Wherever this prompt says kitchen ticket, monitor, or peek (notably sections 5.2, 6.2, and 6.4), this amendment wins. The kiosk order presentation and the call-out itself are unchanged. Shipped in commit `c638196`.

---

## 1. What you are building

**One-liner:** "A kitchen game where kids practice focus and quick thinking and play with a parent. Made possible with Meta AI."

**Why it exists:** a dad in the UAE built this to play with his 7-year-old son in the USA during video calls (Messenger Kids), after being separated for years. The gameplay is designed to foster meaningful connection and bring father and son closer together.

**The game in one paragraph:** silly monsters walk up to a food truck kiosk and order a burger, pizza, or ice cream sundae, speaking gibberish alien language with each item. The child watches the order being placed (seen once). The order prints on a monitor in the kitchen (seen twice), and the Head Chef, a cartoon of Dad voiced by Dad's own recordings, calls it out (heard once). The child builds the dish by tapping ingredients in the right order, then rings the bell before the monster's patience runs out. Six levels get harder, ending with a "Rush hour" boss, after which the kitchen closes for the night.

**Two pillars** that every design choice serves:

| Pillar | Phase | The player | Practices |
| --- | --- | --- | --- |
| Focus | Taking the order | watches, observes pictures, listens, remembers, notices details | attention, working memory, attention to detail |
| Quick thinking | Making the order | picks the right items in the right order, fast | decision speed: fast *and* right |

## 2. Hard constraints (these override everything else)

1. **No reading required.** The child's gameplay experience uses pictures, animation, sound and Dad's voice only. No words, letters or numerals may carry information the player needs on any gameplay screen: kiosk, kitchen, ticket, tutorials, hints, interstitials, boss, and ending visuals are picture-only, and counts are shown as repeated icons or pips. **Literacy exception (title screen only):** the title screen is a non-critical, non-gameplay area and may show the "Nom Nom Go!" logotype and a "Go!" label on the play button, to encourage early literacy. Both are always paired with pictograms (truck/monster art; a play triangle on the Go! button), the game never depends on reading them, and this exception does not extend to any other child-facing screen. The parent area may use text.
2. **No AI, analytics, ads, trackers, third-party SDKs, external fonts or CDNs at runtime.** The only network traffic after first load is `config.json` and Dad's Window (AWS AppSync Events).
3. **No personal data about the child**, ever. No names, photos, voice, free text or device fingerprints. Progress and pairing live on the device only. Realtime messages carry only game state, normalized coordinates and enums.
4. **Call corner:** the video call floats over the game's top-right corner. The **top-right 20% of the width × 40% of the height** of the stage (section 5.2) never contains anything the player needs on any screen: ingredients, ticket, serving window, buttons, stars, presence badge, cheers or Dad's glove. Only scenery goes there.
5. **Colorblind-safe:** any two items the player must tell apart differ in shape or texture, never only in color.
6. **No manipulative mechanics:** no daily streaks, no "come back" nudges, no purchases, no countdowns outside the game, no start-over during play and no reset button in the parent area. The single exception is the post-boss power-off / power-on cycle (section 6.1).
7. **No clinical or medical wording** anywhere: README, UI, comments in user-facing files. Say "practice focus and quick thinking", never "trains", "improves attention", "therapy", "ADHD", "assessment" or "diagnosis".
8. **Kind deferred success:** no fail screens, no harsh sounds, no "game over" for losing. Monsters leave cheerfully.
9. **Offline after first load** (PWA). Solo play never depends on the network.
10. **Large tap targets:** at least 56 CSS px on an iPhone SE in landscape (≈140 stage units, section 5.2).

## 3. Tech stack (pin these exact versions)

Use `save-exact` and commit lockfiles. Record every deviation in `docs/decisions.md`.

**Version fallback rule:** if a pinned version does not exist when you install, use the latest patch of the nearest existing minor within the same major. Cross a major only as a recorded blocker in `docs/decisions.md`, after a peer-dependency check. Never silently cross a major for React, Vite, Motion, or CDK.

| Layer | Choice | Pin |
| --- | --- | --- |
| Runtime | Node (`.nvmrc` pins `24`; `engines`: `^22.12 \|\| ^24`) | `24` |
| Build | Vite, scaffold with `create-vite --template react-ts` | `vite@8.3.5` |
| UI | React | `react@19.3.1`, `react-dom@19.3.1` |
| Animation | Motion, imported from `motion/react` (never `framer-motion`) | `motion@14.7.1` |
| Particles | Your own ~100-line emitter on one `<canvas>` overlay with `pointer-events: none`. No confetti library. | n/a |
| Language | TypeScript, `strict` | 5.9.x (not 7.x) |
| Lint/format | ESLint (flat config from the Vite react-ts template) + Prettier, exact-pinned at install | record in `docs/decisions.md` |
| PWA | vite-plugin-pwa, Workbox | `vite-plugin-pwa@2.0.0`, `workbox-window@7.4.1`, `@vite-pwa/assets-generator@2.0.0` |
| Realtime client | `aws-amplify` v6 `events` API, configured against our own endpoint (no Amplify backend, no Amplify CLI) | latest 6.x, pinned at install |
| Infrastructure | AWS CDK v2 in TypeScript. The `aws-cdk` CLI devDependency must exactly match `aws-cdk-lib`. | `aws-cdk-lib@2.275.0`, `constructs@10.x` |
| Unit tests | Vitest | `vitest@5.0.5` |
| End-to-end tests | Playwright | `@playwright/test@1.64.1` |

**Forbidden:** Next.js or any SSR framework, Phaser, PixiJS, XState, Redux, Supabase, Firebase, Socket.IO, servers you write yourself, EC2, databases, Google Fonts, OGG-only audio, any `eval`-style dynamic code.

## 4. Repository layout and working rules

The repo already has `README.md`, `docs/`, `AGENTS.md`, `IDEA.md`, `.gitignore` and a git-ignored `.env`. This prompt is tracked at `docs/wonder-prompt.md`; `working/` is git-ignored and is not part of the deliverable.

```
game/                     Vite + React app (the PWA)
  src/core/               pure TypeScript game logic, no React, no DOM
  src/ui/                 React screens and components (view = f(state))
  src/audio/              AudioContext module, SFX, gibberish, clip player
  src/net/                Transport interface, AppSyncTransport, LocalTransport
  src/content/            data files: dishes, ingredients, monsters, levels
  public/art/             art files + manifest.json (placeholders for now)
  public/audio/clips/     Dad's recorded clips + clips.json
  tests/                  Playwright tests
infra/                    AWS CDK app (its own package.json)
docs/recording-script.md  every line Dad must record
docs/decisions.md         choices you made that this prompt left open
docs/wonder-prompt.md     this prompt
```

**Root scripts.** Add a root `package.json` (private, orchestration only):

- `npm test` — game unit tests (Vitest).
- `npm run test:e2e` — Playwright.
- `npm run typecheck` and `npm run lint` — game (and infra where applicable).
- `npm run build` — builds `game/` and splits deploy output (section 8).
- `npm run deploy` / `npm run destroy` — section 8.

Every milestone gate runs `typecheck` and `lint` in addition to its listed checks.

**Bundle budget:** entry chunk plus all initially loaded chunks must total under 250 KB gzipped, excluding lazy-loaded Amplify, art, and audio. Add a size-check script and fail the build over budget.

**Working-tree safety:** `README.md` and `.gitignore` may have uncommitted changes when you start. Inspect `git status` and the diff before milestone 1. Never stash, overwrite, or silently include pre-existing changes in a milestone commit. The README rewrite (section 11) merges in the existing hackathon dates and submission information; it does not replace them.

**Branch policy:** work on branch `wonder/build`. Commit at the end of every milestone with a clear message and push the branch. Merge to `main` only after milestone 6 approval. Do not commit `working/`, `research/`, `generated_images/`, or `.env`.

## 5. Architecture

### 5.1 Game core (`src/core`)

- A pure reducer: `step(state, event, now) → state`, with a discriminated-union `phase`, an exhaustive `switch`, a **seeded RNG** and an **injected clock**. No `Math.random()` or `Date.now()` inside the core.
- Exports `initialState`, `step`, `serialize`/`deserialize` (versioned JSON), selectors and types. No React imports.
- Everything in section 6 (orders, levels, pace, easing off, stars, saving rules, broken channels) lives here and is unit-tested.
- The UI subscribes through `useSyncExternalStore`. Timers in the UI dispatch `tick` events. The core never schedules anything itself.
- **Phase union (closed list):** `title, levelIntro, kiosk, printing, callout, cooking, serveResult, levelResult, bossEnding, closed, poweredOff`. Pause is an overlay flag plus the remembered phase, not a phase. Dad's view, the parent area, and the rotate overlay are UI shells outside the core phase. Serve-result holds: correct 2.5 s, wrong 1.8 s, timeout leave 1.2 s.
- **Three serializations, kept separate:**
  - `CoreState` — the reducer state, via `serialize`/`deserialize`.
  - `SaveData v1` — the localStorage schema (section 6.9). Its own versioned migration function.
  - `MirrorView v1` — a whitelist selector for Dad's Window (section 5.6). Never serialize `SaveData` to the network.

### 5.2 Stage and layout

- Render into a fixed **logical stage of 1600 × 900 units**, origin top-left, scaled to fit the viewport ("contain"). Scenery bleeds to fill the leftover space so there are no black bars.
- Reserve the call corner in stage units: `x ≥ 1280, y ≤ 360`.
- Respect safe areas: `viewport-fit=cover`, `env(safe-area-inset-*)`, `dvh` not `vh`. Set `touch-action: manipulation`, `overscroll-behavior: none` and `user-select: none`. Treat `touchcancel` as a finger-up.
- **Portrait:** show a full-screen, picture-only "turn me sideways" overlay. iOS cannot lock orientation.
- Animate only `transform` and `opacity`. Cap the canvas devicePixelRatio at 2.
- Dev overlay: `?debug=corner` draws the call corner and safe areas.
- **Kitchen zone table (stage units).** No gameplay element may be placed outside its zone without updating this table and the call-corner test:
  - Kitchen monitor / ticket: `x24 y24 w700 h150`
  - Serving window: `x748 y24 w220 h150`
  - Star pips: `x992 y24 w264 h150`
  - Build area: `x24 y186 w736 h444`
  - Base shelf: `x784 y186 w472 h260`
  - Bell / undo / trash row: `x784 y466 w472 h164`
  - Ingredient tray: `x24 y646 w1232 h208` — eight slots of 140 units with 16-unit gaps
- The kiosk screen follows the same discipline: monster and kiosk left of `x1280`, call corner holds scenery only. Fix its zone table in milestone 2 before building components.

### 5.3 Screens

0. **Title and loading:** playful screen with the "Nom Nom Go!" logotype, truck and monster art, a readiness indicator shown as filling star pips (no numerals), and one big Go! button (label plus play triangle; section 2.1 exception). The tap unlocks audio.
1. **Outside the food truck (kiosk):** the truck exterior, the kiosk, and the monster walking up and ordering.
2. **Inside the food truck (kitchen):** most of the space is gameplay, per the zone table in 5.2:
   - the kitchen monitor with speaker, order printed;
   - the build area for the dish;
   - the base shelf;
   - the ingredient tray (up to 8 slots);
   - the order ready bell, an undo control, and a trash control (section 6.2).
   A **small serving window** shows the waiting monster, just big enough to read its patience emotion. It must not take away from gameplay.
3. **Interstitial:** level complete
   - the Head Chef (poses, speech);
   - the stars (3 pips);
   - celebration animation
4. **Closed and powered-off screens** (section 6.1): the night closing, then the dark powered-off screen with a single glowing power pictogram.

Transitions between screens are quick and playful.

### 5.4 Assets by manifest

- Every visual is referenced by **id** from `public/art/manifest.json`. Each entry has `id`, `kind`, `size` (stage units), `anchor`, `layer`, `description` (a one-sentence art brief for a later image-generation step) and an optional `file`.
- If `file` is missing, render a **programmatic placeholder**: SVG or CSS shapes, distinct silhouettes and colors, simple faces for characters. The game must look coherent and be fully playable with placeholders only.
- Real art arrives later from a separate pipeline that fills in `file` (WebP with transparency). It must drop in with **no code changes**.
- Manifest coverage:
  - truck exterior, kiosk, kitchen interior, serving window, order monitor, speaker (working, static), bell;
  - every ingredient (tray icon + on-dish layer), every base part;
  - 5 monsters × emotions/poses (idle, walk, tap, happy, fidgety, grumpy, gobble, dance, confused, leave);
  - Head Chef × 8 poses (hello, point, thumbs-up, cheer, think, surprised, clap, goodbye);
  - chef's glove, cheer icons, star pip, Dad presence badge, rotate overlay, power-off / power-on pictograms, app icon source SVG.
- **This is a suggestive list, not exhaustive.** Create assets as needed.

### 5.5 Audio (`src/audio`)

- **Unlock:** one shared `AudioContext`, created and resumed synchronously inside the first tap (the Go! button). That tap also primes `speechSynthesis`.
- **Background bug:** on `visibilitychange` → visible, if the context is not `running`, close it and create a new one (workaround for a WebKit Home Screen bug).
- **Session type:** keep the default (ambient) audio session. Do not set `navigator.audioSession.type = "playback"`, so the game never fights the video call.
- **Synthesized in the browser (Web Audio):**
  - sound effects: nom nom, ding, print, tap, pop, sizzle, bell, oops, gobble, confetti, static, snow, sputter;
  - monster gibberish: short pitched, formant-ish syllables, a different voice (pitch/formant parameters per monster id, defined in `src/content`) per monster;
  - a light background loop whose tempo rises during a hot streak.
- **Dad's clips:** played by id from `public/audio/clips.json` (`id`, `text`, `category`, optional `file`, MP3 or M4A). **Clip grammar:** a call-out plays the ticket steps in ticket order: `phrase.order_up` → each base/ingredient clip in sequence, with `amount.double` immediately before a doubled item and `phrase.and` immediately before the final item, with ~150 ms gaps between clips.
- **Missing clips:** if a clip file is missing, speak its `text` with `speechSynthesis` as a stand-in.
- **Core handshake:** the audio layer dispatches `calloutFinished` when the composed call-out (clips or speech stand-in) actually ends; the UI dispatches `printFinished` 600 ms after printing starts. These events drive the patience start rule in section 6.2. In test mode the call-out resolves instantly.

### 5.6 Realtime: Dad's Window (`src/net`)

- A `Transport` interface with two implementations:
  - `LocalTransport` (`BroadcastChannel`, used in tests and offline development);
  - `AppSyncTransport` (`aws-amplify` `events.connect`, `subscribe`, `publish`).
- **Spike first:** milestone 5 starts with a throwaway two-browser spike against the real AppSync Event API confirming the channel path form the Amplify `events` API expects (leading slash or not, namespace placement), before `AppSyncTransport` is built. Record the result in `docs/decisions.md`, then delete the spike.
- **Config:** `AppSyncTransport` is lazy-loaded only when a pairing exists or the page is Dad's view. It reads `/config.json` (endpoint, region, API key), written at deploy time. If config is missing or the connection fails, the game carries on silently.
- **AppSync Events:** namespace `kitchen`, two channels per kitchen, and each side subscribes only to the other's channel, so nobody receives their own messages:
  - `/kitchen/<kitchenId>/play`: the child publishes;
  - `/kitchen/<kitchenId>/dad`: Dad publishes.
  (Adjust the exact path form to the spike result.)
- **Publish validation matrix.** The `onPublish` handler (section 8) enforces direction by channel: the `play` channel allows only `snapshot`, `event`, `beat`; the `dad` channel allows only `hello`, `glove`, `cheer`, `beat`. Envelope `v` must be `1` and every message under 4 KB, or the event is dropped.
- **Message envelope:** `{ v: 1, type, seq?, t, ...payload }`. Keep every message under 4 KB.

| type | direction | when | payload |
| --- | --- | --- | --- |
| `hello` | Dad → child | on join or reconnect | protocol version |
| `snapshot` | child → Dad | reply to `hello`, every core transition, every 5 s | `MirrorView v1` (section 5.1) + increasing `seq` |
| `event` | child → Dad | one-shot effects | closed enum: `served`, `fastServed`, `oops`, `timeout`, `levelUp`, `streakStart`, `streakEnd`, `bossWin` |
| `glove` | Dad → child | 10–15 Hz, only while Dad's finger moves | `{x, y}` normalized 0–1 in stage space |
| `cheer` | Dad → child | on tap, max 1 per second | enum: `thumbs`, `heart`, `wow` |
| `beat` | both, each on its own channel | every 5 s | `{ role: 'child' or 'dad' }` (presence) |

- **The child's game is the only writer of game state.** Dad's view ignores unknown types and stale `seq`.
- **Mirror rendering:** Dad's view renders the same component tree from the latest `MirrorView` with `interactive={false}`. It runs no timers, no RNG, no audio, and no local save.
- **Glove:** clamp the glove on the child's screen so it never renders inside the call corner, and smooth it with a ~100 ms lerp.
- **Presence:** a side counts as online until 15 s pass without a `beat`.
- **Reconnect:** on `visibilitychange` and `pageshow`, both sides reconnect. Dad re-sends `hello`; the child replies with a fresh `snapshot` and resumes `beat`.

## 6. Game design

### 6.1 Flow

1. **Title:** one big Go! button (section 2.1 exception). The tap unlocks audio.
2. **Level intro:** the Head Chef waves and the level is shown as lit pips on the truck sign.
3. **Three orders:** one burger, one pizza, one sundae, in random (seeded shuffle) order. Monsters are drawn without repeat within a try.
4. **Level result:** stars light up (this try's correct count, 0–3 pips).
   - 3 stars: level up.
   - Otherwise: a cheerful "let's try again" and the level restarts.
5. **Boss, closing, and power off:** after Level 6 is beaten, the "Kitchen's closed for the night!" ending plays in the `bossEnding` phase: lights dim, the Head Chef yawns and waves goodbye, and the truck drives off. The game then rests on the `closed` screen. There is **no start-over button** and no reset in the parent area.
   - The `closed` screen shows one **power-off button** (power pictogram only). Tapping it enters the `poweredOff` screen: dark, inert, showing a single glowing **power-on pictogram**. Power-off persists `power: 'off'` and `freshStartPending: true` (section 6.9); it does not reset anything yet.
   - **Next power on** — tapping the power-on pictogram, or launching the app while `power: 'off'` (launch always lands on the powered-off screen first) — applies the fresh start and goes to the title screen: level 1, paceStep 0, `bossBeaten: false`, stars cleared, telemetry cleared, tutorials and gag introductions re-armed, session counters reset. **Retained across a power cycle:** the pairing `kitchenId`s and the sound on/off setting. Nothing else.
   - This power cycle is the only way back after the boss. It is available only on the `closed` screen, never during play.
- **Pause:** a pause button (outside the call corner), plus auto-pause when the page is hidden. Pausing freezes patience and all phase timers. Resume needs a tap.

### 6.2 One order

1. **Kiosk:** the monster walks to the kiosk and taps its items one by one. The monster operates the kiosk itself; the child only watches. Each item pops up big on the kiosk screen with a gibberish syllable. Tap interval per section 6.7. Then the monster taps Submit, and *ding*.
2. **Order:** cut to the kitchen. The order prints (about 600 ms) on the kitchen monitor and **stays up** for the whole order.
3. **Call-out:** the Head Chef calls the order (Dad's clips, grammar in section 5.5).
4. **Patience starts** at the later of `printFinished` and `calloutFinished`, or at `printFinished` if the speaker is broken (section 6.6).
5. **Cooking:** the child builds the dish:
   - tap tray or base-shelf items to add them (tray items never deplete; taps append in tap order);
   - tap the top (most recently added) item on the dish to undo it;
   - tap trash to clear everything except a locked pre-built Level 1 base;
   - the bell is always live; serving an incomplete or wrong dish is a wrong serve (step 6).
6. **Serve:** the bell serves. The dish is compared with the order (section 6.4). The burger top bun is added as a visual at serve time only; it is never part of the expected sequence.
   - **Correct:** the monster gobbles it, dances, confetti, and a star pip lights.
   - **Wrong:** gentle "oops", the monster's confused face, and the first wrong or missing item is highlighted (missed → the ticket icon; extra/wrong → the built item). Then the monster leaves happily.
   - **Patience runs out:** the monster waves and leaves ("maybe next time"). No star.

**Patience emotions** in the serving window (by remaining patience fraction):

- happy above 66%
- fidgety from 33% to 66% (fingers tapping)
- grumpy below 33% (steam from the ears)
- leaving at 0

**Idle and hints:**

- After 4 s with no tap while cooking, the next correct item gently glows.
- After 10 s with no tap, patience freezes until the next tap, because the child may be talking on the call.
- Hints never cost stars.

### 6.3 Dishes and ingredients (frozen in milestone 1)

Content is **frozen as typed data in `src/content` in milestone 1**. `clips.json` and `docs/recording-script.md` are generated from this data, so later milestones never invent ingredients. Any later content change regenerates both files and re-runs the solvability tests. Rules that always hold: shared difficulty knobs, the three look-alike kinds below, colorblind-safe (shape/texture differences, never color alone), **no nuts, no bacon, no ham**. Pepperoni, where used, is beef pepperoni in parent-facing clip text.

| Dish | Base parts | Toppings | Look-alike pairs |
| --- | --- | --- | --- |
| Burger | bottom bun (automatic), patties 1–2, top bun (visual only, at serve) | cheese, lettuce, tomato slice, pineapple slice, avocado, pickles, onion rings, ketchup, salsa, crispy onions | tomato slice / pineapple slice (same shape); avocado / lettuce (same color); salsa / ketchup (same color, different texture) |
| Pizza | crust thin / thick, sauce red / white (chunky vs. smooth red from Level 4) | pepperoni, tomato slice, mushroom, green pepper, basil leaf, olives, turkey slice, corn | pepperoni / tomato slice; green pepper / basil leaf; chunky / smooth sauce |
| Sundae | cup / cone, flavour vanilla / chocolate / strawberry, scoops 1–2 | cherry, grape, whipped cream, marshmallow, chocolate chips, sprinkles, banana slice, caramel drizzle | cherry / grape; whipped cream / marshmallow; chocolate chips / sprinkles |

- **Order always matters (expected sequence):**
  - Burger: patties then toppings, bottom to top. Buns are never tapped.
  - Pizza: crust → sauce → toppings in ticket order.
  - Sundae: container → scoops bottom to top → toppings in ticket order. Scoops are repeated taps of the chosen flavour's scoop item (1–2).
  - Taps may be made in any order during cooking; the built sequence is the tap order and is judged only at serve.
- **Level 1 ticket:** toppings only. The base is pre-built (burger: bun + 1 patty; pizza: thick crust + red sauce; sundae: cup + 1 vanilla scoop), is not tapped, is not called out, and does not count toward patience items. From Level 2 the ticket shows the full tappable sequence.
- **Amounts:** "double pickles" is shown as two adjacent pickle icons on the ticket, and the player taps pickles twice in a row.
- **Ticket:** a left-to-right row of icons with small arrows. No numerals, no words.

### 6.4 Comparing the dish

- The dish is correct only if the full built sequence matches the expected sequence exactly.
- Otherwise classify the **first mismatch** with this exact precedence (unit-test every branch):
  1. Built is a proper prefix of expected → `missed_item`.
  2. Expected is a proper prefix of built → `extra_item`.
  3. At the first differing index, one side is a base part and the other is a topping → `wrong_base`.
  4. The two items at that index form a defined look-alike pair → `lookalike_swap`.
  5. The expected or built item's type count differs between built and expected → `wrong_amount`.
  6. Built and expected are the same multiset in a different sequence → `wrong_order`.
  7. The built item appears nowhere later in the expected sequence → `extra_item`; otherwise → `missed_item`.
- A patience timeout is `timeout`, classified separately, with no highlight.

### 6.5 Levels (cumulative, all 3 orders correct to level up)

| Level | Adds |
| --- | --- |
| 1 | base pre-built, 2 topping types, single amounts, tray has the needed items plus clearly different distractors |
| 2 | base varies and is built by the player (patties 1–2; crust + sauce; container + flavour + scoops 1–2), still 2 topping types |
| 3 | 3 topping types; one topping may be doubled |
| 4 | look-alikes: the tray includes a look-alike of at least one ordered item |
| 5 | broken equipment: each order has one random broken channel (section 6.6), still 3 topping types |
| 6, boss "Rush hour" | 4 topping types + everything above (doubles, look-alikes, one broken channel per order); boss music and lights |

**Tray:** up to 8 slots of unique item types: every needed type plus seeded distractors. Tray items never deplete. Distractor rules: before Level 4, no look-alike of an ordered item; from Level 4, at least one look-alike of an ordered item is forced in within the 8-slot cap. Every generated order must be solvable with the tray shown (unit-test this).

### 6.6 Broken equipment (Level 5+)

One channel per order, chosen at random (seeded):

| Gag | Removes |
| --- | --- |
| Speaker static | Head Chef's call-out (static sound) |
| Kitchen monitor blank | the printed order (no ticket) |
| Kiosk screen snow | watching the order at the kiosk (the screen shows snow) |

Never more than one broken channel. The first time each gag appears, the Head Chef introduces it with a short pointing tutorial. Gag introductions are tracked in the save (`gagSeen`), so each is introduced once ever, not once per session.

### 6.7 Pace (time pressure at every level, hidden)

- `paceStep` is an integer from 0 (loosest) to 9 (tightest).
- Patience = base allowance (5 s) + items × perItem, where perItem = 4.0 s × 0.9^paceStep, clamped to 1.5–4.0 s. "Items" is the count of tappable ticket steps (a double counts as 2; a pre-built Level 1 base counts as 0).
- Kiosk tap interval: `clamp(900 ms × 0.9^paceStep, 500, 900)`.
- **Staircase (3 up / 1 down):**
  - 3 correct orders in a row: paceStep + 1.
  - 1 miss or timeout: paceStep − 1.
  - At most one step per order. Clamp to 0–9.
- **Sawtooth:** entering a new level sets paceStep − 2, applied **after** the staircase adjustment for the order that completed the previous level, clamped 0–9. It applies once per level per session, and once at session start for the resume level (section 6.9). It never applies on a retry of the same level.
- **Never shown** on screen.

### 6.8 Rewarding speed (correct orders only, feedback only)

- **Fast serve:** a correct serve with ≥ 50% patience left at the moment the bell is rung. It gets the monster's biggest celebration and Dad's "Lightning chef!" clip.
- **Normal serve:** a slower correct serve gets a normal happy gobble.
- **Hot streak:** 3 fast correct serves in a row make the kitchen sizzle (grill flames, music tempo up). A slow, wrong or timed-out order quietly ends it. Streak state is volatile core state; it is not saved.
- Stars are the only score.

### 6.9 Easing off and saving

- A "try" is one full play of a level's three orders.
  - After **2 failed tries** of the same level in a session, the next try is **assist mode**: patience × 1.3 and hint glow after 2 s.
  - If the assist try fails, **drop one level**, at most once per session. If the drop has already happened, or the current level is 1, stay in assist mode at the current level.
  - Failed-try counts and the drop flag are session-only; they are never saved.
- **Save** to `localStorage` as `SaveData v1`, versioned JSON with a migration function. Save: level (meaning: next uncompleted level), paceStep, `bossBeaten`, `starsByLevel` (best try per level), `tutorialsSeen`, `gagSeen`, sound on/off, `lastHiddenAt`, the pairing ids (section 7), the on-device telemetry (section 6.12), and power state (`power: 'on' | 'off'`, `freshStartPending`). Save on every core transition.
- Call `navigator.storage.persist()` when running as an installed app (guarded; unsupported on iOS).
- A **session** starts on launch, or on return after more than 30 minutes hidden. A session boundary is applied only between tries, never mid-order. A session starts **one level below** the saved level (minimum 1) as a warm-up: beating the warm-up level returns directly to the saved level (it does not progress past it and does not overwrite the saved level downward); after that, progression is normal. If `bossBeaten` is set, launch goes to the `closed` screen instead (or to `poweredOff` if `power` is `'off'`).

### 6.10 Characters

- **Head Chef:** a friendly cartoon chef. The placeholder is generic; real art later is a cartoon of Dad. Use the 8 poses. The Head Chef appears in the kitchen and in intros.
- **Monsters:** Gobbler (big belly), Double-Trouble (two heads), Sneezer (huge nose), Fussy (monocle, bow tie), Speedy (sneakers, sweatband).
  - Cosmetic only: any monster can order any dish at any time.
  - Each has its own gibberish voice.
  - Original designs: must not resemble any existing character (for example Om Nom or Toca Boca monsters).

### 6.11 Tutorials (no reading)

The first time each thing happens **ever** (tracked in `tutorialsSeen` / `gagSeen` in the save; re-armed only by a power cycle), the Head Chef points and an animated hand shows the tap, once each:

- the first order
- the base shelf (Level 2)
- doubles (Level 3)
- look-alikes (Level 4)
- each broken-equipment gag (Level 5)
- the boss

### 6.12 Telemetry (on device only, never sent)

- **Per order:**
  - level, dish, monster, paceStep
  - time to first tap, time to finish
  - correct / mistake type
  - channels available, hints used
- Keep the last 200 orders. Telemetry lives in `SaveData` only; it is never included in `MirrorView`, snapshots, or any network message. A power cycle clears it.

### 6.13 Parent area (behind a grown-up gate)

- **Gate:** press and hold a small chef-hat icon for 3 s. The icon lives on the title screen only, outside the call corner. Text is allowed here.
- **Shows:**
  - level reached, `bossBeaten`
  - stars per level (best try, from `starsByLevel`)
  - a simple table of recent orders (correct rate, average time to finish, most common mistake)
- **Controls:**
  - sound on/off
  - Dad's Window pairing: status, "paste pairing link" (accepts a full pasted URL or a bare `#pair=<id>` fragment and parses the id), re-pair
- No export, no reset button, no AI. The only reset in the product is the post-boss power cycle (section 6.1).

## 7. Dad's Window: pairing and views

All routes use the URL fragment, so the kitchen ID never reaches server logs. Pairing ids are validated against the UUID format; an invalid id shows a picture-only error state on the child's device (Head Chef face + big cross) and stores nothing.

| Route | Who | What it does |
| --- | --- | --- |
| `#dad` | Dad | Creates a kitchen with a Dad-side kitchen id (`dadKitchenId = crypto.randomUUID()`, or reuses the one stored on Dad's device under its own key). Shows a big **Share / Copy pairing link** button (Web Share API, with clipboard fallback) for `…/#pair=<id>`, and an **Open my window** button for `…/#watch=<id>`. |
| `#pair=<id>` | opened once on the child's device by the other parent | Stores the id as the child's `kitchenId` (a separate storage key from Dad's), shows a picture-only confirmation (Head Chef face + big check, clip `pair.team`), then clears the fragment and goes to the title screen. |
| `#watch=<id>` | Dad | Read-only mirror (below). Stores the id as `dadKitchenId` on Dad's device. |

- **Storage keys are role-specific:** the child's device stores `kitchenId`; Dad's device stores `dadKitchenId`. One device testing both roles must not collide.
- **Home Screen apps may not share storage with Safari.** The parent area's "paste pairing link" accepts a pasted `#pair=` URL as a fallback. Document this in the README.
- **Child's side:**
  - a small Dad presence badge (Head Chef face) lights up when Dad is online;
  - Dad's glove appears where Dad points;
  - cheers pop up next to the Head Chef with a happy sound.
- **Dad's view:**
  - the same `<Game>` component tree, rendered from received `MirrorView` snapshots with `interactive={false}`;
  - one-shot `event`s replay their effects;
  - no game audio (Dad hears the game on the call);
  - a cheer bar (👍 ❤️ WOW) outside the stage;
  - Dad drags or taps on the stage to move the glove;
  - shows "waiting for the kitchen" when the child is offline.
- **Re-pair** (in the parent area) rotates the child's `kitchenId`: unsubscribe the old channels, subscribe the new ones, and leave any old Dad window orphaned on the old id.

## 8. AWS infrastructure (`infra/`)

One CDK app, one stack, region **eu-central-1**, deployed with the AWS profile **`valerian253`**.

- **S3 bucket:**
  - private, block all public access, encryption on;
  - access logs **off**;
  - `RemovalPolicy.DESTROY` + `autoDeleteObjects` (hackathon).
- **CloudFront distribution:**
  - S3 origin with **Origin Access Control**, HTTPS only, default root `index.html`;
  - managed security-headers response policy;
  - standard logs **off**.
- **Deploy output split and two `BucketDeployment`s.** The game build emits two disjoint trees so cache control never overlaps, and both deployments use `prune: false`:
  - `dist-assets/` — hashed assets only, `Cache-Control: public, max-age=31536000, immutable`;
  - `dist-root/` — `index.html`, `sw.js`, `manifest.webmanifest`, with `no-cache`. This deployment's source combines `s3deploy.Source.asset('dist-root')` with `s3deploy.Source.jsonData('config.json', { endpoint, region, apiKey })` so `config.json` is generated at deploy time and also served `no-cache`;
  - invalidate `/*` on deploy.
- **`appsync.EventApi`:**
  - API key auth with the longest allowed expiry (365 days). Document in the README that pairing silently stops working when the key expires and how to rotate it (redeploy).
  - CloudWatch logging off, or errors only without payloads;
  - channel namespace `kitchen` with an **`onPublish` handler in AppSync JS** (no Lambda) enforcing the publish validation matrix in section 5.6: channel-appropriate `type` allowlist, `v === 1`, and maximum payload size.
- **Runtime config:** `config.json` uses the Event API's HTTP endpoint in the form Amplify expects (confirmed by the section 5.6 spike). The app fetches it at runtime; the service worker uses network-first for it.
- **Optional budget:** an AWS Budget of $5/month with an email alert, only if a `BUDGET_EMAIL` environment variable is set. Never hard-code an email.
- **Outputs:** the CloudFront URL and the Events endpoint.
- **Scripts:**
  - `npm run deploy` at the repo root builds `game/` and then runs `cdk deploy --profile valerian253`;
  - `npm run destroy` tears it all down.
- **Before the first `cdk bootstrap` or `cdk deploy`, stop and ask Dad for approval.** The account is not bootstrapped yet. Do not create any other AWS resources.

## 9. PWA and iOS details

- **vite-plugin-pwa:**
  - `registerType: 'prompt'` (not `autoUpdate`): hold the waiting service worker, set an internal `updateReady` flag, and activate the update only when the title phase is next entered — never mid-order, and with no child-facing update prompt;
  - `globPatterns` include `**/*.{js,css,html,svg,png,webp,json,mp3,m4a}` (no fonts are used);
  - raise `maximumFileSizeToCacheInBytes` to 5 MiB;
  - `config.json` is never precached; it is fetched NetworkFirst at runtime.
- **Manifest:**
  - `display: "standalone"`, `orientation: "landscape"`;
  - theme and background colors;
  - icons generated from one SVG with `@vite-pwa/assets-generator`: 192, 512, maskable, 180×180 `apple-touch-icon`.
- **iOS:** add `apple-mobile-web-app-capable` meta tags. In the parent area, show an "Add to Home Screen" picture hint, because saved progress is safest when the game runs from the icon.

## 10. Testing and acceptance

- **Test mode:** `?test=1&seed=<n>&speed=20`. Test mode is the only mode that reads `seed` and `speed`. `speed` scales UI durations only (kiosk taps, printing, serve-result holds) and makes the call-out resolve instantly; core formulas are unit-tested at real values and are never scaled. In test mode only, the current expected order is exposed via `data-*` attributes (ingredient ids) on the ticket and dish elements. Production ignores `seed` and `speed`.
- **Vitest (core):**
  - order generation is always solvable, with the tray rules in section 6.5;
  - look-alikes appear only from Level 4, broken channels only from Level 5, at most one per order;
  - the base is pre-built only on Level 1, and the Level 1 ticket contains toppings only;
  - dish comparison and every branch of the mistake-classification precedence in section 6.4;
  - pace formulas, staircase and sawtooth ordering (section 6.7);
  - easing off (assist after 2 failed tries, one drop per session, floor at Level 1);
  - session resume one level below, warm-up completion returning to the saved level, session boundaries applied only between tries;
  - boss → `closed`, power-off → `poweredOff`, power-on → fresh start at Level 1 with pairing and sound retained and everything else reset (section 6.1);
  - serialize/deserialize round-trip for `CoreState` and `MirrorView`;
  - `SaveData` migration, including `tutorialsSeen`, `gagSeen`, `starsByLevel`, and power state.
- **Playwright projects:** WebKit `iPhone 15 landscape`, WebKit `iPad Pro 11 landscape`, Chromium desktop. Device descriptors are portrait by default; set explicit landscape viewports.
  1. Boots and Go! unlocks audio state.
  2. Completes Level 1 (three correct orders, using test mode) and levels up.
  3. Portrait shows the rotate overlay.
  4. **Call-corner test:** on every child gameplay screen (title, level intro, kiosk, kitchen, interstitial, boss, closed, powered-off), no interactive element's bounding box intersects the call corner. Convert the stage corner to viewport coordinates through the stage transform (including scenery bleed). Dad's view, the parent area, the rotate overlay, and the `?debug=corner` overlay are exempt.
  5. Works offline after the service worker installs (`context.setOffline(true)`, reload, play an order). Run this in the Chromium project.
  6. **Mirror test:** two pages over `LocalTransport`; the child plays, Dad's page shows the same phase, ticket and dish from `MirrorView`, and a Dad cheer appears on the child's page.
  7. **Power-cycle test:** in test mode, drive a seeded save with `bossBeaten` to the closed screen, tap power off, tap power on, and verify the title screen at Level 1 with pairing retained.
- **Performance:** keep 60 fps on a mid-range phone. Initial JS under 250 KB gzipped per section 4, enforced by the size-check script. FPS itself is verified on real devices, not in CI.
- **Real devices** cannot be tested by you. Add a manual checklist to the README:
  - sound with the silent switch on and off;
  - sound during a Messenger Kids call in picture-in-picture;
  - return from the background;
  - airplane-mode play from the Home Screen icon;
  - pairing from the installed app;
  - call corner with a real PiP window.

## 11. Deliverables

- **Working game** in `game/` with placeholder art that looks intentional and fun.
- **`public/art/manifest.json`** covering every visual, each with an art brief.
- **`public/audio/clips.json`** and **`docs/recording-script.md`**, both generated from the frozen content in `src/content` (section 6.3):
  - every line Dad must record, grouped (welcome, order call-outs, ingredients, bases, amounts, joiners, level intros, tutorials, equipment gags, cheers including "Lightning chef!", level up, try again, pairing, goodbye / kitchen closed);
  - file naming (`<id>.m4a`);
  - recording tips: quiet room, one short take per line, natural and upbeat;
  - a reminder **never to say the child's name**.
- **`infra/`** CDK app, deployable with one command.
- **`docs/decisions.md`:** anything you decided that this prompt left open.
- **`README.md` (rewrite by merging, section 4):**
  - the one-liner and the story (no child name);
  - the existing hackathon dates and submission information, preserved;
  - how to run, test and deploy;
  - architecture (a Mermaid diagram);
  - the privacy statement (what is and isn't collected);
  - how Meta AI was used: Muse Wonder in Muse Code built this codebase; Muse Image + SAM 3.1 produce the art in a separate step; Muse Spark playtesting is a separate later step. Don't claim anything that hasn't happened yet. Write future steps in the future tense;
  - a **"Built during the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026)"** log of milestones;
  - the power-off / power-on cycle, the Home Screen storage caveat for pairing (section 7), the API-key 365-day expiry and rotation (section 8), and the real-device checklist.

## 12. Milestones and acceptance checks

Work on branch `wonder/build` (section 4). Commit at the end of every milestone, push the branch, and merge to `main` only after milestone 6 approval. Every gate also runs `typecheck`, `lint`, and the bundle size check.

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Scaffold `game/` and `infra/` skeletons, pins and fallback rule, lint/format, core types and phase union, **frozen content data**, generated `clips.json` + recording script skeleton, placeholder renderer, Vitest | `npm test` passes core tests for orders, comparison and levels; app boots to the title screen |
| 2 | Kiosk and kitchen screens with fixed zone tables, stage scaling, safe areas, rotate overlay, call corner | screens render at iPhone SE and iPad landscape; the call-corner Playwright test passes on the title, kiosk and kitchen screens |
| 3 | Full game loop: orders, levels 1–6, pace staircase/sawtooth, stars, easing off, saving, sessions and warm-up, boss ending, closed and power-off / power-on cycle | all core tests pass; the Playwright Level 1 test passes; a seeded run can reach the boss in test mode; the power-cycle test passes |
| 4 | Audio (unlock, SFX, gibberish, clip player + speech stand-in, call-out grammar and patience handshake), tutorials, hints, idle freeze, pause and auto-pause, parent area + gate, PWA/offline, icons | offline Playwright test passes; no console errors; `clips.json` and `docs/recording-script.md` are complete |
| 5 | Dad's Window: channel-path spike, `Transport`, `LocalTransport`, `AppSyncTransport`, pairing routes, mirror, glove, cheers, presence, publish validation | the mirror Playwright test passes over `LocalTransport`; solo play is unaffected with no config |
| 6 | Infra and deploy: CDK stack, split deploy output, `config.json`, scripts; README, decisions, polish | `cdk synth` succeeds and deployed cache headers verified; after Dad approves bootstrap/deploy, `npm run deploy` gives a working CloudFront URL and Dad's Window works between two real devices |

## 13. Out of scope (do not build)

AI or LLM calls at runtime; the AI playtester; accounts or logins; analytics; databases; sticker book, coins or shop; a start-over button, mid-game reset, or parent-area reset (the only reset is the post-boss power-off / power-on cycle, section 6.1); Dad calling orders live instead of clips; drawings, photos or avatars of the child; more than one broken channel at a time; levels beyond the boss; a custom domain; the art generation pipeline (separate prompt).

## 14. When something is unclear

Hard constraints (section 2) always win. For anything else, make the simplest choice that serves the two pillars and a 7-year-old's fun, record it in `docs/decisions.md`, and keep going. Stop and ask only before creating AWS resources or if a hard constraint can't be met.


