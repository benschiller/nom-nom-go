#!/usr/bin/env python3
"""Nom Nom Go! artwork production CLI.

Manifest-driven generation (Muse Image), cut-out (SAM 3.1 with chroma
fallback), normalisation, Spark QA, contact sheets, and versioned
revisions. Production only: never touches game code.

Commands:
  status | spike | run --batch B [--only ID] | qa --id ID |
  sheet | revise --id ID --note TEXT [--ref PNG] | run-all
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

CLIENT = OpenAI(base_url="https://api.meta.ai/v1", api_key=os.environ["MODEL_API_KEY"])


def ledger() -> dict:
    if LEDGER_PATH.exists():
        return json.loads(LEDGER_PATH.read_text())
    return {}


def save_ledger(led: dict) -> None:
    PROD.mkdir(parents=True, exist_ok=True)
    LEDGER_PATH.write_text(json.dumps(led, indent=2) + "\n")


def data_url(path: Path, max_side: int = 1024) -> str:
    img = Image.open(path)
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


def build_prompt(entry: dict, extra: str = "") -> str:
    parts = [MANIFEST["style_block"], entry["subject"]]
    if entry["export"].get("alpha"):
        parts.append(MANIFEST["chroma_block"])
    parts.append(MANIFEST["negative_block"])
    if extra:
        parts.append("Fix these problems from the previous attempt: " + extra)
    return "\n".join(parts)


def generate_image(entry: dict, extra: str = "") -> tuple[Path, str]:
    content: list[dict] = [{"type": "input_text", "text": build_prompt(entry, extra)}]
    for ref in entry.get("refs", []):
        content.append({"type": "input_text", "text": "Reference image (match this exactly):"})
        content.append({"type": "input_image", "image_url": data_url(ROOT / ref)})
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


def cut(entry: dict, src: Path, attempt: int = 1) -> tuple[Image.Image, str]:
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
    if spec.get("alpha"):
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
    if img.size != (spec["w"], spec["h"]):
        issues.append(f"wrong size {img.size}, want {(spec['w'], spec['h'])}")
    if spec.get("alpha"):
        if img.mode != "RGBA":
            issues.append("no alpha channel")
        else:
            alpha = img.getchannel("A")
            cov = sum(1 for v in alpha.getdata() if v > 10) / (img.width * img.height)
            if cov < 0.05:
                issues.append(f"subject too small (alpha coverage {cov:.2f})")
            if cov > 0.97:
                issues.append("background not removed (alpha coverage ~1)")
    return issues


def spark_qa(entry: dict, final: Path) -> dict:
    checklist = "; ".join(entry.get("qa", []))
    prompt = (
        "You are QA for a children's game artwork asset. Judge the attached image only.\n"
        f"Asset: {entry['id']} ({entry['category']}). Intended: {entry['subject']}\n"
        f"Checklist: {checklist}.\n"
        "Also fail if there is any text, letters, numbers, watermark, scary content, "
        "franchise look-alike, cropped body parts, or a leftover solid background on a sprite.\n"
        'Reply with JSON only: {"pass": true/false, "issues": ["short issue"], '
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


def process(entry: dict) -> str:
    led = ledger()
    rec = led.get(entry["id"], {"version": 1, "attempts": 0})
    if rec.get("status") == "done" and (FIN_DIR / f"{entry['id']}.webp").exists():
        return "skip"
    extra = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        rec["attempts"] = rec.get("attempts", 0) + 1
        try:
            if entry["mode"] == "derive":
                src = SRC_DIR / f"{entry['id']}.v{rec['version']}.png"
                src.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / entry["refs"][0], src)
                resp_id = "derive"
            else:
                src, resp_id = generate_image(entry, extra)
            img, cut_method = cut(entry, src, attempt)
            final = normalise(entry, img)
            issues = deterministic_qa(entry, final)
            verdict = {"pass": not issues, "issues": issues, "scores": {}}
            if not issues:
                verdict = spark_qa(entry, final)
            rec.update({"source": str(src.relative_to(ROOT)), "cut": cut_method,
                        "response_id": resp_id, "qa": verdict})
            (QA_DIR / f"{entry['id']}.json").parent.mkdir(parents=True, exist_ok=True)
            (QA_DIR / f"{entry['id']}.json").write_text(json.dumps(verdict, indent=2) + "\n")
            if verdict.get("pass"):
                rec["status"] = "done"
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


def cmd_revise(asset_id: str, note: str, ref: str | None) -> None:
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
    print("revise", asset_id, "v" + str(rec["version"]), result)


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


if __name__ == "__main__":
    main()
