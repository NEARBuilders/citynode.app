import { z } from "zod";
import { ownerWalletSchema } from "../common.js";
import { policySchema } from "../policy.js";
import { errorDocumentSchema } from "./common.js";
import { type EndpointDefinition, endpoints } from "./endpoints.js";
import { executionDetailsSchema, statusResponseSchema } from "./executions.js";
import {
  generateIntentResponseSchema,
  intentPreviewSchema,
  intentSchema,
  signedDataSchema,
} from "./intents.js";
import {
  agentViewSchema,
  budgetViewSchema,
  deletionPreviewSchema,
  grantViewSchema,
  limitsViewSchema,
  policyViewSchema,
  timelockViewSchema,
} from "./views.js";

/**
 * OpenAPI 3.1 document generated from the endpoint registry. Request schemas are rendered as
 * inputs (defaults make fields optional), response schemas as outputs.
 */

const errorStatuses = ["400", "401", "403", "404", "409", "410", "429", "502", "503"] as const;

/** Shared schemas rendered once under `components/schemas` and referenced everywhere else. */
const components = z.registry<{ id: string }>();
for (const [id, schema] of Object.entries({
  Policy: policySchema,
  OwnerWallet: ownerWalletSchema,
  Intent: intentSchema,
  SignedData: signedDataSchema,
  IntentPreview: intentPreviewSchema,
  GenerateIntentResponse: generateIntentResponseSchema,
  StatusResponse: statusResponseSchema,
  ExecutionDetails: executionDetailsSchema,
  AgentView: agentViewSchema,
  GrantView: grantViewSchema,
  TimelockView: timelockViewSchema,
  BudgetView: budgetViewSchema,
  PolicyView: policyViewSchema,
  LimitsView: limitsViewSchema,
  DeletionPreview: deletionPreviewSchema,
  ErrorDocument: errorDocumentSchema,
}))
  components.add(schema, { id });

type JsonObject = Record<string, unknown>;

/** Converts one schema and moves its shared definitions into `definitions`. */
function jsonSchema(
  schema: z.ZodType,
  io: "input" | "output",
  definitions: Record<string, JsonObject>,
): JsonObject {
  const rendered = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
    metadata: components,
    cycles: "ref",
    reused: "inline",
  }) as JsonObject;
  const text = JSON.stringify(rendered).replaceAll('"#/$defs/', '"#/components/schemas/');
  const {
    $defs,
    $schema: _schema,
    ...root
  } = JSON.parse(text) as JsonObject & {
    $defs?: Record<string, JsonObject>;
  };
  for (const [id, definition] of Object.entries($defs ?? {})) definitions[id] ??= definition;
  const id = components.get(schema)?.id;
  if (!id) return root;
  definitions[id] ??= root;
  return { $ref: `#/components/schemas/${id}` };
}

function parameters(endpoint: EndpointDefinition, definitions: Record<string, JsonObject>) {
  const result: Record<string, unknown>[] = [];
  if (endpoint.params) {
    const schema = jsonSchema(endpoint.params, "input", definitions) as {
      properties?: Record<string, unknown>;
    };
    for (const [name, property] of Object.entries(schema.properties ?? {}))
      result.push({ name, in: "path", required: true, schema: property });
  }
  if (endpoint.query) {
    const schema = jsonSchema(endpoint.query, "input", definitions) as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    for (const [name, property] of Object.entries(schema.properties ?? {}))
      result.push({
        name,
        in: "query",
        required: schema.required?.includes(name) ?? false,
        schema: property,
      });
  }
  if (endpoint.idempotency)
    result.push({
      name: "Idempotency-Key",
      in: "header",
      required: endpoint.idempotency === "required",
      description:
        "Stable key for one logical request. Replays with the same key and body return the original result; a different body is refused with `idempotency-conflict`.",
      schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" },
    });
  return result;
}

function security(endpoint: EndpointDefinition) {
  if (endpoint.auth === "none") return [];
  if (endpoint.grant) return [{ ApiKey: [], GrantToken: [] }];
  return [{ [endpoint.auth === "apiKey" ? "ApiKey" : "DeveloperSession"]: [] }];
}

function operation(endpoint: EndpointDefinition, definitions: Record<string, JsonObject>) {
  const errorDescription = endpoint.errors?.length
    ? `Error document. Documented codes: ${endpoint.errors.map((code) => `\`${code}\``).join(", ")}.`
    : "Error document.";
  return {
    operationId: endpoint.operationId,
    tags: [endpoint.tag],
    summary: endpoint.summary,
    ...(endpoint.description ? { description: endpoint.description } : {}),
    security: security(endpoint),
    parameters: parameters(endpoint, definitions),
    ...(endpoint.body
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: jsonSchema(endpoint.body, "input", definitions) },
            },
          },
        }
      : {}),
    responses: {
      [endpoint.status]: {
        description: "Success",
        content: {
          "application/json": { schema: jsonSchema(endpoint.response, "output", definitions) },
        },
      },
      ...Object.fromEntries(
        errorStatuses.map((status) => [
          status,
          {
            description: errorDescription,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorDocument" },
              },
            },
          },
        ]),
      ),
    },
  };
}

export function buildOpenApiDocument(input: { serverUrl?: string } = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  const definitions: Record<string, JsonObject> = {};
  jsonSchema(errorDocumentSchema, "output", definitions);
  for (const endpoint of Object.values(endpoints) as EndpointDefinition[]) {
    paths[endpoint.path] ??= {};
    (paths[endpoint.path] as Record<string, unknown>)[endpoint.method] = operation(
      endpoint,
      definitions,
    );
  }
  const tags = [...new Set(Object.values(endpoints).map((endpoint) => endpoint.tag))];
  return {
    openapi: "3.1.0",
    info: {
      title: "NEAR Intents Agent API",
      version: "1.0.0",
      description: [
        "Backend API for AI agents that trade on NEAR Intents under an owner-signed policy.",
        "",
        "Authenticate with `X-API-Key`. Keep the key on your backend.",
        "",
        "Owner actions use generate-intent → owner wallet signs `intent.payload` unchanged → submit-intent → GET /v1/status. Agent actions (swap, withdraw, transfer, …) need no owner signature, only `X-Grant-Token` for an owner grant that allows them, and return a `correlationId` for GET /v1/status.",
        "",
        "Errors are JSON:API documents. Branch on `errors[].code` (kebab-case), never on `title`. `UNCERTAIN` means the outcome is unknown: keep polling and never resubmit under a new `Idempotency-Key`.",
      ].join("\n"),
    },
    ...(input.serverUrl ? { servers: [{ url: input.serverUrl }] } : {}),
    tags: tags.map((name) => ({ name })),
    paths,
    components: {
      schemas: definitions,
      securitySchemes: {
        ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        GrantToken: {
          type: "apiKey",
          in: "header",
          name: "X-Grant-Token",
          description:
            "Token of the owner grant a delegated request runs under. The partner creates it and the owner signs its commitment; keep it on your backend.",
        },
        DeveloperSession: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description:
            "Partner dashboard session. Key mutations also require a trusted Origin and a login within five minutes.",
        },
      },
    },
  };
}
