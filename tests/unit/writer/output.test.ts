import { describe, expect, test } from "bun:test";
import { resolveSafePath } from "@pgpump/core";

describe("resolveSafePath", () => {
  test("allows relative paths inside output dir", () => {
    const p = resolveSafePath("/tmp/out", "src/app.ts");
    expect(p).toContain("src/app.ts");
  });

  test("rejects path traversal", () => {
    expect(() => resolveSafePath("/tmp/out", "../etc/passwd")).toThrow(
      /traversal|escapes/,
    );
  });
});
