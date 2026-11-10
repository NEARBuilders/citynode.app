import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import {
  nodes as nodesTable,
  placeAliases as placeAliasesTable,
  places as placesTable,
  tenants as tenantsTable,
} from "@/db/schema";
import { adoptCatalogPlace } from "@/services/discovery";
import { createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

interface Ctx {
  db: Database;
  nodeId: string;
  countryId: string;
  aliasValue: string;
  nodePlace: () => Promise<string | null>;
}

function run<A>(body: (ctx: Ctx) => Promise<A>): Promise<A> {
  const temp = createTempDb("api-discovery-place-link-");
  cleanup = temp.cleanup;
  const layer = Layer.mergeAll(DatabaseLive(temp.url)).pipe(
    Layer.provide(Layer.succeed(PluginIdTag, "api")),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DatabaseTag;
      const [tenant] = yield* Effect.tryPromise(() =>
        db
          .insert(tenantsTable)
          .values({ accountId: `link-${crypto.randomUUID()}.near`, name: "Link Tenant" })
          .returning(),
      );
      const [country] = yield* Effect.tryPromise(() =>
        db
          .insert(placesTable)
          .values({ slug: "india", name: "India", label: "country" })
          .returning(),
      );
      const aliasValue = "3567960";
      yield* Effect.tryPromise(() =>
        db
          .insert(placeAliasesTable)
          .values({ value: aliasValue, kind: "geonames", placeId: country!.id }),
      );
      const [node] = yield* Effect.tryPromise(() =>
        db
          .insert(nodesTable)
          .values({
            slug: `community-${crypto.randomUUID()}`,
            name: "Community",
            tenantId: tenant!.id,
            parentId: null,
          })
          .returning(),
      );
      const nodePlace = async (): Promise<string | null> => {
        const [row] = await db
          .select({ placeId: nodesTable.placeId })
          .from(nodesTable)
          .where(eq(nodesTable.id, node!.id));
        return row?.placeId ?? null;
      };
      return yield* Effect.tryPromise(() =>
        body({ db, nodeId: node!.id, countryId: country!.id, aliasValue, nodePlace }),
      );
    }).pipe(Effect.provide(layer)),
  );
}

describe("adoptCatalogPlace", () => {
  it("links an unlinked node by the place slug of its location", () =>
    run(async ({ db, nodeId, countryId, nodePlace }) => {
      await adoptCatalogPlace(db, { id: nodeId, placeId: null }, "India");
      expect(await nodePlace()).toBe(countryId);
    }));

  it("links by alias values such as the geonames id", () =>
    run(async ({ db, nodeId, countryId, aliasValue, nodePlace }) => {
      await adoptCatalogPlace(db, { id: nodeId, placeId: null }, aliasValue);
      expect(await nodePlace()).toBe(countryId);
    }));

  it("leaves unknown locations and already-linked nodes alone", () =>
    run(async ({ db, nodeId, countryId, nodePlace }) => {
      await adoptCatalogPlace(db, { id: nodeId, placeId: null }, "Atlantis");
      expect(await nodePlace()).toBeNull();

      await adoptCatalogPlace(db, { id: nodeId, placeId: null }, "India");
      expect(await nodePlace()).toBe(countryId);

      await adoptCatalogPlace(db, { id: nodeId, placeId: countryId }, "Pakistan");
      expect(await nodePlace()).toBe(countryId);
    }));
});
