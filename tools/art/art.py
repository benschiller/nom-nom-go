#!/usr/bin/env python3
"""Nom Nom Go! artwork production CLI.

Manifest-driven generation (Muse Image), cut-out (SAM 3.1 with chroma
fallback), normalisation, Spark QA, contact sheets, and versioned
revisions. Production only: never touches game code.

Commands:
  status | spike | run --batch B [--only ID] | qa --id ID |
  sheet | revise --id ID --note TEXT [--ref PNG] | rebuild --id ID

Modes (manifest `mode`): generate | edit | derive | cut | bleed.
  cut   - SAM 3.1 cut of one element from an approved master, kept at
          master pixels; its master-space box is recorded as `placement`.
  bleed - outpaint a clean plate (refs[0]) past the 16:9 safe area so
          it covers any landscape viewport; the centre is pixel-locked.
"""
import argparse
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
PROD = ROOT / "generated_images" / "production"
SRC_DIR, FIN_DIR, QA_DIR, SHEET_DIR = (PROD / d for d in ("source", "final", "qa", "sheets"))
LEDGER_PATH = PROD / "ledger.json"
MANIFEST = json.loads((TOOLS / "manifest-v2.json").read_text())
BY_ID = {a["id"]: a for a in MANIFEST["assets"]}
MAX_ATTEMPTS = 3
_LED_LOCK = __import__("threading").Lock()


def record(asset_id: str, rec: dict) -> None:
    with _LED_LOCK:
        led = ledger()
        led[asset_id] = rec
        save_ledger(led)


def load_env() -> None:
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    os.environ.setdefault("MODEL_API_KEY", os.environ.get("MUSE_API_KEY", ""))


load_env()
from openai import OpenAI  # noqa: E402

# Fail fast: a stuck call errors in minutes, not the client default of 10.
CLIENT = OpenAI(base_url="https://api.meta.ai/v1", api_key=os.environ["MODEL_API_KEY"], timeout=180, max_retries=1)


def ledger() -> dict:
    if LEDGER_PATH.exists():
        return json.loads(LEDGER_PATH.read_text())
    return {}


def save_ledger(led: dict) -> None:
    # Atomic replace: parallel workers read the ledger while others write it.
    PROD.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER_PATH.with_suffix(f".{os.getpid()}.{__import__('threading').get_ident()}.tmp")
    tmp.write_text(json.dumps(led, indent=2) + "\n")
    os.replace(tmp, LEDGER_PATH)


def data_url(path: Path | Image.Image, max_side: int = 1024) -> str:
    img = path if isinstance(path, Image.Image) else Image.open(path)
    if img.mode == "RGBA":
        # Composite over a light checkerboard so transparent pixels are
        # never sent (or judged) as black.
        import numpy as np

        cell = 32
        yy, xx = np.mgrid[0 : img.height, 0 : img.width]
        board_arr = np.where(
            ((xx // cell + yy // cell) % 2)[..., None],
            np.array([200, 200, 210], np.uint8),
            np.array([235, 235, 240], np.uint8),
        )
        board = Image.fromarray(board_arr.astype(np.uint8), "RGB")
        board.paste(img, (0, 0), img)
        img = board
    else:
        img = img.convert("RGB")
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


KEY_COLOURS = {"magenta": "pure magenta #FF00FF", "green": "pure green #00FF00"}


def build_prompt(entry: dict, extra: str = "") -> str:
    parts = [MANIFEST["style_block"], entry["subject"]]
    if entry["export"].get("alpha"):
        parts.append(MANIFEST["chroma_block"].replace("pure magenta #FF00FF", KEY_COLOURS[entry.get("key", "magenta")]))
    parts.append(MANIFEST["negative_block"])
    if extra:
        parts.append("Fix these problems from the previous attempt: " + extra)
    return "\n".join(parts)


def generate_image(entry: dict, extra: str = "") -> tuple[Path, str]:
    content: list[dict] = [{"type": "input_text", "text": build_prompt(entry, extra)}]
    notes = entry.get("ref_notes", [])
    for i, ref in enumerate(entry.get("refs", [])):
        label = notes[i] if i < len(notes) else "Reference image (match this exactly):"
        content.append({"type": "input_text", "text": label})
        content.append({"type": "input_image", "image_url": data_url(ROOT / ref)})
    return image_call(entry, content)


def image_call(entry: dict, content: list[dict]) -> tuple[Path, str]:
    resp = CLIENT.responses.create(
        model=MANIFEST["models"]["image"],
        input=[{"role": "user", "content": content}],
        tools=[{
            "type": "image_generation",
            "enable_image_search": False,
            "enable_web_search": False,
            "enable_shell": False,
            "reasoning_strength": "high" if entry["category"] in ("monster", "chef", "env") else "low",
            "size": entry["size"],
            "output_format": "png",
        }],
    )
    b64 = next(o.result for o in resp.output if o.type == "image_generation_call")
    ver = ledger().get(entry["id"], {}).get("version", 1)
    out = SRC_DIR / f"{entry['id']}.v{ver}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(b64))
    return out, resp.id


def chroma_cut(src: Path) -> Image.Image:
    import numpy as np

    arr = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    corner = np.concatenate([arr[:20, :20].reshape(-1, 3), arr[-20:, -20:].reshape(-1, 3)]).mean(axis=0)
    if corner.min() > 200:
        # White-background source (approved masters): remove only the
        # near-white region connected to the edges, so enclosed whites
        # (eyes, chef whites) survive.
        from scipy import ndimage

        near_white = np.minimum(np.minimum(r, g), b) > 225
        labels, _ = ndimage.label(near_white)
        border = set(np.unique(np.concatenate([
            labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]
        ]))) - {0}
        alpha = np.where(np.isin(labels, list(border)), 0, 255).astype(np.uint8)
    else:
        # Distance from pure magenta key, feathered at the fringe.
        dist = np.maximum(np.abs(r - 255), np.abs(b - 255)) + g
        alpha = np.clip((dist - 60) * 4, 0, 255).astype(np.uint8)
    out = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(out, "RGBA")


def sam(src: Path, prompt: str, out: Path) -> bool:
    sam_py = ROOT / ".venv-sam" / "bin" / "python"
    r = subprocess.run(
        [str(sam_py), str(TOOLS / "sam_cut.py"), str(src), prompt, str(out)],
        capture_output=True, text=True, timeout=360,
    )
    if r.returncode != 0:
        print(f"  SAM failed ({r.returncode}): {r.stderr.strip()[:200]}")
    return r.returncode == 0 and out.exists()


OUTLINE_RING = 12  # px searched beyond SAM's edge (outline is ~10-14px thick)
OUTLINE_DARK = 90  # outline ink is near-black (~16,3,30): max channel below this
PLATE_TOLERANCE = 5  # px: plate ink this close means a (slightly shifted) scenery line


def complete_outline(mask, master, plate):
    """SAM's boundary runs through the middle of the thick dark outline.
    Difference matte: pixels just outside the mask that are outline-dark and
    have no ink nearby in the aligned clean plate belong to the character;
    scenery lines (ground, hills, truck) exist in the plate, so they stay out."""
    import numpy as np
    from scipy import ndimage

    ring = ndimage.binary_dilation(mask, iterations=OUTLINE_RING) & ~mask
    dark = master.max(axis=2) < OUTLINE_DARK
    # The plate is generated, so its lines can sit a few px off the master's:
    # treat any master ink near plate ink as scenery, not character outline.
    scenery = ndimage.binary_dilation(plate.max(axis=2) < OUTLINE_DARK, iterations=PLATE_TOLERANCE)
    grown = mask | (ring & dark & ~scenery)
    labels, _ = ndimage.label(grown)
    keep = np.unique(labels[mask])
    grown = np.isin(labels, keep[keep > 0])
    return ndimage.binary_opening(grown, iterations=1) | mask


def circle_mask(mask, master):
    """For round elements (buttons): fit the circle from SAM's mask, then grow
    the radius to the outer edge of the dark outline. Exact by construction;
    nothing the circle overlapped in the master (truck, ground) can leak in."""
    import numpy as np

    ys, xs = np.nonzero(mask)
    cy, cx = ys.mean(), xs.mean()
    r = float(np.sqrt(mask.sum() / np.pi))
    dark = master.max(axis=2) < OUTLINE_DARK
    t = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    for step in range(30):
        rr = r + step
        px = np.clip((cx + rr * np.cos(t)).astype(int), 0, mask.shape[1] - 1)
        py = np.clip((cy + rr * np.sin(t)).astype(int), 0, mask.shape[0] - 1)
        if dark[py, px].mean() < 0.5:
            break
    yy, xx = np.mgrid[0 : mask.shape[0], 0 : mask.shape[1]]
    return np.hypot(yy - cy, xx - cx) <= rr - 0.5


def master_cut(entry: dict, src: Path) -> tuple[Image.Image, list[int]]:
    """Cut one element out of an approved master. Returns the trimmed
    RGBA element and its box in master pixels (for exact placement).
    With `plate` (a clean plate aligned to the master) the outline the
    SAM mask clipped is completed by difference matte."""
    import numpy as np

    x0, y0, x1, y1 = entry["crop"]
    crop_path = SRC_DIR / f"{entry['id']}.crop.png"
    rgba_path = SRC_DIR / f"{entry['id']}.rgba.png"
    Image.open(src).convert("RGB").crop((x0, y0, x1, y1)).save(crop_path)
    if not sam(crop_path, entry["sam"], rgba_path):
        raise RuntimeError("SAM cut failed")
    img = Image.open(rgba_path).convert("RGBA")
    mask = np.asarray(img.getchannel("A")) > 127
    if entry.get("shape") == "circle":
        mask = circle_mask(mask, np.asarray(img.convert("RGB")))
    elif entry.get("plate"):
        mask = complete_outline(mask, np.asarray(img.convert("RGB")),
                                np.asarray(Image.open(ROOT / entry["plate"]).convert("RGB").crop((x0, y0, x1, y1))))
    # SAM masks are binary; feather the edge so the sprite is anti-aliased.
    from PIL import ImageFilter

    alpha = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        raise RuntimeError("SAM returned an empty mask")
    return img.crop(bbox), [x0 + bbox[0], y0 + bbox[1], x0 + bbox[2], y0 + bbox[3]]


BLEED_PROMPT = (
    "The outer border of this picture is a temporary mirrored copy of the scene's edges. "
    "Redraw only that outer border so the scene simply continues past every edge: the ground "
    "line keeps its gentle curve with no folds, hills, sky and scattered dots continue naturally, "
    "and nothing appears mirrored or duplicated. Keep the centre exactly as it is. Add no new "
    "characters, objects, text or buttons."
)
SEAM_MAX = 40.0  # worst 64px patch along the paste-back edge (mean abs RGB diff)


def bleed_plate(entry: dict, plate: Path, extra: str = "") -> tuple[Image.Image, str, float]:
    """Grow a 3:2 clean plate past its edges for full-bleed backgrounds.

    The plate is mirror-padded (a seamless hint), Muse redraws the border
    so it reads naturally, then the original plate is pasted back over the
    centre with a feathered edge so the safe area stays pixel-identical.
    Returns the plate, response id and a seam score: the worst 64px patch
    of mean abs RGB diff between model output and original along the
    paste edge (a seamy plate scored 132; identical scores 0)."""
    import numpy as np

    px, py = entry["bleed"]["pad"]
    base = Image.open(plate).convert("RGB")
    b = np.asarray(base)
    canvas = Image.fromarray(np.pad(b, ((py, py), (px, px), (0, 0)), mode="symmetric"))
    W, H = canvas.size
    text = "\n".join([MANIFEST["style_block"], BLEED_PROMPT] + ([f"Fix: {extra}"] if extra else []))
    out_path, resp_id = image_call(entry, [
        {"type": "input_text", "text": text},
        {"type": "input_image", "image_url": data_url(canvas, max_side=1536)},
    ])
    grown = Image.open(out_path).convert("RGB").resize((W, H), Image.LANCZOS)
    feather = entry["bleed"].get("feather", 48)
    yy, xx = np.mgrid[0 : base.height, 0 : base.width]
    edge = np.minimum.reduce([xx, yy, base.width - 1 - xx, base.height - 1 - yy]).astype(np.float32)
    g = np.asarray(grown)[py : py + base.height, px : px + base.width].astype(np.int16)
    d = np.abs(g - b.astype(np.int16)).mean(axis=2)
    h, w, k = base.height, base.width, 64
    patches = [d[:feather, x : x + k].mean() for x in range(0, w - k + 1, k // 2)]
    patches += [d[h - feather :, x : x + k].mean() for x in range(0, w - k + 1, k // 2)]
    patches += [d[y : y + k, :feather].mean() for y in range(0, h - k + 1, k // 2)]
    patches += [d[y : y + k, w - feather :].mean() for y in range(0, h - k + 1, k // 2)]
    seam = float(max(patches))
    mask = Image.fromarray((np.clip(edge / feather, 0, 1) * 255).astype(np.uint8), "L")
    grown.paste(base, (px, py), mask)
    return grown, resp_id, seam


KEY_TOL = 70  # max per-channel distance from the key colour that still counts as background
SAM_SUBJECT = 40  # SAM coverage above this marks a shape as part of the subject
EDGE_BAND = 2  # px of subject edge whose alpha is solved from colour
PURE_KEY = 50  # mean distance below which an enclosed region is the key colour itself


def soft_cut(entry: dict, src: Path) -> Image.Image:
    """Cut-out per the sprite research (research/reports/Transparent game sprite pipeline.md).

    SAM 3.1 (bare noun prompt, soft lossless coverage) decides WHICH shapes are
    the subject; the known flat key colour decides the EDGE. Background is the
    key colour connected to the border, plus enclosed key-coloured holes that
    SAM does not claim. In a 2px band along the edge, alpha is solved per pixel
    from C = a*F + (1-a)*K, with F the nearest solid subject colour, and the
    colour is un-mixed so no key tint remains."""
    import numpy as np
    from scipy import ndimage

    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3),
                             rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    key = np.median(border, axis=0)
    near_key = np.abs(rgb - key).max(axis=2) < KEY_TOL

    cov_path = SRC_DIR / f"{entry['id']}.coverage.png"
    sam_py = ROOT / ".venv-sam" / "bin" / "python"
    # One short noun phrase per request (Meta SAM docs); an unmatched noun
    # returns no records, so fall back to generic nouns before giving up.
    # Only shapes SAM touches are kept, so a noun that matches part of the
    # subject still keeps the whole connected sticker. "food", "circle" and
    # "sticker" matched flat sticker subjects that "object" did not.
    for noun in dict.fromkeys([entry["sam"], "food", "circle", "sticker", "object", "cartoon"]):
        r = subprocess.run([str(sam_py), str(TOOLS / "sam_cut.py"), str(src), noun, str(cov_path), "--coverage"],
                           capture_output=True, text=True, timeout=150)
        if r.returncode == 0:
            break
    else:
        raise RuntimeError(f"SAM coverage failed: {r.stderr.strip()[:200]}")
    cov = np.asarray(Image.open(cov_path).convert("L")).astype(np.float32)

    lab, n = ndimage.label(near_key)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge_labels[edge_labels > 0])
    if n:  # enclosed key-coloured holes (between arm and body, between strands)
        # A hole is background if SAM does not claim it, or if it is plainly the
        # key colour: subjects are generated to never contain the key, and SAM
        # claims the gaps inside tangles (crispy onions) as part of the object.
        mean_cov = ndimage.mean(cov, lab, index=np.arange(1, n + 1))
        dist = np.abs(rgb - key).max(axis=2)
        mean_dist = ndimage.mean(dist, lab, index=np.arange(1, n + 1))
        holes = [i + 1 for i, (m, d) in enumerate(zip(mean_cov, mean_dist)) if m < 128 or d < PURE_KEY]
        bg |= np.isin(lab, holes)
    fg = ~bg
    lab2, n2 = ndimage.label(fg)
    if n2:  # keep only shapes SAM says are the subject (drops specks and stray marks)
        max_cov = ndimage.maximum(cov, lab2, index=np.arange(1, n2 + 1))
        fg = np.isin(lab2, [i + 1 for i, m in enumerate(max_cov) if m > SAM_SUBJECT])
    band = fg & ndimage.binary_dilation(~fg, iterations=EDGE_BAND)
    core = fg & ~band
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    solid = rgb[iy, ix]  # nearest solid subject colour for every pixel
    d = solid - key
    a = ((rgb - key) * d).sum(axis=2) / np.maximum((d * d).sum(axis=2), 1.0)
    alpha = fg.astype(np.float32)
    alpha[band] = np.clip(a[band], 0.0, 1.0)
    out = rgb.copy()
    m = band & (alpha > 0.02)
    out[m] = (rgb[m] - (1.0 - alpha[m, None]) * key) / alpha[m, None]
    out[alpha <= 0.02] = solid[alpha <= 0.02]  # pad colour under transparency (no halos when scaled)
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def cut(entry: dict, src: Path, attempt: int = 1) -> tuple[Image.Image, str]:
    if entry.get("cutter") == "sam-soft":
        return soft_cut(entry, src), "sam-soft"
    if not entry["export"].get("alpha"):
        return Image.open(src).convert("RGB"), "none"
    if attempt < 2:
        return chroma_cut(src), "chroma"
    rgba_path = SRC_DIR / f"{entry['id']}.rgba.png"
    sam_py = ROOT / ".venv-sam" / "bin" / "python"
    if entry.get("sam") and sam_py.exists():
        r = subprocess.run(
            [str(sam_py), str(TOOLS / "sam_cut.py"), str(src), entry["sam"], str(rgba_path)],
            capture_output=True, text=True, timeout=360,
        )
        if r.returncode == 0 and rgba_path.exists():
            return Image.open(rgba_path).convert("RGBA"), "sam-3.1"
        print(f"  SAM failed for {entry['id']} ({r.returncode}); chroma fallback")
    return chroma_cut(src), "chroma"


def normalise(entry: dict, img: Image.Image) -> Path:
    spec = entry["export"]
    out = FIN_DIR / f"{entry['id']}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    if spec.get("frame"):
        # Keep the whole generation canvas: every pose of one character then
        # shares the same scale and anchor, so swapping poses never jumps.
        img.save(out, "WEBP", lossless=True, quality=100, method=6)
    elif spec.get("trim"):
        bbox = img.getchannel("A").getbbox()
        if bbox and entry["mode"] != "cut":
            pad = 8
            img = img.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                            min(img.width, bbox[2] + pad), min(img.height, bbox[3] + pad)))
        img.save(out, "WEBP", lossless=True, quality=100, method=6)
    elif spec.get("alpha"):
        bbox = img.getchannel("A").getbbox()
        if bbox:
            img = img.crop(bbox)
        fill = spec.get("fill", 0.8)
        tw, th = int(spec["w"] * fill), int(spec["h"] * fill)
        img.thumbnail((tw, th), Image.LANCZOS)
        canvas = Image.new("RGBA", (spec["w"], spec["h"]), (0, 0, 0, 0))
        canvas.paste(img, ((spec["w"] - img.width) // 2, (spec["h"] - img.height) // 2), img)
        canvas.save(out, "WEBP", lossless=True)
    else:
        img = ImageOps.fit(img.convert("RGB"), (spec["w"], spec["h"]), Image.LANCZOS)
        img.save(out, "WEBP", quality=90)
    return out


def deterministic_qa(entry: dict, final: Path) -> list[str]:
    issues = []
    img = Image.open(final)
    spec = entry["export"]
    if not spec.get("trim") and not spec.get("frame") and img.size != (spec["w"], spec["h"]):
        issues.append(f"wrong size {img.size}, want {(spec['w'], spec['h'])}")
    if spec.get("alpha"):
        if img.mode != "RGBA":
            issues.append("no alpha channel")
        else:
            alpha = img.getchannel("A")
            cov = sum(1 for v in alpha.getdata() if v > 10) / (img.width * img.height)
            if cov < 0.05:
                issues.append(f"subject too small (alpha coverage {cov:.2f})")
            if cov > 0.97 and not spec.get("trim"):
                issues.append("background not removed (alpha coverage ~1)")
    return issues


def spark_qa(entry: dict, final: Path) -> dict:
    checklist = "; ".join(entry.get("qa", []))
    prompt = (
        "You are QA for a children's game artwork asset. Judge the attached image only.\n"
        f"Asset: {entry['id']} ({entry['category']}). Intended: {entry['subject']}\n"
        f"Checklist: {checklist}.\n"
        + (
            "Text waiver: this asset IS the game logo, so its letters are expected; fail only if they "
            "are misspelled, broken or cropped. Also fail on watermark or a leftover background.\n"
            if entry.get("text_waiver") else
            "Also fail if there is any text, letters, numbers, watermark, scary content, "
            "franchise look-alike, cropped body parts, or a leftover solid background on a sprite.\n"
        )
        + 'Reply with JSON only: {"pass": true/false, "issues": ["short issue"], '
        '"scores": {"style": 1-5, "readability": 1-5, "identity": 1-5}}'
    )
    resp = CLIENT.responses.create(
        model=MANIFEST["models"]["qa"],
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": data_url(final)},
        ]}],
    )
    text = "".join(
        c.text for o in resp.output if o.type == "message"
        for c in (o.content or []) if getattr(c, "type", "") == "output_text"
    )
    try:
        start, end = text.index("{"), text.rindex("}") + 1
        return json.loads(text[start:end])
    except Exception:
        return {"pass": False, "issues": [f"unparseable QA reply: {text[:160]}"], "scores": {}}


def process(entry: dict, extra: str = "") -> str:
    led = ledger()
    rec = led.get(entry["id"], {"version": 1, "attempts": 0})
    if rec.get("status") == "done" and (FIN_DIR / f"{entry['id']}.webp").exists():
        return "skip"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        rec["attempts"] = rec.get("attempts", 0) + 1
        try:
            if entry["mode"] in ("derive", "cut"):
                src = SRC_DIR / f"{entry['id']}.v{rec['version']}.png"
                src.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / entry["refs"][0], src)
                resp_id = entry["mode"]
            if entry["mode"] == "cut":
                img, rec["placement"] = master_cut(entry, src)
                cut_method = "sam-3.1"
            elif entry["mode"] == "bleed":
                img, resp_id, rec["seam"] = bleed_plate(entry, ROOT / entry["refs"][0], extra)
                src = SRC_DIR / f"{entry['id']}.v{rec['version']}.bleed.png"
                img.save(src)
                cut_method = "none"
            else:
                if entry["mode"] != "derive":
                    src, resp_id = generate_image(entry, extra)
                img, cut_method = cut(entry, src, attempt)
            final = normalise(entry, img)
            issues = deterministic_qa(entry, final)
            if rec.get("seam", 0) > SEAM_MAX and entry["mode"] == "bleed":
                issues.append(f"visible seam where the border meets the scene (score {rec['seam']:.1f})")
            verdict = {"pass": not issues, "issues": issues, "scores": {}}
            if not issues:
                verdict = spark_qa(entry, final)
            rec.update({"source": str(src.relative_to(ROOT)), "cut": cut_method,
                        "response_id": resp_id, "qa": verdict})
            (QA_DIR / f"{entry['id']}.json").parent.mkdir(parents=True, exist_ok=True)
            (QA_DIR / f"{entry['id']}.json").write_text(json.dumps(verdict, indent=2) + "\n")
            if verdict.get("pass"):
                rec["status"] = "done"
                rec.pop("last_issues", None)
                record(entry["id"], rec)
                print(f"  DONE {entry['id']} (attempt {attempt}, cut={cut_method})")
                return "done"
            extra = "; ".join(verdict.get("issues", [])) or "unspecified QA failure"
            print(f"  QA fail {entry['id']} attempt {attempt}: {extra}")
        except Exception as exc:  # keep the queue moving; quarantine below
            extra = f"generation error: {exc}"
            print(f"  ERR {entry['id']} attempt {attempt}: {exc}")
            time.sleep(5)
    rec["status"] = "quarantined"
    rec["last_issues"] = extra
    record(entry["id"], rec)
    return "quarantined"


def run_batch(batch: str, only: str | None, workers: int) -> None:
    entries = [a for a in MANIFEST["assets"] if batch in ("all", a["category"])]
    if only:
        entries = [a for a in entries if a["id"] == only]
    todo = [e for e in entries if ledger().get(e["id"], {}).get("status") != "done"]
    print(f"batch={batch} total={len(entries)} todo={len(todo)} workers={workers}")
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(process, todo))
    from collections import Counter
    print(Counter(results))


def cmd_status() -> None:
    led = ledger()
    from collections import Counter
    counts = Counter(led.get(a["id"], {}).get("status", "pending") for a in MANIFEST["assets"])
    print(f"total={len(MANIFEST['assets'])}", dict(counts))
    for a in MANIFEST["assets"]:
        if led.get(a["id"], {}).get("status") == "quarantined":
            print("QUARANTINED", a["id"], led[a["id"]].get("last_issues", ""))


def cmd_sheet() -> None:
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    cats: dict[str, list[str]] = {}
    for a in MANIFEST["assets"]:
        if (FIN_DIR / f"{a['id']}.webp").exists():
            cats.setdefault(a["category"], []).append(a["id"])
    for cat, ids in cats.items():
        cols, cell, label = 6, 220, 22
        rows = (len(ids) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), (40, 40, 48))
        draw = ImageDraw.Draw(sheet)
        for i, aid in enumerate(ids):
            x, y = (i % cols) * cell, (i // cols) * (cell + label)
            for yy in range(cell):
                for xx in range(cell):
                    if (xx // 16 + yy // 16) % 2:
                        sheet.putpixel((x + xx, y + yy), (90, 90, 100))
            img = Image.open(FIN_DIR / f"{aid}.webp").convert("RGBA")
            img.thumbnail((cell - 12, cell - 12))
            sheet.paste(img, (x + (cell - img.width) // 2, y + (cell - img.height) // 2), img)
            draw.text((x + 6, y + cell + 4), aid[:34], fill=(255, 255, 255))
        out = SHEET_DIR / f"{cat}.png"
        sheet.save(out)
        print("sheet", out, f"{len(ids)} assets")


class keep_on_failure:
    """A new version only replaces the current final if it passes QA;
    otherwise the previous final and ledger record are restored."""

    def __init__(self, asset_id: str):
        self.id, self.final = asset_id, FIN_DIR / f"{asset_id}.webp"

    def __enter__(self):
        self.rec = json.loads(json.dumps(ledger().get(self.id, {})))
        self.bytes = self.final.read_bytes() if self.final.exists() else None
        return self

    def done(self, result: str) -> None:
        if result != "done" and self.bytes is not None and self.rec.get("status") == "done":
            self.final.write_bytes(self.bytes)
            failed = ledger().get(self.id, {})
            self.rec.setdefault("rejected", []).append(
                {"version": failed.get("version"), "issues": failed.get("last_issues", "")})
            record(self.id, self.rec)
            print(f"  kept {self.id} v{self.rec.get('version')} (new version failed QA)")

    def __exit__(self, *exc) -> None:
        return None


def cmd_revise(asset_id: str, note: str, ref: str | None) -> None:
    guard = keep_on_failure(asset_id).__enter__()
    entry = BY_ID[asset_id]
    led = ledger()
    rec = led.get(asset_id, {"version": 1})
    rec["version"] = rec.get("version", 1) + 1
    rec["status"] = "pending"
    led[asset_id] = rec
    save_ledger(led)
    entry = dict(entry)
    entry["mode"] = "generate"
    entry["subject"] = entry["subject"] + f" Revision requested: {note}. Keep everything else identical."
    if ref:
        entry["refs"] = [str(Path(ref).relative_to(ROOT))] + entry.get("refs", [])
    current = FIN_DIR / f"{asset_id}.webp"
    if current.exists():
        entry["refs"] = [str(current.relative_to(ROOT))] + entry.get("refs", [])
    led2 = ledger()
    led2[asset_id] = rec
    save_ledger(led2)
    result = process(entry)
    guard.done(result)
    print("revise", asset_id, "v" + str(rec["version"]), result)


def cmd_rebuild(asset_id: str, note: str = "") -> None:
    """Re-make an asset from its (changed) manifest spec as version v+1.
    Earlier sources stay in source/ as <id>.v<n>.*"""
    with keep_on_failure(asset_id) as guard:
        rec = ledger().get(asset_id, {"version": 0})
        rec.update({"version": rec.get("version", 0) + 1, "status": "pending", "attempts": 0})
        record(asset_id, rec)
        result = process(BY_ID[asset_id], note)
        guard.done(result)
    print("rebuild", asset_id, "v" + str(rec["version"]), result)


def cmd_recut(asset_id: str, source: str, accept: bool = False) -> None:
    """Re-cut an existing raw generation (no new image call) as version v+1,
    with the entry's cutter. Same QA gates and keep-on-failure guard.
    `accept`: Spark is advisory (skill); after you have looked at the cut at
    full size, accept it when only Spark objects. The automated checks still
    gate, and the override is recorded in the ledger."""
    entry, src = BY_ID[asset_id], ROOT / source
    with keep_on_failure(asset_id) as guard:
        rec = ledger().get(asset_id, {"version": 0})
        rec.update({"version": rec.get("version", 0) + 1, "status": "pending", "attempts": 1})
        img, cut_method = cut(entry, src, 1)
        final = normalise(entry, img)
        issues = deterministic_qa(entry, final)
        verdict = {"pass": not issues, "issues": issues, "scores": {}} if issues else spark_qa(entry, final)
        if accept and not issues and not verdict.get("pass"):
            verdict = {**verdict, "pass": True, "override": "accepted after full-size visual check; Spark is advisory"}
        rec.update({"source": str(src.relative_to(ROOT)), "cut": cut_method, "response_id": "recut", "qa": verdict,
                    "status": "done" if verdict.get("pass") else "quarantined",
                    "last_issues": "; ".join(verdict.get("issues", []))})
        if verdict.get("pass"):
            rec.pop("last_issues", None)
        record(asset_id, rec)
        guard.done(rec["status"])
    print("recut", asset_id, "v" + str(rec["version"]), rec["status"], verdict)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("sheet")
    p_run = sub.add_parser("run")
    p_run.add_argument("--batch", default="all")
    p_run.add_argument("--only")
    p_run.add_argument("--workers", type=int, default=4)
    p_spike = sub.add_parser("spike")
    p_spike.add_argument("--workers", type=int, default=4)
    p_qa = sub.add_parser("qa")
    p_qa.add_argument("--id", required=True)
    p_rev = sub.add_parser("revise")
    p_rev.add_argument("--id", required=True)
    p_rev.add_argument("--note", required=True)
    p_rev.add_argument("--ref")
    p_reb = sub.add_parser("rebuild")
    p_reb.add_argument("--id", required=True)
    p_reb.add_argument("--note", default="")
    p_rc = sub.add_parser("recut")
    p_rc.add_argument("--id", required=True)
    p_rc.add_argument("--source", required=True)
    p_rc.add_argument("--accept", action="store_true", help="accept when only Spark objects (after a visual check)")
    args = ap.parse_args()
    if args.cmd == "status":
        cmd_status()
    elif args.cmd == "sheet":
        cmd_sheet()
    elif args.cmd == "run":
        run_batch(args.batch, args.only, args.workers)
    elif args.cmd == "spike":
        heroes = ["monster.gobbler.walk", "chef.point", "item.tomato.tray",
                  "item.pineapple.dish", "env.kitchen", "ui.appIcon",
                  "monster.og.dance"]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(process, [BY_ID[h] for h in heroes]))
        cmd_sheet()
    elif args.cmd == "qa":
        print(json.dumps(spark_qa(BY_ID[args.id], FIN_DIR / f"{args.id}.webp"), indent=2))
    elif args.cmd == "revise":
        cmd_revise(args.id, args.note, args.ref)
    elif args.cmd == "rebuild":
        cmd_rebuild(args.id, args.note)
    elif args.cmd == "recut":
        cmd_recut(args.id, args.source, args.accept)


if __name__ == "__main__":
    main()
