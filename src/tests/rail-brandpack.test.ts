import { describe, it, expect } from "vitest";
import { eatonDevices, eatonRailDevices } from "$lib/data/brandPacks/eaton";
import {
  getAllBrandRailDeviceTypes,
  findBrandRailDeviceType,
} from "$lib/data/brandPacks";
import { RailDeviceTypeSchema } from "$lib/schemas";

describe("eatonRailDevices", () => {
  it("is non-empty", () => {
    expect(eatonRailDevices.length).toBeGreaterThan(0);
  });

  it("every entry validates against RailDeviceTypeSchema", () => {
    for (const device of eatonRailDevices) {
      const result = RailDeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
    }
  });

  it("no rail device slug also appears in eatonDevices (no duplicate representation)", () => {
    const railSlugs = new Set(eatonRailDevices.map((d) => d.slug));
    const overlap = eatonDevices.filter((d) => railSlugs.has(d.slug));
    expect(overlap).toEqual([]);
  });
});

describe("getAllBrandRailDeviceTypes / findBrandRailDeviceType", () => {
  it("includes eaton rail devices", () => {
    const all = getAllBrandRailDeviceTypes();
    expect(all.some((d) => d.slug === "eaton-tripp-lite-b064-016-02-ipg")).toBe(
      true,
    );
  });

  it("finds a known slug", () => {
    const found = findBrandRailDeviceType("eaton-tripp-lite-b096-032");
    expect(found?.model).toBe("Tripp Lite B096-032");
  });

  it("returns undefined for an unknown slug", () => {
    expect(findBrandRailDeviceType("not-a-real-slug")).toBeUndefined();
  });
});
