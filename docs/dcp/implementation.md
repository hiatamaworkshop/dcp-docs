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

## Header Density

The encoder accepts a `header_density` parameter (0–4) that controls how much schema context accompanies each batch. The encoder does not decide the level — the [shadow index](./shadow-index) decides based on the consuming agent's observed capability.

| Level | Header Output | Use Case |
|-------|--------------|----------|
| **L0** | `["source","page","section","score"]` | Lightweight agents (≤4B), single schema |
| **L1** | `["$S","rag:v1"]` | Schema ID switch — standard for capable agents |
| **L2** | `["$S","rag:v1","source","page","section","score"]` | Schema ID + field names (polite reminder) |
| **L3** | `{"$dcp":"schema","id":"rag:v1","fields":[...],"types":{...}}` | First contact, full definition |
| **L4** | `source: docs/auth.md, page: 12, score: 0.92` | NL fallback, last resort |

Data rows are identical across L0–L3 (positional arrays). Only L4 switches to key-value text.

## Native Operations

::: tip Design Note
This is not a specification — it's an observation about what DCP's structure makes possible.
:::

DCP's positional arrays don't need to be decoded into JSON objects for processing. Position is already meaning — filtering, projection, and routing work directly on array indices. The standard relational operations (filter, project, sort, join, aggregate) apply naturally.

```
["$S","api-response:v1","endpoint","method","status","latency_ms"]
["/v1/users","GET",200,42]
["/v1/orders","POST",201,187]
["/v1/auth","POST",500,95]

Position 2 is "status". Filter by .[2] >= 400 → ["/v1/auth","POST",500,95]
Project positions 0,3 → ["$S","api-response:v1","endpoint","latency_ms"] + ["/v1/users",42] ...
```

The decode/encode round-trip that key-value formats require is unnecessary when the processor understands positional schemas. This matters when DCP data passes through multiple processing stages — each stage operates on the same representation, closed under composition.

## Presets

Presets provide pre-built `FieldMapping` configurations for common data sources. Available in the `dcp-py` package.

### RAG / Vector DB

Schema: `rag-chunk-meta:v1` — fields: `source`, `page`, `section`, `score`, `chunk_index`

| Preset | Source |
|--------|--------|
| `pinecone` | Pinecone query results |
| `qdrant` | Qdrant search results |
| `weaviate` | Weaviate GraphQL results |
| `chroma` | Chroma query results |
| `milvus` | Milvus search results |

```python
from dcp_py.core.encoder import DcpEncoder
encoder = DcpEncoder.from_preset("pinecone")
```

### Structured Logs

Schema: `log-entry:v1` — fields: `ts`, `level`, `service`, `msg`

| Preset | Source |
|--------|--------|
| `cloudwatch` | AWS CloudWatch log events |
| `datadog` | Datadog log records |
| `loki` | Grafana Loki log streams |
| `generic` | Any flat log dict |

```python
from dcp_py.core.presets import get_log_preset
mapping = get_log_preset("cloudwatch")
```

### SQL / DataFrames

Schema: `sql-row-meta:v1` — fields: `db`, `table`, `row_num`, `query_ms`

| Preset | Source |
|--------|--------|
| `psycopg2` | psycopg2 cursor rows |
| `sqlalchemy` | SQLAlchemy result rows |
| `sqlite3` | sqlite3 cursor rows |
| `generic` | Any flat dict |

```python
from dcp_py.core.presets import get_sql_preset
mapping = get_sql_preset("psycopg2")
```
