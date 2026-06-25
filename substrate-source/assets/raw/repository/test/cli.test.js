import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const cliPath = path.resolve("bin", "xananode.js");

function runCli(args, cwd = process.cwd()) {
  const stdout = execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
  return JSON.parse(stdout);
}

test("core cli emits machine-readable JSON envelopes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-core-cli-"));
  const created = runCli(["init", dir, "--name", "CLI Test", "--namespace", "cli.test", "--json"]);
  assert.equal(created.ok, true);
  assert.equal(created.tool, "xananode-core");
  assert.equal(created.command, "init");
  assert.equal(created.data.namespace, "cli.test");

  const inspected = runCli(["inspect", dir, "--json"]);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.command, "inspect");
  assert.equal(inspected.data.manifest.namespace, "cli.test");

  const validated = runCli(["validate", dir, "--json"]);
  assert.equal(validated.ok, true);
  assert.equal(validated.command, "validate");
  assert.equal(typeof validated.data.validation.valid, "boolean");
});

test("core cli bundle alias emits bundle envelope", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xananode-core-bundle-"));
  runCli(["init", dir, "--name", "Bundle Test", "--namespace", "bundle.test", "--json"]);
  const outDir = path.join(dir, "dist");
  const bundled = runCli(["bundle", dir, "--out", outDir, "--json"]);
  assert.equal(bundled.ok, true);
  assert.equal(bundled.command, "bundle");
  assert.equal(bundled.data.output_dir, outDir);
  assert.ok(fs.existsSync(path.join(outDir, "substrate.json")));
});
