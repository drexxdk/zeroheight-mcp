import { NextResponse } from "next/server";
import sharp from "sharp";
import crypto from "crypto";
import { getSupabaseClient } from "../../../utils/common";
import {
  IMAGE_BUCKET,
  STORAGE_CACHE_CONTROL_SEC,
  HASH_TRUNCATE_LENGTH,
} from "../../../utils/config";

type Body = {
  url: string;
  key?: string; // optional destination path in bucket
};

export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    if (!body || !body.url) {
      return NextResponse.json({ error: "missing url" }, { status: 400 });
    }

    const url = body.url;

    // fetch original image with timeout
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(t);
    }

    if (!resp.ok) {
      return NextResponse.json(
        { error: `failed fetch ${resp.status}` },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await resp.arrayBuffer());

    // resize to width 500, keep aspect, convert to webp quality 80
    const resized = await sharp(buf)
      .resize(500, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // generate destination path
    const key = body.key
      ? body.key
      : `thumbnails/${crypto.createHash("sha256").update(url).digest("hex").slice(0, HASH_TRUNCATE_LENGTH)}.webp`;

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "no supabase client configured" },
        { status: 500 },
      );
    }

    // upload buffer
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(key, resized, {
        contentType: "image/webp",
        cacheControl: String(STORAGE_CACHE_CONTROL_SEC),
        upsert: true,
      });

    if (uploadError) {
      console.error("upload error", uploadError);
      return NextResponse.json({ error: uploadError }, { status: 500 });
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key);

    return NextResponse.json({
      ok: true,
      path: key,
      publicUrl: data?.publicUrl || null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: (err as Error).message || String(err) },
      { status: 500 },
    );
  }
}
