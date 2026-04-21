import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.PROJECTS_DATABASE_URL || "file:./projects.db",
    authToken: process.env.PROJECTS_DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});
