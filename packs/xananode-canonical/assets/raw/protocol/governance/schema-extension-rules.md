# Schema Extension Rules

Substrates may define custom node and relationship types.

Custom types must be:

- namespaced
- versioned
- human-readable
- machine-readable
- preserved even when not understood
- optionally mapped to a core type

A valid extension should include:

- `id`
- `namespace`
- `type`
- `label`
- `purpose` or `meaning`
- `core: false`
- optional `extends`

Unknown extension types should not break import. They should be marked opaque and preserved.
