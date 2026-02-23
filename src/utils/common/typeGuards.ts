import { Json } from "@/generated/database-schema";

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function hasStringProp(
  obj: unknown,
  prop: string,
): obj is Record<string, unknown> & { [k: string]: unknown } {
  if (!isRecord(obj)) return false;
  const val = obj[prop];
  return typeof val === "string";
}

export function isJson(x: unknown): x is Json {
  try {
    // JSON.stringify will throw on circular structures; if it succeeds,
    // the value is JSON-serializable which is sufficient for DB `Json`.
    JSON.stringify(x);
    return true;
  } catch {
    return false;
  }
}

export function getProp(obj: unknown, key: string): unknown | undefined {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}
