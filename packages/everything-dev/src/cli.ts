#!/usr/bin/env node
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

function formatTimeAgo(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return isoTimestamp.split("T")[0] ?? isoTimestamp;
}

function normalizeVersion(v: string): string {
  return v.replace(/^[\^~>=v]+/, "").trim();
}

async function warnIfOutdated(client: any, command: string): Promise<void> {
  if (!["dev", "build", "start"].includes(command)) return;

  try {
    const status = await client.status();
    if (status.status === "error" || !status.packages) return;

    const outdated = status.packages.filter(
      (p: { name: string; installed?: string; latest?: string }) =>
        p.installed && p.latest && normalizeVersion(p.installed) !== normalizeVersion(p.latest),
    );

    if (outdated.length === 0) return;

    console.log();
    console.log(colors.yellow(`  ! Outdated packages detected:`));
    for (const pkg of outdated) {
      console.log(colors.dim(`    ${pkg.name}  ${pkg.installed} → ${pkg.latest}`));
    }
    console.log(
      colors.dim(
        `    Run ${colors.cyan("bos upgrade")} to update packages and sync template files.`,
      ),
    );
    console.log();
  } catch {
    // silently ignore if status check fails
  }
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

  await warnIfOutdated(client, command);

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
      console.log(`  ${colors.dim("Directory:")} ${result.directory}`);
      if (result.account) console.log(`  ${colors.dim("Account:")} ${result.account}`);
      if (result.domain) console.log(`  ${colors.dim("Domain:")} ${result.domain}`);
      if (result.plugins && result.plugins.length > 0)
        console.log(`  ${colors.dim("Plugins:")} ${result.plugins.join(", ")}`);
      console.log(`  ${colors.dim("Files copied:")} ${result.filesCopied}`);
      console.log();
      console.log(colors.dim("  Next steps:"));
      console.log(colors.dim(`    cd ${result.directory}`));
      if (result.status === "initialized" && !(input as any)?.noInstall) {
        console.log(colors.dim("    docker compose up -d --wait"));
        console.log(colors.dim("    bun run dev"));
      } else {
        console.log(colors.dim("    bun install"));
        console.log(colors.dim("    docker compose up -d --wait"));
        console.log(colors.dim("    bun run dev"));
      }
      console.log();
      return;
    }

    if (descriptor.key === "sync") {
      console.log();
      if (result.status === "error") {
        console.error(`[CLI] ${result.error || "Unknown error"}`);
        process.exit(1);
      }
      if (result.status === "dry-run") {
        console.log(colors.cyan(`${icons.ok} Dry run — no files written`));
      } else {
        console.log(colors.green(`${icons.ok} Template synced`));
      }
      if (result.updated.length > 0) {
        console.log(`  ${colors.dim("Updated:")} ${result.updated.length} file(s)`);
        for (const f of result.updated) console.log(`    ${colors.dim(f)}`);
      }
      if (result.added.length > 0) {
        console.log(`  ${colors.dim("Added:")} ${result.added.length} file(s)`);
        for (const f of result.added) console.log(`    ${colors.dim(f)}`);
      }
      if (result.skipped.length > 0) {
        console.log(
          `  ${colors.yellow("Skipped:")} ${result.skipped.length} file(s) (locally modified, use --force to overwrite)`,
        );
        for (const f of result.skipped) console.log(`    ${colors.dim(f)}`);
      }
      if (result.updated.length === 0 && result.added.length === 0 && result.skipped.length === 0) {
        console.log(`  ${colors.dim("Already up to date")}`);
      }
      if (result.status !== "dry-run" && result.updated.length > 0) {
        console.log();
        console.log(colors.dim("  Review changes — your customizations take priority:"));
        console.log(
          colors.dim(
            "    • api/src/contract.ts, api/src/index.ts, api/src/db/schema.ts — never overwritten",
          ),
        );
        console.log(
          colors.dim("    • ui/src/components/**, ui/src/styles.css — never overwritten"),
        );
        console.log(
          colors.dim(
            "    • Other updated files — accept framework improvements, then restore your changes",
          ),
        );
        console.log(colors.dim("    • Skipped files — yours already, only update with --force"));
      }
      console.log();
      return;
    }

    if (descriptor.key === "upgrade") {
      console.log();
      if (result.status === "error") {
        console.error(`[CLI] ${result.error || "Unknown error"}`);
        process.exit(1);
      }
      if (result.status === "dry-run") {
        console.log(colors.cyan(`${icons.ok} Dry run — no changes applied`));
      } else {
        console.log(colors.green(`${icons.ok} Upgrade successful`));
      }
      for (const pkg of result.packages) {
        if (pkg.from && pkg.from !== pkg.to) {
          console.log(`  ${colors.dim(`${pkg.name}:`)} ${pkg.from} → ${pkg.to}`);
        } else if (!pkg.from) {
          console.log(`  ${colors.dim(`${pkg.name}:`)} ${pkg.to} (new)`);
        } else {
          console.log(`  ${colors.dim(`${pkg.name}:`)} ${pkg.to} (up to date)`);
        }
      }
      if (result.changelogUrl) {
        console.log(`  ${colors.dim("Changelog:")} ${result.changelogUrl}`);
      }
      if (result.sync) {
        const sync = result.sync;
        if (sync.updated.length > 0) {
          console.log(`  ${colors.dim("Updated:")} ${sync.updated.length} file(s)`);
          for (const f of sync.updated) console.log(`    ${colors.dim(f)}`);
        }
        if (sync.added.length > 0) {
          console.log(`  ${colors.dim("Added:")} ${sync.added.length} file(s)`);
          for (const f of sync.added) console.log(`    ${colors.dim(f)}`);
        }
        if (sync.skipped.length > 0) {
          console.log(
            `  ${colors.yellow("Skipped:")} ${sync.skipped.length} file(s) (locally modified, use --force to overwrite)`,
          );
          for (const f of sync.skipped) console.log(`    ${colors.dim(f)}`);
        }
        if (
          result.status !== "dry-run" &&
          (sync.updated.length > 0 || sync.added.length > 0 || sync.skipped.length > 0)
        ) {
          console.log();
          console.log(colors.dim("  Resolve differences — your code takes priority:"));
          console.log();
          console.log(colors.dim("  Never overwritten (safe):"));
          console.log(
            colors.dim("    • api/src/contract.ts, api/src/index.ts, api/src/db/schema.ts"),
          );
          console.log(colors.dim("    • ui/src/components/**, ui/src/styles.css"));
          console.log();
          console.log(colors.dim("  Replaced — review and keep your changes:"));
          console.log(
            colors.dim(
              "    • api/drizzle.config.ts, api/tsconfig.json, api/tsconfig.contract.json",
            ),
          );
          console.log(colors.dim("    • api/plugin.dev.ts, api/rspack.config.js"));
          console.log(colors.dim("    • ui/src/routes/* (core routes only)"));
          console.log();
          console.log(colors.dim("  Merged — your deps preserved:"));
          console.log(colors.dim("    • package.json, api/package.json, ui/package.json"));
          console.log();
          console.log(colors.dim("  Skipped — already yours:"));
          console.log(colors.dim("    • Use --force only if you want framework updates"));
        }
      }
      if (result.migrated && result.migrated.length > 0) {
        console.log(`  ${colors.yellow("Removed:")} ${result.migrated.length} obsolete file(s)`);
        for (const f of result.migrated) console.log(`    ${colors.dim(f)}`);
      }
      console.log();
      return;
    }

    if (descriptor.key === "status") {
      console.log();
      if (result.status === "error") {
        console.error(`[CLI] ${result.error || "Unknown error"}`);
        process.exit(1);
      }
      console.log(colors.cyan(frames.top(52)));
      console.log(`  ${icons.app} ${gradients.cyber("STATUS")}`);
      console.log(colors.cyan(frames.bottom(52)));
      console.log();
      if (result.extends) console.log(`  ${colors.dim("Extends:")}     ${result.extends}`);
      if (result.account) console.log(`  ${colors.dim("Account:")}     ${result.account}`);
      if (result.domain) console.log(`  ${colors.dim("Domain:")}      ${result.domain}`);
      console.log();
      console.log(`  ${colors.dim("Packages:")}`);
      for (const pkg of result.packages) {
        const hasUpdate =
          pkg.installed &&
          pkg.latest &&
          normalizeVersion(pkg.installed) !== normalizeVersion(pkg.latest);
        const versionStr = hasUpdate
          ? `${pkg.installed}  →  ${pkg.latest}`
          : pkg.installed || "not installed";
        const label = hasUpdate ? colors.yellow(versionStr) : colors.dim(versionStr);
        console.log(`    ${colors.dim(`${pkg.name}`)}  ${label}`);
      }
      console.log();
      if (result.lastSync) {
        const ago = formatTimeAgo(result.lastSync);
        console.log(`  ${colors.dim("Last sync:")}   ${ago}`);
      } else {
        console.log(`  ${colors.dim("Last sync:")}   never`);
      }
      const envLabel =
        result.envFile === "found"
          ? colors.green("found")
          : result.envFile === "example-only"
            ? colors.yellow("missing (only .env.example found)")
            : colors.error("missing");
      console.log(`  ${colors.dim(".env:")}         ${envLabel}`);
      if (result.parentReachable !== undefined) {
        const parentLabel = result.parentReachable
          ? colors.green("reachable")
          : colors.error("unreachable");
        console.log(`  ${colors.dim("Parent:")}      ${parentLabel}`);
      }
      const hasUpdates = result.packages.some(
        (p: { installed?: string; latest?: string }) =>
          p.installed && p.latest && normalizeVersion(p.installed) !== normalizeVersion(p.latest),
      );
      if (hasUpdates) {
        console.log();
        console.log(
          colors.dim(
            `  Run ${colors.cyan("bos upgrade")} to update packages and sync template files.`,
          ),
        );
      }
      console.log();
      return;
    }

    if (descriptor.key === "typesGen") {
      console.log();
      if (result.status === "error") {
        console.error(`[CLI] ${result.error || "Unknown error"}`);
        process.exit(1);
      }
      console.log(colors.green(`${icons.ok} Types generated`));
      if (result.source) {
        console.log(
          `  ${colors.dim("Mode:")} ${result.source === "remote" ? colors.cyan("remote") : colors.dim("local")}`,
        );
      }
      if (result.generated.length > 0) {
        console.log(`  ${colors.dim("Generated:")}`);
        for (const f of result.generated) console.log(`    ${colors.dim(f)}`);
      }
      if (result.fetched.length > 0) {
        console.log(`  ${colors.dim("Fetched from remote:")}`);
        for (const url of result.fetched) console.log(`    ${colors.dim(url)}`);
      }
      if (result.skipped.length > 0) {
        console.log(`  ${colors.dim("Skipped (local):")}`);
        for (const s of result.skipped) console.log(`    ${colors.dim(s)}`);
      }
      if (result.failed.length > 0) {
        console.log(`  ${colors.yellow("Failed:")}`);
        for (const f of result.failed) console.log(`    ${colors.error(f)}`);
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
