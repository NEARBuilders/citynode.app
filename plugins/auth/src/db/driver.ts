import * as schema from "./schema";

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

export function createDatabaseDriver(url: string, options?: DriverOptions): DatabaseDriver {
  const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
  const { drizzle } = require("drizzle-orm/libsql") as typeof import("drizzle-orm/libsql");

  const client = createClient({ url, authToken: options?.authToken });
  const db = drizzle(client, { schema });

  return {
    db,
    execute: async (sql: string) => {
      await client.execute(sql);
    },
    query: async (sql: string) => {
      const result = await client.execute(sql);
      return result.rows;
    },
    batch: async (sqls: string[]) => {
      await client.batch(sqls.map((sql) => ({ sql })));
    },
    close: () => {
      client.close();
    },
  };
}
