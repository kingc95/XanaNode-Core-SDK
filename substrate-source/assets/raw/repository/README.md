# XanaNode Core SDK

`@xananode/core` is a renderer-independent reference implementation for the XanaNode protocol.

Canonical protocol statement:

XanaNode is a protocol for independently authored knowledge substrates that preserve relationships, provenance, lineage, disagreement, and addressable fragments, so knowledge can move across tools and media without losing its structure.

It exists to keep protocol behavior out of any one presentation layer. Hugo, Studio, CLIs, AI agents, and future renderers should be able to use the same substrate parser, validator, graph builder, fragment engine, and exporter.

The current reference implementation is Node-based, but the protocol contract should not depend on Node being embedded everywhere. This package is the reference behavior for a future stable `xananode-core` executable surface that other tools can call regardless of their language or UI stack.

This project is a XanaNode-compatible reference implementation. Canonical specification: `https://github.com/kingc95/XanaNode`. Reference code, schemas, and validators are licensed under `Apache-2.0`; protocol documentation is licensed separately under `CC-BY-4.0`.

This repository also publishes its own explicit substrate source at `substrate-source/`. That folder is generated from the Core SDK repository itself so higher layers can federate with Core as a normal substrate instead of re-deriving Core facts ad hoc.

## What this package does

- Reads XanaNode substrate manifests.
- Reads Markdown nodes with YAML front matter.
- Creates protocol IDs from namespaces, node types, and local IDs.
- Builds typed relationship records.
- Generates block fragments and authored fragment records.
- Detects `xana://...` references and Hugo-style `{{< xana ref="..." >}}` shortcodes.
- Builds review suggestions for possible links, transclusions, incoming relationships, merge candidates, and new imported nodes.
- Loads mounted, imported, and merged substrates from protocol artifact directories or `.substrate` bundles.
- Analyzes incoming substrates against an existing substrate before merge/import.
- Builds portable canonical substrate bundles from one or more authored substrate roots.
- Validates generated artifacts against bundled XanaNode schemas.
- Writes canonical protocol artifacts independent of Hugo.
- Provides a CLI for `init`, `validate`, `build`, `build-pack`, and `inspect`.

In current XanaNode language, the substrate is the thing. A `.substrate` file is a packaged substrate for transport or release. The `build-pack`, `loadSubstratePack`, and related helper names remain in Core for compatibility, but downstream tools should present these as substrate import/export actions rather than as a separate conceptual layer.

## Why this exists

The Hugo implementation originally contained a lot of protocol-adjacent behavior in its build script. This SDK extracts that behavior into a reusable layer:

```text
XanaNode Protocol
        |
XanaNode Core SDK
        |
Hugo theme / Studio / CLI / Hub / AI tools / third-party renderers
```

Hugo should be a renderer and preview surface, not the only place where protocol behavior lives.

## Local development

Clone with submodules so the bundled protocol schemas are present:

```bash
git clone --recurse-submodules https://github.com/kingc95/XanaNode-Core-SDK.git
cd XanaNode-Core-SDK
npm install
npm test
```

If the repository was already cloned without submodules:

```bash
npm run protocol:init
npm install
npm test
```

## Install locally for CLI testing

```bash
npm install
npm link
```

Then:

```bash
xananode init ./my-substrate --name "My Substrate" --namespace my
xananode validate ./my-substrate
xananode build ./my-substrate --out ./my-substrate/public
xananode build-pack ./my-substrate --out ./packs/my-substrate-pack
xananode build-pack --out ./packs/xananode-canonical
xananode build-pack --out ./packs/xananode-canonical --bundle-jsonl
```

The same CLI is also exposed under the stable protocol-facing name:

```bash
xananode-core inspect ./my-substrate --json
xananode-core build ./my-substrate --out ./public --json
xananode-core bundle ./my-substrate --out ./dist --json
```

`build-pack` can now emit multiple interchangeable artifact shapes from the same substrate data:

- split protocol artifacts: `substrate.json`, `nodes.json`, `relationships.json`, and `nodes/*.json`
- `substrate-bundle.json`: one mass JSON file with the manifest, all nodes, authored text, summaries, relationships, warnings, and pack report
- `substrate-bundle.jsonl`: the same bundle as JSON Lines for line-oriented or streaming ingestion

Use `--no-split-artifacts` when you want the single-file formats only, `--no-bundle-json` when you want only split artifacts, and `--bundle-jsonl` when you want the JSONL companion too.

## Programmatic usage

```js
import {
  analyzeSubstrateIntake,
  buildSubstrate,
  loadSubstratePack,
  writeSubstrateArtifacts
} from "@xananode/core";

const substrate = await buildSubstrate("./my-substrate");
console.log(substrate.protocolNodes.length);
console.log(substrate.relationships.length);
console.log(substrate.validation);

const intake = analyzeSubstrateIntake(substrate, {
  nodes: incomingProtocolNodes,
  relationships: incomingRelationships
});
console.log(intake.merge_candidates);
console.log(intake.relationship_imports);

const mountedPack = loadSubstratePack("./packs/lineage", {
  pack: { id: "lineage", mode: "mounted" }
});
console.log(mountedPack.nodes.length);
console.log(mountedPack.relationships.length);

await writeSubstrateArtifacts("./my-substrate", "./public");
```

Pack composition modes are protocol terms:

- `mounted`: available for rendering, traversal, and analysis without local ownership.
- `imported`: copied into generated local artifacts with pack provenance.
- `merged`: reconciled with local identity, conflicts, and review policy.

`absorbed` is accepted as a legacy alias for `imported`.

## CLI

### Initialize a substrate

```bash
xananode init ./example --name "Example Substrate" --namespace example --author "Example Author"
```

### Validate

```bash
xananode validate ./example
```

### Build artifacts

```bash
xananode build ./example --out ./example-public
```

This writes:

```text
substrate.json
relationships.json
xananode-fragments.json
xananode-suggestions.json
validation.json
nodes/*.json
```

### Build a portable substrate bundle

```bash
xananode build-pack ./example --out ./packs/xananode-canonical
```

This writes a portable substrate directory containing `substrate.json`, `relationships.json`, `nodes/*.json`, and `pack-report.json`. Downstream renderers can mount that substrate without owning its content.

When `build-pack` is run without source directories, Core exports the XanaNode canonical pack shape from the Core generator:

```bash
xananode build-pack --out ./packs/xananode-canonical
```

For XanaNode stack development, the source of truth for that generated substrate is the sibling public repository:

```text
../XanaNode-Canonical-Substrate
https://github.com/kingc95/XanaNode-Canonical-Substrate
```

Use the workspace-level assembler from `XanaNode-Master` to refresh that repository:

```bash
npm run substrates:build
```

That root build now also refreshes Core's bundled fixture from the canonical repo automatically.

`packs/xananode-canonical` is only a package/offline bootstrap fixture for Core releases. It is not the canonical working copy, and downstream tools should not mount it when the sibling substrate repo or registry target is available. Do not edit it directly.

For package maintenance before a Core release, run:

```bash
npm run update:canonical-pack
```

That command no longer regenerates the bundle from inside Core. It copies the current sibling `XanaNode-Canonical-Substrate` into `packs/xananode-canonical` and writes fixture metadata so the source of truth stays unambiguous.

The canonical substrate is protocol JSON, not Hugo markdown. It ships nodes for the XanaNode protocol, Core SDK, Hugo projection layer, Workspace, public repositories, official domains, stack technologies, current node types, schema artifacts, primary media, and a starting trail through the stack. Core also copies canonical raw protocol files into `assets/raw/protocol/` and records their `asset_path`, `source_snapshot`, and `sha256` content ids on the relevant nodes.

## Renderer integration status

This package is the protocol implementation layer used by downstream XanaNode packages. `XanaNode-Hugo` includes this SDK as a submodule and validates generated protocol artifacts through Core, while still keeping Hugo-specific output such as templates, `/index.json`, preview bridge files, and static-site UI assets in the theme.

Recommended split:

- Core SDK owns parsing, validation, graph creation, fragments, transclusion reference detection, intake analysis, suggestions, and artifact writing.
- Core SDK owns pack loading, mounted/imported/merged pack semantics, dependency resolution, merge candidates, relationship intake, and transclusion/link suggestions.
- Hugo owns templates, layouts, shortcodes, CSS, graph UI, static-site rendering, and asking Core to resolve configured packs at build time.
- Workspace owns substrate folders, authors, Git workflows, media import, pack enable/disable controls, import/merge review, build orchestration, and health checks.
- Studio owns editing UX, preview orchestration, relationship selection, and desktop workflow.

## Design notes

### Git remains the versioning layer

XanaNode Core does not try to replace Git. Studio can later wrap Git in friendlier language:

- commit -> save snapshot
- branch -> draft path
- merge -> bring changes together
- pull request -> propose changes
- diff -> what changed

### Static-first, server-optional

Core writes files. Anything can publish them: Hugo, GitHub Pages, Netlify, an archive, an AI memory index, or a federation hub.

### Canonical versus renderer-specific

The SDK treats `substrate.json`, relationship records, node records, and fragment records as protocol artifacts. HTML is downstream.

## Executable direction

For now, Core ships as a Node CLI and library. The intended protocol-grade boundary is a stable `xananode-core` command contract that can later be packaged as a self-contained executable without changing what callers expect.

That executable contract should expose the same responsibilities already present here:

- `validate`
- `inspect`
- `build`
- `bundle`
- `analyze-intake`
- `projection`

Callers should be able to pass substrate folders, `.substrate` archives, `substrate-bundle.json`, or `substrate-bundle.jsonl`, request structured JSON output, and receive stable machine-readable results without scraping human log text.

Current CLI aliases and machine-facing behavior:

- `xananode-core` is the preferred stable command name
- `xananode` remains available for compatibility
- `build-pack` has the stable alias `bundle`
- `--json` returns a structured result envelope on stdout
- failures with `--json` return a structured error envelope on stderr plus a non-zero exit code

## Core substrate source

Regenerate the Core repo's own substrate source:

```powershell
node tools/build-substrate-source.mjs
```

Or from the `XanaNode-Master` workspace root:

```powershell
npm run core:build-substrate-source
```

## Windows executable packaging

Inside `XanaNode-Master`, Core can be packaged as a Windows executable launcher plus a sibling runtime tree:

```bash
npm run package:win
```

or from the master root:

```bash
npm run executables:build:core
```

This writes:

- `dist/win-x64/xananode-core.exe`
- `dist/win-x64/app/`

Keep the exe and `app/` directory together. The executable carries its own Node runtime and does not require a separate system Node install.
