import { describe, expect, test } from "bun:test";
import {
  isFilterable,
  isSortable,
  mapPostgresTypeToIr,
} from "@pgpump/core";

describe("mapPostgresTypeToIr", () => {
  test("maps common types", () => {
    expect(mapPostgresTypeToIr("integer")).toBe("NUMBER");
    expect(mapPostgresTypeToIr("varchar")).toBe("STRING");
    expect(mapPostgresTypeToIr("boolean")).toBe("BOOLEAN");
    expect(mapPostgresTypeToIr("uuid")).toBe("UUID");
    expect(mapPostgresTypeToIr("jsonb")).toBe("JSON");
    expect(mapPostgresTypeToIr("timestamp with time zone")).toBe("DATETIME");
  });

  test("maps custom types to ANY", () => {
    expect(mapPostgresTypeToIr("tsvector")).toBe("ANY");
    expect(mapPostgresTypeToIr("custom_enum")).toBe("ANY");
  });

  test("filterable and sortable helpers", () => {
    expect(isFilterable("ANY")).toBe(false);
    expect(isFilterable("STRING")).toBe(true);
    expect(isSortable("BYTES")).toBe(false);
    expect(isSortable("NUMBER")).toBe(true);
  });
});
