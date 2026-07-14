/**
 * Rail Device Type Lookup Utility
 * Mirrors device-lookup.ts's findDeviceType, for RailDeviceType.
 *
 * Priority order:
 * 1. Layout rail_device_types (user's custom/imported types)
 * 2. Brand packs (vendor-specific rail devices - e.g. Eaton vertical PDUs)
 */

import type { RailDeviceType } from "$lib/types";
import { findBrandRailDeviceType } from "$lib/data/brandPacks";

/**
 * Find a rail device type by slug across all sources
 *
 * @param slug - Rail device type slug to find
 * @param layoutRailDeviceTypes - Rail device types from the current layout (optional)
 * @returns RailDeviceType or undefined if not found
 */
export function findRailDeviceType(
  slug: string,
  layoutRailDeviceTypes: RailDeviceType[] = [],
): RailDeviceType | undefined {
  const layoutDevice = layoutRailDeviceTypes.find((dt) => dt.slug === slug);
  if (layoutDevice) {
    return layoutDevice;
  }

  const brandDevice = findBrandRailDeviceType(slug);
  if (brandDevice) {
    return brandDevice;
  }

  return undefined;
}
