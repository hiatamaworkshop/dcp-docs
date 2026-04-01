# Shadow — Output ($O)

> Part of the [Shadow Index](./shadow-index).

`$O` is the output format layer. Where `$P` controls access (who may see data), `$O` controls form (how data is shaped for the consumer). These are separate concerns.

```
$O  →  formatted DCP output  (field selection, reshaping, compression)
```

| Shadow | Controls | Question answered |
|--------|----------|-------------------|
| `$P` | access | who is allowed to see this? |
| `$O` | format | what shape should this data arrive in? |

An agent may have full access rights (`$P` grants it) and still receive `$O` — because the consumer needs a specific subset, a particular layout, or a compressed form.

## Starting point — formatted DCP output

Lightweight models can read DCP. Reading tests confirm this. `$O` does not exist because consumers cannot parse DCP — it exists because consumers may not need all fields, or may benefit from reshaping.

The simplest `$O` is a field selection: emit only the positions the consumer acts on, in DCP positional format.

```
["$O","log:v1", "ts", "level", "msg"]
  → 3 of 4 fields, same positional structure
  → consumer reads directly, no extra parsing
```

This is already useful: reduced token cost, focused signal, no change to the body or schema.

## Compressed form — bit flags + component vector

From field selection, `$O` extends to a higher-compression representation. Where standard `$O` selects and shapes fields, the flag+vector form collapses them into a minimum-byte representation — schema-grounded and near-reversible.

```
["$O","receptor:v1", 0x0024, [0.7, 0.2, 0.0, 0.4]]
                      ^flags  ^component vector
```

- **bit flags**: schema-grounded discrete labels — which dimensions are active (presence/absence)
- **component vector**: intensity per dimension — how strong each active component is

The two are complementary. Bit flags identify; the vector grades.

### Bit-flag compression

DCP positional arrays and bit flags share the same principle: schema-grounded, position-anchored, independent of the consumer's ability to infer meaning. Bit flags are DCP at maximum compression density.

```
DCP positional array  →  bit flag encoding  →  weight-bearing transmission  →  semantic restoration
```

A DCP row with N semantic fields can be projected to a bit flag when:
- Field values are discrete or classifiable
- Consumer needs state, not content
- Transmission budget is constrained (high-frequency streams, minimal agents)

**Example — `log:v1` row → bit flag + vector:**

```
Schema: log:v1
  position 0: ts       (iso8601 timestamp)
  position 1: level    (enum: ERROR=1, WARN=2, INFO=3)
  position 2: svc      (string identifier)
  position 3: msg      (free text)

Bit flag schema (log:v1 $O definition):
  bit0 = is_error    (level == ERROR)
  bit1 = is_warn     (level == WARN)
  bit2 = is_gateway  (svc == "gateway")

Vector schema:
  dim0 = recency     (derived from ts, normalized 0.0–1.0)
  dim1 = severity    (ERROR→1.0, WARN→0.5, INFO→0.0)

Input (DCP full):
  ["$S","log:v1",4,"ts","level","svc","msg"]
  ["2026-03-29T12:00:00Z","ERROR","gateway","connection refused"]

Derivation:
  bit0 (is_error)   : level == ERROR  → 1
  bit1 (is_warn)    : level == WARN   → 0
  bit2 (is_gateway) : svc == gateway  → 1
  flags = 0b00000101 = 0x05

  dim0 (recency)    : ts within current window → 0.9
  dim1 (severity)   : ERROR → 1.0
  vector = [0.9, 1.0]

Output ($O):
  ["$O","log:v1", 0x05, [0.9, 1.0]]

Restoration (schema-grounded):
  0x05 → bit0=1, bit2=1 → is_error, is_gateway
  [0.9, 1.0] → recency=high, severity=ERROR
  → deterministic, no ambiguity
```

### Gradient expression

Binary bit flags express on/off. Adding a component vector introduces intensity:

| Form | Expression | Cost |
|------|-----------|------|
| bit flag only | binary (present/absent) | 2 bytes |
| bit flag + scalar | intensity (0.0–1.0) | 6 bytes |
| bit flag + $ST weight | time-averaged intensity | 6 bytes + history |

The same 16 bits express progressively richer state depending on what accompanies them.

### Reversibility

`$O` bit flag + vector form is near-reversible — unlike NL semantic compression which is irreversible:

```
DCP full:               reversible (positional array ↔ field names)
NL semantic:            irreversible (meaning degrades on compression)
$O bit flag + vector:   near-reversible (schema-grounded, deterministic)
```

Conditions for near-reversibility:
- Bit positions defined by schema (fixed meaning, not inferred)
- Vector components derived from numeric computation, not LLM output
- Consumer references the same schema

When these hold, the compressed form restores deterministically. The schema is the meaning-anchor. Without it, any numeric value is ungrounded.

## Derivation pipeline

```
$ST (batch window observations)
  → Tag Shadow computation: component addition per semantic dimension
  → $O emission: bit flags + intensity vector

Consumer:
  → reads bit flags → identifies active dimensions (role-filtered)
  → reads vector → reads intensity of relevant components
```

See [Shadow — Stats ($ST)](./shadow-stats) for the derivation rules.

## Role as perceptual filter

When `$O` is in flag+vector form, an agent's role determines which bit dimensions it attends to:

```
role:security_monitor  → monitors bit0 (error_state), bit4 (confidence_low)
role:flow_tracker      → monitors bit2 (seeking_active), bit3 (flow_active)
role:fatigue_sensor    → monitors bit5 (fatigue_high)
```

The bit flag stream is identical for all agents. Role creates selective sensitivity — the agent's narrow scope becomes a feature, not a limitation.

No format branching in the stream. `$O` is the projection layer — from full DCP field selection down to bit flags, one shadow covers the range.

## Traceability

`$O` is the boundary format for agent inference audit. The same format in, same format out — both schema-grounded. The LLM inference in between is opaque, but the boundary is observable:

```
$O (input)  → [agent_type inference] → $O (output)
  ^recordable                              ^recordable
```

Expected distribution (from known `agent_type` sensitivities) × actual output → deviation score. Large deviation flags anomalous behavior without requiring access to agent internals.

Full reversibility of LLM inference is not achievable. But the minimum viable audit trail for multi-agent pipelines is: what state the agent received, what it emitted, when, as what role. Post-hoc failure analysis becomes possible — narrow to `agent_type × input_flags`, observe deviation pattern, adjust routing or schema.

See [Shadow — Stats ($ST)](./shadow-stats) for how `$ST` aggregates these records into stream health signals.