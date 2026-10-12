// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { AddEmailDialog } from "./add-email-dialog";

const harness = vi.hoisted(() => ({
  fetch: vi.fn(),
  refreshSessionCache: vi.fn(),
}));

vi.mock("@/app", () => ({
  useAuthClient: () => ({ $fetch: harness.fetch }),
}));

vi.mock("everything-dev/ui/auth", () => ({
  refreshSessionCache: harness.refreshSessionCache,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  harness.fetch.mockReset();
  harness.refreshSessionCache.mockReset();
});

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddEmailDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

async function requestCode(email: string) {
  fireEvent.change(await screen.findByTestId("add-email.input"), { target: { value: email } });
  fireEvent.click(screen.getByTestId("add-email.save"));
  return screen.findByTestId("add-email.code-step");
}

function enterCode(code: string) {
  fireEvent.change(screen.getByTestId("add-email.code-input"), { target: { value: code } });
  fireEvent.click(screen.getByTestId("add-email.confirm"));
}

describe("AddEmailDialog", () => {
  it("sends a code to the new address and keeps the session until the code is entered", async () => {
    harness.fetch.mockResolvedValue({ data: { success: true }, error: null });
    const { onOpenChange } = renderDialog();

    const step = await requestCode(" Grace@Example.com ");

    expect(harness.fetch).toHaveBeenCalledWith("/email-otp/request-email-change", {
      method: "POST",
      body: { newEmail: "grace@example.com" },
    });
    expect(step.textContent).toContain("grace@example.com");
    expect(harness.refreshSessionCache).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("confirms the address with the code and refreshes the session", async () => {
    harness.fetch.mockResolvedValue({ data: { success: true }, error: null });
    const { onOpenChange } = renderDialog();
    await requestCode("grace@example.com");

    enterCode("123456");

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(harness.fetch).toHaveBeenLastCalledWith("/email-otp/change-email", {
      method: "POST",
      body: { newEmail: "grace@example.com", otp: "123456" },
    });
    expect(harness.refreshSessionCache).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and explains when the code is wrong or expired", async () => {
    harness.fetch
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: { status: 400, message: "Invalid OTP" } });
    const { onOpenChange } = renderDialog();
    await requestCode("grace@example.com");

    enterCode("000000");

    expect(await screen.findByText(/wrong or has expired/)).toBeTruthy();
    expect(screen.getByTestId("add-email.code-step")).toBeTruthy();
    expect(harness.refreshSessionCache).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("says when the server can't send email instead of asking for a code", async () => {
    harness.fetch.mockResolvedValue({ data: null, error: { status: 503 } });
    renderDialog();

    fireEvent.change(await screen.findByTestId("add-email.input"), {
      target: { value: "grace@example.com" },
    });
    fireEvent.click(screen.getByTestId("add-email.save"));

    expect(await screen.findByText(/isn't set up on this server/)).toBeTruthy();
    expect(screen.queryByTestId("add-email.code-step")).toBeNull();
  });

  it("lets the person go back and use a different address", async () => {
    harness.fetch.mockResolvedValue({ data: { success: true }, error: null });
    renderDialog();
    await requestCode("typo@example.com");

    fireEvent.click(screen.getByTestId("add-email.change-address"));

    expect(await screen.findByTestId("add-email.input")).toBeTruthy();
    expect(screen.queryByTestId("add-email.code-step")).toBeNull();
  });
});
