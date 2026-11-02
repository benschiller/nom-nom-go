#!/usr/bin/env python3
"""Focused checks for the art pipeline. Run: python3 tools/art/test_pipeline.py"""
import base64
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from PIL import Image  # noqa: E402

import art  # noqa: E402


def test_chroma_removes_magenta_keeps_subject(tmp_path=None):
    img = Image.new("RGB", (64, 64), (255, 0, 255))
    for y in range(20, 44):
        for x in range(20, 44):
            img.putpixel((x, y), (220, 40, 30))
    p = Path("/tmp/test-chroma.png")
    img.save(p)
    out = art.chroma_cut(p)
    assert out.getpixel((2, 2))[3] == 0, "magenta corner must be transparent"
    assert out.getpixel((32, 32))[3] > 200, "subject centre must stay opaque"
    assert out.getpixel((32, 32))[:3] == (220, 40, 30)


def test_qa_image_not_black_for_transparent_sprite():
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    for y in range(8, 24):
        for x in range(8, 24):
            img.putpixel((x, y), (220, 40, 30, 255))
    p = Path("/tmp/test-sprite.webp")
    img.save(p, "WEBP", lossless=True)
    url = art.data_url(p)
    raw = base64.b64decode(url.split(",", 1)[1])
    sent = Image.open(io.BytesIO(raw)).convert("RGB")
    corner = sent.getpixel((1, 1))
    assert sum(corner) > 300, f"transparent corner sent as {corner}; QA would see black"


def test_manifest_coverage():
    m = json.loads((Path(__file__).parent / "manifest-v2.json").read_text())
    assert len(m["assets"]) == 173
    assert sum(1 for a in m["assets"] if a["id"].startswith("monster.og.")) == 10
    assert m["models"]["qa"] == "muse-spark-1.3"
    assert "contributor" not in json.dumps(m["models"])
    sizes = {a["size"] for a in m["assets"]}
    assert sizes <= {"1024x1024", "1536x1024"}, sizes


if __name__ == "__main__":
    test_chroma_removes_magenta_keeps_subject()
    test_qa_image_not_black_for_transparent_sprite()
    test_manifest_coverage()
    print("all pipeline checks passed")
