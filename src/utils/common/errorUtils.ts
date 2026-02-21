import { isRecord, getProp } from "@/utils/common/typeGuards";

export function toErrorObj(e: unknown): { message?: string } | null {
  if (e instanceof Error) return { message: e.message };
  if (isRecord(e) && typeof getProp(e, "message") === "string")
    return { message: String(getProp(e, "message")) };
  if (e === null || e === undefined) return null;
  return { message: String(e) };
}
