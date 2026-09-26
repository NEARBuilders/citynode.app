import { describe, expect, it } from "vitest";
import { formatNearFigure, humanize, tenantStatusTone } from "./-admin-ui";

describe("admin display helpers", () => {
  it("rounds NEAR figures to two places without trailing zeros", () => {
    expect(formatNearFigure("4.998123")).toBe("5");
    expect(formatNearFigure("12.3456")).toBe("12.35");
    expect(formatNearFigure("10")).toBe("10");
    expect(formatNearFigure(0)).toBe("0");
    expect(formatNearFigure(undefined)).toBe("—");
    expect(formatNearFigure("n/a")).toBe("n/a");
  });

  it("maps tenant status to a badge tone", () => {
    expect(tenantStatusTone("active")).toBe("success");
    expect(tenantStatusTone("pending_deletion")).toBe("warning");
    expect(tenantStatusTone("suspended")).toBe("destructive");
    expect(tenantStatusTone("unknown")).toBe("outline");
  });

  it("turns enum values into sentence case", () => {
    expect(humanize("pending_deletion")).toBe("Pending deletion");
  });
});
