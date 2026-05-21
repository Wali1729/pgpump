import { z } from "zod";

const irPrimitive = z.enum([
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "UUID",
  "JSON",
  "BYTES",
  "ANY",
]);

export const irColumnSchema = z.object({
  name: z.string(),
  dbType: z.string(),
  irType: irPrimitive,
  nullable: z.boolean(),
  defaultValue: z.string().nullable(),
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean(),
  foreignKey: z
    .object({
      table: z.string(),
      column: z.string(),
      onDelete: z.string().optional(),
    })
    .optional(),
  filterable: z.boolean(),
  sortable: z.boolean(),
});

export const irTableSchema = z.object({
  name: z.string(),
  schema: z.string(),
  columns: z.array(irColumnSchema),
  primaryKeyColumns: z.array(z.string()),
  routeName: z.string(),
});

export const irRelationSchema = z.object({
  id: z.string(),
  parentTable: z.string(),
  parentColumn: z.string(),
  childTable: z.string(),
  childColumn: z.string(),
  type: z.literal("one-to-many"),
  nestedRoute: z.string(),
  skipNestedRoute: z.boolean(),
  skipReason: z.string().optional(),
});

export const irDatabaseSchema = z.object({
  version: z.literal("1.0"),
  database: z.string(),
  generatedAt: z.string(),
  tables: z.array(irTableSchema),
  relations: z.array(irRelationSchema),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      table: z.string().optional(),
    }),
  ),
});

export function validateIrDatabase(data: unknown) {
  return irDatabaseSchema.parse(data);
}
