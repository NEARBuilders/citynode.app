import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNAUTHORIZED } from "every-plugin/errors";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const webUrl = z
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP(S) URL");
export const profileSchema = z
  .object({
    nodeId: z.uuid(),
    summary: z.string().trim().max(1000),
    location: z.string().trim().max(120),
    region: z.string().trim().max(120),
    latitude: z.number().min(-85).max(85).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    channels: z.array(z.object({ label: z.string().trim().min(1).max(80), url: webUrl })).max(10),
    published: z.boolean(),
  })
  .refine(
    (p) => (p.latitude === null) === (p.longitude === null),
    "Provide both coordinates or neither",
  )
  .refine((p) => p.latitude === null || p.location.length > 0, "Confirm the location label");
export type DiscoveryProfile = z.infer<typeof profileSchema>;
export const activitySchema = z.object({
  id: z.uuid(),
  ownerNodeId: z.uuid(),
  nodeIds: z.array(z.uuid()).min(1).max(30),
  kind: z.enum(["event", "social"]),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2000),
  url: webUrl,
  source: z.string().trim().min(1).max(120),
  publishedAt: z.iso.datetime(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid timezone"),
  venue: z.string().trim().max(240),
  status: z.enum(["draft", "published", "cancelled"]),
});
export type DiscoveryActivity = z.infer<typeof activitySchema>;
export const activityInput = activitySchema
  .omit({ id: true })
  .extend({ id: z.uuid().optional() })
  .superRefine((v, ctx) => {
    if (!v.nodeIds.includes(v.ownerNodeId))
      ctx.addIssue({ code: "custom", message: "Include the owner node", path: ["nodeIds"] });
    if (v.kind === "event" && (!v.startsAt || !v.endsAt || v.endsAt < v.startsAt || !v.venue))
      ctx.addIssue({
        code: "custom",
        message: "Events need a venue and valid start/end times",
        path: ["startsAt"],
      });
    if (v.kind === "social" && (v.nodeIds.length !== 1 || v.status === "cancelled"))
      ctx.addIssue({
        code: "custom",
        message: "Social Updates belong to one node and cannot be cancelled",
        path: ["kind"],
      });
  });
export const discoveryNodeSchema = profileSchema.safeExtend({
  active: z.boolean(),
  activityReason: z.string(),
  upcoming: z.boolean(),
  events: z.array(activitySchema),
  updates: z.array(activitySchema),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(["country", "state", "city"]),
});
export const discoveryContract = {
  saveDiscoveryActivity: oc
    .input(activityInput)
    .output(activitySchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),
  listDiscoveryActivities: oc
    .input(z.object({ nodeId: z.uuid() }))
    .output(z.array(activitySchema))
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),
  getDiscoveryActivity: oc.input(z.object({ id: z.uuid() })).output(activitySchema.nullable()),
  listDiscovery: oc
    .input(
      z.object({
        query: z.string().max(120).optional(),
        region: z.string().max(120).optional(),
        active: z.boolean().optional(),
        upcoming: z.boolean().optional(),
      }),
    )
    .output(z.array(discoveryNodeSchema)),
  getDiscoveryNode: oc.input(z.object({ nodeId: z.uuid() })).output(discoveryNodeSchema.nullable()),
  getDiscoveryProfile: oc
    .input(z.object({ nodeId: z.uuid() }))
    .output(profileSchema.nullable())
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND }),
  saveDiscoveryProfile: oc
    .input(profileSchema)
    .output(profileSchema)
    .errors({ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST }),
};
