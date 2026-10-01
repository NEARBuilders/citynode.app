export * from "./config/env.js";
export * from "./config/runtime.js";
export * from "./config/sponsor-keys.js";
export * from "./lib/db.js";
export * from "./lib/outlayer.js";
export * from "./lib/owner-policy-sponsor.js";
export * from "./lib/prices.js";
export * from "./lib/relayer.js";
export * from "./lib/slot.js";
export * from "./lib/sponsor-balance.js";
export * from "./lib/sponsor-clients.js";
export * from "./lib/sponsor-pool.js";
export * from "./lib/token-catalog.js";
export * from "./lib/wallet-sponsor.js";
export * from "./shared/actor.js";
export * from "./shared/audit-retention.js";
export * from "./shared/commit-effect.js";
export * from "./shared/crypto.js";
export * from "./shared/errors.js";
export * from "./shared/history-retention.js";
export * from "./shared/logger.js";
export * from "./shared/metrics.js";
export * from "./shared/near.js";
export * from "./shared/near-rpc.js";
export * from "./shared/nonces.js";
export * from "./shared/owner-message.js";
export * from "./shared/owner-proof.js";
export * from "./shared/secret-rotation.js";
export * from "./shared/secrets.js";
export * from "./shared/wallet-authorization.js";

// Service surface for the agents plugin shell (named exports only — the module
// families collide under star re-export; the shell imports exactly these).
export { generateIntent, generateResponse } from "./modules/intents/generate.js";
export { submitIntent } from "./modules/intents/submit.js";
export { readStatus, readHistory } from "./modules/intents/status.js";
export { createAgent, getOnboarding, submitOnboarding, refreshOnboarding } from "./modules/agents/onboarding-service.js";
export { listAgents, getAgentView, loadAgent } from "./modules/agents/service.js";
export type { Actor } from "./shared/actor.js";
