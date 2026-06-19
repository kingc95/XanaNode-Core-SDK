import fs from "node:fs";
import path from "node:path";

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

function markImported(value, filePath, rootDir, pack = {}) {
  return {
    ...value,
    imported_from: value.imported_from || path.relative(rootDir, filePath).replace(/\\/g, "/"),
    ...(pack.id ? { pack_id: pack.id } : {}),
    ...(pack.mode ? { pack_mode: pack.mode } : {})
  };
}

function collectJsonArtifact(value, filePath, rootDir, pack, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonArtifact(item, filePath, rootDir, pack, output);
    return;
  }
  if (!isPlainObject(value)) return;

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

  for (const filePath of walkJsonFiles(rootDir).sort()) {
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
