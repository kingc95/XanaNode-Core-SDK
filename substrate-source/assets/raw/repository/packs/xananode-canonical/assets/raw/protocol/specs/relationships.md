# Relationships

Relationships connect nodes with explicit meaning.

XanaNode relationships are typed.

Examples:

- `supports`
- `contradicts`
- `explains`
- `answers`
- `investigates`
- `requires_source`
- `possibly_related_to`
- `created`
- `derived_from`
- `communicated_to`
- `transcludes`
- `deep_links_to`

Relationships may be simple edges or first-class nodes when the relationship itself needs evidence, provenance, dispute, or revision history.

Relationship records should preserve assertion provenance when available. Common fields include `asserted_by`, `asserted_at`, `confidence`, `evidence`, and `tumbler`.

`asserted_by` should point to a person, organization, project, or external actor identifier when possible. If the actor is local to the substrate, it should be represented as a node.

Relationships may also carry temporal validity when the relationship was true during a specific historical interval. Use `valid_from` for the beginning of the interval and `valid_to` for the end. These fields describe the modeled reality, while `asserted_at` describes when the substrate recorded the assertion.

## Projection Style

Relationship type registries define canonical projection style metadata:

- `color`
- `inverse_color`
- `line_style`
- `inverse_line_style`
- optional `projection` media metadata

Projection layers use these values for connective lines, arrows, trails, legends, and other relationship marks. This is not decoration only: visual stratification helps readers distinguish evidence, lineage, authorship, governance, uncertainty, communication, and other relationship families before reading every label.

A protocol-compliant projection may adapt contrast for accessibility, theme, or media constraints, but it must preserve the registry-level distinction between relationship types and their inverse readings. If a renderer cannot display color, it should use line style, labels, or another accessible cue instead of flattening every relationship into the same visual treatment.

Relationship type registries may also declare projection media:

```json
{
  "type": "supports",
  "category": "evidence",
  "projection": {
    "icon": "supports",
    "icon_label": "->",
    "asset_path": "assets/projection/relationship-types/supports.svg",
    "category_asset_path": "assets/projection/relationship-categories/evidence.svg"
  }
}
```

Relationship projection assets should be carried as `media` nodes when bundled in a substrate or pack. Use `asset_role: "relationship_type_projection_icon"` for a specific relationship type and `asset_role: "relationship_category_projection_icon"` for category-level assets. Projection layers may use these assets in legends, path explainers, relationship catalogs, tooltips, and edge adornments, while edge color and line style still come from the relationship registry.

## Inquiry, Uncertainty, And Workflow

XanaNode relationships should preserve knowledge states, not only settled assertions.

Use inquiry relationships when a node participates in research or explanation:

- `answers`
- `partially_answers`
- `fails_to_answer`
- `raises`
- `investigates`
- `motivates_inquiry`
- `tests`
- `falsifies`
- `validates`

Use workflow and uncertainty relationships when a node needs additional work:

- `requires_information`
- `requires_source`
- `requires_review`
- `requires_validation`
- `requires_context`
- `insufficient_evidence`
- `unresolved`
- `under_review`
- `speculative`

These relationships make gaps explicit. A substrate should be able to say "this claim needs a source" or "this question remains unresolved" without pretending the missing knowledge is already known.

## Discovery And Cognitive Relationships

Not every useful connection is strong enough to be evidence, influence, or identity. Early research often begins with low-commitment associations.

Use discovery and cognitive relationships for provisional connective tissue:

- `possibly_related_to`
- `shares_pattern_with`
- `analogous_to`
- `resonates_with`
- `generalizes`
- `specializes`
- `abstraction_of`
- `example_of`

Authors should prefer more specific high-commitment relationships when the evidence supports them. Low-commitment relationships are still valuable because they preserve the path by which a stronger interpretation may later be discovered.

## Communication Relationships

Communication has structure. When the communication itself matters, represent it as a `communication` node and connect participants, questions, responses, audiences, and consequences with typed relationships.

Canonical communication relationships include:

- `asked`
- `asked_in`
- `answers`
- `answered_in`
- `replied_to`
- `broadcast_to`
- `communicated_to`
- `presented_to`
- `discussed_with`
- `debated_with`
- `negotiated_with`
- `announced`
- `reported_to`

This lets a substrate model knowledge flow: who asked, who answered, where the exchange happened, how it reached an audience, and what claims, projects, or gaps emerged from it.

## Inverse Views

Canonical relationship types are authored in one direction only. A type may name an `inverse` label for display or query purposes, but that inverse does not need to be registered as a second canonical type.

For example, an implementation can display `created_by` when viewing the target of a `created` relationship, but the stored relationship type remains `created`. This avoids bloating the canonical registry and avoids dangling inverse-type pairs.
