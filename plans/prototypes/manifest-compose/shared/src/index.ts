export {
  MOUNT_REGISTRY,
  MOUNTS,
  MOUNT_ALIASES,
  MOUNT_REGISTRY_VERSION,
  resolveMountSegment,
  type MountId,
  type MountDef,
} from "./mount-registry";
export { ManifestSchema, PluginManifestSchema, type Manifest, type PluginManifest, type RouteRecord } from "./manifest-schema";
export type {
  RouteConfigRef,
  RouteConfigModule,
  RouteOptionsBundle,
} from "./route-config";
export { App, Plugin, type AppDescriptor, type PluginRefInput, type RemoteSource, type ResolvedRemote, type CompositionResolver, type KnownPlugins } from "./app-descriptor";
