import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_COMMUNITIES, DEMO_PERSONAS } from "../tests/regression/fixtures/demo/demo-data.ts";
import { seedDemo } from "../tests/regression/lib/demo-seed.ts";
import { readDotEnv } from "../tests/regression/lib/regression-env.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = readDotEnv(root);
const setting = (key: string) => process.env[key] || fileEnv[key] || undefined;
const flag = (name: string) => {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

function requireUrl(key: string) {
  const url = setting(key);
  if (!url || url === "pglite::memory:") {
    throw new Error(
      `${key} is not set in .env. The demo seed writes to the same database the app uses: set it to a pglite:<absolute data dir> or postgres:// URL, boot the app once so migrations run, then seed.`,
    );
  }
  if (!url.startsWith("pglite:")) {
    const host = new URL(url).hostname.toLowerCase();
    if (!LOCAL_HOSTS.has(host) && !process.argv.includes("--allow-remote")) {
      throw new Error(`${key} points at ${host}, not localhost. Refusing to seed demo data there.`);
    }
  }
  return url;
}

const baseUrl = setting("BASE_URL") ?? "http://localhost:3000";
const urls = {
  api: requireUrl("API_DATABASE_URL"),
  auth: requireUrl("AUTH_DATABASE_URL"),
  proposals: setting("PROPOSALS_DATABASE_URL") ? requireUrl("PROPOSALS_DATABASE_URL") : undefined,
};

if (Object.values(urls).some((url) => url?.startsWith("pglite:"))) {
  const running = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
    .then(() => true)
    .catch(() => false);
  if (running) {
    throw new Error(
      `The app is running at ${baseUrl}. PGlite allows one process per data dir: stop the app, seed, then start it again.`,
    );
  }
}

const secret = setting("BETTER_AUTH_SECRET");
if (!secret) throw new Error("BETTER_AUTH_SECRET is not set in .env");

const seed = await seedDemo({ databaseUrls: urls, secret, baseUrl, today: flag("--today") });

const outFile = path.join(root, ".bos", "demo", "seed.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(seed, null, 2)}\n`);

console.log(
  `[seed:demo] seeded ${Object.keys(DEMO_COMMUNITIES).length} communities as of ${seed.today}`,
);
console.log(`[seed:demo] wrote ${path.relative(root, outFile)}`);
console.table(
  Object.entries(DEMO_PERSONAS).map(([persona, person]) => ({
    persona,
    name: seed.people[person].name,
    communities: seed.people[person].communities.join(", ") || "-",
  })),
);
console.log(
  "[seed:demo] sign in as a persona: pnpm run seed:demo:login, then open the link it prints",
);
