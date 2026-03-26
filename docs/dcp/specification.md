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

### Real-world case: API monitoring data

A batch of API response metrics fed to an LLM for analysis:

```json
[
  { "endpoint": "/v1/users", "method": "GET", "status": 200, "latency_ms": 42 },
  { "endpoint": "/v1/orders", "method": "POST", "status": 201, "latency_ms": 187 },
  { "endpoint": "/v1/auth", "method": "POST", "status": 200, "latency_ms": 95 },
  { "endpoint": "/v1/search", "method": "GET", "status": 200, "latency_ms": 312 }
]
```

With DCP:

```
["$S","api-response:v1",4,"endpoint","method","status","latency_ms"]
["/v1/users","GET",200,42]
["/v1/orders","POST",201,187]
["/v1/auth","POST",200,95]
["/v1/search","GET",200,312]
```

4 records: JSON repeats 4 key names × 4 rows = 16 keys. DCP states them once. ~50% metadata reduction. At scale (hundreds of records per analysis), the savings compound.

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

The system selects verbosity by the consumer's capability and session state. The full header is for agents handling multiple schemas simultaneously; single-schema consumers need only the field names.

For lightweight models (≤4B), field names alone produce the best comprehension — protocol markers are noise at this size. See [Shadow Index](./shadow-index) for the 5-level density spectrum and [Lightweight LLM results](/research/lightweight-llm) for test data.

## Fixed-Length Principle

DCP arrays are fixed-length by design. Every record in a schema has the same number of fields, in the same order. This is what makes positional parsing, overlay, and cross-domain comparison work — index 4 always means the same thing.

### Why fixed-length matters

- **Parse cost**: no key lookup, no field-count validation. Read position N, done.
- **Overlay**: stack arrays from different domains and compare by index. If lengths vary, alignment breaks.
- **Schema as contract**: the schema line declares the structure once. Every record honors it. No surprises.

### Last-field escape hatch

The final field may optionally carry a free-form value (object, array, null). Interior fields stay positional. A well-designed schema rarely needs this.

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

## Design Properties

- **Pre-agreed, not self-describing.** JSON repeats keys per record for human browsability. DCP declares the schema once — like Protocol Buffers and MessagePack, but in text because LLMs consume text.

- **Position is meaning.** The same convention as CSV, function arguments, and array indexing — applied to AI data delivery.

- **Schema travels with data.** No external docs to drift out of sync. Read the header, parse the rows.

- **System → AI is the primary direction.** LLMs cannot reliably generate positionally correct arrays (0% correct ordering at ≤3.8B). For the AI → system direction, the [shadow index](./shadow-index) is re-presented as an output constraint — the same schema that delivered the input now constrains the output. Deviations are [capped](./schema-driven-encoder#output-controller-shadow-index-as-output-constraint) as a safety net. No separate output mechanism exists.

- **Normalize values for token cost.** LLM tokenizers treat `0.36` (2 tokens) differently from `92` (1 token). Use the simplest representation: integers 0-100 over floats 0.00-1.00, seconds over milliseconds, `0`/`1` over `true`/`false`.

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