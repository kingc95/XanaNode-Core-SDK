import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyzeSubstrateIntake, buildBundledCanonicalPack, buildSubstrate, loadSubstratePack, normalizePackReference, writeCanonicalPack } from "../src/index.js";

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
    assert.ok(fs.readdirSync(path.join(out, "nodes")).some((name) => name.endsWith(".json")));

    const manifest = JSON.parse(fs.readFileSync(path.join(out, "substrate.json"), "utf8"));
    assert.equal(manifest.id, "xananode.test-pack");
    assert.equal(manifest.pack.mode, "mounted");
    assert.equal(manifest.pack.built_by, "@xananode/core");
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
  assert.ok(pack.nodes.some((node) => node.id === "xananode.canonical:schema/relationship-type-supports"));
});
