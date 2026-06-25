import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { analyzeSubstrateIntake, analyzeTextIntake, buildBundledCanonicalPack, buildGraphProjection, buildSubstrate, createProjectionRegistry, loadSubstratePack, normalizePackReference, relationshipsFromProjectionNodes, writeCanonicalPack, writeSubstrateArtifacts } from "../src/index.js";

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
