import * as p from "@clack/prompts";
import { pingPostgres } from "@pgpump/core";
import { sanitizeConnectionString } from "../errors";
import { c, symbols } from "./theme";

export interface VerifyResult {
  ok: boolean;
  database?: string;
  version?: string;
  durationMs: number;
  error?: string;
}

export async function verifyConnection(
  connectionString: string,
): Promise<VerifyResult> {
  const spinner = p.spinner();
  spinner.start(
    `${symbols.database} Testing ${c.accent(sanitizeConnectionString(connectionString))}`,
  );
  const result = await pingPostgres(connectionString);
  if (result.ok) {
    spinner.stop(
      `${symbols.check} ${c.success("Connected")} ${c.muted(`(${result.durationMs}ms · ${result.database})`)}`,
    );
    return {
      ok: true,
      database: result.database,
      version: result.serverVersion,
      durationMs: result.durationMs,
    };
  }
  spinner.stop(
    `${symbols.cross} ${c.danger("Connection failed")} ${c.muted(`(${result.durationMs}ms)`)}`,
  );
  return { ok: false, durationMs: result.durationMs, error: result.error };
}
