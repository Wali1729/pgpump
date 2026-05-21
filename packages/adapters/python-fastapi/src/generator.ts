import type { AdapterInput, IrColumn, IrDatabase, IrTable, RenderFile, RenderPlan } from "@pgpump/core";
import {
  entityName,
  filterableColumns,
  moduleName,
  nonPkColumns,
  pkColumn,
  pyType,
  pythonDefaultImportTypes,
  repositoryName,
  schemaClass,
  serviceName,
  sortableColumns,
  sqlalchemyImports,
  sqlalchemyType,
} from "./helpers";

function generateRequirements(): string {
  return `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy>=2.0.36
asyncpg>=0.30.0
pydantic>=2.10.0
pydantic-settings>=2.6.0
pytest>=8.3.0
httpx>=0.28.0
`;
}

function generateConfig(): string {
  return `from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Generated API"
    app_version: str = "1.0.0"
    database_url: str


@lru_cache
def get_settings() -> Settings:
    return Settings()
`;
}

function generateDbBase(): string {
  return `from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
`;
}

function generateDbSession(): string {
  return `from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
`;
}

function generateErrors(): string {
  return `from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )
`;
}

function columnPyAnnotation(column: IrColumn): string {
  const base = pyType(column.irType);
  return column.nullable ? `${base} | None` : base;
}

function schemaField(column: IrColumn, forceOptional: boolean): string {
  const annotation = forceOptional || column.nullable || column.defaultValue
    ? `${pyType(column.irType)} | None`
    : pyType(column.irType);
  const defaultValue = forceOptional || column.nullable || column.defaultValue ? " = None" : "";
  return `    ${column.name}: ${annotation}${defaultValue}`;
}

function readSchemaField(column: IrColumn): string {
  return `    ${column.name}: ${columnPyAnnotation(column)}`;
}

function generateModel(table: IrTable): string {
  const tableClass = entityName(table);
  const columns = table.columns
    .map((column) => {
      const fk = column.foreignKey
        ? `ForeignKey("${table.schema}.${column.foreignKey.table}.${column.foreignKey.column}"), `
        : "";
      const options = [
        `primary_key=${column.isPrimaryKey ? "True" : "False"}`,
        `nullable=${column.nullable ? "True" : "False"}`,
      ].join(", ");
      return `    ${column.name}: Mapped[${columnPyAnnotation(column)}] = mapped_column(${sqlalchemyType(column.irType)}, ${fk}${options})`;
    })
    .join("\n");

  const typeImports = pythonDefaultImportTypes(table.columns);
  const sqlalchemyTypeImports = sqlalchemyImports(table.columns);
  const hasForeignKeys = table.columns.some((c) => c.foreignKey);
  const importLines: string[] = [];
  if (typeImports.includes("Any")) importLines.push("from typing import Any");
  const datetimeImports = typeImports.filter((name) => name === "date" || name === "datetime");
  if (datetimeImports.length) importLines.push(`from datetime import ${datetimeImports.join(", ")}`);
  if (typeImports.includes("UUID")) importLines.push("from uuid import UUID");

  return `${importLines.length ? `${importLines.join("\n")}\n\n` : ""}from sqlalchemy import ${[
    ...sqlalchemyTypeImports,
    ...(hasForeignKeys ? ["ForeignKey"] : []),
  ].sort().join(", ")}
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ${tableClass}(Base):
    __tablename__ = "${table.name}"
    __table_args__ = {"schema": "${table.schema}"}

${columns}
`;
}

function generateCommonSchemas(): string {
  return `from pydantic import BaseModel


class Pagination(BaseModel):
    limit: int
    offset: int
    total: int


class PageMeta(BaseModel):
    pagination: Pagination
`;
}

function generateSchema(table: IrTable): string {
  const tableClass = entityName(table);
  const writable = nonPkColumns(table);
  const filters = filterableColumns(table);
  const sorts = sortableColumns(table);
  const pk = pkColumn(table);
  const typeImports = pythonDefaultImportTypes(table.columns);
  const importLines: string[] = [];
  if (typeImports.includes("Any")) importLines.push("from typing import Any, Literal");
  else importLines.push("from typing import Literal");
  const datetimeImports = typeImports.filter((name) => name === "date" || name === "datetime");
  if (datetimeImports.length) importLines.push(`from datetime import ${datetimeImports.join(", ")}`);
  if (typeImports.includes("UUID")) importLines.push("from uuid import UUID");

  const createBody = writable.length
    ? writable.map((column) => schemaField(column, false)).join("\n")
    : "    pass";
  const updateBody = writable.length
    ? writable.map((column) => schemaField(column, true)).join("\n")
    : "    pass";
  const readBody = table.columns.map((column) => readSchemaField(column)).join("\n");
  const filterBody = filters.map((column) => schemaField(column, true)).join("\n");
  const sortOptions = sorts.map((column) => `"${column.name}"`).join(", ") || `"${pk.name}"`;
  const defaultSort = sorts[0]?.name ?? pk.name;

  return `${importLines.join("\n")}

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PageMeta


class ${schemaClass(table, "Create")}(BaseModel):
${createBody}


class ${schemaClass(table, "Update")}(BaseModel):
${updateBody}


class ${schemaClass(table, "Read")}(BaseModel):
    model_config = ConfigDict(from_attributes=True)

${readBody}


class ${schemaClass(table, "ListQuery")}(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    sort_by: Literal[${sortOptions}] = Field(default="${defaultSort}", alias="sortBy")
    order: Literal["asc", "desc"] = "asc"${filterBody ? `\n${filterBody}` : ""}


class ${schemaClass(table, "Page")}(BaseModel):
    data: list[${schemaClass(table, "Read")}]
    meta: PageMeta
`;
}

function generateRepository(table: IrTable): string {
  const tableClass = entityName(table);
  const repo = repositoryName(table);
  const createSchema = schemaClass(table, "Create");
  const updateSchema = schemaClass(table, "Update");
  const pk = pkColumn(table);
  const sorts = sortableColumns(table).map((column) => column.name);
  const filters = filterableColumns(table).map((column) => column.name);
  const sortList = sorts.length ? sorts : [pk.name];
  const filterSet = filters.map((name) => `"${name}"`).join(", ");

  return `from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import AppError
from app.models.${moduleName(table)} import ${tableClass}
from app.schemas.${moduleName(table)} import ${createSchema}, ${updateSchema}


ALLOWED_SORT = {${sortList.map((name) => `"${name}"`).join(", ")}}
ALLOWED_FILTER = {${filterSet}}


class ${repo}:
    async def list(
        self,
        session: AsyncSession,
        *,
        limit: int,
        offset: int,
        sort_by: str,
        order: str,
        filters: dict[str, Any],
    ) -> tuple[list[${tableClass}], int]:
        if sort_by not in ALLOWED_SORT:
            raise AppError(400, "INVALID_SORT", "Invalid sortBy")

        clauses = []
        for key, value in filters.items():
            if key not in ALLOWED_FILTER:
                raise AppError(400, "INVALID_FILTER", f"Invalid filter: {key}")
            clauses.append(getattr(${tableClass}, key) == value)

        order_column = getattr(${tableClass}, sort_by)
        if order == "desc":
            order_column = order_column.desc()

        statement = (
            select(${tableClass})
            .where(*clauses)
            .order_by(order_column)
            .limit(limit)
            .offset(offset)
        )
        count_statement = select(func.count()).select_from(${tableClass}).where(*clauses)

        rows_result = await session.execute(statement)
        count_result = await session.execute(count_statement)
        return list(rows_result.scalars().all()), int(count_result.scalar_one() or 0)

    async def get(self, session: AsyncSession, item_id: ${pyType(pk.irType)}) -> ${tableClass} | None:
        result = await session.execute(
            select(${tableClass}).where(${tableClass}.${pk.name} == item_id).limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, session: AsyncSession, data: ${createSchema}) -> ${tableClass}:
        item = ${tableClass}(**data.model_dump(exclude_unset=True))
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item

    async def update(
        self,
        session: AsyncSession,
        item_id: ${pyType(pk.irType)},
        data: ${updateSchema},
    ) -> ${tableClass} | None:
        item = await self.get(session, item_id)
        if item is None:
            return None

        changes = data.model_dump(exclude_unset=True)
        if not changes:
            raise AppError(400, "NO_FIELDS_TO_UPDATE", "No fields to update")

        for key, value in changes.items():
            setattr(item, key, value)

        await session.commit()
        await session.refresh(item)
        return item

    async def delete(self, session: AsyncSession, item_id: ${pyType(pk.irType)}) -> bool:
        item = await self.get(session, item_id)
        if item is None:
            return False

        await session.delete(item)
        await session.commit()
        return True
`;
}

function generateService(table: IrTable): string {
  const tableClass = entityName(table);
  const repo = repositoryName(table);
  const service = serviceName(table);
  const pk = pkColumn(table);

  return `from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import AppError
from app.repositories.${moduleName(table)} import ${repo}
from app.schemas.common import PageMeta, Pagination
from app.schemas.${moduleName(table)} import (
    ${schemaClass(table, "Create")},
    ${schemaClass(table, "ListQuery")},
    ${schemaClass(table, "Page")},
    ${schemaClass(table, "Update")},
)


class ${service}:
    def __init__(self, repository: ${repo}) -> None:
        self.repository = repository

    async def list(
        self,
        session: AsyncSession,
        query: ${schemaClass(table, "ListQuery")},
    ) -> ${schemaClass(table, "Page")}:
        query_data = query.model_dump(exclude_none=True)
        limit = query_data.pop("limit")
        offset = query_data.pop("offset")
        sort_by = query_data.pop("sort_by")
        order = query_data.pop("order")
        rows, total = await self.repository.list(
            session,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            order=order,
            filters=query_data,
        )
        return ${schemaClass(table, "Page")}(
            data=rows,
            meta=PageMeta(pagination=Pagination(limit=limit, offset=offset, total=total)),
        )

    async def get(self, session: AsyncSession, item_id: ${pyType(pk.irType)}):
        item = await self.repository.get(session, item_id)
        if item is None:
            raise AppError(404, "NOT_FOUND", "${tableClass} not found")
        return item

    async def create(
        self,
        session: AsyncSession,
        data: ${schemaClass(table, "Create")},
    ):
        return await self.repository.create(session, data)

    async def update(
        self,
        session: AsyncSession,
        item_id: ${pyType(pk.irType)},
        data: ${schemaClass(table, "Update")},
    ):
        item = await self.repository.update(session, item_id, data)
        if item is None:
            raise AppError(404, "NOT_FOUND", "${tableClass} not found")
        return item

    async def delete(self, session: AsyncSession, item_id: ${pyType(pk.irType)}) -> None:
        deleted = await self.repository.delete(session, item_id)
        if not deleted:
            raise AppError(404, "NOT_FOUND", "${tableClass} not found")
`;
}

function generateRouter(table: IrTable): string {
  const tableClass = entityName(table);
  const repo = repositoryName(table);
  const service = serviceName(table);
  const pk = pkColumn(table);

  return `from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.repositories.${moduleName(table)} import ${repo}
from app.schemas.${moduleName(table)} import (
    ${schemaClass(table, "Create")},
    ${schemaClass(table, "ListQuery")},
    ${schemaClass(table, "Page")},
    ${schemaClass(table, "Read")},
    ${schemaClass(table, "Update")},
)
from app.services.${moduleName(table)} import ${service}


router = APIRouter(prefix="/${table.routeName}", tags=["${table.name}"])
service = ${service}(${repo}())


@router.get("", response_model=${schemaClass(table, "Page")})
async def list_items(
    query: Annotated[${schemaClass(table, "ListQuery")}, Query()],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ${schemaClass(table, "Page")}:
    return await service.list(session, query)


@router.get("/{item_id}", response_model=${schemaClass(table, "Read")})
async def get_item(
    item_id: ${pyType(pk.irType)},
    session: Annotated[AsyncSession, Depends(get_session)],
):
    return await service.get(session, item_id)


@router.post("", response_model=${schemaClass(table, "Read")}, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: ${schemaClass(table, "Create")},
    session: Annotated[AsyncSession, Depends(get_session)],
):
    return await service.create(session, body)


@router.patch("/{item_id}", response_model=${schemaClass(table, "Read")})
async def update_item(
    item_id: ${pyType(pk.irType)},
    body: ${schemaClass(table, "Update")},
    session: Annotated[AsyncSession, Depends(get_session)],
):
    return await service.update(session, item_id, body)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_item(
    item_id: ${pyType(pk.irType)},
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    await service.delete(session, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
`;
}

function generateApp(tables: IrTable[]): string {
  const imports = tables
    .map((table) => `from app.api.routers import ${moduleName(table)} as ${moduleName(table)}_router`)
    .join("\n");
  const includes = tables
    .map((table) => `    app.include_router(${moduleName(table)}_router.router)`)
    .join("\n");

  return `from fastapi import FastAPI

from app.api.errors import AppError, app_error_handler
from app.core.config import get_settings
${imports}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_exception_handler(AppError, app_error_handler)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

${includes}

    return app


app = create_app()
`;
}

function generateMain(): string {
  return `from app.main import app

__all__ = ["app"]
`;
}

function generatePytest(): string {
  return `import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://pgpump:pgpump@localhost:5432/pgpump",
)

from fastapi.testclient import TestClient

from app.main import create_app


def test_health():
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
`;
}

function generateDocker(): string {
  return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

function generateDockerCompose(): string {
  return `services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://pgpump:pgpump@postgres:5432/pgpump
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
  return `# Generated FastAPI

Generated by PGPump from database **${ir.database}**.

## Run

\`\`\`bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
\`\`\`

- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health
`;
}

export function buildPythonFastApiPlan(input: AdapterInput): RenderPlan {
  const { ir, options } = input;
  const files: RenderFile[] = [
    { path: "requirements.txt", contents: generateRequirements() },
    { path: ".env.example", contents: "DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/db\n" },
    { path: "README.md", contents: generateReadme(ir) },
    { path: "main.py", contents: generateMain() },
    { path: "app/__init__.py", contents: "" },
    { path: "app/main.py", contents: generateApp(ir.tables) },
    { path: "app/core/__init__.py", contents: "" },
    { path: "app/core/config.py", contents: generateConfig() },
    { path: "app/db/__init__.py", contents: "" },
    { path: "app/db/base.py", contents: generateDbBase() },
    { path: "app/db/session.py", contents: generateDbSession() },
    { path: "app/api/__init__.py", contents: "" },
    { path: "app/api/errors.py", contents: generateErrors() },
    { path: "app/api/routers/__init__.py", contents: "" },
    { path: "app/models/__init__.py", contents: "" },
    { path: "app/repositories/__init__.py", contents: "" },
    { path: "app/schemas/__init__.py", contents: "" },
    { path: "app/schemas/common.py", contents: generateCommonSchemas() },
    { path: "app/services/__init__.py", contents: "" },
  ];

  for (const table of ir.tables) {
    const name = moduleName(table);
    files.push({ path: `app/models/${name}.py`, contents: generateModel(table) });
    files.push({ path: `app/schemas/${name}.py`, contents: generateSchema(table) });
    files.push({ path: `app/repositories/${name}.py`, contents: generateRepository(table) });
    files.push({ path: `app/services/${name}.py`, contents: generateService(table) });
    files.push({ path: `app/api/routers/${name}.py`, contents: generateRouter(table) });
  }

  if (options.docker) {
    files.push({ path: "Dockerfile", contents: generateDocker() });
    files.push({ path: "docker-compose.yml", contents: generateDockerCompose() });
  }

  if (options.tests) {
    files.push({ path: "tests/__init__.py", contents: "" });
    files.push({ path: "tests/test_health.py", contents: generatePytest() });
  }

  return { files, warnings: [...ir.warnings] };
}
