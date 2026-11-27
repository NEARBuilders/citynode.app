import { describe, expect, it } from "vitest";

import { joinReturnPath } from "./join-sign-in";

describe("joinReturnPath", () => {
  it("sends a signed-out visitor back to the community they were joining", () => {
    expect(joinReturnPath("chicago")).toBe("/join?place=chicago");
    expect(joinReturnPath("new-york-city")).toBe("/join?place=new-york-city");
    expect(joinReturnPath("são paulo")).toBe("/join?place=s%C3%A3o%20paulo");
  });
});
