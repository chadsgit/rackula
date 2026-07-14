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
