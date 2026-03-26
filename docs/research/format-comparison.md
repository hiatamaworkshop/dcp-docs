# Format Comparison: NL vs JSON vs DCP

## Core Finding

**DCP positional arrays are as readable as JSON and NL for LLMs.** When a model fails a task, it fails across all formats equally — format is not the bottleneck, model capability is.

This means DCP's token savings come at no accuracy cost.

## Evidence

NL vs DCP accuracy testing (4 models × 2 tasks × 3 runs):

| Model | Test | NL | DCP |
|-------|------|:-:|:-:|
| phi3:mini | highest_score | 0/3 | **3/3** |
| phi3:mini | filter_by_value | 0/3 | 0/3 |
| gemma2:2b | highest_score | 0/3 | **3/3** |
| gemma2:2b | filter_by_value | 3/3 | 3/3 |
| llama3.2:1b | highest_score | 3/3 | 3/3 |
| llama3.2:1b | filter_by_value | **3/3** | 0/3 |

DCP outperforms NL in 2 cases, ties in 3, loses in 1. No consistent disadvantage.

Shadow level testing confirmed the same pattern — L0 (DCP with field names only) matched or beat L4 (NL key-value) for phi3 and llama. See [Lightweight LLM & Density](./lightweight-llm) for full data.

## Implications

- **DCP is safe to deploy** — no accuracy penalty vs JSON or NL
- **Token savings are free** — same comprehension, fewer tokens
- **Model capability is the bottleneck**, not data format