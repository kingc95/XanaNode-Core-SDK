import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutDir = path.join(coreRoot, "substrate-source");
const generatedAt = new Date().toISOString();

const includeRoots = new Set(["bin", "media", "packs", "registry", "schemas", "src", "templates", "test"]);
const includeRootFiles = new Set(["README.md", "LICENSE", "package.json", "package-lock.json", ".gitmodules", ".gitignore"]);
const includeExtensions = new Set([".js", ".json", ".md", ".txt", ".svg", ".png", ".ico", ".cjs", ".mjs", ".schema", ""]);

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: coreRoot, encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readPackageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(coreRoot, "package.json"), "utf8")).version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return `sha256:${hash.digest("hex")}`;
}

function safeAssetRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.\./g, "_");
}

function sourceUrl(relativePath) {
  return `https://github.com/kingc95/XanaNode-Core-SDK/blob/main/${safeAssetRelativePath(relativePath)}`;
}

function nodeKindFor(relativePath) {
  const clean = safeAssetRelativePath(relativePath);
  const ext = path.extname(clean).toLowerCase();
  if (clean.startsWith("schemas/") || clean.startsWith("registry/")) {
    return {
      type: "schema",
      subtype: clean.startsWith("registry/") ? "registry_artifact" : "schema_artifact",
      media_type: "document",
      mime_type: "application/json"
    };
  }
  if (clean.startsWith("media/") || [".svg", ".png", ".ico"].includes(ext)) {
    return {
      type: "media",
      subtype: "core_media_asset",
      media_type: "image",
      mime_type:
        ext === ".svg" ? "image/svg+xml"
        : ext === ".png" ? "image/png"
        : "image/x-icon"
    };
  }
  if (clean.startsWith("src/") || clean.startsWith("bin/")) {
    return {
      type: "source",
      subtype: "reference_code",
      media_type: "document",
      mime_type: "text/javascript"
    };
  }
  if (clean.startsWith("templates/")) {
    return {
      type: "source",
      subtype: "example_substrate_template",
      media_type: "document",
      mime_type: ext === ".json" ? "application/json" : "text/markdown"
    };
  }
  if (clean.startsWith("test/")) {
    return {
      type: "source",
      subtype: "test_artifact",
      media_type: "document",
      mime_type: "text/javascript"
    };
  }
  return {
    type: "source",
    subtype: "project_document",
    media_type: "document",
    mime_type: ext === ".json" ? "application/json" : "text/markdown"
  };
}

function shouldElevateRepositoryFileToNode(relativePath) {
  const clean = safeAssetRelativePath(relativePath);
  if (clean === "README.md" || clean === "LICENSE" || clean === "package.json") return true;
  if (
    clean.startsWith("schemas/") ||
    clean.startsWith("registry/") ||
    clean.startsWith("templates/")
  ) {
    return true;
  }
  if (clean.startsWith("packs/")) {
    const parts = clean.split("/");
    const fileName = parts.at(-1) || "";
    const directPackArtifact = parts.length === 3 && new Set([
      "substrate.json",
      "nodes.json",
      "relationships.json",
      "substrate-bundle.json",
      "substrate-bundle.jsonl",
      "pack-report.json",
      "README.md",
      "BUNDLED-FIXTURE.md"
    ]).has(fileName);
    if (directPackArtifact) return true;
  }
  if (clean === "media/images/xananode-icon.svg") return true;
  return false;
}

function titleFor(relativePath) {
  const clean = safeAssetRelativePath(relativePath);
  if (clean === "README.md") return "XanaNode Core SDK README";
  if (clean === "LICENSE") return "XanaNode Core SDK License";
  if (clean === "package.json") return "XanaNode Core SDK Package Manifest";
  return clean
    .replace(/\.[^.]+$/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");
}

function summaryFor(relativePath, kind) {
  const clean = safeAssetRelativePath(relativePath);
  if (kind.type === "schema") return `${clean} is elevated as a first-class Core schema or registry artifact in the XanaNode Core SDK substrate.`;
  if (kind.type === "media") return `${clean} is elevated as a first-class Core branding or media artifact in the XanaNode Core SDK substrate.`;
  return `${clean} is elevated as a first-class Core SDK artifact in the XanaNode Core SDK substrate.`;
}

function listRepositoryFiles(dir = coreRoot) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "substrate-source" || entry.name.startsWith(".git")) continue;
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(coreRoot, fullPath).replace(/\\/g, "/");
      const top = relativePath.split("/")[0];
      if (entry.isDirectory()) {
        if (includeRoots.has(top)) visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!includeRootFiles.has(relativePath) && !includeRoots.has(top)) continue;
      if (!includeExtensions.has(ext) && !includeRootFiles.has(relativePath)) continue;
      files.push(relativePath);
    }
  }
  visit(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

function readTextIfPossible(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".js", ".json", ".md", ".txt", ".cjs", ".mjs", ""].includes(ext)) return "";
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function buildCoreSubstrateSource(outDir = defaultOutDir) {
  cleanDir(outDir);
  const version = readPackageVersion();

  const manifest = {
    id: "xananode.core",
    name: "XanaNode Core SDK Substrate",
    version,
    namespace: "xananode.core",
    description: "A substrate source built directly from the XanaNode Core SDK repository, preserving implementation identity, schemas, registries, templates, canonical pack artifacts, and key documents as first-class nodes while carrying lower-level repository files as attached assets when they do not deserve independent node status.",
    schema_version: "xananode-core@0.5.0",
    repository: {
      type: "git",
      url: "https://github.com/kingc95/XanaNode-Core-SDK.git",
      default_branch: "main"
    },
    imports: ["xananode.protocol"],
    build_metadata: {
      built_at: generatedAt,
      git_commit: gitValue(["rev-parse", "HEAD"]),
      git_branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      built_by: "xananode-core/tools/build-substrate-source.mjs"
    },
    sharing: {
      default_shareable: true,
      rules: [
        {
          selector: { namespace: "xananode.core" },
          shareable: true,
          scope: "public",
          reason: "The Core SDK substrate is intended to be federated as a public implementation source."
        }
      ]
    }
  };

  const nodes = [
    {
      id: "xananode.core:project/xananode-core-sdk",
      title: "XanaNode Core SDK",
      type: "project",
      subtype: "sdk",
      importance: 5,
      summary: "The renderer-independent parser, validator, graph builder, fragment engine, and exporter for XanaNode substrates.",
      source_url: "https://github.com/kingc95/XanaNode-Core-SDK",
      repository: "kingc95/XanaNode-Core-SDK",
      software_version: version,
      relationships: []
    },
    {
      id: "xananode.core:source/repository-xananode-core-sdk",
      title: "XanaNode Core SDK Repository",
      type: "source",
      subtype: "git_repository",
      importance: 5,
      summary: "Public Git repository for the XanaNode Core SDK.",
      source_url: "https://github.com/kingc95/XanaNode-Core-SDK",
      repository: "kingc95/XanaNode-Core-SDK",
      rights_status: "external",
      relationships: []
    },
    {
      id: "xananode.core:technology/xananode-core-cli",
      title: "XanaNode Core CLI",
      type: "technology",
      subtype: "cli",
      importance: 4,
      summary: "The stable command-contract surface for validating, building, bundling, and inspecting XanaNode substrates.",
      software_version: version,
      relationships: []
    }
  ];

  const relationships = [
    {
      id: "xananode.core:rel/repository-documents-core-project",
      source: "xananode.core:source/repository-xananode-core-sdk",
      target: "xananode.core:project/xananode-core-sdk",
      type: "documents",
      summary: "The repository documents and carries the Core SDK project.",
      asserted_at: generatedAt
    },
    {
      id: "xananode.core:rel/core-project-implements-protocol",
      source: "xananode.core:project/xananode-core-sdk",
      target: "xananode.protocol:project/xananode-protocol",
      type: "implements",
      summary: "The Core SDK implements the XanaNode protocol.",
      asserted_at: generatedAt
    },
    {
      id: "xananode.core:rel/core-project-uses-protocol-substrate",
      source: "xananode.core:project/xananode-core-sdk",
      target: "xananode.protocol:source/repository-xananode-protocol",
      type: "uses",
      summary: "The Core SDK consumes protocol schemas, registries, and docs from the protocol repository.",
      asserted_at: generatedAt
    },
    {
      id: "xananode.core:rel/core-cli-supports-core-project",
      source: "xananode.core:technology/xananode-core-cli",
      target: "xananode.core:project/xananode-core-sdk",
      type: "supports",
      summary: "The Core CLI is the machine-facing executable surface of the Core SDK.",
      asserted_at: generatedAt
    }
  ];

  for (const relativePath of listRepositoryFiles()) {
    const sourcePath = path.join(coreRoot, relativePath);
    const assetPath = `assets/raw/repository/${safeAssetRelativePath(relativePath)}`;
    const assetTarget = path.join(outDir, assetPath);
    fs.mkdirSync(path.dirname(assetTarget), { recursive: true });
    fs.copyFileSync(sourcePath, assetTarget);
    if (!shouldElevateRepositoryFileToNode(relativePath)) continue;
    const kind = nodeKindFor(relativePath);
    const localSlug = slug(relativePath.replace(/\.[^.]+$/, "")) || "artifact";
    const nodeId = `xananode.core:${kind.type}/artifact-${localSlug}`;
    const content = readTextIfPossible(sourcePath);
    const contentId = sha256File(sourcePath);

    nodes.push({
      id: nodeId,
      title: titleFor(relativePath),
      type: kind.type,
      subtype: kind.subtype,
      importance: relativePath === "README.md" || relativePath === "package.json" || relativePath.startsWith("src/") || relativePath.startsWith("schemas/") || relativePath.startsWith("registry/") ? 4 : 3,
      summary: summaryFor(relativePath, kind),
      source_url: sourceUrl(relativePath),
      artifact_path: relativePath,
      asset_path: assetPath,
      asset_role: "repository_snapshot",
      media_type: kind.media_type,
      mime_type: kind.mime_type,
      rights_status: "Apache-2.0",
      content_id: contentId,
      ...(content ? { content } : {}),
      source_snapshot: {
        captured_at: generatedAt,
        source_url: sourceUrl(relativePath),
        method: "archive",
        content_id: contentId,
        rights_status: "Apache-2.0",
        tool: "xananode-core/tools/build-substrate-source.mjs"
      },
      relationships: []
    });

    relationships.push({
      id: `xananode.core:rel/repository-contains-${localSlug}`,
      source: "xananode.core:source/repository-xananode-core-sdk",
      target: nodeId,
      type: "contains",
      summary: `The Core SDK repository contains ${relativePath}.`,
      asserted_at: generatedAt
    });

    if (relativePath.startsWith("src/") || relativePath.startsWith("bin/")) {
      relationships.push({
        id: `xananode.core:rel/${localSlug}-supports-core-project`,
        source: nodeId,
        target: "xananode.core:project/xananode-core-sdk",
        type: "supports",
        summary: `${titleFor(relativePath)} supports the Core SDK implementation.`,
        asserted_at: generatedAt
      });
    } else if (relativePath.startsWith("schemas/") || relativePath.startsWith("registry/")) {
      relationships.push({
        id: `xananode.core:rel/${localSlug}-documents-core-project`,
        source: nodeId,
        target: "xananode.core:project/xananode-core-sdk",
        type: "documents",
        summary: `${titleFor(relativePath)} documents or constrains the Core SDK behavior.`,
        asserted_at: generatedAt
      });
    }
  }

  writeJson(path.join(outDir, "substrate.json"), manifest);
  writeJson(path.join(outDir, "nodes.json"), { nodes });
  writeJson(path.join(outDir, "relationships.json"), { relationships });
  for (const node of nodes) {
    writeJson(path.join(outDir, "nodes", `${node.type}_${slug(node.title)}.json`), node);
  }
  writeText(path.join(outDir, "README.md"), `# XanaNode Core SDK Substrate

This folder is the explicit substrate source generated from the XanaNode Core SDK repository.

It exists so higher layers can federate with Core as a normal substrate instead of re-deriving Core facts ad hoc.

Regenerate it from the repository root with:

\`\`\`powershell
node tools/build-substrate-source.mjs
\`\`\`

Or from \`XanaNode-Master\`:

\`\`\`powershell
npm run core:build-substrate-source
\`\`\`
`);

  return {
    outDir,
    manifest,
    nodeCount: nodes.length,
    relationshipCount: relationships.length
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = buildCoreSubstrateSource();
  console.log(`Core substrate source: ${result.outDir}`);
  console.log(`  Nodes: ${result.nodeCount}`);
  console.log(`  Relationships: ${result.relationshipCount}`);
}
