#!/usr/bin/env bash
# Reproduce the whole experiment for one model: data, LoRA training, and four evaluation arms.
# Usage: ./run_all.sh mlx-community/Qwen2.5-1.5B-Instruct-4bit qwen15b
set -euo pipefail
cd "$(dirname "$0")"
MODEL="${1:-mlx-community/Qwen2.5-1.5B-Instruct-4bit}"
TAG="${2:-qwen15b}"
PY=.venv/bin/python
SEED=20261120

$PY generate.py --out data --seed "$SEED"
$PY grade.py data/episodes_test.jsonl

# LoRA SFT on the training templates only (completion-only loss), fixed seed.
$PY -m mlx_lm lora --model "$MODEL" --train --data data \
  --fine-tune-type lora --num-layers 16 --batch-size 4 --iters 600 \
  --learning-rate 1e-4 --mask-prompt --max-seq-length 1024 \
  --steps-per-report 50 --steps-per-eval 200 --val-batches 25 \
  --adapter-path "adapters/$TAG" --seed 0 2>&1 | tee "results/$TAG.train.log"

$PY evaluate.py --model "$MODEL" --arm "$TAG.base" --out results
$PY evaluate.py --model "$MODEL" --arm "$TAG.base_context" --context --out results
$PY evaluate.py --model "$MODEL" --arm "$TAG.tuned" --adapter "adapters/$TAG" --out results
$PY evaluate.py --model "$MODEL" --arm "$TAG.tuned_context" --adapter "adapters/$TAG" --context --out results
$PY report.py results
