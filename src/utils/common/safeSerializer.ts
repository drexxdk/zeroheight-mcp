// Lightweight safe serializer that avoids invoking dangerous getters
// and handles circular references. Designed for debug logging only.
import { isRecord, getProp } from "@/utils/common/typeGuards";

export type SafeSerializeOptions = {
  maxDepth?: number;
  showErrorStack?: boolean;
  maxArrayLength?: number;
};

export function safeSerialize(
  value: unknown,
  opts: SafeSerializeOptions = {},
): string {
  const { maxDepth = 4, showErrorStack = true, maxArrayLength = 50 } = opts;
  const seen = new WeakSet<object>();

  function errorToObject(x: unknown): unknown {
    try {
      if (x instanceof Error) {
        const e = x as Error & { stack?: string };
        const out: Record<string, unknown> = {
          name: e.name,
          message: e.message,
        };
        if (showErrorStack && typeof e.stack === "string") out.stack = e.stack;
        return out;
      }
    } catch {
      // fallthrough
    }
    return null;
  }

  function toDateString(x: unknown): string | null {
    try {
      if (x instanceof Date) return x.toISOString();
    } catch {
      // ignore
    }
    return null;
  }

  function arrayToSerializable(a: unknown[], depth: number): unknown[] {
    const out = a.slice(0, maxArrayLength).map((it) => inner(it, depth - 1));
    if (a.length > maxArrayLength) out.push("[truncated]");
    return out;
  }

  function hrefLikeToString(x: unknown): string | null {
    try {
      if (!isRecord(x)) return null;
      // URLSearchParams-like -> toString()
      try {
        const maybeEntries = getProp(x, "entries");
        if (typeof maybeEntries === "function")
          return String((x as { toString(): string }).toString());
      } catch {
        // ignore
      }
      try {
        const maybeHref = getProp(x, "href");
        if (typeof maybeHref === "string") return String(maybeHref);
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
    return null;
  }

  function recordToSerializable(obj: unknown, depth: number): unknown {
    if (!isRecord(obj)) return String(obj);
    const rec = obj;
    if (seen.has(rec)) return "[Circular]";
    seen.add(rec);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) {
      try {
        out[k] = inner(getProp(rec, k), depth - 1);
      } catch {
        out[k] = "[unserializable]";
      }
    }
    return out;
  }

  function inner(v: unknown, depth: number): unknown {
    if (v === null || v === undefined) return v;
    if (depth <= 0)
      return typeof v === "object" ? Object.prototype.toString.call(v) : v;
    const t = typeof v;
    if (t === "number" || t === "string" || t === "boolean") return v;
    if (t === "function")
      return `[Function: ${(v as { name?: string }).name ?? "anonymous"}]`;

    const errObj = errorToObject(v);
    if (errObj) return errObj;

    const dateStr = toDateString(v);
    if (dateStr) return dateStr;

    const href = hrefLikeToString(v);
    if (href) return href;

    if (Array.isArray(v)) return arrayToSerializable(v, depth);
    if (isRecord(v)) return recordToSerializable(v, depth);
    return String(v);
  }

  try {
    return JSON.stringify(inner(value, maxDepth), null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
}
