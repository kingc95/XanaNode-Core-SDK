import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { advanceViewerPlaybackState, analyzeSubstrateIntake, analyzeTextIntake, buildBundledCanonicalPack, buildGraphProjection, buildHopNeighborhood, buildSearchPlan, buildSubstrate, buildViewerGraphModel, buildViewerSearchState, createProjectionRegistry, createViewerTourSession, describeViewerGraphDensity, getViewerTimedDwellMs, getViewerTrailNodeIds, loadSubstratePack, normalizePackReference, pickNextViewerTourNode, rememberViewerTourVisit, relationshipsFromProjectionNodes, selectViewerLabeledNodes, writeCanonicalPack, writeSubstrateArtifacts } from "../src/index.js";

test("builds bundled example substrate", async () => {
  const root = path.resolve("templates/basic");
  const substrate = await buildSubstrate(root);
  assert.equal(substrate.manifest.namespace, "example");
  assert.ok(substrate.protocolNodes.length >= 2);
  assert.ok(substrate.relationships.length >= 1);
  assert.ok(substrate.fragments.length >= 1);
  assert.equal(typeof substrate.validation.valid, "boolean");
  assert.ok(substrate.manifest.repository);
  assert.equal(substrate.manifest.schema_version, "xananode-core@0.5.0");

  const authoredFragment = substrate.protocolNodes.find((node) => node.type === "fragment");
  assert.ok(authoredFragment);
  assert.ok(authoredFragment.content_id.startsWith("sha256:"));
  assert.ok(authoredFragment.version_id.startsWith("sha256:"));
  assert.ok(authoredFragment.source_content_id.startsWith("sha256:"));
  assert.ok(authoredFragment.source_version_id.startsWith("sha256:"));
  assert.match(authoredFragment.tumbler, /@sha256:[^#]+#fragment\/definition@sha256:/);
  assert.equal(substrate.validation.valid, true);
});

test("derives kinship relationships from explicit family links", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-kinship-"));
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "family.test",
      name: "Family Test",
      namespace: "family.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.writeFileSync(path.join(root, "nodes.json"), JSON.stringify({
      nodes: [
        { id: "family.test:person/grace", title: "Grace", type: "person", gender: "female" },
        { id: "family.test:person/frank", title: "Frank", type: "person", gender: "male" },
        { id: "family.test:person/bob", title: "Bob", type: "person", gender: "male" },
        { id: "family.test:person/dana", title: "Dana", type: "person", gender: "female" },
        { id: "family.test:person/charlie", title: "Charlie", type: "person", gender: "male" },
        { id: "family.test:person/carol", title: "Carol", type: "person", gender: "female" },
        { id: "family.test:person/ivy", title: "Ivy", type: "person", gender: "female" },
        { id: "family.test:person/erin", title: "Erin", type: "person", gender: "female" },
        { id: "family.test:person/emma", title: "Emma", type: "person", gender: "female" }
      ]
    }, null, 2));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({
      relationships: [
        { source: "family.test:person/grace", target: "family.test:person/bob", type: "mother_of" },
        { source: "family.test:person/frank", target: "family.test:person/bob", type: "father_of" },
        { source: "family.test:person/grace", target: "family.test:person/dana", type: "mother_of" },
        { source: "family.test:person/frank", target: "family.test:person/dana", type: "father_of" },
        { source: "family.test:person/bob", target: "family.test:person/charlie", type: "father_of" },
        { source: "family.test:person/carol", target: "family.test:person/charlie", type: "mother_of" },
        { source: "family.test:person/dana", target: "family.test:person/ivy", type: "mother_of" },
        { source: "family.test:person/bob", target: "family.test:person/emma", type: "father_of" },
        { source: "family.test:person/erin", target: "family.test:person/emma", type: "mother_of" }
      ]
    }, null, 2));

    const substrate = await buildSubstrate(root);
    const relationships = substrate.relationships;
    const hasRelationship = (source, type, target) => relationships.some((relationship) => (
      relationship.source === source && relationship.type === type && relationship.target === target
    ));

    assert.equal(substrate.validation.valid, true);
    assert.ok(hasRelationship("family.test:person/grace", "grandmother_of", "family.test:person/charlie"));
    assert.ok(hasRelationship("family.test:person/frank", "grandfather_of", "family.test:person/charlie"));
    assert.ok(hasRelationship("family.test:person/grace", "grandparent_of", "family.test:person/charlie"));
    assert.ok(hasRelationship("family.test:person/bob", "brother_of", "family.test:person/dana"));
    assert.ok(hasRelationship("family.test:person/dana", "sister_of", "family.test:person/bob"));
    assert.ok(hasRelationship("family.test:person/charlie", "half_sibling_of", "family.test:person/emma"));
    assert.ok(hasRelationship("family.test:person/dana", "aunt_of", "family.test:person/charlie"));
    assert.ok(hasRelationship("family.test:person/charlie", "nephew_of", "family.test:person/dana"));
    assert.ok(hasRelationship("family.test:person/charlie", "cousin_of", "family.test:person/ivy"));
    assert.ok(!hasRelationship("family.test:person/dana", "aunt_of", "family.test:person/ivy"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("derives step-kinship specifics from generic step relationships and gender", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-step-kinship-"));
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "step.family.test",
      name: "Step Family Test",
      namespace: "step.family.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.writeFileSync(path.join(root, "nodes.json"), JSON.stringify({
      nodes: [
        { id: "step.family.test:person/alice", title: "Alice", type: "person", gender: "female" },
        { id: "step.family.test:person/ben", title: "Ben", type: "person", gender: "male" },
        { id: "step.family.test:person/claire", title: "Claire", type: "person", gender: "female" },
        { id: "step.family.test:person/dylan", title: "Dylan", type: "person", gender: "male" }
      ]
    }, null, 2));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({
      relationships: [
        { source: "step.family.test:person/alice", target: "step.family.test:person/ben", type: "step_parent_of" },
        { source: "step.family.test:person/claire", target: "step.family.test:person/dylan", type: "step_child_of" }
      ]
    }, null, 2));

    const substrate = await buildSubstrate(root);
    const relationships = substrate.relationships;
    const hasRelationship = (source, type, target) => relationships.some((relationship) => (
      relationship.source === source && relationship.type === type && relationship.target === target
    ));

    assert.equal(substrate.validation.valid, true);
    assert.ok(hasRelationship("step.family.test:person/alice", "step_mother_of", "step.family.test:person/ben"));
    assert.ok(hasRelationship("step.family.test:person/ben", "step_son_of", "step.family.test:person/alice"));
    assert.ok(hasRelationship("step.family.test:person/claire", "step_daughter_of", "step.family.test:person/dylan"));
    assert.ok(hasRelationship("step.family.test:person/dylan", "step_father_of", "step.family.test:person/claire"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("builds renderer-neutral graph projection styles from protocol registries", () => {
  const registry = createProjectionRegistry({
    nodeTypes: [
      { type: "person", color: { bg: "#8bd3ff", fg: "#071827", outline: "#d8f1ff" } },
      { type: "source", color: { bg: "#ffe0e0", fg: "#2b0909", outline: "#fff0f0" } }
    ],
    relationshipTypes: [
      { type: "authored", color: "#f59e0b", line_style: "dashed" }
    ]
  });
  const nodes = [
    { id: "douglas-adams", title: "Douglas Adams", type: "person" },
    { id: "hitchhikers-radio", title: "The Hitchhiker's Guide radio series", type: "source", facets: ["person"] }
  ];
  const relationships = [{ source: "douglas-adams", target: "hitchhikers-radio", type: "authored" }];
  const projection = buildGraphProjection(nodes, relationships, { current: nodes[0], registry });

  assert.equal(projection.nodes[0].style.fills[0], "#8bd3ff");
  assert.equal(projection.nodes[1].style.fills[0], "#ffe0e0");
  assert.ok(projection.nodes[1].style.fills.includes("#8bd3ff"));
  assert.equal(projection.edges[0].style.color, "#f59e0b");
  assert.equal(projection.edges[0].style.dash, "8 6");
  assert.equal(relationshipsFromProjectionNodes([{ ...nodes[0], relationships }],).length, 0);
});

test("fans parallel relationships into separate projection lanes", () => {
  const registry = createProjectionRegistry({
    nodeTypes: [
      { type: "person", color: { bg: "#8bd3ff", fg: "#071827", outline: "#d8f1ff" } }
    ],
    relationshipTypes: [
      { type: "mother_of", color: "#ef5da8", line_style: "solid" },
      { type: "step_mother_of", color: "#ff8a65", line_style: "solid" }
    ]
  });
  const nodes = [
    { id: "fiona", title: "Fiona", type: "person" },
    { id: "sam", title: "Sam Montgomery", type: "person" }
  ];
  const relationships = [
    { source: "fiona", target: "sam", type: "mother_of" },
    { source: "fiona", target: "sam", type: "step_mother_of" }
  ];

  const projection = buildGraphProjection(nodes, relationships, { current: nodes[0], registry });
  assert.equal(projection.edges.length, 2);
  assert.notEqual(projection.edges[0].parallelEdgeLane, projection.edges[1].parallelEdgeLane);
});

test("hop neighborhoods include neighbors of direct neighbors at depth two", () => {
  const nodes = [
    { id: "start", title: "Start", type: "trail" },
    { id: "middle", title: "Middle", type: "project" },
    { id: "far", title: "Far", type: "source" }
  ];
  const edges = [
    { source: "start", target: "middle", type: "starts_with" },
    { source: "middle", target: "far", type: "documents" }
  ];

  const neighborhood = buildHopNeighborhood(nodes, edges, {
    focusId: "start",
    maxDepth: 2,
    exhaustive: true
  });

  assert.deepEqual(
    neighborhood.nodes.map((node) => node.id).sort(),
    ["far", "middle", "start"]
  );
});

test("trail helpers follow chained continues_to edges from the lead node", () => {
  const trail = { id: "trail", title: "Trail", type: "trail" };
  const ids = getViewerTrailNodeIds(trail, {
    allEdges: [
      { source: "trail", target: "one", type: "starts_with" },
      { source: "one", target: "two", type: "continues_to" },
      { source: "two", target: "three", type: "continues_to" }
    ]
  });
  assert.deepEqual(ids, ["one", "two", "three"]);
});

test("viewer search plans strip conversational lead-ins", () => {
  const plan = buildSearchPlan("Who is Vannevar Bush and why does he matter?");
  assert.equal(plan.raw, "Who is Vannevar Bush and why does he matter?");
  assert.equal(plan.normalized, "vannevar bush matter");
  assert.deepEqual(plan.tokens, ["vannevar", "bush", "matter"]);
});

test("viewer graph model applies shared subtype and relationship filters", () => {
  const registry = createProjectionRegistry({
    nodeTypes: [
      { type: "trail", color: { bg: "#f59e0b", fg: "#111827", outline: "#fde68a" } },
      { type: "concept", color: { bg: "#86efac", fg: "#052e16", outline: "#dcfce7" } },
      { type: "media", color: { bg: "#fbcfe8", fg: "#500724", outline: "#fce7f3" } }
    ],
    relationshipTypes: [
      { type: "starts_with", color: "#84cc16", line_style: "dashed" },
      { type: "documents", color: "#38bdf8", line_style: "solid" }
    ]
  });
  const nodes = [
    { id: "start", title: "Start Here", type: "trail", subtype: "introductory" },
    { id: "concept", title: "Memex", type: "concept", subtypes: ["historical"] },
    { id: "image", title: "Sketch", type: "media", media_type: "image" },
    { id: "video", title: "Film", type: "media", media_type: "video" }
  ];
  const edges = [
    { source: "start", target: "concept", type: "starts_with" },
    { source: "concept", target: "image", type: "documents" },
    { source: "concept", target: "video", type: "documents" }
  ];

  const { visible, graph } = buildViewerGraphModel(nodes, edges, {
    focusId: "start",
    maxDepth: 3,
    enabledTypes: new Set(["trail", "concept", "media"]),
    enabledMediaTypes: new Set(["image"]),
    enabledRelationshipTypes: new Set(["starts_with", "documents"]),
    enabledSubtypes: new Set(["introductory", "historical"]),
    registry
  });

  assert.deepEqual(visible.nodes.map((node) => node.id).sort(), ["concept", "image", "start"]);
  assert.deepEqual(graph.edges.map((edge) => edge.type).sort(), ["documents", "starts_with"]);
});

test("viewer tour picker prefers nearby fresh nodes", () => {
  const choice = pickNextViewerTourNode({
    nodes: [
      { id: "focus", distance: 0, importance: 5 },
      { id: "fresh-near", distance: 1, importance: 3 },
      { id: "recent-near", distance: 1, importance: 5 },
      { id: "far", distance: 3, importance: 10 }
    ],
    focusId: "focus",
    tourRecent: ["recent-near"],
    tourVisited: ["far"],
    tourIndex: 0
  });

  assert.equal(choice.nextId, "fresh-near");
  assert.equal(choice.nextIndex, 0);
});

test("viewer timed dwell helper clamps and normalizes seconds", () => {
  assert.equal(getViewerTimedDwellMs({ timedSeconds: 9 }), 9000);
  assert.equal(getViewerTimedDwellMs({ timedSeconds: 1 }), 3000);
  assert.equal(getViewerTimedDwellMs({ timedSeconds: 999 }), 120000);
});

test("viewer search state reports pending and live matches", () => {
  const pending = buildViewerSearchState([{ id: "x:concept/memex", title: "Memex", type: "concept" }], "me");
  assert.equal(pending.pending, true);
  assert.match(pending.meta, /Keep typing/i);

  const ready = buildViewerSearchState([{ id: "x:concept/memex", title: "Memex", type: "concept" }], "memex");
  assert.equal(ready.ready, true);
  assert.equal(ready.results.length, 1);
  assert.match(ready.meta, /match/i);
});

test("viewer playback helpers keep tour visit state and advance trail playback", () => {
  const trailNode = {
    id: "x:trail/start-here",
    type: "trail",
    nodes: ["x:concept/one", "x:concept/two", "x:concept/three"]
  };
  const session = createViewerTourSession({
    focusId: "x:trail/start-here",
    trailNode
  });
  assert.deepEqual(session.tourVisited, ["x:trail/start-here"]);
  assert.equal(session.activeTrail.nodes[0], "x:concept/one");

  const visit = rememberViewerTourVisit("x:concept/one", {
    tourVisited: session.tourVisited,
    tourRecent: session.tourRecent,
    visibleCount: 12
  });
  assert.equal(visit.tourRecent.at(-1), "x:concept/one");

  const advance = advanceViewerPlaybackState({
    tourActive: true,
    activeTrail: session.activeTrail,
    focusId: "x:trail/start-here",
    tourRecent: visit.tourRecent,
    tourVisited: visit.tourVisited,
    tourIndex: 0,
    nodes: []
  });
  assert.equal(advance.kind, "node");
  assert.equal(advance.nextId, "x:concept/one");
});

test("viewer density helpers mark dense graphs and preserve useful labels", () => {
  const graph = {
    nodes: [
      { id: "focus", selected: true, distance: 0, importance: 5 },
      { id: "near-a", distance: 1, importance: 4 },
      { id: "near-b", distance: 1, importance: 3 },
      { id: "far", distance: 3, importance: 1 }
    ],
    edges: Array.from({ length: 80 }, (_, index) => ({
      source: { id: "focus" },
      target: { id: index % 2 === 0 ? "near-a" : "near-b" }
    }))
  };

  const density = describeViewerGraphDensity(graph);
  assert.equal(density.mode, "dense");
  assert.ok(density.maxIncident >= 40);

  const visibleLabels = selectViewerLabeledNodes(graph, { dense: true, maxDenseLabels: 2 });
  assert.ok(visibleLabels.has("focus"));
  assert.ok(visibleLabels.has("near-a") || visibleLabels.has("near-b"));
  assert.equal(visibleLabels.has("far"), false);
});

test("bundles the current protocol schema inventory", () => {
  const schemaNames = fs.readdirSync(path.resolve("schemas")).filter((name) => name.endsWith(".json")).sort();
  assert.ok(schemaNames.includes("author-profile.schema.json"));
  assert.ok(schemaNames.includes("nanopublication.schema.json"));
  assert.ok(schemaNames.includes("ro-crate-metadata.schema.json"));
  assert.ok(schemaNames.includes("substrate-diff.schema.json"));
  assert.ok(schemaNames.includes("xananode-relationship-types.v0.5.0.json"));
  assert.ok(!schemaNames.includes("xananode-relationship-types.v0.4.0.json"));
});

test("analyzes incoming substrate packs for merge, relationship, link, and transclusion suggestions", () => {
  const substrate = {
    nodes: [
      {
        id: "local-note",
        protocolId: "example:concept/xananode",
        title: "XanaNode",
        type: "concept",
        body: "Hyperland and Douglas Adams make the missing lineage easier to see.",
        data: { aliases: ["XanaNode"] }
      }
    ],
    protocolNodes: [
      {
        id: "example:concept/xananode",
        title: "XanaNode",
        type: "concept",
        summary: "A protocol for connected knowledge.",
        relationships: []
      }
    ],
    relationships: [],
    fragments: [
      {
        protocol_id: "example:fragment/hyperland-quote",
        source_node: "example:publication/hyperland",
        text: "Douglas Adams make the missing lineage easier to see.",
        generated: false
      }
    ]
  };
  const incoming = {
    nodes: [
      {
        id: "incoming:concept/xananode",
        title: "XanaNode",
        type: "concept",
        summary: "A likely duplicate from another pack.",
        relationships: []
      },
      {
        id: "incoming:publication/hyperland",
        title: "Hyperland",
        type: "publication",
        summary: "A hypermedia documentary.",
        relationships: []
      }
    ],
    relationships: [
      {
        id: "incoming:rel/hyperland-context-xananode",
        source: "incoming:publication/hyperland",
        target: "example:concept/xananode",
        type: "context_for",
        summary: "Hyperland contextualizes XanaNode."
      }
    ]
  };

  const analysis = analyzeSubstrateIntake(substrate, incoming);
  assert.ok(analysis.merge_candidates.some((item) => item.incoming === "incoming:concept/xananode"));
  assert.ok(analysis.relationship_imports.some((item) => item.relationship === "incoming:rel/hyperland-context-xananode"));
  assert.ok(analysis.autolinks.some((item) => item.target === "incoming:publication/hyperland"));
  assert.ok(analysis.transclusions.some((item) => item.target_fragment === "example:fragment/hyperland-quote"));
});

test("applies autolink and transclusion suggestions during build when requested", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-apply-suggestions-"));
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "apply.test",
      name: "Apply Test",
      namespace: "apply.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.mkdirSync(path.join(root, "content", "nodes"), { recursive: true });
    fs.writeFileSync(path.join(root, "content", "nodes", "target.md"), [
      "---",
      "title: Hyperland",
      "type: publication",
      "summary: A hypermedia documentary.",
      "fragments:",
      "  - id: lineage-quote",
      "    label: Lineage Quote",
      "    text: Douglas Adams make the missing lineage easier to see.",
      "---",
      "# Hyperland",
      "",
      "Douglas Adams make the missing lineage easier to see."
    ].join("\n"));
    fs.writeFileSync(path.join(root, "content", "nodes", "note.md"), [
      "---",
      "title: Missing Lineage Note",
      "type: concept",
      "summary: This summary is shorter.",
      "---",
      "# Missing Lineage Note",
      "",
      "Hyperland matters here.",
      "",
      "Douglas Adams make the missing lineage easier to see."
    ].join("\n"));

    const substrate = await buildSubstrate(root, { suggestionMode: "apply" });
    const note = substrate.protocolNodes.find((node) => node.title === "Missing Lineage Note" && node.type === "concept");
    assert.ok(note);
    assert.match(note.body, /\[Hyperland\]\(hyperland\)/);
    assert.match(note.body, /\{\{< xana ref="apply\.test:fragment\//);
    assert.ok(substrate.applied_suggestions.length >= 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("suggests transclusions from generated fragments when authored fragments are absent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-generated-fragments-"));
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "generated.test",
      name: "Generated Fragment Test",
      namespace: "generated.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.mkdirSync(path.join(root, "content", "nodes"), { recursive: true });
    fs.writeFileSync(path.join(root, "content", "nodes", "source.md"), [
      "---",
      "title: Semantic Route Health",
      "type: concept",
      "summary: A concept about route quality.",
      "---",
      "# Semantic Route Health",
      "",
      "Semantic route health measures whether a chain of reasoning stays coherent, reproducible, and structurally intact."
    ].join("\n"));
    fs.writeFileSync(path.join(root, "content", "nodes", "note.md"), [
      "---",
      "title: Route Health Note",
      "type: essay",
      "summary: A note about route health.",
      "---",
      "# Route Health Note",
      "",
      "Semantic route health measures whether a chain of reasoning stays coherent, reproducible, and structurally intact."
    ].join("\n"));

    const substrate = await buildSubstrate(root, { suggestions: true });
    assert.ok(substrate.suggestions.some((item) =>
      item.kind === "possible_transclusion" &&
      item.source === "generated.test:essay/route-health-note"
    ));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("analyzes imported text for summary, likely type, mentions, and transclusions", () => {
  const nodes = [
    {
      id: "example:publication/hyperland",
      protocolId: "example:publication/hyperland",
      title: "Hyperland",
      type: "publication",
      data: {}
    }
  ];
  const fragments = [
    {
      protocol_id: "example:fragment/route-health-0001",
      source_node: "example:concept/semantic-route-health",
      text: "Semantic route health measures whether a chain of reasoning stays coherent, reproducible, and structurally intact.",
      generated: true
    }
  ];
  const analysis = analyzeTextIntake(
    "Hyperland shows why semantic route health matters. Semantic route health measures whether a chain of reasoning stays coherent, reproducible, and structurally intact.",
    { nodes, fragments, title: "Imported Note" }
  );

  assert.equal(analysis.suggested_type, "source");
  assert.ok(analysis.suggested_summary.includes("Hyperland"));
  assert.ok(analysis.mention_relationships.some((item) => item.target === "example:publication/hyperland"));
  assert.ok(analysis.link_suggestions.some((item) => item.target === "example:publication/hyperland"));
  assert.ok(analysis.transclusion_suggestions.some((item) => item.target_fragment === "example:fragment/route-health-0001"));
});

test("keeps protocol vocabulary twins out of noisy autolink and self-merge suggestions", () => {
  const substrate = {
    nodes: [
      {
        id: "local-note",
        protocolId: "example:concept/note",
        title: "Note",
        type: "concept",
        body: "This source claim should not turn every common schema word into a link. Hyperland still should link."
      }
    ],
    protocolNodes: [
      {
        id: "example:concept/note",
        title: "Note",
        type: "concept",
        relationships: []
      },
      {
        id: "incoming:publication/hyperland",
        title: "Hyperland",
        type: "publication",
        relationships: []
      },
      {
        id: "incoming:schema/node-type-source",
        title: "Source",
        type: "schema",
        registry_type: "node-type",
        relationships: []
      }
    ],
    relationships: [],
    fragments: []
  };
  const incoming = {
    nodes: [
      {
        id: "incoming:publication/hyperland",
        title: "Hyperland",
        type: "publication",
        relationships: []
      },
      {
        id: "incoming:schema/node-type-source",
        title: "Source",
        type: "schema",
        registry_type: "node-type",
        relationships: []
      }
    ],
    relationships: []
  };

  const analysis = analyzeSubstrateIntake(substrate, incoming);
  assert.ok(analysis.autolinks.some((item) => item.target === "incoming:publication/hyperland"));
  assert.ok(!analysis.autolinks.some((item) => item.target === "incoming:schema/node-type-source"));
  assert.ok(!analysis.merge_candidates.some((item) => item.existing === item.incoming));
});

test("loads substrate packs without mistaking node-local relationships for edge records", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-pack-"));
  try {
    fs.mkdirSync(path.join(root, "nodes"));
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "example.pack",
      name: "Example Pack",
      version: "0.1.0",
      namespace: "example.pack",
      repository: { type: "git", url: "local", default_branch: "main" }
    }));
    fs.writeFileSync(path.join(root, "nodes", "quote.json"), JSON.stringify({
      id: "example.pack:fragment/quote",
      title: "Example Quote",
      type: "fragment",
      facets: ["source", "claim"],
      importance: 3,
      summary: "A quote with multiple modeling roles.",
      relationships: [
        {
          id: "example.pack:rel/local-reference",
          type: "derived_from",
          direction: "outgoing",
          target: "example.pack:source/work"
        }
      ]
    }));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({
      relationships: [
        {
          id: "example.pack:rel/quote-supports-claim",
          source: "example.pack:fragment/quote",
          target: "example.pack:claim/idea",
          type: "supports",
          summary: "The quote supports the idea."
        }
      ]
    }));

    const pack = loadSubstratePack(root, { pack: { id: "example.pack", mode: "mounted" } });
    assert.equal(pack.errors.length, 0);
    assert.equal(pack.nodes.length, 1);
    assert.deepEqual(pack.nodes[0].facets, ["source", "claim"]);
    assert.equal(pack.relationships.length, 1);
    assert.equal(pack.relationships[0].id, "example.pack:rel/quote-supports-claim");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loads substrate packs from substrate-bundle.json and substrate-bundle.jsonl", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-bundle-load-"));
  try {
    const bundle = {
      format: "xananode.substrate-bundle@0.1.0",
      manifest: {
        id: "example.bundle",
        name: "Example Bundle",
        namespace: "example.bundle",
        version: "0.1.0",
        schema_version: "xananode-core@0.5.0"
      },
      nodes: [
        { id: "example.bundle:concept/alpha", title: "Alpha", type: "concept", summary: "Alpha node." },
        { id: "example.bundle:concept/beta", title: "Beta", type: "concept", summary: "Beta node." }
      ],
      relationships: [
        { id: "example.bundle:rel/alpha-related-to-beta", source: "example.bundle:concept/alpha", target: "example.bundle:concept/beta", type: "related_to" }
      ]
    };
    fs.writeFileSync(path.join(root, "substrate-bundle.json"), JSON.stringify(bundle, null, 2));
    fs.writeFileSync(path.join(root, "substrate-bundle.jsonl"), [
      JSON.stringify({ record_type: "bundle_manifest", format: bundle.format, manifest: bundle.manifest, counts: { nodes: 2, relationships: 1 } }),
      JSON.stringify({ record_type: "node", node: bundle.nodes[0] }),
      JSON.stringify({ record_type: "node", node: bundle.nodes[1] }),
      JSON.stringify({ record_type: "relationship", relationship: bundle.relationships[0] })
    ].join("\n"));

    const folderPack = loadSubstratePack(root, { pack: { id: "example.bundle", mode: "mounted" } });
    assert.equal(folderPack.manifest?.namespace, "example.bundle");
    assert.equal(folderPack.nodes.length, 2);
    assert.equal(folderPack.relationships.length, 1);

    const jsonPack = loadSubstratePack(path.join(root, "substrate-bundle.json"), { pack: { id: "example.bundle", mode: "mounted" } });
    assert.equal(jsonPack.manifest?.namespace, "example.bundle");
    assert.equal(jsonPack.nodes.length, 2);
    assert.equal(jsonPack.relationships.length, 1);

    const jsonlPack = loadSubstratePack(path.join(root, "substrate-bundle.jsonl"), { pack: { id: "example.bundle", mode: "mounted" } });
    assert.equal(jsonlPack.manifest?.namespace, "example.bundle");
    assert.equal(jsonlPack.nodes.length, 2);
    assert.equal(jsonlPack.relationships.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("single-file bundle exports preserve node content under the content field", async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-bundle-content-"));
  const outDir = path.join(root, "dist");
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "bundle.test",
      name: "Bundle Test",
      namespace: "bundle.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.writeFileSync(path.join(root, "nodes.json"), JSON.stringify({
      nodes: [
        {
          id: "bundle.test:essay/full-export",
          title: "Full Export",
          type: "essay",
          summary: "A node with real authored content.",
          content: "This authored body must survive in bundle.json and bundle.jsonl."
        }
      ]
    }, null, 2));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({ relationships: [] }, null, 2));

    await writeSubstrateArtifacts(root, outDir, { bundleJson: true, bundleJsonl: true });

    const bundle = JSON.parse(fs.readFileSync(path.join(outDir, "substrate-bundle.json"), "utf8"));
    assert.equal(bundle.nodes[0].content, "This authored body must survive in bundle.json and bundle.jsonl.");

    const jsonlNodeLine = fs.readFileSync(path.join(outDir, "substrate-bundle.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .find((entry) => entry.record_type === "node");
    assert.equal(jsonlNodeLine.node.content, "This authored body must survive in bundle.json and bundle.jsonl.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("builds JSON-authored substrates from nodes.json and relationships.json", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-json-substrate-"));
  try {
    fs.writeFileSync(path.join(root, "substrate.json"), JSON.stringify({
      id: "json.test",
      name: "JSON Test",
      namespace: "json.test",
      version: "0.1.0",
      repository: { type: "git", url: "local", default_branch: "main" }
    }, null, 2));
    fs.writeFileSync(path.join(root, "nodes.json"), JSON.stringify({
      nodes: [
        {
          id: "json.test:trail/start-here",
          title: "Start Here",
          type: "trail",
          summary: "A starter trail.",
          content: "Follow the trail."
        },
        {
          id: "json.test:item/example",
          title: "Example",
          type: "item",
          summary: "An example node.",
          content: "This node exists in JSON form."
        }
      ]
    }, null, 2));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({
      relationships: [
        {
          id: "json.test:rel/start-here-starts-with-example",
          source: "json.test:trail/start-here",
          target: "json.test:item/example",
          type: "starts_with",
          summary: "The trail starts with the example node."
        }
      ]
    }, null, 2));

    const substrate = await buildSubstrate(root);
    assert.equal(substrate.protocolNodes.filter((node) => node.type !== "fragment").length, 2);
    assert.ok(substrate.relationships.some((relationship) => relationship.id === "json.test:rel/start-here-starts-with-example"));
    assert.equal(substrate.validation.valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("applies mounted pack namespace mappings during ingress", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-pack-"));
  try {
    fs.writeFileSync(path.join(root, "nodes.json"), JSON.stringify({
      nodes: [
        {
          id: "lineage:person/douglas-adams",
          title: "Douglas Adams",
          type: "person",
          summary: "A lineage node."
        }
      ]
    }));
    fs.writeFileSync(path.join(root, "relationships.json"), JSON.stringify({
      relationships: [
        {
          id: "lineage:rel/xananode-preserves-lineage",
          source: "xananode.example:concept/xananode",
          target: "lineage:person/douglas-adams",
          type: "preserves"
        }
      ]
    }));

    const pack = loadSubstratePack(root, {
      receivingNamespace: "xananode.com",
      pack: {
        id: "lineage",
        mode: "mounted",
        namespace_mappings: [
          { from: "xananode.example", to: "xananode.com", scope: "relationships" }
        ]
      }
    });

    assert.equal(pack.nodes[0].id, "lineage:person/douglas-adams");
    assert.equal(pack.relationships[0].source, "xananode.com:concept/xananode");
    assert.equal(pack.relationships[0].target, "lineage:person/douglas-adams");
    assert.equal(pack.ingress.namespace_mappings.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("normalizes legacy absorbed mode to imported", () => {
  assert.equal(normalizePackReference({ id: "legacy", source: "packs/legacy", mode: "absorbed" }).mode, "imported");
  assert.equal(normalizePackReference({ id: "incoming", source: "packs/incoming", mode: "merged" }).mode, "merged");
});

test("writes a canonical substrate pack from authored substrate sources", async () => {
  const out = fs.mkdtempSync(path.join(process.cwd(), ".tmp-canonical-pack-"));
  try {
    const pack = await writeCanonicalPack([path.resolve("templates/basic")], out, {
      id: "xananode.test-pack",
      name: "XanaNode Test Pack",
      namespace: "xananode.test",
      repositoryUrl: "local"
    });

    assert.ok(pack.node_count >= 2);
    assert.ok(pack.relationship_count >= 1);
    assert.ok(fs.existsSync(path.join(out, "substrate.json")));
    assert.ok(fs.existsSync(path.join(out, "relationships.json")));
    assert.ok(fs.existsSync(path.join(out, "pack-report.json")));
    assert.ok(fs.existsSync(path.join(out, "substrate-bundle.json")));
    assert.ok(fs.readdirSync(path.join(out, "nodes")).some((name) => name.endsWith(".json")));

    const manifest = JSON.parse(fs.readFileSync(path.join(out, "substrate.json"), "utf8"));
    const bundle = JSON.parse(fs.readFileSync(path.join(out, "substrate-bundle.json"), "utf8"));
    assert.equal(manifest.id, "xananode.test-pack");
    assert.equal(manifest.pack.mode, "mounted");
    assert.equal(manifest.pack.built_by, "@xananode/core");
    assert.equal(bundle.manifest.id, "xananode.test-pack");
    assert.ok(Array.isArray(bundle.nodes));
    assert.ok(Array.isArray(bundle.relationships));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("ships a bundled canonical XanaNode protocol pack", async () => {
  const pack = buildBundledCanonicalPack();
  const types = new Set(pack.nodes.map((node) => node.type));

  assert.equal(pack.manifest.id, "xananode.canonical");
  assert.equal(pack.validation.valid, true);
  assert.ok(pack.node_count >= 149);
  assert.ok(pack.relationship_count >= 138);
  assert.ok(pack.nodes.filter((node) => node.type === "schema").length >= 12);
  for (const type of [
    "person",
    "concept",
    "claim",
    "source",
    "essay",
    "observation",
    "media",
    "event",
    "place",
    "organization",
    "project",
    "technology",
    "publication",
    "community",
    "relationship",
    "revision",
    "trail",
    "schema",
    "fragment"
  ]) {
    assert.ok(types.has(type), `missing canonical node type ${type}`);
  }
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:concept/substrate-projection-layer"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:source/xananode-com-domain"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/node-type-person"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/node-subtype-person-writer"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/node-subtype-schema-term"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/node-subtype-schema-semantic_rule"));
  assert.ok(pack.relationships.some((relationship) => (
    relationship.source === "xananode.canonical:schema/node-type-person" &&
    relationship.target === "xananode.canonical:schema/node-subtype-person-writer" &&
    relationship.type === "contains"
  )));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/relationship-type-supports"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/relationship-type-licensed_under"));
  assert.ok(pack.nodes.some((node) => (
    node.id === "xananode.canonical:schema/relationship-type-supports" &&
    node.color &&
    node.inverse_color &&
    node.line_style &&
    node.inverse_line_style
  )));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/relationship-category-evidence"));
  assert.ok(pack.relationships.some((relationship) => (
    relationship.source === "xananode.canonical:schema/relationship-category-evidence" &&
    relationship.target === "xananode.canonical:schema/relationship-type-supports" &&
    relationship.type === "contains"
  )));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:source/cc-by-4-0-license"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:source/apache-2-0-license"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:source/xananode-trademark-policy"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:concept/licensing"));
  assert.ok(pack.relationships.some((relationship) => (
    relationship.source === "xananode.canonical:claim/protocol-docs-licensed-cc-by-4-0" &&
    relationship.target === "xananode.canonical:source/cc-by-4-0-license" &&
    relationship.type === "licensed_under"
  )));
  assert.ok(pack.relationships.some((relationship) => (
    relationship.source === "xananode.canonical:media/xananode-icon" &&
    relationship.target === "xananode.canonical:source/xananode-trademark-policy" &&
    relationship.type === "trademarked_by"
  )));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:project/xananode-studio"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:source/repository-kingc95-xananode-studio"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:technology/xananode-studio-component-workspace-apis"));
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:project/xananode-core-sdk" && node.build_metadata?.git_commit));
  assert.ok(pack.manifest.build_metadata?.git_commit);
  assert.ok(pack.manifest.pack?.build_metadata?.dependencies?.some((dependency) => dependency.name === "XanaNode Protocol"));
});

test("writes bundled canonical pack with raw protocol snapshots and duplicate report", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-canonical-pack-"));
  try {
    const pack = await writeCanonicalPack([], out);
    const report = JSON.parse(fs.readFileSync(path.join(out, "pack-report.json"), "utf8"));
    const bundle = JSON.parse(fs.readFileSync(path.join(out, "substrate-bundle.json"), "utf8"));
    const nodes = JSON.parse(fs.readFileSync(path.join(out, "nodes.json"), "utf8")).nodes;
    const titleTypeCounts = new Map();
    for (const node of nodes) {
      const key = `${node.title}::${node.type}`;
      titleTypeCounts.set(key, (titleTypeCounts.get(key) || 0) + 1);
    }

    assert.equal(pack.validation.valid, true);
    assert.equal(titleTypeCounts.get("Substrate Node Schema::schema"), 1);
    assert.equal(titleTypeCounts.get("XanaNode Core SDK Repository::source"), 1);
    assert.ok(Array.isArray(report.duplicate_collapses));
    assert.ok(report.raw_sources.some((item) => item.asset_path === "assets/raw/protocol/schemas/substrate-node.schema.json"));
    assert.ok(report.raw_repository_files.some((item) => item.asset_path === "assets/raw/protocol/README.md"));
    assert.ok(report.raw_repository_files.some((item) => item.asset_path === "assets/raw/protocol/specs/substrates.md"));
    assert.ok(report.raw_repository_files.some((item) => item.asset_path === "assets/raw/protocol/governance/federation-rules.md"));
    assert.ok(fs.existsSync(path.join(out, "assets", "raw", "protocol", "schemas", "substrate-node.schema.json")));
    assert.ok(fs.existsSync(path.join(out, "assets", "raw", "protocol", "README.md")));
    assert.equal(bundle.format, "xananode.substrate-bundle@0.1.0");
    assert.equal(bundle.manifest.id, pack.manifest.id);
    assert.equal(bundle.counts.nodes, nodes.length);
    assert.equal(bundle.counts.relationships, pack.relationship_count);
    assert.ok(bundle.nodes.some((node) => node.id === "xananode.canonical:source/protocol-artifact-readme.md"));
    assert.ok(nodes.some((node) => (
      node.id === "xananode.canonical:schema/canonical-schema-substrate-node" &&
      node.asset_path === "assets/raw/protocol/schemas/substrate-node.schema.json" &&
      String(node.content_id || "").startsWith("sha256:")
    )));
    assert.ok(nodes.some((node) => (
      node.id === "xananode.canonical:source/protocol-artifact-readme.md" &&
      node.asset_path === "assets/raw/protocol/README.md" &&
      String(node.content || "").includes("XanaNode")
    )));
    assert.ok(nodes.some((node) => (
      node.id === "xananode.canonical:source/protocol-artifact-specs-substrates.md" &&
      node.asset_path === "assets/raw/protocol/specs/substrates.md" &&
      String(node.content || "").includes("substrate")
    )));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
