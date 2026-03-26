# Schema-Driven Encoder

## Why Encoders Exist

DCP's primary direction is **system → AI**. LLMs cannot reliably produce positionally correct arrays ([verified at 0% for models ≤3.8B](/research/lightweight-llm)). The system must encode data into DCP before delivering it to the LLM.

This is where the encoder sits — at the boundary where structured data enters the LLM context window:

```
RAG pipeline example:

  User query
    → Vector search (Pinecone, Qdrant, ...)
    → Reranker / filter / compressor
    → [★ DCP Encoder ★]              ← here
    → LLM context window

  Before encoder:
    { "source": "docs/auth.md", "page": 12, "section": "JWT Config", "score": 0.92 }
    { "source": "docs/api.md", "page": 5, "section": "Rate Limiting", "score": 0.87 }

  After encoder:
    ["$S","rag-chunk-meta:v1",4,"source","page","section","score"]
    ["docs/auth.md",12,"JWT Config",0.92]
    ["docs/api.md",5,"Rate Limiting",0.87]
```

The encoder strips keys, applies positional ordering, generates the `$S` header, and optionally groups repeated values with `$G`. Upstream stages (search, rerank, filter) continue to work with the original data — DCP is applied only at the LLM boundary.

This pattern applies beyond RAG:

```
Logs → LLM:     log entries  → encoder → positional arrays → LLM analysis
API → LLM:      HTTP metrics → encoder → positional arrays → LLM monitoring
Internal → LLM: system state → encoder → positional arrays → LLM reasoning
```

Any structured data entering an LLM context window benefits from encoding.

## Schema Drives the Encoder

The central principle: **the schema defines field order, the encoder reads it**. No domain knowledge in the encoder code.

```
Schema JSON → field order → encoder resolves positions → positional array

schema("rag-chunk-meta:v1") → [source, page, section, score, chunk_index]
schema("log-entry:v1")      → [level, service, timestamp, error_code]
schema("api-response:v1")   → [endpoint, method, status, latency_ms]
```

Add a new data type = add a JSON file. No code changes.

```
Hardcoded:
  rows.push(["error", "auth", 1711284600, "E_TIMEOUT"])   // log-specific code
  → change field order = modify all code
  → new schema = write new formatter

Schema-driven:
  encoder = DcpEncoder(schema.load("log-entry:v1"), mapping)
  encoder.encode(data)
  → change field order = edit JSON file
  → new schema = add JSON file
```

**New data types become configuration, not programming.**

---

::: info Implementation Helpers
The sections below describe helper utilities that implement DCP concepts as callable tools. These are not part of the DCP specification — they are reference implementations distributed as part of the DCP package ([dcp-rag](https://github.com/hiatamaworkshop/dcp-rag)).
:::

## Schema Generation

Schemas have conventions — field ordering (identifiers first, then classifiers, then numerics, then text), type inference, enum detection, naming rules. A schema generator embeds these conventions so that any caller gets a compliant schema:

```
Data samples → SchemaGenerator → DcpSchema + FieldMapping (draft)
                                  → review / adjust
                                  → confirmed schema → encoder auto-generated
```

The generator infers:
- **Field types** from observed values (string, number, null unions)
- **Enums** from low-cardinality string fields
- **Numeric ranges** (0-1 scores, non-negative counts)
- **Field order** following DCP convention
- **Group key candidates** from high-repetition fields
- **Mapping paths** via auto-binding (same-name fields need no manual mapping)

## Shadow Level Support

The encoder accepts a `shadow_level` parameter that controls header density. The encoder does not decide the level — the [Gateway](./shadow-index) decides based on the consuming agent's observed capability.

| Level | Header Output | Use Case |
|-------|--------------|----------|
| **L0** | `["source","page","section","score"]` | Lightweight agents, single schema |
| **L1** | `["$S","rag:v1","source","page","section","score"]` | Multi-schema disambiguation |
| **L2** | `["$S","rag:v1",4,"source","page","section","score"]` | Full protocol (default) |
| **L3** | `{"$dcp":"schema","id":"rag:v1","fields":[...],"types":{...}}` | First contact, education |
| **L4** | `source: docs/auth.md, page: 12, score: 0.92` | NL fallback, last resort |

Data rows are identical across L0–L3 (positional arrays). Only L4 switches to key-value text.

## Output Controller — AI → System Direction

LLMs can't produce positional arrays, but sometimes need to output structured DCP data (e.g., writing knowledge entries). The Output Controller solves this by separating **meaning determination** (LLM) from **structural placement** (system):

```
LLM outputs key-value:
  { "action": "replace", "domain": "auth", "detail": "jwt migration", "confidence": 0.9 }

OutputController places by schema order:
  ["replace", "auth", "jwt migration", 0.9]
```

The controller does no semantic inference — if the LLM says `action="replace"`, it goes in the position the schema defines. Extra keys are ignored, missing keys become null, values are validated against schema types.

This is the DCP equivalent of a form for humans: the LLM fills in fields, the system enforces structure. It enables AI → AI communication via a [Gateway](./shadow-index):

```
Agent A → {key: value} → Gateway (OutputController) → DCP → Agent B
```

## Gateway Architecture

The Gateway holds the schema registry, encoder, controller, and agent profiles together:

```
Gateway
  ├── SchemaRegistry          — all schema definitions (single source of truth)
  ├── AgentProfile            — per-agent error rate, shadow level
  ├── Encoder                 — schema-driven, receives shadow_level as argument
  ├── OutputController        — places LLM key-value output into positional arrays
  └── Validator               — checks LLM output against schema, feeds back to profile
```

The schema is the dictionary. The gateway is the librarian — it looks at who's asking and decides which page to open.