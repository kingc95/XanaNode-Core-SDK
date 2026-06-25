import fs from "node:fs";
import path from "node:path";
import { writeJson, writeMarkdownNode } from "./io.js";
import { slugify } from "./ids.js";

export function initSubstrate(targetDir, options = {}) {
  const name = options.name || "New XanaNode Substrate";
  const namespace = options.namespace || slugify(name, "substrate");
  fs.mkdirSync(targetDir, { recursive: true });
  for (const relativeDir of [
    path.join("content", "nodes"),
    "nodes",
    path.join("assets", "media"),
    path.join("assets", "sources"),
    path.join("assets", "projection"),
    "schemas",
    "reports",
    "packs",
    "imports"
  ]) {
    fs.mkdirSync(path.join(targetDir, relativeDir), { recursive: true });
  }

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
    summary: "An empty starting trail for this substrate.",
    created_by: options.author || "unknown",
    nodes: []
  }, "# Start Here\n\nThis trail is ready for your first path through the substrate.\n");

  fs.writeFileSync(path.join(targetDir, "README.md"), `# ${name}\n\nThis is a XanaNode substrate created by @xananode/core.\n\nThe substrate root is this folder. Keep authored Markdown nodes in \`content/nodes/\`, protocol JSON nodes in \`nodes/\` or \`nodes.json\`, relationships in \`relationships.json\`, local media and source files in \`assets/\`, extension schemas in \`schemas/\`, reports in \`reports/\`, mounted substrates in \`packs/\`, and incoming material in \`imports/\`.\n\n## Commands\n\n\`xananode validate .\`\n\`xananode build . --out public\`\n`);
  return { targetDir, namespace, name };
}
