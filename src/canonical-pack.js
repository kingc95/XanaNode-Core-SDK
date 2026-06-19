import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSubstrate } from "./build.js";
import { writeJson } from "./io.js";
import { loadSubstratePack } from "./packs.js";
import { validateSubstrateArtifacts } from "./validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledCanonicalPackRoot = path.join(packageRoot, "packs", "xananode-canonical");

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function safeNodeFileName(node) {
  const id = String(node.id || node.protocol_id || node.title || "node");
  return `${id.replace(/^[^:]+:/, "").replace(/[^A-Za-z0-9_.-]+/g, "_")}.json`;
}

function cleanBundledRecord(record) {
  const { imported_from, pack_id, pack_mode, ...clean } = record;
  return clean;
}

function writePackArtifacts(outDir, pack) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "nodes"), { recursive: true });
  writeJson(path.join(outDir, "substrate.json"), pack.manifest);
  writeJson(path.join(outDir, "relationships.json"), { relationships: pack.relationships });

  for (const node of pack.nodes) {
    writeJson(path.join(outDir, "nodes", safeNodeFileName(node)), node);
  }

  writeJson(path.join(outDir, "pack-report.json"), {
    id: pack.manifest.id,
    namespace: pack.manifest.namespace,
    sources: pack.manifest.pack?.source_manifests || [],
    nodes: pack.node_count,
    relationships: pack.relationship_count,
    warnings: pack.warnings,
    generated_at: new Date().toISOString()
  });
}

export function getBundledCanonicalPackRoot() {
  return bundledCanonicalPackRoot;
}

export function buildBundledCanonicalPack(options = {}) {
  const loaded = loadSubstratePack(options.root || bundledCanonicalPackRoot, {
    pack: { id: "xananode.canonical", mode: "mounted" }
  });
  const nodes = loaded.nodes.map(cleanBundledRecord).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relationships = loaded.relationships.map(cleanBundledRecord).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const manifest = {
    ...loaded.manifest,
    ...(options.id ? { id: options.id } : {}),
    ...(options.name ? { name: options.name } : {}),
    ...(options.namespace ? { namespace: options.namespace } : {}),
    ...(options.version ? { version: options.version } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.repositoryUrl ? { repository: { type: "git", url: options.repositoryUrl, default_branch: options.defaultBranch || "main" } } : {})
  };
  const validation = validateSubstrateArtifacts({ manifest, protocolNodes: nodes, relationships }, options);
  const warnings = [...loaded.warnings, ...validation.warnings];
  if (loaded.errors.length) warnings.push(...loaded.errors.map((error) => ({ kind: "pack_error", ...error })));

  return {
    manifest,
    nodes,
    relationships,
    warnings,
    validation,
    source_count: 1,
    node_count: nodes.length,
    relationship_count: relationships.length
  };
}

function packManifestFromSubstrates(substrates, options = {}) {
  const namespace = options.namespace || "xananode.canonical";
  const version = options.version || "0.1.0";
  const name = options.name || "XanaNode Canonical Pack";
  const sourceManifests = substrates.map((substrate) => ({
    id: substrate.manifest?.id || substrate.namespace || "unknown",
    name: substrate.manifest?.name || substrate.namespace || "Unknown substrate",
    namespace: substrate.namespace,
    version: substrate.manifest?.version || "",
    repository: substrate.manifest?.repository || undefined
  }));

  return {
    id: options.id || "xananode.canonical",
    name,
    version,
    namespace,
    description: options.description || "A Core-built XanaNode substrate pack assembled from available canonical source substrates.",
    schema_version: options.schemaVersion || substrates[0]?.manifest?.schema_version || "xananode-core@0.5.0",
    repository: {
      type: "git",
      url: options.repositoryUrl || "local",
      default_branch: options.defaultBranch || "main"
    },
    pack: {
      mode: "mounted",
      built_by: "@xananode/core",
      source_manifests: sourceManifests
    }
  };
}

export async function buildCanonicalPack(sourceRoots = [], options = {}) {
  const roots = asArray(sourceRoots).map((root) => path.resolve(root));
  if (!roots.length || options.bundled === true) {
    return buildBundledCanonicalPack(options);
  }
  const substrates = [];
  const warnings = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      warnings.push({ kind: "missing_source_root", root });
      continue;
    }
    substrates.push(await buildSubstrate(root, {
      includeDrafts: options.includeDrafts === true,
      suggestions: false,
      namespace: options.sourceNamespace
    }));
  }

  const nodesById = new Map();
  const relationshipsById = new Map();

  for (const substrate of substrates) {
    for (const node of substrate.protocolNodes || []) {
      if (!nodesById.has(node.id)) nodesById.set(node.id, node);
    }
    for (const relationship of substrate.relationships || []) {
      if (!relationshipsById.has(relationship.id)) relationshipsById.set(relationship.id, relationship);
    }
  }

  const nodes = [...nodesById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relationships = [...relationshipsById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const manifest = packManifestFromSubstrates(substrates, options);

  return {
    manifest,
    nodes,
    relationships,
    warnings,
    source_count: substrates.length,
    node_count: nodes.length,
    relationship_count: relationships.length
  };
}

export async function writeCanonicalPack(sourceRoots = [], outDir, options = {}) {
  if (!outDir) throw new Error("writeCanonicalPack requires an output directory.");
  const pack = await buildCanonicalPack(sourceRoots, options);

  writePackArtifacts(outDir, pack);

  return pack;
}
