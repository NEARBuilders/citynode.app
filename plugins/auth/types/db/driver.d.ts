import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";
export type AuthDatabase = PgDatabase<any, typeof schema>;
export interface DatabaseDriver {
    readonly db: AuthDatabase;
    close(): Promise<void>;
}
export declare function createDatabaseDriver(url: string): Promise<DatabaseDriver>;
