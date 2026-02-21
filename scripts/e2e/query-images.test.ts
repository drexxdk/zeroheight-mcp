import "dotenv/config";
import { getClient } from "@/utils/common/supabaseClients";
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const { client: supabase } = getClient();
  if (!supabase) {
    logger.error("Supabase client not configured");
    process.exit(1);
  }

  try {
    const { data, error } = await supabase
      .from("images")
      .select("id, original_url, storage_path, page_id")
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      logger.error("Error querying images table:", error);
      process.exit(1);
    }

    logger.log("Images rows (most recent first):");
    logger.log(JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error("Unexpected error:", e);
    process.exit(1);
  }
}

main();
