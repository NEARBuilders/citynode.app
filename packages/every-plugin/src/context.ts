import { z } from "./zod";

export const RequestContextSchema = z.object({
  userId: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      role: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  nearAccountId: z.string().optional(),
  organizationId: z.string().optional(),
  organizationRole: z.string().optional(),
  organizations: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        name: z.string().optional(),
        slug: z.string().optional(),
      }),
    )
    .optional(),
});

export type RequestContext = z.infer<typeof RequestContextSchema>;
