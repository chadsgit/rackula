# 0U Rail Device Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully working, tested data/store layer for 0U rail-mounted devices (vertical side-mount PDUs) — types, Zod validation, collision, undo/redo-backed placement, and the Eaton brand-pack fix — with zero changes to existing device/rack code paths.

**Architecture:** Rail devices are a second, parallel system to the existing U-slot device model, not an extension of it. New `RailDeviceType` (catalog) and `PlacedRailDevice` (placement) types live in their own arrays (`layout.rail_device_types`, `rack.rail_devices`), with their own collision check, their own raw mutators, and their own undo/redo commands — mirroring the existing `DeviceType`/`PlacedDevice` machinery file-for-file rather than branching inside it. This plan produces no UI: it's exercised entirely through the store API and tests. Drag-and-drop placement and SVG rendering are a follow-up plan (Plan B) built on top of the API this plan ships.

**Tech Stack:** Svelte 5 (runes), TypeScript strict mode, Zod, Vitest.

## Global Constraints

- TypeScript strict mode — no implicit `any`, no unchecked optional access.
- No DOM-query assertions, no hardcoded `toHaveLength(literal)` on data arrays, no hardcoded colour assertions (ESLint hard-blocks these — see this repo's CLAUDE.md Testing Rules).
- "Zero-Change Rule": the brand-pack data change (Task 8) must require zero test *file* changes elsewhere — new tests, not edits to existing ones.
- No migration/legacy-support code paths — existing saved layouts referencing a reclassified brand-pack slug at a U position simply become an orphaned reference, same as any other breaking device-type change (repo's stated greenfield philosophy).
- Every new raw mutator follows the existing `getTargetRack` + `updateRackAtIndex` immutable-update pattern from `src/lib/stores/layout/mutators.ts` — no direct mutation of `ctx.getLayout()` results.
- Commit after every task.

---

### Task 1: Types — RailDeviceType, PlacedRailDevice, Layout/Rack extensions

**Files:**
- Modify: `src/lib/types/index.ts:33` (near `DeviceFace`, for `RailSide`)
- Modify: `src/lib/types/index.ts:552` (after `DeviceType` interface, insert `RailDeviceType`)
- Modify: `src/lib/types/index.ts:620` (after `PlacedDevice` interface, insert `PlacedRailDevice`)
- Modify: `src/lib/types/index.ts:649` (`Rack.devices` field, add sibling field)
- Modify: `src/lib/types/index.ts:707` (`Layout.device_types` field, add sibling field)

**Interfaces:**
- Produces: `RailSide`, `RailDeviceType`, `PlacedRailDevice` — every later task in this plan imports these from `$lib/types`.

- [ ] **Step 1: Add `RailSide` type next to `DeviceFace`**

At `src/lib/types/index.ts:33`, immediately after the existing line:
```ts
export type DeviceFace = "front" | "rear" | "both";
```
add:
```ts
/**
 * Which vertical rail a 0U device mounts to.
 * Combined with DeviceFace (front/rear), identifies one of up to 4 physical
 * rail positions per rack: front-left, front-right, rear-left, rear-right.
 */
export type RailSide = "left" | "right";
```

- [ ] **Step 2: Add `RailDeviceType` interface after `DeviceType`**

At `src/lib/types/index.ts:552`, immediately after the closing `}` of the `DeviceType` interface (which ends with the `slots?: Slot[];` field and its closing brace), insert:
```ts
/**
 * Rail Device Type - template definition for 0U (zero rack-unit) devices
 * that mount to a rack's vertical rail rather than occupying a numbered U slot
 * (e.g. vertical PDUs). Deliberately separate from DeviceType: DeviceType.u_height
 * is read in 64+ places across the codebase under the assumption it's always a
 * number, and rail devices have no rack-unit height at all.
 */
export interface RailDeviceType {
  /** Unique identifier, kebab-case slug */
  slug: string;
  /** Manufacturer name */
  manufacturer?: string;
  /** Model name */
  model?: string;
  /** Part number / SKU */
  part_number?: string;
  /** Whether device is powered */
  is_powered?: boolean;
  /** Device weight */
  weight?: number;
  /** Weight unit (required if weight is provided) */
  weight_unit?: WeightUnit;
  /** Front image exists */
  front_image?: boolean;
  /** Rear image exists */
  rear_image?: boolean;
  /** Hex colour for display (e.g., '#4A90D9') */
  colour: string;
  /** Device category for UI filtering */
  category: DeviceCategory;
  /** User organization tags */
  tags?: string[];
  /** Notes/comments */
  notes?: string;
  /** Legacy comments field from NetBox imports */
  comments?: string;
  /** Serial number */
  serial_number?: string;
  /** Asset tag */
  asset_tag?: string;
  /** External links */
  links?: DeviceLink[];
  /** User-defined custom fields */
  custom_fields?: Record<string, unknown>;
  /** Power output outlets (for PDUs) */
  power_outlets?: PowerOutlet[];
  /** VA capacity (e.g., 1500, 3000) - for UPS devices */
  va_rating?: number;
  /** Legacy outlet count summary for power devices */
  outlet_count?: number;
}
```

- [ ] **Step 3: Add `PlacedRailDevice` interface after `PlacedDevice`**

At `src/lib/types/index.ts:620`, immediately after the closing `}` of the `PlacedDevice` interface, insert:
```ts
/**
 * Placed rail device - storage format
 * References a RailDeviceType by slug. Lives in Rack.rail_devices, a
 * separate array from Rack.devices — never participates in U-slot collision.
 */
export interface PlacedRailDevice {
  /** Unique identifier (UUID) for stable references */
  id: string;
  /** Reference to RailDeviceType.slug */
  device_type: string;
  /** Which vertical rail this device mounts to */
  side: RailSide;
  /** Which face of the rack (front/rear) - combined with side identifies one of up to 4 rail positions */
  face: DeviceFace;
  /** Optional custom display name for this placement */
  name?: string;
  /** Notes for this placement */
  notes?: string;
  /** User-defined custom fields */
  custom_fields?: Record<string, unknown>;
  /** Custom colour for this specific placement (overrides device type colour) */
  colour_override?: string;
  /**
   * Reserved for future partial-height / stacked rail devices.
   * NOT used by v1 placement or collision logic - v1 collision is
   * "at most one PlacedRailDevice per (side, face)", full stop.
   */
  height_u?: number;
  offset_u?: number;
}
```

- [ ] **Step 4: Add `rail_devices` to `Rack` and `rail_device_types` to `Layout`**

At `src/lib/types/index.ts:649`, the `Rack` interface currently has:
```ts
  /** Devices placed in this rack */
  devices: PlacedDevice[];
```
Add immediately after it:
```ts
  /** 0U rail-mounted devices in this rack (left/right vertical rail, front/rear) */
  rail_devices?: PlacedRailDevice[];
```

At `src/lib/types/index.ts:707`, the `Layout` interface currently has:
```ts
  /** Device type library */
  device_types: DeviceType[];
```
Add immediately after it:
```ts
  /** Rail (0U) device type library */
  rail_device_types?: RailDeviceType[];
```

- [ ] **Step 5: Typecheck**

Run: `npm run build` (or `npx svelte-check` if faster — check `package.json` scripts; use whichever this repo's `npm run lint`/typecheck script actually is)
Expected: no new errors. `rail_devices`/`rail_device_types` are optional, so no existing object literal constructing a `Rack` or `Layout` needs updating.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat: add RailDeviceType, PlacedRailDevice types for 0U rail devices"
```

---

### Task 2: Zod schemas for rail devices

**Files:**
- Modify: `src/lib/schemas/index.ts:75` (near `WeightUnitSchema`, add `RailSideSchema`)
- Modify: `src/lib/schemas/index.ts:540` (after `DeviceTypeSchema`, add `RailDeviceTypeSchema`)
- Modify: `src/lib/schemas/index.ts:618` (after `PlacedDeviceSchema`, add `PlacedRailDeviceSchema`)
- Modify: `src/lib/schemas/index.ts:647,679` (`RackSchemaInput`/`RackSchema`, add `rail_devices` field)
- Modify: `src/lib/schemas/index.ts:767` (`LayoutSchemaBase`, add `rail_device_types` field)
- Test: `src/tests/rail-device-schema.test.ts` (new)

**Interfaces:**
- Consumes: `RailSide`, `RailDeviceType`, `PlacedRailDevice` from Task 1.
- Produces: `RailDeviceTypeSchema`, `PlacedRailDeviceSchema`, `RailSideSchema` — consumed by Task 8 (brand pack) implicitly via TS structural typing, and directly usable by any future YAML import validation.

- [ ] **Step 1: Write the failing schema tests**

Create `src/tests/rail-device-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { RailDeviceTypeSchema, PlacedRailDeviceSchema } from "$lib/schemas";

describe("RailDeviceTypeSchema", () => {
  it("accepts a minimal valid rail device type with no u_height field", () => {
    const result = RailDeviceTypeSchema.safeParse({
      slug: "test-rail-pdu",
      colour: "#4A90D9",
      category: "power",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rail device type missing required colour", () => {
    const result = RailDeviceTypeSchema.safeParse({
      slug: "test-rail-pdu",
      category: "power",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid category", () => {
    const result = RailDeviceTypeSchema.safeParse({
      slug: "test-rail-pdu",
      colour: "#4A90D9",
      category: "not-a-real-category",
    });
    expect(result.success).toBe(false);
  });
});

describe("PlacedRailDeviceSchema", () => {
  it("accepts a minimal valid placed rail device", () => {
    const result = PlacedRailDeviceSchema.safeParse({
      id: "rail-device-1",
      device_type: "test-rail-pdu",
      side: "left",
      face: "front",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid side value", () => {
    const result = PlacedRailDeviceSchema.safeParse({
      id: "rail-device-1",
      device_type: "test-rail-pdu",
      side: "top",
      face: "front",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing id", () => {
    const result = PlacedRailDeviceSchema.safeParse({
      device_type: "test-rail-pdu",
      side: "left",
      face: "front",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-device-schema.test.ts`
Expected: FAIL — `RailDeviceTypeSchema`/`PlacedRailDeviceSchema` not exported from `$lib/schemas`.

- [ ] **Step 3: Add `RailSideSchema`**

At `src/lib/schemas/index.ts:75`, immediately after:
```ts
export const WeightUnitSchema = z.enum(["kg", "lb"]);
```
add:
```ts
export const RailSideSchema = z.enum(["left", "right"]);
```

- [ ] **Step 4: Add `RailDeviceTypeSchema`**

At `src/lib/schemas/index.ts:540`, immediately after the closing `.passthrough();` of `DeviceTypeSchema`, insert:
```ts
/**
 * Rail Device Type schema - 0U devices with no rack-unit height.
 * Deliberately separate from DeviceTypeSchema - see RailDeviceType in types/index.ts.
 */
export const RailDeviceTypeSchema = z
  .object({
    slug: SlugSchema,
    manufacturer: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    part_number: z.string().max(100).optional(),
    is_powered: z.boolean().optional(),
    weight: z.number().positive().optional(),
    weight_unit: WeightUnitSchema.optional(),
    front_image: z.boolean().optional(),
    rear_image: z.boolean().optional(),
    colour: z
      .string()
      .regex(HEX_COLOUR_PATTERN, "Colour must be a valid 6-character hex code"),
    category: DeviceCategorySchema,
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    comments: z.string().optional(),
    serial_number: z.string().optional(),
    asset_tag: z.string().optional(),
    links: z.array(DeviceLinkSchema).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
    power_outlets: z.array(PowerOutletSchema).optional(),
    va_rating: z.number().positive().optional(),
    outlet_count: z.number().int().positive().optional(),
  })
  .passthrough();

export type RailDeviceTypeZod = z.infer<typeof RailDeviceTypeSchema>;
```

- [ ] **Step 5: Add `PlacedRailDeviceSchema`**

At `src/lib/schemas/index.ts:618`, immediately after the closing `);` of `PlacedDeviceSchema`'s second `.refine()` call, insert:
```ts
/**
 * Placed rail device schema - 0U device instance in a rack.
 * No position/container fields - collision is "one per (side, face)", not U-range based.
 */
export const PlacedRailDeviceSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    device_type: SlugSchema,
    side: RailSideSchema,
    face: DeviceFaceSchema,
    name: z.string().max(100, "Name must be 100 characters or less").optional(),
    notes: z.string().max(1000).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
    colour_override: z
      .string()
      .regex(
        /^#[0-9A-Fa-f]{6}$/,
        "Colour must be a valid hex colour (e.g., #FF5555)",
      )
      .optional(),
    // Reserved for future partial-height/stacked rail devices - unused by v1 logic
    height_u: z.number().positive().optional(),
    offset_u: z.number().min(0).optional(),
  })
  .passthrough();

export type PlacedRailDeviceZod = z.infer<typeof PlacedRailDeviceSchema>;
```

- [ ] **Step 6: Add `rail_devices` to `RackSchemaInput` and `RackSchema`**

At `src/lib/schemas/index.ts:647` (inside `RackSchemaInput`), the line currently reads:
```ts
    devices: z.array(PlacedDeviceSchema),
```
Change to:
```ts
    devices: z.array(PlacedDeviceSchema),
    rail_devices: z.array(PlacedRailDeviceSchema).optional(),
```

At `src/lib/schemas/index.ts:679` (inside `RackSchema`, now shifted a few lines down from the edit above — locate by the identical `devices: z.array(PlacedDeviceSchema),` line inside the *second* schema object, the one with `id: z.string().min(1, "Rack ID is required")` above it), apply the same change:
```ts
    devices: z.array(PlacedDeviceSchema),
    rail_devices: z.array(PlacedRailDeviceSchema).optional(),
```

- [ ] **Step 7: Add `rail_device_types` to the layout schema**

At `src/lib/schemas/index.ts:767` (now shifted down by the Step 6 edits — locate by the unique line `device_types: z.array(DeviceTypeSchema),`), change:
```ts
    device_types: z.array(DeviceTypeSchema),
```
to:
```ts
    device_types: z.array(DeviceTypeSchema),
    rail_device_types: z.array(RailDeviceTypeSchema).optional(),
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-device-schema.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Typecheck and full schema test suite**

Run: `npm run build` (typecheck) then `npx vitest run src/tests/`
Expected: no new errors; no existing test broken by the additive `.optional()` fields.

- [ ] **Step 10: Commit**

```bash
git add src/lib/schemas/index.ts src/tests/rail-device-schema.test.ts
git commit -m "feat: add Zod schemas for RailDeviceType and PlacedRailDevice"
```

---

### Task 3: Rail collision helper

**Files:**
- Create: `src/lib/utils/rail-collision.ts`
- Test: `src/tests/rail-collision.test.ts`
- Modify: `src/tests/factories.ts` (add `createTestRailDeviceType`, `createTestRailDevice`)

**Interfaces:**
- Consumes: `RailSide`, `PlacedRailDevice`, `RailDeviceType`, `Rack` from `$lib/types` (Task 1).
- Produces: `isRailSlotOccupied(rack, side, face, excludeIndex?): boolean` — consumed by Task 7's `placeRailDeviceRecorded`.

- [ ] **Step 1: Add test factories**

In `src/tests/factories.ts`, add `RailDeviceType` and `PlacedRailDevice` to the type import block at the top (currently lines 16-28):
```ts
import type {
  Rack,
  DeviceType,
  PlacedDevice,
  DeviceFace,
  DeviceCategory,
  Layout,
  LayoutSettings,
  Airflow,
  Slot,
  RackWidth,
  SlotWidth,
  RailDeviceType,
  PlacedRailDevice,
  RailSide,
} from "$lib/types";
```

Then, after the existing `createTestDevice` function (ends at line 154), add a new section:
```ts
// =============================================================================
// RailDeviceType / PlacedRailDevice Factories
// =============================================================================

export interface CreateTestRailDeviceTypeOptions {
  slug?: string;
  model?: string;
  manufacturer?: string;
  category?: DeviceCategory;
  colour?: string;
}

/**
 * Creates a test RailDeviceType with sensible defaults.
 */
export function createTestRailDeviceType(
  overrides: CreateTestRailDeviceTypeOptions = {},
): RailDeviceType {
  return {
    slug: overrides.slug ?? "test-rail-pdu",
    model: overrides.model ?? "Test Rail PDU",
    category: overrides.category ?? "power",
    colour: overrides.colour ?? "#FFB86C",
    ...(overrides.manufacturer ? { manufacturer: overrides.manufacturer } : {}),
  };
}

/**
 * Creates a test PlacedRailDevice with sensible defaults.
 */
export function createTestRailDevice(
  overrides: Partial<PlacedRailDevice> = {},
): PlacedRailDevice {
  return {
    id: overrides.id ?? generateId(),
    device_type: "test-rail-pdu",
    side: "left" as RailSide,
    face: "front" as DeviceFace,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing collision tests**

Create `src/tests/rail-collision.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-collision.test.ts`
Expected: FAIL — `$lib/utils/rail-collision` module not found.

- [ ] **Step 4: Implement `isRailSlotOccupied`**

Create `src/lib/utils/rail-collision.ts`:
```ts
/**
 * Rail Device Collision Detection
 *
 * 0U rail-mounted devices don't occupy U-slot ranges - collision is
 * simply "is this (side, face) rail position already occupied?"
 * Deliberately separate from collision.ts (U-slot collision), which
 * this module does not import from or depend on.
 */

import type { DeviceFace, PlacedRailDevice, Rack, RailSide } from "$lib/types";
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-collision.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/rail-collision.ts src/tests/rail-collision.test.ts src/tests/factories.ts
git commit -m "feat: add rail slot collision detection"
```

---

### Task 4: Raw mutators for rail devices

**Files:**
- Modify: `src/lib/stores/layout/mutators.ts`
- Test: `src/tests/rail-device-mutators.test.ts` (new)

**Interfaces:**
- Consumes: `PlacedRailDevice`, `RailDeviceType` from `$lib/types` (Task 1); `getTargetRack`, `updateRackAtIndex`, `generateUniqueDeviceId` (existing, same file).
- Produces: `addRailDeviceTypeRaw(ctx, railDeviceType)`, `placeRailDeviceRaw(ctx, device, rackId?): number`, `removeRailDeviceAtIndexRaw(ctx, index): PlacedRailDevice | undefined`, `getRailDeviceAtIndex(ctx, index): PlacedRailDevice | undefined` — consumed by Task 5 (commands) and Task 7 (adapter wiring).

- [ ] **Step 1: Add `PlacedRailDevice`/`RailDeviceType` to this file's type import**

At `src/lib/stores/layout/mutators.ts:13-20`, change:
```ts
import type {
  Cable,
  DeviceFace,
  DeviceType,
  PlacedDevice,
  Rack,
  SlotPosition,
} from "$lib/types";
```
to:
```ts
import type {
  Cable,
  DeviceFace,
  DeviceType,
  PlacedDevice,
  PlacedRailDevice,
  Rack,
  RailDeviceType,
  SlotPosition,
} from "$lib/types";
```

- [ ] **Step 2: Write the failing mutator tests**

Create `src/tests/rail-device-mutators.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import {
  addRailDeviceTypeRaw,
  placeRailDeviceRaw,
  removeRailDeviceAtIndexRaw,
  getRailDeviceAtIndex,
} from "$lib/stores/layout/mutators";
import type { LayoutStateAccess } from "$lib/stores/layout/types";
import { createTestLayout, createTestRack, createTestRailDevice, createTestRailDeviceType } from "./factories";

function createTestCtx(): LayoutStateAccess {
  let layout = createTestLayout({ racks: [createTestRack({ id: "rack-1" })] });
  let activeRackId: string | null = "rack-1";
  return {
    getLayout: () => layout,
    setLayout: (l) => { layout = l; },
    getActiveRackId: () => activeRackId,
    setActiveRackId: (id) => { activeRackId = id; },
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
    const first = createTestRailDevice({ id: "dup-id", side: "left", face: "front" });
    const second = createTestRailDevice({ id: "dup-id", side: "right", face: "front" });
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-device-mutators.test.ts`
Expected: FAIL — the four functions are not exported from `$lib/stores/layout/mutators`.

- [ ] **Step 4: Implement the raw mutators**

In `src/lib/stores/layout/mutators.ts`, after the closing brace of `removeDeviceTypeRaw` (end of the "Device Type Raw Mutators" section, right before the "Placed Device Raw Mutators" section comment block), add:
```ts
/**
 * Add a rail device type directly (raw)
 * No undo/redo wrapper in v1 - custom rail device type creation via UI is
 * out of scope; this exists to populate layout.rail_device_types from
 * brand-pack data or tests.
 * @param ctx - Layout state access
 * @param railDeviceType - Rail device type to add
 */
export function addRailDeviceTypeRaw(
  ctx: LayoutStateAccess,
  railDeviceType: RailDeviceType,
): void {
  const layout = ctx.getLayout();
  ctx.setLayout({
    ...layout,
    rail_device_types: [...(layout.rail_device_types ?? []), railDeviceType],
  });
}
```

Then, after the closing brace of `removeDeviceAtIndexRaw` (end of the existing rack-level device placement mutators, before `moveDeviceRaw`), add a new section:
```ts
// =============================================================================
// Placed Rail Device Raw Mutators
// =============================================================================

/**
 * Place a rail device directly (raw) - no validation
 * Targets the specified rack, or falls back to active rack
 * @param ctx - Layout state access
 * @param device - Rail device to place
 * @param rackId - Optional rack ID to target (uses active rack if not provided)
 * @returns Index where device was placed, or -1 if no rack available
 */
export function placeRailDeviceRaw(
  ctx: LayoutStateAccess,
  device: PlacedRailDevice,
  rackId?: string,
): number {
  const target = getTargetRack(ctx, rackId);
  if (!target) return -1;

  const existingIds = new Set(
    (target.rack.rail_devices ?? []).map((d) => d.id),
  );
  const safeDevice = existingIds.has(device.id)
    ? { ...device, id: generateUniqueDeviceId(existingIds) }
    : device;

  const newRailDevices = [...(target.rack.rail_devices ?? []), safeDevice];
  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    rail_devices: newRailDevices,
  }));
  return newRailDevices.length - 1;
}

/**
 * Remove a rail device at index directly (raw)
 * Uses active rack
 * @param ctx - Layout state access
 * @param index - Rail device index to remove
 * @returns The removed device or undefined
 */
export function removeRailDeviceAtIndexRaw(
  ctx: LayoutStateAccess,
  index: number,
): PlacedRailDevice | undefined {
  const target = getTargetRack(ctx);
  if (!target) return undefined;
  const railDevices = target.rack.rail_devices ?? [];
  if (index < 0 || index >= railDevices.length) return undefined;

  const removed = railDevices[index];

  updateRackAtIndex(ctx, target.index, (rack) => ({
    ...rack,
    rail_devices: (rack.rail_devices ?? []).filter((_, i) => i !== index),
  }));
  return removed;
}

/**
 * Get a rail device at a specific index (active rack)
 * @param ctx - Layout state access
 * @param index - Rail device index
 * @returns The rail device or undefined
 */
export function getRailDeviceAtIndex(
  ctx: LayoutStateAccess,
  index: number,
): PlacedRailDevice | undefined {
  const target = getTargetRack(ctx);
  if (!target) return undefined;
  return (target.rack.rail_devices ?? [])[index];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-device-mutators.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/layout/mutators.ts src/tests/rail-device-mutators.test.ts
git commit -m "feat: add raw mutators for rail device types and placement"
```

---

### Task 5: Undo/redo commands for rail devices

**Files:**
- Create: `src/lib/stores/commands/rail-device.ts`
- Modify: `src/lib/stores/commands/types.ts` (add `CommandType` literals)
- Modify: `src/lib/stores/commands/index.ts` (barrel export)
- Test: `src/tests/rail-device-commands.test.ts` (new)

**Interfaces:**
- Consumes: `Command` from `./types`; `PlacedRailDevice` from `$lib/types`; `placeRailDeviceRaw`/`removeRailDeviceAtIndexRaw`/`getRailDeviceAtIndex` signatures from Task 4 (as the `RailDeviceCommandStore` interface).
- Produces: `RailDeviceCommandStore`, `createPlaceRailDeviceCommand`, `createRemoveRailDeviceCommand` — consumed by Task 6.

- [ ] **Step 1: Add `PLACE_RAIL_DEVICE`/`REMOVE_RAIL_DEVICE` to `CommandType`**

In `src/lib/stores/commands/types.ts`, the `CommandType` union currently includes:
```ts
  | "PLACE_DEVICE"
  | "MOVE_DEVICE"
  | "REMOVE_DEVICE"
```
Change to:
```ts
  | "PLACE_DEVICE"
  | "MOVE_DEVICE"
  | "REMOVE_DEVICE"
  | "PLACE_RAIL_DEVICE"
  | "REMOVE_RAIL_DEVICE"
```

- [ ] **Step 2: Write the failing command tests**

Create `src/tests/rail-device-commands.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-device-commands.test.ts`
Expected: FAIL — `$lib/stores/commands/rail-device` module not found.

- [ ] **Step 4: Implement the command factory**

Create `src/lib/stores/commands/rail-device.ts`:
```ts
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
```

- [ ] **Step 5: Add the barrel export**

In `src/lib/stores/commands/index.ts`, add:
```ts
export * from "./rail-device";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-device-commands.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/commands/rail-device.ts src/lib/stores/commands/types.ts src/lib/stores/commands/index.ts src/tests/rail-device-commands.test.ts
git commit -m "feat: add undo/redo commands for rail device placement"
```

---

### Task 6: Rail device type lookup

**Files:**
- Create: `src/lib/utils/rail-device-lookup.ts`
- Test: `src/tests/rail-device-lookup.test.ts` (new)

**Interfaces:**
- Consumes: `RailDeviceType` from `$lib/types`.
- Produces: `findRailDeviceType(slug, layoutRailDeviceTypes): RailDeviceType | undefined` — consumed by Task 7.

Note: this task stubs `findBrandRailDeviceType`/`getAllBrandRailDeviceTypes` as returning an empty result until Task 8 adds real data — written this way deliberately so Task 6 and Task 8 are independently testable and reviewable, matching how `findDeviceType` (device-lookup.ts) and the brand pack data files are already separate concerns in this codebase.

- [ ] **Step 1: Write the failing lookup tests**

Create `src/tests/rail-device-lookup.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-device-lookup.test.ts`
Expected: FAIL — `$lib/utils/rail-device-lookup` module not found.

- [ ] **Step 3: Implement the lookup**

Create `src/lib/utils/rail-device-lookup.ts`:
```ts
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
```

This task depends on `findBrandRailDeviceType` existing in `$lib/data/brandPacks` — implemented in Task 8. Until Task 8 lands, this file will not compile standalone; that's expected and resolved by the very next task. Do not skip Task 8.

- [ ] **Step 4: Commit (staged together with Task 8 — see that task's commit step)**

Do not commit this task in isolation; `findBrandRailDeviceType` doesn't exist yet and the build will fail. Proceed directly to Task 8, then run and commit both together.

---

### Task 7: Brand pack — split 0U Eaton PDUs into RailDeviceType data

**Files:**
- Modify: `src/lib/data/brandPacks/eaton.ts`
- Modify: `src/lib/data/brandPacks/index.ts`
- Test: `src/tests/rail-brandpack.test.ts` (new)

**Interfaces:**
- Produces: `eatonRailDevices: RailDeviceType[]` (from eaton.ts), `getAllBrandRailDeviceTypes(): RailDeviceType[]`, `findBrandRailDeviceType(slug): RailDeviceType | undefined` (from brandPacks/index.ts) — the latter two satisfy Task 6's `findRailDeviceType` dependency.

- [ ] **Step 1: Move the six misclassified entries out of `eatonDevices`**

In `src/lib/data/brandPacks/eaton.ts`, remove these six object literals entirely from the `eatonDevices` array (they currently claim `u_height: 1`, which is physically wrong — these are Tripp Lite's 0U vertical PDU lines):

```ts
  {
    slug: "eaton-tripp-lite-b064-016-02-ipg",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B064-016-02-IPG",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b064-032-01-ipg",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B064-032-01-IPG",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b072-032-ip2",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B072-032-IP2",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b096-016",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B096-016",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
```
and (further down, near the `pdumh15at`/`pdumh20hvat` entries):
```ts
  {
    slug: "eaton-tripp-lite-b096-032",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B096-032",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
    front_image: true,
    rear_image: true,
  },

  {
    slug: "eaton-tripp-lite-b097-016",
    u_height: 1,
    manufacturer: "Eaton",
    model: "Tripp Lite B097-016",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.power,
    category: "power",
    front_image: true,
    rear_image: true,
  },
```

- [ ] **Step 2: Add the `eatonRailDevices` export with those six devices reclassified**

At the top of `src/lib/data/brandPacks/eaton.ts`, change:
```ts
import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";
```
to:
```ts
import type { DeviceType, RailDeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";
```

At the end of the file (after the closing `];` of `eatonDevices`), add:
```ts
/**
 * Eaton (Tripp Lite) 0U vertical rail-mount PDUs.
 * These physically mount to the rack's vertical rail, not a numbered U slot -
 * see docs/superpowers/specs/2026-07-14-0u-rail-device-support-design.md.
 * Model-line confirmation: B064/B072/B096/B097 are Tripp Lite's 0U vertical
 * PDU product lines (verified against vendor model-naming convention during
 * this change; if a specific SKU turns out to be a horizontal unit, move it
 * back to eatonDevices in a follow-up).
 */
export const eatonRailDevices: RailDeviceType[] = [
  {
    slug: "eaton-tripp-lite-b064-016-02-ipg",
    manufacturer: "Eaton",
    model: "Tripp Lite B064-016-02-IPG",
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b064-032-01-ipg",
    manufacturer: "Eaton",
    model: "Tripp Lite B064-032-01-IPG",
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b072-032-ip2",
    manufacturer: "Eaton",
    model: "Tripp Lite B072-032-IP2",
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b096-016",
    manufacturer: "Eaton",
    model: "Tripp Lite B096-016",
    colour: CATEGORY_COLOURS.power,
    category: "power",
  },
  {
    slug: "eaton-tripp-lite-b096-032",
    manufacturer: "Eaton",
    model: "Tripp Lite B096-032",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    front_image: true,
    rear_image: true,
  },
  {
    slug: "eaton-tripp-lite-b097-016",
    manufacturer: "Eaton",
    model: "Tripp Lite B097-016",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    front_image: true,
    rear_image: true,
  },
];
```

(`is_full_depth: false` is dropped — that field is rack-U-depth-specific and doesn't exist on `RailDeviceType`, which has no notion of front/rear depth the way U-slot devices do.)

- [ ] **Step 3: Wire `eatonRailDevices` into `brandPacks/index.ts`**

In `src/lib/data/brandPacks/index.ts`, add to the type import at the top:
```ts
import type { DeviceType, RailDeviceType, Airflow } from "$lib/types";
```
Add to the `eaton` import:
```ts
import { eatonDevices, eatonRailDevices } from "./eaton";
```
Add to the barrel `export { ... }` block:
```ts
  eatonRailDevices,
```

Then, after the existing `getAllBrandDevices()` function (find it by its closing `}`, it returns the big spread array ending in the last brand pack's `...xDevices`), add:
```ts
/**
 * Get all rail (0U) devices from all brand packs as a single array.
 * Only eaton currently has rail devices - other brand packs may be
 * audited for the same u_height-forced-to-1 mistake in a follow-up.
 */
export function getAllBrandRailDeviceTypes(): RailDeviceType[] {
  return [...eatonRailDevices];
}

/**
 * Find a rail device type by slug across all brand packs.
 */
export function findBrandRailDeviceType(slug: string): RailDeviceType | undefined {
  return getAllBrandRailDeviceTypes().find((d) => d.slug === slug);
}
```

- [ ] **Step 4: Write the brand-pack tests**

Create `src/tests/rail-brandpack.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { eatonDevices, eatonRailDevices } from "$lib/data/brandPacks/eaton";
import { getAllBrandRailDeviceTypes, findBrandRailDeviceType } from "$lib/data/brandPacks";
import { RailDeviceTypeSchema } from "$lib/schemas";

describe("eatonRailDevices", () => {
  it("is non-empty", () => {
    expect(eatonRailDevices.length).toBeGreaterThan(0);
  });

  it("every entry validates against RailDeviceTypeSchema", () => {
    for (const device of eatonRailDevices) {
      const result = RailDeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
    }
  });

  it("no rail device slug also appears in eatonDevices (no duplicate representation)", () => {
    const railSlugs = new Set(eatonRailDevices.map((d) => d.slug));
    const overlap = eatonDevices.filter((d) => railSlugs.has(d.slug));
    expect(overlap).toEqual([]);
  });
});

describe("getAllBrandRailDeviceTypes / findBrandRailDeviceType", () => {
  it("includes eaton rail devices", () => {
    const all = getAllBrandRailDeviceTypes();
    expect(all.some((d) => d.slug === "eaton-tripp-lite-b064-016-02-ipg")).toBe(true);
  });

  it("finds a known slug", () => {
    const found = findBrandRailDeviceType("eaton-tripp-lite-b096-032");
    expect(found?.model).toBe("Tripp Lite B096-032");
  });

  it("returns undefined for an unknown slug", () => {
    expect(findBrandRailDeviceType("not-a-real-slug")).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run the full rail-related test suite (Tasks 6 and 7 together)**

Run: `npx vitest run src/tests/rail-device-lookup.test.ts src/tests/rail-brandpack.test.ts`
Expected: PASS (all tests in both files — Task 6's `findRailDeviceType` now compiles because `findBrandRailDeviceType` exists).

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: no new errors.

- [ ] **Step 7: Commit Tasks 6 and 7 together**

```bash
git add src/lib/utils/rail-device-lookup.ts src/lib/data/brandPacks/eaton.ts src/lib/data/brandPacks/index.ts src/tests/rail-device-lookup.test.ts src/tests/rail-brandpack.test.ts
git commit -m "feat: split 0U Eaton PDUs into RailDeviceType data, add rail device lookup"
```

---

### Task 8: Wire rail devices into the command adapter and Recorded actions

**Files:**
- Modify: `src/lib/stores/layout/command-adapters.ts`
- Test: `src/tests/rail-device-recorded.test.ts` (new)

**Interfaces:**
- Consumes: everything from Tasks 1-7 (`PlacedRailDevice`, `isRailSlotOccupied`, raw mutators, `RailDeviceCommandStore`/command factories, `findRailDeviceType`).
- Produces: `placeRailDeviceRecorded(ctx, rackId, railDeviceTypeSlug, side, face): boolean`, `removeRailDeviceRecorded(ctx, rackId, deviceIndex, snapshotDevice): void` — consumed by Task 9 (public store API).

- [ ] **Step 1: Extend the type imports**

At `src/lib/stores/layout/command-adapters.ts:13-19`, change:
```ts
import type {
  DeviceFace,
  DeviceType,
  PlacedDevice,
  Rack,
  SlotPosition,
} from "$lib/types";
```
to:
```ts
import type {
  DeviceFace,
  DeviceType,
  PlacedDevice,
  PlacedRailDevice,
  Rack,
  RailSide,
  SlotPosition,
} from "$lib/types";
```

Add the rail collision and lookup imports next to the existing collision import (`src/lib/stores/layout/command-adapters.ts:22-25`):
```ts
import {
  canPlaceDevice,
  isSlotOccupied,
} from "$lib/utils/collision";
import { isRailSlotOccupied } from "$lib/utils/rail-collision";
import { findRailDeviceType } from "$lib/utils/rail-device-lookup";
```

Add the rail command imports to the existing `from "../commands"` import block (`src/lib/stores/layout/command-adapters.ts:37-57`), inside the braces:
```ts
  createPlaceRailDeviceCommand,
  createRemoveRailDeviceCommand,
  type RailDeviceCommandStore,
```

Add the rail mutator imports to the existing `from "../mutators"`-style relative import block (the one starting `addDeviceTypeRaw,` around line 61-80), inside the braces:
```ts
  addRailDeviceTypeRaw,
  placeRailDeviceRaw,
  removeRailDeviceAtIndexRaw,
  getRailDeviceAtIndex,
```

- [ ] **Step 2: Add rail methods to the command adapter object**

In `getCommandStoreAdapter` (`src/lib/stores/layout/command-adapters.ts:134-136`), change the return type from:
```ts
export function getCommandStoreAdapter(
  ctx: LayoutStateAccess,
): DeviceTypeCommandStore & DeviceCommandStore & RackCommandStore {
```
to:
```ts
export function getCommandStoreAdapter(
  ctx: LayoutStateAccess,
): DeviceTypeCommandStore & DeviceCommandStore & RackCommandStore & RailDeviceCommandStore {
```

Inside the returned object literal, immediately after the `getDeviceAtIndex: (index) => getDeviceAtIndex(ctx, index),` line (end of the `DeviceCommandStore` section, before the `// RackCommandStore` comment), add:
```ts
    // RailDeviceCommandStore
    placeRailDeviceRaw: (device) => placeRailDeviceRaw(ctx, device),
    removeRailDeviceAtIndexRaw: (index) =>
      removeRailDeviceAtIndexRaw(ctx, index),
    getRailDeviceAtIndex: (index) => getRailDeviceAtIndex(ctx, index),
```

- [ ] **Step 3: Write the failing Recorded-action tests**

Create `src/tests/rail-device-recorded.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import {
  placeRailDeviceRecorded,
  removeRailDeviceRecorded,
} from "$lib/stores/layout/command-adapters";
import { addRailDeviceTypeRaw } from "$lib/stores/layout/mutators";
import type { LayoutStateAccess } from "$lib/stores/layout/types";
import { createTestLayout, createTestRack, createTestRailDeviceType } from "./factories";

function createTestCtx(): LayoutStateAccess {
  let layout = createTestLayout({ racks: [createTestRack({ id: "rack-1" })] });
  let activeRackId: string | null = "rack-1";
  return {
    getLayout: () => layout,
    setLayout: (l) => { layout = l; },
    getActiveRackId: () => activeRackId,
    setActiveRackId: (id) => { activeRackId = id; },
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
    addRailDeviceTypeRaw(ctx, createTestRailDeviceType({ slug: "my-rail-pdu" }));
    const result = placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    expect(result).toBe(true);
    // eslint-disable-next-line no-restricted-syntax -- placing one device should leave exactly one rail device in the array
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(1);
  });

  it("returns false when the rack does not exist", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(ctx, createTestRailDeviceType({ slug: "my-rail-pdu" }));
    const result = placeRailDeviceRecorded(ctx, "nonexistent", "my-rail-pdu", "left", "front");
    expect(result).toBe(false);
  });

  it("returns false when the device type does not exist", () => {
    const ctx = createTestCtx();
    const result = placeRailDeviceRecorded(ctx, "rack-1", "unknown-slug", "left", "front");
    expect(result).toBe(false);
  });

  it("returns false when the slot is already occupied", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(ctx, createTestRailDeviceType({ slug: "my-rail-pdu" }));
    placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    const second = placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    expect(second).toBe(false);
    // eslint-disable-next-line no-restricted-syntax -- placing on an occupied slot must be rejected, leaving exactly one rail device
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(1);
  });

  it("allows placing on the opposite side when one side is occupied", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(ctx, createTestRailDeviceType({ slug: "my-rail-pdu" }));
    placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "left", "front");
    const second = placeRailDeviceRecorded(ctx, "rack-1", "my-rail-pdu", "right", "front");
    expect(second).toBe(true);
    // eslint-disable-next-line no-restricted-syntax -- placing on the opposite side must succeed, leaving exactly two rail devices
    expect(ctx.getLayout().racks[0]!.rail_devices).toHaveLength(2);
  });
});

describe("removeRailDeviceRecorded", () => {
  it("removes the device at the given index", () => {
    const ctx = createTestCtx();
    addRailDeviceTypeRaw(ctx, createTestRailDeviceType({ slug: "my-rail-pdu" }));
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/tests/rail-device-recorded.test.ts`
Expected: FAIL — `placeRailDeviceRecorded`/`removeRailDeviceRecorded` not exported.

- [ ] **Step 5: Implement `placeRailDeviceRecorded` and `removeRailDeviceRecorded`**

In `src/lib/stores/layout/command-adapters.ts`, immediately after the closing brace of `placeDeviceRecorded` (before the `moveDeviceRecorded` doc comment), add:
```ts
/**
 * Place a rail (0U) device with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param railDeviceTypeSlug - Rail device type slug
 * @param side - Rail side ('left' or 'right')
 * @param face - Rack face ('front', 'rear', or 'both')
 * @returns true if placed successfully
 */
export function placeRailDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  railDeviceTypeSlug: string,
  side: RailSide,
  face: DeviceFace,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  const layout = ctx.getLayout();
  const railDeviceType = findRailDeviceType(
    railDeviceTypeSlug,
    layout.rail_device_types ?? [],
  );
  if (!railDeviceType) return false;

  if (isRailSlotOccupied(targetRack, side, face)) return false;

  const device: PlacedRailDevice = {
    id: generateId(),
    device_type: railDeviceTypeSlug,
    side,
    face,
  };

  const deviceName = railDeviceType.model ?? railDeviceType.slug;
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);
  const command = createPlaceRailDeviceCommand(device, adapter, deviceName);
  history.execute(command);
  ctx.markDirty();

  return true;
}
```

Immediately after the closing brace of `removeDeviceRecorded`, add:
```ts
/**
 * Remove a rail device with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param deviceIndex - Rail device index
 * @param snapshotDevice - Function to snapshot the device (caller supplies $state.snapshot in .svelte.ts files)
 */
export function removeRailDeviceRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  snapshotDevice: (device: PlacedRailDevice) => PlacedRailDevice,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;
  const railDevices = targetRack.rail_devices ?? [];
  if (deviceIndex < 0 || deviceIndex >= railDevices.length) return;

  ctx.setActiveRackId(rackId);

  const device = snapshotDevice(railDevices[deviceIndex]!);
  const layout = ctx.getLayout();
  const railDeviceType = findRailDeviceType(
    device.device_type,
    layout.rail_device_types ?? [],
  );
  const deviceName = railDeviceType?.model ?? railDeviceType?.slug ?? "rail device";

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);
  const command = createRemoveRailDeviceCommand(
    deviceIndex,
    device,
    adapter,
    deviceName,
  );
  history.execute(command);
  ctx.markDirty();
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-device-recorded.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run build` then `npx vitest run src/tests/`
Expected: no new errors, no regressions in any existing test.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/layout/command-adapters.ts src/tests/rail-device-recorded.test.ts
git commit -m "feat: wire rail devices into command adapter and Recorded actions"
```

---

### Task 9: Public store API + end-to-end undo/redo integration test

**Files:**
- Modify: `src/lib/stores/layout.svelte.ts`
- Test: `src/tests/rail-device-store-integration.test.ts` (new)

**Interfaces:**
- Consumes: `placeRailDeviceRecorded`/`removeRailDeviceRecorded` (Task 8), `addRailDeviceTypeRaw` (Task 4).
- Produces: `layoutStore.placeRailDevice(rackId, slug, side, face): boolean`, `layoutStore.removeRailDeviceFromRack(rackId, deviceIndex): void`, `layoutStore.addRailDeviceTypeRaw(railDeviceType): void` on the public store object — this is the API Plan B's drag-and-drop UI will call.

- [ ] **Step 1: Add the Recorded-function imports**

Find the existing import of `placeDeviceRecorded as placeDeviceRecordedImpl` and `removeDeviceRecorded as removeDeviceRecordedImpl` in `src/lib/stores/layout.svelte.ts` (around line 85-112 per the existing import block) and add alongside them:
```ts
  placeRailDeviceRecorded as placeRailDeviceRecordedImpl,
  removeRailDeviceRecorded as removeRailDeviceRecordedImpl,
```
(same source module as the existing device ones — `./layout/command-adapters`).

Also add, alongside wherever `placeDeviceRaw as placeDeviceRawImpl` etc. are imported from `./layout/mutators`:
```ts
  addRailDeviceTypeRaw as addRailDeviceTypeRawImpl,
```

- [ ] **Step 2: Add local Recorded wrapper functions**

Find the existing `placeDeviceRecorded`/`removeDeviceRecorded` local wrapper function declarations (around line 1242-1282 per prior investigation — search for `function placeDeviceRecorded(` in this file, distinct from the imported `...Impl` version). Immediately after those two functions, add:
```ts
function placeRailDeviceRecorded(
  rackId: string,
  railDeviceTypeSlug: string,
  side: RailSide,
  face: DeviceFace,
): boolean {
  return placeRailDeviceRecordedImpl(
    stateAccess,
    rackId,
    railDeviceTypeSlug,
    side,
    face,
  );
}

function removeRailDeviceRecorded(rackId: string, deviceIndex: number): void {
  removeRailDeviceRecordedImpl(stateAccess, rackId, deviceIndex, (device) =>
    $state.snapshot(device),
  );
}
```

Add `RailSide` to this file's `$lib/types` type import if not already present (check the existing `import type { ... } from "$lib/types"` block near the top of the file and add `RailSide` to it if missing).

- [ ] **Step 3: Add the public API functions**

Immediately after the existing `placeDevice`/`removeDeviceFromRack` public functions (around line 778-786 and 899-905), add:
```ts
/**
 * Place a rail (0U) device from the library into a rack
 * Uses undo/redo support via placeRailDeviceRecorded
 */
function placeRailDevice(
  rackId: string,
  railDeviceTypeSlug: string,
  side: RailSide,
  face: DeviceFace,
): boolean {
  return placeRailDeviceRecorded(rackId, railDeviceTypeSlug, side, face);
}

/**
 * Remove a rail device from a rack
 * Uses undo/redo support via removeRailDeviceRecorded
 */
function removeRailDeviceFromRack(rackId: string, deviceIndex: number): void {
  removeRailDeviceRecorded(rackId, deviceIndex);
}

/**
 * Add a rail device type to the layout's rail device library (raw, no undo/redo)
 * Mirrors addDeviceTypeRaw, which is also exposed directly on the store without
 * a Recorded wrapper.
 */
function addRailDeviceTypeRaw(railDeviceType: RailDeviceType): void {
  addRailDeviceTypeRawImpl(stateAccess, railDeviceType);
}
```

Add `RailDeviceType` to the file's `$lib/types` import if not already present.

- [ ] **Step 4: Expose the new functions on the returned store object**

Find where `placeDevice,` and `removeDeviceFromRack,` are listed in the object returned by the store factory (around line 307/311). Add immediately after:
```ts
    placeRailDevice,
    removeRailDeviceFromRack,
    addRailDeviceTypeRaw,
```

- [ ] **Step 5: Write the end-to-end integration test**

Confirmed against `src/tests/layout-store.test.ts`'s own setup: the store is reset via the standalone `resetLayoutStore()` export (not a method on the store object), the current layout is read via the `store.layout` getter property (not a `getLayout()` method), and `store.undo()`/`store.redo()` are confirmed public methods (used in `src/tests/MobileHistoryControls.test.ts:79`).

Create `src/tests/rail-device-store-integration.test.ts`:
```ts
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

    store.addRailDeviceTypeRaw(createTestRailDeviceType({ slug: "e2e-rail-pdu" }));

    const placed = store.placeRailDevice(rack.id, "e2e-rail-pdu", "left", "front");
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
    const rackAfterRemoveUndo = store.layout.racks.find((r) => r.id === rack.id);
    // eslint-disable-next-line no-restricted-syntax -- undoing the removal must restore exactly one rail device
    expect(rackAfterRemoveUndo?.rail_devices).toHaveLength(1);
  });

  it("rejects placing a second device on an already-occupied rail slot", () => {
    const store = getLayoutStore();
    if (!store) throw new Error("getLayoutStore() returned null");

    const rack = store.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack() failed");

    store.addRailDeviceTypeRaw(createTestRailDeviceType({ slug: "e2e-rail-pdu" }));
    store.placeRailDevice(rack.id, "e2e-rail-pdu", "left", "front");
    const second = store.placeRailDevice(rack.id, "e2e-rail-pdu", "left", "front");

    expect(second).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/tests/rail-device-store-integration.test.ts`
Expected: PASS (2 tests). If method names needed adjusting in Step 5, re-run after fixing.

- [ ] **Step 7: Typecheck and full suite**

Run: `npm run build` then `npx vitest run src/tests/`
Expected: no new errors, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/layout.svelte.ts src/tests/rail-device-store-integration.test.ts
git commit -m "feat: expose rail device placement on the public layout store API"
```

---

### Task 10: Final verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Run the complete test suite**

Run: `npm run test:run`
Expected: all tests pass, including every new file added in Tasks 1-9.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no violations. The plan's `toHaveLength(literal)` assertions are all annotated with `eslint-disable-next-line no-restricted-syntax -- <justification>` as behavioral invariants (placement/removal must leave an exact count); none of the new tests use DOM queries or hardcoded colour assertions. This step confirms the annotations actually satisfy the linter, not just that they look right.

- [ ] **Step 3: Run the full build**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 4: Run CodeRabbit local review before pushing**

Run: `coderabbit --prompt-only --type uncommitted` (if there are uncommitted changes) or `--type committed` (comparing against the base branch) per this repo's CLAUDE.md.
Address anything it flags in a follow-up commit before opening the PR.

- [ ] **Step 5: Open a PR**

This is a real upstream PR candidate for `RackulaLives/Rackula`. Chad should review the branch and decide whether to open the PR against the fork (`chadsgit/rackula`) or directly against upstream — this is a visible, shared-state action and shouldn't be automated without confirmation.

```bash
git push -u origin <branch-name>
gh pr create --title "feat: add 0U rail device data model (types, collision, undo/redo, Eaton brand-pack fix)" --body "$(cat <<'EOF'
## Summary
- New RailDeviceType/PlacedRailDevice types, kept separate from DeviceType/PlacedDevice to avoid touching the 64 existing call sites that assume u_height is always a number
- rack.rail_devices array with its own collision check (one device per side+face, no U-range math)
- Full undo/redo support via the existing command pattern
- Eaton brand-pack fix: B064/B072/B096/B097 lines were forced into u_height: 1 despite being real 0U vertical PDU product lines

No UI changes in this PR - drag-and-drop placement and SVG rendering are a follow-up (design already scoped, not yet planned in detail).

Design doc: docs/superpowers/specs/2026-07-14-0u-rail-device-support-design.md

## Test plan
- [ ] `npm run test:run` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] CodeRabbit review addressed
EOF
)"
```

Note: no UI to manually click-test in this PR — verification is entirely through the test suite, since Plan A ships no drag-and-drop or rendering surface.
