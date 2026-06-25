# XanaNode Studio Guidance

XanaNode Studio is an editor concept for local-first knowledge substrate authoring.

It should be understood as:

> VS Code for knowledge substrates, hiding Git until the user is ready.

## Principles

- Do not reinvent Git.
- Use Git as the substrate versioning layer.
- Present Git concepts in human language first.
- Keep the published substrate preview close to the real Hugo/static output.
- Make validation actionable rather than cryptic.

## Git UX Translation

| Git concept | Studio language |
|---|---|
| commit | save snapshot |
| branch | draft path |
| merge | bring changes together |
| pull request | propose changes |
| diff | what changed |
| log | history |

Power users may reveal the Git layer directly.

## Core Workspace

Studio should use a three-panel model:

- catalog and tools
- live substrate view
- node editor

The catalog is not a file tree. It should provide views by node type, trail, source, author, status, confidence, relationship cluster, recent edits, validation issues, unlinked nodes, and contradicted claims.

## MVP

The first useful Studio should support:

- create or open a substrate repo
- show a node catalog
- edit node content and metadata
- add relationships with autocomplete
- run validation
- preview the Hugo implementation
- save snapshots using Git
- publish to GitHub Pages

## Assistants

Future Studio assistants may include:

- friendly validation repair
- relationship suggestion
- fragment maker
- trail builder
- source importer
- media importer
- review workflow
- conflict UI
- extension marketplace
