#!/usr/bin/env python3
"""Rebuild Dad's recorded cues, manifest entries, and tracking table (requires ffmpeg)."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]
CUE_SHEET = Path(__file__).with_name("dad-voice-cues.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("master", type=Path, help="Path to the original dad-voice.m4a")
    args = parser.parse_args()
    sheet = json.loads(CUE_SHEET.read_text())
    if hashlib.sha256(args.master.read_bytes()).hexdigest() != sheet["sha256"]:
        parser.error("The master differs from the recording used to mark these cue boundaries.")

    manifest_path = ROOT / "game/public/audio/clips.json"
    manifest = json.loads(manifest_path.read_text())
    by_id = {clip["id"]: clip for clip in manifest["clips"]}
    output_dir = ROOT / "game/public/audio/clips"
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for cue in sheet["clips"]:
        clip_id = cue["id"]
        duration = cue["end"] - cue["start"]
        filename = f"{clip_id}.m4a"
        output = output_dir / filename
        # Decode before trimming for sample-accurate cuts. Short fades sit inside
        # the retained silence; a fixed -3 dB leaves headroom without changing tone.
        filters = (
            f"atrim=start={cue['start']}:end={cue['end']},asetpts=PTS-STARTPTS,"
            f"volume=-3dB,afade=t=in:d=0.008,afade=t=out:st={duration - 0.012:.3f}:d=0.012"
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(args.master), "-vn", "-af", filters,
             "-ac", "1", "-ar", "48000", "-c:a", "aac", "-b:a", "96k",
             "-map_metadata", "-1", "-movflags", "+faststart", str(output)],
            check=True,
        )
        by_id[clip_id]["file"] = filename
        by_id[clip_id]["text"] = cue["text"]
        rows.append(
            f"| `{clip_id}` | {cue['text']} | {cue['start']:.3f}–{cue['end']:.3f} | "
            f"{duration:.3f} | [`{filename}`](../game/public/audio/clips/{filename}) |"
        )
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    tracking = """# Dad's voice clips

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
"""
    tracking += "\n".join(rows) + "\n"
    tracking += """
## Rebuild

The reviewed boundaries and master SHA-256 are recorded in
[`tools/audio/dad-voice-cues.json`](../tools/audio/dad-voice-cues.json).
With Python 3 and FFmpeg installed, run from the repository root:

```sh
python3 tools/audio/extract-dad-voice.py /absolute/path/to/dad-voice.m4a
```

This regenerates the audio files, manifest mappings, and this table. The script
rejects a different master so the time ranges cannot silently label the wrong speech.
"""
    (ROOT / "docs/dad-voice-clips.md").write_text(tracking)
    print(f"Exported {len(rows)} clips ({sum(p.stat().st_size for p in output_dir.glob('*.m4a')) / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
