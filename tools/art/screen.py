#!/usr/bin/env python3
"""Screen QA for the art-integration skill.

Judges whole screens against their approved storyboard, not single assets.

  capture --screen S1        Playwright shots at 16:9 / iPad 4:3 / iPhone ~2.17:1
                             into generated_images/screen-qa/<S>/r<n>/
  qa --screen S1 [--round N] deterministic checks + Muse Spark comparison
                             with the 16:9 target; writes qa.json and sheet.png
  sheet --screen S1 [--round N]  side-by-side: target | each viewport

Assets are never made here: asset work goes through art.py (art-production).
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
import art  # noqa: E402  (shared client, data_url, models)

ROOT = art.ROOT
REGISTER = json.loads((art.TOOLS / "screens.json").read_text())
SCREENS = {s["id"]: s for s in REGISTER["screens"]}
QA_ROOT = ROOT / "generated_images" / "screen-qa"
KID_MIN_PX = 60  # smallest kid-facing touch target, CSS px, at any viewport
ADULT_ONLY = {"parent-gate"}


def round_dir(sid: str, rnd: int | None, new: bool = False) -> Path:
    base = QA_ROOT / sid
    existing = sorted(int(p.name[1:]) for p in base.glob("r*") if p.name[1:].isdigit())
    if new:
        n = (existing[-1] + 1) if existing else 1
    else:
        if not existing:
            raise SystemExit(f"no captures for {sid}; run capture first")
        n = rnd or existing[-1]
    return base / f"r{n}"


def target_16x9(screen: dict) -> Image.Image:
    """What the stage shows of a 3:2 master: fit to width, centre 16:9."""
    m = Image.open(ROOT / screen["master"]).convert("RGB")
    return ImageOps.fit(m, (1600, 900), Image.LANCZOS)


def cmd_capture(sid: str) -> Path:
    screen = SCREENS[sid]
    if not screen.get("capture"):
        raise SystemExit(f"{sid} has no capture recipe yet")
    out = round_dir(sid, None, new=True)
    env = dict(os.environ, SCREENS=sid, SCREEN_QA_OUT=str(out.parent.parent / "_tmp"))
    r = subprocess.run(
        ["npx", "playwright", "test", "-c", "playwright.screens.config.ts", "--reporter=line"],
        cwd=ROOT / "game", env=env, capture_output=True, text=True,
    )
    print(r.stdout[-1500:], r.stderr[-800:])
    tmp = out.parent.parent / "_tmp" / sid
    if r.returncode != 0 or not tmp.exists():
        raise SystemExit("capture failed")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp.rename(out)
    print("captured", out)
    return out


def deterministic(d: Path) -> list[str]:
    issues = []
    for vp in REGISTER["viewports"]:
        m = json.loads((d / f"{vp}.json").read_text())
        if not any(b["covers"] for b in m["backdrops"]):
            issues.append(f"{vp}: background does not fill the viewport (bars visible)")
        for c in m["controls"]:
            if c["inCallCorner"]:
                issues.append(f"{vp}: control '{c['id']}' is inside the call corner")
            if c["id"] not in ADULT_ONLY and min(c["w"], c["h"]) < KID_MIN_PX:
                issues.append(f"{vp}: control '{c['id']}' is {c['w']}x{c['h']}px, under {KID_MIN_PX}px")
    return issues


def spark(screen: dict, d: Path) -> dict:
    checklist = "\n".join(f"- {c}" for c in screen["checklist"])
    prompt = (
        "You are the art director for a children's game (player is 7 and cannot read yet). "
        "Image 1 is the APPROVED storyboard for this screen. Image 2 is the running game at 16:9. "
        "Image 3 is the same screen on a wide phone. Judge whether the game matches the storyboard "
        "and looks polished. Ignore tiny pixel differences; flag anything a parent would notice: "
        "missing or misplaced characters, wrong scale, wrong control shapes, stray text, plain CSS "
        "boxes, bars, seams, clipping, things overlapping badly.\n"
        f"Screen: {screen['id']} {screen['name']}. It must show:\n{checklist}\n"
        'Reply with JSON only: {"pass": true/false, "scores": {"composition": 1-5, "cast": 1-5, '
        '"controls": 1-5, "polish": 1-5}, "issues": [{"element": "...", "problem": "...", "fix_hint": "..."}]}'
    )
    resp = art.CLIENT.responses.create(
        model=art.MANIFEST["models"]["qa"],
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": art.data_url(target_16x9(screen))},
            {"type": "input_image", "image_url": art.data_url(d / "wide-16x9.png")},
            {"type": "input_image", "image_url": art.data_url(d / "iphone-2.17.png")},
        ]}],
    )
    text = "".join(
        c.text for o in resp.output if o.type == "message"
        for c in (o.content or []) if getattr(c, "type", "") == "output_text"
    )
    try:
        verdict = json.loads(text[text.index("{"): text.rindex("}") + 1])
    except Exception:
        verdict = {"pass": False, "issues": [{"element": "qa", "problem": f"unparseable: {text[:160]}", "fix_hint": ""}]}
    verdict["response_id"] = resp.id
    return verdict


def cmd_sheet(sid: str, rnd: int | None) -> Path:
    screen, d = SCREENS[sid], round_dir(sid, rnd)
    h, pad, label = 360, 12, 26
    panels = [("storyboard (16:9 view)", target_16x9(screen))]
    panels += [(vp, Image.open(d / f"{vp}.png").convert("RGB")) for vp in REGISTER["viewports"]]
    scaled = [(n, im.resize((round(im.width * h / im.height), h), Image.LANCZOS)) for n, im in panels]
    W = sum(im.width for _, im in scaled) + pad * (len(scaled) + 1)
    sheet = Image.new("RGB", (W, h + label + 2 * pad), (34, 34, 40))
    draw, x = ImageDraw.Draw(sheet), pad
    for name, im in scaled:
        sheet.paste(im, (x, pad + label))
        draw.text((x, pad + 4), name, fill=(255, 255, 255))
        x += im.width + pad
    out = d / "sheet.png"
    sheet.save(out)
    print("sheet", out)
    return out


def cmd_qa(sid: str, rnd: int | None) -> dict:
    screen, d = SCREENS[sid], round_dir(sid, rnd)
    det = deterministic(d)
    verdict = spark(screen, d) if screen.get("master") and screen["checklist"] else {"pass": None}
    verdict["deterministic"] = det
    verdict["pass"] = bool(verdict.get("pass")) and not det
    (d / "qa.json").write_text(json.dumps(verdict, indent=2) + "\n")
    cmd_sheet(sid, rnd)
    print(json.dumps(verdict, indent=2))
    return verdict


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("capture", "qa", "sheet"):
        p = sub.add_parser(name)
        p.add_argument("--screen", required=True, choices=sorted(SCREENS))
        if name != "capture":
            p.add_argument("--round", type=int)
    a = ap.parse_args()
    if a.cmd == "capture":
        cmd_capture(a.screen)
    elif a.cmd == "qa":
        cmd_qa(a.screen, a.round)
    else:
        cmd_sheet(a.screen, a.round)


if __name__ == "__main__":
    main()
