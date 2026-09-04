import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import {
  buildGeneratedInfraSpec,
  type ComposeDatabaseService,
  type GeneratedInfraSpec,
  loadPortState,
  type PortState,
  renderDockerCompose,
  renderEnvFile,
  renderEnvTestFile,
  resolveDevHostPort,
  savePortState,
} from "../cli/infra";
import type { RuntimeConfig } from "../types";
import { InfraError, type InfraPhase } from "./types";

export interface DevRuntimeEnv {
  readonly devHostPort?: number;
}

export interface InfraMaterializerShape {
  readonly materializeTemplate: (
    configDir: string,
    runtimeConfig: RuntimeConfig,
  ) => Effect.Effect<void, InfraError>;
  readonly materializeLocalDevEnv: (
    configDir: string,
    runtimeConfig: RuntimeConfig,
    dev: DevRuntimeEnv,
  ) => Effect.Effect<void, InfraError>;
  readonly materializeTestInfra: (
    configDir: string,
    runtimeConfig: RuntimeConfig,
  ) => Effect.Effect<void, InfraError>;
  readonly materializeCompose: (
    configDir: string,
    runtimeConfig: RuntimeConfig,
  ) => Effect.Effect<void, InfraError>;
  readonly persistPortState: (
    configDir: string,
    state: PortState,
  ) => Effect.Effect<void, InfraError>;
}

export class InfraMaterializer extends Context.Tag("InfraMaterializer")<
  InfraMaterializer,
  InfraMaterializerShape
>() {}

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeIfChanged(filePath: string, content: string): void {
  if (existsSync(filePath) && readFileSync(filePath, "utf-8") === content) return;
  ensureDir(filePath);
  writeFileSync(filePath, content);
}

function buildSpecSafe(
  configDir: string,
  runtimeConfig: RuntimeConfig,
): Effect.Effect<{ spec: GeneratedInfraSpec; portState: PortState }, InfraError> {
  return Effect.try({
    try: () => buildGeneratedInfraSpec(runtimeConfig, configDir),
    catch: (cause) =>
      new InfraError({
        phase: "materialize-env",
        message: `failed to build infra spec for ${configDir}`,
        cause,
      }),
  });
}

function writeContentEffect(
  filePath: string,
  content: string,
  phase: InfraPhase,
): Effect.Effect<void, InfraError> {
  return Effect.try({
    try: () => writeIfChanged(filePath, content),
    catch: (cause) =>
      new InfraError({
        phase,
        message: `failed to write ${filePath}`,
        cause,
      }),
  });
}

const makeMaterializer = (): InfraMaterializerShape => ({
  materializeTemplate: (configDir, runtimeConfig) =>
    Effect.gen(function* () {
      const { spec } = yield* buildSpecSafe(configDir, runtimeConfig);
      const filePath = join(configDir, ".env.example");
      const content = renderEnvFile(spec.groups, spec.databases, spec.redis, {
        forExample: true,
      });
      yield* writeContentEffect(filePath, content, "materialize-env");
    }),

  materializeLocalDevEnv: (configDir, runtimeConfig, dev) =>
    Effect.gen(function* () {
      const { spec } = yield* buildSpecSafe(configDir, runtimeConfig);
      const filePath = join(configDir, ".env");
      const content = renderEnvFile(spec.groups, spec.databases, spec.redis, {
        forExample: false,
        ...(typeof dev.devHostPort === "number" ? { devHostPort: dev.devHostPort } : {}),
      });
      yield* writeContentEffect(filePath, content, "materialize-env");
    }),

  materializeTestInfra: (configDir, runtimeConfig) =>
    Effect.gen(function* () {
      const { spec } = yield* buildSpecSafe(configDir, runtimeConfig);
      const filePath = join(configDir, ".env.test");
      const content = renderEnvTestFile(spec.groups, spec.testDatabases);
      yield* writeContentEffect(filePath, content, "materialize-env");
    }),

  materializeCompose: (configDir, runtimeConfig) =>
    Effect.gen(function* () {
      const { spec } = yield* buildSpecSafe(configDir, runtimeConfig);
      const filePath = join(configDir, "docker-compose.yml");
      const databases: ComposeDatabaseService[] = spec.databases.map((d) => ({
        serviceName: d.serviceName,
        containerName: d.containerName,
        port: d.port,
        volumeName: d.volumeName,
        databaseName: d.databaseName,
      }));
      const redisConfigs = spec.redis.map((r) => ({
        serviceName: r.serviceName,
        containerName: r.containerName,
        port: r.port,
        volumeName: r.volumeName,
      }));
      const content = renderDockerCompose(
        databases,
        redisConfigs,
        runtimeConfig.account,
        spec.testDatabases.services,
      );
      yield* writeContentEffect(filePath, content, "materialize-compose");
    }),

  persistPortState: (configDir, state) =>
    Effect.try({
      try: () => savePortState(configDir, state),
      catch: (cause) =>
        new InfraError({
          phase: "materialize-env",
          message: `failed to persist port state at ${configDir}`,
          cause,
        }),
    }),
});

export const InfraMaterializerLive: Layer.Layer<InfraMaterializer> = Layer.succeed(
  InfraMaterializer,
  makeMaterializer(),
);

export {
  buildGeneratedInfraSpec,
  loadPortState,
  renderDockerCompose,
  renderEnvFile,
  renderEnvTestFile,
  resolveDevHostPort,
  savePortState,
};

/**
 * Single source of truth for "should we persist port state?".
 * Lives next to the only thing it gates (persistPortState).
 */
export function shouldPersistPortState(): boolean {
  return (
    process.env.BOS_NO_PERSIST_PORTS !== "1" &&
    process.env.BOS_TEST !== "1" &&
    process.env.NODE_ENV !== "test"
  );
}

/**
 * True when the run is ephemeral (regression, CI, local test).
 * In ephemeral mode we must not rewrite `.env.example` because it's a
 * committed reference template — every regression run was previously
 * baking the resolved regression port into it, polluting the file.
 */
export function isEphemeralRun(): boolean {
  return (
    process.env.BOS_NO_PERSIST_PORTS === "1" ||
    process.env.BOS_TEST === "1" ||
    process.env.NODE_ENV === "test"
  );
}

export interface MaterializeOptions {
  /**
   * Override the ephemeral detection. Defaults to the env-var check.
   * Pass `ephemeral: false` to force-template-write, e.g. for opt-in
   * smoke runs that explicitly want a deterministic template.
   */
  readonly ephemeral?: boolean;
}

/**
 * Orchestration helper: runs the three materializers in a canonical order
 * with the ephemeral-template-skip guard. Use this from every CLI tool
 * that needs to materialize infrastructure for a stack — it keeps the
 * "committed `.env.example` is stable" invariant enforced in one place.
 */
export async function materializeViaLayer(
  configDir: string,
  runtimeConfig: RuntimeConfig,
  options: MaterializeOptions = {},
): Promise<void> {
  const ephemeral = options.ephemeral ?? isEphemeralRun();
  await Effect.runPromise(
    Effect.gen(function* () {
      const m = yield* InfraMaterializer;
      if (!ephemeral) {
        yield* m.materializeTemplate(configDir, runtimeConfig);
      }
      yield* m.materializeTestInfra(configDir, runtimeConfig);
      yield* m.materializeCompose(configDir, runtimeConfig);
    }).pipe(Effect.provide(InfraMaterializerLive)),
  );
}
