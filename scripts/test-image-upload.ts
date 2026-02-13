import { config } from "dotenv";
import path from "path";
import { getSupabaseClient, getSupabaseAdminClient } from "../lib/common";

// Load environment variables
config({ path: ".env.local" });

// Use shared Supabase client helpers from `lib/common`

async function downloadImage(
  url: string,
  filename: string,
): Promise<string | null> {
  try {
    console.log(`Fetching image from: ${url}`);
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const ext = path.extname(filename).toLowerCase();
    const mimeType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".svg"
              ? "image/svg+xml"
              : "image/png";
    const file = new File([buffer], filename, { type: mimeType });

    console.log(
      `Created file with size: ${buffer.byteLength} bytes, type: ${mimeType}`,
    );

    // Upload to Supabase storage
    const client = getSupabaseClient();
    if (!client) {
      console.error("Supabase client not available for image upload");
      return null;
    }

    console.log("Checking for existing buckets...");
    // Ensure bucket exists
    const adminClient = getSupabaseAdminClient();
    let buckets;
    if (adminClient) {
      const result = await adminClient.storage.listBuckets();
      buckets = result.data;
      console.log(
        "Existing buckets:",
        buckets?.map((b) => b.name),
      );
    } else {
      console.log("Admin client not available, using regular client...");
      const result = await client.storage.listBuckets();
      buckets = result.data;
    }

    const bucketExists = buckets?.some(
      (bucket) => bucket.name === "zeroheight-images",
    );

    if (!bucketExists) {
      if (adminClient) {
        console.log("Creating bucket 'zeroheight-images'...");
        const { error: createError } = await adminClient.storage.createBucket(
          "zeroheight-images",
          {
            public: true,
            allowedMimeTypes: [
              "image/png",
              "image/jpeg",
              "image/jpg",
              "image/gif",
              "image/webp",
              "image/svg+xml",
            ],
            fileSizeLimit: 10485760, // 10MB
          },
        );
        if (createError) {
          console.error("Error creating bucket:", createError);
          return null;
        }
        console.log("Bucket created successfully");
      } else {
        console.error("Cannot create bucket: admin client not available");
        return null;
      }
    } else {
      console.log("Bucket already exists");
    }

    console.log(`Uploading file ${filename} to Supabase...`);
    // Try with admin client first, fall back to regular client
    let uploadResult;
    if (adminClient) {
      uploadResult = await adminClient.storage
        .from("zeroheight-images")
        .upload(filename, file, {
          cacheControl: "3600",
          upsert: false,
        });
    } else {
      uploadResult = await client.storage
        .from("zeroheight-images")
        .upload(filename, file, {
          cacheControl: "3600",
          upsert: false,
        });
    }

    const { data, error } = uploadResult;

    if (error) {
      console.error("Error uploading image:", error);
      return null;
    }

    console.log("Upload successful! Path:", data.path);
    return data.path;
  } catch (error) {
    console.error("Error downloading/uploading image:", error);
    return null;
  }
}

// Test with a small image
async function testImageUpload() {
  console.log("Testing image upload to Supabase...");

  // Try a different test image URL
  const testUrls = [
    "https://picsum.photos/100/100",
    "https://httpbin.org/image/png",
    "https://via.placeholder.com/100x100.png",
  ];

  for (const testImageUrl of testUrls) {
    console.log(`\nTrying URL: ${testImageUrl}`);
    const filename = `test_image_${Date.now()}.png`;

    try {
      const result = await downloadImage(testImageUrl, filename);
      if (result) {
        console.log("✅ Image upload test successful!");
        console.log("Storage path:", result);

        // Try to get the public URL
        const client = getSupabaseClient();
        if (client) {
          const { data } = client.storage
            .from("zeroheight-images")
            .getPublicUrl(result);

          console.log("Public URL:", data.publicUrl);
        }
        return; // Success, exit
      } else {
        console.log(`❌ Failed with ${testImageUrl}`);
      }
    } catch (error) {
      console.log(
        `❌ Error with ${testImageUrl}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("All test URLs failed. Trying to create a simple test image...");

  // Create a simple test image (1x1 pixel PNG)
  const testImageBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const filename = `test_pixel_${Date.now()}.png`;
  const file = new File([testImageBuffer], filename, { type: "image/png" });

  console.log("Created test pixel image, uploading to Supabase...");

  const client = getSupabaseClient();
  if (!client) {
    console.error("Supabase client not available");
    return;
  }

  // Check bucket
  const adminClient = getSupabaseAdminClient();
  let buckets;
  if (adminClient) {
    const result = await adminClient.storage.listBuckets();
    buckets = result.data;
    console.log(
      "Existing buckets:",
      buckets?.map((b) => b.name),
    );
  } else {
    console.log("Admin client not available, using regular client...");
    const result = await client.storage.listBuckets();
    buckets = result.data;
  }

  const bucketExists = buckets?.some(
    (bucket) => bucket.name === "zeroheight-images",
  );

  if (!bucketExists) {
    if (adminClient) {
      console.log("Creating bucket 'zeroheight-images'...");
      const { error: createError } = await adminClient.storage.createBucket(
        "zeroheight-images",
        {
          public: true,
          allowedMimeTypes: [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/gif",
            "image/webp",
            "image/svg+xml",
          ],
          fileSizeLimit: 10485760, // 10MB
        },
      );
      if (createError) {
        console.error("Error creating bucket:", createError);
        return;
      }
      console.log("Bucket created successfully");
    } else {
      console.error("Cannot create bucket: admin client not available");
      return;
    }
  }

  // Upload using admin client if available
  let uploadResult;
  if (adminClient) {
    uploadResult = await adminClient.storage
      .from("zeroheight-images")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: false,
      });
  } else {
    uploadResult = await client.storage
      .from("zeroheight-images")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: false,
      });
  }

  const { data, error } = uploadResult;

  if (error) {
    console.error("Error uploading test image:", error);
    console.log("❌ Supabase upload test failed!");
  } else {
    console.log("✅ Supabase upload test successful!");
    console.log("Storage path:", data.path);

    const { data: urlData } = client.storage
      .from("zeroheight-images")
      .getPublicUrl(data.path);

    console.log("Public URL:", urlData.publicUrl);
  }
}

testImageUpload().catch(console.error);
