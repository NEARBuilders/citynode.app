import { Cause, Effect, Exit } from "effect";
import {
  dockerProvider,
  makeSandboxOrchestrator,
  readLeases,
  type SandboxLease,
  type SandboxTenant,
  sandboxLeasesPath,
} from "../sandbox";
import { colors } from "../utils/theme";

const DEFAULT_IMAGE = "citynode-platform:spike";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30_000;

interface SandboxStartOptions {
  account: string;
  gateway: string;
  image: string;
  ttlMs: number;
  detach: boolean;
  noConfigPath: boolean;
}

function parseDuration(input: string | undefined): number {
  if (!input) return DEFAULT_TTL_MS;
  const match = /^(\d+)(ms|s|m|h)?$/.exec(input);
  if (!match) return DEFAULT_TTL_MS;
  const value = Number(match[1]);
  switch (match[2]) {
    case "ms":
      return value;
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return value;
  }
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printLease(lease: SandboxLease): void {
  console.log(`  account       ${lease.account}`);
  console.log(`  gateway       ${lease.gateway}`);
  console.log(`  url           ${lease.url}`);
  console.log(`  slug          ${lease.slug}`);
  console.log(
    `  image         ${lease.image}${lease.imageDigest ? ` @ ${lease.imageDigest.slice(0, 32)}…` : ""}`,
  );
  console.log(`  containers    ${lease.containers.length}`);
  console.log(`  created       ${lease.createdAt}`);
}

function tenantFromArgs(args: string[]): SandboxTenant | null {
  const account = flagValue(args, "--account");
  const gateway = flagValue(args, "--gateway");
  if (!account || !gateway) return null;
  return { account, gateway };
}

function fail(message: string): never {
  console.error(colors.red(`[sandbox] ${message}`));
  process.exit(1);
}

async function runEffect<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const squashed = Cause.squash(exit.cause);
    fail(squashed instanceof Error ? squashed.message : String(squashed));
  }
  return exit.value;
}

async function start(args: string[], projectDir: string | undefined): Promise<void> {
  const tenant = tenantFromArgs(args);
  if (!tenant) {
    fail(
      "usage: bos sandbox start --account <account> --gateway <gateway> [--image <img>] [--ttl <duration>] [--detach] [--no-config-path]",
    );
  }
  const image = flagValue(args, "--image") ?? DEFAULT_IMAGE;
  const ttlMs = parseDuration(flagValue(args, "--ttl"));
  const detach = hasFlag(args, "--detach");
  const noConfigPath = hasFlag(args, "--no-config-path");
  const sharedNetwork = flagValue(args, "--shared-network");

  const orchestrator = makeSandboxOrchestrator(dockerProvider(), {
    leasesPath: sandboxLeasesPath(projectDir),
    image,
    configDir: noConfigPath ? undefined : projectDir,
    sharedNetwork,
  });

  console.log(
    colors.dim(
      `[sandbox] acquiring lease for ${tenant.account}/${tenant.gateway} (image ${image})…`,
    ),
  );
  const lease = await runEffect(orchestrator.acquireLease(tenant));
  console.log(colors.green(`[sandbox] lease ready — ${lease.url}`));
  printLease(lease);
  console.log(colors.dim(`[sandbox] binding key: ${lease.slug}.${lease.gateway} → ${lease.url}`));

  if (detach) {
    console.log(
      colors.yellow(
        `[sandbox] detached — idle sweeper disabled; stop with: bos sandbox stop --account ${tenant.account} --gateway ${tenant.gateway}`,
      ),
    );
    return;
  }

  console.log(
    colors.dim(
      `[sandbox] attached — idle sweeper every ${SWEEP_INTERVAL_MS / 1000}s, ttl ${ttlMs / 1000}s; Ctrl-C releases the lease`,
    ),
  );

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    console.log(colors.dim("\n[sandbox] releasing lease…"));
    await runEffect(orchestrator.releaseLease(tenant));
    process.exit(0);
  };
  process.on("SIGINT", () => void release());
  process.on("SIGTERM", () => void release());

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, SWEEP_INTERVAL_MS));
    const stopped = await runEffect(orchestrator.sweepIdle(ttlMs));
    if (stopped.length > 0) {
      console.log(colors.yellow(`[sandbox] idle TTL expired — released: ${stopped.join(", ")}`));
    }
    if (stopped.some((key) => key === `${tenant.account}/${tenant.gateway}`)) {
      console.log(
        colors.yellow("[sandbox] this lease expired — re-acquire with: bos sandbox start …"),
      );
      return;
    }
  }
}

async function stop(args: string[], projectDir: string | undefined): Promise<void> {
  const leasesPath = sandboxLeasesPath(projectDir);
  const tenant = tenantFromArgs(args);
  const orchestrator = makeSandboxOrchestrator(dockerProvider(), {
    leasesPath,
    image: DEFAULT_IMAGE,
  });

  if (!tenant && hasFlag(args, "--all")) {
    const leases = readLeases(leasesPath);
    for (const lease of leases) {
      await runEffect(orchestrator.releaseLease(lease));
      console.log(colors.green(`[sandbox] released ${lease.account}/${lease.gateway}`));
    }
    return;
  }
  if (!tenant) {
    fail("usage: bos sandbox stop --account <account> --gateway <gateway> | --all");
  }
  await runEffect(orchestrator.releaseLease(tenant));
  console.log(colors.green(`[sandbox] released ${tenant.account}/${tenant.gateway}`));
}

async function list(projectDir: string | undefined): Promise<void> {
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
  const subcommand = args[0];
  const rest = args.slice(1);

  if (process.env.BOS_SANDBOX !== "1") {
    fail("sandbox commands are spike-gated — run with BOS_SANDBOX=1");
  }

  switch (subcommand) {
    case "start":
      await start(rest, projectDir);
      return;
    case "stop":
      await stop(rest, projectDir);
      return;
    case "list":
      await list(projectDir);
      return;
    default:
      fail("usage: bos sandbox <start|stop|list> …");
  }
}
