# Interoperability Profiles

XanaNode keeps its author-facing JSON simple, but it should map cleanly to established standards.

## JSON-LD

The canonical JSON-LD context lives at [../contexts/xananode.context.jsonld](../contexts/xananode.context.jsonld).

Implementations should use the context when exporting nodes, relationships, fragments, and substrate packages into Linked Data environments.

## Web Annotation Selectors

Fragment selectors should use Web Annotation selector names where possible:

- `TextQuoteSelector`
- `TextPositionSelector`
- `FragmentSelector`
- `CssSelector`
- `XPathSelector`
- `RangeSelector`

The older `semantic-anchor` selector remains acceptable for human-authored stable anchors.

## PROV-O

XanaNode provenance fields map to PROV-O concepts:

- nodes and relationship assertions are `prov:Entity`
- people, organizations, projects, and external actors are `prov:Agent`
- creation, assertion, review, import, and publication are `prov:Activity`
- `created_by` maps to `prov:wasAttributedTo`
- `created_at` maps to `prov:generatedAtTime`
- `derived_from` maps to derivation provenance

## Content IDs

Human-readable protocol IDs remain the stable author-facing identifiers. Implementations may add immutable content identifiers:

- `protocol_id`: stable XanaNode ID
- `content_id`: immutable hash or CID-like identity for the content
- `version_id`: version identity such as a Git commit/path reference

Content IDs should not replace protocol IDs. They support verification, fixity, and preservation.

## Preservation Packages

Substrates may include RO-Crate-compatible companion metadata named `ro-crate-metadata.json`. This metadata should describe the substrate package, schema references, rights, authorship, fixity, and dependencies.

## Nanopublication Profile

High-value claim nodes may be exported in a nanopublication-like package separating:

- assertion
- provenance
- publication information

This is optional but useful for scholarly, legal, scientific, and archival substrates.
