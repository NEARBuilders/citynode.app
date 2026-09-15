/**
 * Effect context bridge — converts Effect errors to ORPCError for handler use.
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import { flattenError, runEffect } from "every-plugin";
import { z } from "every-plugin/zod";
import type { AuthContext } from "./auth";

export const ContextSchema = z.custom<AuthContext>();

export type Context = AuthContext;

export { flattenError, runEffect };
