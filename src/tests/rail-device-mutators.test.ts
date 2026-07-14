import { describe, it, expect, vi } from "vitest";
import {
  addRailDeviceTypeRaw,
  placeRailDeviceRaw,
  removeRailDeviceAtIndexRaw,
  getRailDeviceAtIndex,
} from "$lib/stores/layout/mutators";
import type { LayoutStateAccess } from "$lib/stores/layout/types";
import {
  createTestLayout,
  createTestRack,
  createTestRailDevice,
  createTestRailDeviceType,
} from "./factories";

function createTestCtx(): LayoutStateAccess {
  let layout = createTestLayout({ racks: [createTestRack({ id: "rack-1" })] });
  let activeRackId: string | null = "rack-1";
  return {
    getLayout: () => layout,
    setLayout: (l) => {
      layout = l;
    },
    getActiveRackId: () => activeRackId,
    setActiveRackId: (id) => {
      activeRackId = id;
    },
    markDirty: vi.fn(),
    markStarted: vi.fn(),
    getRackGroups: () => layout.rack_groups ?? [],
    findRack: (id) => layout.racks.find((r) => r.id === id),
    findRackIndex: (id) => layout.racks.findIndex((r) => r.id === id),
  };
}

describe("addRailDeviceTypeRaw", () => {
  it("adds a rail device type to layout.rail_device_types", () => {
    const ctx = createTestCtx();
    const railType = createTestRailDeviceType({ slug: "my-rail-pdu" });
    addRailDeviceTypeRaw(ctx, railType);
    expect(ctx.getLayout().rail_device_types).toContainEqual(railType);
  });
});

describe("placeRailDeviceRaw", () => {
  it("places a rail device and returns its index", () => {
    const ctx = createTestCtx();
    const device = createTestRailDevice({ side: "left", face: "front" });
    const index = placeRailDeviceRaw(ctx, device);
    expect(index).toBe(0);
    // eslint-disable-next-line no-restricted-syntax -- placing one device should leave exactly one rail device in the array
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(1);
  });

  it("returns -1 when no target rack is available", () => {
    const ctx = createTestCtx();
    ctx.setActiveRackId(null);
    const device = createTestRailDevice();
    const index = placeRailDeviceRaw(ctx, device, "nonexistent-rack");
    expect(index).toBe(-1);
  });

  it("regenerates the id if it collides with an existing rail device (#1363-style guard)", () => {
    const ctx = createTestCtx();
    const first = createTestRailDevice({
      id: "dup-id",
      side: "left",
      face: "front",
    });
    const second = createTestRailDevice({
      id: "dup-id",
      side: "right",
      face: "front",
    });
    placeRailDeviceRaw(ctx, first);
    placeRailDeviceRaw(ctx, second);
    const rack = ctx.getLayout().racks[0]!;
    expect(rack.rail_devices![0]!.id).toBe("dup-id");
    expect(rack.rail_devices![1]!.id).not.toBe("dup-id");
  });
});

describe("removeRailDeviceAtIndexRaw", () => {
  it("removes and returns the device at the given index", () => {
    const ctx = createTestCtx();
    const device = createTestRailDevice();
    placeRailDeviceRaw(ctx, device);
    const removed = removeRailDeviceAtIndexRaw(ctx, 0);
    expect(removed?.id).toBe(device.id);
    // eslint-disable-next-line no-restricted-syntax -- removing the only placed device should leave zero rail devices
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(0);
  });

  it("returns undefined for an out-of-range index", () => {
    const ctx = createTestCtx();
    expect(removeRailDeviceAtIndexRaw(ctx, 0)).toBeUndefined();
  });
});

describe("getRailDeviceAtIndex", () => {
  it("returns the device at the given index", () => {
    const ctx = createTestCtx();
    const device = createTestRailDevice();
    placeRailDeviceRaw(ctx, device);
    expect(getRailDeviceAtIndex(ctx, 0)?.id).toBe(device.id);
  });
});
