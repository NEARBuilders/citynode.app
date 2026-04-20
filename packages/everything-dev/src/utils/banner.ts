import { createRequire } from "node:module";
import { colors, divider, gradients } from "./theme";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const ASCII_BOS = `
  ██████╗  ██████╗ ███████╗
  ██╔══██╗██╔═══██╗██╔════╝
  ██████╔╝██║   ██║███████╗
  ██╔══██╗██║   ██║╚════██║
  ██████╔╝╚██████╔╝███████║
  ╚═════╝  ╚═════╝ ╚══════╝`;

export function printBanner(title = "everything-dev", version = pkg.version) {
  console.log(gradients.cyber(ASCII_BOS));
  console.log();
  console.log(colors.dim(`  ${title} ${colors.cyan(`v${version}`)}`));
  console.log(colors.dim(`  ${divider(30)}`));
  console.log();
}
