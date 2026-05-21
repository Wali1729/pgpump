import type { TargetAdapter } from "@pgpump/core";
import { buildBunFastifyPlan } from "./generator";

export const bunFastifyAdapter: TargetAdapter = {
  id: "bun-fastify",
  displayName: "Bun + Fastify",
  buildRenderPlan: buildBunFastifyPlan,
};

export { buildBunFastifyPlan };
