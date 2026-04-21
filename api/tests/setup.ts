import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPluginRuntime } from "every-plugin";
import Plugin from "@/index";
import pluginDevConfig from "../plugin.dev";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_CONFIG = {
  variables: pluginDevConfig.config.variables,
  secrets: {
    API_DATABASE_URL: "file:./api-test.db",
    API_DATABASE_AUTH_TOKEN: undefined,
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
}
