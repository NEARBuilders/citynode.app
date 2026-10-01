import { configureDatabase } from "@near-intents-agent-api/agents-core";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import pg from "pg";
import type { DatabaseDriver } from "../../src/db";
import { DatabaseLive, DatabaseTag } from "../../src/db/layer";

const adminUrl = process.env.AGENTS_RACE_DATABASE_URL;

export function raceDatabaseUrl(name: string) {
  return adminUrl?.replace(/\/[^/]+$/, `/${name}`) ?? "";
}

export function raceSuitesEnabled() {
  return Boolean(adminUrl);
}

export async function resetRaceDatabase(name: string) {
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
}

export function dropRaceDatabase(name: string) {
  return resetRaceDatabase(name);
}

export function withDatabase(
  url: string,
  run: (driver: DatabaseDriver) => Promise<void>,
): Promise<void> {
  const layer = DatabaseLive(url).pipe(Layer.provide(Layer.succeed(PluginIdTag, "agents")));
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const context = yield* Layer.buildWithScope(layer, scope);
        const driver = Context.get(context, DatabaseTag);
        configureDatabase(driver);
        yield* Effect.tryPromise(() => run(driver));
      }),
    ),
  );
}
