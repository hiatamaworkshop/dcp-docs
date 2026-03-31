# Lightweight LLM Compatibility & Density

::: info Context
DCP is designed for frontier models (Claude, GPT class). These tests push DCP to its limits with **extremely small models (0.5B–3.8B)** — far below typical production use — to find the floor of compatibility. For reference, these models are roughly 100x smaller than frontier models and struggle with basic reasoning tasks regardless of data format.
:::

DCP is viable as a system→AI data format even for sub-4B models. Read comprehension works. Unprompted generation of correct positional arrays does not — but constrained output via [controller pattern](../dcp/shadow-index#output-direction-shadow-index-as-controller) (schema-guided prompting) is expected to improve this significantly, pending further testing.

## Test Environment

- **Models:** phi3:mini (3.8B), gemma2:2b, qwen2.5:1.5b, llama3.2:1b, qwen2.5:0.5b
- **Environment:** ollama 0.18.2, localhost, temperature=0, 3 runs per test
- **Date:** 2026-03-25/26

## DCP Read Comprehension

| Model | basic_field_lookup | field_by_position | count_and_filter |
|-------|:-:|:-:|:-:|
| phi3:mini (3.8B) | 3/3 | 3/3 | 0/3 |
| gemma2:2b | 0/3 | 0/3 | 3/3 |
| qwen2.5:1.5b | 0/3 | 3/3 | 3/3 |
| llama3.2:1b | 0/3 | 3/3 | 3/3 |
| qwen2.5:0.5b | **3/3** | **3/3** | **3/3** |

All models can read DCP data. Failure patterns are task-type-specific, not DCP-specific.

## DCP Generation

| Model | valid_json | correct_order | has_all_fields |
|-------|:-:|:-:|:-:|
| phi3:mini | 3/3 | **0/3** | 0/3 |
| gemma2:2b | 3/3 | **0/3** | 3/3 |
| qwen2.5:1.5b | 3/3 | **0/3** | 0/3 |
| llama3.2:1b | 0/3 | **0/3** | 0/3 |
| qwen2.5:0.5b | 3/3 | **0/3** | 0/3 |

**correct_order = 0/3 across all models** when generating without schema constraint. LLMs produce valid JSON but cannot spontaneously maintain positional field ordering. Note: this tested unprompted generation only — the [controller pattern](../dcp/shadow-index#output-direction-shadow-index-as-controller) (presenting schema as output constraint) was not tested and may yield better results.

## NL vs DCP Accuracy

| Model | Test | NL | DCP | DCP ≥ NL |
|-------|------|:-:|:-:|:-:|
| phi3:mini | highest_score | 0/3 | **3/3** | ✓ |
| phi3:mini | filter_by_value | 0/3 | 0/3 | = |
| gemma2:2b | highest_score | 0/3 | **3/3** | ✓ |
| gemma2:2b | filter_by_value | 3/3 | 3/3 | = |
| llama3.2:1b | highest_score | 3/3 | 3/3 | = |
| llama3.2:1b | filter_by_value | **3/3** | 0/3 | ✗ |
| qwen2.5:0.5b | highest_score | 0/3 | 0/3 | = |
| qwen2.5:0.5b | filter_by_value | 0/3 | 0/3 | = |

**DCP never consistently loses to NL.** In 2 cases DCP outperforms NL — structured data is easier to extract from structured format.

## Schema Density

How much schema information should accompany data? Three density levels tested:

| Level | Description | Example |
|-------|-------------|---------|
| **Abbreviated** | Schema ID only | `$S:knowledge:v1` |
| **Expanded** | ID + field hints with types | `$S:knowledge:v1 [action(enum) domain detail confidence:0-1]` |
| **Full** | Complete JSON schema definition | `{"id":"knowledge:v1","fields":[...],"types":{...}}` |

### Density Results (5 models)

| Model | Abbreviated | Expanded | Full |
|-------|:-:|:-:|:-:|
| phi3:mini (3.8B) | 0/3 | **3/3** | **3/3** |
| gemma2:2b | 0/3 | 0/3 | **3/3** |
| qwen2.5:1.5b | 0/3 | **3/3** | **3/3** |
| llama3.2:1b | **3/3** | 0/3 | **3/3** |
| qwen2.5:0.5b | **3/3** | 0/3 | 0/3 |

No single density works for all models. Notation retest (JSON array vs custom syntax) produced identical results — **notation is not the variable, model capability is.**

## Shadow Level Comprehension

The density results led to a further question: what if we strip all protocol information and show only field names? Tested L0 (fields only), L2 (full `$S` protocol), L4 (NL key-value):

| Model | L0 (fields only) | L2 (full $S) | L4 (NL) |
|-------|:-:|:-:|:-:|
| **phi3:mini** | **9/9** | 6/9 | 6/9 |
| gemma2:2b | 3/9 | **6/9** | 3/9 |
| llama3.2:1b | **6/9** | 3/9 | 6/9 |

**L0 (fields only) is optimal for most lightweight models.** Protocol information (`$S`, schema ID, field count) adds no value at ≤4B and actively hurts comprehension.

## Conclusions

1. **DCP works for consumption at ≤3.8B.** Token savings come at no accuracy cost.

2. **Unprompted DCP generation fails at this size.** Schema-constrained generation (controller pattern) not yet tested.

3. **Density adaptation is justified.** No single level works for all models. The [agent-profile system](../dcp/agent-profile) is the correct design.

4. **L0 (fields only) is the right default for lightweight agents.** Strip protocol overhead, keep field names.

5. **phi3:mini (~3.8B) is the practical floor** for DCP consumption (reading).

6. **~17B is the threshold for reliable DCP generation.** Reading DCP works at ≤4B; writing/converting to positional arrays requires ~17B for full format compliance. See [Output Controller Format Comparison](#output-controller-format-comparison) below.

---

## Output Controller Format Comparison

This section tests **DCP generation** (AI → DCP output), distinct from the reading tests above.

### Setup

- **Task:** convert structured data to `ctrl-report:v1` positional arrays via controller prompt
- **Formats tested:** `$S` (positional array with header), `table` (markdown), `kv` (JSON key-value)
- **Models:** phi3:mini (3.8B), qwen2.5:3b (3B), llama-3.1-8b (8B), llama-4-scout-17b (17B), Claude Haiku
- **n:** 1, 5, 10 rows per run
- **Date:** 2026-03-31

### Compliance Rate (n=10)

| Model | Size | $S | table | kv |
|-------|------|----|-------|----|
| phi3:mini | 3.8B | 0% | 90% | 80% |
| qwen2.5:3b | 3B | 0% | 20% | 100% |
| llama-3.1-8b | 8B | 0% | 0% | 100% |
| llama-4-scout-17b | 17B | **100%** | **100%** | **100%** |
| Claude Haiku | — | **100%** | **100%** | **100%** |

### Failure Patterns

- **$S format:** all sub-17B models fail. Field name row output as data (1-row offset), `None` instead of `null`, escaped JSON inside arrays
- **table format:** `cost` field stringified as `"42"` instead of `42` — cell borders strip numeric type context. Improves with more rows as column headers act as persistent guide
- **kv format:** most robust for sub-10B. Failures include null field omission, hallucinated string values, extra fields

### Input Token Efficiency (n=10, Haiku)

| Format | Input tokens |
|--------|-------------|
| $S | 264 |
| table | 311 (+18%) |
| kv | 317 (+20%) |

table vs kv token difference is negligible (~2%) — format choice should be based on compliance rate, not token cost.

### Conclusions

1. **$S format requires ~17B+** for reliable generation. Below this, positional header confuses models.
2. **kv is the safest format for sub-10B** — most stable compliance, explicit field mapping.
3. **table improves with row count** — column headers act as persistent guide (phi3:mini: 0%→90% from n=1 to n=10).
4. **At ~17B all formats are equivalent** — use $S for token efficiency.
5. **Controller design validated:** model outputs key-value, system converts to positional array — correct approach for sub-17B deployments.
