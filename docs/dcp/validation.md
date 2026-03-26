# Validation & Handshake

## Schema Pre-Methods

> **Status: Design only.** Not yet implemented. Defined here as future infrastructure for multi-agent handshakes.

DCP schemas define four interaction verbs — frozen at four:

| Method | Meaning | Example |
|--------|---------|---------|
| `$S?` | Schema query — "what schema is this?" | Parse unknown data |
| `$S!` | Schema declaration — "I'm sending this schema" | Handshake |
| `$SV` | Schema validation — "does this conform?" | Quality check |
| `$S+` | Schema expansion — "give me the full definition" | Learning |

These are infrastructure for future multi-agent handshakes, not yet actively triggered by current agents.

## Validation Philosophy

DCP validation follows the passive education principle:

1. **Never reject data** — accept everything, even non-compliant input
2. **Warn on violation** — attach expanded schema hint to response
3. **Cost gradient as incentive** — compliant data is cheaper to process
4. **Schema hash for cache** — `$S:id#hash` enables consumers to skip re-parsing known schemas

The system does not enforce compliance. It makes compliance cheaper than non-compliance.