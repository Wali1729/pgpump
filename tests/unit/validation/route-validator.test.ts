import { describe, expect, test } from "bun:test";
import {
  assertNoDuplicateRoutes,
  findDuplicateRoutes,
  type RenderPlan,
} from "@pgpump/core";

function plan(files: { path: string; contents: string }[]): RenderPlan {
  return { files, warnings: [] };
}

describe("findDuplicateRoutes — regex anchoring", () => {
  test("does not flag a FastAPI router file with a single @router.get/patch/delete each", () => {
    const router = `from fastapi import APIRouter
router = APIRouter(prefix="/items")

@router.get("")
async def list_items(): ...

@router.get("/{item_id}")
async def get_item(item_id: int): ...

@router.patch("/{item_id}")
async def update_item(item_id: int): ...

@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: int): ...
`;
    const result = findDuplicateRoutes(
      plan([{ path: "app/routers/items.py", contents: router }]),
    );
    expect(result).toEqual([]);
  });

  test("does not flag @app.get('/health') in main.py as a duplicate", () => {
    const main = `from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}
`;
    const result = findDuplicateRoutes(plan([{ path: "main.py", contents: main }]));
    expect(result).toEqual([]);
  });
});

describe("findDuplicateRoutes", () => {
  test("returns empty when all routes are unique", () => {
    const result = findDuplicateRoutes(
      plan([
        {
          path: "src/routes/a.ts",
          contents: `app.get("/a"); app.post("/a"); app.get("/a/:id");`,
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  test("detects duplicate fastify routes across files", () => {
    const result = findDuplicateRoutes(
      plan([
        { path: "src/routes/a.ts", contents: `app.get("/x")` },
        { path: "src/routes/b.ts", contents: `app.get("/x")` },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("GET");
    expect(result[0].path).toBe("/x");
    expect(result[0].files).toEqual(["src/routes/a.ts", "src/routes/b.ts"]);
  });

  test("detects duplicate fastapi routes within a single router file", () => {
    const result = findDuplicateRoutes(
      plan([
        {
          path: "app/routers/foo.py",
          contents: `@router.get("/items")\n@router.get("/items")`,
        },
      ]),
    );
    expect(result).toHaveLength(1);
  });
});

describe("assertNoDuplicateRoutes", () => {
  test("throws when duplicates exist", () => {
    const bad = plan([
      { path: "src/routes/a.ts", contents: `app.get("/dup")\napp.get("/dup")` },
    ]);
    expect(() => assertNoDuplicateRoutes(bad)).toThrow(/Duplicate route/);
  });

  test("passes through clean plans", () => {
    const good = plan([
      { path: "src/routes/a.ts", contents: `app.get("/a")\napp.post("/a")` },
    ]);
    expect(() => assertNoDuplicateRoutes(good)).not.toThrow();
  });
});
