# Shadow — Output ($O)

> Part of the [Shadow Index](./shadow-index).

`$O` is the format adaptation layer. Where `$P` controls access (who may see data), `$O` controls form (who can consume it). These are separate concerns.

```
$O  →  DCP + output  (format conversion for capability-limited consumers)
```

| Shadow | Controls | Question answered |
|--------|----------|-------------------|
| `$P` | access | who is allowed to see this? |
| `$O` | format | who has the capability to parse this? |

An agent may have full access rights (`$P` grants it) but lack the ability to parse DCP protocol — `$O` serves it regardless.

## Form

```
["$O","receptor:v1", 0x0024, [0.7, 0.2, 0.0, 0.4]]
                      ^flags  ^component vector
```

- **bit flags**: schema-grounded discrete labels — which dimensions are active (presence/absence)
- **component vector**: intensity per dimension — how strong each active component is

The two are complementary. Bit flags identify; the vector grades.

## Bit-flag compression

DCP positional arrays and bit flags share the same principle: schema-grounded, position-anchored, independent of the consumer's ability to infer meaning. Bit flags are DCP at maximum compression density.

```
DCP positional array  →  bit flag encoding  →  weight-bearing transmission  →  semantic restoration
```

A DCP row with N semantic fields can be projected to a bit flag when:
- Field values are discrete or classifiable
- Consumer needs state, not content
- Transmission budget is constrained (lightweight agents, high-frequency streams)

```
DCP (full):
  ["$S","receptor:v1","state","flags","intensity"]
  ["stuck", 0x0024, 0.7]

$O (compressed):
  ["$O","receptor:v1", 0x0024, [0.7]]
  → same semantic content, ~90% size reduction
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

`$O` is near-reversible — unlike NL semantic compression which is irreversible:

```
DCP full:               reversible (positional array ↔ field names)
NL semantic:            irreversible (meaning degrades on compression)
$O bit flag + vector:   near-reversible (schema-grounded, deterministic)
```

Conditions for near-reversibility:
- Bit positions defined by schema (fixed meaning, not inferred)
- Vector components derived from numeric computation, not LLM output
- Consumer references the same schema

When these hold, the compressed form restores deterministically. the schema is the meaning-anchor. Without it, any numeric value is ungrounded.

## Derivation pipeline

```
$ST (batch window observations)
  → Tag Shadow computation: component addition per semantic dimension
  → $O emission: bit flags + intensity vector

Consumer (phi-agent or DCP-limited agent):
  → reads bit flags → identifies active dimensions (role-filtered)
  → reads vector → reads intensity of relevant components
  → no DCP protocol parsing required
```

See [Shadow — Stats ($ST)](./shadow-stats) for the derivation rules.

## LightWeight-Model compatibility

Lightweight agents cannot parse full DCP protocol. `$O` is the natural delivery format:

```
High-capability AI:  receives full DCP ($S/$V/$P shadows intact)
agent (role A):  receives $O: reads bit0, bit1, bit4 only (role-defined)
agent (role B):  receives $O: reads bit2, bit3 only
DCP-limited agent:   receives $O: vector form only
```

No format branching in the stream. `$O` is the projection layer that makes one stream universally consumable.

### Role as perceptual filter

An agent's role determines which bit dimensions it attends to:

```
role:security_monitor  → monitors bit0 (error_state), bit4 (confidence_low)
role:flow_tracker      → monitors bit2 (seeking_active), bit3 (flow_active)
role:fatigue_sensor    → monitors bit5 (fatigue_high)
```

The bit flag stream is identical for all agents. Role creates selective sensitivity — the lightweight agent's narrow interpretability becomes a feature, not a limitation.

## Traceability

`$O` is the boundary format for agent inference audit. The same format in, same format out — both schema-grounded bit flags. The LLM inference in between is opaque, but the boundary is observable:

```
$O (input)  → [agent_type inference] → $O (output)
  ^recordable                              ^recordable
```

Expected distribution (from known `agent_type` sensitivities) × actual output → deviation score. Large deviation flags anomalous behavior without requiring access to agent internals.

Full reversibility of LLM inference is not achievable. But the minimum viable audit trail for multi-agent pipelines is: what state the agent received, what it emitted, when, as what role. Post-hoc failure analysis becomes possible — narrow to `agent_type × input_flags`, observe deviation pattern, adjust routing or schema.

See [Shadow — Stats ($ST)](./shadow-stats) for how `$ST` aggregates these records into stream health signals.