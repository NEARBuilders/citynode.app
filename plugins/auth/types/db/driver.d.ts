export type AuthDatabase = any;
export interface DatabaseDriver {
    readonly db: AuthDatabase;
    execute(sql: string): Promise<void>;
    query(sql: string): Promise<unknown[]>;
    batch?(sqls: string[]): Promise<void>;
    close(): void;
}
export interface DriverOptions {
    authToken?: string;
}
export declare function createDatabaseDriver(url: string, options?: DriverOptions): DatabaseDriver;
