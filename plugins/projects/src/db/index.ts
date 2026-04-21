import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const createDatabase = (url: string, authToken?: string) => {
  const client = createClient({
    url,
    authToken,
  });

  return drizzle({ client, schema });
};

let projectsDatabaseUrl: string | null = null;
let projectsDatabaseAuthToken: string | undefined;
let cachedDatabase: ReturnType<typeof createDatabase> | null = null;

export const setProjectsDatabaseConfig = (url: string, authToken?: string) => {
  projectsDatabaseUrl = url;
  projectsDatabaseAuthToken = authToken;
};

export const getDatabase = () => {
  if (!cachedDatabase) {
    if (!projectsDatabaseUrl) {
      throw new Error(
        "Projects database URL not configured. Call setProjectsDatabaseConfig() first.",
      );
    }
    cachedDatabase = createDatabase(projectsDatabaseUrl, projectsDatabaseAuthToken);
  }

  return cachedDatabase;
};

export type Database = ReturnType<typeof createDatabase>;
