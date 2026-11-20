"""Run one arm on the held-out test episodes and grade it.

python evaluate.py --model mlx-community/Qwen2.5-0.5B-Instruct-4bit --arm base
python evaluate.py --model ... --arm tuned --adapter adapters/qwen05b
python evaluate.py --model ... --arm base_context --context
Decoding is greedy (temperature 0), so a run is deterministic for a given model, adapter and data.
"""

import argparse
import json
import time
from pathlib import Path

import mlx.core as mx
from mlx_lm import generate, load

from generate import SYSTEM_PROMPT, to_chat, user_with_context
from grade import grade, summarize

# the first train episode of each of these types is used as a worked example in --fewshot
FEWSHOT_TYPES = ["follow_change", "removed_step", "hold", "stop", "pending_proposal"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--adapter", default=None)
    ap.add_argument("--arm", required=True)
    ap.add_argument("--context", action="store_true", help="prepend the Align-style injected context")
    ap.add_argument("--data", default="data/episodes_test.jsonl")
    ap.add_argument("--out", default="results")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--fewshot", action="store_true",
                    help="prepend 5 worked examples from the TRAIN templates (a stronger prompted-only baseline)")
    a = ap.parse_args()
    mx.random.seed(a.seed)
    model, tok = load(a.model, adapter_path=a.adapter)
    eps = [json.loads(l) for l in open(a.data)]
    if a.limit:
        eps = eps[:a.limit]
    shots = []
    if a.fewshot:
        train = [json.loads(l) for l in open("data/episodes_train.jsonl")]
        for et in FEWSHOT_TYPES:
            ep = next(e for e in train if e["event_type"] == et)
            shots += to_chat(ep, with_context=a.context)["messages"][1:]
    rows, raw = [], []
    t0 = time.time()
    for ep in eps:
        u = user_with_context(ep) if a.context else ep["user"]
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + shots + [{"role": "user", "content": u}]
        prompt = tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False)
        text = generate(model, tok, prompt=prompt, max_tokens=80, verbose=False)
        g = grade(ep, text)
        rows.append((ep, g))
        raw.append({"id": ep["id"], "event_type": ep["event_type"], "expected": ep["expected"], "output": text, "grade": g})
    secs = round(time.time() - t0, 1)
    summary = summarize(rows)
    summary.update({"arm": a.arm, "model": a.model, "adapter": a.adapter, "context": a.context, "fewshot": a.fewshot,
                    "data": a.data, "decoding": "greedy, max_tokens=80", "seed": a.seed, "eval_seconds": secs})
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / f"{a.arm}.summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    with open(out / f"{a.arm}.outputs.jsonl", "w") as f:
        for r in raw:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(json.dumps({"arm": a.arm, "overall": summary["checks"]["overall"], "secs": secs}))


if __name__ == "__main__":
    main()
