import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function walkJsonFiles(rootDir, files = []) {
  if (!fs.existsSync(rootDir)) return files;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (["node_modules", "public", "resources", ".git"].includes(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) walkJsonFiles(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
  }
  return files;
}

function isNodeRecord(value) {
  return isPlainObject(value) && Boolean(value.id && value.title && value.type);
}

function isRelationshipRecord(value) {
  return isPlainObject(value) && Boolean(value.id && value.source && value.target && value.type);
}

function isBundleManifestRecord(value) {
  return isPlainObject(value)
    && value.record_type === "bundle_manifest"
    && isPlainObject(value.manifest);
}

function isBundleReportRecord(value) {
  return isPlainObject(value) && value.record_type === "bundle_report";
}

function isJsonlBundleNodeRecord(value) {
  return isPlainObject(value) && value.record_type === "node" && isNodeRecord(value.node);
}

function isJsonlBundleRelationshipRecord(value) {
  return isPlainObject(value) && value.record_type === "relationship" && isRelationshipRecord(value.relationship);
}

function markImported(value, filePath, rootDir, pack = {}) {
  return {
    ...value,
    imported_from: value.imported_from || path.relative(rootDir, filePath).replace(/\\/g, "/"),
    ...(pack.id ? { pack_id: pack.id } : {}),
    ...(pack.mode ? { pack_mode: pack.mode } : {})
  };
}

function stableComparable(value) {
  if (Array.isArray(value)) return value.map(stableComparable);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["imported_from", "pack_id", "pack_mode"].includes(key))
      .sort()
      .map((key) => [key, stableComparable(value[key])])
  );
}

function dedupeRecords(records, kind, warnings) {
  const byId = new Map();
  for (const record of records) {
    if (!record?.id) continue;
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      continue;
    }

    const sameRecord = JSON.stringify(stableComparable(existing)) === JSON.stringify(stableComparable(record));
    const existingFromNodeFile = String(existing.imported_from || "").startsWith("nodes/");
    const incomingFromNodeFile = String(record.imported_from || "").startsWith("nodes/");
    if (!sameRecord) {
      warnings.push({
        kind: `duplicate_${kind}_id`,
        id: record.id,
        kept: existing.imported_from || "",
        ignored: record.imported_from || ""
      });
    }
    if (incomingFromNodeFile && !existingFromNodeFile) byId.set(record.id, record);
  }
  return [...byId.values()];
}

function collectJsonArtifact(value, filePath, rootDir, pack, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonArtifact(item, filePath, rootDir, pack, output);
    return;
  }
  if (!isPlainObject(value)) return;

  if (value.format === "xananode.substrate-bundle@0.1.0") {
    if (isPlainObject(value.manifest) && !output.manifest) output.manifest = value.manifest;
    if (Array.isArray(value.nodes)) {
      for (const item of value.nodes) collectJsonArtifact(item, filePath, rootDir, pack, output);
    }
    if (Array.isArray(value.relationships)) {
      for (const relationship of value.relationships) {
        if (isRelationshipRecord(relationship)) output.relationships.push(markImported(relationship, filePath, rootDir, pack));
      }
    }
    return;
  }

  if (isNodeRecord(value)) {
    output.nodes.push(markImported({
      ...value,
      relationships: asArray(value.relationships)
    }, filePath, rootDir, pack));
    return;
  }

  if (Array.isArray(value.nodes)) {
    for (const item of value.nodes) collectJsonArtifact(item, filePath, rootDir, pack, output);
  }

  if (Array.isArray(value.relationships)) {
    for (const relationship of value.relationships) {
      if (isRelationshipRecord(relationship)) output.relationships.push(markImported(relationship, filePath, rootDir, pack));
    }
  }
}

function parseSubstrateLikeFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const utf8 = buffer.toString("utf8").trimStart();
  if (utf8.startsWith("{") || utf8.startsWith("[")) {
    return JSON.parse(utf8);
  }
  return JSON.parse(gunzipSync(buffer).toString("utf8"));
}

function collectJsonlArtifact(text, filePath, rootDir, pack, output) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      output.errors.push({
        kind: "invalid_pack_jsonl",
        file: path.relative(rootDir, filePath).replace(/\\/g, "/"),
        message: error.message
      });
      return;
    }
    if (isBundleManifestRecord(value) && !output.manifest) {
      output.manifest = value.manifest;
      continue;
    }
    if (isJsonlBundleNodeRecord(value)) {
      collectJsonArtifact(value.node, filePath, rootDir, pack, output);
      continue;
    }
    if (isJsonlBundleRelationshipRecord(value)) {
      output.relationships.push(markImported(value.relationship, filePath, rootDir, pack));
      continue;
    }
    if (isBundleReportRecord(value)) continue;
    collectJsonArtifact(value, filePath, rootDir, pack, output);
  }
}

function collectArchiveArtifact(archive, filePath, rootDir, pack, output) {
  if (!isPlainObject(archive) || !Array.isArray(archive.files)) return false;
  if (isPlainObject(archive.manifest) && !output.manifest) output.manifest = archive.manifest;
  for (const entry of archive.files) {
    const relativePath = String(entry?.path || "").replace(/\//g, path.sep);
    if (!relativePath) continue;
    const ext = path.extname(relativePath).toLowerCase();
    const virtualFilePath = path.join(rootDir, relativePath);
    const decoded = Buffer.from(entry?.content || "", entry?.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    try {
      if (ext === ".json") {
        const value = JSON.parse(decoded);
        if (path.basename(relativePath) === "substrate.json" && isPlainObject(value) && !output.manifest) {
          output.manifest = value;
        }
        collectJsonArtifact(value, virtualFilePath, rootDir, pack, output);
      } else if (ext === ".jsonl") {
        collectJsonlArtifact(decoded, virtualFilePath, rootDir, pack, output);
      }
    } catch (error) {
      output.errors.push({
        kind: ext === ".jsonl" ? "invalid_pack_jsonl" : "invalid_pack_json",
        file: relativePath.replace(/\\/g, "/"),
        message: error.message
      });
    }
  }
  return true;
}

export function normalizePackReference(reference) {
  if (typeof reference === "string") {
    return {
      id: reference,
      source: reference,
      mode: "mounted"
    };
  }
  if (!isPlainObject(reference)) return null;
  const mode = reference.mode === "absorbed" ? "imported" : reference.mode;
  return {
    mode: "mounted",
    ...reference,
    ...(mode ? { mode } : {})
  };
}

export function normalizeNamespaceMappings(pack = {}, options = {}) {
  const receivingNamespace = options.receivingNamespace || options.namespace || "";
  const mappings = asArray(pack.namespace_mappings || pack.namespaceMappings);
  if ((pack.source_namespace || pack.sourceNamespace) && receivingNamespace) {
    mappings.push({
      from: pack.source_namespace || pack.sourceNamespace,
      to: receivingNamespace,
      scope: "relationships",
      reason: "Legacy source_namespace ingress hint."
    });
  }
  return mappings
    .filter((mapping) => isPlainObject(mapping) && mapping.from && mapping.to)
    .map((mapping) => ({
      from: String(mapping.from),
      to: String(mapping.to),
      scope: mapping.scope === "all" ? "all" : "relationships",
      ...(mapping.reason ? { reason: String(mapping.reason) } : {})
    }));
}

function remapProtocolRef(value, mappings, scope) {
  const text = String(value || "");
  for (const mapping of mappings) {
    if (mapping.scope !== "all" && scope !== "relationships") continue;
    if (text.startsWith(`${mapping.from}:`)) {
      return `${mapping.to}:${text.slice(mapping.from.length + 1)}`;
    }
  }
  return value;
}

export function applyPackIngress(packResult, options = {}) {
  const mappings = normalizeNamespaceMappings(packResult?.pack || {}, options);
  if (!mappings.length) {
    return {
      ...packResult,
      ingress: { namespace_mappings: [] }
    };
  }
  return {
    ...packResult,
    ingress: { namespace_mappings: mappings },
    nodes: (packResult.nodes || []).map((node) => {
      if (!mappings.some((mapping) => mapping.scope === "all")) return node;
      return {
        ...node,
        id: remapProtocolRef(node.id, mappings, "nodes")
      };
    }),
    relationships: (packResult.relationships || []).map((relationship) => ({
      ...relationship,
      source: remapProtocolRef(relationship.source, mappings, "relationships"),
      target: remapProtocolRef(relationship.target, mappings, "relationships")
    }))
  };
}

export function packReferenceForManifest(pack = {}) {
  if (typeof pack === "string") return pack;
  if (!isPlainObject(pack)) return null;
  const {
    source_namespace,
    sourceNamespace,
    namespaceMappings,
    enabled,
    ...clean
  } = pack;
  if (namespaceMappings && !clean.namespace_mappings) clean.namespace_mappings = namespaceMappings;
  return clean;
}

export function loadSubstratePack(rootDir, options = {}) {
  const pack = normalizePackReference(options.pack || {}) || {};
  const output = {
    pack,
    root: rootDir,
    manifest: null,
    nodes: [],
    relationships: [],
    warnings: [],
    errors: []
  };

  if (!fs.existsSync(rootDir)) {
    output.errors.push({
      kind: "missing_pack_source",
      source: rootDir,
      pack: pack.id || pack.source || ""
    });
    return output;
  }

  const rootStat = fs.statSync(rootDir);
  if (rootStat.isFile()) {
    const ext = path.extname(rootDir).toLowerCase();
    try {
      if (ext === ".json" || ext === ".substrate") {
        const value = parseSubstrateLikeFile(rootDir);
        const handledArchive = ext === ".substrate" && collectArchiveArtifact(value, rootDir, path.dirname(rootDir), pack, output);
        if (!handledArchive) {
          collectJsonArtifact(value, rootDir, path.dirname(rootDir), pack, output);
        }
        if (path.basename(rootDir) === "substrate.json" && isPlainObject(value)) output.manifest = value;
        if (ext === ".substrate" && isPlainObject(value.manifest) && !output.manifest) output.manifest = value.manifest;
      } else if (ext === ".jsonl") {
        collectJsonlArtifact(fs.readFileSync(rootDir, "utf8"), rootDir, path.dirname(rootDir), pack, output);
      } else {
        output.errors.push({
          kind: "unsupported_pack_file",
          file: path.basename(rootDir),
          message: `Unsupported substrate file type: ${ext || "unknown"}`
        });
      }
    } catch (error) {
      output.errors.push({
        kind: ext === ".jsonl" ? "invalid_pack_jsonl" : "invalid_pack_json",
        file: path.basename(rootDir),
        message: error.message
      });
    }
    output.nodes = dedupeRecords(output.nodes, "node", output.warnings);
    output.relationships = dedupeRecords(output.relationships, "relationship", output.warnings);
    return applyPackIngress(output, options);
  }

  const jsonlFiles = [];
  function walkJsonAndJsonl(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (["node_modules", "public", "resources", ".git"].includes(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkJsonAndJsonl(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".json")) output.__jsonFiles = [...(output.__jsonFiles || []), fullPath];
        if (entry.name.endsWith(".jsonl")) jsonlFiles.push(fullPath);
      }
    }
  }
  walkJsonAndJsonl(rootDir);

  for (const filePath of (output.__jsonFiles || []).sort()) {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (path.basename(filePath) === "substrate.json" && isPlainObject(value)) {
        output.manifest = value;
      }
      collectJsonArtifact(value, filePath, rootDir, pack, output);
    } catch (error) {
      output.errors.push({
        kind: "invalid_pack_json",
        file: path.relative(rootDir, filePath).replace(/\\/g, "/"),
        message: error.message
      });
    }
  }
  delete output.__jsonFiles;

  for (const filePath of jsonlFiles.sort()) {
    try {
      collectJsonlArtifact(fs.readFileSync(filePath, "utf8"), filePath, rootDir, pack, output);
    } catch (error) {
      output.errors.push({
        kind: "invalid_pack_jsonl",
        file: path.relative(rootDir, filePath).replace(/\\/g, "/"),
        message: error.message
      });
    }
  }

  output.nodes = dedupeRecords(output.nodes, "node", output.warnings);
  output.relationships = dedupeRecords(output.relationships, "relationship", output.warnings);

  return applyPackIngress(output, options);
}

export function resolveSubstratePacks(references = [], options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const extraBaseDirs = asArray(options.extraBaseDirs);
  const packs = [];
  const nodes = [];
  const relationships = [];
  const warnings = [];
  const errors = [];

  for (const rawReference of asArray(references)) {
    const reference = normalizePackReference(rawReference);
    if (!reference || !reference.source) continue;
    const candidateRoots = [
      path.resolve(baseDir, reference.source),
      ...extraBaseDirs.map((dir) => path.resolve(dir, reference.source))
    ];
    const root = candidateRoots.find((candidate) => fs.existsSync(candidate)) || candidateRoots[0];
    const loaded = loadSubstratePack(root, {
      pack: reference,
      receivingNamespace: options.receivingNamespace || options.namespace
    });
    packs.push(loaded);
    nodes.push(...loaded.nodes);
    relationships.push(...loaded.relationships);
    warnings.push(...loaded.warnings);
    errors.push(...loaded.errors);
  }

  return { packs, nodes, relationships, warnings, errors };
}
