#!/usr/bin/env python3
"""Generate ONE raw for a manifest id (one Muse Image call, no retries, no
cut, no ledger write) into a new file next to the other raws:
  python3 tools/art/gen_one.py <id> [--note "<steer>"]
prints the raw's path. Then preview the cut, and accept it with
  python3 tools/art/art.py recut --id <id> --source <raw> [--accept]
This is the fail-fast path for proving settings one asset at a time."""
import argparse
import base64
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import art  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("id")
ap.add_argument("--note", default="")
args = ap.parse_args()
entry = art.BY_ID[args.id]
content = [{"type": "input_text", "text": art.build_prompt(entry, args.note)}]
notes = entry.get("ref_notes", [])
for i, ref in enumerate(entry.get("refs", [])):
    content.append({"type": "input_text", "text": notes[i] if i < len(notes) else "Reference image (match this exactly):"})
    content.append({"type": "input_image", "image_url": art.data_url(art.ROOT / ref)})
resp = art.CLIENT.responses.create(
    model=art.MANIFEST["models"]["image"],
    input=[{"role": "user", "content": content}],
    tools=[{"type": "image_generation", "enable_image_search": False, "enable_web_search": False, "enable_shell": False,
            "reasoning_strength": "high" if entry["category"] in ("monster", "chef", "env") else "low",
            "size": entry["size"], "output_format": "png"}],
)
b64 = next(o.result for o in resp.output if o.type == "image_generation_call")
out = art.SRC_DIR / f"{args.id}.try{int(time.time())}.png"
out.write_bytes(base64.b64decode(b64))
print(out.relative_to(art.ROOT))
