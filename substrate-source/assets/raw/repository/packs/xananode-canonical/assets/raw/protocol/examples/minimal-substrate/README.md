# Minimal XanaNode Substrate Example

This is the smallest useful XanaNode substrate that still follows the core rule:

> Nodes should not float as isolated facts. Concepts are built from claims, claims are supported by sources, and trails are curated routes through an already-connected graph.

This example uses only canonical XanaNode Core node types:

- `source`
- `concept`
- `claim`
- `person`
- `essay`
- `fragment`
- `trail`

It also uses canonical relationship types:

- `supports`
- `discusses`
- `related_to`
- `defines`
- `has_claim`
- `starts_with`
- `continues_to`
- `features`
- `created`
- `derived_from`
- `transcludes`

## What this example demonstrates

The graph is intentionally tiny, but it is not just a bag of nodes.

```text
As We May Think
  supports
    A knowledge substrate is structure, not just information
      defines
        Knowledge Substrate

As We May Think
  discusses
    Associative Trails
      related_to
        Knowledge Substrate

Start Here
  starts_with
    As We May Think

Relationship Navigation Intro
  transcludes
    As We May Think Fragment 0004
```

## Why the relationships matter

A normal hyperlink can show that the source, claim, and concept are somehow related.

XanaNode requires the relationship to say **how** they are related:

- The source `supports` the claim.
- The claim `defines` the concept.
- The concept `has_claim` so it is not unsupported.
- The source `discusses` associative trails.
- Associative trails are `related_to` the knowledge substrate as historical and conceptual context.
- The trail provides a human reading route, but it is not the only connection.
- The essay `transcludes` a fragment using the versioned tumbler address `example.minimal:source/as-we-may-think@git:8e47e70:examples/minimal-substrate/nodes/source-as-we-may-think.json#fragment/0004@sha256:example-as-we-may-think-fragment-0004`.

## Files

- `substrate.json` declares the substrate namespace and schema version.
- `relationships.json` declares canonical typed edges.
- `nodes/*.json` are individually addressable nodes with relationship references.
