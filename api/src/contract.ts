import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const ThingSchema = z.object({
  thingId: z.string(),
  pluginId: z.string(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Thing = z.infer<typeof ThingSchema>;

export const ThingEventSchema = z.object({
  pluginId: z.string(),
  thingId: z.string(),
  action: z.string(),
  type: z.string(),
  timestamp: z.iso.datetime(),
  userId: z.string().optional(),
  totalCount: z.number().int().nonnegative().optional(),
});

export type ThingEvent = z.infer<typeof ThingEventSchema>;

export const contract = oc.router({
  ping: oc.route({ method: "GET", path: "/ping" }).output(
    z.object({
      status: z.literal("ok"),
      timestamp: z.iso.datetime(),
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

  createThing: oc
    .route({ method: "POST", path: "/things" })
    .input(
      z.object({
        pluginId: z.string().min(1).max(100),
        payload: z.unknown(),
      }),
    )
    .output(ThingSchema)
    .errors({ UNAUTHORIZED, BAD_REQUEST }),

  getThing: oc
    .route({ method: "GET", path: "/things/{thingId}" })
    .input(z.object({ thingId: z.string() }))
    .output(ThingSchema)
    .errors({ NOT_FOUND }),

  upvoteThing: oc
    .route({ method: "POST", path: "/upvotes" })
    .input(z.object({ thingId: z.string() }))
    .output(
      z.object({
        thingId: z.string(),
        userId: z.string(),
        totalCount: z.number().int().nonnegative(),
      }),
    )
    .errors({ UNAUTHORIZED, BAD_REQUEST, NOT_FOUND }),

  downvoteThing: oc
    .route({ method: "DELETE", path: "/upvotes/{thingId}" })
    .input(z.object({ thingId: z.string() }))
    .output(
      z.object({
        thingId: z.string(),
        totalCount: z.number().int().nonnegative(),
      }),
    )
    .errors({ UNAUTHORIZED, NOT_FOUND }),

  getUpvoteCount: oc
    .route({ method: "GET", path: "/upvotes/{thingId}/count" })
    .input(z.object({ thingId: z.string() }))
    .output(
      z.object({
        thingId: z.string(),
        totalCount: z.number().int().nonnegative(),
      }),
    )
    .errors({ NOT_FOUND }),

  getUserVote: oc
    .route({ method: "GET", path: "/upvotes/{thingId}/me" })
    .input(z.object({ thingId: z.string() }))
    .output(
      z.object({
        thingId: z.string(),
        hasUpvote: z.boolean(),
      }),
    )
    .errors({ UNAUTHORIZED, NOT_FOUND }),

  getUserVotes: oc
    .route({ method: "POST", path: "/upvotes/me/batch" })
    .input(z.object({ thingIds: z.array(z.string()).min(1).max(100) }))
    .output(
      z.record(
        z.string(),
        z.object({
          thingId: z.string(),
          hasUpvote: z.boolean(),
        }),
      ),
    )
    .errors({ UNAUTHORIZED }),

  getUpvoteCounts: oc
    .route({ method: "POST", path: "/upvotes/counts" })
    .input(z.object({ thingIds: z.array(z.string()).min(1).max(100) }))
    .output(
      z.record(
        z.string(),
        z.object({
          thingId: z.string(),
          totalCount: z.number().int().nonnegative(),
        }),
      ),
    ),

  getUpvoteFeed: oc
    .route({ method: "GET", path: "/upvotes/feed" })
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(
          ThingEventSchema,
        ),
        meta: z.object({
          total: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursor: z.string().nullable(),
        }),
      }),
    ),

  deleteThing: oc
    .route({ method: "DELETE", path: "/things/{thingId}" })
    .input(z.object({ thingId: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .errors({ UNAUTHORIZED, NOT_FOUND, FORBIDDEN }),

  subscribeThings: oc
    .route({ method: "GET", path: "/things/stream" })
    .input(
      z.object({
        thingId: z.string().optional(),
        pluginId: z.string().optional(),
        type: z.string().optional(),
        action: z.string().optional(),
      }),
    )
    .output(eventIterator(ThingEventSchema)),
});

export type ContractType = typeof contract;
