import type { WithEffectContext } from "@orpc/experimental-effect";
import type { Implementer } from "@orpc/server";
import { Context } from "effect";
import type { bosContract } from "../contract";
import type { DatabaseBindingsService, DrizzleKitService } from "../db";
import type { DevSessionData, StartSummary } from "../dev-program";
import type { ResolutionSession } from "../resolution/session";

export type BosDeps = {
  session: ResolutionSession | null;
  databaseBindings: DatabaseBindingsService;
  drizzleKit: DrizzleKitService;
};

export class BosDepsTag extends Context.Service<BosDepsTag, BosDeps>()("bos/BosDeps") {}

export type BosBuilder = Implementer<
  typeof bosContract,
  Record<string, never> & WithEffectContext<any>
>;

let pendingSession: DevSessionData | null = null;
let pendingStartSummary: StartSummary | null = null;

export function setPendingDevSession(session: DevSessionData, summary?: StartSummary): void {
  pendingSession = session;
  pendingStartSummary = summary ?? null;
}

export function consumeDevSession(): (DevSessionData & { summary?: StartSummary }) | null {
  const data = pendingSession;
  const summary = pendingStartSummary;
  pendingSession = null;
  pendingStartSummary = null;
  if (!data) return null;
  return summary ? { ...data, summary } : data;
}
