#!/usr/bin/env node
import { runCli } from "../src/cli.js";

runCli(process.argv).catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
