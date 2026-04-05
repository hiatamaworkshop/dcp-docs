# Agent Profile

> **Status: Design.** Current implementations use static hint selection. Agent profiling and adaptive density are the next evolution.

Agents don't actively fetch schemas unless instructed to. The system observes each agent's DCP competence and adjusts output accordingly. The data this observation collects — per-agent schema comprehension accuracy — goes beyond delivery optimization. An agent's DCP processing level can serve as an indicator for task assignment.

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

High-accuracy agent (errorRate < 0.05):
  → Abbreviated hints + no anchors

Mid-accuracy agent (errorRate 0.05–0.20):
  → Expanded hints + moderate anchors

Low-accuracy agent (errorRate > 0.20):
  → Full schema + high anchor density

Improving trend (errorRate declining):
  → Gradually reduce hint density

Degrading trend (errorRate rising):
  → Increase hint density immediately
```

## Task Access Level

The hint density level an agent operates at indicates its capability:

- **L1 agent** → high capability, complex structured tasks
- **L2 agent** → moderate capability
- **L0 agent** → lightweight model, simple tasks only
- **L4 agent** → minimal capability, guided tasks only

For L0 agents, `$O` provides an additional adaptation layer: field subset selection and format reshaping within the bounds assigned by `$P`.

### Task Pooling

| Queue | Agent Level | Task Type |
|-------|:-----------:|-----------|
| **Complex pool** | L1 | Multi-step reasoning, cross-domain synthesis |
| **Standard pool** | L2 | Structured extraction, template-following |
| **Simple pool** | L0, L4 | Lookup, classification, single-field tasks |

Task management is primarily mathematical — EMA + thresholds. Brain AI handles only boundary cases.

## Design Principles

- **Observe, then adapt** — same feedback loop as TCP slow start / adaptive bitrate streaming
- **Cost optimization, not punishment** — a low-accuracy agent receives more information because it needs it
- **Conservative by default, relaxed by evidence** — trust is earned through observation
- **No agent cooperation required** — the agent doesn't know it's being profiled
- **Single metric, dual value** — DCP compliance rate drives both format selection and task allocation
- **Management cost ≈ zero** — capability assessment is a side effect of normal data delivery

## Shadow Layers and Brain AI

Each layer has a single responsibility in data delivery:

- **Schema** — defines what exists (single source of truth)
- **`$P`** — field-level access control. System-granted; agents cannot escalate their own `$P`
- **`$O`** — format adaptation. Brain AI controls this when routing to workers
- **`$R`** — routing. Brain AI's active role — directs data to the right agents
- **Shadow Index / Agent Profile** — selects schema hint density (L0–L4) per agent

```
Schema: ["$S","task-log:v1","agent","action","target","result","cost","t"]

System → Brain:   $P = all fields
Brain  → Worker:  $R = route to worker pool | $O = [action, target], L0
Brain  → Auditor: $R = route to audit log   | $O = [agent, result, cost], L2
```

The brain AI is a **consumer of `$P`** and a **controller of `$O` and `$R`**. It cannot grant itself permissions beyond what the system assigned.

How Brain AI observes the pipeline and makes routing decisions is covered in [Pipeline](./pipeline).
