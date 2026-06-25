# XanaNode Canonical Substrate

This repository-shaped folder is the living canonical XanaNode substrate.

It is not just a compiled viewer output. It carries the canonical nodes, relationships, protocol artifacts, raw source snapshots, media assets, registry records, governance files, software stack records, branding records, and build report used to federate XanaNode into other substrates.

Run this from the XanaNode-Master workspace to refresh it:

```powershell
npm run substrates:build
```

The portable archive is written to `dist/` as a `.substrate` file.

For LLM handoff and simpler interchange, this repo also writes:

- `substrate-bundle.json` - one mass JSON file with the manifest, all nodes, all relationships, summaries, authored content, warnings, and pack report
- `substrate-bundle.jsonl` - the same bundle as JSON Lines for tools that prefer streaming or line-oriented ingestion
