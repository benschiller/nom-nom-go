#!/usr/bin/env python3
"""Rebuild several manifest ids in parallel from ONE process (the ledger lock
is per process, so never run several art.py processes at once).

  python3 tools/art/rebuild_many.py [--workers 6] <id> [<id> ...]
  python3 tools/art/rebuild_many.py --prefix monster. --suffix .tap ...

Each id goes through art.cmd_rebuild: new version v+1 from the manifest spec,
generate, cut, normalise, QA; a failing version never replaces the current
final."""
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import art  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--note", default="")
    args = ap.parse_args()
    unknown = [i for i in args.ids if i not in art.BY_ID]
    if unknown:
        raise SystemExit(f"unknown ids: {unknown}")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(lambda i: art.cmd_rebuild(i, args.note), args.ids))


if __name__ == "__main__":
    main()
