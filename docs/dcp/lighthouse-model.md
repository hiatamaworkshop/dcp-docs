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

**2. Retroactive re-observation**

Because the pipeline retains raw events for `retention_window_ms`, a past segment can be re-observed any number of times, with any `$Q[observe]` parameters — including parameters that did not exist when the segment first streamed through.

This is not variance reduction by re-reading. N samples carry N samples' worth of information, and circulating them does not add precision. What retroactive re-observation provides is the ability to ask "what did that window look like at 1-second resolution?" about a period that was aggregated at 10-second resolution when it was live. The answer is already there — in the retained raw events. Replay applies a new lens to old data.

The honest precedent is event sourcing: keep the raw events, derive views on demand. The addition is that the lens (`$Q[observe]`) is Brain-controlled data, so re-derivation uses a *different aggregation* than the original. Stream observation stops being a one-pass read and becomes a re-readable archive.

**3. The world changed vs. the lens changed**

The two facts that look identical on a dashboard — "the signal rose" and "we zoomed in and the noise resolved into a spike" — are not identical. Conflating them is how an observation system produces false alarms.

The lighthouse model makes the distinction explicit by design. Every observation is tagged with the `$Q[observe]` parameters that produced it. A change in the observed shape has two possible explanations:

- The underlying event distribution shifted (the world changed)
- The `$Q[observe]` row changed (the lens changed)

When Brain changes `window_ms` and the shape changes, that is lens-change, not world-change. The Brain that triggered the lens change knows this, because it authored the `$Q` write. The downstream human or AI reading the snapshot package can see both the shape and the parameter history that produced it.

This property is what the RC (Retroactive Re-observation) scenario demonstrates: a failure burst that the coarse live view averaged away appears in the fine-window replay as a dip tile. The world recorded it. The original lens missed it. The lens change revealed it. All three facts are present in the artifact.

## What the domain is not

The lighthouse model is demonstrated on a `test_result:v1` stream — unit test pass/fail events attributed to AI code-generation agents. This is the demonstration vehicle. It is not the definition of the model.

The choice of domain was motivated by the scale problem above: unit tests arrive at high frequency, are cheap per event, and localize to well-defined code regions. Those properties make the observation mechanics easy to verify against known ground truth. Any high-frequency stream with similar properties — game events, sensor readings, API call traces — admits the same mechanics. The domain is a skin.

The test-code framing in `dcp-lighthouse/` exists because the development era that motivates the model (AI-volume code generation) is also the era where test events are the most natural demonstration stream. But the claim being made is about observation infrastructure, not about code quality tooling. The code-quality application is one instance of the model, not the model itself.

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
