# Merge Validation

Merge validation checks whether multiple substrates can be analyzed together.

It should verify:

- each substrate has a namespace
- each node has a stable ID
- relationship types are declared
- custom types are declared
- required fields exist
- target nodes can be resolved or marked external
- conflicts are reported rather than silently overwritten

A merge report is not a final truth statement. It is a record of what the merge process found.
