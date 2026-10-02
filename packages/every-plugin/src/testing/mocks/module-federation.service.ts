import { Effect, Layer } from "effect";
import type { LoadedPluginWithBinding } from "../../plugin";
import { ModuleFederationError } from "../../runtime/errors";
import { ModuleFederationService } from "../../runtime/services/module-federation.service";

export type PluginMap = Record<string, LoadedPluginWithBinding<any, any, any, any>>;

export const createMockModuleFederationServiceLayer = (pluginMap: PluginMap) =>
  Layer.succeed(ModuleFederationService, {
    registerRemote: (pluginId: string, url: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`[MOCK] registerRemote called for ${pluginId}`);
        if (!(pluginId in pluginMap)) {
          return yield* new ModuleFederationError({
            pluginId,
            remoteUrl: url,
            cause: new Error(`Mock: Plugin ${pluginId} not available in test plugin map`),
          });
        }
        yield* Effect.log(`[MOCK] registerRemote succeeded for ${pluginId}`);
      }),

    loadRemoteConstructor: (pluginId: string, url: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`[MOCK] loadRemoteConstructor called for ${pluginId}`);
        const PluginConstructor = pluginMap[pluginId];
        if (!PluginConstructor) {
          return yield* new ModuleFederationError({
            pluginId,
            remoteUrl: url,
            cause: new Error(`Mock: Constructor for ${pluginId} not found in test plugin map`),
          });
        }
        yield* Effect.log(`[MOCK] loadRemoteConstructor succeeded for ${pluginId}`);
        return PluginConstructor;
      }),
  } as any);
