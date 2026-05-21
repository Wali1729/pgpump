export type IrPrimitiveType =
  | "STRING"
  | "NUMBER"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "UUID"
  | "JSON"
  | "BYTES"
  | "ANY";

export interface IrColumn {
  name: string;
  dbType: string;
  irType: IrPrimitiveType;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
  };
  filterable: boolean;
  sortable: boolean;
}

export interface IrTable {
  name: string;
  schema: string;
  columns: IrColumn[];
  primaryKeyColumns: string[];
  routeName: string;
}

export interface IrRelation {
  id: string;
  parentTable: string;
  parentColumn: string;
  childTable: string;
  childColumn: string;
  type: "one-to-many";
  nestedRoute: string;
  skipNestedRoute: boolean;
  skipReason?: string;
}

export interface GenerationWarning {
  code: string;
  message: string;
  table?: string;
}

export interface IrDatabase {
  version: "1.0";
  database: string;
  generatedAt: string;
  tables: IrTable[];
  relations: IrRelation[];
  warnings: GenerationWarning[];
}

export interface RenderFile {
  path: string;
  contents: string;
}

export interface RenderPlan {
  files: RenderFile[];
  warnings: GenerationWarning[];
}

export interface GenerationOptions {
  outputDir: string;
  docker: boolean;
  tests: boolean;
}

export interface AdapterInput {
  ir: IrDatabase;
  options: GenerationOptions;
}

export interface TargetAdapter {
  id: string;
  displayName: string;
  buildRenderPlan(input: AdapterInput): RenderPlan | Promise<RenderPlan>;
}
