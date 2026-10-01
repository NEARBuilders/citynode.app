/**
 * Public wire contract of the `/v1` API. Everything a client sends or receives is defined here;
 * `@near-intents-agent-api/contracts` (the package root) holds server-internal domain schemas.
 */
export type { OwnerType, OwnerWallet } from "../common.js";
export { ownerWalletSchema, usdAmountSchema } from "../common.js";
export * from "../destinations.js";
export { grantTokenPattern } from "../grants.js";
export type { Policy } from "../policy.js";
export { policySchema } from "../policy.js";
export * from "../quotas.js";
export * from "./common.js";
export * from "./endpoints.js";
export * from "./executions.js";
export * from "./intents.js";
export { buildLlmsText } from "./llms.js";
export { buildOpenApiDocument } from "./openapi.js";
export * from "./views.js";
