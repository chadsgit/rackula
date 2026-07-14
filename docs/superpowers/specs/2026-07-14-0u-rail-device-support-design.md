# 0U Rail Device Support

**Date:** 2026-07-14
**Status:** Design approved
**Relationship:** Phase 0 foundation for the Automated Cabling Planner spec (external, in the
Sightline repo at `docs/planning/specs/rackula-automated-cabling-planner-spec.md`), but stands
alone as a real fix independent of that larger effort.

## Problem

Rackula's device model has no concept of a 0U (zero rack-unit) device. `DeviceType.u_height` has
a hard floor of 0.5U in the Zod schema, and rack-level placement (`canPlaceDevice`) rejects any
position below U1. Vertical side-mount PDUs — a real, common category of rack equipment (Lenovo
SMART 24A, and Eaton/Tripp Lite's `B064`/`B072`/`B096`/`B097` vertical PDU lines) — physically
mount to the rack's vertical rail rather than occupying a numbered U slot, and can't be modeled
correctly today.

The existing Eaton brand pack (`src/lib/data/brandPacks/eaton.ts`) currently forces these
vertical units into `u_height: 1`, which is physically wrong and would visually collide with
anything else placed at that U position.

## Approach

Add 0U devices as a genuinely separate placement concept — a new `rack.rail_devices` array,
parallel to `rack.devices` — rather than extending the existing U-slot `PlacedDevice`/collision
system. This mirrors how the container/slot system (v0.6.0) was added as its own parallel
concept for a different kind of "doesn't compete for U-slot collision" device, rather than
bolted onto the main collision path.

The device *type* (library template) is a separate `RailDeviceType` interface and a parallel
`layout.rail_device_types` array, not an extension of `DeviceType`/`layout.device_types`.
`DeviceType.u_height` is read in 64 places across 25 files under TypeScript strict mode; making
it optional (the original plan) would force null-handling into every one of those call sites
regardless of whether they'll ever see a rail device. A dedicated `RailDeviceType` with no
`u_height` field at all keeps the existing type and its 64 consumers completely untouched, at
the cost of a small amount of duplicated device-library plumbing (palette listing, search) to
also surface rail device types alongside regular ones.

## Decisions

- `RailDeviceType` interface (new, separate from `DeviceType`) with no `u_height` field —
  covers the same identity/metadata fields as `DeviceType` (slug, manufacturer, model,
  part_number, colour, category, tags, notes, links, custom_fields, power_outlets) minus
  anything rack-U-specific. New `layout.rail_device_types: RailDeviceType[]` array, parallel to
  `layout.device_types`.
- New `PlacedRailDevice` type, new `rack.rail_devices: PlacedRailDevice[]` array. Does not touch
  `PlacedDevice`, `rack.devices`, or the existing U-slot collision code in `collision.ts`.
- `side: 'left' | 'right'` + `face: DeviceFace` (reusing the existing front/rear/both type)
  together identify one of up to 4 physical rail positions per rack (front-left, front-right,
  rear-left, rear-right) — matching how 4-post cabinets physically have 4 vertical rails.
- Collision rule for v1: at most one `PlacedRailDevice` per `(side, face)` pair, full stop. No
  overlap math, no vertical positioning.
- Reserved (not implemented in v1) fields `height_u?` / `offset_u?` on `PlacedRailDevice`, as a
  forward hook for future partial-height / stacked rail devices. v1 placement and collision
  logic ignore them entirely.
- Rendering: rack SVG (`RackFrame.svelte`/`Rack.svelte`) gains a narrow vertical strip outside
  the existing U-grid on each occupied side, full rack height, styled like `RackDevice.svelte`
  (colour, label). Chosen over a compact badge/icon because it's what these devices actually
  look like mounted, and gives later cabling-planner visualization (physical rack overlay) real
  geometry to anchor cable routes to instead of needing a rework.
- Placement UX: drag-and-drop from the device library onto the rail zone, same interaction
  pattern as every other device placement in Rackula. `rack-drop-coordinator.ts` gets a new
  drop-zone check for the rail x-coordinate ranges, dispatching a rail-placement mutator instead
  of the existing U-position calculation.
- Brand pack: move Eaton's Tripp Lite `B064`/`B072`/`B096`/`B097` lines (currently wrongly
  `u_height: 1` in `eatonDevices: DeviceType[]`) out into a new `eatonRailDevices:
  RailDeviceType[]` export in the same file, aggregated in `brandPacks/index.ts` alongside the
  existing `eatonDevices` wiring. Leave `PDUMH*`, `PW1*`, and the UPS entries (`5PX`/`9PX`/
  `SMART*`) in the regular array — those are genuinely rack-mount. Exact model-by-model
  confirmation against Tripp Lite/Eaton datasheets is an implementation-time verification task,
  not asserted here from memory.
- Greenfield fix, no migration path: existing saved layouts referencing a reclassified slug at
  a U position become an orphaned reference, same as any other breaking device-type change.
  Matches this repo's stated "no migration or legacy support" philosophy.

## Out of scope (deferred, not forgotten)

- Multiple/stacked rail devices per side (reserved fields exist, no v1 UI or logic)
- Cable routing through 0U devices — that's the cabling planner's own Phase 3
  (`0U routing accessory` pathway)
- Auditing other brand packs (Lenovo, APC, etc.) for the same 0U-forced-into-U-height mistake —
  follow-up work, not blocking this PR
- NetBox round-trip compatibility for `mount_type` — NetBox's own DeviceType schema has no 0U
  side-rail concept either, so this is a genuine Rackula-specific extension (like `RackWidth`
  already is). Worth a doc note; not a blocker.

## Testing

Per this repo's testing rules: behavioral tests only, no DOM-query/render-only tests.

- Rail occupancy collision: `isRailSlotOccupied` correctly reports occupied/free per
  `(side, face)`, and rejects a second device in an already-occupied slot.
- Schema validation: `mount_type: 'rail'` accepts a `DeviceType` without `u_height`;
  `mount_type: 'rack-u'` (or default/absent) still requires it.
- Brand pack: existing "one schema validation test covers all devices" pattern extends
  naturally — no new per-device test needed for the reclassified Eaton entries.

## Open questions carried forward

- No rack-level weight/power-draw aggregation exists today (checked `layout-helpers.ts` and
  `export.ts` — device `weight`/`va_rating` fields are stored but never summed). If that gets
  built later, it needs to iterate `rack.rail_devices` alongside `rack.devices`, or it will
  silently under-report anything with a rail-mounted PDU or UPS.
