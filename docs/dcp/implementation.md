# Implementation Helpers

::: info
These are reference implementations distributed as part of the DCP package ([dcp-rag](https://github.com/hiatamaworkshop/dcp-rag)). They are not part of the DCP specification.
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
- **Mapping paths** via auto-binding (same-name fields need no manual mapping)

## Shadow Level Support

The encoder accepts a `shadow_level` parameter that controls header density. The encoder does not decide the level — the [shadow index](./shadow-index) decides based on the consuming agent's observed capability.

| Level | Header Output | Use Case |
|-------|--------------|----------|
| **L0** | `["source","page","section","score"]` | Lightweight agents (≤4B), single schema |
| **L1** | `["$S","rag:v1"]` | Schema ID switch — standard for capable agents |
| **L2** | `["$S","rag:v1","source","page","section","score"]` | Schema ID + field names (polite reminder) |
| **L3** | `{"$dcp":"schema","id":"rag:v1","fields":[...],"types":{...}}` | First contact, full definition |
| **L4** | `source: docs/auth.md, page: 12, score: 0.92` | NL fallback, last resort |

Data rows are identical across L0–L3 (positional arrays). Only L4 switches to key-value text.

## Native Operations

::: warning Future Direction
Native operations describe where DCP's positional structure naturally leads — processing data in the same format it's delivered. This is a design exploration, not a current specification. Implementation depends on multi-agent pipeline maturity.
:::

DCP's positional arrays are already a complete data representation. Every operation that structured data supports — filtering, projection, sorting, aggregation, joining — can be performed directly on positional arrays without decoding.

```
Conventional:  DCP stream → decode to JSON → process → encode to DCP → deliver
Native:        DCP stream → process (position-based) → deliver
```

### Primitive Operations

Seven operations cover the relational algebra on positional arrays. Each operates on DCP streams and produces DCP streams.

**filter** — Select rows by positional condition. Schema unchanged.

```
filter(.[2] >= 400):
  ["$S","api-response:v1","endpoint","method","status","latency_ms"]
  ["/v1/auth","POST",500,95]
```

**project** — Select a subset of positions. `$S` header rewritten.

```
project(0, 3):
  ["$S","api-response:v1","endpoint","latency_ms"]
  ["/v1/users",42]
```

**sort** — Reorder rows by position. Schema unchanged.

**agg** — Group by position, apply aggregates. Produces a new schema.

```
group_by(.[1]).agg(count, avg(.[3])):
  ["$S","api-response-agg:v1","method","count","avg_latency_ms"]
  ["GET",2,177]
```

**join** — Combine two DCP streams by matching positions. Merged schema.

```
join(A.[0] == B.[0]):
  ["$S","api-response-owned:v1","endpoint","method","status","latency_ms","team"]
  ["/v1/users","GET",200,42,"platform"]
```

**reshape** — Map positions from one schema to another. Explicit position-to-position mapping.

**split** — Partition a stream into multiple outputs by condition. Routing primitive for distributing subsets to child agents at appropriate shadow levels.

### Composition

Primitives compose into pipelines. Each operation takes DCP in and produces DCP out.

```
input
  | filter(.[2] >= 400)
  | project(0, 2, 3)
  | sort(.[2] desc)
  | split(.[2] > 500 → critical, _ → warning)
```

| Operation | Schema Effect |
|-----------|--------------|
| **filter** | Unchanged |
| **project** | Field subset |
| **sort** | Unchanged |
| **agg** | New schema (derived) |
| **join** | Merged schema |
| **reshape** | Target schema |
| **split** | Unchanged (per branch) |

The `$S` header is rewritten at each stage. Schema identity is always current. Every operation takes DCP and returns DCP — closed under composition, no intermediate format.
