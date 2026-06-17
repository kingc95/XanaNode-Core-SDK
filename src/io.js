import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { parseFrontMatter, stringifyFrontMatter } from "./frontmatter.js";
import { createNodeRecord } from "./graph.js";

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
