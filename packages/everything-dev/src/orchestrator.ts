import { createConnection } from "node:net";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { getHostDevelopmentPort, getProjectRoot, parsePort } from "./config";
import { patchManifestFetchForSsrPublicPath } from "./mf";
import type { ProcessRegistry } from "./process-registry";
import type { BosConfig, RuntimeConfig } from "./types";

export interface DevProcess {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  port: number;
  readyPatterns: RegExp[];
  errorPatterns: RegExp[];
}

export interface ProcessCallbacks {
  onStatus: (name: string, status: ProcessStatus, message?: string) => void;
  onLog: (name: string, line: string, isError?: boolean) => void;
}

export interface ProcessHandle {
  name: string;
  pid: number | undefined;
  kill: Effect.Effect<void, unknown>;
  waitForReady: Effect.Effect<void, Error>;
  waitForExit: Effect.Effect<unknown>;
}

export type ProcessStatus = "pending" | "starting" | "ready" | "error";

interface ProcessConfigBase {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  readyPatterns: RegExp[];
  errorPatterns: RegExp[];
}

const processConfigBases: Record<string, ProcessConfigBase> = {
  "host-build": {
    name: "host-build",
    command: "bun",
    args: ["run", "build"],
    cwd: "host",
    readyPatterns: [/built in/i, /compiled.*successfully/i],
    errorPatterns: [/error:/i, /failed/i, /exception/i],
  },
  host: {
    name: "host",
    command: "bun",
    args: ["run", "dev"],
    cwd: "host",
    readyPatterns: [/Host (dev|production) server running at/i, /Server running at/i],
    errorPatterns: [/error:/i, /failed/i, /exception/i],
  },
  ui: {
    name: "ui",
    command: "bun",
    args: ["run", "dev"],
    cwd: "ui",
    readyPatterns: [/\bready\s+built in\b/i, /\bLocal:\b/i, /\bcompiled\b.*successfully/i],
    errorPatterns: [/error/i, /failed to compile/i],
  },
  "ui-ssr": {
    name: "ui-ssr",
    command: "bun",
    args: ["run", "dev:ssr"],
    cwd: "ui",
    readyPatterns: [/\bready\s+built in\b/i, /\bcompiled\b.*successfully/i],
    errorPatterns: [/error/i, /failed/i],
  },
  api: {
    name: "api",
    command: "bun",
    args: ["run", "dev"],
    cwd: "api",
    readyPatterns: [/ready in/i, /compiled.*successfully/i, /listening/i, /started/i],
    errorPatterns: [/error/i, /failed/i],
  },
};

export function getProcessConfig(
  pkg: string,
  env?: Record<string, string>,
  portOverride?: number,
  bosConfig?: BosConfig,
  runtimeConfig?: RuntimeConfig,
): DevProcess | null {
  if (pkg.startsWith("plugin:")) {
    const pluginId = pkg.slice("plugin:".length);
    const pluginConfig = runtimeConfig?.plugins?.[pluginId] ?? null;
    const localPath = pluginConfig?.localPath;

    if (!localPath || pluginConfig?.source !== "local") return null;

    const port =
      portOverride ?? pluginConfig?.port ?? (pluginConfig?.url ? parsePort(pluginConfig.url) : 0);

    return {
      name: pkg,
      command: "bun",
      args: ["run", "dev"],
      cwd: localPath,
      port,
      readyPatterns: [/ready in/i, /compiled.*successfully/i, /listening/i, /started/i],
      errorPatterns: [/error/i, /failed/i],
      env,
    };
  }

  const base = processConfigBases[pkg];
  if (!base) return null;

  let port: number;
  if (pkg === "host") {
    port =
      portOverride ??
      (runtimeConfig?.hostUrl
        ? parsePort(runtimeConfig.hostUrl)
        : bosConfig
          ? getHostDevelopmentPort(bosConfig.app.host.development)
          : 3000);
  } else if (pkg === "ui") {
    port =
      runtimeConfig?.ui.port ?? (runtimeConfig?.ui.url ? parsePort(runtimeConfig.ui.url) : 3002);
  } else if (pkg === "ui-ssr") {
    const uiPort = runtimeConfig?.ui.ssrUrl
      ? parsePort(runtimeConfig.ui.ssrUrl)
      : runtimeConfig?.ui.port
        ? runtimeConfig.ui.port + 1
        : 3003;
    port = uiPort;
  } else if (pkg === "api") {
    port =
      runtimeConfig?.api.port ?? (runtimeConfig?.api.url ? parsePort(runtimeConfig.api.url) : 3014);
  } else {
    port = 0;
  }

  const cwd =
    pkg === "ui"
      ? (runtimeConfig?.ui.localPath ?? base.cwd)
      : pkg === "api"
        ? (runtimeConfig?.api.localPath ?? base.cwd)
        : base.cwd;

  return { ...base, cwd, port, env };
}

const stripAnsi = (input: string): string => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  return input
    .replace(new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g"), "")
    .replace(new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
};

const probeHttpOk = async (url: string, timeoutMs = 400): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const probeTcpOpen = async (port: number, timeoutMs = 250): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
};

const detectStatus = (
  line: string,
  config: DevProcess,
): { status: ProcessStatus; isError: boolean } | null => {
  const cleanLine = stripAnsi(line);
  for (const pattern of config.errorPatterns) {
    if (pattern.test(cleanLine)) {
      return { status: "error", isError: true };
    }
  }
  for (const pattern of config.readyPatterns) {
    if (pattern.test(cleanLine)) {
      return { status: "ready", isError: false };
    }
  }
  return null;
};

const killProcessTree = (pid: number) =>
  Effect.gen(function* () {
    const killSignal = (signal: NodeJS.Signals) =>
      Effect.try({
        try: () => {
          process.kill(-pid, signal);
        },
        catch: () => null,
      }).pipe(Effect.ignore);

    const killDirect = (signal: NodeJS.Signals) =>
      Effect.try({
        try: () => {
          process.kill(pid, signal);
        },
        catch: () => null,
      }).pipe(Effect.ignore);

    const isRunning = () =>
      Effect.try({
        try: () => {
          process.kill(pid, 0);
          return true;
        },
        catch: () => false,
      });

    yield* killSignal("SIGTERM");
    yield* killDirect("SIGTERM");

    yield* Effect.sleep("200 millis");

    const stillRunning = yield* isRunning();
    if (stillRunning) {
      yield* killSignal("SIGKILL");
      yield* killDirect("SIGKILL");
      yield* Effect.sleep("100 millis");
    }
  });

interface ServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

interface ServerInput {
  config: RuntimeConfig;
}

const patchConsole = (name: string, callbacks: ProcessCallbacks): (() => void) => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  const formatArgs = (args: unknown[]): string => {
    return args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(" ");
  };

  console.log = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };
  console.error = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), true);
  };
  console.warn = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };
  console.info = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  };
};

export const spawnRemoteHost = (
  config: DevProcess,
  callbacks: ProcessCallbacks,
  runtimeConfig: RuntimeConfig,
) =>
  Effect.gen(function* () {
    const remoteUrl = config.env?.HOST_REMOTE_URL;
    if (!remoteUrl) {
      return yield* Effect.fail(new Error("HOST_REMOTE_URL not provided for remote host"));
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        process.env[key] = value;
      }
    }

    callbacks.onStatus(config.name, "starting");
    callbacks.onLog(config.name, `Remote: ${remoteUrl}`);
    const restoreConsole = patchConsole(config.name, callbacks);
    callbacks.onLog(config.name, "Loading Module Federation runtime...");

    const mfRuntime = yield* Effect.tryPromise({
      try: () => import("@module-federation/enhanced/runtime"),
      catch: (e) => new Error(`Failed to load MF runtime: ${e}`),
    });

    const mfCore = yield* Effect.tryPromise({
      try: () => import("@module-federation/runtime-core"),
      catch: (e) => new Error(`Failed to load MF core: ${e}`),
    });

    let mf = mfRuntime.getInstance();
    if (!mf) {
      mf = mfRuntime.createInstance({ name: "cli-host", remotes: [] });
      mfCore.setGlobalFederationInstance(mf);
    }
    patchManifestFetchForSsrPublicPath(mf as any);

    const baseUrl = remoteUrl
      .replace(/\/remoteEntry\.js$/, "")
      .replace(/\/mf-manifest\.json$/, "")
      .replace(/\/$/, "");
    const remoteEntryUrl = `${baseUrl}/remoteEntry.js`;
    const manifestUrl = `${baseUrl}/mf-manifest.json`;

    const entryUrl = yield* Effect.tryPromise({
      try: async () => {
        try {
          const res = await fetch(manifestUrl);
          if (!res.ok) return remoteEntryUrl;
          const json = (await res.json()) as Record<string, unknown>;
          if (
            json &&
            typeof json === "object" &&
            "metaData" in json &&
            "exposes" in json &&
            "shared" in json
          ) {
            return manifestUrl;
          }
        } catch {}
        return remoteEntryUrl;
      },
      catch: () => remoteEntryUrl,
    });

    (mf as any).registerRemotes([{ name: "host", entry: entryUrl }]);
    callbacks.onLog(config.name, `Loading host from ${entryUrl}...`);

    const hostModule = yield* Effect.tryPromise({
      try: () =>
        (mf as any).loadRemote("host/Server") as Promise<{
          runServer: (input: ServerInput) => ServerHandle;
        }>,
      catch: (e) => new Error(`Failed to load host module: ${e}`),
    });

    if (!hostModule?.runServer) {
      return yield* Effect.fail(new Error("Host module does not export runServer function"));
    }

    callbacks.onLog(config.name, "Starting server...");
    const serverHandle = hostModule.runServer({ config: runtimeConfig });
    yield* Effect.tryPromise({
      try: () => serverHandle.ready,
      catch: (e) => new Error(`Server failed to start: ${e}`),
    });

    callbacks.onStatus(config.name, "ready");

    return {
      name: config.name,
      pid: process.pid,
      kill: Effect.gen(function* () {
        callbacks.onLog(config.name, "Shutting down remote host...");
        restoreConsole();
        yield* Effect.tryPromise({
          try: () => serverHandle.shutdown(),
          catch: () => {},
        }).pipe(Effect.ignore);
      }),
      waitForReady: Effect.succeed(undefined),
      waitForExit: Effect.never,
    } satisfies ProcessHandle;
  });

export const spawnDevProcess = (
  config: DevProcess,
  callbacks: ProcessCallbacks,
  runtimeConfig?: RuntimeConfig,
  registry?: ProcessRegistry,
) =>
  Effect.gen(function* () {
    let configDir: string;
    try {
      configDir = getProjectRoot();
    } catch {
      configDir = process.cwd();
    }
    const fullCwd = config.cwd.startsWith("/") ? config.cwd : `${configDir}/${config.cwd}`;
    const readyDeferred = yield* Deferred.make<void, Error>();
    const statusRef = yield* Ref.make<ProcessStatus>("starting");

    callbacks.onStatus(config.name, "starting");

    const envVars: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...config.env,
      FORCE_COLOR: "1",
      ...(config.port > 0 ? { PORT: String(config.port) } : {}),
    };

    if (runtimeConfig && config.name === "host") {
      envVars.BOS_RUNTIME_CONFIG = JSON.stringify(runtimeConfig);
    }

    const proc = Bun.spawn({
      cmd: [config.command, ...config.args],
      cwd: fullCwd,
      env: envVars,
      stdio: ["inherit", "pipe", "pipe"],
    });

    const markReady = Effect.gen(function* () {
      const currentStatus = yield* Ref.get(statusRef);
      if (currentStatus === "ready" || currentStatus === "error") return;
      yield* Ref.set(statusRef, "ready");
      callbacks.onStatus(config.name, "ready");
      yield* Deferred.succeed(readyDeferred, undefined).pipe(Effect.ignore);
    });

    if (config.port > 0) {
      const readinessPath =
        config.name === "host" ? "/health" : config.name === "ui-ssr" ? "/" : "/remoteEntry.js";
      const url = `http://127.0.0.1:${config.port}${readinessPath}`;

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          const deadline = Date.now() + 90_000;
          while (Date.now() < deadline) {
            const status = yield* Ref.get(statusRef);
            if (status === "ready" || status === "error") return;
            const ok = url
              ? yield* Effect.tryPromise({
                  try: () => probeHttpOk(url),
                  catch: () => false,
                })
              : yield* Effect.tryPromise({
                  try: () => probeTcpOpen(config.port),
                  catch: () => false,
                });
            if (ok) {
              yield* markReady;
              return;
            }
            yield* Effect.sleep("200 millis");
          }
        }),
      );
    }

    if (registry && proc.pid) {
      yield* registry.track({
        pid: proc.pid,
        name: config.name,
        port: config.port,
        startedAt: Date.now(),
        command: [config.command, ...config.args].join(" "),
      });
    }

    yield* Effect.forkScoped(
      Effect.promise(() => proc.exited).pipe(
        Effect.andThen((code) =>
          Effect.gen(function* () {
            if (registry && proc.pid) {
              yield* registry.untrack(proc.pid).pipe(Effect.ignore);
            }
            const currentStatus = yield* Ref.get(statusRef);
            if (currentStatus === "ready") return;
            callbacks.onLog(config.name, `Process exited before ready (exit code: ${code})`, true);
            yield* Ref.set(statusRef, "error");
            callbacks.onStatus(config.name, "error");
            yield* Deferred.fail(
              readyDeferred,
              new Error(`Process exited before ready: ${config.name}`),
            ).pipe(Effect.ignore);
          }),
        ),
      ),
    );

    const handleLine = (line: string, isStderr: boolean) =>
      Effect.gen(function* () {
        if (!line.trim()) return;

        callbacks.onLog(config.name, line, isStderr);

        const currentStatus = yield* Ref.get(statusRef);
        if (currentStatus === "ready") return;

        const detected = detectStatus(line, config);
        if (detected) {
          yield* Ref.set(statusRef, detected.status);
          callbacks.onStatus(config.name, detected.status);
          if (detected.status === "ready" || detected.status === "error") {
            if (detected.status === "ready") {
              yield* Deferred.succeed(readyDeferred, undefined).pipe(Effect.ignore);
            } else {
              yield* Deferred.fail(readyDeferred, new Error(`Process failed: ${config.name}`)).pipe(
                Effect.ignore,
              );
            }
          }
        }
      });

    const decoder = new TextDecoder();

    const stdoutFiber = yield* Effect.forkScoped(
      Effect.async<void>((resume) => {
        if (!proc.stdout) {
          resume(Effect.void);
          return;
        }
        const reader = proc.stdout.getReader();
        let buffer = "";
        let active = true;

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (!active) return;
            if (done) {
              if (buffer) Effect.runSync(handleLine(buffer, false));
              return;
            }
            buffer += decoder
              .decode(value, { stream: true })
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n");
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              Effect.runSync(handleLine(line, false));
            }
            return pump();
          });

        pump().then(() => {
          if (active) resume(Effect.void);
        });

        return Effect.sync(() => {
          active = false;
          reader.cancel();
        });
      }),
    );

    const stderrFiber = yield* Effect.forkScoped(
      Effect.async<void>((resume) => {
        if (!proc.stderr) {
          resume(Effect.void);
          return;
        }
        const reader = proc.stderr.getReader();
        let buffer = "";
        let active = true;

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (!active) return;
            if (done) {
              if (buffer) Effect.runSync(handleLine(buffer, true));
              return;
            }
            buffer += decoder
              .decode(value, { stream: true })
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n");
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              Effect.runSync(handleLine(line, true));
            }
            return pump();
          });

        pump().then(() => {
          if (active) resume(Effect.void);
        });

        return Effect.sync(() => {
          active = false;
          reader.cancel();
        });
      }),
    );

    const handle: ProcessHandle = {
      name: config.name,
      pid: proc.pid,
      kill: proc.pid
        ? killProcessTree(proc.pid)
        : Effect.gen(function* () {
            proc.kill("SIGTERM");
            yield* Effect.sleep("100 millis");
            try {
              proc.kill("SIGKILL");
            } catch {}
          }),
      waitForReady: Deferred.await(readyDeferred),
      waitForExit: Effect.gen(function* () {
        yield* Fiber.joinAll([stdoutFiber, stderrFiber]);
        return yield* Effect.promise(() => proc.exited);
      }),
    };

    return handle;
  });

export const makeDevProcess = (
  pkg: string,
  env: Record<string, string> | undefined,
  callbacks: ProcessCallbacks,
  portOverride?: number,
  bosConfig?: BosConfig,
  runtimeConfig?: RuntimeConfig,
  registry?: ProcessRegistry,
) =>
  Effect.gen(function* () {
    const config = getProcessConfig(pkg, env, portOverride, bosConfig, runtimeConfig);
    if (!config) {
      return yield* Effect.fail(new Error(`Unknown package: ${pkg}`));
    }

    if (pkg === "host" && runtimeConfig) {
      if (env?.HOST_SOURCE === "remote") {
        return yield* spawnRemoteHost(config, callbacks, runtimeConfig);
      }
      return yield* spawnDevProcess(config, callbacks, runtimeConfig, registry);
    }

    return yield* spawnDevProcess(config, callbacks, runtimeConfig, registry);
  });
