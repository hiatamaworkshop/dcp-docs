# Lighthouse Model Demo

> **Status: Pilot complete.** AR / CG / RC scenarios verified. 113 tests, 0 fail.

A demonstration of the Lighthouse Model: using the DCP Pipeline as an **observation layer** for agentic code generation streams. The core claim — that you can re-observe stored raw data through a different lens without touching the live stream — is what this demo proves.

## What this demonstrates

The observation layer mechanics, not the domain:

- A live `test_result:v1` stream flows continuously. The observation layer attaches on top — the stream is never paused or blocked.
- **$Q** holds observation parameters (`window_ms`, `group_by`, etc.). Brain changes $Q; LensViews react live.
- **RetentionBuffer** keeps raw events in a ring buffer. Brain can trigger replay at any time.
- **SnapshotCurator ($U)** mechanically classifies the observed shape into tiles: spike, dip, gap, step, divergence, baseline.
- **RuleBrain** fires three rule types: `rerouteSchema` (AR), `schemaUpdate` (CG), `replayRequest` (RC).

The same observation mechanics work for any high-frequency stream. `test_result:v1` is one domain skin on top.

## The key distinction

> Changing the observation lens is not the same as the world changing.

RC (Retroactive Re-observation) makes this concrete: a 2-second failure burst in agent-C is averaged away by the coarse live view (10s window). The world recorded it — the stream holds raw events. Brain notices the recovery signature, triggers replay of the retained segment through a fine lens (1s window), and the burst appears as a dip tile. The data did not change. The lens did.

## Architecture

```
MockStreamGenerator (test_result:v1, 50 evt/s)
  ↓  onEvent
TestorAdapter         ← per-agent / per-domain aggregation → STSnapshot
  +
RetentionBuffer       ← ring buffer (120s raw events, RC replay)
  +
ObservationOverlay    ← "coarse" (10s window)  "fine" (1s window)
                         both read $Q[observe] live
  ↓  tick (1s)
RuleBrain             ← observe(STSnapshot) → decide() → BrainDecision[]
  ↓
  ├─ rerouteSchema    → console + dashboard SSE
  ├─ schemaUpdate     → console + dashboard SSE
  └─ replayRequest    → buffer.replay({window_ms}) → SnapshotCurator
                         → broadcastReplay(pkg) → dashboard SSE
  ↓
DashboardServer       ← SSE :3001 (/events/snapshot, /events/decisions)
```

**Brain AI used**: `RuleBrain` — a deterministic `BrainAdapter` with no LLM. The same interface accepts `ClaudeBrain` via `BRAIN_MODE=claude`.

## Event schema

```
["$S","test_result:v1",8,"ts","testId","agentId","areas","result","duration","weight","commitHash"]
```

Four agents: `agent-A` (baseline, 95% pass) · `agent-B` (broad coverage, 88%) · `agent-C` (regression target, 95%) · `agent-D` (flaky output, 90%)

**Area space**: 256 bits fixed, partitioned by domain:

| Bits | Domain | Priority |
|------|--------|----------|
| 0–31 | auth | critical |
| 32–63 | payment | critical |
| 64–127 | ui | normal |
| 128–255 | utils | low |

## Scenario AR — Agent Regression

**Trigger**: `agent-C` pass rate drops from 95% → 70% and stays below its *learned per-agent threshold* for ≥ 2 consecutive ticks.

Thresholds are per-agent, not a single global bar. Each agent's healthy pass rate is tracked with an EWMA baseline; "regression" means a drop of 0.10 below *that agent's* normal. A global 0.80 bar sat only ~1.9σ above a legitimately-low-baseline agent (agent-B at 0.88), firing spurious regressions on quiet baseline (~30% of seeds); the per-agent threshold (baseline − 0.10) removes that.

```
TestorAdapter window (5s): agent-C pass rate crosses below its threshold (≈0.85)
RuleBrain.checkAR(): agentRegressionTicks["agent-C"] = 2 → fires
```

**Brain decision**:
```
rerouteSchema: { agentId: "agent-C", reason: "pass rate 0.70 < threshold for 3 ticks" }
```

**Dashboard event**:
```json
{ "type": "rerouteSchema", "agentId": "agent-C", "ts": 1234567890 }
```

**Recovery**: When `agent-C` passes > 80% again, `agentRegressionTicks` clears and the rule re-arms.

**Criterion**: Decision fires within 5 seconds of regression onset. Agent panel shows a visible per-agent separation.

## Scenario CG — Coverage Gap

**Trigger**: `auth` domain bits 16–23 are excluded from all area lists. Coverage gap accumulates above threshold for ≥ 5 ticks.

```
TestorAdapter: auth coveredBits = 24 (of 32 required) → gap = 8 > GAP_THRESHOLD (4)
RuleBrain.checkCG(): domainGapTicks["auth"] = 5 → fires
```

**Brain decision**:
```
schemaUpdate: { domain: "auth", gap: 8, reason: "coverage gap sustained for 5 ticks" }
```

**Dashboard event**:
```json
{ "type": "schemaUpdate", "domain": "auth", "gap": 8 }
```

**Criterion**: Heatmap hole visible within 10 seconds. Decision fires before the gap closes on its own.

## Scenario RC — Retroactive Re-observation

This is the scenario that justifies the retention buffer.

**What happens in the world**: `agent-C` pass rate drops to 20% for 2 seconds (≈ 25 events), then returns to 95%. Under the coarse live view (10s window), this 2-second dip is diluted: window mean stays close to the baseline.

**What Brain sees**: `agent-C` pass rate dips briefly into `[0.40, agentThreshold)` then recovers above its threshold. This recovery signature is the trigger.

```
RuleBrain.checkRC():
  tick N:   agent-C passRate = 0.65 → confirmed dip (≥ DIP_REQUIRE_TICKS)
  tick N+1: agent-C passRate = 0.65 → still in dip zone (≤ DIP_MAX_TICKS)
  tick N+2: agent-C passRate = 0.92 → recovered above threshold
            agentDipActive.has("agent-C") → replayRequest fires
```

**Brain decision**:
```
replayRequest: {
  agentId: "agent-C",
  qProposal: { scope: "observe:test_result:v1#fine", params: { window_ms: 1000 } }
}
```

**What happens next**:

```
index.ts receives replayRequest
  → buffer.replay({ window_ms: 1000 })   (retained 120s of raw events)
  → curator.curate(fineResult)            (SnapshotCurator runs on fine-window output)
  → dashboard.broadcastReplay(pkg)        (SSE push to /events/decisions)
```

The fine-window replay produces **dip tiles** at the burst windows (mean ≈ 0.20 vs global mean ≈ 0.78, z ≈ −2.0). The coarse view shows nothing anomalous. The contrast is the artifact.

**Criterion**: Fine-window replay recovers the injected burst at the known position and magnitude. The dip tile `regionStart` aligns with the `burst_start` entry in the scenario truth log.

## RuleBrain rules

| Rule | Trigger | Condition | Decision |
|------|---------|-----------|----------|
| AR | `agent.passRate < baseline − 0.10` (per-agent) | Sustained for ≥ 2 ticks | `rerouteSchema` (once per regression) |
| CG | `domain.gap > 4` | Sustained for ≥ 5 ticks | `schemaUpdate` (once per domain) |
| RC | passRate in `[0.40, agentThreshold)` then recovery | Recovery above threshold after a 2–7 tick dip | `replayRequest` (once per session) |

Per-agent thresholds = learned EWMA baseline − 0.10, trusted after a 10-tick warmup; the baseline is frozen while an agent is below threshold so a regression can't re-normalize itself. AR re-arms when pass rate returns above the agent's threshold, CG when the gap closes, RC after `brain.reset()`. `reset()` clears per-scenario detection state but keeps the learned baselines (long-lived agent knowledge).

## SnapshotCurator tiles

`$U` produces a `SnapshotPackage` — a curated set of tiles sorted by significance then time.

| ShapeTag | Detection | Typical source |
|----------|-----------|----------------|
| `spike` | z-score ≥ 2.0 (positive) | Unusual pass rate burst |
| `dip` | z-score ≤ −2.0 (negative) | Failure burst (RC fine-window) |
| `step_up` | Sustained mean elevation ≥ 3 windows | Improvement regime |
| `step_down` | Sustained mean drop ≥ 3 windows | AR regression tail |
| `gap` | No events for > 2× window_ms | CG coverage hole |
| `divergence` | Two lenses disagree at same window | Coarse/fine contrast |
| `baseline` | Window closest to global mean | Reference point |

Tiles are sorted by type priority (spike/dip first, baseline last), then chronologically within type. The package is what Brain — rule-based or LLM — sees instead of raw time series.

## Dashboard

The live SSE dashboard (`:3001`) exposes two channels:

- **`/events/snapshot`** — 1s ticks: agents (per-agent pass rate, flaky rate, event count), domains (coverage per domain), coarse SnapshotPackage, $Q history
- **`/events/decisions`** — Brain decisions as they fire; `replay_snapshot` events carry the fine-window `SnapshotPackage` for RC contrast display

REST endpoints:
- `GET /demo/start?scenario=AR|CG|RC` — starts scenario (resets Brain state first)
- `GET /demo/stop` — stops generator
- `GET /status` — current load and active scenario

## Source

`dcp-lighthouse/` repository. Key files:

| File | Role |
|------|------|
| `server/src/index.ts` | Pipeline wiring and tick loop |
| `server/src/mock-stream-generator.ts` | test_result:v1 stream + AR/CG/RC injection |
| `server/src/testor-adapter.ts` | TestEvent → STSnapshot (per-agent, per-domain) |
| `server/src/q-registry.ts` | $Q observation parameter store |
| `server/src/retention-buffer.ts` | Ring buffer + `replay(params)` |
| `server/src/lens.ts` | `applyLens(segment, params)` — effector chain |
| `server/src/lens-view.ts` | `ObservationOverlay` — parallel lenses on one stream |
| `server/src/snapshot-curator.ts` | `SnapshotCurator ($U)` — shape tile selection |
| `server/src/rule-brain.ts` | `RuleBrain` — AR / CG / RC rule implementation |
| `server/src/dashboard.ts` | SSE bridge + REST endpoints |
| `dashboard/app.js` | Browser-side dashboard UI |
