import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  defaultSlug,
  leaseKey,
  readLeases,
  type SandboxLease,
  sandboxLeasesPath,
} from "../sandbox/lease-store";
import { dockerHostName } from "../sandbox/tenant-config";
import { colors } from "../utils/theme";

const HEALTH_TIMEOUT_MS = 180_000;

function fail(message: string): never {
  console.error(colors.error(`[sandbox] ${message}`));
  process.exit(1);
}

function stackEntry(): string {
  const fromHere = fileURLToPath(new URL("../sandbox/stack.ts", import.meta.url));
  if (existsSync(fromHere)) return fromHere;
  return fileURLToPath(new URL("../sandbox/stack.mjs", import.meta.url));
}

function runAlchemy(command: "deploy" | "destroy", stage: string, projectDir?: string): void {
  const result = spawnSync("bunx", ["alchemy", command, "--yes", "--stage", stage, stackEntry()], {
    stdio: "inherit",
    cwd: projectDir ?? process.cwd(),
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`alchemy ${command} --stage ${stage} exited with ${result.status}`);
  }
}

/** Reads the bound host port for the sandbox host container's 4100/tcp. */
function boundHostPort(containerName: string): number {
  const result = spawnSync("docker", ["port", containerName, "4100"], { timeout: 15_000 });
  if (result.status !== 0)
    fail(`docker port ${containerName} 4100 failed — container not running?`);
  const mapping = result.stdout.toString().trim().split("\n")[0] ?? "";
  const port = Number(mapping.split(":").pop());
  if (!Number.isInteger(port) || port <= 0) {
    fail(`could not parse bound port from: ${mapping}`);
  }
  return port;
}

async function waitForHealth(url: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === "ready") return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function printLease(lease: SandboxLease): void {
  console.log(`  account     ${lease.account}`);
  console.log(`  gateway     ${lease.gateway}`);
  console.log(`  url         ${lease.url}`);
  console.log(`  stage       ${lease.stage}`);
  console.log(`  image       ${lease.image}`);
  console.log(`  created     ${lease.createdAt}`);
}

function parseTenantArgs(args: string[]): { account: string; gateway: string } {
  const account = args[args.indexOf("--account") + 1];
  const gateway = args[args.indexOf("--gateway") + 1];
  if (!account || !gateway) {
    fail(
      "usage: bos sandbox <start|stop|list> --account <account> --gateway <gateway> [--image <ref>] [--shared-network <net>] [--no-config-path]",
    );
  }
  return { account, gateway };
}

async function start(args: string[], projectDir: string | undefined): Promise<void> {
  const { account, gateway } = parseTenantArgs(args);
  const slug = defaultSlug(account);
  const stage = `sandbox-${slug}`;
  const leasesPath = sandboxLeasesPath(projectDir);

  process.env.BOS_SANDBOX_ACCOUNT = account;
  process.env.BOS_SANDBOX_GATEWAY = gateway;
  process.env.BOS_SANDBOX_LEASES = leasesPath;
  if (args.includes("--image")) {
    process.env.BOS_SANDBOX_IMAGE = args[args.indexOf("--image") + 1];
  }
  if (args.includes("--shared-network")) {
    process.env.BOS_SANDBOX_SHARED_NETWORK = args[args.indexOf("--shared-network") + 1];
  }
  process.env.BOS_SANDBOX_CONFIG_DIR = args.includes("--no-config-path")
    ? ""
    : (projectDir ?? process.cwd());

  console.log(colors.dim(`[sandbox] acquiring lease ${stage} (alchemy deploy)…`));
  runAlchemy("deploy", stage, projectDir);

  const hostPort = boundHostPort(dockerHostName(slug));
  const sharedNetwork = process.env.BOS_SANDBOX_SHARED_NETWORK;
  const lease: SandboxLease = {
    account,
    gateway,
    slug,
    url: sharedNetwork ? `http://${dockerHostName(slug)}:4100` : `http://localhost:${hostPort}`,
    hostPort,
    stage,
    image: process.env.BOS_SANDBOX_IMAGE ?? "citynode-platform:spike",
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    leasesPath,
    `${JSON.stringify({ version: 1, leases: [...readLeases(leasesPath).filter((l) => leaseKey(l) !== leaseKey(lease)), lease] }, null, 2)}\n`,
  );

  console.log(colors.dim(`[sandbox] waiting for ${lease.url}/health…`));
  if (await waitForHealth(lease.url)) {
    console.log(colors.green(`[sandbox] sandbox host ready — ${lease.url}`));
    console.log(colors.dim(`[sandbox] binding key: ${lease.slug}.${lease.gateway} → ${lease.url}`));
  } else {
    fail(
      `sandbox host never became healthy at ${lease.url}/health within ${HEALTH_TIMEOUT_MS / 1000}s`,
    );
  }
}

function stop(args: string[], projectDir: string | undefined): void {
  const { account, gateway } = parseTenantArgs(args);
  const stage = `sandbox-${defaultSlug(account)}`;
  runAlchemy("destroy", stage, projectDir);
  const leasesPath = sandboxLeasesPath(projectDir);
  const remaining = readLeases(leasesPath).filter((l) => leaseKey(l) !== `${account}/${gateway}`);
  writeFileSync(leasesPath, `${JSON.stringify({ version: 1, leases: remaining }, null, 2)}\n`);
  console.log(colors.green(`[sandbox] released ${stage}`));
}

function list(projectDir: string | undefined): void {
  const leases = readLeases(sandboxLeasesPath(projectDir));
  if (leases.length === 0) {
    console.log(colors.dim("[sandbox] no active leases"));
    return;
  }
  for (const lease of leases) {
    printLease(lease);
    console.log("");
  }
}

export async function runSandboxCli(args: string[], projectDir: string | undefined): Promise<void> {
  if (process.env.BOS_SANDBOX !== "1") {
    fail("sandbox commands are spike-gated — run with BOS_SANDBOX=1");
  }
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "start":
      await start(rest, projectDir);
      return;
    case "stop":
      stop(rest, projectDir);
      return;
    case "list":
      list(projectDir);
      return;
    default:
      fail("usage: bos sandbox <start|stop|list> …");
  }
}
