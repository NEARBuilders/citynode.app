import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppI18nProvider } from "@/i18n/runtime";
import { RouterError, RouterPending } from "./router-error";

describe("router fallbacks", () => {
  it("renders a safe server fallback without application providers", () => {
    const markup = renderToStaticMarkup(
      <RouterError error={new Error('<script>alert("failure")</script>')} />,
    );
    expect(markup).toContain("Something went wrong");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Try again");
    expect(markup).toContain("<summary");
    expect(markup).toContain("Error details");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>alert");
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
    expect(markup).toContain(">private RPC details<");
  });
});
