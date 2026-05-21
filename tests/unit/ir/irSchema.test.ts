import { describe, expect, test } from "bun:test";
import { validateIrDatabase } from "@pgpump/core";
import { sampleIr } from "../../fixtures/sample-ir";

describe("irDatabaseSchema", () => {
  test("parses valid sample IR", () => {
    const ir = validateIrDatabase(sampleIr);
    expect(ir.tables).toHaveLength(3);
    expect(ir.relations).toHaveLength(2);
  });

  test("rejects invalid IR", () => {
    expect(() => validateIrDatabase({ version: "2.0" })).toThrow();
  });
});
