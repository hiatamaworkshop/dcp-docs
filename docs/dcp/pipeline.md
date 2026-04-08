# Pipeline Control

DCP is a data format. But the shadow layers — `$V`, `$R`, `$ST` — form the substrate for something larger: a pipeline where AI controls the system without entering the data path.

## The core principle

**AI must never enter the data pipeline.**

Inference is slow and non-deterministic. The pipeline is fast and deterministic. Mixing them makes inference a bottleneck and breaks latency guarantees.

The solution is separation:

```
Data path:    source → Ingestor → Preprocessor → Gate ($V) → Router ($R) → consumers
                        ↑ synchronous, deterministic, microseconds

Control path: $ST → Bot → $I → Brain AI → PostBox → PipelineControl
                        ↑ asynchronous, probabilistic, seconds
```

Data flows continuously. The control layer observes, deliberates, and updates — without ever blocking a row.

## Layers

### Ingestor — source adapter

The Ingestor sits at the entry point of the pipeline. Its sole responsibility is to adapt any raw source into DCP packets — it is transport-agnostic and format-agnostic.

```
Raw source (HTTP POST / UDS socket / UDP datagram / Kafka / file …)
  ↓
Ingestor    ← convert to DCP packet format ($S header + fields)
  ↓
Preprocessor
```

The Ingestor does not validate, filter, or inspect content. It only converts the transport envelope into the internal DCP representation. Swapping HTTP for UDP requires replacing the Ingestor only — nothing downstream changes.

### Preprocessor — upstream normalization

The Preprocessor sits before the pipeline. It does not validate — it prepares.

```
Raw source (JSON, CSV, live feed)
  ↓
Preprocessor    ← field audit, type normalization, anomaly triage
  ↓
Pipeline        ← receives clean, schema-conformant data only
```

Three outcomes per record:

| Outcome | When | Effect |
|---------|------|--------|
| **Pass** | Record matches schema | Enters pipeline |
| **Drop** | Structurally corrupt | Discarded silently |
| **Quarantine** | Schema boundary case | Held for Brain AI review |

The pipeline itself never handles unknown fields, mixed types, or missing values. That is the Preprocessor's concern. This keeps the pipeline fast, stateless with respect to source quirks, and independently testable.

### Gate ($V) — in-pipeline validation

Inside the pipeline, the Gate applies `$V` shadows per row. Each row is judged independently:

```
PASS → MessagePool (batch queue)
FAIL → MessagePool (immediate queue) → escalation path
```

Gate does not route. Gate does not buffer. Gate judges and moves on.

`$V` shadows compile once at schema load — regex, enum sets, min/max bounds are fixed at construction. `validate()` is O(fields) with no heap allocation on the hot path.

### $ST — stream observation

The `$ST` shadow aggregates what the Gate sees: pass rates, fail counts, field distributions, per batch window.

```
["$ST","sensor:v1", 9990, 10, 1000, "ERROR"]
                    pass  fail total  dominant
```

`$ST` is the pipeline's signal to the outside world. It does not block the stream — it is emitted asynchronously after each window closes.

### Bot — lightweight analyzer

Between the fast pipeline and the slow Brain AI sits a Bot: a lightweight, rule-based signal interpreter.

```
$ST window
  ↓
[Weapon filters]   ← numeric thresholds on $ST metrics, 0ms
  ↓ score > threshold
[L-LLM]           ← single call: "what does this pattern signal?"
  ↓
$I packet          ← { schemaId, signal, severity } → ring buffer
```

A **Weapon** is a named, configurable `$ST` filter. Any weapon firing triggers the L-LLM call. The Bot perceives and labels — it does not make control decisions.

The L-LLM is called exactly once per trigger. Everything before it is deterministic arithmetic.

### Brain AI — control, not data

Brain AI reads `$I` packets from the ring buffer at its own pace. It evaluates patterns across schemas and time, then writes decisions to the PostBox.

```
$I pool (ring buffer)
  ↓
Brain AI           ← evaluates, decides
  ↓
PostBox            ← routing_update / throttle / stop / quarantine_approve
  ↓
PipelineControl    ← applies locally, next row onward
```

Brain AI never touches data. It never calls pipeline internals directly. It writes to the PostBox only — and the pipeline applies changes on its next cycle.

**What Brain AI may do:**

| Action | Effect |
|--------|--------|
| Update routing table (`$R`) | Changes which pipeline receives which schema, next row |
| Approve quarantine | Re-injects corrected record into Preprocessor |
| Reject quarantine | Drops the held record |
| Throttle schema | Limits records/sec for a schema |
| Stop schema | Halts flow for a schema |

**What Brain AI may not do:** row-level routing decisions, data transformation, direct pipeline calls.

### Quarantine — schema evolution feedback

Quarantine is not a dead-letter queue. It is the feedback loop entry point into schema evolution.

```
Preprocessor detects: type_mismatch / range_violation / unknown_field
  ↓
PostBox.pushQuarantine(pipelineId, { reason, record })
  ↓
Brain AI reviews     ← is this a bad record, or a signal the schema is stale?
  ↓
approve + correctedRecord → re-injected into Preprocessor
reject                    → silently dropped
```

A quarantined record is never silently lost. Brain AI decides whether it represents corruption or schema lag. When quarantine volume rises on a particular field, it signals that the schema needs updating — not that the data is wrong.

## Lazy switching

Brain AI decisions take effect on the **next row**, not the current one. The pipeline never pauses to wait for a decision.

```
Current routing:  sensor:v1 → pipeline-A
Brain decides:    sensor:v1 → pipeline-B
Effect:           next row after PostBox write
```

This is lazy switching — the pipeline runs with its current configuration until Brain AI updates it. If Brain AI is unavailable, the pipeline continues on its last known routing table. The control layer is advisory, not load-bearing.

## AI-to-AI communication

In a multi-agent setup, routing every exchange through a central point adds latency. Two lighter patterns:

**Edge pattern**: Each agent receives its schema-shadow upfront. Agents output constrained data directly to the next agent. Schema intelligence travels with the agent, not the infrastructure.

**Brain-managed pattern**: A Brain AI holds schema context and interprets child agent outputs — reformatting, validating, routing as part of its own reasoning. The brain *is* the gateway for its worker pool.

Both patterns are enabled by the shadow layers: `$R` for routing, `$O` for format projection, `$P` for access control. The data shape is declared in shadows; the plumbing does not need to know.

## Why this design

The separation of data path and control path is not an engineering preference. It is a consequence of the speed mismatch between inference and streaming.

At 1M rows/sec, a 500ms LLM call would drain 500,000 rows. Those rows cannot wait. The only viable architecture is one where the pipeline is self-sufficient by default and AI updates it asynchronously.

**The pipeline runs. AI watches. When AI acts, the pipeline adjusts — without stopping.**
