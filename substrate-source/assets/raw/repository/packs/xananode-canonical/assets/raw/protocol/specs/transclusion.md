# Transclusion

Transclusion is inclusion by reference rather than duplication.

In XanaNode, transclusion should preserve:

- source identity
- attribution
- version lineage
- fragment address
- rights metadata

The relationship type `transcludes` describes transclusion at the graph level. A viewer may derive the inverse view `transcluded_by` when looking from the fragment back to the consuming node.

The minimal interoperable form is:

- a source node, such as `source/as-we-may-think`
- a fragment node with `source_node`, `source_version_id`, `source_content_id`, `fragment_id`, `content_id`, `version_id`, `tumbler`, and `selector`
- a consuming node, such as an essay or trail
- a `transcludes` relationship from the consuming node to the fragment node

The `transcludes` relationship should carry the same versioned fragment `tumbler` used by the fragment node. This makes the transclusion point to a specific source version and fragment version rather than to a floating latest passage.

Implementations may begin with practical fragment references before attempting full Project Xanadu-style transclusion.
