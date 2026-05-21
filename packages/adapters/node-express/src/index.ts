import type { TargetAdapter } from "@pgpump/core";
import { buildNodeExpressPlan } from "./generator";

export const nodeExpressAdapter: TargetAdapter = {
  id: "node-express",
  displayName: "Node + Express",
  buildRenderPlan: buildNodeExpressPlan,
};

export { buildNodeExpressPlan };
