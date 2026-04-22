---
"api": minor
"@everything-dev/every-plugin": minor
"everything-dev": minor
---

## API pluginsClient: in-process plugin composition

The API plugin receives a `pluginsClient` map of typed client factories via `createPlugin.withPlugins<PluginsClient>()`, enabling in-process calls to other plugin routers without HTTP roundtrips.

- **New**: `createPlugin.withPlugins<P>()` on `every-plugin` — pre-binds the plugins type generic, eliminating the `plugins: null as unknown as P` hack
- **New**: Generated types now live alongside their consumers — `api/src/plugins-client.gen.ts` and `ui/src/api-contract.gen.ts` instead of `.bos/generated/`
- **New endpoint**: `GET /api/demo/plugins` — demonstrates variable flow from `bos.config.json` and in-process plugin client usage
- **Config-driven**: API variables (`app.api.variables`) and plugin variables (`plugins.{key}.variables`) configured in `bos.config.json`
- **Generic host**: No plugin-specific code in the host — it loads plugins from config and injects client factories

### Usage

```typescript
import type { PluginsClient } from "./plugins-client.gen";

export default createPlugin.withPlugins<PluginsClient>()({
  initialize: (config, plugins) =>
    Effect.sync(() => ({ plugins, demoMessage: config.variables.demoMessage })),
  createRouter: (services, builder) => ({
    pluginDemo: builder.pluginDemo.handler(async () => {
      const status = await services.plugins.registry().getRegistryStatus();
      return { apiVariable: services.demoMessage, registryStatus: status, availablePlugins: Object.keys(services.plugins) };
    }),
  }),
});
```
