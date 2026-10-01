import type { Compiler, RspackPluginInstance } from "@rspack/core";
import { BuildEntryReportSchema, planHashedEntry } from "../artifact-names";

/**
 * The rspack twin of the ui build's hash-artifacts pass: the container entry
 * is hashed by the build's filename template (`remoteEntry.[contenthash].js`);
 * this plugin emits the byte-identical legacy fixed-name alias (consumers
 * still append `remoteEntry.js`) and `build-report.json` for the deploy leg —
 * in-compilation, so watch-mode cleans can't open a window where the alias
 * 404s (mirrors the `output.clean` rationale on the build plugin).
 */
export class HashEntryAliasPlugin implements RspackPluginInstance {
  name = "HashEntryAliasPlugin";

  constructor(private entryBase = "remoteEntry") {}

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap(this.name, (compilation) => {
      const webpack = (compiler as Compiler & { webpack?: any }).webpack;
      const rawSource = webpack?.sources?.RawSource;
      const stage = webpack?.Compilation?.PROCESS_ASSETS_STAGE_ADDITIONS ?? 1000;

      compilation.hooks.processAssets.tap({ name: this.name, stage }, (assets) => {
        const entry = planHashedEntry(Object.keys(assets), this.entryBase);
        if (!entry || !rawSource) return;

        const entrySource = assets[entry.hashed];
        if (!entrySource) return;
        compilation.emitAsset(entry.alias, new rawSource(entrySource.source()));

        const report = BuildEntryReportSchema.parse({ entry: entry.hashed });
        compilation.emitAsset(
          "build-report.json",
          new rawSource(`${JSON.stringify(report, null, 2)}\n`),
        );
      });
    });
  }
}
