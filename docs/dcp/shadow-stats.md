# Shadow — Stats ($ST)

> Part of the [Shadow Index](./shadow-index).

`$ST` is the observation shadow. Where `$V` checks individual rows, `$ST` records the aggregate — pass rates, field distributions, running counts — as a first-class shadow layer.

```
$ST  →  DCP + statistics  (aggregated observation)
```

## Form

`$ST` is positional like all shadows. Fields are defined per schema:

```
["$ST","log:v1", pass_count, fail_count, sample_n, dominant_value]
["$ST","log:v1", 9990, 10, 1000, "ERROR"]
```

`$ST` rows are emitted per batch or per window, not per data row. It is a summary over a range of body rows — ephemeral by nature.

Each position in `$ST` maps to a metric about the corresponding position in the body: pass rate for field 0, enum distribution for field 1, length average for field 3.

## Why $ST exists

Before `$ST`, in-memory accumulation was ad hoc: pick a dict, pick a counter, invent the shape at the point of need. `$ST` resolves this — when in-memory aggregation is needed, there is now a schema-grounded form for it.

`$ST` sits after `$V` in the natural order: validate first, then observe what passed. Combined with `$P`, the stats output itself can be visibility-controlled — aggregate metrics visible to ops, hidden from workers.

## $ST → low-dimensional instruction vector

`$ST` batch observations drive weight derivation for the bit-flag layer. The derivation pipeline produces a **low-dimensional instruction vector** — a schema-grounded, compact representation of batch character.

```
$ST window:
  pass_rate=0.97, fail_count=3, dominant="ERROR", sample_n=1000
  ↓ component addition per semantic dimension
  stream_health  = f(pass_rate, fail_count)     → 0.94
  anomaly_signal = f(fail_count, dominant)       → 0.12
  volume_signal  = f(sample_n, window_size)      → 0.71
  ↓
bit flags: stream_health_flags (schema-defined bit positions)
vector:    [0.94, 0.12, 0.71, ...]

→ ["$O","log:v1", 0x0081, [0.94, 0.12, 0.71]]
```

This is the **batch character label** — what kind of data this batch is, expressed in minimum bytes. A phi-agent reading this knows the batch's dominant properties without parsing a single body row.

### Derivation rules

Component addition is schema-specific. Each schema defines which `$ST` fields map to which vector dimensions:

```
schema: log:v1
  dimension 0 (stream_health):  $ST.pass_rate × 0.7, $ST.fail_count × -0.3
  dimension 1 (anomaly_signal): $ST.dominant == "ERROR" → 1.0, "WARN" → 0.5, else → 0.0
  dimension 2 (volume):         $ST.sample_n / window_expected
```

Rules are external to the bit-flag layer — defined in the schema registry, executed by the Tag Shadow computation step. The layer receives the result, not the rules.

## Traceability — agent inference audit

`$ST` aggregates agent trace records over windows. Anomaly rates per agent type become first-class stream health signals, fed back into the pipeline.

The trace record format:

```
[agent_type, input_flags, input_vector, output_flags, timestamp]
```

| Field | Content | Source |
|-------|---------|--------|
| `agent_type` | role identifier (e.g. `phi:security`, `high-cap:v2`) | agent metadata |
| `input_flags` | `$O` bit flags received | $O shadow |
| `input_vector` | `$O` component vector received | $O shadow |
| `output_flags` | agent's output expressed as bit flags | $O encoding of output |
| `timestamp` | emission time | stream |

`$ST` collects these over a window → deviation rates per `agent_type` → stream health flags → next `$O` emission carries updated health signal.

See [Shadow — Output ($O)](./shadow-output) for the consumption side.