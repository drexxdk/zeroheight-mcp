import 'dotenv/config';
import { getClient } from '../lib/common/supabaseClients';

async function main() {
  const { client } = getClient();
  if (!client) {
    console.error('Supabase client not configured');
    process.exit(1);
  }

  try {
    const { data, error } = await client
      .from('images')
      .select('id, original_url, storage_path, page_id')
      .order('id', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error querying images table:', error);
      process.exit(1);
    }

    console.log('Images rows (most recent first):');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Unexpected error:', e);
    process.exit(1);
  }
}

main();
