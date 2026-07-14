/**
 * Rail Device Commands for Undo/Redo
 */

import type { Command } from "./types";
import type { PlacedRailDevice } from "$lib/types";

/**
 * Interface for layout store operations needed by rail device commands
 */
export interface RailDeviceCommandStore {
  placeRailDeviceRaw(device: PlacedRailDevice): number;
  removeRailDeviceAtIndexRaw(index: number): PlacedRailDevice | undefined;
  getRailDeviceAtIndex(index: number): PlacedRailDevice | undefined;
}

/**
 * Create a command to place a rail device
 */
export function createPlaceRailDeviceCommand(
  device: PlacedRailDevice,
  store: RailDeviceCommandStore,
  deviceName: string = "rail device",
): Command {
  let placedIndex: number = -1;

  return {
    type: "PLACE_RAIL_DEVICE",
    description: `Place ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      placedIndex = store.placeRailDeviceRaw(device);
    },
    undo() {
      if (placedIndex >= 0) {
        store.removeRailDeviceAtIndexRaw(placedIndex);
      }
    },
  };
}

/**
 * Create a command to remove a rail device
 */
export function createRemoveRailDeviceCommand(
  index: number,
  device: PlacedRailDevice,
  store: RailDeviceCommandStore,
  deviceName: string = "rail device",
): Command {
  // Store a deep copy of the device for restoration
  const deviceCopy = structuredClone(device);

  return {
    type: "REMOVE_RAIL_DEVICE",
    description: `Remove ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      store.removeRailDeviceAtIndexRaw(index);
    },
    undo() {
      store.placeRailDeviceRaw(deviceCopy);
    },
  };
}
