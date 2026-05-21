import type {
  AdapterInput,
  IrDatabase,
  IrRelation,
  IrTable,
  RenderFile,
  RenderPlan,
} from "@pgpump/core";
import {
  drizzleColumnOptions,
  drizzleColumnType,
  drizzleImports,
  filterableColumns,
  irToTsType,
  irToZodType,
  nonPkColumns,
  pkColumn,
  repositoryName,
  schemaExportName,
  serviceName,
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
        "drizzle-orm": "^0.38.0",
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

function generateConfig(): string {
  return `export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  port: Number(process.env.PORT ?? 3000),
};
`;
}

function generateDbClient(): string {
  return `import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config";
import * as schema from "./schema";

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = postgres(config.databaseUrl, { max: 10 });

export const db = drizzle(client, { schema });
export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await client.end();
}
`;
}

function generateSchemaIndex(tables: IrTable[]): string {
  const exports = tables
    .map((t) => `export * from "./${tableVarName(t)}";`)
    .join("\n");
  return `${exports}\n`;
}

function generateDrizzleSchema(table: IrTable): string {
  const entity = tableEntityName(table);
  const varName = schemaExportName(table);
  const columnDefs = table.columns
    .map((column) => {
      const builder = drizzleColumnType(column.irType);
      const options = drizzleColumnOptions(column);
      return `  ${column.name}: ${builder}("${column.name}")${options},`;
    })
    .join("\n");

  if (table.schema === "public") {
    const imports = drizzleImports(table.columns)
      .filter((name) => name !== "pgSchema")
      .concat(["pgTable"])
      .sort()
      .join(", ");
    return `import { ${imports} } from "drizzle-orm/pg-core";

export const ${varName} = pgTable("${table.name}", {
${columnDefs}
});

export type ${entity} = typeof ${varName}.$inferSelect;
export type ${entity}Insert = typeof ${varName}.$inferInsert;
`;
  }

  const schemaVar = `${table.schema.replace(/[^a-zA-Z0-9]/g, "_")}Schema`;
  const imports = drizzleImports(table.columns).join(", ");
  return `import { ${imports} } from "drizzle-orm/pg-core";

const ${schemaVar} = pgSchema("${table.schema}");

export const ${varName} = ${schemaVar}.table("${table.name}", {
${columnDefs}
});

export type ${entity} = typeof ${varName}.$inferSelect;
export type ${entity}Insert = typeof ${varName}.$inferInsert;
`;
}

function generateCommonSchemas(): string {
  return `export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface PageMeta {
  pagination: Pagination;
}
`;
}

function generateZodSchema(table: IrTable): string {
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

function sortColumnMap(table: IrTable): string {
  const sorts = sortableColumns(table);
  const pk = pkColumn(table);
  const names = sorts.length ? sorts.map((c) => c.name) : [pk.name];
  const varName = schemaExportName(table);
  return names
    .map((name) => `  ${name}: ${varName}.${name},`)
    .join("\n");
}

function filterColumnMap(table: IrTable): string {
  const filters = filterableColumns(table);
  const varName = schemaExportName(table);
  return filters.map((c) => `  ${c.name}: ${varName}.${c.name},`).join("\n");
}

function foreignKeyColumnMap(table: IrTable, relations: IrRelation[]): string {
  const childRelations = relations.filter((r) => r.childTable === table.name);
  const varName = schemaExportName(table);
  const columns = [...new Set(childRelations.map((r) => r.childColumn))];
  return columns.map((name) => `  ${name}: ${varName}.${name},`).join("\n");
}

function generateRepository(table: IrTable, relations: IrRelation[]): string {
  const entity = tableEntityName(table);
  const varName = tableVarName(table);
  const tableRef = schemaExportName(table);
  const repo = repositoryName(table);
  const pk = pkColumn(table);
  const filters = filterableColumns(table);
  const sorts = sortableColumns(table);
  const allowedSort = sorts.map((c) => `"${c.name}"`).join(" | ") || `"${pk.name}"`;
  const writable = nonPkColumns(table);
  const childRelations = relations.filter((r) => r.childTable === table.name);
  const fkColumns = [...new Set(childRelations.map((r) => r.childColumn))];
  const sortMap = sortColumnMap(table);
  const filterMap = filterColumnMap(table);
  const fkMap = foreignKeyColumnMap(table, relations);

  const filterGuard = filters.length
    ? `const ALLOWED_FILTER = new Set<string>([${filters.map((c) => `"${c.name}"`).join(", ")}]);`
    : "";
  const filterCheck = filters.length
    ? 'if (!ALLOWED_FILTER.has(key)) throw new AppError(400, "INVALID_FILTER", "Invalid filter: " + key);'
    : "";

  const sortList = sorts.map((c) => `"${c.name}"`).join(", ") || `"${pk.name}"`;

  const parts: string[] = [];
  parts.push('import { and, asc, count, desc, eq } from "drizzle-orm";');
  parts.push("");
  parts.push(`import type { Database } from "../db/client";`);
  parts.push(`import { ${tableRef}, type ${entity}, type ${entity}Insert } from "../db/schema/${varName}";`);
  parts.push('import { AppError } from "../lib/errors";');
  parts.push("");
  parts.push("const SORT_COLUMNS = {");
  parts.push(sortMap);
  parts.push("} as const;");
  if (filterMap) {
    parts.push("");
    parts.push("const FILTER_COLUMNS = {");
    parts.push(filterMap);
    parts.push("} as const;");
  }
  if (fkMap) {
    parts.push("");
    parts.push("const FK_COLUMNS = {");
    parts.push(fkMap);
    parts.push("} as const;");
    parts.push(
      `const ALLOWED_FK_COLUMNS = new Set<string>([${fkColumns.map((c) => `"${c}"`).join(", ")}]);`,
    );
  }
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
  parts.push(`export class ${repo} {`);
  parts.push(
    "  async list(db: Database, params: ListParams): Promise<{ rows: " +
      entity +
      "[]; total: number }> {",
  );
  parts.push("    if (!ALLOWED_SORT.has(params.sortBy)) {");
  parts.push('      throw new AppError(400, "INVALID_SORT", "Invalid sortBy");');
  parts.push("    }");
  parts.push("    const clauses = [];");
  parts.push("    for (const [key, value] of Object.entries(params.filters)) {");
  if (filterCheck) parts.push("      " + filterCheck);
  if (filterMap) {
    parts.push(
      "      clauses.push(eq(FILTER_COLUMNS[key as keyof typeof FILTER_COLUMNS], value));",
    );
  }
  parts.push("    }");
  parts.push("    const whereClause = clauses.length ? and(...clauses) : undefined;");
  parts.push(
    "    const sortCol = SORT_COLUMNS[params.sortBy as keyof typeof SORT_COLUMNS];",
  );
  parts.push(
    '    const orderBy = params.order === "desc" ? desc(sortCol) : asc(sortCol);',
  );
  parts.push("    const rows = await db");
  parts.push("      .select()");
  parts.push(`      .from(${tableRef})`);
  parts.push("      .where(whereClause)");
  parts.push("      .orderBy(orderBy)");
  parts.push("      .limit(params.limit)");
  parts.push("      .offset(params.offset);");
  parts.push("    const countRows = await db");
  parts.push("      .select({ value: count() })");
  parts.push(`      .from(${tableRef})`);
  parts.push("      .where(whereClause);");
  parts.push("    return { rows, total: Number(countRows[0]?.value ?? 0) };");
  parts.push("  }");
  parts.push("");
  parts.push(
    "  async get(db: Database, id: " +
      irToTsType(pk.irType) +
      "): Promise<" +
      entity +
      " | null> {",
  );
  parts.push("    const rows = await db");
  parts.push("      .select()");
  parts.push(`      .from(${tableRef})`);
  parts.push(`      .where(eq(${tableRef}.${pk.name}, id))`);
  parts.push("      .limit(1);");
  parts.push("    return rows[0] ?? null;");
  parts.push("  }");

  if (writable.length) {
    parts.push("");
    parts.push(
      "  async create(db: Database, input: " + entity + "Insert): Promise<" + entity + "> {",
    );
    parts.push("    const rows = await db");
    parts.push(`      .insert(${tableRef})`);
    parts.push("      .values(input)");
    parts.push("      .returning();");
    parts.push("    return rows[0]!;");
    parts.push("  }");
    parts.push("");
    parts.push(
      "  async update(db: Database, id: " +
        irToTsType(pk.irType) +
        ", input: Partial<" +
        entity +
        "Insert>): Promise<" +
        entity +
        " | null> {",
    );
    parts.push("    if (Object.keys(input).length === 0) {");
    parts.push(
      '      throw new AppError(400, "NO_FIELDS_TO_UPDATE", "No fields to update");',
    );
    parts.push("    }");
    parts.push("    const rows = await db");
    parts.push(`      .update(${tableRef})`);
    parts.push("      .set(input)");
    parts.push(`      .where(eq(${tableRef}.${pk.name}, id))`);
    parts.push("      .returning();");
    parts.push("    return rows[0] ?? null;");
    parts.push("  }");
  }

  if (fkMap) {
    parts.push("");
    parts.push(
      "  async listByForeignKey(db: Database, column: string, parentId: string | number): Promise<" +
        entity +
        "[]> {",
    );
    parts.push("    if (!ALLOWED_FK_COLUMNS.has(column)) {");
    parts.push(
      '      throw new AppError(400, "INVALID_FK_COLUMN", "Invalid foreign key column: " + column);',
    );
    parts.push("    }");
    parts.push(
      "    const fkCol = FK_COLUMNS[column as keyof typeof FK_COLUMNS];",
    );
    parts.push("    return db.select().from(" + tableRef + ").where(eq(fkCol, parentId));");
    parts.push("  }");
  }

  parts.push("");
  parts.push("  async delete(db: Database, id: " + irToTsType(pk.irType) + "): Promise<boolean> {");
  parts.push("    const rows = await db");
  parts.push(`      .delete(${tableRef})`);
  parts.push(`      .where(eq(${tableRef}.${pk.name}, id))`);
  parts.push(`      .returning({ id: ${tableRef}.${pk.name} });`);
  parts.push("    return rows.length > 0;");
  parts.push("  }");
  parts.push("}");

  return parts.join("\n");
}

function generateService(table: IrTable, relations: IrRelation[]): string {
  const entity = tableEntityName(table);
  const varName = tableVarName(table);
  const repo = repositoryName(table);
  const svc = serviceName(table);
  const pk = pkColumn(table);
  const writable = nonPkColumns(table);
  const childRelations = relations.filter((r) => r.childTable === table.name);
  const hasFkList = childRelations.length > 0;

  const parts: string[] = [];
  parts.push(`import { db } from "../db/client";`);
  parts.push(`import { ${repo}, type ListParams } from "../repositories/${varName}";`);
  parts.push('import { AppError } from "../lib/errors";');
  parts.push(`import type { ${entity}, ${entity}Insert } from "../db/schema/${varName}";`);
  parts.push(`import type { PageMeta } from "../schemas/common";`);
  parts.push("");
  parts.push(`export class ${svc} {`);
  parts.push(`  constructor(private readonly repository: ${repo}) {}`);
  parts.push("");
  parts.push("  async list(params: ListParams): Promise<{ data: " + entity + "[]; meta: PageMeta }> {");
  parts.push("    const { rows, total } = await this.repository.list(db, params);");
  parts.push("    return {");
  parts.push("      data: rows,");
  parts.push("      meta: { pagination: { limit: params.limit, offset: params.offset, total } },");
  parts.push("    };");
  parts.push("  }");
  parts.push("");
  parts.push("  async get(id: " + irToTsType(pk.irType) + "): Promise<" + entity + "> {");
  parts.push("    const row = await this.repository.get(db, id);");
  parts.push("    if (!row) {");
  parts.push(
    `      throw new AppError(404, "NOT_FOUND", "${entity} not found");`,
  );
  parts.push("    }");
  parts.push("    return row;");
  parts.push("  }");

  if (writable.length) {
    parts.push("");
    parts.push(
      "  async create(input: " + entity + "Insert): Promise<" + entity + "> {",
    );
    parts.push("    return this.repository.create(db, input);");
    parts.push("  }");
    parts.push("");
    parts.push(
      "  async update(id: " +
        irToTsType(pk.irType) +
        ", input: Partial<" +
        entity +
        "Insert>): Promise<" +
        entity +
        "> {",
    );
    parts.push("    const row = await this.repository.update(db, id, input);");
    parts.push("    if (!row) {");
    parts.push(
      `      throw new AppError(404, "NOT_FOUND", "${entity} not found");`,
    );
    parts.push("    }");
    parts.push("    return row;");
    parts.push("  }");
  }

  if (hasFkList) {
    parts.push("");
    parts.push(
      "  async listByForeignKey(column: string, parentId: string | number): Promise<" +
        entity +
        "[]> {",
    );
    parts.push("    return this.repository.listByForeignKey(db, column, parentId);");
    parts.push("  }");
  }

  parts.push("");
  parts.push("  async delete(id: " + irToTsType(pk.irType) + "): Promise<void> {");
  parts.push("    const ok = await this.repository.delete(db, id);");
  parts.push("    if (!ok) {");
  parts.push(`      throw new AppError(404, "NOT_FOUND", "${entity} not found");`);
  parts.push("    }");
  parts.push("  }");
  parts.push("}");

  return parts.join("\n");
}

function generateRoutes(
  table: IrTable,
  relations: IrRelation[],
  tables: IrTable[],
): string {
  const entity = tableEntityName(table);
  const varName = tableVarName(table);
  const route = table.routeName;
  const svc = serviceName(table);
  const repo = repositoryName(table);
  const nested = relations.filter(
    (r) => r.parentTable === table.name && !r.skipNestedRoute,
  );

  const nestedServiceDeclsFixed = nested
    .map((rel) => {
      const childTable = tables.find((t) => t.name === rel.childTable);
      if (!childTable) return "";
      const childVar = tableVarName(childTable);
      const childSvc = serviceName(childTable);
      const childRepo = repositoryName(childTable);
      return `const ${childVar}Service = new ${childSvc}(new ${childRepo}());`;
    })
    .filter(Boolean)
    .join("\n");

  const nestedRoutesFixed = nested
    .map((rel) => {
      const childTable = tables.find((t) => t.name === rel.childTable);
      if (!childTable) return "";
      const childVar = tableVarName(childTable);
      return (
        '\n  app.get("' +
        rel.nestedRoute +
        '", async (req, reply) => {\n' +
        "    try {\n" +
        "      const parentId = (req.params as { parentId: string }).parentId;\n" +
        `      const rows = await ${childVar}Service.listByForeignKey("${rel.childColumn}", parentId as never);\n` +
        "      return rows;\n" +
        "    } catch (e) {\n" +
        "      reply.status(e instanceof AppError ? e.statusCode : 400);\n" +
        "      return errorResponse(e as Error);\n" +
        "    }\n" +
        "  });"
      );
    })
    .filter(Boolean)
    .join("");

  const uniqueNestedImports = [...new Set(
    nested
      .map((rel) => {
        const childTable = tables.find((t) => t.name === rel.childTable);
        if (!childTable) return "";
        const childVar = tableVarName(childTable);
        const childSvc = serviceName(childTable);
        const childRepo = repositoryName(childTable);
        return `import { ${childSvc} } from "../services/${childVar}";\nimport { ${childRepo} } from "../repositories/${childVar}";`;
      })
      .filter(Boolean),
  )].join("\n");

  return `import type { FastifyInstance } from "fastify";
import { ${repo} } from "../repositories/${varName}";
import {
  ${entity}CreateSchema,
  ${entity}UpdateSchema,
  ${entity}IdSchema,
  ${entity}ListQuerySchema,
} from "../schemas/${varName}";
import { ${svc} } from "../services/${varName}";
import { AppError, errorResponse } from "../lib/errors";
${uniqueNestedImports ? uniqueNestedImports + "\n" : ""}
const service = new ${svc}(new ${repo}());
${nestedServiceDeclsFixed ? nestedServiceDeclsFixed + "\n" : ""}
export async function register${entity}Routes(app: FastifyInstance) {
  app.get("/${route}", async (req, reply) => {
    try {
      const query = ${entity}ListQuerySchema.parse(req.query);
      const { limit, offset, sortBy, order, ...filters } = query;
      return await service.list({ limit, offset, sortBy, order, filters });
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 400);
      return errorResponse(e as Error);
    }
  });

  app.get("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      return await service.get(id as never);
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 404);
      return errorResponse(e as Error);
    }
  });

  app.post("/${route}", async (req, reply) => {
    try {
      const body = ${entity}CreateSchema.parse(req.body);
      const row = await service.create(body as never);
      reply.status(201);
      return row;
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 400);
      return errorResponse(e as Error);
    }
  });

  app.patch("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      const body = ${entity}UpdateSchema.parse(req.body);
      return await service.update(id as never, body as never);
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 404);
      return errorResponse(e as Error);
    }
  });

  app.delete("/${route}/:id", async (req, reply) => {
    try {
      const { id } = ${entity}IdSchema.parse(req.params);
      await service.delete(id as never);
      reply.status(204);
      return;
    } catch (e) {
      reply.status(e instanceof AppError ? e.statusCode : 404);
      return errorResponse(e as Error);
    }
  });
${nestedRoutesFixed}
}
`;
}

function generateApp(tables: IrTable[]): string {
  const registrations = tables
    .map((t) => `  await register${tableEntityName(t)}Routes(app);`)
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
    'import { config } from "./config";',
    "",
    "const app = await buildApp();",
    'await app.listen({ port: config.port, host: "0.0.0.0" });',
    'console.log("Server listening on http://localhost:" + config.port);',
    'console.log("Docs at http://localhost:" + config.port + "/docs");',
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

Stack: Bun, Fastify, Drizzle ORM, Zod.

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
    { path: "src/config.ts", contents: generateConfig() },
    { path: "src/db/client.ts", contents: generateDbClient() },
    { path: "src/db/schema/index.ts", contents: generateSchemaIndex(ir.tables) },
    { path: "src/lib/errors.ts", contents: generateErrors() },
    { path: "src/schemas/common.ts", contents: generateCommonSchemas() },
    { path: "src/app.ts", contents: generateApp(ir.tables) },
    { path: "src/server.ts", contents: generateServer() },
  ];

  for (const table of ir.tables) {
    const varName = tableVarName(table);
    files.push({
      path: `src/db/schema/${varName}.ts`,
      contents: generateDrizzleSchema(table),
    });
    files.push({
      path: `src/schemas/${varName}.ts`,
      contents: generateZodSchema(table),
    });
    files.push({
      path: `src/repositories/${varName}.ts`,
      contents: generateRepository(table, ir.relations),
    });
    files.push({
      path: `src/services/${varName}.ts`,
      contents: generateService(table, ir.relations),
    });
    files.push({
      path: `src/routes/${varName}.ts`,
      contents: generateRoutes(table, ir.relations, ir.tables),
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
