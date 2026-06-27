# XanaNode

![XanaNode Logo](media/images/xananode-icon.svg)

## What is XanaNode?

Short:

Relationships preserve knowledge.

Canonical:

XanaNode is a protocol for independently authored knowledge substrates that preserve relationships, provenance, lineage, disagreement, and addressable fragments, so knowledge can move across tools and media without losing its structure.

Expanded:

XanaNode is a protocol for independently authoring, transmitting, and federating knowledge substrates that preserve relationships, provenance, lineage, disagreement, and addressable fragments, enabling durable human-to-machine knowledge transfer through many possible projection layers.

Rather than treating documents as the primary unit of knowledge, XanaNode treats relationships as first-class entities and models knowledge as a connected network of people, concepts, claims, questions, hypotheses, problems, knowledge gaps, communications, responses, sources, events, media, organizations, technologies, and their relationships.

XanaNode is designed to be both human-readable and machine-interpretable.

XanaNode is also a working software stack. The protocol, Core SDK, Workspace engine, Studio workbench, Mobile capture companion, Hugo projection layer, and canonical XanaNode.com substrate are designed to run together and to describe themselves as XanaNode data. The canonical substrate is not only documentation about the project; it is a living example of the protocol carrying its own schemas, registries, media assets, source snapshots, project history, implementation links, build metadata, governance notes, and unresolved work.

This repository now also publishes an explicit substrate source at `substrate-source/`. That folder is generated from the protocol repository itself so the rest of the stack can federate with the protocol as a normal substrate instead of treating this repository as a private implementation detail.

That recursive quality is intentional. If XanaNode says relationships preserve knowledge, the XanaNode project itself must preserve the relationships that explain XanaNode: why files exist, where schemas came from, which tools consume them, what changed, what is pending, and how the public website was produced.

Documentation is licensed under `CC-BY-4.0`. Schemas, validators, and reference code are licensed under `Apache-2.0`. The XanaNode name and logo are trademarks of the XanaNode project; see [LICENSE.md](LICENSE.md) and [TRADEMARK.md](TRADEMARK.md).

Implementations should identify themselves as XanaNode-compatible and link to the canonical specification when accurate:

```text
This project is a XanaNode-compatible implementation.
Canonical specification: https://github.com/kingc95/XanaNode
```

It is not a wiki.

It is not a graph database.

It is not a note-taking application.

It is a protocol for knowledge substrates and the rules that let them move, federate, and be projected without losing their structure.

Fragments are not limited to paragraph chunks. The protocol's fragment/tumbler model can also describe quoted spans, character or word ranges, page regions, and time-based media segments. The stable address is the tumbler; the selector carries the granular "where inside this source version" detail.

---

## The Core Problem

Humanity has become exceptionally good at publishing information.

We have become far less successful at preserving the relationships that give information meaning.

Modern publishing systems prioritize documents:

* web pages
* articles
* books
* PDFs
* databases

Yet knowledge does not exist inside isolated documents.

Knowledge exists in:

* provenance
* context
* lineage
* contradiction
* influence
* evidence
* explanation
* association

The result is a civilization-scale memory problem.

Information survives.

Relationships disappear.

Sources become detached from conclusions.

Claims lose context.

Links decay.

Authority becomes difficult to evaluate.

The problem becomes increasingly visible in artificial intelligence systems, but it predates AI by decades.

XanaNode is an attempt to address this deeper problem.

---

# Core Principles

## 1. Relationships Are First-Class

Traditional systems primarily store content.

XanaNode stores both content and the relationships that connect content.

Examples:

* supports
* contradicts
* explains
* derived_from
* created
* memorializes
* documents
* participates_in

Relationships are explicit, queryable, versioned structures.

---

## 2. Provenance Matters

Every claim should be traceable.

Users should be able to answer:

* Where did this come from?
* Who said it?
* What evidence supports it?
* What contradicts it?
* What changed over time?

XanaNode prioritizes preserving knowledge lineage rather than merely preserving information.

---

## 3. Claims Are Not Facts

Claims, observations, concepts, essays, and sources are distinct node types.

XanaNode does not assume consensus.

Instead it preserves:

* claims
* counterclaims
* evidence
* disagreement
* uncertainty
* open questions
* hypotheses
* knowledge gaps
* review status

The goal is not enforced truth.

The goal is navigable knowledge.

---

## 4. Knowledge Is Structure

A knowledge substrate is not information.

A knowledge substrate is the structure that determines how information relates, persists, evolves, and can be understood.

The same information arranged differently produces different knowledge capabilities.

---

## 5. Human Readable and Machine Interpretable

Most semantic systems optimize for machines.

Most publishing systems optimize for humans.

XanaNode attempts to support both.

Humans should be able to browse, understand, and author the graph.

Machines should be able to query, reason over, and analyze it.

---

# Knowledge Substrates

A knowledge substrate is an independently authored graph of knowledge.

In XanaNode, a production substrate is backed by a Git repository. Git supplies history, branching, review, merge, and synchronization; XanaNode supplies the knowledge model, schemas, validation rules, and federation semantics.

A substrate is portable. A hand-built substrate should be able to follow the standard folder tree, include its own files, and open in compatible tools without private state. A `.substrate` archive carries the whole substrate as data: manifest, nodes, relationships, media, source files, schemas, reports, and workspace metadata needed for round trips.

Examples:

* personal knowledge substrates
* research substrates
* organizational substrates
* historical archives
* educational collections
* institutional memory systems

Each substrate remains independently owned and moderated.

There is no requirement for a central authority.

## Repository Files, Assets, And Knowledge Objects

XanaNode does not treat every file in a Git repository as equally worthy of becoming its own node.

Portable substrates should preserve important local files, but preservation and elevation are different actions:

* **Preserve as an attached asset** when the file is implementation support, packaging glue, projection inventory, test scaffolding, or another file whose meaning is already carried by a higher-level node.
* **Promote to a first-class node** when the file is itself a knowledge-bearing object that should be citable, discussable, governable, reviewable, or traversable on its own.

A raw repository file generally deserves its own node when one or more of these are true:

* it defines protocol, schema, registry, compatibility, or governance behavior
* it is an independently citable specification, proposal, policy, source document, or canonical example
* it is itself a portable substrate/report/registry artifact that other tools may inspect directly
* authors are likely to discuss its contents semantically, not merely acknowledge that the file exists

A raw repository file should usually remain an attached asset, snapshot, or supporting file when:

* it exists mainly to make another node render, build, test, package, or execute
* it is one item in a large projection-asset inventory such as icons, thumbnails, static images, or generated output
* it is better modeled as provenance on a higher-level source, media, project, schema, or substrate node

This rule also applies to source/media modeling. A file does not need two separate nodes just because it is both readable and visual.

* If the knowledge object being cited is the file itself, prefer one `source` node.
* If that same node carries a local image, PDF, audio, video, or other file, it may also carry the `media` facet and related `media_type` fields.
* Use a separate `media` node only when the media object is distinct from the source object it previews, documents, depicts, or was derived from.

The practical goal is simple: preserve the bytes, but only promote the files that carry real semantic weight.

---

# Federation

XanaNode is designed for federation.

Multiple independent substrates can interoperate without surrendering ownership.

Example:

Researcher A maintains a substrate.

Researcher B maintains a substrate.

A university maintains a substrate.

A museum maintains a substrate.

Each can preserve its own interpretations and governance policies.

Federation allows these substrates to be connected and analyzed together.

The goal is not one global database.

The goal is a network of interoperable knowledge substrates.

---

# Schema Architecture

XanaNode uses a layered schema model.

## Core Schema

Provides the canonical node and relationship registries for the protocol.

The current core registry files are versioned and live in [schemas/](schemas):

* [xananode-node-types.v0.3.0.json](schemas/xananode-node-types.v0.3.0.json)
* [xananode-node-types.schema.v0.3.0.json](schemas/xananode-node-types.schema.v0.3.0.json)
* [xananode-relationship-types.v0.5.0.json](schemas/xananode-relationship-types.v0.5.0.json)
* [xananode-relationship-types.schema.v0.5.0.json](schemas/xananode-relationship-types.schema.v0.5.0.json)

The node registry currently centers on core types such as person, concept, claim, question, hypothesis, problem, knowledge_gap, communication, response, source, essay, and observation.

The relationship registry currently centers on core types such as defines, has_claim, supports, contradicts, documents, derived_from, answers, investigates, requires_source, possibly_related_to, and communicated_to.

The core property registry standardizes common open properties such as `uncertainty_level`, `review_status`, `research_priority`, `evidence_strength`, `communication_model`, and `communication_pattern`.

The substrate layout registry defines the standard folder tree that compatible tools should understand:

* [substrate-layout.schema.json](schemas/substrate-layout.schema.json)
* [xananode-substrate-layout.v0.1.0.json](schemas/xananode-substrate-layout.v0.1.0.json)

This makes the substrate format tight enough that someone can manually build a substrate outside the XanaNode tools, drop it into Core, Workspace, Studio, Hugo, or another compatible implementation, and expect the records and files to be discoverable.

The core schema provides interoperability while still allowing extension schemas to define namespaced custom types.

Validation tools live in [tools/](tools). The repository validator checks JSON Schema conformance plus XanaNode-specific integrity rules such as declared relationship types, registered namespaces, and resolvable relationship endpoints.

---

# Implementations

The protocol repository is implementation-neutral. It defines the canonical schemas, registries, examples, governance material, and validation rules. The active implementation stack is maintained in separate repositories that consume this protocol:

* [XanaNode Core SDK](https://github.com/kingc95/XanaNode-Core-SDK) is the renderer-independent parser, validator, graph builder, fragment engine, and exporter. It includes this protocol repository as `vendor/xananode-protocol`.
* [XanaNode Workspace](https://github.com/kingc95/XanaNode-Workspace) is the local-first workspace engine used by Studio, CLIs, and editor integrations. It includes Core SDK as `vendor/xananode-core`.
* [XanaNode Hugo Theme](https://github.com/kingc95/XanaNode-Hugo) is the static-site renderer and graph viewer for XanaNode-compatible substrates.
* [XanaNode Studio](https://github.com/kingc95/XanaNode-Studio) is the desktop authoring workbench. It includes Hugo and Workspace as submodules.
* [XanaNode Mobile](https://github.com/kingc95/XanaNode-Mobile) is the Android capture companion for field intake, media capture, quick notes, portable `.substrate` handoff, and later federation back into the rest of the stack.

The intended dependency chain is:

```text
xananode protocol
  -> XanaNode-Core-SDK
    -> XanaNode-Workspace
      -> XanaNode-Studio
      -> XanaNode-Mobile

XanaNode-Hugo consumes the protocol artifacts as the published/static preview renderer.
```

For a full local Studio checkout:

```bash
git clone --recurse-submodules https://github.com/kingc95/XanaNode-Studio.git
cd XanaNode-Studio
npm install
npm test
```

---

## How The Stack Fits Together

XanaNode is designed so the same substrate can move through the whole stack without being reinvented at each layer.

```text
Protocol defines the rules
Core reads, validates, analyzes, and exports substrates
Workspace manages substrate folders, registry targets, working copies, and .substrate bundles
Studio uses Workspace/Core for authoring and federation UX
Mobile uses Workspace/Core for capture-first intake and portable handoff
Hugo uses Core to validate and mount substrate sources, then projects them as a static site
```

Once you are past Core, the thing is still a substrate. Sometimes it is a Git-backed substrate folder. Sometimes it is a portable `.substrate` bundle. Sometimes it is a mounted registry target cloned locally. These are transport and governance forms of the same thing, not separate knowledge objects.

The protocol registry can list known federation targets. Official tools should prefer that registry when offering online substrate choices, while still allowing federation with valid external substrates that are not yet listed there.

To regenerate the Protocol repo's own substrate source:

```powershell
node tools/build-substrate-source.mjs
```

Or from the `XanaNode-Master` workspace root:

```powershell
npm run protocol:build-substrate-source
```

The protocol itself is not tied to Node.js. The current reference stack happens to be Node-based, but the protocol-facing contract should be callable from any stack. Official tooling should converge on stable `xananode-core` and `xananode-workspace` executable interfaces so Studio, Mobile, Hugo helpers, AI agents, and future third-party tools can operate on substrates without embedding one implementation language directly. See [specs/substrates.md](specs/substrates.md) and [proposals/XNP-0012-executable-tool-contract.md](proposals/XNP-0012-executable-tool-contract.md).

## FAQ

### Is this a real working stack?

Yes. XanaNode is not just a schema set. The protocol, Core SDK, Workspace engine, Studio authoring tool, Mobile capture companion, Hugo projection layer, and canonical XanaNode substrate are meant to run together right now.

### What is a `.substrate` file?

A `.substrate` file is a portable bundled substrate. It can carry the manifest, nodes, relationships, media, source snapshots, schemas, and supporting metadata needed to move a substrate between tools without losing pieces.

### Is a `.substrate` different from a substrate folder?

No. It is the same substrate in a packaged transmission form. A Git-backed folder is better for active authorship and history. A `.substrate` bundle is better for shipping, handoff, offline import, and archival release.

### Where does federation happen?

Federation begins at the protocol level and is enforced through Core. Workspace is the management layer that should clone, mount, compare, import, or merge external substrates. Studio is the human-facing authoring interface for that workflow. Hugo is a projection layer that can mount configured substrate sources at build time and render the result.

### Do I have to rewrite imported substrate data as Markdown for Hugo?

No. Markdown is an authoring convenience, not the only source form. Hugo should be able to mount or import validated substrate JSON through Core and render it directly.

### Can substrates overlap?

Yes. Overlap is expected. Independent substrates may describe the same people, organizations, concepts, or works differently. XanaNode is meant to preserve that overlap, carry the provenance, and let tools surface the comparison instead of flattening it away.

---

## Extension Schema

Substrates may define custom node types and relationship types.

Examples:

museum:artifact

biology:species

legal:precedent

genealogy:ancestor_of

Custom types are:

* namespaced
* documented
* versioned
* machine-readable

This allows evolution without breaking compatibility.

---

# Namespaces

XanaNode supports schema namespaces.

Examples:

xananode:claim

museum:artifact

research:experiment

Namespaces prevent collisions and allow independent schema development.

Relationships between schemas can themselves be represented.

Examples:

equivalent_to

broader_than

narrower_than

related_to

---

# Tumbler Addressing

XanaNode is intended to support persistent, location-independent addressing.

The goal is to move beyond URLs and document paths.

Objects should remain addressable even if:

* files move
* websites migrate
* structures change

Future implementations may support:

* node-level addressing
* relationship-level addressing
* claim-level addressing
* fragment-level addressing
* transcluded content references

This provides durable references across time.

---

# Transclusion

XanaNode embraces transclusion principles inspired by Project Xanadu.

Rather than duplicating information repeatedly, knowledge should be referenced and reused.

Benefits include:

* provenance preservation
* reduction of duplication
* easier revision tracking
* stronger lineage visibility

Practical implementations may initially focus on partial transclusion while preserving compatibility with existing publishing systems.

---

# Mergeability

Mergeability is a core design goal.

Two substrates should be able to exchange knowledge without requiring identical governance.

Merge operations should preserve:

* authorship
* provenance
* disagreement
* source attribution
* local moderation decisions

Merging should add structure rather than destroy context.

---

# Civilizational Memory

The long-term goal of XanaNode is not merely better note-taking, search, or AI retrieval.

The goal is the creation of a federated civilizational memory system.

A system where:

* knowledge remains locally owned
* provenance remains visible
* disagreement remains preserved
* schemas remain interoperable
* relationships remain navigable

A civilization-scale memory substrate built from independently maintained knowledge systems rather than a single centralized authority.

XanaNode is an open protocol for building interoperable knowledge substrates that preserve relationships, provenance, lineage, and disagreement across independently authored and federated knowledge systems.

