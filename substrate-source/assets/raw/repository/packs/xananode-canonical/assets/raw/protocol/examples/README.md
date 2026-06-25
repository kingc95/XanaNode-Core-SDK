# XanaNode Examples

These examples are protocol examples, not full applications.

They show how a substrate can declare a namespace, define nodes, create typed relationships, extend the core schema, and produce a federation merge report.

## Examples

- `minimal-substrate/` — the smallest useful XanaNode substrate.
- `custom-extension-substrate/` — a substrate that adds custom namespace-specific types.
- `federation-example/` — two independently authored substrates plus a merge report.

The examples intentionally use JSON files instead of a specific CMS, static-site generator, database, or graph renderer. Implementations may store the same structures in Markdown front matter, a database, RDF, graph stores, or other formats.
