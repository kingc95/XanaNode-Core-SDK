# XNP-0005: Transclusion

Status: Experimental

## Summary

Defines inclusion by reference rather than copying.

The initial interoperable form uses a `transcludes` relationship from a consuming node to a fragment node with a stable `tumbler` address.

## Motivation

XanaNode aims to support independently authored knowledge substrates that can later interoperate. This proposal records the design expectations for transclusion so implementations can converge without requiring centralized control.

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
