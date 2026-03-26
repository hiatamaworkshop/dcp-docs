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

## Output Controller — Shadow Index as Output Constraint

::: tip When to use
The output controller is **optional**. It applies only when the system needs structured output from an AI — classification, scoring, metadata tagging. For reasoning, analysis, and explanation, natural language output is correct. LLMs excel at LLM → human communication; constraining that expressiveness to positional arrays is a design error, not an optimization.
:::

The [Shadow Index](./shadow-index) was designed for input delivery — choosing how much schema information to attach when sending data to an AI. But the same mechanism works in reverse: **presenting a schema as an output constraint**.

### The Three-Stage Model

```
Input Shadow   →   AI   →   Output Shadow (= Controller)   →   Cap
 (Schema A)              (Schema A or B, re-presented)     (safety net)
```

1. **Input**: System delivers data via shadow index. AI reads it without awareness of DCP mechanics.
2. **Output constraint**: System re-presents a shadow index — the same schema or a different one — as a response format. "Answer using these fields, in these ranges." The AI is prompted to respond within the schema's constraints.
3. **Cap**: Any output that still deviates is clamped — enum values outside the defined set are rejected, numbers outside range are clipped, missing fields become null.

### The Controller Is Not a Separate Mechanism

The key insight: **the output controller is just the shadow index applied in the output direction**. No new infrastructure is needed.

- **Same schema for input and output**: Re-present the input shadow. Additional cost ≈ 0 (already in context).
- **Different schema for input and output**: Present Schema B's shadow index as the output constraint. Cost = one shadow index presentation.

There is nothing in the system beyond schema definitions, shadow indexes, and caps. "Controller" is not a component — it is a usage pattern of the shadow index.

### Why This Works

DCP schemas already define the constraint space:

- `enum` fields → selection from fixed choices
- Numeric ranges (`weight: 0-1`) → bounded judgment
- Field definitions → what to answer, not just how

When the AI sees `["action(enum:add|replace|remove)", "domain", "detail", "confidence:0-1"]` as an output format, its judgment space is structurally limited. The AI decides *which* action and *what* confidence — the schema prevents it from inventing fields or producing unbounded values.

```
Prompt:  "Evaluate this change. Respond as: [action(add|replace|remove), domain, detail, confidence:0-1]"

AI output:  ["replace", "auth", "jwt migration to RS256", 0.85]
            ↓
Cap:        action ∈ {add,replace,remove} ✓, confidence ∈ 0-1 ✓ → pass through

AI output:  "I think we should replace the auth module because..."
            ↓
Cap:        not array → parse key-value → place by schema order → clamp values
```

The cap handles the residual — it does not drive the design. Most outputs from capable models will already conform because the constraint was presented upfront.

### Comparison with tool_use

Modern LLM APIs offer JSON schema constraints via tool_use / function calling. The DCP controller pattern differs in two ways:

1. **Schema reuse**: tool_use embeds the full schema in every call. DCP presents it once via shadow index, then omits it — same schema, zero repeated cost.
2. **Graceful degradation**: tool_use rejects non-conforming output. DCP caps it — accepting the intent, correcting the structure.

## Gateway Architecture

The Gateway holds schema registry, encoder, and agent profiles together:

```
Gateway
  ├── SchemaRegistry     — all schema definitions (single source of truth)
  ├── AgentProfile       — per-agent error rate, shadow level
  ├── Shadow Index       — input delivery AND output constraint (same mechanism)
  ├── Encoder            — schema-driven, receives shadow_level as argument
  ├── Cap                — clamps deviations (enum, range, type, missing fields)
  └── Validator          — checks output, feeds back to AgentProfile
```

The system has three concepts: **schemas** (what the data looks like), **shadow indexes** (how much to show, in both directions), and **caps** (safety net for deviations). Everything else is derived.

### AI → AI: Gateway Is Not Always the Answer

Routing every agent-to-agent exchange through a central gateway adds latency and a single point of failure. For AI → AI communication, two lighter patterns exist:

**Edge pattern**: Each agent receives its schema-shadow + controller upfront. Agents output constrained data directly to the next agent, without a gateway round-trip. The schema travels with the agent, not with the infrastructure.

**Brain-managed pattern**: A brain AI holds the schema context and interprets child agent outputs — reformatting, validating, and routing as part of its own reasoning. No separate gateway process; the brain *is* the gateway.

Both patterns move schema intelligence to where the work happens. The central gateway remains valuable for schema registry, agent profiling, and cross-session persistence — but it is not required on every exchange.