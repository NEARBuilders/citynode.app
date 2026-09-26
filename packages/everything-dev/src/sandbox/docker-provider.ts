import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { Effect } from "effect";
import type { SandboxMachineProviderShape, SandboxMachineSpec, SpawnedMachine } from "./types";
import { SandboxError } from "./types";

const exec = (path: string, args: readonly string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(path, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path} ${args.join(" ")} failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });

const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

const imageDigestOf = async (image: string): Promise<string | null> => {
  try {
    const out = await exec("docker", [
      "image",
      "inspect",
      "--format",
      "{{index .RepoDigests 0}}",
      image,
    ]);
    return out.trim() || null;
  } catch {
    return null;
  }
};

export const dockerProvider = (): SandboxMachineProviderShape => ({
  findFreePort: () =>
    Effect.tryPromise({
      try: findFreePort,
      catch: (cause) => new SandboxError({ reason: "no free port", phase: "spawn", cause }),
    }),

  ensureNetwork: (name) =>
    Effect.tryPromise({
      try: async () => {
        await exec("docker", ["network", "inspect", name]).catch(() =>
          exec("docker", ["network", "create", name]),
        );
      },
      catch: (cause) => new SandboxError({ reason: `network ${name}`, phase: "spawn", cause }),
    }),

  connectNetwork: (network, container) =>
    Effect.tryPromise({
      try: async () => {
        await exec("docker", ["network", "connect", network, container]);
      },
      catch: (cause) =>
        new SandboxError({ reason: `connect ${container} to ${network}`, phase: "spawn", cause }),
    }),

  spawn: (spec: SandboxMachineSpec): Effect.Effect<SpawnedMachine, SandboxError> =>
    Effect.tryPromise({
      try: async () => {
        const args = ["run", "-d", "--rm", "--name", spec.name, "--network", spec.network];
        for (const [host, container] of Object.entries(spec.binds)) {
          args.push("-v", `${host}:${container}`);
        }
        args.push("-p", `${spec.port}:${spec.kind === "postgres" ? 5432 : 4100}`);
        for (const [key, value] of Object.entries(spec.env)) {
          args.push("-e", `${key}=${value}`);
        }

        if (spec.kind === "postgres") {
          args.push(
            "-e",
            "POSTGRES_USER=sandbox",
            "-e",
            "POSTGRES_PASSWORD=sandbox",
            "-e",
            "POSTGRES_DB=sandbox",
            "postgres:17-alpine",
          );
        } else {
          args.push(spec.image!);
        }

        const containerId = (await exec("docker", args)).trim();
        const digest = await imageDigestOf(spec.image ?? "");

        return { name: spec.name, port: spec.port, containerId, imageDigest: digest };
      },
      catch: (cause) => new SandboxError({ reason: `spawn ${spec.name}`, phase: "spawn", cause }),
    }),

  stop: (name) =>
    Effect.promise(async () => {
      await exec("docker", ["rm", "-f", name]).catch(() => {});
    }),

  healthCheck: (url) =>
    Effect.promise(async () => {
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { status?: string };
        return body.status === "ready";
      } catch {
        return false;
      }
    }),

  imageDigest: (image) => Effect.promise(() => imageDigestOf(image)),
});
