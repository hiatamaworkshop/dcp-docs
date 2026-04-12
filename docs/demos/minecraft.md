# Minecraft Pipeline Demo

> **Status: Verified.** All three scenarios confirmed working. p50 latency = 45μs (ingest → Gate pass).

A real-time demonstration of DCP Pipeline autonomy using Minecraft game events. No actual Minecraft server required — a demo scenario runner injects events directly into the IngestionBus.

## What this demonstrates

The pipeline control layer — `$V`, `$R`, `$ST`, Brain AI — working as designed:

- Anomaly detected by the data path (`$ST` pass rate drops)
- Bot fires, Brain evaluates, routing changes
- The data path is never paused or blocked
- When anomaly clears, Brain restores the previous state automatically

## Architecture

```
Demo Scenario Runner (HTTP :3004)
  ↓ inject events
IngestionBus
  → Preprocessor        ← structural validation → Quarantine
  → GameFilter          ← game logic anomaly detection → $I severity
  → Gate ($V)           ← schema constraint validation → pass/fail
  → StCollector         ← 2s window → $ST-v (pass/fail/pass_rate)
  → Bot                 ← Weapon filters → $I packets
  → Brain (2s tick)     ← GameRuleBrain.evaluate() → BrainDecision
  → PostBox             ← routing_update / throttle / quarantine_approve
  → PipelineControl     ← applies to next row
```

**Brain AI used**: `GameRuleBrain` — a rule-based `BrainAdapter` with no LLM. The same interface accepts Claude (Haiku) via `BRAIN_MODE=claude`.

> **Note on Bot / L-LLM**: The pipeline.md design describes a Bot that calls an L-LLM on weapon fire. In this demo, the L-LLM step is omitted — Weapon filters write `$I` packets directly. The L-LLM is an optional enrichment layer; the control flow (Weapon → `$I` → Brain) is identical with or without it.

## Schemas

```
["$S","player_move:v1",6,"playerId","x","y","z","yaw","ts"]
["$V","player_move:v1","type:[string,float,float,float,float,int]","range:1:-30000000:30000000","range:2:-64:320"]

["$S","combat:v1",5,"attackerId","targetId","damage","weapon","ts"]
["$V","combat:v1","type:[string,string,float,string,int]","range:2:0:100"]

["$S","block_place:v1",5,"playerId","x","y","z","blockId"]
["$S","chat:v1",3,"playerId","message","ts"]
```

## Scenario A — Teleport Cheat Detection

**Trigger**: `player_move:v1` events with `x/z` delta > 20 blocks per frame.

```
GameFilter detects: distance > 20 → severity = "high"
$ST: pass_rate drops below 0.8
Bot weapon "low_pass_rate" fires → $I packet (schemaId: player_move:v1, severity: high)
Brain: speedAnomaly detected
```

**Brain decision**:
```
rerouteSchema: { player_move:v1 → pipeline://audit-pipeline }
```

**MappingLayer**:
```
$R.player_move:v1.active_route: null → "audit-pipeline"   (reason: speed anomaly)
```

**Decay** (when anomaly stops):
```
rerouteSchema: { player_move:v1 → pipeline://dcp-minecraft }
$R.player_move:v1.active_route: "audit-pipeline" → null   (reason: speed anomaly cleared)
```

**Measured latency**: p50 = 45μs, p99 = 4.1ms (ingest → Gate pass, 82 samples)

## Scenario B — Combat Cluster (PvP Mode)

**Trigger**: `combat:v1` events with `damage` > 20 (GameFilter threshold).

```
GameFilter detects: damage > 20 → severity = "high"
$ST: pass_rate drops, fail count rises
Bot weapon "high_fail" fires → $I packet (schemaId: combat:v1, severity: high)
Brain: combatCluster detected
```

**Brain decision** (two simultaneous actions):
```
rerouteSchema:    { combat:v1 → pipeline://pvp-pipeline }
validationUpdate: { combat:v1, damage.max: 100 → 15 }
```

**MappingLayer**:
```
$R.combat:v1.active_route:      null  → "pvp-pipeline"   (reason: combat cluster)
$R.combat:v1.shadow_strictened: false → true              (reason: combat cluster $V update)
```

**Decay** (when combat normalizes):
```
$R.combat:v1.active_route:      "pvp-pipeline" → null    (reason: combat cluster cleared)
$R.combat:v1.shadow_strictened: true → false              (reason: combat cluster cleared $V reset)
validationUpdate: { combat:v1, damage.max: 15 → 100 }
```

## Scenario C — Schema Evolution (Quarantine)

**Trigger**: `player_move:v1` events containing unknown fields `ping` and `gameMode` (simulating a Minecraft version upgrade).

```
Preprocessor detects: unknown_field "ping", "gameMode"
→ PostBox.pushQuarantine(pipelineId, { reason: "unknown_field", record })
Brain: quarantines.some(q => q.payload.reason === "unknown_field")
```

**Brain decision**:
```
quarantineApprove: { quarantineId, pipelineId }
rationale: "unknown_field quarantine approved — schema evolution"
```

The record is re-injected into the Preprocessor. No data is lost. No pipeline restart required.

## GameRuleBrain rules

| Trigger | Condition | Decision |
|---------|-----------|----------|
| Speed anomaly | `player_move:v1` packet with `severity = "high"` | `rerouteSchema → audit-pipeline` |
| Combat cluster | `combat:v1` packet with `severity = "high"` or `"medium"` | `rerouteSchema → pvp-pipeline` + `validationUpdate damage.max → 15` |
| Rapid placement | `block_place:v1` packet with `severity = "medium"` or `"high"` | `throttle block_place:v1 → 100 rps` |
| Schema evolution | `quarantine.reason = "unknown_field"` | `quarantineApprove` |
| Anomaly cleared | No triggering packets in current Brain tick | Restore previous routing + `$V` |

## Measured results

| Metric | Value |
|--------|-------|
| Ingest → Gate pass p50 | **45 μs** |
| Ingest → Gate pass p99 | **4.1 ms** |
| Brain tick interval | 2 s |
| Lazy switching latency (p50) | **63 μs** (routing update → next row applied) |
| Samples (load test) | 82 |

The control path (Brain tick) is 2 seconds. The data path (ingest → Gate) is ~45μs. Brain AI observes and updates without ever entering the data path.

## Dashboard

The live SSE dashboard (`:3003`) shows all layers in real time:

- **Routing State** — current `$R` per schema
- **$V Constraints** — live `damage.max`, `teleport_dist`, `rapid_count`
- **$ST** — rolling 2s window: pass / fail / pass_rate per schema
- **Bot Firing Timeline** — REROUTE, $V UPDATE, Quarantine events with timestamps
- **MappingLayer history** — every `set()` call with key, old value, new value, reason
- **Latency** — avg / p50 / p99 / sample count

## Source

`dcp-minecraft/` in the dcp-wrap repository. Key files:

| File | Role |
|------|------|
| `server/src/index.ts` | Pipeline wiring, schema registration |
| `server/src/game-filter.ts` | GameFilter rules |
| `server/src/game-rule-brain.ts` | GameRuleBrain (rule-based BrainAdapter) |
| `server/src/demo-scenario.ts` | Scenario A/B/C event injection |
| `server/src/dashboard.ts` | SSE dashboard server |
| `dashboard/app.js` | Browser-side dashboard UI |
