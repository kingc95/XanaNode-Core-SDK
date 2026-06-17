import { Command } from "commander";
import path from "node:path";
import { initSubstrate } from "./init.js";
import { buildSubstrate, writeSubstrateArtifacts } from "./build.js";

function printValidation(validation) {
  if (validation.valid) {
    console.log("✓ Substrate is valid");
  } else {
    console.log("✗ Substrate has validation errors");
    console.log(JSON.stringify(validation.errors, null, 2));
  }
  if (validation.warnings.length) {
    console.log(`\nWarnings (${validation.warnings.length}):`);
    for (const warning of validation.warnings) console.log(`- ${warning.kind}: ${JSON.stringify(warning)}`);
  }
}

export async function runCli(argv = process.argv) {
  const program = new Command();
  program
    .name("xananode")
    .description("Core XanaNode SDK CLI")
    .version("0.1.0");

  program.command("init")
    .argument("[dir]", "directory to create", ".")
    .option("--name <name>", "substrate name", "New XanaNode Substrate")
    .option("--namespace <namespace>", "substrate namespace")
    .option("--author <author>", "default author")
    .option("--repository-url <url>", "Git repository URL recorded in substrate.json", "local")
    .option("--default-branch <branch>", "default Git branch recorded in substrate.json", "main")
    .description("create a minimal XanaNode substrate")
    .action((dir, options) => {
      const result = initSubstrate(path.resolve(dir), options);
      console.log(`Created ${result.name} at ${result.targetDir}`);
      console.log(`Namespace: ${result.namespace}`);
    });

  program.command("validate")
    .argument("[dir]", "substrate directory", ".")
    .option("--include-drafts", "include draft nodes", false)
    .description("validate a substrate without writing build artifacts")
    .action(async (dir, options) => {
      const substrate = await buildSubstrate(path.resolve(dir), { includeDrafts: options.includeDrafts });
      printValidation(substrate.validation);
      process.exitCode = substrate.validation.valid ? 0 : 1;
    });

  program.command("build")
    .argument("[dir]", "substrate directory", ".")
    .requiredOption("--out <dir>", "artifact output directory")
    .option("--include-drafts", "include draft nodes", false)
    .option("--no-suggestions", "skip suggestion generation")
    .description("build protocol artifacts from a substrate")
    .action(async (dir, options) => {
      const substrate = await writeSubstrateArtifacts(path.resolve(dir), path.resolve(options.out), {
        includeDrafts: options.includeDrafts,
        suggestions: options.suggestions
      });
      printValidation(substrate.validation);
      console.log(`\nWrote artifacts to ${path.resolve(options.out)}`);
      console.log(`Nodes: ${substrate.protocolNodes.length}`);
      console.log(`Relationships: ${substrate.relationships.length}`);
      console.log(`Fragments: ${substrate.fragments.length}`);
      console.log(`Suggestions: ${substrate.suggestions.length}`);
    });

  program.command("inspect")
    .argument("[dir]", "substrate directory", ".")
    .description("print a compact substrate summary")
    .action(async (dir) => {
      const substrate = await buildSubstrate(path.resolve(dir));
      console.log(JSON.stringify({
        manifest: substrate.manifest,
        nodes: substrate.protocolNodes.length,
        relationships: substrate.relationships.length,
        fragments: substrate.fragments.length,
        suggestions: substrate.suggestions.length,
        valid: substrate.validation.valid,
        warnings: substrate.validation.warnings.length
      }, null, 2));
    });

  await program.parseAsync(argv);
}
