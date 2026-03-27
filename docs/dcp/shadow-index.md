# Multi-Level Shadow Index

The shadow index is DCP's unified mechanism for both **input delivery** and **output constraint**. The same schema presentation that tells an AI "here's what this data means" also tells it "respond in this shape." This dual role is not a design coincidence — it is a consequence of DCP's constraint-first approach. Because DCP defines strict schema structure upfront, the same tool naturally applies in both directions.

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
| **L0** | Fields Only | Field names only | `["source","page","section","score"]` | ~10 tokens |
| **L1** | Schema ID | `$S` + ID only | `["$S","rag:v1"]` | ~5 tokens |
| **L2** | Schema ID + Fields | `$S` + ID + field names | `["$S","rag:v1","source","page","section","score"]` | ~15 tokens |
| **L3** | Full Schema | Complete schema definition | `{"$dcp":"schema","id":"rag:v1","fields":[...],"types":{...}}` | ~80+ tokens |
| **L4** | NL Fallback | Natural language key-value | `source: docs/auth.md, page: 12, section: JWT Config` | Unlimited |

L0–L3 all use positional arrays for data rows. Only L4 switches to key-value text.

### When to use which level

| Situation | Level | Why |
|-----------|:-----:|-----|
| First contact (any model) | L3 | Agent needs full schema definition to begin |
| After first contact, multi-schema | L1 | Schema ID alone is enough to switch — the standard operating mode |
| After first contact, multi-schema (polite) | L2 | Schema ID + field names as a reminder |
| Single schema, high-capability | L1 | Schema already internalized, ID is a formality |
| Lightweight model (≤4B) | L0 | Can only interpret field names; protocol markers are noise |
| Non-DCP consumer / human debugging | L4 | NL key-value fallback |

After first contact, **L1 (`$S` + schema ID) is the default for capable agents**. The agent has seen the schema; the ID is all it needs to switch context. L2 adds field names as a courtesy. L0 exists for lightweight models that cannot parse protocol markers.

## Shadow Level Selection

Shadow level selection has two modes:

**Fixed (system-designer's choice):** The system designer sets a static policy — e.g., "always L2", "L0 with full schema every 10th interaction", "L3 on first contact, then L1". This mode exists for predictability: when the designer knows the consumer's capability or wants to guarantee schema visibility at a fixed cadence.

**Adaptive (agent-profiled):** The system observes per-agent DCP compliance and adjusts density automatically. High accuracy → less overhead, low accuracy → more hints. See [Agent Profile](./agent-profile) for the feedback loop.

Both modes use the same encoder — it receives `shadow_level` as an argument and formats accordingly. The encoder never decides density.

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

## Output Direction — Shadow Index as Controller

::: tip When to use
The output controller is **optional**. It applies only when the system needs structured output — classification, scoring, metadata tagging. For reasoning, analysis, and explanation, natural language output is correct. LLMs excel at LLM → human communication; constraining that expressiveness is a design error, not an optimization.
:::

The shadow index applies in the output direction with no additional mechanism. When the system needs structured output from an AI, it re-presents a shadow index as a response constraint:

```
Input Shadow   →   AI   →   Output Shadow (= Controller)   →   Cap
 (Schema A)              (Schema A or B, re-presented)     (safety net)
```

1. **Input**: System delivers data via shadow index. AI reads it without awareness of DCP mechanics.
2. **Output constraint**: System re-presents a shadow index — the same schema or a different one — as a response format. "Answer using these fields, in these ranges."
3. **Cap**: Any output that still deviates is clamped — enum values outside the defined set are rejected, numbers outside range are clipped, missing fields become null.

### Cost

- **Same schema for input and output**: Re-present the input shadow. Additional cost ≈ 0 (already in context).
- **Different schema for input and output**: Present Schema B's shadow index as the output constraint. Cost = one shadow index presentation.

### Why This Works

DCP schemas already define the constraint space:

- `enum` fields → selection from fixed choices
- Numeric ranges (`weight: 0-1`) → bounded judgment
- Field definitions → what to answer, not just how

When the AI sees `["action(enum:add|replace|remove)", "domain", "detail", "confidence:0-1"]` as an output format, its judgment space is structurally limited. The AI decides *which* action and *what* confidence — the schema prevents it from inventing fields or producing unbounded values.

```
Prompt:  "Evaluate this change. Respond as: [action(add|replace|remove), domain, detail, confidence:0-1]"

AI output:  ["replace", "auth", "jwt migration to RS256", 0.85]
            ↓
Cap:        action ∈ {add,replace,remove} ✓, confidence ∈ 0-1 ✓ → pass through

AI output:  "I think we should replace the auth module because..."
            ↓
Cap:        not array → parse key-value → place by schema order → clamp values
```

The cap handles the residual — it does not drive the design. Most outputs from capable models will already conform because the constraint was presented upfront.

There is nothing in the system beyond schema definitions, shadow indexes, and caps. "Controller" is not a component — it is a usage pattern of the shadow index.

