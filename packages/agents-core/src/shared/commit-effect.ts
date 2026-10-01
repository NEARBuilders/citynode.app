import type { Tx } from "@near-intents-agent-api/database";

/** Records a caller's outcome in the transaction that commits its domain effect. */
export type CommitEffect<T> = (tx: Tx, result: T) => Promise<void>;
