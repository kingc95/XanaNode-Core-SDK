# Implementations

Known or planned XanaNode implementations.

## Reference Implementations

- [XanaNode Hugo Theme](https://github.com/kingc95/xananode-hugo) - static-site renderer and graph viewer for XanaNode-compatible substrates.

## Repository Roles

- This repository defines the protocol, schemas, examples, governance, registry, and validation tooling.
- The Hugo repository implements rendering and browsing behavior for concrete substrates.
- Implementation-specific templates, assets, build scripts, and theme behavior should live in the Hugo repository.
- Protocol-level schema changes, canonical type changes, and validation rules should live in this repository.

## Possible Future Implementations

- desktop editor
- Obsidian plugin
- VS Code extension
- Neo4j importer/exporter
- static JSON explorer
