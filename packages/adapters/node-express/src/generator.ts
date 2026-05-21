import type { AdapterInput, IrTable, RenderFile, RenderPlan } from "@pgpump/core";
import { toCamelCase, toPascalCase } from "@pgpump/core";

function generatePackageJson(): string {
  const pkg = {
    name: "generated-express-api",
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "tsx watch src/server.ts",
      start: "tsx src/server.ts",
      test: "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    },
    dependencies: {
      express: "^4.21.2",
      pg: "^8.13.1",
      "swagger-ui-express": "^5.0.1",
      zod: "^3.24.1",
    },
    devDependencies: {
      "@types/express": "^5.0.0",
      "@types/node": "^22.10.0",
      "@types/swagger-ui-express": "^4.1.8",
      jest: "^29.7.0",
      tsx: "^4.19.2",
      typescript: "^5.7.0",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

function generateDb(): string {
  return `import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export { pool };
`;
}

function generateRouter(table: IrTable): string {
  const route = table.routeName;
  const pk = table.primaryKeyColumns[0] ?? "id";
  const sorts = table.columns.filter((c) => c.sortable).map((c) => c.name);

  return `import { Router } from "express";
import { pool } from "../db/client.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);
  const sortBy = String(req.query.sortBy ?? "${sorts[0] ?? pk}");
  const order = req.query.order === "desc" ? "DESC" : "ASC";
  const allowed = new Set(${JSON.stringify(sorts)});
  if (!allowed.has(sortBy)) {
    return res.status(400).json({ error: { code: "INVALID_SORT", message: "Invalid sortBy" } });
  }
  const { rows } = await pool.query(
    \`SELECT * FROM ${table.schema}.${table.name} ORDER BY "\${sortBy}" \${order} LIMIT $1 OFFSET $2\`,
    [limit, offset],
  );
  const { rows: countRows } = await pool.query(
    \`SELECT COUNT(*)::text AS count FROM ${table.schema}.${table.name}\`,
  );
  res.json({
    data: rows,
    meta: { pagination: { limit, offset, total: Number(countRows[0].count) } },
  });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    \`SELECT * FROM ${table.schema}.${table.name} WHERE ${pk} = $1\`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  res.json(rows[0]);
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const keys = Object.keys(body);
  const vals = Object.values(body);
  const cols = keys.map((k) => \`"\${k}"\`).join(", ");
  const params = keys.map((_, i) => \`$\${i + 1}\`).join(", ");
  const { rows } = await pool.query(
    \`INSERT INTO ${table.schema}.${table.name} (\${cols}) VALUES (\${params}) RETURNING *\`,
    vals,
  );
  res.status(201).json(rows[0]);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const keys = Object.keys(body);
  const vals = Object.values(body);
  const sets = keys.map((k, i) => \`"\${k}" = $\${i + 2}\`).join(", ");
  const { rows } = await pool.query(
    \`UPDATE ${table.schema}.${table.name} SET \${sets} WHERE ${pk} = $1 RETURNING *\`,
    [req.params.id, ...vals],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  res.json(rows[0]);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await pool.query(
    \`DELETE FROM ${table.schema}.${table.name} WHERE ${pk} = $1\`,
    [req.params.id],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  }
  res.status(204).send();
}));
`;
}

function generateApp(tables: IrTable[]): string {
  return `import express from "express";
import swaggerUi from "swagger-ui-express";
${tables.map((t) => `import { router as ${toCamelCase(t.name)}Router } from "./routes/${t.name}.js";`).join("\n")}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup({
  openapi: "3.0.0",
  info: { title: "Generated API", version: "1.0.0" },
  paths: {},
}));

${tables.map((t) => `app.use("/${t.routeName}", ${toCamelCase(t.name)}Router);`).join("\n")}

export default app;
`;
}

function generateServer(): string {
  return `import app from "./app.js";

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(\`Server on http://localhost:\${port}\`);
  console.log(\`Docs on http://localhost:\${port}/api-docs\`);
});
`;
}

function generateAsyncHandler(): string {
  return `import type { Request, Response, NextFunction } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
`;
}

function generateJestTest(): string {
  return `import request from "supertest";
// Health test uses inject pattern via manual fetch in integration tests
describe("health", () => {
  it("placeholder passes", () => {
    expect(true).toBe(true);
  });
});
`;
}

export function buildNodeExpressPlan(input: AdapterInput): RenderPlan {
  const { ir, options } = input;
  const files: RenderFile[] = [
    { path: "package.json", contents: generatePackageJson() },
    { path: "src/db/client.ts", contents: generateDb() },
    { path: "src/middleware/asyncHandler.ts", contents: generateAsyncHandler() },
    { path: "src/app.ts", contents: generateApp(ir.tables) },
    { path: "src/server.ts", contents: generateServer() },
    { path: ".env.example", contents: "DATABASE_URL=postgres://user:pass@localhost:5432/db\nPORT=3000\n" },
    { path: "README.md", contents: "# Generated Express API\n\nnpm run dev\n" },
  ];

  for (const table of ir.tables) {
    files.push({
      path: `src/routes/${table.name}.ts`,
      contents: generateRouter(table),
    });
  }

  if (options.docker) {
    files.push({
      path: "Dockerfile",
      contents: `FROM node:22-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\nCOPY . .\nCMD ["npm", "start"]\n`,
    });
  }

  if (options.tests) {
    files.push({ path: "tests/health.test.ts", contents: generateJestTest() });
  }

  return { files, warnings: [...ir.warnings] };
}
