/* eslint-disable no-console */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { config } from "../../src/utils/config";

function obfuscate(v: unknown): string {
  if (v === undefined) return "undefined";
  const s = String(v);
  if (s.includes("://")) return s;
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

(async () => {
  const env = config.env;
  console.log("CONFIG ENV (obfuscated):");
  console.log(
    "NEXT_PUBLIC_SUPABASE_URL:",
    obfuscate(env.nextPublicSupabaseUrl),
  );
  console.log(
    "SUPABASE_SERVICE_ROLE_KEY present:",
    env.supabaseServiceRoleKey ? true : false,
  );
  console.log(
    "SUPABASE_ACCESS_TOKEN present:",
    env.supabaseAccessToken ? true : false,
  );
  console.log("ZEROHEIGHT_PROJECT_URL:", obfuscate(env.zeroheightProjectUrl));

  if (env.nextPublicSupabaseUrl) {
    try {
      const u = env.nextPublicSupabaseUrl;
      console.log(`Pinging Supabase URL: ${u}`);
      const res = await fetch(u, { method: "GET" });
      console.log("Supabase ping status:", res.status);
    } catch (e) {
      console.error("Supabase connectivity test failed:", String(e));
    }
  }
})();
