# Multi-Level Shadow Index

## Why Schema Management Matters

DCP's [specification](./specification) states that a high-capability AI agent only needs to see the schema **once** — after that, bare positional arrays are sufficient. The schema becomes zero-cost overhead.

But this raises a practical question: **how does the system know whether the consumer still remembers the schema?**

- A frontier model (Opus, Sonnet) retains the mapping reliably within a session. Schema can be sent once and discarded.
- A mid-range model may lose track after many intervening messages. It needs periodic reminders.
- A lightweight model (≤4B) may fail to map positions correctly even with the schema present — it needs inline field hints or key-value fallback.

The system cannot ask the agent "do you remember the schema?" — it must **observe and adapt**. This is what schema management solves: dynamically choosing how much schema information to attach to each data delivery, based on the consumer's demonstrated capability.

## The 5-Level Density Spectrum

Each element in the `$S` header serves a different audience:

| Element | Purpose | Who needs it |
|---------|---------|-------------|
| `"$S"` | Protocol marker | System parsers only |
| `"schema:v1"` | Schema identifier (versioned) | Multi-schema sessions |
| `5` | Field count | Parsers only |
| Field names | Data interpretation | **Everyone** |

**Field names are the only element all consumers need.** Everything else is optional infrastructure for more capable agents.

This insight produces a 5-level spectrum:

| Level | Name | What's Included | Example | Cost |
|-------|------|----------------|---------|------|
| **L0** | Fields Only | Field names + data | `["source","page","section","score"]` | ~10 tokens |
| **L1** | With Schema ID | `$S` + ID + field names | `["$S","rag:v1","source","page","section","score"]` | ~15 tokens |
| **L2** | Full Protocol | `$S` + ID + count + fields | `["$S","rag:v1",4,"source","page","section","score"]` | ~20 tokens |
| **L3** | Full Schema | Complete schema definition | `{"$dcp":"schema","id":"rag:v1","fields":[...],"types":{...}}` | ~80+ tokens |
| **L4** | NL Fallback | Natural language key-value | `source: docs/auth.md, page: 12, section: JWT Config` | Unlimited |

L0–L3 all use positional arrays for data rows. Only L4 switches to key-value text.

## Shadow Level Selection

Shadow level selection has two modes:

**Adaptive (agent-profiled):** The [Gateway](./schema-driven-encoder) observes per-agent DCP compliance and adjusts density automatically. High accuracy → less overhead, low accuracy → more hints. See [Agent Profile](./agent-profile) for the feedback loop.

**Fixed (system-designer's choice):** The system designer sets a static policy — e.g., "always L2", "L0 with full schema every 10th interaction", "L3 on first contact, then L1". This mode exists for predictability: when the designer knows the consumer's capability or wants to guarantee schema visibility at a fixed cadence.

Both modes use the same encoder — it receives `shadow_level` as an argument and formats accordingly. The encoder never decides density.

### Decision Logic

| Agent State | Shadow Level | Rationale |
|-------------|:----------:|-----------|
| New agent, never seen | L3 | Full schema for first contact |
| Seen schema, low accuracy | L2 | Protocol structure may help parsing |
| Moderate accuracy | L1 | Schema ID for multi-schema disambiguation |
| High accuracy, single schema | L0 | Fields only — minimum overhead |
| High accuracy, multi-schema | L2 | Needs schema ID + field count for switching |
| Non-DCP consumer | L4 | NL fallback, last resort |

### Empirical Basis

First, a critical baseline: **DCP positional arrays are as readable as JSON objects for LLMs.** Format comparison testing (same data, same questions, 3 formats) shows no accuracy difference:

| Model | Task | NL | JSON | DCP |
|-------|------|:-:|:-:|:-:|
| phi3:mini | field_lookup | 3/3 | 3/3 | 3/3 |
| phi3:mini | count_filter | 3/3 | 3/3 | 3/3 |
| gemma2:2b | field_lookup | 3/3 | 3/3 | 3/3 |
| llama3.2:1b | field_lookup | 3/3 | 3/3 | 3/3 |
| llama3.2:1b | count_filter | 3/3 | 3/3 | 3/3 |

When a model fails, it fails across all formats equally — format is not the bottleneck, model capability is. **DCP costs fewer tokens than JSON at no accuracy penalty.** See [Format Comparison](/research/format-comparison) for details.

Given that DCP ≈ JSON in accuracy, the question becomes: which DCP density level works best? Shadow level testing (3 models × 3 tasks × 3 levels × 3 runs):

| Model | L0 (fields only) | L2 (full $S) | L4 (NL) |
|-------|:-----------:|:------------:|:-------:|
| **phi3:mini (3.8B)** | **9/9** | 6/9 | 6/9 |
| gemma2:2b | 3/9 | **6/9** | 3/9 |
| llama3.2:1b | **6/9** | 3/9 | 6/9 |

Key findings:

- **L0 is optimal for most lightweight models.** Protocol information is noise at ≤4B.
- **phi3:mini is the practical floor** — 9/9 on L0 across all task types.
- **L4 (NL) offers no advantage over L0.** It is a fallback, not an optimization.
- **Model-specific variance exists** — gemma2 prefers L2, others prefer L0.

See [Research: Lightweight LLM Compatibility](/research/lightweight-llm) for full test data.

## From Delivery Mode to Task Access Level

The shadow index was designed to optimize data delivery cost. But the data it collects — per-agent schema comprehension accuracy — turns out to measure something more general.

Shadow level approximates cognitive level approximates task aptitude:

- An agent that processes L0 DCP reliably → capable of complex structured tasks
- An agent that requires L3 or L4 → should receive simpler, well-guided tasks

DCP compliance rate is a **necessary condition** for task capability, not a sufficient one. An agent that can't read DCP can't handle complex structured tasks — but reading DCP doesn't guarantee task competence. Task-specific performance must be observed separately and combined with DCP compliance for allocation decisions.

### Task Pooling

In a multi-agent system, tasks can be pooled by required access level:

| Queue | Required Level | Task Type |
|-------|:-------------:|-----------|
| **L0 pool** | High competence | Complex multi-step reasoning, cross-domain synthesis |
| **L1 pool** | Moderate competence | Structured extraction, template-following |
| **L2 pool** | Basic competence | Simple lookup, classification, single-field tasks |

Task management is primarily mathematical — scoring and thresholds. The brain AI's role is child-agent communication and dialogue, not task queue management. Task pooling auto-manages via EMA + thresholds; brain AI supports only boundary cases.

### Design Principles

- **Single metric, dual value** — DCP compliance rate drives both format selection and task allocation
- **Automatic promotion/demotion** — the math is solvable, no human judgment needed
- **Management cost ≈ zero** — agent capability assessment is a side effect of normal data delivery
- **No self-report** — capability is observed, not declared
- **Field names are the universal base** — everything else is optional infrastructure