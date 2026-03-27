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
