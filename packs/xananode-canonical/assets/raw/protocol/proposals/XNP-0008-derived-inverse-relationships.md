# XNP-0008: Derived Inverse Relationships

Status: Accepted

## Summary

Defines inverse relationship labels as derived views rather than separate canonical relationship types.

## Decision

Canonical relationship types are authored in one direction only. A relationship type may declare an `inverse` label for display, querying, or generated indexes, but the inverse should not be registered as a second canonical type.

Example:

```json
{
  "type": "created",
  "inverse": "created_by"
}
```

A relationship record should store:

```json
{
  "source": "example:person/alice",
  "target": "example:essay/intro",
  "type": "created"
}
```

An implementation may display `created_by` when viewing the target node, but should not store a second `created_by` relationship type or edge.

## Rationale

Registering both directions bloats the canonical vocabulary and creates avoidable consistency risks:

- duplicate relationship type definitions
- mismatched inverse pairs
- dangling inverse types
- unnecessary authoring choices
- harder validation

Derived inverse views keep the graph navigable in both directions without doubling the protocol vocabulary.
