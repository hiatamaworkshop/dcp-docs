# Data Cost Protocol

Compact structured data delivery for AI agents. Positional arrays, schema registry, and adaptive density — because JSON was designed for humans, not for agents.

[dcp-docs.pages.dev](https://dcp-docs.pages.dev).
> Implementation: 
[github.com/hiatamaworkshop/dcp-wrap](https://github.com/hiatamaworkshop/dcp-wrap)

## Documentation

- [Specification](docs/dcp/specification.md) — Core protocol, `$S` header, benchmarks
- [Schema-Driven Encoder](docs/dcp/schema-driven-encoder.md) — System→AI encoding, schema generation, output controller
- [Shadow Index](docs/dcp/shadow-index.md) — 5-level density spectrum (L0–L4), adaptive selection
- [Agent Profile](docs/dcp/agent-profile.md) — Per-agent error rate observation, density adjustment
- [Native Operations](docs/dcp/native-ops.md) — DCP as a processing format, primitive operations for brain AIs
- [Validation](docs/dcp/validation.md) — Passive education, cost gradient incentives

## Research

- [Format Comparison](docs/research/format-comparison.md) — NL vs JSON vs DCP accuracy
- [Lightweight LLM & Density](docs/research/lightweight-llm.md) — Sub-4B model compatibility, shadow level testing

## Key Ideas

- **Strip what machines don't need** — No keys, no labels, no repetition. Schema once, data by position.
- **Schema is the single source of truth** — Add a JSON file, get an encoder. No code changes.
- **DCP ≈ JSON in accuracy, ~50% fewer tokens** — Empirically verified across multiple model sizes.
- **Adaptive density** — System observes agent capability and adjusts schema verbosity automatically.
- **L0 (fields only) is optimal for lightweight models** — Protocol markers are noise at ≤4B.
