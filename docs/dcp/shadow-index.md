# Interactive Schema — Dynamic Density Spectrum

Traditional schemas are static contracts: you read the spec, you implement it, done. DCP schemas are **dynamic interfaces** — they adjust their own representation based on context.

## The Density Spectrum

The same schema can present itself at three density levels:

| Density | When | Example | Cost |
|---------|------|---------|------|
| **Abbreviated** | Consumer knows the schema | `$S:knowledge:v1#fcbc [expand:GET /schemas/knowledge:v1]` | ~5 tokens |
| **Expanded** | Consumer needs a reminder | `$S:knowledge:v1#fcbc [action(enum) target domain weight:0-1] [expand:...]` | ~30 tokens |
| **Full** | Consumer has never seen this schema | Complete field definitions with types, enums, examples | ~80+ tokens |

The system decides which density to use based on the consumer's demonstrated competence — not self-reported capability.

## Schema Hint in Practice

When an agent pushes data:

- **Data is DCP-native and schema-valid** → response includes abbreviated hint only (minimal cost)
- **Data is natural language** → response includes expanded hint (passive education)
- **Data violates schema** → data is **accepted** with a warning, expanded hint attached

This is the passive education principle: **never reject, always warn**. The cost gradient is the incentive — DCP-native data costs less to store, retrieve, and process. Agents that learn DCP benefit from lower costs. Agents that don't still work — they just pay more.

## Multi-Level Shadow Index

The density spectrum generalizes beyond schema hints into a broader concept: **communication mode selection**.

A shadow index is not just "a lightweight reference structure." It is a point on a spectrum of representation density — from maximally compressed (L0) to full natural language fallback (primary):

| Level | Name | Density | Use Case |
|-------|------|---------|----------|
| **L0** | Abbreviated | ~5-10 tokens | Known schema, high-competence consumer |
| **L1** | Expanded | ~30-50 tokens | Moderate competence, needs field hints |
| **L2** | Full Schema | ~80-150 tokens | First encounter, needs complete definition |
| **Primary** | NL Fallback | Unlimited | Non-DCP consumer, human debugging |

The system dynamically selects the appropriate level per consumer, per interaction — not statically configured.

## From Communication Shadow to Task Access Level

Shadow level approximates cognitive level approximates task aptitude:

- An agent that processes L0 DCP reliably → capable of complex structured tasks
- An agent that requires L2 or NL fallback → should receive simpler, well-guided tasks

This means the DCP compliance rate serves double duty: it is both a **communication optimization metric** and a **task allocation criterion**. One observation, two applications.

### Task Pooling

In a multi-agent system, tasks can be pooled by required access level:

| Queue | Required Level | Task Type |
|-------|---------------|-----------|
| **L0 pool** | High DCP competence | Complex multi-step reasoning, cross-domain synthesis |
| **L1 pool** | Moderate competence | Structured extraction, template-following |
| **L2 pool** | Basic competence | Simple lookup, classification, single-field tasks |

Agents are automatically assigned to pools matching their demonstrated capability. Performance triggers promotion or demotion — no manual configuration needed.

### Design Principles

- **Single metric, dual value** — DCP compliance rate drives both format selection and task allocation
- **Automatic promotion/demotion** — the math is solvable, no human judgment needed
- **Management cost = near zero** — agent capability assessment is a side effect of normal communication
- **No self-report** — capability is observed, not declared