# Agent-Adaptive Schema Density

> **Status: Design.** Current implementations use static hint selection based on push content (native → abbreviated, NL → expanded). Agent profiling and adaptive density are the next evolution.

Agents don't actively fetch schemas. The system must observe each agent's DCP competence and adjust output accordingly.

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

## Design Principles

- **Observe, then adapt** — the same feedback loop as TCP congestion control (slow start → congestion avoidance) and adaptive bitrate streaming
- **Cost optimization, not punishment** — a low-accuracy agent isn't penalized; it receives more information because it needs it
- **Conservative by default, relaxed by evidence** — new agents start at high density; trust is earned
- **No agent cooperation required** — the agent doesn't know it's being profiled; it just receives appropriately detailed responses