# Versioning Policy

XanaNode protocol files use semantic versioning where practical.

- Patch versions fix wording or validation mistakes.
- Minor versions add compatible types, fields, or examples.
- Major versions change compatibility expectations.

Schemas should be versioned independently from individual substrates.

Substrates should declare which core schema version they target.

Substrate history should be tracked in Git. Protocol version fields describe schema compatibility; Git commits describe concrete substrate revisions.

Example:

```json
{
  "schema_version": "xananode-core@0.5.0"
}
```

Breaking changes should go through the proposal process.
