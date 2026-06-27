# Federation Example

This example shows how two independently authored substrates can be compared and partially merged without forcing a single source of truth.

- `substrate-a/` models "knowledge substrate" as a concept.
- `substrate-b/` models "memory substrate" as a similar concept.
- `review-workspace/` shows the temporary mounted review state where both concepts stay visible together with their possible-match overlap.
- each substrate records an outbound `possible_match` relationship to the other substrate's local concept.
- `merge-report.json` records the result of a federation/merge pass, including the decision to preserve both local concepts instead of collapsing them.
- `compatibility-report.json` records the practical compatibility level reached by the example.
- `substrate-diff.json` shows the exact node and relationship additions that appear when the two substrates are analyzed together.

The merge report does not overwrite either substrate. It records a reviewable mapping, keeps both local nodes intact, and makes the overlap explicit enough for tools to compare, mount, inspect, or later merge with human approval. The review workspace exists so the example does not stop at prose about merge behavior; it also shows an openable temporary substrate where the overlap is already visible.
