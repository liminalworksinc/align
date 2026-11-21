"""Print a markdown table of every *.summary.json in a results directory."""

import json
import sys
from pathlib import Path

from grade import CHECKS

d = Path(sys.argv[1] if len(sys.argv) > 1 else "results")
sums = [json.loads(p.read_text()) for p in sorted(d.glob("*.summary.json"))]
cols = CHECKS + ["overall"]
print("| check | " + " | ".join(s["arm"] for s in sums) + " |")
print("|---|" + "---|" * len(sums))
for c in cols:
    cells = []
    for s in sums:
        x = s["checks"][c]
        cells.append(f"{x['pass']}/{x['n']} ({100 * x['rate']:.0f}%)" if x["n"] else "n/a")
    print(f"| {c} | " + " | ".join(cells) + " |")
types = sorted(sums[0]["by_event_type"]) if sums else []
print()
print("| overall by event type | " + " | ".join(s["arm"] for s in sums) + " |")
print("|---|" + "---|" * len(sums))
for t in types:
    cells = [f"{s['by_event_type'][t]['pass']}/{s['by_event_type'][t]['n']}" for s in sums]
    print(f"| {t} | " + " | ".join(cells) + " |")
