import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginRuntime } from "every-plugin";
import Plugin from "@/index";
import pluginDevConfig from "../plugin.dev";

const testDbDir = mkdtempSync(join(tmpdir(), "everything-dev-api-test-"));

const TEST_CONFIG = {
  variables: pluginDevConfig.config.variables,
  secrets: {
    API_DATABASE_URL: `pglite:${testDbDir}`,
  },
};

let _runtime: ReturnType<typeof createPluginRuntime> | null = null;

export function getRuntime() {
  if (!_runtime) {
    _runtime = createPluginRuntime({
      registry: {
        [pluginDevConfig.pluginId]: {
          module: Plugin,
        },
      },
      secrets: {},
    });
  }
  return _runtime;
}

export async function getPluginClient(context?: { userId?: string }) {
  const runtime = getRuntime();
  const { createClient } = await runtime.usePlugin(pluginDevConfig.pluginId, TEST_CONFIG);

  if (!context?.userId) {
    return createClient();
  }

  return createClient({
    userId: context.userId,
    user: { id: context.userId },
  });
}

export async function teardown() {
  if (_runtime) {
    await _runtime.shutdown();
    _runtime = null;
  }

  rmSync(testDbDir, { recursive: true, force: true });
}
