#!/usr/bin/env bun
import { findCommandDescriptor } from "./cli/catalog";
import { printHelp } from "./cli/help";
import { parseCommandInput } from "./cli/parse";
import { findConfigPath } from "./config";
import bosPlugin from "./plugin";
import { createPluginRuntime } from "./sdk";
import { printBanner } from "./utils/banner";
import { colors, frames, gradients, icons } from "./utils/theme";

function printConfigView(result: {
  account: string;
  domain?: string;
  staging?: { domain: string };
  app: {
    host: { name?: string; development: string; production?: string };
    ui: { name?: string; development?: string; production?: string; ssr?: string };
    api: { name?: string; development?: string; production?: string; proxy?: string };
  };
}) {
  console.log();
  console.log(colors.cyan(frames.top(52)));
  console.log(`  ${icons.app} ${gradients.cyber("CONFIG")}`);
  console.log(colors.cyan(frames.bottom(52)));
  console.log();

  console.log(`  ${colors.dim("Account")}  ${colors.cyan(result.account)}`);
  console.log(`  ${colors.dim("Domain")}   ${colors.white(result.domain ?? "not configured")}`);
  if (result.staging) {
    console.log(`  ${colors.dim("Staging")}  ${colors.magenta(result.staging.domain)}`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const invocationArgs = args.length > 0 ? args : ["dev"];
  const command = invocationArgs[0] ?? "dev";
  const configPath = findConfigPath();

  const commandMatch = findCommandDescriptor(invocationArgs);
  if (!commandMatch) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  const { descriptor, consumed } = commandMatch;
  const commandArgs = invocationArgs.slice(consumed);

  printBanner();

  const runtime = createPluginRuntime({
    registry: {
      bos: { module: bosPlugin },
    },
    secrets: {},
  });

  const pluginRuntime: any = runtime;
  const loadPlugin = pluginRuntime.usePlugin.bind(pluginRuntime);
  const plugin = await loadPlugin("bos", {
    variables: {
      configPath: configPath ?? undefined,
    },
    secrets: {},
  });

  const client = plugin.createClient();

  try {
    const input = parseCommandInput(descriptor, commandArgs);
    const result = await (client as any)[descriptor.key](input);

    if (descriptor.key === "config") {
      if (!result.config) {
        console.error("No bos.config.json found");
        process.exit(1);
      }

      printConfigView(result.config);
      process.stdout.write(`${JSON.stringify(result.config, null, 2)}\n`);
      return;
    }

    if (descriptor.key === "init") {
      console.log();
      if (result.status === "error") {
        console.error(`[CLI] ${result.error || "Unknown error"}`);
        process.exit(1);
      }
      console.log(colors.green(`${icons.ok} Project initialized`));
      console.log(`  ${colors.dim("Extends:")} ${result.extends}`);
      console.log(`  ${colors.dim("Destination:")} ${result.destination}`);
      if (result.name) console.log(`  ${colors.dim("Account:")} ${result.name}`);
      if (result.domain) console.log(`  ${colors.dim("Domain:")} ${result.domain}`);
      console.log(`  ${colors.dim("Files copied:")} ${result.filesCopied}`);
      console.log();
      console.log(colors.dim("  Next steps:"));
      console.log(colors.dim(`    cd ${result.destination}`));
      if (result.status === "initialized" && !(input as any)?.noInstall) {
        console.log(colors.dim("    bos dev --host remote"));
      } else {
        console.log(colors.dim("    bun install"));
        console.log(colors.dim("    bos dev --host remote"));
      }
      console.log();
      return;
    }

    if (result?.status === "error") {
      console.error(`[CLI] ${result.error || "Unknown error"}`);
      process.exit(1);
    }

    if (descriptor.key === "keyPublish") {
      process.stdout.write(`Generated publish key for ${result.account}\n`);
      process.stdout.write(`  Network: ${result.network}\n`);
      process.stdout.write(`  Contract: ${result.contract}\n`);
      process.stdout.write(`  Allowance: ${result.allowance}\n`);
      process.stdout.write(`  Functions: ${result.functionNames.join(", ")}\n`);
      process.stdout.write(`  Public key: ${result.publicKey}\n`);
      process.stdout.write(`  Private key: ${result.privateKey}\n`);
      process.stdout.write(`  Copy: NEAR_PRIVATE_KEY=${result.privateKey}\n`);
    }

    if (descriptor.key === "pluginAdd") {
      console.log();
      console.log(colors.green(`${icons.ok} Added plugin ${result.key}`));
      if (result.development) console.log(`  ${colors.dim("Development:")} ${result.development}`);
      if (result.production) console.log(`  ${colors.dim("Production:")} ${result.production}`);
      console.log();
      return;
    }

    if (descriptor.key === "pluginRemove") {
      console.log();
      console.log(colors.green(`${icons.ok} Removed plugin ${result.key}`));
      console.log();
      return;
    }

    if (descriptor.key === "pluginList") {
      console.log();
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.config} ${gradients.cyber("PLUGINS")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();
      if (result.plugins.length === 0) {
        console.log(colors.dim("  No plugins configured"));
      } else {
        for (const pluginItem of result.plugins) {
          console.log(`  ${colors.cyan(pluginItem.key)}`);
          if (pluginItem.development)
            console.log(`    ${colors.dim("Development:")} ${pluginItem.development}`);
          if (pluginItem.production)
            console.log(`    ${colors.dim("Production:")} ${pluginItem.production}`);
        }
      }
      console.log();
      return;
    }

    if (descriptor.key === "pluginPublish") {
      console.log();
      console.log(colors.green(`${icons.ok} Published plugin ${result.key}`));
      if (result.path) console.log(`  ${colors.dim("Path:")} ${result.path}`);
      if (result.script) console.log(`  ${colors.dim("Script:")} bun run ${result.script}`);
      if (result.production) console.log(`  ${colors.dim("Production:")} ${result.production}`);
      console.log();
      return;
    }

    if (descriptor.key === "publish") {
      if (result.status === "dry-run") {
        console.log();
        console.log(colors.cyan(`${icons.ok} Dry run complete`));
        console.log(`  ${colors.dim("Registry URL:")} ${result.registryUrl}`);
        console.log();
        return;
      }

      if (result.status === "published") {
        console.log();
        console.log(colors.green(`${icons.ok} Published successfully`));
        console.log(`  ${colors.dim("Registry URL:")} ${result.registryUrl}`);
        if (result.txHash) {
          console.log(`  ${colors.dim("Transaction:")} ${result.txHash}`);
        }
        if (result.built && result.built.length > 0) {
          console.log(`  ${colors.dim("Built:")} ${result.built.join(", ")}`);
        }
        if (result.skipped && result.skipped.length > 0) {
          console.log(`  ${colors.dim("Skipped:")} ${result.skipped.join(", ")}`);
        }
        console.log();
        return;
      }
    }
  } catch (error) {
    console.error(`[CLI] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[CLI] Fatal error:", error);
  process.exit(1);
});
