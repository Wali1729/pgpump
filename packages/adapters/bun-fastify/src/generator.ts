import type {
  AdapterInput,
  IrDatabase,
  IrRelation,
  IrTable,
  RenderFile,
  RenderPlan,
} from "@pgpump/core";
import {
  filterableColumns,
  irToTsType,
  irToZodType,
  nonPkColumns,
  pkColumn,
  sortableColumns,
  tableEntityName,
  tableVarName,
} from "./helpers";

function generatePackageJson(): string {
  return JSON.stringify(
    {
      name: "generated-api",
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "bun --watch src/server.ts",
        start: "bun src/server.ts",
        test: "bun test",
      },
      dependencies: {
        fastify: "^5.2.1",
        "@fastify/swagger": "^9.4.2",
        "@fastify/swagger-ui": "^5.2.1",
        postgres: "^3.4.5",
        zod: "^3.24.1",
      },
      devDependencies: {
        "@types/bun": "latest",
      },
    },
    null,
    2,
  );
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        types: ["bun-types"],
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
    },
    null,
    2,
  );
}

function generateEnvExample(): string {
  return `DATABASE_URL=postgres://user:password@localhost:5432/mydb
PORT=3000
`;
}

function generateDb(): string {
  return `import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export const sql = postgres(connectionString, { max: 10 });
`;
}

function generateErrors(): string {
  return `export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(err: AppError | Error) {
  if (err instanceof AppError) {
    return {
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    };
  }
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: err.message,
      details: null,
    },
  };
}
`;
}

function generateRepository(table: IrTable): string {
  const entity = tableEntityName(table);
  const varName = tableVarName(table);
  const pk = pkColumn(table);
  const filters = filterableColumns(table);
  const sorts = sortableColumns(table);
  const allowedSort = sorts.map((c) => `"${c.name}"`).join(" | ") || `"${pk.name}"`;
  const allowedFilter = filters.map((c) => `"${c.name}"`).join(" | ");

  const insertCols = nonPkColumns(table);
  const insertNames = insertCols.map((c) => c.name).join(", ");
  const insertValues = insertCols.map((c) => `input.${c.name}`).join(", ");

  const updateSets = insertCols
    .map((c) => `${c.name} = \${input.${c.name}}`)
    .join(", ");

  const filterGuard = filters.length
    ? `const ALLOWED_FILTER = new Set<string>([${filters.map((c) => `"${c.name}"`).join(", ")}]);`
    : "";
  const filterCheck = filters.length
    ? 'if (!ALLOWED_FILTER.has(key)) throw new AppError(400, "INVALID_FILTER", "Invalid filter: " + key);'
    : "";

  const sortList =
    sorts.map((c) => `"${c.name}"`).join(", ") || `"${pk.name}"`;
  const filterList = filters.map((c) => `"${c.name}"`).join(", ");

  const parts: string[] = [];
  parts.push('import { sql } from "../db/client";');
  parts.push('import { AppError } from "../lib/errors";');
  parts.push('import type { ' + entity + ' } from "../types/' + varName + '";');
  parts.push("");
  parts.push("const ALLOWED_SORT = new Set<string>([" + sortList + "]);");
  if (filterGuard) parts.push(filterGuard);
  parts.push("");
  parts.push("export interface ListParams {");
  parts.push("  limit: number;");
  parts.push("  offset: number;");
  parts.push("  sortBy: " + allowedSort + ";");
  parts.push('  order: "asc" | "desc";');
  parts.push("  filters: Record<string, string | number | boolean>;");
  parts.push("}");
  parts.push("");
  parts.push("export class " + entity + "Repository {");
  parts.push(
    "  async findMany(params: ListParams): Promise<{ rows: " +
      entity +
      "[]; total: number }> {",
  );
  parts.push("    if (!ALLOWED_SORT.has(params.sortBy)) {");
  parts.push('      throw new AppError(400, "INVALID_SORT", "Invalid sortBy");');
  parts.push("    }");
  parts.push('    const order = params.order === "desc" ? "DESC" : "ASC";');
  parts.push("    const values: unknown[] = [];");
  parts.push("    const clauses: string[] = [];");
  parts.push("    let idx = 1;");
  parts.push("    for (const [key, value] of Object.entries(params.filters)) {");
  if (filterCheck) parts.push("      " + filterCheck);
  parts.push('      clauses.push(\'"\' + key + \'\" = $\' + idx++);');
  parts.push("      values.push(value);");
  parts.push("    }");
  parts.push('    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";');
  parts.push("    values.push(params.limit, params.offset);");
  parts.push(
    "    const rows = await sql.unsafe(" +
      `'SELECT * FROM ${table.schema}.${table.name} ' + where + ' ORDER BY "' + params.sortBy + '" ' + order + ' LIMIT $' + idx + ' OFFSET $' + (idx + 1),` +
      " values) as " +
      entity +
      "[];",
  );
  parts.push(
    "    const countRows = await sql.unsafe(" +
      `'SELECT COUNT(*)::text AS count FROM ${table.schema}.${table.name} ' + where,` +
      " values.slice(0, -2)) as { count: string }[];",
  );
  parts.push("    return { rows, total: Number(countRows[0]?.count ?? 0) };");
  parts.push("  }");
  parts.push("");
  parts.push(
    "  async findById(id: " +
      irToTsType(pk.irType) +
      "): Promise<" +
      entity +
      " | null> {",
  );
  parts.push(
    "    const rows = await sql`SELECT * FROM " +
      table.schema +
      "." +
      table.name +
      " WHERE " +
      pk.name +
      " = ${id} LIMIT 1`;",
  );
  parts.push("    return rows[0] ?? null;");
  parts.push("  }");

  if (insertNames) {
    parts.push("");
    parts.push(
      "  async create(input: Omit<" + entity + ', "' + pk.name + '">): Promise<' + entity + "> {",
    );
    parts.push(
      "    const rows = await sql`INSERT INTO " +
        table.schema +
        "." +
        table.name +
        " (" +
        insertNames +
        ") VALUES (" +
        insertValues +
        ") RETURNING *`;",
    );
    parts.push("    return rows[0]!;");
    parts.push("  }");
  }

  if (updateSets) {
    parts.push("");
    parts.push(
      "  async update(id: " +
        irToTsType(pk.irType) +
        ", input: Partial<Omit<" +
        entity +
        ', "' +
        pk.name +
        '">>): Promise<' +
        entity +
        " | null> {",
    );
    parts.push(
      "    const rows = await sql`UPDATE " +
        table.schema +
        "." +
        table.name +
        " SET " +
        updateSets +
        " WHERE " +
        pk.name +
        " = ${id} RETURNING *`;",
    );
    parts.push("    return rows[0] ?? null;");
    parts.push("  }");
  }

  parts.push("");
  parts.push(
    "  async delete(id: " + irToTsType(pk.irType) + "): Promise<boolean> {",
  );
  parts.push(
    "    const rows = await sql`DELETE FROM " +
      table.schema +
      "." +
      table.name +
      " WHERE " +
      pk.name +
      " = ${id} RETURNING " +
      pk.name +
      "`;",
  );
  parts.push("    return rows.length > 0;");
  parts.push("  }");
  parts.push("}");

  return parts.join("\n");
}

function generateTypes(table: IrTable): string {
  const entity = tableEntityName(table);
  const fields = table.columns
    .map((c) => `  ${c.name}: ${irToTsType(c.irType)}${c.nullable ? " | null" : ""};`)
    .join("\n");
  return `export interface ${entity} {\n${fields}\n}\n`;
}

function generateSchema(table: IrTable): string {
  const entity = tableEntityName(table);
  const pk = pkColumn(table);
  const createFields = nonPkColumns(table)
    .map((c) => `  ${c.name}: ${irToZodType(c)},`)
    .join("\n");
  const updateFields = nonPkColumns(table)
    .map((c) => `  ${c.name}: ${irToZodType(c)},`)
    .join("\n");

  const filterFields = filterableColumns(table)
    .map((c) => `  ${c.name}: ${irToZodType({ ...c, nullable: true })},`)
    .join("\n");

  const sortFields = sortableColumns(table).map((c) => `"${c.name}"`).join(", ");

  return `import { z } from "zod";

export const ${entity}CreateSchema = z.object({
${createFields}
});

export const ${entity}UpdateSchema = ${entity}CreateSchema.partial();

export const ${entity}IdSchema = z.object({
  id: ${irToZodType(pk)},
});

export const ${entity}ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum([${sortFields || `"${pk.name}"`}]).default("${sortableColumns(table)[0]?.name ?? pk.name}"),
  order: z.enum(["asc", "desc"]).default("asc"),
${filterFields ? `  ...z.object({\n${filterFields}\n  }).partial().shape,` : ""}
});
`;
}

function generateRoutes(table: IrTable, relations: IrRelation[]): string {
  const entity = tableEntityName(table);
  const varName = tableVarName(table);
  const route = table.routeName;
  const repo = `${entity}Repository`;
  const nested = relations.filter(
    (r) => r.parentTable === table.name && !r.skipNestedRoute,
  );

  let nestedRoutes = "";
  for (const rel of nested) {
    nestedRoutes +=
      '\n  app.get("' +
      rel.nestedRoute +
      '", async (req, reply) => {\n' +
      "    const parentId = (req.params as { parentId: string }).parentId;\n" +
      "    const rows = await sql`SELECT * FROM public." +
      rel.childTable +
      " WHERE " +
      rel.childColumn +
      ' = ${parentId}`;\n' +
      "    return rows;\n" +
      "  });";
  }

  return `import type { FastifyInstance } from "fastify";
import { sql } from "../db/client";
import { ${repo} } from "../repositories/${varName}";
import {
  ${entity}CreateSchema,
  ${entity}UpdateSchema,
  ${entity}IdSchema,
  ${entity}ListQuerySchema,
} from "../schemas/${varName}";
import { AppError, errorResponse } from "../lib/errors";

const repo = new ${repo}();

export async function register${entity}Routes(app: FastifyInstance) {
  app.get("/${route}", async (req, reply) => {
    try {
      const query = ${entity}ListQuerySchema.parse(req.query);
      const { limit, offset, sortBy, order, ...filters } = query;
      const { rows, total } = await repo.findMany({ limit, offset, sortBy, order, filters });
      return { data: rows, meta: { pagination: { limit, offset, total } } };
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 400);
      return errorResponse(e as Error);
    }
  });

  app.get("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      const row = await repo.findById(id as never);
      if (!row) {
        reply.status(404);
        return errorResponse(new AppError(404, "NOT_FOUND", "${entity} not found"));
      }
      return row;
    } catch (e) {
      reply.status(400);
      return errorResponse(e as Error);
    }
  });

  app.post("/${route}", async (req, reply) => {
    try {
      const body = ${entity}CreateSchema.parse(req.body);
      const row = await repo.create(body as never);
      reply.status(201);
      return row;
    } catch (e) {
      reply.status(400);
      return errorResponse(e as Error);
    }
  });

  app.patch("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      const body = ${entity}UpdateSchema.parse(req.body);
      const row = await repo.update(id as never, body as never);
      if (!row) {
        reply.status(404);
        return errorResponse(new AppError(404, "NOT_FOUND", "${entity} not found"));
      }
      return row;
    } catch (e) {
      reply.status(400);
      return errorResponse(e as Error);
    }
  });

  app.delete("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      const ok = await repo.delete(id as never);
      if (!ok) {
        reply.status(404);
        return errorResponse(new AppError(404, "NOT_FOUND", "${entity} not found"));
      }
      reply.status(204);
      return;
    } catch (e) {
      reply.status(400);
      return errorResponse(e as Error);
    }
  });
${nestedRoutes}
}
`;
}

function generateApp(tables: IrTable[]): string {
  const registrations = tables
    .map(
      (t) =>
        `  await register${tableEntityName(t)}Routes(app);`,
    )
    .join("\n");

  return `import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
${tables.map((t) => `import { register${tableEntityName(t)}Routes } from "./routes/${tableVarName(t)}";`).join("\n")}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(swagger, {
    openapi: { info: { title: "Generated API", version: "1.0.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", async () => ({ status: "ok" }));

${registrations}

  return app;
}
`;
}

function generateServer(): string {
  return [
    'import { buildApp } from "./app";',
    "",
    "const port = Number(process.env.PORT ?? 3000);",
    "",
    "const app = await buildApp();",
    'await app.listen({ port, host: "0.0.0.0" });',
    'console.log("Server listening on http://localhost:" + port);',
    'console.log("Docs at http://localhost:" + port + "/docs");',
  ].join("\n");
}

function generateDocker(): string {
  return `FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
EXPOSE 3000
CMD ["bun", "src/server.ts"]
`;
}

function generateDockerCompose(): string {
  return `services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://pgpump:pgpump@postgres:5432/pgpump
    depends_on:
      - postgres
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pgpump
      POSTGRES_PASSWORD: pgpump
      POSTGRES_DB: pgpump
    ports:
      - "5432:5432"
`;
}

function generateReadme(ir: IrDatabase): string {
  return `# Generated API

Generated by PGPump from database **${ir.database}**.

## Run

\`\`\`bash
bun install
cp .env.example .env
bun run dev
\`\`\`

- API: http://localhost:3000
- Docs: http://localhost:3000/docs
- Health: http://localhost:3000/health
`;
}

function generateTest(): string {
  return `import { expect, test } from "bun:test";
import { buildApp } from "../src/app";

test("health check", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
  await app.close();
});
`;
}

export function buildBunFastifyPlan(input: AdapterInput): RenderPlan {
  const { ir, options } = input;
  const files: RenderFile[] = [
    { path: "package.json", contents: generatePackageJson() },
    { path: "tsconfig.json", contents: generateTsConfig() },
    { path: ".env.example", contents: generateEnvExample() },
    { path: "README.md", contents: generateReadme(ir) },
    { path: "src/db/client.ts", contents: generateDb() },
    { path: "src/lib/errors.ts", contents: generateErrors() },
    { path: "src/app.ts", contents: generateApp(ir.tables) },
    { path: "src/server.ts", contents: generateServer() },
  ];

  for (const table of ir.tables) {
    const varName = tableVarName(table);
    files.push({ path: `src/types/${varName}.ts`, contents: generateTypes(table) });
    files.push({ path: `src/schemas/${varName}.ts`, contents: generateSchema(table) });
    files.push({
      path: `src/repositories/${varName}.ts`,
      contents: generateRepository(table),
    });
    files.push({
      path: `src/routes/${varName}.ts`,
      contents: generateRoutes(table, ir.relations),
    });
  }

  if (options.docker) {
    files.push({ path: "Dockerfile", contents: generateDocker() });
    files.push({ path: "docker-compose.yml", contents: generateDockerCompose() });
  }

  if (options.tests) {
    files.push({ path: "tests/health.test.ts", contents: generateTest() });
  }

  return { files, warnings: [...ir.warnings] };
}
