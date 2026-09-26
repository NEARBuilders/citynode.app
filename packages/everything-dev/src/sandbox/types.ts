import { Data, type Effect } from "effect";

export const SANDBOX_LEASES_VERSION = 1;

export interface SandboxTenant {
  readonly account: string;
  readonly gateway: string;
}

export interface SandboxLease {
  readonly account: string;
  readonly gateway: string;
  readonly slug: string;
  readonly url: string;
  readonly proxyUrlAlias?: string;
  readonly hostPort: number;
  readonly pgPort: number;
  readonly image: string;
  readonly imageDigest: string | null;
  readonly containers: readonly string[];
  readonly network: string;
  readonly createdAt: string;
  readonly lastUsedAt: string;
}

export interface SandboxLeaseFile {
  readonly version: number;
  readonly leases: readonly SandboxLease[];
}

export interface SandboxMachineSpec {
  readonly name: string;
  readonly kind: "postgres" | "host";
  readonly port: number;
  readonly env: Record<string, string>;
  readonly binds: Record<string, string>;
  readonly network: string;
  readonly image?: string;
}

export interface SpawnedMachine {
  readonly name: string;
  readonly port: number;
  readonly containerId: string;
  readonly imageDigest: string | null;
}

export interface SandboxMachineProviderShape {
  readonly findFreePort: () => Effect.Effect<number, SandboxError>;
  readonly ensureNetwork: (name: string) => Effect.Effect<void, SandboxError>;
  readonly connectNetwork: (
    network: string,
    container: string,
  ) => Effect.Effect<void, SandboxError>;
  readonly spawn: (spec: SandboxMachineSpec) => Effect.Effect<SpawnedMachine, SandboxError>;
  readonly stop: (name: string) => Effect.Effect<void, never>;
  readonly healthCheck: (url: string) => Effect.Effect<boolean, never>;
  readonly imageDigest: (image: string) => Effect.Effect<string | null, never>;
}

export class SandboxError extends Data.TaggedError("SandboxError")<{
  readonly reason: string;
  readonly phase: "spawn" | "health" | "lease-store" | "config";
  readonly cause?: unknown;
}> {}
