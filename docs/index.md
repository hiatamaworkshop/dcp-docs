---
layout: home

hero:
  name: Data Cost Protocol
  text: Structured Data Delivery for AI Agents
  tagline: Positional arrays, schema registry, and adaptive density — because JSON was designed for humans, not for agents
  actions:
    - theme: brand
      text: Read the Spec
      link: /dcp/specification
    - theme: alt
      text: See the Research
      link: /research/format-comparison

features:
  - title: Positional Arrays
    details: Drop keys, keep order. Schema-defined field positions eliminate redundant key repetition. Same data, fewer tokens.
    link: /dcp/specification
  - title: Multi-Level Shadow Index
    details: Communication mode spectrum from abbreviated (L0) to full NL fallback. Dynamically selected per agent capability.
    link: /dcp/shadow-index
  - title: Schema-Driven Encoder
    details: Schema as single source of truth. Load a schema, get an encoder. No domain knowledge in code — new data types are config, not programming.
    link: /dcp/schema-driven-encoder
  - title: Native Operations
    details: DCP as a processing format. Seven primitives — filter, project, sort, agg, join, reshape, split — for brain AIs that operate on positional arrays without decoding.
    link: /dcp/native-ops
  - title: Agent Profile Adaptation
    details: Observe per-agent error rates, adjust hint density automatically. TCP slow-start for data formats.
    link: /dcp/agent-profile
  - title: Empirical Validation
    details: 108-call format comparison across 3 models. DCP matches or beats JSON at 2B+ parameters. Data, not assumptions.
    link: /research/format-comparison
---