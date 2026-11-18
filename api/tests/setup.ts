import "./test-env";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { RPCHandler } from "@orpc/server/node";
import { type Context, Effect } from "effect";
import { createPluginRuntime } from "every-plugin";
import type { contract } from "@/contract";
import Plugin, { ApiServices } from "@/index";
import type { NodeRecord } from "@/services/nodes";
import type { PlaceRecord } from "@/services/places";
import pluginDevConfig from "../plugin.dev";

const TEST_PLUGIN_ID = pluginDevConfig.pluginId;
const TEST_CONFIG = pluginDevConfig.config;

const TEST_REGISTRY = {
  [TEST_PLUGIN_ID]: {
    module: Plugin,
    description: "API integration test runtime",
  },
} as const;

export const runtime = createPluginRuntime({
  registry: TEST_REGISTRY,
  secrets: {},
});

let server: ReturnType<typeof createServer> | null = null;
let baseUrl = "";
let port = 0;
let effectContext: Context.Context<ApiServices> | undefined;

export async function getPluginClient(
  context?: Record<string, unknown>,
  plugins?: Record<string, () => unknown>,
) {
  if (!server) {
    const { router, initialized } = await runtime.usePlugin(TEST_PLUGIN_ID, TEST_CONFIG, plugins);
    const rpcHandler = new RPCHandler(router);
    const apiHandler = new OpenAPIHandler(router);
    effectContext = initialized.effectContext as Context.Context<ApiServices>;
    const requestEffectContext = initialized.effectContext;

    server = createServer(async (req, res) => {
      const url = new URL(req.url!, baseUrl);

      if (url.pathname.startsWith("/rpc")) {
        // Initialize empty context for each request to prevent closure capture
        let requestContext = {};

        // Allow overriding context via headers for flexibility
        if (req.headers["x-test-context"]) {
          requestContext = JSON.parse(req.headers["x-test-context"] as string);
        }

        const result = await rpcHandler.handle(req, res, {
          prefix: "/rpc",
          context: { ...requestContext, "effect/context": requestEffectContext },
        });
        if (result.matched) return;
      }

      if (url.pathname.startsWith("/api/")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const reqHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers))
          if (typeof value === "string") reqHeaders.set(key, value);
        const replay = Object.assign(Readable.from([Buffer.from(rawBody)]), {
          method: req.method,
          url: req.url,
          headers: req.headers,
        });
        const result = await apiHandler.handle(replay as unknown as typeof req, res, {
          prefix: "/api",
          context: {
            reqHeaders,
            getRawBody: async () => rawBody,
            "effect/context": requestEffectContext,
          },
        });
        if (result.matched) return;
      }

      res.statusCode = 404;
      res.end("Route not found");
    });

    const assignedPort = await new Promise<number>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", () => {
        const address = server?.address();
        if (address && typeof address !== "string") {
          resolve(address.port);
          return;
        }
        server?.close();
        reject(new Error("Failed to allocate test port"));
      });
      server?.on("error", reject);
    });
    port = assignedPort;
    baseUrl = `http://localhost:${port}`;
  }

  const link = new RPCLink({
    origin: baseUrl,
    url: "/rpc",
    fetch: globalThis.fetch,
    headers: context
      ? {
          "x-test-context": JSON.stringify(context),
        }
      : {},
  });

  const client: ContractRouterClient<typeof contract> = createORPCClient(link);
  return client;
}

export function getPluginBaseUrl() {
  return baseUrl;
}

export async function activateTestNode(input: {
  slug: string;
  name?: string;
  kind?: string;
  tenantId?: string | null;
  orgId?: string;
  parentPlaceId?: string | null;
  label?: string | null;
}): Promise<{ node: NodeRecord; place: PlaceRecord }> {
  await getPluginClient();
  if (!effectContext) {
    throw new Error("Plugin services are not initialized");
  }
  const name = input.name ?? input.slug;
  return Effect.runPromise(
    Effect.gen(function* () {
      const services = yield* ApiServices;
      const place = yield* services.places.create({
        slug: input.slug,
        name,
        parentId: input.parentPlaceId ?? null,
        label: input.label ?? null,
      });
      const { node } = yield* services.nodes.activateForPlace({
        placeId: place.id,
        orgId: input.orgId ?? `org-${input.slug}`,
        activatedBy: "test-activator",
        joinCodeId: `join-${input.slug}`,
        tenantId: input.tenantId,
        kind: input.kind,
      });
      return { node, place };
    }).pipe(Effect.provide(effectContext)),
  );
}

export function authedContext(userId = "user-1", userRole?: string): Record<string, unknown> {
  const user: Record<string, unknown> = {
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
  };
  if (userRole) user.role = userRole;
  return { userId, user };
}

export function orgContext(
  userId = "user-1",
  activeOrganizationId = "org-1",
  role = "owner",
  userRole?: string,
  primaryAccountId?: string,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    ...authedContext(userId, userRole),
    organization: {
      activeOrganizationId,
      organization: {
        id: activeOrganizationId,
        slug: activeOrganizationId,
        metadata: null,
      },
      member: {
        id: "member-1",
        role,
      },
    },
  };
  if (primaryAccountId) {
    context.near = { primaryAccountId };
  }
  return context;
}

export async function teardown() {
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = null;
  }
  effectContext = undefined;
  await runtime.shutdown();
}

export function daoContext(
  userId: string,
  activeOrganizationId: string,
  primaryAccountId: string,
  organizationRole: "owner" | "admin" | "member" = "owner",
): Record<string, unknown> {
  return orgContext(userId, activeOrganizationId, organizationRole, "admin", primaryAccountId);
}

export function getTestRpcUrl() {
  return baseUrl;
}
