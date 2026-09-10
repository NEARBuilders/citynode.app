import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouterError } from "./router-error";

describe("router error fallback", () => {
  it("renders on the server without application providers and escapes error details", () => {
    const markup = renderToStaticMarkup(
      <RouterError error={new Error('<script>alert("failure")</script>')} />,
    );

    expect(markup).toContain("Oops!");
    expect(markup).toContain("<summary");
    expect(markup).toContain("Error Details");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
