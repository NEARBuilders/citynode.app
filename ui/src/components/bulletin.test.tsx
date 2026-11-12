import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "@/i18n/test-render";
import { Bulletin } from "./bulletin";

describe("Bulletin", () => {
  it("renders markdown content inside the info-tinted card", () => {
    const html = renderToStaticMarkup(<Bulletin content="**More features** are coming soon." />);
    expect(html).toContain("Bulletin");
    expect(html).toContain("More features");
    expect(html).toContain("bg-info-muted");
  });

  it("renders nothing for blank content", () => {
    const html = renderToStaticMarkup(<Bulletin content="   " />);
    expect(html).toBe("");
  });

  it("escapes hostile markdown content", () => {
    const html = renderToStaticMarkup(
      <Bulletin content={'<script>alert("x")</script>\n\nSafe.'} />,
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("Safe.");
  });

  it("labels which community posted it, and who posted it when", () => {
    const html = renderToStaticMarkup(
      <Bulletin
        content="Hackathon"
        communityName="New York City"
        publisherName="Ada Lovelace"
        publishedAt="2026-11-11T18:30:00.000Z"
      />,
    );
    expect(html).toContain('aria-label="Bulletin · New York City"');
    expect(html).toContain("Bulletin · New York City");
    expect(html).toContain("Posted by Ada Lovelace · ");
    expect(html).toContain('dateTime="2026-11-11T18:30:00.000Z"');
  });

  it("shows only the date when the publisher has no shareable name", () => {
    const html = renderToStaticMarkup(
      <Bulletin
        content="Hackathon"
        communityName="New York City"
        publisherName={null}
        publishedAt="2026-11-11T18:30:00.000Z"
      />,
    );
    expect(html).toContain("Posted ");
    expect(html).not.toContain("Posted by");
    expect(html).toContain('dateTime="2026-11-11T18:30:00.000Z"');
  });

  it("keeps a bulletin saved before attribution to its community label", () => {
    const html = renderToStaticMarkup(
      <Bulletin
        content="Hackathon"
        communityName="New York City"
        publisherName={null}
        publishedAt={null}
      />,
    );
    expect(html).toContain("Bulletin · New York City");
    expect(html).not.toContain("bulletin-attribution");
    expect(html).not.toContain("Posted");
  });

  it("shows only the community's announcement, with no platform badge", () => {
    const html = renderToStaticMarkup(<Bulletin content="More is coming." />);
    expect(html).toContain("More is coming.");
    expect(html).not.toContain("In progress");
  });
});
