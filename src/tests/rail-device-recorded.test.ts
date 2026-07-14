import { describe, it, expect, vi } from "vitest";
import {
  placeRailDeviceRecorded,
  removeRailDeviceRecorded,
} from "$lib/stores/layout/command-adapters";
import { addRailDeviceTypeRaw } from "$lib/stores/layout/mutators";
import type { LayoutStateAccess } from "$lib/stores/layout/types";
import {
  createTestLayout,
  createTestRack,
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

describe("placeRailDeviceRecorded", () => {
  it("places a device when the type exists and the slot is free", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(
      ctx,
      createTestRailDeviceType({ slug: "my-rail-pdu" }),
    );
    const result = placeRailDeviceRecorded(
      ctx,
      "rack-1",
      "my-rail-pdu",
      "left",
      "front",
    );
    expect(result).toBe(true);
    // eslint-disable-next-line no-restricted-syntax -- placing one device should leave exactly one rail device in the array
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(1);
  });

  it("returns false when the rack does not exist", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(
      ctx,
      createTestRailDeviceType({ slug: "my-rail-pdu" }),
    );
    const result = placeRailDeviceRecorded(
      ctx,
      "nonexistent",
      "my-rail-pdu",
      "left",
      "front",
    );
    expect(result).toBe(false);
  });

  it("returns false when the device type does not exist", () => {
    const ctx = createTestCtx();
    const result = placeRailDeviceRecorded(
      ctx,
      "rack-1",
      "unknown-slug",
      "left",
      "front",
    );
    expect(result).toBe(false);
  });

  it("returns false when the slot is already occupied", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(
      ctx,
      createTestRailDeviceType({ slug: "my-rail-pdu" }),
    );
    placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    const second = placeRailDeviceRecorded(
      ctx,
      "rack-1",
      "my-rail-pdu",
      "left",
      "front",
    );
    expect(second).toBe(false);
    // eslint-disable-next-line no-restricted-syntax -- placing on an occupied slot must be rejected, leaving exactly one rail device
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(1);
  });

  it("allows placing on the opposite side when one side is occupied", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(
      ctx,
      createTestRailDeviceType({ slug: "my-rail-pdu" }),
    );
    placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    const second = placeRailDeviceRecorded(
      ctx,
      "rack-1",
      "my-rail-pdu",
      "right",
      "front",
    );
    expect(second).toBe(true);
    // eslint-disable-next-line no-restricted-syntax -- placing on the opposite side must succeed, leaving exactly two rail devices
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(2);
  });
});

describe("removeRailDeviceRecorded", () => {
  it("removes the device at the given index", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(
      ctx,
      createTestRailDeviceType({ slug: "my-rail-pdu" }),
    );
    placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    removeRailDeviceRecorded(ctx, "rack-1", 0, (d) => d);
    // eslint-disable-next-line no-restricted-syntax -- removing the only placed device should leave zero rail devices
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(0);
  });

  it("is a no-op for an out-of-range index", () => {
    const ctx = createTestCtx();
    removeRailDeviceRecorded(ctx, "rack-1", 0, (d) => d);
    // eslint-disable-next-line no-restricted-syntax -- an out-of-range removal is a no-op, leaving zero rail devices
    expect(ctx.getLayout().racks[0]!.rail_devices ?? []).toHaveLength(0);
  });
});
