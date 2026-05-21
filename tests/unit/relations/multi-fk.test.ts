import { describe, expect, test } from "bun:test";
import { enrichIrWithRelations, planRelations, type IrDatabase } from "@pgpump/core";
import { multiFkIr } from "../../fixtures/multi-fk-ir";

describe("planRelations — multi-FK disambiguation", () => {
  test("emits unique nested routes when child has multiple FKs to same parent", () => {
    const warnings: { code: string; message: string }[] = [];
    const relations = planRelations(
      [
        { parentTable: "base_user", parentColumn: "id", childTable: "leaves_usersleaves", childColumn: "user_id" },
        { parentTable: "base_user", parentColumn: "id", childTable: "leaves_usersleaves", childColumn: "approved_by_id" },
        { parentTable: "base_user", parentColumn: "id", childTable: "leaves_usersleaves", childColumn: "applied_by_id" },
      ],
      warnings,
    );

    expect(relations).toHaveLength(3);
    const routes = relations.map((r) => r.nestedRoute);
    const unique = new Set(routes);
    expect(unique.size).toBe(routes.length);
    for (const r of relations) {
      expect(r.nestedRoute).toContain(`/base-user/:parentId/leaves-usersleaves`);
    }
  });

  test("single FK to parent keeps the simple nested route shape", () => {
    const warnings: { code: string; message: string }[] = [];
    const relations = planRelations(
      [
        { parentTable: "authors", parentColumn: "id", childTable: "books", childColumn: "author_id" },
      ],
      warnings,
    );
    expect(relations).toHaveLength(1);
    expect(relations[0].nestedRoute).toBe("/authors/:parentId/books");
  });

  test("emits a warning describing the disambiguation", () => {
    const warnings: { code: string; message: string }[] = [];
    planRelations(
      [
        { parentTable: "base_user", parentColumn: "id", childTable: "leaves_usersleaves", childColumn: "user_id" },
        { parentTable: "base_user", parentColumn: "id", childTable: "leaves_usersleaves", childColumn: "approved_by_id" },
      ],
      warnings,
    );
    expect(warnings.some((w) => w.code === "NESTED_ROUTE_DISAMBIGUATED")).toBe(true);
  });
});

describe("enrichIrWithRelations — production-shape fixture", () => {
  test("does not produce duplicate nestedRoute values", () => {
    const ir: IrDatabase = multiFkIr;
    const routes = ir.relations.filter((r) => !r.skipNestedRoute).map((r) => r.nestedRoute);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
