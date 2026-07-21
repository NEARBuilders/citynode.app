import { Effect, Exit, Ref, Scope } from "effect";
import type { AnyPlugin, InitializedPlugin } from "../../types";
import { toPluginRuntimeError } from "../errors";

export class PluginLifecycleService extends Effect.Service<PluginLifecycleService>()(
  "PluginLifecycleService",
  {
    effect: Effect.gen(function* () {
      const activePlugins = yield* Ref.make(new Set<InitializedPlugin<AnyPlugin>>());

      return {
        register: <T extends AnyPlugin>(plugin: InitializedPlugin<T>) =>
          Ref.update(activePlugins, (plugins) =>
            new Set(plugins).add(plugin as InitializedPlugin<AnyPlugin>),
          ),

        unregister: (plugin: InitializedPlugin<AnyPlugin>) =>
          Ref.update(activePlugins, (plugins) => {
            const newSet = new Set(plugins);
            newSet.delete(plugin);
            return newSet;
          }),

        shutdown: (plugin: InitializedPlugin<AnyPlugin>) =>
          Effect.gen(function* () {
            // Remove from active plugins
            yield* Ref.update(activePlugins, (plugins) => {
              const newSet = new Set(plugins);
              newSet.delete(plugin);
              return newSet;
            });

            // Shutdown the plugin
            yield* plugin.plugin
              .shutdown()
              .pipe(
                Effect.mapError((error) =>
                  toPluginRuntimeError(
                    error,
                    plugin.plugin.id,
                    undefined,
                    "shutdown-plugin",
                    false,
                  ),
                ),
              );
          }),

        cleanup: () =>
          Effect.gen(function* () {
            const plugins = yield* Ref.get(activePlugins);
            if (typeof process !== "undefined" && process.env?.EVERY_PLUGIN_DEBUG_SCOPES === "1") {
              yield* Effect.logWarning(
                `[PluginLifecycle] cleaning up ${plugins.size} active plugin(s)`,
              );
            }

            yield* Effect.forEach(
              plugins,
              (plugin) =>
                Effect.gen(function* () {
                  yield* plugin.plugin
                    .shutdown()
                    .pipe(
                      Effect.catchAll((error) =>
                        Effect.logWarning(`Failed to shutdown plugin ${plugin.plugin.id}`, error),
                      ),
                    );
                  yield* Scope.close(plugin.scope, Exit.succeed(undefined)).pipe(
                    Effect.catchAll((error) =>
                      Effect.logWarning(
                        `Failed to close scope for plugin ${plugin.plugin.id}`,
                        error,
                      ),
                    ),
                  );
                }),
              { concurrency: "unbounded" },
            );

            yield* Ref.set(activePlugins, new Set());
          }).pipe(Effect.catchAll((error) => Effect.logWarning("Plugin cleanup failed", error))),
      };
    }),
  },
) {}
