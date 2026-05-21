import type { PgpumpConfig } from "@pgpump/core";

/**
 * Copy to pgpump.config.ts and register local adapters.
 *
 * import { myCustomAdapter } from "./adapters/my-custom";
 * export default { adapters: [myCustomAdapter] } satisfies PgpumpConfig;
 */
const config: PgpumpConfig = {
  adapters: [],
};

export default config;
