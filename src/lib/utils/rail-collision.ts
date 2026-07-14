/**
 * Rail Device Collision Detection
 *
 * 0U rail-mounted devices don't occupy U-slot ranges - collision is
 * simply "is this (side, face) rail position already occupied?"
 * Deliberately separate from collision.ts (U-slot collision), which
 * this module does not import from or depend on.
 */

import type { DeviceFace, Rack, RailSide } from "$lib/types";
import { doFacesCollide } from "$lib/utils/collision";

/**
 * Check if a rail slot (side + face) is already occupied by another
 * placed rail device.
 *
 * @param rack - The rack to check
 * @param side - Rail side to check ('left' or 'right')
 * @param face - Face to check ('front', 'rear', or 'both')
 * @param excludeIndex - Optional index in rack.rail_devices to exclude (for move operations)
 * @returns true if the slot is occupied by another device
 */
export function isRailSlotOccupied(
  rack: Rack,
  side: RailSide,
  face: DeviceFace,
  excludeIndex?: number,
): boolean {
  const railDevices = rack.rail_devices ?? [];
  return railDevices.some((device, i) => {
    if (excludeIndex !== undefined && i === excludeIndex) return false;
    if (device.side !== side) return false;
    return doFacesCollide(face, device.face);
  });
}
