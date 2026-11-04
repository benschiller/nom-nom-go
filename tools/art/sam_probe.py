#!/usr/bin/env python3
"""Find a SAM noun that matches a raw: tries each candidate in order and
prints the first that returns a mask (fail fast, one raw at a time).
  python3 tools/art/sam_probe.py <raw.png> "noun one" "noun two" ..."""
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SAM_PY = TOOLS.parents[1] / ".venv-sam" / "bin" / "python"
raw, nouns = sys.argv[1], sys.argv[2:]
out = Path(tempfile.gettempdir()) / "sam_probe_cov.png"
for noun in nouns:
    r = subprocess.run([str(SAM_PY), str(TOOLS / "sam_cut.py"), raw, noun, str(out), "--coverage"],
                       capture_output=True, text=True, timeout=150)
    ok = r.returncode == 0
    print(f"{noun!r}: {'MATCH' if ok else 'no match'}", flush=True)
    if ok:
        raise SystemExit(0)
raise SystemExit(1)
