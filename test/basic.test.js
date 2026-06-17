import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSubstrate } from "../src/index.js";

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
