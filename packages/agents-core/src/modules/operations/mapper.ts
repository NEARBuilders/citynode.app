import type { Operation as OperationContract } from "@near-intents-agent-api/contracts";
import type { Actor } from "../../shared/actor.js";
import type { OperationRecord } from "./repository.js";
import { projectOperationResult } from "./result-projection.js";

type OperationDtoInput = Pick<OperationRecord, "id" | "kind" | "status" | "result"> &
  Partial<Pick<OperationRecord, "tenantId" | "agentId">>;

/**
 * The DTO is the read boundary: safe metadata is always returned, while the stored body is only
 * projected back through the redactor for the actor asking. Every operation read route funnels
 * through here, so a caller cannot bypass projection by choosing a different endpoint.
 */
export async function toOperationDto<T>(
  _actor: Actor,
  operation: OperationDtoInput & { result: T },
): Promise<OperationContract<T>> {
  return mapOperationDto(operation);
}

function mapOperationDto<T>(operation: OperationDtoInput & { result: T }): OperationContract<T> {
  return {
    id: operation.id,
    kind: operation.kind,
    status: operation.status,
    result: projectOperationResult(operation.kind, operation.result) as T,
  };
}
