import sharp from 'sharp';
import { createClient } from "@supabase/supabase-js";
import type { Database } from './database.schema';

export async function downloadImage(
  url: string,
  _filename: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<string | null> {
  try {
    console.log(`Downloading image from: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    console.log(`Response status: ${response.status}, content-type: ${response.headers.get('content-type')}`);
    
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    
    const contentType = response.headers.get('content-type') || '';
    console.log(`Content-Type: ${contentType}`);
    
    const buffer = await response.arrayBuffer();
    console.log(`Downloaded buffer length: ${buffer.byteLength}`);

    // First try to validate with Sharp - this will tell us if it's actually a valid image
    let metadata;
    try {
      metadata = await sharp(Buffer.from(buffer)).metadata();
      console.log(`Image format: ${metadata.format}, size: ${metadata.width}x${metadata.height}`);
    } catch (error) {
      console.error(`Invalid image data or unsupported format: ${error}`);
      // If it's not a valid image according to Sharp, skip it
      if (!contentType.startsWith('image/')) {
        console.log(`Skipping non-image content: ${contentType}`);
        return null;
      }
      // If content-type says it's an image but Sharp can't process it, still skip
      return null;
    }

    // Skip SVG and GIF images - don't upload them to storage
    if (metadata.format === 'svg' || metadata.format === 'gif') {
      console.log(`Ignoring ${metadata.format} format - not uploading to storage bucket`);
      return null;
    }

    // Process image with sharp: resize to max 600x600, convert to JPEG, optimize
    const processedBuffer = await sharp(Buffer.from(buffer))
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // Fill transparent areas with white
      .jpeg({ quality: 80 })
      .toBuffer();

    console.log(`Processed buffer length: ${processedBuffer.length}`);
    return processedBuffer.toString('base64');
  } catch (error) {
    console.error(`Error downloading image ${url}:`, error);
    return null;
  }
}

export async function clearStorageBucket(client: ReturnType<typeof createClient<Database>>): Promise<void> {
  try {
    // List all files in the bucket
    let allFiles: string[] = [];
    let continuationToken: string | null = null;

    do {
      const { data, error } = await client.storage
        .from('zeroheight-images')
        .list('', {
          limit: 1000,
          offset: continuationToken ? parseInt(continuationToken) : 0,
        });

      if (error) {
        console.error('Error listing files:', error);
        break;
      }

      if (data) {
        const fileNames = data.map((file: { name: string }) => file.name);
        allFiles = allFiles.concat(fileNames);
        continuationToken = data.length === 1000 ? allFiles.length.toString() : null;
      } else {
        continuationToken = null;
      }
    } while (continuationToken);

    if (allFiles.length > 0) {
      console.log(`Found ${allFiles.length} files to delete`);

      // Delete files in batches
      const batchSize = 100;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);

        const { error: deleteError } = await client.storage
          .from('zeroheight-images')
          .remove(batch);

        if (deleteError) {
          console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
        } else {
          console.log(`Deleted batch ${i / batchSize + 1} (${batch.length} files)`);
        }
      }
    }
  } catch (error) {
    console.error('Error clearing storage bucket:', error);
  }
}