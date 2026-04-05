# Shadow Index

DCP separates data from interpretation. The body — a positional array — carries no type, no field name, no schema. It is raw signal. All meaning lives in the **shadow**: metadata layered on top of the body, declaring how to read it.

```
Body:   ["2026-03-29","ERROR","gateway","connection refused"]
Shadow: ["$S","log:v1",4,"ts","level","svc","msg"]
```

The body knows nothing about itself. The shadow gives it meaning. This separation emerged as a side effect of token compression, but it turns out to be a fundamental design property: **data existence and data interpretation are asynchronous.**

Shadows are now classified into six types, each with a single responsibility:

| Shadow | Marker | Role |
|--------|--------|------|
| Semantic | `$S` | Declares field names and schema — gives meaning to positional arrays |
| Validation | `$V` | Defines correctness per field — type masks, ranges, patterns |
| Routing | `$R` | Distribution control — who receives data and under what conditions |
| Permission | `$P` | Access control — who sees which fields |
| Stats | `$ST` | Aggregated observation — pass rates, distributions, batch character |
| Output | `$O` | Format adaptation — bit flags + vector for capability-limited consumers |

All shadows reference the same schema. Each shadow layer reads from that definition independently:

```
schema: log:v1 → fields: [ts, level, svc, msg]

├── $S   → "position 0 = ts, position 1 = level, ..."
├── $V   → "position 0 must be iso8601, position 1 must be enum(ERROR|WARN|INFO)"
├── $R   → "route to ops group if level = ERROR"
├── $P   → "ops sees all 4 fields; workers see positions 2-3 only"
├── $ST  → "pass_rate=0.997, dominant=ERROR, sample_n=1000"
└── $O   → "0x0024, [0.7, 0.2, 0.0, 0.4]"
```

Each shadow is independent. Attach one, some, or all — the body and schema are unchanged.

## Multiple shadows, one body

The same body can wear different shadows depending on who reads it and why. Shadows are **additive and disposable** — remove any shadow and the body doesn't notice.

### Semantic Shadow ($S) — meaning

The `$S` header declares field positions. The same information that JSON keys provide, declared once instead of per-record.

```
["$S","log:v1",4,"ts","level","svc","msg"]
["2026-03-29","ERROR","gateway","timeout"]
```

#### Density Spectrum

How much semantic information accompanies data depends on the consumer:

| Level | What's Included | Cost |
|-------|----------------|------|
| **L0** | Field names only | ~10 tokens |
| **L1** | `$S` + schema ID only | ~5 tokens |
| **L2** | `$S` + ID + field names | ~15 tokens |
| **L3** | Full schema with types | ~80+ tokens |
| **L4** | Natural language key-value | Unlimited |

After first contact, **L1 is the default for capable agents**. L0 exists for lightweight models that cannot parse protocol markers — empirically optimal for models ≤4B parameters.

Selection can be **fixed** (system-designer's choice) or **adaptive** (observed per-agent compliance). See [Agent Profile](./agent-profile) for the adaptive feedback loop.

### Validation Shadow ($V) — verification

A validation shadow defines what "correct" means for each position. It is not a type system imposed on data — it is a lens you choose to look through.

```
["$V","log:v1", "type:[iso8601,enum(ERROR|WARN|INFO),string,string]"]
  → bitwise AND per field → pass/fail

["$V","log:v1", "range:4:0:30000"]
  → field 4 (latency_ms): 0 ≤ n ≤ 30000 → integer comparison
```

Because DCP rows are fixed-length and line-independent:
- Type masks compile to bit patterns — hardware-friendly comparison
- Each row validates independently — a corrupted row doesn't invalidate neighbors
- Validation cost is constant per row — 1M rows/sec is integer arithmetic, not tree walking

Validation shadows are **portable**, **composable**, and **disposable**. Removing a DCP validation shadow causes nothing — the stream continues unvalidated. **Validation is an observation, not a property of the data.**

### Routing Shadow ($R) — distribution control

A routing shadow declares who receives data and under what conditions. The routing shadow declares; the system obeys. Change the shadow, change the distribution.

```
["$R","log:v1", "minLevel:L1", "access:[ops,sre]", "filter:level:[ERROR,WARN]"]
```

Routing is **declarative** — conditions live in the shadow, not coded in the system. Schema versioning (`v1` vs `v2`) naturally partitions consumer groups.

See [Agent Profile](./agent-profile) for task pooling and adaptive capability assessment.

### Stats Shadow ($ST) — observation

`$ST` records aggregate observations per batch window: pass rates, field distributions, running counts. Where `$V` validates individual rows, `$ST` watches the stream over time.

```
["$ST","log:v1", 9990, 10, 1000, "ERROR"]
```

`$ST` feeds the output shadow derivation pipeline. See [Shadow — Stats ($ST)](./shadow-stats).

### Output Shadow ($O) — format adaptation

`$O` is the output format layer — controls which fields are delivered and in what form. Distinct from `$P` (access control): `$O` addresses form, not permission.

```
["$O","receptor:v1", 0x0024, [0.7, 0.2, 0.0, 0.4]]
```

From full DCP down to bit flags + component vector, one shadow covers the range. See [Shadow — Output ($O)](./shadow-output).

### Other shadows

- **Output controller shadow** — re-present a schema as a response constraint. The same shadow that tells an AI "here's what this data means" also tells it "respond in this shape."
- **Access control shadow** — field-level projection. A brain sees all 8 fields; a worker sees 3. Same body, different visibility.

## Math first. AI for exceptions.

Validation shadows handle the normal case at machine speed. AI's role shifts to exception handling:

```
Stream: 1M rows/sec
  → $V: 999,990 pass → store silently
  →     10 fail → route to AI
  → AI processes 10 rows, not 1,000,000
```

When and how AI acts on those exceptions — observation, routing decisions, schema evolution — is the pipeline control layer. See [Pipeline](./pipeline).

## Why this design

The goal was token compression: send fewer tokens to the LLM. Stripping keys, positional encoding, declaring schema once — all token optimization decisions.

The result happened to produce a minimal data representation that is simultaneously compressible, validatable, routable, and layerable. **Removing everything unnecessary left only the essential structure — and essential structure is universally useful.**
