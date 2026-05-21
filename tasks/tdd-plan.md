# PGPump — TDD-First Implementation Plan

> Red → Green → Refactor. No source module ships without a failing test written first.
> Coverage gate: **80 % branches / functions / lines / statements** across all TS packages.

---

## Milestone 0 — Scaffold & Tooling (no production code yet)

**Goal:** a runnable `bun test` that exits 0 with 0 tests, plus CI.

```
tests/           ← top-level test root
  fixtures/      ← seed IR JSON + SQL DDL snapshots
  golden/        ← golden-file outputs per adapter
package.json     ← bun test + coverage scripts
bunfig.toml      ← test coverage thresholds
```

**Scripts to wire first:**

```jsonc
"test":          "bun test",
"test:watch":    "bun test --watch",
"test:coverage": "bun test --coverage"
```

**`bunfig.toml` coverage gate:**

```toml
[test.coverage]
threshold = { lines = 80, functions = 80, branches = 80, statements = 80 }
include   = ["src/**/*.ts"]
exclude   = ["src/**/*.d.ts"]
```

**Done when:** `bun test` and `bun test --coverage` both exit 0.

---

## Milestone 1 — IR Contract Tests (`src/ir/`)

Write ALL tests before any `src/ir/` source exists.

### 1-A  Type-map contract

File: `tests/unit/ir/typeMap.test.ts`

```
RED tests to write first:
  ✗ maps "integer"    → NUMBER
  ✗ maps "bigint"     → NUMBER
  ✗ maps "text"       → STRING
  ✗ maps "varchar"    → STRING
  ✗ maps "boolean"    → BOOLEAN
  ✗ maps "timestamp"  → DATETIME
  ✗ maps "uuid"       → STRING
  ✗ maps "jsonb"      → ANY
  ✗ maps "tsvector"   → ANY
  ✗ unknown type      → ANY (fallback)
```

Contract: `mapPgTypeToIR(pgType: string): IRColumnType`
Assertion style: strict equality, no snapshot.

### 1-B  IR shape contract

File: `tests/unit/ir/irSchema.test.ts`

Use `zod.parse` on a static fixture to assert the IR JSON schema is valid.

Fixture: `tests/fixtures/ir-3table.json` — 3 tables, 1 FK, 1 nullable col, 1 composite-PK table (uses first PK col).

```
RED tests:
  ✗ valid 3-table IR passes zod parse
  ✗ IR without "tables" key throws ZodError
  ✗ IR column missing "type" key throws ZodError
  ✗ IR FK pointing to non-existent table throws ZodError
  ✗ composite PK resolves to first column only
  ✗ view/materialised-view entries are absent from IR
```

### 1-C  Introspector contract (DB mock)

File: `tests/unit/ir/introspector.test.ts`

Mock the `postgres` client — never hit a real DB in unit tests.

```
RED tests:
  ✗ buildIR(mockRows) returns tables array
  ✗ nullable column sets nullable: true
  ✗ default value preserved in column.default
  ✗ FK detected between orders.user_id → users.id
  ✗ circular FK (a→b→a) is skipped/flagged
  ✗ table with no PK is still included (composite PK rule)
  ✗ 0 tables returns { tables: [] }
  ✗ completes within 5 s for 50-table fixture (performance assertion)
```

**Coverage target for `src/ir/`:** 90 % lines, 85 % branches.

---

## Milestone 2 — Adapter Contract Tests (`src/adapters/`)

Each adapter must satisfy the same interface. Write the interface contract test first, then implement each adapter one at a time.

### 2-A  Adapter interface contract

File: `tests/unit/adapters/adapterContract.ts` (shared helper, not a test file)

```typescript
// contract helper — call once per adapter under test
export function runAdapterContract(name: string, factory: () => Adapter) {
  describe(`${name} adapter contract`, () => {
    it("generate() returns non-empty FileMap for minimal IR")
    it("generate() includes routes file")
    it("generate() includes schema/validation file")
    it("generate() includes db client file")
    it("generate() includes package.json or requirements.txt")
    it("generate() with docker:true adds Dockerfile")
    it("generate() with docker:false omits Dockerfile")
    it("generate() with tests:true adds tests/ directory")
    it("generate() returns FileMap with valid relative paths (no absolute)")
    it("generate() is idempotent — same IR produces same output")
  })
}
```

Each adapter test file calls this helper:

```
tests/unit/adapters/bunFastify.test.ts   → runAdapterContract("bun-fastify", ...)
tests/unit/adapters/nodeExpress.test.ts  → runAdapterContract("node-express", ...)
tests/unit/adapters/pythonFastAPI.test.ts → runAdapterContract("python-fastapi", ...)
```

### 2-B  Adapter-specific tests

Written against the shared 3-table fixture IR.

**Bun/Fastify** (`tests/unit/adapters/bunFastify.test.ts`):
```
  ✗ routes file contains GET /<table> and POST /<table>
  ✗ Zod schema generated for each table
  ✗ @fastify/swagger import present in app.ts output
  ✗ 1-to-many sub-route present when FK detected
  ✗ no circular sub-route for circular FK pair
  ✗ pagination params (limit, offset, sortBy, order) in list route
```

**Node/Express** (`tests/unit/adapters/nodeExpress.test.ts`):
```
  ✗ swagger-ui-express wired in generated app.ts
  ✗ middleware/ directory present in FileMap
  ✗ pg client import in db file
```

**Python/FastAPI** (`tests/unit/adapters/pythonFastAPI.test.ts`):
```
  ✗ Pydantic model generated per table
  ✗ asyncpg import in database.py
  ✗ requirements.txt contains fastapi, asyncpg, pydantic
  ✗ router file follows app/routers/<table>.py path
  ✗ main.py present with app = FastAPI()
```

**Coverage target for `src/adapters/`:** 85 % lines, 80 % branches.

---

## Milestone 3 — Golden-File Tests for Templates

Golden files are the source of truth for rendered output. Update them intentionally; CI fails on unintended drift.

### Setup

```
tests/golden/
  bun-fastify/
    users.routes.ts.snap
    users.schema.ts.snap
    app.ts.snap
    Dockerfile.snap
  node-express/
    users.routes.ts.snap
    app.ts.snap
  python-fastapi/
    routers_users.py.snap
    models_users.py.snap
    main.py.snap
    requirements.txt.snap
```

### Test pattern

File: `tests/golden/golden.test.ts`

```typescript
import { readFileSync } from "fs"

function goldenTest(adapter: string, file: string, actual: string) {
  const snapPath = `tests/golden/${adapter}/${file}.snap`
  it(`golden: ${adapter}/${file}`, () => {
    // UPDATE_GOLDEN=1 bun test → writes new snap
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(snapPath, actual)
    }
    expect(actual).toBe(readFileSync(snapPath, "utf8"))
  })
}
```

```
RED tests to write first (using the 3-table fixture IR):
  ✗ bun-fastify users.routes.ts matches golden snap
  ✗ bun-fastify app.ts matches golden snap
  ✗ bun-fastify Dockerfile matches golden snap
  ✗ node-express users.routes.ts matches golden snap
  ✗ python-fastapi routers/users.py matches golden snap
  ✗ python-fastapi requirements.txt matches golden snap
```

**Workflow:** write test → run → RED (snap missing) → generate output → capture snap → GREEN.
**Update rule:** `UPDATE_GOLDEN=1 bun test` regenerates; commit the diff intentionally.

---

## Milestone 4 — CLI Prompt Tests (`src/cli/`)

CLI is tested by injecting stdin/argv — no interactive TTY required.

### 4-A  Argument parsing unit tests

File: `tests/unit/cli/args.test.ts`

```
RED tests:
  ✗ --uri flag sets connection URI
  ✗ --target bun-fastify parsed correctly
  ✗ --target node-express parsed correctly
  ✗ --target python-fastapi parsed correctly
  ✗ --out sets output directory
  ✗ --docker flag defaults to false
  ✗ --tests flag defaults to false
  ✗ unknown --target value exits with code 1 and prints error
  ✗ missing --uri in non-interactive mode exits with code 1
```

### 4-B  Interactive prompt tests

File: `tests/unit/cli/prompts.test.ts`

Use `inquirer` (or equivalent) mock or inject answers via `process.stdin`.

```
RED tests:
  ✗ prompts for URI when not supplied via flag
  ✗ prompts for target when not supplied
  ✗ prompts for output directory, defaults to "./generated"
  ✗ prompts for docker (Y/N), default N
  ✗ prompts for tests (Y/N), default N
  ✗ invalid URI (non-postgres:// scheme) re-prompts once then exits
```

### 4-C  Connection failure test

File: `tests/unit/cli/connection.test.ts`

Mock the DB connection to throw `ECONNREFUSED`.

```
RED tests:
  ✗ prints chalk-colored error message containing "connection failed"
  ✗ exits with code 1
  ✗ does NOT write any files to output dir
```

### 4-D  End-to-end CLI smoke test

File: `tests/e2e/cli.e2e.test.ts`

Spins up a **real Postgres container** (or skipped with `SKIP_E2E=1`).

```
RED tests:
  ✗ pgpump --uri <test-db> --target bun-fastify --out /tmp/out exits 0
  ✗ output dir contains app.ts, package.json, src/routes/
  ✗ completes in under 10 s for 3-table schema
  ✗ pgpump --uri <test-db> --target python-fastapi --out /tmp/out exits 0
  ✗ output dir contains main.py, requirements.txt, app/routers/
```

**Coverage target for `src/cli/`:** 85 % lines, 80 % branches.

---

## Milestone 5 — Integration: IR → Adapter Pipeline

File: `tests/integration/pipeline.test.ts`

End-to-end unit-level pipeline using the mocked introspector.

```
RED tests:
  ✗ pipeline(mockDB, "bun-fastify", opts) returns FileMap with ≥ 5 files
  ✗ pipeline respects docker:false → no Dockerfile in FileMap
  ✗ pipeline with 0 tables returns empty FileMap and logs warning
  ✗ pipeline for 50-table IR completes under 5 s
  ✗ FileMap paths are unique (no duplicate filenames)
  ✗ all TS files in FileMap are valid TypeScript (tsc --noEmit on output)
  ✗ all Python files in FileMap pass `py -m ast` parse check
```

---

## Milestone 6 — Generated Output Quality Tests

These verify the *generated project* code quality, not PGPump's own code.

File: `tests/quality/generated.test.ts`

```
RED tests:
  ✗ generated Bun/Fastify app.ts compiles: tsc --noEmit exits 0
  ✗ generated Zod schema has .parse() for each table
  ✗ generated list route uses parameterized query (no string concat SQL)
  ✗ generated Python routers use asyncpg bind params ($1, $2)
  ✗ generated .env.example contains DATABASE_URL
  ✗ generated README.md contains "Getting Started" section
```

---

## Test Execution Order

Implement milestones strictly in order. Each milestone's tests must be GREEN before writing source for the next.

```
M0 → M1-A → M1-B → M1-C → M2-A → M2-B (per adapter) → M3 → M4-A → M4-B → M4-C → M5 → M6 → M4-D (E2E)
```

E2E tests (M4-D) run last and are gated behind `SKIP_E2E` in CI unit runs.

---

## Coverage Targets Summary

| Package         | Lines | Branches | Functions |
|-----------------|-------|----------|-----------|
| `src/ir/`       | 90 %  | 85 %     | 90 %      |
| `src/adapters/` | 85 %  | 80 %     | 85 %      |
| `src/cli/`      | 85 %  | 80 %     | 85 %      |
| `src/` overall  | 80 %  | 80 %     | 80 %      |

CI blocks merge if any threshold is not met.

---

## File Layout for Tests

```
tests/
  fixtures/
    ir-3table.json          ← canonical 3-table IR (users, orders, products + FK)
    ir-circular-fk.json     ← a→b→a circular FK case
    ir-0table.json          ← empty schema edge case
    ir-50table.json         ← performance fixture (generated)
    ddl-3table.sql          ← matching DDL for E2E seed
  unit/
    ir/
      typeMap.test.ts
      irSchema.test.ts
      introspector.test.ts
    adapters/
      adapterContract.ts    ← shared contract helper
      bunFastify.test.ts
      nodeExpress.test.ts
      pythonFastAPI.test.ts
    cli/
      args.test.ts
      prompts.test.ts
      connection.test.ts
  integration/
    pipeline.test.ts
  quality/
    generated.test.ts
  golden/
    bun-fastify/
    node-express/
    python-fastapi/
  e2e/
    cli.e2e.test.ts         ← requires POSTGRES_URL env var
```

---

## Acceptance Checklist (matches sprint AC)

- [ ] M0: `bun test` exits 0
- [ ] M1: IR JSON correct for 3-table + 1 FK schema
- [ ] M2: All 3 adapters pass contract suite
- [ ] M3: Golden snaps committed and passing
- [ ] M4: CLI prompts + error paths tested
- [ ] M5: Pipeline integration green
- [ ] M6: Generated output passes quality checks
- [ ] E2E: `bun-fastify` output boots and serves Swagger UI
- [ ] E2E: `python-fastapi` output boots via `uvicorn`
- [ ] Coverage: all thresholds met (`bun test --coverage`)
