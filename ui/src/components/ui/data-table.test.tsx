import type { ColumnDef } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

interface Row {
  name: string;
}

const columns: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];

describe("DataTable", () => {
  it("reports the number of visible rows on the current page", () => {
    const data = Array.from({ length: 15 }, (_, index) => ({ name: `row ${index + 1}` }));

    const markup = renderToStaticMarkup(<DataTable columns={columns} data={data} />);

    expect(markup).toContain("Showing 10 of 15 row(s).");
  });
});
