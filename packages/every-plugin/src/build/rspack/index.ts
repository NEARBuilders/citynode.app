export {
  EFFECT_CRITICAL_SHARED_DEPS,
  type EffectCriticalSharedDepName,
  getInstalledSharedDepVersion,
  getMajorMinorVersion,
  getPluginSharedDependencies,
  getPluginSharedDependenciesVersionRange,
  isEffectCriticalSharedDep,
  type SharedDependencies,
  type SharedDependencyConfig,
  strictShareConfigFor,
} from "../shared-deps";
export { FixMfDataUriPlugin } from "./fix-mf-data-uri-plugin";
export {
  EmitPluginManifest,
  EveryPluginDevServer,
  type EveryPluginOptions,
  type PluginManifestEmitterOptions,
} from "./plugin";
