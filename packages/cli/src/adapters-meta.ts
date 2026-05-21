export interface AdapterMeta {
  id: string;
  label: string;
  hint: string;
  language: string;
  server: string;
  validation: string;
  client: string;
  docs: string;
}

export const ADAPTERS: AdapterMeta[] = [
  {
    id: "bun-fastify",
    label: "Bun + Fastify",
    hint: "TypeScript · Zod · @fastify/swagger · postgres",
    language: "TypeScript",
    server: "Fastify",
    validation: "Zod",
    client: "postgres",
    docs: "@fastify/swagger",
  },
  {
    id: "python-fastapi",
    label: "Python + FastAPI",
    hint: "Python 3.10+ · Pydantic · SQLAlchemy async · built-in OpenAPI",
    language: "Python",
    server: "FastAPI",
    validation: "Pydantic",
    client: "SQLAlchemy async",
    docs: "FastAPI OpenAPI",
  },
  {
    id: "node-express",
    label: "Node + Express",
    hint: "TypeScript · Zod · Drizzle · pg · swagger-ui-express",
    language: "TypeScript",
    server: "Express",
    validation: "Zod",
    client: "Drizzle + pg",
    docs: "swagger-ui-express",
  },
];

export function findAdapterMeta(id: string): AdapterMeta | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
