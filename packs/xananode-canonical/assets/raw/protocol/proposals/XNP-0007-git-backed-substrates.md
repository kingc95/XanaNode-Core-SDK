# XNP-0007: Git-Backed Substrates

Status: Accepted

## Summary

Defines Git as the required versioning and history layer for production XanaNode substrates.

## Decision

Each production substrate is a Git repository. The substrate manifest must include a `repository` block describing the Git remote and default branch.

Git provides:

- revision history
- branching
- review
- merge
- synchronization
- rollback

XanaNode provides:

- node and relationship artifacts
- schema validation
- provenance fields
- merge and compatibility reports
- federation semantics

## Rationale

XanaNode should not reinvent distributed version control. Git already provides the substrate-level history model that knowledge authors need, while XanaNode adds knowledge-specific structure on top.

User-facing tools may rename Git concepts for approachability, such as "save snapshot" for commit or "draft path" for branch, but the underlying substrate history remains Git.
