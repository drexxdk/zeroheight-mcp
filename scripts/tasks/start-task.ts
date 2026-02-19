import { config } from "dotenv";
import { isRecord } from "@/utils/common/typeGuards";
config({ path: ".env.local" });

export async function runTool(
  modulePath: string,
  exportName: string,
  args?: Record<string, unknown> | undefined,
) {
  const mod = await import(modulePath);
  if (!isRecord(mod)) throw new Error(`Invalid module loaded: ${modulePath}`);
  const toolCandidate = mod[exportName] as unknown;
  if (!isRecord(toolCandidate) || typeof toolCandidate.handler !== "function") {
    throw new Error(`Tool ${exportName} not found in module ${modulePath}`);
  }
  const tool = toolCandidate as { handler: (a?: unknown) => Promise<unknown> };
  console.log(
    `Invoking tool ${exportName} from ${modulePath} with args:`,
    args,
  );
  const res = await tool.handler(args ?? {});
  console.log("Tool response:", JSON.stringify(res, null, 2));
  return res;
}

export default runTool;
