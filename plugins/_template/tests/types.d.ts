import Plugin from "@/index";
import pluginDevConfig from "../bos.dev";

declare module "every-plugin" {
  interface RegisteredPlugins {
    [pluginDevConfig.pluginId]: typeof Plugin;
  }
}
