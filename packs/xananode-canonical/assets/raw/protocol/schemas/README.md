# Schemas

This directory contains the machine-readable registry and validation artifacts for XanaNode.

The current layout is versioned and split between canonical type registries and JSON Schemas that validate substrate metadata and reports.

Core files:

- [xananode-node-types.v0.3.0.json](xananode-node-types.v0.3.0.json)
- [xananode-node-types.schema.v0.3.0.json](xananode-node-types.schema.v0.3.0.json)
- [xananode-relationship-types.v0.5.0.json](xananode-relationship-types.v0.5.0.json)
- [xananode-relationship-types.schema.v0.5.0.json](xananode-relationship-types.schema.v0.5.0.json)
- [substrate-manifest.schema.json](substrate-manifest.schema.json)
- [substrate-node.schema.json](substrate-node.schema.json)
- [substrate-relationships.schema.json](substrate-relationships.schema.json)
- [property-registry.schema.json](property-registry.schema.json)
- [xananode-property-registry.v0.1.0.json](xananode-property-registry.v0.1.0.json)
- [substrate-layout.schema.json](substrate-layout.schema.json)
- [xananode-substrate-layout.v0.1.0.json](xananode-substrate-layout.v0.1.0.json)
- [namespace.schema.json](namespace.schema.json)
- [merge-report.schema.json](merge-report.schema.json)
- [compatibility-report.schema.json](compatibility-report.schema.json)
- [substrate-diff.schema.json](substrate-diff.schema.json)
- [author-profile.schema.json](author-profile.schema.json)
- [nanopublication.schema.json](nanopublication.schema.json)
- [ro-crate-metadata.schema.json](ro-crate-metadata.schema.json)

The versioned registry files define the canonical core node, relationship, property, and substrate layout conventions. The schema files describe the required structure of each registry plus related substrate and compatibility documents.

Schemas and schema registries are licensed under `Apache-2.0` so implementations can adopt them freely while preserving attribution and provenance.
