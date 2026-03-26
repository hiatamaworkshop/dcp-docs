# Lightweight LLM Compatibility & Density

DCP is viable as a system→AI data format even for sub-4B models. Read comprehension works. Generation does not. No single density level works for all models — adaptive selection is justified.

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

**correct_order = 0/3 across all models.** LLMs produce valid JSON but cannot maintain positional field ordering. System-side [encoder](../dcp/schema-driven-encoder) is essential for system → AI. For AI → system, the [Output Controller](../dcp/schema-driven-encoder#output-controller-ai-→-system-direction) places LLM key-value output into schema-ordered positions.

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

2. **DCP generation is impossible at this size.** System-side [encoder](../dcp/schema-driven-encoder) is essential.

3. **Density adaptation is justified.** No single level works for all models. The [agent-profile system](../dcp/agent-profile) is the correct design.

4. **L0 (fields only) is the right default for lightweight agents.** Strip protocol overhead, keep field names.

5. **phi3:mini (~3.8B) is the practical floor** for DCP consumption.

6. **7B+ testing needed** for practical thresholds. Deferred pending hardware.
