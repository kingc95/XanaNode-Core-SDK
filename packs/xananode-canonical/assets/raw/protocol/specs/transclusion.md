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

Selectors may point to more than paragraph-like text. A transcluded fragment can identify:

- an exact text quote
- a word or character range
- a page or region selection in a document
- an audio or video time span
- an image region or other media-native chunk

The durable rule is the same in every case:

1. the consuming node points to a fragment node
2. the fragment node preserves the versioned tumbler
3. the selector carries the chunking detail for that source version

This is how XanaNode gets closer to the Nelson-style goal of reusing a precise span rather than only whole files or whole paragraphs.

When a person pastes quoted material into an official XanaNode tool, the best-case authoring flow is not "paste now, maybe relink later." The tool should prefer to create or reuse a fragment, record the `transcludes` relationship immediately, and preserve the source directionality at the moment of reuse.

Implementations may begin with practical fragment references before attempting full Project Xanadu-style transclusion.
