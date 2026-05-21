import type { TargetAdapter } from "@pgpump/core";
import { buildPythonFastApiPlan } from "./generator";

export const pythonFastApiAdapter: TargetAdapter = {
  id: "python-fastapi",
  displayName: "Python + FastAPI",
  buildRenderPlan: buildPythonFastApiPlan,
};

export { buildPythonFastApiPlan };
