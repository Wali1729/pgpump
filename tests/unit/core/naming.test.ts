import { describe, expect, test } from "bun:test";
import {
  sanitizeIdentifier,
  toCamelCase,
  toPascalCase,
  toRouteName,
} from "@pgpump/core";

describe("naming utils", () => {
  test("toRouteName converts underscores to kebab-case", () => {
    expect(toRouteName("user_profiles")).toBe("user-profiles");
  });

  test("toPascalCase and toCamelCase", () => {
    expect(toPascalCase("user_profiles")).toBe("UserProfiles");
    expect(toCamelCase("user_profiles")).toBe("userProfiles");
  });

  test("sanitizeIdentifier accepts valid names", () => {
    expect(sanitizeIdentifier("column_name")).toBe("column_name");
  });

  test("sanitizeIdentifier rejects invalid names", () => {
    expect(() => sanitizeIdentifier("bad-name")).toThrow(/Invalid SQL identifier/);
  });
});
