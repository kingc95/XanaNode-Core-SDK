# XanaNode Core SDK

`@xananode/core` is a renderer-independent reference implementation for the XanaNode protocol.

It exists to keep protocol behavior out of any one presentation layer. Hugo, Studio, CLIs, AI agents, and future renderers should be able to use the same substrate parser, validator, graph builder, fragment engine, and exporter.

## What this package does

- Reads XanaNode substrate manifests.
- Reads Markdown nodes with YAML front matter.
- Creates protocol IDs from namespaces, node types, and local IDs.
- Builds typed relationship records.
- Generates block fragments and authored fragment records.
- Detects `xana://...` references and Hugo-style `{{< xana ref="..." >}}` shortcodes.
- Builds review suggestions for possible links and transclusions.
- Validates generated artifacts against bundled XanaNode schemas.
- Writes canonical protocol artifacts independent of Hugo.
- Provides a CLI for `init`, `validate`, `build`, and `inspect`.

## Why this exists

The Hugo implementation already contains a lot of protocol-adjacent behavior in its build script. This SDK extracts that concept into a reusable layer:

```text
XanaNode Protocol
        ↓
XanaNode Core SDK
        ↓
Hugo theme / Studio / CLI / Hub / AI tools / third-party renderers
```

Hugo should be a renderer and preview surface, not the only place where protocol behavior lives.

## Install locally

```bash
npm install
npm link
```

Then:

```bash
xananode init ./my-substrate --name "My Substrate" --namespace my
xananode validate ./my-substrate
xananode build ./my-substrate --out ./my-substrate/public
```

## Programmatic usage

```js
import { buildSubstrate, writeSubstrateArtifacts } from "@xananode/core";

const substrate = await buildSubstrate("./my-substrate");
console.log(substrate.protocolNodes.length);
console.log(substrate.relationships.length);
console.log(substrate.validation);

await writeSubstrateArtifacts("./my-substrate", "./public");
```

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

## Suggested next extraction from XanaNode-Hugo

This package is intentionally a first-pass core. The next step should be to refactor `XanaNode-Hugo-main/tools/prepare-xananode.mjs` so it calls this SDK instead of reimplementing protocol behavior internally.

Recommended split:

- Core SDK owns parsing, validation, graph creation, fragments, transclusion reference detection, suggestions, and artifact writing.
- Hugo owns templates, layouts, shortcodes, CSS, graph UI, and static-site rendering.
- Studio owns editing UX, author profiles, Git workflows, media import, and relationship selection.

## Design notes

### Git remains the versioning layer

XanaNode Core does not try to replace Git. Studio can later wrap Git in friendlier language:

- commit → save snapshot
- branch → draft path
- merge → bring changes together
- pull request → propose changes
- diff → what changed

### Static-first, server-optional

Core writes files. Anything can publish them: Hugo, GitHub Pages, Netlify, an archive, an AI memory index, or a federation hub.

### Canonical versus renderer-specific

The SDK treats `substrate.json`, relationship records, node records, and fragment records as protocol artifacts. HTML is downstream.
