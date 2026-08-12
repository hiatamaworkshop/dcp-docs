# Lighthouse Model

DCP is a data pipeline. The lighthouse model is the claim that the same pipeline can serve as a **continuous observation layer** — one whose observation parameters are themselves Brain-controlled data, and whose retained raw events can be re-observed retroactively through any lens.

This is a different kind of claim from the pipeline's other properties. Schema encoding, shadow density, `$ST` aggregation — those address how data moves and compresses. The lighthouse model addresses **what it means to observe a stream**, and who controls that observation.

## The problem it addresses

Point-in-time verdicts no longer scale.

Classical CI runs once per event (PR open, commit push, scheduled build). The verdict is binary. After it fires, nothing watches until the next trigger. This was adequate when humans reviewed every line and the trigger frequency was low.

That condition no longer holds. When code is generated continuously by AI agents — faster than any human review cycle — the verification layer cannot be event-driven. Events arrive at stream frequency. Verdicts must too. The monitoring architecture has to keep up.

The lighthouse model is the answer to that gap: **a stream observer that never stops, whose view is controlled by the Brain reading it**.

## What the model claims

Three properties, each independently useful, composing into something stronger:

**1. Observation parameters as data**

The observation layer does not have fixed settings. Window length, grouping axis, decay rate, retention depth — these are rows in `$Q[observe]`, a shadow table Brain can write. When Brain writes `window_ms = 1000`, the live view narrows. When Brain writes `group_by = ["agentId"]`, the aggregation axis shifts. Neither change touches the stream. Neither requires a pipeline restart.

This is the same separation that `$O` applies to output format — Brain writes to a shadow, the layer reacts. The direction is reversed: `$O` is downstream of observation (shapes the output), `$Q` is upstream (shapes the input to aggregation). Both preserve the core property: **the inferential layer touches only declarative data, never executing pipeline logic directly**.

The write surface is not limited to `$Q[observe]`. Interpretation thresholds that more than one Brain implementation must agree on — "how far below its learned baseline counts as a regression" — are promoted to `$Q[schema]` rows and read live by the Brain, not compiled into it. This is demonstrated, not just claimed: writing `baseline_delta` to `$Q[schema]` mid-flight reconfigures the running Brain's regression threshold on its next tick, with no restart and no code path from the writer to the reader other than the shadow row itself.

**2. Retroactive re-observation**

Because the pipeline retains raw events for `retention_window_ms`, a past segment can be re-observed any number of times, with any `$Q[observe]` parameters — including parameters that did not exist when the segment first streamed through.

This is not variance reduction by re-reading. N samples carry N samples' worth of information, and circulating them does not add precision. What retroactive re-observation provides is the ability to ask "what did that window look like at 1-second resolution?" about a period that was aggregated at 10-second resolution when it was live. The answer is already there — in the retained raw events. Replay applies a new lens to old data.

The honest precedent is event sourcing: keep the raw events, derive views on demand. The addition is that the lens (`$Q[observe]`) is Brain-controlled data, so re-derivation uses a *different aggregation* than the original. Stream observation stops being a one-pass read and becomes a re-readable archive.

Re-observation is also *targeted*, not bulk. A replay proposal carries the segment bounds (`fromTs`/`toTs`) alongside the lens, and the Brain derives those bounds from its own detection state — the timestamps at which it first noticed the dip and later saw recovery, padded by the coarse window's own smear. The Brain does not say "re-read everything"; it says "re-read the interval where my live view told me something happened, through this finer lens."

**3. The world changed vs. the lens changed**

The two facts that look identical on a dashboard — "the signal rose" and "we zoomed in and the noise resolved into a spike" — are not identical. Conflating them is how an observation system produces false alarms.

The lighthouse model makes the distinction explicit by design. Every observation is tagged with the `$Q[observe]` parameters that produced it. A change in the observed shape has two possible explanations:

- The underlying event distribution shifted (the world changed)
- The `$Q[observe]` row changed (the lens changed)

When Brain changes `window_ms` and the shape changes, that is lens-change, not world-change. The Brain that triggered the lens change knows this, because it authored the `$Q` write. The downstream human or AI reading the snapshot package can see both the shape and the parameter history that produced it.

This property is what the RC (Retroactive Re-observation) scenario demonstrates: a failure burst that the coarse live view averaged away appears in the fine-window replay as a dip tile. The world recorded it. The original lens missed it. The lens change revealed it. All three facts are present in the artifact.

*A third axis, surfaced by real data.* On a mock stream events always arrive, so "world vs. lens" is the whole story. Applying the mechanism to a real, sparse transport surfaces a third thing the absence of events can mean: **the world is silent** (no activity — normal) versus **the observer is blind** (the transport is down — we stopped seeing). A gap signal that reads only event flow conflates the two and false-fires on normal quiet. The fix is to treat **transport liveness as a first-class observation input, separate from event flow** — a gap is "blind" only when liveness says the channel is down. The world changing, the lens changing, and the observer's own sight failing are three independent axes the observation layer must keep apart.

*A miscalibration, caught and fixed.* The tile classifier scores each window against a threshold; treating that threshold as safe per-window undercounts how many chances a long-running stream gets to cross it by chance alone. Measured across a fixed set of seeded runs, an uncorrected classifier produced a false-alarm tile in 29% of packages that contained no injected anomaly. A Šidák correction — sized to the whole package's false-alarm budget, not each window's — brought that down to 6.5% without weakening real detections. This is the same "world changed vs. lens changed" distinction applied to the mechanism's own calibration: an uncorrected threshold manufactures "world changed" readings that are actually an artifact of how many independent looks the classifier took.

*The grid is part of the lens.* Window boundaries are observation state, not a property of whichever query happened to ask for them. Anchoring windows to the first event of an arbitrary request means two overlapping queries over the same retained data can land on different grids — a past event that cannot have changed reads as unstable, flickering between anomalous and unremarkable across identical replays. The fix is to make the grid explicit (`origin`, `align`) and shared by every reader of a lens, coarse or fine. The same discipline extends to grouped observation: splitting a stream by source (`group_by`) restores the comparator's assumption of a single distribution — a regression in one of several agents that reads as unremarkable in the mixture becomes clearly visible against its own group's history — but only when every group shares that same grid and is scored against a same-shape reference, and the false-alarm budget above accounts for the added comparisons rather than being spent per group.

## What the domain is not

The lighthouse model is demonstrated on a `test_result:v1` stream — unit test pass/fail events attributed to AI code-generation agents. This is the demonstration vehicle. It is not the definition of the model.

The choice of domain was motivated by the scale problem above: unit tests arrive at high frequency, are cheap per event, and localize to well-defined code regions. Those properties make the observation mechanics easy to verify against known ground truth. Any high-frequency stream with similar properties — game events, sensor readings, API call traces — admits the same mechanics. The domain is a skin.

The test-code framing in `dcp-lighthouse/` exists because the development era that motivates the model (AI-volume code generation) is also the era where test events are the most natural demonstration stream. But the claim being made is about observation infrastructure, not about code quality tooling. The code-quality application is one instance of the model, not the model itself.

The skin claim extends further than structured streams. Unstructured text — news mentions, official announcements, raw social chatter — fits the same mechanics once one refuses the temptation to *understand* it in the pipeline. The deterministic layer does lightweight parsing only (source, timestamp, keyword hits) and emits it as an event stream (`mention:v1`); what the observation layer then watches is the **statistics of mention flow** — frequency, burstiness, source mix, silence — not the meaning of any individual text. Interpretation of content stays in the inferential layer, where it belongs. "The world got louder about X" is a shape on a stream, and shapes on streams are exactly what the lighthouse already observes.

## Four-layer separation

Brain's authority in the lighthouse model is strictly bounded:

| Layer | Controls | Who can write |
|---|---|---|
| 1. Stream | Raw events, ingestion | Sources (AI agents, adapters) |
| 2. Observation | `$Q[observe]` — window, decay, group_by | Brain |
| 3. Aggregation | `$ST` output — statistics, shapes | Pipeline (deterministic) |
| 4. Action | Reroute, quarantine, target update | Outer layer (human, ops, automation) |

Brain reads layer 3 and writes to layer 2. It does not write to layer 1 (the stream) or to layer 4 (the action layer). `rerouteSchema`, `schemaUpdate`, `replayRequest` — all three are **proposals** emitted outbound. Whether a reroute actually happens is the outer layer's decision.

This is intentional. A pipeline that Brain can directly mutate becomes unpredictable under adversarial or mistaken Brain behavior. A pipeline that Brain can only *observe* and *propose* degrades gracefully: if Brain misfires, nothing acts until the outer layer validates the proposal. If Brain's `$Q` writes produce garbage, the stream continues and the writes can be reverted.

The Minecraft demo established this pattern (Brain steers via PostBox proposals, never entering the data path). The lighthouse model extends it: Brain's write surface now includes the observation parameters themselves, not just routing and gate configuration. The separation holds at the new layer because `$Q` rows are data, not callbacks.

## Relationship to adjacent ideas

The lighthouse model's individual primitives have precedents. What it adds is composition:

- **Event sourcing** — keep raw events, derive views on demand. Lighthouse applies this to a *live observation layer* whose lens is mutable mid-flight.
- **Observability platforms** (Prometheus, Grafana) — continuous metric streams, but observation parameters are static dashboard config, not Brain-writable data; and there is no control loop fed back into the system.
- **Adaptive sampling** — changes what is collected based on observed signal. Lighthouse changes how collected events are *aggregated*, not which events arrive.

The composing property — Brain-controlled lens over retained raw events, in a loop — is what makes the model novel enough to demonstrate separately from the Minecraft baseline.

---

*Implementation reference*: [demos/lighthouse](../demos/lighthouse) — AR / CG / RC scenarios, event schema, source file index.
