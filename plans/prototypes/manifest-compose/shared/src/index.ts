export {
  App,
  type AppInput,
  type CompositionDigestInput,
  digestOf,
  type KnownPlugins,
  Plugin,
  type PluginRef,
  type PluginRefInput,
  type RemoteSource,
  type ResolvedApp,
  resolveApp,
} from "./app-descriptor";
export {
  type Manifest,
  ManifestSchema,
  type PluginManifest,
  PluginManifestSchema,
  type RouteRecord,
} from "./manifest-schema";
export {
  MOUNT_ALIASES,
  MOUNT_REGISTRY,
  MOUNT_REGISTRY_VERSION,
  MOUNTS,
  type MountDef,
  type MountId,
  resolveMountSegment,
} from "./mount-registry";
export type {
  RouteConfigModule,
  RouteConfigRef,
  RouteOptionsBundle,
} from "./route-config";
