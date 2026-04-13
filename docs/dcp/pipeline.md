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

### $I Correlator — cross-schema grouping

When multiple Weapons fire within the same tick window, each produces an independent `$I` packet. Without grouping, Brain sees three separate signals and evaluates them in isolation. With a Correlator, those signals are recognized as facets of a single incident.

```
Weapon A fires → L-LLM → $I(schema=combat:v1,    signal=cluster,  entityId=player-1)
Weapon B fires → L-LLM → $I(schema=player_move:v1, signal=anomaly, entityId=player-1)
Weapon C fires → L-LLM → $I(schema=block_place:v1, signal=burst,   entityId=player-1)
  ↓
$I Correlator
  - ts proximity   → same 2s window
  - entityId match → same player
  - schema co-occurrence → combat + player_move + block_place
  ↓
$I group { groupId, packets: [A, B, C], correlationKeys: [entityId, window] }
  ↓
Brain: evaluates group as one incident — "multi-vector cheat behavior"
```

**Why this matters:**

1. **L-LLM cost** — three concurrent weapon fires become one grouped call instead of three independent calls.
2. **Brain decision quality** — `combat:v1` + `player_move:v1` co-firing on the same `entityId` in the same window is qualitatively different from either signal alone. Individual evaluation loses that signal; grouped evaluation captures it.

**Grouping keys (in priority order):**

| Key | Source | What it captures |
|-----|--------|-----------------|
| `ts` proximity | `$I.ts` | Same Brain tick window |
| `entityId` match | `$I.entityId` (optional field) | Same player or entity origin |
| `pipelineId` match | `$I.pipelineId` | Same processing path |
| schema co-occurrence | `$I.schemaId` set | Compound event pattern |

`entityId` is not currently part of the base `$I` packet — it must be added by the Weapon or sourced from the `$ST` record. Without it, the Correlator groups by window and schema co-occurrence only.

**Responsibility boundary:**

- Bot: perceives, labels, produces `$I` per schema. No cross-schema awareness.
- $I Correlator: groups `$I` packets by correlation keys, assigns `groupId`. No control decisions.
- Brain: evaluates groups (and ungrouped singles), writes to PostBox.

The Correlator sits between the ring buffer and Brain's `evaluate()` call. It is stateless within a tick — it sees the current window's `$I` pool and outputs groups. Brain remains the sole decision-maker.

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

## Shadow weight pattern — Brain optimal-value search

When Brain AI needs to find an optimal threshold (e.g. the tightest `$V` constraint that still maintains acceptable pass rate), it should not guess and apply — it should observe and confirm first.

The pattern uses the shadow layers as a dry-run environment:

```
Live stream
  ↓ $O inject + weight transform   (field values scaled, not routed elsewhere)
Shadow stream (virtual, same pipeline)
  ↓
$ST-O (shadow-only statistics window)
  ↓
Brain AI observes shadowStats
  ↓
Apply to live pipeline only when shadow confirms the outcome
```

**Why this matters**: Brain AI decisions (like `validationUpdate`) are irreversible within a tick — once applied, they affect every subsequent row. The shadow pattern converts a blind write into a confirmed write.

### Example — finding optimal damage.max

```typescript
// Brain receives both live and shadow $ST
const live   = input.stats["live"]["combat:v1"].passRate;
const shadow = input.stats["shadow-strict"]["combat:v1"].passRate;

if (live - shadow < 0.05) {
  // shadow-strict maintains nearly identical pass rate → safe to apply live
  return { validationUpdate: { damage: { max: strictMax } } };
}
// Shadow shows significant drop → hold, do not apply
return { rationale: "shadow pass_rate drop too large — holding $V update" };
```

### $O transform as the weight knob

`$O` is the mechanism that generates the shadow stream. By applying a numeric transform to a field before the shadow copy enters `$ST`, Brain AI can test multiple weight values in parallel:

```
$O transform: damage * 0.5  → shadow-w0.5  → $ST-O["shadow-w0.5"]
$O transform: damage * 0.75 → shadow-w0.75 → $ST-O["shadow-w0.75"]
$O transform: damage * 1.0  → shadow-w1.0  → $ST-O["shadow-w1.0"]  (baseline)
```

Brain reads all three $ST-O windows and selects the weight closest to the target pass rate. This is **safe experimentation inside the pipeline** — no data is rerouted, no live constraint changes until Brain confirms.

### Properties

| Property | Value |
|----------|-------|
| Data path impact | None — shadow stream is observational only |
| Brain role | Observes $ST-O, decides weight, writes `validationUpdate` once |
| Reversibility | Shadow transform is stateless — stop anytime |
| Latency | Shadow $ST-O available on next window close (same 2s tick as live $ST) |

This pattern preserves the core invariant: **LLM never enters the data path**. The shadow stream is computed by the pipeline itself; Brain AI reads the result and writes a single decision.

## Predictive Control Pattern — statistically grounded decisions

The shadow weight pattern extends naturally into predictive control: Brain AI runs multiple weight scenarios in parallel and identifies risk cases before they occur in the live stream.

```
Live stream (current state)
  ↓ $O transform — parallel scenarios
  ├── shadow-w1.0  (baseline)
  ├── shadow-w1.2  (optimistic: +20%)
  └── shadow-w1.5  (pessimistic: +50%)
       ↓ each passes through $V independently
  $ST-O per scenario
       ↓
  Brain: identifies which scenario crosses risk threshold
       ↓
  Preemptive $V or $R change — before the live stream reaches that state
```

Brain does not guess. It reads the $ST-O numbers and acts on them.

### Traceability — breaking the AI blackbox

Every Brain decision in this pattern traces back to observable statistics:

| Element | What it records |
|---------|----------------|
| `$O transform coefficient` | What assumption was made ("what if damage increases 50%") |
| `$ST-O value` | What the pipeline observed under that assumption |
| `Brain rationale` | Which number triggered the decision and why |
| `MappingLayer set()` | What changed, from what value, to what value |

These four together make every Brain action fully reproducible after the fact. Post-hoc analysis becomes: find the $ST-O observation → find the Brain rationale → find the MappingLayer diff.

**AI decisions are statistically grounded — every Brain action traces back to $ST-O observations, not model intuition.**

This is the key distinction from conventional AI monitoring, where the model's internal state is opaque and decisions cannot be audited without re-running inference. In DCP, the pipeline computes the evidence; the Brain reads it; the MappingLayer records it. The inference step is narrow and its inputs are fully visible.

### Example — preemptive combat $V tightening

```typescript
const baseline    = input.shadowStats["shadow-w1.0"]["combat:v1"].passRate;  // 0.98
const optimistic  = input.shadowStats["shadow-w1.2"]["combat:v1"].passRate;  // 0.81
const pessimistic = input.shadowStats["shadow-w1.5"]["combat:v1"].passRate;  // 0.61

// pessimistic scenario crosses combatCluster threshold (pass_rate < 0.80)
if (pessimistic < 0.80 && baseline > 0.90) {
  return {
    validationUpdate: { damage: { max: strictMax } },
    rationale: `preemptive $V tighten: shadow-w1.5 pass_rate=${pessimistic} < 0.80 threshold`,
  };
}
```

The rationale string is not decorative — it is the audit trail. When this decision is reviewed later, the exact $ST-O value that triggered it is recorded in the Brain output.

## Shadow Lifecycle — on-demand vs always-on

Shadow streams are not free: each active `$O` transform adds processing load proportional to the live throughput. The right deployment mode depends on cost tolerance and response latency requirements.

### Always-on (parallel multi-weight)

```
main pipeline ──$R──→ shadow-w1.0  (baseline)
                  ├──→ shadow-w1.2  (+20%)
                  └──→ shadow-w1.5  (+50%)
```

Brain can read all three $ST-O windows at any moment with zero startup lag. Appropriate when **response speed outweighs processing cost** — financial streams, security monitoring, latency-critical pipelines. The tradeoff: every row is processed N times, where N is the number of active shadows.

### On-demand (Brain-triggered)

```
Normal:        main pipeline only
$ST trend:     Brain detects pass_rate slope declining
               → Brain writes: mountShadow("shadow-w1.5", { transform: { damage: 1.5 } })
+2s (1 tick):  $ST-O["shadow-w1.5"] available
               → Brain reads, decides, writes validationUpdate
               → Brain writes: unmountShadow("shadow-w1.5")
```

Shadow lifetime: **mount → 1 window → read → unmount**. The shadow exists only long enough to produce one confirmed observation. For most streaming workloads this is sufficient — the Brain acts before the live stream reaches the projected state.

### Why replay is not the right tool here

Replay reprocesses historical data. If traffic distribution has shifted since the recording, replay-derived weights reflect the past, not the present. On-demand shadows run against the live stream — they track current distribution automatically. Replay belongs in schema design and offline baseline calibration, not in the live control loop.

### Choosing a mode

| Condition | Mode |
|-----------|------|
| Throughput headroom available, fast response required | Always-on |
| High throughput, cost-sensitive | On-demand, triggered by $ST slope |
| Schema design / offline tuning | Replay (not a shadow) |

The on-demand pattern is the default recommendation. Always-on is an operational choice made when the cost is acceptable and the latency budget demands it — not a requirement of the architecture.
