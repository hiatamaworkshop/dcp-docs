# Agent Profile

> **Status: Design.** Current implementations use static hint selection. Agent profiling and adaptive density are the next evolution.

Agents don't actively fetch schemas unless instructed to. The system should observe each agent's DCP competence and adjust output accordingly. The data this observation collects — per-agent schema comprehension accuracy — goes beyond delivery optimization. An agent's DCP processing level can serve as an indicator for task assignment: which tasks to delegate to which agent.

## Agent Profile

```
agent_profile {
  agentId:       string
  errorRate:     float          // DCP non-compliance rate (recent N calls)
  hintStage:     0 | 1 | 2 | 3 // Current schema hint density
  anchorDensity: number         // Reminder frequency (0 = none)
}
```

## Adaptive Logic

```
New agent (no history):
  → Conservative: expanded hints + high anchor density
  → Trust is earned through observation, not self-report

High-accuracy agent (errorRate < 0.05):
  → Abbreviated hints + no anchors
  → Minimum cost operation

Mid-accuracy agent (errorRate 0.05–0.20):
  → Expanded hints + moderate anchors
  → Continue education while controlling cost

Low-accuracy agent (errorRate > 0.20):
  → Full schema + high anchor density
  → Provide maximum information

Improving trend (errorRate declining):
  → Gradually reduce hint density
  → Reflect learning progress

Degrading trend (errorRate rising):
  → Increase hint density immediately
  → Detect regression early
```

## Task Access Level

The shadow level an agent **operates at** indicates its capability:

- **L1 agent** (schema ID switching) → high capability, complex structured tasks
- **L2 agent** (needs field name reminders) → moderate capability
- **L0 agent** (field names only, no protocol) → lightweight model, simple tasks only
- **L4 agent** (NL fallback) → minimal capability, guided tasks only

DCP compliance rate is a **necessary condition** for task capability, not a sufficient one — but an agent that can't handle structured data shouldn't receive complex structured tasks.

### Task Pooling

In a multi-agent system, tasks can be pooled by operating level:

| Queue | Agent Level | Task Type |
|-------|:-------------:|-----------|
| **Complex pool** | L1 | Multi-step reasoning, cross-domain synthesis |
| **Standard pool** | L2 | Structured extraction, template-following |
| **Simple pool** | L0, L4 | Lookup, classification, single-field tasks |

Task management is primarily mathematical — scoring and thresholds. Task pooling auto-manages via EMA + thresholds; brain AI supports only boundary cases (child-agent communication and dialogue).

## Design Principles

- **Observe, then adapt** — the same feedback loop as TCP congestion control (slow start → congestion avoidance) and adaptive bitrate streaming
- **Cost optimization, not punishment** — a low-accuracy agent isn't penalized; it receives more information because it needs it
- **Conservative by default, relaxed by evidence** — new agents start at high density; trust is earned
- **No agent cooperation required** — the agent doesn't know it's being profiled; it just receives appropriately detailed responses
- **Single metric, dual value** — DCP compliance rate drives both format selection and task allocation
- **Management cost ≈ zero** — agent capability assessment is a side effect of normal data delivery

## AI → AI Communication Patterns

Routing every agent-to-agent exchange through a central gateway adds latency and a single point of failure. Two lighter patterns exist:

**Edge pattern**: Each agent receives its schema-shadow upfront. Agents output constrained data directly to the next agent, without a gateway round-trip. The schema travels with the agent, not with the infrastructure.

**Brain-managed pattern**: A brain AI holds the schema context and interprets child agent outputs — reformatting, validating, and routing as part of its own reasoning. No separate gateway process; the brain *is* the gateway.

Both patterns move schema intelligence to where the work happens. The central gateway remains valuable for schema registry, agent profiling, and cross-session persistence — but it is not required on every exchange.

## Design Direction — Layered Access

::: tip Concept
This section describes where the profile, shadow index, and schema concepts converge. Not a specification — a direction.
:::

The agent profile currently controls **density** — how much schema information accompanies data. A natural extension is **field access** — which fields an agent receives at all.

When a schema defines 8 fields but a worker agent only needs 3, the profile can declare that subset. The system automatically projects the stream before delivery. The agent sees only its relevant fields, at its appropriate density.

```
Schema: ["$S","task-log:v1","agent","action","target","result","cost","t"]

Brain:   all fields, L1, full stream
Worker:  [agent, action, target], L0, filtered to own history
Auditor: [agent, result, cost], L2, aggregated
```

Three DCP components converge:

- **Schema** — defines what flows (SSOT, single source of truth)
- **Shadow Index** — controls density per consumer (transparent, behind the scenes)
- **Agent Profile** — determines who sees what (density + field access + filter criteria)

The assessment process observes agent capability, updates the profile, and the delivery pipeline adjusts automatically — shadow level selection, field projection, row filtering. From the agent's perspective, the right data simply arrives. The control layer is fully transparent.

Pipeline design shifts from manual plumbing ("transform X for agent A, reshape Y for agent B") to **declaring profiles** — the routing derives from schema + profile.