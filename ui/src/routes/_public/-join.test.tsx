// @vitest-environment jsdom
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AppLocale } from "@/i18n/catalogs";
import { AppI18nProvider } from "@/i18n/runtime";
import { createApiClient } from "@/lib/api";
import { createAuthClient } from "@/lib/auth";
import { Route } from "./join";

const clients: QueryClient[] = [];
const calls: string[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  calls.splice(0);
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

const session = { user: { id: "user-1" }, session: { id: "session-1" } };
const place = { id: "00000000-0000-4000-8000-0000000000b1", slug: "chicago", name: "Chicago" };

function failure(status: number, code: string, message: string) {
  return Response.json({ json: { defined: false, code, message, data: {} } }, { status });
}

function mockApi({
  signedIn = true,
  joinResponses = [],
  sessionFailure = () => false,
  startedByThisJoin = false,
}: {
  signedIn?: boolean;
  joinResponses?: Response[];
  sessionFailure?: () => boolean;
  startedByThisJoin?: boolean;
} = {}) {
  const queued = [...joinResponses];
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/api/auth/get-session") {
        if (sessionFailure()) return Response.json({ message: "down" }, { status: 500 });
        return Response.json(signedIn ? session : null);
      }
      const method = url.pathname.split("/").at(-1) ?? "";
      calls.push(method);
      switch (method) {
        case "resolvePlace": {
          const started = !startedByThisJoin || calls.includes("activateCommunity");
          const community = { nodeId: "node-1", slug: "chicago", activatedAt: null };
          return Response.json({ json: { place, community: started ? community : null } });
        }
        case "activateCommunity":
          return Response.json({
            json: { placeId: place.id, slug: place.slug, alreadyActivated: !startedByThisJoin },
          });
        case "joinCommunity":
          return queued.shift() ?? Response.json({ json: { slug: place.slug } });
        default:
          throw new Error(`Unexpected API call: ${method}`);
      }
    }),
  );
}

async function showJoin(url: string, locale: AppLocale = "en") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const context = {
    apiClient: createApiClient({ hostUrl: "http://localhost", rpcBase: "/api/rpc" }, new Headers()),
    queryClient,
    authClient: createAuthClient({
      runtimeConfig: {
        hostUrl: "http://localhost",
        auth: {
          name: "auth",
          url: "http://localhost",
          entry: "remoteEntry.js",
          variables: { siwn: { recipient: "citynode.app" } },
        },
      },
    }),
  };
  const root = createRootRouteWithContext<typeof context>()({ component: Outlet });
  const routeOptions = {
    ...Route.options,
    getParentRoute: () => root,
    path: "/join",
    id: undefined,
  };
  const communityRoute = createRoute({ getParentRoute: () => root, path: "/n/$slug" });
  const exploreRoute = createRoute({ getParentRoute: () => root, path: "/explore" });
  const router = createRouter({
    routeTree: root.addChildren([Route.update(routeOptions), communityRoute, exploreRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
    context,
    defaultPendingMinMs: 0,
  });
  await router.load();
  renderView(
    <StrictMode>
      <AppI18nProvider initialLocale={locale} preferredLocale={locale}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AppI18nProvider>
    </StrictMode>,
  );
  return router;
}

it("sends a signed-out visitor to sign in with a way back to this join", async () => {
  mockApi({ signedIn: false });
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace });
  await showJoin("/join?place=chicago");
  await waitFor(() => expect(replace).toHaveBeenCalled());
  const destination = new URL(String(replace.mock.calls[0]?.[0]), "http://localhost");
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("redirect")).toBe("/join?place=chicago");
  expect(calls).not.toContain("joinCommunity");
});

it("joins a signed-in visitor once and takes them to the community", async () => {
  mockApi();
  const router = await showJoin("/join?place=chicago");
  await waitFor(() => expect(router.state.location.pathname).toBe("/n/chicago"));
  expect(calls.filter((call) => call === "joinCommunity")).toHaveLength(1);
});

it.each([
  [
    409,
    "CONFLICT",
    "You can't join this community right now. Try again later, or check in at one of its events.",
  ],
  [404, "NOT_FOUND", "We couldn't find this community."],
  [401, "UNAUTHORIZED", "Your session has expired. Sign in again."],
  [500, "INTERNAL_SERVER_ERROR", "We couldn't add you to this community. Please try again."],
])("explains a %s failure in plain words", async (status, code, message) => {
  mockApi({ joinResponses: [failure(status, code, "relation onboarding_code does not exist")] });
  const router = await showJoin("/join?place=chicago");
  expect((await screen.findByTestId("join.error")).textContent).toBe(message);
  expect(document.body.textContent).not.toContain("onboarding_code");
  expect(router.state.location.pathname).toBe("/join");
});

it("shows the failure in the visitor's language with a way back", async () => {
  mockApi({ joinResponses: [failure(500, "INTERNAL_SERVER_ERROR", "boom")] });
  await showJoin("/join?place=chicago", "es");
  expect((await screen.findByTestId("join.error")).textContent).toBe(
    "No pudimos añadirte a esta comunidad. Inténtalo de nuevo.",
  );
  expect(await screen.findByRole("heading", { level: 1, name: "Unirse a Chicago" })).toBeTruthy();
  const back = await screen.findByTestId("join.back");
  expect(back.textContent).toBe("Volver a Chicago");
  expect(back.getAttribute("href")).toBe("/n/chicago");
});

it("joins after the visitor retries a failed join", async () => {
  mockApi({ joinResponses: [failure(500, "INTERNAL_SERVER_ERROR", "boom")] });
  const router = await showJoin("/join?place=chicago");
  fireEvent.click(await screen.findByTestId("join.retry"));
  await waitFor(() => expect(router.state.location.pathname).toBe("/n/chicago"));
  expect(calls.filter((call) => call === "joinCommunity")).toHaveLength(2);
});

it("joins once when the visitor retries after the session could not be checked", async () => {
  let down = true;
  mockApi({ sessionFailure: () => down });
  const router = await showJoin("/join?place=chicago");
  const retry = await screen.findByTestId("join.retry");
  expect(calls).not.toContain("activateCommunity");
  down = false;
  fireEvent.click(retry);
  await waitFor(() => expect(router.state.location.pathname).toBe("/n/chicago"));
  expect(calls.filter((call) => call === "activateCommunity")).toHaveLength(1);
  expect(calls.filter((call) => call === "joinCommunity")).toHaveLength(1);
});

it("waits for the session instead of asking an offline visitor to sign in", async () => {
  mockApi();
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace });
  onlineManager.setOnline(false);
  await showJoin("/join?place=chicago");
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
});

it("leads back to a community that the failed join had just started", async () => {
  mockApi({
    startedByThisJoin: true,
    joinResponses: [failure(500, "INTERNAL_SERVER_ERROR", "boom")],
  });
  await showJoin("/join?place=chicago");
  await screen.findByTestId("join.error");
  await waitFor(() =>
    expect(screen.getByTestId("join.back").getAttribute("href")).toBe("/n/chicago"),
  );
});
