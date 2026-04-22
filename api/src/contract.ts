import { BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const contract = oc.router({
  ping: oc.route({ method: "GET", path: "/ping" }).output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.iso.datetime(),
    }),
  ),

  reloadConfig: oc
    .route({
      method: "POST",
      path: "/_reload-config",
      summary: "Reload runtime config",
      description:
        "Re-fetches config from FastKV and signals scope rebuild. Currently returns pending status — a full host restart is needed to pick up new config.",
      tags: ["System"],
    })
    .output(
      z.object({
        status: z.enum(["pending", "ok"]),
        note: z.string(),
      }),
    ),

  authHealth: oc
    .route({ method: "GET", path: "/auth/health" })
    .output(
      z.object({
        status: z.string(),
        emailConfigured: z.boolean(),
        smsConfigured: z.boolean(),
      }),
    )
    .errors({ UNAUTHORIZED }),

  publicError: oc
    .route({ method: "GET", path: "/public/error" })
    .output(z.object({ message: z.string() }))
    .errors({ UNAUTHORIZED, BAD_REQUEST }),

  protectedError: oc
    .route({ method: "GET", path: "/protected/error" })
    .output(z.object({ message: z.string(), accountId: z.string() }))
    .errors({ NOT_FOUND, UNAUTHORIZED }),

  pluginDemo: oc
    .route({
      method: "GET",
      path: "/demo/plugins",
      summary: "Demo: variable + plugin client flow",
      description:
        "Returns the API variable from bos.config.json, calls the registry plugin via pluginsClient, and lists available plugins. No auth required.",
      tags: ["Demo"],
    })
    .output(
      z.object({
        apiVariable: z.string(),
        registryStatus: z.object({
          discoveredApps: z.number().int().nonnegative(),
          metadataContractId: z.string(),
          metadataFastKvUrl: z.string().url(),
          relayEnabled: z.boolean(),
          relayAccountId: z.string().nullable(),
          timestamp: z.string(),
        }),
        availablePlugins: z.array(z.string()),
      }),
    ),
});

export type ContractType = typeof contract;
