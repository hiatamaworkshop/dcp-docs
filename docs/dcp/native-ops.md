# Native Operations — DCP as a Processing Format

> DCP was designed to deliver data. It turns out the same structure is ready to process it.

## From Wire Format to Working Format

DCP's specification defines a delivery convention: encode at the system boundary, deliver positional arrays, decode on arrival. The implicit assumption is that processing happens in some other representation — JSON objects, language-native structs, database rows.

But DCP's positional arrays are already a complete data representation. A schema declares field names, types, enums, and order. Rows conform to that schema by position. Every operation that structured data supports — filtering, projection, sorting, aggregation, joining — can be performed directly on positional arrays without decoding.

```
Conventional pipeline:
  DCP stream → decode to JSON → process → encode to DCP → deliver

Native pipeline:
  DCP stream → process (position-based) → deliver
```

The decode/encode cycle exists because tools assume key-value data. If the processor understands positional schemas, the cycle is unnecessary.

## Who Processes Natively

Not humans. Not shell scripts. **Brain AIs** — the orchestrator and coordinator agents that will manage multi-agent pipelines.

A high-capability orchestrator AI holds the schema in context (L0 is sufficient). It can reason about positional data without key names on every record. When it routes, filters, or reshapes data between child agents, there is no reason to inflate DCP into JSON, process it, and deflate it back.

```
Human query
  → Brain AI
    → native filter + split on DCP stream
      → Agent A (L0) ← subset, no transformation
      → Agent B (L2) ← subset + schema hint
    → merge + reshape results (still DCP)
  → Response
```

The brain AI operates on DCP the way a database engine operates on columnar storage — the internal representation **is** the processing representation.

## Primitive Operations

Seven operations cover the relational algebra on positional arrays. Each operates on DCP streams and produces DCP streams.

### filter — Row Selection

Select rows where a positional condition holds. Schema is unchanged; row count decreases.

```
Input:
  ["$S","api-response:v1",4,"endpoint","method","status","latency_ms"]
  ["/v1/users","GET",200,42]
  ["/v1/orders","POST",201,187]
  ["/v1/auth","POST",500,95]
  ["/v1/search","GET",200,312]

filter(.[2] >= 400):
  ["$S","api-response:v1",4,"endpoint","method","status","latency_ms"]
  ["/v1/auth","POST",500,95]
```

No key lookup. Position 2 is `status` — the schema says so. The filter is an array index comparison.

### project — Column Selection

Select a subset of positions. Produces a new schema with fewer fields.

```
project(0, 3):
  ["$S","api-response:v1",2,"endpoint","latency_ms"]
  ["/v1/users",42]
  ["/v1/orders",187]
  ["/v1/auth",95]
  ["/v1/search",312]
```

The `$S` header is rewritten to reflect the new field set. Field count updates automatically. This is `SELECT endpoint, latency_ms FROM ...` — no intermediate object construction.

### sort — Positional Ordering

Reorder rows by one or more positions.

```
sort(.[3] desc):
  ["$S","api-response:v1",4,"endpoint","method","status","latency_ms"]
  ["/v1/search","GET",200,312]
  ["/v1/orders","POST",201,187]
  ["/v1/auth","POST",500,95]
  ["/v1/users","GET",200,42]
```

### agg — Aggregation

Group by position, apply aggregate functions to other positions.

```
group_by(.[1]).agg(count, avg(.[3])):
  ["$S","api-response-agg:v1",3,"method","count","avg_latency_ms"]
  ["GET",2,177]
  ["POST",2,141]
```

Aggregation produces a **new schema**. The output schema is derived from the input schema plus the aggregation specification. Schema identity changes (`api-response:v1` → `api-response-agg:v1`) because the structure changed.

### join — Cross-Schema Combination

Combine two DCP streams by matching positions.

```
Stream A — api-response:v1:
  ["$S","api-response:v1",4,"endpoint","method","status","latency_ms"]
  ["/v1/users","GET",200,42]
  ["/v1/auth","POST",500,95]

Stream B — endpoint-owner:v1:
  ["$S","endpoint-owner:v1",2,"endpoint","team"]
  ["/v1/users","platform"]
  ["/v1/auth","security"]

join(A.[0] == B.[0]):
  ["$S","api-response-owned:v1",5,"endpoint","method","status","latency_ms","team"]
  ["/v1/users","GET",200,42,"platform"]
  ["/v1/auth","POST",500,95,"security"]
```

Join produces a merged schema. Field positions are concatenated (minus the join key duplicate). The resulting schema is new — declared in the output `$S` header.

### reshape — Schema Transformation

Map positions from one schema to another. This is the operation that enables cross-domain data flow.

```
reshape(api-response:v1 → alert:v1, {0→0, 2→1, 3→2}):
  Input:  ["/v1/auth","POST",500,95]
  Output: ["/v1/auth",500,95]
  Schema: ["$S","alert:v1",3,"endpoint","status","latency_ms"]
```

Reshape is explicit position-to-position mapping. The brain AI knows both schemas and declares the mapping. No field name resolution at runtime.

### split — Conditional Routing

Partition a DCP stream into multiple output streams by condition. Each output retains the same schema (or a projected subset).

```
split(
  .[2] >= 400 → error_stream,
  .[3] > 200  → slow_stream,
  _           → normal_stream
):
  error_stream:  ["/v1/auth","POST",500,95]
  slow_stream:   ["/v1/search","GET",200,312]
  normal_stream: ["/v1/users","GET",200,42], ["/v1/orders","POST",201,187]
```

Split is the routing primitive. A brain AI uses this to distribute work to child agents — each receiving only the subset they need, in DCP, at the appropriate shadow level.

## Composition

Primitives compose into pipelines. Each operation takes DCP in and produces DCP out.

```
input
  | filter(.[2] >= 400)
  | project(0, 2, 3)
  | sort(.[2] desc)
  | split(.[2] > 500 → critical, _ → warning)
```

This is a pipeline, not a query language. Each stage is a function from DCP stream to DCP stream. The brain AI decides the pipeline; the operations execute it.

### Schema Propagation

Each operation knows how it transforms the schema:

| Operation | Schema Effect |
|-----------|--------------|
| **filter** | Unchanged |
| **project** | Field subset, count updates |
| **sort** | Unchanged |
| **agg** | New schema (derived) |
| **join** | Merged schema |
| **reshape** | Target schema |
| **split** | Unchanged (per branch) |

The `$S` header is rewritten at each stage. Schema identity is always current — no drift, no stale headers.

## Why Not Just Use SQL

The operations are intentionally isomorphic to relational algebra. The difference is not in what they compute, but in where they run and what they operate on:

- **No deserialization** — SQL engines parse input into internal row/column format. DCP rows *are* the internal format. Position-indexed arrays are the representation a columnar engine would construct anyway.
- **Schema-on-wire** — The `$S` header travels with the data. A SQL engine requires table definitions stored externally. DCP streams are self-contained.
- **AI-native consumer** — The output goes directly into an LLM context window. No result serialization step. The pipeline output is the prompt input.
- **Shadow level integration** — Split can adjust shadow level per output branch. A brain AI sends L0 to a capable child and L2 to a new one — same data, different density, in the same routing operation.

## Design Properties

- **Closed under composition** — Every operation takes DCP and returns DCP. Pipelines are chains, not trees with format conversions at each node.
- **Schema is always current** — The `$S` header is rewritten by each operation. There is no moment where schema and data are out of sync.
- **Position stability** — Within a single operation, positions don't shift. Across operations (project, reshape), the new schema declares the new positions. The mapping is explicit, never implicit.
- **No intermediate format** — The gap between "data at rest" and "data in processing" disappears. DCP is both.

## Relationship to Existing Components

Native operations extend, not replace, the existing DCP architecture:

```
specification          ← format definition
schema-driven-encoder  ← System → DCP (entry point)
native-ops             ← DCP → DCP (processing)     ★
shadow-index           ← density control (per delivery, including split outputs)
agent-profile          ← capability observation (unchanged)
validation             ← compliance feedback (applies to native op outputs too)
```

The encoder produces DCP. Native operations process it. The shadow index controls how it's delivered. The agent profile decides to whom. Each component retains its role — native operations fill the gap between encoding and delivery where processing used to require a format round-trip.