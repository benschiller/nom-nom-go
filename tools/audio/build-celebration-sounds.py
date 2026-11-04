#!/usr/bin/env python3
"""Build the eight celebration cues. Requires Python 3 and FFmpeg with rubberband."""

import hashlib
import json
import math
from pathlib import Path
import random
import struct
import subprocess
import tempfile
import wave


ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path(__file__).with_name("celebration-sources")
OUTPUT = ROOT / "game/public/audio/sfx"
RATE = 48000


def encode(inputs, graph, output):
    args = ["ffmpeg", "-v", "error", "-y"]
    for source in inputs:
        args.extend(["-i", str(source)])
    subprocess.run(
        args + ["-filter_complex", graph, "-map", "[out]", "-vn", "-ac", "1",
                "-ar", str(RATE), "-c:a", "aac", "-b:a", "128k",
                "-map_metadata", "-1", "-movflags", "+faststart", str(output)],
        check=True,
    )


def finish(duration, loudness=-17):
    return (
        f"loudnorm=I={loudness}:TP=-2:LRA=7,aresample={RATE},"
        f"afade=t=in:d=0.008,afade=t=out:st={duration - 0.065:.3f}:d=0.05,"
        f"apad,atrim=duration={duration:.3f}[out]"
    )


def cannon_pair(path):
    """An original, soft pressure pop with a little paper/air texture, twice."""
    rng = random.Random(604)
    samples = [0.0] * int(RATE * 0.24)
    for offset, gain in [(0, 0.6), (0.023, 0.5)]:
        smooth = 0.0
        for i in range(int(RATE * 0.18)):
            t = i / RATE
            noise = rng.uniform(-1, 1)
            smooth = 0.72 * smooth + 0.28 * noise
            body = math.sin(2 * math.pi * (190 * t - 260 * t * t)) * math.exp(-38 * t)
            air = (noise - smooth) * math.exp(-32 * t)
            attack = min(1, t / 0.002)
            samples[int(offset * RATE) + i] += gain * attack * (0.58 * body + 0.32 * air)
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        audio.writeframes(b"".join(struct.pack("<h", round(max(-1, min(1, x)) * 32767)) for x in samples))


def main():
    source_info = json.loads(Path(__file__).with_name("celebration-sources.json").read_text())["sources"]
    for source in source_info:
        actual = hashlib.sha256((SOURCES / source["file"]).read_bytes()).hexdigest()
        if actual != source["sha256"]:
            raise ValueError(f"Source checksum mismatch: {source['file']}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cues = []
    # Preserve the lip/nasal texture of a real performed nom, with character
    # pitch and tempo. These are eating sounds, not synthesized announcements.
    monsters = {
        "gobbler": (0.72, 1.0, "Low, round, hungry munch"),
        "doubleTrouble": (1.06, 1.0, "Two small monsters munch together"),
        "sneezer": (1.38, 1.02, "Bright, nasal little munch"),
        "fussy": (1.02, 1.0, "Neat, satisfied two-syllable munch"),
        "speedy": (1.25, 1.1, "Quick, eager munch"),
        "og": (0.9, 1.0, "Warm, gravelly munch"),
    }
    nom = SOURCES / "qubodup-nom.mp3"
    for monster, (pitch, tempo, description) in monsters.items():
        filename = f"monster.{monster}.nom.m4a"
        base = "[0:a]atrim=start=0.08:end=0.85,asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,highpass=f=70"
        if monster == "doubleTrouble":
            graph = (
                base + ",asplit=2[a][b];"
                "[a]rubberband=pitch=1.06:tempo=1.0,volume=0.62[a1];"
                "[b]rubberband=pitch=0.86:tempo=1.02,adelay=25,volume=0.48[b1];"
                "[a1][b1]amix=inputs=2:normalize=0," + finish(0.8, -16)
            )
        else:
            graph = base + f",rubberband=pitch={pitch}:tempo={tempo}," + finish(0.8, -16)
        encode([nom], graph, OUTPUT / filename)
        cues.append({"id": filename[:-4], "file": filename, "description": description,
                     "source": "qubodup-nom.mp3", "source_range_seconds": [0.08, 0.85],
                     "pitch_ratio": pitch, "tempo_ratio": tempo, "duration_seconds": 0.8})

    with tempfile.TemporaryDirectory(prefix="nom-celebration-") as temp:
        cannon = Path(temp) / "cannon-pair.wav"
        cannon_pair(cannon)
        # Isolate the Hurra after the initial Jaaaa, then give a small group
        # of cartoon voices slightly different pitches and arrival times.
        graph = (
            "[0:a]atrim=start=1.68:end=3.48,asetpts=PTS-STARTPTS,"
            "aformat=channel_layouts=mono,highpass=f=130,asplit=3[a][b][c];"
            "[a]rubberband=pitch=0.82:tempo=1.86,adelay=45,volume=0.65[a1];"
            "[b]rubberband=pitch=1.05:tempo=1.86,adelay=65,volume=0.4[b1];"
            "[c]rubberband=pitch=1.22:tempo=1.88,adelay=85,volume=0.25[c1];"
            "[1:a]volume=0.75[pop];"
            "[a1][b1][c1][pop]amix=inputs=4:normalize=0," + finish(1.1, -18)
        )
        encode([SOURCES / "davidox-hurra.mp3", cannon], graph, OUTPUT / "celebration.round.m4a")
    cues.append({"id": "celebration.round", "file": "celebration.round.m4a",
                 "description": "Paired soft cannon pop with a small monster Hurra cheer",
                 "source": "davidox-hurra.mp3", "source_range_seconds": [1.68, 3.48],
                 "tempo_ratio": 1.86, "duration_seconds": 1.1, "start_after_round_ms": 1100,
                 "additional_source": "Original deterministic cannon synthesis in build-celebration-sounds.py"})
    encode(
        [SOURCES / "castlefanfare.mp3"],
        "[0:a]atrim=start=0:end=2.06,asetpts=PTS-STARTPTS,atempo=1.4," + finish(1.5, -18),
        OUTPUT / "celebration.level.m4a",
    )
    cues.append({"id": "celebration.level", "file": "celebration.level.m4a",
                 "description": "Bright trumpet ta-daa for level and final victory",
                 "source": "castlefanfare.mp3", "source_range_seconds": [0, 2.06],
                 "tempo_ratio": 1.4, "duration_seconds": 1.5})

    (OUTPUT / "manifest.json").write_text(json.dumps({"version": 1, "cues": cues, "sources": source_info}, indent=2) + "\n")
    credits = [
        "Nom Nom Go! — celebration sound credits",
        "",
        "All three source recordings are CC0 1.0; edits retain that public-domain dedication.",
        "https://creativecommons.org/publicdomain/zero/1.0/",
        "",
    ]
    for source in source_info:
        credits.extend([source["credit"], source["source"], ""])
    credits.extend([
        "Changes: excerpts, character pitch/tempo shifts, layered crowd, loudness matching, fades, AAC conversion.",
        "The soft paired cannon pop is an original synthesized effect.",
        "No part of Dad's recording was transformed or used to make these monster voices.",
        "",
        "File mapping, durations, source ranges, and checksums: manifest.json in this folder.",
        "Rebuild: python3 tools/audio/build-celebration-sounds.py",
        "Requires FFmpeg with the rubberband filter. Originals live in tools/audio/celebration-sources/.",
    ])
    (OUTPUT / "CREDITS.txt").write_text("\n".join(credits) + "\n")
    print(f"Built {len(cues)} cues ({sum(p.stat().st_size for p in OUTPUT.glob('*.m4a')) / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
