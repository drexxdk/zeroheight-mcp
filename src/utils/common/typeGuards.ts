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
