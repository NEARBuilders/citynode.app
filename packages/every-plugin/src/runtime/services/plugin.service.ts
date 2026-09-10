import { Effect, Exit, Layer, Scope } from "effect";
import type {
  AnyPlugin,
  AnyPluginConstructor,
  InitializedPlugin,
  PluginRegistry,
  SecretsConfig,
} from "../../types";
import { ModuleFederationService } from "./module-federation.service";
import { PluginLifecycleService } from "./plugin-lifecycle.service";
import {
  PluginLoaderService,
  PluginMapTag,
  PluginRegistryTag,
  RegistryService,
} from "./plugin-loader.service";
import { SecretsConfigTag, SecretsService } from "./secrets.service";

export class PluginService extends Effect.Service<PluginService>()("PluginService", {
  scoped: Effect.gen(function* () {
    const loader = yield* PluginLoaderService;
    const lifecycle = yield* PluginLifecycleService;

    return {
      loadPlugin: loader.loadPlugin,
      instantiatePlugin: loader.instantiatePlugin,
      initializePlugin: loader.initializePlugin,
      registerPlugin: (plugin: InitializedPlugin<AnyPlugin>) => lifecycle.register(plugin),
      shutdownPlugin: (plugin: InitializedPlugin<AnyPlugin>) =>
        plugin.plugin.shutdown().pipe(
          Effect.catchAllCause((cause) =>
            Effect.logWarning(`Failed to shutdown plugin ${plugin.plugin.id}`, cause),
          ),
          Effect.ensuring(
            Scope.close(plugin.scope, Exit.succeed(undefined)).pipe(
              Effect.catchAllCause((cause) =>
                Effect.logWarning(`Failed to close scope for plugin ${plugin.plugin.id}`, cause),
              ),
            ),
          ),
          Effect.ensuring(lifecycle.unregister(plugin)),
        ),
      cleanup: lifecycle.cleanup,
    };
  }),
}) {
  static Live = (
    registry: PluginRegistry,
    secrets: SecretsConfig,
    pluginMap: Record<string, AnyPluginConstructor> = {},
  ) => {
    const contextLayer = Layer.mergeAll(
      Layer.succeed(PluginRegistryTag, registry),
      Layer.succeed(SecretsConfigTag, secrets),
      Layer.succeed(PluginMapTag, pluginMap),
    );

    const servicesLayer = Layer.mergeAll(
      ModuleFederationService.Default,
      SecretsService.Default,
      RegistryService.Default,
      PluginLifecycleService.Default,
    ).pipe(Layer.provide(contextLayer));

    return PluginService.Default.pipe(
      Layer.provide(PluginLoaderService.Default),
      Layer.provide(servicesLayer),
    );
  };
}
