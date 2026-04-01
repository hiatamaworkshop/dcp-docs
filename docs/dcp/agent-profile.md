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

The hint density level an agent **operates at** indicates its capability:

- **L1 agent** (schema ID switching) → high capability, complex structured tasks
- **L2 agent** (needs field name reminders) → moderate capability
- **L0 agent** (field names only, no protocol) → lightweight model, simple tasks only
- **L4 agent** (NL fallback) → minimal capability, guided tasks only

For L0 agents, `$O` provides an additional adaptation layer: it selects the relevant field subset and reshapes the positional array into a form the model can reliably process. The shadow index selects density; `$O` handles the format transformation.

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

The agent profile controls **density** — how much schema information accompanies data. But delivery to each agent involves three distinct concerns, handled by separate DCP layers:

- **Schema** — defines what exists (SSOT, single source of truth)
- **`$P` (Permission Shadow)** — field-level access control. Granted by the system; agents operate within assigned permissions. A brain AI receives its `$P` from the system and cannot escalate it — `$P` is a constraint, not a tool.
- **`$O` (Output Shadow)** — format adaptation. Controls which fields are delivered and in what form, within the bounds of `$P`. This is what a brain AI controls when routing to workers: it selects `$O` per consumer based on observed capability.
- **`$R` (Routing Shadow)** — distribution control. The brain AI sets `$R` to direct data to the right agents. Routing is the brain's active role; `$P` defines the ceiling it cannot exceed.
- **Shadow Index / Agent Profile** — selects schema hint density (L0–L4) per agent, based on observed compliance. Controls how much schema context travels with data, not which fields are visible.

```
Schema: ["$S","task-log:v1","agent","action","target","result","cost","t"]

System  → Brain:   $P = all fields (system-granted)
Brain   → Worker:  $R = route to worker pool | $O = [action, target], L0 positional
Brain   → Auditor: $R = route to audit log   | $O = [agent, result, cost], L2
```

The brain AI is a **consumer of `$P`** and a **controller of `$O` and `$R`**. It cannot grant itself permissions beyond what the system assigned. Within that ceiling, it decides how to shape and route data downstream.

Each layer has a single responsibility. They compose independently.

The assessment process observes agent capability, updates the profile, and the delivery pipeline adjusts automatically — shadow level selection, field projection via `$P`, format adaptation via `$O`, routing via `$R`. From the agent's perspective, the right data simply arrives. The control layer is fully transparent.

Pipeline design shifts from manual plumbing ("transform X for agent A, reshape Y for agent B") to **declaring per-agent shadow configuration** — the routing, projection, and format derive from schema + shadow layers, not from custom code.