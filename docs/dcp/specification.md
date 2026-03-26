# Specification — AI Native Data Format

> If no human reads the data, there's no reason to write it in a human-readable format.

## The Problem

LLMs produce and consume text at extraordinary cost. Every token matters — in API billing, context window budget, and inference latency. Yet the data AI agents exchange with each other is overwhelmingly formatted for human readability: verbose JSON with repeated keys, natural language descriptions where structured data would suffice, self-documenting formats read by no one.

The question is simple: **if only machines read this data, why are we formatting it for humans?**

## Core Idea

Data Cost Protocol (DCP) is a convention for delivering structured data to AI agents. The rules:

1. **Define a schema once** — field names, order, and types declared in a header
2. **Write data by position** — no keys, no labels, no repetition. The schema says what position 3 means
3. **Inline the schema with the data** — no external documentation needed to interpret

This is not a new serialization format. It's a design discipline: **strip everything the consumer doesn't need**.

## Before and After

### Simple case

```json
[
  { "id": 1, "name": "Alice", "score": 92 },
  { "id": 2, "name": "Bob", "score": 85 },
  { "id": 3, "name": "Charlie", "score": 88 }
]
```

With DCP:

```
[schema: id, name, score]
[[1,"Alice",92],[2,"Bob",85],[3,"Charlie",88]]
```

### Real-world case: AI agent session handoff

A session's emotional trajectory, passed from one agent session to the next:

```json
{
  "timestamp": 17900,
  "gap": 0,
  "state": "exploring",
  "intensity": 0.36,
  "frustration": 0,
  "seeking": -0.36,
  "confidence": 0,
  "fatigue": 0.03,
  "flow": 0
}
```

With DCP:

```
[schema: A=arc(t,gapMs,state,intensity,frust,seek,conf,fatigue,flow)]
["A",17900,0,"exploring",0.36,0,-0.36,0,0.03,0]
```

One record, ~70% smaller. A session produces dozens to hundreds of these. The savings compound.

## Three-Line Wire Format

For streaming heterogeneous data, DCP uses a three-line structure:

```
[manifest: what this data is and why it exists]
[schema: field definitions for all record types]
[...data...]
```

Manifest declares intent. Schema declares structure. Data follows. A receiving agent reads three lines and knows everything it needs — no external docs, no API reference, no guesswork.

### Live example — Prior Block

```
[prior-block: prior session experience. use as context for continuity.]
[schema: H=header(durationMs,valenceBalance,frust,seek,conf,fatigue,flow,stateFlow)
         A=arc(t,gapMs,agentState,intensity,dFrust,dSeek,dConf,dFatig,dFlow,engramId?)
         F=footer(finalEmotion[5],stats[5],stateRatio[...],engramTop[...],hotPaths[...],methodRank[...])]
[["H",681804,1,0,-0.36,0,0.03,0,"exploring→deep_work"],["---"],["A",17900,0,...],...]
```

This carries a full session's emotional trajectory — state transitions, emotion deltas, file access patterns, method rankings, knowledge references — in under 2KB. The natural language equivalent exceeds 30KB.

## The `$S` Header — Schema-on-Wire

DCP data in the wild uses a compact header to declare which schema governs the rows that follow:

```
["$S", schema_id, field_count, ...field_names]
```

- `$S` — literal marker, signals "this is a schema declaration"
- `schema_id` — identifies the schema (e.g., `"knowledge:v1"`, `"hotmemo:v1"`)
- `field_count` — how many fields per data row
- `field_names` — positional field names for human audit

Data rows follow immediately. The first element of each row is a record-type tag or is omitted if the schema has only one type.

```
["$S","hotmemo:v1",4,"layer","source","signal","detail"]
["quality","push","no-type-tag","auth jwt migration fix"]
["receptor","passive","suggest","engram_pull"]
```

When both producer and consumer already know the schema, the header can be **abbreviated** to just the schema ID:

```
["$S","hotmemo:v1"]
["quality","push","no-type-tag","auth jwt migration fix"]
```

This is the density spectrum in action — the same protocol at different verbosity levels depending on context.

## Fixed-Length Principle

DCP arrays are fixed-length by design. Every record in a schema has the same number of fields, in the same order. This is what makes positional parsing, overlay, and cross-domain comparison work — index 4 always means the same thing.

### Why fixed-length matters

- **Parse cost**: no key lookup, no field-count validation. Read position N, done.
- **Overlay**: stack arrays from different domains and compare by index. If lengths vary, alignment breaks.
- **Schema as contract**: the schema line declares the structure once. Every record honors it. No surprises.

### Last-field escape hatch

The final field of any record type may carry an optional, free-form structure:

```
[schema: A=arc(t,gapMs,state,intensity,frust,seek,conf,fatigue,flow,ext?)]
["A",1200,0,"stuck",0.42,0.35,0.12,0.08,0.60,{"note":"retry after timeout","ctx":[1,2]}]
["A",1400,200,"exploring",0.28,0.40,0.18,0.06,0.65]
```

Rules:
- Only the **last** field. Interior fields stay positional and typed.
- **Optional** — omitting it is normal, not exceptional.
- The preceding fields remain fixed-length. Index stability is preserved.
- What goes in the last field is unconstrained — object, array, string, null.

This is the escape hatch, not the norm. A well-designed schema rarely needs it. But DCP itself is a voluntary convention with no enforcement mechanism — it cannot forbid what it cannot police. Acknowledging this formally keeps schemas honest: if a domain needs extensibility, it flows through a defined channel rather than corrupting the positional structure.

## Schema Registry

Schemas are centralized as JSON definitions in a registry. Each schema declares its fields, types, enums, and examples:

```json
{
  "$dcp": "schema",
  "id": "hotmemo:v1",
  "fields": ["layer", "source", "signal", "detail"],
  "fieldCount": 4,
  "types": {
    "layer": { "type": "string", "enum": ["quality", "session", "trend", "meta", "receptor", "subsystem", "pre-neuron"] },
    "source": { "type": "string" },
    "signal": { "type": "string" },
    "detail": { "type": "string" }
  }
}
```

The registry serves as the single source of truth. Schemas are available via API (`GET /schemas`, `GET /schemas/:id`), embedded in tool descriptions, and referenced by hash for cache validation.

## Normalize Values

LLM tokenizers treat numbers differently by form. `0.36` costs 2 tokens; `92` costs 1. Precision the consumer doesn't need is wasted tokens.

DCP recommends normalizing values to the simplest representation that preserves meaning:

- Emotion axes at 0.01 precision? Consider integers 0-100 instead of floats 0.00-1.00
- Timestamps in milliseconds? If second granularity suffices, divide first
- Boolean-like values? `0`/`1` over `true`/`false` (fewer tokens)

Match data resolution to the consumer's actual needs — the same principle as choosing `int16` over `float64` in binary protocols, applied to token cost.

## Design Properties

### "Self-describing" vs "Pre-agreed"

JSON is self-describing: every value carries its own key. This is friendly for humans who browse raw data. For machines processing thousands of records, those keys are pure waste — the consumer already knows the schema.

DCP is pre-agreed: the schema is declared once, and all subsequent records follow it implicitly. This is how binary protocols (Protocol Buffers, MessagePack) have always worked. DCP applies the same principle to text — because LLMs consume text, not binary.

### System → AI: one-way by design

DCP is primarily a **system → AI** delivery format. AI output remains natural language; the system side parses and converts. This is a deliberate constraint — current LLMs cannot reliably generate positionally correct arrays (verified: 0% correct field ordering across all tested models ≤3.8B). DCP optimizes the input channel, not the output.

### Position is meaning

In DCP, the position of a value within an array determines its semantics. This is identical to how CSV works, and how function arguments work in every programming language. It's the oldest data convention in computing, applied to structured data delivery for AI.

### Inline schema eliminates drift

The schema travels with the data. There's no separate documentation to fall out of sync, no version negotiation, no "which schema does this payload use?" question. Read the header, parse the data. One step.

## Benchmark: DCP vs JSON vs Natural Language

Claims need numbers. We ran a reproducible benchmark comparing the same data in three formats across data size, parse speed, and LLM token cost.

### Data Size (10,000 records)

| Format | bytes/record | vs DCP |
|--------|-------------|--------|
| DCP compact | 83 B | 1.00x |
| JSON (JSONL) | 182 B | 2.19x |
| Natural language | 223 B | 2.69x |

DCP is less than half the size of JSON, roughly a third of natural language. The ratio is stable across scales (100 to 10,000 records).

### Parse Speed (10,000 records)

| Format | Total | per record | vs DCP |
|--------|-------|-----------|--------|
| DCP compact | 10.9 ms | 1.09 μs | 1.00x |
| JSON (JSONL) | 15.8 ms | 1.58 μs | 1.45x |
| Natural language | 26.6 ms | 2.66 μs | 2.44x |

The NL figure is regex parsing against a controlled template. Real-world natural language requires LLM inference — orders of magnitude slower.

### Token Cost (LLM context consumption)

| Format | 10,000 records | vs DCP | at $3/1M tokens |
|--------|---------------|--------|-----------------|
| DCP compact | ~207K tokens | 1.00x | $0.62 |
| JSON (JSONL) | ~455K tokens | 2.19x | $1.36 |
| Natural language | ~557K tokens | 2.69x | $1.67 |

### The Real Gap: Parsing Cost

DCP and JSON parse with zero LLM cost — string operations only. Natural language requires LLM inference to extract structured data:

```
1,000 records parsing cost:
  DCP/JSON: $0.0000  (JSON.parse / array index)
  NL:       $0.2163  (Sonnet input + output tokens)
```

The most expensive thing about natural language as a data format isn't the bytes — it's that **parsing requires inference**.

## Why This Matters

The AI industry is approaching data exchange as a JSON optimization problem (TOON, compressed JSON variants). These strip syntax overhead — braces, quotes, colons — but preserve the key-value structure.

DCP asks a different question: **why have keys at all?** If the consumer knows the schema, every key is a wasted token. For N records with K fields, JSON repeats K key names N times. DCP states them once.

As AI agents consume more structured data — session state, knowledge graphs, behavioral signals, configuration — the volume of system-to-AI data delivery grows fast. Formatting that traffic for human readability is a cost no one will want to pay.

> You minify JavaScript before deploying to production. Why wouldn't you minify data before sending it to an AI?