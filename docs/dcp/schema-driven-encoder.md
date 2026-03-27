# Schema-Driven Encoder

## Why Encoders Exist

DCP's primary direction is **system → AI**. To deliver data in DCP format, the system should encode it into positional arrays before passing it to the LLM.

This is where the encoder sits — at the boundary where structured data enters the LLM context window:

```
RAG pipeline example:

  User query
    → Vector search (Pinecone, Qdrant, ...)
    → Reranker / filter / compressor
    → [★ DCP Encoder ★]              ← here
    → LLM context window

  Before encoder:
    { "source": "docs/auth.md", "page": 12, "section": "JWT Config", "score": 0.92 }
    { "source": "docs/api.md", "page": 5, "section": "Rate Limiting", "score": 0.87 }

  After encoder:
    ["$S","rag-chunk-meta:v1",4,"source","page","section","score"]
    ["docs/auth.md",12,"JWT Config",0.92]
    ["docs/api.md",5,"Rate Limiting",0.87]
```

The encoder strips keys, applies positional ordering, and generates the `$S` header. Upstream stages (search, rerank, filter) continue to work with the original data — DCP is applied only at the LLM boundary.

This pattern applies beyond RAG:

```
Logs → LLM:     log entries  → encoder → positional arrays → LLM analysis
API → LLM:      HTTP metrics → encoder → positional arrays → LLM monitoring
Internal → LLM: system state → encoder → positional arrays → LLM reasoning
```

Any structured data entering an LLM context window benefits from encoding.

## Schema Drives the Encoder

The central principle: **the schema defines field order, the encoder reads it**. No domain knowledge in the encoder code.

```
Schema JSON → field order → encoder resolves positions → positional array

schema("rag-chunk-meta:v1") → [source, page, section, score, chunk_index]
schema("log-entry:v1")      → [level, service, timestamp, error_code]
schema("api-response:v1")   → [endpoint, method, status, latency_ms]
```

Add a new data type = add a JSON file. No code changes.

```
Hardcoded:
  rows.push(["error", "auth", 1711284600, "E_TIMEOUT"])   // log-specific code
  → change field order = modify all code
  → new schema = write new formatter

Schema-driven:
  encoder = DcpEncoder(schema.load("log-entry:v1"), mapping)
  encoder.encode(data)
  → change field order = edit JSON file
  → new schema = add JSON file
```

**New data types become configuration, not programming.**

See [Implementation Helpers](./implementation) for reference implementations (schema generation, shadow level support).

For output direction (using shadow index as output constraint), see [Shadow Index: Output Direction](./shadow-index#output-direction-shadow-index-as-controller).