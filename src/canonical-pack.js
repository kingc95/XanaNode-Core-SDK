import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSubstrate } from "./build.js";
import { writeJson } from "./io.js";
import { loadSubstratePack } from "./packs.js";
import { validateSubstrateArtifacts } from "./validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledCanonicalPackRoot = path.join(packageRoot, "packs", "xananode-canonical");
const schemaRoot = path.join(packageRoot, "schemas");
const registryRoot = path.join(packageRoot, "registry");
const assertedAt = "2026-06-19T00:00:00.000Z";

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function registrySlug(value) {
  return String(value || "type")
    .replace(/^[^:]+:/, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function latestRegistryFile(prefix) {
  const files = fs.readdirSync(schemaRoot)
    .filter((name) => name.startsWith(`${prefix}.v`) && name.endsWith(".json") && !name.includes(".schema."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files.at(-1);
}

function registryNodeId(kind, type) {
  return `xananode.canonical:schema/${kind}-${registrySlug(type)}`;
}

function registryRelationshipId(kind, type) {
  return `xananode.canonical:rel/registry-contains-${kind}-${registrySlug(type)}`;
}

function protocolSourceUrl(relativePath) {
  return `https://github.com/kingc95/XanaNode-Protocol/blob/main/${String(relativePath || "").replace(/\\/g, "/").replace(/^\.\.\//, "")}`;
}

function schemaRegistryNode(id, title, summary, subtype = "validation_rule", importance = 4, extra = {}) {
  return {
    id: `xananode.canonical:schema/${id}`,
    title,
    type: "schema",
    subtype,
    importance,
    summary,
    relationships: [],
    ...extra
  };
}

function schemaRegistryRelationship(source, target, type, summary, index = "") {
  return {
    id: `xananode.canonical:rel/${registrySlug(source)}-${type}-${registrySlug(target)}${index ? `-${index}` : ""}`,
    source,
    target,
    type,
    summary,
    weight: type === "defines" || type === "contains" ? 5 : 4,
    visibility: type === "contains" || type === "defines" ? "primary" : "secondary",
    asserted_at: assertedAt
  };
}

function buildRegistryContainerNodes() {
  return [
    schemaRegistryNode(
      "namespace-registry",
      "Namespace Registry",
      "The protocol registry of known namespace identifiers, owners, and extension vocabularies.",
      "governance_rule",
      5,
      { source_url: protocolSourceUrl("registry/namespaces.json") }
    ),
    schemaRegistryNode(
      "known-implementations-registry",
      "Known Implementations Registry",
      "The protocol registry of tools, renderers, validators, and substrates that declare XanaNode compatibility.",
      "governance_rule",
      4,
      { source_url: protocolSourceUrl("registry/known-implementations.json") }
    ),
    schemaRegistryNode(
      "canonical-schemas-registry",
      "Canonical Schemas Registry",
      "The protocol registry that identifies canonical schema artifacts and their current versions.",
      "validation_rule",
      5,
      { source_url: protocolSourceUrl("registry/canonical-schemas.json") }
    ),
    schemaRegistryNode(
      "property-registry",
      "Property Registry",
      "The canonical registry of standardized open-ended node properties for dates, coordinates, money, measurements, and external identifiers.",
      "validation_rule",
      5,
      { source_url: protocolSourceUrl("schemas/xananode-property-registry.v0.1.0.json") }
    )
  ];
}

function buildRegistryTypeNodes() {
  const nodes = [];
  const relationships = [];
  const nodeTypesFile = latestRegistryFile("xananode-node-types");
  const relationshipTypesFile = latestRegistryFile("xananode-relationship-types");

  if (nodeTypesFile) {
    const registry = readJson(path.join(schemaRoot, nodeTypesFile));
    for (const item of registry.node_types || []) {
      const type = item.type;
      if (!type) continue;
      const nodeId = registryNodeId("node-type", type);
      nodes.push({
        id: nodeId,
        title: item.label || `${type} Node Type`,
        type: "schema",
        subtype: "node_type_schema",
        importance: item.core ? 5 : 3,
        summary: item.purpose || `The ${type} node type in the XanaNode node type registry.`,
        version: registry.version || "",
        registry_type: type,
        registry_namespace: item.namespace || "xananode",
        allowed_subtypes: item.allowed_subtypes || [],
        required_frontmatter: item.required_frontmatter || [],
        recommended_frontmatter: item.recommended_frontmatter || [],
        color: item.color,
        relationships: []
      });
      relationships.push({
        id: registryRelationshipId("node-type", type),
        source: "xananode.canonical:schema/node-type-registry",
        target: nodeId,
        type: "contains",
        summary: `The node type registry contains the ${type} node type.`,
        weight: item.core ? 5 : 3,
        visibility: item.core ? "primary" : "secondary",
        asserted_at: assertedAt
      });
    }
  }

  if (relationshipTypesFile) {
    const registry = readJson(path.join(schemaRoot, relationshipTypesFile));
    const declaredTypes = new Set((registry.relationship_types || []).map((item) => item.type).filter(Boolean));
    const inverseTerms = new Map();
    for (const item of registry.relationship_types || []) {
      const type = item.type;
      if (!type) continue;
      if (item.inverse && !declaredTypes.has(item.inverse) && !inverseTerms.has(item.inverse)) {
        inverseTerms.set(item.inverse, item);
      }
      const nodeId = registryNodeId("relationship-type", type);
      nodes.push({
        id: nodeId,
        title: item.label || `${type} Relationship Type`,
        type: "schema",
        subtype: "relationship_type_schema",
        importance: item.core ? 5 : 3,
        summary: item.meaning || `The ${type} relationship type in the XanaNode relationship type registry.`,
        version: registry.version || "",
        registry_type: type,
        registry_namespace: item.namespace || "xananode",
        category: item.category || "",
        inverse: item.inverse || "",
        default_weight: item.default_weight,
        default_visibility: item.default_visibility,
        relationships: []
      });
      relationships.push({
        id: registryRelationshipId("relationship-type", type),
        source: "xananode.canonical:schema/relationship-type-registry",
        target: nodeId,
        type: "contains",
        summary: `The relationship type registry contains the ${type} relationship type.`,
        weight: item.core ? 5 : 3,
        visibility: item.core ? "primary" : "secondary",
        asserted_at: assertedAt
      });
      if (item.inverse) {
        relationships.push(schemaRegistryRelationship(
          nodeId,
          registryNodeId("relationship-type", item.inverse),
          "related_to",
          `${item.label || type} has inverse ${item.inverse}.`,
          "inverse"
        ));
      }
    }
    for (const [inverseType, sourceItem] of inverseTerms.entries()) {
      const nodeId = registryNodeId("relationship-type", inverseType);
      const sourceNodeId = registryNodeId("relationship-type", sourceItem.type);
      nodes.push({
        id: nodeId,
        title: `${inverseType.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())} Relationship Term`,
        type: "schema",
        subtype: "relationship_type_schema",
        importance: sourceItem.core ? 4 : 3,
        summary: `The ${inverseType} inverse relationship term derived from ${sourceItem.type}.`,
        version: registry.version || "",
        registry_type: inverseType,
        registry_namespace: sourceItem.namespace || "xananode",
        category: sourceItem.category || "",
        inverse: sourceItem.type || "",
        derived_inverse: true,
        default_weight: sourceItem.default_weight,
        default_visibility: sourceItem.default_visibility,
        relationships: []
      });
      relationships.push({
        id: registryRelationshipId("relationship-type", inverseType),
        source: "xananode.canonical:schema/relationship-type-registry",
        target: nodeId,
        type: "contains",
        summary: `The relationship type registry documents the ${inverseType} inverse relationship term.`,
        weight: sourceItem.core ? 4 : 3,
        visibility: "secondary",
        asserted_at: assertedAt
      });
      relationships.push(schemaRegistryRelationship(
        nodeId,
        sourceNodeId,
        "related_to",
        `${inverseType} is the inverse term for ${sourceItem.type}.`,
        "inverse"
      ));
    }
  }

  return { nodes, relationships };
}

function buildPropertyRegistryNodes() {
  const nodes = [];
  const relationships = [];
  const propertyRegistryFile = latestRegistryFile("xananode-property-registry");
  if (!propertyRegistryFile) return { nodes, relationships };
  const registry = readJson(path.join(schemaRoot, propertyRegistryFile));
  for (const item of registry.property_registry || []) {
    if (!item.id) continue;
    const nodeId = `xananode.canonical:schema/property-${registrySlug(item.id)}`;
    nodes.push({
      id: nodeId,
      title: item.label || item.id,
      type: "schema",
      subtype: "property_registry_entry",
      importance: 4,
      summary: item.description || `The ${item.id} property in the XanaNode property registry.`,
      registry_type: item.id,
      category: item.category || "",
      aliases: item.aliases || [],
      applies_to: item.applies_to || [],
      unit_system: item.unit_system || "",
      value_schema: item.value_schema || {},
      examples: item.examples || [],
      relationships: []
    });
    relationships.push(schemaRegistryRelationship(
      "xananode.canonical:schema/property-registry",
      nodeId,
      "contains",
      `The property registry contains the ${item.id} property.`
    ));
    for (const nodeType of item.applies_to || []) {
      relationships.push(schemaRegistryRelationship(
        nodeId,
        registryNodeId("node-type", nodeType),
        "uses",
        `${item.label || item.id} applies to ${nodeType} nodes.`
      ));
    }
  }
  return { nodes, relationships };
}

function buildProtocolMetadataRegistryNodes() {
  const nodes = buildRegistryContainerNodes();
  const relationships = [];

  const canonicalSchemasPath = path.join(registryRoot, "canonical-schemas.json");
  if (fs.existsSync(canonicalSchemasPath)) {
    const registry = readJson(canonicalSchemasPath);
    for (const item of registry.schemas || []) {
      if (!item.id) continue;
      const nodeId = `xananode.canonical:schema/canonical-schema-${registrySlug(item.id)}`;
      nodes.push({
        id: nodeId,
        title: `${String(item.id).replaceAll("-", " ")} Schema`.replace(/\b\w/g, (char) => char.toUpperCase()),
        type: "schema",
        subtype: "canonical_schema_record",
        importance: item.id.includes("xananode") || item.id.startsWith("substrate") ? 5 : 4,
        summary: `Canonical schema registry entry for ${item.id}.`,
        registry_type: item.id,
        version: item.version || "",
        schema_path: item.schema || "",
        artifact_path: item.path || "",
        source_url: protocolSourceUrl(item.schema || item.path || ""),
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        "xananode.canonical:schema/canonical-schemas-registry",
        nodeId,
        "contains",
        `The canonical schemas registry contains the ${item.id} schema record.`
      ));
      if (item.id === "xananode-node-types") {
        relationships.push(schemaRegistryRelationship(nodeId, "xananode.canonical:schema/node-type-registry", "documents", "The canonical schema record documents the node type registry."));
      } else if (item.id === "xananode-relationship-types") {
        relationships.push(schemaRegistryRelationship(nodeId, "xananode.canonical:schema/relationship-type-registry", "documents", "The canonical schema record documents the relationship type registry."));
      } else if (item.id === "xananode-property-registry") {
        relationships.push(schemaRegistryRelationship(nodeId, "xananode.canonical:schema/property-registry", "documents", "The canonical schema record documents the property registry."));
      }
    }
  }

  const namespacesPath = path.join(registryRoot, "namespaces.json");
  if (fs.existsSync(namespacesPath)) {
    const registry = readJson(namespacesPath);
    for (const item of registry.namespaces || []) {
      if (!item.id) continue;
      const nodeId = `xananode.canonical:schema/namespace-${registrySlug(item.id)}`;
      nodes.push({
        id: nodeId,
        title: item.name || item.id,
        type: "schema",
        subtype: "namespace_record",
        importance: item.id === "xananode" ? 5 : 3,
        summary: item.description || `Namespace registry entry for ${item.id}.`,
        registry_type: item.id,
        schema_path: item.schema || "",
        example_path: item.example || "",
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        "xananode.canonical:schema/namespace-registry",
        nodeId,
        "contains",
        `The namespace registry contains the ${item.id} namespace.`
      ));
      if (item.id === "xananode") {
        relationships.push(schemaRegistryRelationship(nodeId, "xananode.canonical:concept/xananode", "represents", "The xananode namespace represents XanaNode Core vocabulary."));
      }
    }
  }

  const implementationsPath = path.join(registryRoot, "known-implementations.json");
  if (fs.existsSync(implementationsPath)) {
    const registry = readJson(implementationsPath);
    for (const item of registry.implementations || []) {
      if (!item.name) continue;
      const nodeId = `xananode.canonical:project/${registrySlug(item.name)}`;
      nodes.push({
        id: nodeId,
        title: item.name,
        type: "project",
        subtype: item.type || "implementation",
        importance: item.status === "active" ? 4 : 3,
        summary: item.description || `${item.name} implementation registry entry.`,
        status: item.status || "",
        source_url: item.url || "",
        repository: item.repository || "",
        protocol_role: item.protocol_role || "",
        consumes: item.consumes || [],
        related_protocol_artifacts: item.related_protocol_artifacts || [],
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        "xananode.canonical:schema/known-implementations-registry",
        nodeId,
        "contains",
        `The known implementations registry contains ${item.name}.`
      ));
      relationships.push(schemaRegistryRelationship(
        nodeId,
        "xananode.canonical:concept/substrate-projection-layer",
        "implements",
        `${item.name} implements a XanaNode projection or tooling role.`
      ));
    }
  }

  return { nodes, relationships };
}

function buildProtocolDigitalTwinNodes() {
  const parts = [
    buildRegistryTypeNodes(),
    buildPropertyRegistryNodes(),
    buildProtocolMetadataRegistryNodes()
  ];
  return {
    nodes: parts.flatMap((part) => part.nodes),
    relationships: parts.flatMap((part) => part.relationships)
  };
}

function writePackArtifacts(outDir, pack) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "nodes"), { recursive: true });
  writeJson(path.join(outDir, "substrate.json"), pack.manifest);
  writeJson(path.join(outDir, "nodes.json"), { nodes: pack.nodes });
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
  const registryTypes = buildProtocolDigitalTwinNodes();
  const nodesById = new Map();
  const relationshipsById = new Map();
  for (const node of [...loaded.nodes.map(cleanBundledRecord), ...registryTypes.nodes]) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }
  for (const relationship of [...loaded.relationships.map(cleanBundledRecord), ...registryTypes.relationships]) {
    if (!relationshipsById.has(relationship.id)) relationshipsById.set(relationship.id, relationship);
  }
  const nodes = [...nodesById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relationships = [...relationshipsById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
