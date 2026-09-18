import { createPluginBaseConfig } from "every-plugin/build/rspack";
import { withPluginDeploy } from "everything-dev/integrity";

const baseConfig = createPluginBaseConfig();
const bosConfigPath = new URL("../../bos.config.json", import.meta.url).pathname;

export default withPluginDeploy(baseConfig, { bosConfigPath, deployLabel: "Plugin Deployed" });
