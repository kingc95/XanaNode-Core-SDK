# Federation

Federation is the process of connecting independently authored XanaNode substrates.

Federation does not require one canonical truth source.

Instead, it preserves local substrates and creates mappings among them.

## Federation Inputs

- substrate manifests
- node registries
- relationship registries
- custom extension schemas
- provenance metadata
- merge reports

## Federation Outputs

- compatibility reports
- identity mappings
- schema mappings
- conflict reports
- combined analysis views

## Core Rule

Never merge by destroying context.

Merge by adding structure.

## Pack Composition

Federation, local pack ingress, and substrate merging share one protocol model. A pack is a bounded substrate or substrate fragment that can be composed with another substrate in one of three modes:

- `mounted`: keep the external governance boundary. The receiving substrate may render, traverse, cite, and analyze the pack without copying it into canonical local authorship.
- `imported`: copy pack records into generated local artifacts while preserving provenance and pack metadata. Import does not imply duplicate collapse or identity reconciliation.
- `merged`: reconcile the incoming pack with local records through explicit identity mappings, merge candidates, conflict reports, and review policy.

Mounting is reversible and is the default for optional packs. Importing is an auditable intake step. Merging is a stronger federation operation and must preserve disagreement, provenance, and local context instead of overwriting them.
