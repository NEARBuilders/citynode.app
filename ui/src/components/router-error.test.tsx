// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AppI18nProvider } from "@/i18n/runtime";
import { RouterError, RouterPending } from "./router-error";

afterEach(cleanup);

describe("router fallbacks", () => {
  it("renders a safe server fallback without application providers", () => {
    const markup = renderToStaticMarkup(
      <RouterError error={new Error('<script>alert("failure")</script>')} />,
    );
    expect(markup).toContain("Something went wrong");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("<summary");
    expect(markup).not.toContain("Error details");
    expect(markup).not.toContain("<script>alert");
  });
  it("reveals escaped error details on the client only", () => {
    const serverMarkup = renderToStaticMarkup(
      <RouterError error={new Error("private RPC details")} />,
    );
    expect(serverMarkup).not.toContain(">private RPC details<");
    render(<RouterError error={new Error("private RPC details")} />);
    expect(screen.getByText("Error details")).toBeTruthy();
    expect(screen.getByText("private RPC details")).toBeTruthy();
  });
  it("uses the current language in error and pending boundaries", () => {
    const markup = renderToStaticMarkup(
      <AppI18nProvider initialLocale="zh">
        <RouterError error={new Error("private RPC details")} />
        <RouterPending />
      </AppI18nProvider>,
    );
    expect(markup).toContain("出现了问题");
    expect(markup).toContain("正在加载");
  });
});
