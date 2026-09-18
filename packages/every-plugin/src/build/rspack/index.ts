export {
  getMajorMinorVersion,
  getPluginSharedDependencies,
  getPluginSharedDependenciesVersionRange,
  isEffectCriticalSharedDep,
  type SharedDependencies,
  type SharedDependencyConfig,
} from "../shared-deps";
export { FixMfDataUriPlugin } from "./fix-mf-data-uri-plugin";
export {
  type AdditionalExport,
  EmitPluginManifest,
  EveryPluginBuild,
  type EveryPluginBuildOptions,
  type PluginManifestEmitterOptions,
} from "./plugin";
