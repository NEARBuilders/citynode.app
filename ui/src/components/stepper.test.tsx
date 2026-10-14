// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@/i18n/test-render";
import { StepList } from "./stepper";

afterEach(cleanup);

describe("stepper", () => {
  it("keeps a step's DOM identity when identified steps reorder", () => {
    const first = { id: "create", label: "Create account", state: "success" as const };
    const second = { id: "publish", label: "Publish config", state: "pending" as const };
    const view = render(<StepList steps={[first, second]} />);
    const createLabel = screen.getByText("Create account");

    view.rerender(<StepList steps={[second, first]} />);

    expect(screen.getByText("Create account")).toBe(createLabel);
  });
});
