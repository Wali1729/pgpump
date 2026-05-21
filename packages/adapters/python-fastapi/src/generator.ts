import type { AdapterInput, IrTable, RenderFile, RenderPlan } from "@pgpump/core";
import { toPascalCase } from "@pgpump/core";

// Python module names must match the on-disk file basename exactly,
// because `from app.routers import X` resolves `X` to `app/routers/X.py`.
// Tables already use snake_case names from Postgres; reuse that verbatim
// so imports and file paths can never drift apart.
function moduleName(table: IrTable): string {
  return table.name;
}

function pyType(irType: string): string {
  switch (irType) {
    case "NUMBER":
      return "int";
    case "BOOLEAN":
      return "bool";
    case "JSON":
      return "dict";
    default:
      return "str";
  }
}

function generateRequirements(): string {
  return `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
asyncpg>=0.30.0
pydantic>=2.10.0
`;
}

function generateDatabase(): string {
  return `import os
import asyncpg

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL is required")
        _pool = await asyncpg.create_pool(dsn)
    return _pool
`;
}

function generateMain(tables: IrTable[]): string {
  const imports = tables
    .map((t) => `from app.routers import ${moduleName(t)} as ${moduleName(t)}_router`)
    .join("\n");
  const includes = tables
    .map((t) => `app.include_router(${moduleName(t)}_router.router)`)
    .join("\n");

  return `from fastapi import FastAPI

${imports}

app = FastAPI(title="Generated API", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

${includes}
`;
}

function generateRouter(table: IrTable): string {
  const route = table.routeName;
  const pk = table.primaryKeyColumns[0] ?? "id";
  const filters = table.columns.filter((c) => c.filterable);
  const sorts = table.columns.filter((c) => c.sortable);
  const writableCols = table.columns.filter((c) => !c.isPrimaryKey);

  const createBody = writableCols.length
    ? writableCols
        .map(
          (c) =>
            `    ${c.name}: ${c.nullable ? `Optional[${pyType(c.irType)}] = None` : pyType(c.irType)}`,
        )
        .join("\n")
    : "    pass";
  const updateBody = writableCols.length
    ? writableCols
        .map((c) => `    ${c.name}: Optional[${pyType(c.irType)}] = None`)
        .join("\n")
    : "    pass";

  return `from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.database import get_pool

router = APIRouter(prefix="/${route}", tags=["${table.name}"])

class ${toPascalCase(table.name)}Create(BaseModel):
${createBody}

class ${toPascalCase(table.name)}Update(BaseModel):
${updateBody}

ALLOWED_SORT = {${sorts.map((c) => `"${c.name}"`).join(", ")}}
ALLOWED_FILTER = {${filters.map((c) => `"${c.name}"`).join(", ")}}

@router.get("")
async def list_items(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sortBy: str = Query("${sorts[0]?.name ?? pk}"),
    order: Literal["asc", "desc"] = "asc",
):
    if sortBy not in ALLOWED_SORT:
        raise HTTPException(400, "Invalid sortBy")
    pool = await get_pool()
    order_sql = "DESC" if order == "desc" else "ASC"
    rows = await pool.fetch(
        f'SELECT * FROM ${table.schema}.${table.name} ORDER BY "{sortBy}" {order_sql} LIMIT $1 OFFSET $2',
        limit,
        offset,
    )
    total = await pool.fetchval(f'SELECT COUNT(*) FROM ${table.schema}.${table.name}')
    return {"data": [dict(r) for r in rows], "meta": {"pagination": {"limit": limit, "offset": offset, "total": total}}}

@router.get("/{item_id}")
async def get_item(item_id: int):
    pool = await get_pool()
    row = await pool.fetchrow(
        'SELECT * FROM ${table.schema}.${table.name} WHERE ${pk} = $1', item_id
    )
    if not row:
        raise HTTPException(404, "Not found")
    return dict(row)

@router.post("", status_code=201)
async def create_item(body: ${toPascalCase(table.name)}Create):
    pool = await get_pool()
    cols = [k for k, v in body.model_dump(exclude_none=True).items()]
    vals = list(body.model_dump(exclude_none=True).values())
    placeholders = ", ".join(f"\${i+1}" for i in range(len(vals)))
    col_names = ", ".join(f'"{c}"' for c in cols)
    row = await pool.fetchrow(
        f'INSERT INTO ${table.schema}.${table.name} ({col_names}) VALUES ({placeholders}) RETURNING *',
        *vals,
    )
    return dict(row)

@router.patch("/{item_id}")
async def update_item(item_id: int, body: ${toPascalCase(table.name)}Update):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    pool = await get_pool()
    sets = ", ".join(f'"{k}" = \${i+2}' for i, k in enumerate(data.keys()))
    row = await pool.fetchrow(
        f'UPDATE ${table.schema}.${table.name} SET {sets} WHERE ${pk} = $1 RETURNING *',
        item_id,
        *data.values(),
    )
    if not row:
        raise HTTPException(404, "Not found")
    return dict(row)

@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: int):
    pool = await get_pool()
    result = await pool.execute(
        'DELETE FROM ${table.schema}.${table.name} WHERE ${pk} = $1', item_id
    )
    if result == "DELETE 0":
        raise HTTPException(404, "Not found")
`;
}

function generatePytest(): string {
  return `from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
`;
}

export function buildPythonFastApiPlan(input: AdapterInput): RenderPlan {
  const { ir, options } = input;
  const files: RenderFile[] = [
    { path: "requirements.txt", contents: generateRequirements() },
    { path: "main.py", contents: generateMain(ir.tables) },
    { path: "app/__init__.py", contents: "" },
    { path: "app/database.py", contents: generateDatabase() },
    { path: "app/routers/__init__.py", contents: "" },
    { path: ".env.example", contents: "DATABASE_URL=postgres://user:pass@localhost:5432/db\n" },
    {
      path: "README.md",
      contents: `# Generated FastAPI\n\nuvicorn main:app --reload\n\nDocs: http://localhost:8000/docs\n`,
    },
  ];

  for (const table of ir.tables) {
    files.push({
      path: `app/routers/${moduleName(table)}.py`,
      contents: generateRouter(table),
    });
  }

  if (options.docker) {
    files.push({
      path: "Dockerfile",
      contents: `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n`,
    });
  }

  if (options.tests) {
    files.push({ path: "tests/test_health.py", contents: generatePytest() });
    files.push({ path: "tests/__init__.py", contents: "" });
  }

  return { files, warnings: [...ir.warnings] };
}
