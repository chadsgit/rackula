import { describe, it, expect, vi } from "vitest";
import {
  createPlaceRailDeviceCommand,
  createRemoveRailDeviceCommand,
  type RailDeviceCommandStore,
} from "$lib/stores/commands/rail-device";
import { createTestRailDevice } from "./factories";

function createMockStore(): RailDeviceCommandStore & {
  placeRailDeviceRaw: ReturnType<typeof vi.fn>;
  removeRailDeviceAtIndexRaw: ReturnType<typeof vi.fn>;
  getRailDeviceAtIndex: ReturnType<typeof vi.fn>;
} {
  return {
    placeRailDeviceRaw: vi.fn(() => 0),
    removeRailDeviceAtIndexRaw: vi.fn(),
    getRailDeviceAtIndex: vi.fn(),
  };
}

describe("createPlaceRailDeviceCommand", () => {
  it("execute() calls placeRailDeviceRaw", () => {
    const device = createTestRailDevice();
    const store = createMockStore();
    const command = createPlaceRailDeviceCommand(device, store, "Test PDU");
    command.execute();
    expect(store.placeRailDeviceRaw).toHaveBeenCalledWith(device);
  });

  it("undo() removes the device at the index execute() placed it at", () => {
    const device = createTestRailDevice();
    const store = createMockStore();
    store.placeRailDeviceRaw.mockReturnValue(3);
    const command = createPlaceRailDeviceCommand(device, store, "Test PDU");
    command.execute();
    command.undo();
    expect(store.removeRailDeviceAtIndexRaw).toHaveBeenCalledWith(3);
  });

  it("undo() before execute() is a no-op", () => {
    const device = createTestRailDevice();
    const store = createMockStore();
    const command = createPlaceRailDeviceCommand(device, store, "Test PDU");
    command.undo();
    expect(store.removeRailDeviceAtIndexRaw).not.toHaveBeenCalled();
  });
});

describe("createRemoveRailDeviceCommand", () => {
  it("execute() calls removeRailDeviceAtIndexRaw with the given index", () => {
    const device = createTestRailDevice();
    const store = createMockStore();
    const command = createRemoveRailDeviceCommand(2, device, store, "Test PDU");
    command.execute();
    expect(store.removeRailDeviceAtIndexRaw).toHaveBeenCalledWith(2);
  });

  it("undo() re-places a deep copy of the removed device", () => {
    const device = createTestRailDevice({ id: "original-id" });
    const store = createMockStore();
    const command = createRemoveRailDeviceCommand(2, device, store, "Test PDU");
    command.execute();
    command.undo();
    expect(store.placeRailDeviceRaw).toHaveBeenCalledWith(
      expect.objectContaining({ id: "original-id" }),
    );
    // Deep copy, not the same object reference
    expect(store.placeRailDeviceRaw.mock.calls[0]![0]).not.toBe(device);
  });
});
