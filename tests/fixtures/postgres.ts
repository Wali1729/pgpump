import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadSchemaSql(): string {
  return readFileSync(path.join(FIXTURE_DIR, "schema.sql"), "utf8");
}

export async function startPostgresWithDocker(): Promise<{
  connectionString: string;
  stop: () => Promise<void>;
}> {
  const port = 15432 + Math.floor(Math.random() * 1000);
  const containerName = `pgpump-test-${Date.now()}`;
  const user = "pgpump";
  const password = "pgpump";
  const db = "pgpump_test";

  const run = (args: string[]) =>
    Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });

  const startProc = run([
    "run",
    "-d",
    "--name",
    containerName,
    "-e",
    `POSTGRES_USER=${user}`,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    `POSTGRES_DB=${db}`,
    "-p",
    `${port}:5432`,
    "postgres:16-alpine",
  ]);
  await startProc.exited;
  if (startProc.exitCode !== 0) {
    throw new Error(
      `Failed to start postgres container: ${await new Response(startProc.stderr).text()}`,
    );
  }

  const connectionString = `postgres://${user}:${password}@localhost:${port}/${db}`;

  const sql = (await import("postgres")).default(connectionString, { max: 1 });
  for (let i = 0; i < 30; i++) {
    try {
      await sql`SELECT 1`;
      const statements = loadSchemaSql()
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
      await sql.end();
      break;
    } catch {
      await Bun.sleep(500);
      if (i === 29) throw new Error("Postgres fixture did not become ready");
    }
  }

  return {
    connectionString,
    stop: async () => {
      const stopProc = run(["rm", "-f", containerName]);
      await stopProc.exited;
    },
  };
}
