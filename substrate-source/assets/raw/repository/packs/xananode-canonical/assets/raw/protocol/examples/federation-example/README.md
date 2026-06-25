# Federation Example

This example shows how two independently authored substrates can be compared without forcing a single source of truth.

- `substrate-a/` models "knowledge substrate" as a concept.
- `substrate-b/` models "memory substrate" as a similar concept.
- each substrate records an outbound `possible_match` relationship to the other substrate's local concept.
- `merge-report.json` records the result of a federation/merge pass, including the decision not to collapse the two concepts.
- `compatibility-report.json` records the practical compatibility level reached by the example.

The merge report does not overwrite either substrate. It creates mapping claims and compatibility notes so the two graphs can be analyzed together.
