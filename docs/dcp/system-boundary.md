# System Boundary Protocol

> Far-future design note. Not implemented. Not scheduled.
>
> Within a closed system, the shadow index observes all consumers and adapts top-down.
> This document addresses only the case where DCP data crosses a system boundary.

## The Problem

Inside a closed system, the shadow index knows every consumer — their capability level,
schema familiarity, and field requirements. No negotiation is needed. The system decides.

When data crosses a system boundary, this breaks down. System B has its own shadow index,
its own consumers, its own constraints. System A knows none of this.

```
System A                         System B
[shadow index]                   [shadow index]
  knows its consumers              knows its consumers
  knows nothing about B            knows nothing about A
```

Schema must be established before data flows. That requires a handshake.

## Handshake Protocol

Three verbs cover the boundary crossing:

| Marker | Role | Direction |
|--------|------|-----------|
| `$S!` | Schema declaration — "I will send schema X" | A → B |
| `$S+` | Schema request — "send me the full definition of X" | B → A |
| `$SV` | Schema validation — "accepted / rejected" | B → A |

### Normal flow

```
A: ["$S!","sensor-window:v1"]          ← declares intent
B: ["$S+","sensor-window:v1"]          ← requests full definition (first contact)
A: {"$dcp":"schema","id":"sensor-window:v1",...}  ← sends schema
B: ["$SV","sensor-window:v1","ok"]     ← confirms acceptance
A: [data rows...]                      ← stream begins
```

On subsequent connections, if B already holds the schema:

```
A: ["$S!","sensor-window:v1"]
B: ["$SV","sensor-window:v1","ok"]     ← skips $S+ if schema is known
A: [data rows...]
```

## What This Is Not

- Not a capability negotiation. Capability assessment (header density, field subset)
  is the shadow index's job within each closed system.
- Not a field negotiation. B accepts or rejects the schema as declared. Field filtering
  is handled by `$P` (permission shadow) and `$O` (output shadow) after acceptance.
- Not a general-purpose RPC mechanism. These three markers exist solely to establish
  schema agreement at a boundary. Nothing more.

## On `$S?`

An earlier formulation included `$S?` — "what schema is this?" — as a query verb.
This is an error-recovery path: data arrived without a schema declaration.

In correct usage, `$S!` always precedes data. `$S?` should not be needed.
If it is needed, something upstream failed. It belongs in error handling, not
in the normal boundary protocol.

## Design Note

Within a closed system: shadow index, top-down, no handshake.
Across a system boundary: `$S!` → `$S+` → `$SV`, then data flows.

The boundary is the only place where explicit schema agreement is necessary.
Everywhere else, the system already knows.