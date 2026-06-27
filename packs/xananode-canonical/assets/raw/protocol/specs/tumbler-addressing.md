# Tumbler Addressing

Tumbler addressing refers to persistent, location-independent addressing of knowledge objects and fragments.

The goal is to address a thing even if:

- files move
- folders change
- URLs change
- renderers change
- the substrate is mirrored or federated

XanaNode begins with stable node IDs and a minimal fragment addressing profile.

## Address Profile

Node addresses use:

```text
<namespace>:<node-kind>/<local-id>
```

Versioned node addresses add an immutable version identity:

```text
<namespace>:<node-kind>/<local-id>@<version-id>
```

Fragment addresses append a fragment selector and must preserve both the source node version and the fragment version:

```text
<namespace>:<node-kind>/<local-id>@<source-version-id>#fragment/<fragment-id>@<fragment-version-id>
```

Rules:

- `namespace` is a registered namespace such as `xananode` or `example.minimal`.
- `node-kind` is the node type family used in the substrate path, such as `source`, `claim`, `concept`, `essay`, or `fragment`.
- `local-id` is stable within the namespace.
- `source-version-id` identifies the exact source node version being addressed, such as a Git commit/path identity or immutable content ID.
- `fragment-id` is stable within the addressed node.
- `fragment-version-id` identifies the exact fragment extraction/version, usually a content hash or generated fragment revision ID.
- Fragment nodes must store `source_node`, `source_version_id`, `source_content_id`, `fragment_id`, `content_id`, `version_id`, and `tumbler`.
- A `tumbler` field must preserve the full versioned node or fragment address when a record depends on persistent addressing.

Examples:

```text
example.minimal:concept/knowledge-substrate
example.minimal:source/as-we-may-think@git:8e47e70:examples/minimal-substrate/nodes/source-as-we-may-think.json#fragment/0004@sha256:example-as-we-may-think-fragment-0004
```

Unversioned node addresses are stable identities. Versioned node and fragment tumblers are fixed references to an exact historical chunk. A transclusion should use the versioned fragment tumbler, not the floating node identity.

## Selector Granularity

The tumbler gives the durable address. The selector explains how the chunk was found inside the source.

Across the protocol, selectors are allowed to be more granular than a paragraph block:

- `TextQuoteSelector` for an exact quoted span with optional prefix/suffix context
- `TextPositionSelector` for character offsets inside a source version
- `RangeSelector` for generic start/end ranges
- `FragmentSelector` for a stable local fragment id
- `MediaFragmentSelector` or `TimecodeRangeSelector` for audio/video segments, image regions, or other media-native chunking

For time-based media, the current interoperable shape is:

```json
{
  "type": "TimecodeRangeSelector",
  "unit": "ms",
  "start_ms": 12340,
  "end_ms": 18750,
  "start_timecode": "00:00:12.340",
  "end_timecode": "00:00:18.750"
}
```

For text or structured documents, the selector may instead use:

```json
{
  "type": "RangeSelector",
  "unit": "word",
  "start": 120,
  "end": 135
}
```

That means XanaNode's equivalent of "start at this exact word" is not a different address family. It is the same fragment tumbler plus a selector precise enough to identify the span within that specific source version.

This profile is intentionally small. Future versions may add richer selectors, byte ranges, media regions, and additional revision systems without invalidating these base addresses.
