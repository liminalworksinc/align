#!/usr/bin/env bash
# Reproduce the whole experiment for one model: data, LoRA training, and five evaluation arms on two test sets.
# Usage (the exact runs reported in RESULTS.md):
#   ./run_all.sh mlx-community/Qwen2.5-0.5B-Instruct-4bit qwen05b 600
#   ./run_all.sh mlx-community/Qwen2.5-1.5B-Instruct-4bit qwen15b 200 --grad-checkpoint
set -euo pipefail
cd "$(dirname "$0")"
MODEL="${1:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
TAG="${2:-qwen05b}"
ITERS="${3:-600}"
EXTRA="${4:-}"
PY=.venv/bin/python
SEED=20261120
mkdir -p results/novel

$PY generate.py --out data --seed "$SEED"
$PY grade.py data/episodes_test.jsonl
$PY grade.py data/episodes_test_novel.jsonl

# LoRA SFT on the training templates only (completion-only loss), fixed seed.
$PY -m mlx_lm lora --model "$MODEL" --train --data data \
  --fine-tune-type lora --num-layers 16 --batch-size 4 --iters "$ITERS" \
  --learning-rate 1e-4 --mask-prompt --max-seq-length 1024 \
  --steps-per-report 50 --steps-per-eval 200 --val-batches 25 $EXTRA \
  --adapter-path "adapters/$TAG" --seed 0 > "results/$TAG.train.log" 2>&1

for SET in test test_novel; do
  if [ "$SET" = test ]; then OUT=results; else OUT=results/novel; fi
  D="--data data/episodes_$SET.jsonl --out $OUT"
  $PY evaluate.py --model "$MODEL" --arm "$TAG.base" $D
  $PY evaluate.py --model "$MODEL" --arm "$TAG.base_fewshot" --fewshot $D
  $PY evaluate.py --model "$MODEL" --arm "$TAG.base_context" --context $D
  $PY evaluate.py --model "$MODEL" --arm "$TAG.tuned" --adapter "adapters/$TAG" $D
  $PY evaluate.py --model "$MODEL" --arm "$TAG.tuned_context" --adapter "adapters/$TAG" --context $D
done
$PY report.py results
$PY report.py results/novel
