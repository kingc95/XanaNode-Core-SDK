# Nodes

Nodes are addressable knowledge objects.

A node may represent a person, concept, claim, question, hypothesis, problem, knowledge gap, communication, response, source, observation, essay, media item, event, place, organization, project, technology, publication, community, relationship, revision, trail, schema, or fragment.

Nodes should have stable IDs and human-readable summaries.

Nodes should carry provenance metadata when it is known. Common provenance fields include `created_by`, `created_at`, `updated_at`, `source_url`, `rights_status`, and `confidence`.

`created_by` should point to a person, organization, project, or external actor identifier when possible. If the actor is local to the substrate, it should be represented as a node.

A node is not automatically true. It is an object in the substrate that can be connected to evidence, claims, sources, disputes, and revisions.

## Inquiry And Knowledge States

Knowledge work is not only a collection of asserted facts. It also contains questions, provisional explanations, missing evidence, and unresolved problems. XanaNode models these as first-class nodes so a substrate can show what it knows, what it does not know, and what it is actively trying to find out.

Use `question` for an explicit inquiry or prompt. A question may be answered, partially answered, raised by a source, asked in a communication, or connected to a knowledge gap.

Use `hypothesis` for a provisional explanation or prediction. A hypothesis should be connected to tests, evidence, counterevidence, validation, falsification, and revision history.

Use `problem` for a difficulty, risk, design challenge, or research problem that organizes work.

Use `knowledge_gap` for a known absence: missing citation, unknown author, lost document, incomplete context, unresolved identity, or evidence that has not been found yet.

Common epistemic workflow properties include `uncertainty_level`, `review_status`, `research_priority`, and `evidence_strength`. These fields are also listed in the property registry so tools can parse them consistently.

Example:

```json
{
  "id": "example.minimal:question/why-relationships-matter",
  "title": "Why do relationships matter?",
  "type": "question",
  "status": "open",
  "importance": 5,
  "summary": "An inquiry into why preserving relationship structure changes what a knowledge system can do.",
  "uncertainty_level": "medium",
  "review_status": "needs_review",
  "research_priority": 4,
  "relationships": []
}
```

## Communication Nodes

Communication should not always be flattened into a simple edge such as `authored` or `discusses`. A communication can have topology, participants, directionality, feedback, medium, audience, and consequences. When those properties matter, model the communication itself as a `communication` node.

Use `communication_model` to describe participant topology:

- `one_to_one`
- `one_to_many`
- `many_to_one`
- `many_to_many`

Use `communication_pattern` to describe the semantic pattern:

- `dialogue`
- `broadcast`
- `collection`
- `coordination`
- `negotiation`
- `debate`
- `consensus`
- `instruction`
- `query_response`
- `publication`

Use `response` for an answer, reply, rebuttal, clarification, or follow-up. Responses can `answers` a question, `replied_to` another response or communication, or be `answered_in` a communication context.

## Primary Type And Facets

Each node has one primary `type`. The primary type controls the node's stable route, required fields, default rendering, and validation behavior.

Nodes may also carry a narrower `subtype`. The subtype does not replace the primary type. It describes a more specific kind inside that route and validation category. For example, a node can remain a `source` while declaring `subtype: "git_repository"`, `subtype: "official_site"`, `subtype: "documentation"`, `subtype: "support_page"`, or `subtype: "web_snapshot"`.

Use `subtypes` when one node needs multiple narrow labels. Subtypes should use lower-case slugs. Namespaced subtypes are allowed for extension vocabularies.

Some real knowledge objects naturally play several roles. A quotation can be a `fragment` of a source, evidence used like a `source`, and an assertion that functions like a `claim`. Do not duplicate the quotation into separate nodes just to satisfy those categories. Model one canonical node and add secondary `facets` when the object should participate in more than one role.

Example:

```json
{
  "id": "example.minimal:fragment/as-we-may-think-0004",
  "title": "Associative Trails Quote",
  "type": "fragment",
  "facets": ["source", "claim"],
  "summary": "A stable quotation fragment that can be cited as evidence and interpreted as an assertion."
}
```

Use relationships to explain why a facet matters in context. For example, a quote can `supports` a claim, `derived_from` a source, or `defines` a concept. Facets describe secondary behavior; relationships describe meaning.

Projection layers should show those secondary roles instead of hiding them. The primary `type` keeps authority over routing, validation, and default presentation, but a graph projection should visually mix the primary type color with any facet colors it recognizes. In other words, a quote that is primarily a `fragment` and also has `source` and `claim` facets should not look like only a fragment. Its visual mark should intertwingle the fragment, source, and claim colors by slices, bands, rings, or another accessible mixed-color treatment.

If a projection cannot use color, it should preserve the distinction with labels, texture, stroke patterns, badges, or another cue. A renderer may simplify the treatment at tiny sizes, but it should not erase the fact that the node carries multiple roles while claiming full projection compliance.

## Media Assets

Media should be represented as `media` nodes, then connected to other nodes with `has_primary_media`, `depicts`, `represents`, `transcribes`, or another appropriate relationship. A node that wants a representative image should use `primary_media` to reference a media node rather than embedding a renderer-specific image path.

Portable media nodes should use a relative `asset_path` when the file is part of the substrate or pack:

```json
{
  "id": "example.minimal:media/hugo-site-snapshot",
  "title": "Hugo Site Snapshot",
  "type": "media",
  "subtype": "web_snapshot",
  "media_type": "screenshot",
  "mime_type": "image/png",
  "asset_path": "assets/sources/hugo-official-site/snapshot.png",
  "asset_role": "source_snapshot",
  "source_url": "https://gohugo.io/",
  "source_snapshot": {
    "captured_at": "2026-06-19T00:00:00Z",
    "source_url": "https://gohugo.io/",
    "method": "screenshot",
    "tool": "xananode-core"
  },
  "rights_status": "external",
  "importance": 3,
  "summary": "A captured visual representation of the Hugo official site.",
  "relationships": []
}
```

`asset_path` is always relative to the substrate or pack root. It must not escape that root. Implementations that build packs must copy referenced assets into the pack and preserve the relative path, or rewrite the path and record that rewrite in pack metadata.

Media nodes should include stable content identifiers, usually `content_id: "sha256:..."`, whenever a tool can compute them. Content identifiers let federation tools detect duplicate files, distinguish duplicate bytes from duplicate titles, and explain how a file moved through different substrates.

Recommended asset layout:

```text
assets/
  media/
  projection/
    node-types/
      <type>.svg
    node-subtypes/
      <type>/
        <subtype>.svg
  sources/
    <source-node-local-id>/
      snapshot.png
      thumbnail.png
      metadata.json
```

Source page previews, Open Graph images, screenshots, transcripts, and archived copies must preserve provenance, but they do not always require a second node. Use these rules:

- if the captured file is itself the cited knowledge object, model it as one `source` node that may also carry the `media` facet, `media_type`, `mime_type`, `asset_path`, and related provenance fields
- if the captured file is a distinct representation of another source object, use a separate `media` node and relate it back to the source with the appropriate relationship and provenance
- if a renderer only needs the file as a projection aid and the file has no independent semantic role, keep it as an attached asset instead of elevating it to a new node

## Type And Subtype Projection Media

Node type registries may define projection media metadata under each node type's `projection` object. This lets projection layers draw a stable visual mark for a type without inventing renderer-local mappings.

The canonical fields are:

```json
{
  "type": "concept",
  "projection": {
    "icon": "concept",
    "icon_label": "C",
    "asset_path": "assets/projection/node-types/concept.svg",
    "subtype_asset_path_template": "assets/projection/node-subtypes/concept/{subtype}.svg"
  }
}
```

When a substrate or pack includes the actual icon file, the icon file must be preserved as an asset. It only needs its own `media` node when the icon is being discussed, governed, versioned, cited, or otherwise treated as a knowledge object in its own right. Otherwise the schema/type node may simply reference the asset through its projection metadata.

Official XanaNode projections use this order for a node's center mark:

1. primary media when the node has an explicit `primary_media` or resolved visual media
2. subtype projection media when a subtype-specific asset is available
3. node type projection media
4. registry `icon` or `icon_label` fallback

The node title remains the title and should be shown outside the center mark. Type and subtype labels may be shown as subtle chips, legends, tooltips, or inspector metadata. They should not replace the title.

## Branding As Knowledge

Branding is part of substrate identity and provenance. A logo, icon, color palette, tagline, or author mark should not live only inside renderer configuration. If a project, organization, author, or substrate changes its branding, that change has context and should be traceable.

Represent brand assets as `media` nodes, usually with `subtype: "logo"` or `subtype: "image"`. Reference those media nodes from substrate manifests or author profiles through their `branding` blocks:

```json
{
  "branding": {
    "brand_name": "XanaNode",
    "tagline": "Relationships preserve knowledge",
    "icon_media": "example.minimal:media/xananode-icon",
    "primary_color": "#55D6BE",
    "accent_color": "#FF8C00",
    "reason": "Protocol branding is modeled as substrate metadata and media."
  }
}
```

Renderers should treat branding metadata as a projection input, not as the canonical source. The canonical source is the profile or manifest plus the referenced media node and its asset/provenance fields.

## Software And Build Metadata

Software projects, SDKs, renderers, workspace layers, desktop applications, and generated packs should carry version and build provenance when known.

Use `software_version` for the package or release version. Use `build_metadata` for the exact build context:

```json
{
  "software_version": "0.1.0",
  "build_metadata": {
    "git_commit": "abc123",
    "git_branch": "main",
    "built_at": "2026-06-19T00:00:00Z",
    "built_by": "@xananode/core",
    "runtime": "node",
    "dependencies": [
      {
        "name": "@xananode/core",
        "version": "0.1.0",
        "relationship": "uses"
      }
    ]
  }
}
```

Compiled applications should record the version and compile/build date in their own metadata and, when represented in a substrate, on the project or technology node that describes that application. Generated canonical packs should include enough build metadata to identify which protocol, core, renderer, and workspace versions produced them.

## Open Properties

Substrate nodes may carry extra root-level properties so authors can describe domain-specific facts without waiting for a protocol release. Common extra properties should use the canonical property registry when possible.

The core property registry standardizes fields such as `birth_date`, `geo_coordinates`, `currency_value`, `measurement_si`, and `external_identifier`. Implementations can use `schemas/xananode-property-registry.v0.1.0.json` to parse these values consistently while still accepting custom extension properties.
