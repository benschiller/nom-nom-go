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

POSES = {
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

MONSTERS = [
    ("gobbler", "gobbler_002.png", "Gobbler, one enormous round orange belly as most of the body, small head merged on top with no neck, short stubby arms and legs with big round feet, one large friendly eye above two smaller eyes, wide smiling mouth with two small rounded teeth, tiny tufty sprout of hair, lighter cream belly patch"),
    ("doubleTrouble", "double_trouble_002.png", "Double-Trouble, two separate heads side-by-side on one shared chunky sky-blue body with two necks, left head round with one big eye and cheeky grin, right head slightly taller with two smaller eyes and curious smile, two arms, two short legs with big feet, lighter pale-blue belly, one tiny horn per head in different shapes"),
    ("sneezer", "sneezer_002.png", "Sneezer, one enormous round teal nose taking up most of the face with big shiny nostrils, small happy eyes above the nose, tiny mouth underneath, small round mint-green body, short arms and legs with big feet, messy tufts of hair, lighter aqua belly"),
    ("fussy", "fussy_002.png", "Fussy, neat dressed-up monster with one round gold monocle over one eye on a thin chain, neat red bow tie at the neck, tidy mustard-yellow body with cream belly, one eyebrow raised, slender build, longer arms, short legs with tidy pointed feet, small neat combed hair tuft"),
    ("speedy", "speedy_002.png", "Speedy, lean lime-green monster with long legs in oversized bright red sneakers, striped red-and-white sweatband across the forehead, long arms, wide eager grin, bright wide eyes, small lightning-bolt tuft of hair through the sweatband, lighter belly"),
    ("og", "og_002.png", "OG, tall purple one-eyed monster, one huge single eye centred in the face, wide friendly smile, smooth purple skin with a lighter lavender oval belly patch, long arms with three-finger hands, long legs with big flat feet, bold dark outline"),
]

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
    ("env.kitchen", "kitchen-master-stars_000.png", "Remove the monster, all food, dishes, stars, buttons and every UI element. Keep the kitchen interior, serving window, counter and ingredient bar as a clean empty set plate."),
    ("env.levelTruck", "level-transition-master.png", "Remove the chef, all pips, stars and text from the sign so the mustard sign board is blank. Keep truck, posts, sky and pavement as a clean plate."),
    ("env.night.goodbye", "end-game-night-master.png", "Remove every character. Keep the night truck with warm light glowing from the open serving hatch and windows, moon and stars, as a clean empty plate."),
    ("env.night.closed", "end-game-night-master.png", "Remove every character, close the serving hatch shutter fully and dim the lights low for closing time. Keep the night truck, moon and stars as a clean empty plate."),
    ("env.goWipe", "order-at-window-3-go-wipe.png", "Keep only the full-screen diagonal wipe graphic as a flat mustard-yellow wipe panel with a subtle sticker edge. Remove the monster, kitchen, all food and any text or letters."),
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

PROPS = [
    ("prop.bell", "a golden service bell with a button on top", 150),
    ("prop.trash", "a small grey trash bin with a lid", 104),
    ("prop.undo", "a chunky curved undo arrow, mustard yellow with dark outline", 104),
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
    for mid, master, desc in MONSTERS:
        for pose, pose_line in POSES.items():
            derive = pose == "idle"
            assets.append(asset(
                id=f"monster.{mid}.{pose}", category="monster",
                mode="derive" if derive else "generate",
                subject=f"{desc}. Pose: {pose_line}. Full body, facing camera with a slight 3/4 turn, standing on two feet.",
                refs=[f"{APPROVED}/{master}"],
                size="1024x1024", export={"w": 1024, "h": 1024, "alpha": True, "fill": 0.8},
                display="h340 centre / h300 side", sam=f"{mid} monster character",
                qa=["same character identity as the reference master", "correct pose and expression for the named pose", "full body with no cropped head or feet", "friendly and non-scary for a 7-year-old", "no text", "silhouette distinct from the other monsters"],
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
    for extra, desc in [("dish.bunBottom", "the bottom half of a burger bun, flat base with sesame top edge"), ("dish.bunTop", "the top half of a burger bun with sesame seeds, domed")]:
        assets.append(asset(
            id=extra, category="ingredient", mode="generate",
            subject=f"A flat layer of {desc}, viewed flat from slightly above, wide and flat like a sticker layer, no plate.",
            refs=[f"{APPROVED}/kitchen-master-stars_000.png"], size="1024x1024",
            export={"w": 256, "h": 256, "alpha": True, "fill": 0.8},
            display="92 in dish stack", sam=desc,
            qa=["bun half is instantly recognisable", "flat layer suitable for stacking", "no text"],
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
