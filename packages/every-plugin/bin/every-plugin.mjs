#!/usr/bin/env bun
const [cmd] = process.argv.slice(2);

const usage = () => console.log("Usage: every-plugin <dev|types|build|deploy>");

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
  usage();
  process.exit(cmd ? 0 : 1);
}

const { runCliCommand } = await import("../src/cli.ts");
await runCliCommand(cmd).catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
