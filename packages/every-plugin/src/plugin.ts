import type { AnyContractRouter, AnySchema, InferSchemaOutput } from "@orpc/contract";
import { ORPCError } from "@orpc/contract";
import type { Context, Implementer, Router } from "@orpc/server";
import { implement, onError } from "@orpc/server";
import { Effect, type Scope } from "effect";
import { extractFromFiberFailure, formatORPCError } from "./runtime/errors";

type ContextOutput<T> = T extends AnySchema ? InferSchemaOutput<T> : Record<string, never>;

export type PluginConfigFor<
  V extends AnySchema,
  S extends AnySchema,
  TRequestContext extends AnySchema | undefined,
> = {
  variables: V;
  secrets: S;
  context: TRequestContext;
};

type PluginInitializeInput<V extends AnySchema, S extends AnySchema> = {
  variables: InferSchemaOutput<V>;
  secrets: InferSchemaOutput<S>;
};

type PluginDefinition<
  V extends AnySchema,
  S extends AnySchema,
  TContract extends AnyContractRouter,
  TRequestContext extends AnySchema | undefined,
  TDeps extends Context,
  P extends Record<string, unknown>,
> = {
  variables: V;
  secrets: S;
  contract: TContract;
  context?: TRequestContext;
  initialize?: (
    config: PluginInitializeInput<V, S>,
    plugins: P,
  ) => Effect.Effect<TDeps, Error, Scope.Scope>;
  createRouter: (
    deps: TDeps,
    builder: Implementer<TContract, ContextOutput<TRequestContext>, ContextOutput<TRequestContext>>,
  ) => Router<TContract, any>;
  shutdown?: (deps: TDeps) => Effect.Effect<void, Error, never>;
};

/**
 * Loaded plugin with static binding property
 */
export interface LoadedPluginWithBinding<
  TContract extends AnyContractRouter,
  TVariables extends AnySchema,
  TSecrets extends AnySchema,
  TRequestContext extends AnySchema | undefined,
  TDeps extends Context = Record<never, never>,
> {
  new (): Plugin<TContract, TVariables, TSecrets, TRequestContext, TDeps>;
  binding: {
    contract: TContract;
    variables: TVariables;
    secrets: TSecrets;
    context: TRequestContext;
  };
}

/**
 * Plugin interface
 */
export interface Plugin<
  TContract extends AnyContractRouter,
  TVariables extends AnySchema,
  TSecrets extends AnySchema,
  TRequestContext extends AnySchema | undefined,
  TDeps extends Context = Record<never, never>,
> {
  readonly id: string;
  readonly contract: TContract;
  readonly configSchema: PluginConfigFor<TVariables, TSecrets, TRequestContext>;

  initialize(
    config: PluginInitializeInput<TVariables, TSecrets>,
    plugins: Record<string, unknown>,
  ): Effect.Effect<TDeps, unknown, Scope.Scope>;

  shutdown(): Effect.Effect<void, never>;

  /**
   * Creates the strongly-typed oRPC router for this plugin.
   * The router's procedure types are inferred directly from the contract.
   * @param deps The initialized plugin dependencies
   * @returns A router with procedures matching the plugin's contract
   */
  createRouter(deps: TDeps): Router<TContract, any>;
}

export interface CreatePluginFn {
  <
    V extends AnySchema,
    S extends AnySchema,
    TContract extends AnyContractRouter,
    TRequestContext extends AnySchema | undefined = undefined,
    TDeps extends Context = Record<never, never>,
    P extends Record<string, unknown> = Record<string, never>,
  >(
    config: PluginDefinition<V, S, TContract, TRequestContext, TDeps, P>,
  ): LoadedPluginWithBinding<TContract, V, S, TRequestContext, TDeps>;

  withPlugins: <P extends Record<string, unknown>>() => CreatePluginWithPlugins<P>;
}

export const createPlugin: CreatePluginFn = function createPlugin<
  V extends AnySchema,
  S extends AnySchema,
  TContract extends AnyContractRouter,
  TRequestContext extends AnySchema | undefined = undefined,
  TDeps extends Context = Record<never, never>,
  P extends Record<string, unknown> = Record<string, never>,
>(config: PluginDefinition<V, S, TContract, TRequestContext, TDeps, P>) {
  const configSchema: PluginConfigFor<V, S, TRequestContext> = {
    variables: config.variables,
    secrets: config.secrets,
    context: config.context as TRequestContext,
  };

  class CreatedPlugin implements Plugin<TContract, V, S, TRequestContext, TDeps> {
    /** set during instantiation - registry key */
    id!: string;
    readonly contract = config.contract;
    readonly configSchema = configSchema;

    private _deps: TDeps | null = null;

    initialize(
      pluginConfig: PluginInitializeInput<V, S>,
      plugins: Record<string, unknown> = {},
    ): Effect.Effect<TDeps, unknown, Scope.Scope> {
      const init = config.initialize ?? (() => Effect.succeed({} as TDeps));

      return init(pluginConfig, plugins as P).pipe(
        Effect.tap((deps) =>
          Effect.sync(() => {
            this._deps = deps;
          }),
        ),
        Effect.map(() => this._deps as TDeps),
        Effect.mapError((error) => error as unknown),
      );
    }

    shutdown(): Effect.Effect<void, never> {
      const self = this;
      return Effect.gen(function* () {
        if (config.shutdown && self._deps) {
          yield* config.shutdown(self._deps).pipe(Effect.catchAll(() => Effect.void));
        }
      });
    }

    createRouter(deps: TDeps): Router<TContract, any> {
      const base = implement(config.contract).$context<ContextOutput<TRequestContext>>();
      const builder = (base as any).use(
        onError((error: unknown) => {
          const unwrapped = extractFromFiberFailure(error);

          if (unwrapped !== error && unwrapped instanceof ORPCError) {
            throw unwrapped;
          }

          formatORPCError(error);
        }),
      );
      const router = config.createRouter(deps, builder as any);
      return router as Router<TContract, any>;
    }
  }

  const PluginConstructor = CreatedPlugin as unknown as {
    new (): Plugin<TContract, V, S, TRequestContext, TDeps>;
    binding: {
      contract: TContract;
      variables: V;
      secrets: S;
      context: TRequestContext;
    };
  };

  PluginConstructor.binding = {
    contract: config.contract,
    variables: config.variables,
    secrets: config.secrets,
    context: config.context as TRequestContext,
  };

  return PluginConstructor as LoadedPluginWithBinding<TContract, V, S, TRequestContext, TDeps>;
};

export type CreatePluginWithPlugins<P extends Record<string, unknown>> = <
  V extends AnySchema,
  S extends AnySchema,
  TContract extends AnyContractRouter,
  TRequestContext extends AnySchema | undefined = undefined,
  TDeps extends Context = Record<never, never>,
>(
  config: PluginDefinition<V, S, TContract, TRequestContext, TDeps, P>,
) => LoadedPluginWithBinding<TContract, V, S, TRequestContext, TDeps>;

export function withPlugins<P extends Record<string, unknown>>(): CreatePluginWithPlugins<P> {
  return <
    V extends AnySchema,
    S extends AnySchema,
    TContract extends AnyContractRouter,
    TRequestContext extends AnySchema | undefined = undefined,
    TDeps extends Context = Record<never, never>,
  >(
    config: PluginDefinition<V, S, TContract, TRequestContext, TDeps, P>,
  ) => createPlugin<V, S, TContract, TRequestContext, TDeps, P>(config as any);
}

createPlugin.withPlugins = withPlugins;
