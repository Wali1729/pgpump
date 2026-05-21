import postgres from "postgres";
import type { GenerationWarning, IrColumn, IrDatabase, IrTable } from "../ir/types";

export interface PingResult {
  ok: boolean;
  serverVersion?: string;
  database?: string;
  durationMs: number;
  error?: string;
}

export async function pingPostgres(
  connectionString: string,
  timeoutMs = 5000,
): Promise<PingResult> {
  const started = Date.now();
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    sql = postgres(connectionString, {
      max: 1,
      connect_timeout: Math.ceil(timeoutMs / 1000),
      idle_timeout: 1,
    });
    const [row] = await sql<
      { server_version: string; current_database: string }[]
    >`SELECT version() AS server_version, current_database() AS current_database`;
    return {
      ok: true,
      serverVersion: row.server_version,
      database: row.current_database,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await sql?.end({ timeout: 1 });
    } catch {
      // ignore
    }
  }
}
import { validateIrDatabase } from "../ir/schema";
import { enrichIrWithRelations } from "../relations/planner";
import {
  isFilterable,
  isSortable,
  mapPostgresTypeToIr,
} from "../type-mapping";
import { toRouteName } from "../utils/naming";

export interface IntrospectOptions {
  connectionString: string;
  schema?: string;
}

interface RawColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface RawPk {
  table_name: string;
  column_name: string;
  ordinal_position: number;
}

interface RawFk {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export async function introspectPostgres(
  options: IntrospectOptions,
): Promise<IrDatabase> {
  const schema = options.schema ?? "public";
  const sql = postgres(options.connectionString, { max: 1 });
  const warnings: GenerationWarning[] = [];

  try {
    const [{ current_database }] = await sql<
      { current_database: string }[]
    >`SELECT current_database()`;

    const columns = await sql<RawColumn[]>`
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name,
             c.is_nullable, c.column_default
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE c.table_schema = ${schema}
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `;

    const pks = await sql<RawPk[]>`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${schema}
      ORDER BY tc.table_name, kcu.ordinal_position
    `;

    const fks = await sql<RawFk[]>`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = ${schema}
    `;

    const pkMap = new Map<string, string[]>();
    for (const pk of pks) {
      const list = pkMap.get(pk.table_name) ?? [];
      list.push(pk.column_name);
      pkMap.set(pk.table_name, list);
    }

    const fkMap = new Map<string, RawFk>();
    for (const fk of fks) {
      fkMap.set(`${fk.table_name}.${fk.column_name}`, fk);
    }

    const tableNames = [...new Set(columns.map((c) => c.table_name))].sort();
    const tables: IrTable[] = [];

    for (const tableName of tableNames) {
      const tableCols = columns.filter((c) => c.table_name === tableName);
      const pkCols = pkMap.get(tableName) ?? [];
      if (pkCols.length === 0) {
        warnings.push({
          code: "NO_PRIMARY_KEY",
          message: `Table ${tableName} has no primary key; generation may be incomplete`,
          table: tableName,
        });
      }
      if (pkCols.length > 1) {
        warnings.push({
          code: "COMPOSITE_PK",
          message: `Table ${tableName} has composite PK; using first column ${pkCols[0]}`,
          table: tableName,
        });
      }

      const irColumns: IrColumn[] = tableCols.map((col) => {
        const dbType = col.data_type === "USER-DEFINED" ? col.udt_name : col.data_type;
        const irType = mapPostgresTypeToIr(dbType);
        if (irType === "ANY") {
          warnings.push({
            code: "CUSTOM_TYPE",
            message: `Column ${tableName}.${col.column_name} (${dbType}) mapped to ANY`,
            table: tableName,
          });
        }
        const fk = fkMap.get(`${tableName}.${col.column_name}`);
        const isPk = pkCols.includes(col.column_name);
        return {
          name: col.column_name,
          dbType,
          irType,
          nullable: col.is_nullable === "YES",
          defaultValue: col.column_default,
          isPrimaryKey: isPk,
          isForeignKey: !!fk,
          foreignKey: fk
            ? {
                table: fk.foreign_table_name,
                column: fk.foreign_column_name,
              }
            : undefined,
          filterable: isFilterable(irType) && !isPk,
          sortable: isSortable(irType),
        };
      });

      tables.push({
        name: tableName,
        schema,
        columns: irColumns,
        primaryKeyColumns: pkCols,
        routeName: toRouteName(tableName),
      });
    }

    let ir: IrDatabase = {
      version: "1.0",
      database: current_database,
      generatedAt: new Date().toISOString(),
      tables,
      relations: [],
      warnings,
    };

    ir = enrichIrWithRelations(ir);
    return validateIrDatabase(ir);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
