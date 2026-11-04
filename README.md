# Nom Nom Go!

A kitchen game for a kid and a parent to play together. Made possible with Meta AI.

I live in the UAE. My son is seven and lives in the USA. We have been apart for years, and most of our time together happens on video calls. I built Nom Nom Go! so we would have something to do on those calls besides ask each other how school went.

[GIF or screenshot goes here once the art pass lands]

## How it plays

Silly monsters order burgers right at the kitchen window (pizzas and sundaes are built and waiting as future development). The monster babbles its order one item at a time, the Head Chef repeats each item in my voice, and each ingredient pops into a tile below the counter, glowing as it is said. A Go! wipe sweeps across, the monster steps aside to wait, and my son builds the burger on the counter by tapping ingredients in the right order before the monster runs out of patience. A correct burger gets a gobble, a happy bounce, and a "Nom Nom!". If he gets stuck, the only help is the Head Chef button: tapping it stops the game while the Head Chef calls the order again and each ingredient's tile lights up in order, as often as he needs.

There are six levels. The last is a Rush hour boss. When it ends, the kitchen closes for the night, and that is the end of the session. The next time he powers the game on, the kitchen opens fresh for the next customers.

While he plays, I can open "Dad's Window" on my own device. I see what he sees, point at things with a glove to assist, and send a cheer for encouragement. The call brings us together, and the interactions give us connection.

The kid's game is meant to be a small exercise in focus and quick thinking, played with a parent.

## Made for a child with safety first

- No accounts, no analytics, no ads, no trackers.
- No AI runs while he plays.
- Nothing about him is collected: no name, photos, voice, or typed text.
- Progress, settings, pairing, and the last 200 orders stay on his device and are never sent anywhere.
- "Dad's Window" receives only game state, pointer position, and a fixed set of cheers. The pairing id travels in the URL fragment, so it never appears in server logs.
- The game works offline once installed on the Home Screen.

## How Meta AI was used

Muse Wonder, in Muse Code, wrote this codebase from the specification in [`docs/wonder-prompt.md`](docs/wonder-prompt.md). I reviewed and amended that prompt before it built anything.

Art is from Muse Image, with SAM 3.1 for cutting out characters and ingredients. Muse Spark playtested the levels.

## Built during the hackathon

This project was built between Oct 27 and Nov 4, 2026 for the Meta Global AI Developer Hackathon (solo entry, Indie Developer track).

## Run it

Requires Node 22.12+ or 24.

```bash
npm --prefix game install
npm run dev        # http://127.0.0.1:5173
npm test           # unit tests
npm run test:e2e   # Playwright, iPhone and iPad sizes
npm run build      # production build and bundle budget check
```

Deploying to AWS is covered in [`docs/hackathon.md`](docs/hackathon.md).

## How it is built

```mermaid
flowchart LR
  subgraph Child["Child device (PWA)"]
    Core["Pure core reducer\nsrc/core (seeded RNG, injected clock)"]
    UI["React screens\nsrc/ui"]
    Audio["Web Audio + Dad clips\nsrc/audio"]
    Net["Transport\nsrc/net"]
    Core --> UI --> Audio
    UI --> Net
  end
  subgraph Dad["Dad's device"]
    Mirror["Read-only mirror"]
  end
  subgraph AWS["AWS (eu-central-1)"]
    CF["CloudFront + S3"]
    EV["AppSync Events API"]
  end
  Net <--> EV
  EV <--> Mirror
  CF --> Child
  CF --> Dad
```

The game rules are a pure TypeScript reducer with a seeded random generator and an injected clock. They never call `Math.random()` or `Date.now()`, so any game can be replayed exactly. The child's device is the only writer of game state. Dad's Window is a whitelist mirror and cannot see anything else.

Difficulty adapts on the device, invisibly, in the same reducer. The game keeps a small per-skill estimate (building the base, telling look-alikes apart, amounts and doubles, right order, remembering the order — plus a separate speed measure) and adjusts five independent axes — how fast orders are shown, how long patience lasts, how much memory support (hints) is offered, how crowded the tray is, and how long orders get — each kept inside the current level's limits, so a slip on one skill never makes everything harder at once. Levels ask for 3–7 correct dishes each (31 across the six levels), sized with a built-in persona simulator so a full first run through all six levels takes roughly 21 minutes; a returning session warms up one level below the furthest uncompleted level, then carries on from there. None of this is shown to the child, and the estimates never leave the device.

Dad's 40 recorded order and ingredient clips live in `game/public/audio/clips/`. The [voice clip tracker](docs/dad-voice-clips.md) lists each filename, spoken line, and source time range. Any missing clip falls back to the device's speech voice.

Successful rounds play the serving monster's munch, followed by a paired cannon pop and cheer. Level and final victories add a trumpet fanfare. The eight celebration cues, their source credits, and timing are listed in the [sound manifest](game/public/audio/sfx/manifest.json) and [credits](game/public/audio/sfx/CREDITS.txt). Rebuild them with `python3 tools/audio/build-celebration-sounds.py` (FFmpeg with rubberband required).

## Pairing Dad's Window

1. On Dad's device, open `…/#dad` and choose **Copy pairing link**.
2. Open that link once on the child's device and confirm the picture.
3. Dad opens `…/#watch=<id>` to watch, point, and send cheers.

If the installed Home Screen app does not share storage with Safari, hold the chef-hat icon on the title screen for 3 seconds and use **paste pairing link**.

## Submission checklist

- [x] Public repository
- [x] Built during the hackathon period (Oct 27 – Nov 4, 2026)
- [x] Solo entry, Indie Developer track
- [x] Uses Meta models: Muse Wonder [add others as they are actually used]
- [ ] 3-minute demo video: [link]
- [ ] Submitted on Cerebral Valley

Event rules, dates, and links are in [`docs/hackathon.md`](docs/hackathon.md). Progress notes are in [`docs/progress.md`](docs/progress.md).
