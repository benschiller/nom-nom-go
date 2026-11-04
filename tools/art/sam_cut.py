#!/usr/bin/env python3
"""Cut one subject out with SAM 3.1. Run with .venv-sam/bin/python.

Usage: sam_cut.py <image> <prompt> <out-rgba-png> [--coverage]
Exits non-zero on any failure; the caller falls back to chroma-key.

--coverage writes SAM's soft mask instead: an 8-bit "L" PNG the size of the
image holding SAM 3.1's lossless coverage (0-255), bicubic-upscaled into
each record's box. Per Meta's SAM docs the prompt must be a bare noun phrase
and the default lossless encoding is kept. The public decode_mask_to_raster()
thresholds coverage at 129 (mid-outline on our art), so the soft path reads
the coverage bytes via the parser's _decode_lossless_raster; pinned to
meta-sam-parser 0.1.0.
"""
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops


def main() -> int:
    src, prompt, out = sys.argv[1], sys.argv[2], sys.argv[3]
    coverage_mode = "--coverage" in sys.argv[4:]
    root = Path(__file__).resolve().parents[2]
    for line in (root / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    key = os.environ["MUSE_API_KEY"]
    img = Image.open(src)
    w, h = img.size
    b64 = base64.b64encode(Path(src).read_bytes()).decode()
    mime = "image/png" if src.lower().endswith(".png") else "image/jpeg"
    body = {
        "model": "sam-3.1",
        "stream": True,
        "input": [{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": f"data:{mime};base64,{b64}"},
        ]}],
    }
    req = urllib.request.Request(
        "https://api.meta.ai/v1/responses",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "text/event-stream"},
        method="POST",
    )
    text_parts: list[str] = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                ev = json.loads(data)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "response.output_text.delta" and ev.get("delta"):
                text_parts.append(ev["delta"])
    text = "".join(text_parts)
    if not text:
        print("SAM: empty output", file=sys.stderr)
        return 2
    Path(out + ".sam.txt").write_text(text)

    import meta_sam_parser as sam

    parser = sam.image_segmentation_format().create_parser()
    parser.push(text)
    result = parser.finish(sam.CompletedOutcome()).result  # parses a final unterminated line
    records = [r for r in result.records if r.kind == "mask"]
    if coverage_mode:
        return write_coverage(records, w, h, out)
    if not records:
        print("SAM: no mask records", file=sys.stderr)
        return 4
    rgba = img.convert("RGBA")
    combined = Image.new("L", (w, h), 0)
    for rec in records:
        raster = sam.decode_mask_to_raster(rec.mask)
        bw, bh = rec.bounds.right - rec.bounds.left, rec.bounds.bottom - rec.bounds.top
        if len(raster) == w * h:
            mimg = Image.frombytes("L", (w, h), raster)
        elif len(raster) == bw * bh:
            mimg = Image.new("L", (w, h), 0)
            mimg.paste(Image.frombytes("L", (bw, bh), raster), (rec.bounds.left, rec.bounds.top))
        else:
            # SAM returns masks at its own resolution (max side ~1024):
            # infer the raster shape from the bounds aspect, then scale up.
            mw = int(round((len(raster) * bw / bh) ** 0.5))
            mh = len(raster) // mw
            if mw * mh != len(raster):
                print(f"SAM: unexpected raster size {len(raster)}", file=sys.stderr)
                return 5
            piece = Image.frombytes("L", (mw, mh), raster)
            if piece.getextrema()[1] <= 1:  # mask bytes are 0/1, not 0-255
                piece = piece.point(lambda v: v * 255)
            piece = piece.resize((bw, bh), Image.BILINEAR)
            mimg = Image.new("L", (w, h), 0)
            mimg.paste(piece, (rec.bounds.left, rec.bounds.top))
        if mimg.getextrema()[1] <= 1:  # full-res masks also arrive as 0/1
            mimg = mimg.point(lambda v: v * 255)
        combined = ImageChops.lighter(combined, mimg)
    rgba.putalpha(combined)
    rgba.save(out)
    print(f"SAM ok: {len(records)} mask(s)")
    return 0


def write_coverage(records, w: int, h: int, out: str) -> int:
    from meta_sam_parser._mask_codec import _decode_lossless_raster

    if not records:
        print("SAM: no mask records", file=sys.stderr)
        return 4
    from importlib.metadata import version

    if version("meta-sam-parser") != "0.1.0":  # private decode path is pinned
        print(f"SAM: meta-sam-parser {version('meta-sam-parser')} untested", file=sys.stderr)
        return 7
    cov = Image.new("L", (w, h), 0)
    for rec in records:
        m = rec.mask
        if m.encoding != "lossless":
            print(f"SAM: got {m.encoding} mask; soft coverage needs a noun-phrase prompt", file=sys.stderr)
            return 6
        piece = Image.frombytes("L", (m.width, m.height), _decode_lossless_raster(m.payload, m.width, m.height))
        bw, bh = rec.bounds.right - rec.bounds.left, rec.bounds.bottom - rec.bounds.top
        piece = piece.resize((bw, bh), Image.BICUBIC)
        layer = Image.new("L", (w, h), 0)
        layer.paste(piece, (rec.bounds.left, rec.bounds.top))
        cov = ImageChops.lighter(cov, layer)
    cov.save(out)
    print(f"SAM coverage ok: {len(records)} mask(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
