/**
 * Minimal shape-of-028 descriptor slice (ADR 0005 / plan 028) — the
 * composition-resolver slice only, driving the prototype host. Deliberately
 * OUT: account/domain, FastKV extends chains, stage, resources/bindings,
 * auth/api fields — those belong to plan 028's full surface.
 *
 * The descriptor is pure data: `App({...})` returns a typed object and the
 * host consumes it. `Plugin("bogus")` is a compile error via KnownPlugins
 * declaration merging (plan 028's pattern).
 */

export type RemoteSource =
  | { kind: "local"; /** path relative to the prototype root */ path: string }
  | { kind: "remote"; mfName: string; /** base URL of the deployed remote */ url: string };

export interface ResolvedRemote {
  pluginName: string;
  source: RemoteSource;
  /** Resolved when kind === "remote": entry URL of the server bundle. */
  ssrEntryUrl?: string;
}

export interface AppDescriptor {
  name: string;
  plugins: Record<string, { pluginName: string; source: RemoteSource }>;
}

/**
 * The host consumes a resolver function that turns a descriptor into
 * per-plugin manifest + route-config loaders. Dev resolves from disk
 * (pathToFileURL dynamic import); production resolves via loadRemote on the
 * shared MF instance. Identical construction code downstream (gate 7).
 */
export interface CompositionResolver {
  resolveManifest(pluginName: string): Promise<unknown>;
  resolveRouteConfig(pluginName: string): Promise<unknown>;
}

// In production (plan 028) `KnownPlugins` is declaration-merged from
// generated `.bos/plugin-types.d.ts`. The prototype declares the two
// prototype plugins here — the shape is what matters: `Plugin("bogus")`
// must not compile.
export interface KnownPlugins {
  auth: "auth";
  landing: "landing";
}

export function App(input: {
  name: string;
  extends?: string;
  plugins: Record<string, PluginRefInput>;
}): AppDescriptor {
  const plugins: AppDescriptor["plugins"] = {};
  for (const [key, ref] of Object.entries(input.plugins)) {
    plugins[key] = { pluginName: ref.name, source: ref.source };
  }
  return { name: input.name, plugins };
}

export interface PluginRefInput {
  name: string;
  source: RemoteSource;
}

export function Plugin<K extends keyof KnownPlugins & string>(
  name: K,
): { local: (path: string) => PluginRefInput; remote: (mfName: string, url: string) => PluginRefInput } {
  return {
    local: (path: string) => ({ name, source: { kind: "local", path } }),
    remote: (mfName: string, url: string) => ({
      name,
      source: { kind: "remote", mfName, url },
    }),
  };
}
