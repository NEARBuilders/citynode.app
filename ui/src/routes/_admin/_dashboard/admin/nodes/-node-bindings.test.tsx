// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { bindingHostnameError, NodeBindings } from "./-node-bindings";

const mocks = vi.hoisted(() => ({
  apiClient: {
    listTenantBindingsForTenant: vi.fn(async () => []),
    createBinding: vi.fn(),
  },
  toastError: vi.fn(),
}));

vi.mock("@/app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app")>()),
  useApiClient: () => mocks.apiClient,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("domain hostname hints", () => {
  it.each([
    ["alias", "chicago", null],
    ["alias", "my_alias", "admin.domain.aliasInvalid"],
    ["alias", "chicago.gov", "admin.domain.aliasInvalid"],
    ["custom", "nyc.gov", null],
    ["custom", "nyc", "admin.domain.customInvalid"],
  ] as const)("%s %s", (kind, hostname, messageId) => {
    expect(bindingHostnameError(kind, hostname)).toBe(messageId);
  });

  it("shows the alias hint instead of a generic error and does not save", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NodeBindings tenantId="tenant-1" gateway="citynode.app" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("admin-node-add-domain"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Alias"), { target: { value: "my_alias" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add domain" }));
    const hint = "Use one alias with only letters, numbers, and hyphens.";
    expect((await within(dialog).findByRole("alert")).textContent).toBe(hint);
    expect(mocks.toastError).toHaveBeenCalledWith(hint);
    expect(mocks.apiClient.createBinding).not.toHaveBeenCalled();
  });
});
