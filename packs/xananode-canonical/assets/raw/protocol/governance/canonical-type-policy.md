# Canonical Type Policy

Canonical types are the shared vocabulary that make independent XanaNode substrates interoperable.

A type should become canonical only when it is:

- broadly useful across many domains
- clearly distinguishable from existing types
- describable in plain language
- stable enough to validate
- useful to both humans and machines

Avoid adding canonical types for every domain-specific object. Prefer subtypes or namespaced extensions.

## Projection Style Governance

Canonical relationship types include visual projection metadata. Every canonical relationship type must define:

- `color`
- `inverse_color`
- `line_style`
- `inverse_line_style`

These values are part of the shared vocabulary. Renderers use them to stratify connective lines so relationship meaning remains visible in graph projections, trails, maps, and other views.

Implementations may adapt the exact rendered appearance for accessibility, contrast, print, color-blind themes, or device constraints, but they should not collapse all relationship types into one undifferentiated line treatment while claiming full protocol projection compliance.

## Multi-Role Node Projection

The primary node `type` remains the authoritative validation and routing category. Secondary roles belong in `facets`, and narrower labels belong in `subtype` or `subtypes`.

Projection layers should preserve visible evidence of every recognized role. When a node has facets that match known node types, the projected mark should mix the primary type color with the facet type colors. Slices, rings, bands, layered borders, or another accessible mixed treatment are all valid. The important governance rule is that the projection must not silently flatten a multi-role node into one color when the substrate says the node participates in several modeling categories.

Schema vocabulary terms, schema fields, property registry entries, relationship categories, subtype entries, governance rules, and projection style rules should be modeled as `schema` nodes with specific subtypes. Those terms are part of the substrate vocabulary, not private implementation comments.

## Canonical vs Extension

Use canonical types for common substrate structure.

Use extensions for domain-specific modeling.

Example:

- `xananode:media` should be canonical.
- `museum:artifact` should be an extension.
- `biology:species` should be an extension unless future adoption proves otherwise.
