import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestRailDeviceType } from "./factories";

describe("rail device store integration", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("places and removes a rail device with working undo/redo", () => {
    const store = getLayoutStore();
    if (!store) throw new Error("getLayoutStore() returned null");

    const rack = store.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack() failed");

    store.addRailDeviceTypeRaw(
      createTestRailDeviceType({ slug: "e2e-rail-pdu" }),
    );

    const placed = store.placeRailDevice(
      rack.id,
      "e2e-rail-pdu",
      "left",
      "front",
    );
    expect(placed).toBe(true);

    const rackAfterPlace = store.layout.racks.find((r) => r.id === rack.id);
    // eslint-disable-next-line no-restricted-syntax -- placing one device should leave exactly one rail device
    expect(rackAfterPlace?.rail_devices).toHaveLength(1);

    store.undo();
    const rackAfterUndo = store.layout.racks.find((r) => r.id === rack.id);
    // eslint-disable-next-line no-restricted-syntax -- undo must leave exactly zero rail devices
    expect(rackAfterUndo?.rail_devices ?? []).toHaveLength(0);

    store.redo();
    const rackAfterRedo = store.layout.racks.find((r) => r.id === rack.id);
    // eslint-disable-next-line no-restricted-syntax -- redo must restore exactly one rail device
    expect(rackAfterRedo?.rail_devices).toHaveLength(1);

    store.removeRailDeviceFromRack(rack.id, 0);
    const rackAfterRemove = store.layout.racks.find((r) => r.id === rack.id);
    // eslint-disable-next-line no-restricted-syntax -- removing the device must leave exactly zero rail devices
    expect(rackAfterRemove?.rail_devices ?? []).toHaveLength(0);

    store.undo();
    const rackAfterRemoveUndo = store.layout.racks.find(
      (r) => r.id === rack.id,
    );
    // eslint-disable-next-line no-restricted-syntax -- undoing the removal must restore exactly one rail device
    expect(rackAfterRemoveUndo?.rail_devices).toHaveLength(1);
  });

  it("rejects placing a second device on an already-occupied rail slot", () => {
    const store = getLayoutStore();
    if (!store) throw new Error("getLayoutStore() returned null");

    const rack = store.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack() failed");

    store.addRailDeviceTypeRaw(
      createTestRailDeviceType({ slug: "e2e-rail-pdu" }),
    );
    store.placeRailDevice(rack.id, "e2e-rail-pdu", "left", "front");
    const second = store.placeRailDevice(
      rack.id,
      "e2e-rail-pdu",
      "left",
      "front",
    );

    expect(second).toBe(false);
  });
});
