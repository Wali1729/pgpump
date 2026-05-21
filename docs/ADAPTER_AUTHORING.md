# Adapter Authoring Guide

PGPump uses a **TargetAdapter** plugin model. Adding a new target (e.g. Next.js API routes, Hono, NestJS) should not require changes to `@pgpump/core`.

## Contract

```ts
import type { TargetAdapter, AdapterInput, RenderPlan } from "@pgpump/core";

export const myAdapter: TargetAdapter = {
  id: "my-target",
  displayName: "My Target",
  buildRenderPlan(input: AdapterInput): RenderPlan {
    return { files: [...], warnings: input.ir.warnings };
  },
};
```

## Steps

1. Create `packages/adapters/my-target/` with `package.json` depending on `@pgpump/core`.
2. Implement `buildRenderPlan` using IR tables, columns, relations, and `GenerationOptions`.
3. Register in `packages/cli/src/register-adapters.ts` **or** export from `pgpump.config.ts`:

```ts
import { myAdapter } from "./adapters/my-target";
export default { adapters: [myAdapter] };
```

4. Add adapter contract tests in `tests/unit/adapters/contract.test.ts`.
5. Add golden snapshot tests under `tests/golden/`.

## Generated API conventions

- Use **parameterized queries** for all user values.
- Whitelist `sortBy` and filter keys from IR column metadata.
- Use framework-native success responses; standardize errors as `{ error: { code, message, details } }`.
- Include pagination metadata: `{ meta: { pagination: { limit, offset, total } } }`.

## Future: external npm packages

Publish `pgpump-target-*` packages that export a `TargetAdapter` and document registration via `pgpump.config.ts`.
