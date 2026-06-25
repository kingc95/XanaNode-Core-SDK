#!/usr/bin/env node
import { runCli } from "../src/cli.js";

const wantsJson = process.argv.includes("--json");

runCli(process.argv).catch((error) => {
  if (wantsJson) {
    console.error(JSON.stringify({
      ok: false,
      tool: "xananode-core",
      error: {
        message: error?.message || String(error),
        stack: error?.stack || null
      }
    }, null, 2));
    process.exit(1);
  }
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
