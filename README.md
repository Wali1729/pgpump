# PGPump

**Database → REST API generator (PostgreSQL)**

PGPump is a Bun-based CLI that introspects a PostgreSQL database and generates a production-oriented REST API using an **Intermediate Representation (IR)** JSON layer. The same schema can target **Bun/Fastify**, **Node/Express**, or **Python/FastAPI** via pluggable adapters.

---

## Why PGPump

- **Less boilerplate**: CRUD routes, types, validation, pagination, and docs scaffolded from your real schema.
- **One introspection, many stacks**: IR decouples database reading from code generation.
- **Fast feedback**: Built for Bun’s execution speed; introspection should finish in **under 5 seconds** for up to ~50 tables.
- **Safer defaults**: Generated data access uses **parameterized queries** (or native query builders)—no string-concatenated SQL for user input.

---

## Features (roadmap)

| Area | What you get |
|------|----------------|
| Introspection | Tables, columns, nullability, defaults, PKs/FKs via `information_schema` |
| IR | Framework-agnostic JSON (abstract PG types → STRING, NUMBER, etc.) |
| HTTP | Standard CRUD + **paginated** list routes per table |
| Relations | **1-to-many** nested sub-routes where detected; **circular FK** links skipped to avoid infinite generation |
| Validation | **Zod** (TS stacks) or **Pydantic** (FastAPI) |
| Docs | OpenAPI/Swagger wired per adapter (`@fastify/swagger`, `swagger-ui-express`, FastAPI built-ins) |
| Ops | Optional **Dockerfile** / **docker-compose**, **`.env.example`**, **README** in generated projects |
| Tests | Optional scaffolded tests (Bun test / Jest / Pytest) |

**Out of scope (initial sprint):** auth middleware (JWT/OAuth), many-to-many resolution, migration management, GUI.

---

## Framework adapter matrix

<!-- AUTO-GENERATED:framework-matrix — sync when adapter list in source changes -->
| Target | Language | Server | Validation | DB client | API docs |
|--------|----------|--------|------------|-----------|----------|
| Bun/Fastify | TypeScript | Fastify | Zod | `postgres` | `@fastify/swagger` |
| Node/Express | TypeScript | Express | Zod | `pg` | `swagger-ui-express` |
| Python/FastAPI | Python 3.10+ | FastAPI | Pydantic | async SQLAlchemy + `asyncpg` | FastAPI OpenAPI |
<!-- END AUTO-GENERATED -->

---

## CLI (planned behavior)

Built with **Commander** (or equivalent) on **Bun**, with **chalk** + **ora** for UX.

Interactive prompts:

- PostgreSQL connection URI  
- Target: `bun-fastify` \| `node-express` \| `python-fastapi`  
- Output directory  
- Generate Docker? (Y/N)  
- Generate tests? (Y/N)  

Connection failures exit with a clear, colored error.

---

<!-- AUTO-GENERATED:package-scripts — source: package.json -->
### Project scripts

| Command | Description |
|---------|-------------|
| `bun install` | Install workspace dependencies |
| `bun run pgpump` | Run the PGPump CLI |
| `bun run dev` | Alias for CLI dev entry |
| `bun test` | Run all tests (E2E skipped by default, no coverage gate) |
| `bun run test:coverage` | Full suite with coverage thresholds |
| `bun run test:ci` | Full suite + E2E + coverage (CI) |
| `bun run test:unit` | Unit + adapter contract tests |
| `bun run test:e2e` | Integration + E2E (Docker Postgres, no coverage gate) |
| `bun run test:golden` | Golden file path snapshots |
| `bun run build` | Build workspace packages |

<!-- END AUTO-GENERATED -->

### CLI usage

```bash
# Interactive generate
bun run pgpump generate -i

# Non-interactive
bun run pgpump generate \
  --database-url "$DATABASE_URL" \
  --target bun-fastify \
  --output ./generated-api \
  --docker \
  --tests

# Introspect only (IR JSON)
bun run pgpump introspect \
  --database-url "$DATABASE_URL" \
  --output ir.json
```

Targets: `bun-fastify`, `python-fastapi`, `node-express`.

Optional `pgpump.config.ts` can register local adapters (see `pgpump.config.example.ts` and [docs/ADAPTER_AUTHORING.md](docs/ADAPTER_AUTHORING.md)).

---

## Generated output (by target)

**Common (all adapters):** `Dockerfile`, `docker-compose.yml`, `.env.example`, project `README.md` (as applicable).

**Bun/Fastify:** `src/controllers/`, `src/routes/`, `src/schemas/`, `src/db/`, `tests/`, `app.ts`, `package.json`, `tsconfig.json`.

**Node/Express:** `src/controllers/`, `src/routes/`, `src/middleware/`, `src/db/`, `tests/`, `app.ts`, `package.json`, `tsconfig.json`.

**Python/FastAPI:** `app/api/routers/`, `app/models/`, `app/schemas/`, `app/repositories/`, `app/services/`, `app/db/`, `tests/`, `main.py`, `requirements.txt`.

Templates use **Handlebars** (or similar) driven by the IR JSON.

---

## API behavior (generated apps)

- **List:** `GET /<table>` supports `limit`, `offset`, `sortBy`, `order`, plus **exact-match** filters via query parameters.  
- **Errors:** Invalid payloads rejected by generated Zod/Pydantic schemas.

---

## Assumptions & edge cases

- Tables expose a **primary key**; **composite PKs** use the **first** PK column for routing/generation.  
- **Views** and **materialized views** are ignored.  
- Custom PG types (e.g. `tsvector`, `jsonb`) map to a generic **ANY** in IR → `any` (TS) / `Any` (Python) with relaxed validation.

---

## Acceptance criteria (sprint)

- CLI runs on **Bun** without runtime errors.  
- IR JSON is correct for a test DB with **≥ 3 tables** and **≥ 1 foreign key**.  
- **Bun/Fastify** output: `bun run dev` serves **Swagger UI**; CRUD + pagination work against Postgres.  
- **FastAPI** output: `uvicorn main:app` serves docs and connects via **async SQLAlchemy** using the `asyncpg` driver.
- Generated test suites pass at least **health-check** level.

---

## Contributing & documentation

- Prefer regenerating tables and env docs from **`package.json`**, **`.env.example`**, and OpenAPI/route sources using the **update-docs** workflow so README stays aligned with the repo.

---

## License

*Specify license when the package is published.*
