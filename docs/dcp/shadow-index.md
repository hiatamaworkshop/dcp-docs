# Shadow Index

DCP separates data from interpretation. The body — a positional array — carries no type, no field name, no schema. It is raw signal. All meaning lives in the **shadow**: metadata layered on top of the body, declaring how to read it.

```
Body:    ["2026-03-29","ERROR","gateway","connection refused"]

Shadow:  ["$S","log:v1",4,"ts","level","svc","msg"]
```

The body knows nothing about itself. The shadow gives it meaning. This separation was a side effect of token compression — stripping keys and using positional encoding. But it turns out to be a fundamental design property.

## Data exists before interpretation

Traditional data pipelines require schema before data flows. ETL demands: define the shape, then extract, then transform, then load. Schema is a precondition.

DCP inverts this. Data flows first. Interpretation follows when needed — or never.

```
Source (JSON API, database, logs, CSV, anything)
  │
  ├─ Extract fields into positional arrays
  │   ["2026-03-29","ERROR","gateway","timeout"]
  │   ["2026-03-29","WARN","auth","retry 3"]
  │
  │  At this point: transferable, storable, streamable.
  │  No schema attached. No meaning declared. Just tuples.
  │
  ├─ Later: attach $S → LLM can interpret
  ├─ Later: attach type mask → validation begins
  ├─ Later: attach routing shadow → agents self-select
  │
  └─ Each shadow arrives when needed, not before
```

**Data existence and data interpretation are asynchronous.** The positional array is structurally complete — transferable, storable — before anyone declares what it means.

This also means DCP rows from different sources can coexist in the same stream. A log row from PostgreSQL and a log row from nginx, both extracted to `[timestamp, level, source, message]`, are indistinguishable under the same `$S` header. The origin doesn't matter. The positional structure does.

## Multiple shadows, one body

The same body can wear different shadows depending on who reads it and why. Shadows are **additive and disposable** — attach one, some, or all. Remove any shadow and the body doesn't notice.

### Semantic Shadow — meaning

The `$S` header is the semantic shadow. It tells the consumer: "position 0 is timestamp, position 1 is severity level, ..." — the same information that JSON keys provide, declared once instead of per-record.

```
["$S","log:v1",4,"ts","level","svc","msg"]
["2026-03-29","ERROR","gateway","timeout"]
```

This is the original DCP use case: token compression. The semantic shadow eliminates key repetition while preserving meaning. Existing data from any source can be partially extracted into positional arrays and given meaning through a semantic shadow after the fact.

#### The 5-Level Density Spectrum

How much semantic information accompanies data depends on the consumer:

| Level | Name | What's Included | Cost |
|-------|------|----------------|------|
| **L0** | Fields Only | Field names only | ~10 tokens |
| **L1** | Schema ID | `$S` + ID only | ~5 tokens |
| **L2** | Schema ID + Fields | `$S` + ID + field names | ~15 tokens |
| **L3** | Full Schema | Complete schema definition with types | ~80+ tokens |
| **L4** | NL Fallback | Natural language key-value | Unlimited |

After first contact, **L1 is the default for capable agents**. The agent has seen the schema; the ID is all it needs. L0 exists for lightweight models that cannot parse protocol markers — empirically optimal for models ≤4B parameters.

Selection can be **fixed** (system-designer's choice) or **adaptive** (observed per-agent compliance). See [Agent Profile](./agent-profile) for the adaptive feedback loop.

### Validation Shadow — verification

A validation shadow defines what "correct" means for each position. It is not a type system imposed on data — it is a lens you choose to look through.

```
Shadow A: field count only
  → 4 fields expected, row has 4 → pass

Shadow B: type mask
  → [iso8601, enum(ERROR|WARN|INFO), string, string]
  → bitwise AND per field → pass/fail

Shadow C: length constraint
  → field 3 (msg): max 200 chars → strlen check

Shadow D: range check
  → field 4 (latency_ms): 0 ≤ n ≤ 30000 → integer comparison

Shadow E: regex pattern
  → field 0 (ts): matches ISO8601 pattern → pattern match
```

These are not layers of the same validation. They are **independent shadows** — attach one, some, or all. The body doesn't know or care which shadows are watching it.

Because DCP rows are fixed-length and line-independent:
- Field count check requires no parsing — delimiter counting
- Type masks can be compiled to bit patterns for hardware-friendly comparison
- Each row validates independently — a corrupted row doesn't invalidate neighbors
- Validation cost is constant per row — 1M rows/sec is integer comparison, not tree walking

Validation shadows are **portable** (ship a shadow definition to a new consumer), **composable** (stack what you need), and **disposable** (remove one, others keep working).

The key difference from traditional type systems: removing a TypeScript interface causes a compilation error. Removing a Protobuf schema causes deserialization failure. Removing a DCP validation shadow causes nothing — the stream continues unvalidated. **Validation is an observation, not a property of the data.**

### Routing Shadow — distribution control

A routing shadow declares **who receives this data and under what conditions**. It is not system-side filtering logic — it is a shadow like any other: an independent metadata layer attached to the body, readable by the system, disposable when no longer needed.

```
Body:    ["2026-03-29","ERROR","gateway","timeout"]

Semantic shadow:
  ["$S","log:v1",4,"ts","level","svc","msg"]

Routing shadow:
  schema:   "log:v1"                    // schema compatibility required
  minLevel: L1                          // agents below L1 are excluded
  access:   ["ops", "sre"]              // group-level access control
  filter:   { level: ["ERROR","WARN"] } // field-value conditions
```

The system reads the routing shadow and executes its conditions — it doesn't own the logic. The routing shadow declares; the system obeys. Change the shadow, change the distribution. Remove the shadow, data flows unrestricted.

This means routing is:

- **Declarative** — conditions are stated in the shadow, not coded in the system
- **Composable** — schema constraint + capability level + group access + field filter, mix as needed
- **Disposable** — remove the routing shadow and the body still exists, just unrouted

Schema versioning (`v1` vs `v2`) naturally partitions groups. ProjectId + schemaId + access constraints together form the selection key that guides data to the right agents.

See [Agent Profile](./agent-profile) for task pooling, adaptive capability assessment, and AI-to-AI communication patterns.

### Other shadows

The shadow concept extends to any metadata overlay:

- **Statistical shadow** — distribution profiles per field for anomaly detection. Deviation from baseline triggers alerts.
- **Output controller shadow** — re-present a schema as a response constraint. The same shadow that tells an AI "here's what this data means" also tells it "respond in this shape." See [Agent Profile — Layered Access](./agent-profile#design-direction-layered-access).
- **Access control shadow** — field-level projection. A brain sees all 8 fields; a worker sees 3. Same body, different visibility.

## AI as exception handler

When validation shadows handle the normal case at machine speed, AI's role shifts:

```
Stream: 1M rows/sec
  → validation shadow: 999,990 pass → discard or store silently
  → 10 fail → route to AI for interpretation
  → AI processes 10 rows, not 1,000,000
```

DCP validation shadows bypass LLM mediation entirely for the normal case. AI becomes the exception handler — invoked only when mathematical checks surface something the shadow can't resolve.

This is the same pattern as engram's receptor: EMA smoothing and weight thresholds handle quality assessment mathematically. The LLM is reserved for what math can't do — interpreting meaning, judging context, explaining exceptions.

**Math first. AI when math isn't enough.**

## Schema Pre-Methods

DCP schemas define four interaction verbs for multi-agent handshakes:

| Method | Meaning | Example |
|--------|---------|---------|
| `$S?` | Schema query — "what schema is this?" | Parse unknown data |
| `$S!` | Schema declaration — "I'm sending this schema" | Handshake |
| `$SV` | Schema validation — "does this conform?" | Quality check |
| `$S+` | Schema expansion — "give me the full definition" | Learning |

These are infrastructure for future multi-agent handshakes, not yet actively triggered by current agents.

## Why this design

None of the shadow applications beyond token compression were designed upfront. The goal was: "send less tokens to the LLM." Stripping keys, using positional encoding, declaring schema once — all token optimization decisions.

The result happened to produce a minimal data representation that is simultaneously compressible, validatable, routable, and layerable. **Removing everything unnecessary left only the essential structure — and essential structure is universally useful.**