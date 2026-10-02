import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { describeDaoError } from "@/lib/dao-connect";
export interface PocLogMessage {
  messageId: AppMessageId;
  values?: Record<string, string | number>;
}
export type PocLogDetail = string | PocLogMessage | { error: unknown; account: string };
export type PocLogger = (label: PocLogMessage, detail?: PocLogDetail) => void;
export function formatPocLogValue(value: PocLogDetail, t: AppTranslator) {
  if (typeof value === "string") return value;
  if ("error" in value) return describeDaoError(value.error, value.account, t);
  return t(value.messageId, value.values);
}
