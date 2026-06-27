# Namespaces

Namespaces prevent independently authored substrates from colliding.

A namespace identifies who owns a local vocabulary or substrate.

Examples:

```text
xananode:claim
example.merge:report/federation-example-001
example.researcher_a:concept/knowledge-substrate
```

The core namespace is `xananode`.

Custom substrates should use their own namespace.

A namespace should be declared in a substrate manifest and in any extension schema files.
