import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { parseFrontMatter, stringifyFrontMatter } from "./frontmatter.js";
import { createNodeRecord } from "./graph.js";
import { contentIdFor, protocolIdFor, slugify } from "./ids.js";

export function findManifest(rootDir) {
  const candidates = ["substrate.json", "xananode.json", "data/substrate.json", "static/substrate.json"];
  for (const candidate of candidates) {
    const fullPath = path.join(rootDir, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function loadManifest(rootDir, fallback = {}) {
  const manifestPath = findManifest(rootDir);
  if (!manifestPath) {
    return {
      id: fallback.id || "local-substrate",
      name: fallback.name || "Local Substrate",
      version: fallback.version || "0.1.0",
      namespace: fallback.namespace || "local",
      schema_version: fallback.schema_version || "xananode-core@0.5.0",
      repository: fallback.repository || {
        type: "git",
        url: fallback.repository_url || "local",
        default_branch: fallback.default_branch || "main"
      }
    };
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export async function loadMarkdownNodes(rootDir, options = {}) {
  const namespace = options.namespace || loadManifest(rootDir).namespace || "local";
  const patterns = options.patterns || ["content/**/*.md", "nodes/**/*.md", "*.md"];
  const ignore = options.ignore || ["node_modules/**", "public/**", "dist/**", ".git/**", "README.md"];
  const files = await fg(patterns, { cwd: rootDir, ignore, onlyFiles: true, dot: false });
  const nodes = [];
  for (const relativeFile of files.sort()) {
    const fullPath = path.join(rootDir, relativeFile);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = parseFrontMatter(raw, fullPath);
    if (parsed.data?.draft === true && options.includeDrafts !== true) continue;
    const node = createNodeRecord({ data: parsed.data || {}, body: parsed.body, relativeFile, namespace });
    node.fullPath = fullPath;
    node.raw = raw;
    nodes.push(node);
  }
  return nodes;
}

function normalizeJsonNodeRecord(record = {}, relativeFile = "", namespace = "local") {
  const protocolId = record.protocol_id || record.id || "";
  const inferredNamespace = String(protocolId).includes(":") ? String(protocolId).split(":")[0] : namespace;
  const localId = record.local_id
    || (String(protocolId).includes("/") ? String(protocolId).split("/").at(-1) : "")
    || record.slug
    || record.title
    || relativeFile.replace(/\.[^.]+$/, "");
  const body = record.body || record.content || "";
  const type = record.type || "concept";
  const protocol = protocolId || protocolIdFor(slugify(localId, "node"), { ...record, type }, inferredNamespace);
  const data = {
    ...record,
    id: slugify(localId, "node"),
    type,
    protocol_id: protocol
  };
  return {
    id: data.id,
    protocolId: protocol,
    protocol_id: protocol,
    content_id: record.content_id || contentIdFor(`${JSON.stringify(record)}\n${body}`),
    version_id: record.version_id || record.content_id || contentIdFor(`${JSON.stringify(record)}\n${body}`),
    namespace: inferredNamespace,
    type,
    title: record.title || data.id,
    summary: record.summary || record.description || "",
    data,
    body,
    relativeFile
  };
}

export async function loadJsonNodes(rootDir, options = {}) {
  const namespace = options.namespace || loadManifest(rootDir).namespace || "local";
  const ignore = options.ignore || ["node_modules/**", "public/**", "dist/**", ".git/**"];
  const files = await fg(["nodes/**/*.json"], { cwd: rootDir, ignore, onlyFiles: true, dot: false });
  const nodes = [];
  const seen = new Set();

  for (const relativeFile of files.sort()) {
    const fullPath = path.join(rootDir, relativeFile);
    const record = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const node = normalizeJsonNodeRecord(record, relativeFile, namespace);
    const key = node.protocolId || node.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    node.fullPath = fullPath;
    nodes.push(node);
  }

  if (nodes.length) return nodes;

  const rootNodesPath = path.join(rootDir, "nodes.json");
  if (!fs.existsSync(rootNodesPath)) return [];
  const value = JSON.parse(fs.readFileSync(rootNodesPath, "utf8"));
  const records = Array.isArray(value) ? value : Array.isArray(value?.nodes) ? value.nodes : [];
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object") continue;
    const node = normalizeJsonNodeRecord(record, `nodes.json#${index + 1}`, namespace);
    const key = node.protocolId || node.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    nodes.push(node);
  }
  return nodes;
}

export function loadJsonRelationships(rootDir) {
  const relationshipsPath = path.join(rootDir, "relationships.json");
  if (!fs.existsSync(relationshipsPath)) return [];
  const value = JSON.parse(fs.readFileSync(relationshipsPath, "utf8"));
  return Array.isArray(value) ? value : Array.isArray(value?.relationships) ? value.relationships : [];
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeMarkdownNode(filePath, data, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stringifyFrontMatter(data, body));
}

export function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}
