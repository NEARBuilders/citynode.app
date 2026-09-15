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
export const discoveryNodeSchema = profileSchema.safeExtend({
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(["country", "state", "city"]),
});
export const discoveryContract = {
  listDiscovery: oc
    .input(
      z.object({ query: z.string().max(120).optional(), region: z.string().max(120).optional() }),
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
