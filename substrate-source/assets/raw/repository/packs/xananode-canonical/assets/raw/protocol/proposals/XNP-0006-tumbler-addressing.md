# XNP-0006: Tumbler Addressing

Status: Experimental

## Summary

Defines persistent addressing for nodes and fragments.

The initial accepted profile is:

```text
<namespace>:<node-kind>/<local-id>
<namespace>:<node-kind>/<local-id>@<version-id>
<namespace>:<node-kind>/<local-id>@<source-version-id>#fragment/<fragment-id>@<fragment-version-id>
```

## Motivation

XanaNode aims to support independently authored knowledge substrates that can later interoperate. This proposal records the design expectations for tumbler addressing so implementations can converge without requiring centralized control.

## Requirements

- Must remain human-readable.
- Must remain machine-interpretable.
- Must preserve provenance.
- Must avoid destructive merging.
- Must allow independent substrate ownership.

## Open Questions

- What is the smallest useful implementation?
- Which parts are required for compatibility?
- Which parts should remain optional or experimental?
