import { describe, expect, it } from "vitest";
import { type Node, type PlacePin, toPoints } from "./map-points";

function place(id: string, activated = false, nodeId: string | null = null): PlacePin {
  return {
    id,
    name: id,
    slug: id,
    latitude: 10,
    longitude: 20,
    activated,
    nodeId,
  } as PlacePin;
}

function community(nodeId: string, placeId: string | null): Node {
  return {
    nodeId,
    name: nodeId,
    slug: nodeId,
    placeId,
    location: "",
    latitude: placeId ? null : 1,
    longitude: placeId ? null : 2,
  } as Node;
}

describe("toPoints", () => {
  const catalog = [
    place("lagos"),
    place("lima"),
    place("kuala-lumpur", true, "kl"),
    place("india"),
  ];
  const nodes = [community("india-node", "india"), community("nyc", null)];

  it("shows live communities and activated places only when places are off", () => {
    const points = toPoints(nodes, catalog, nodes, catalog, false);
    expect(points.map((point) => point.id)).toEqual(["india-node", "nyc", "kuala-lumpur"]);
    expect(points.every((point) => point.activated)).toBe(true);
  });

  it("adds unactivated places when the places layer is on", () => {
    const points = toPoints(nodes, catalog, nodes, catalog, true);
    expect(points.map((point) => point.id)).toEqual([
      "india-node",
      "nyc",
      "lagos",
      "lima",
      "kuala-lumpur",
    ]);
  });

  it("places a community on its place's coordinates", () => {
    const [india] = toPoints(nodes, catalog, nodes, catalog, false);
    expect(india).toMatchObject({ latitude: 10, longitude: 20, kind: "community" });
  });
});
