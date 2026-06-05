import { beforeEach, expect, test, vi } from "vitest";

const createBetterAuthClientMock = vi.hoisted(() => vi.fn((options) => options));
const siwnClientMock = vi.hoisted(() => vi.fn((options) => ({ id: "siwn", options })));

vi.mock("@better-auth/api-key/client", () => ({ apiKeyClient: vi.fn(() => ({ id: "api-key" })) }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: vi.fn(() => ({ id: "passkey" })) }));
vi.mock("better-auth/client/plugins", () => ({
  adminClient: vi.fn(() => ({ id: "admin" })),
  anonymousClient: vi.fn(() => ({ id: "anonymous" })),
  inferAdditionalFields: vi.fn(() => ({ id: "infer" })),
  organizationClient: vi.fn(() => ({ id: "organization" })),
  phoneNumberClient: vi.fn(() => ({ id: "phone" })),
}));
vi.mock("better-auth/react", () => ({ createAuthClient: createBetterAuthClientMock }));
vi.mock("better-near-auth/client", () => ({ siwnClient: siwnClientMock }));

import { createAuthClient } from "./auth";

beforeEach(() => {
  createBetterAuthClientMock.mockClear();
  siwnClientMock.mockClear();
});

test("forwards cspNonce to the SIWN client", () => {
  const runtimeConfig = {
    account: "every.near",
    networkId: "mainnet" as const,
    hostUrl: "https://example.com",
  };

  createAuthClient(runtimeConfig, undefined, "test-nonce");

  expect(siwnClientMock).toHaveBeenCalledWith({
    recipient: "every.near",
    networkId: "mainnet",
    cspNonce: "test-nonce",
  });
});
