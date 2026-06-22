# XNP-0002: Extension Schemas

Status: Accepted

## Summary

Defines how custom node and relationship types are declared.

## Motivation

XanaNode aims to support independently authored knowledge substrates that can later interoperate. This proposal records the design expectations for extension schemas so implementations can converge without requiring centralized control.

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
