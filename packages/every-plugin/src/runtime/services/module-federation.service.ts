import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Context, Effect, Layer, Option } from "effect";
import type { AnyPlugin } from "../../types";
import { ModuleFederationError } from "../errors";
import { type AppSharedDeps, MF_CORE_SHARED_DEPS, type CoreSharedDepName, SHARE_CONFIG } from "../mf-config";
import { getNormalizedRemoteName } from "./normalize";

type RemoteModule = (new () => AnyPlugin) | { default: new () => AnyPlugin };

const coreModuleLoaders: Record<CoreSharedDepName, () => Promise<unknown>> = {
  "every-plugin": () => import("every-plugin"),
  effect: () => import("effect"),
  zod: () => import("zod"),
  "@orpc/contract": () => import("@orpc/contract"),
  "@orpc/server": () => import("@orpc/server"),
};

type SharedConfigEntry = {
  version: string;
  get: () => Promise<() => unknown>;
  shareConfig: typeof SHARE_CONFIG;
};

function buildSharedConfig(appShared?: AppSharedDeps): Record<string, SharedConfigEntry> {
  const entries: Record<string, SharedConfigEntry> = {};

  for (const [name, config] of Object.entries(MF_CORE_SHARED_DEPS)) {
    const loader = coreModuleLoaders[name as CoreSharedDepName];
    if (!loader) {
      throw new Error(`Missing core shared module loader for ${name}`);
    }
    entries[name] = {
      version: config.version,
      get: () => loader().then((mod) => () => mod),
      shareConfig: config.shareConfig,
    };
  }

  if (appShared) {
    for (const [name, config] of Object.entries(appShared)) {
      entries[name] = {
        version: config.version,
        get: () => import(name).then((mod) => () => mod),
        shareConfig: {
          singleton: config.singleton ?? true,
          requiredVersion: config.requiredVersion ?? false,
          strictVersion: config.strictVersion ?? false,
          eager: config.eager ?? false,
        },
      };
    }
  }

  return entries;
}

class AppSharedDepsTag extends Context.Tag("every-plugin/AppSharedDeps")<
  AppSharedDepsTag,
  AppSharedDeps
>() {}

const createModuleFederationInstance = Effect.gen(function* () {
  const appShared = yield* Effect.option(AppSharedDepsTag);
  const appSharedValue = Option.isSome(appShared) ? appShared.value : undefined;

  try {
    const shared = buildSharedConfig(appSharedValue);
    let instance = getInstance();

    if (!instance) {
      instance = createInstance({
        name: "host",
        remotes: [],
        shared,
      });

      setGlobalFederationInstance(instance);
    } else {
      instance.registerShared(shared);
    }

    return instance;
  } catch (error) {
    throw new Error(`Failed to initialize Module Federation: ${error}`);
  }
}).pipe(Effect.cached);

export class ModuleFederationService extends Effect.Service<ModuleFederationService>()(
  "ModuleFederationService",
  {
    effect: Effect.gen(function* () {
      const mf = yield* Effect.flatten(createModuleFederationInstance);

      return {
        registerRemote: (pluginId: string, url: string) =>
          Effect.gen(function* () {
            console.log(`[MF] Registering ${pluginId}`);

            const remoteName = getNormalizedRemoteName(pluginId);
            const type = url.endsWith("/mf-manifest.json")
              ? ("manifest" as const)
              : url.endsWith("/remoteEntry.js")
                ? ("script" as const)
                : undefined;

            yield* Effect.try({
              try: () =>
                mf.registerRemotes([
                  {
                    name: remoteName,
                    entry: url,
                    ...(type ? { type } : {}),
                  },
                ]),
              catch: (error): ModuleFederationError =>
                new ModuleFederationError({
                  pluginId,
                  remoteUrl: url,
                  cause: error instanceof Error ? error : new Error(String(error)),
                }),
            });

            console.log(`[MF] ✅ Registered ${pluginId}`);
          }),

        loadRemoteConstructor: (pluginId: string, url: string) =>
          Effect.gen(function* () {
            const remoteName = getNormalizedRemoteName(pluginId);
            console.log(`[MF] Loading remote ${remoteName}`);
            const modulePath = `${remoteName}/plugin`;

            return yield* Effect.tryPromise({
              try: async () => {
                const container = await mf.loadRemote<RemoteModule>(modulePath);
                if (!container) {
                  throw new Error(`No container returned for ${modulePath}`);
                }

                // Support multiple export patterns: direct function, default export, named exports
                let Constructor: any;

                if (typeof container === "function") {
                  // Direct function export
                  Constructor = container;
                } else if (container.default) {
                  // Default export
                  Constructor = container.default;
                } else {
                  // Named export fallback - prioritize exports with 'binding' property (plugin classes)
                  Constructor = Object.values(container).find(
                    (exp) => typeof exp === "function" && (exp as any).binding !== undefined,
                  );

                  // Fallback to any function export if no binding found
                  if (!Constructor) {
                    Constructor = Object.values(container).find(
                      (exp) => typeof exp === "function" && exp.prototype?.constructor === exp,
                    );
                  }
                }

                if (!Constructor || typeof Constructor !== "function") {
                  const containerInfo =
                    typeof container === "object"
                      ? `Available exports: ${Object.keys(container).join(", ")}`
                      : `Container type: ${typeof container}`;

                  throw new Error(
                    `No valid plugin constructor found for '${pluginId}'.\n` +
                      `Supported patterns:\n` +
                      `  - export const YourPlugin = createPlugin({...})\n` +
                      `  - export default createPlugin({...})\n` +
                      `${containerInfo}`,
                  );
                }

                // Validate it looks like a plugin constructor (has binding property)
                if (!(Constructor as any).binding) {
                  const containerInfo =
                    typeof container === "object"
                      ? `Found exports: ${Object.keys(container).join(", ")}`
                      : `Container type: ${typeof container}`;

                  throw new Error(
                    `Invalid plugin constructor for '${pluginId}'. ` +
                      `The exported value must be created with createPlugin(). ` +
                      `Found a function but it's missing the required 'binding' property.\n` +
                      `${containerInfo}`,
                  );
                }

                console.log(`[MF] ✅ Loaded constructor for ${pluginId}`);
                return Constructor;
              },
              catch: (error): ModuleFederationError =>
                new ModuleFederationError({
                  pluginId,
                  remoteUrl: url,
                  cause: error instanceof Error ? error : new Error(String(error)),
                }),
            });
          }),
      };
    }),
  },
) {}
