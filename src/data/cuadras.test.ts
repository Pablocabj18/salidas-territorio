import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const geojson = JSON.parse(readFileSync(resolve("public/cuadras.geojson"), "utf8"));

describe("geometría de cuadras", () => {
  it("cubre los 96 territorios con identificadores únicos", () => {
    const ids = geojson.features.map((feature: any) => feature.properties.id);
    const territorios = new Set(geojson.features.map((feature: any) => feature.properties.territorioId));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...territorios].sort((a: any, b: any) => a - b)).toEqual(Array.from({ length: 96 }, (_, index) => index + 1));
  });

  it("conserva procedencia y polígonos con área operativa", () => {
    expect(geojson.metadata.source).toContain("OpenStreetMap");
    expect(geojson.features.length).toBe(403);
    expect(geojson.features.every((feature: any) => ["Polygon", "MultiPolygon"].includes(feature.geometry.type))).toBe(true);
    expect(geojson.features.every((feature: any) => feature.properties.areaM2 >= 650)).toBe(true);
  });
});
