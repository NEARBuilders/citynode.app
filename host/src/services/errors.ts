import { Data } from "every-plugin/effect";

export class FederationError extends Data.TaggedError("FederationError")<{
  readonly remoteName: string;
  readonly remoteUrl?: string;
  readonly cause?: unknown;
}> {}

export class PluginError extends Data.TaggedError("PluginError")<{
  readonly pluginName?: string;
  readonly pluginUrl?: string;
  readonly cause?: unknown;
}> {}
