import fs from "node:fs";
import path from "node:path";
import { writeJson, writeMarkdownNode } from "./io.js";
import { slugify } from "./ids.js";

export function initSubstrate(targetDir, options = {}) {
  const name = options.name || "New XanaNode Substrate";
  const namespace = options.namespace || slugify(name, "substrate");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, "content", "nodes"), { recursive: true });
  fs.mkdirSync(path.join(targetDir, "assets"), { recursive: true });

  writeJson(path.join(targetDir, "substrate.json"), {
    id: namespace,
    name,
    version: "0.1.0",
    namespace,
    schema_version: "xananode-core@0.5.0",
    repository: {
      type: "git",
      url: options.repositoryUrl || "local",
      default_branch: options.defaultBranch || "main"
    },
    imports: ["xananode:core"],
    extensions: [],
    maintainers: options.author ? [{ name: options.author }] : []
  });

  writeMarkdownNode(path.join(targetDir, "content", "nodes", "start-here.md"), {
    title: "Start Here",
    type: "trail",
    summary: "The starting trail for this substrate.",
    created_by: options.author || "unknown",
    relationships: []
  }, "# Start Here\n\nThis is the first node in your XanaNode substrate. Add concepts, claims, sources, observations, trails, and relationships as the substrate grows.\n");

  writeMarkdownNode(path.join(targetDir, "content", "nodes", "first-concept.md"), {
    title: "First Concept",
    type: "concept",
    summary: "A starter concept node.",
    created_by: options.author || "unknown",
    relationships: [
      { type: "related_to", target: `${namespace}:trail/start-here`, summary: "This concept appears in the starter trail." }
    ]
  }, "# First Concept\n\nDescribe an important concept in this substrate.\n");

  fs.writeFileSync(path.join(targetDir, "README.md"), `# ${name}\n\nThis is a XanaNode substrate created by @xananode/core.\n\n## Commands\n\n\`xananode validate .\`\n\`xananode build . --out public\`\n`);
  return { targetDir, namespace, name };
}
