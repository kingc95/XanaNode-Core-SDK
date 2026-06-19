# XanaNode Core SDK

`@xananode/core` is a renderer-independent reference implementation for the XanaNode protocol.

It exists to keep protocol behavior out of any one presentation layer. Hugo, Studio, CLIs, AI agents, and future renderers should be able to use the same substrate parser, validator, graph builder, fragment engine, and exporter.

This project is a XanaNode-compatible reference implementation. Canonical specification: `https://github.com/kingc95/XanaNode`. Reference code, schemas, and validators are licensed under `Apache-2.0`; protocol documentation is licensed separately under `CC-BY-4.0`.

## What this package does

- Reads XanaNode substrate manifests.
- Reads Markdown nodes with YAML front matter.
- Creates protocol IDs from namespaces, node types, and local IDs.
- Builds typed relationship records.
- Generates block fragments and authored fragment records.
- Detects `xana://...` references and Hugo-style `{{< xana ref="..." >}}` shortcodes.
- Builds review suggestions for possible links, transclusions, incoming relationships, merge candidates, and new imported nodes.
- Loads mounted, imported, and merged substrate packs from protocol artifact directories.
- Analyzes incoming substrate packs against an existing substrate before merge/import.
- Builds portable canonical substrate packs from one or more authored substrate roots.
- Validates generated artifacts against bundled XanaNode schemas.
- Writes canonical protocol artifacts independent of Hugo.
- Provides a CLI for `init`, `validate`, `build`, `build-pack`, and `inspect`.

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
```

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

### Build a substrate pack

```bash
xananode build-pack ./example --out ./packs/xananode-canonical
```

This writes a portable pack directory containing `substrate.json`, `relationships.json`, `nodes/*.json`, and `pack-report.json`. Downstream renderers can mount that pack without owning its content.

When `build-pack` is run without source directories, Core exports the bundled XanaNode canonical pack:

```bash
xananode build-pack --out ./packs/xananode-canonical
```

That bundled pack is protocol JSON, not Hugo markdown. It ships nodes for the XanaNode protocol, Core SDK, Hugo projection layer, Workspace, public repositories, official domains, stack technologies, current node types, schema artifacts, primary media, and a starting trail through the stack.

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
