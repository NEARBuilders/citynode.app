/**
 * Cross-check the generated runtime map against the REAL composition engine.
 *
 * Runs `constructTree` (the host's runtime composition) over the same
 * manifests and compares the resulting full-path set to
 * `.bos/generated/runtime-map.json`. The generator is a static model of that
 * engine; this is the proof they agree.
 *
 * Network: fetches each remote source's manifest. Run after
 * `pnpm run types:gen` (or `pnpm run dev`) so the map and core manifest exist.
 *
 *   pnpm run verify:runtime-map
 */
import { readFileSync } from "node:fs";
import { constructTree } from "every-plugin/ui/manifest";

const joinPath = (a, b) => {
  const left = a && a !== "/" ? a.replace(/\/+$/, "") : "";
  const right = b && b !== "/" ? b.replace(/^\/+/, "") : "";
  if (!left) return right ? `/${right}` : "/";
  if (!right) return left;
  return `${left}/${right}`;
};

const core = JSON.parse(readFileSync("ui/src/manifest.gen.json", "utf8"));
const auth = await fetch(
  "https://cdn.everything.dev/bundles/dev.everything.near/everything.dev/auth-ui/manifest.gen.json",
  { signal: AbortSignal.timeout(15000) },
).then((r) => r.json());

const loaders = (manifest) =>
  Object.fromEntries(manifest.routes.map((route) => [route.id, async () => ({})]));

const tree = await constructTree({
  name: "validate",
  plugins: [
    { key: "ui", mfName: "ui" },
    { key: "auth", mfName: "auth" },
  ],
  resolve: async (ref) => {
    const manifest = ref.key === "ui" ? core : auth;
    return { key: ref.key, manifest, routeConfig: { routeConfigLoaders: loaders(manifest) } };
  },
});

const paths = new Set();
const walk = (route, parentPath) => {
  const segment = route.options?.path;
  const fullPath = segment === undefined ? parentPath : joinPath(parentPath, segment);
  if (segment !== undefined) paths.add(fullPath);
  for (const child of route.children ?? []) walk(child, fullPath);
};
walk(tree.routeTree, "");

const map = JSON.parse(readFileSync(".bos/generated/runtime-map.json", "utf8"));
const mapped = new Set(map.routes.map((route) => route.fullPath));

const missing = [...paths].filter((path) => !mapped.has(path));
const extra = [...mapped].filter((path) => !paths.has(path));

console.log("constructTree paths:", paths.size, "| map paths:", mapped.size);
console.log("missing from map:", missing);
console.log("extra in map:", extra);
console.log("mountCounts:", tree.mountCounts);
process.exit(missing.length === 0 && extra.length === 0 ? 0 : 1);
