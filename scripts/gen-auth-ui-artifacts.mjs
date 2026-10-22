// Regenerates the standalone auth-UI workspace's composed artifacts:
// manifest.gen.json + routeConfig.gen.ts + routeTree.gen.ts.
//
// Why this exists: `bos types gen`'s artifact targets cover the root ui and
// the plugins{} entries, but NOT an auth attachment's local ui (the auth.ui
// slot has no artifact path yet — upstream note filed). A fresh checkout (or
// CI) therefore has no route tree for plugins/auth-ui and its typecheck fails
// on every route path. Wired into the root `typecheck` script so the gate is
// hermetic; safe to drop once upstream emits these artifacts for auth.ui.

import { join } from "node:path";
import { generateUiManifest } from "every-plugin/ui/manifest-generator";

const root = new URL("..", import.meta.url).pathname;
await generateUiManifest({
  workspaceRoot: join(root, "plugins/auth-ui"),
  pluginName: "auth",
  emitRouteTree: true,
});
console.log("[gen-auth-ui] regenerated plugins/auth-ui artifacts");
