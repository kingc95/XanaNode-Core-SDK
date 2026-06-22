# XNP-0010: Federation Discovery and Trust

Status: Accepted

## Summary

Defines optional discovery and trust metadata in substrate manifests.

## Decision

Substrate manifests may include:

- federation inbox
- federation outbox
- subscription or feed URL
- merge report endpoint
- mapping endpoint
- signature metadata
- public key metadata
- trust scopes

Trust scopes are:

- `local_substrate`
- `imported_schema`
- `mapping`
- `assertion`

## Rationale

Git-backed substrates can federate through repository exchange, but active federation benefits from discoverable update and mapping endpoints. Signatures and public keys provide a path toward verifiable manifests, merge reports, mappings, and assertions.
