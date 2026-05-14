const { EveryPluginDevServer, FixMfDataUriPlugin } = require("every-plugin/build/rspack");

module.exports = {
  plugins: [new EveryPluginDevServer({ dts: false }), new FixMfDataUriPlugin()],
};
