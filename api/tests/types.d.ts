import type Plugin from "@/index";
import { TEST_PLUGIN_ID } from "./test-config";

declare module "every-plugin" {
  interface RegisteredPlugins {
    [TEST_PLUGIN_ID]: typeof Plugin;
  }
}

declare module "virtual:drizzle-migrations.sql" {
  export interface Migration {
    idx: number;
    when: number;
    tag: string;
    hash: string;
    sql: string[];
  }

  const migrations: Migration[];
  export default migrations;
}
