# Implementation Compatibility

An implementation may describe itself as XanaNode-compatible when it validates, emits, imports, or projects XanaNode protocol artifacts according to the canonical specification and registries.

Implementations should identify themselves clearly and reference the canonical specification:

```text
This project is a XanaNode-compatible implementation.
Canonical specification: https://github.com/kingc95/XanaNode
```

If the implementation supports only part of the protocol, it should say so:

```text
This project is a partial XanaNode-compatible renderer for mounted substrate packs.
```

Implementations should not imply they are the canonical XanaNode project unless they are maintained as part of the canonical project. Compatibility means interoperability, not ownership.

Recommended metadata:

```json
{
  "implements": "xananode-protocol",
  "compatibility": "xananode-compatible",
  "specification": "https://github.com/kingc95/XanaNode",
  "supported_artifacts": ["substrate.json", "nodes.json", "relationships.json"]
}
```

This convention supports legal attribution, community attribution, brand recognition, and independent federation.

