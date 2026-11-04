# Dad's voice clips

All 40 cues from **Order phrases** and **Ingredient names** are cut from
`working/audio/dad-voice.m4a` and connected through
[`game/public/audio/clips.json`](../game/public/audio/clips.json).

The original master remains unchanged and is not included in the repository.
Each clip is mono AAC in M4A, 48 kHz, 96 kbps. Cuts retain about 100 ms before
and 150 ms after speech, with short fades in the silence and a fixed −3 dB of
headroom. No synthesized speech or voice transformation is used in these files.
The timestamps below are seconds in the decoded master; duration is the cut
length before AAC container rounding.

The game uses these files for order call-outs, Head Chef HELP replay, and the
tutorial's lettuce/tomato example. Pizza and ice-cream cues are mapped and ready
for those ingredients; the current campaign serves burgers. The other 14
manifest entries remain without recordings and retain their speech fallback.
`basil` and `caramel` match the recording script; their old fallback labels
(`basil leaf` and `caramel drizzle`) have been aligned with it. The two tomato
IDs use their own separately recorded takes.

| Clip ID | Spoken words | Master range (s) | Duration (s) | File under `game/public/audio/clips/` |
| --- | --- | --- | --- | --- |
| `phrase.order_up` | Order up! | 1.535–2.371 | 0.836 | [`phrase.order_up.m4a`](../game/public/audio/clips/phrase.order_up.m4a) |
| `phrase.and` | and | 3.584–4.279 | 0.695 | [`phrase.and.m4a`](../game/public/audio/clips/phrase.and.m4a) |
| `amount.double` | double | 5.486–6.037 | 0.551 | [`amount.double.m4a`](../game/public/audio/clips/amount.double.m4a) |
| `ing.patty` | patty | 9.491–10.092 | 0.601 | [`ing.patty.m4a`](../game/public/audio/clips/ing.patty.m4a) |
| `ing.tomato` | tomato slice | 11.351–12.532 | 1.181 | [`ing.tomato.m4a`](../game/public/audio/clips/ing.tomato.m4a) |
| `ing.pineapple` | pineapple slice | 13.418–14.613 | 1.195 | [`ing.pineapple.m4a`](../game/public/audio/clips/ing.pineapple.m4a) |
| `ing.lettuce` | lettuce | 15.363–16.176 | 0.813 | [`ing.lettuce.m4a`](../game/public/audio/clips/ing.lettuce.m4a) |
| `ing.avocado` | avocado | 17.166–18.046 | 0.880 | [`ing.avocado.m4a`](../game/public/audio/clips/ing.avocado.m4a) |
| `ing.ketchup` | ketchup | 19.344–19.943 | 0.599 | [`ing.ketchup.m4a`](../game/public/audio/clips/ing.ketchup.m4a) |
| `ing.salsa` | salsa | 21.142–21.911 | 0.769 | [`ing.salsa.m4a`](../game/public/audio/clips/ing.salsa.m4a) |
| `ing.cheese` | cheese | 23.157–24.068 | 0.911 | [`ing.cheese.m4a`](../game/public/audio/clips/ing.cheese.m4a) |
| `ing.pickles` | pickles | 25.328–26.094 | 0.766 | [`ing.pickles.m4a`](../game/public/audio/clips/ing.pickles.m4a) |
| `ing.onionRings` | onion rings | 27.367–28.410 | 1.043 | [`ing.onionRings.m4a`](../game/public/audio/clips/ing.onionRings.m4a) |
| `ing.crispyOnions` | crispy onions | 29.387–30.582 | 1.195 | [`ing.crispyOnions.m4a`](../game/public/audio/clips/ing.crispyOnions.m4a) |
| `ing.crust.thin` | thin crust | 31.718–32.571 | 0.853 | [`ing.crust.thin.m4a`](../game/public/audio/clips/ing.crust.thin.m4a) |
| `ing.crust.thick` | thick crust | 33.902–34.913 | 1.011 | [`ing.crust.thick.m4a`](../game/public/audio/clips/ing.crust.thick.m4a) |
| `ing.sauce.redSmooth` | smooth red sauce | 36.098–37.663 | 1.565 | [`ing.sauce.redSmooth.m4a`](../game/public/audio/clips/ing.sauce.redSmooth.m4a) |
| `ing.sauce.redChunky` | chunky red sauce | 38.660–40.266 | 1.606 | [`ing.sauce.redChunky.m4a`](../game/public/audio/clips/ing.sauce.redChunky.m4a) |
| `ing.sauce.white` | white sauce | 41.321–42.463 | 1.142 | [`ing.sauce.white.m4a`](../game/public/audio/clips/ing.sauce.white.m4a) |
| `ing.pepperoni` | beef pepperoni | 43.639–44.922 | 1.283 | [`ing.pepperoni.m4a`](../game/public/audio/clips/ing.pepperoni.m4a) |
| `ing.greenPepper` | green pepper | 46.448–47.410 | 0.962 | [`ing.greenPepper.m4a`](../game/public/audio/clips/ing.greenPepper.m4a) |
| `ing.basil` | basil | 49.013–49.705 | 0.692 | [`ing.basil.m4a`](../game/public/audio/clips/ing.basil.m4a) |
| `ing.mushroom` | mushroom | 51.170–51.986 | 0.816 | [`ing.mushroom.m4a`](../game/public/audio/clips/ing.mushroom.m4a) |
| `ing.olives` | olives | 53.522–54.491 | 0.969 | [`ing.olives.m4a`](../game/public/audio/clips/ing.olives.m4a) |
| `ing.turkey` | turkey slice | 55.838–56.991 | 1.153 | [`ing.turkey.m4a`](../game/public/audio/clips/ing.turkey.m4a) |
| `ing.corn` | corn | 58.195–58.884 | 0.689 | [`ing.corn.m4a`](../game/public/audio/clips/ing.corn.m4a) |
| `ing.cup` | cup | 60.542–61.109 | 0.567 | [`ing.cup.m4a`](../game/public/audio/clips/ing.cup.m4a) |
| `ing.cone` | cone | 62.716–63.509 | 0.793 | [`ing.cone.m4a`](../game/public/audio/clips/ing.cone.m4a) |
| `ing.scoop.vanilla` | vanilla scoop | 64.787–65.848 | 1.061 | [`ing.scoop.vanilla.m4a`](../game/public/audio/clips/ing.scoop.vanilla.m4a) |
| `ing.scoop.chocolate` | chocolate scoop | 67.225–68.400 | 1.175 | [`ing.scoop.chocolate.m4a`](../game/public/audio/clips/ing.scoop.chocolate.m4a) |
| `ing.scoop.strawberry` | strawberry scoop | 69.602–70.943 | 1.341 | [`ing.scoop.strawberry.m4a`](../game/public/audio/clips/ing.scoop.strawberry.m4a) |
| `ing.cherry` | cherry | 72.490–73.220 | 0.730 | [`ing.cherry.m4a`](../game/public/audio/clips/ing.cherry.m4a) |
| `ing.grape` | grape | 74.435–75.159 | 0.724 | [`ing.grape.m4a`](../game/public/audio/clips/ing.grape.m4a) |
| `ing.whippedCream` | whipped cream | 76.330–77.512 | 1.182 | [`ing.whippedCream.m4a`](../game/public/audio/clips/ing.whippedCream.m4a) |
| `ing.marshmallow` | marshmallow | 78.642–79.655 | 1.013 | [`ing.marshmallow.m4a`](../game/public/audio/clips/ing.marshmallow.m4a) |
| `ing.chocChips` | chocolate chips | 80.585–81.820 | 1.235 | [`ing.chocChips.m4a`](../game/public/audio/clips/ing.chocChips.m4a) |
| `ing.sprinkles` | sprinkles | 82.738–83.909 | 1.171 | [`ing.sprinkles.m4a`](../game/public/audio/clips/ing.sprinkles.m4a) |
| `ing.banana` | banana slice | 85.078–86.376 | 1.298 | [`ing.banana.m4a`](../game/public/audio/clips/ing.banana.m4a) |
| `ing.caramel` | caramel | 87.489–88.379 | 0.890 | [`ing.caramel.m4a`](../game/public/audio/clips/ing.caramel.m4a) |
| `ing.pizzaTomato` | tomato slice | 89.496–90.818 | 1.322 | [`ing.pizzaTomato.m4a`](../game/public/audio/clips/ing.pizzaTomato.m4a) |

## Rebuild

The reviewed boundaries and master SHA-256 are recorded in
[`tools/audio/dad-voice-cues.json`](../tools/audio/dad-voice-cues.json).
With Python 3 and FFmpeg installed, run from the repository root:

```sh
python3 tools/audio/extract-dad-voice.py /absolute/path/to/dad-voice.m4a
```

This regenerates the audio files, manifest mappings, and this table. The script
rejects a different master so the time ranges cannot silently label the wrong speech.
