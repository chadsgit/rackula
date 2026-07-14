import { describe, it, expect } from "vitest";
import { isRailSlotOccupied } from "$lib/utils/rail-collision";
import { createTestRack, createTestRailDevice } from "./factories";

describe("isRailSlotOccupied", () => {
  it("returns false for an empty rack", () => {
    const rack = createTestRack();
    expect(isRailSlotOccupied(rack, "left", "front")).toBe(false);
  });

  it("returns true when a device already occupies that side and face", () => {
    const railDevice = createTestRailDevice({ side: "left", face: "front" });
    const rack = createTestRack({ rail_devices: [railDevice] });
    expect(isRailSlotOccupied(rack, "left", "front")).toBe(true);
  });

  it("returns false for the opposite side even when one side is occupied", () => {
    const railDevice = createTestRailDevice({ side: "left", face: "front" });
    const rack = createTestRack({ rail_devices: [railDevice] });
    expect(isRailSlotOccupied(rack, "right", "front")).toBe(false);
  });

  it("returns false for the opposite face on the same side", () => {
    const railDevice = createTestRailDevice({ side: "left", face: "front" });
    const rack = createTestRack({ rail_devices: [railDevice] });
    expect(isRailSlotOccupied(rack, "left", "rear")).toBe(false);
  });

  it("treats face 'both' as occupying front and rear on that side", () => {
    const railDevice = createTestRailDevice({ side: "left", face: "both" });
    const rack = createTestRack({ rail_devices: [railDevice] });
    expect(isRailSlotOccupied(rack, "left", "front")).toBe(true);
    expect(isRailSlotOccupied(rack, "left", "rear")).toBe(true);
  });

  it("excludes the device at excludeIndex (for move operations)", () => {
    const railDevice = createTestRailDevice({ side: "left", face: "front" });
    const rack = createTestRack({ rail_devices: [railDevice] });
    expect(isRailSlotOccupied(rack, "left", "front", 0)).toBe(false);
  });

  it("handles a rack with no rail_devices array at all", () => {
    const rack = createTestRack();
    delete rack.rail_devices;
    expect(isRailSlotOccupied(rack, "left", "front")).toBe(false);
  });
});
