# Dad's recording script — Nom Nom Go!

Record one short take per line. Quiet room, phone about 20 cm away, natural and upbeat.
Save each file as `<id>.m4a` (for example `phrase.order_up.m4a`) into `game/public/audio/clips/`, then set its `file` field in `game/public/audio/clips.json`.
**Never say the child's name.** These recordings are Dad's voice for the Head Chef.

The full machine-readable list is `game/public/audio/clips.json`; the `text` of every clip is the line to record. Groups:

- **Welcome:** `welcome.hello`
- **Order call-outs:** `phrase.order_up`, `phrase.and`, `amount.double`, plus every `ing.*` clip (one per ingredient, base part, and scoop flavour — 37 clips; text is the ingredient name, e.g. "tomato slice", "double" goes before doubled items automatically)
- **Cheers:** `cheer.great`, `cheer.lightning` ("Lightning chef!"), `cheer.wow`
- **Levels:** `level.intro`, `level.up`, `level.tryAgain`, `boss.rush`
- **Tutorials and equipment gags:** `tutorial.first`, `gag.speaker`, `gag.monitor`, `gag.kiosk`
- **Pairing:** `pair.team`
- **Goodbye:** `goodbye.closed` ("Kitchen's closed for the night!")

Tips: smile while recording — it is audible. Keep each clip under two seconds except cheers. If a clip is missing, the game speaks the line with the device voice instead, so recording everything is an upgrade, not a blocker.
