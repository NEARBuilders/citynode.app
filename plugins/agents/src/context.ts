import { z } from "zod";

export const ContextSchema = z.custom<{
  userId?: string;
  reqHeaders?: Headers;
}>();
