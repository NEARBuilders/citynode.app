// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translateAppMessage } from "@/i18n/runtime";
import { PocStationExtra } from "./-poc-station-extra";

vi.mock("@/i18n/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/runtime")>();
  return {
    ...actual,
    useAppLocale: () => ({ locale: "fr" }),
    useAppTranslation:
      () =>
      (
        id: Parameters<typeof actual.translateAppMessage>[0],
        values?: Record<string, string | number>,
      ) =>
        actual.translateAppMessage(id, values, "fr"),
  };
});
vi.mock("@/components", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FieldLabel: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

afterEach(cleanup);
describe("localized voting controls", () => {
  it("translates vote labels while submitting the original protocol value", () => {
    const setFieldValue = vi.fn();
    const lc = {
      facts: {},
      govProposals: [{ id: 1, title: null, status: "Active" }],
      govProposal: { id: 1, status: "Active" },
      values: { govProposalId: "1", voteOption: "For" },
      form: { setFieldValue },
    } as unknown as Parameters<typeof PocStationExtra>[0]["lc"];
    const station = { def: { id: "vote" } } as Parameters<typeof PocStationExtra>[0]["station"];
    render(<PocStationExtra lc={lc} station={station} />);
    expect(screen.getByRole("option", { name: "Pour" }).getAttribute("value")).toBe("For");
    expect(screen.getByRole("option", { name: "Contre" }).getAttribute("value")).toBe("Against");
    expect(screen.getByRole("option", { name: "Abstention" }).getAttribute("value")).toBe(
      "Abstain",
    );
    expect(
      screen.getByRole("option", {
        name: `#1 ${translateAppMessage("lifecycle.untitled", undefined, "fr")}`,
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getAllByRole("combobox")[1]!, { target: { value: "Against" } });
    expect(setFieldValue).toHaveBeenCalledWith("voteOption", "Against");
  });
});
