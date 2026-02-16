import { config } from "dotenv";
config({ path: ".env.local" });

export async function runTool(
  modulePath: string,
  exportName: string,
  args?: Record<string, unknown> | undefined,
) {
  const mod = await import(modulePath);
  const tool = (mod as Record<string, unknown>)[exportName] as
    | { handler: (a?: unknown) => Promise<unknown> }
    | undefined;
  if (!tool || typeof tool.handler !== "function") {
    throw new Error(`Tool ${exportName} not found in module ${modulePath}`);
  }
  console.log(
    `Invoking tool ${exportName} from ${modulePath} with args:`,
    args,
  );
  const res = await tool.handler(args ?? {});
  console.log("Tool response:", JSON.stringify(res, null, 2));
  return res;
}

export default runTool;
