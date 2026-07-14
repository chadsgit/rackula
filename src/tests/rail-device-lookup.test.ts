import { describe, it, expect } from "vitest";
import { findRailDeviceType } from "$lib/utils/rail-device-lookup";
import { createTestRailDeviceType } from "./factories";

describe("findRailDeviceType", () => {
  it("finds a device type in the layout's rail_device_types first", () => {
    const layoutType = createTestRailDeviceType({ slug: "layout-rail-pdu" });
    const found = findRailDeviceType("layout-rail-pdu", [layoutType]);
    expect(found).toBe(layoutType);
  });

  it("returns undefined when not found anywhere", () => {
    const found = findRailDeviceType("does-not-exist", []);
    expect(found).toBeUndefined();
  });

  it("defaults layoutRailDeviceTypes to an empty array", () => {
    const found = findRailDeviceType("does-not-exist");
    expect(found).toBeUndefined();
  });
});
