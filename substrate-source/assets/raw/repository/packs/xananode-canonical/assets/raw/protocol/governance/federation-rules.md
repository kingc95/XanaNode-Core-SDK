# Federation Rules

Federation connects independently authored substrates without forcing one source of truth.

A federation process should:

1. Load each substrate manifest.
2. Resolve each substrate's Git repository metadata.
3. Validate each substrate against declared schemas.
4. Preserve original node IDs and namespaces.
5. Detect likely overlaps.
6. Generate mapping relationships.
7. Preserve conflicts and uncertainty.
8. Avoid destructive merging.

Federation should create more knowledge, not erase local context.

## Never Collapse by Default

Two nodes that look similar should not automatically become one node.

Prefer:

- `same_entity`
- `possible_match`
- `disputed_identity`
- `equivalent_to`

depending on confidence and review status.
