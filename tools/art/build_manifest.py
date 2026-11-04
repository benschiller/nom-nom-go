#!/usr/bin/env python3
"""Build tools/art/manifest-v2.json — the production source of truth.

Derives the exhaustive element list from the approved masters, the game
content (mirrored below from game/src/content/content.ts), and the display
sizes measured in game/src/App.tsx (1600x900 stage). Run:
  python3 tools/art/build_manifest.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APPROVED = "generated_images/approved"

STYLE = (
    "Flat sticker illustration for a children's kitchen game, bold dark outlines on every shape, "
    "flat solid fills with subtle grain, no gradients, no painterly shading, no photoreal light, "
    "saturated cheerful palette, simple rounded silhouette readable by shape first at small size, "
    "match the attached reference image exactly in style, line weight and palette. "
    "No text, no letters, no numbers, no watermark, no logo."
)
CHROMA = "Single subject centred on a solid pure magenta #FF00FF background, subject occupies 80% of frame, generous padding on all sides, nothing else in frame."
NEG = "Do not resemble Om Nom, Toca Boca characters or any existing franchise character. Not scary, not realistic, not photographic, not 3D-render, not pixel-art."

LEGACY_POSES = {
    "idle": "standing idle, facing camera, arms relaxed at sides, calm cheerful smile",
    "walk": "mid-stride walk toward camera, one foot forward, arms swinging happily",
    "tap": "one arm raised tapping forward at a kitchen window, mouth open mid-babble, leaning in eagerly",
    "happy": "big delighted grin, eyes bright and round, arms slightly open with joy",
    "fidgety": "fingertips tapping together, eyebrows raised, shifting weight foot-to-foot, impatient but cute",
    "grumpy": "small steam puffs from sides of head, eyebrows lowered, arms crossed, one foot tapping, grumpy but never scary or mean",
    "gobble": "mouth stretched wide open mid-gobble, cheeks bulging, eyes squeezed shut in delight, hands up near mouth",
    "dance": "mid-dance bounce, both arms up, one foot lifted, huge open-mouth grin",
    "confused": "head tilted to one side, one eyebrow raised, small round o mouth, one hand scratching top of head",
    "leave": "body turned half-away, one arm waving goodbye, small friendly smile, one foot stepping away",
}

# Window poses (kitchen): upper body seen over the serving counter. The game
# draws the counter as a layer in front, so the flat cut at the bottom edge is
# always hidden. `frame` export keeps the whole canvas so every pose of a
# monster shares scale and anchor. Pose -> game state: tap = ordering, happy =
# waiting / Go! wipe / leaving, fidgety and grumpy = falling patience,
# gobble = correct serve, confused = wrong serve.
WINDOW_POSES = {
    "tap": "ordering food: mouth wide open mid-babble showing a pink tongue, eyes bright and eager, leaning slightly toward the viewer, one hand raised beside the face as if calling out an order",
    "happy": "waiting happily: big delighted closed-mouth smile, eyes bright and round, both hands clasped together in front of the chest",
    "fidgety": "getting impatient but still cute: eyebrows raised, small wobbly mouth, eyes glancing to one side, fingertips tapping together in front of the chest",
    "grumpy": "a bit cross and impatient: frowning eyebrows, a small pout, arms folded across the chest, two tiny white puffs of steam beside the head",
    "gobble": "eating with delight: mouth stretched wide open mid-gobble, cheeks bulging, eyes squeezed shut with joy, both hands up near the mouth",
    "confused": "puzzled: head tilted to one side, one eyebrow raised, small round o-shaped mouth, one hand scratching the top of the head",
}
WINDOW_FRAMING = ("Framing: head and upper body only, as seen from inside a food truck over its serving counter. The character is large "
                  "and centred. Its topmost point (hair tuft, horns, monocle, sweatband or lightning bolt) is clearly below the top edge, "
                  "with empty background above it covering at least the top 8% of the picture. Its body continues "
                  "straight down and is cut off flat by the bottom edge of the picture: no legs and no feet are visible. Facing the viewer. "
                  "No counter, no window, no drop shadow, no ground.")
MONSTER_KEY = {"og": ("green", "purple monster"), "gobbler": ("magenta", "orange monster"), "doubleTrouble": ("magenta", "blue monster"),
               "sneezer": ("magenta", "green monster"), "fussy": ("magenta", "yellow monster"), "speedy": ("magenta", "green monster")}
OG_WINDOW_REFS = {"tap": "generated_images/production/refs/kitchen/monster.og.order.png",
                  "happy": "generated_images/production/refs/kitchen/monster.og.wait.png"}

MONSTERS = [
    ("gobbler", "gobbler_002.png", "Gobbler, one enormous round orange belly as most of the body, small head merged on top with no neck, short stubby arms and legs with big round feet, one large friendly eye above two smaller eyes, wide smiling mouth with two small rounded teeth, tiny tufty sprout of hair, lighter cream belly patch"),
    ("doubleTrouble", "double_trouble_002.png", "Double-Trouble, two separate heads side-by-side on one shared chunky sky-blue body with two necks, left head round with one big eye and cheeky grin, right head slightly taller with two smaller eyes and curious smile, two arms, two short legs with big feet, lighter pale-blue belly, one tiny horn per head in different shapes"),
    ("sneezer", "sneezer_002.png", "Sneezer, one enormous round teal nose taking up most of the face with big shiny nostrils, small happy eyes above the nose, tiny mouth underneath, small round mint-green body, short arms and legs with big feet, messy tufts of hair, lighter aqua belly"),
    ("fussy", "fussy_002.png", "Fussy, neat dressed-up monster with one round gold monocle over one eye on a thin chain, neat red bow tie at the neck, tidy mustard-yellow body with cream belly, one eyebrow raised, slender build, longer arms, short legs with tidy pointed feet, small neat combed hair tuft"),
    ("speedy", "speedy_002.png", "Speedy, lean lime-green monster with long legs in oversized bright red sneakers, striped red-and-white sweatband across the forehead, long arms, wide eager grin, bright wide eyes, small lightning-bolt tuft of hair through the sweatband, lighter belly"),
    ("og", "og_002.png", "OG, tall purple one-eyed monster, one huge single eye centred in the face, wide friendly smile, smooth purple skin with a lighter lavender oval belly patch, long arms with three-finger hands, long legs with big flat feet, bold dark outline"),
]

# Burger v1 ingredients. Tray icons are drawn in the beige tiles of the
# storyboard's bottom panel; dish layers stack on the counter (side view,
# same width, like the storyboard's bun and patty). Look-alike pairs differ by
# silhouette: whole tomato / whole pineapple, leaf / halved avocado,
# squeeze bottle / bowl. Pizza and sundae keep their legacy entries (future
# development, not dealt in v1).
TRAY_STYLE = ("Style reference (crop from the approved storyboard's ingredient row): copy its chunky shapes, thick dark outlines, "
              "flat colours and soft grain exactly. Ignore the beige tiles and draw only the one ingredient described.")
TRAY_DESIGN = "Exact design reference (crop from the approved storyboard): reproduce this ingredient drawing exactly, alone, ignoring the beige tile."
BURGER_TRAY = {
    "patty": "a round flat grilled burger patty seen at a slight angle from above, rich brown with three lighter diagonal grill stripes on top",
    "cheese": "a chunky wedge of yellow cheese with round holes, seen at a slight angle",
    "tomato": "a whole round red tomato with a green leafy star-shaped top and a small white shine",
    "pineapple": "a small whole yellow pineapple with a criss-cross diamond pattern and a spiky green leaf crown",
    "lettuce": "a single ruffled bright green lettuce leaf with a pale green central vein, tilted",
    "pickles": "two whole bumpy green pickles lying side by side diagonally",
    "onionRings": "a small stack of three golden fried onion rings",
    "ketchup": "a red ketchup squeeze bottle with a pointed red nozzle cap",
    "avocado": "half an avocado cut lengthwise: pale green flesh, a big round brown pit, dark green skin edge",
    "salsa": "a small round blue bowl filled with chunky red salsa with green and white diced bits",
    "crispyOnions": "a small heap of thin golden crispy fried onion strands",
}
BURGER_DISH = {
    "patty": "a thick brown cooked burger patty with a bumpy edge",
    "cheese": "a thin flat square slice of yellow cheese seen from the side, with its four corners drooping down, exactly like the cheese layer in the attached burger",
    "tomato": "a thin red tomato slice",
    "pineapple": "a thick yellow pineapple slice seen from the side, a flat yellow slab with fibrous stripes on its edge, exactly like the pineapple layer in the attached burger",
    "lettuce": "a ruffled bright green lettuce leaf layer with wavy edges hanging over the sides",
    "pickles": "a row of round green pickle slices",
    "onionRings": "four golden fried onion rings lying flat in a row, side by side and slightly overlapping. Each ring lies flat (not standing up), seen from the side slightly from above, so it appears as a wide horizontal oval about three times wider than it is tall, with its hole a thin horizontal slit. Only the onion rings, nothing beneath them",
    "ketchup": "a thin flat puddle of glossy red ketchup lying flat, seen almost edge-on from the side, slightly from above: a wide thin flattened oval of red sauce with two or three short drips hanging from its front edge. Only the ketchup, nothing beneath it",
    "avocado": "four smooth avocado slices lying flat in a row, slightly overlapping. Each slice lies flat (not standing up), seen from the side slightly from above, so it appears as a long low smooth wedge about three times wider than it is tall: pale yellow-green flesh with a dark green skin edge along its front. Perfectly smooth outlines, no leaves, no lettuce, no pit, no whole avocado halves. Only the avocado slices, nothing beneath them",
    "salsa": "a chunky red salsa layer with green and white diced bits",
    "crispyOnions": "a tangle of thin golden crispy fried onion strands",
    "bunBottom": "a golden-tan bottom burger bun with a flat base and small speckles",
    "bunTop": "a domed golden top burger bun with white sesame seeds",
}
# SAM 3.1 needs a SHORT noun phrase for one object; long descriptions return no match.
TRAY_SAM = {"patty": "burger patty", "cheese": "cheese wedge", "tomato": "red tomato", "pineapple": "pineapple",
            "lettuce": "green leaf", "pickles": "pickles", "onionRings": "rings", "ketchup": "ketchup bottle",
            "avocado": "half avocado", "salsa": "bowl of salsa", "crispyOnions": "fried onions"}
DISH_SAM = {"patty": "food", "cheese": "cheese slice", "tomato": "tomato slice", "pineapple": "pineapple slice",
            "lettuce": "lettuce leaf", "pickles": "green pickle slices", "onionRings": "rings", "ketchup": "ketchup",
            "avocado": "green avocado slice", "salsa": "salsa", "crispyOnions": "fried onions",
            "bunBottom": "bottom bun", "bunTop": "burger bun"}
DISH_FRAMING = ("Draw only this one burger layer on its own, seen from the side at a slight angle from above, exactly as it would look "
                "inside a stacked cartoon burger: a thin horizontal layer about five times wider than it is tall, spanning about 70% of "
                "the picture width, centred, with plenty of empty background above, below and at both ends. Nothing above or below it, "
                "no plate, no drop shadow.")
# Layers the model drew wrong alone also get the approved tutorial burger, to
# copy that one layer from.
DISH_EXTRA_REF = {"pineapple": "generated_images/production/final/tut.burger.webp",
                  "cheese": "generated_images/production/final/tut.burger.webp"}
# Toppings that must lie flat take their style from the ingredient row (no
# patty in it), so the model draws only the topping.
DISH_FLAT = {"onionRings", "ketchup", "avocado"}
DISH_FLAT_NOTE = ("Style reference (crop from the approved storyboard's ingredient row): copy its chunky shapes, thick dark "
                  "outlines, flat colours and soft grain exactly. Draw only the one topping described, lying flat, nothing else.")
DISH_EXTRA_NOTE = ("Layer reference (approved burger): draw ONLY the one layer named above, the way this burger draws its layers; "
                   "draw nothing else from this burger.")
# The four flat toppings lie naturally on the burger (drapes, drips, overlapping
# slices), so they are not held to the thin 5:1 strip the other layers use.
TOPPINGS = {"cheese", "onionRings", "ketchup", "avocado"}
TOPPING_FRAMING = ("Draw only this one burger topping on its own, centred, with empty background all around it, "
                   "no plate, no drop shadow.")
TOPPING_QA = ["reads as the named burger topping lying flat", "clean outline all the way round", "nothing else drawn", "no plate", "no text"]
DISH_STYLE = ("Style reference (crop from the approved storyboard): copy its chunky shapes, thick dark outlines, flat colours and "
              "soft grain exactly. Ignore the counter and background.")

# id, dish, plain description for prompts (mirrors content.ts ITEMS)
ITEMS = [
    ("patty", "burger", "a round flat grilled beef patty with speckled sear marks"),
    ("tomato", "burger", "a single round tomato slice with seed pockets"),
    ("pineapple", "burger", "a single round pineapple ring slice with fibrous stripes"),
    ("lettuce", "burger", "a frilly green lettuce leaf"),
    ("avocado", "burger", "avocado slices fanned, green flesh with darker skin edge"),
    ("ketchup", "burger", "a glossy red ketchup drizzle swirl"),
    ("salsa", "burger", "a chunky red salsa dollop with visible diced pieces"),
    ("cheese", "burger", "a square orange cheese slice with draped corners"),
    ("pickles", "burger", "three round green pickle slices with seeds"),
    ("onionRings", "burger", "two pale golden onion rings"),
    ("crispyOnions", "burger", "a small pile of golden crispy fried onion strands"),
    ("crust.thin", "pizza", "a thin round pizza crust base, pale golden, viewed flat from above"),
    ("crust.thick", "pizza", "a thick puffy round pizza crust base with raised edge, viewed flat from above"),
    ("sauce.redSmooth", "pizza", "a smooth red tomato sauce spread circle for pizza"),
    ("sauce.redChunky", "pizza", "a chunky red tomato sauce spread with visible tomato pieces for pizza"),
    ("sauce.white", "pizza", "a creamy white sauce spread circle for pizza"),
    ("pepperoni", "pizza", "beef pepperoni slices, deep red with speckled fat"),
    ("pizzaTomato", "pizza", "fresh tomato slices for pizza with seed pockets"),
    ("greenPepper", "pizza", "green bell pepper rings and strips"),
    ("basil", "pizza", "fresh green basil leaves with veins"),
    ("mushroom", "pizza", "sliced mushrooms with tan caps and gills"),
    ("olives", "pizza", "sliced black olive rings"),
    ("turkey", "pizza", "pale turkey slices, folded"),
    ("corn", "pizza", "a small pile of yellow corn kernels"),
    ("cup", "sundae", "an empty striped sundae cup, blue and white"),
    ("cone", "sundae", "an empty waffle cone with criss-cross pattern"),
    ("scoop.vanilla", "sundae", "a single round vanilla ice cream scoop, creamy white"),
    ("scoop.chocolate", "sundae", "a single round chocolate ice cream scoop, brown"),
    ("scoop.strawberry", "sundae", "a single round strawberry ice cream scoop, pink with speckles"),
    ("cherry", "sundae", "a single glossy red cherry with stem"),
    ("grape", "sundae", "a single round purple grape with highlight"),
    ("whippedCream", "sundae", "a fluffy whipped cream swirl dollop"),
    ("marshmallow", "sundae", "two white marshmallows, soft cylinders"),
    ("chocChips", "sundae", "a small pile of dark chocolate chips"),
    ("sprinkles", "sundae", "a small pile of rainbow sprinkles"),
    ("banana", "sundae", "banana slices, pale yellow rounds with centre star"),
    ("caramel", "sundae", "a golden caramel drizzle swirl"),
]

ENVS = [
    ("env.night.goodbye", "end-game-night-master.png", "Remove every character. Keep the night truck with warm light glowing from the open serving hatch and windows, moon and stars, as a clean empty plate."),
    ("env.night.closed", "end-game-night-master.png", "Remove every character, close the serving hatch shutter fully and dim the lights low for closing time. Keep the night truck, moon and stars as a clean empty plate."),
]

# Screen-pass assets. Bleed plates: a 3:2 clean plate (1920x1280, the
# approved master's framing) outpainted by `pad` px per side. In stage
# units (master fit to the 1600-wide safe area, scale 5/6) every bleed
# plate covers 2000x1333 at left -200, top -216.7: any viewport from
# 4:3 to ~2.2:1 is filled with no bars. See .muse/skills/art-integration.
BLEED = {"pad": [240, 160], "feather": 48}
BLEEDS = []  # env.title is now generated whole as a wide plate (see WIDE_PLATES)

# Title background: user-supplied extended plate (2400x1600, 3:2 = the 2000x1333
# bleed box). Its truck is 1.23x the storyboard's, so truck-anchored pieces (the
# chef in the window) use the measured frame in game/src/App.tsx (TITLE_TRUCK_FRAME).
IMPORTED_PLATES = [
    ("env.title", "generated_images/production/import/extended_edge.png",
     "Title background plate supplied by the user: coral food truck with empty serving window, sky, hills, ground and confetti extended to every edge."),
]


# Title screen pieces (S1). Storyboards are targets, never cut sources: each
# piece is generated alone on a flat key colour from its approved character
# sheet, with a storyboard crop as POSE reference only, then cut with the
# SAM-soft cutter. `place` is its box in the title master (master px), so the
# game puts it where the storyboard has it. Purple subjects use a green key.
TITLE_REFS = "generated_images/production/refs/title"
POSE_NOTE = ("Pose and framing reference only (taken from the approved title storyboard): copy this pose, "
             "expression and proportions exactly, but ignore its background and anything behind the subject.")
TITLE = [
    dict(id="monster.og.wave", category="monster", key="green", sam="purple monster",
         refs=[f"{APPROVED}/og_002.png", f"{TITLE_REFS}/monster.og.wave.png"],
         ref_notes=["Character identity reference (approved character sheet): match this character exactly.", POSE_NOTE],
         subject="OG, tall purple one-eyed monster, one huge single eye, wide happy open-mouth smile with pink tongue, "
                 "smooth purple skin with a lighter lavender oval belly patch, long arms with small hands, long legs with big flat feet. "
                 "Pose: standing tall facing camera, waving hello with its left arm raised high beside its head, other arm relaxed at its side. "
                 "Full body, nothing cropped, no drop shadow, no ground.",
         place=[99, 522, 552, 1121]),
    dict(id="monster.gobbler.wave", category="monster", key="magenta", sam="orange monster",
         refs=[f"{APPROVED}/gobbler_002.png", f"{TITLE_REFS}/monster.gobbler.wave.png"],
         ref_notes=["Character identity reference (approved character sheet): match this character exactly.", POSE_NOTE],
         subject="Gobbler, round orange monster whose body is one big belly with a cream belly patch, one large eye above two small eyes, "
                 "wide smile with two small teeth, tiny tuft of hair, short stubby arms and legs with big round feet. "
                 "Pose: standing facing camera, waving hello with its right arm raised high, other arm relaxed. "
                 "Full body, nothing cropped, no drop shadow, no ground.",
         place=[1389, 626, 1838, 1147]),
    dict(id="chef.windowWave", category="chef", key="magenta", sam="chef",
         refs=[f"{APPROVED}/head-chef-dad.png", f"{TITLE_REFS}/chef.windowWave.png"],
         ref_notes=["Character identity reference (approved Head Chef): match this character exactly.", POSE_NOTE],
         subject="The Head Chef: friendly older man with warm brown skin, short grey hair, tall white chef hat, white double-breasted chef jacket. "
                 "Upper body from the waist up, facing camera, big warm smile, waving hello with his left hand raised beside his head. "
                 "No counter, no window, no drop shadow.",
         place=[746, 474, 1074, 743]),
    dict(id="ui.goButton", category="prop", key="magenta", sam="green circle button",
         refs=[f"{TITLE_REFS}/ui.goButton.png"],
         ref_notes=["Exact design reference: reproduce this button exactly, alone."],
         subject="A big round play button: a perfect circle filled with bright green, a thick dark outline, and a large rounded white play "
                 "triangle in the centre pointing right. Flat, no text, no drop shadow.",
         place=[783, 901, 1145, 1250]),
]
TITLE_QA = ["clean outline all the way round, even thickness", "nothing cropped",
            "matches the identity/design reference", "no drop shadow or background remnants"]
TITLE_MASTER_SIZE = (1920, 1280)  # title-intro-master.png; the logo is native text in the game

# Kitchen screens (ordering, Go! wipe, cooking). Targets: order-at-window-1/2/3
# and go-start-gameplay. There is NO kitchen background image: the scene is
# layers in the game (wall, hills, window frame, counter and bottom panel are
# native SVG in App.tsx), with the monster drawn between the window and the
# counter. Buttons are generated alone on a key colour and SAM-soft cut; the
# storyboard crops in refs/kitchen are design references only. The Go! wipe is
# native (CSS band, "GO!" text, SVG triangle).
KITCHEN_REFS = "generated_images/production/refs/kitchen"
DESIGN_NOTE = "Exact design reference (crop from the approved storyboard): reproduce this button exactly, alone, ignoring anything around it."
KITCHEN = [
    dict(id="prop.undo", category="prop", key="magenta", sam="circle",
         refs=[f"{KITCHEN_REFS}/prop.undo.png"], ref_notes=[DESIGN_NOTE],
         subject="A round button: a perfect circle filled with bright medium blue, a thick dark outline, and inside it a chunky "
                 "U-shaped undo arrow in a deeper blue with a dark outline, its arrowhead pointing left. Flat, no text, no drop shadow."),
    dict(id="prop.bell", category="prop", key="magenta", sam="yellow circle",
         refs=[f"{KITCHEN_REFS}/prop.bell.png"], ref_notes=[DESIGN_NOTE],
         subject="A round button: a perfect circle filled with warm golden yellow, a thick dark outline, and inside it a big golden "
                 "service bell with a small knob on top and a dark outline. Flat, no text, no drop shadow."),
    dict(id="prop.trash", category="prop", key="green", sam="red circle",
         refs=[f"{KITCHEN_REFS}/prop.trash.png"], ref_notes=[DESIGN_NOTE],
         subject="A round button: a perfect circle filled with bright tomato red, a thick dark outline, and inside it a red trash can "
                 "with a lid and three vertical lines, drawn with a dark outline. Flat, no text, no drop shadow."),
]
KITCHEN_QA = ["clean edge all the way round", "nothing cropped", "matches the design reference",
              "no drop shadow or background remnants", "no text or letters"]

# Tutorial (three steps before Level 1). Targets: tutorial-01/02/03. Each piece is
# generated alone on a key colour with a storyboard crop in refs/tutorial as a
# DESIGN or POSE reference only, then SAM-soft cut. Tiles, progress dots and the
# golden arrow are native CSS/SVG in the game; positions live in TUTORIAL_LAYOUT
# (App.tsx). Tutorial pieces have their own ids so gameplay art is untouched.
TUT_REFS = "generated_images/production/refs/tutorial"
TUT_DESIGN = "Exact design reference (crop from the approved tutorial storyboard): reproduce this drawing exactly, alone, ignoring the beige tile, the background and anything around it."
TUTORIAL_PLATE = dict(
    id="env.tutorial", category="env", mode="generate", size="1536x1024",
    refs=[f"{APPROVED}/tutorial-01.png"],
    ref_notes=["Style and colour reference (approved storyboard): copy only its warm cream paper background and the soft teal glow "
               "in the top-right corner. Ignore every object, icon, circle, button and character: the new picture is empty."],
    subject="Empty background: warm cream paper colour with a very subtle soft grain, filling the whole picture. In the top-right corner, "
            "a soft cloudy teal-turquoise glow fades gently into the cream, covering about the right third of the top half; the rest is plain "
            "cream. Completely empty: no objects, no shapes, no outlines, no icons, no characters, no text.",
    export={"w": 2400, "h": 1600, "alpha": False, "max_side": 2400},
    display="2000x1333 bleed box, safe 1600x900 centre", sam=None,
    qa=["no text or letters", "no objects, icons or characters", "cream paper with a soft teal glow top-right", "no seams or frames"],
)
TUTORIAL = [
    dict(id="tut.lettuce", category="tutorial", key="magenta", sam="green leaf",
         refs=[f"{TUT_REFS}/tut.lettuce.png"], ref_notes=[TUT_DESIGN],
         subject="A single big ruffled green lettuce leaf, tilted diagonally with its stem at the bottom left, bright green with a pale "
                 "green central vein and branching veins, thick dark outline. Flat, no drop shadow, no ground."),
    dict(id="tut.tomato", category="tutorial", key="magenta", sam="red tomato",
         refs=[f"{TUT_REFS}/tut.tomato.png"], ref_notes=[TUT_DESIGN],
         subject="A single whole round red tomato with a green leafy star-shaped top, a small white shine on its left side, thick dark "
                 "outline. Flat, no drop shadow, no ground."),
    dict(id="tut.patty", category="tutorial", key="magenta", sam="burger patty on a bun",
         refs=[f"{TUT_REFS}/tut.patty.png"], ref_notes=[TUT_DESIGN],
         subject="A thick bumpy brown cooked burger patty sitting on a golden-tan bottom bun with small speckles, seen from slightly "
                 "above, thick dark outlines. Flat, no drop shadow, no ground."),
    dict(id="tut.glove", category="tutorial", key="magenta", sam="white glove hand",
         refs=[f"{TUT_REFS}/tut.glove.png"], ref_notes=[TUT_DESIGN],
         subject="A white cartoon glove hand seen from the back, pointing its index finger diagonally down and to the right, other "
                 "fingers curled, three short dark crease lines on the back of the hand, thick dark outline. Flat, no drop shadow."),
    dict(id="tut.burger", category="tutorial", key="magenta", sam="burger",
         refs=[f"{TUT_REFS}/tut.burger.png"], ref_notes=[TUT_DESIGN],
         subject="A tall stacked cheeseburger seen from the side, from top to bottom: domed golden sesame top bun, ruffled green "
                 "lettuce, a thick yellow pineapple slice, a red tomato slice with a thin green edge, a brown patty, a yellow cheese slice "
                 "with draped corners, a second brown patty, golden speckled bottom bun. Thick dark outlines, flat colours. No drop shadow, no plate."),
    dict(id="tut.bell", category="tutorial", key="magenta", sam="yellow circle",
         refs=[f"{TUT_REFS}/tut.bell.png"], ref_notes=[TUT_DESIGN],
         subject="A round button: a perfect circle filled with warm golden yellow, a thick dark outline, and inside it a big golden "
                 "service bell with a small loop handle on top and a round clapper below, a light shine on its left, dark outline. "
                 "Flat, no text, no drop shadow."),
    dict(id="monster.gobbler.point", category="monster", key="magenta", sam="orange monster",
         refs=[f"{APPROVED}/gobbler_002.png", f"{TUT_REFS}/monster.gobbler.point.png"],
         ref_notes=["Character identity reference (approved character sheet): match this character exactly.",
                    "Pose and framing reference only (taken from the approved tutorial storyboard): copy this pose, expression and "
                    "proportions exactly, but ignore its background, the red tile and anything behind the subject."],
         subject="Gobbler, round orange monster whose body is one big belly with a cream belly patch, one large eye above two small eyes, "
                 "wide smile with two small teeth, tiny tuft of hair, short stubby arms and legs with big round feet. "
                 "Pose: standing facing camera, its right arm stretched out to the left side of the picture, pointing with one finger, "
                 "other arm relaxed at its side. Full body, nothing cropped, no drop shadow, no ground."),
]
TUTORIAL_QA = ["clean outline all the way round, even thickness", "nothing cropped", "matches the design reference",
               "no drop shadow or background remnants", "no text or letters"]

PROPS = [
    ("prop.pause", "two chunky vertical pause bars in a rounded badge", 140),
    ("prop.play", "a chunky green play triangle in a rounded badge", 220),
    ("prop.speakerOn", "a speaker with sound waves coming out", 120),
    ("prop.speakerStatic", "a speaker with electric static sparks and a cracked look, funny not scary", 120),
    ("ui.star.lit", "a single chunky gold star, lit and shiny", 84),
    ("ui.star.unlit", "a single chunky star outline, pale cream and dim, unlit", 84),
    ("ui.pip.lit", "a single round level pip, lit orange and glowing", 52),
    ("ui.pip.unlit", "a single round level pip, dim cream and unlit", 52),
    ("ui.glove", "a white cartoon chef glove hand pointing with one finger", 92),
    ("ui.badgeDad", "a friendly cartoon dad chef face badge, smiling, white chef hat, inside a plain circle", 140),
    ("cheer.thumbs", "a cheerful thumbs-up hand icon", 120),
    ("cheer.heart", "a big red heart icon", 120),
    ("cheer.wow", "a wow starburst badge with an excited open-mouth face, no text", 120),
    ("ui.powerOff", "a power symbol pictogram, chunky and clear", 170),
    ("ui.powerOn", "a glowing power symbol pictogram in yellow on dark blue circle", 190),
    ("ui.rotate", "a phone rotating sideways pictogram with a curved arrow", 120),
    ("ui.nomBubble", "an empty white speech bubble with a chunky dark outline and a small tail, nothing inside", 300),
]


def asset(**kw):
    base = {"status": "pending", "version": 1}
    base.update(kw)
    return base


def main():
    assets = []
    for eid, master, instruction in ENVS:
        assets.append(asset(
            id=eid, category="env", mode="edit",
            subject=instruction, refs=[f"{APPROVED}/{master}"],
            size="1536x1024", export={"w": 3200, "h": 1800, "alpha": False},
            display="1600x900", sam=None,
            qa=["no text or letters", "no characters", "composition matches the master", "top-right call corner is plain scenery only"],
        ))
    for eid, plate, subject in BLEEDS:
        assets.append(asset(
            id=eid, category="env", mode="bleed", subject=subject, refs=[plate], bleed=BLEED,
            size="1536x1024", export={"w": 2400, "h": 1600, "alpha": False},
            display="2000x1333 bleed, safe 1600x900 centre", sam=None,
            qa=["no text or letters", "no characters", "edges extend the scene naturally with no visible seam or frame",
                "nothing mirrored or duplicated", "top-right call corner is plain scenery only"],
        ))
    for spec in TITLE:
        spec = dict(spec)
        x0, y0, x1, y1 = spec.pop("place")
        mw, mh = TITLE_MASTER_SIZE
        spec["place_frac"] = [round(x0 / mw, 5), round(y0 / mh, 5), round(x1 / mw, 5), round(y1 / mh, 5)]
        assets.append(asset(
            id=spec.pop("id"), category=spec.pop("category"), mode="generate", cutter="sam-soft",
            size=spec.pop("size", "1024x1024"), export={"alpha": True, "trim": True, "max_side": 1100},
            display="title, placed by master box", qa=TITLE_QA,
            **spec,
        ))
    for eid, src, subject in IMPORTED_PLATES:
        assets.append(asset(
            id=eid, category="env", mode="derive", subject=subject, refs=[src],
            size="import", export={"w": 2400, "h": 1600, "alpha": False, "max_side": 2400},
            display="2000x1333 bleed box, safe 1600x900 centre", sam=None,
            qa=["no text or letters", "no characters and an empty serving window",
                "scenery continues to every edge with no seams or frames"],
        ))
    assets.append(asset(
        id="env.night.frame", category="env", mode="derive",
        subject="Night truck front plate with the serving window transparent (derived from env.night.goodbye by tools/art/make_night_frame.py); the goodbye chef layers behind it.",
        refs=["generated_images/production/final/env.night.goodbye.webp"],
        size="1600x900", export={"w": 1600, "h": 900, "alpha": True, "max_side": 1600},
        display="1600x900", sam=None,
        qa=["window fully transparent with clean rounded corners", "truck, string lights and counter unchanged outside the window"],
    ))
    assets.append(asset(**TUTORIAL_PLATE))
    for spec in TUTORIAL:
        spec = dict(spec)
        assets.append(asset(
            id=spec.pop("id"), category=spec.pop("category"), mode="generate", cutter="sam-soft",
            size=spec.pop("size", "1024x1024"), export={"alpha": True, "trim": True, "max_side": 1100},
            display="tutorial, placed by TUTORIAL_LAYOUT in App.tsx", qa=TUTORIAL_QA,
            **spec,
        ))
    for spec in KITCHEN:
        spec = dict(spec)
        assets.append(asset(
            id=spec.pop("id"), category=spec.pop("category"), mode="generate", cutter="sam-soft",
            size=spec.pop("size", "1024x1024"), export={"alpha": True, "trim": True, "max_side": 600},
            display="kitchen, placed by KITCHEN_LAYOUT in App.tsx", qa=KITCHEN_QA,
            **spec,
        ))
    for mid, master, desc in MONSTERS:
        key, noun = MONSTER_KEY[mid]
        for pose, pose_line in WINDOW_POSES.items():
            refs = [f"{APPROVED}/{master}"]
            notes = ["Character identity reference (approved character sheet): match this character exactly, its colours, eyes, "
                     "mouth, hair and markings."]
            if mid == "og" and pose in OG_WINDOW_REFS:
                refs.append(OG_WINDOW_REFS[pose])
                notes.append("Pose and framing reference only (crop from the approved storyboard): copy how large the character is, "
                             "its expression and how its body is cut off at the bottom; ignore the background.")
            assets.append(asset(
                id=f"monster.{mid}.{pose}", category="monster", mode="generate", cutter="sam-soft", key=key, sam=noun,
                subject=f"{desc}. Pose: {pose_line}. {WINDOW_FRAMING}",
                refs=refs, ref_notes=notes, size="1024x1024",
                export={"alpha": True, "frame": True, "max_side": 1280},
                display="kitchen window, placed by KITCHEN_LAYOUT in App.tsx",
                qa=["same character identity as the reference sheet", "correct expression for the named pose",
                    "head and upper body only, cut off flat at the bottom edge", "friendly and non-scary for a 7-year-old",
                    "clean outline all the way round", "no text"],
            ))
    chef_ref = f"{APPROVED}/head-chef-dad.png"
    chef_poses = {
        "hello": "waving hello with one hand, big friendly smile",
        "point": "pointing forward with one hand as if teaching, friendly smile",
        "thumbs-up": "giving a thumbs up, proud smile",
        "cheer": "cheering with both arms up, joyful open-mouth smile",
        "think": "thinking, one hand on chin, looking up thoughtfully",
        "surprised": "surprised, eyebrows up, mouth in a small o, hands slightly raised",
        "clap": "clapping hands together, delighted smile",
        "goodbye": "waving goodbye with one hand, warm sleepy smile",
    }
    for pose, line in chef_poses.items():
        assets.append(asset(
            id=f"chef.{pose}", category="chef", mode="generate",
            subject=f"The same Head Chef dad character as the reference, white chef hat and uniform. Pose: {line}. Full body, facing camera.",
            refs=[chef_ref], size="1024x1024",
            export={"w": 1024, "h": 1024, "alpha": True, "fill": 0.8},
            display="280", sam="chef character",
            qa=["same Head Chef identity as the reference", "correct pose", "full body, nothing cropped", "no text"],
        ))
    assets.append(asset(
        id="chef.helpFace", category="chef", mode="generate",
        subject="The same Head Chef dad character as the reference, head and shoulders only, big friendly encouraging smile, centred for a circular button crop, white chef hat.",
        refs=[chef_ref], size="1024x1024",
        export={"w": 512, "h": 512, "alpha": True, "fill": 0.8},
        display="104 circle", sam="chef", cutter="sam-soft",
        qa=["same Head Chef identity as the reference", "head centred for circle crop", "friendly expression", "no text"],
    ))
    assets.append(asset(
        id="chef.hatch", category="chef", mode="derive",
        subject="Head Chef in the serving hatch, from the approved hatch master.",
        refs=[f"{APPROVED}/head-chef-dad-hatch.png"], size="1536x1024",
        export={"w": 1024, "h": 1024, "alpha": True, "fill": 0.8},
        display="hatch", sam="chef character in window",
        qa=["same Head Chef identity", "nothing important cropped", "no text"],
    ))
    for item_id, dish, desc in ITEMS:
        if dish == "burger":
            ref = f"{KITCHEN_REFS}/item.{item_id}.tray.png"
            crop = (ROOT / ref).exists()
            assets.append(asset(
                id=f"item.{item_id}.tray", category="ingredient", mode="generate", cutter="sam-soft", key="magenta",
                subject=f"A single chunky ingredient icon: {BURGER_TRAY[item_id]}. Bold and instantly readable at small size. "
                        "No drop shadow, no ground, no tile.",
                refs=[ref if crop else f"{KITCHEN_REFS}/tray.row.png"], ref_notes=[TRAY_DESIGN if crop else TRAY_STYLE],
                size="1024x1024", export={"alpha": True, "trim": True, "max_side": 512},
                display="kitchen tray tile, placed by KITCHEN_LAYOUT in App.tsx", sam=TRAY_SAM[item_id],
                qa=["ingredient is instantly recognisable", "bold silhouette readable at 80px", "clean outline all the way round",
                    "single ingredient only", "no text"],
            ))
            continue
        assets.append(asset(
            id=f"item.{item_id}.tray", category="ingredient", mode="generate",
            subject=f"A single bold ingredient icon for a {dish}: {desc}. Chunky, instantly readable at tiny size, slight 3/4 view.",
            refs=[f"{APPROVED}/kitchen-master-stars_000.png"], size="1024x1024",
            export={"w": 256, "h": 256, "alpha": True, "fill": 0.8},
            display="104 tray / 72 sill", sam=desc,
            qa=["ingredient is instantly recognisable", "bold silhouette readable at 72px", "no text", "single ingredient only, no plate or extra food"],
        ))
        assets.append(asset(
            id=f"item.{item_id}.dish", category="ingredient", mode="generate",
            subject=f"A flat layer of {desc} for stacking on a {dish}, viewed flat from slightly above, wide and flat like a sticker layer, no plate, no bowl, no shadow blob.",
            refs=[f"{APPROVED}/kitchen-master-stars_000.png"], size="1024x1024",
            export={"w": 256, "h": 256, "alpha": True, "fill": 0.8},
            display="92 in dish stack", sam=desc,
            qa=["reads as the same ingredient as its tray icon", "flat layer suitable for stacking in a dish", "no plate or bowl unless the ingredient is the cup or cone itself", "no text"],
        ))
    for layer, desc in BURGER_DISH.items():
        aid = f"dish.{layer}" if layer.startswith("bun") else f"item.{layer}.dish"
        assets.append(asset(
            id=aid, category="ingredient", mode="generate", cutter="sam-soft", key="magenta",
            subject=f"One burger layer: {desc}. {TOPPING_FRAMING if layer in TOPPINGS else DISH_FRAMING}",
            refs=([f"{KITCHEN_REFS}/tray.row.png"] if layer in DISH_FLAT else [f"{KITCHEN_REFS}/dish.stack.png"])
                 + ([DISH_EXTRA_REF[layer]] if layer in DISH_EXTRA_REF else []),
            ref_notes=([DISH_FLAT_NOTE] if layer in DISH_FLAT else [DISH_STYLE])
                      + ([DISH_EXTRA_NOTE] if layer in DISH_EXTRA_REF else []),
            size="1536x1024", export={"alpha": True, "trim": True, "max_side": 900},
            display="dish stack on the counter, placed by KITCHEN_LAYOUT in App.tsx", sam=DISH_SAM[layer],
            qa=TOPPING_QA if layer in TOPPINGS else ["reads as the named burger layer", "wide flat side view for stacking", "clean outline all the way round", "no plate", "no text"],
        ))
    for pid, desc, display in PROPS:
        assets.append(asset(
            id=pid, category="prop", mode="generate",
            subject=f"A single chunky game UI icon: {desc}. Bold, simple, readable at small size.",
            refs=[f"{APPROVED}/kitchen-master-stars_000.png"], size="1024x1024",
            export={"w": 512, "h": 512, "alpha": True, "fill": 0.8},
            display=str(display), sam=desc,
            qa=["icon meaning is instantly clear without text", "chunky and readable at small size", "no text or letters"],
        ))
    assets.append(asset(
        id="ui.appIcon", category="prop", mode="generate",
        subject="App icon: the purple one-eyed OG monster face wearing a white chef hat, huge and centred, cheerful grin, bold sticker style on a coral-orange background, no text.",
        refs=[f"{APPROVED}/og_002.png"], size="1024x1024",
        export={"w": 1024, "h": 1024, "alpha": False},
        display="PWA icon source", sam=None,
        qa=["OG monster identity matches the reference", "chef hat clearly visible", "reads at 48px", "no text"],
    ))

    manifest = {
        "v": 2,
        "stage": "1600x900",
        "style_block": STYLE,
        "chroma_block": CHROMA,
        "negative_block": NEG,
        "models": {"image": "muse-image-1.0", "qa": "muse-spark-1.3", "sam": "sam-3.1"},
        "note": "OG (og_002) gets a full pose set in addition to style-anchor and app-icon roles. Integration into gameplay is out of scope for this manifest.",
        "assets": assets,
    }
    out = Path(__file__).with_name("manifest-v2.json")
    out.write_text(json.dumps(manifest, indent=2) + "\n")
    from collections import Counter
    print(f"wrote {out}: {len(assets)} assets", dict(Counter(a['category'] for a in assets)))


if __name__ == "__main__":
    main()
