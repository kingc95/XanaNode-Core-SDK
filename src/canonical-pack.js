import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildSubstrate, filterSubstrateForSharing } from "./build.js";
import { writeJson } from "./io.js";
import { loadSubstratePack } from "./packs.js";
import { validateSubstrateArtifacts } from "./validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledCanonicalPackRoot = path.join(packageRoot, "packs", "xananode-canonical");
const schemaRoot = path.join(packageRoot, "schemas");
const registryRoot = path.join(packageRoot, "registry");
const protocolRoot = path.join(packageRoot, "vendor", "xananode-protocol");
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

function isGeneratedCanonicalFaqRecord(record) {
  const id = String(record?.id || "");
  const source = String(record?.source || "");
  return source.startsWith("xananode.canonical:question/")
    || id.startsWith("xananode.canonical:question/")
    || id.startsWith("xananode.canonical:rel/question-");
}

function duplicatePreference(node) {
  const id = String(node?.id || "");
  const subtype = String(node?.subtype || "");
  if (subtype === "canonical_schema_record") return 80;
  if (id.includes(":source/repository-")) return 75;
  if (subtype === "git_repository") return 70;
  if (subtype === "validation_rule") return 45;
  return 50;
}

function duplicateIdentityKey(node) {
  const title = String(node?.title || "").trim().toLowerCase();
  const type = String(node?.type || "").trim().toLowerCase();
  if (!title || !type) return "";
  if (type === "schema" && String(node?.source_url || "").includes("github.com/kingc95/XanaNode-Protocol/blob/main/")) {
    return `${type}::${title}`;
  }
  if (type === "source" && String(node?.subtype || "") === "git_repository") {
    return `${type}::${title}`;
  }
  return "";
}

function collapseDuplicateCanonicalNodes(nodes = [], relationships = []) {
  const canonicalByKey = new Map();
  const aliasById = new Map();
  const duplicates = [];

  for (const node of nodes) {
    const key = duplicateIdentityKey(node);
    if (!key) continue;
    const existing = canonicalByKey.get(key);
    if (!existing) {
      canonicalByKey.set(key, node);
      continue;
    }
    const preferred = duplicatePreference(node) > duplicatePreference(existing) ? node : existing;
    const duplicate = preferred === node ? existing : node;
    canonicalByKey.set(key, preferred);
    aliasById.set(duplicate.id, preferred.id);
    duplicates.push({
      dropped: duplicate.id,
      kept: preferred.id,
      title: preferred.title,
      type: preferred.type
    });
  }

  if (!duplicates.length) return { nodes, relationships, duplicates };

  const droppedIds = new Set(duplicates.map((item) => item.dropped));
  const rewrittenRelationships = relationships
    .filter((relationship) => !droppedIds.has(relationship.id))
    .map((relationship) => ({
      ...relationship,
      source: aliasById.get(relationship.source) || relationship.source,
      target: aliasById.get(relationship.target) || relationship.target
    }))
    .filter((relationship) => relationship.source !== relationship.target);
  const relationshipMap = new Map();
  for (const relationship of rewrittenRelationships) {
    const key = [relationship.source, relationship.type, relationship.target].join("::");
    if (!relationshipMap.has(key)) relationshipMap.set(key, relationship);
  }

  return {
    nodes: nodes.filter((node) => !droppedIds.has(node.id)),
    relationships: [...relationshipMap.values()],
    duplicates
  };
}

function protocolRawRelativePath(node) {
  const candidates = [
    node?.schema_path,
    node?.artifact_path,
    node?.example_path,
    node?.source_url
  ].filter(Boolean);
  for (const value of candidates) {
    const raw = String(value || "");
    if (raw.includes("github.com/kingc95/XanaNode-Protocol/blob/main/")) {
      return raw.split("github.com/kingc95/XanaNode-Protocol/blob/main/").pop();
    }
    if (raw.includes("github.com/kingc95/XanaNode/blob/main/")) {
      return raw.split("github.com/kingc95/XanaNode/blob/main/").pop();
    }
    if (!/^https?:\/\//.test(raw)) {
      return raw.replace(/\\/g, "/").replace(/^\.\.\//, "");
    }
  }
  return "";
}

function attachProtocolRawSnapshots(nodes = [], outDir, generatedAt = new Date().toISOString()) {
  const copied = [];
  const updatedNodes = nodes.map((node) => {
    const relativePath = protocolRawRelativePath(node);
    if (!relativePath || relativePath.endsWith("/")) return node;
    const sourcePath = path.resolve(protocolRoot, relativePath);
    if (!sourcePath.startsWith(protocolRoot) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) return node;

    const assetPath = `assets/raw/protocol/${safeRelativeAssetPath(relativePath)}`;
    const targetPath = path.join(outDir, assetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    const contentId = sha256File(sourcePath);
    copied.push({ node: node.id, source: relativePath, asset_path: assetPath, content_id: contentId });
    return {
      ...node,
      asset_path: node.asset_path || assetPath,
      asset_role: node.asset_role || "canonical_raw_source",
      content_id: node.content_id || contentId,
      source_snapshot: {
        ...(node.source_snapshot || {}),
        captured_at: generatedAt,
        source_url: node.source_url || protocolSourceUrl(relativePath),
        method: "archive",
        content_id: contentId,
        rights_status: node.rights_status || "canonical-public",
        tool: "@xananode/core"
      }
    };
  });
  return { nodes: updatedNodes, copied };
}

function listProtocolRawFiles(root = protocolRoot) {
  const includeRoots = new Set(["contexts", "examples", "governance", "links", "media", "proposals", "registry", "schemas", "specs", "tools"]);
  const includeRootFiles = new Set(["LICENSE.md", "NOTICE", "README.md", "TRADEMARK.md"]);
  const includeExtensions = new Set([".json", ".jsonld", ".md", ".txt", ".svg", ".png", ".ico", ".webmanifest"]);
  const files = [];

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      const top = relativePath.split("/")[0];
      if (entry.isDirectory()) {
        if (includeRoots.has(top)) visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!includeRootFiles.has(relativePath) && !includeRoots.has(top)) continue;
      if (!includeExtensions.has(ext) && !includeRootFiles.has(relativePath)) continue;
      files.push(relativePath);
    }
  }

  visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function copyProtocolRawRepositorySnapshot(outDir) {
  const copied = [];
  for (const relativePath of listProtocolRawFiles()) {
    const sourcePath = path.resolve(protocolRoot, relativePath);
    if (!sourcePath.startsWith(protocolRoot) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
    const assetPath = `assets/raw/protocol/${safeRelativeAssetPath(relativePath)}`;
    const targetPath = path.join(outDir, assetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    copied.push({
      source: relativePath,
      asset_path: assetPath,
      content_id: sha256File(sourcePath)
    });
  }
  return copied;
}

function copyProtocolProjectionAssets(outDir) {
  const source = path.join(protocolRoot, "media", "projection");
  if (!fs.existsSync(source)) return [];
  const target = path.join(outDir, "assets", "projection");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  const copied = [];
  const stack = [source];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(source, full).replaceAll("\\", "/");
      copied.push({
        source: `media/projection/${relative}`,
        asset_path: `assets/projection/${relative}`,
        content_id: sha256File(full)
      });
    }
  }
  return copied;
}

function collectSourceAssetFiles(rootDir) {
  const assetRoot = path.join(rootDir, "assets");
  if (!fs.existsSync(assetRoot)) return [];
  const files = [];
  const stack = [assetRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(path.relative(rootDir, fullPath).replace(/\\/g, "/"));
    }
  }
  return files;
}

function localAssetPathCandidates(node) {
  const candidates = [
    node?.asset_path,
    node?.file,
    node?.source_snapshot?.asset_path,
    node?.source_snapshot?.file
  ].filter(Boolean);
  return candidates
    .map((value) => String(value || "").replace(/\\/g, "/"))
    .filter((value) => value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//"));
}

function copySourcePackAssets(sourceRoots = [], outDir, nodes = []) {
  const copiedByAssetPath = new Map();
  const duplicates = [];
  const conflicts = [];
  const roots = asArray(sourceRoots).map((root) => path.resolve(root));
  const assetPaths = new Set();

  for (const root of roots) {
    for (const relativePath of collectSourceAssetFiles(root)) assetPaths.add(relativePath);
  }
  for (const node of nodes) {
    for (const assetPath of localAssetPathCandidates(node)) assetPaths.add(assetPath);
  }

  for (const assetPath of [...assetPaths].sort((a, b) => a.localeCompare(b))) {
    const safePath = safeRelativeAssetPath(assetPath);
    if (!safePath) continue;
    const source = roots
      .map((root) => path.resolve(root, assetPath))
      .find((candidate) => roots.some((root) => candidate.startsWith(`${root}${path.sep}`) || candidate === root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!source) continue;
    const contentId = sha256File(source);
    const targetAssetPath = safePath.startsWith("assets/") ? safePath : `assets/imported/${safePath}`;
    const existing = copiedByAssetPath.get(targetAssetPath);
    if (existing) {
      if (existing.content_id === contentId) {
        duplicates.push({ asset_path: targetAssetPath, source: path.relative(process.cwd(), source).replace(/\\/g, "/"), duplicate_of: existing.source, content_id: contentId });
        continue;
      }
      conflicts.push({ asset_path: targetAssetPath, source: path.relative(process.cwd(), source).replace(/\\/g, "/"), existing_source: existing.source, existing_content_id: existing.content_id, content_id: contentId });
      continue;
    }
    const targetPath = path.join(outDir, targetAssetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(source, targetPath);
    const record = {
      source: path.relative(process.cwd(), source).replace(/\\/g, "/"),
      asset_path: targetAssetPath,
      content_id: contentId
    };
    copiedByAssetPath.set(targetAssetPath, record);
  }

  return {
    copied: [...copiedByAssetPath.values()],
    duplicates,
    conflicts
  };
}

function mergeNodeRecord(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    relationships: Object.prototype.hasOwnProperty.call(incoming, "relationships")
      ? incoming.relationships || []
      : existing.relationships || []
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function safeRelativeAssetPath(relativePath) {
  return String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\.\//, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .join("/");
}

function packageVersion() {
  try {
    return readJson(path.join(packageRoot, "package.json")).version || "";
  } catch {
    return "";
  }
}

function gitValue(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : "";
}

function buildTimestamp(options = {}) {
  return options.generatedAt || process.env.XANANODE_BUILD_DATE || new Date().toISOString();
}

function coreBuildMetadata(options = {}) {
  const generatedAt = buildTimestamp(options);
  return {
    version: packageVersion(),
    git_commit: gitValue(packageRoot, ["rev-parse", "HEAD"]),
    git_branch: gitValue(packageRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    repository: "kingc95/XanaNode-Core-SDK",
    generated_at: generatedAt,
    built_by: "@xananode/core",
    runtime: `node ${process.version}`,
    platform: `${process.platform}/${process.arch}`,
    dependencies: [
      {
        name: "XanaNode Protocol",
        version: "",
        repository: "kingc95/XanaNode",
        relationship: "uses",
        ...(gitValue(protocolRoot, ["rev-parse", "HEAD"]) ? { version: gitValue(protocolRoot, ["rev-parse", "--short", "HEAD"]) } : {})
      }
    ],
    ...(options.buildMetadata || {})
  };
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

function subtypeNodeId(nodeType, subtype) {
  return registryNodeId("node-subtype", `${nodeType}-${subtype}`);
}

function projectionMediaNodeId(kind, value) {
  return `xananode.canonical:media/${kind}-${registrySlug(value)}-projection-icon`;
}

function registryRelationshipId(kind, type) {
  return `xananode.canonical:rel/registry-contains-${kind}-${registrySlug(type)}`;
}

function protocolSourceUrl(relativePath) {
  return `https://github.com/kingc95/XanaNode-Protocol/blob/main/${String(relativePath || "").replace(/\\/g, "/").replace(/^\.\.\//, "")}`;
}

function protocolRawFileKind(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if ([".svg", ".png", ".ico"].includes(ext)) {
    return {
      type: "media",
      subtype: "protocol_media_asset",
      media_type: "image",
      mime_type: ext === ".svg" ? "image/svg+xml" : ext === ".ico" ? "image/x-icon" : "image/png"
    };
  }
  if ([".json", ".jsonld", ".webmanifest"].includes(ext)) {
    return {
      type: "schema",
      subtype: "protocol_json_artifact",
      media_type: "document",
      mime_type: ext === ".jsonld" ? "application/ld+json" : "application/json"
    };
  }
  return {
    type: "source",
    subtype: "protocol_document",
    media_type: "document",
    mime_type: "text/markdown"
  };
}

function protocolRawFileTitle(relativePath) {
  const clean = String(relativePath || "").replace(/\\/g, "/");
  if (clean === "README.md") return "XanaNode Protocol README";
  if (clean === "LICENSE.md") return "XanaNode Protocol License";
  if (clean === "TRADEMARK.md") return "XanaNode Trademark Policy";
  if (clean === "NOTICE") return "XanaNode Protocol Notice";
  const withoutExt = clean.replace(/\.[^.]+$/, "");
  return withoutExt
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" / ");
}

function readProtocolRawText(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (![".json", ".jsonld", ".md", ".txt", ".webmanifest", ""].includes(ext)) return "";
  const sourcePath = path.resolve(protocolRoot, relativePath);
  if (!sourcePath.startsWith(protocolRoot) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) return "";
  try {
    return fs.readFileSync(sourcePath, "utf8");
  } catch {
    return "";
  }
}

function githubRepoUrl(repository) {
  return repository ? `https://github.com/${repository}` : "";
}

function implementationBuildMetadata(item, options = {}) {
  const metadata = {
    version: item.version || "",
    repository: item.repository || "",
    generated_at: buildTimestamp(options),
    built_by: "@xananode/core"
  };
  if (item.repository === "kingc95/XanaNode-Core-SDK") {
    const coreMetadata = coreBuildMetadata(options);
    return {
      ...metadata,
      ...coreMetadata,
      dependencies: [
        ...(coreMetadata.dependencies || []),
        ...(item.consumes || []).map((name) => ({ name, relationship: "consumes" }))
      ]
    };
  }
  if (item.repository === "kingc95/XanaNode") {
    return {
      ...metadata,
      git_commit: gitValue(protocolRoot, ["rev-parse", "HEAD"]),
      git_branch: gitValue(protocolRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      dependencies: []
    };
  }
  return {
    ...metadata,
    dependencies: (item.consumes || []).map((name) => ({ name, relationship: "consumes" }))
  };
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

function projectionAssetSourcePath(assetPath = "") {
  const relative = String(assetPath || "").replace(/^assets\/projection\//, "media/projection/");
  const sourcePath = path.join(protocolRoot, relative);
  return fs.existsSync(sourcePath) ? sourcePath : "";
}

function projectionMediaNode(kind, value, title, assetPath, assetRole, summary) {
  const sourcePath = projectionAssetSourcePath(assetPath);
  return {
    id: projectionMediaNodeId(kind, value),
    title,
    type: "media",
    subtype: "projection_icon",
    media_type: "image",
    mime_type: "image/svg+xml",
    asset_path: assetPath,
    asset_role: assetRole,
    source_url: sourcePath ? protocolSourceUrl(path.relative(protocolRoot, sourcePath).replaceAll("\\", "/")) : "",
    rights_status: "open-source",
    importance: 3,
    summary,
    relationships: []
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
      if (item.projection?.asset_path && projectionAssetSourcePath(item.projection.asset_path)) {
        const mediaNode = projectionMediaNode(
          "node-type",
          type,
          `${item.label || type} Projection Icon`,
          item.projection.asset_path,
          "node_type_projection_icon",
          `The canonical projection icon for the ${type} node type.`
        );
        nodes.push(mediaNode);
        relationships.push(schemaRegistryRelationship(
          nodeId,
          mediaNode.id,
          "has_primary_media",
          `The ${type} node type uses this projection icon as its primary type media.`
        ));
        relationships.push(schemaRegistryRelationship(
          mediaNode.id,
          nodeId,
          "represents",
          `This media asset represents the ${type} node type in graph projections.`
        ));
      }
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
      for (const subtype of item.allowed_subtypes || []) {
        const subtypeId = subtypeNodeId(type, subtype);
        nodes.push({
          id: subtypeId,
          title: `${item.label || type} subtype: ${String(subtype).replaceAll("_", " ")}`,
          type: "schema",
          subtype: "node_subtype_schema",
          importance: item.core ? 4 : 3,
          summary: `${subtype} is an allowed subtype of the ${type} node type.`,
          version: registry.version || "",
          registry_type: subtype,
          registry_namespace: item.namespace || "xananode",
          parent_node_type: type,
          relationships: []
        });
        relationships.push(schemaRegistryRelationship(
          nodeId,
          subtypeId,
          "contains",
          `The ${type} node type contains the ${subtype} subtype.`
        ));
        relationships.push(schemaRegistryRelationship(
          subtypeId,
          nodeId,
          "extension_of",
          `${subtype} is a subtype extension of ${type}.`
        ));
      }
    }
  }

  if (relationshipTypesFile) {
    const registry = readJson(path.join(schemaRoot, relationshipTypesFile));
    const declaredTypes = new Set((registry.relationship_types || []).map((item) => item.type).filter(Boolean));
    const categoryIds = new Map();
    const inverseTerms = new Map();
    for (const item of registry.relationship_types || []) {
      const type = item.type;
      if (!type) continue;
      if (item.category && !categoryIds.has(item.category)) {
        const categoryNodeId = registryNodeId("relationship-category", item.category);
        categoryIds.set(item.category, categoryNodeId);
        nodes.push({
          id: categoryNodeId,
          title: `${String(item.category).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())} Relationship Category`,
          type: "schema",
          subtype: "relationship_category_schema",
          importance: 4,
          summary: `The ${item.category} category groups relationship types with related meaning.`,
          version: registry.version || "",
          registry_type: item.category,
          registry_namespace: item.namespace || "xananode",
          color: item.color || "",
          inverse_color: item.inverse_color || "",
          line_style: item.line_style || "",
          inverse_line_style: item.inverse_line_style || "",
          relationships: []
        });
        const categoryProjectionPath = item.projection?.category_asset_path || `assets/projection/relationship-categories/${item.category}.svg`;
        if (projectionAssetSourcePath(categoryProjectionPath)) {
          const mediaNode = projectionMediaNode(
            "relationship-category",
            item.category,
            `${String(item.category).replaceAll("_", " ")} Relationship Category Projection Icon`,
            categoryProjectionPath,
            "relationship_category_projection_icon",
            `The canonical projection icon for the ${item.category} relationship category.`
          );
          nodes.push(mediaNode);
          relationships.push(schemaRegistryRelationship(
            categoryNodeId,
            mediaNode.id,
            "has_primary_media",
            `The ${item.category} relationship category uses this projection icon.`
          ));
          relationships.push(schemaRegistryRelationship(
            mediaNode.id,
            categoryNodeId,
            "represents",
            `This media asset represents the ${item.category} relationship category in projections.`
          ));
        }
        relationships.push(schemaRegistryRelationship(
          "xananode.canonical:schema/relationship-type-registry",
          categoryNodeId,
          "contains",
          `The relationship type registry contains the ${item.category} category.`
        ));
      }
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
        color: item.color || "",
        inverse_color: item.inverse_color || "",
        line_style: item.line_style || "",
        inverse_line_style: item.inverse_line_style || "",
        default_weight: item.default_weight,
        default_visibility: item.default_visibility,
        relationships: []
      });
      if (item.projection?.asset_path && projectionAssetSourcePath(item.projection.asset_path)) {
        const mediaNode = projectionMediaNode(
          "relationship-type",
          type,
          `${item.label || type} Relationship Projection Icon`,
          item.projection.asset_path,
          "relationship_type_projection_icon",
          `The canonical projection icon for the ${type} relationship type.`
        );
        nodes.push(mediaNode);
        relationships.push(schemaRegistryRelationship(
          nodeId,
          mediaNode.id,
          "has_primary_media",
          `The ${type} relationship type uses this projection icon.`
        ));
        relationships.push(schemaRegistryRelationship(
          mediaNode.id,
          nodeId,
          "represents",
          `This media asset represents the ${type} relationship type in projection legends and catalogs.`
        ));
      }
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
      if (item.category && categoryIds.has(item.category)) {
        relationships.push(schemaRegistryRelationship(
          categoryIds.get(item.category),
          nodeId,
          "contains",
          `The ${item.category} relationship category contains ${type}.`
        ));
      }
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
        color: sourceItem.inverse_color || sourceItem.color || "",
        inverse_color: sourceItem.color || sourceItem.inverse_color || "",
        line_style: sourceItem.inverse_line_style || sourceItem.line_style || "",
        inverse_line_style: sourceItem.line_style || sourceItem.inverse_line_style || "",
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
      if (sourceItem.category && categoryIds.has(sourceItem.category)) {
        relationships.push(schemaRegistryRelationship(
          categoryIds.get(sourceItem.category),
          nodeId,
          "contains",
          `The ${sourceItem.category} relationship category contains the ${inverseType} inverse term.`
        ));
      }
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

function buildSoftwareStackNodes(options = {}) {
  const nodes = [];
  const relationships = [];
  const implementationsPath = path.join(registryRoot, "known-implementations.json");
  if (!fs.existsSync(implementationsPath)) return { nodes, relationships };
  const registry = readJson(implementationsPath);

  for (const item of registry.implementations || []) {
    if (!item.name) continue;
    const projectId = `xananode.canonical:project/${registrySlug(item.name)}`;
    const repoId = `xananode.canonical:source/repository-${registrySlug(item.repository || item.name)}`;
    const buildMetadata = implementationBuildMetadata(item, options);

    nodes.push({
      id: repoId,
      title: `${item.name} Repository`,
      type: "source",
      subtype: "git_repository",
      importance: item.status === "active" ? 4 : 3,
      summary: `Public Git repository for ${item.name}.`,
      source_url: item.url || githubRepoUrl(item.repository),
      repository: item.repository || "",
      rights_status: "external",
      relationships: []
    });
    relationships.push(schemaRegistryRelationship(
      repoId,
      projectId,
      "documents",
      `${item.name} is documented and versioned in its public repository.`
    ));

    nodes.push({
      id: projectId,
      title: item.name,
      type: "project",
      subtype: item.type || "implementation",
      importance: item.status === "active" ? 4 : 3,
      summary: item.description || `${item.name} implementation registry entry.`,
      status: item.status || "",
      source_url: item.url || "",
      repository: item.repository || "",
      protocol_role: item.protocol_role || "",
      software_version: item.version || "",
      build_metadata: buildMetadata,
      consumes: item.consumes || [],
      related_protocol_artifacts: item.related_protocol_artifacts || [],
      relationships: []
    });

    for (const [index, name] of (item.consumes || []).entries()) {
      const componentId = `xananode.canonical:technology/${registrySlug(item.name)}-component-${registrySlug(name)}`;
      nodes.push({
        id: componentId,
        title: `${item.name}: ${name}`,
        type: "technology",
        subtype: "software_component",
        importance: 3,
        summary: `${item.name} consumes or depends on ${name}.`,
        component_of: projectId,
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        projectId,
        componentId,
        "uses",
        `${item.name} uses ${name}.`,
        `component-${index}`
      ));
    }

    for (const [index, artifact] of (item.related_protocol_artifacts || []).entries()) {
      const artifactPath = String(artifact || "").replace(/^\.\.\//, "");
      const artifactId = `xananode.canonical:schema/protocol-artifact-${registrySlug(artifactPath)}`;
      nodes.push({
        id: artifactId,
        title: artifactPath || "Protocol artifact",
        type: "schema",
        subtype: "protocol_artifact",
        importance: artifactPath.includes("schemas/") ? 4 : 3,
        summary: `${item.name} references the protocol artifact ${artifactPath}.`,
        artifact_path: artifactPath,
        source_url: protocolSourceUrl(artifactPath),
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        projectId,
        artifactId,
        "uses",
        `${item.name} uses ${artifactPath}.`,
        `artifact-${index}`
      ));
    }
  }

  return { nodes, relationships };
}

function canonicalFaqNode(id, title, summary, content, extra = {}) {
  return {
    id: `xananode.canonical:question/${id}`,
    title,
    type: "question",
    subtype: "faq",
    importance: 5,
    summary,
    content,
    relationships: [],
    ...extra
  };
}

function buildCanonicalFaqNodes() {
  const entries = [
    {
      node: canonicalFaqNode(
      "is-xananode-a-real-working-stack",
      "Is XanaNode a real working stack?",
      "Yes. XanaNode has a protocol, Core SDK, Workspace layer, Studio authoring application, Mobile capture companion, and Hugo projection layer that work together.",
      "XanaNode is not only a design idea. The current stack includes protocol schemas and governance rules, a Core SDK for validation and pack building, Workspace for local substrate handling, Studio for desktop authoring, Mobile for capture-first substrate intake, and Hugo for static public projection. The pieces are versioned so a reader can trace what each part does and why it exists."
      ),
      links: [
        { type: "explains", target: "xananode.canonical:concept/xananode", summary: "This FAQ explains XanaNode as a working stack." },
        { type: "requires", target: "xananode.canonical:project/xananode-protocol", summary: "The protocol defines the shared rules." },
        { type: "requires", target: "xananode.canonical:project/xananode-core-sdk", summary: "Core validates and builds protocol artifacts." },
        { type: "uses", target: "xananode.canonical:project/xananode-hugo-theme", summary: "Hugo renders a public read-only projection." },
        { type: "uses", target: "xananode.canonical:project/xananode-studio", summary: "Studio provides local-first authoring." },
        { type: "uses", target: "xananode.canonical:project/xananode-mobile", summary: "Mobile provides capture-first intake and portable substrate handoff." }
      ]
    },
    {
      node: canonicalFaqNode(
      "how-do-i-use-xananode-myself",
      "How do I use XanaNode myself?",
      "Start with a substrate, add nodes and typed relationships, validate it with Core, and project or capture it with tools such as Studio, Mobile, or Hugo.",
      "A user can begin with a small question, claim, source, or trail. Core can initialize a substrate, validate nodes and relationships, generate review suggestions, and build bundles. Mobile can capture notes, files, URLs, and field media into a compliant working substrate. Studio can open a substrate as a local working copy so authors can edit without pretending they own someone else's substrate. Hugo can mount or import validated substrate data for a public website."
      ),
      links: [
        { type: "explains", target: "xananode.canonical:concept/xananode", summary: "The FAQ explains how to begin using XanaNode." },
        { type: "requires", target: "xananode.canonical:project/xananode-core-sdk", summary: "Core provides validation and pack creation." },
        { type: "uses", target: "xananode.canonical:project/xananode-hugo-theme", summary: "Hugo is one projection option." },
        { type: "uses", target: "xananode.canonical:project/xananode-studio", summary: "Studio is the desktop authoring option." },
        { type: "uses", target: "xananode.canonical:project/xananode-mobile", summary: "Mobile is the field capture option." }
      ]
    },
    {
      node: canonicalFaqNode(
      "who-made-xananode",
      "Who made XanaNode?",
      "XanaNode is authored by Christian Siefen. Built By Bots remains part of the project's historical lineage, but XanaNode.com is the long-term public home of the work.",
      "The canonical project substrate identifies Christian Siefen as the human author of XanaNode. It also preserves historical lineage records, including the temporary Built By Bots bridge period, the current XanaNode.com domain, the public repositories, branding, and support links. That provenance matters because people should be able to trace who authored a substrate, how the public identity evolved, and where project work now lives."
      ),
      links: [
        { type: "explains", target: "xananode.canonical:concept/xananode", summary: "The FAQ question is about XanaNode authorship." },
        { type: "documents", target: "xananode.canonical:person/christian-siefen", summary: "Christian Siefen is the human author of the project substrate." },
        { type: "documents", target: "xananode.canonical:organization/built-by-bots", summary: "Built By Bots remains in the canonical substrate as historical lineage context, not as the current public identity of XanaNode." }
      ]
    },
    {
      node: canonicalFaqNode(
      "why-does-xananode-exist",
      "Why does XanaNode exist?",
      "XanaNode exists to preserve relationships, provenance, disagreement, lineage, and reusable fragments as durable knowledge structure.",
      "A normal website can publish text. XanaNode publishes the relationships behind the text. It is meant for authored knowledge substrates where sources, claims, trails, versions, transclusions, conflicts, and projection layers remain inspectable instead of disappearing into a flat page."
      ),
      links: [
        { type: "explains", target: "xananode.canonical:concept/xananode", summary: "The FAQ question explains the purpose of XanaNode." },
        { type: "explains", target: "xananode.canonical:essay/what-is-xananode", summary: "The essay gives a longer explanation of the project." },
        { type: "supports", target: "xananode.canonical:concept/substrate-projection-layer", summary: "Projection layers are one reason the substrate model exists." }
      ]
    },
    {
      node: canonicalFaqNode(
      "how-do-sharing-rules-work",
      "How do sharing rules work?",
      "Nodes are shareable by default, but a substrate can exclude individual nodes, relationships, trails, or selected groups from shared exports.",
      "XanaNode assumes portability unless an author says otherwise. A private workspace can hold a large substrate while its pack export omits sensitive records. Sharing rules can live on the substrate manifest or on individual nodes, and official tools must respect those rules before publishing, exporting, mounting, or federating records."
      ),
      links: [
        { type: "documents", target: "xananode.canonical:schema/canonical-schema-substrate-node", summary: "Node records can carry node-level sharing rules." },
        { type: "documents", target: "xananode.canonical:schema/canonical-schema-substrate-manifest", summary: "The substrate manifest can carry default and selector-based sharing policy." },
        { type: "requires", target: "xananode.canonical:project/xananode-core-sdk", summary: "Core enforces sharing policy during pack building and exports." }
      ]
    }
  ];

  const relationships = [];
  for (const entry of entries) {
    for (const [index, relationship] of (entry.links || []).entries()) {
      relationships.push(schemaRegistryRelationship(
        entry.node.id,
        relationship.target,
        relationship.type,
        relationship.summary,
        `faq-${index}`
      ));
    }
  }
  return { nodes: entries.map((entry) => entry.node), relationships };
}

function buildProtocolRawFileNodes() {
  const nodes = [];
  const relationships = [];
  const groupIds = new Map();
  const files = listProtocolRawFiles();

  for (const relativePath of files) {
    const top = relativePath.includes("/") ? relativePath.split("/")[0] : "root";
    const groupId = top === "root"
      ? "xananode.canonical:schema/protocol-artifact-root"
      : `xananode.canonical:schema/protocol-artifact-${registrySlug(top)}`;
    if (!groupIds.has(top)) {
      groupIds.set(top, groupId);
      nodes.push({
        id: groupId,
        title: top === "root" ? "Protocol Root Files" : `Protocol ${protocolRawFileTitle(top)}`,
        type: "schema",
        subtype: "protocol_artifact_group",
        importance: 3,
        summary: top === "root"
          ? "Root-level XanaNode protocol source files preserved inside the canonical substrate."
          : `Protocol files under ${top}/ preserved inside the canonical substrate.`,
        artifact_path: top === "root" ? "" : `${top}/`,
        source_url: top === "root" ? protocolSourceUrl("") : protocolSourceUrl(`${top}/`),
        relationships: []
      });
      relationships.push(schemaRegistryRelationship(
        "xananode.canonical:concept/protocol-artifacts",
        groupId,
        "contains",
        `Protocol Artifacts contains the ${top === "root" ? "root file" : top} artifact group.`,
        `raw-group-${registrySlug(top)}`
      ));
    }

    const kind = protocolRawFileKind(relativePath);
    const nodeId = `xananode.canonical:${kind.type}/protocol-artifact-${registrySlug(relativePath)}`;
    const rawText = readProtocolRawText(relativePath);
    const node = {
      id: nodeId,
      title: protocolRawFileTitle(relativePath),
      type: kind.type,
      subtype: kind.subtype,
      importance: relativePath === "README.md" || relativePath.startsWith("schemas/") || relativePath.startsWith("specs/") ? 4 : 3,
      summary: `${relativePath} is preserved as a raw protocol artifact in the XanaNode canonical substrate.`,
      artifact_path: relativePath,
      source_url: protocolSourceUrl(relativePath),
      media_type: kind.media_type,
      mime_type: kind.mime_type,
      asset_role: "canonical_raw_source",
      rights_status: relativePath.startsWith("schemas/") || relativePath.startsWith("tools/") || relativePath.endsWith(".json")
        ? "Apache-2.0"
        : "CC-BY-4.0",
      relationships: []
    };
    if (rawText) node.content = rawText;
    nodes.push(node);
    relationships.push(schemaRegistryRelationship(
      groupId,
      nodeId,
      "contains",
      `${protocolRawFileTitle(top)} contains ${relativePath}.`,
      `raw-file-${registrySlug(relativePath)}`
    ));
    relationships.push(schemaRegistryRelationship(
      nodeId,
      "xananode.canonical:concept/protocol-artifacts",
      "documents",
      `${relativePath} documents the XanaNode protocol artifact set.`,
      `raw-file-docs-${registrySlug(relativePath)}`
    ));
  }

  return { nodes, relationships };
}

function buildProtocolDigitalTwinNodes(options = {}) {
  const parts = [
    buildSoftwareStackNodes(options),
    buildRegistryTypeNodes(),
    buildPropertyRegistryNodes(),
    buildProtocolMetadataRegistryNodes(),
    buildCanonicalFaqNodes(),
    buildProtocolRawFileNodes()
  ];
  return {
    nodes: parts.flatMap((part) => part.nodes),
    relationships: parts.flatMap((part) => part.relationships)
  };
}

function writePackArtifacts(outDir, pack) {
  const artifactOptions = {
    splitArtifacts: pack.artifact_options?.splitArtifacts !== false,
    bundleJson: pack.artifact_options?.bundleJson !== false,
    bundleJsonl: pack.artifact_options?.bundleJsonl === true
  };
  cleanPackOutputDirectory(outDir);
  fs.mkdirSync(outDir, { recursive: true });
  if (artifactOptions.splitArtifacts) {
    fs.mkdirSync(path.join(outDir, "nodes"), { recursive: true });
  }
  const rawSnapshots = attachProtocolRawSnapshots(
    pack.nodes,
    outDir,
    pack.manifest.build_metadata?.generated_at || pack.manifest.pack?.built_at || new Date().toISOString()
  );
  const rawRepositoryFiles = copyProtocolRawRepositorySnapshot(outDir);
  const projectionAssets = copyProtocolProjectionAssets(outDir);
  const nodes = rawSnapshots.nodes;
  const sourceAssets = copySourcePackAssets(pack.source_roots || [], outDir, nodes);
  if (artifactOptions.splitArtifacts) {
    writeJson(path.join(outDir, "substrate.json"), pack.manifest);
    writeJson(path.join(outDir, "nodes.json"), { nodes });
    writeJson(path.join(outDir, "relationships.json"), { relationships: pack.relationships });

    for (const node of nodes) {
      writeJson(path.join(outDir, "nodes", safeNodeFileName(node)), node);
    }
  }

  const report = {
    id: pack.manifest.id,
    namespace: pack.manifest.namespace,
    sources: pack.manifest.pack?.source_manifests || [],
    nodes: nodes.length,
    relationships: pack.relationship_count,
    warnings: pack.warnings,
    duplicate_collapses: pack.duplicate_collapses || [],
    raw_sources: rawSnapshots.copied,
    raw_repository_files: rawRepositoryFiles,
    projection_assets: projectionAssets,
    source_assets: sourceAssets.copied,
    duplicate_assets: sourceAssets.duplicates,
    asset_conflicts: sourceAssets.conflicts,
    generated_at: pack.manifest.build_metadata?.generated_at || new Date().toISOString(),
    build_metadata: pack.manifest.build_metadata || {}
  };
  writeJson(path.join(outDir, "pack-report.json"), report);
  const bundle = {
    format: "xananode.substrate-bundle@0.1.0",
    generated_at: report.generated_at,
    manifest: pack.manifest,
    counts: {
      nodes: nodes.length,
      relationships: pack.relationship_count,
      warnings: pack.warnings.length,
      duplicate_collapses: (pack.duplicate_collapses || []).length
    },
    nodes,
    relationships: pack.relationships,
    warnings: pack.warnings,
    duplicate_collapses: pack.duplicate_collapses || [],
    pack_report: report
  };
  if (artifactOptions.bundleJson) {
    writeJson(path.join(outDir, "substrate-bundle.json"), bundle);
  }
  if (artifactOptions.bundleJsonl) {
    const lines = [
      JSON.stringify({
        record_type: "bundle_manifest",
        format: bundle.format,
        generated_at: bundle.generated_at,
        manifest: bundle.manifest,
        counts: bundle.counts
      }),
      ...bundle.nodes.map((node) => JSON.stringify({ record_type: "node", node })),
      ...bundle.relationships.map((relationship) => JSON.stringify({ record_type: "relationship", relationship })),
      JSON.stringify({
        record_type: "bundle_report",
        warnings: bundle.warnings,
        duplicate_collapses: bundle.duplicate_collapses,
        pack_report: bundle.pack_report
      })
    ];
    fs.writeFileSync(path.join(outDir, "substrate-bundle.jsonl"), `${lines.join("\n")}\n`);
  }
}

function cleanPackOutputDirectory(outDir) {
  if (!fs.existsSync(outDir)) return;
  for (const entry of fs.readdirSync(outDir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    fs.rmSync(path.join(outDir, entry.name), { recursive: true, force: true });
  }
}

export function getBundledCanonicalPackRoot() {
  return bundledCanonicalPackRoot;
}

export function buildBundledCanonicalPack(options = {}) {
  const loaded = loadSubstratePack(options.root || bundledCanonicalPackRoot, {
    pack: { id: "xananode.canonical", mode: "mounted" }
  });
  const registryTypes = buildProtocolDigitalTwinNodes(options);
  const nodesById = new Map();
  const relationshipsById = new Map();
  for (const node of [...loaded.nodes.map(cleanBundledRecord).filter((node) => !isGeneratedCanonicalFaqRecord(node)), ...registryTypes.nodes]) {
    nodesById.set(node.id, mergeNodeRecord(nodesById.get(node.id), node));
  }
  for (const relationship of [...loaded.relationships.map(cleanBundledRecord).filter((relationship) => !isGeneratedCanonicalFaqRecord(relationship)), ...registryTypes.relationships]) {
    if (!relationshipsById.has(relationship.id)) relationshipsById.set(relationship.id, relationship);
  }
  const collapsed = collapseDuplicateCanonicalNodes(
    [...nodesById.values()],
    [...relationshipsById.values()]
  );
  const nodes = collapsed.nodes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relationships = collapsed.relationships.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const manifest = {
    ...loaded.manifest,
    ...(options.id ? { id: options.id } : {}),
    ...(options.name ? { name: options.name } : {}),
    ...(options.namespace ? { namespace: options.namespace } : {}),
    ...(options.version ? { version: options.version } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.repositoryUrl ? { repository: { type: "git", url: options.repositoryUrl, default_branch: options.defaultBranch || "main" } } : {}),
    build_metadata: coreBuildMetadata(options),
    pack: {
      ...(loaded.manifest.pack || {}),
      built_by: "@xananode/core",
      built_at: buildTimestamp(options),
      build_metadata: coreBuildMetadata(options)
    }
  };
  const validation = validateSubstrateArtifacts({ manifest, protocolNodes: nodes, relationships }, options);
  const warnings = [...loaded.warnings, ...validation.warnings];
  if (loaded.errors.length) warnings.push(...loaded.errors.map((error) => ({ kind: "pack_error", ...error })));

  return {
    manifest,
    nodes,
    relationships,
    warnings,
    artifact_options: {
      splitArtifacts: options.splitArtifacts !== false,
      bundleJson: options.bundleJson !== false,
      bundleJsonl: options.bundleJsonl === true
    },
    duplicate_collapses: collapsed.duplicates,
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
    build_metadata: coreBuildMetadata(options),
    pack: {
      mode: "mounted",
      built_by: "@xananode/core",
      built_at: buildTimestamp(options),
      build_metadata: coreBuildMetadata(options),
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
    const substrate = await buildSubstrate(root, {
      includeDrafts: options.includeDrafts === true,
      suggestions: options.suggestionMode === "apply" || options.suggestions === true,
      suggestionMode: options.suggestionMode || "review",
      namespace: options.sourceNamespace
    });
    substrates.push(filterSubstrateForSharing(substrate, options));
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
    artifact_options: {
      splitArtifacts: options.splitArtifacts !== false,
      bundleJson: options.bundleJson !== false,
      bundleJsonl: options.bundleJsonl === true
    },
    source_roots: roots,
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
