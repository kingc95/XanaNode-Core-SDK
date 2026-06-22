# XNP-0004: Merge Validation

Status: Draft

## Summary

Defines merge reports and compatibility checks.

## Motivation

XanaNode aims to support independently authored knowledge substrates that can later interoperate. This proposal records the design expectations for merge validation so implementations can converge without requiring centralized control.

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
