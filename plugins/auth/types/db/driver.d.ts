import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
export type AuthDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface DatabaseDriver {
    readonly db: AuthDatabase;
    close(): Promise<void>;
}
export declare function createDatabaseDriver(url: string): Promise<DatabaseDriver>;
