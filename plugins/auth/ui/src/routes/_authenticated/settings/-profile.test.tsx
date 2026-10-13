// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginAccountLocaleProvider } from "@/i18n/account-locale-provider";
import { render } from "@/i18n/test-render";
import { ProfileSettings } from "./-components/profile-settings";

const harness = vi.hoisted(() => ({
  session: null as {
    user: { id: string; name: string; email: string; locale?: string | null };
  } | null,
  updateUser: vi.fn(),
  getSession: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("everything-dev/ui/auth", () => ({
  sessionQueryKey: ["session"],
  sessionQueryOptions: (auth: { getSession: typeof harness.getSession }) => ({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await auth.getSession();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    staleTime: 0,
  }),
  useAuthClient: () => ({
    getSession: harness.getSession,
    updateUser: harness.updateUser,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    ...props
  }: Record<string, unknown> & { to?: string; search?: { redirect?: string } }) => (
    <a data-to={to} data-redirect={search?.redirect} {...props} />
  ),
  useRouterState: ({ select }: { select: (state: { location: { href: string } }) => string }) =>
    select({ location: { href: "/settings/profile" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: harness.success, error: harness.error },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LoginAccountLocaleProvider>
        <ProfileSettings />
      </LoginAccountLocaleProvider>
    </QueryClientProvider>,
  );
}

describe("profile settings without a usable session", () => {
  it("shows a retryable error instead of a blank page when the session cannot load", async () => {
    harness.getSession.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    harness.getSession.mockResolvedValue({
      data: { user: { id: "user-1", name: "Tester", email: "person@example.com" } },
      error: null,
    });

    renderProfile();

    expect(await screen.findByTestId("settings-session-error")).toBeTruthy();
    expect(screen.getByText("Couldn't load your account")).toBeTruthy();

    fireEvent.click(screen.getByTestId("settings-session-retry-button"));

    expect(await screen.findByPlaceholderText("Your display name")).toBeTruthy();
    expect(screen.queryByTestId("settings-session-error")).toBeNull();
  });

  it("offers to sign in again and come back when the session has ended", async () => {
    harness.getSession.mockResolvedValue({ data: null, error: null });

    renderProfile();

    expect(await screen.findByText("You're signed out")).toBeTruthy();
    const signIn = screen.getByTestId("settings-signin-button");
    expect(signIn.getAttribute("data-to")).toBe("/login");
    expect(signIn.getAttribute("data-redirect")).toBe("/settings/profile");
  });
});

describe("profile settings", () => {
  it("refreshes the authoritative session after changing the display name", async () => {
    const oldSession = {
      user: { id: "user-1", name: "Old name", email: "person@example.com" },
    };
    const freshSession = {
      user: { id: "user-1", name: "New name", email: "person@example.com" },
    };
    harness.session = oldSession;
    harness.getSession.mockImplementation(async () => ({ data: harness.session, error: null }));
    harness.updateUser.mockImplementation(async ({ name }: { name: string }) => {
      harness.session = { ...freshSession, user: { ...freshSession.user, name } };
      return { data: null, error: null };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginAccountLocaleProvider>
          <ProfileSettings />
        </LoginAccountLocaleProvider>
      </QueryClientProvider>,
    );

    const nameInput = await screen.findByPlaceholderText("Your display name");
    fireEvent.change(nameInput, { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(harness.updateUser).toHaveBeenCalledWith({ name: "New name" }));
    await waitFor(() => expect(queryClient.getQueryData(["session"])).toEqual(freshSession));
    expect(harness.success).toHaveBeenCalledWith("Profile updated");
  });

  it("saves the selected language to the user profile", async () => {
    harness.session = {
      user: {
        id: "user-1",
        name: "Tester",
        email: "person@example.com",
        locale: "en",
      },
    };
    harness.getSession.mockImplementation(async () => ({ data: harness.session, error: null }));
    harness.updateUser.mockImplementation(async ({ locale }: { locale: string }) => {
      if (harness.session) {
        harness.session = {
          ...harness.session,
          user: { ...harness.session.user, locale },
        };
      }
      return { data: null, error: null };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginAccountLocaleProvider>
          <ProfileSettings />
        </LoginAccountLocaleProvider>
      </QueryClientProvider>,
    );

    const selector = await screen.findByTestId("settings.language-select");
    fireEvent.click(selector);
    const french = await screen.findByRole("option", { name: "Français" });
    fireEvent.pointerDown(french, { pointerType: "mouse" });
    fireEvent.click(french);

    await waitFor(() => expect(harness.updateUser).toHaveBeenCalledWith({ locale: "fr" }));
    await waitFor(() => expect(harness.success).toHaveBeenCalledWith("Langue mise à jour"));
  });
});
