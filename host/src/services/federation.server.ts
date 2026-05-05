import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Effect, Schedule } from "every-plugin/effect";
import { verifySriForUrl } from "everything-dev/integrity";
import type { RouterModule } from "../types";
import type { RuntimeConfig } from "./config";
import { FederationError } from "./errors";

export type { RouterModule };

let federationInstance: ReturnType<typeof createInstance> | null = null;

export function resetFederationInstance() {
  federationInstance = null;
}

function getOrCreateFederationInstance(config: RuntimeConfig) {
  if (federationInstance) return federationInstance;

  const existingInstance = getInstance();
  const isLocalDev = config.ui.source === "local";
  const ssrUrl = config.ui.ssrUrl ?? (isLocalDev ? config.ui.url : undefined);

  if (!ssrUrl) {
    if (!isLocalDev) {
      throw new FederationError({
        remoteName: config.ui.name,
        cause: new Error(
          "SSR URL not configured in production. Set app.ui.ssr in bos.config.json to enable SSR.",
        ),
      });
    }
    throw new Error(
      "SSR URL not configured. In local dev, set app.ui.ssr or use a UI package with SSR support.",
    );
  }

  const ssrEntryUrl = `${ssrUrl.replace(/\/$/, "")}/remoteEntry.server.js`;

  if (existingInstance) {
    existingInstance.registerRemotes([
      {
        name: config.ui.name,
        entry: ssrEntryUrl,
        alias: config.ui.name,
      },
    ]);
    federationInstance = existingInstance;
    return federationInstance;
  }

  federationInstance = createInstance({
    name: "host",
    remotes: [
      {
        name: config.ui.name,
        entry: ssrEntryUrl,
        alias: config.ui.name,
      },
    ],
  });

  setGlobalFederationInstance(federationInstance);
  return federationInstance;
}

const retrySchedule = Schedule.addDelay(Schedule.recurs(5), () => 500);

export const loadRouterModule = (config: RuntimeConfig) =>
  Effect.gen(function* () {
    if (config.ui.ssrIntegrity) {
      const ssrUrl = config.ui.ssrUrl ?? config.ui.url;
      if (ssrUrl) {
        yield* Effect.tryPromise({
          try: () => verifySriForUrl(ssrUrl, config.ui.ssrIntegrity!),
          catch: (e) =>
            new FederationError({
              remoteName: config.ui.name,
              remoteUrl: config.ui.ssrUrl,
              cause: e instanceof Error ? e : new Error(String(e)),
            }),
        });
      }
    }

    const loadedModule = yield* Effect.retry(
      Effect.gen(function* () {
        const mf = getOrCreateFederationInstance(config);
        return yield* Effect.tryPromise({
          try: async () => {
            const result = await mf.loadRemote<any>(`${config.ui.name}/Router`, {
              from: "build",
            });

            if (!result) {
              throw new Error(`Module not found: ${config.ui.name}/Router`);
            }

            return result.default as RouterModule;
          },
          catch: (e) =>
            new FederationError({
              remoteName: config.ui.name,
              remoteUrl: config.ui.ssrUrl,
              cause: e,
            }),
        });
      }),
      retrySchedule,
    );

    return loadedModule;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.tapError((error: Error) => Effect.logError(`[SSR] Failed: ${error.message}`)),
  );
