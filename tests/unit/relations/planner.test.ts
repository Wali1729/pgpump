import { describe, expect, test } from "bun:test";
import { planRelations } from "@pgpump/core";

describe("planRelations", () => {
  test("marks circular FK edges as skipped", () => {
    const warnings: { code: string; message: string }[] = [];
    const relations = planRelations(
      [
        { parentTable: "a", parentColumn: "id", childTable: "b", childColumn: "a_id" },
        { parentTable: "b", parentColumn: "id", childTable: "a", childColumn: "b_id" },
      ],
      warnings,
    );
    const skipped = relations.filter((r) => r.skipNestedRoute);
    expect(skipped.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.code === "CIRCULAR_FK_SKIP")).toBe(true);
  });
});
