// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@/i18n/test-render";
import { DaoProposalsNote } from "./-dao-proposals-note";

afterEach(cleanup);

describe("DaoProposalsNote", () => {
  it("says member DAO proposals are not available yet and what they depend on", () => {
    render(<DaoProposalsNote />);
    const note = screen.getByTestId("dashboard-node.dao-proposals-note");
    expect(note.textContent).toContain("Node DAO proposals");
    expect(note.textContent).toContain(
      "can't submit proposals to this community's Node DAO here yet",
    );
    expect(note.textContent).toContain("activated for signing");
    expect(note.textContent).toContain("proposal policy");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
