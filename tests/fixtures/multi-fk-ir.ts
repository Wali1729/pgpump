import { enrichIrWithRelations, type IrColumn, type IrDatabase, type IrTable } from "@pgpump/core";

const baseUserColumns: IrColumn[] = [
  {
    name: "id",
    dbType: "integer",
    irType: "NUMBER",
    nullable: false,
    defaultValue: null,
    isPrimaryKey: true,
    isForeignKey: false,
    filterable: false,
    sortable: true,
  },
  {
    name: "email",
    dbType: "text",
    irType: "STRING",
    nullable: false,
    defaultValue: null,
    isPrimaryKey: false,
    isForeignKey: false,
    filterable: true,
    sortable: true,
  },
];

function fkColumn(name: string): IrColumn {
  return {
    name,
    dbType: "integer",
    irType: "NUMBER",
    nullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    isForeignKey: true,
    foreignKey: { table: "base_user", column: "id" },
    filterable: true,
    sortable: true,
  };
}

const leavesUsersleaves: IrTable = {
  name: "leaves_usersleaves",
  schema: "public",
  routeName: "leaves-usersleaves",
  primaryKeyColumns: ["id"],
  columns: [
    {
      name: "id",
      dbType: "integer",
      irType: "NUMBER",
      nullable: false,
      defaultValue: null,
      isPrimaryKey: true,
      isForeignKey: false,
      filterable: false,
      sortable: true,
    },
    fkColumn("user_id"),
    fkColumn("approved_by_id"),
    fkColumn("applied_by_id"),
    fkColumn("requested_by_id"),
    fkColumn("cancelled_by_id"),
  ],
};

const baseUser: IrTable = {
  name: "base_user",
  schema: "public",
  routeName: "base-user",
  primaryKeyColumns: ["id"],
  columns: baseUserColumns,
};

// A table that has only PK columns — mirrors real-world Alembic version
// tables, junction tables, etc. Generators must still produce syntactically
// valid output (Python: empty class body needs `pass`).
const alembicVersion: IrTable = {
  name: "alembic_version",
  schema: "public",
  routeName: "alembic-version",
  primaryKeyColumns: ["version_num"],
  columns: [
    {
      name: "version_num",
      dbType: "varchar",
      irType: "STRING",
      nullable: false,
      defaultValue: null,
      isPrimaryKey: true,
      isForeignKey: false,
      filterable: true,
      sortable: true,
    },
  ],
};

const baseIr: IrDatabase = {
  version: "1.0",
  database: "pgpump_multi_fk_test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  tables: [baseUser, leavesUsersleaves, alembicVersion],
  relations: [],
  warnings: [],
};

export const multiFkIr: IrDatabase = enrichIrWithRelations(baseIr);
