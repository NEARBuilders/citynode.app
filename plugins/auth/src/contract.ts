import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
import { oc } from "@orpc/contract";
import { adminUsersRoutes } from "./contract/admin-users.contract";
import { apiKeyRoutes } from "./contract/api-keys.contract";
import { communityOrganizationRoutes } from "./contract/community-organizations.contract";
import { invitationRoutes } from "./contract/invitations.contract";
import { memberRoutes } from "./contract/members.contract";
import { nearRoutes } from "./contract/near.contract";
import { onboardingRoutes } from "./contract/onboarding.contract";
import { onboardingJoinRoutes } from "./contract/onboarding-joins.contract";
import { organizationRequestRoutes } from "./contract/organization-requests.contract";
import { organizationRoutes } from "./contract/organizations.contract";
import { passkeyRoutes } from "./contract/passkeys.contract";
import { sessionRoutes } from "./contract/session.contract";
import { teamRoutes } from "./contract/teams.contract";

export { type AuthErrors, Errors } from "./contract/errors";
export {
  type OnboardingRedeemFailureCode,
  type OnboardingRedeemReason,
  onboardingRedeemFailures,
  onboardingRedeemReasonSchema,
} from "./contract/onboarding.contract";
export { apiKeySchema } from "./contract/schemas";

export const contract = oc.router({
  ...sessionRoutes,
  ...organizationRoutes,
  ...organizationRequestRoutes,
  ...communityOrganizationRoutes,
  ...memberRoutes,
  ...invitationRoutes,
  ...teamRoutes,
  ...onboardingRoutes,
  ...onboardingJoinRoutes,
  ...apiKeyRoutes,
  ...nearRoutes,
  ...adminUsersRoutes,
  ...passkeyRoutes,
});

export type ContractType = typeof contract;

export type InferOutput<K extends keyof InferContractRouterOutputs<ContractType>> =
  InferContractRouterOutputs<ContractType>[K];
export type InferInput<K extends keyof InferContractRouterInputs<ContractType>> =
  InferContractRouterInputs<ContractType>[K];
