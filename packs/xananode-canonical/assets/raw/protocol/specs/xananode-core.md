# XanaNode Core

XanaNode is an open protocol for interoperable knowledge substrates.

The core specification defines the shared vocabulary, object model, and protocol-level assumptions used across the rest of the repository.

## Scope

- the canonical node registry in [schemas/xananode-node-types.v0.3.0.json](../schemas/xananode-node-types.v0.3.0.json)
- the canonical relationship registry in [schemas/xananode-relationship-types.v0.5.0.json](../schemas/xananode-relationship-types.v0.5.0.json)
- the versioned JSON Schemas that validate those registries

## Core Model

The current node registry centers on person, concept, claim, source, essay, and observation.

The current relationship registry centers on definitions, evidence, claim structure, lineage, identity, creation, participation, location, revision, and related semantic links.

The core model is designed to preserve provenance and disagreement rather than flattening distinct knowledge states into one asserted fact.
