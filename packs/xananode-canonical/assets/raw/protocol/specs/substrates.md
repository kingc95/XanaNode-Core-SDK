# Substrates

A substrate is an independently authored XanaNode-compatible knowledge graph.

A substrate includes:

- a manifest
- a declared namespace
- a Git repository backing the substrate history
- nodes
- relationships
- schema declarations
- optional custom extensions
- optional merge reports
- optional mounted or imported substrate layers

## Standard Layout

A substrate root is the directory containing `substrate.json`. A hand-built substrate should be usable from that root without private tool state.

The machine-readable layout registry is:

- `schemas/substrate-layout.schema.json`
- `schemas/xananode-substrate-layout.v0.1.0.json`

The minimal required file is:

```text
substrate.json
```

The standard production layout is:

```text
substrate.json
author-profile.json
relationships.json
nodes/
  *.json
nodes.json
content/
  nodes/
    *.md
assets/
  media/
  sources/
  projection/
schemas/
  *.json
reports/
  *.json
packs/
  <mounted-substrate>/
imports/
  <incoming-material>/
ro-crate-metadata.json
.xananode/
  workspace.json
  authors.json
```

Protocol JSON (`nodes/*.json`, `nodes.json`, and `relationships.json`) is the interchange surface. Markdown under `content/nodes/` is an authoring projection used by current tools. A substrate can be authored directly as protocol JSON and still be valid.

Tools should preserve recognized files even when they do not understand every extension. Unknown local files under `assets/`, `schemas/`, `reports/`, `packs/`, or `imports/` are part of the substrate unless sharing or export policy explicitly excludes them.

## Git Backing

Each production substrate is a Git repository. Git provides the substrate's version history, branching, review, merge, and synchronization layer.

XanaNode does not replace Git. It defines knowledge-specific artifacts inside a repository:

- `substrate.json`
- `nodes-index.json`
- `relationships.json`
- `nodes/*.json`
- optional `schemas/*.json`
- optional merge and compatibility reports

For static-host discovery, a substrate should also expose a machine front door such as `/.well-known/xananode`, plus ordinary crawl hints like `robots.txt` and head links that point to the protocol artifacts. The human viewer may live at the root, but the machine handshake should make the substrate obvious without scraping page prose or client-side graph code.

The substrate manifest must include a `repository` block describing the Git remote and default branch. Example fixtures may live in subdirectories of the protocol repository, but independently maintained substrates should use the repository root as the substrate root.

Substrates are sovereign. They can be moderated independently while still participating in federation.

## Portable Substrates And Composition

In current XanaNode language, the substrate is the primary unit. A `.substrate` file is a portable bundled substrate for transmission or release. This specification still uses `pack` in a few field names and compatibility notes because older tools shipped that wording first, but official user-facing tools should teach substrate, `.substrate`, mount, import, merge, and Intertwingle.
A portable substrate is a set of XanaNode protocol artifacts that can be added to another substrate without losing the ownership boundary of the source substrate.

Portable substrates use the same artifact shapes as a normal substrate:

- optional `substrate.json`
- `nodes/*.json` or any JSON file containing one node, an array of nodes, or `{ "nodes": [...] }`
- `relationships.json` or any JSON file containing `{ "relationships": [...] }`
- optional `assets/` files referenced by media node `asset_path` fields
- optional schemas, reports, and companion metadata

Portable substrates may be used in three composition modes:

- `mounted`: the incoming substrate is included at build or analysis time, but remains externally governed. Its records are not copied into the receiving substrate as canonical local content.
- `imported`: the incoming substrate's records are copied into generated local artifacts with provenance, but identity is not reconciled beyond explicit namespace mappings. Imported records must retain `imported_from`, substrate identity, and composition mode metadata.
- `merged`: the incoming substrate is reconciled with the receiving substrate through identity mapping, duplicate detection, conflict handling, and review policy. Merged substrates should produce a merge or intake report.

Mounted substrates are the right model for optional example layers, lineage overlays, alternate interpretations, and domain extensions. Imported substrates are the right model when a substrate owner wants local generated artifacts for an external substrate without claiming authorship. Merged substrates are the right model when a substrate owner decides that incoming records should be reconciled with local canonical authorship.

`absorbed` is a legacy alias for `imported`. New manifests should prefer `imported` or `merged` so tools can distinguish copying from identity reconciliation.

The substrate manifest may declare substrate references in `imports`:

```json
{
  "imports": [
    "xananode:core",
    {
      "id": "example.minimal",
      "source": "vendor/xananode-core/vendor/xananode-protocol/examples/minimal-substrate",
      "mode": "mounted",
      "version": "0.2.0",
      "required": true
    }
  ]
}
```

String imports remain valid for simple vocabulary or schema dependencies. Object imports are used when the import is a concrete substrate source.

The field name is `imports` for manifest compatibility, but user interfaces may describe these records as mounted substrates, federation sources, or substrate mounts. The important distinction is governance: a mounted substrate remains someone else's authored source unless an explicit import or merge step changes that status.

Substrate ingress may declare namespace mappings:

```json
{
  "id": "xananode.lineage",
  "source": "imports/lineage",
  "mode": "mounted",
  "namespace_mappings": [
    {
      "from": "xananode.example",
      "to": "xananode.com",
      "scope": "relationships",
      "reason": "Bind example-authored relationship endpoints to the receiving canonical substrate namespace."
    }
  ]
}
```

Namespace mappings are local federation rules. They do not rename the imported substrate's own nodes unless `scope` is `all`; with `scope: "relationships"` they only rebase relationship endpoints so mounted records can connect to equivalent local substrate nodes. Implementations should report mappings in review or merge/intake output so authors can audit how a mounted substrate is being interpreted.

Implementations must not silently treat a mounted substrate as imported or merged. If a tool copies mounted records into local artifacts, it should record that as an explicit import step with review metadata. If a tool reconciles identity, de-duplicates nodes, or resolves conflicting claims, it should record that as a merge step. This prevents two repositories from accidentally claiming canonical ownership of the same governed records.

When a substrate is cloned from an online federation target, the mounted name must include the Git branch and commit that were actually used, such as `Example Substrate (main@1a2b3c4d5e6f)`. Branch plus commit is the concrete version. A branch name alone is not enough provenance because the branch can move.

## Substrate Media Portability

Portable substrates that include local media must include the media files alongside the node records. Media files belong under the substrate root, normally in `assets/`. Media nodes reference those files with relative `asset_path` values.

Substrate builders must:

- copy every file referenced by a media node `asset_path`
- copy authored local substrate files that the substrate carries as evidence or media, including images, PDFs, audio, video, diagrams, source snapshots, and other digital files unless sharing policy excludes them
- reject or warn on paths that escape the substrate root
- preserve `source_url`, `rights_status`, `license`, `source_snapshot`, and content identifiers when known
- keep `primary_media` references pointing at media node ids, not raw file paths
- include projection media assets referenced by node type, subtype, relationship type, and relationship category registries when the substrate claims to carry those registries
- report duplicate local files by content hash so authors can see when the same literal file has propagated through multiple substrates
- report path conflicts when two different files claim the same relative `asset_path`

Substrate consumers must resolve `asset_path` relative to the source substrate root for mounted substrates and relative to the receiving substrate root for imported or merged assets after an explicit copy step.

Live source URLs and captured media are different objects. A `source` node may point to `https://example.com`. A related `media` node with `subtype: "web_snapshot"` may carry a screenshot or Open Graph image captured from that URL. This lets renderers show rich previews while preserving source identity, capture time, rights, and provenance.

When two mounted substrates carry the same literal file, tools should preserve provenance from both substrates instead of blindly copying both files forever. Permanent federation or merge may keep one canonical media node, record duplicate-file evidence in the merge report, and use transclusion or media relationships from the other substrate back to the retained file. That keeps the file lineage visible without multiplying identical bytes.

Linking to an online file is allowed, but a portable substrate should prefer a local captured asset or a reference to a media node in another mounted substrate when the file matters to the knowledge claim. Online links rot; substrate-carried media preserves the evidence path.

## Substrate Archives

A portable substrate may be transmitted as a single `.substrate` archive. The archive is the whole substrate unit: manifest, nodes, relationships, media, registry extensions, source snapshots, and workspace metadata needed to keep the files together.

The recommended media type is `application/vnd.xananode.substrate+json+gzip`. The archive should contain a JSON envelope compressed with gzip. Tools may support other containers later, but official XanaNode tooling should read and write this format.

Mounted substrate records should preserve:

- repository URL
- branch
- commit hash
- archive file name when exported
- namespace
- mounted/imported/merged/absorbed mode

## Federation Targets

The protocol registry may list known online federation targets. A federation target is a Git-backed substrate source that tools can discover, clone, validate, and mount into a local workspace.

The registry is a discovery aid, not a central authority. A substrate can federate with targets outside the registry as long as their manifests, schemas, and sharing rules validate.

Workspace-level tools are responsible for cloning, naming, caching, mounting, and exporting mixed substrates. Studio may expose those actions, but the substrate management behavior belongs below the projection layer.

## Sharing Policy

Nodes are shareable by default. This matches the federation model: an authored substrate is expected to be portable unless an author marks specific records as private, restricted, or needing review.

A substrate may declare a top-level `sharing` policy:

```json
{
  "sharing": {
    "default_shareable": true,
    "excluded_nodes": ["personal:person/private-contact"],
    "excluded_trails": ["personal:trail/private-family-history"],
    "rules": [
      {
        "selector": { "tag": "medical" },
        "shareable": false,
        "scope": "private",
        "reason": "Contains sensitive personal context."
      }
    ]
  }
}
```

Individual nodes may override that default:

```json
{
  "id": "personal:claim/something-i-can-share",
  "sharing": {
    "shareable": true,
    "scope": "public"
  }
}
```

When a trail is excluded, tools should treat the trail node and the trail's listed members as excluded unless an individual node explicitly opts back in. When a relationship touches a non-shareable node, pack exporters must omit that relationship or replace it with an explicit redaction record if the export profile supports redactions.

Core, Workspace, Studio, and official projection layers must respect `sharing` during export, publication, federation, mounted-pack preparation, and generated review reports. A renderer may show private records inside a local authoring session, but it must not publish them into static public artifacts.

## Projection Governance

Projection layers are lenses over a substrate. They may choose layout, typography, motion, interaction, and density, but official XanaNode projections must preserve protocol semantics:

- relationship direction must be visible when edges are shown
- relationship colors and line styles should come from the relationship type registry, with accessible alternatives when color alone is insufficient
- node titles should remain titles; official graph projections should use node type/subtype projection media or primary media as the node center mark
- node type, subtype, and multi-type/facet signals should remain distinguishable through projection media, color mixing, subtle chips, legends, tooltips, or inspector metadata
- hop-depth controls should actually filter by graph distance from the focused node
- when a reader travels along visible connected nodes, the projection should animate the walked route rather than dragging a decorative line
- when a reader jumps to an unconnected or hidden node, the projection should make that leap legible with staged reveal by hop depth

Custom renderers can be compatible without copying the official look, but they should not flatten away direction, authorship, provenance, or sharing policy.
