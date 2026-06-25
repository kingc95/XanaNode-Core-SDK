import { Command } from "commander";
import path from "node:path";
import { initSubstrate } from "./init.js";
import { buildSubstrate, writeSubstrateArtifacts } from "./build.js";
import { writeCanonicalPack } from "./canonical-pack.js";

const CORE_CLI_VERSION = "0.1.0";

function printValidation(validation) {
  if (validation.valid) {
    console.log("[ok] Substrate is valid");
  } else {
    console.log("[error] Substrate has validation errors");
    console.log(JSON.stringify(validation.errors, null, 2));
  }
  if (validation.warnings.length) {
    console.log(`\nWarnings (${validation.warnings.length}):`);
    for (const warning of validation.warnings) console.log(`- ${warning.kind}: ${JSON.stringify(warning)}`);
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function commandEnvelope(command, data, extras = {}) {
  return {
    ok: true,
    tool: "xananode-core",
    version: CORE_CLI_VERSION,
    command,
    ...extras,
    data
  };
}

function validationSummary(validation) {
  return {
    valid: Boolean(validation?.valid),
    warnings: validation?.warnings || [],
    errors: validation?.errors || []
  };
}

function artifactSummary(substrate, outDir) {
  return {
    substrate_root: null,
    output_dir: outDir,
    manifest: substrate.manifest,
    counts: {
      nodes: substrate.protocolNodes.length,
      relationships: substrate.relationships.length,
      fragments: substrate.fragments.length,
      suggestions: substrate.suggestions.length,
      applied_suggestions: substrate.applied_suggestions?.length || 0
    },
    validation: validationSummary(substrate.validation)
  };
}

function packSummary(pack, outDir, sourceCount, usedBundledCanonicalPack = false) {
  return {
    output_dir: outDir,
    manifest: pack.manifest,
    counts: {
      sources: pack.source_count,
      nodes: pack.node_count,
      relationships: pack.relationship_count,
      warnings: pack.warnings.length
    },
    source_count: sourceCount,
    bundled_canonical_pack: usedBundledCanonicalPack,
    warnings: pack.warnings
  };
}

export async function runCli(argv = process.argv) {
  const program = new Command();
  program
    .name("xananode-core")
    .description("Core XanaNode SDK CLI")
    .version(CORE_CLI_VERSION);

  program.command("init")
    .argument("[dir]", "directory to create", ".")
    .option("--name <name>", "substrate name", "New XanaNode Substrate")
    .option("--namespace <namespace>", "substrate namespace")
    .option("--author <author>", "default author")
    .option("--repository-url <url>", "Git repository URL recorded in substrate.json", "local")
    .option("--default-branch <branch>", "default Git branch recorded in substrate.json", "main")
    .option("--json", "print machine-readable JSON")
    .description("create a minimal XanaNode substrate")
    .action((dir, options) => {
      const result = initSubstrate(path.resolve(dir), options);
      if (options.json) {
        return printJson(commandEnvelope("init", {
          target_dir: result.targetDir,
          name: result.name,
          namespace: result.namespace
        }));
      }
      console.log(`Created ${result.name} at ${result.targetDir}`);
      console.log(`Namespace: ${result.namespace}`);
    });

  program.command("validate")
    .argument("[dir]", "substrate directory", ".")
    .option("--include-drafts", "include draft nodes", false)
    .option("--json", "print machine-readable JSON")
    .description("validate a substrate without writing build artifacts")
    .action(async (dir, options) => {
      const substrateRoot = path.resolve(dir);
      const substrate = await buildSubstrate(substrateRoot, { includeDrafts: options.includeDrafts });
      if (options.json) {
        printJson(commandEnvelope("validate", {
          substrate_root: substrateRoot,
          manifest: substrate.manifest,
          validation: validationSummary(substrate.validation)
        }));
      } else {
        printValidation(substrate.validation);
      }
      process.exitCode = substrate.validation.valid ? 0 : 1;
    });

  program.command("build")
    .argument("[dir]", "substrate directory", ".")
    .requiredOption("--out <dir>", "artifact output directory")
    .option("--include-drafts", "include draft nodes", false)
    .option("--include-private", "include nodes marked private by sharing policy", false)
    .option("--no-suggestions", "skip suggestion generation")
    .option("--suggestions-mode <mode>", "review or apply", "review")
    .option("--no-split-artifacts", "skip substrate.json, relationships.json, and nodes/*.json")
    .option("--no-bundle-json", "skip substrate-bundle.json")
    .option("--bundle-jsonl", "also write substrate-bundle.jsonl", false)
    .option("--json", "print machine-readable JSON")
    .description("build protocol artifacts from a substrate")
    .action(async (dir, options) => {
      const substrateRoot = path.resolve(dir);
      const outputDir = path.resolve(options.out);
      const substrate = await writeSubstrateArtifacts(substrateRoot, outputDir, {
        includeDrafts: options.includeDrafts,
        includePrivate: options.includePrivate,
        suggestions: options.suggestions,
        suggestionMode: options.suggestionsMode,
        splitArtifacts: options.splitArtifacts,
        bundleJson: options.bundleJson,
        bundleJsonl: options.bundleJsonl
      });
      if (options.json) {
        const summary = artifactSummary(substrate, outputDir);
        summary.substrate_root = substrateRoot;
        return printJson(commandEnvelope("build", summary));
      }
      printValidation(substrate.validation);
      console.log(`\nWrote artifacts to ${outputDir}`);
      console.log(`Nodes: ${substrate.protocolNodes.length}`);
      console.log(`Relationships: ${substrate.relationships.length}`);
      console.log(`Fragments: ${substrate.fragments.length}`);
      console.log(`Suggestions: ${substrate.suggestions.length}`);
      console.log(`Applied suggestions: ${substrate.applied_suggestions?.length || 0}`);
    });

  program.command("build-pack")
    .alias("bundle")
    .argument("[sources...]", "substrate source directories")
    .requiredOption("--out <dir>", "pack output directory")
    .option("--id <id>", "pack id", "xananode.canonical")
    .option("--name <name>", "pack name", "XanaNode Canonical Pack")
    .option("--namespace <namespace>", "pack namespace", "xananode.canonical")
    .option("--version <version>", "pack version", "0.1.0")
    .option("--description <description>", "pack description")
    .option("--repository-url <url>", "repository URL recorded in substrate.json", "local")
    .option("--default-branch <branch>", "default Git branch recorded in substrate.json", "main")
    .option("--include-drafts", "include draft nodes", false)
    .option("--include-private", "include nodes marked private by sharing policy", false)
    .option("--suggestions-mode <mode>", "review or apply", "review")
    .option("--no-split-artifacts", "skip substrate.json, nodes.json, relationships.json, and nodes/*.json")
    .option("--no-bundle-json", "skip substrate-bundle.json")
    .option("--bundle-jsonl", "also write substrate-bundle.jsonl", false)
    .option("--json", "print machine-readable JSON")
    .description("build a portable substrate bundle from one or more authored substrates")
    .action(async (sources, options) => {
      const roots = sources.length ? sources : [];
      const outputDir = path.resolve(options.out);
      const pack = await writeCanonicalPack(roots.map((source) => path.resolve(source)), outputDir, {
        id: options.id,
        name: options.name,
        namespace: options.namespace,
        version: options.version,
        description: options.description,
        repositoryUrl: options.repositoryUrl,
        defaultBranch: options.defaultBranch,
        includeDrafts: options.includeDrafts,
        includePrivate: options.includePrivate,
        suggestionMode: options.suggestionsMode,
        splitArtifacts: options.splitArtifacts,
        bundleJson: options.bundleJson,
        bundleJsonl: options.bundleJsonl
      });
      if (options.json) {
        return printJson(commandEnvelope("bundle", packSummary(
          pack,
          outputDir,
          roots.length,
          !sources.length
        )));
      }
      console.log(`Wrote pack to ${outputDir}`);
      console.log(`Sources: ${pack.source_count}${sources.length ? "" : " (bundled canonical pack)"}`);
      console.log(`Nodes: ${pack.node_count}`);
      console.log(`Relationships: ${pack.relationship_count}`);
      if (pack.warnings.length) console.log(`Warnings: ${pack.warnings.length}`);
    });

  program.command("inspect")
    .argument("[dir]", "substrate directory", ".")
    .option("--json", "print machine-readable JSON")
    .description("print a compact substrate summary")
    .action(async (dir, options) => {
      const substrateRoot = path.resolve(dir);
      const substrate = await buildSubstrate(substrateRoot);
      const summary = {
        substrate_root: substrateRoot,
        manifest: substrate.manifest,
        counts: {
          nodes: substrate.protocolNodes.length,
          relationships: substrate.relationships.length,
          fragments: substrate.fragments.length,
          suggestions: substrate.suggestions.length
        },
        validation: {
          valid: substrate.validation.valid,
          warnings: substrate.validation.warnings.length
        }
      };
      if (options.json) return printJson(commandEnvelope("inspect", summary));
      printJson(summary);
    });

  await program.parseAsync(argv);
}
